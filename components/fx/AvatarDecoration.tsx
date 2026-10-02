"use client";

import { useId } from "react";

/**
 * Discord tarzı avatar süslemeleri: profil fotoğrafının ÜSTÜNE taşan, hareketli SVG katmanı.
 * Avatarın yerleşimini değiştirmez (dışarı taşar); 120×120 kutuda avatar, merkezde r=44 dairedir.
 * Küçük boyutlarda (≤ 26 px) ayrıntılar gizlenir, sadece halka kalır.
 * Hareket azaltma tercihinde animasyonlar durur (globals.css → .deco).
 */

export const DECO_IDS = ["frame_altin", "frame_neon", "frame_ates", "frame_buz", "frame_gokkusagi", "frame_holo"] as const;

/** Avatar kutusuna göre süsleme kutusu: 120 / 88 */
export const DECO_SCALE = 120 / 88;

export default function AvatarDecoration({ id, size }: { id: string; size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const small = size <= 26;
  const box = Math.round(size * DECO_SCALE * 10) / 10;
  const off = Math.round(((box - size) / 2) * 10) / 10;
  const Body = BODIES[id];
  if (!Body) return null;
  return (
    <svg
      viewBox="0 0 120 120"
      width={box}
      height={box}
      className={`deco deco-${id.replace("frame_", "")}${small ? " deco-sm" : ""}`}
      style={{ position: "absolute", left: -off, top: -off, pointerEvents: "none", overflow: "visible", zIndex: 1 }}
      aria-hidden
    >
      <Body u={uid} />
    </svg>
  );
}

type B = (p: { u: string }) => React.ReactElement;

/** Merkez etrafında açıyla nokta */
const at = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [Math.round((60 + Math.cos(a) * r) * 100) / 100, Math.round((60 + Math.sin(a) * r) * 100) / 100] as const;
};

// ------------------------------------------------------------
// ALTIN DEFNE: altın halka, iki yanda defne dalları, tepede pırlanta; halkada gezen parıltı
// ------------------------------------------------------------
const Altin: B = ({ u }) => {
  const leaves = (side: 1 | -1) =>
    Array.from({ length: 7 }, (_, i) => {
      const deg = side === 1 ? 118 + i * 13 : 242 - i * 13;
      const [x, y] = at(deg, 49);
      const rot = deg + (side === 1 ? 35 : -35);
      return <ellipse key={`${side}${i}`} cx={x} cy={y} rx={2.6 + (i % 2) * 0.4} ry={6.4 - i * 0.25} transform={`rotate(${rot} ${x} ${y})`} />;
    });
  return (
    <>
      <defs>
        <linearGradient id={`ag${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset=".35" stopColor="#f3c544" />
          <stop offset=".65" stopColor="#b9800f" />
          <stop offset="1" stopColor="#ffe48a" />
        </linearGradient>
        <linearGradient id={`al${u}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#8a5a06" />
          <stop offset="1" stopColor="#ffd45a" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="46" fill="none" stroke={`url(#ag${u})`} strokeWidth="4.5" />
      <circle cx="60" cy="60" r="48.6" fill="none" stroke="#7a5208" strokeOpacity=".55" strokeWidth=".8" />
      {/* gezen parıltı */}
      <g className="deco-spin" style={{ animationDuration: "3.2s" }}>
        <circle cx="60" cy="60" r="46" fill="none" stroke="#fffbe6" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="10 279" opacity=".95" />
      </g>
      <g className="deco-detail" fill={`url(#al${u})`} stroke="#6b4705" strokeWidth=".5">
        {leaves(1)}
        {leaves(-1)}
      </g>
      {/* tepe: pırlanta */}
      <g className="deco-detail">
        <path d="M60 2.5 L67 10 L60 19 L53 10 Z" fill={`url(#ag${u})`} stroke="#6b4705" strokeWidth=".7" />
        <path d="M53 10 H67 M60 2.5 L57 10 L60 19 L63 10 Z" fill="none" stroke="#7a5208" strokeWidth=".5" opacity=".7" />
        <g className="deco-twinkle" style={{ transformOrigin: "66px 5px" }}>
          <path d="M66 0 L67.2 3.8 L71 5 L67.2 6.2 L66 10 L64.8 6.2 L61 5 L64.8 3.8 Z" fill="#fff" />
        </g>
      </g>
    </>
  );
};

// ------------------------------------------------------------
// NEON: pembe ve camgöbeği iki kırık halka, ters yönlere döner, ara ara titrer
// ------------------------------------------------------------
const Neon: B = ({ u }) => (
  <>
    <defs>
      <filter id={`ng${u}`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter={`url(#ng${u})`} className="deco-flicker">
      <g className="deco-spin" style={{ animationDuration: "9s" }}>
        <circle cx="60" cy="60" r="47" fill="none" stroke="#ff4fd8" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="70 18 22 18 60 107" />
      </g>
      <g className="deco-spin-rev" style={{ animationDuration: "7s" }}>
        <circle cx="60" cy="60" r="52.5" fill="none" stroke="#3ff0ff" strokeWidth="2" strokeLinecap="round" strokeDasharray="40 30 90 40 30 100" />
      </g>
    </g>
    <g className="deco-detail" fill="#fff">
      {[25, 160, 290].map((d, i) => {
        const [x, y] = at(d, 52.5);
        return <circle key={d} cx={x} cy={y} r="1.6" className="deco-twinkle" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.6}s` }} />;
      })}
    </g>
  </>
);

// ------------------------------------------------------------
// ALEV: avatarın etrafında titreyen alev dilleri ve yükselen kıvılcımlar
// ------------------------------------------------------------
const FLAME = "M0 0 C -5 -6 -6 -13 -1.5 -22 C -1 -15 3 -14 2.5 -9 C 5 -11 6 -15 5.5 -18 C 9 -11 7 -4 0 0 Z";
const Ates: B = ({ u }) => {
  const flames = [
    // [açı, ölçek, gecikme]
    [-62, 0.75, 0.1], [-44, 0.95, 0.35], [-25, 1.15, 0], [-8, 1.35, 0.25], [10, 1.25, 0.5], [28, 1.1, 0.15], [46, 0.9, 0.4], [64, 0.7, 0.05],
    [-82, 0.55, 0.3], [82, 0.55, 0.2], [-110, 0.45, 0.45], [110, 0.45, 0.1],
  ] as const;
  return (
    <>
      <defs>
        <linearGradient id={`fg${u}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff3b0a" />
          <stop offset=".45" stopColor="#ff8a00" />
          <stop offset="1" stopColor="#ffe45c" />
        </linearGradient>
        <radialGradient id={`fr${u}`} cx=".5" cy=".5" r=".5">
          <stop offset=".78" stopColor="#ff6a00" stopOpacity="0" />
          <stop offset=".88" stopColor="#ff6a00" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff6a00" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill={`url(#fr${u})`} className="deco-pulse" />
      <circle cx="60" cy="60" r="45.5" fill="none" stroke={`url(#fg${u})`} strokeWidth="3" />
      <g className="deco-detail">
        {flames.map(([deg, s, d]) => {
          const [x, y] = at(deg, 44);
          return (
            <g key={deg} transform={`translate(${x} ${y}) rotate(${deg}) scale(${s})`}>
              <path d={FLAME} fill={`url(#fg${u})`} className="deco-flame" style={{ animationDelay: `${d}s` }} />
            </g>
          );
        })}
        {[
          [-30, 0], [15, 0.8], [40, 1.5], [-55, 2.1],
        ].map(([deg, d]) => {
          const [x, y] = at(deg, 50);
          return <circle key={deg} cx={x} cy={y} r="1.3" fill="#ffd27a" className="deco-ember" style={{ animationDelay: `${d}s` }} />;
        })}
      </g>
    </>
  );
};

// ------------------------------------------------------------
// BUZ: buzlu halka, köşelerde kristal kümeleri, süzülen kar taneleri
// ------------------------------------------------------------
const shard = (deg: number, r: number, len: number, w: number, k: string, fill: string) => {
  const [x, y] = at(deg, r);
  return <path key={k} d={`M0 ${-len} L${w} 0 L0 ${len * 0.18} L${-w} 0 Z`} transform={`translate(${x} ${y}) rotate(${deg})`} fill={fill} stroke="#e0f7ff" strokeWidth=".5" />;
};
const SNOW = "M0 -3 V3 M-2.6 -1.5 L2.6 1.5 M-2.6 1.5 L2.6 -1.5";
const Buz: B = ({ u }) => (
  <>
    <defs>
      <linearGradient id={`ig${u}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f0fbff" />
        <stop offset=".4" stopColor="#8fdcff" />
        <stop offset=".7" stopColor="#3ba7e0" />
        <stop offset="1" stopColor="#d6f3ff" />
      </linearGradient>
      <linearGradient id={`is${u}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
        <stop offset="1" stopColor="#7cd3ff" stopOpacity=".75" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="46" fill="none" stroke={`url(#ig${u})`} strokeWidth="4" />
    <circle cx="60" cy="60" r="46" fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="2 9" opacity=".7" />
    <g className="deco-spin" style={{ animationDuration: "6s" }}>
      <circle cx="60" cy="60" r="46" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 283" />
    </g>
    <g className="deco-detail">
      {/* sol üst küme */}
      {shard(-38, 48, 13, 3.4, "a", `url(#is${u})`)}
      {shard(-52, 47, 9, 2.6, "b", `url(#is${u})`)}
      {shard(-24, 48, 8, 2.4, "c", `url(#is${u})`)}
      {/* sağ alt küme */}
      {shard(142, 48, 12, 3.2, "d", `url(#is${u})`)}
      {shard(128, 47, 8, 2.4, "e", `url(#is${u})`)}
      {shard(156, 47, 9, 2.6, "f", `url(#is${u})`)}
      {/* sarkıtlar */}
      {[176, 186, 196].map((d, i) => shard(d, 47, 6 + (i % 2) * 3, 1.8, `g${i}`, `url(#is${u})`))}
      {/* kar taneleri */}
      {[
        [22, 18, 0], [98, 14, 1.4], [104, 70, 2.6], [12, 64, 0.8],
      ].map(([x, y, d]) => (
        <g key={`${x}`} transform={`translate(${x} ${y})`}>
          <path d={SNOW} stroke="#eaf9ff" strokeWidth="1" strokeLinecap="round" className="deco-snow" style={{ animationDelay: `${d}s` }} />
        </g>
      ))}
    </g>
  </>
);

// ------------------------------------------------------------
// GÖKKUŞAĞI: dönen renk halkası, altta iki bulut, yıldızlar
// ------------------------------------------------------------
const RAINBOW = ["#ff5f6d", "#ffb347", "#ffe66d", "#7be38a", "#4fc3ff", "#8f7cff", "#ff7ce5"];
const Gokkusagi: B = () => {
  const seg = Math.round(((2 * Math.PI * 46) / RAINBOW.length) * 100) / 100;
  return (
    <>
      <g className="deco-spin" style={{ animationDuration: "5s" }}>
        {RAINBOW.map((c, i) => (
          <circle
            key={c}
            cx="60"
            cy="60"
            r="46"
            fill="none"
            stroke={c}
            strokeWidth="4.5"
            strokeDasharray={`${(seg + 0.6).toFixed(2)} ${(289.03 - seg - 0.6).toFixed(2)}`}
            strokeDashoffset={(-i * seg).toFixed(2)}
          />
        ))}
      </g>
      <g className="deco-detail">
        <g className="deco-bob">
          <path d="M8 92 a7 7 0 0 1 9 -7 a9 9 0 0 1 16 2 a6 6 0 0 1 2 11 h-25 a6 6 0 0 1 -2 -6 z" fill="#fff" stroke="#dfe7ff" strokeWidth=".8" />
        </g>
        <g className="deco-bob" style={{ animationDelay: "1.2s" }}>
          <path d="M86 100 a6 6 0 0 1 8 -6 a8 8 0 0 1 14 2 a5 5 0 0 1 2 9 h-22 a5 5 0 0 1 -2 -5 z" fill="#fff" stroke="#dfe7ff" strokeWidth=".8" />
        </g>
        {[
          [100, 16, 0, "#ffe66d"], [16, 22, 0.9, "#ff7ce5"], [108, 56, 1.6, "#4fc3ff"],
        ].map(([x, y, d, c]) => (
          <g key={`${x}`} className="deco-twinkle" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${d}s` }}>
            <path d={`M${x} ${(y as number) - 5} L${(x as number) + 1.3} ${(y as number) - 1.3} L${(x as number) + 5} ${y} L${(x as number) + 1.3} ${(y as number) + 1.3} L${x} ${(y as number) + 5} L${(x as number) - 1.3} ${(y as number) + 1.3} L${(x as number) - 5} ${y} L${(x as number) - 1.3} ${(y as number) - 1.3} Z`} fill={c as string} />
          </g>
        ))}
      </g>
    </>
  );
};

// ------------------------------------------------------------
// HOLOGRAM: yanardöner halka, etrafında dönen uydu ve yörünge, parlayan yıldızlar
// ------------------------------------------------------------
const Holo: B = ({ u }) => (
  <>
    <defs>
      <linearGradient id={`hg${u}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff7a1a" />
        <stop offset=".25" stopColor="#f472b6" />
        <stop offset=".5" stopColor="#a78bfa" />
        <stop offset=".75" stopColor="#38bdf8" />
        <stop offset="1" stopColor="#a3e635" />
      </linearGradient>
      <filter id={`hb${u}`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
    </defs>
    <g className="deco-spin" style={{ animationDuration: "6s" }}>
      <circle cx="60" cy="60" r="46" fill="none" stroke={`url(#hg${u})`} strokeWidth="4" />
      <circle cx="60" cy="60" r="46" fill="none" stroke={`url(#hg${u})`} strokeWidth="4" filter={`url(#hb${u})`} opacity=".8" />
    </g>
    <g className="deco-detail">
      <circle cx="60" cy="60" r="54" fill="none" stroke={`url(#hg${u})`} strokeWidth=".8" strokeDasharray="1 5" opacity=".8" />
      <g className="deco-spin-rev" style={{ animationDuration: "4.5s" }}>
        <circle cx="60" cy="6" r="3.4" fill="#fff" />
        <circle cx="60" cy="6" r="6" fill="#a78bfa" opacity=".35" filter={`url(#hb${u})`} />
      </g>
      {[
        [14, 14, 0], [106, 20, 0.7], [104, 104, 1.3], [12, 100, 1.9],
      ].map(([x, y, d]) => (
        <g key={`${x}${y}`} className="deco-twinkle" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${d}s` }}>
          <path d={`M${x} ${y - 6} Q${x} ${y} ${x + 6} ${y} Q${x} ${y} ${x} ${y + 6} Q${x} ${y} ${x - 6} ${y} Q${x} ${y} ${x} ${y - 6} Z`} fill="#fff" />
        </g>
      ))}
    </g>
  </>
);

const BODIES: Record<string, B> = {
  frame_altin: Altin,
  frame_neon: Neon,
  frame_ates: Ates,
  frame_buz: Buz,
  frame_gokkusagi: Gokkusagi,
  frame_holo: Holo,
};
