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

let userPromise: Promise<User> | null = null;

/** Anonim oturum açar (kayıt/şifre yok). Aynı tarayıcı hep aynı kullanıcıdır. */
export function ensureUser(): Promise<User> {
  if (!userPromise) {
    userPromise = (async () => {
      const { data } = await sb().auth.getSession();
      if (data.session?.user) return data.session.user;
      const { data: d, error } = await sb().auth.signInAnonymously();
      if (error || !d.user) {
        userPromise = null;
        throw new Error(
          "Anonim giriş başarısız. Supabase > Authentication > Sign In / Providers > 'Allow anonymous sign-ins' açık mı? " +
            (error?.message ?? ""),
        );
      }
      return d.user;
    })();
  }
  return userPromise;
}

export function publicUrl(bucket: "scenes" | "recordings", path: string) {
  return sb().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

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

export function errMsg(e: unknown): string {
  if (!e) return "Bilinmeyen hata";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
