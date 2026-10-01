"use client";

import { BookOpen, Crown, Medal, Pause, Play } from "lucide-react";
import { useState } from "react";
import { PlayBtn } from "@/components/room/PartyGame";
import { emotion, MODES } from "@/lib/modes";
import { clipLetter, useOnePlayer, type PartyGameRow } from "@/lib/party";
import { Avatar, Button, cx } from "./ui";

type Person = { name: string; color?: string; avatar_path?: string | null; frame?: string };

/** Biten parti oyununun sonucu: finalde ve /p/[id] paylaşım sayfasında */
export default function PartyResults({ game }: { game: PartyGameRow }) {
  const people: Record<string, Person> = {};
  for (const p of game.party_game_players)
    if (p.profile) people[p.user_id] = { name: p.profile.display_name, color: p.profile.color, avatar_path: p.profile.avatar_path, frame: p.profile.equipped?.frame ?? undefined };
  const person = (u?: string | null) => (u ? people[u] : undefined) ?? { name: "Ayrılan oyuncu" };
  return game.kind === "hikaye" ? <Story game={game} person={person} /> : <Party game={game} person={person} />;
}

function Story({ game, person }: { game: PartyGameRow; person: (u?: string | null) => Person }) {
  const player = useOnePlayer();
  const parts = game.data.parts ?? [];
  const playing = player.now !== null;
  return (
    <div className="flex flex-col gap-4">
      <div className="panel relative overflow-hidden p-5">
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_160px_at_0%_0%,rgba(255,122,26,0.12),transparent)]" />
        <p className="eyebrow relative flex items-center gap-1.5">
          <BookOpen className="size-3.5" /> Hikâyenin açılışı
        </p>
        <p className="relative mt-2 text-xl leading-snug font-medium tracking-tight sm:text-2xl">{game.data.topic}</p>
        <div className="relative mt-4 flex flex-wrap items-center gap-3">
          {playing ? (
            <Button icon={<Pause className="size-4" />} onClick={player.stop}>
              Durdur
            </Button>
          ) : (
            <Button variant="primary" icon={<Play className="size-4" />} onClick={() => player.playSeq(parts.map((p) => ({ key: String(p.turn), path: p.audio })))}>
              Hikâyeyi baştan dinle
            </Button>
          )}
          <span className="text-xs text-muted">{parts.length} parça</span>
        </div>
      </div>
      <ol className="panel flex flex-col gap-1 p-2">
        {parts.map((p, i) => {
          const who = person(p.user);
          const on = player.now === String(p.turn);
          return (
            <li key={p.turn} className={cx("flex items-center gap-3 rounded-lg px-2 py-2 transition-colors", on && "bg-accent/[0.08]")}>
              <span className="w-5 text-center font-mono text-[11px] text-muted">{i + 1}</span>
              <Avatar name={who.name} color={who.color} path={who.avatar_path} frame={who.frame} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm">{who.name}</span>
              <PlayBtn on={on} onClick={() => (on ? player.stop() : player.play(String(p.turn), p.audio))} label={`${i + 1}. parçayı dinle`} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Party({ game, person }: { game: PartyGameRow; person: (u?: string | null) => Person }) {
  const player = useOnePlayer();
  const rows = [...game.party_game_players].sort((a, b) => b.points - a.points);
  const [open, setOpen] = useState<number | null>(game.data.rounds?.[0]?.round ?? null);
  const mode = MODES.find((m) => m.id === game.kind)?.name ?? "";
  return (
    <div className="flex flex-col gap-4">
      {/* Kürsü */}
      <div className="panel p-5">
        <p className="eyebrow">{mode} · sonuç</p>
        <ol className="mt-4 flex flex-col gap-2">
          {rows.map((r, i) => {
            const who = person(r.user_id);
            return (
              <li
                key={r.user_id}
                className={cx("flex items-center gap-3 rounded-lg border px-3 py-2.5", r.winner ? "border-accent/50 bg-accent/[0.08]" : "border-line bg-bg")}
              >
                <span className={cx("w-6 text-center font-mono text-sm", i < 3 ? "font-semibold text-accent" : "text-muted")}>
                  {r.winner ? <Crown className="mx-auto size-4" /> : i + 1}
                </span>
                <Avatar name={who.name} color={who.color} path={who.avatar_path} frame={who.frame} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{who.name}</span>
                {r.winner && (
                  <span className="hidden items-center gap-1 text-xs text-accent sm:inline-flex">
                    <Medal className="size-3.5" /> birinci
                  </span>
                )}
                <span className="font-mono text-lg font-semibold">{r.points}</span>
                <span className="text-[11px] text-muted">puan</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Turlar */}
      {(game.data.rounds ?? []).map((rd) => {
        const top = Math.max(0, ...rd.clips.map((c) => c.votes));
        const isOpen = open === rd.round;
        return (
          <section key={rd.round} className="panel overflow-hidden">
            <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen(isOpen ? null : rd.round)} aria-expanded={isOpen}>
              <span className="min-w-0">
                <span className="eyebrow block">Tur {rd.round}</span>
                <span className="mt-1 block truncate text-sm font-medium">{game.kind === "efekt" ? rd.prompt : `“${rd.prompt}”`}</span>
              </span>
              <span className="text-xs text-muted">{isOpen ? "Gizle" : `${rd.clips.length} kayıt`}</span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-line border-t border-line">
                {rd.clips.map((c) => {
                  const who = person(c.user);
                  const key = `${rd.round}-${c.label}`;
                  const winner = game.kind === "efekt" && top > 0 && c.votes === top;
                  return (
                    <li key={key} className={cx("flex flex-col gap-2 px-4 py-3", winner && "bg-accent/[0.06]")}>
                      <div className="flex items-center gap-3">
                        <PlayBtn on={player.now === key} onClick={() => (player.now === key ? player.stop() : player.play(key, c.audio))} label={`Ses ${clipLetter(c.label)} dinle`} />
                        <Avatar name={who.name} color={who.color} path={who.avatar_path} size={24} />
                        <span className="min-w-0 truncate text-sm">{who.name}</span>
                        {game.kind === "duygu" && c.secret && (
                          <span className="ml-auto rounded-md bg-surface-2 px-2 py-0.5 text-xs">
                            {emotion(c.secret)?.emoji} {emotion(c.secret)?.name}
                          </span>
                        )}
                        {game.kind === "efekt" && (
                          <span className={cx("ml-auto inline-flex items-center gap-1 font-mono text-xs", winner ? "text-accent" : "text-muted")}>
                            {winner && <Crown className="size-3.5" />} {c.votes} oy
                          </span>
                        )}
                        {game.kind === "kim" && (
                          <span className="ml-auto font-mono text-[11px] text-muted">
                            {c.guesses.filter((g) => g.correct).length}/{c.guesses.length} tanıdı
                          </span>
                        )}
                      </div>
                      {game.kind !== "efekt" && c.guesses.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5 pl-11">
                          {c.guesses.map((g) => (
                            <li
                              key={g.voter}
                              className={cx("rounded-md border px-1.5 py-0.5 text-[11px]", g.correct ? "border-ok/40 bg-ok/10 text-ok" : "border-line text-muted")}
                            >
                              {person(g.voter).name} → {game.kind === "kim" ? person(g.answer).name : `${emotion(g.answer)?.emoji} ${emotion(g.answer)?.name}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
