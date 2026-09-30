-- ============================================================
-- 004 — Ses efektleri, final oylaması, rozetler, Discord bildirimi
-- Mevcut kurulumu güncellemek için SQL Editor'da bir kez çalıştır (003'ten sonra).
-- Tekrar çalıştırılabilir.
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
