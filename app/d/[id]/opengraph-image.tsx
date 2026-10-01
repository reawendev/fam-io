import { ImageResponse } from "next/og";
import { C, imageData, OG_SIZE, OgAvatar, OgLogo, ogFonts, rest } from "@/lib/og/shared";

export const alt = "fam-io dublajı";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 300;

type P = { display_name: string; color: string; avatar_path: string | null };
type Row = {
  like_count: number;
  comment_count: number;
  scenes: { title: string; thumb_path: string | null; creator: P | null } | null;
  dub_participants: { profiles: P | null }[];
};

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = /^[0-9a-f-]{36}$/i.test(id)
    ? await rest<Row[]>(
        `dubs?id=eq.${id}&select=like_count,comment_count,scenes(title,thumb_path,creator:profiles(display_name,color,avatar_path)),dub_participants(profiles(display_name,color,avatar_path))`,
      )
    : null;
  const d = rows?.[0] ?? null;
  const people = (d?.dub_participants ?? []).map((p) => p.profiles).filter((p): p is P => !!p).slice(0, 5);
  const [thumb, fonts, ...avatars] = await Promise.all([
    imageData("scenes", d?.scenes?.thumb_path),
    ogFonts(),
    ...people.map((p) => imageData("avatars", p.avatar_path, 300_000)),
  ]);
  const title = d?.scenes?.title ?? "Dublaj";
  const names = people.map((p) => p.display_name);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: C.bg, fontFamily: "Geist", color: C.fg }}>
        {/* Sol: sahne karesi */}
        <div style={{ width: 640, height: "100%", display: "flex", position: "relative", background: "#000" }}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} width={640} height={630} alt="" style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
              {[60, 140, 90, 200, 120, 70, 160, 100, 50].map((h, i) => (
                <div key={i} style={{ width: 18, height: h, borderRadius: 9, background: i % 3 === 0 ? C.accent : "#2a2a30" }} />
              ))}
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(90deg, rgba(10,10,11,0) 55%, #0a0a0b 100%)" }} />
          <div
            style={{
              position: "absolute",
              left: 32,
              bottom: 32,
              width: 88,
              height: 88,
              borderRadius: 88,
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" style={{ marginLeft: 6 }}>
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="#1c0e02" />
            </svg>
          </div>
        </div>

        {/* Sağ: bilgiler */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "52px 56px 48px 40px" }}>
          <OgLogo size={36} />
          <div style={{ marginTop: 46, fontSize: 18, letterSpacing: 2, color: C.muted, textTransform: "uppercase" }}>Dublaj</div>
          <div style={{ marginTop: 12, fontSize: title.length > 34 ? 44 : 54, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.5, display: "flex" }}>
            {title.length > 70 ? title.slice(0, 68) + "…" : title}
          </div>
          <div style={{ marginTop: 32, display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex" }}>
              {people.map((p, i) => (
                <div key={i} style={{ display: "flex", marginLeft: i ? -14 : 0 }}>
                  <OgAvatar name={p.display_name} color={p.color} src={avatars[i] ?? null} size={56} />
                </div>
              ))}
            </div>
            <div style={{ marginLeft: 16, fontSize: 24, color: C.fg2, display: "flex", maxWidth: 330 }}>
              {names.length ? (names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ")) : "fam-io"}
            </div>
          </div>
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 28, fontSize: 22, color: C.muted }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3 1.7-1.8 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill={C.accent} />
              </svg>
              {d?.like_count ?? 0}
            </div>
            <div style={{ display: "flex" }}>{d?.comment_count ?? 0} yorum</div>
            {d?.scenes?.creator && <div style={{ display: "flex", marginLeft: "auto", fontSize: 20 }}>Sahne: {d.scenes.creator.display_name}</div>}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
