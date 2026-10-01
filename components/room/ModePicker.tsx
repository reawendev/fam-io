"use client";

import { BookOpen, Check, Drama, Ear, Link2, ScanFace, PenLine, Shuffle, Smile, Swords, Users, Volume2, VenetianMask, Waves } from "lucide-react";
import { MODES, MOD_INFO } from "@/lib/modes";
import type { GameMod, GameMode, Room } from "@/lib/types";
import { cx } from "@/components/ui";

export const MODE_ICON: Record<GameMode, React.ReactNode> = {
  klasik: <Users className="size-4" />,
  kulak: <Ear className="size-4" />,
  zincir: <Link2 className="size-4" />,
  senarist: <PenLine className="size-4" />,
  duello: <Swords className="size-4" />,
  kim: <ScanFace className="size-4" />,
  efekt: <Waves className="size-4" />,
  duygu: <Smile className="size-4" />,
  hikaye: <BookOpen className="size-4" />,
};
const MOD_ICON: Record<GameMod, React.ReactNode> = {
  kart: <Shuffle className="size-3.5" />,
  hain: <VenetianMask className="size-3.5" />,
  foley: <Volume2 className="size-3.5" />,
};

/** Lobide oyun modu ve ekler. Oda sahibi değiştirir; diğerleri sadece görür. */
export default function ModePicker({
  room,
  isHost,
  busy,
  players,
  onChange,
}: {
  room: Room;
  isHost: boolean;
  busy: boolean;
  players: number;
  onChange: (mode: GameMode, mods: GameMod[]) => void;
}) {
  const mode = room.mode ?? "klasik";
  const mods = room.mods ?? [];
  const modsAllowed = mode === "klasik" || mode === "senarist";
  const cur = MODES.find((m) => m.id === mode)!;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Drama className="size-4 text-muted" /> Oyun modu
        </h3>
        {!isHost && <span className="text-xs text-muted">oda sahibi seçer</span>}
      </div>
      <div className="flex flex-col gap-3 p-3" role="radiogroup" aria-label="Oyun modu">
        {[
          { title: "Sahneli", list: MODES.filter((m) => m.scene) },
          { title: "Sahnesiz", list: MODES.filter((m) => !m.scene) },
        ].map((g) => (
          <div key={g.title}>
            <p className="eyebrow mb-1.5 px-1">{g.title}</p>
            <div className="grid grid-cols-2 gap-2">
              {g.list.map((m) => {
                const on = m.id === mode;
                return (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={on}
                    disabled={!isHost || busy}
                    onClick={() => onChange(m.id, m.id === "klasik" || m.id === "senarist" ? mods : [])}
                    className={cx(
                      "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:cursor-default",
                      on ? "border-accent/60 bg-accent/[0.08]" : "border-line bg-bg",
                      isHost && !on && "hover:border-line-strong",
                      !isHost && !on && "opacity-50",
                    )}
                  >
                    <span className={cx("flex items-center gap-1.5 text-sm font-medium", on && "text-accent")}>
                      {MODE_ICON[m.id]} {m.name}
                    </span>
                    <span className="text-[11px] leading-snug text-muted">{m.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="px-4 pb-3 text-xs leading-relaxed text-fg-2">
        {cur.desc}
        {players < cur.min && <span className="mt-1 block text-amber-200">Bu mod için en az {cur.min} oyuncu gerekir.</span>}
      </p>
      <div className="border-t border-line p-3">
        <p className="eyebrow mb-2 px-1">Ekler {!modsAllowed && <span className="normal-case">· bu modda kapalı</span>}</p>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(MOD_INFO) as GameMod[]).map((id) => {
            const on = mods.includes(id);
            return (
              <button
                key={id}
                role="switch"
                aria-checked={on}
                disabled={!isHost || busy || !modsAllowed}
                onClick={() => onChange(mode, on ? mods.filter((x) => x !== id) : [...mods, id])}
                className={cx(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-default",
                  on ? "border-accent/50 bg-accent/[0.06]" : "border-line",
                  !modsAllowed && "opacity-40",
                  isHost && modsAllowed && !on && "hover:border-line-strong",
                )}
              >
                <span
                  className={cx(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                    on ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0">
                  <span className={cx("flex items-center gap-1.5 text-[13px] font-medium", on && "text-accent")}>
                    {MOD_ICON[id]} {MOD_INFO[id].name}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted">{MOD_INFO[id].desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
