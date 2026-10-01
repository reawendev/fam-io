"use client";

import { Headphones, Link2, Play, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DubPlayer, playOriginal, recItem, unlockAudio } from "@/lib/player";
import { isEffect, type EffectId } from "@/lib/effects";
import { publicUrl } from "@/lib/supabase";
import { sortLines, type SceneFull } from "@/lib/types";
import { Avatar, Button, cx, Notice } from "./ui";

export type ChainRec = { line_id: string; user_id: string; audio_path: string; offset_time: number; effect?: string | null };
export type ChainPerson = { name: string; color?: string; avatar_path?: string | null; frame?: string };

/**
 * Kulaktan kulağa sonucu: orijinal → 1. kişi → 2. kişi … Her halka tek tek ya da baştan sona sırayla çalınır;
 * "Replik replik" bölümünde tek bir repliğin nasıl değiştiği karşılaştırılır.
 */
export default function ChainView({
  scene,
  order,
  recs,
  people,
}: {
  scene: SceneFull;
  order: string[];
  recs: ChainRec[];
  people: Record<string, ChainPerson>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<DubPlayer | null>(null);
  const stopOrigRef = useRef<(() => void) | null>(null);
  const seqRef = useRef(false);
  const [now, setNow] = useState<{ step: number; line?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lines = useMemo(() => sortLines(scene.scene_lines), [scene]);
  const roleById = useMemo(() => Object.fromEntries(scene.scene_roles.map((r) => [r.id, r])), [scene]);
  const lineById = useMemo(() => Object.fromEntries(scene.scene_lines.map((l) => [l.id, l])), [scene]);
  const byUser = useMemo(() => {
    const m: Record<string, Record<string, ChainRec>> = {};
    for (const r of recs) (m[r.user_id] ??= {})[r.line_id] = r;
    return m;
  }, [recs]);

  useEffect(
    () => () => {
      seqRef.current = false;
      playerRef.current?.destroy();
      stopOrigRef.current?.();
    },
    [],
  );

  function stop() {
    seqRef.current = false;
    playerRef.current?.stop();
    stopOrigRef.current?.();
    stopOrigRef.current = null;
    setNow(null);
  }

  /** step 0 = orijinal; 1..n = zincirdeki kişiler. lineId verilirse sadece o replik. */
  async function play(step: number, lineId?: string, then?: () => void) {
    const v = videoRef.current;
    if (!v) return;
    playerRef.current?.stop();
    stopOrigRef.current?.();
    setError(null);
    await unlockAudio(v);
    setNow({ step, line: lineId });
    const l = lineId ? lineById[lineId] : null;
    const from = l ? Math.max(0, l.start_time - 0.6) : 0;
    const to = l ? l.end_time + 0.5 : v.duration || scene.duration || 0;
    const done = () => {
      setNow(null);
      then?.();
    };
    if (step === 0) {
      stopOrigRef.current = playOriginal(v, from, to, done);
      return;
    }
    try {
      const uid = order[step - 1];
      const mine = byUser[uid] ?? {};
      const items = (l ? [l] : lines)
        .filter((x) => mine[x.id])
        .map((x) => {
          const fx = mine[x.id].effect ?? "";
          return recItem(publicUrl("recordings", mine[x.id].audio_path), mine[x.id].offset_time, x, x.id, isEffect(fx) ? (fx as EffectId) : undefined);
        });
      playerRef.current?.destroy();
      const p = new DubPlayer(v, { originalVolume: scene.original_volume });
      playerRef.current = p;
      await p.load(items, scene.bg_audio_path ? publicUrl("scenes", scene.bg_audio_path) : null);
      p.onEnd = done;
      p.play(from, 0.15, l ? to : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setNow(null);
    }
  }

  function playAll(lineId?: string) {
    seqRef.current = true;
    const next = (i: number) => {
      if (!seqRef.current || i > order.length) {
        seqRef.current = false;
        return;
      }
      play(i, lineId, () => setTimeout(() => next(i + 1), lineId ? 300 : 900));
    };
    next(0);
  }

  const label = (step: number) => (step === 0 ? "Orijinal" : people[order[step - 1]]?.name ?? "?");

  return (
    <div className="flex flex-col gap-4">
      <div className="panel overflow-hidden">
        <div className="relative bg-black">
          <video ref={videoRef} src={publicUrl("scenes", scene.video_path)} crossOrigin="anonymous" playsInline muted preload="auto" className="aspect-video w-full" />
          {now && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded bg-black/80 px-2.5 py-1 text-sm font-medium">
              <Link2 className="size-3.5 text-accent" />
              {now.step === 0 ? "Orijinal" : `${now.step}. halka · ${label(now.step)}`}
              {now.line && <span className="text-fg-2"> · tek replik</span>}
            </span>
          )}
          {!now && (
            <button
              onClick={() => playAll()}
              className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 transition-colors hover:bg-black/45"
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg shadow-black/40 transition-transform group-hover:scale-105">
                <Play className="ml-1 size-7 fill-current" />
              </span>
              <span className="text-sm font-medium">Zinciri baştan sona izle</span>
              <span className="text-xs text-fg-2">Orijinal → {order.map((_, i) => label(i + 1)).join(" → ")}</span>
            </button>
          )}
        </div>
      </div>
      {error && <Notice>{error}</Notice>}

      <div className="panel">
        <div className="panel-head">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="size-4 text-muted" /> Halkalar
          </h3>
          {now && (
            <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} onClick={stop}>
              Durdur
            </Button>
          )}
        </div>
        <ol className="flex flex-col gap-1 p-2">
          {[0, ...order.map((_, i) => i + 1)].map((step) => {
            const uid = step ? order[step - 1] : null;
            const p = uid ? people[uid] : null;
            const count = uid ? Object.keys(byUser[uid] ?? {}).length : lines.length;
            const on = now?.step === step && !now.line;
            return (
              <li key={step}>
                <button
                  onClick={() => (on ? stop() : play(step))}
                  className={cx("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2", on && "bg-accent/10")}
                >
                  <span className="w-5 text-center font-mono text-xs text-muted">{step}</span>
                  {p ? (
                    <Avatar name={p.name} color={p.color} path={p.avatar_path} frame={p.frame} size={26} />
                  ) : (
                    <span className="flex size-[26px] items-center justify-center rounded-full bg-surface-3 text-muted">
                      <Headphones className="size-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p ? p.name : "Orijinal ses"}</span>
                    <span className="block text-[11px] text-muted">
                      {step === 0 ? "herkesin başladığı yer" : step === 1 ? "orijinali duydu" : `duyduğu: ${label(step - 1)}`} · {count} replik
                    </span>
                  </span>
                  {on ? <Square className="size-4 text-accent" /> : <Play className="size-4 text-muted" />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="text-sm font-medium">Replik replik</h3>
          <span className="text-xs text-muted">bir repliğin zincirde nasıl değiştiğini dinle</span>
        </div>
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const role = roleById[l.role_id];
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="size-2 rounded-full" style={{ background: role?.color }} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium" style={{ color: role?.color }}>
                    {role?.name}
                  </span>
                  {l.text && <span className="text-fg-2"> — “{l.text}”</span>}
                </span>
                <span className="flex flex-wrap gap-1">
                  {[0, ...order.map((_, i) => i + 1)].map((step) => {
                    const has = step === 0 || !!byUser[order[step - 1]]?.[l.id];
                    const on = now?.step === step && now.line === l.id;
                    return (
                      <button
                        key={step}
                        disabled={!has}
                        onClick={() => (on ? stop() : play(step, l.id))}
                        title={label(step)}
                        className={cx(
                          "h-7 min-w-7 rounded-md border px-2 font-mono text-xs transition-colors disabled:opacity-30",
                          on ? "border-accent bg-accent text-accent-fg" : "border-line-strong bg-surface-2 text-fg-2 hover:text-fg",
                        )}
                      >
                        {step === 0 ? "O" : step}
                      </button>
                    );
                  })}
                  <button onClick={() => playAll(l.id)} className="h-7 rounded-md px-2 text-xs text-muted hover:text-fg" title="Bu repliği tüm zincir boyunca dinle">
                    hepsi
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
