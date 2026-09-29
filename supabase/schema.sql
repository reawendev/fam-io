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

create or replace function public.create_room(p_scene uuid, p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_room uuid;
begin
  if auth.uid() is null then raise exception 'Oturum yok'; end if;
  if not exists (select 1 from scenes where id = p_scene) then raise exception 'Sahne bulunamadı'; end if;
  if not exists (select 1 from scene_roles where scene_id = p_scene) then raise exception 'Sahnede hiç karakter yok'; end if;
  v_code := _new_room_code();
  insert into rooms (code, scene_id, host_id) values (v_code, p_scene, auth.uid()) returning id into v_room;
  insert into room_players (room_id, user_id, nickname) values (v_room, auth.uid(), left(trim(p_nickname), 30));
  return v_code;
end $$;

create or replace function public.join_room(p_code text, p_nickname text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'Oturum yok'; end if;
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'Oda bulunamadı'; end if;

  if exists (select 1 from room_players where room_id = v_room.id and user_id = auth.uid()) then
    update room_players set nickname = left(trim(p_nickname), 30)
      where room_id = v_room.id and user_id = auth.uid();
    return v_room.id;
  end if;

  if v_room.status <> 'lobby' then raise exception 'Oyun başladı, artık katılamazsın'; end if;
  if (select count(*) from room_players where room_id = v_room.id) >= 12 then raise exception 'Oda dolu'; end if;

  insert into room_players (room_id, user_id, nickname) values (v_room.id, auth.uid(), left(trim(p_nickname), 30));
  return v_room.id;
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

-- Finali (yeniden) başlatır: herkes aynı anda izlesin diye birkaç saniye sonrasına ayarlanır
create or replace function public.start_finale(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and host_id = auth.uid() and status in ('recording','finale')) then
    raise exception 'Sadece oda sahibi finali başlatabilir';
  end if;
  update rooms set status = 'finale', finale_at = now() + interval '6 seconds' where id = p_room;
end $$;

-- Yeni tur: lobiye dön, kayıtları sil. Oyuncuların kendi seçtiği karakterler korunur,
-- otomatik atananlar boşa çıkar.
create or replace function public.reset_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and host_id = auth.uid()) then
    raise exception 'Sadece oda sahibi';
  end if;
  delete from recordings where room_id = p_room;
  delete from room_roles where room_id = p_room and not picked;
  update room_players set done = false where room_id = p_room;
  update rooms set status = 'lobby', finale_at = null where id = p_room;
end $$;

revoke all on function public._new_room_code() from public, anon, authenticated;
grant execute on function public.server_now()                          to authenticated;
grant execute on function public.create_room(uuid, text)               to authenticated;
grant execute on function public.join_room(text, text)                 to authenticated;
grant execute on function public.leave_room(uuid)                      to authenticated;
grant execute on function public.change_scene(uuid, uuid)              to authenticated;
grant execute on function public.start_game(uuid)                      to authenticated;
grant execute on function public.save_recording(uuid, uuid, text, double precision) to authenticated;
grant execute on function public.start_finale(uuid)                    to authenticated;
grant execute on function public.reset_room(uuid)                      to authenticated;
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
