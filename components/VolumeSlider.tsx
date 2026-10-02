"use client";

import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { getListenerVolume, saveListenerVolume } from "@/lib/player";

/** Dinleyicinin ses seviyesi (seslendirmeler + orijinal ses). Cihazda hatırlanır. */
export default function VolumeSlider({ onChange, className }: { onChange: (v: number) => void; className?: string }) {
  const [v, setV] = useState(1);
  const [last, setLast] = useState(1);
  useEffect(() => setV(getListenerVolume()), []);
  function set(x: number) {
    setV(x);
    if (x > 0) setLast(x);
    saveListenerVolume(x);
    onChange(x);
  }
  const Icon = v === 0 ? VolumeX : v < 0.6 ? Volume1 : Volume2;
  return (
    <div className={"flex shrink-0 items-center gap-1.5 " + (className ?? "")}>
      <button
        className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        onClick={() => set(v === 0 ? last || 1 : 0)}
        aria-label={v === 0 ? "Sesi aç" : "Sesi kapat"}
        title={v === 0 ? "Sesi aç" : "Sesi kapat"}
      >
        <Icon className="size-4" />
      </button>
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.05}
        value={v}
        onChange={(e) => set(+e.target.value)}
        className="w-20 sm:w-24"
        aria-label="Ses seviyesi"
        title={`Ses %${Math.round(v * 100)}`}
      />
    </div>
  );
}
