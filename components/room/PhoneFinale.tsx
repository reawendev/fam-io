"use client";

import { Check, Dices, Ear, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import PhoneChains, { type PhonePerson, type PhoneStep } from "@/components/PhoneChains";
import { Button, EmptyState, Notice, Spinner } from "@/components/ui";
import { errMsg, sb } from "@/lib/supabase";
import type { Equipped } from "@/lib/types";
import type { LobbyProps } from "./Lobby";

type Row = PhoneStep & {
  profile: { display_name: string; color: string; avatar_path: string | null; equipped: Equipped | null } | null;
};

/** Kulaktan kulağa finali: zincirler, paylaşım linki, yeni tur */
export default function PhoneFinale({ room, players, isHost, reload }: Omit<LobbyProps, "scene" | "assignments">) {
  const game = room.mode_state?.game ?? null;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!game) return setRows([]);
    sb()
      .from("phone_game_steps")
      .select("chain, step, user_id, audio_path, text, skipped, profile:profiles(display_name, color, avatar_path, equipped)")
      .eq("game_id", game)
      .then(({ data, error }) => {
        if (error) setError(errMsg(error));
        setRows((data as unknown as Row[]) ?? []);
      });
  }, [game]);

  const people: Record<string, PhonePerson> = {};
  for (const r of rows ?? [])
    if (r.user_id && r.profile)
      people[r.user_id] = { name: r.profile.display_name, color: r.profile.color, avatar_path: r.profile.avatar_path, frame: r.profile.equipped?.frame };
  for (const p of players) people[p.user_id] = { name: p.nickname, color: p.color, avatar_path: p.avatar_path, frame: p.equipped?.frame };

  async function reset() {
    if (!confirm("Lobiye dönülecek. Bu oyunun sonuçları paylaşım linkinde kalır. Devam?")) return;
    const { error } = await sb().rpc("reset_room", { p_room: room.id });
    if (error) setError(errMsg(error));
    else reload?.();
  }

  async function share() {
    if (!game) return;
    const url = `${location.origin}/k/${game}`;
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) await navigator.share({ title: "Kulaktan kulağa · fam-io", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div>
          <p className="eyebrow">Final</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Cümleler nereden nereye geldi?</h1>
          <p className="mt-1 text-sm text-muted">Her zinciri baştan oynat; sonunda ilk cümle ile son tahmin açılır.</p>
        </div>
        {error && <Notice>{error}</Notice>}
        {rows === null ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted">
            <Spinner /> Zincirler yükleniyor
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Ear className="size-5" />} title="Kimse kayıt göndermedi">
            Bu turda zincirler boş kaldı. Yeni bir tur başlatabilirsin.
          </EmptyState>
        ) : (
          <PhoneChains steps={rows} people={people} />
        )}
      </section>
      <aside className="flex flex-col gap-4">
        <div className="panel flex flex-col gap-2 p-4">
          {game && (
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
        <div className="panel p-4 text-xs leading-relaxed text-muted">Kayıt gönderen herkes bu oyundan +10 XP aldı.</div>
      </aside>
    </main>
  );
}
