"use client";

import { Gamepad2, PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";
import PartyResults from "./PartyResults";
import { ButtonLink, EmptyState, Notice, Skeleton } from "./ui";
import { MODES } from "@/lib/modes";
import { PARTY_GAME_SELECT, type PartyGameRow } from "@/lib/party";
import { errMsg, sb } from "@/lib/supabase";

/** /p/[id]: biten parti oyununun / sesli hikâyenin paylaşım sayfası */
export default function PartyGameView({ id }: { id: string }) {
  const [game, setGame] = useState<PartyGameRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return setGame(null);
    sb()
      .from("party_games")
      .select(PARTY_GAME_SELECT)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(errMsg(error));
        setGame((data as unknown as PartyGameRow) ?? null);
      });
  }, [id]);

  const names = game?.party_game_players.map((p) => p.profile?.display_name).filter(Boolean) ?? [];
  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
      {game === undefined ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 rounded-[var(--radius-card)]" />
        </div>
      ) : game === null ? (
        <EmptyState
          icon={<PartyPopper className="size-5" />}
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
              <p className="eyebrow">{MODES.find((m) => m.id === game.kind)?.name}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">{game.kind === "hikaye" ? "Sırayla anlatılan bir hikâye" : "Parti sonuçları"}</h1>
              <p className="mt-1 text-sm text-muted">
                {names.join(", ")} · {new Date(game.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
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
          <PartyResults game={game} />
        </>
      )}
    </main>
  );
}
