-- ============================================================
-- fam-io 0.7.0 — OYUN KUR (sahne seçmeden oda) + KULAKTAN KULAĞA (sahnesiz cümle zinciri)
-- Mevcut kurulum için Supabase SQL Editor'da bir kez çalıştır (tekrar çalıştırılabilir).
-- 006 daha önce çalıştırılmış olmalı.
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
