import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Paylaşım görselleri (next/og) için ortak yardımcılar — sadece sunucuda çalışır */

export const OG_SIZE = { width: 1200, height: 630 };

let fontsP: Promise<{ name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]> | null = null;
export function ogFonts() {
  if (!fontsP) {
    const dir = join(process.cwd(), "assets/fonts");
    fontsP = Promise.all([
      readFile(join(dir, "Geist-Regular.ttf")).then((data) => ({ name: "Geist", data, weight: 400 as const, style: "normal" as const })),
      readFile(join(dir, "Geist-SemiBold.ttf")).then((data) => ({ name: "Geist", data, weight: 600 as const, style: "normal" as const })),
    ]);
  }
  return fontsP;
}

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export async function rest<T>(path: string): Promise<T | null> {
  const env = supabaseEnv();
  if (!env) return null;
  try {
    const res = await fetch(`${env.url}/rest/v1/${path}`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Görseli indirip data: URL yapar. Sadece PNG/JPEG kabul edilir (görsel üretici WebP okuyamıyor);
 * başarısızsa null döner ki görsel yine de üretilsin.
 */
export async function imageData(bucket: string, path?: string | null, maxBytes = 1_500_000): Promise<string | null> {
  const env = supabaseEnv();
  if (!env || !path) return null;
  try {
    const res = await fetch(`${env.url}/storage/v1/object/public/${bucket}/${path}`, { next: { revalidate: 3600 } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/image\/(png|jpe?g)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export const C = {
  bg: "#0a0a0b",
  surface: "#111113",
  line: "#2e2e33",
  fg: "#ededee",
  fg2: "#b4b4bb",
  muted: "#7d7d86",
  accent: "#ff7a1a",
};

/** fam-io logosu (ses dalgası) */
export function OgLogo({ size = 40 }: { size?: number }) {
  const s = size / 22;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6 * s,
          background: "#18181b",
          border: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5 * s,
        }}
      >
        {[5, 11, 7, 3].map((h, i) => (
          <div key={i} style={{ width: 2 * s, height: h * s, borderRadius: s, background: i < 2 ? C.accent : C.fg }} />
        ))}
      </div>
      <div style={{ fontSize: size * 0.7, fontWeight: 600, color: C.fg, letterSpacing: -0.5 }}>fam-io</div>
    </div>
  );
}

export function OgAvatar({ name, color, src, size }: { name: string; color: string; src: string | null; size: number }) {
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} width={size} height={size} alt="" style={{ borderRadius: size, border: `3px solid ${C.bg}`, objectFit: "cover" }} />;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        border: `3px solid ${C.bg}`,
        background: "#1f1f23",
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 600,
      }}
    >
      {name.slice(0, 1).toLocaleUpperCase("tr")}
    </div>
  );
}
