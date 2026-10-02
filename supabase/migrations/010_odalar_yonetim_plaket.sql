-- ============================================================
-- fam-io 0.9.0 — ODA VARLIĞI, OTOMATİK KAPANMA, AKTİF ODALAR, YÖNETİM, PLAKETLER, SAHNE SESİ
-- Mevcut kurulum için Supabase SQL Editor'da bir kez çalıştır (tekrar çalıştırılabilir).
-- 009 daha önce çalıştırılmış olmalı.
--
--  1) Odadaki herkes 20 saniyede bir "buradayım" der (room_ping). Uzun süre ses vermeyen
--     oyuncu odadan düşer (lobide 2 dk, oyunda 5 dk); oda boşalınca kendiliğinden silinir.
--     Ayrılma (leave_room) artık her aşamada çalışır; oda sahibi ayrılırsa sahiplik devredilir.
--  2) Açık / gizli lobi: rooms.is_public. Açık odalar /odalar sayfasında listelenir.
--  3) Yönetim: XP ekle/çıkar/ayarla, bakiye, eşya ver/al, profil düzelt, mağaza fiyatları, odaları kapat.
--  4) Plaketler veritabanından: isim, yazı, renkler yönetim panelinden.
--  5) Sahnelerde orijinal ses artık sadece replik anlarında kısılır; seviye %0–200.
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
