"use client";

import { Crown, Pin, PinOff } from "lucide-react";
import Link from "next/link";
import { MODE_ICON } from "@/components/room/ModePicker";
import { MODES } from "@/lib/modes";
import { timeAgo } from "@/lib/progress";
import { sb } from "@/lib/supabase";
import type { GameMode, ShowcaseItem } from "@/lib/types";
import { cx } from "./ui";

/** Profildeki "Oyunlar" sekmesi ve vitrin için oyun kaydı */
export type GameItem = {
  t: "kulak" | "parti";
  id: string;
  kind: GameMode;
  created_at: string;
  players: number;
  points?: number;
  winner?: boolean;
};

/** Kullanıcının oynadığı kulaktan kulağa ve parti oyunları (yeniden eskiye) */
export async function fetchUserGames(uid: string): Promise<GameItem[]> {
  const [{ data: k }, { data: p }] = await Promise.all([
    sb().from("phone_game_steps").select("game_id, phone_games(id, created_at, players)").eq("user_id", uid).eq("skipped", false),
    sb().from("party_game_players").select("points, winner, party_games(id, kind, created_at, players)").eq("user_id", uid),
  ]);
  const out = new Map<string, GameItem>();
  for (const r of Array.isArray(k) ? (k as unknown as { phone_games: { id: string; created_at: string; players: number } | null }[]) : [])
    if (r.phone_games) out.set(r.phone_games.id, { t: "kulak", id: r.phone_games.id, kind: "kulak", created_at: r.phone_games.created_at, players: r.phone_games.players });
  for (const r of Array.isArray(p) ? (p as unknown as { points: number; winner: boolean; party_games: { id: string; kind: GameMode; created_at: string; players: number } | null }[]) : [])
    if (r.party_games)
      out.set(r.party_games.id, { t: "parti", id: r.party_games.id, kind: r.party_games.kind, created_at: r.party_games.created_at, players: r.party_games.players, points: r.points, winner: r.winner });
  return [...out.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function GameCard({ g }: { g: GameItem }) {
  const name = MODES.find((m) => m.id === g.kind)?.name ?? "Oyun";
  const href = g.t === "kulak" ? `/k/${g.id}` : `/p/${g.id}`;
  return (
    <Link href={href} className="panel group flex h-full flex-col gap-3 overflow-hidden p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent [&_svg]:size-5">{MODE_ICON[g.kind]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block text-[11px] text-muted">
            {g.players} oyuncu · {timeAgo(g.created_at)}
          </span>
        </span>
      </div>
      {g.t === "parti" && g.kind !== "hikaye" && (
        <p className={cx("mt-auto inline-flex items-center gap-1.5 text-xs", g.winner ? "text-accent" : "text-fg-2")}>
          {g.winner && <Crown className="size-3.5" />}
          {g.points ?? 0} puan{g.winner ? " · birinci" : ""}
        </p>
      )}
      {g.kind === "hikaye" && <p className="mt-auto text-xs text-fg-2">{g.points ?? 0} parça anlattı</p>}
      {g.t === "kulak" && <p className="mt-auto text-xs text-fg-2">Cümleler ağızdan ağıza</p>}
    </Link>
  );
}

export function PinButton({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={on ? "Vitrinden kaldır" : "Vitrine sabitle"}
      aria-label={on ? "Vitrinden kaldır" : "Vitrine sabitle"}
      className={cx(
        "absolute top-2 right-2 z-10 inline-flex size-8 items-center justify-center rounded-full border backdrop-blur-sm transition-colors disabled:opacity-50",
        on ? "border-accent bg-accent text-accent-fg" : "border-white/15 bg-black/55 text-white/80 hover:bg-black/75 hover:text-white",
      )}
    >
      {on ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
    </button>
  );
}

export const inShowcase = (list: ShowcaseItem[] | undefined, t: ShowcaseItem["t"], id: string) => !!list?.some((x) => x.t === t && x.id === id);
