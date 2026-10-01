-- ============================================================
-- fam-io 0.8.1 — YENİ İSİM EFEKTLERİ (Aurora, Glitch) + GERÇEK SES DOSYALARI
-- Mevcut kurulum için Supabase SQL Editor'da bir kez çalıştır (tekrar çalıştırılabilir).
-- 008 daha önce çalıştırılmış olmalı.
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
