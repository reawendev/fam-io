"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshMe, useMe } from "@/lib/auth";
import { computeBadges, fetchBadgeStats, TIER_LABEL, type BadgeState } from "@/lib/badges";
import { levelInfo, levelTitle } from "@/lib/progress";
import { sb } from "@/lib/supabase";
import BadgeIcon from "./BadgeIcon";
import { Button, cx, IconButton } from "./ui";

/**
 * Ödül animasyonları: XP kazanınca küçük bildirim, rozet açılınca dönen madalyon,
 * level atlayınca konfetili kutlama. Profil XP'si değiştikçe kendiliğinden tetiklenir;
 * son görülen değerler tarayıcıda tutulur ("sen yokken +25 XP" da gösterilir).
 */

type ToastInput =
  | { kind: "xp"; amount: number; away?: boolean }
  | { kind: "badge"; badge: BadgeState }
  | { kind: "more"; count: number };
const TIER_ORDER = { ozel: 4, altin: 3, gumus: 2, bronz: 1 } as const;
type Toast = ToastInput & { id: number };

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

let nextId = 1;

export default function RewardToaster() {
  const me = useMe();
  const uid = me.status === "in" ? me.user.id : null;
  const xp = me.status === "in" ? me.profile.xp : null;
  const username = me.status === "in" ? me.profile.username : null;

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(0);
  const prev = useRef<{ uid: string; xp: number } | null>(null);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback((t: ToastInput, ms: number) => {
    const id = nextId++;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), ms);
  }, []);

  const checkBadges = useCallback(
    (u: string) => {
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      badgeTimer.current = setTimeout(async () => {
        const stats = await fetchBadgeStats(sb, u);
        if (!stats) return;
        const earned = computeBadges(stats).filter((b) => b.earned);
        const k = `famio.badges.${u}`;
        const raw = store.get(k);
        store.set(k, JSON.stringify(earned.map((b) => b.id)));
        if (raw === null) return; // ilk ziyaret: mevcut rozetleri sessizce kaydet
        let seen: string[] = [];
        try {
          seen = JSON.parse(raw);
        } catch {}
        // En değerli 3 rozeti tek tek göster, fazlasını tek bildirimde topla
        const fresh = earned.filter((b) => !seen.includes(b.id)).sort((a, b) => TIER_ORDER[b.tier] - TIER_ORDER[a.tier]);
        fresh.slice(0, 3).forEach((b, i) => setTimeout(() => push({ kind: "badge", badge: b }, 7000), 400 + i * 900));
        if (fresh.length > 3) setTimeout(() => push({ kind: "more", count: fresh.length - 3 }, 7000), 400 + 3 * 900);
        if (fresh.length) setConfetti((c) => c + 1);
      }, 900);
    },
    [push],
  );

  // XP değişimlerini izle
  useEffect(() => {
    if (!uid || xp === null) {
      prev.current = null;
      return;
    }
    const k = `famio.xp.${uid}`;
    let before: number | null = null;
    let away = false;
    if (!prev.current || prev.current.uid !== uid) {
      const stored = store.get(k);
      before = stored === null ? null : Number(stored);
      away = true;
    } else {
      before = prev.current.xp;
    }
    prev.current = { uid, xp };
    store.set(k, String(xp));
    if (before === null || !isFinite(before)) {
      checkBadges(uid);
      return;
    }
    if (xp > before) {
      push({ kind: "xp", amount: xp - before, away }, 4500);
      const lvA = levelInfo(before).level;
      const lvB = levelInfo(xp).level;
      if (lvB > lvA) {
        setTimeout(() => {
          setLevelUp(lvB);
          setConfetti((c) => c + 1);
        }, 700);
      }
    }
    if (xp !== before || away) checkBadges(uid);
  }, [uid, xp, push, checkBadges]);

  // Sekmeye dönünce profili tazele (beğeni/oy XP'leri gelmiş olabilir); en sık dakikada bir
  useEffect(() => {
    if (!uid) return;
    let last = Date.now();
    const on = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      refreshMe().catch(() => {});
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [uid]);

  return (
    <>
      {confetti > 0 && <Confetti key={confetti} />}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) =>
          t.kind === "xp" ? (
            <div key={t.id} className="toast-in pointer-events-auto flex items-center gap-3 self-end rounded-full border border-accent/30 bg-surface-2 py-2 pr-4 pl-2 shadow-lg shadow-black/40">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent text-accent-fg">
                <Sparkles className="size-3.5" />
              </span>
              <span className="xp-bump font-mono text-sm font-semibold text-accent">+{t.amount} XP</span>
              {t.away && <span className="text-xs text-muted">sen yokken</span>}
            </div>
          ) : t.kind === "more" ? (
            <Link
              key={t.id}
              href={username ? `/u/${username}` : "/"}
              className="toast-in pointer-events-auto self-end rounded-full border border-line-strong bg-surface-2 px-4 py-2 text-sm shadow-lg shadow-black/40 hover:bg-surface-3"
            >
              ve <span className="font-medium text-accent">{t.count} rozet daha</span> kazandın →
            </Link>
          ) : (
            <BadgeToast key={t.id} badge={t.badge} username={username} onClose={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} />
          ),
        )}
      </div>
      {levelUp !== null && <LevelUp level={levelUp} xp={xp ?? 0} onClose={() => setLevelUp(null)} />}
    </>
  );
}

function BadgeToast({ badge, username, onClose }: { badge: BadgeState; username: string | null; onClose: () => void }) {
  return (
    <div className="toast-in pointer-events-auto relative overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-surface-2 p-3.5 shadow-xl shadow-black/50">
      <div className="flex items-center gap-3.5">
        <span className="relative shrink-0">
          <span className="glow-pulse absolute -inset-3 rounded-full bg-accent/25 blur-xl" aria-hidden />
          <span className="badge-reveal relative block">
            <BadgeIcon id={badge.id} tier={badge.tier} icon={badge.icon} size={52} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-accent">Yeni rozet · {TIER_LABEL[badge.tier]}</p>
          <p className="mt-0.5 truncate font-medium">{badge.name}</p>
          <p className="line-clamp-2 text-xs text-muted">{badge.note ?? badge.desc}</p>
        </div>
        <IconButton label="Kapat" className="size-7 self-start" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      {username && (
        <Link href={`/u/${username}`} className="mt-2.5 block text-right text-xs text-fg-2 hover:text-fg" onClick={onClose}>
          Rozetlerimi gör →
        </Link>
      )}
    </div>
  );
}

function LevelUp({ level, xp, onClose }: { level: number; xp: number; onClose: () => void }) {
  const lv = levelInfo(xp);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Level atladın" className="panel pop-in relative w-full max-w-xs overflow-hidden p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="glow-pulse pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" aria-hidden />
        <p className="eyebrow relative">Level atladın</p>
        <div className="relative mx-auto mt-4 flex size-24 items-center justify-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0" aria-hidden>
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-line-strong)" strokeWidth="3" />
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="289" strokeDashoffset="0" className="origin-center -rotate-90" style={{ animation: "dash-in 1s 0.2s var(--ease-out-quint) both" }} />
          </svg>
          <span className="count-in font-mono text-5xl font-semibold tabular-nums">{level}</span>
        </div>
        <p className="relative mt-4 text-lg font-semibold tracking-tight">{levelTitle(level)}</p>
        <p className="relative mt-1 text-xs text-muted">
          Sonraki level için {lv.need - lv.into} XP
        </p>
        <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="bar-fill h-full rounded-full bg-accent" style={{ width: `${Math.max(4, lv.pct * 100)}%` }} />
        </div>
        <Button variant="primary" className="relative mt-5 w-full" onClick={onClose}>
          Devam
        </Button>
      </div>
    </div>
  );
}

/** Hafif konfeti (kütüphanesiz). Hareket azaltma tercihinde çalışmaz. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setDone(true);
    const c = ref.current!;
    const g = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const W = innerWidth;
    const H = innerHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    g.scale(dpr, dpr);
    const colors = ["#ff7a1a", "#ffd25e", "#ededee", "#38bdf8", "#a3e635", "#f472b6"];
    const parts = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.35 + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 13 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 5 + Math.random() * 5,
      h: 8 + Math.random() * 8,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1500) / 700);
      for (const p of parts) {
        p.vy += 0.38;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
        g.restore();
      }
      if (t < 2200) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (done) return null;
  return <canvas ref={ref} className={cx("pointer-events-none fixed inset-0 z-[70] size-full")} aria-hidden />;
}
