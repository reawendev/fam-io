"use client";

import { Ear, Eye, Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { publicUrl } from "@/lib/supabase";
import { Avatar, Button, cx } from "./ui";

export type PhoneStep = {
  chain: number;
  step: number;
  user_id: string | null;
  audio_path: string | null;
  text: string | null;
  skipped: boolean;
};
export type PhonePerson = { name: string; color?: string; avatar_path?: string | null; frame?: string };

/**
 * Kulaktan kulağa sonuçları: her zincir bir kart. Kayıtlar sırayla çalınır;
 * baştaki cümle ve sondaki tahmin, zincir dinlenene (ya da "Sonucu göster"e basılana) kadar gizli kalır.
 */
export default function PhoneChains({ steps, people }: { steps: PhoneStep[]; people: Record<string, PhonePerson> }) {
  const chains = useMemo(() => {
    const m = new Map<number, PhoneStep[]>();
    for (const s of steps) m.set(s.chain, [...(m.get(s.chain) ?? []), s]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list.sort((a, b) => a.step - b.step));
  }, [steps]);

  // Aynı anda tek ses çalsın
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<{ chain: number; step: number } | null>(null);
  const seq = useRef<number>(0);
  useEffect(
    () => () => {
      seq.current++;
      audioRef.current?.pause();
    },
    [],
  );

  function stop() {
    seq.current++;
    audioRef.current?.pause();
    setPlaying(null);
  }

  function playOne(s: PhoneStep): Promise<void> {
    return new Promise((resolve) => {
      if (!s.audio_path) return resolve();
      audioRef.current?.pause();
      const a = new Audio(publicUrl("recordings", s.audio_path));
      audioRef.current = a;
      setPlaying({ chain: s.chain, step: s.step });
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }

  async function playChain(list: PhoneStep[], onDone: () => void) {
    const my = ++seq.current;
    for (const s of list) {
      if (!s.audio_path) continue;
      await playOne(s);
      if (seq.current !== my) return;
      await new Promise((r) => setTimeout(r, 450));
      if (seq.current !== my) return;
    }
    setPlaying(null);
    onDone();
  }

  async function playSingle(s: PhoneStep) {
    const my = ++seq.current;
    await playOne(s);
    if (seq.current === my) setPlaying(null);
  }

  if (chains.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {chains.map((list, i) => (
        <ChainCard
          key={list[0].chain}
          index={i}
          list={list}
          people={people}
          playing={playing}
          onPlayAll={(done) => playChain(list, done)}
          onPlayOne={playSingle}
          onStop={stop}
        />
      ))}
    </div>
  );
}

function ChainCard({
  index,
  list,
  people,
  playing,
  onPlayAll,
  onPlayOne,
  onStop,
}: {
  index: number;
  list: PhoneStep[];
  people: Record<string, PhonePerson>;
  playing: { chain: number; step: number } | null;
  onPlayAll: (done: () => void) => void;
  onPlayOne: (s: PhoneStep) => void;
  onStop: () => void;
}) {
  const [shown, setShown] = useState(false);
  const chain = list[0].chain;
  const last = list[list.length - 1];
  const origin = list.find((s) => s.audio_path && s.text) ?? list.find((s) => s.step === 0);
  const guess = last.audio_path ? null : last.skipped ? null : last;
  const starter = origin?.user_id ? people[origin.user_id] : undefined;
  const isPlaying = playing?.chain === chain;
  const person = (uid: string | null) => (uid ? people[uid] : undefined) ?? { name: "Ayrılan oyuncu" };

  return (
    <article className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Zincir {index + 1}</p>
          <p className="mt-1 truncate text-sm font-medium">{starter ? `${starter.name} başlattı` : "Zincir"}</p>
        </div>
        <div className="flex gap-2">
          {isPlaying ? (
            <Button size="sm" icon={<Pause className="size-3.5" />} onClick={onStop}>
              Durdur
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} onClick={() => onPlayAll(() => setShown(true))}>
              Baştan oynat
            </Button>
          )}
          {!shown && (
            <Button size="sm" variant="ghost" icon={<Eye className="size-3.5" />} onClick={() => setShown(true)}>
              Sonucu göster
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-px bg-line sm:grid-cols-2">
        <Reveal label="Baştaki cümle" shown={shown} text={origin?.text ?? "—"} tone="start" />
        <Reveal
          label={guess ? `${person(guess.user_id).name} ne duydu?` : "Son hal"}
          shown={shown}
          text={guess?.text ?? "Son kişi tahmin yazmadı"}
          tone="end"
          muted={!guess}
        />
      </div>

      <ol className="flex flex-col gap-1 p-2">
        {list.map((s) => {
          const p = person(s.user_id);
          const active = playing?.chain === chain && playing.step === s.step;
          const isGuess = s === guess;
          return (
            <li
              key={s.step}
              className={cx("flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors", active && "bg-accent/[0.08]")}
            >
              <span className="w-5 text-center font-mono text-[11px] text-muted">{s.step + 1}</span>
              <Avatar name={p.name} color={p.color} path={p.avatar_path} frame={p.frame} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block text-[11px] text-muted">
                  {s.skipped
                    ? "atlandı"
                    : isGuess
                      ? "duyduğunu yazdı"
                      : s.audio_path && s.text
                        ? "cümleyi okudu"
                        : "duyduğunu tekrarladı"}
                </span>
              </span>
              {s.audio_path ? (
                <button
                  className={cx(
                    "inline-flex size-8 items-center justify-center rounded-full border transition-colors",
                    active ? "border-accent bg-accent text-accent-fg" : "border-line-strong text-fg-2 hover:border-accent hover:text-accent",
                  )}
                  aria-label={`${p.name} kaydını dinle`}
                  onClick={() => (active ? onStop() : onPlayOne(s))}
                >
                  {active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </button>
              ) : s.skipped ? (
                <SkipForward className="size-4 text-muted" />
              ) : (
                <Ear className="size-4 text-muted" />
              )}
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function Reveal({ label, text, shown, tone, muted }: { label: string; text: string; shown: boolean; tone: "start" | "end"; muted?: boolean }) {
  return (
    <div className="bg-surface p-4">
      <p className={cx("text-[11px] font-medium", tone === "start" ? "text-muted" : "text-accent")}>{label}</p>
      <p
        className={cx(
          "mt-1.5 text-[15px] leading-snug transition-[filter] duration-500",
          !shown && "pointer-events-none blur-[7px] select-none",
          muted && "text-muted",
        )}
        aria-hidden={!shown}
      >
        {shown ? `“${text}”` : text.replace(/\S/g, "x")}
      </p>
    </div>
  );
}
