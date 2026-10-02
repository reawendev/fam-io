-- ============================================================
-- fam-io 0.9.1 — ODA DAVETLERİ + KAPANAN SAYFADA ODA AÇIK KALMA DÜZELTMESİ
-- Mevcut kurulum için Supabase SQL Editor'da bir kez çalıştır (tekrar çalıştırılabilir).
-- 010 daha önce çalıştırılmış olmalı.
--
--  1) Davetler: odadaki biri site üyelerini odaya çağırır; davet edilen her sayfada
--     anında bildirim alır, tek tıkla katılır (oda kilitli olsa bile).
--  2) Oda kuran sayfayı kapatınca / geri gidince oda listede asılı kalmıyor:
--     sayfa kapanırken room_away çağrılır (15 sn içinde düşer, sayfa yenilendiyse geri gelir),
--     Aktif odalar sadece son 50 sn'de ses veren odaları gösterir, 10 dakikalık bekleme kalktı.
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
