"use client";

import { Check, Copy, Lock, LogOut, UserX } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRoom } from "@/components/room/useRoom";
import Lobby from "@/components/room/Lobby";
import Recorder from "@/components/room/Recorder";
import Finale from "@/components/room/Finale";
import { Button, ButtonLink, cx, Notice, Spinner } from "@/components/ui";
import { errMsg, sb } from "@/lib/supabase";
import { useMe } from "@/lib/auth";
import type { GameMode, RoomStatus } from "@/lib/types";
import Writer from "@/components/room/Writer";
import DuelArena from "@/components/room/DuelArena";
import ChainFinale from "@/components/room/ChainFinale";
import PhoneGame from "@/components/room/PhoneGame";
import PhoneFinale from "@/components/room/PhoneFinale";
import PartyGame from "@/components/room/PartyGame";
import StoryGame from "@/components/room/StoryGame";
import PartyFinale from "@/components/room/PartyFinale";
import { needsScene } from "@/lib/modes";
import { modeName } from "@/lib/modes";

function phasesFor(mode?: GameMode): { id: RoomStatus; label: string }[] {
  if (mode === "senarist")
    return [
      { id: "lobby", label: "Lobi" },
      { id: "writing", label: "Yazım" },
      { id: "recording", label: "Kayıt" },
      { id: "finale", label: "Final" },
    ];
  if (mode === "hikaye")
    return [
      { id: "lobby", label: "Lobi" },
      { id: "recording", label: "Hikâye" },
      { id: "finale", label: "Final" },
    ];
  if (mode === "kulak" || mode === "kim" || mode === "efekt" || mode === "duygu")
    return [
      { id: "lobby", label: "Lobi" },
      { id: "recording", label: "Turlar" },
      { id: "finale", label: "Final" },
    ];
  if (mode === "duello")
    return [
      { id: "lobby", label: "Lobi" },
      { id: "recording", label: "Düello" },
      { id: "finale", label: "Şampiyon" },
    ];
  return [
    { id: "lobby", label: "Lobi" },
    { id: "recording", label: mode === "zincir" ? "Zincir" : "Kayıt" },
    { id: "finale", label: "Final" },
  ];
}

export default function OdaPage() {
  const { code } = useParams<{ code: string }>();
  const r = useRoom(code);
  const me = useMe();
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const autoTried = useRef(false);
  const router = useRouter();
  const leaving = useRef(false);
  const wasIn = useRef(false);
  const lastTry = useRef(0);

  const inRoom = !!r.me && r.players.some((p) => p.user_id === r.me);
  const banned = !!r.me && !!r.room?.banned?.includes(r.me);
  if (inRoom) wasIn.current = true;

  // Ayrılanları herkese göster: "X odadan ayrıldı"
  const [notes, setNotes] = useState<{ id: number; text: string }[]>([]);
  const prevPlayers = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const now = new Map(r.players.map((p) => [p.user_id, p.nickname]));
    const prev = prevPlayers.current;
    prevPlayers.current = now;
    if (!prev || !r.room) return;
    const gone = [...prev].filter(([id]) => !now.has(id) && id !== r.me);
    if (!gone.length) return;
    const fresh = gone.map(([id, nick]) => ({
      id: Math.random(),
      text: r.room!.banned?.includes(id) ? `${nick} odadan çıkarıldı` : `${nick} odadan ayrıldı`,
    }));
    setNotes((n) => [...n, ...fresh].slice(-3));
    const ids = fresh.map((f) => f.id);
    setTimeout(() => setNotes((n) => n.filter((x) => !ids.includes(x.id))), 4500);
  }, [r.players, r.room, r.me]);

  // Uygulama içinde başka sayfaya geçince lobideki / finaldeki odadan ayrıl.
  // (Oyun sürerken yanlışlıkla çıkan karakterini kaybetmesin: o zaman sunucu 5 dk sonra düşürür.)
  const statusRef = useRef(r.room?.status);
  statusRef.current = r.room?.status;
  const roomIdRef = useRef(r.room?.id);
  roomIdRef.current = r.room?.id;
  useEffect(() => {
    const path = `/oda/${code}`.toLowerCase();
    return () => {
      const id = roomIdRef.current;
      const st = statusRef.current;
      if (!id || leaving.current) return;
      setTimeout(() => {
        if (location.pathname.toLowerCase().startsWith(path)) return; // aynı sayfa (yeniden bağlanma)
        if (st === "lobby" || st === "finale") sb().rpc("leave_room", { p_room: id }).then(() => {});
      }, 300);
    };
  }, [code]);

  async function leave() {
    const st = r.room?.status;
    if ((st === "recording" || st === "writing") && !confirm("Oyun sürüyor. Odadan çıkarsan karakterlerin oda sahibine geçer. Çıkılsın mı?")) return;
    leaving.current = true;
    if (r.room) await sb().rpc("leave_room", { p_room: r.room.id });
    router.push("/odalar");
  }

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

  // Lobideki odaya otomatik katıl; bağlantı kopup düşürüldüyse (telefon uykusu vb.) geri dön
  useEffect(() => {
    if (r.loading || !r.room || inRoom || banned || leaving.current || r.room.status !== "lobby") return;
    if (autoTried.current && !(wasIn.current && r.dropped)) return;
    if (Date.now() - lastTry.current < 8000) return;
    autoTried.current = true;
    lastTry.current = Date.now();
    join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.loading, r.room, inRoom, r.dropped]);

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
  if (!r.room || !r.me || (!r.scene && needsScene(r.room.mode)))
    return (
      <Center>
        <Spinner />
      </Center>
    );

  const room = r.room;
  const isHost = room.host_id === r.me;
  const kulak = room.mode === "kulak";
  const party = room.mode === "kim" || room.mode === "efekt" || room.mode === "duygu" || room.mode === "hikaye";
  const sceneless = !needsScene(room.mode);
  const title = sceneless ? (modeName(room.mode)) : (r.scene?.title ?? "");

  if (banned && !inRoom) {
    return (
      <Center>
        <div className="panel flex w-full max-w-sm flex-col items-center gap-3 p-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
            <UserX className="size-5" />
          </span>
          <div>
            <p className="font-medium">Oda sahibi seni bu odadan çıkardı</p>
            <p className="mt-1 text-sm text-muted">Başka bir odaya katılabilir ya da kendi odanı kurabilirsin.</p>
          </div>
          <ButtonLink href="/sahneler" size="sm" variant="primary">
            Sahnelere git
          </ButtonLink>
        </div>
      </Center>
    );
  }

  if (!inRoom && room.status === "lobby") {
    return (
      <Center>
        <div className="panel flex w-full max-w-sm flex-col gap-3 p-5">
          <div>
            <p className="eyebrow">Davet</p>
            <h1 className="mt-2 text-lg font-semibold tracking-tight">
              <span className="font-mono text-accent">{room.code}</span> odasına katıl
            </h1>
            <p className="mt-1 text-sm text-muted">{title}</p>
          </div>
          {room.locked && (
            <p className="flex items-center gap-1.5 text-xs text-amber-200">
              <Lock className="size-3.5" /> Oda kilitli. Oda sahibinin kilidi açması gerekiyor.
            </p>
          )}
          <Button variant="primary" loading={joining} onClick={join}>
            {me.status === "in" ? `${me.profile.display_name} olarak katıl` : "Katıl"}
          </Button>
          {joinErr && <Notice>{joinErr}</Notice>}
        </div>
      </Center>
    );
  }

  const base = { room, me: r.me, players: r.players, assignments: r.assignments, isHost, reload: r.reload };
  // Sahne gereken ekranlar: kulak dışındaki modlarda sahne her zaman yüklü
  const common = { ...base, scene: r.scene! };

  return (
    <>
      <RoomBar
        code={room.code}
        title={sceneless ? "" : title}
        status={room.status}
        locked={!!room.locked}
        mode={room.mode}
        onLeave={inRoom ? leave : undefined}
      />
      {notes.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
          {notes.map((n) => (
            <p key={n.id} className="toast-in flex items-center gap-2 rounded-full border border-line-strong bg-surface-2/95 px-3.5 py-2 text-sm shadow-lg backdrop-blur">
              <LogOut className="size-3.5 text-muted" /> {n.text}
            </p>
          ))}
        </div>
      )}
      {r.error && (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <Notice>{r.error}</Notice>
        </div>
      )}
      {room.status === "lobby" && <Lobby {...base} scene={r.scene} />}
      {kulak && room.status === "recording" &&
        (inRoom ? (
          <PhoneGame {...base} />
        ) : (
          <Center>
            <div className="max-w-sm text-center">
              <p className="font-medium">Bu odada oyun başladı</p>
              <p className="mt-1 text-sm text-muted">Fısıltılar dolaşıyor. Final başlayınca bu sayfadan izleyebilirsin.</p>
            </div>
          </Center>
        ))}
      {kulak && room.status === "finale" && <PhoneFinale {...base} />}
      {party && room.status === "recording" &&
        (inRoom ? (
          room.mode === "hikaye" ? <StoryGame {...base} /> : <PartyGame {...base} />
        ) : (
          <Center>
            <div className="max-w-sm text-center">
              <p className="font-medium">Bu odada oyun başladı</p>
              <p className="mt-1 text-sm text-muted">Final başlayınca sonuçları bu sayfadan görebilirsin.</p>
            </div>
          </Center>
        ))}
      {party && room.status === "finale" && <PartyFinale {...base} />}
      {room.status === "writing" &&
        (inRoom ? (
          <Writer {...common} />
        ) : (
          <Center>
            <div className="max-w-sm text-center">
              <p className="font-medium">Senaristler yazıyor</p>
              <p className="mt-1 text-sm text-muted">Final başlayınca bu sayfadan izleyebilirsin.</p>
            </div>
          </Center>
        ))}
      {room.status === "recording" && room.mode === "duello" && <DuelArena {...common} />}
      {room.status === "recording" && room.mode !== "duello" && !sceneless &&
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
      {room.status === "finale" && !sceneless &&
        (room.mode === "duello" ? <DuelArena {...common} /> : room.mode === "zincir" ? <ChainFinale {...common} /> : <Finale {...common} />)}
    </>
  );
}

function RoomBar({
  code,
  title,
  status,
  locked,
  mode,
  onLeave,
}: {
  code: string;
  title: string;
  status: RoomStatus;
  locked: boolean;
  mode?: GameMode;
  onLeave?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const PHASES = phasesFor(mode);
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
        {locked && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-200" title="Oda kilitli: yeni kimse katılamaz">
            <Lock className="size-3.5" />
          </span>
        )}
        {title && <span className="hidden h-4 w-px bg-line sm:block" />}
        {title && <span className="hidden truncate text-sm text-fg-2 sm:block">{title}</span>}
        {mode && mode !== "klasik" && (
          <span className="hidden rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent md:inline">{modeName(mode)}</span>
        )}
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
        {onLeave && (
          <button
            onClick={onLeave}
            className="-mr-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-red-300"
            title="Odadan çık"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Çık</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center gap-2 px-4">{children}</main>;
}
