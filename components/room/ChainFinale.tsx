"use client";

import { Dices } from "lucide-react";
import { useEffect, useState } from "react";
import ChainView, { type ChainRec } from "@/components/ChainView";
import VotePanel from "@/components/VotePanel";
import { Button, Notice, Spinner } from "@/components/ui";
import { errMsg, sb } from "@/lib/supabase";
import { DubSaved } from "./Finale";
import type { RoomProps } from "./Lobby";

/** Kulaktan kulağa finali: zincir görünümü, kayıt arşivi ve oylama */
export default function ChainFinale({ room, scene, me, players, isHost, reload }: RoomProps) {
  const [recs, setRecs] = useState<ChainRec[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const order = room.mode_state?.order ?? [];

  useEffect(() => {
    sb()
      .from("recordings")
      .select("line_id, user_id, audio_path, offset_time, effect")
      .eq("room_id", room.id)
      .then(({ data, error }) => {
        if (error) setError(errMsg(error));
        setRecs((data as ChainRec[]) ?? []);
      });
  }, [room.id, room.finale_at]);

  const people = Object.fromEntries(
    players.map((p) => [p.user_id, { name: p.nickname, color: p.color, avatar_path: p.avatar_path, frame: p.equipped?.frame }]),
  );

  async function reset() {
    if (!confirm("Kayıtlar silinip lobiye dönülecek. Emin misin?")) return;
    const { error } = await sb().rpc("reset_room", { p_room: room.id });
    if (error) setError(errMsg(error));
    else reload?.();
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-w-0 flex-col gap-4">
        {error && <Notice>{error}</Notice>}
        {recs === null ? (
          <div className="flex items-center gap-2 py-20 text-sm text-muted">
            <Spinner /> Zincir yükleniyor
          </div>
        ) : (
          <ChainView scene={scene} order={order} recs={recs} people={people} />
        )}
      </section>
      <aside className="flex flex-col gap-4">
        {room.current_dub_id && <DubSaved dubId={room.current_dub_id} me={me} />}
        {room.current_dub_id && <VotePanel dubId={room.current_dub_id} scene={scene} me={me} />}
        <div className="panel flex flex-col gap-2 p-4">
          {isHost ? (
            <Button variant="primary" icon={<Dices className="size-4" />} onClick={reset}>
              Yeni tur
            </Button>
          ) : (
            <p className="text-center text-xs text-muted">Yeni turu oda sahibi başlatır.</p>
          )}
        </div>
      </aside>
    </main>
  );
}
