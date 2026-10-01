/**
 * Discord slash komutları: /dublaj, /baglan, /liderlik, /profil, /ekipler
 *
 * Discord Developer Portal → Uygulaman → "Interactions Endpoint URL" = https://SİTEN/api/discord
 * Gerekli ortam değişkenleri (Vercel):
 *   DISCORD_PUBLIC_KEY          — uygulamanın "Public Key"i (imza doğrulama)
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase → Project Settings → API → service_role (SADECE sunucuda)
 * Komutları bir kez kaydetmek için: node scripts/discord-komutlari.mjs
 */

const KEY = process.env.DISCORD_PUBLIC_KEY ?? "";
const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ORANGE = 0xff7a1a;
const EPHEMERAL = 64;

const MODE_NAMES: Record<string, string> = { klasik: "Klasik", kulak: "Kulaktan kulağa", zincir: "Taklit zinciri", senarist: "Senarist", duello: "Düello" };

function hex(s: string) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

let keyP: Promise<CryptoKey> | null = null;
async function verify(req: Request, body: string) {
  const sig = req.headers.get("x-signature-ed25519");
  const ts = req.headers.get("x-signature-timestamp");
  if (!sig || !ts || !KEY) return false;
  try {
    keyP ??= crypto.subtle.importKey("raw", hex(KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", await keyP, hex(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>, service = false): Promise<{ data?: T; error?: string }> {
  const key = service ? SERVICE : ANON;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { error: (json && (json.message as string)) || `Hata (${res.status})` };
    return { data: json as T };
  } catch {
    return { error: "Veritabanına ulaşılamadı" };
  }
}

async function rest<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const json = (b: unknown) => Response.json(b);
const reply = (data: Record<string, unknown>) => json({ type: 4, data: { allowed_mentions: { parse: [] }, ...data } });
const whisper = (content: string) => reply({ content, flags: EPHEMERAL });
const storage = (bucket: string, path?: string | null) => (path ? `${SB_URL}/storage/v1/object/public/${bucket}/${path}` : undefined);

type Opt = { name: string; value?: string; focused?: boolean };
type Interaction = {
  type: number;
  data?: { name: string; options?: Opt[] };
  member?: { user?: { id: string } };
  user?: { id: string };
};

export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verify(req, body))) return new Response("imza geçersiz", { status: 401 });
  const it = JSON.parse(body) as Interaction;
  if (it.type === 1) return json({ type: 1 }); // PING

  const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
  const discordId = it.member?.user?.id ?? it.user?.id ?? "";
  const opt = (n: string) => it.data?.options?.find((o) => o.name === n)?.value;

  // Sahne adı otomatik tamamlama
  if (it.type === 4) {
    const q = it.data?.options?.find((o) => o.focused)?.value ?? "";
    const { data } = await rpc<{ id: string; title: string; role_count: number; dub_count: number }[]>("list_scenes", { p_q: q || null, p_sort: "populer", p_limit: 25 });
    return json({
      type: 8,
      data: { choices: (data ?? []).slice(0, 25).map((s) => ({ name: `${s.title} · ${s.role_count} karakter`.slice(0, 100), value: s.id })) },
    });
  }
  if (it.type !== 2 || !it.data) return whisper("Bilinmeyen istek.");
  if (!SB_URL || !ANON) return whisper("Sunucu ayarları eksik (Supabase).");

  switch (it.data.name) {
    case "baglan": {
      if (!SERVICE) return whisper("Sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil.");
      const { data, error } = await rpc<string>("discord_link", { p_code: opt("kod") ?? "", p_discord_id: discordId }, true);
      if (error) return whisper(`Bağlanamadı: ${error}`);
      return whisper(`Bağlandı! Discord hesabın artık **${data}** profiline bağlı. \`/dublaj\` ile oda kurabilirsin.`);
    }

    case "dublaj": {
      if (!SERVICE) return whisper("Sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil.");
      const scene = opt("sahne");
      const mode = opt("mod") ?? "klasik";
      const { data, error } = await rpc<{ code: string; title: string; host: string; thumb_path: string | null }>(
        "discord_create_room",
        { p_discord_id: discordId, p_scene: scene && /^[0-9a-f-]{36}$/i.test(scene) ? scene : null, p_mode: mode },
        true,
      );
      if (error)
        return whisper(
          /BAGLI_DEGIL/.test(error)
            ? `Önce hesabını bağla: ${site} → Profil → **Profili düzenle** → **Discord'u bağla**, sonra burada \`/baglan kod:XXXXXX\` yaz.`
            : `Oda kurulamadı: ${error}`,
        );
      const url = `${site}/oda/${data!.code}`;
      return reply({
        embeds: [
          {
            title: `${mode === "kulak" ? "👂" : "🎬"} ${data!.title}`,
            url,
            description:
              mode === "kulak"
                ? `**${data!.host}** bir kulaktan kulağa oyunu kurdu. Sahne yok; gel, fısıltıyı sen de bozalım!`
                : `**${data!.host}** bir dublaj odası kurdu. Gel, karakterini seç!`,
            color: ORANGE,
            fields: [
              { name: "Oda kodu", value: `\`${data!.code}\``, inline: true },
              { name: "Mod", value: MODE_NAMES[mode] ?? "Klasik", inline: true },
            ],
            image: data!.thumb_path ? { url: storage("scenes", data!.thumb_path) } : undefined,
            footer: { text: "fam-io" },
          },
        ],
        components: [{ type: 1, components: [{ type: 2, style: 5, label: "Odaya katıl", url }] }],
      });
    }

    case "liderlik": {
      const { data } = await rpc<{ display_name: string; xp: number; dubs: number; team_tag: string | null }[]>("leaderboard", { p_period: "week", p_limit: 10 });
      const rows = data ?? [];
      const medals = ["🥇", "🥈", "🥉"];
      return reply({
        embeds: [
          {
            title: "🏆 Bu haftanın liderleri",
            url: `${site}/liderlik`,
            color: ORANGE,
            description: rows.length
              ? rows.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} ${r.team_tag ? `\`[${r.team_tag}]\` ` : ""}${r.display_name} — **${r.xp} XP** · ${r.dubs} dublaj`).join("\n")
              : "Bu hafta henüz kimse puan almadı. İlk sırayı kap!",
            footer: { text: "Pazartesi sıfırlanır · birinci Haftanın Sesi rozetini alır" },
          },
        ],
      });
    }

    case "ekipler": {
      const { data } = await rpc<{ name: string; tag: string; members: number; xp: number; slug: string }[]>("team_board", { p_period: "week" });
      const rows = (data ?? []).slice(0, 10);
      return reply({
        embeds: [
          {
            title: "🛡️ Haftalık ekip ligi",
            url: `${site}/ekipler`,
            color: ORANGE,
            description: rows.length ? rows.map((r, i) => `**${i + 1}.** \`[${r.tag}]\` ${r.name} — **${r.xp} XP** · ${r.members} üye`).join("\n") : "Henüz ekip yok.",
          },
        ],
      });
    }

    case "profil": {
      const u = (opt("kullanici") ?? "").trim().toLowerCase().replace(/^@/, "");
      if (!/^[a-z0-9_.]{3,20}$/.test(u)) return whisper("Geçerli bir kullanıcı adı yaz.");
      const rows = await rest<{ id: string; username: string; display_name: string; bio: string | null; xp: number; streak: number; best_streak: number; avatar_path: string | null; color: string }[]>(
        `profiles?username=eq.${u}&select=id,username,display_name,bio,xp,streak,best_streak,avatar_path,color`,
      );
      const p = rows?.[0];
      if (!p) return whisper(`@${u} adında bir kullanıcı yok.`);
      let level = 1;
      let need = 100;
      let rest_ = p.xp;
      while (rest_ >= need) {
        rest_ -= need;
        level++;
        need = 100 + (level - 1) * 50;
      }
      const dubs = await rest<{ dub_id: string }[]>(`dub_participants?user_id=eq.${p.id}&select=dub_id`);
      return reply({
        embeds: [
          {
            title: `${p.display_name} (@${p.username})`,
            url: `${site}/u/${p.username}`,
            description: p.bio ?? undefined,
            color: parseInt(p.color.slice(1), 16) || ORANGE,
            thumbnail: p.avatar_path ? { url: storage("avatars", p.avatar_path) } : undefined,
            fields: [
              { name: "Level", value: `${level}`, inline: true },
              { name: "XP", value: `${p.xp}`, inline: true },
              { name: "Dublaj", value: `${dubs?.length ?? 0}`, inline: true },
              { name: "En iyi seri", value: `${p.best_streak} gün`, inline: true },
            ],
          },
        ],
      });
    }
  }
  return whisper("Bu komutu tanımıyorum.");
}
