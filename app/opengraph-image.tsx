import { ImageResponse } from "next/og";
import { C, OG_SIZE, OgLogo, ogFonts } from "@/lib/og/shared";

export const alt = "fam-io — Arkadaşlarla dublaj";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const fonts = await ogFonts();
  const bars = [40, 90, 150, 70, 210, 130, 260, 110, 190, 80, 230, 140, 60, 170, 100, 45];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, fontFamily: "Geist", color: C.fg, padding: 72 }}>
        <OgLogo size={44} />
        <div style={{ marginTop: 70, display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 600, lineHeight: 1.04, letterSpacing: -3 }}>
          <span>Sahneyi seç.</span>
          <span>Karakterini al.</span>
          <span style={{ color: C.accent }}>Sesini ver.</span>
        </div>
        <div style={{ marginTop: "auto", fontSize: 26, color: C.fg2 }}>Arkadaşlarınla film sahnelerini seslendir, finali birlikte izle.</div>
        <div style={{ position: "absolute", right: 72, top: 150, display: "flex", alignItems: "center", gap: 12, height: 300 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ width: 14, height: h, borderRadius: 7, background: i % 4 === 1 ? C.accent : "#26262b" }} />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
