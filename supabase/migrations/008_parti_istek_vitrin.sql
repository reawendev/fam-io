-- ============================================================
-- fam-io 0.8.0 — PARTİ MODLARI (Kim konuştu?, Efekt yarışması, Duygu ruleti, Sesli hikâye),
-- LOBİ EFEKT DÜĞMELERİ, SAHNE İSTEK PANOSU, PROFİL VİTRİNİ
-- Mevcut kurulum için Supabase SQL Editor'da bir kez çalıştır (tekrar çalıştırılabilir).
-- 007 daha önce çalıştırılmış olmalı.
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
