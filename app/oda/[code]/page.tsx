"use client";

import { Check, Copy } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRoom } from "@/components/room/useRoom";
import Lobby from "@/components/room/Lobby";
import Recorder from "@/components/room/Recorder";
import Finale from "@/components/room/Finale";
import { Button, ButtonLink, cx, Notice, Spinner } from "@/components/ui";
import { errMsg, sb } from "@/lib/supabase";
import { useMe } from "@/lib/auth";
import type { RoomStatus } from "@/lib/types";

const PHASES: { id: RoomStatus; label: string }[] = [
  { id: "lobby", label: "Lobi" },
  { id: "recording", label: "Kayıt" },
  { id: "finale", label: "Final" },
];

export default function OdaPage() {
  const { code } = useParams<{ code: string }>();
  const r = useRoom(code);
  const me = useMe();
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const autoTried = useRef(false);

  const inRoom = !!r.me && r.players.some((p) => p.user_id === r.me);

  async function join() {
    setJoining(true);
    setJoinErr(null);
    try {
      const { error } = await sb().rpc("join_room", { p_code: code.toUpperCase(), p_nickname: "" });
      if (error) throw error;
      await r.reload();
    } catch (e) {
      setJoinErr(errMsg(e));
    } finally {
      setJoining(false);
    }
  }

  // Lobideki odaya otomatik katıl
  useEffect(() => {
    if (autoTried.current || r.loading || !r.room || inRoom || r.room.status !== "lobby") return;
    autoTried.current = true;
    join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.loading, r.room, inRoom]);

  if (r.loading)
    return (
      <Center>
        <Spinner /> <span className="text-sm text-muted">Oda yükleniyor</span>
      </Center>
    );
  if (r.error && !r.room)
    return (
      <Center>
        <div className="flex w-full max-w-sm flex-col gap-4">
          <Notice>{r.error}</Notice>
          <ButtonLink href="/" size="sm" className="self-start">
            Ana sayfa
          </ButtonLink>
        </div>
      </Center>
    );
  if (!r.room || !r.scene || !r.me)
    return (
      <Center>
        <Spinner />
      </Center>
    );

  const room = r.room;
  const isHost = room.host_id === r.me;

  if (!inRoom && room.status === "lobby") {
    return (
      <Center>
        <div className="panel flex w-full max-w-sm flex-col gap-3 p-5">
          <div>
            <p className="eyebrow">Davet</p>
            <h1 className="mt-2 text-lg font-semibold tracking-tight">
              <span className="font-mono text-accent">{room.code}</span> odasına katıl
            </h1>
            <p className="mt-1 text-sm text-muted">{r.scene.title}</p>
          </div>
          <Button variant="primary" loading={joining} onClick={join}>
            {me.status === "in" ? `${me.profile.display_name} olarak katıl` : "Katıl"}
          </Button>
          {joinErr && <Notice>{joinErr}</Notice>}
        </div>
      </Center>
    );
  }

  const common = { room, scene: r.scene, me: r.me, players: r.players, assignments: r.assignments, isHost, reload: r.reload };

  return (
    <>
      <RoomBar code={room.code} title={r.scene.title} status={room.status} />
      {r.error && (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <Notice>{r.error}</Notice>
        </div>
      )}
      {room.status === "lobby" && <Lobby {...common} />}
      {room.status === "recording" &&
        (inRoom ? (
          <Recorder {...common} />
        ) : (
          <Center>
            <div className="max-w-sm text-center">
              <p className="font-medium">Bu odada oyun başladı</p>
              <p className="mt-1 text-sm text-muted">Oyuncular kayıt yapıyor. Final başlayınca bu sayfadan izleyebilirsin.</p>
            </div>
          </Center>
        ))}
      {room.status === "finale" && <Finale {...common} />}
    </>
  );
}

function RoomBar({ code, title, status }: { code: string; title: string; status: RoomStatus }) {
  const [copied, setCopied] = useState(false);
  const idx = PHASES.findIndex((p) => p.id === status);
  async function copy() {
    const url = `${location.origin}/oda/${code}`;
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        await navigator.share({ title: "fam-io", text: `Dublaj odama gel. Kod: ${code}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }
  return (
    <div className="border-b border-line bg-surface/50">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <button
          onClick={copy}
          className="group flex items-center gap-2 rounded-md py-1 text-sm"
          title="Davet linkini kopyala"
        >
          <span className="eyebrow">Oda</span>
          <span className="font-mono font-medium tracking-[0.15em] text-fg">{code}</span>
          {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5 text-muted transition-colors group-hover:text-fg" />}
        </button>
        <span className="hidden h-4 w-px bg-line sm:block" />
        <span className="hidden truncate text-sm text-fg-2 sm:block">{title}</span>
        <ol className="ml-auto flex items-center gap-1 text-xs">
          {PHASES.map((p, i) => (
            <li key={p.id} className="flex items-center gap-1">
              {i > 0 && <span className={cx("h-px w-3 sm:w-5", i <= idx ? "bg-fg-2" : "bg-line-strong")} />}
              <span
                className={cx(
                  "rounded-md px-2 py-1 font-medium",
                  i === idx ? "bg-surface-3 text-fg" : i < idx ? "text-fg-2" : "text-muted",
                )}
              >
                {p.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center gap-2 px-4">{children}</main>;
}
