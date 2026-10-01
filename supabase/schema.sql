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

create or replace function public.leaderboard(p_period text default 'week', p_limit int default 25)
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
