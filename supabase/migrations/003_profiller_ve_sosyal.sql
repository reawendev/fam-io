-- ============================================================
-- 003 — Profiller, dublaj arşivi, XP / level / streak, beğeni, yorum, uyum
-- Mevcut kurulumu güncellemek için SQL Editor'da bir kez çalıştır (002'den sonra).
-- Tekrar çalıştırılabilir.
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
-- DUBLAJI ARŞİVLE + XP / STREAK DAĞIT (sadece start_finale çağırır)
--   Katılımcı başına: 40 + 10×replik (en çok 20) + 10×diğer katılımcı (en çok 5)
--   Günün ilk tamamlanan sahnesi: +20 + 5×seri (en çok 10)
--   Seri: gün İstanbul saatine göre; dün de oynadıysan +1, yoksa 1'den başlar.
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
  insert into dub_recordings (dub_id, line_id, user_id, audio_path, offset_time)
    select v_dub, line_id, user_id, audio_path, offset_time from recordings where room_id = p_room;
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
  return v_dub;
end $$;

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
create or replace function public.compat_for(p_user uuid)
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
revoke execute on function public._finalize_dub(uuid) from public, anon, authenticated;
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
