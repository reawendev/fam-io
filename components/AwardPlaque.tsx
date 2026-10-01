"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";

/**
 * Hologramlı ödül plaketi. Fareyle üzerine gelince 3D eğilir, renkli parıltı imleci takip eder;
 * boştayken parıltı yavaşça döner. Özel rozetler (ör. Kurucu) için profilde gösterilir.
 * Hareket azaltma tercihinde eğilme ve animasyon kapanır.
 */

export type PlaqueTone = "gold" | "silver" | "bronze";

const TONES: Record<PlaqueTone, { bg: [string, string]; ink: string; sub: string; line: string }> = {
  gold: { bg: ["#f8e9b5", "#e8c66e"], ink: "#4a3508", sub: "#7a5a17", line: "#b8913a" },
  silver: { bg: ["#f1f1f3", "#c9ccd3"], ink: "#2c2f36", sub: "#5c616c", line: "#9aa0aa" },
  bronze: { bg: ["#f6d7b4", "#d79a63"], ink: "#4a2a10", sub: "#7a4a22", line: "#b0743f" },
};

const IDENTITY = "1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1";
const MAX_ROT = 0.25;
const MIN_ROT = -0.25;
const MAX_SCALE = 1;
const MIN_SCALE = 0.97;
const OVERLAYS = [
  "hsl(358, 100%, 62%)",
  "hsl(30, 100%, 50%)",
  "hsl(60, 100%, 50%)",
  "hsl(96, 100%, 50%)",
  "hsl(233, 85%, 47%)",
  "hsl(271, 85%, 47%)",
  "hsl(300, 20%, 35%)",
  "transparent",
  "transparent",
  "white",
];

type Timer = ReturnType<typeof setTimeout> | null;

export default function AwardPlaque({
  eyebrow,
  title,
  tone = "gold",
  className,
}: {
  eyebrow: string;
  title: string;
  tone?: PlaqueTone;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [overlayPos, setOverlayPos] = useState(0);
  const [matrix, setMatrix] = useState(IDENTITY);
  const [currentMatrix, setCurrentMatrix] = useState(IDENTITY);
  const [noInOutAnim, setNoInOutAnim] = useState(true);
  const [noOverlayAnim, setNoOverlayAnim] = useState(false);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);
  const enterT = useRef<Timer>(null);
  const leaveT = useRef<Timer[]>([]);
  const t = TONES[tone];

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setStill(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (ready) setMatrix(currentMatrix);
  }, [currentMatrix, ready]);

  useEffect(
    () => () => {
      if (enterT.current) clearTimeout(enterT.current);
      leaveT.current.forEach((x) => x && clearTimeout(x));
    },
    [],
  );

  const dims = () => {
    const r = ref.current?.getBoundingClientRect();
    return { left: r?.left ?? 0, right: r?.right ?? 0, top: r?.top ?? 0, bottom: r?.bottom ?? 0 };
  };

  const getMatrix = (x: number, y: number) => {
    const { left, right, top, bottom } = dims();
    const xc = (left + right) / 2;
    const yc = (top + bottom) / 2;
    const scale = [
      MAX_SCALE - ((MAX_SCALE - MIN_SCALE) * Math.abs(xc - x)) / (xc - left),
      MAX_SCALE - ((MAX_SCALE - MIN_SCALE) * Math.abs(yc - y)) / (yc - top),
      MAX_SCALE - ((MAX_SCALE - MIN_SCALE) * (Math.abs(xc - x) + Math.abs(yc - y))) / (xc - left + yc - top),
    ];
    const r = {
      x1: 0.25 * ((yc - y) / yc - (xc - x) / xc),
      x2: MAX_ROT - ((MAX_ROT - MIN_ROT) * Math.abs(right - x)) / (right - left),
      y2: MAX_ROT - ((MAX_ROT - MIN_ROT) * (top - y)) / (top - bottom),
      z0: -(MAX_ROT - ((MAX_ROT - MIN_ROT) * Math.abs(right - x)) / (right - left)),
      z1: 0.2 - ((0.2 + 0.6) * (top - y)) / (top - bottom),
    };
    return `${scale[0]}, 0, ${r.z0}, 0, ${r.x1}, ${scale[1]}, ${r.z1}, 0, ${r.x2}, ${r.y2}, ${scale[2]}, 0, 0, 0, 0, 1`;
  };

  const getOpposite = (m: string, y: number, entering?: boolean) => {
    const { top, bottom } = dims();
    const oy = bottom - y + top;
    const weak = entering ? 0.7 : 4;
    const mul = entering ? -1 : 1;
    return m
      .split(", ")
      .map((item, i) => {
        if (i === 2 || i === 4 || i === 8) return (-parseFloat(item) * mul) / weak;
        if (i === 0 || i === 5 || i === 10) return "1";
        if (i === 6) return (mul * (MAX_ROT - ((MAX_ROT - MIN_ROT) * (top - oy)) / (top - bottom))) / weak;
        if (i === 9) return (MAX_ROT - ((MAX_ROT - MIN_ROT) * (top - oy)) / (top - bottom)) / weak;
        return item;
      })
      .join(", ");
  };

  const center = () => {
    const { left, right, top, bottom } = dims();
    return { xc: (left + right) / 2, yc: (top + bottom) / 2 };
  };

  function onEnter(e: MouseEvent) {
    if (still) return;
    leaveT.current.forEach((x) => x && clearTimeout(x));
    setNoOverlayAnim(true);
    const { xc, yc } = center();
    setNoInOutAnim(false);
    enterT.current = setTimeout(() => setNoInOutAnim(true), 350);
    requestAnimationFrame(() => requestAnimationFrame(() => setOverlayPos((Math.abs(xc - e.clientX) + Math.abs(yc - e.clientY)) / 1.5)));
    const opp = getOpposite(getMatrix(e.clientX, e.clientY), e.clientY, true);
    setMatrix(opp);
    setCurrentMatrix(opp);
    setReady(false);
    setTimeout(() => setReady(true), 200);
  }

  function onMove(e: MouseEvent) {
    if (still) return;
    const { xc, yc } = center();
    const x = e.clientX;
    const y = e.clientY;
    setTimeout(() => setOverlayPos((Math.abs(xc - x) + Math.abs(yc - y)) / 1.5), 150);
    // Giriş "zıplaması" bitince (ready) en son imleç konumu uygulanır
    setCurrentMatrix(getMatrix(x, y));
  }

  function onLeave(e: MouseEvent) {
    if (still) return;
    const opposite = getOpposite(matrix, e.clientY);
    if (enterT.current) clearTimeout(enterT.current);
    setCurrentMatrix(opposite);
    setTimeout(() => setCurrentMatrix(IDENTITY), 200);
    const pos = overlayPos;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setNoInOutAnim(false);
        leaveT.current = [
          setTimeout(() => setOverlayPos(-pos / 4), 150),
          setTimeout(() => setOverlayPos(0), 300),
          setTimeout(() => {
            setNoOverlayAnim(false);
            setNoInOutAnim(true);
          }, 500),
        ];
      }),
    );
  }

  const font = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${eyebrow}: ${title}`}
      title={`${eyebrow} · ${title}`}
      className={className ?? "block w-[220px] sm:w-[260px]"}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div
        style={{
          transform: `perspective(700px) matrix3d(${matrix})`,
          transformOrigin: "center center",
          transition: "transform 200ms ease-out",
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 54" className="block h-auto w-full drop-shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
          <defs>
            <filter id={`b${uid}`}>
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>
            <mask id={`m${uid}`}>
              <rect width="260" height="54" fill="white" rx="10" />
            </mask>
            <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={t.bg[0]} />
              <stop offset="1" stopColor={t.bg[1]} />
            </linearGradient>
          </defs>
          <rect width="260" height="54" rx="10" fill={`url(#g${uid})`} />
          <rect x="4" y="4" width="252" height="46" rx="8" fill="transparent" stroke={t.line} strokeOpacity="0.7" strokeWidth="1" />
          <text style={{ fontFamily: font, letterSpacing: "0.12em" }} fontSize="8.5" fontWeight="600" fill={t.sub} x="53" y="20">
            {eyebrow}
          </text>
          <text style={{ fontFamily: font, letterSpacing: "-0.01em" }} fontSize="17" fontWeight="600" fill={t.ink} x="52" y="40">
            {title}
          </text>

          {/* Defne + taç amblemi (fam-io'ya özel çizim) */}
          <g transform="translate(9, 9)" fill={t.ink}>
            {[0, 1, 2, 3].map((i) => {
              const a = 200 - i * 26;
              const rad = (a * Math.PI) / 180;
              return <ellipse key={`l${i}`} cx={18 + Math.cos(rad) * 14} cy={20 + Math.sin(rad) * 13} rx="4.2" ry="2" transform={`rotate(${a + 90} ${18 + Math.cos(rad) * 14} ${20 + Math.sin(rad) * 13})`} />;
            })}
            {[0, 1, 2, 3].map((i) => {
              const a = -20 + i * 26;
              const rad = (a * Math.PI) / 180;
              return <ellipse key={`r${i}`} cx={18 + Math.cos(rad) * 14} cy={20 + Math.sin(rad) * 13} rx="4.2" ry="2" transform={`rotate(${a + 90} ${18 + Math.cos(rad) * 14} ${20 + Math.sin(rad) * 13})`} />;
            })}
            <path d="M10.5 22.5 L9 13 L13.6 17 L18 10.5 L22.4 17 L27 13 L25.5 22.5 Z" />
            <rect x="10.5" y="24" width="15" height="2.6" rx="1.3" />
            <circle cx="18" cy="9" r="1.6" />
          </g>

          {/* Hologram parıltısı */}
          <g style={{ mixBlendMode: "overlay" }} mask={`url(#m${uid})`}>
            {OVERLAYS.map((fill, i) => (
              <g
                key={i}
                style={{
                  transform: `rotate(${overlayPos + i * 10}deg)`,
                  transformOrigin: "center center",
                  transition: !noInOutAnim ? "transform 200ms ease-out" : "none",
                  animation: noOverlayAnim || still ? "none" : `plaque-overlay-${i + 1} 5s infinite`,
                  willChange: "transform",
                }}
              >
                <polygon points="0,0 260,54 260,0 0,54" fill={fill} filter={`url(#b${uid})`} opacity="0.5" />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
