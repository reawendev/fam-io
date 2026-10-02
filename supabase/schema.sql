-- ============================================================
-- fam-io — Supabase şeması
-- Supabase Dashboard > SQL Editor'e yapıştırıp bir kez çalıştır.
-- Tekrar çalıştırılabilir (idempotent).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- SAHNELER
-- ------------------------------------------------------------
create table if not exists public.scenes (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 120),
  description     text,
  video_path      text not null,              -- 'scenes' bucket içindeki yol
  bg_audio_path   text,                       -- opsiyonel: müzik/efekt (konuşmasız) ses
  original_volume real not null default 0 check (original_volume between 0 and 1),
  duration        real,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);

create table if not exists public.scene_roles (
  id        uuid primary key default gen_random_uuid(),
  scene_id  uuid not null references public.scenes(id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 60),
  color     text not null default '#f97316',
  sort      int  not null default 0
);
create index if not exists scene_roles_scene_idx on public.scene_roles(scene_id);

create table if not exists public.scene_lines (
  id          uuid primary key default gen_random_uuid(),
  scene_id    uuid not null references public.scenes(id) on delete cascade,
  role_id     uuid not null references public.scene_roles(id) on delete cascade,
  start_time  real not null check (start_time >= 0),
  end_time    real not null,
  text        text,
  check (end_time > start_time)
);
create index if not exists scene_lines_scene_idx on public.scene_lines(scene_id);

-- ------------------------------------------------------------
-- ODALAR
-- ------------------------------------------------------------
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  scene_id    uuid not null references public.scenes(id) on delete cascade,
  host_id     uuid not null,
  status      text not null default 'lobby' check (status in ('lobby','recording','finale')),
  finale_at   timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null,
  nickname   text not null check (char_length(nickname) between 1 and 30),
  done       boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Karakter atamaları (lobide seçilir, seçilmeyenler başlarken rastgele dağıtılır)
create table if not exists public.room_roles (
  room_id  uuid not null references public.rooms(id) on delete cascade,
  role_id  uuid not null references public.scene_roles(id) on delete cascade,
  user_id  uuid not null,
  picked   boolean not null default true,   -- false: kimse seçmediği için otomatik atandı
  primary key (room_id, role_id)
);

create table if not exists public.recordings (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  line_id     uuid not null references public.scene_lines(id) on delete cascade,
  user_id     uuid not null,
  audio_path  text not null,                -- 'recordings' bucket içindeki yol
  offset_time real not null,                -- kaydın başladığı video saniyesi
  created_at  timestamptz not null default now(),
  unique (room_id, line_id)
);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.scenes       enable row level security;
alter table public.scene_roles  enable row level security;
alter table public.scene_lines  enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_players enable row level security;
alter table public.room_roles   enable row level security;
alter table public.recordings   enable row level security;

-- ------------------------------------------------------------
-- TABLO YETKİLERİ
-- Yeni Supabase projeleri tabloları Data API'ye otomatik açmıyor;
-- bu yüzden yetkiler açıkça veriliyor. Satır bazlı kontrolü RLS yapar.
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.scenes, public.scene_roles, public.scene_lines to authenticated;
grant select on public.rooms, public.room_roles, public.recordings to authenticated;
grant select, update on public.room_players to authenticated;

-- Sahneler: herkes görür, herkes ekler, sadece sahibi düzenler/siler
drop policy if exists scenes_select on public.scenes;
create policy scenes_select on public.scenes for select to authenticated using (true);
drop policy if exists scenes_insert on public.scenes;
create policy scenes_insert on public.scenes for insert to authenticated with check (created_by = auth.uid());
drop policy if exists scenes_update on public.scenes;
create policy scenes_update on public.scenes for update to authenticated using (created_by = auth.uid());
drop policy if exists scenes_delete on public.scenes;
create policy scenes_delete on public.scenes for delete to authenticated using (created_by = auth.uid());

drop policy if exists roles_select on public.scene_roles;
create policy roles_select on public.scene_roles for select to authenticated using (true);
drop policy if exists roles_write on public.scene_roles;
create policy roles_write on public.scene_roles for all to authenticated
  using (exists (select 1 from public.scenes s where s.id = scene_id and s.created_by = auth.uid()))
  with check (exists (select 1 from public.scenes s where s.id = scene_id and s.created_by = auth.uid()));

drop policy if exists lines_select on public.scene_lines;
create policy lines_select on public.scene_lines for select to authenticated using (true);
drop policy if exists lines_write on public.scene_lines;
create policy lines_write on public.scene_lines for all to authenticated
  using (exists (select 1 from public.scenes s where s.id = scene_id and s.created_by = auth.uid()))
  with check (exists (select 1 from public.scenes s where s.id = scene_id and s.created_by = auth.uid()));

-- Odalar: okumak serbest; yazma sadece RPC fonksiyonlarıyla
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated using (true);

drop policy if exists players_select on public.room_players;
create policy players_select on public.room_players for select to authenticated using (true);
drop policy if exists players_update_self on public.room_players;
create policy players_update_self on public.room_players for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists room_roles_select on public.room_roles;
create policy room_roles_select on public.room_roles for select to authenticated using (true);

-- Kayıtlar: kendi kaydını her zaman, diğerlerini SADECE finalde görebilirsin
drop policy if exists recordings_select on public.recordings;
create policy recordings_select on public.recordings for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.rooms r where r.id = room_id and r.status = 'finale')
);

-- ------------------------------------------------------------
-- RPC FONKSİYONLARI
-- ------------------------------------------------------------

create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

create or replace function public._new_room_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..5 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = c);
  end loop;
  return c;
end $$;

create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and status = 'lobby') then return; end if;
  delete from room_roles   where room_id = p_room and user_id = auth.uid();
  delete from room_players where room_id = p_room and user_id = auth.uid();
end $$;

create or replace function public.change_scene(p_room uuid, p_scene uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and host_id = auth.uid() and status = 'lobby') then
    raise exception 'Sadece oda sahibi lobide sahne değiştirebilir';
  end if;
  if not exists (select 1 from scene_roles where scene_id = p_scene) then raise exception 'Sahnede hiç karakter yok'; end if;
  delete from room_roles where room_id = p_room;
  update rooms set scene_id = p_scene where id = p_room;
end $$;

-- Lobide karakter seç (bir oyuncu birden fazla karakter alabilir)
create or replace function public.claim_role(p_room uuid, p_role uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if not exists (select 1 from rooms where id = p_room and status = 'lobby') then
    raise exception 'Karakterler sadece lobide seçilebilir';
  end if;
  if not exists (select 1 from room_players where room_id = p_room and user_id = auth.uid()) then
    raise exception 'Bu odada değilsin';
  end if;
  if not exists (
    select 1 from scene_roles sr join rooms r on r.scene_id = sr.scene_id
     where r.id = p_room and sr.id = p_role
  ) then
    raise exception 'Bu karakter bu sahnede yok';
  end if;
  select user_id into v_owner from room_roles where room_id = p_room and role_id = p_role for update;
  if found then
    if v_owner = auth.uid() then return; end if;
    raise exception 'Bu karakteri başka biri seçti';
  end if;
  begin
    insert into room_roles (room_id, role_id, user_id) values (p_room, p_role, auth.uid());
  exception when unique_violation then
    raise exception 'Bu karakteri başka biri seçti';
  end;
end $$;

create or replace function public.release_role(p_room uuid, p_role uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from room_roles
   where room_id = p_room and role_id = p_role and user_id = auth.uid()
     and exists (select 1 from rooms where id = p_room and status = 'lobby');
end $$;

-- Kayıt aşamasını başlatır. Seçilen karakterler korunur;
-- kimsenin seçmediği karakterler en az karakteri olan oyunculara rastgele dağıtılır.
create or replace function public.start_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_role uuid;
  v_user uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Oda bulunamadı'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi başlatabilir'; end if;
  if v_room.status <> 'lobby' then raise exception 'Oyun zaten başladı'; end if;
  if not exists (select 1 from room_players where room_id = p_room) then raise exception 'Odada oyuncu yok'; end if;
  if not exists (select 1 from scene_roles where scene_id = v_room.scene_id) then raise exception 'Sahnede karakter yok'; end if;

  -- Artık geçersiz seçimleri temizle (sahne değişmiş ya da oyuncu ayrılmış olabilir)
  delete from room_roles rr
   where rr.room_id = p_room
     and (not exists (select 1 from scene_roles sr where sr.id = rr.role_id and sr.scene_id = v_room.scene_id)
          or not exists (select 1 from room_players p where p.room_id = p_room and p.user_id = rr.user_id));

  for v_role in
    select sr.id from scene_roles sr
     where sr.scene_id = v_room.scene_id
       and not exists (select 1 from room_roles rr where rr.room_id = p_room and rr.role_id = sr.id)
     order by random()
  loop
    select p.user_id into v_user
      from room_players p
     where p.room_id = p_room
     order by (select count(*) from room_roles rr where rr.room_id = p_room and rr.user_id = p.user_id), random()
     limit 1;
    insert into room_roles (room_id, role_id, user_id, picked) values (p_room, v_role, v_user, false);
  end loop;

  delete from recordings where room_id = p_room;
  update room_players set done = false where room_id = p_room;
  update rooms set status = 'recording', finale_at = null where id = p_room;
end $$;

-- Kaydı kaydeder / tekrar çekimde üzerine yazar
create or replace function public.save_recording(p_room uuid, p_line uuid, p_path text, p_offset double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and status = 'recording') then
    raise exception 'Kayıt aşamasında değiliz';
  end if;
  if not exists (
    select 1 from scene_lines l
      join room_roles rr on rr.role_id = l.role_id and rr.room_id = p_room
     where l.id = p_line and rr.user_id = auth.uid()
  ) then
    raise exception 'Bu replik sana ait değil';
  end if;
  if p_path not like p_room::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Geçersiz dosya yolu';
  end if;

  insert into recordings (room_id, line_id, user_id, audio_path, offset_time)
  values (p_room, p_line, auth.uid(), p_path, p_offset)
  on conflict (room_id, line_id)
  do update set audio_path = excluded.audio_path, offset_time = excluded.offset_time,
                user_id = excluded.user_id, created_at = now();
end $$;

revoke all on function public._new_room_code() from public, anon, authenticated;
grant execute on function public.server_now()                          to authenticated;
grant execute on function public.leave_room(uuid)                      to authenticated;
grant execute on function public.change_scene(uuid, uuid)              to authenticated;
grant execute on function public.start_game(uuid)                      to authenticated;
grant execute on function public.save_recording(uuid, uuid, text, double precision) to authenticated;
grant execute on function public.claim_role(uuid, uuid)               to authenticated;
grant execute on function public.release_role(uuid, uuid)             to authenticated;

-- ------------------------------------------------------------
-- REALTIME
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rooms','room_players','room_roles'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- STORAGE
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('scenes', 'scenes', true, 52428800),        -- 50 MB (ücretsiz plan üst sınırı)
       ('recordings', 'recordings', true, 10485760) -- 10 MB
on conflict (id) do nothing;

-- scenes: <kullanıcı-id>/... yoluna yükleyebilirsin
drop policy if exists "famio scenes upload" on storage.objects;
create policy "famio scenes upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'scenes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "famio scenes delete" on storage.objects;
create policy "famio scenes delete" on storage.objects for delete to authenticated
  using (bucket_id = 'scenes' and (storage.foldername(name))[1] = auth.uid()::text);

-- recordings: <oda-id>/<kullanıcı-id>/... yoluna yükleyebilirsin
drop policy if exists "famio recordings upload" on storage.objects;
create policy "famio recordings upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[2] = auth.uid()::text);

-- ============================================================
-- 0.3.0 — PROFİLLER VE SOSYAL (migrations/003 ile aynı)
-- ============================================================

-- ------------------------------------------------------------
-- PROFİLLER
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name    text not null check (char_length(display_name) between 1 and 30),
  bio             text check (char_length(bio) <= 160),
  color           text not null default '#ff7a1a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  xp              int  not null default 0,
  streak          int  not null default 0,
  best_streak     int  not null default 0,
  last_streak_day date,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to anon, authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
grant select on public.profiles to anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, bio, color) on public.profiles to authenticated;   -- XP/streak sadece sunucuda değişir

-- Kayıt olunca profili otomatik oluştur (kullanıcı adı signUp metadata'sından gelir)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_username text := lower(trim(new.raw_user_meta_data->>'username'));
  v_name     text := nullif(trim(new.raw_user_meta_data->>'display_name'), '');
begin
  if v_username is null or v_username = '' then
    return new;   -- anonim / eski kullanıcılar: profil yok
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, left(coalesce(v_name, v_username), 30));
  return new;
end $$;

drop trigger if exists famio_on_auth_user_created on auth.users;
create trigger famio_on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(trim(p_username)) ~ '^[a-z0-9_.]{3,20}$'
     and not exists (select 1 from profiles where username = lower(trim(p_username)));
$$;

-- ------------------------------------------------------------
-- DUBLAJ ARŞİVİ (her finalde bir kayıt; oda sıfırlansa da kalır)
-- ------------------------------------------------------------
create table if not exists public.dubs (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid references public.rooms(id) on delete set null,
  scene_id       uuid not null references public.scenes(id) on delete cascade,
  created_by     uuid,
  like_count     int not null default 0,
  comment_count  int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists dubs_created_idx on public.dubs(created_at desc);

create table if not exists public.dub_cast (
  dub_id   uuid not null references public.dubs(id) on delete cascade,
  role_id  uuid not null references public.scene_roles(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (dub_id, role_id)
);

create table if not exists public.dub_participants (
  dub_id     uuid not null references public.dubs(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  lines      int  not null default 0,
  xp_gained  int  not null default 0,
  primary key (dub_id, user_id)
);
create index if not exists dub_participants_user_idx on public.dub_participants(user_id);

create table if not exists public.dub_recordings (
  dub_id      uuid not null references public.dubs(id) on delete cascade,
  line_id     uuid not null references public.scene_lines(id) on delete cascade,
  user_id     uuid not null,
  audio_path  text not null,
  offset_time real not null,
  primary key (dub_id, line_id)
);

create table if not exists public.dub_likes (
  dub_id     uuid not null references public.dubs(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (dub_id, user_id)
);

create table if not exists public.dub_comments (
  id         uuid primary key default gen_random_uuid(),
  dub_id     uuid not null references public.dubs(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists dub_comments_dub_idx on public.dub_comments(dub_id, created_at);

alter table public.rooms add column if not exists current_dub_id uuid references public.dubs(id) on delete set null;

alter table public.dubs             enable row level security;
alter table public.dub_cast         enable row level security;
alter table public.dub_participants enable row level security;
alter table public.dub_recordings   enable row level security;
alter table public.dub_likes        enable row level security;
alter table public.dub_comments     enable row level security;

-- Dublajlar paylaşım linkiyle herkese açık (giriş yapmamış kişiler de izleyebilir)
do $$
declare t text;
begin
  foreach t in array array['dubs','dub_cast','dub_participants','dub_recordings','dub_likes','dub_comments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_select', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

drop policy if exists dub_likes_insert on public.dub_likes;
create policy dub_likes_insert on public.dub_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists dub_likes_delete on public.dub_likes;
create policy dub_likes_delete on public.dub_likes for delete to authenticated using (user_id = auth.uid());
grant insert, delete on public.dub_likes to authenticated;

drop policy if exists dub_comments_insert on public.dub_comments;
create policy dub_comments_insert on public.dub_comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists dub_comments_delete on public.dub_comments;
create policy dub_comments_delete on public.dub_comments for delete to authenticated using (user_id = auth.uid());
grant insert, delete on public.dub_comments to authenticated;

-- Paylaşım sayfası için sahne bilgileri de herkese açık okunabilir
drop policy if exists scenes_select on public.scenes;
create policy scenes_select on public.scenes for select to anon, authenticated using (true);
drop policy if exists roles_select on public.scene_roles;
create policy roles_select on public.scene_roles for select to anon, authenticated using (true);
drop policy if exists lines_select on public.scene_lines;
create policy lines_select on public.scene_lines for select to anon, authenticated using (true);
grant select on public.scenes, public.scene_roles, public.scene_lines to anon;

-- Sayaçlar + beğeni XP'si (beğenen kişi hariç dublajdaki herkese +5 XP)
create or replace function public._on_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dub   uuid := coalesce(new.dub_id, old.dub_id);
  v_liker uuid := coalesce(new.user_id, old.user_id);
  v_delta int  := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  update dubs set like_count = greatest(0, like_count + v_delta) where id = v_dub;
  update profiles set xp = greatest(0, xp + 5 * v_delta)
   where id in (select user_id from dub_participants where dub_id = v_dub and user_id <> v_liker);
  return null;
end $$;
drop trigger if exists famio_on_like on public.dub_likes;
create trigger famio_on_like after insert or delete on public.dub_likes
  for each row execute function public._on_like();

create or replace function public._on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update dubs set comment_count = greatest(0, comment_count + case when tg_op = 'INSERT' then 1 else -1 end)
   where id = coalesce(new.dub_id, old.dub_id);
  return null;
end $$;
drop trigger if exists famio_on_comment on public.dub_comments;
create trigger famio_on_comment after insert or delete on public.dub_comments
  for each row execute function public._on_comment();

-- ------------------------------------------------------------
-- ODA FONKSİYONLARI (profil zorunlu, final arşivler)
-- ------------------------------------------------------------
create or replace function public.create_room(p_scene uuid, p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_room uuid;
  v_name text;
begin
  select display_name into v_name from profiles where id = auth.uid();
  if not found then raise exception 'Önce profil oluştur'; end if;
  if not exists (select 1 from scenes where id = p_scene) then raise exception 'Sahne bulunamadı'; end if;
  if not exists (select 1 from scene_roles where scene_id = p_scene) then raise exception 'Sahnede hiç karakter yok'; end if;
  v_code := _new_room_code();
  insert into rooms (code, scene_id, host_id) values (v_code, p_scene, auth.uid()) returning id into v_room;
  insert into room_players (room_id, user_id, nickname) values (v_room, auth.uid(), v_name);
  return v_code;
end $$;

create or replace function public.join_room(p_code text, p_nickname text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_name text;
begin
  select display_name into v_name from profiles where id = auth.uid();
  if not found then raise exception 'Önce profil oluştur'; end if;
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'Oda bulunamadı'; end if;

  if exists (select 1 from room_players where room_id = v_room.id and user_id = auth.uid()) then
    update room_players set nickname = v_name where room_id = v_room.id and user_id = auth.uid();
    return v_room.id;
  end if;

  if v_room.status <> 'lobby' then raise exception 'Oyun başladı, artık katılamazsın'; end if;
  if (select count(*) from room_players where room_id = v_room.id) >= 12 then raise exception 'Oda dolu'; end if;
  insert into room_players (room_id, user_id, nickname) values (v_room.id, auth.uid(), v_name);
  return v_room.id;
end $$;

create or replace function public.start_finale(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from rooms where id = p_room and host_id = auth.uid() for update;
  if not found or v_status not in ('recording', 'finale') then
    raise exception 'Sadece oda sahibi finali başlatabilir';
  end if;
  if v_status = 'recording' then
    perform _finalize_dub(p_room);   -- bu turun ilk finali: arşivle, XP dağıt
  end if;
  update rooms set status = 'finale', finale_at = now() + interval '6 seconds' where id = p_room;
end $$;

create or replace function public.reset_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and host_id = auth.uid()) then
    raise exception 'Sadece oda sahibi';
  end if;
  delete from recordings where room_id = p_room;           -- dosyalar arşivde kalır
  delete from room_roles where room_id = p_room and not picked;
  update room_players set done = false where room_id = p_room;
  update rooms set status = 'lobby', finale_at = null, current_dub_id = null where id = p_room;
end $$;

-- ------------------------------------------------------------
-- UYUM: birlikte yapılan sahneler (+10) ve bu sahnelerin aldığı beğeniler (+3)
-- ------------------------------------------------------------
drop function if exists public.compat_for(uuid);   -- 0.5.0'da dönüş tipi değişti
create function public.compat_for(p_user uuid)
returns table (partner uuid, username text, display_name text, color text, shared_dubs int, shared_likes int, score int)
language sql stable set search_path = public as $$
  select p2.user_id, pr.username, pr.display_name, pr.color,
         count(*)::int,
         coalesce(sum(d.like_count), 0)::int,
         (count(*) * 10 + coalesce(sum(d.like_count), 0) * 3)::int
    from dub_participants p1
    join dub_participants p2 on p2.dub_id = p1.dub_id and p2.user_id <> p1.user_id
    join dubs d on d.id = p1.dub_id
    join profiles pr on pr.id = p2.user_id
   where p1.user_id = p_user
   group by p2.user_id, pr.username, pr.display_name, pr.color
   order by 7 desc, 5 desc
   limit 20;
$$;

-- ------------------------------------------------------------
-- YETKİLER (Supabase yeni fonksiyonları varsayılan olarak herkese açar; iç fonksiyonları kapat)
-- ------------------------------------------------------------
revoke execute on function public._on_like()          from public, anon, authenticated;
revoke execute on function public._on_comment()       from public, anon, authenticated;
revoke execute on function public.handle_new_user()   from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.compat_for(uuid)          to anon, authenticated;
grant execute on function public.create_room(uuid, text)   to authenticated;
grant execute on function public.join_room(text, text)     to authenticated;
grant execute on function public.start_finale(uuid)        to authenticated;
grant execute on function public.reset_room(uuid)          to authenticated;

-- Beğeni ve yorumlar canlı güncellensin
do $$
declare t text;
begin
  foreach t in array array['dub_likes','dub_comments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- 0.4.0 — EFEKTLER, OYLAMA, ROZETLER, DISCORD (migrations/004 ile aynı)
-- ============================================================

-- ------------------------------------------------------------
-- SES EFEKTLERİ (kayıt bozulmaz; efekt oynatırken uygulanır)
-- ------------------------------------------------------------
alter table public.recordings     add column if not exists effect text not null default 'dogal';
alter table public.dub_recordings add column if not exists effect text not null default 'dogal';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recordings_effect_check') then
    alter table public.recordings add constraint recordings_effect_check
      check (effect in ('dogal','robot','derin','sincap','dev','telefon','megafon','magara','uzayli'));
  end if;
end $$;

create or replace function public.set_recording_effect(p_room uuid, p_line uuid, p_effect text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and status = 'recording') then
    raise exception 'Kayıt aşamasında değiliz';
  end if;
  update recordings set effect = p_effect
   where room_id = p_room and line_id = p_line and user_id = auth.uid();
  if not found then raise exception 'Önce bu repliği kaydet'; end if;
end $$;

-- ------------------------------------------------------------
-- FİNAL OYLAMASI: "Turun seslendirmeni" (mvp) ve "En komik replik" (komik)
-- Sadece o dublajda oynayanlar oy verir, kendine oy veremez. Alınan her oy +10 XP.
-- ------------------------------------------------------------
create table if not exists public.dub_votes (
  dub_id       uuid not null references public.dubs(id) on delete cascade,
  voter        uuid not null references public.profiles(id) on delete cascade,
  category     text not null check (category in ('mvp', 'komik')),
  target_user  uuid references public.profiles(id) on delete cascade,
  target_line  uuid references public.scene_lines(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (dub_id, voter, category)
);
alter table public.dub_votes enable row level security;
drop policy if exists dub_votes_select on public.dub_votes;
create policy dub_votes_select on public.dub_votes for select to anon, authenticated using (true);
grant select on public.dub_votes to anon, authenticated;

-- Oy ver / değiştir / aynı hedefe tekrar basınca geri al
create or replace function public.cast_vote(p_dub uuid, p_category text, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner     uuid;
  v_prev      dub_votes%rowtype;
  v_prev_own  uuid;
begin
  if not exists (select 1 from dub_participants where dub_id = p_dub and user_id = auth.uid()) then
    raise exception 'Sadece bu sahnede oynayanlar oy verebilir';
  end if;

  if p_category = 'mvp' then
    if not exists (select 1 from dub_participants where dub_id = p_dub and user_id = p_target) then
      raise exception 'Bu kişi bu sahnede yok';
    end if;
    v_owner := p_target;
  elsif p_category = 'komik' then
    select user_id into v_owner from dub_recordings where dub_id = p_dub and line_id = p_target;
    if not found then raise exception 'Bu replik bu sahnede yok'; end if;
  else
    raise exception 'Geçersiz kategori';
  end if;
  if v_owner = auth.uid() then raise exception 'Kendine oy veremezsin'; end if;

  select * into v_prev from dub_votes where dub_id = p_dub and voter = auth.uid() and category = p_category for update;
  if found then
    v_prev_own := case when p_category = 'mvp' then v_prev.target_user
                       else (select user_id from dub_recordings where dub_id = p_dub and line_id = v_prev.target_line) end;
    update profiles set xp = greatest(0, xp - 10) where id = v_prev_own;
    if coalesce(v_prev.target_user, v_prev.target_line) = p_target then
      delete from dub_votes where dub_id = p_dub and voter = auth.uid() and category = p_category;   -- geri al
      return;
    end if;
    update dub_votes
       set target_user = case when p_category = 'mvp' then p_target end,
           target_line = case when p_category = 'komik' then p_target end,
           created_at = now()
     where dub_id = p_dub and voter = auth.uid() and category = p_category;
  else
    insert into dub_votes (dub_id, voter, category, target_user, target_line)
    values (p_dub, auth.uid(), p_category,
            case when p_category = 'mvp' then p_target end,
            case when p_category = 'komik' then p_target end);
  end if;
  update profiles set xp = xp + 10 where id = v_owner;
end $$;

-- ------------------------------------------------------------
-- ROZETLER
--   Otomatik rozetler badge_stats() istatistiklerinden uygulamada hesaplanır.
--   Özel rozetler (kurucu, beta, destekçi…) bu tabloya elle eklenir.
-- ------------------------------------------------------------
create table if not exists public.user_badges (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  badge      text not null,
  note       text,
  granted_at timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table public.user_badges enable row level security;
drop policy if exists user_badges_select on public.user_badges;
create policy user_badges_select on public.user_badges for select to anon, authenticated using (true);
grant select on public.user_badges to anon, authenticated;

-- Uygulama ayarları (sadece sunucu okur; Discord webhook adresi burada, tarayıcıya gitmez)
create table if not exists public.app_settings (
  key   text primary key,
  value text
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value) values ('early_member_limit', '50') on conflict (key) do nothing;

create or replace function public.badge_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with part as (select dub_id, lines from dub_participants where user_id = p_user),
       me as (select * from profiles where id = p_user)
  select jsonb_build_object(
    'dubs',        (select count(*) from part),
    'lines',       coalesce((select sum(lines) from part), 0),
    'xp',          (select xp from me),
    'best_streak', (select best_streak from me),
    'likes',       coalesce((select sum(d.like_count) from dubs d join part on part.dub_id = d.id), 0),
    'comments',    (select count(*) from dub_comments where user_id = p_user),
    'scenes',      (select count(*) from scenes s where s.created_by = p_user
                       and exists (select 1 from scene_lines l where l.scene_id = s.id)),
    'effects',     (select count(*) from dub_recordings where user_id = p_user and effect <> 'dogal'),
    'votes',       (select count(*) from dub_votes v
                     where (v.category = 'mvp' and v.target_user = p_user)
                        or (v.category = 'komik' and exists (select 1 from dub_recordings r
                              where r.dub_id = v.dub_id and r.line_id = v.target_line and r.user_id = p_user))),
    'mvp_wins',    (select count(*) from part pt
                     where exists (
                       select 1 from dub_votes v where v.dub_id = pt.dub_id and v.category = 'mvp' and v.target_user = p_user
                       group by v.target_user
                       having count(*) >= all (select count(*) from dub_votes v2
                                                where v2.dub_id = pt.dub_id and v2.category = 'mvp' group by v2.target_user))),
    'funny_wins',  (select count(*) from part pt
                     where exists (
                       select 1 from dub_votes v join dub_recordings r on r.dub_id = v.dub_id and r.line_id = v.target_line
                        where v.dub_id = pt.dub_id and v.category = 'komik' and r.user_id = p_user
                        group by v.target_line
                       having count(*) >= all (select count(*) from dub_votes v2
                                                where v2.dub_id = pt.dub_id and v2.category = 'komik' group by v2.target_line))),
    'best_duo',    coalesce((select max(c) from (
                     select count(*) c from dub_participants a
                       join dub_participants b on b.dub_id = a.dub_id and b.user_id <> a.user_id
                      where a.user_id = p_user group by b.user_id) x), 0),
    'member_no',   (select count(*) from profiles p2, me
                     where p2.created_at < me.created_at or (p2.created_at = me.created_at and p2.id <= me.id)),
    'early_limit', coalesce((select value::int from app_settings where key = 'early_member_limit'), 50),
    'special',     coalesce((select jsonb_agg(jsonb_build_object('badge', badge, 'note', note, 'granted_at', granted_at))
                               from user_badges where user_id = p_user), '[]'::jsonb)
  );
$$;

-- ------------------------------------------------------------
-- DISCORD: her yeni dublaj için kanala mesaj (Supabase pg_net ile, sunucu gerekmez)
-- Kurulum:  insert into app_settings values ('discord_webhook_url', 'https://discord.com/api/webhooks/...'),
--                                            ('site_url', 'https://sitenin-adresi.vercel.app')
--           on conflict (key) do update set value = excluded.value;
-- Test:     select public.discord_test();
-- ------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net etkinleştirilemedi (Database > Extensions > pg_net): %', sqlerrm;
end $$;

create or replace function public._discord_post(p_payload jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from app_settings where key = 'discord_webhook_url');
begin
  if v_url is null or v_url = '' then return false; end if;
  if not exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                  where n.nspname = 'net' and pr.proname = 'http_post') then
    raise warning 'Discord: pg_net eklentisi kapalı (Database > Extensions > pg_net)';
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, p_payload, '{"Content-Type": "application/json"}'::jsonb;
  return true;
exception when others then
  raise warning 'Discord bildirimi gönderilemedi: %', sqlerrm;
  return false;
end $$;

create or replace function public._notify_discord(p_dub uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_site  text := rtrim(coalesce((select value from app_settings where key = 'site_url'), ''), '/');
  v_title text;
  v_names text;
  v_cast  text;
begin
  if not exists (select 1 from app_settings where key = 'discord_webhook_url' and coalesce(value, '') <> '') then
    return;
  end if;
  select s.title into v_title from dubs d join scenes s on s.id = d.scene_id where d.id = p_dub;
  select string_agg(p.display_name, ', ' order by p.display_name) into v_names
    from dub_participants dp join profiles p on p.id = dp.user_id where dp.dub_id = p_dub;
  select string_agg(sr.name || ' — ' || p.display_name, E'\n' order by sr.sort) into v_cast
    from dub_cast dc join scene_roles sr on sr.id = dc.role_id join profiles p on p.id = dc.user_id where dc.dub_id = p_dub;

  perform _discord_post(jsonb_build_object(
    'username', 'fam-io',
    'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'title', '🎬 ' || coalesce(v_title, 'Yeni dublaj'),
      'url', case when v_site <> '' then v_site || '/d/' || p_dub end,
      'description', coalesce(v_names, 'Biri') || ' yeni bir dublaj tamamladı. İzle, beğen, oy ver!',
      'color', 16742938,
      'fields', case when v_cast is not null then jsonb_build_array(jsonb_build_object('name', 'Seslendirenler', 'value', v_cast)) end,
      'footer', jsonb_build_object('text', 'fam-io'),
      'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )))
  ));
end $$;

create or replace function public.discord_test() returns text
language plpgsql security definer set search_path = public as $$
begin
  if _discord_post(jsonb_build_object('username', 'fam-io', 'content', '✅ fam-io Discord bağlantısı çalışıyor.')) then
    return 'Gönderildi. Kanalı kontrol et (birkaç saniye sürebilir). Hata varsa: select * from net._http_response order by created desc limit 5;';
  end if;
  return 'Gönderilemedi: app_settings içinde discord_webhook_url yok ya da pg_net kapalı.';
end $$;

-- ------------------------------------------------------------
-- _finalize_dub: efekti arşive kopyala + Discord'a haber ver
-- ------------------------------------------------------------
create or replace function public._finalize_dub(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_room   rooms%rowtype;
  v_dub    uuid;
  v_day    date := (now() at time zone 'Europe/Istanbul')::date;
  n_part   int;
  r        record;
  p        profiles%rowtype;
  v_xp     int;
  v_streak int;
begin
  select * into v_room from rooms where id = p_room;
  if not exists (select 1 from recordings rc join profiles pr on pr.id = rc.user_id where rc.room_id = p_room) then
    return null;
  end if;

  insert into dubs (room_id, scene_id, created_by) values (p_room, v_room.scene_id, v_room.host_id) returning id into v_dub;
  insert into dub_cast (dub_id, role_id, user_id)
    select v_dub, rr.role_id, rr.user_id from room_roles rr join profiles pr on pr.id = rr.user_id where rr.room_id = p_room;
  insert into dub_recordings (dub_id, line_id, user_id, audio_path, offset_time, effect)
    select v_dub, line_id, user_id, audio_path, offset_time, effect from recordings where room_id = p_room;
  insert into dub_participants (dub_id, user_id, lines)
    select v_dub, rc.user_id, count(*) from recordings rc join profiles pr on pr.id = rc.user_id
     where rc.room_id = p_room group by rc.user_id;

  select count(*) into n_part from dub_participants where dub_id = v_dub;

  for r in select user_id, lines from dub_participants where dub_id = v_dub loop
    select * into p from profiles where id = r.user_id for update;
    v_xp := 40 + 10 * least(r.lines, 20) + 10 * least(n_part - 1, 5);
    if p.last_streak_day is distinct from v_day then
      v_streak := case when p.last_streak_day = v_day - 1 then p.streak + 1 else 1 end;
      v_xp := v_xp + 20 + 5 * least(v_streak, 10);
      update profiles
         set xp = xp + v_xp, streak = v_streak, best_streak = greatest(best_streak, v_streak), last_streak_day = v_day
       where id = r.user_id;
    else
      update profiles set xp = xp + v_xp where id = r.user_id;
    end if;
    update dub_participants set xp_gained = v_xp where dub_id = v_dub and user_id = r.user_id;
  end loop;

  update rooms set current_dub_id = v_dub where id = p_room;

  begin
    perform _notify_discord(v_dub);
  exception when others then
    raise warning 'Discord: %', sqlerrm;   -- bildirim hatası finali asla bozmasın
  end;
  return v_dub;
end $$;

-- ------------------------------------------------------------
-- YETKİLER
-- ------------------------------------------------------------
revoke execute on function public._finalize_dub(uuid)    from public, anon, authenticated;
revoke execute on function public._notify_discord(uuid)  from public, anon, authenticated;
revoke execute on function public._discord_post(jsonb)   from public, anon, authenticated;
revoke execute on function public.discord_test()         from public, anon, authenticated;
grant execute on function public.set_recording_effect(uuid, uuid, text) to authenticated;
grant execute on function public.cast_vote(uuid, text, uuid)            to authenticated;
grant execute on function public.badge_stats(uuid)                      to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dub_votes') then
    alter publication supabase_realtime add table public.dub_votes;
  end if;
end $$;

-- ============================================================
-- 0.5.0 — PROFİL FOTOĞRAFI, YAPIMCI, ETİKETLER, LİDERLİK, ODA YÖNETİMİ, TEMİZLİK, YÖNETİM
-- (migrations/005 ile aynı; aşağıdaki fonksiyonlar yukarıdaki eski sürümlerinin yerini alır)
-- ============================================================

-- ------------------------------------------------------------
-- 1) PROFİL FOTOĞRAFI
-- ------------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_check') then
    alter table public.profiles add constraint profiles_avatar_path_check
      check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text);
  end if;
end $$;
grant update (display_name, bio, color, avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 2097152)   -- 2 MB (uygulama ~40 KB'lık webp yükler)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2) YÖNETİCİ: "kurucu" rozeti olan herkes yöneticidir
-- ------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_badges where user_id = auth.uid() and badge = 'kurucu');
$$;

-- ------------------------------------------------------------
-- 3) DEPOLAMA YETKİLERİ
--    Storage API'de silmek için SELECT + DELETE yetkisi gerekir.
-- ------------------------------------------------------------
drop policy if exists "famio avatars upload" on storage.objects;
create policy "famio avatars upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "famio own select" on storage.objects;
create policy "famio own select" on storage.objects for select to authenticated using (
  (bucket_id in ('scenes', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text)
  or (bucket_id = 'recordings' and (storage.foldername(name))[2] = auth.uid()::text)
);
drop policy if exists "famio own delete" on storage.objects;
create policy "famio own delete" on storage.objects for delete to authenticated using (
  (bucket_id in ('scenes', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text)
  or (bucket_id = 'recordings' and (storage.foldername(name))[2] = auth.uid()::text)
);
drop policy if exists "famio scenes delete" on storage.objects;   -- "famio own delete" kapsıyor
drop policy if exists "famio admin select" on storage.objects;
create policy "famio admin select" on storage.objects for select to authenticated
  using (bucket_id in ('scenes', 'recordings', 'avatars') and public.is_admin());
drop policy if exists "famio admin delete" on storage.objects;
create policy "famio admin delete" on storage.objects for delete to authenticated
  using (bucket_id in ('scenes', 'recordings', 'avatars') and public.is_admin());
drop policy if exists "famio admin thumbs" on storage.objects;     -- eksik kapakları yönetici üretebilsin
create policy "famio admin thumbs" on storage.objects for insert to authenticated
  with check (bucket_id = 'scenes' and name like '%-thumb-%' and public.is_admin());

-- ------------------------------------------------------------
-- 4) SAHNELER: etiket, kapak, oynanma sayısı, yapımcı bağlantısı
-- ------------------------------------------------------------
alter table public.scenes add column if not exists tags       text[] not null default '{}';
alter table public.scenes add column if not exists thumb_path text;
alter table public.scenes add column if not exists dub_count  int    not null default 0;
alter table public.dubs   add column if not exists creator_xp int    not null default 0;

update public.scenes s set dub_count = (select count(*) from public.dubs d where d.scene_id = s.id);

-- Sahibi profili olmayan (eski anonim) sahneler sahipsiz kalır; yönetim panelinden atanabilir
update public.scenes set created_by = null
 where created_by is not null and not exists (select 1 from public.profiles p where p.id = created_by);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scenes_created_by_fkey') then
    alter table public.scenes add constraint scenes_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end $$;
create index if not exists scenes_created_by_idx on public.scenes(created_by);
create index if not exists dubs_scene_idx on public.dubs(scene_id);

-- Etiketleri düzenle: boşluk temizle, küçük harf, tekrarsız, en çok 5 tane, en çok 24 karakter
create or replace function public._norm_tags() returns trigger
language plpgsql as $$
begin
  new.tags := coalesce((
    select array_agg(t order by ord) from (
      select distinct on (t) t, ord from (
        select left(lower(trim(x)), 24) t, ord from unnest(coalesce(new.tags, '{}')) with ordinality as u(x, ord)
      ) a where t <> '' order by t, ord
    ) b
  ), '{}');
  new.tags := new.tags[1:5];
  return new;
end $$;
drop trigger if exists famio_norm_tags on public.scenes;
create trigger famio_norm_tags before insert or update of tags on public.scenes
  for each row execute function public._norm_tags();

-- ------------------------------------------------------------
-- 5) XP OLAYLARI (haftalık liderlik tablosu için her XP hareketi kaydedilir)
-- ------------------------------------------------------------
create table if not exists public.xp_events (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int  not null,
  reason     text not null,            -- dublaj | begeni | oy | yapimci | yapimci_begeni
  dub_id     uuid references public.dubs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists xp_events_time_idx on public.xp_events(created_at);
create index if not exists xp_events_user_idx on public.xp_events(user_id, created_at);
alter table public.xp_events enable row level security;
revoke all on public.xp_events from anon, authenticated;

create or replace function public._add_xp(p_user uuid, p_amount int, p_reason text, p_dub uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or coalesce(p_amount, 0) = 0 then return; end if;
  update profiles set xp = greatest(0, xp + p_amount) where id = p_user;
  if found then
    insert into xp_events (user_id, amount, reason, dub_id) values (p_user, p_amount, p_reason, p_dub);
  end if;
end $$;

-- Beğeni: dublajdakilere +5, sahnenin yapımcısına +2 (beğenen kişi hariç)
create or replace function public._on_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dub     uuid := coalesce(new.dub_id, old.dub_id);
  v_liker   uuid := coalesce(new.user_id, old.user_id);
  v_delta   int  := case when tg_op = 'INSERT' then 1 else -1 end;
  v_creator uuid;
  r         record;
begin
  update dubs set like_count = greatest(0, like_count + v_delta) where id = v_dub;
  for r in select user_id from dub_participants where dub_id = v_dub and user_id <> v_liker loop
    perform _add_xp(r.user_id, 5 * v_delta, 'begeni', v_dub);
  end loop;
  select s.created_by into v_creator from dubs d join scenes s on s.id = d.scene_id where d.id = v_dub;
  if v_creator is not null and v_creator <> v_liker then
    perform _add_xp(v_creator, 2 * v_delta, 'yapimci_begeni', v_dub);
  end if;
  return null;
end $$;

-- Oylama (004 ile aynı kurallar, XP artık olay olarak kaydediliyor)
create or replace function public.cast_vote(p_dub uuid, p_category text, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner     uuid;
  v_prev      dub_votes%rowtype;
  v_prev_own  uuid;
begin
  if not exists (select 1 from dub_participants where dub_id = p_dub and user_id = auth.uid()) then
    raise exception 'Sadece bu sahnede oynayanlar oy verebilir';
  end if;

  if p_category = 'mvp' then
    if not exists (select 1 from dub_participants where dub_id = p_dub and user_id = p_target) then
      raise exception 'Bu kişi bu sahnede yok';
    end if;
    v_owner := p_target;
  elsif p_category = 'komik' then
    select user_id into v_owner from dub_recordings where dub_id = p_dub and line_id = p_target;
    if not found then raise exception 'Bu replik bu sahnede yok'; end if;
  else
    raise exception 'Geçersiz kategori';
  end if;
  if v_owner = auth.uid() then raise exception 'Kendine oy veremezsin'; end if;

  select * into v_prev from dub_votes where dub_id = p_dub and voter = auth.uid() and category = p_category for update;
  if found then
    v_prev_own := case when p_category = 'mvp' then v_prev.target_user
                       else (select user_id from dub_recordings where dub_id = p_dub and line_id = v_prev.target_line) end;
    perform _add_xp(v_prev_own, -10, 'oy', p_dub);
    if coalesce(v_prev.target_user, v_prev.target_line) = p_target then
      delete from dub_votes where dub_id = p_dub and voter = auth.uid() and category = p_category;   -- geri al
      return;
    end if;
    update dub_votes
       set target_user = case when p_category = 'mvp' then p_target end,
           target_line = case when p_category = 'komik' then p_target end,
           created_at = now()
     where dub_id = p_dub and voter = auth.uid() and category = p_category;
  else
    insert into dub_votes (dub_id, voter, category, target_user, target_line)
    values (p_dub, auth.uid(), p_category,
            case when p_category = 'mvp' then p_target end,
            case when p_category = 'komik' then p_target end);
  end if;
  perform _add_xp(v_owner, 10, 'oy', p_dub);
end $$;

-- Final arşivi: XP + seri, sahne sayacı, yapımcı XP'si (+15, kendi oynamadıysa), Discord
create or replace function public._finalize_dub(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_room    rooms%rowtype;
  v_dub     uuid;
  v_day     date := (now() at time zone 'Europe/Istanbul')::date;
  n_part    int;
  r         record;
  p         profiles%rowtype;
  v_xp      int;
  v_streak  int;
  v_creator uuid;
begin
  select * into v_room from rooms where id = p_room;
  if not exists (select 1 from recordings rc join profiles pr on pr.id = rc.user_id where rc.room_id = p_room) then
    return null;
  end if;

  insert into dubs (room_id, scene_id, created_by) values (p_room, v_room.scene_id, v_room.host_id) returning id into v_dub;
  insert into dub_cast (dub_id, role_id, user_id)
    select v_dub, rr.role_id, rr.user_id from room_roles rr join profiles pr on pr.id = rr.user_id where rr.room_id = p_room;
  insert into dub_recordings (dub_id, line_id, user_id, audio_path, offset_time, effect)
    select v_dub, line_id, user_id, audio_path, offset_time, effect from recordings where room_id = p_room;
  insert into dub_participants (dub_id, user_id, lines)
    select v_dub, rc.user_id, count(*) from recordings rc join profiles pr on pr.id = rc.user_id
     where rc.room_id = p_room group by rc.user_id;

  select count(*) into n_part from dub_participants where dub_id = v_dub;

  for r in select user_id, lines from dub_participants where dub_id = v_dub loop
    select * into p from profiles where id = r.user_id for update;
    v_xp := 40 + 10 * least(r.lines, 20) + 10 * least(n_part - 1, 5);
    if p.last_streak_day is distinct from v_day then
      v_streak := case when p.last_streak_day = v_day - 1 then p.streak + 1 else 1 end;
      v_xp := v_xp + 20 + 5 * least(v_streak, 10);
      update profiles
         set streak = v_streak, best_streak = greatest(best_streak, v_streak), last_streak_day = v_day
       where id = r.user_id;
    end if;
    perform _add_xp(r.user_id, v_xp, 'dublaj', v_dub);
    update dub_participants set xp_gained = v_xp where dub_id = v_dub and user_id = r.user_id;
  end loop;

  update scenes set dub_count = dub_count + 1 where id = v_room.scene_id returning created_by into v_creator;
  if v_creator is not null and not exists (select 1 from dub_participants where dub_id = v_dub and user_id = v_creator) then
    perform _add_xp(v_creator, 15, 'yapimci', v_dub);
    update dubs set creator_xp = 15 where id = v_dub;
  end if;

  update rooms set current_dub_id = v_dub where id = p_room;

  begin
    perform _notify_discord(v_dub);
  exception when others then
    raise warning 'Discord: %', sqlerrm;
  end;
  return v_dub;
end $$;

-- Discord mesajına "Sahneyi ekleyen" alanı
create or replace function public._notify_discord(p_dub uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_site    text := rtrim(coalesce((select value from app_settings where key = 'site_url'), ''), '/');
  v_title   text;
  v_creator text;
  v_names   text;
  v_cast    text;
  v_fields  jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from app_settings where key = 'discord_webhook_url' and coalesce(value, '') <> '') then
    return;
  end if;
  select s.title, pc.display_name into v_title, v_creator
    from dubs d join scenes s on s.id = d.scene_id left join profiles pc on pc.id = s.created_by where d.id = p_dub;
  select string_agg(p.display_name, ', ' order by p.display_name) into v_names
    from dub_participants dp join profiles p on p.id = dp.user_id where dp.dub_id = p_dub;
  select string_agg(sr.name || ' — ' || p.display_name, E'\n' order by sr.sort) into v_cast
    from dub_cast dc join scene_roles sr on sr.id = dc.role_id join profiles p on p.id = dc.user_id where dc.dub_id = p_dub;
  if v_cast is not null then
    v_fields := v_fields || jsonb_build_object('name', 'Seslendirenler', 'value', v_cast);
  end if;
  if v_creator is not null then
    v_fields := v_fields || jsonb_build_object('name', 'Sahneyi ekleyen', 'value', v_creator, 'inline', true);
  end if;

  perform _discord_post(jsonb_build_object(
    'username', 'fam-io',
    'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'title', '🎬 ' || coalesce(v_title, 'Yeni dublaj'),
      'url', case when v_site <> '' then v_site || '/d/' || p_dub end,
      'description', coalesce(v_names, 'Biri') || ' yeni bir dublaj tamamladı. İzle, beğen, oy ver!',
      'color', 16742938,
      'fields', case when jsonb_array_length(v_fields) > 0 then v_fields end,
      'image', case when v_site <> '' then jsonb_build_object('url', v_site || '/d/' || p_dub || '/opengraph-image') end,
      'footer', jsonb_build_object('text', 'fam-io'),
      'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )))
  ));
end $$;

-- ------------------------------------------------------------
-- 6) SAHNE KÜTÜPHANESİ: arama, etiket, trend
-- ------------------------------------------------------------
create or replace function public.list_scenes(
  p_q       text default null,
  p_tag     text default null,
  p_sort    text default 'trend',      -- trend | yeni | populer
  p_roles   int  default null,         -- tam olarak bu kadar karakterli sahneler
  p_creator uuid default null,
  p_limit   int  default 60,
  p_offset  int  default 0
) returns table (
  id uuid, title text, description text, video_path text, thumb_path text, duration real,
  tags text[], created_by uuid, created_at timestamptz, dub_count int, week_dubs int,
  role_count int, line_count int, roles jsonb, creator jsonb
) language sql stable security definer set search_path = public as $$
  with base as (
    select s.*,
      (select count(*)::int from dubs d where d.scene_id = s.id and d.created_at > now() - interval '7 days') as wk,
      (select count(*)::int from scene_roles r where r.scene_id = s.id) as rc,
      (select count(*)::int from scene_lines l where l.scene_id = s.id) as lc
    from scenes s
    where (p_creator is null or s.created_by = p_creator)
      and (p_tag is null or p_tag = '' or lower(p_tag) = any (s.tags))
      and (p_q is null or trim(p_q) = '' or s.title ilike '%' || trim(p_q) || '%'
           or s.description ilike '%' || trim(p_q) || '%'
           or exists (select 1 from unnest(s.tags) t where t ilike '%' || trim(p_q) || '%'))
  )
  select b.id, b.title, b.description, b.video_path, b.thumb_path, b.duration, b.tags, b.created_by, b.created_at,
         b.dub_count, b.wk, b.rc, b.lc,
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color) order by r.sort)
                     from scene_roles r where r.scene_id = b.id), '[]'::jsonb),
         (select jsonb_build_object('username', p.username, 'display_name', p.display_name, 'color', p.color, 'avatar_path', p.avatar_path)
            from profiles p where p.id = b.created_by)
    from base b
   where (b.lc > 0 or b.created_by = auth.uid())          -- yarım kalmış sahneleri sadece sahibi görür
     and (p_roles is null or b.rc = p_roles)
   order by
     case when p_sort = 'trend'   then b.wk * 3 + least(b.dub_count, 30) end desc nulls last,
     case when p_sort = 'populer' then b.dub_count end desc nulls last,
     b.created_at desc
   limit least(coalesce(p_limit, 60), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.popular_tags(p_limit int default 16)
returns table (tag text, n int) language sql stable security definer set search_path = public as $$
  select t, count(*)::int from scenes, unnest(tags) t group by t order by 2 desc, 1 limit p_limit;
$$;

-- ------------------------------------------------------------
-- 7) LİDERLİK TABLOSU
--    p_period: week (bu hafta, Pazartesi 00:00 İstanbul) | lastweek | all
-- ------------------------------------------------------------
create or replace function public._week_start(p_at timestamptz default now()) returns timestamptz
language sql stable as $$
  select date_trunc('week', p_at at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
$$;

drop function if exists public.leaderboard(text, int);   -- 0.6.0'da dönüş tipi değişti
create function public.leaderboard(p_period text default 'week', p_limit int default 25)
returns table (user_id uuid, username text, display_name text, color text, avatar_path text,
               xp int, dubs int, mvp int, likes int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz;
  v_to   timestamptz := 'infinity';
begin
  if p_period = 'week' then
    v_from := _week_start();
  elsif p_period = 'lastweek' then
    v_from := _week_start() - interval '7 days';
    v_to   := _week_start();
  else
    v_from := '-infinity';
  end if;

  return query
  select * from (
    select p.id, p.username, p.display_name, p.color, p.avatar_path,
      case when p_period = 'all' then p.xp
           else coalesce((select sum(e.amount) from xp_events e
                           where e.user_id = p.id and e.created_at >= v_from and e.created_at < v_to), 0)::int end as xp,
      (select count(*)::int from dub_participants dp join dubs d on d.id = dp.dub_id
        where dp.user_id = p.id and d.created_at >= v_from and d.created_at < v_to) as dubs,
      (select count(*)::int from dub_votes v
        where v.category = 'mvp' and v.target_user = p.id and v.created_at >= v_from and v.created_at < v_to) as mvp,
      (select count(*)::int from dub_likes l join dub_participants dp on dp.dub_id = l.dub_id and dp.user_id = p.id
        where l.user_id <> p.id and l.created_at >= v_from and l.created_at < v_to) as likes
    from profiles p
  ) x
  where x.xp > 0 or x.dubs > 0
  order by x.xp desc, x.mvp desc, x.dubs desc, x.display_name
  limit least(coalesce(p_limit, 25), 100);
end $$;

-- Yapımcılar: sahne ekleyenlerin sıralaması
create or replace function public.creator_board(p_limit int default 25)
returns table (user_id uuid, username text, display_name text, color text, avatar_path text,
               scenes int, plays int, week_plays int, likes int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.color, p.avatar_path,
         count(distinct s.id)::int,
         coalesce(sum(s.dub_count), 0)::int,
         (select count(*)::int from dubs d join scenes s2 on s2.id = d.scene_id
           where s2.created_by = p.id and d.created_at >= _week_start()),
         (select coalesce(sum(d.like_count), 0)::int from dubs d join scenes s2 on s2.id = d.scene_id where s2.created_by = p.id)
    from profiles p join scenes s on s.created_by = p.id
   where exists (select 1 from scene_lines l where l.scene_id = s.id)
   group by p.id
   order by 7 desc, 6 desc
   limit least(coalesce(p_limit, 25), 100);
$$;

-- Yapımcı istatistikleri (profil sayfası)
create or replace function public.creator_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'scenes',     (select count(*) from scenes s where s.created_by = p_user and exists (select 1 from scene_lines l where l.scene_id = s.id)),
    'plays',      (select coalesce(sum(dub_count), 0) from scenes where created_by = p_user),
    'others',     (select count(*) from dubs d join scenes s on s.id = d.scene_id
                     where s.created_by = p_user and not exists (select 1 from dub_participants dp where dp.dub_id = d.id and dp.user_id = p_user)),
    'likes',      (select coalesce(sum(d.like_count), 0) from dubs d join scenes s on s.id = d.scene_id where s.created_by = p_user),
    'creator_xp', (select coalesce(sum(amount), 0) from xp_events where user_id = p_user and reason in ('yapimci', 'yapimci_begeni'))
  );
$$;

-- Rozet istatistikleri: yapımcı ve "Haftanın Sesi" eklendi
create or replace function public.badge_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with part as (select dub_id, lines from dub_participants where user_id = p_user),
       me as (select * from profiles where id = p_user),
       wk as (
         select _week_start(created_at) w, user_id, sum(amount) s from xp_events
          where created_at < _week_start() group by 1, 2
       ),
       wk_max as (select w, max(s) mx from wk group by w)
  select jsonb_build_object(
    'dubs',        (select count(*) from part),
    'lines',       coalesce((select sum(lines) from part), 0),
    'xp',          (select xp from me),
    'best_streak', (select best_streak from me),
    'likes',       coalesce((select sum(d.like_count) from dubs d join part on part.dub_id = d.id), 0),
    'comments',    (select count(*) from dub_comments where user_id = p_user),
    'scenes',      (select count(*) from scenes s where s.created_by = p_user
                       and exists (select 1 from scene_lines l where l.scene_id = s.id)),
    'effects',     (select count(*) from dub_recordings where user_id = p_user and effect <> 'dogal'),
    'votes',       (select count(*) from dub_votes v
                     where (v.category = 'mvp' and v.target_user = p_user)
                        or (v.category = 'komik' and exists (select 1 from dub_recordings r
                              where r.dub_id = v.dub_id and r.line_id = v.target_line and r.user_id = p_user))),
    'mvp_wins',    (select count(*) from part pt
                     where exists (
                       select 1 from dub_votes v where v.dub_id = pt.dub_id and v.category = 'mvp' and v.target_user = p_user
                       group by v.target_user
                       having count(*) >= all (select count(*) from dub_votes v2
                                                where v2.dub_id = pt.dub_id and v2.category = 'mvp' group by v2.target_user))),
    'funny_wins',  (select count(*) from part pt
                     where exists (
                       select 1 from dub_votes v join dub_recordings r on r.dub_id = v.dub_id and r.line_id = v.target_line
                        where v.dub_id = pt.dub_id and v.category = 'komik' and r.user_id = p_user
                        group by v.target_line
                       having count(*) >= all (select count(*) from dub_votes v2
                                                where v2.dub_id = pt.dub_id and v2.category = 'komik' group by v2.target_line))),
    'best_duo',    coalesce((select max(c) from (
                     select count(*) c from dub_participants a
                       join dub_participants b on b.dub_id = a.dub_id and b.user_id <> a.user_id
                      where a.user_id = p_user group by b.user_id) x), 0),
    'member_no',   (select count(*) from profiles p2, me
                     where p2.created_at < me.created_at or (p2.created_at = me.created_at and p2.id <= me.id)),
    'early_limit', coalesce((select value::int from app_settings where key = 'early_member_limit'), 50),
    'scene_plays', (select count(*) from dubs d join scenes s on s.id = d.scene_id
                     where s.created_by = p_user and not exists (select 1 from dub_participants dp where dp.dub_id = d.id and dp.user_id = p_user)),
    'top_scene',   coalesce((select max(c) from (
                     select count(*) c from dubs d join scenes s on s.id = d.scene_id
                      where s.created_by = p_user and not exists (select 1 from dub_participants dp where dp.dub_id = d.id and dp.user_id = p_user)
                      group by s.id) x), 0),
    'scene_likes', (select coalesce(sum(d.like_count), 0) from dubs d join scenes s on s.id = d.scene_id where s.created_by = p_user),
    'week_wins',   (select count(*) from wk join wk_max using (w) where wk.user_id = p_user and wk.s = wk_max.mx and wk.s > 0),
    'special',     coalesce((select jsonb_agg(jsonb_build_object('badge', badge, 'note', note, 'granted_at', granted_at))
                               from user_badges where user_id = p_user), '[]'::jsonb)
  );
$$;

-- ------------------------------------------------------------
-- 8) ODA YÖNETİMİ: çıkar, kilitle, sahipliği devret
-- ------------------------------------------------------------
alter table public.rooms add column if not exists locked boolean not null default false;
alter table public.rooms add column if not exists banned uuid[]  not null default '{}';

create or replace function public.kick_player(p_room uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi oyuncu çıkarabilir'; end if;
  if p_user = auth.uid() then raise exception 'Kendini çıkaramazsın'; end if;
  if v_room.status = 'finale' then raise exception 'Finalde oyuncu çıkarılamaz'; end if;
  if not exists (select 1 from room_players where room_id = p_room and user_id = p_user) then return; end if;

  if v_room.status = 'recording' then
    -- Kayıt sırasında çıkarılanın karakterleri oda sahibine geçer
    delete from recordings where room_id = p_room and user_id = p_user;
    update room_roles set user_id = v_room.host_id, picked = false where room_id = p_room and user_id = p_user;
    update room_players set done = false where room_id = p_room and user_id = v_room.host_id;
  else
    delete from room_roles where room_id = p_room and user_id = p_user;
  end if;
  delete from room_players where room_id = p_room and user_id = p_user;
  update rooms set banned = array_append(array_remove(banned, p_user), p_user) where id = p_room;
end $$;

create or replace function public.set_room_lock(p_room uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update rooms set locked = p_locked where id = p_room and host_id = auth.uid();
  if not found then raise exception 'Sadece oda sahibi'; end if;
end $$;

create or replace function public.transfer_host(p_room uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from room_players where room_id = p_room and user_id = p_user) then
    raise exception 'Bu kişi odada değil';
  end if;
  update rooms set host_id = p_user where id = p_room and host_id = auth.uid();
  if not found then raise exception 'Sadece oda sahibi'; end if;
end $$;

create or replace function public.join_room(p_code text, p_nickname text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_name text;
begin
  select display_name into v_name from profiles where id = auth.uid();
  if not found then raise exception 'Önce profil oluştur'; end if;
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'Oda bulunamadı'; end if;

  if exists (select 1 from room_players where room_id = v_room.id and user_id = auth.uid()) then
    update room_players set nickname = v_name where room_id = v_room.id and user_id = auth.uid();
    return v_room.id;
  end if;

  if auth.uid() = any (v_room.banned) then raise exception 'Bu odadan çıkarıldın'; end if;
  if v_room.locked then raise exception 'Oda kilitli. Oda sahibinden kilidi açmasını iste.'; end if;
  if v_room.status <> 'lobby' then raise exception 'Oyun başladı, artık katılamazsın'; end if;
  if (select count(*) from room_players where room_id = v_room.id) >= 12 then raise exception 'Oda dolu'; end if;
  insert into room_players (room_id, user_id, nickname) values (v_room.id, auth.uid(), v_name);
  return v_room.id;
end $$;

-- Lobiden ayrılan oda sahibiyse sahiplik en eski oyuncuya geçer; oda boşalırsa silinir
create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_next uuid;
begin
  select * into v_room from rooms where id = p_room and status = 'lobby' for update;
  if not found then return; end if;
  delete from room_roles   where room_id = p_room and user_id = auth.uid();
  delete from room_players where room_id = p_room and user_id = auth.uid();
  if v_room.host_id = auth.uid() then
    select user_id into v_next from room_players where room_id = p_room order by joined_at limit 1;
    if v_next is null then
      delete from rooms where id = p_room;
    else
      update rooms set host_id = v_next where id = p_room;
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 9) DEPOLAMA TEMİZLİĞİ
-- ------------------------------------------------------------
-- 3 günden uzun süredir hareketsiz odaları sil (arşivlenmiş dublajlar kalır)
create or replace function public._cleanup_stale_rooms(p_days int default 3) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from rooms r
   where greatest(r.created_at, coalesce(r.finale_at, r.created_at),
                  coalesce((select max(created_at) from recordings rc where rc.room_id = r.id), r.created_at),
                  coalesce((select max(joined_at) from room_players rp where rp.room_id = r.id), r.created_at))
         < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics n = row_count;
  return n;
end $$;

-- Hiçbir kayda bağlı olmayan dosyalar (tekrar çekimler, silinen odalar, yarım kalan yüklemeler)
create or replace function public.storage_orphans(p_min_age_hours int default 24)
returns table (bucket text, name text, bytes bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return query
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
    from storage.objects o
   where o.created_at < now() - make_interval(hours => greatest(p_min_age_hours, 1))
     and (
       (o.bucket_id = 'recordings'
         and not exists (select 1 from recordings rc where rc.audio_path = o.name)
         and not exists (select 1 from dub_recordings dr where dr.audio_path = o.name))
       or (o.bucket_id = 'scenes'
         and not exists (select 1 from scenes s where o.name in (s.video_path, s.bg_audio_path, s.thumb_path)))
       or (o.bucket_id = 'avatars'
         and not exists (select 1 from profiles p where p.avatar_path = o.name))
     )
   order by 3 desc
   limit 1000;
end $$;

-- pg_cron açıksa her gece 04:00'te (UTC) eski odaları otomatik temizle
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$select cron.schedule('famio-oda-temizligi', '0 4 * * *', 'select public._cleanup_stale_rooms(3)')$c$;
  end if;
exception when others then
  raise notice 'pg_cron görevi kurulamadı: %', sqlerrm;
end $$;

-- ------------------------------------------------------------
-- 10) YÖNETİM PANELİ (/yonetim) — sadece "kurucu" rozeti olanlar
-- ------------------------------------------------------------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return jsonb_build_object(
    'users',   (select count(*) from profiles),
    'scenes',  (select count(*) from scenes),
    'dubs',    (select count(*) from dubs),
    'rooms',   (select count(*) from rooms),
    'comments',(select count(*) from dub_comments),
    'storage', coalesce((select jsonb_object_agg(bucket_id, jsonb_build_object('files', n, 'bytes', b))
                  from (select bucket_id, count(*) n, coalesce(sum((metadata->>'size')::bigint), 0) b
                          from storage.objects where bucket_id in ('scenes', 'recordings', 'avatars') group by bucket_id) x), '{}'::jsonb),
    'settings', jsonb_build_object(
      'discord',            exists (select 1 from app_settings where key = 'discord_webhook_url' and coalesce(value, '') <> ''),
      'site_url',           (select value from app_settings where key = 'site_url'),
      'early_member_limit', (select value from app_settings where key = 'early_member_limit')
    ),
    'pg_net',  exists (select 1 from pg_extension where extname = 'pg_net'),
    'pg_cron', exists (select 1 from pg_extension where extname = 'pg_cron')
  );
end $$;

create or replace function public.admin_set_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if p_key not in ('discord_webhook_url', 'site_url', 'early_member_limit') then raise exception 'Bilinmeyen ayar'; end if;
  if p_key = 'discord_webhook_url' and coalesce(p_value, '') <> ''
     and p_value !~ '^https://(canary\.|ptb\.)?discord(app)?\.com/api/webhooks/' then
    raise exception 'Geçerli bir Discord webhook adresi değil';
  end if;
  if p_key = 'site_url' and coalesce(p_value, '') <> '' and p_value !~ '^https?://' then
    raise exception 'Site adresi http(s):// ile başlamalı';
  end if;
  if p_key = 'early_member_limit' and p_value !~ '^\d{1,6}$' then raise exception 'Sayı gir'; end if;
  insert into app_settings (key, value) values (p_key, nullif(trim(p_value), ''))
  on conflict (key) do update set value = excluded.value;
end $$;

create or replace function public.admin_discord_test() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return discord_test();
end $$;

create or replace function public.admin_users(p_q text default null)
returns table (id uuid, username text, display_name text, color text, avatar_path text, xp int, created_at timestamptz, badges text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return query
  select p.id, p.username, p.display_name, p.color, p.avatar_path, p.xp, p.created_at,
         coalesce((select array_agg(b.badge order by b.granted_at) from user_badges b where b.user_id = p.id), '{}')
    from profiles p
   where p_q is null or p_q = '' or p.username ilike '%' || p_q || '%' or p.display_name ilike '%' || p_q || '%'
   order by p.created_at
   limit 200;
end $$;

create or replace function public.admin_grant_badge(p_username text, p_badge text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if p_badge !~ '^[a-z0-9_]{2,32}$' then raise exception 'Rozet kimliği: küçük harf, rakam ve _'; end if;
  select id into v_user from profiles where username = lower(trim(p_username));
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
  insert into user_badges (user_id, badge, note) values (v_user, p_badge, nullif(trim(p_note), ''))
  on conflict (user_id, badge) do update set note = excluded.note;
end $$;

create or replace function public.admin_revoke_badge(p_username text, p_badge text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if p_badge = 'kurucu' and lower(trim(p_username)) = (select username from profiles where id = auth.uid()) then
    raise exception 'Kendi kurucu rozetini kaldıramazsın (yönetimi kaybedersin)';
  end if;
  delete from user_badges where badge = p_badge and user_id = (select id from profiles where username = lower(trim(p_username)));
end $$;

create or replace function public.admin_delete_scene(p_scene uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  delete from scenes where id = p_scene;   -- dosyalar "Depolama temizliği" ile silinir
end $$;

create or replace function public.admin_delete_dub(p_dub uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  delete from dubs where id = p_dub;
end $$;

create or replace function public.admin_delete_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  delete from dub_comments where id = p_comment;
end $$;

create or replace function public.admin_set_scene_owner(p_scene uuid, p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  select id into v_user from profiles where username = lower(trim(p_username));
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
  update scenes set created_by = v_user where id = p_scene;
end $$;

create or replace function public.admin_set_scene_thumb(p_scene uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  update scenes set thumb_path = p_path where id = p_scene;
end $$;

create or replace function public.admin_cleanup_rooms(p_days int default 3) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return _cleanup_stale_rooms(p_days);
end $$;

-- ------------------------------------------------------------
-- 11) UYUM listesine profil fotoğrafı (dönüş tipi değiştiği için önce silinir)
-- ------------------------------------------------------------
drop function if exists public.compat_for(uuid);
create function public.compat_for(p_user uuid)
returns table (partner uuid, username text, display_name text, color text, avatar_path text, shared_dubs int, shared_likes int, score int)
language sql stable set search_path = public as $$
  select p2.user_id, pr.username, pr.display_name, pr.color, pr.avatar_path,
         count(*)::int,
         coalesce(sum(d.like_count), 0)::int,
         (count(*) * 10 + coalesce(sum(d.like_count), 0) * 3)::int
    from dub_participants p1
    join dub_participants p2 on p2.dub_id = p1.dub_id and p2.user_id <> p1.user_id
    join dubs d on d.id = p1.dub_id
    join profiles pr on pr.id = p2.user_id
   where p1.user_id = p_user
   group by p2.user_id, pr.username, pr.display_name, pr.color, pr.avatar_path
   order by 8 desc, 6 desc
   limit 20;
$$;
grant execute on function public.compat_for(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- YETKİLER
-- ------------------------------------------------------------
revoke execute on function public._add_xp(uuid, int, text, uuid)   from public, anon, authenticated;
revoke execute on function public._norm_tags()                     from public, anon, authenticated;
revoke execute on function public._cleanup_stale_rooms(int)        from public, anon, authenticated;
revoke execute on function public._on_like()                       from public, anon, authenticated;
revoke execute on function public._finalize_dub(uuid)              from public, anon, authenticated;
revoke execute on function public._notify_discord(uuid)            from public, anon, authenticated;
grant execute on function public.is_admin()                                        to authenticated;
grant execute on function public.list_scenes(text, text, text, int, uuid, int, int) to anon, authenticated;
grant execute on function public.popular_tags(int)                                 to anon, authenticated;
grant execute on function public._week_start(timestamptz)                          to anon, authenticated;
grant execute on function public.leaderboard(text, int)                            to anon, authenticated;
grant execute on function public.creator_board(int)                                to anon, authenticated;
grant execute on function public.creator_stats(uuid)                               to anon, authenticated;
grant execute on function public.badge_stats(uuid)                                 to anon, authenticated;
grant execute on function public.cast_vote(uuid, text, uuid)                       to authenticated;
grant execute on function public.kick_player(uuid, uuid)                           to authenticated;
grant execute on function public.set_room_lock(uuid, boolean)                      to authenticated;
grant execute on function public.transfer_host(uuid, uuid)                         to authenticated;
grant execute on function public.join_room(text, text)                             to authenticated;
grant execute on function public.leave_room(uuid)                                  to authenticated;
grant execute on function public.storage_orphans(int)                              to authenticated;
grant execute on function public.admin_stats()                                     to authenticated;
grant execute on function public.admin_set_setting(text, text)                     to authenticated;
grant execute on function public.admin_discord_test()                              to authenticated;
grant execute on function public.admin_users(text)                                 to authenticated;
grant execute on function public.admin_grant_badge(text, text, text)               to authenticated;
grant execute on function public.admin_revoke_badge(text, text)                    to authenticated;
grant execute on function public.admin_delete_scene(uuid)                          to authenticated;
grant execute on function public.admin_delete_dub(uuid)                            to authenticated;
grant execute on function public.admin_delete_comment(uuid)                        to authenticated;
grant execute on function public.admin_set_scene_owner(uuid, text)                 to authenticated;
grant execute on function public.admin_set_scene_thumb(uuid, text)                 to authenticated;
grant execute on function public.admin_cleanup_rooms(int)                          to authenticated;
revoke execute on function public.storage_orphans(int), public.admin_stats(), public.admin_set_setting(text, text),
  public.admin_discord_test(), public.admin_users(text), public.admin_grant_badge(text, text, text),
  public.admin_revoke_badge(text, text), public.admin_delete_scene(uuid), public.admin_delete_dub(uuid),
  public.admin_delete_comment(uuid), public.admin_set_scene_owner(uuid, text), public.admin_set_scene_thumb(uuid, text),
  public.admin_cleanup_rooms(int), public.kick_player(uuid, uuid), public.set_room_lock(uuid, boolean),
  public.transfer_host(uuid, uuid), public.is_admin()
  from public, anon;

-- ============================================================
-- 0.6.0 — OYUN MODLARI, XP MAĞAZASI, PROFİL, EKİPLER, DISCORD
-- (migrations/006 ile aynı)
-- ============================================================

-- ============================================================
-- A) OYUN MODLARI
--   Ana mod: klasik | zincir (kulaktan kulağa) | senarist | duello
--   Ekler (sadece klasik ve senarist): kart (zorluk kartları), hain, foley
-- ============================================================
alter table public.rooms add column if not exists mode       text   not null default 'klasik';
alter table public.rooms add column if not exists mods       text[] not null default '{}';
alter table public.rooms add column if not exists mode_state jsonb  not null default '{}';
alter table public.rooms add column if not exists foley_user uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_mode_check') then
    alter table public.rooms add constraint rooms_mode_check check (mode in ('klasik', 'zincir', 'senarist', 'duello'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_mods_check') then
    alter table public.rooms add constraint rooms_mods_check check (mods <@ array['kart', 'hain', 'foley']::text[]);
  end if;
  -- senarist modunun yazım aşaması
  alter table public.rooms drop constraint if exists rooms_status_check;
  alter table public.rooms add constraint rooms_status_check check (status in ('lobby', 'writing', 'recording', 'finale'));
end $$;

-- Zincir modunda herkes her repliği kaydeder: tekillik (oda, replik, kişi)
alter table public.recordings drop constraint if exists recordings_room_id_line_id_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recordings_room_line_user_key') then
    alter table public.recordings add constraint recordings_room_line_user_key unique (room_id, line_id, user_id);
  end if;
  if exists (select 1 from pg_constraint where conname = 'dub_recordings_pkey'
              and array_length(conkey, 1) = 2 and conrelid = 'public.dub_recordings'::regclass) then
    alter table public.dub_recordings drop constraint dub_recordings_pkey;
    alter table public.dub_recordings add constraint dub_recordings_pkey primary key (dub_id, line_id, user_id);
  end if;
end $$;

alter table public.dubs add column if not exists mode         text   not null default 'klasik';
alter table public.dubs add column if not exists mods         text[] not null default '{}';
alter table public.dubs add column if not exists chain        uuid[];
alter table public.dubs add column if not exists has_impostor boolean not null default false;

-- Zorluk kartları (kartlar gizli değil)
create table if not exists public.room_cards (
  room_id uuid not null references public.rooms(id) on delete cascade,
  line_id uuid not null references public.scene_lines(id) on delete cascade,
  card    text not null,
  primary key (room_id, line_id)
);
create table if not exists public.dub_cards (
  dub_id  uuid not null references public.dubs(id) on delete cascade,
  line_id uuid not null references public.scene_lines(id) on delete cascade,
  card    text not null,
  primary key (dub_id, line_id)
);

-- Hain: gizli görev sadece haine görünür
create table if not exists public.room_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  user_id uuid not null,
  task    text not null
);
create table if not exists public.dub_secrets (
  dub_id   uuid primary key references public.dubs(id) on delete cascade,
  impostor uuid not null references public.profiles(id) on delete cascade,
  task     text not null,
  revealed boolean not null default false,
  caught   boolean
);

-- Foley: tüm sahne boyunca tek parça efekt kaydı
create table if not exists public.room_foley (
  room_id     uuid primary key references public.rooms(id) on delete cascade,
  user_id     uuid not null,
  audio_path  text not null,
  offset_time real not null,
  created_at  timestamptz not null default now()
);
create table if not exists public.dub_foley (
  dub_id      uuid primary key references public.dubs(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  audio_path  text not null,
  offset_time real not null
);

-- Senarist: yeniden yazılan replikler
create table if not exists public.room_line_texts (
  room_id uuid not null references public.rooms(id) on delete cascade,
  line_id uuid not null references public.scene_lines(id) on delete cascade,
  author  uuid not null,
  text    text check (char_length(text) <= 200),
  primary key (room_id, line_id)
);
create table if not exists public.dub_line_texts (
  dub_id  uuid not null references public.dubs(id) on delete cascade,
  line_id uuid not null references public.scene_lines(id) on delete cascade,
  author  uuid references public.profiles(id) on delete set null,
  text    text not null,
  primary key (dub_id, line_id)
);

-- Düello turnuvası
create table if not exists public.duel_matches (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  round      int  not null,
  slot       int  not null,
  a          uuid not null,
  b          uuid,
  line_id    uuid not null references public.scene_lines(id) on delete cascade,
  status     text not null default 'bekliyor' check (status in ('bekliyor', 'kayit', 'oylama', 'bitti')),
  winner     uuid,
  created_at timestamptz not null default now(),
  unique (room_id, round, slot)
);
create table if not exists public.duel_takes (
  match_id    uuid not null references public.duel_matches(id) on delete cascade,
  user_id     uuid not null,
  audio_path  text not null,
  offset_time real not null,
  primary key (match_id, user_id)
);
create table if not exists public.duel_votes (
  match_id uuid not null references public.duel_matches(id) on delete cascade,
  voter    uuid not null,
  pick     uuid not null,
  primary key (match_id, voter)
);
create table if not exists public.duel_results (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid references public.rooms(id) on delete set null,
  scene_id   uuid references public.scenes(id) on delete set null,
  champion   uuid not null references public.profiles(id) on delete cascade,
  players    int  not null,
  created_at timestamptz not null default now()
);

-- RLS ve yetkiler
alter table public.room_cards      enable row level security;
alter table public.dub_cards       enable row level security;
alter table public.room_secrets    enable row level security;
alter table public.dub_secrets     enable row level security;
alter table public.room_foley      enable row level security;
alter table public.dub_foley       enable row level security;
alter table public.room_line_texts enable row level security;
alter table public.dub_line_texts  enable row level security;
alter table public.duel_matches    enable row level security;
alter table public.duel_takes      enable row level security;
alter table public.duel_votes      enable row level security;
alter table public.duel_results    enable row level security;

drop policy if exists room_cards_select on public.room_cards;
create policy room_cards_select on public.room_cards for select to authenticated using (true);
drop policy if exists room_secrets_select on public.room_secrets;
create policy room_secrets_select on public.room_secrets for select to authenticated using (user_id = auth.uid());
drop policy if exists room_foley_select on public.room_foley;
create policy room_foley_select on public.room_foley for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.rooms r where r.id = room_id and r.status = 'finale'));
drop policy if exists room_line_texts_select on public.room_line_texts;
create policy room_line_texts_select on public.room_line_texts for select to authenticated using (
  author = auth.uid() or exists (select 1 from public.rooms r where r.id = room_id and r.status <> 'writing'));
drop policy if exists duel_matches_select on public.duel_matches;
create policy duel_matches_select on public.duel_matches for select to authenticated using (true);
drop policy if exists duel_takes_select on public.duel_takes;
create policy duel_takes_select on public.duel_takes for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.duel_matches m where m.id = match_id and m.status in ('oylama', 'bitti')));
drop policy if exists duel_votes_select on public.duel_votes;
create policy duel_votes_select on public.duel_votes for select to authenticated using (true);
drop policy if exists dub_secrets_select on public.dub_secrets;
create policy dub_secrets_select on public.dub_secrets for select to anon, authenticated using (revealed or impostor = auth.uid());
do $$
declare t text;
begin
  foreach t in array array['dub_cards', 'dub_foley', 'dub_line_texts', 'duel_results'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_select', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
grant select on public.room_cards, public.room_secrets, public.room_foley, public.room_line_texts,
  public.duel_matches, public.duel_takes, public.duel_votes to authenticated;
grant select on public.dub_secrets to anon, authenticated;

-- Zincir modunda bir önceki oyuncunun kayıtlarını dinleyebilirsin
create or replace function public._can_hear(p_room uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rooms r,
      lateral (select array_position(array(select jsonb_array_elements_text(r.mode_state->'order'))::uuid[], auth.uid()) as me) x
     where r.id = p_room and r.mode = 'zincir' and x.me > 1
       and (r.mode_state->'order'->>(x.me - 2))::uuid = p_owner
  );
$$;
drop policy if exists recordings_select on public.recordings;
create policy recordings_select on public.recordings for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.rooms r where r.id = room_id and r.status = 'finale')
  or public._can_hear(room_id, user_id)
);

-- Kart destesi ve hain görevleri (arayüzdeki adlar lib/modes.ts'de)
create or replace function public._card_deck() returns text[] language sql immutable as $$
  select array['fisilti', 'spiker', 'aglama', 'opera', 'dede', 'bebek', 'korsan', 'haber', 'uykulu',
               'kizgin', 'drama', 'kotu', 'rapci', 'ogretmen', 'heyecan', 'robot_dans']
$$;
create or replace function public._impostor_tasks() returns text[] language sql immutable as $$
  select array[
    'Repliklerinden birinde "patlıcan" kelimesini geçir.',
    'Bir repliğini şarkı söyler gibi seslendir.',
    'Her repliğinin sonuna fark ettirmeden "kanka" ekle.',
    'Bir repliğinde bir hayvan sesi çıkar.',
    'Bir repliğini tamamen fısıldayarak söyle.',
    'Repliklerinden birinde bir yemek adı söyle.',
    'Bir repliğinde gereksiz yere çok uzun bir es ver.',
    'Bir repliğini bir reklam spikeri gibi bitir.',
    'Repliklerinden birinde başka bir oyuncunun adını geçir.',
    'Bir repliğinde ufak bir hapşırık ya da öksürük yap.'
  ]
$$;

-- Lobide modu seç (sadece oda sahibi)
create or replace function public.set_room_mode(p_room uuid, p_mode text, p_mods text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_mods text[] := coalesce(p_mods, '{}');
begin
  if p_mode not in ('klasik', 'zincir', 'senarist', 'duello') then raise exception 'Geçersiz mod'; end if;
  if not (v_mods <@ array['kart', 'hain', 'foley']::text[]) then raise exception 'Geçersiz ek'; end if;
  if p_mode in ('zincir', 'duello') then v_mods := '{}'; end if;
  update rooms
     set mode = p_mode,
         mods = (select coalesce(array_agg(distinct m order by m), '{}') from unnest(v_mods) m),
         foley_user = case when 'foley' = any (v_mods) then foley_user end
   where id = p_room and host_id = auth.uid() and status = 'lobby';
  if not found then raise exception 'Modu sadece oda sahibi lobide değiştirebilir'; end if;
end $$;

-- Foley rolünü al / bırak
create or replace function public.claim_foley(p_room uuid, p_take boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from room_players where room_id = p_room and user_id = auth.uid()) then
    raise exception 'Bu odada değilsin';
  end if;
  if p_take then
    update rooms set foley_user = auth.uid()
     where id = p_room and status = 'lobby' and 'foley' = any (mods) and (foley_user is null or foley_user = auth.uid());
    if not found then raise exception 'Foley rolü dolu ya da bu modda yok'; end if;
  else
    update rooms set foley_user = null where id = p_room and status = 'lobby' and foley_user = auth.uid();
  end if;
end $$;

-- Oyunu başlat: moda göre hazırlık
create or replace function public.start_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room    rooms%rowtype;
  v_role    uuid;
  v_user    uuid;
  v_order   uuid[];
  v_n       int;
  v_line    uuid;
  v_actors  uuid[];
  i         int;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Oda bulunamadı'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi başlatabilir'; end if;
  if v_room.status <> 'lobby' then raise exception 'Oyun zaten başladı'; end if;
  if not exists (select 1 from room_players where room_id = p_room) then raise exception 'Odada oyuncu yok'; end if;
  if not exists (select 1 from scene_lines where scene_id = v_room.scene_id) then raise exception 'Sahnede replik yok'; end if;
  select count(*) into v_n from room_players where room_id = p_room;

  delete from recordings      where room_id = p_room;
  delete from room_cards      where room_id = p_room;
  delete from room_secrets    where room_id = p_room;
  delete from room_foley      where room_id = p_room;
  delete from room_line_texts where room_id = p_room;
  delete from duel_matches    where room_id = p_room;
  update room_players set done = false where room_id = p_room;

  -- ---------- DÜELLO ----------
  if v_room.mode = 'duello' then
    if v_n < 2 then raise exception 'Düello için en az 2 oyuncu gerekir'; end if;
    select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;
    perform _duel_make_round(p_room, 1, v_order);
    update rooms set status = 'recording', finale_at = null, mode_state = jsonb_build_object('players', to_jsonb(v_order)) where id = p_room;
    perform _duel_activate_next(p_room);
    return;
  end if;

  -- ---------- ZİNCİR ----------
  if v_room.mode = 'zincir' then
    if v_n < 2 then raise exception 'Kulaktan kulağa için en az 2 oyuncu gerekir'; end if;
    select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;
    delete from room_roles where room_id = p_room;
    update rooms set status = 'recording', finale_at = null, mode_state = jsonb_build_object('order', to_jsonb(v_order)) where id = p_room;
    return;
  end if;

  -- ---------- KLASİK / SENARİST: karakter dağıtımı ----------
  delete from room_roles rr
   where rr.room_id = p_room
     and (not exists (select 1 from scene_roles sr where sr.id = rr.role_id and sr.scene_id = v_room.scene_id)
          or not exists (select 1 from room_players p where p.room_id = p_room and p.user_id = rr.user_id));
  if v_room.foley_user is not null and not exists (select 1 from room_players where room_id = p_room and user_id = v_room.foley_user) then
    update rooms set foley_user = null where id = p_room;
    v_room.foley_user := null;
  end if;

  for v_role in
    select sr.id from scene_roles sr
     where sr.scene_id = v_room.scene_id
       and not exists (select 1 from room_roles rr where rr.room_id = p_room and rr.role_id = sr.id)
     order by random()
  loop
    -- Foley yapan kişiye, başka oyuncu varsa karakter verilmez
    select p.user_id into v_user
      from room_players p
     where p.room_id = p_room
     order by (p.user_id = v_room.foley_user and v_n > 1),
              (select count(*) from room_roles rr where rr.room_id = p_room and rr.user_id = p.user_id), random()
     limit 1;
    insert into room_roles (room_id, role_id, user_id, picked) values (p_room, v_role, v_user, false);
  end loop;

  -- Zorluk kartları: her repliğe rastgele bir kart
  if 'kart' = any (v_room.mods) then
    insert into room_cards (room_id, line_id, card)
      select p_room, l.id, (_card_deck())[1 + floor(random() * array_length(_card_deck(), 1))::int]
        from scene_lines l where l.scene_id = v_room.scene_id;
  end if;

  -- Hain: karakteri olan en az 3 kişi varsa biri gizlice seçilir
  if 'hain' = any (v_room.mods) then
    select array_agg(distinct user_id) into v_actors from room_roles where room_id = p_room;
    if coalesce(array_length(v_actors, 1), 0) >= 3 then
      insert into room_secrets (room_id, user_id, task)
      values (p_room, v_actors[1 + floor(random() * array_length(v_actors, 1))::int],
              (_impostor_tasks())[1 + floor(random() * array_length(_impostor_tasks(), 1))::int]);
    end if;
  end if;

  -- Senarist: her repliği, o karakteri seslendirmeyen biri yeniden yazar
  if v_room.mode = 'senarist' then
    for v_line in select l.id from scene_lines l where l.scene_id = v_room.scene_id order by l.start_time loop
      select p.user_id into v_user
        from room_players p
       where p.room_id = p_room
       order by exists (select 1 from room_roles rr join scene_lines sl on sl.role_id = rr.role_id
                         where rr.room_id = p_room and rr.user_id = p.user_id and sl.id = v_line),
                (select count(*) from room_line_texts t where t.room_id = p_room and t.author = p.user_id), random()
       limit 1;
      insert into room_line_texts (room_id, line_id, author) values (p_room, v_line, v_user);
    end loop;
    update rooms set status = 'writing', finale_at = null, mode_state = '{}' where id = p_room;
    return;
  end if;

  update rooms set status = 'recording', finale_at = null, mode_state = '{}' where id = p_room;
end $$;

-- Senarist: repliği yeniden yaz
create or replace function public.write_line(p_room uuid, p_line uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and status = 'writing') then raise exception 'Yazım aşamasında değiliz'; end if;
  if char_length(coalesce(p_text, '')) > 200 then raise exception 'Replik en fazla 200 karakter olabilir'; end if;
  update room_line_texts set text = nullif(trim(p_text), '')
   where room_id = p_room and line_id = p_line and author = auth.uid();
  if not found then raise exception 'Bu repliği yazmak sana düşmedi'; end if;
end $$;

-- Senarist: yazımı bitir, kayda geç (oda sahibi)
create or replace function public.finish_writing(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update rooms set status = 'recording' where id = p_room and host_id = auth.uid() and status = 'writing';
  if not found then raise exception 'Sadece oda sahibi yazımı bitirebilir'; end if;
  update room_players set done = false where room_id = p_room;
end $$;

-- Kaydı kaydet: zincir modunda sıra kontrolü, diğerlerinde karakter kontrolü
create or replace function public.save_recording(p_room uuid, p_line uuid, p_path text, p_offset double precision)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_pos  int;
  v_prev uuid;
begin
  select * into v_room from rooms where id = p_room;
  if not found or v_room.status <> 'recording' then raise exception 'Kayıt aşamasında değiliz'; end if;
  if p_path not like p_room::text || '/' || auth.uid()::text || '/%' then raise exception 'Geçersiz dosya yolu'; end if;

  if v_room.mode = 'zincir' then
    if not exists (select 1 from scene_lines l where l.id = p_line and l.scene_id = v_room.scene_id) then
      raise exception 'Bu replik bu sahnede yok';
    end if;
    v_pos := array_position(array(select jsonb_array_elements_text(v_room.mode_state->'order'))::uuid[], auth.uid());
    if v_pos is null then raise exception 'Zincirde değilsin'; end if;
    if v_pos > 1 then
      v_prev := (v_room.mode_state->'order'->>(v_pos - 2))::uuid;
      if not exists (select 1 from room_players where room_id = p_room and user_id = v_prev and done) then
        raise exception 'Sıran gelmedi: önceki oyuncu henüz bitirmedi';
      end if;
    end if;
  elsif not exists (
    select 1 from scene_lines l join room_roles rr on rr.role_id = l.role_id and rr.room_id = p_room
     where l.id = p_line and rr.user_id = auth.uid()
  ) then
    raise exception 'Bu replik sana ait değil';
  end if;

  insert into recordings (room_id, line_id, user_id, audio_path, offset_time)
  values (p_room, p_line, auth.uid(), p_path, p_offset)
  on conflict (room_id, line_id, user_id)
  do update set audio_path = excluded.audio_path, offset_time = excluded.offset_time, created_at = now();
end $$;

-- Foley kaydını kaydet
create or replace function public.save_foley(p_room uuid, p_path text, p_offset double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and status = 'recording' and foley_user = auth.uid()) then
    raise exception 'Foley kaydı sana ait değil';
  end if;
  if p_path not like p_room::text || '/' || auth.uid()::text || '/%' then raise exception 'Geçersiz dosya yolu'; end if;
  insert into room_foley (room_id, user_id, audio_path, offset_time) values (p_room, auth.uid(), p_path, p_offset)
  on conflict (room_id) do update set audio_path = excluded.audio_path, offset_time = excluded.offset_time, created_at = now();
end $$;

-- ------------------------------------------------------------
-- DÜELLO
-- ------------------------------------------------------------
create or replace function public._duel_make_round(p_room uuid, p_round int, p_players uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_scene uuid := (select scene_id from rooms where id = p_room);
  n int := coalesce(array_length(p_players, 1), 0);
  i int := 1;
  s int := 0;
  v_line uuid;
begin
  while i <= n loop
    -- Uzun replikler tercih edilir (en uzun yarısından rastgele)
    select id into v_line from (
      select id from scene_lines where scene_id = v_scene order by end_time - start_time desc
       limit greatest(1, (select count(*) from scene_lines where scene_id = v_scene) / 2 + 1)
    ) x order by random() limit 1;
    if i = n then
      -- tek kalan: bay geçer
      insert into duel_matches (room_id, round, slot, a, b, line_id, status, winner)
      values (p_room, p_round, s, p_players[i], null, v_line, 'bitti', p_players[i]);
    else
      insert into duel_matches (room_id, round, slot, a, b, line_id)
      values (p_room, p_round, s, p_players[i], p_players[i + 1], v_line);
    end if;
    i := i + 2;
    s := s + 1;
  end loop;
end $$;

-- Sıradaki maçı aç; tur bittiyse yeni tur kur; tek kişi kaldıysa şampiyon
create or replace function public._duel_activate_next(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round   int;
  v_next    uuid;
  v_winners uuid[];
  v_champ   uuid;
  v_room    rooms%rowtype;
begin
  if exists (select 1 from duel_matches where room_id = p_room and status in ('kayit', 'oylama')) then return; end if;
  select max(round) into v_round from duel_matches where room_id = p_room;
  select id into v_next from duel_matches where room_id = p_room and round = v_round and status = 'bekliyor' order by slot limit 1;
  if v_next is not null then
    update duel_matches set status = 'kayit' where id = v_next;
    return;
  end if;
  select array_agg(winner order by slot) into v_winners from duel_matches where room_id = p_room and round = v_round;
  if array_length(v_winners, 1) = 1 then
    v_champ := v_winners[1];
    select * into v_room from rooms where id = p_room;
    update rooms set status = 'finale', finale_at = now(),
           mode_state = mode_state || jsonb_build_object('champion', v_champ) where id = p_room;
    if exists (select 1 from profiles where id = v_champ) then
      insert into duel_results (room_id, scene_id, champion, players)
      values (p_room, v_room.scene_id, v_champ, jsonb_array_length(coalesce(v_room.mode_state->'players', '[]')));
      perform _add_xp(v_champ, 50, 'duello', null);
      begin
        perform _discord_post(jsonb_build_object('username', 'fam-io', 'embeds', jsonb_build_array(jsonb_build_object(
          'title', '🏆 Düello şampiyonu: ' || (select display_name from profiles where id = v_champ),
          'description', (select title from scenes where id = v_room.scene_id) || ' sahnesinde '
                         || jsonb_array_length(coalesce(v_room.mode_state->'players', '[]')) || ' kişilik turnuvayı kazandı.',
          'color', 16766720))));
      exception when others then null;
      end;
    end if;
    return;
  end if;
  perform _duel_make_round(p_room, v_round + 1, v_winners);
  perform _duel_activate_next(p_room);
end $$;

create or replace function public.duel_save(p_match uuid, p_path text, p_offset double precision)
returns void language plpgsql security definer set search_path = public as $$
declare
  m duel_matches%rowtype;
begin
  select * into m from duel_matches where id = p_match for update;
  if not found or m.status <> 'kayit' then raise exception 'Bu maç kayıt aşamasında değil'; end if;
  if auth.uid() not in (m.a, m.b) then raise exception 'Bu maçta değilsin'; end if;
  if p_path not like m.room_id::text || '/' || auth.uid()::text || '/%' then raise exception 'Geçersiz dosya yolu'; end if;
  insert into duel_takes (match_id, user_id, audio_path, offset_time) values (p_match, auth.uid(), p_path, p_offset)
  on conflict (match_id, user_id) do update set audio_path = excluded.audio_path, offset_time = excluded.offset_time;
  if (select count(*) from duel_takes where match_id = p_match) = 2 then
    update duel_matches set status = 'oylama' where id = p_match;
  end if;
end $$;

create or replace function public.duel_vote(p_match uuid, p_pick uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m duel_matches%rowtype;
begin
  select * into m from duel_matches where id = p_match;
  if not found or m.status <> 'oylama' then raise exception 'Oylama açık değil'; end if;
  if not exists (select 1 from room_players where room_id = m.room_id and user_id = auth.uid()) then raise exception 'Bu odada değilsin'; end if;
  if p_pick not in (m.a, m.b) then raise exception 'Geçersiz seçim'; end if;
  if p_pick = auth.uid() then raise exception 'Kendine oy veremezsin'; end if;
  insert into duel_votes (match_id, voter, pick) values (p_match, auth.uid(), p_pick)
  on conflict (match_id, voter) do update set pick = excluded.pick;
end $$;

-- Oylamayı kapat (oda sahibi): çok oy alan kazanır, eşitlikte yazı tura
create or replace function public.duel_close(p_match uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m duel_matches%rowtype;
  va int;
  vb int;
  w uuid;
begin
  select * into m from duel_matches where id = p_match for update;
  if not found or m.status <> 'oylama' then raise exception 'Oylama açık değil'; end if;
  if not exists (select 1 from rooms where id = m.room_id and host_id = auth.uid()) then raise exception 'Sadece oda sahibi'; end if;
  select count(*) filter (where pick = m.a), count(*) filter (where pick = m.b) into va, vb from duel_votes where match_id = p_match;
  w := case when va > vb then m.a when vb > va then m.b when random() < 0.5 then m.a else m.b end;
  update duel_matches set status = 'bitti', winner = w where id = p_match;
  perform _add_xp(w, 10, 'duello', null);
  perform _duel_activate_next(m.room_id);
  return w;
end $$;

-- Maçta biri ayrıldıysa / kayıt yapmıyorsa oda sahibi rakibi kazanmış sayabilir
create or replace function public.duel_forfeit(p_match uuid, p_loser uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m duel_matches%rowtype;
begin
  select * into m from duel_matches where id = p_match for update;
  if not found or m.status not in ('kayit', 'oylama') then raise exception 'Bu maç bitmiş'; end if;
  if not exists (select 1 from rooms where id = m.room_id and host_id = auth.uid()) then raise exception 'Sadece oda sahibi'; end if;
  if p_loser not in (m.a, m.b) then raise exception 'Bu kişi bu maçta değil'; end if;
  update duel_matches set status = 'bitti', winner = case when p_loser = m.a then m.b else m.a end where id = p_match;
  perform _duel_activate_next(m.room_id);
end $$;

-- ------------------------------------------------------------
-- Yeni tur: mod verilerini de temizle
-- ------------------------------------------------------------
create or replace function public.reset_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and host_id = auth.uid()) then
    raise exception 'Sadece oda sahibi';
  end if;
  delete from recordings      where room_id = p_room;           -- dosyalar arşivde kalır
  delete from room_cards      where room_id = p_room;
  delete from room_secrets    where room_id = p_room;
  delete from room_foley      where room_id = p_room;
  delete from room_line_texts where room_id = p_room;
  delete from duel_matches    where room_id = p_room;
  delete from room_roles where room_id = p_room and not picked;
  update room_players set done = false where room_id = p_room;
  update rooms set status = 'lobby', finale_at = null, current_dub_id = null, mode_state = '{}' where id = p_room;
end $$;

-- ------------------------------------------------------------
-- Final arşivi: modlara göre ek veriler
-- ------------------------------------------------------------
create or replace function public._finalize_dub(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_room    rooms%rowtype;
  v_dub     uuid;
  v_day     date := (now() at time zone 'Europe/Istanbul')::date;
  n_part    int;
  r         record;
  p         profiles%rowtype;
  v_xp      int;
  v_streak  int;
  v_creator uuid;
  v_secret  room_secrets%rowtype;
begin
  select * into v_room from rooms where id = p_room;
  if not exists (select 1 from recordings rc join profiles pr on pr.id = rc.user_id where rc.room_id = p_room)
     and not exists (select 1 from room_foley f join profiles pr on pr.id = f.user_id where f.room_id = p_room) then
    return null;
  end if;

  insert into dubs (room_id, scene_id, created_by, mode, mods, chain)
  values (p_room, v_room.scene_id, v_room.host_id, v_room.mode, v_room.mods,
          case when v_room.mode = 'zincir' then array(select jsonb_array_elements_text(v_room.mode_state->'order'))::uuid[] end)
  returning id into v_dub;

  if v_room.mode <> 'zincir' then
    insert into dub_cast (dub_id, role_id, user_id)
      select v_dub, rr.role_id, rr.user_id from room_roles rr join profiles pr on pr.id = rr.user_id where rr.room_id = p_room;
  end if;
  insert into dub_recordings (dub_id, line_id, user_id, audio_path, offset_time, effect)
    select v_dub, line_id, user_id, audio_path, offset_time, effect from recordings where room_id = p_room;
  insert into dub_participants (dub_id, user_id, lines)
    select v_dub, rc.user_id, count(*) from recordings rc join profiles pr on pr.id = rc.user_id
     where rc.room_id = p_room group by rc.user_id;

  -- Mod ekleri
  insert into dub_cards (dub_id, line_id, card) select v_dub, line_id, card from room_cards where room_id = p_room;
  insert into dub_line_texts (dub_id, line_id, author, text)
    select v_dub, t.line_id, case when exists (select 1 from profiles where id = t.author) then t.author end, t.text
      from room_line_texts t where t.room_id = p_room and t.text is not null;
  insert into dub_foley (dub_id, user_id, audio_path, offset_time)
    select v_dub, f.user_id, f.audio_path, f.offset_time from room_foley f join profiles pr on pr.id = f.user_id where f.room_id = p_room;
  insert into dub_participants (dub_id, user_id, lines)
    select v_dub, f.user_id, 0 from room_foley f join profiles pr on pr.id = f.user_id where f.room_id = p_room
    on conflict (dub_id, user_id) do nothing;
  -- Senarist: replik yazanlar da dublajda yer alır
  insert into dub_participants (dub_id, user_id, lines)
    select distinct v_dub, t.author, 0 from room_line_texts t join profiles pr on pr.id = t.author
     where t.room_id = p_room and t.text is not null
    on conflict (dub_id, user_id) do nothing;
  select * into v_secret from room_secrets where room_id = p_room;
  if found and exists (select 1 from dub_participants where dub_id = v_dub and user_id = v_secret.user_id) then
    insert into dub_secrets (dub_id, impostor, task) values (v_dub, v_secret.user_id, v_secret.task);
    update dubs set has_impostor = true where id = v_dub;
  end if;

  select count(*) into n_part from dub_participants where dub_id = v_dub;

  for r in select user_id, lines from dub_participants where dub_id = v_dub loop
    select * into p from profiles where id = r.user_id for update;
    v_xp := 40 + 10 * least(r.lines, 20) + 10 * least(n_part - 1, 5);
    if p.last_streak_day is distinct from v_day then
      v_streak := case when p.last_streak_day = v_day - 1 then p.streak + 1 else 1 end;
      v_xp := v_xp + 20 + 5 * least(v_streak, 10);
      update profiles
         set streak = v_streak, best_streak = greatest(best_streak, v_streak), last_streak_day = v_day
       where id = r.user_id;
    end if;
    perform _add_xp(r.user_id, v_xp, 'dublaj', v_dub);
    update dub_participants set xp_gained = v_xp where dub_id = v_dub and user_id = r.user_id;
  end loop;

  update scenes set dub_count = dub_count + 1 where id = v_room.scene_id returning created_by into v_creator;
  if v_creator is not null and not exists (select 1 from dub_participants where dub_id = v_dub and user_id = v_creator) then
    perform _add_xp(v_creator, 15, 'yapimci', v_dub);
    update dubs set creator_xp = 15 where id = v_dub;
  end if;

  update rooms set current_dub_id = v_dub where id = p_room;

  begin
    perform _notify_discord(v_dub);
  exception when others then
    raise warning 'Discord: %', sqlerrm;
  end;
  return v_dub;
end $$;

-- ------------------------------------------------------------
-- Oylama: yeni kategoriler "kart" (kartı en iyi oynayan) ve "hain" (hain kim?)
-- ------------------------------------------------------------
alter table public.dub_votes drop constraint if exists dub_votes_category_check;
alter table public.dub_votes add constraint dub_votes_category_check check (category in ('mvp', 'komik', 'kart', 'hain'));

create or replace function public.cast_vote(p_dub uuid, p_category text, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner     uuid;
  v_prev      dub_votes%rowtype;
  v_prev_own  uuid;
  v_dub       dubs%rowtype;
  v_xp        int := 10;
begin
  select * into v_dub from dubs where id = p_dub;
  if not found then raise exception 'Dublaj bulunamadı'; end if;
  if not exists (select 1 from dub_participants where dub_id = p_dub and user_id = auth.uid()) then
    raise exception 'Sadece bu sahnede oynayanlar oy verebilir';
  end if;

  if p_category in ('mvp', 'hain') then
    if not exists (select 1 from dub_participants where dub_id = p_dub and user_id = p_target) then
      raise exception 'Bu kişi bu sahnede yok';
    end if;
    v_owner := p_target;
    if p_category = 'hain' then
      if not v_dub.has_impostor then raise exception 'Bu turda hain yoktu'; end if;
      if exists (select 1 from dub_secrets where dub_id = p_dub and revealed) then raise exception 'Hain zaten açıklandı'; end if;
      v_xp := 0;   -- hain oyları XP vermez; açıklanınca dağıtılır
    end if;
  elsif p_category in ('komik', 'kart') then
    if v_dub.mode = 'zincir' then raise exception 'Bu modda replik oylaması yok'; end if;
    if p_category = 'kart' and not exists (select 1 from dub_cards where dub_id = p_dub and line_id = p_target) then
      raise exception 'Bu replikte kart yoktu';
    end if;
    select user_id into v_owner from dub_recordings where dub_id = p_dub and line_id = p_target limit 1;
    if not found then raise exception 'Bu replik bu sahnede yok'; end if;
  else
    raise exception 'Geçersiz kategori';
  end if;
  if v_owner = auth.uid() then raise exception 'Kendine oy veremezsin'; end if;

  select * into v_prev from dub_votes where dub_id = p_dub and voter = auth.uid() and category = p_category for update;
  if found then
    v_prev_own := case when p_category in ('mvp', 'hain') then v_prev.target_user
                       else (select user_id from dub_recordings where dub_id = p_dub and line_id = v_prev.target_line limit 1) end;
    if v_xp > 0 then perform _add_xp(v_prev_own, -v_xp, 'oy', p_dub); end if;
    if coalesce(v_prev.target_user, v_prev.target_line) = p_target then
      delete from dub_votes where dub_id = p_dub and voter = auth.uid() and category = p_category;
      return;
    end if;
    update dub_votes
       set target_user = case when p_category in ('mvp', 'hain') then p_target end,
           target_line = case when p_category in ('komik', 'kart') then p_target end,
           created_at = now()
     where dub_id = p_dub and voter = auth.uid() and category = p_category;
  else
    insert into dub_votes (dub_id, voter, category, target_user, target_line)
    values (p_dub, auth.uid(), p_category,
            case when p_category in ('mvp', 'hain') then p_target end,
            case when p_category in ('komik', 'kart') then p_target end);
  end if;
  if v_xp > 0 then perform _add_xp(v_owner, v_xp, 'oy', p_dub); end if;
end $$;

-- Haini açıkla: oda sahibi ya da herkes oy verdiyse herhangi bir katılımcı
-- Yakalandıysa doğru tahmin eden herkes +15, yakalanmadıysa hain +40 XP
create or replace function public.reveal_impostor(p_dub uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s        dub_secrets%rowtype;
  v_dub    dubs%rowtype;
  v_top    int;
  v_caught boolean;
  v_parts  int;
  v_voters int;
  r        record;
begin
  select * into v_dub from dubs where id = p_dub;
  select * into s from dub_secrets where dub_id = p_dub for update;
  if not found then raise exception 'Bu turda hain yoktu'; end if;
  if s.revealed then return jsonb_build_object('impostor', s.impostor, 'task', s.task, 'caught', s.caught); end if;
  select count(*) into v_parts from dub_participants where dub_id = p_dub;
  select count(distinct voter) into v_voters from dub_votes where dub_id = p_dub and category = 'hain';
  if v_dub.created_by is distinct from auth.uid() and v_voters < v_parts then
    raise exception 'Herkes oy verince ya da oda sahibi açıklayabilir';
  end if;
  if not exists (select 1 from dub_participants where dub_id = p_dub and user_id = auth.uid()) and v_dub.created_by is distinct from auth.uid() then
    raise exception 'Bu dublajda değilsin';
  end if;

  select coalesce(max(c), 0) into v_top from (select count(*) c from dub_votes where dub_id = p_dub and category = 'hain' group by target_user) x;
  v_caught := v_top > 0 and (select count(*) from dub_votes where dub_id = p_dub and category = 'hain' and target_user = s.impostor) = v_top;
  update dub_secrets set revealed = true, caught = v_caught where dub_id = p_dub;
  if v_caught then
    for r in select voter from dub_votes where dub_id = p_dub and category = 'hain' and target_user = s.impostor loop
      perform _add_xp(r.voter, 15, 'dedektif', p_dub);
    end loop;
  else
    perform _add_xp(s.impostor, 40, 'hain', p_dub);
  end if;
  return jsonb_build_object('impostor', s.impostor, 'task', s.task, 'caught', v_caught);
end $$;

-- Sonuçları Discord'a gönder (oda sahibi)
create or replace function public.post_results(p_dub uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_dub   dubs%rowtype;
  v_site  text := rtrim(coalesce((select value from app_settings where key = 'site_url'), ''), '/');
  v_lines text := '';
  v_mvp   text;
  v_funny text;
  v_card  text;
  s       dub_secrets%rowtype;
begin
  select * into v_dub from dubs where id = p_dub;
  if not found or v_dub.created_by is distinct from auth.uid() then raise exception 'Sadece oda sahibi'; end if;
  select string_agg(p.display_name || ' (' || x.c || ')', ', ') into v_mvp from (
    select target_user, count(*) c, rank() over (order by count(*) desc) rk from dub_votes
     where dub_id = p_dub and category = 'mvp' group by target_user) x join profiles p on p.id = x.target_user where x.rk = 1;
  select string_agg(coalesce('“' || coalesce(t.text, l.text) || '” — ', '') || p.display_name || ' (' || x.c || ')', E'\n') into v_funny from (
    select target_line, count(*) c, rank() over (order by count(*) desc) rk from dub_votes
     where dub_id = p_dub and category = 'komik' group by target_line) x
    join scene_lines l on l.id = x.target_line
    left join dub_line_texts t on t.dub_id = p_dub and t.line_id = x.target_line
    join dub_recordings dr on dr.dub_id = p_dub and dr.line_id = x.target_line
    join profiles p on p.id = dr.user_id
   where x.rk = 1;
  select string_agg(p.display_name || ' (' || x.c || ')', ', ') into v_card from (
    select target_line, count(*) c, rank() over (order by count(*) desc) rk from dub_votes
     where dub_id = p_dub and category = 'kart' group by target_line) x
    join dub_recordings dr on dr.dub_id = p_dub and dr.line_id = x.target_line
    join profiles p on p.id = dr.user_id where x.rk = 1;
  if v_mvp is not null then v_lines := v_lines || '🎙️ **Turun seslendirmeni:** ' || v_mvp || E'\n'; end if;
  if v_funny is not null then v_lines := v_lines || '😂 **En komik replik:** ' || v_funny || E'\n'; end if;
  if v_card is not null then v_lines := v_lines || '🃏 **Kartı en iyi oynayan:** ' || v_card || E'\n'; end if;
  select * into s from dub_secrets where dub_id = p_dub and revealed;
  if found then
    v_lines := v_lines || '🕵️ **Hain:** ' || (select display_name from profiles where id = s.impostor)
            || case when s.caught then ' yakalandı!' else ' kimseye yakalanmadı!' end
            || E'\n_Görevi: ' || s.task || '_' || E'\n';
  end if;
  if v_lines = '' then v_lines := 'Henüz oy verilmedi.'; end if;
  return _discord_post(jsonb_build_object('username', 'fam-io', 'embeds', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'title', '🗳️ Sonuçlar: ' || (select title from scenes where id = v_dub.scene_id),
    'url', case when v_site <> '' then v_site || '/d/' || p_dub end,
    'description', v_lines,
    'color', 16742938)))));
end $$;


-- ------------------------------------------------------------
-- Oyuncu çıkarma: zincir sırasından ve foley rolünden de düşür
-- ------------------------------------------------------------
create or replace function public.kick_player(p_room uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi oyuncu çıkarabilir'; end if;
  if p_user = auth.uid() then raise exception 'Kendini çıkaramazsın'; end if;
  if v_room.status = 'finale' then raise exception 'Finalde oyuncu çıkarılamaz'; end if;
  if not exists (select 1 from room_players where room_id = p_room and user_id = p_user) then return; end if;

  if v_room.status in ('recording', 'writing') and v_room.mode in ('klasik', 'senarist') then
    delete from recordings where room_id = p_room and user_id = p_user;
    update room_roles set user_id = v_room.host_id, picked = false where room_id = p_room and user_id = p_user;
    update room_line_texts set author = v_room.host_id where room_id = p_room and author = p_user;
    update room_players set done = false where room_id = p_room and user_id = v_room.host_id;
    delete from room_secrets where room_id = p_room and user_id = p_user;
  else
    delete from room_roles where room_id = p_room and user_id = p_user;
  end if;
  if v_room.mode = 'zincir' and v_room.mode_state ? 'order' then
    delete from recordings where room_id = p_room and user_id = p_user;
    update rooms set mode_state = jsonb_set(mode_state, '{order}',
      coalesce((select jsonb_agg(x) from jsonb_array_elements_text(mode_state->'order') x where x <> p_user::text), '[]'::jsonb))
     where id = p_room;
  end if;
  if v_room.foley_user = p_user then
    delete from room_foley where room_id = p_room;
    update rooms set foley_user = null where id = p_room;
  end if;
  delete from room_players where room_id = p_room and user_id = p_user;
  update rooms set banned = array_append(array_remove(banned, p_user), p_user) where id = p_room;
end $$;

-- Kullanılmayan dosyalar: yeni tablolardaki yollar da korunur
create or replace function public.storage_orphans(p_min_age_hours int default 24)
returns table (bucket text, name text, bytes bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return query
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
    from storage.objects o
   where o.created_at < now() - make_interval(hours => greatest(p_min_age_hours, 1))
     and (
       (o.bucket_id = 'recordings'
         and not exists (select 1 from recordings rc where rc.audio_path = o.name)
         and not exists (select 1 from dub_recordings dr where dr.audio_path = o.name)
         and not exists (select 1 from room_foley f where f.audio_path = o.name)
         and not exists (select 1 from dub_foley f where f.audio_path = o.name)
         and not exists (select 1 from duel_takes d where d.audio_path = o.name))
       or (o.bucket_id = 'scenes'
         and not exists (select 1 from scenes s where o.name in (s.video_path, s.bg_audio_path, s.thumb_path)))
       or (o.bucket_id = 'avatars'
         and not exists (select 1 from profiles p where o.name in (p.avatar_path, p.banner_path, p.voice_path))
         and not exists (select 1 from teams t where t.logo_path = o.name))
     )
   order by 3 desc
   limit 1000;
end $$;

-- ============================================================
-- B) XP MAĞAZASI
--   Bakiye = toplam XP − harcanan. Harcamak level'i düşürmez.
-- ============================================================
alter table public.profiles add column if not exists spent    int   not null default 0;
alter table public.profiles add column if not exists equipped jsonb not null default '{}';

create table if not exists public.shop_items (
  id    text primary key,
  kind  text not null check (kind in ('frame', 'name', 'plaque', 'sound', 'banner')),
  name  text not null,
  price int  not null check (price >= 0),
  sort  int  not null default 0
);
alter table public.shop_items enable row level security;
drop policy if exists shop_items_select on public.shop_items;
create policy shop_items_select on public.shop_items for select to anon, authenticated using (true);
grant select on public.shop_items to anon, authenticated;

insert into public.shop_items (id, kind, name, price, sort) values
  ('frame_altin',      'frame',  'Altın çerçeve',        300,  1),
  ('frame_neon',       'frame',  'Neon çerçeve',         500,  2),
  ('frame_ates',       'frame',  'Ateş çerçeve',         800,  3),
  ('frame_buz',        'frame',  'Buz çerçeve',          800,  4),
  ('frame_gokkusagi',  'frame',  'Gökkuşağı çerçeve',   1500,  5),
  ('frame_holo',       'frame',  'Hologram çerçeve',    2500,  6),
  ('name_altin',       'name',   'Altın isim',           600, 10),
  ('name_parilti',     'name',   'Parıltılı isim',       400, 11),
  ('name_ates',        'name',   'Ateşli isim',          900, 12),
  ('name_gokkusagi',   'name',   'Gökkuşağı isim',      1200, 13),
  ('plaque_ses',       'plaque', 'Plaket: Ses Sanatçısı',  1000, 20),
  ('plaque_kahkaha',   'plaque', 'Plaket: Kahkaha Ustası', 1500, 21),
  ('plaque_efsane',    'plaque', 'Plaket: Dublaj Efsanesi',3000, 22),
  ('sound_zil',        'sound',  'Giriş sesi: Kapı zili',  200, 30),
  ('sound_tada',       'sound',  'Giriş sesi: Ta-da',      200, 31),
  ('sound_davul',      'sound',  'Giriş sesi: Davul',      300, 32),
  ('sound_lazer',      'sound',  'Giriş sesi: Lazer',      300, 33),
  ('sound_fanfar',     'sound',  'Giriş sesi: Fanfar',     800, 34),
  ('banner_gece',      'banner', 'Kapak: Gece',              0, 40),
  ('banner_gunbatimi', 'banner', 'Kapak: Gün batımı',        0, 41),
  ('banner_okyanus',   'banner', 'Kapak: Okyanus',         400, 42),
  ('banner_neon',      'banner', 'Kapak: Neon şehir',      700, 43),
  ('banner_film',      'banner', 'Kapak: Film şeridi',     900, 44),
  ('banner_aurora',    'banner', 'Kapak: Aurora',         1500, 45)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, sort = excluded.sort;

create table if not exists public.user_items (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  item_id   text not null references public.shop_items(id) on delete cascade,
  bought_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.user_items enable row level security;
drop policy if exists user_items_select on public.user_items;
create policy user_items_select on public.user_items for select to anon, authenticated using (true);
grant select on public.user_items to anon, authenticated;

create or replace function public.buy_item(p_item text) returns int
language plpgsql security definer set search_path = public as $$
declare
  it shop_items%rowtype;
  p  profiles%rowtype;
begin
  select * into it from shop_items where id = p_item;
  if not found then raise exception 'Ürün bulunamadı'; end if;
  select * into p from profiles where id = auth.uid() for update;
  if not found then raise exception 'Önce profil oluştur'; end if;
  if exists (select 1 from user_items where user_id = p.id and item_id = p_item) then raise exception 'Bu zaten sende var'; end if;
  if p.xp - p.spent < it.price then raise exception 'Bakiyen yetmiyor (% XP gerekli)', it.price; end if;
  insert into user_items (user_id, item_id) values (p.id, p_item);
  update profiles set spent = spent + it.price where id = p.id;
  return p.xp - p.spent - it.price;
end $$;

create or replace function public.equip_item(p_kind text, p_item text)
returns void language plpgsql security definer set search_path = public as $$
declare
  it shop_items%rowtype;
begin
  if p_kind not in ('frame', 'name', 'plaque', 'sound', 'banner') then raise exception 'Geçersiz tür'; end if;
  if p_item is null then
    update profiles set equipped = equipped - p_kind where id = auth.uid();
    return;
  end if;
  select * into it from shop_items where id = p_item and kind = p_kind;
  if not found then raise exception 'Ürün bulunamadı'; end if;
  if it.price > 0 and not exists (select 1 from user_items where user_id = auth.uid() and item_id = p_item) then
    raise exception 'Önce satın almalısın';
  end if;
  update profiles set equipped = equipped || jsonb_build_object(p_kind, p_item) where id = auth.uid();
end $$;

-- ============================================================
-- C) PROFİL: kapak görseli, imza sesi, profil yorumları
-- ============================================================
alter table public.profiles add column if not exists banner_path text;
alter table public.profiles add column if not exists voice_path  text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_banner_path_check') then
    alter table public.profiles add constraint profiles_banner_path_check
      check (banner_path is null or split_part(banner_path, '/', 1) = id::text);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_voice_path_check') then
    alter table public.profiles add constraint profiles_voice_path_check
      check (voice_path is null or split_part(voice_path, '/', 1) = id::text);
  end if;
end $$;
grant update (display_name, bio, color, avatar_path, banner_path, voice_path) on public.profiles to authenticated;

create table if not exists public.profile_comments (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  author     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists profile_comments_idx on public.profile_comments(profile_id, created_at desc);
alter table public.profile_comments enable row level security;
drop policy if exists profile_comments_select on public.profile_comments;
create policy profile_comments_select on public.profile_comments for select to anon, authenticated using (true);
drop policy if exists profile_comments_insert on public.profile_comments;
create policy profile_comments_insert on public.profile_comments for insert to authenticated with check (author = auth.uid());
drop policy if exists profile_comments_delete on public.profile_comments;
create policy profile_comments_delete on public.profile_comments for delete to authenticated
  using (author = auth.uid() or profile_id = auth.uid() or public.is_admin());
grant select on public.profile_comments to anon, authenticated;
grant insert, delete on public.profile_comments to authenticated;

-- ============================================================
-- D) EKİPLER
-- ============================================================
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,32}$'),
  name        text not null check (char_length(trim(name)) between 2 and 30),
  tag         text not null check (tag ~ '^[A-Z0-9ÇĞİÖŞÜ]{2,4}$'),
  color       text not null default '#ff7a1a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description text check (char_length(description) <= 160),
  logo_path   text,
  owner       uuid not null references public.profiles(id) on delete cascade,
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null unique references public.profiles(id) on delete cascade,
  role      text not null default 'uye' check (role in ('kaptan', 'uye')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to anon, authenticated using (true);
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select to anon, authenticated using (true);
-- Davet kodu sadece kaptana görünsün (eski projelerde tablo düzeyindeki varsayılan yetki önce kaldırılır)
revoke all on public.teams from anon, authenticated;
grant select (id, slug, name, tag, color, description, logo_path, owner, created_at) on public.teams to anon, authenticated;
grant select on public.team_members to anon, authenticated;

create or replace function public._slugify(p text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(
    translate(lower(p), 'çğıöşüâîû', 'cgiosuaiu'), '[^a-z0-9]+', '-', 'g'));
$$;
create or replace function public._invite_code() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 8);
$$;

create or replace function public.create_team(p_name text, p_tag text, p_color text default '#ff7a1a', p_description text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_slug text := left(_slugify(p_name), 28);
  v_try  text;
  v_id   uuid;
  n      int := 1;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Önce profil oluştur'; end if;
  if exists (select 1 from team_members where user_id = auth.uid()) then raise exception 'Zaten bir ekiptesin; önce ayrıl'; end if;
  if char_length(v_slug) < 2 then v_slug := 'ekip'; end if;
  v_try := v_slug;
  while exists (select 1 from teams where slug = v_try) loop
    n := n + 1;
    v_try := v_slug || '-' || n;
  end loop;
  insert into teams (slug, name, tag, color, description, owner, invite_code)
  values (v_try, trim(p_name), upper(trim(p_tag)), coalesce(p_color, '#ff7a1a'), nullif(trim(p_description), ''), auth.uid(), _invite_code())
  returning id into v_id;
  insert into team_members (team_id, user_id, role) values (v_id, auth.uid(), 'kaptan');
  return v_try;
end $$;

create or replace function public.update_team(p_name text, p_tag text, p_color text, p_description text, p_logo_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_logo_path is not null and split_part(p_logo_path, '/', 1) <> auth.uid()::text then raise exception 'Geçersiz logo yolu'; end if;
  update teams set name = trim(p_name), tag = upper(trim(p_tag)), color = p_color,
                   description = nullif(trim(p_description), ''), logo_path = p_logo_path
   where owner = auth.uid();
  if not found then raise exception 'Sadece ekip kaptanı düzenleyebilir'; end if;
end $$;

create or replace function public.team_invite_code() returns text
language sql stable security definer set search_path = public as $$
  select invite_code from teams where owner = auth.uid();
$$;

create or replace function public.regen_team_invite() returns text
language plpgsql security definer set search_path = public as $$
declare v text := _invite_code();
begin
  update teams set invite_code = v where owner = auth.uid();
  if not found then raise exception 'Sadece ekip kaptanı'; end if;
  return v;
end $$;

create or replace function public.join_team(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  t teams%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Önce profil oluştur'; end if;
  select * into t from teams where invite_code = upper(trim(p_code));
  if not found then raise exception 'Davet kodu geçersiz'; end if;
  if exists (select 1 from team_members where user_id = auth.uid()) then
    if exists (select 1 from team_members where user_id = auth.uid() and team_id = t.id) then return t.slug; end if;
    raise exception 'Zaten bir ekiptesin; önce ayrıl';
  end if;
  if (select count(*) from team_members where team_id = t.id) >= 20 then raise exception 'Ekip dolu (en çok 20 kişi)'; end if;
  insert into team_members (team_id, user_id) values (t.id, auth.uid());
  return t.slug;
end $$;

-- Ekipten ayrıl; kaptan ayrılırsa kaptanlık en eski üyeye geçer, kimse kalmazsa ekip silinir
create or replace function public.leave_team() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_next uuid;
begin
  select team_id into v_team from team_members where user_id = auth.uid();
  if not found then return; end if;
  delete from team_members where user_id = auth.uid();
  if exists (select 1 from teams where id = v_team and owner = auth.uid()) then
    select user_id into v_next from team_members where team_id = v_team order by joined_at limit 1;
    if v_next is null then
      delete from teams where id = v_team;
    else
      update teams set owner = v_next where id = v_team;
      update team_members set role = 'kaptan' where team_id = v_team and user_id = v_next;
    end if;
  end if;
end $$;

create or replace function public.kick_team_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user = auth.uid() then raise exception 'Kendini çıkaramazsın; ekipten ayrıl'; end if;
  delete from team_members m using teams t
   where m.team_id = t.id and t.owner = auth.uid() and m.user_id = p_user;
  if not found then raise exception 'Sadece kaptan üye çıkarabilir'; end if;
end $$;

-- Ekip ligi: üyelerin haftalık (ya da tüm zamanlar) XP toplamı
create or replace function public.team_board(p_period text default 'week')
returns table (team_id uuid, slug text, name text, tag text, color text, logo_path text, members int, xp int, dubs int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := case when p_period = 'week' then _week_start() else '-infinity'::timestamptz end;
begin
  return query
  select t.id, t.slug, t.name, t.tag, t.color, t.logo_path,
         (select count(*)::int from team_members m where m.team_id = t.id),
         case when p_period = 'week'
              then coalesce((select sum(e.amount) from xp_events e join team_members m on m.user_id = e.user_id
                              where m.team_id = t.id and e.created_at >= v_from), 0)::int
              else coalesce((select sum(p.xp) from profiles p join team_members m on m.user_id = p.id where m.team_id = t.id), 0)::int end,
         (select count(distinct dp.dub_id)::int from dub_participants dp join dubs d on d.id = dp.dub_id
            join team_members m on m.user_id = dp.user_id where m.team_id = t.id and d.created_at >= v_from)
    from teams t
   order by 8 desc, 9 desc, t.name;
end $$;

-- Liderlik tablosuna ekip etiketi ve kozmetikler (dönüş tipi değiştiği için önce silinir)
drop function if exists public.leaderboard(text, int);
create function public.leaderboard(p_period text default 'week', p_limit int default 25)
returns table (user_id uuid, username text, display_name text, color text, avatar_path text,
               xp int, dubs int, mvp int, likes int, equipped jsonb, team_tag text, team_color text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz;
  v_to   timestamptz := 'infinity';
begin
  if p_period = 'week' then
    v_from := _week_start();
  elsif p_period = 'lastweek' then
    v_from := _week_start() - interval '7 days';
    v_to   := _week_start();
  else
    v_from := '-infinity';
  end if;

  return query
  select * from (
    select p.id, p.username, p.display_name, p.color, p.avatar_path,
      case when p_period = 'all' then p.xp
           else coalesce((select sum(e.amount) from xp_events e
                           where e.user_id = p.id and e.created_at >= v_from and e.created_at < v_to), 0)::int end as xp,
      (select count(*)::int from dub_participants dp join dubs d on d.id = dp.dub_id
        where dp.user_id = p.id and d.created_at >= v_from and d.created_at < v_to) as dubs,
      (select count(*)::int from dub_votes v
        where v.category = 'mvp' and v.target_user = p.id and v.created_at >= v_from and v.created_at < v_to) as mvp,
      (select count(*)::int from dub_likes l join dub_participants dp on dp.dub_id = l.dub_id and dp.user_id = p.id
        where l.user_id <> p.id and l.created_at >= v_from and l.created_at < v_to) as likes,
      p.equipped,
      t.tag, t.color
    from profiles p
    left join team_members tm on tm.user_id = p.id
    left join teams t on t.id = tm.team_id
  ) x
  where x.xp > 0 or x.dubs > 0
  order by x.xp desc, x.mvp desc, x.dubs desc, x.display_name
  limit least(coalesce(p_limit, 25), 100);
end $$;
grant execute on function public.leaderboard(text, int) to anon, authenticated;

-- ============================================================
-- E) ROZET İSTATİSTİKLERİ: modlar
-- ============================================================
create or replace function public.mode_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'impostor_escapes', (select count(*) from dub_secrets where impostor = p_user and revealed and not caught),
    'detective_hits',   (select count(*) from dub_secrets s join dub_votes v on v.dub_id = s.dub_id and v.category = 'hain'
                          and v.target_user = s.impostor where v.voter = p_user and s.revealed and s.caught),
    'duel_titles',      (select count(*) from duel_results where champion = p_user),
    'card_wins',        (select count(*) from dub_participants pt where pt.user_id = p_user and exists (
                           select 1 from dub_votes v join dub_recordings r on r.dub_id = v.dub_id and r.line_id = v.target_line
                            where v.dub_id = pt.dub_id and v.category = 'kart' and r.user_id = p_user
                            group by v.target_line
                           having count(*) >= all (select count(*) from dub_votes v2 where v2.dub_id = pt.dub_id and v2.category = 'kart' group by v2.target_line))),
    'chains',           (select count(*) from dubs d join dub_participants dp on dp.dub_id = d.id where d.mode = 'zincir' and dp.user_id = p_user),
    'scripts',          (select count(distinct dub_id) from dub_line_texts where author = p_user),
    'foleys',           (select count(*) from dub_foley where user_id = p_user),
    'items',            (select count(*) from user_items where user_id = p_user),
    'team',             exists (select 1 from team_members where user_id = p_user)
  );
$$;

-- ============================================================
-- F) DISCORD KOMUTLARI (/dublaj, /baglan, /liderlik, /profil)
--    Vercel'deki /api/discord rotası SUPABASE_SERVICE_ROLE_KEY ile bu fonksiyonları çağırır.
-- ============================================================
create table if not exists public.discord_links (
  discord_id text primary key,
  user_id    uuid not null unique references public.profiles(id) on delete cascade,
  linked_at  timestamptz not null default now()
);
create table if not exists public.discord_link_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.discord_links      enable row level security;
alter table public.discord_link_codes enable row level security;
drop policy if exists discord_links_select on public.discord_links;
create policy discord_links_select on public.discord_links for select to authenticated using (user_id = auth.uid());
grant select on public.discord_links to authenticated;
revoke all on public.discord_link_codes from anon, authenticated;

-- Profilden bağlantı kodu al (10 dk geçerli)
create or replace function public.discord_link_code() returns text
language plpgsql security definer set search_path = public as $$
declare v text := substr(_invite_code(), 1, 6);
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Önce profil oluştur'; end if;
  delete from discord_link_codes where user_id = auth.uid() or expires_at < now();
  insert into discord_link_codes (code, user_id, expires_at) values (v, auth.uid(), now() + interval '10 minutes');
  return v;
end $$;

create or replace function public.discord_unlink() returns void
language sql security definer set search_path = public as $$
  delete from discord_links where user_id = auth.uid();
$$;

-- Sadece sunucu (service_role) çağırır
create or replace function public.discord_link(p_code text, p_discord_id text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c discord_link_codes%rowtype;
begin
  select * into c from discord_link_codes where code = upper(trim(p_code)) and expires_at > now();
  if not found then raise exception 'Kod geçersiz ya da süresi dolmuş'; end if;
  delete from discord_links where discord_id = p_discord_id or user_id = c.user_id;
  insert into discord_links (discord_id, user_id) values (p_discord_id, c.user_id);
  delete from discord_link_codes where code = c.code;
  return (select display_name from profiles where id = c.user_id);
end $$;

create or replace function public.discord_create_room(p_discord_id text, p_scene uuid, p_mode text default 'klasik')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_scene scenes%rowtype;
  v_code  text;
  v_room  uuid;
begin
  select user_id into v_user from discord_links where discord_id = p_discord_id;
  if not found then raise exception 'BAGLI_DEGIL'; end if;
  if p_scene is null then
    select s.* into v_scene from scenes s
     where exists (select 1 from scene_lines l where l.scene_id = s.id)
     order by s.dub_count desc, random() limit 1;
  else
    select * into v_scene from scenes where id = p_scene;
  end if;
  if v_scene.id is null then raise exception 'Sahne bulunamadı'; end if;
  if not exists (select 1 from scene_lines where scene_id = v_scene.id) then raise exception 'Sahnede replik yok'; end if;
  v_code := _new_room_code();
  insert into rooms (code, scene_id, host_id, mode)
  values (v_code, v_scene.id, v_user, case when p_mode in ('klasik', 'zincir', 'senarist', 'duello') then p_mode else 'klasik' end)
  returning id into v_room;
  insert into room_players (room_id, user_id, nickname) select v_room, v_user, display_name from profiles where id = v_user;
  return jsonb_build_object('code', v_code, 'title', v_scene.title, 'host', (select display_name from profiles where id = v_user),
                            'thumb_path', v_scene.thumb_path);
end $$;

-- ============================================================
-- YETKİLER
-- ============================================================
revoke execute on function public._can_hear(uuid, uuid)              from public, anon;
grant  execute on function public._can_hear(uuid, uuid)              to authenticated;
revoke execute on function public._duel_make_round(uuid, int, uuid[]) from public, anon, authenticated;
revoke execute on function public._duel_activate_next(uuid)          from public, anon, authenticated;
revoke execute on function public._finalize_dub(uuid)                from public, anon, authenticated;
revoke execute on function public._slugify(text)                     from public, anon, authenticated;
revoke execute on function public._invite_code()                     from public, anon, authenticated;
revoke execute on function public.discord_link(text, text)           from public, anon, authenticated;
revoke execute on function public.discord_create_room(text, uuid, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.discord_link(text, text) to service_role';
    execute 'grant execute on function public.discord_create_room(text, uuid, text) to service_role';
  end if;
end $$;
grant execute on function public.set_room_mode(uuid, text, text[])                to authenticated;
grant execute on function public.claim_foley(uuid, boolean)                       to authenticated;
grant execute on function public.start_game(uuid)                                 to authenticated;
grant execute on function public.write_line(uuid, uuid, text)                     to authenticated;
grant execute on function public.finish_writing(uuid)                             to authenticated;
grant execute on function public.save_recording(uuid, uuid, text, double precision) to authenticated;
grant execute on function public.save_foley(uuid, text, double precision)         to authenticated;
grant execute on function public.duel_save(uuid, text, double precision)          to authenticated;
grant execute on function public.duel_vote(uuid, uuid)                            to authenticated;
grant execute on function public.duel_close(uuid)                                 to authenticated;
grant execute on function public.duel_forfeit(uuid, uuid)                         to authenticated;
grant execute on function public.reset_room(uuid)                                 to authenticated;
grant execute on function public.cast_vote(uuid, text, uuid)                      to authenticated;
grant execute on function public.reveal_impostor(uuid)                            to authenticated;
grant execute on function public.post_results(uuid)                               to authenticated;
grant execute on function public.buy_item(text)                                   to authenticated;
grant execute on function public.equip_item(text, text)                           to authenticated;
grant execute on function public.create_team(text, text, text, text)              to authenticated;
grant execute on function public.update_team(text, text, text, text, text)        to authenticated;
grant execute on function public.team_invite_code()                               to authenticated;
grant execute on function public.regen_team_invite()                              to authenticated;
grant execute on function public.join_team(text)                                  to authenticated;
grant execute on function public.leave_team()                                     to authenticated;
grant execute on function public.kick_team_member(uuid)                           to authenticated;
grant execute on function public.team_board(text)                                 to anon, authenticated;
grant execute on function public.mode_stats(uuid)                                 to anon, authenticated;
grant execute on function public.discord_link_code()                              to authenticated;
grant execute on function public.discord_unlink()                                 to authenticated;
revoke execute on function public.set_room_mode(uuid, text, text[]), public.claim_foley(uuid, boolean),
  public.write_line(uuid, uuid, text), public.finish_writing(uuid), public.save_foley(uuid, text, double precision),
  public.duel_save(uuid, text, double precision), public.duel_vote(uuid, uuid), public.duel_close(uuid),
  public.duel_forfeit(uuid, uuid), public.reveal_impostor(uuid), public.post_results(uuid), public.buy_item(text),
  public.equip_item(text, text), public.create_team(text, text, text, text), public.update_team(text, text, text, text, text),
  public.team_invite_code(), public.regen_team_invite(), public.join_team(text), public.leave_team(),
  public.kick_team_member(uuid), public.discord_link_code(), public.discord_unlink()
  from public, anon;

-- Canlı güncellemeler
do $$
declare t text;
begin
  foreach t in array array['duel_matches', 'duel_takes', 'duel_votes', 'room_line_texts', 'room_foley', 'profile_comments', 'dub_secrets'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ============================================================
-- 0.7.0 — OYUN KUR (sahne seçmeden oda) + KULAKTAN KULAĞA (sahnesiz cümle zinciri)
-- (migrations/007 ile aynı)
--
-- Kulaktan kulağa (mode = 'kulak'):
--   N oyuncu, N zincir aynı anda ilerler. Her turda herkes farklı bir zincirde oynar:
--   tur 0: kendine düşen cümleyi sesli okur · ara turlar: sadece öncekinin sesini dinleyip tekrarlar
--   son tur: duyduğunu yazar. Final: her zincirin başı ve sonu karşılaştırılır.
--   Zincir c'nin t. adımı order[(c + t) mod N] oyuncusundadır.
-- ============================================================

-- 1) Odalar sahnesiz de olabilir
alter table public.rooms alter column scene_id drop not null;
alter table public.rooms drop constraint if exists rooms_mode_check;
alter table public.rooms add constraint rooms_mode_check check (mode in ('klasik', 'zincir', 'senarist', 'duello', 'kulak'));

-- 2) Oyun sırasındaki adımlar (gizli: sadece phone_task ile, kişiye düşen kısım verilir)
create table if not exists public.phone_steps (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  chain      int  not null,
  step       int  not null,
  user_id    uuid not null,
  audio_path text,
  text       text check (char_length(text) <= 160),
  done       boolean not null default false,
  skipped    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (room_id, chain, step)
);
alter table public.phone_steps enable row level security;
revoke all on public.phone_steps from anon, authenticated;

-- 3) Biten oyunların arşivi (paylaşılabilir: /k/<id>)
create table if not exists public.phone_games (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid references public.rooms(id) on delete set null,
  host_id    uuid,
  players    int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists phone_games_created_idx on public.phone_games(created_at desc);
create table if not exists public.phone_game_steps (
  game_id    uuid not null references public.phone_games(id) on delete cascade,
  chain      int  not null,
  step       int  not null,
  user_id    uuid references public.profiles(id) on delete set null,
  audio_path text,
  text       text,
  skipped    boolean not null default false,
  primary key (game_id, chain, step)
);
create index if not exists phone_game_steps_user_idx on public.phone_game_steps(user_id);
alter table public.phone_games      enable row level security;
alter table public.phone_game_steps enable row level security;
drop policy if exists phone_games_read on public.phone_games;
create policy phone_games_read on public.phone_games for select using (true);
drop policy if exists phone_game_steps_read on public.phone_game_steps;
create policy phone_game_steps_read on public.phone_game_steps for select using (true);
revoke all on public.phone_games, public.phone_game_steps from anon, authenticated;
grant select on public.phone_games, public.phone_game_steps to anon, authenticated;

-- 4) Başlangıç cümleleri
create or replace function public._phone_sentences() returns text[] language sql immutable as $$
  select array[
    'Halamın kedisi pazartesileri sadece turşu yiyor.',
    'Komşunun papağanı bütün gece tango çalıştı.',
    'Uzaylılar bizim apartmana kapıcı olarak girdi.',
    'Dedem buzdolabına dolmuş durağı muamelesi yapıyor.',
    'Karpuz kabuğundan yelkenli yapıp karşıya geçtik.',
    'Yarın sabah penguenlerle kahvaltı randevum var.',
    'Bakkal amca bana veresiye bir bulut sattı.',
    'Patatesler sendika kurup greve gitmiş.',
    'Teyzemin terliği uçup yan mahalleye kondu.',
    'Kuzenim balkonda gizlice deve besliyormuş.',
    'Bu çorbanın içinde minicik bir dinozor var.',
    'Otobüs şoförü durakta bize şiir okudu.',
    'Kaplumbağam maratonda ikinci oldu, birinci salyangoz.',
    'Sabah sabah tost makinesi benimle tartıştı.',
    'Ayakkabılarım dün gece kendi kendine dans etmiş.',
    'Muhtar mahalleye ücretsiz roket dağıtacakmış.',
    'Annem çamaşır makinesine isim koydu: Hüsnü.',
    'Kedimiz akşamları haber bültenini dikkatle izliyor.',
    'Bir martı simidimi alıp bana el salladı.',
    'Pijamalarımla düğüne gittim, kimse fark etmedi.',
    'Karşı komşu kornasını piyano gibi çalıyor.',
    'Buzdolabının ışığı ben bakmayınca da yanıyor mu?',
    'Lahmacunu ters çevirdim, pizza oldu.',
    'Kardeşim tavuk kostümüyle vergi dairesine gitti.',
    'Çaydanlık ıslık çalarak bana şarkı söylüyor.',
    'Mahallenin köpeği bana borç para verdi.',
    'Kargo kutusunun içinden horoz sesi geliyor.',
    'Patlıcan kızartması yüzünden üç kişi küstü.',
    'Telefonum şarjı bitince bana küsüyor.',
    'Biz bu yaz tatile tencereyle gideceğiz.',
    'Ağaçtaki sincap benim şifremi biliyor.',
    'Sobayı yaktım, odaya bir ördek girdi.',
    'Kahveyi fazla içince kulaklarım ıslık çalıyor.',
    'Bulaşık makinesi gece yarısı türkü söylüyor.',
    'Ispanaklı börek uzaya fırlatılacakmış.',
    'Kuaför saçımı kesmeden önce falıma baktı.',
    'Bisikletim yokuşu görünce ağlamaya başladı.',
    'Yengem pazardan konuşan bir karpuz almış.',
    'Asansörde bir keçiyle mahsur kaldım.',
    'Uykumda buzdolabıyla satranç oynuyormuşum.'
  ]
$$;

-- 5) Rastgele oynanabilir sahne
create or replace function public._random_scene(p_exclude uuid default null) returns uuid
language sql volatile security definer set search_path = public as $$
  select s.id from scenes s
   where exists (select 1 from scene_lines l where l.scene_id = s.id)
     and exists (select 1 from scene_roles r where r.scene_id = s.id)
     and s.id is distinct from p_exclude
   order by random() limit 1
$$;

-- 6) Oyun kur: modu seç, oda hemen açılsın (sahne gerekiyorsa rastgele gelir, lobide değişir)
create or replace function public.create_game(p_mode text default 'klasik')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_scene uuid;
  v_code  text;
  v_room  uuid;
begin
  select display_name into v_name from profiles where id = auth.uid();
  if not found then raise exception 'Önce profil oluştur'; end if;
  if p_mode not in ('klasik', 'zincir', 'senarist', 'duello', 'kulak') then raise exception 'Geçersiz mod'; end if;
  if p_mode <> 'kulak' then
    v_scene := _random_scene();
    if v_scene is null then raise exception 'Henüz oynanabilir sahne yok. Önce bir sahne ekle ya da Kulaktan kulağa oyna.'; end if;
  end if;
  v_code := _new_room_code();
  insert into rooms (code, scene_id, host_id, mode) values (v_code, v_scene, auth.uid(), p_mode) returning id into v_room;
  insert into room_players (room_id, user_id, nickname) values (v_room, auth.uid(), v_name);
  return v_code;
end $$;

-- 7) Mod seçimi: kulak eklenir; sahne gereken moda geçilirse ve sahne yoksa rastgele gelir
create or replace function public.set_room_mode(p_room uuid, p_mode text, p_mods text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_mods  text[] := coalesce(p_mods, '{}');
  v_room  rooms%rowtype;
  v_scene uuid;
begin
  if p_mode not in ('klasik', 'zincir', 'senarist', 'duello', 'kulak') then raise exception 'Geçersiz mod'; end if;
  if not (v_mods <@ array['kart', 'hain', 'foley']::text[]) then raise exception 'Geçersiz ek'; end if;
  if p_mode in ('zincir', 'duello', 'kulak') then v_mods := '{}'; end if;
  select * into v_room from rooms where id = p_room and host_id = auth.uid() and status = 'lobby' for update;
  if not found then raise exception 'Modu sadece oda sahibi lobide değiştirebilir'; end if;
  if p_mode <> 'kulak' and v_room.scene_id is null then
    v_scene := _random_scene();
    if v_scene is null then raise exception 'Bu mod için sahne gerekir ama henüz hiç sahne yok'; end if;
    update rooms set scene_id = v_scene where id = p_room;
  end if;
  update rooms
     set mode = p_mode,
         mods = (select coalesce(array_agg(distinct m order by m), '{}') from unnest(v_mods) m),
         foley_user = case when 'foley' = any (v_mods) then foley_user end
   where id = p_room;
end $$;

-- 8) Kulaktan kulağa: oyuncunun bu turdaki yeri
create or replace function public._phone_slot(p_room uuid, p_user uuid,
  out n int, out r int, out c int, out kind text, out prev text, out prompt text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_order uuid[];
  m       int;
begin
  select * into v_room from rooms where id = p_room;
  v_order := array(select jsonb_array_elements_text(coalesce(v_room.mode_state->'order', '[]')))::uuid[];
  n := coalesce(array_length(v_order, 1), 0);
  r := coalesce((v_room.mode_state->>'round')::int, 0);
  m := array_position(v_order, p_user);
  if m is null or n = 0 or v_room.mode <> 'kulak' or v_room.status <> 'recording' then
    kind := 'watch';
    return;
  end if;
  c := (((m - 1 - r) % n) + n) % n;
  select ps.audio_path into prev from phone_steps ps
   where ps.room_id = p_room and ps.chain = c and ps.step < r and ps.audio_path is not null and not ps.skipped
   order by ps.step desc limit 1;
  if r = n - 1 and r > 0 then
    kind := case when prev is null then 'skip' else 'guess' end;
  elsif prev is null then
    kind := 'start';   -- zincirin başı (ya da önceki herkes atlandıysa yeniden başlar)
    select ps.text into prompt from phone_steps ps where ps.room_id = p_room and ps.chain = c and ps.step = 0;
  else
    kind := 'repeat';
  end if;
end $$;

-- Bu turda bana düşen görev
create or replace function public.phone_task(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s     record;
  v_row phone_steps%rowtype;
  v_mine boolean;
begin
  if not exists (select 1 from room_players where room_id = p_room and user_id = auth.uid()) then
    raise exception 'Bu odada değilsin';
  end if;
  select * into s from _phone_slot(p_room, auth.uid());
  if s.kind <> 'watch' then
    select * into v_row from phone_steps where room_id = p_room and chain = s.c and step = s.r;
  end if;
  v_mine := v_row.user_id = auth.uid() and v_row.done and not v_row.skipped;
  return jsonb_build_object(
    'round',  s.r,
    'rounds', s.n,
    'kind',   s.kind,
    'prompt', case when s.kind = 'start' then coalesce(case when v_mine then v_row.text end, s.prompt) end,
    'audio',  s.prev,
    'done',   coalesce(v_mine, false),
    'my_audio', case when v_mine then v_row.audio_path end,
    'my_text',  case when v_mine and s.kind = 'guess' then v_row.text end
  );
end $$;

-- Başka bir cümle çek
create or replace function public.phone_reroll(p_room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  s   record;
  v_t text;
begin
  select * into s from _phone_slot(p_room, auth.uid());
  if s.kind <> 'start' then raise exception 'Şu an cümle seçme sırası sende değil'; end if;
  select t into v_t from unnest(_phone_sentences()) t
   where t not in (select coalesce(text, '') from phone_steps where room_id = p_room)
   order by random() limit 1;
  v_t := coalesce(v_t, (_phone_sentences())[1 + floor(random() * array_length(_phone_sentences(), 1))::int]);
  update phone_steps set text = v_t where room_id = p_room and chain = s.c and step = 0;
  return v_t;
end $$;

-- Biten oyunu arşivle, XP ver, finale geç
create or replace function public._phone_finish(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_game uuid;
  u      uuid;
begin
  select * into v_room from rooms where id = p_room;
  if exists (select 1 from phone_steps where room_id = p_room and done and not skipped) then
    insert into phone_games (room_id, host_id, players)
    values (p_room, v_room.host_id, jsonb_array_length(coalesce(v_room.mode_state->'order', '[]')))
    returning id into v_game;
    insert into phone_game_steps (game_id, chain, step, user_id, audio_path, text, skipped)
      select v_game, ps.chain, ps.step, (select pr.id from profiles pr where pr.id = ps.user_id), ps.audio_path, ps.text, ps.skipped
        from phone_steps ps where ps.room_id = p_room;
    for u in select distinct user_id from phone_steps where room_id = p_room and done and not skipped loop
      perform _add_xp(u, 10, 'kulaktan_kulaga');
    end loop;
  end if;
  update rooms set status = 'finale', finale_at = now(),
         mode_state = mode_state || jsonb_build_object('game', v_game)
   where id = p_room;
end $$;

-- Tur tamamlandıysa ilerlet (odada olmayanların adımı otomatik atlanır)
create or replace function public._phone_advance(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_order uuid[];
  n       int;
  r       int;
  i       int;
  u       uuid;
begin
  loop
    select * into v_room from rooms where id = p_room for update;
    if not found or v_room.mode <> 'kulak' or v_room.status <> 'recording' then return; end if;
    v_order := array(select jsonb_array_elements_text(coalesce(v_room.mode_state->'order', '[]')))::uuid[];
    n := coalesce(array_length(v_order, 1), 0);
    r := coalesce((v_room.mode_state->>'round')::int, 0);
    if n = 0 then return; end if;
    for i in 0 .. n - 1 loop
      u := v_order[((i + r) % n) + 1];
      if not exists (select 1 from phone_steps where room_id = p_room and chain = i and step = r and done)
         and (not exists (select 1 from room_players where room_id = p_room and user_id = u)
              or (r = n - 1 and r > 0 and not exists (
                    select 1 from phone_steps where room_id = p_room and chain = i and step < r and audio_path is not null and not skipped))) then
        insert into phone_steps (room_id, chain, step, user_id, done, skipped) values (p_room, i, r, u, true, true)
        on conflict (room_id, chain, step) do update set done = true, skipped = true, audio_path = null;
      end if;
    end loop;
    if (select count(*) from phone_steps where room_id = p_room and step = r and done) < n then return; end if;
    if r + 1 >= n then
      perform _phone_finish(p_room);
      return;
    end if;
    update rooms set mode_state = jsonb_set(mode_state, '{round}', to_jsonb(r + 1)) where id = p_room;
    update room_players set done = false where room_id = p_room;
  end loop;
end $$;

-- Kaydı / tahmini gönder
create or replace function public.phone_submit(p_room uuid, p_path text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s      record;
  v_text text := nullif(trim(coalesce(p_text, '')), '');
  v_path text := p_path;
begin
  perform 1 from rooms where id = p_room and mode = 'kulak' and status = 'recording' for update;
  if not found then raise exception 'Oyun şu an kayıt aşamasında değil'; end if;
  select * into s from _phone_slot(p_room, auth.uid());
  if s.kind in ('watch', 'skip') then raise exception 'Bu turda yapacağın bir şey yok'; end if;
  if char_length(v_text) > 120 then raise exception 'En fazla 120 karakter yazabilirsin'; end if;
  if s.kind = 'guess' then
    if v_text is null then raise exception 'Ne duyduğunu yaz'; end if;
    v_path := null;
  else
    if v_path is null or v_path not like p_room::text || '/' || auth.uid()::text || '/%' then raise exception 'Geçersiz dosya yolu'; end if;
    v_text := case when s.kind = 'start' then coalesce(v_text, s.prompt) end;
  end if;
  insert into phone_steps (room_id, chain, step, user_id, audio_path, text, done, skipped)
  values (p_room, s.c, s.r, auth.uid(), v_path, v_text, true, false)
  on conflict (room_id, chain, step) do update
    set user_id = excluded.user_id, audio_path = excluded.audio_path, text = excluded.text,
        done = true, skipped = false, created_at = now();
  update room_players set done = true where room_id = p_room and user_id = auth.uid();
  perform _phone_advance(p_room);
end $$;

-- Oda sahibi: bu turda bekleyenleri atla
create or replace function public.phone_skip(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_order uuid[];
  n       int;
  r       int;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi'; end if;
  if v_room.mode <> 'kulak' or v_room.status <> 'recording' then raise exception 'Oyun sürmüyor'; end if;
  v_order := array(select jsonb_array_elements_text(coalesce(v_room.mode_state->'order', '[]')))::uuid[];
  n := coalesce(array_length(v_order, 1), 0);
  r := coalesce((v_room.mode_state->>'round')::int, 0);
  update phone_steps set done = true, skipped = true, audio_path = null where room_id = p_room and step = r and not done;
  insert into phone_steps (room_id, chain, step, user_id, done, skipped)
    select p_room, i, r, v_order[((i + r) % n) + 1], true, true from generate_series(0, n - 1) i
  on conflict (room_id, chain, step) do nothing;
  perform _phone_advance(p_room);
end $$;

-- Oyun sırasında biri odadan çıkarılırsa tur takılmasın
create or replace function public._phone_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rooms where id = old.room_id and mode = 'kulak' and status = 'recording') then
    perform _phone_advance(old.room_id);
  end if;
  return null;
end $$;
drop trigger if exists phone_on_leave on public.room_players;
create trigger phone_on_leave after delete on public.room_players
  for each row execute function public._phone_on_leave();

-- 9) Oyunu başlat: kulak dalı eklendi (geri kalanı 006 ile aynı)
create or replace function public.start_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room    rooms%rowtype;
  v_role    uuid;
  v_user    uuid;
  v_order   uuid[];
  v_n       int;
  v_line    uuid;
  v_actors  uuid[];
  i         int;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Oda bulunamadı'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi başlatabilir'; end if;
  if v_room.status <> 'lobby' then raise exception 'Oyun zaten başladı'; end if;
  if not exists (select 1 from room_players where room_id = p_room) then raise exception 'Odada oyuncu yok'; end if;
  select count(*) into v_n from room_players where room_id = p_room;

  -- ---------- KULAKTAN KULAĞA (sahnesiz) ----------
  if v_room.mode = 'kulak' then
    if v_n < 2 then raise exception 'Kulaktan kulağa için en az 2 oyuncu gerekir'; end if;
    delete from phone_steps where room_id = p_room;
    update room_players set done = false where room_id = p_room;
    select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;
    with s as (select t, row_number() over (order by random()) as rn from unnest(_phone_sentences()) t)
    insert into phone_steps (room_id, chain, step, user_id, text)
      select p_room, (s.rn - 1)::int, 0, v_order[s.rn], s.t from s where s.rn <= v_n;
    update rooms set status = 'recording', finale_at = null, current_dub_id = null,
           mode_state = jsonb_build_object('order', to_jsonb(v_order), 'round', 0)
     where id = p_room;
    return;
  end if;

  if v_room.scene_id is null then raise exception 'Önce bir sahne seç'; end if;
  if not exists (select 1 from scene_lines where scene_id = v_room.scene_id) then raise exception 'Sahnede replik yok'; end if;

  delete from recordings      where room_id = p_room;
  delete from room_cards      where room_id = p_room;
  delete from room_secrets    where room_id = p_room;
  delete from room_foley      where room_id = p_room;
  delete from room_line_texts where room_id = p_room;
  delete from duel_matches    where room_id = p_room;
  update room_players set done = false where room_id = p_room;

  -- ---------- DÜELLO ----------
  if v_room.mode = 'duello' then
    if v_n < 2 then raise exception 'Düello için en az 2 oyuncu gerekir'; end if;
    select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;
    perform _duel_make_round(p_room, 1, v_order);
    update rooms set status = 'recording', finale_at = null, mode_state = jsonb_build_object('players', to_jsonb(v_order)) where id = p_room;
    perform _duel_activate_next(p_room);
    return;
  end if;

  -- ---------- ZİNCİR ----------
  if v_room.mode = 'zincir' then
    if v_n < 2 then raise exception 'Kulaktan kulağa için en az 2 oyuncu gerekir'; end if;
    select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;
    delete from room_roles where room_id = p_room;
    update rooms set status = 'recording', finale_at = null, mode_state = jsonb_build_object('order', to_jsonb(v_order)) where id = p_room;
    return;
  end if;

  -- ---------- KLASİK / SENARİST: karakter dağıtımı ----------
  delete from room_roles rr
   where rr.room_id = p_room
     and (not exists (select 1 from scene_roles sr where sr.id = rr.role_id and sr.scene_id = v_room.scene_id)
          or not exists (select 1 from room_players p where p.room_id = p_room and p.user_id = rr.user_id));
  if v_room.foley_user is not null and not exists (select 1 from room_players where room_id = p_room and user_id = v_room.foley_user) then
    update rooms set foley_user = null where id = p_room;
    v_room.foley_user := null;
  end if;

  for v_role in
    select sr.id from scene_roles sr
     where sr.scene_id = v_room.scene_id
       and not exists (select 1 from room_roles rr where rr.room_id = p_room and rr.role_id = sr.id)
     order by random()
  loop
    -- Foley yapan kişiye, başka oyuncu varsa karakter verilmez
    select p.user_id into v_user
      from room_players p
     where p.room_id = p_room
     order by (p.user_id = v_room.foley_user and v_n > 1),
              (select count(*) from room_roles rr where rr.room_id = p_room and rr.user_id = p.user_id), random()
     limit 1;
    insert into room_roles (room_id, role_id, user_id, picked) values (p_room, v_role, v_user, false);
  end loop;

  -- Zorluk kartları: her repliğe rastgele bir kart
  if 'kart' = any (v_room.mods) then
    insert into room_cards (room_id, line_id, card)
      select p_room, l.id, (_card_deck())[1 + floor(random() * array_length(_card_deck(), 1))::int]
        from scene_lines l where l.scene_id = v_room.scene_id;
  end if;

  -- Hain: karakteri olan en az 3 kişi varsa biri gizlice seçilir
  if 'hain' = any (v_room.mods) then
    select array_agg(distinct user_id) into v_actors from room_roles where room_id = p_room;
    if coalesce(array_length(v_actors, 1), 0) >= 3 then
      insert into room_secrets (room_id, user_id, task)
      values (p_room, v_actors[1 + floor(random() * array_length(v_actors, 1))::int],
              (_impostor_tasks())[1 + floor(random() * array_length(_impostor_tasks(), 1))::int]);
    end if;
  end if;

  -- Senarist: her repliği, o karakteri seslendirmeyen biri yeniden yazar
  if v_room.mode = 'senarist' then
    for v_line in select l.id from scene_lines l where l.scene_id = v_room.scene_id order by l.start_time loop
      select p.user_id into v_user
        from room_players p
       where p.room_id = p_room
       order by exists (select 1 from room_roles rr join scene_lines sl on sl.role_id = rr.role_id
                         where rr.room_id = p_room and rr.user_id = p.user_id and sl.id = v_line),
                (select count(*) from room_line_texts t where t.room_id = p_room and t.author = p.user_id), random()
       limit 1;
      insert into room_line_texts (room_id, line_id, author) values (p_room, v_line, v_user);
    end loop;
    update rooms set status = 'writing', finale_at = null, mode_state = '{}' where id = p_room;
    return;
  end if;

  update rooms set status = 'recording', finale_at = null, mode_state = '{}' where id = p_room;
end $$;

-- 10) Yeni tur: kulak adımlarını da temizle
create or replace function public.reset_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and host_id = auth.uid()) then
    raise exception 'Sadece oda sahibi';
  end if;
  delete from recordings      where room_id = p_room;           -- dosyalar arşivde kalır
  delete from room_cards      where room_id = p_room;
  delete from room_secrets    where room_id = p_room;
  delete from room_foley      where room_id = p_room;
  delete from room_line_texts where room_id = p_room;
  delete from duel_matches    where room_id = p_room;
  delete from phone_steps     where room_id = p_room;
  delete from room_roles where room_id = p_room and not picked;
  update room_players set done = false where room_id = p_room;
  update rooms set status = 'lobby', finale_at = null, current_dub_id = null, mode_state = '{}' where id = p_room;
end $$;

-- 11) Kullanılmayan dosyalar: kulak kayıtları korunur
create or replace function public.storage_orphans(p_min_age_hours int default 24)
returns table (bucket text, name text, bytes bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return query
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
    from storage.objects o
   where o.created_at < now() - make_interval(hours => greatest(p_min_age_hours, 1))
     and (
       (o.bucket_id = 'recordings'
         and not exists (select 1 from recordings rc where rc.audio_path = o.name)
         and not exists (select 1 from dub_recordings dr where dr.audio_path = o.name)
         and not exists (select 1 from room_foley f where f.audio_path = o.name)
         and not exists (select 1 from dub_foley f where f.audio_path = o.name)
         and not exists (select 1 from duel_takes d where d.audio_path = o.name)
         and not exists (select 1 from phone_steps ps where ps.audio_path = o.name)
         and not exists (select 1 from phone_game_steps pg where pg.audio_path = o.name))
       or (o.bucket_id = 'scenes'
         and not exists (select 1 from scenes s where o.name in (s.video_path, s.bg_audio_path, s.thumb_path)))
       or (o.bucket_id = 'avatars'
         and not exists (select 1 from profiles p where o.name in (p.avatar_path, p.banner_path, p.voice_path))
         and not exists (select 1 from teams t where t.logo_path = o.name))
     )
   order by 3 desc
   limit 1000;
end $$;

-- 12) Mod istatistikleri: kulaktan kulağa oyunları
create or replace function public.mode_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'impostor_escapes', (select count(*) from dub_secrets where impostor = p_user and revealed and not caught),
    'detective_hits',   (select count(*) from dub_secrets s join dub_votes v on v.dub_id = s.dub_id and v.category = 'hain'
                          and v.target_user = s.impostor where v.voter = p_user and s.revealed and s.caught),
    'duel_titles',      (select count(*) from duel_results where champion = p_user),
    'card_wins',        (select count(*) from dub_participants pt where pt.user_id = p_user and exists (
                           select 1 from dub_votes v join dub_recordings r on r.dub_id = v.dub_id and r.line_id = v.target_line
                            where v.dub_id = pt.dub_id and v.category = 'kart' and r.user_id = p_user
                            group by v.target_line
                           having count(*) >= all (select count(*) from dub_votes v2 where v2.dub_id = pt.dub_id and v2.category = 'kart' group by v2.target_line))),
    'chains',           (select count(*) from dubs d join dub_participants dp on dp.dub_id = d.id where d.mode = 'zincir' and dp.user_id = p_user),
    'scripts',          (select count(distinct dub_id) from dub_line_texts where author = p_user),
    'foleys',           (select count(*) from dub_foley where user_id = p_user),
    'items',            (select count(*) from user_items where user_id = p_user),
    'phones',           (select count(distinct game_id) from phone_game_steps where user_id = p_user and not skipped),
    'team',             exists (select 1 from team_members where user_id = p_user)
  );
$$;

-- 13) Discord /dublaj: kulaktan kulağa sahnesiz açılır
create or replace function public.discord_create_room(p_discord_id text, p_scene uuid, p_mode text default 'klasik')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_scene scenes%rowtype;
  v_code  text;
  v_room  uuid;
begin
  select user_id into v_user from discord_links where discord_id = p_discord_id;
  if not found then raise exception 'BAGLI_DEGIL'; end if;
  if p_mode = 'kulak' then
    v_code := _new_room_code();
    insert into rooms (code, scene_id, host_id, mode) values (v_code, null, v_user, 'kulak') returning id into v_room;
    insert into room_players (room_id, user_id, nickname) select v_room, v_user, display_name from profiles where id = v_user;
    return jsonb_build_object('code', v_code, 'title', 'Kulaktan kulağa', 'host', (select display_name from profiles where id = v_user),
                              'thumb_path', null);
  end if;
  if p_scene is null then
    select s.* into v_scene from scenes s
     where exists (select 1 from scene_lines l where l.scene_id = s.id)
     order by s.dub_count desc, random() limit 1;
  else
    select * into v_scene from scenes where id = p_scene;
  end if;
  if v_scene.id is null then raise exception 'Sahne bulunamadı'; end if;
  if not exists (select 1 from scene_lines where scene_id = v_scene.id) then raise exception 'Sahnede replik yok'; end if;
  v_code := _new_room_code();
  insert into rooms (code, scene_id, host_id, mode)
  values (v_code, v_scene.id, v_user, case when p_mode in ('klasik', 'zincir', 'senarist', 'duello') then p_mode else 'klasik' end)
  returning id into v_room;
  insert into room_players (room_id, user_id, nickname) select v_room, v_user, display_name from profiles where id = v_user;
  return jsonb_build_object('code', v_code, 'title', v_scene.title, 'host', (select display_name from profiles where id = v_user),
                            'thumb_path', v_scene.thumb_path);
end $$;

-- ============================================================
-- YETKİLER
-- ============================================================
revoke execute on function public._phone_sentences()                   from public, anon, authenticated;
revoke execute on function public._random_scene(uuid)                  from public, anon, authenticated;
revoke execute on function public._phone_slot(uuid, uuid)              from public, anon, authenticated;
revoke execute on function public._phone_finish(uuid)                  from public, anon, authenticated;
revoke execute on function public._phone_advance(uuid)                 from public, anon, authenticated;
revoke execute on function public._phone_on_leave()                    from public, anon, authenticated;
revoke execute on function public.create_game(text), public.phone_task(uuid), public.phone_reroll(uuid),
  public.phone_submit(uuid, text, text), public.phone_skip(uuid) from public, anon;
grant execute on function public.create_game(text)                    to authenticated;
grant execute on function public.set_room_mode(uuid, text, text[])    to authenticated;
grant execute on function public.start_game(uuid)                     to authenticated;
grant execute on function public.reset_room(uuid)                     to authenticated;
grant execute on function public.phone_task(uuid)                     to authenticated;
grant execute on function public.phone_reroll(uuid)                   to authenticated;
grant execute on function public.phone_submit(uuid, text, text)       to authenticated;
grant execute on function public.phone_skip(uuid)                     to authenticated;
grant execute on function public.mode_stats(uuid)                     to anon, authenticated;
revoke execute on function public.discord_create_room(text, uuid, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.discord_create_room(text, uuid, text) to service_role';
  end if;
end $$;


-- ============================================================
-- 0.8.0 — PARTİ MODLARI, LOBİ EFEKT DÜĞMELERİ, SAHNE İSTEK PANOSU, PROFİL VİTRİNİ
-- (migrations/008 ile aynı)
--
-- Parti modları (sahnesiz):
--   kim    : herkes aynı cümleyi sesini değiştirerek okur; kayıtlar isimsiz çalınır, kimin olduğu tahmin edilir
--   efekt  : ekrandaki efekti (kapı gıcırtısı…) herkes ağzıyla yapar; isimsiz kayıtlar oylanır
--   duygu  : herkes aynı cümleyi kendisine gizlice düşen duyguyla okur; diğerleri duyguyu tahmin eder
--            (bu üçü 3 tur: kayıt → tahmin/oy → açıklama)
--   hikaye : sırayla, sadece bir önceki parçayı duyarak hikâyeye bir cümle eklenir; finalde baştan sona çalınır
-- Kayıtlar 'recordings' bucket'ında p/<rastgele anahtar>/… yoluna yüklenir: dosya yolundan kimin olduğu anlaşılmaz.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Modlar
-- ------------------------------------------------------------
alter table public.rooms drop constraint if exists rooms_mode_check;
alter table public.rooms add constraint rooms_mode_check
  check (mode in ('klasik', 'zincir', 'senarist', 'duello', 'kulak', 'kim', 'efekt', 'duygu', 'hikaye'));

create or replace function public._mode_needs_scene(p_mode text) returns boolean
language sql immutable as $$ select p_mode in ('klasik', 'zincir', 'senarist', 'duello') $$;

-- ------------------------------------------------------------
-- 2) Tablolar (oyun sırasında gizli; party_state ile kişiye düşen kısım verilir)
-- ------------------------------------------------------------
create table if not exists public.party_clips (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  round      int  not null,                       -- parti: tur · hikâye: sıra numarası
  user_id    uuid not null,
  token      uuid not null default gen_random_uuid() unique,   -- yükleme klasörü
  audio_path text,
  secret     text,                                -- duygu ruleti: gizli duygu
  label      int  not null default 0,             -- isimsiz gösterim sırası
  created_at timestamptz not null default now(),
  unique (room_id, round, user_id)
);
create table if not exists public.party_answers (
  room_id uuid not null references public.rooms(id) on delete cascade,
  round   int  not null,
  voter   uuid not null,
  clip_id uuid not null references public.party_clips(id) on delete cascade,
  answer  text not null check (char_length(answer) <= 64),
  primary key (room_id, round, voter, clip_id)
);
alter table public.party_clips   enable row level security;
alter table public.party_answers enable row level security;
revoke all on public.party_clips, public.party_answers from anon, authenticated;

-- Biten oyunların arşivi (paylaşım: /p/<id>)
create table if not exists public.party_games (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('kim', 'efekt', 'duygu', 'hikaye')),
  room_id    uuid references public.rooms(id) on delete set null,
  host_id    uuid,
  players    int  not null default 0,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists party_games_created_idx on public.party_games(created_at desc);
create table if not exists public.party_game_players (
  game_id uuid not null references public.party_games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points  int  not null default 0,
  winner  boolean not null default false,
  primary key (game_id, user_id)
);
create index if not exists party_game_players_user_idx on public.party_game_players(user_id);
alter table public.party_games        enable row level security;
alter table public.party_game_players enable row level security;
drop policy if exists party_games_read on public.party_games;
create policy party_games_read on public.party_games for select using (true);
drop policy if exists party_game_players_read on public.party_game_players;
create policy party_game_players_read on public.party_game_players for select using (true);
revoke all on public.party_games, public.party_game_players from anon, authenticated;
grant select on public.party_games, public.party_game_players to anon, authenticated;

-- ------------------------------------------------------------
-- 3) İçerik listeleri
-- ------------------------------------------------------------
create or replace function public._efekt_prompts() returns text[] language sql immutable as $$
  select array[
    'Kapı gıcırtısı', 'Uzay gemisi kalkışı', 'Dinozor kükremesi', 'Yağmur başlıyor', 'Eski modem bağlanıyor',
    'Kola kutusu açılışı', 'At dörtnala koşuyor', 'Tavuk yumurtladı', 'Robot bozuluyor', 'Mağarada su damlası',
    'Dondurma arabası geliyor', 'Hayalet kapıyı çalıyor', 'Motosiklet geçiyor', 'Kuyuya taş düşüyor', 'Fırtınada çadır',
    'Uzaylı telsizi', 'Mısır patlıyor', 'Lazer savaşı', 'Karda ayak sesleri', 'Çaydanlık kaynıyor',
    'Tren istasyona giriyor', 'Kedi kavgası', 'Balon sönüyor', 'Zombi yaklaşıyor', 'Acı biber yiyen biri',
    'Uyuyan dev horluyor', 'Bowling atışı', 'Gıcırdayan tahta merdiven', 'Kurbağa korosu', 'Arı sürüsü'
  ]
$$;

create or replace function public._duygu_list() returns text[] language sql immutable as $$
  select array['mutlu', 'uzgun', 'kizgin', 'korkmus', 'saskin', 'utangac', 'heyecanli', 'sikilmis', 'asik', 'supheli', 'gururlu', 'uykulu']
$$;

create or replace function public._story_openers() returns text[] language sql immutable as $$
  select array[
    'Bir sabah uyandım ve kedim konuşmaya başlamıştı…',
    'Market sırasında önümdeki adam aslında bir uzaylıydı…',
    'Dedemin bodrumunda kilitli bir kapı bulduk…',
    'Otobüs şoförü bir anda rotayı değiştirip denize sürdü…',
    'Okulun kantininde gizli bir geçit vardı…',
    'Telefonuma bilinmeyen bir numaradan tek kelime geldi: "Koş."',
    'Mahallenin bakkalı bir sabah süper kahraman kıyafetiyle geldi…',
    'Buzdolabını açtım, içinde küçük bir şehir vardı…',
    'Düğünün tam ortasında gelin mikrofonu aldı ve…',
    'Asansör 13. kata çıktı; oysa binada 12 kat vardı…',
    'Annemin tencere setinden biri kayboldu ve iz sürmeye başladık…',
    'Tatilde kiraladığımız ev, geceleri şarkı söylüyordu…',
    'Bir güvercin pencereme bir mektup bıraktı…',
    'Sınavdan bir gün önce zaman durdu…',
    'Kuzenim piyangoyu kazandı ama bileti bir keçi yedi…',
    'Ormanda kamp yaparken çadırın kapısı kendiliğinden açıldı…',
    'Uzay istasyonunda çay demlemenin yasak olduğunu kimse söylememişti…',
    'Köyün muhtarı herkesi meydana çağırdı: "Büyük bir sorunumuz var."',
    'Eski bir kasetçalarda kendi sesimi duydum…',
    'Sabah kahvesini içerken bardak benimle konuşmaya başladı…'
  ]
$$;

-- ------------------------------------------------------------
-- 4) İsimsiz yükleme: p/<anahtar>/… yalnızca o anahtarın sahibi yükleyebilir
-- ------------------------------------------------------------
create or replace function public._party_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from party_clips c join rooms r on r.id = c.room_id
     where c.token::text = p_token and c.user_id = auth.uid() and r.status = 'recording'
  )
$$;
drop policy if exists recordings_party_insert on storage.objects;
create policy recordings_party_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = 'p'
              and public._party_token_ok((storage.foldername(name))[2]));

-- ------------------------------------------------------------
-- 5) Tur motoru (kim / efekt / duygu)
-- ------------------------------------------------------------
create or replace function public._party_round(p_room uuid, p_round int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room    rooms%rowtype;
  v_players uuid[];
  v_pool    text[];
  v_used    jsonb;
  v_prompt  text;
  v_opts    text[];
  v_k       int;
begin
  select * into v_room from rooms where id = p_room for update;
  v_players := array(select u from unnest(array(select jsonb_array_elements_text(coalesce(v_room.mode_state->'players', '[]')))::uuid[]) u
                      where exists (select 1 from room_players rp where rp.room_id = p_room and rp.user_id = u));
  v_used := coalesce(v_room.mode_state->'used', '[]');
  v_pool := case when v_room.mode = 'efekt' then _efekt_prompts() else _phone_sentences() end;
  select t into v_prompt from unnest(v_pool) t where not (v_used ? t) order by random() limit 1;
  v_prompt := coalesce(v_prompt, v_pool[1 + floor(random() * array_length(v_pool, 1))::int]);

  delete from party_clips where room_id = p_room and round = p_round;
  insert into party_clips (room_id, round, user_id, label)
    select p_room, p_round, u, row_number() over (order by random()) from unnest(v_players) u;

  if v_room.mode = 'duygu' then
    v_k := array_length(_duygu_list(), 1);
    with e as (select t, row_number() over (order by random()) as rn from unnest(_duygu_list()) t),
         c as (select id, row_number() over (order by random()) as rn from party_clips where room_id = p_room and round = p_round)
    update party_clips pc set secret = e.t
      from c join e on e.rn = ((c.rn - 1) % v_k) + 1
     where pc.id = c.id;
    -- seçenekler: atanan duygular + çeldiriciler (en az 6)
    select array_agg(x order by random()) into v_opts from (
      select distinct secret as x from party_clips where room_id = p_room and round = p_round
      union
      select t from (
        select t from unnest(_duygu_list()) t
         where t not in (select secret from party_clips where room_id = p_room and round = p_round)
         order by random()
         limit greatest(0, 6 - (select count(distinct secret) from party_clips where room_id = p_room and round = p_round))::int
      ) d
    ) s;
  end if;

  update room_players set done = false where room_id = p_room;
  update rooms set mode_state = mode_state || jsonb_build_object(
      'round', p_round, 'phase', 'record', 'prompt', v_prompt,
      'options', coalesce(to_jsonb(v_opts), '[]'::jsonb), 'used', v_used || to_jsonb(v_prompt), 'round_points', '{}'::jsonb)
   where id = p_room;
end $$;

-- Hikâye: sıradaki parçaya geç (odada olmayanın sırası atlanır)
create or replace function public._story_advance(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_order uuid[];
  n       int;
  v_turn  int;
  v_turns int;
  u       uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  v_order := array(select jsonb_array_elements_text(coalesce(v_room.mode_state->'order', '[]')))::uuid[];
  n := coalesce(array_length(v_order, 1), 0);
  v_turn := coalesce((v_room.mode_state->>'turn')::int, 0);
  v_turns := coalesce((v_room.mode_state->>'turns')::int, 0);
  loop
    v_turn := v_turn + 1;
    if v_turn > v_turns or n = 0 then
      perform _party_finish(p_room);
      return;
    end if;
    u := v_order[((v_turn - 1) % n) + 1];
    if exists (select 1 from room_players where room_id = p_room and user_id = u) then
      insert into party_clips (room_id, round, user_id, label) values (p_room, v_turn, u, v_turn)
      on conflict (room_id, round, user_id) do nothing;
      update rooms set mode_state = jsonb_set(mode_state, '{turn}', to_jsonb(v_turn)) where id = p_room;
      return;
    end if;
  end loop;
end $$;

-- Açıklama: tur puanları
create or replace function public._party_reveal(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room   rooms%rowtype;
  v_round  int;
  v_pts    jsonb;
  v_scores jsonb;
begin
  select * into v_room from rooms where id = p_room for update;
  v_round := (v_room.mode_state->>'round')::int;
  with a as (
    select pa.voter, pc.user_id as owner, pa.answer, pc.secret
      from party_answers pa join party_clips pc on pc.id = pa.clip_id
     where pa.room_id = p_room and pa.round = v_round
  ), g as (
    select voter as u, 1 as p from a
     where (v_room.mode = 'kim' and answer = owner::text) or (v_room.mode = 'duygu' and answer = secret)
    union all
    select owner, 1 from a
     where (v_room.mode = 'kim' and answer <> owner::text) or v_room.mode = 'efekt' or (v_room.mode = 'duygu' and answer = secret)
  )
  select coalesce(jsonb_object_agg(u::text, s), '{}'::jsonb) into v_pts from (select u, sum(p) as s from g group by u) x;

  v_scores := coalesce(v_room.mode_state->'scores', '{}'::jsonb);
  select coalesce(jsonb_object_agg(k, coalesce((v_scores->>k)::int, 0) + coalesce((v_pts->>k)::int, 0)), '{}'::jsonb)
    into v_scores
    from (select jsonb_object_keys(v_scores) as k union select jsonb_object_keys(v_pts)) ks;

  update rooms set mode_state = mode_state || jsonb_build_object('phase', 'reveal', 'round_points', v_pts, 'scores', v_scores)
   where id = p_room;
  update room_players set done = false where room_id = p_room;
end $$;

-- Arşivle, XP ver, finale geç
create or replace function public._party_finish(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_game  uuid;
  v_data  jsonb;
  v_best  int;
  r       record;
  v_xp    int;
begin
  select * into v_room from rooms where id = p_room for update;

  if exists (select 1 from party_clips where room_id = p_room and audio_path is not null) then
    if v_room.mode = 'hikaye' then
      v_data := jsonb_build_object(
        'topic', v_room.mode_state->'topic',
        'parts', (select jsonb_agg(jsonb_build_object('user', c.user_id, 'audio', c.audio_path, 'turn', c.round) order by c.round)
                    from party_clips c where c.room_id = p_room and c.audio_path is not null));
    else
      v_data := jsonb_build_object(
        'scores', coalesce(v_room.mode_state->'scores', '{}'::jsonb),
        'rounds', (
          select jsonb_agg(jsonb_build_object(
                   'round', rr.round,
                   'prompt', coalesce(v_room.mode_state->'used'->>(rr.round - 1), ''),
                   'clips', (select jsonb_agg(jsonb_build_object(
                                'user', c.user_id, 'audio', c.audio_path, 'secret', c.secret, 'label', c.label,
                                'votes', (select count(*) from party_answers a where a.clip_id = c.id),
                                'guesses', coalesce((select jsonb_agg(jsonb_build_object(
                                              'voter', a.voter, 'answer', a.answer,
                                              'correct', case when v_room.mode = 'kim' then a.answer = c.user_id::text
                                                              when v_room.mode = 'duygu' then a.answer = c.secret end))
                                             from party_answers a where a.clip_id = c.id), '[]'::jsonb))
                              order by c.label)
                               from party_clips c where c.room_id = p_room and c.round = rr.round and c.audio_path is not null))
                 order by rr.round)
            from (select distinct round from party_clips where room_id = p_room and audio_path is not null) rr));
    end if;

    insert into party_games (kind, room_id, host_id, players, data)
    values (v_room.mode, p_room, v_room.host_id,
            coalesce(jsonb_array_length(coalesce(v_room.mode_state->'players', v_room.mode_state->'order')), 0), v_data)
    returning id into v_game;

    -- Katılanlar: kayıt yapan ya da tahmin/oy veren herkes
    insert into party_game_players (game_id, user_id, points)
      select v_game, u, case when v_room.mode = 'hikaye'
                             then (select count(*) from party_clips c where c.room_id = p_room and c.user_id = u and c.audio_path is not null)
                             else coalesce((v_room.mode_state->'scores'->>u::text)::int, 0) end
        from (select user_id as u from party_clips where room_id = p_room and audio_path is not null
              union select voter from party_answers where room_id = p_room) x
       where exists (select 1 from profiles pr where pr.id = x.u);

    if v_room.mode <> 'hikaye' then
      select max(points) into v_best from party_game_players where game_id = v_game;
      if v_best > 0 then update party_game_players set winner = true where game_id = v_game and points = v_best; end if;
    end if;

    for r in select * from party_game_players where game_id = v_game loop
      if v_room.mode = 'hikaye' then
        v_xp := least(30, 5 * r.points);
        perform _add_xp(r.user_id, v_xp, 'sesli_hikaye');
      else
        v_xp := least(60, 5 + 5 * r.points);
        perform _add_xp(r.user_id, v_xp, 'parti_' || v_room.mode);
        if r.winner then perform _add_xp(r.user_id, 15, 'parti_birincisi'); end if;
      end if;
    end loop;
  end if;

  update rooms set status = 'finale', finale_at = now(), mode_state = mode_state || jsonb_build_object('game', v_game)
   where id = p_room;
end $$;

-- İlerleme kontrolü: herkes bitirdiyse sonraki aşama; odadan çıkanlar beklenmez
create or replace function public._party_check(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_round int;
  v_clip  party_clips%rowtype;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.status <> 'recording' or v_room.mode not in ('kim', 'efekt', 'duygu', 'hikaye') then return; end if;

  if v_room.mode = 'hikaye' then
    select * into v_clip from party_clips where room_id = p_room and round = (v_room.mode_state->>'turn')::int;
    if v_clip.id is null or (v_clip.audio_path is null and not exists (select 1 from room_players where room_id = p_room and user_id = v_clip.user_id)) then
      delete from party_clips where id = v_clip.id;
      perform _story_advance(p_room);
    end if;
    return;
  end if;

  v_round := (v_room.mode_state->>'round')::int;
  if v_room.mode_state->>'phase' = 'record' then
    delete from party_clips c
     where c.room_id = p_room and c.round = v_round and c.audio_path is null
       and not exists (select 1 from room_players rp where rp.room_id = p_room and rp.user_id = c.user_id);
    if not exists (select 1 from party_clips where room_id = p_room and round = v_round and audio_path is null) then
      if (select count(*) from party_clips where room_id = p_room and round = v_round) >= 2 then
        update rooms set mode_state = jsonb_set(mode_state, '{phase}', '"answer"') where id = p_room;
        update room_players set done = false where room_id = p_room;
      else
        perform _party_reveal(p_room);
      end if;
    end if;
  elsif v_room.mode_state->>'phase' = 'answer' then
    if not exists (
      select 1 from room_players rp
       where rp.room_id = p_room and not rp.done
         and rp.user_id::text in (select jsonb_array_elements_text(v_room.mode_state->'players'))
    ) then
      perform _party_reveal(p_room);
    end if;
  end if;
end $$;

-- Başlat (start_game çağırır)
create or replace function public._party_start(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_n     int;
  v_order uuid[];
  v_turns int;
begin
  select * into v_room from rooms where id = p_room for update;
  select count(*) into v_n from room_players where room_id = p_room;
  if v_room.mode in ('kim', 'efekt') and v_n < 3 then raise exception 'Bu mod için en az 3 oyuncu gerekir'; end if;
  if v_n < 2 then raise exception 'Bu mod için en az 2 oyuncu gerekir'; end if;
  delete from party_clips where room_id = p_room;
  update room_players set done = false where room_id = p_room;
  select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;

  if v_room.mode = 'hikaye' then
    v_turns := greatest(v_n, least(v_n * case when v_n = 2 then 3 else 2 end, 16));
    insert into party_clips (room_id, round, user_id, label) values (p_room, 1, v_order[1], 1);
    update rooms set status = 'recording', finale_at = null, current_dub_id = null,
           mode_state = jsonb_build_object('order', to_jsonb(v_order), 'players', to_jsonb(v_order), 'turn', 1, 'turns', v_turns,
                                           'topic', (_story_openers())[1 + floor(random() * array_length(_story_openers(), 1))::int])
     where id = p_room;
    return;
  end if;

  update rooms set status = 'recording', finale_at = null, current_dub_id = null,
         mode_state = jsonb_build_object('players', to_jsonb(v_order), 'rounds', 3, 'scores', '{}'::jsonb, 'used', '[]'::jsonb)
   where id = p_room;
  perform _party_round(p_room, 1);
end $$;

-- Bana düşen durum
create or replace function public.party_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_me    uuid := auth.uid();
  v_clip  party_clips%rowtype;
  v_round int;
  v_phase text;
  v_turn  int;
begin
  select * into v_room from rooms where id = p_room;
  if not found or v_room.mode not in ('kim', 'efekt', 'duygu', 'hikaye') then raise exception 'Bu odada parti oyunu yok'; end if;
  if not exists (select 1 from room_players where room_id = p_room and user_id = v_me) then raise exception 'Bu odada değilsin'; end if;

  if v_room.mode = 'hikaye' then
    v_turn := coalesce((v_room.mode_state->>'turn')::int, 0);
    select * into v_clip from party_clips where room_id = p_room and round = v_turn;
    return jsonb_build_object(
      'kind', 'hikaye', 'turn', v_turn, 'turns', v_room.mode_state->'turns', 'topic', v_room.mode_state->'topic',
      'order', v_room.mode_state->'order', 'current', v_clip.user_id,
      'token', case when v_clip.user_id = v_me then v_clip.token end,
      'prev', case when v_clip.user_id = v_me then
                (select audio_path from party_clips where room_id = p_room and round < v_turn and audio_path is not null order by round desc limit 1) end,
      'parts', (select count(*) from party_clips where room_id = p_room and audio_path is not null),
      'mine', (select count(*) from party_clips where room_id = p_room and audio_path is not null and user_id = v_me));
  end if;

  v_round := coalesce((v_room.mode_state->>'round')::int, 0);
  v_phase := v_room.mode_state->>'phase';
  select * into v_clip from party_clips where room_id = p_room and round = v_round and user_id = v_me;
  return jsonb_build_object(
    'kind', v_room.mode, 'round', v_round, 'rounds', v_room.mode_state->'rounds', 'phase', v_phase,
    'prompt', v_room.mode_state->'prompt', 'options', v_room.mode_state->'options',
    'players', v_room.mode_state->'players', 'scores', v_room.mode_state->'scores',
    'round_points', v_room.mode_state->'round_points',
    'token', case when v_phase = 'record' then v_clip.token end,
    'secret', v_clip.secret,
    'my_audio', v_clip.audio_path,
    'in_round', v_clip.id is not null,
    'clips', case when v_phase in ('answer', 'reveal') then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'label', c.label, 'audio', c.audio_path, 'mine', c.user_id = v_me,
               'owner',  case when v_phase = 'reveal' then c.user_id end,
               'secret', case when v_phase = 'reveal' then c.secret end,
               'votes',  case when v_phase = 'reveal' then (select count(*) from party_answers a where a.clip_id = c.id) end,
               'guesses', case when v_phase = 'reveal' then coalesce((
                   select jsonb_agg(jsonb_build_object('voter', a.voter, 'answer', a.answer)) from party_answers a where a.clip_id = c.id), '[]'::jsonb) end)
             order by c.label)
        from party_clips c where c.room_id = p_room and c.round = v_round and c.audio_path is not null), '[]'::jsonb) end,
    'my_answers', (select coalesce(jsonb_object_agg(a.clip_id::text, a.answer), '{}'::jsonb)
                     from party_answers a where a.room_id = p_room and a.round = v_round and a.voter = v_me));
end $$;

-- Kaydı gönder
create or replace function public.party_submit_clip(p_room uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_clip party_clips%rowtype;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.status <> 'recording' or v_room.mode not in ('kim', 'efekt', 'duygu', 'hikaye') then
    raise exception 'Şu an kayıt aşamasında değiliz';
  end if;
  if v_room.mode = 'hikaye' then
    select * into v_clip from party_clips where room_id = p_room and round = (v_room.mode_state->>'turn')::int;
    if v_clip.user_id is distinct from auth.uid() then raise exception 'Sıra sende değil'; end if;
  else
    if v_room.mode_state->>'phase' <> 'record' then raise exception 'Kayıt süresi bitti'; end if;
    select * into v_clip from party_clips where room_id = p_room and round = (v_room.mode_state->>'round')::int and user_id = auth.uid();
    if not found then raise exception 'Bu turda kaydın yok'; end if;
  end if;
  if p_path is null or p_path not like 'p/' || v_clip.token::text || '/%' then raise exception 'Geçersiz dosya yolu'; end if;

  update party_clips set audio_path = p_path, created_at = now() where id = v_clip.id;
  if v_room.mode = 'hikaye' then
    perform _story_advance(p_room);
  else
    update room_players set done = true where room_id = p_room and user_id = auth.uid();
    perform _party_check(p_room);
  end if;
end $$;

-- Tahmin / oy gönder
--   kim   : {"<klip id>": "<oyuncu id>", …}  (kendi kaydın hariç hepsi)
--   duygu : {"<klip id>": "<duygu>", …}      (kendi kaydın hariç hepsi)
--   efekt : {"vote": "<klip id>"}            (kendi kaydın olamaz)
create or replace function public.party_answer(p_room uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room  rooms%rowtype;
  v_round int;
  v_clip  party_clips%rowtype;
  k       text;
  v       text;
  n       int := 0;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.status <> 'recording' or v_room.mode not in ('kim', 'efekt', 'duygu') or v_room.mode_state->>'phase' <> 'answer' then
    raise exception 'Şu an tahmin aşamasında değiliz';
  end if;
  if not exists (select 1 from room_players where room_id = p_room and user_id = auth.uid()) then raise exception 'Bu odada değilsin'; end if;
  v_round := (v_room.mode_state->>'round')::int;
  delete from party_answers where room_id = p_room and round = v_round and voter = auth.uid();

  for k, v in select key, value from jsonb_each_text(coalesce(p_answers, '{}'::jsonb)) loop
    if v_room.mode = 'efekt' then
      if k <> 'vote' then continue; end if;
      select * into v_clip from party_clips where id = v::uuid and room_id = p_room and round = v_round and audio_path is not null;
      if not found then raise exception 'Kayıt bulunamadı'; end if;
      if v_clip.user_id = auth.uid() then raise exception 'Kendine oy veremezsin'; end if;
      insert into party_answers (room_id, round, voter, clip_id, answer) values (p_room, v_round, auth.uid(), v_clip.id, 'oy');
    else
      select * into v_clip from party_clips where id = k::uuid and room_id = p_room and round = v_round and audio_path is not null;
      if not found then raise exception 'Kayıt bulunamadı'; end if;
      if v_clip.user_id = auth.uid() then continue; end if;
      if v_room.mode = 'kim' and (v = auth.uid()::text or v not in (select jsonb_array_elements_text(v_room.mode_state->'players'))) then
        raise exception 'Geçersiz tahmin';
      end if;
      if v_room.mode = 'duygu' and v not in (select jsonb_array_elements_text(v_room.mode_state->'options')) then
        raise exception 'Geçersiz duygu';
      end if;
      insert into party_answers (room_id, round, voter, clip_id, answer) values (p_room, v_round, auth.uid(), v_clip.id, v);
    end if;
    n := n + 1;
  end loop;

  if v_room.mode = 'efekt' and n <> 1 then raise exception 'Bir kayda oy ver'; end if;
  if v_room.mode <> 'efekt' and n < (select count(*) from party_clips where room_id = p_room and round = v_round and audio_path is not null and user_id <> auth.uid()) then
    raise exception 'Her kayıt için bir tahmin yap';
  end if;
  update room_players set done = true where room_id = p_room and user_id = auth.uid();
  perform _party_check(p_room);
end $$;

-- Oda sahibi: sonraki tur / final
create or replace function public.party_next(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_round int;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi'; end if;
  if v_room.status <> 'recording' or v_room.mode not in ('kim', 'efekt', 'duygu') or v_room.mode_state->>'phase' <> 'reveal' then
    raise exception 'Önce tur sonuçları açıklanmalı';
  end if;
  v_round := (v_room.mode_state->>'round')::int;
  if v_round < coalesce((v_room.mode_state->>'rounds')::int, 3) then
    perform _party_round(p_room, v_round + 1);
  else
    perform _party_finish(p_room);
  end if;
end $$;

-- Oda sahibi: bekleyenleri atla
create or replace function public.party_skip(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_clip party_clips%rowtype;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi'; end if;
  if v_room.status <> 'recording' or v_room.mode not in ('kim', 'efekt', 'duygu', 'hikaye') then raise exception 'Oyun sürmüyor'; end if;
  if v_room.mode = 'hikaye' then
    select * into v_clip from party_clips where room_id = p_room and round = (v_room.mode_state->>'turn')::int;
    if v_clip.audio_path is null then delete from party_clips where id = v_clip.id; end if;
    perform _story_advance(p_room);
  elsif v_room.mode_state->>'phase' = 'record' then
    delete from party_clips where room_id = p_room and round = (v_room.mode_state->>'round')::int and audio_path is null;
    perform _party_check(p_room);
  elsif v_room.mode_state->>'phase' = 'answer' then
    perform _party_reveal(p_room);
  end if;
end $$;

-- Oyun sırasında biri odadan çıkarılırsa beklenmesin
create or replace function public._party_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rooms where id = old.room_id and status = 'recording' and mode in ('kim', 'efekt', 'duygu', 'hikaye')) then
    perform _party_check(old.room_id);
  end if;
  return null;
end $$;
drop trigger if exists party_on_leave on public.room_players;
create trigger party_on_leave after delete on public.room_players
  for each row execute function public._party_on_leave();

-- ------------------------------------------------------------
-- 6) Lobi efekt düğmeleri: ücretsiz 3 ses + mağazadan alınanlar
-- ------------------------------------------------------------
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('frame', 'name', 'plaque', 'sound', 'banner', 'board'));
insert into public.shop_items (id, kind, name, price, sort) values
  ('board_badum',   'board', 'Ba-dum-tss',        0, 50),
  ('board_korna',   'board', 'Korna',             0, 51),
  ('board_alkis',   'board', 'Alkış',             0, 52),
  ('board_kriket',  'board', 'Cırcır böceği',   150, 53),
  ('board_boing',   'board', 'Boing',           150, 54),
  ('board_trombon', 'board', 'Hüzünlü trombon', 250, 55),
  ('board_scratch', 'board', 'Plak cızırtısı',  250, 56),
  ('board_alarm',   'board', 'Alarm',           300, 57),
  ('board_gong',    'board', 'Gong',            300, 58),
  ('board_zafer',   'board', 'Zafer marşı',     400, 59)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, sort = excluded.sort;

-- ------------------------------------------------------------
-- 7) Sahne istek panosu
-- ------------------------------------------------------------
create table if not exists public.scene_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null check (char_length(title) between 3 and 80),
  note         text check (char_length(note) <= 300),
  status       text not null default 'acik' check (status in ('acik', 'eklendi')),
  scene_id     uuid unique references public.scenes(id) on delete set null,
  fulfilled_by uuid references public.profiles(id) on delete set null,
  fulfilled_at timestamptz,
  vote_count   int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists scene_requests_open_idx on public.scene_requests(status, vote_count desc, created_at desc);
create table if not exists public.scene_request_votes (
  request_id uuid not null references public.scene_requests(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (request_id, user_id)
);
alter table public.scene_requests      enable row level security;
alter table public.scene_request_votes enable row level security;
drop policy if exists scene_requests_read on public.scene_requests;
create policy scene_requests_read on public.scene_requests for select using (true);
drop policy if exists scene_request_votes_read on public.scene_request_votes;
create policy scene_request_votes_read on public.scene_request_votes for select using (true);
revoke all on public.scene_requests, public.scene_request_votes from anon, authenticated;
grant select on public.scene_requests, public.scene_request_votes to anon, authenticated;

create or replace function public.create_scene_request(p_title text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Önce profil oluştur'; end if;
  if (select count(*) from scene_requests where user_id = auth.uid() and status = 'acik') >= 5 then
    raise exception 'Aynı anda en fazla 5 açık isteğin olabilir';
  end if;
  insert into scene_requests (user_id, title, note, vote_count)
  values (auth.uid(), trim(p_title), nullif(trim(coalesce(p_note, '')), ''), 1)
  returning id into v_id;
  insert into scene_request_votes (request_id, user_id) values (v_id, auth.uid());
  return v_id;
end $$;

-- Oy ver / geri al; yeni durumu döner
create or replace function public.vote_scene_request(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Önce profil oluştur'; end if;
  perform 1 from scene_requests where id = p_id and status = 'acik' for update;
  if not found then raise exception 'İstek kapalı ya da yok'; end if;
  if exists (select 1 from scene_request_votes where request_id = p_id and user_id = auth.uid()) then
    delete from scene_request_votes where request_id = p_id and user_id = auth.uid();
    update scene_requests set vote_count = greatest(0, vote_count - 1) where id = p_id;
    return false;
  end if;
  insert into scene_request_votes (request_id, user_id) values (p_id, auth.uid());
  update scene_requests set vote_count = vote_count + 1 where id = p_id;
  return true;
end $$;

-- Eklediğin bir sahneyle isteği karşıla: +20 XP + oy başına 2 XP (en çok 20 oy); isteyen +5 XP
create or replace function public.fulfill_scene_request(p_id uuid, p_scene uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  q    scene_requests%rowtype;
  v_xp int := 0;
begin
  select * into q from scene_requests where id = p_id for update;
  if not found or q.status <> 'acik' then raise exception 'İstek kapalı ya da yok'; end if;
  if not exists (select 1 from scenes where id = p_scene and created_by = auth.uid()) then
    raise exception 'Sadece kendi eklediğin bir sahneyle karşılayabilirsin';
  end if;
  if not exists (select 1 from scene_lines where scene_id = p_scene) then raise exception 'Sahnede henüz replik yok'; end if;
  if exists (select 1 from scene_requests where scene_id = p_scene) then raise exception 'Bu sahne başka bir isteği karşılıyor'; end if;
  update scene_requests set status = 'eklendi', scene_id = p_scene, fulfilled_by = auth.uid(), fulfilled_at = now() where id = p_id;
  if q.user_id <> auth.uid() then
    v_xp := 20 + 2 * least(q.vote_count, 20);
    perform _add_xp(auth.uid(), v_xp, 'istek_karsilama');
    perform _add_xp(q.user_id, 5, 'istegin_karsilandi');
  end if;
  return v_xp;
end $$;

create or replace function public.delete_scene_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from scene_requests
   where id = p_id and ((user_id = auth.uid() and status = 'acik') or public.is_admin());
  if not found then raise exception 'Bu isteği silemezsin'; end if;
end $$;

-- ------------------------------------------------------------
-- 8) Profil vitrini: en fazla 3 dublaj / oyun
--    [{"t": "dub" | "kulak" | "parti", "id": "<uuid>"}]
-- ------------------------------------------------------------
alter table public.profiles add column if not exists showcase jsonb not null default '[]';

create or replace function public.set_showcase(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  it    jsonb;
  v_t   text;
  v_id  uuid;
  v_out jsonb := '[]';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Geçersiz liste'; end if;
  for it in select value from jsonb_array_elements(p_items) loop
    v_t := it->>'t';
    v_id := (it->>'id')::uuid;
    if v_out @> jsonb_build_array(jsonb_build_object('t', v_t, 'id', v_id)) then continue; end if;
    if v_t = 'dub' then
      if not exists (select 1 from dub_participants where dub_id = v_id and user_id = auth.uid()) then raise exception 'Bu dublajda yoksun'; end if;
    elsif v_t = 'kulak' then
      if not exists (select 1 from phone_game_steps where game_id = v_id and user_id = auth.uid() and not skipped) then raise exception 'Bu oyunda yoksun'; end if;
    elsif v_t = 'parti' then
      if not exists (select 1 from party_game_players where game_id = v_id and user_id = auth.uid()) then raise exception 'Bu oyunda yoksun'; end if;
    else
      raise exception 'Geçersiz tür';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t', v_t, 'id', v_id));
  end loop;
  if jsonb_array_length(v_out) > 3 then raise exception 'Vitrine en fazla 3 şey sabitlenebilir'; end if;
  update profiles set showcase = v_out where id = auth.uid();
end $$;

-- 9) Oyun kur: yeni modlar
create or replace function public.create_game(p_mode text default 'klasik')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_scene uuid;
  v_code  text;
  v_room  uuid;
begin
  select display_name into v_name from profiles where id = auth.uid();
  if not found then raise exception 'Önce profil oluştur'; end if;
  if p_mode not in ('klasik', 'zincir', 'senarist', 'duello', 'kulak', 'kim', 'efekt', 'duygu', 'hikaye') then raise exception 'Geçersiz mod'; end if;
  if _mode_needs_scene(p_mode) then
    v_scene := _random_scene();
    if v_scene is null then raise exception 'Henüz oynanabilir sahne yok. Önce bir sahne ekle ya da sahnesiz bir mod seç.'; end if;
  end if;
  v_code := _new_room_code();
  insert into rooms (code, scene_id, host_id, mode) values (v_code, v_scene, auth.uid(), p_mode) returning id into v_room;
  insert into room_players (room_id, user_id, nickname) values (v_room, auth.uid(), v_name);
  return v_code;
end $$;

-- 10) Mod seçimi: yeni modlar
create or replace function public.set_room_mode(p_room uuid, p_mode text, p_mods text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_mods  text[] := coalesce(p_mods, '{}');
  v_room  rooms%rowtype;
  v_scene uuid;
begin
  if p_mode not in ('klasik', 'zincir', 'senarist', 'duello', 'kulak', 'kim', 'efekt', 'duygu', 'hikaye') then raise exception 'Geçersiz mod'; end if;
  if not (v_mods <@ array['kart', 'hain', 'foley']::text[]) then raise exception 'Geçersiz ek'; end if;
  if p_mode not in ('klasik', 'senarist') then v_mods := '{}'; end if;
  select * into v_room from rooms where id = p_room and host_id = auth.uid() and status = 'lobby' for update;
  if not found then raise exception 'Modu sadece oda sahibi lobide değiştirebilir'; end if;
  if _mode_needs_scene(p_mode) and v_room.scene_id is null then
    v_scene := _random_scene();
    if v_scene is null then raise exception 'Bu mod için sahne gerekir ama henüz hiç sahne yok'; end if;
    update rooms set scene_id = v_scene where id = p_room;
  end if;
  update rooms
     set mode = p_mode,
         mods = (select coalesce(array_agg(distinct m order by m), '{}') from unnest(v_mods) m),
         foley_user = case when 'foley' = any (v_mods) then foley_user end
   where id = p_room;
end $$;

-- 11) Oyunu başlat: parti dalı eklendi (geri kalanı 007 ile aynı)
create or replace function public.start_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room    rooms%rowtype;
  v_role    uuid;
  v_user    uuid;
  v_order   uuid[];
  v_n       int;
  v_line    uuid;
  v_actors  uuid[];
  i         int;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Oda bulunamadı'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi başlatabilir'; end if;
  if v_room.status <> 'lobby' then raise exception 'Oyun zaten başladı'; end if;
  if not exists (select 1 from room_players where room_id = p_room) then raise exception 'Odada oyuncu yok'; end if;
  select count(*) into v_n from room_players where room_id = p_room;

  -- ---------- PARTİ MODLARI (sahnesiz) ----------
  if v_room.mode in ('kim', 'efekt', 'duygu', 'hikaye') then
    perform _party_start(p_room);
    return;
  end if;

  -- ---------- KULAKTAN KULAĞA (sahnesiz) ----------
  if v_room.mode = 'kulak' then
    if v_n < 2 then raise exception 'Kulaktan kulağa için en az 2 oyuncu gerekir'; end if;
    delete from phone_steps where room_id = p_room;
    update room_players set done = false where room_id = p_room;
    select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;
    with s as (select t, row_number() over (order by random()) as rn from unnest(_phone_sentences()) t)
    insert into phone_steps (room_id, chain, step, user_id, text)
      select p_room, (s.rn - 1)::int, 0, v_order[s.rn], s.t from s where s.rn <= v_n;
    update rooms set status = 'recording', finale_at = null, current_dub_id = null,
           mode_state = jsonb_build_object('order', to_jsonb(v_order), 'round', 0)
     where id = p_room;
    return;
  end if;

  if v_room.scene_id is null then raise exception 'Önce bir sahne seç'; end if;
  if not exists (select 1 from scene_lines where scene_id = v_room.scene_id) then raise exception 'Sahnede replik yok'; end if;

  delete from recordings      where room_id = p_room;
  delete from room_cards      where room_id = p_room;
  delete from room_secrets    where room_id = p_room;
  delete from room_foley      where room_id = p_room;
  delete from room_line_texts where room_id = p_room;
  delete from duel_matches    where room_id = p_room;
  update room_players set done = false where room_id = p_room;

  -- ---------- DÜELLO ----------
  if v_room.mode = 'duello' then
    if v_n < 2 then raise exception 'Düello için en az 2 oyuncu gerekir'; end if;
    select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;
    perform _duel_make_round(p_room, 1, v_order);
    update rooms set status = 'recording', finale_at = null, mode_state = jsonb_build_object('players', to_jsonb(v_order)) where id = p_room;
    perform _duel_activate_next(p_room);
    return;
  end if;

  -- ---------- ZİNCİR ----------
  if v_room.mode = 'zincir' then
    if v_n < 2 then raise exception 'Kulaktan kulağa için en az 2 oyuncu gerekir'; end if;
    select array_agg(user_id order by random()) into v_order from room_players where room_id = p_room;
    delete from room_roles where room_id = p_room;
    update rooms set status = 'recording', finale_at = null, mode_state = jsonb_build_object('order', to_jsonb(v_order)) where id = p_room;
    return;
  end if;

  -- ---------- KLASİK / SENARİST: karakter dağıtımı ----------
  delete from room_roles rr
   where rr.room_id = p_room
     and (not exists (select 1 from scene_roles sr where sr.id = rr.role_id and sr.scene_id = v_room.scene_id)
          or not exists (select 1 from room_players p where p.room_id = p_room and p.user_id = rr.user_id));
  if v_room.foley_user is not null and not exists (select 1 from room_players where room_id = p_room and user_id = v_room.foley_user) then
    update rooms set foley_user = null where id = p_room;
    v_room.foley_user := null;
  end if;

  for v_role in
    select sr.id from scene_roles sr
     where sr.scene_id = v_room.scene_id
       and not exists (select 1 from room_roles rr where rr.room_id = p_room and rr.role_id = sr.id)
     order by random()
  loop
    -- Foley yapan kişiye, başka oyuncu varsa karakter verilmez
    select p.user_id into v_user
      from room_players p
     where p.room_id = p_room
     order by (p.user_id = v_room.foley_user and v_n > 1),
              (select count(*) from room_roles rr where rr.room_id = p_room and rr.user_id = p.user_id), random()
     limit 1;
    insert into room_roles (room_id, role_id, user_id, picked) values (p_room, v_role, v_user, false);
  end loop;

  -- Zorluk kartları: her repliğe rastgele bir kart
  if 'kart' = any (v_room.mods) then
    insert into room_cards (room_id, line_id, card)
      select p_room, l.id, (_card_deck())[1 + floor(random() * array_length(_card_deck(), 1))::int]
        from scene_lines l where l.scene_id = v_room.scene_id;
  end if;

  -- Hain: karakteri olan en az 3 kişi varsa biri gizlice seçilir
  if 'hain' = any (v_room.mods) then
    select array_agg(distinct user_id) into v_actors from room_roles where room_id = p_room;
    if coalesce(array_length(v_actors, 1), 0) >= 3 then
      insert into room_secrets (room_id, user_id, task)
      values (p_room, v_actors[1 + floor(random() * array_length(v_actors, 1))::int],
              (_impostor_tasks())[1 + floor(random() * array_length(_impostor_tasks(), 1))::int]);
    end if;
  end if;

  -- Senarist: her repliği, o karakteri seslendirmeyen biri yeniden yazar
  if v_room.mode = 'senarist' then
    for v_line in select l.id from scene_lines l where l.scene_id = v_room.scene_id order by l.start_time loop
      select p.user_id into v_user
        from room_players p
       where p.room_id = p_room
       order by exists (select 1 from room_roles rr join scene_lines sl on sl.role_id = rr.role_id
                         where rr.room_id = p_room and rr.user_id = p.user_id and sl.id = v_line),
                (select count(*) from room_line_texts t where t.room_id = p_room and t.author = p.user_id), random()
       limit 1;
      insert into room_line_texts (room_id, line_id, author) values (p_room, v_line, v_user);
    end loop;
    update rooms set status = 'writing', finale_at = null, mode_state = '{}' where id = p_room;
    return;
  end if;

  update rooms set status = 'recording', finale_at = null, mode_state = '{}' where id = p_room;
end $$;

-- 12) Yeni tur: parti kayıtlarını da temizle
create or replace function public.reset_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and host_id = auth.uid()) then
    raise exception 'Sadece oda sahibi';
  end if;
  delete from recordings      where room_id = p_room;           -- dosyalar arşivde kalır
  delete from room_cards      where room_id = p_room;
  delete from room_secrets    where room_id = p_room;
  delete from room_foley      where room_id = p_room;
  delete from room_line_texts where room_id = p_room;
  delete from duel_matches    where room_id = p_room;
  delete from phone_steps     where room_id = p_room;
  delete from party_clips     where room_id = p_room;
  delete from room_roles where room_id = p_room and not picked;
  update room_players set done = false where room_id = p_room;
  update rooms set status = 'lobby', finale_at = null, current_dub_id = null, mode_state = '{}' where id = p_room;
end $$;

-- 13) Kullanılmayan dosyalar: parti kayıtları korunur
create or replace function public.storage_orphans(p_min_age_hours int default 24)
returns table (bucket text, name text, bytes bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return query
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
    from storage.objects o
   where o.created_at < now() - make_interval(hours => greatest(p_min_age_hours, 1))
     and (
       (o.bucket_id = 'recordings'
         and not exists (select 1 from recordings rc where rc.audio_path = o.name)
         and not exists (select 1 from dub_recordings dr where dr.audio_path = o.name)
         and not exists (select 1 from room_foley f where f.audio_path = o.name)
         and not exists (select 1 from dub_foley f where f.audio_path = o.name)
         and not exists (select 1 from duel_takes d where d.audio_path = o.name)
         and not exists (select 1 from phone_steps ps where ps.audio_path = o.name)
         and not exists (select 1 from phone_game_steps pg where pg.audio_path = o.name)
         and not exists (select 1 from party_clips pc where pc.audio_path = o.name)
         and not exists (select 1 from party_games g where strpos(g.data::text, o.name) > 0))
       or (o.bucket_id = 'scenes'
         and not exists (select 1 from scenes s where o.name in (s.video_path, s.bg_audio_path, s.thumb_path)))
       or (o.bucket_id = 'avatars'
         and not exists (select 1 from profiles p where o.name in (p.avatar_path, p.banner_path, p.voice_path))
         and not exists (select 1 from teams t where t.logo_path = o.name))
     )
   order by 3 desc
   limit 1000;
end $$;

-- 14) Mod istatistikleri
create or replace function public.mode_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'impostor_escapes', (select count(*) from dub_secrets where impostor = p_user and revealed and not caught),
    'detective_hits',   (select count(*) from dub_secrets s join dub_votes v on v.dub_id = s.dub_id and v.category = 'hain'
                          and v.target_user = s.impostor where v.voter = p_user and s.revealed and s.caught),
    'duel_titles',      (select count(*) from duel_results where champion = p_user),
    'card_wins',        (select count(*) from dub_participants pt where pt.user_id = p_user and exists (
                           select 1 from dub_votes v join dub_recordings r on r.dub_id = v.dub_id and r.line_id = v.target_line
                            where v.dub_id = pt.dub_id and v.category = 'kart' and r.user_id = p_user
                            group by v.target_line
                           having count(*) >= all (select count(*) from dub_votes v2 where v2.dub_id = pt.dub_id and v2.category = 'kart' group by v2.target_line))),
    'chains',           (select count(*) from dubs d join dub_participants dp on dp.dub_id = d.id where d.mode = 'zincir' and dp.user_id = p_user),
    'scripts',          (select count(distinct dub_id) from dub_line_texts where author = p_user),
    'foleys',           (select count(*) from dub_foley where user_id = p_user),
    'items',            (select count(*) from user_items where user_id = p_user),
    'parties',          (select count(*) from party_game_players gp join party_games g on g.id = gp.game_id where gp.user_id = p_user and g.kind <> 'hikaye'),
    'party_wins',       (select count(*) from party_game_players where user_id = p_user and winner),
    'stories',          (select count(*) from party_game_players gp join party_games g on g.id = gp.game_id where gp.user_id = p_user and g.kind = 'hikaye'),
    'requests_filled',  (select count(*) from scene_requests where fulfilled_by = p_user and user_id <> p_user),
    'phones',           (select count(distinct game_id) from phone_game_steps where user_id = p_user and not skipped),
    'team',             exists (select 1 from team_members where user_id = p_user)
  );
$$;

-- 15) Discord /dublaj: sahnesiz modlar
create or replace function public.discord_create_room(p_discord_id text, p_scene uuid, p_mode text default 'klasik')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_scene scenes%rowtype;
  v_code  text;
  v_room  uuid;
begin
  select user_id into v_user from discord_links where discord_id = p_discord_id;
  if not found then raise exception 'BAGLI_DEGIL'; end if;
  if p_mode in ('kulak', 'kim', 'efekt', 'duygu', 'hikaye') then
    v_code := _new_room_code();
    insert into rooms (code, scene_id, host_id, mode) values (v_code, null, v_user, p_mode) returning id into v_room;
    insert into room_players (room_id, user_id, nickname) select v_room, v_user, display_name from profiles where id = v_user;
    return jsonb_build_object('code', v_code, 'title', case p_mode when 'kulak' then 'Kulaktan kulağa' when 'kim' then 'Kim konuştu?'
                                                       when 'efekt' then 'Efekt yarışması' when 'duygu' then 'Duygu ruleti' else 'Sesli hikâye' end, 'host', (select display_name from profiles where id = v_user),
                              'thumb_path', null);
  end if;
  if p_scene is null then
    select s.* into v_scene from scenes s
     where exists (select 1 from scene_lines l where l.scene_id = s.id)
     order by s.dub_count desc, random() limit 1;
  else
    select * into v_scene from scenes where id = p_scene;
  end if;
  if v_scene.id is null then raise exception 'Sahne bulunamadı'; end if;
  if not exists (select 1 from scene_lines where scene_id = v_scene.id) then raise exception 'Sahnede replik yok'; end if;
  v_code := _new_room_code();
  insert into rooms (code, scene_id, host_id, mode)
  values (v_code, v_scene.id, v_user, case when p_mode in ('klasik', 'zincir', 'senarist', 'duello') then p_mode else 'klasik' end)
  returning id into v_room;
  insert into room_players (room_id, user_id, nickname) select v_room, v_user, display_name from profiles where id = v_user;
  return jsonb_build_object('code', v_code, 'title', v_scene.title, 'host', (select display_name from profiles where id = v_user),
                            'thumb_path', v_scene.thumb_path);
end $$;

-- ============================================================
-- YETKİLER
-- ============================================================
revoke execute on function public._mode_needs_scene(text)  from public, anon, authenticated;
revoke execute on function public._efekt_prompts()         from public, anon, authenticated;
revoke execute on function public._duygu_list()            from public, anon, authenticated;
revoke execute on function public._story_openers()         from public, anon, authenticated;
revoke execute on function public._party_round(uuid, int)  from public, anon, authenticated;
revoke execute on function public._story_advance(uuid)     from public, anon, authenticated;
revoke execute on function public._party_reveal(uuid)      from public, anon, authenticated;
revoke execute on function public._party_finish(uuid)      from public, anon, authenticated;
revoke execute on function public._party_check(uuid)       from public, anon, authenticated;
revoke execute on function public._party_start(uuid)       from public, anon, authenticated;
revoke execute on function public._party_on_leave()        from public, anon, authenticated;
revoke execute on function public._party_token_ok(text)    from public, anon;
grant  execute on function public._party_token_ok(text)    to authenticated;
revoke execute on function public.party_state(uuid), public.party_submit_clip(uuid, text), public.party_answer(uuid, jsonb),
  public.party_next(uuid), public.party_skip(uuid), public.create_scene_request(text, text), public.vote_scene_request(uuid),
  public.fulfill_scene_request(uuid, uuid), public.delete_scene_request(uuid), public.set_showcase(jsonb)
  from public, anon;
grant execute on function public.party_state(uuid)                   to authenticated;
grant execute on function public.party_submit_clip(uuid, text)       to authenticated;
grant execute on function public.party_answer(uuid, jsonb)           to authenticated;
grant execute on function public.party_next(uuid)                    to authenticated;
grant execute on function public.party_skip(uuid)                    to authenticated;
grant execute on function public.create_scene_request(text, text)    to authenticated;
grant execute on function public.vote_scene_request(uuid)            to authenticated;
grant execute on function public.fulfill_scene_request(uuid, uuid)   to authenticated;
grant execute on function public.delete_scene_request(uuid)          to authenticated;
grant execute on function public.set_showcase(jsonb)                 to authenticated;
grant execute on function public.create_game(text)                   to authenticated;
grant execute on function public.set_room_mode(uuid, text, text[])   to authenticated;
grant execute on function public.start_game(uuid)                    to authenticated;
grant execute on function public.reset_room(uuid)                    to authenticated;
grant execute on function public.mode_stats(uuid)                    to anon, authenticated;
revoke execute on function public.discord_create_room(text, uuid, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.discord_create_room(text, uuid, text) to service_role';
  end if;
end $$;

-- Canlı güncellemeler: istek panosu
do $$
declare t text;
begin
  foreach t in array array['scene_requests'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ============================================================
-- 0.8.1 — YENİ İSİM EFEKTLERİ + GERÇEK SES DOSYALARI
-- (migrations/009 ile aynı)
--
-- Efekt düğmeleri ve giriş sesleri artık gerçek ses dosyası çalabilir:
--   shop_items.audio_path ('sounds' bucket'ında) doluysa dosya çalar, boşsa eski sentez ses çalar.
--   Dosyaları yönetim panelinden (/yonetim → Ses efektleri) yüklersin; yeni ses de ekleyebilirsin.
-- ============================================================

-- 1) Mağaza: ses dosyası ve emoji
alter table public.shop_items add column if not exists audio_path text;
alter table public.shop_items add column if not exists emoji text check (char_length(emoji) <= 16);

-- 2) Yeni isim efektleri
insert into public.shop_items (id, kind, name, price, sort) values
  ('name_aurora', 'name', 'Aurora isim', 1800, 14),
  ('name_glitch', 'name', 'Glitch isim', 2000, 15)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, sort = excluded.sort;

-- Hazır efekt düğmelerine emoji
update public.shop_items s set emoji = e.emoji
  from (values ('board_badum', '🥁'), ('board_korna', '📯'), ('board_alkis', '👏'), ('board_kriket', '🦗'), ('board_boing', '🌀'),
               ('board_trombon', '🎺'), ('board_scratch', '💿'), ('board_alarm', '🚨'), ('board_gong', '🔔'), ('board_zafer', '🏆')) as e(id, emoji)
 where s.id = e.id and s.emoji is null;

-- 3) 'sounds' bucket: herkes dinler, sadece yönetici yükler / siler
insert into storage.buckets (id, name, public, file_size_limit)
values ('sounds', 'sounds', true, 2097152)   -- 2 MB
on conflict (id) do nothing;
drop policy if exists sounds_admin_insert on storage.objects;
create policy sounds_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sounds' and public.is_admin());
drop policy if exists sounds_admin_update on storage.objects;
create policy sounds_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'sounds' and public.is_admin());
drop policy if exists sounds_admin_delete on storage.objects;
create policy sounds_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sounds' and public.is_admin());
drop policy if exists sounds_admin_select on storage.objects;
create policy sounds_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'sounds' and public.is_admin());

-- 4) Yönetici: ses ekle / düzenle (efekt düğmesi ya da giriş sesi)
create or replace function public.admin_save_sound(p_id text, p_kind text, p_name text, p_price int, p_emoji text, p_audio_path text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_id   text := nullif(trim(coalesce(p_id, '')), '');
  v_sort int;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if p_kind not in ('board', 'sound') then raise exception 'Geçersiz tür'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'Ad 1–40 karakter olmalı'; end if;
  if coalesce(p_price, -1) < 0 or p_price > 100000 then raise exception 'Geçersiz fiyat'; end if;
  if p_audio_path is not null and (select 1 from storage.objects where bucket_id = 'sounds' and name = p_audio_path) is null then
    raise exception 'Ses dosyası bulunamadı';
  end if;
  if v_id is null then
    v_id := p_kind || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    select coalesce(max(sort), 0) + 1 into v_sort from shop_items where kind = p_kind;
    insert into shop_items (id, kind, name, price, sort, emoji, audio_path)
    values (v_id, p_kind, trim(p_name), p_price, v_sort, nullif(trim(coalesce(p_emoji, '')), ''), p_audio_path);
  else
    update shop_items
       set name = trim(p_name), price = p_price, emoji = nullif(trim(coalesce(p_emoji, '')), ''),
           audio_path = coalesce(p_audio_path, audio_path)
     where id = v_id and kind = p_kind;
    if not found then raise exception 'Ürün bulunamadı'; end if;
  end if;
  return v_id;
end $$;

-- Ses dosyasını kaldır (sentez sese döner)
create or replace function public.admin_clear_sound(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  update shop_items set audio_path = null where id = p_id and kind in ('board', 'sound');
end $$;

-- Sesi mağazadan tamamen sil (satın alanlardaki kaydı da silinir)
create or replace function public.admin_delete_sound(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  update profiles set equipped = equipped - 'sound' where equipped->>'sound' = p_id;
  delete from shop_items where id = p_id and kind in ('board', 'sound');
  if not found then raise exception 'Ses bulunamadı'; end if;
end $$;

-- 5) Kullanılmayan dosyalar: ses dosyaları da taranır
create or replace function public.storage_orphans(p_min_age_hours int default 24)
returns table (bucket text, name text, bytes bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return query
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.created_at
    from storage.objects o
   where o.created_at < now() - make_interval(hours => greatest(p_min_age_hours, 1))
     and (
       (o.bucket_id = 'recordings'
         and not exists (select 1 from recordings rc where rc.audio_path = o.name)
         and not exists (select 1 from dub_recordings dr where dr.audio_path = o.name)
         and not exists (select 1 from room_foley f where f.audio_path = o.name)
         and not exists (select 1 from dub_foley f where f.audio_path = o.name)
         and not exists (select 1 from duel_takes d where d.audio_path = o.name)
         and not exists (select 1 from phone_steps ps where ps.audio_path = o.name)
         and not exists (select 1 from phone_game_steps pg where pg.audio_path = o.name)
         and not exists (select 1 from party_clips pc where pc.audio_path = o.name)
         and not exists (select 1 from party_games g where strpos(g.data::text, o.name) > 0))
       or (o.bucket_id = 'scenes'
         and not exists (select 1 from scenes s where o.name in (s.video_path, s.bg_audio_path, s.thumb_path)))
       or (o.bucket_id = 'sounds'
         and not exists (select 1 from shop_items s where s.audio_path = o.name))
       or (o.bucket_id = 'avatars'
         and not exists (select 1 from profiles p where o.name in (p.avatar_path, p.banner_path, p.voice_path))
         and not exists (select 1 from teams t where t.logo_path = o.name))
     )
   order by 3 desc
   limit 1000;
end $$;

-- ============================================================
-- YETKİLER
-- ============================================================
revoke execute on function public.admin_save_sound(text, text, text, int, text, text), public.admin_clear_sound(text),
  public.admin_delete_sound(text) from public, anon;
grant execute on function public.admin_save_sound(text, text, text, int, text, text) to authenticated;
grant execute on function public.admin_clear_sound(text)                             to authenticated;
grant execute on function public.admin_delete_sound(text)                            to authenticated;

-- ============================================================
-- 0.9.0 — ODA VARLIĞI, AKTİF ODALAR, YÖNETİM, PLAKETLER, SAHNE SESİ
-- (migrations/010 ile aynı)
-- ============================================================

-- ------------------------------------------------------------
-- 1) ODA VARLIĞI (heartbeat)
--    Ayrı tablo: room_players'ı her 20 saniyede güncellemek Realtime'da herkesi yeniden yüklerdi.
-- ------------------------------------------------------------
create table if not exists public.room_presence (
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null,
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_presence_seen_idx on public.room_presence(last_seen);
alter table public.room_presence enable row level security;
revoke all on public.room_presence from anon, authenticated;

-- Şu an odada olanlar "az önce görüldü" sayılır (güncelleme sırasında kimse düşmesin)
insert into public.room_presence (room_id, user_id, last_seen)
select room_id, user_id, now() from public.room_players
on conflict (room_id, user_id) do update set last_seen = excluded.last_seen;

-- Oyuncuyu odadan düşür (ayrılma, çıkarma, zaman aşımı hepsi buradan geçer).
-- Oda sahibi düşerse sahiplik en eski oyuncuya geçer; kimse kalmazsa oda silinir.
-- Dönüş: oda silindiyse true.
create or replace function public._drop_player(p_room uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_host uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then return true; end if;
  if not exists (select 1 from room_players where room_id = p_room and user_id = p_user) then
    delete from room_presence where room_id = p_room and user_id = p_user;
    return false;
  end if;

  v_host := v_room.host_id;
  if v_host = p_user then
    select user_id into v_host from room_players
     where room_id = p_room and user_id <> p_user
     order by joined_at limit 1;
    if v_host is null then
      delete from rooms where id = p_room;   -- son kişi de çıktı: oda kapanır
      return true;
    end if;
    update rooms set host_id = v_host where id = p_room;
  end if;

  if v_room.status = 'finale' then
    null;   -- finalde sadece oyuncu satırı silinir; karakterler isim için kalır
  elsif v_room.status in ('recording', 'writing') and v_room.mode in ('klasik', 'senarist') then
    delete from recordings where room_id = p_room and user_id = p_user;
    update room_roles set user_id = v_host, picked = false where room_id = p_room and user_id = p_user;
    update room_line_texts set author = v_host where room_id = p_room and author = p_user;
    update room_players set done = false where room_id = p_room and user_id = v_host;
    delete from room_secrets where room_id = p_room and user_id = p_user;
  else
    delete from room_roles where room_id = p_room and user_id = p_user;
  end if;

  if v_room.status <> 'finale' and v_room.mode = 'zincir' and v_room.mode_state ? 'order' then
    delete from recordings where room_id = p_room and user_id = p_user;
    update rooms set mode_state = jsonb_set(mode_state, '{order}',
      coalesce((select jsonb_agg(x) from jsonb_array_elements_text(mode_state->'order') x where x <> p_user::text), '[]'::jsonb))
     where id = p_room;
  end if;
  if v_room.foley_user = p_user and v_room.status <> 'finale' then
    delete from room_foley where room_id = p_room;
    update rooms set foley_user = null where id = p_room;
  end if;

  delete from room_presence where room_id = p_room and user_id = p_user;
  delete from room_players  where room_id = p_room and user_id = p_user;   -- parti / kulak tetikleyicileri burada çalışır
  return false;
end $$;

-- Odadan ayrıl (her aşamada)
create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform _drop_player(p_room, auth.uid());
end $$;

-- Oyuncu çıkarma: aynı temizlik + tekrar katılma yasağı
create or replace function public.kick_player(p_room uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
begin
  select * into v_room from rooms where id = p_room;
  if not found or v_room.host_id <> auth.uid() then raise exception 'Sadece oda sahibi oyuncu çıkarabilir'; end if;
  if p_user = auth.uid() then raise exception 'Kendini çıkaramazsın'; end if;
  if v_room.status = 'finale' then raise exception 'Finalde oyuncu çıkarılamaz'; end if;
  if not exists (select 1 from room_players where room_id = p_room and user_id = p_user) then return; end if;
  perform _drop_player(p_room, p_user);
  update rooms set banned = array_append(array_remove(banned, p_user), p_user) where id = p_room;
end $$;

-- Bir odada uzun süredir ses vermeyenleri düşür. Lobide 2 dk, oyunda 5 dk (telefon kilitlenince hemen gitmesin).
create or replace function public._reap_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_limit  interval;
  r        record;
begin
  select status into v_status from rooms where id = p_room;
  if not found then return; end if;
  v_limit := case when v_status = 'lobby' then interval '2 minutes' else interval '5 minutes' end;
  for r in
    select rp.user_id from room_players rp
      left join room_presence pr on pr.room_id = rp.room_id and pr.user_id = rp.user_id
     where rp.room_id = p_room
       and coalesce(pr.last_seen, rp.joined_at) < now() - v_limit
  loop
    if _drop_player(p_room, r.user_id) then return; end if;   -- oda silindi
  end loop;
  -- Oyuncusu kalmayan oda (ör. herkes çıkarıldı) kapanır
  if not exists (select 1 from room_players where room_id = p_room) then
    delete from rooms where id = p_room;
  end if;
end $$;

-- Tüm odalar: kimsenin ses vermediği odaları kapat. Yeni kurulan odaya 10 dk tanınır
-- (Discord'dan açılıp linke henüz tıklanmamış odalar için).
create or replace function public._reap_idle_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  -- 1) Boş odalar
  delete from rooms ro
   where ro.created_at < now() - interval '2 minutes'
     and not exists (select 1 from room_players rp where rp.room_id = ro.id);
  get diagnostics n = row_count;
  -- 2) Oyuncuları olan ama kimsenin ses vermediği odalar: tek tek düşür (sahiplik / parti kuralları işlesin)
  for r in
    select ro.id from rooms ro
     where ro.created_at < now() - interval '10 minutes'
       and exists (
         select 1 from room_players rp
           left join room_presence pr on pr.room_id = rp.room_id and pr.user_id = rp.user_id
          where rp.room_id = ro.id
            and coalesce(pr.last_seen, rp.joined_at) < now() - case when ro.status = 'lobby' then interval '2 minutes' else interval '5 minutes' end)
     limit 50
  loop
    perform _reap_room(r.id);
    if not exists (select 1 from rooms where id = r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- İstemci 20 sn'de bir çağırır. Odada değilse { in_room: false } döner (çıkarıldı / düştü).
create or replace function public.room_ping(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('in_room', false); end if;
  if exists (select 1 from room_players where room_id = p_room and user_id = auth.uid()) then
    insert into room_presence (room_id, user_id, last_seen) values (p_room, auth.uid(), now())
    on conflict (room_id, user_id) do update set last_seen = now();
  end if;
  perform _reap_room(p_room);
  -- Ara sıra genel temizlik (pg_cron yoksa da boş odalar kapanır)
  if random() < 0.25 then perform _reap_idle_rooms(); end if;
  return jsonb_build_object(
    'in_room', exists (select 1 from room_players where room_id = p_room and user_id = auth.uid()),
    'room',    exists (select 1 from rooms where id = p_room)
  );
end $$;

-- Odaya katılan / oda kuran hemen "görüldü" sayılsın
create or replace function public._presence_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into room_presence (room_id, user_id, last_seen) values (new.room_id, new.user_id, now())
  on conflict (room_id, user_id) do update set last_seen = now();
  return null;
end $$;
drop trigger if exists presence_on_join on public.room_players;
create trigger presence_on_join after insert on public.room_players
  for each row execute function public._presence_on_join();

-- Eski gece temizliği: artık boş odaları da kapsar
create or replace function public._cleanup_stale_rooms(p_days int default 3) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform _reap_idle_rooms();
  delete from rooms r
   where greatest(r.created_at, coalesce(r.finale_at, r.created_at),
                  coalesce((select max(created_at) from recordings rc where rc.room_id = r.id), r.created_at),
                  coalesce((select max(last_seen) from room_presence pr where pr.room_id = r.id), r.created_at),
                  coalesce((select max(joined_at) from room_players rp where rp.room_id = r.id), r.created_at))
         < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics n = row_count;
  return n;
end $$;

-- pg_cron açıksa her dakika boş odaları kapat
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$select cron.schedule('famio-bos-odalar', '* * * * *', 'select public._reap_idle_rooms()')$c$;
  end if;
exception when others then
  raise notice 'pg_cron görevi kurulamadı: %', sqlerrm;
end $$;

-- ------------------------------------------------------------
-- 2) AÇIK / GİZLİ LOBİ ve AKTİF ODALAR
-- ------------------------------------------------------------
alter table public.rooms add column if not exists is_public boolean not null default true;

create or replace function public.set_room_public(p_room uuid, p_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update rooms set is_public = coalesce(p_public, true) where id = p_room and host_id = auth.uid();
  if not found then raise exception 'Sadece oda sahibi'; end if;
end $$;

-- Açık odalar (gizli odalar listelenmez; kilitliler "kilitli" diye görünür). Giriş yapmamışlar da görebilir.
create or replace function public.list_active_rooms() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if random() < 0.5 then perform _reap_idle_rooms(); end if;
  select coalesce(jsonb_agg(x order by (x->>'status') = 'lobby' desc, (x->>'players')::int desc, x->>'created_at' desc), '[]'::jsonb)
    into v
    from (
      select jsonb_build_object(
        'id', r.id, 'code', r.code, 'mode', r.mode, 'mods', r.mods, 'status', r.status, 'locked', r.locked,
        'created_at', r.created_at,
        'players', (select count(*) from room_players rp where rp.room_id = r.id),
        'scene', case when s.id is null then null else jsonb_build_object('id', s.id, 'title', s.title, 'thumb_path', s.thumb_path) end,
        'host', (select jsonb_build_object('username', p.username, 'display_name', p.display_name, 'color', p.color, 'avatar_path', p.avatar_path, 'equipped', p.equipped)
                   from profiles p where p.id = r.host_id),
        'members', coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'display_name', p.display_name, 'color', p.color,
                                      'avatar_path', p.avatar_path, 'equipped', p.equipped) order by rp.joined_at)
                               from (select * from room_players where room_id = r.id order by joined_at limit 6) rp
                               join profiles p on p.id = rp.user_id), '[]'::jsonb)
      ) x
        from rooms r
        left join scenes s on s.id = r.scene_id
       where r.is_public
         and exists (select 1 from room_players rp where rp.room_id = r.id)
         and not coalesce(auth.uid() = any (r.banned), false)
       limit 60
    ) q;
  return v;
end $$;

-- ------------------------------------------------------------
-- 3) YÖNETİM
-- ------------------------------------------------------------
-- XP ekle / çıkar (negatif olabilir). Liderlik için olay olarak kaydedilir ('yonetim').
create or replace function public.admin_adjust_xp(p_user uuid, p_amount int, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_old int;
  v_new int;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Miktar 0 olamaz'; end if;
  if abs(p_amount) > 1000000 then raise exception 'Miktar çok büyük'; end if;
  select xp into v_old from profiles where id = p_user for update;
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
  v_new := greatest(0, v_old + p_amount);
  update profiles set xp = v_new where id = p_user;
  if v_new <> v_old then
    insert into xp_events (user_id, amount, reason) values (p_user, v_new - v_old, 'yonetim');
  end if;
  return v_new;
end $$;

-- XP'yi doğrudan bir değere ayarla
create or replace function public.admin_set_xp(p_user uuid, p_xp int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_old int;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if p_xp is null or p_xp < 0 or p_xp > 100000000 then raise exception 'Geçersiz XP'; end if;
  select xp into v_old from profiles where id = p_user for update;
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
  update profiles set xp = p_xp where id = p_user;
  if p_xp <> v_old then
    insert into xp_events (user_id, amount, reason) values (p_user, p_xp - v_old, 'yonetim');
  end if;
  return p_xp;
end $$;

-- Mağaza bakiyesi: harcananı değiştirir (level etkilenmez). +100 → bakiye 100 artar.
create or replace function public.admin_adjust_balance(p_user uuid, p_amount int) returns int
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  select * into p from profiles where id = p_user for update;
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
  -- spent negatif olabilir: XP'den fazla bakiye vermek için
  update profiles set spent = p.spent - coalesce(p_amount, 0) where id = p_user;
  return p.xp - (p.spent - coalesce(p_amount, 0));
end $$;

-- Eşya ver / al
create or replace function public.admin_give_item(p_user uuid, p_item text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if not exists (select 1 from shop_items where id = p_item) then raise exception 'Ürün bulunamadı'; end if;
  insert into user_items (user_id, item_id) values (p_user, p_item) on conflict do nothing;
end $$;

create or replace function public.admin_take_item(p_user uuid, p_item text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  select kind into v_kind from shop_items where id = p_item;
  delete from user_items where user_id = p_user and item_id = p_item;
  if v_kind is not null then
    update profiles set equipped = equipped - v_kind where id = p_user and equipped->>v_kind = p_item;
  end if;
end $$;

-- Profili düzelt: görünen ad, renk, biyografi; isteğe bağlı fotoğraf / kapak / imza sesini sıfırla
create or replace function public.admin_update_profile(
  p_user uuid, p_display_name text default null, p_color text default null, p_bio text default null,
  p_clear_avatar boolean default false, p_clear_banner boolean default false, p_clear_voice boolean default false,
  p_clear_equipped boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  update profiles set
    display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
    color        = coalesce(nullif(trim(p_color), ''), color),
    bio          = case when p_bio is null then bio else nullif(trim(p_bio), '') end,
    avatar_path  = case when p_clear_avatar then null else avatar_path end,
    banner_path  = case when p_clear_banner then null else banner_path end,
    voice_path   = case when p_clear_voice  then null else voice_path end,
    equipped     = case when p_clear_equipped then '{}'::jsonb else equipped end
  where id = p_user;
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
end $$;

-- Kullanıcı ayrıntısı: profil, eşyalar, son XP hareketleri
create or replace function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return (
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name, 'color', p.color, 'bio', p.bio,
      'avatar_path', p.avatar_path, 'banner_path', p.banner_path, 'voice_path', p.voice_path,
      'xp', p.xp, 'spent', p.spent, 'equipped', p.equipped, 'streak', p.streak, 'created_at', p.created_at,
      'items', coalesce((select jsonb_agg(ui.item_id order by ui.bought_at) from user_items ui where ui.user_id = p.id), '[]'::jsonb),
      'badges', coalesce((select jsonb_agg(b.badge order by b.granted_at) from user_badges b where b.user_id = p.id), '[]'::jsonb),
      'week_xp', coalesce((select sum(amount) from xp_events e where e.user_id = p.id and e.created_at >= now() - interval '7 days'), 0),
      'events', coalesce((select jsonb_agg(jsonb_build_object('amount', e.amount, 'reason', e.reason, 'at', e.created_at) order by e.created_at desc)
                            from (select * from xp_events where user_id = p.id order by created_at desc limit 30) e), '[]'::jsonb)
    ) from profiles p where p.id = p_user
  );
end $$;

-- Mağaza ürünü: ad, fiyat, sıra (çerçeve, isim, kapak, plaket, ses, efekt düğmesi)
create or replace function public.admin_update_item(p_id text, p_name text, p_price int, p_sort int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Ad boş olamaz'; end if;
  if p_price is null or p_price < 0 then raise exception 'Fiyat 0 ya da daha büyük olmalı'; end if;
  update shop_items set name = left(trim(p_name), 60), price = p_price, sort = coalesce(p_sort, sort) where id = p_id;
  if not found then raise exception 'Ürün bulunamadı'; end if;
end $$;

-- Odalar: yönetici her odayı görür ve kapatabilir
create or replace function public.admin_list_rooms() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'code', r.code, 'mode', r.mode, 'status', r.status, 'is_public', r.is_public, 'locked', r.locked,
      'created_at', r.created_at,
      'players', (select count(*) from room_players rp where rp.room_id = r.id),
      'last_seen', (select max(last_seen) from room_presence pr where pr.room_id = r.id),
      'host', (select username from profiles where id = r.host_id),
      'scene', (select title from scenes where id = r.scene_id)
    ) order by r.created_at desc)
    from rooms r), '[]'::jsonb);
end $$;

create or replace function public.admin_close_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  delete from rooms where id = p_room;
end $$;

-- ------------------------------------------------------------
-- 4) PLAKETLER: görünüş veritabanında (shop_items.meta)
--    meta = { title, eyebrow, colors: { bg1, bg2, ink, sub, line } }
-- ------------------------------------------------------------
alter table public.shop_items add column if not exists meta jsonb not null default '{}';

update public.shop_items s set meta = m.meta
  from (values
    ('plaque_ses',     '{"title":"Ses Sanatçısı","eyebrow":"FAM-IO · PLAKET","colors":{"bg1":"#f1f1f3","bg2":"#c9ccd3","ink":"#2c2f36","sub":"#5c616c","line":"#9aa0aa"}}'::jsonb),
    ('plaque_kahkaha', '{"title":"Kahkaha Ustası","eyebrow":"FAM-IO · PLAKET","colors":{"bg1":"#f6d7b4","bg2":"#d79a63","ink":"#4a2a10","sub":"#7a4a22","line":"#b0743f"}}'::jsonb),
    ('plaque_efsane',  '{"title":"Dublaj Efsanesi","eyebrow":"FAM-IO · PLAKET","colors":{"bg1":"#f8e9b5","bg2":"#e8c66e","ink":"#4a3508","sub":"#7a5a17","line":"#b8913a"}}'::jsonb)
  ) as m(id, meta)
 where s.id = m.id and s.meta = '{}'::jsonb;

create or replace function public._valid_hex(p text) returns boolean language sql immutable as $$
  select coalesce(p ~ '^#[0-9a-fA-F]{6}$', false)
$$;

-- Plaket ekle / düzenle. p_id boşsa yeni kimlik üretilir. Dönüş: kimlik.
create or replace function public.admin_save_plaque(
  p_id text, p_name text, p_price int, p_title text, p_eyebrow text, p_colors jsonb, p_sort int default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id text := nullif(trim(coalesce(p_id, '')), '');
  k    text;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Plaket yazısı boş olamaz'; end if;
  if char_length(trim(p_title)) > 28 then raise exception 'Plaket yazısı en fazla 28 karakter'; end if;
  if char_length(coalesce(p_eyebrow, '')) > 32 then raise exception 'Üst yazı en fazla 32 karakter'; end if;
  if p_price is null or p_price < 0 then raise exception 'Fiyat 0 ya da daha büyük olmalı'; end if;
  foreach k in array array['bg1', 'bg2', 'ink', 'sub', 'line'] loop
    if not _valid_hex(p_colors->>k) then raise exception 'Renk eksik ya da hatalı: %', k; end if;
  end loop;
  if v_id is null then
    v_id := 'plaque_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  elsif v_id !~ '^plaque_[a-z0-9_]{2,40}$' then
    raise exception 'Kimlik plaque_ ile başlamalı (küçük harf, rakam, _)';
  end if;
  insert into shop_items (id, kind, name, price, sort, meta)
  values (v_id, 'plaque', left(coalesce(nullif(trim(p_name), ''), 'Plaket: ' || trim(p_title)), 60), p_price,
          coalesce(p_sort, (select coalesce(max(sort), 19) + 1 from shop_items where kind = 'plaque')),
          jsonb_build_object('title', trim(p_title), 'eyebrow', coalesce(nullif(trim(p_eyebrow), ''), 'FAM-IO · PLAKET'),
                             'colors', jsonb_build_object('bg1', p_colors->>'bg1', 'bg2', p_colors->>'bg2', 'ink', p_colors->>'ink',
                                                          'sub', p_colors->>'sub', 'line', p_colors->>'line')))
  on conflict (id) do update set
    name = excluded.name, price = excluded.price, sort = coalesce(p_sort, shop_items.sort), meta = excluded.meta
  where shop_items.kind = 'plaque';
  return v_id;
end $$;

create or replace function public.admin_delete_plaque(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  update profiles set equipped = equipped - 'plaque' where equipped->>'plaque' = p_id;
  delete from shop_items where id = p_id and kind = 'plaque';
  if not found then raise exception 'Plaket bulunamadı'; end if;
end $$;

-- Yönetici istatistiği: gizli/açık oda sayısı da
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  return jsonb_build_object(
    'users',   (select count(*) from profiles),
    'scenes',  (select count(*) from scenes),
    'dubs',    (select count(*) from dubs),
    'rooms',   (select count(*) from rooms),
    'comments',(select count(*) from dub_comments),
    'storage', coalesce((select jsonb_object_agg(bucket_id, jsonb_build_object('files', n, 'bytes', b))
                  from (select bucket_id, count(*) n, coalesce(sum((metadata->>'size')::bigint), 0) b
                          from storage.objects where bucket_id in ('scenes', 'recordings', 'avatars', 'sounds') group by bucket_id) x), '{}'::jsonb),
    'settings', jsonb_build_object(
      'discord',            exists (select 1 from app_settings where key = 'discord_webhook_url' and coalesce(value, '') <> ''),
      'site_url',           (select value from app_settings where key = 'site_url'),
      'early_member_limit', (select value from app_settings where key = 'early_member_limit')
    ),
    'pg_net',  exists (select 1 from pg_extension where extname = 'pg_net'),
    'pg_cron', exists (select 1 from pg_extension where extname = 'pg_cron')
  );
end $$;

-- ------------------------------------------------------------
-- 5) SAHNE SESİ: orijinal ses replik dışında çalar, replik anında kısılır. Seviye %0–200.
-- ------------------------------------------------------------
alter table public.scenes drop constraint if exists scenes_original_volume_check;
alter table public.scenes add constraint scenes_original_volume_check check (original_volume >= 0 and original_volume <= 2);
alter table public.scenes alter column original_volume set default 1;
-- Ayrı müzik dosyası olmayan eski sahnelerde orijinal ses açılır (artık replik anlarında zaten kısılıyor)
do $$
begin
  if not exists (select 1 from app_settings where key = 'migr_010_volume') then
    update public.scenes set original_volume = 1 where original_volume = 0 and bg_audio_path is null;
    insert into app_settings (key, value) values ('migr_010_volume', 'ok');
  end if;
end $$;

-- ============================================================
-- YETKİLER
-- ============================================================
revoke execute on function public._drop_player(uuid, uuid), public._reap_room(uuid), public._reap_idle_rooms(),
  public._presence_on_join(), public._cleanup_stale_rooms(int), public._valid_hex(text) from public, anon, authenticated;

revoke execute on function public.leave_room(uuid), public.kick_player(uuid, uuid), public.room_ping(uuid),
  public.set_room_public(uuid, boolean),
  public.admin_adjust_xp(uuid, int, text), public.admin_set_xp(uuid, int), public.admin_adjust_balance(uuid, int),
  public.admin_give_item(uuid, text), public.admin_take_item(uuid, text),
  public.admin_update_profile(uuid, text, text, text, boolean, boolean, boolean, boolean),
  public.admin_user_detail(uuid), public.admin_update_item(text, text, int, int),
  public.admin_list_rooms(), public.admin_close_room(uuid),
  public.admin_save_plaque(text, text, int, text, text, jsonb, int), public.admin_delete_plaque(text),
  public.admin_stats() from public, anon;

revoke execute on function public.list_active_rooms() from public;
grant execute on function public.leave_room(uuid)                     to authenticated;
grant execute on function public.kick_player(uuid, uuid)              to authenticated;
grant execute on function public.room_ping(uuid)                      to authenticated;
grant execute on function public.set_room_public(uuid, boolean)       to authenticated;
grant execute on function public.list_active_rooms()                  to anon, authenticated;
grant execute on function public.admin_adjust_xp(uuid, int, text)     to authenticated;
grant execute on function public.admin_set_xp(uuid, int)              to authenticated;
grant execute on function public.admin_adjust_balance(uuid, int)      to authenticated;
grant execute on function public.admin_give_item(uuid, text)          to authenticated;
grant execute on function public.admin_take_item(uuid, text)          to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, text, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.admin_user_detail(uuid)              to authenticated;
grant execute on function public.admin_update_item(text, text, int, int) to authenticated;
grant execute on function public.admin_list_rooms()                   to authenticated;
grant execute on function public.admin_close_room(uuid)               to authenticated;
grant execute on function public.admin_save_plaque(text, text, int, text, text, jsonb, int) to authenticated;
grant execute on function public.admin_delete_plaque(text)            to authenticated;
grant execute on function public.admin_stats()                        to authenticated;

-- ============================================================
-- 0.9.1 — ODA DAVETLERİ + KAPANAN SAYFADA ODA AÇIK KALMA DÜZELTMESİ
-- (migrations/011 ile aynı)
-- ============================================================

-- ------------------------------------------------------------
-- 1) DAVETLER
-- ------------------------------------------------------------
create table if not exists public.room_invites (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'bekliyor' check (status in ('bekliyor', 'kabul', 'ret')),
  created_at timestamptz not null default now(),
  unique (room_id, to_user)
);
create index if not exists room_invites_to_idx on public.room_invites(to_user, status, created_at);
alter table public.room_invites enable row level security;
revoke all on public.room_invites from anon, authenticated;
grant select on public.room_invites to authenticated;

-- Davet edilen, davet eden ve o odadakiler görür (lobide "davetli" listesi için)
drop policy if exists room_invites_select on public.room_invites;
create policy room_invites_select on public.room_invites for select to authenticated using (
  to_user = auth.uid() or from_user = auth.uid()
  or exists (select 1 from public.room_players rp where rp.room_id = room_invites.room_id and rp.user_id = auth.uid())
);

-- Realtime: davet anında gelsin
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_invites') then
    alter publication supabase_realtime add table public.room_invites;
  end if;
end $$;

-- Odaya davet et (odadaki herkes davet edebilir). Dönüş: gönderilen davet sayısı.
create or replace function public.invite_to_room(p_room uuid, p_users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_n    int := 0;
  u      uuid;
begin
  select * into v_room from rooms where id = p_room;
  if not found then raise exception 'Oda bulunamadı'; end if;
  if not exists (select 1 from room_players where room_id = p_room and user_id = auth.uid()) then
    raise exception 'Sadece odadakiler davet edebilir';
  end if;
  if v_room.status <> 'lobby' then raise exception 'Oyun başladı; davetler lobide gönderilir'; end if;
  if coalesce(array_length(p_users, 1), 0) > 20 then raise exception 'Tek seferde en fazla 20 kişi'; end if;
  -- aynı kişiden çok sık davet olmasın
  if (select count(*) from room_invites where from_user = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı davet gönderiyorsun, biraz bekle';
  end if;
  foreach u in array coalesce(p_users, '{}') loop
    continue when u is null or u = auth.uid();
    continue when not exists (select 1 from profiles where id = u);
    continue when exists (select 1 from room_players where room_id = p_room and user_id = u);
    continue when u = any (v_room.banned);
    insert into room_invites (room_id, from_user, to_user, status, created_at)
    values (p_room, auth.uid(), u, 'bekliyor', now())
    on conflict (room_id, to_user) do update
      set from_user = excluded.from_user, status = 'bekliyor', created_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Daveti geri çek (gönderen ya da oda sahibi)
create or replace function public.cancel_invite(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from room_invites
   where room_id = p_room and to_user = p_user
     and (from_user = auth.uid() or exists (select 1 from rooms where id = p_room and host_id = auth.uid()));
end $$;

-- Davete cevap ver. Kabul edilirse odaya katılır (kilitli olsa bile) ve oda kodunu döndürür.
create or replace function public.respond_invite(p_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv    room_invites%rowtype;
  v_room rooms%rowtype;
  v_name text;
begin
  select * into inv from room_invites where id = p_id and to_user = auth.uid() for update;
  if not found then raise exception 'Davet bulunamadı ya da süresi geçti'; end if;
  if not coalesce(p_accept, false) then
    update room_invites set status = 'ret' where id = p_id;
    return null;
  end if;
  select * into v_room from rooms where id = inv.room_id;
  if not found then raise exception 'Oda kapanmış'; end if;
  if auth.uid() = any (v_room.banned) then raise exception 'Bu odadan çıkarıldın'; end if;
  if not exists (select 1 from room_players where room_id = v_room.id and user_id = auth.uid()) then
    if v_room.status <> 'lobby' then raise exception 'Oyun başladı, artık katılamazsın'; end if;
    if (select count(*) from room_players where room_id = v_room.id) >= 12 then raise exception 'Oda dolu'; end if;
    select display_name into v_name from profiles where id = auth.uid();
    insert into room_players (room_id, user_id, nickname) values (v_room.id, auth.uid(), v_name);
  end if;
  update room_invites set status = 'kabul' where id = p_id;
  return v_room.code;
end $$;

-- Bana gelen, hâlâ geçerli davetler (lobideki odalar, son 30 dk)
create or replace function public.my_invites() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'room_id', r.id, 'code', r.code, 'mode', r.mode, 'created_at', i.created_at,
      'players', (select count(*) from room_players rp where rp.room_id = r.id),
      'scene', (select title from scenes where id = r.scene_id),
      'from', jsonb_build_object('username', p.username, 'display_name', p.display_name, 'color', p.color,
                                 'avatar_path', p.avatar_path, 'equipped', p.equipped)
    ) order by i.created_at desc)
      from room_invites i
      join rooms r on r.id = i.room_id
      join profiles p on p.id = i.from_user
     where i.to_user = auth.uid() and i.status = 'bekliyor'
       and i.created_at > now() - interval '30 minutes'
       and r.status = 'lobby'
       and not exists (select 1 from room_players rp where rp.room_id = r.id and rp.user_id = auth.uid())
  ), '[]'::jsonb);
end $$;

-- Odadan ayrılan / çıkarılan için bekleyen davetleri temizleme gerekmez; oda silinince davetler de silinir.

-- ------------------------------------------------------------
-- 2) SAYFA KAPANINCA ODA AÇIK KALMASIN
-- ------------------------------------------------------------
-- Sayfa kapanırken / başka siteye geçerken: 15 sn içinde ping gelmezse düş.
-- (Sayfa yenilendiyse yeni sayfa hemen ping atar ve oyuncu kalır.)
create or replace function public.room_away(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if auth.uid() is null then return; end if;
  select status into v_status from rooms where id = p_room;
  if not found then return; end if;
  update room_presence
     set last_seen = now() - case when v_status = 'lobby' then interval '2 minutes' else interval '5 minutes' end + interval '15 seconds'
   where room_id = p_room and user_id = auth.uid();
end $$;

-- Discord'dan (service_role) kurulan odaya linke tıklamak için 10 dk tanı; diğer herkes katıldığı an görülmüş sayılır
create or replace function public._presence_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_seen timestamptz := case when auth.uid() is null then now() + interval '8 minutes' else now() end;
begin
  insert into room_presence (room_id, user_id, last_seen) values (new.room_id, new.user_id, v_seen)
  on conflict (room_id, user_id) do update set last_seen = greatest(room_presence.last_seen, excluded.last_seen);
  return null;
end $$;

-- Boş / sessiz odaları kapat. Artık oda yaşına bakılmıyor; sadece oyuncuların son sesi önemli.
create or replace function public._reap_idle_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  delete from rooms ro
   where ro.created_at < now() - interval '1 minute'
     and not exists (select 1 from room_players rp where rp.room_id = ro.id);
  get diagnostics n = row_count;
  for r in
    select ro.id from rooms ro
     where exists (
         select 1 from room_players rp
           left join room_presence pr on pr.room_id = rp.room_id and pr.user_id = rp.user_id
          where rp.room_id = ro.id
            and coalesce(pr.last_seen, rp.joined_at) < now() - case when ro.status = 'lobby' then interval '2 minutes' else interval '5 minutes' end)
     limit 50
  loop
    perform _reap_room(r.id);
    if not exists (select 1 from rooms where id = r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Aktif odalar: sadece son 50 sn'de en az bir kişinin ses verdiği açık odalar
create or replace function public.list_active_rooms() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform _reap_idle_rooms();
  select coalesce(jsonb_agg(x order by (x->>'status') = 'lobby' desc, (x->>'players')::int desc, x->>'created_at' desc), '[]'::jsonb)
    into v
    from (
      select jsonb_build_object(
        'id', r.id, 'code', r.code, 'mode', r.mode, 'mods', r.mods, 'status', r.status, 'locked', r.locked,
        'created_at', r.created_at,
        'players', (select count(*) from room_players rp where rp.room_id = r.id),
        'scene', case when s.id is null then null else jsonb_build_object('id', s.id, 'title', s.title, 'thumb_path', s.thumb_path) end,
        'host', (select jsonb_build_object('username', p.username, 'display_name', p.display_name, 'color', p.color, 'avatar_path', p.avatar_path, 'equipped', p.equipped)
                   from profiles p where p.id = r.host_id),
        'members', coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'display_name', p.display_name, 'color', p.color,
                                      'avatar_path', p.avatar_path, 'equipped', p.equipped) order by rp.joined_at)
                               from (select * from room_players where room_id = r.id order by joined_at limit 6) rp
                               join profiles p on p.id = rp.user_id), '[]'::jsonb)
      ) x
        from rooms r
        left join scenes s on s.id = r.scene_id
       where r.is_public
         and exists (select 1 from room_presence pr
                       join room_players rp on rp.room_id = pr.room_id and rp.user_id = pr.user_id
                      where pr.room_id = r.id and pr.last_seen > now() - interval '50 seconds')
         and not coalesce(auth.uid() = any (r.banned), false)
       limit 60
    ) q;
  return v;
end $$;

-- ============================================================
-- YETKİLER
-- ============================================================
revoke execute on function public.invite_to_room(uuid, uuid[]), public.cancel_invite(uuid, uuid),
  public.respond_invite(uuid, boolean), public.my_invites(), public.room_away(uuid) from public, anon;
revoke execute on function public._presence_on_join(), public._reap_idle_rooms() from public, anon, authenticated;
grant execute on function public.invite_to_room(uuid, uuid[])    to authenticated;
grant execute on function public.cancel_invite(uuid, uuid)       to authenticated;
grant execute on function public.respond_invite(uuid, boolean)   to authenticated;
grant execute on function public.my_invites()                    to authenticated;
grant execute on function public.room_away(uuid)                 to authenticated;
revoke execute on function public.list_active_rooms() from public;
grant execute on function public.list_active_rooms()             to anon, authenticated;
