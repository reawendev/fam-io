"use client";

import { Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { BOARD_INFO, loadSoundItems, playItemSound, type SoundItem } from "@/lib/shop";
import { sb } from "@/lib/supabase";
import type { RoomPlayer } from "@/lib/types";
import { cx } from "./ui";

const COOLDOWN = 1200;

/**
 * Lobi efekt düğmeleri: basınca odadaki herkese çalar (Supabase Realtime broadcast, veritabanına yazmaz).
 * Ücretsiz 3 ses herkeste var; diğerleri mağazadan alınır.
 */
export default function Soundboard({ roomId, me, players }: { roomId: string; me: string; players: RoomPlayer[] }) {
  const [owned, setOwned] = useState<string[]>([]);
  const [items, setItems] = useState<SoundItem[]>([]);
  const itemsRef = useRef<Record<string, SoundItem>>({});
  const [muted, setMuted] = useState(false);
  const [cool, setCool] = useState(false);
  const [feed, setFeed] = useState<{ k: number; who: string; id: string }[]>([]);
  const chRef = useRef<RealtimeChannel | null>(null);
  const mutedRef = useRef(false);
  const recent = useRef(new Map<string, number[]>());
  const namesRef = useRef<Record<string, string>>({});
  namesRef.current = Object.fromEntries(players.map((p) => [p.user_id, p.nickname]));

  useEffect(() => {
    try {
      const m = localStorage.getItem("famio.sfx") === "0";
      setMuted(m);
      mutedRef.current = m;
    } catch {}
    loadSoundItems(true).then((list) => {
      const boards = list.filter((x) => x.kind === "board");
      setItems(boards);
      itemsRef.current = Object.fromEntries(boards.map((x) => [x.id, x]));
    });
    sb()
      .from("user_items")
      .select("item_id")
      .eq("user_id", me)
      .like("item_id", "board_%")
      .then(({ data }) => setOwned(Array.isArray(data) ? (data as { item_id: string }[]).map((r) => r.item_id) : []));
  }, [me]);

  function show(who: string, id: string) {
    const k = Date.now() + Math.random();
    setFeed((f) => [...f.slice(-2), { k, who, id }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.k !== k)), 2600);
  }

  useEffect(() => {
    const ch = sb()
      .channel(`sfx:${roomId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "sfx" }, ({ payload }) => {
        const { id, u } = (payload ?? {}) as { id?: string; u?: string };
        const it = id ? itemsRef.current[id] : undefined;
        if (!it || !u || !namesRef.current[u]) return;
        // Aynı kişiden 3 sn'de en fazla 4 ses
        const now = Date.now();
        const list = (recent.current.get(u) ?? []).filter((t) => now - t < 3000);
        if (list.length >= 4) return;
        recent.current.set(u, [...list, now]);
        if (!mutedRef.current) playItemSound(it, 0.7);
        show(namesRef.current[u], it.id);
      })
      .subscribe();
    chRef.current = ch;
    return () => {
      sb().removeChannel(ch);
      chRef.current = null;
    };
  }, [roomId]);

  function press(id: string) {
    if (cool) return;
    setCool(true);
    setTimeout(() => setCool(false), COOLDOWN);
    const it = itemsRef.current[id];
    if (it) playItemSound(it, 0.7);
    show("Sen", id);
    chRef.current?.send({ type: "broadcast", event: "sfx", payload: { id, u: me } }).catch(() => {});
  }

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    try {
      localStorage.setItem("famio.sfx", m ? "0" : "1");
    } catch {}
  }

  const list = items.filter((x) => x.price === 0 || owned.includes(x.id)).map((x) => x.id);
  const emojiOf = (id: string) => itemsRef.current[id]?.emoji ?? BOARD_INFO[id]?.emoji ?? "🔊";
  const labelOf = (id: string) => itemsRef.current[id]?.name ?? BOARD_INFO[id]?.label ?? id;
  const more = items.length - list.length;

  return (
    <div className="panel relative">
      <div className="panel-head">
        <h3 className="text-sm font-medium">Efekt düğmeleri</h3>
        <button
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          onClick={toggleMute}
          aria-pressed={muted}
          title={muted ? "Başkalarının efektleri sessiz" : "Başkalarının efektleri açık"}
        >
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          {muted ? "Sessiz" : "Sesli"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-3">
        {list.map((id) => (
          <button
            key={id}
            onClick={() => press(id)}
            disabled={cool}
            className={cx(
              "flex flex-col items-center gap-0.5 rounded-lg border border-line bg-bg px-1 py-2 text-[11px] text-fg-2 transition-all hover:border-line-strong hover:text-fg active:scale-95 disabled:opacity-60",
            )}
            aria-label={labelOf(id)}
          >
            <span className="text-lg leading-none" aria-hidden>
              {emojiOf(id)}
            </span>
            <span className="w-full truncate">{labelOf(id)}</span>
          </button>
        ))}
      </div>
      <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
        Basınca odadaki herkese çalar.{" "}
        {more > 0 && (
          <Link href="/magaza?tur=board" className="text-fg-2 hover:underline">
            Mağazada {more} ses daha
          </Link>
        )}
      </p>
      <div className="pointer-events-none absolute right-3 bottom-12 flex flex-col items-end gap-1" aria-live="polite">
        {feed.map((f) => (
          <span key={f.k} className="toast-in rounded-full border border-line-strong bg-surface-3 px-2.5 py-1 text-xs shadow-lg">
            {emojiOf(f.id)} <span className="text-fg-2">{f.who}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
