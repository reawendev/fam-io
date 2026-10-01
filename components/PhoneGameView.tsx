"use client";

import { Ear, Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";
import PhoneChains, { type PhonePerson, type PhoneStep } from "./PhoneChains";
import { ButtonLink, EmptyState, Notice, Skeleton } from "./ui";
import { errMsg, sb } from "@/lib/supabase";
import type { Equipped } from "@/lib/types";

type Row = PhoneStep & {
  profile: { display_name: string; username: string; color: string; avatar_path: string | null; equipped: Equipped | null } | null;
};
type Game = { id: string; created_at: string; players: number };

/** /k/[id]: biten bir kulaktan kulağa oyununun paylaşım sayfası */
export default function PhoneGameView({ id }: { id: string }) {
  const [game, setGame] = useState<Game | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return setGame(null);
    (async () => {
      const [g, s] = await Promise.all([
        sb().from("phone_games").select("id, created_at, players").eq("id", id).maybeSingle(),
        sb()
          .from("phone_game_steps")
          .select("chain, step, user_id, audio_path, text, skipped, profile:profiles(display_name, username, color, avatar_path, equipped)")
          .eq("game_id", id),
      ]);
      if (g.error || s.error) setError(errMsg(g.error ?? s.error));
      setGame((g.data as Game) ?? null);
      setRows((s.data as unknown as Row[]) ?? []);
    })();
  }, [id]);

  const people: Record<string, PhonePerson> = {};
  for (const r of rows)
    if (r.user_id && r.profile)
      people[r.user_id] = { name: r.profile.display_name, color: r.profile.color, avatar_path: r.profile.avatar_path, frame: r.profile.equipped?.frame };
  const names = Object.values(people).map((p) => p.name);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
      {game === undefined ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 rounded-[var(--radius-card)]" />
        </div>
      ) : game === null ? (
        <EmptyState
          icon={<Ear className="size-5" />}
          title="Oyun bulunamadı"
          action={
            <ButtonLink href="/oyna" size="sm" variant="primary">
              Oyun kur
            </ButtonLink>
          }
        >
          Link hatalı olabilir ya da oyun silinmiş.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">Kulaktan kulağa</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Cümleler nereden nereye geldi?</h1>
              <p className="mt-1 text-sm text-muted">
                {names.join(", ")} ·{" "}
                {new Date(game.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <ButtonLink href="/oyna" variant="primary" icon={<Gamepad2 className="size-4" />}>
              Sen de oyna
            </ButtonLink>
          </div>
          {error && (
            <div className="mb-4">
              <Notice>{error}</Notice>
            </div>
          )}
          <PhoneChains steps={rows} people={people} />
        </>
      )}
    </main>
  );
}
