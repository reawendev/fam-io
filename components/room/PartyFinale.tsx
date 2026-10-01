"use client";

import { Check, Dices, Link2, PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";
import PartyResults from "@/components/PartyResults";
import { Button, EmptyState, Notice, Spinner } from "@/components/ui";
import { PARTY_GAME_SELECT, type PartyGameRow } from "@/lib/party";
import { errMsg, sb } from "@/lib/supabase";
import type { LobbyProps } from "./Lobby";

/** Parti modları ve sesli hikâye finali: sonuçlar, paylaşım linki, yeni tur */
export default function PartyFinale({ room, isHost, reload }: Omit<LobbyProps, "scene" | "assignments">) {
  const id = room.mode_state?.game ?? null;
  const [game, setGame] = useState<PartyGameRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return setGame(null);
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

  async function reset() {
    if (!confirm("Lobiye dönülecek. Bu oyunun sonuçları paylaşım linkinde kalır. Devam?")) return;
    const { error } = await sb().rpc("reset_room", { p_room: room.id });
    if (error) setError(errMsg(error));
    else reload?.();
  }

  async function share() {
    if (!id) return;
    const url = `${location.origin}/p/${id}`;
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) await navigator.share({ title: "fam-io", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }

  const story = room.mode === "hikaye";
  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div>
          <p className="eyebrow">Final</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{story ? "Hikâyemiz hazır" : "Kim kazandı?"}</h1>
        </div>
        {error && <Notice>{error}</Notice>}
        {game === undefined ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted">
            <Spinner /> Sonuçlar yükleniyor
          </div>
        ) : game === null ? (
          <EmptyState icon={<PartyPopper className="size-5" />} title="Kimse kayıt göndermedi">
            Bu oyunda kayıt yok. Yeni bir tur başlatabilirsin.
          </EmptyState>
        ) : (
          <PartyResults game={game} />
        )}
      </section>
      <aside className="flex flex-col gap-4">
        <div className="panel flex flex-col gap-2 p-4">
          {id && (
            <Button icon={copied ? <Check className="size-4 text-ok" /> : <Link2 className="size-4" />} onClick={share}>
              {copied ? "Link kopyalandı" : "Sonuçları paylaş"}
            </Button>
          )}
          {isHost ? (
            <Button variant="primary" icon={<Dices className="size-4" />} onClick={reset}>
              Yeni tur
            </Button>
          ) : (
            <p className="text-center text-xs text-muted">Yeni turu oda sahibi başlatır.</p>
          )}
        </div>
        <div className="panel p-4 text-xs leading-relaxed text-muted">
          {story ? "Kayıt ekleyen herkes parça başına +5 XP aldı (en fazla 30)." : "Her puan +5 XP; katılım +5 XP, birinci +15 XP daha. Profilindeki vitrine sabitleyebilirsin."}
        </div>
      </aside>
    </main>
  );
}
