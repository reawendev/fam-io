"use client";

import { AudioLines, Award, Building2, Ear, Castle, Link2, PenLine, Search, ShoppingBag, Shuffle, Swords, VenetianMask, Volume2, Clapperboard, Crown, Drama, Film, Flame, FlaskConical, Gem, Heart, HeartHandshake, Laugh, Medal, MessageCircle, Mic, MicVocal, Mountain, PartyPopper, Popcorn, Radio, Sparkles, Star, Ticket, Trophy, Users, Video, WandSparkles, Zap, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { CUSTOM_BADGE_IMAGES, type Tier } from "@/lib/badges";
import { cx } from "./ui";

const ICONS: Record<string, LucideIcon> = { AudioLines, Award, Building2, Ear, Castle, Link2, PenLine, Search, ShoppingBag, Shuffle, Swords, VenetianMask, Volume2, Clapperboard, Crown, Drama, Film, Flame, FlaskConical, Gem, Heart, HeartHandshake, Laugh, Medal, MessageCircle, Mic, MicVocal, Mountain, PartyPopper, Popcorn, Radio, Sparkles, Star, Ticket, Trophy, Users, Video, WandSparkles, Zap };

const METAL: Record<Exclude<Tier, "ozel">, { hi: string; mid: string; lo: string; glyph: string }> = {
  bronz: { hi: "#f3c49a", mid: "#c07a45", lo: "#6e3f1f", glyph: "#e8a877" },
  gumus: { hi: "#ffffff", mid: "#b9c2cd", lo: "#5d6672", glyph: "#dfe5ec" },
  altin: { hi: "#fff2b0", mid: "#e2ac2c", lo: "#7a5208", glyph: "#ffd25e" },
};

/**
 * Rozet görseli. Varsayılan olarak vektör çizilir; public/badges/<id>.png eklenirse o kullanılır.
 * Kazanılmamış rozetler gri ve soluk görünür.
 */
export default function BadgeIcon({
  id,
  tier,
  icon,
  size = 56,
  locked = false,
  className,
}: {
  id: string;
  tier: Tier;
  icon: string;
  size?: number;
  locked?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const Glyph = ICONS[icon] ?? Award;
  const lockCls = locked ? "opacity-35 grayscale" : "";

  if (CUSTOM_BADGE_IMAGES.includes(id)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/badges/${id}.png`} alt="" width={size} height={size} className={cx("shrink-0 select-none", lockCls, className)} draggable={false} />
    );
  }

  const g = Math.round(size * 0.4);

  if (tier === "ozel") {
    // Holografik altıgen
    const hex = "M50 3 L91 26.5 L91 73.5 L50 97 L9 73.5 L9 26.5 Z";
    const inner = "M50 14 L81.5 32 L81.5 68 L50 86 L18.5 68 L18.5 32 Z";
    return (
      <span className={cx("relative inline-flex shrink-0 items-center justify-center", lockCls, className)} style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0" aria-hidden>
          <defs>
            <linearGradient id={`h${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff7a1a" />
              <stop offset="0.35" stopColor="#f472b6" />
              <stop offset="0.65" stopColor="#a78bfa" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
            <radialGradient id={`i${uid}`} cx="0.5" cy="0.35" r="0.7">
              <stop offset="0" stopColor="#26262c" />
              <stop offset="1" stopColor="#0d0d10" />
            </radialGradient>
            <linearGradient id={`s${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={hex} fill={`url(#h${uid})`} stroke="#00000055" strokeWidth="1" strokeLinejoin="round" />
          <path d={hex} fill={`url(#s${uid})`} />
          <path d={inner} fill={`url(#i${uid})`} stroke="#ffffff22" strokeWidth="1" strokeLinejoin="round" />
        </svg>
        <Glyph className="relative" style={{ width: g, height: g, color: "#fff" }} strokeWidth={2} />
      </span>
    );
  }

  const m = METAL[tier];
  return (
    <span className={cx("relative inline-flex shrink-0 items-center justify-center", lockCls, className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id={`r${uid}`} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor={m.hi} />
            <stop offset="0.45" stopColor={m.mid} />
            <stop offset="1" stopColor={m.lo} />
          </linearGradient>
          <radialGradient id={`f${uid}`} cx="0.5" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#2a2a30" />
            <stop offset="1" stopColor="#0c0c0f" />
          </radialGradient>
        </defs>
        {/* Dış halka + dişler */}
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return <circle key={i} cx={50 + Math.cos(a) * 45} cy={50 + Math.sin(a) * 45} r="4.2" fill={`url(#r${uid})`} />;
        })}
        <circle cx="50" cy="50" r="44" fill={`url(#r${uid})`} />
        <circle cx="50" cy="50" r="35" fill={`url(#f${uid})`} stroke="#00000080" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="31.5" fill="none" stroke={m.mid} strokeOpacity="0.35" strokeWidth="1" />
        <path d="M22 38 A30 30 0 0 1 60 18" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <Glyph className="relative" style={{ width: g, height: g, color: m.glyph }} strokeWidth={2} />
    </span>
  );
}
