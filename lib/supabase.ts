"use client";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı değil (.env.local dosyasına bak).",
      );
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/**
 * Giriş yapmış (profilli) kullanıcıyı döndürür. Oturum yoksa giriş sayfasına yönlendirir.
 * Eski sürümden kalan anonim oturumlar kapatılır.
 */
export async function ensureUser(): Promise<User> {
  const { data } = await sb().auth.getSession();
  const user = data.session?.user;
  if (user && !user.is_anonymous) return user;
  if (user?.is_anonymous) await sb().auth.signOut();
  if (typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    window.location.replace(`/hesap?next=${encodeURIComponent(next)}`);
  }
  throw new Error("Devam etmek için giriş yapman gerekiyor.");
}

export type Bucket = "scenes" | "recordings" | "avatars";

/** Herkese açık dosya adresi (istemci gerektirmez; sunucuda da çalışır) */
export function publicUrl(bucket: Bucket, path: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export const avatarUrl = (path?: string | null) => (path ? publicUrl("avatars", path) : null);

/** Supabase sunucu saatiyle yerel saat arasındaki fark (ms). serverNow ≈ Date.now() + offset */
let offsetPromise: Promise<number> | null = null;
export function serverOffset(): Promise<number> {
  if (!offsetPromise) {
    offsetPromise = (async () => {
      let best = { rtt: Infinity, offset: 0 };
      for (let i = 0; i < 4; i++) {
        const t0 = Date.now();
        const { data, error } = await sb().rpc("server_now");
        const t1 = Date.now();
        if (error || !data) continue;
        const server = new Date(data as string).getTime();
        const rtt = t1 - t0;
        if (rtt < best.rtt) best = { rtt, offset: server - (t0 + t1) / 2 };
      }
      return best.offset;
    })();
  }
  return offsetPromise;
}

const MIGRATION_HINT: [RegExp, string][] = [
  [/create_game|phone_|kulak|scene_id.*null|rooms_mode_check/i, "007_oyun_kur_kulaktan_kulaga.sql"],
  [/set_room_mode|claim_foley|write_line|finish_writing|save_foley|duel_|room_cards|room_secrets|room_foley|room_line_texts|dub_cards|dub_secrets|dub_foley|dub_line_texts|reveal_impostor|post_results|mode_stats|shop_items|user_items|buy_item|equip_item|profile_comments|banner_path|voice_path|equipped|teams|team_|create_team|join_team|leave_team|discord_link|'rooms' and|mode_state|foley_user/i, "006_modlar_magaza_ekipler.sql"],
  [/claim_role|release_role|column .*picked/i, "002_karakter_secimi.sql"],
  [/'scenes' and 'profiles'|list_scenes|popular_tags|leaderboard|creator_|kick_player|set_room_lock|transfer_host|is_admin|admin_|storage_orphans|avatar_path|thumb_path|tags|locked|banned/i, "005_creator_liderlik_yonetim.sql"],
  [/set_recording_effect|cast_vote|badge_stats|dub_votes|user_badges|effect/i, "004_efekt_oylama_rozet_discord.sql"],
  [/profiles|dub_|username_available|compat_for|current_dub_id/i, "003_profiller_ve_sosyal.sql"],
];

export function errMsg(e: unknown): string {
  if (!e) return "Bilinmeyen hata";
  let msg: string;
  if (typeof e === "string") msg = e;
  else if (typeof e === "object" && "message" in e) msg = String((e as { message: unknown }).message);
  else msg = String(e);
  // Supabase'de fonksiyon/tablo yoksa: migration çalıştırılmamış demektir
  if (/could not find the function|schema cache|does not exist|PGRST20[2-5]/i.test(msg)) {
    const file = MIGRATION_HINT.find(([re]) => re.test(msg))?.[1];
    return `Veritabanı güncel değil. Supabase SQL Editor'da ${file ? `supabase/migrations/${file}` : "supabase/migrations klasöründeki dosyaları"} çalıştır. (${msg})`;
  }
  return msg;
}
