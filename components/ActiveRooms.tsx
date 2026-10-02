"use client";

import { ArrowRight, Crown, DoorOpen, Lock, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MODE_ICON } from "@/components/room/ModePicker";
import { Avatar, ButtonLink, cx, EmptyState, Notice, Skeleton } from "@/components/ui";
import { modeName } from "@/lib/modes";
import { errMsg, publicUrl, sb } from "@/lib/supabase";
import type { Equipped, GameMode, RoomStatus } from "@/lib/types";

type Member = { username: string; display_name: string; color: string; avatar_path: string | null; equipped?: Equipped };
export type ActiveRoom = {
  id: string;
  code: string;
  mode: GameMode;
  status: RoomStatus;
  locked: boolean;
  created_at: string;
  players: number;
  scene: { id: string; title: string; thumb_path: string | null } | null;
  host: Member | null;
  members: Member[];
};

const STATUS: Record<RoomStatus, { label: string; cls: string }> = {
  lobby: { label: "Lobide", cls: "bg-ok/10 text-ok" },
  writing: { label: "Yazıyorlar", cls: "bg-amber-400/10 text-amber-200" },
  recording: { label: "Oyunda", cls: "bg-amber-400/10 text-amber-200" },
  finale: { label: "Finalde", cls: "bg-accent/10 text-accent" },
};

/** Herkese açık odalar (list_active_rooms). 10 sn'de bir kendini yeniler. */
export default function ActiveRooms({ limit, compact }: { limit?: number; compact?: boolean }) {
  const [rooms, setRooms] = useState<ActiveRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("list_active_rooms");
    if (error) {
      setError(errMsg(error));
      setRooms((r) => r ?? []);
      return;
    }
    setError(null);
    setRooms((data as ActiveRoom[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => document.visibilityState === "visible" && load(), 10000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const list = rooms ? (limit ? rooms.slice(0, limit) : rooms) : null;

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-ok" />
            </span>
            {rooms === null ? "Odalar yükleniyor" : `${rooms.length} açık oda · ${rooms.reduce((s, r) => s + r.players, 0)} oyuncu`}
          </p>
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            onClick={async () => {
              setSpin(true);
              await load();
              setTimeout(() => setSpin(false), 400);
            }}
          >
            <RefreshCw className={cx("size-3.5", spin && "animate-spin")} /> Yenile
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice>{error}</Notice>
        </div>
      )}
      {list === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: compact ? 3 : 6 }, (_, i) => (
            <Skeleton key={i} className="h-[148px] w-full rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="size-5" />}
          title="Şu an açık oda yok"
          action={
            <ButtonLink href="/oyna" size="sm" variant="primary">
              Oda kur
            </ButtonLink>
          }
        >
          Oda kurduğunda &quot;Herkese açık&quot; seçiliyse burada görünür, arkadaşların tek tıkla katılır.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <li key={r.id}>
              <RoomCard r={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomCard({ r }: { r: ActiveRoom }) {
  const st = STATUS[r.status] ?? STATUS.lobby;
  const canJoin = r.status === "lobby" && !r.locked && r.players < 12;
  const extra = Math.max(0, r.players - r.members.length);
  return (
    <Link
      href={`/oda/${r.code}`}
      className="panel group flex h-full flex-col overflow-hidden transition-colors hover:border-line-strong"
      title={canJoin ? "Katıl" : r.status === "lobby" ? "Oda kilitli / dolu" : "Final başlayınca izleyebilirsin"}
    >
      <div className="relative flex h-20 items-center gap-3 overflow-hidden border-b border-line px-4">
        {r.scene?.thumb_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publicUrl("scenes", r.scene.thumb_path)} alt="" className="absolute inset-0 size-full object-cover opacity-35 transition-opacity group-hover:opacity-45" />
        ) : (
          <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(255,122,26,0.18),transparent_70%)]" />
        )}
        <span className="absolute inset-0 bg-gradient-to-r from-surface via-surface/70 to-transparent" />
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent [&_svg]:size-5">{MODE_ICON[r.mode]}</span>
        <span className="relative min-w-0 flex-1">
          <span className="block truncate font-medium">{modeName(r.mode)}</span>
          <span className="block truncate text-xs text-fg-2">{r.scene?.title ?? "Sahnesiz"}</span>
        </span>
        <span className={cx("relative shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", st.cls)}>{st.label}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="flex -space-x-2">
            {r.members.map((m) => (
              <span key={m.username} className="rounded-full ring-2 ring-surface" title={m.display_name}>
                <Avatar name={m.display_name} color={m.color} path={m.avatar_path} size={26} />
              </span>
            ))}
          </span>
          {extra > 0 && <span className="font-mono text-xs text-muted">+{extra}</span>}
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-muted">
            <Users className="size-3.5" /> {r.players}/12
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-muted">
            <Crown className="size-3.5 shrink-0 text-accent" />
            <span className="truncate">{r.host?.display_name ?? "?"}</span>
            <span className="font-mono tracking-[0.12em] text-fg-2">{r.code}</span>
          </span>
          {r.locked ? (
            <span className="inline-flex items-center gap-1 text-amber-200">
              <Lock className="size-3.5" /> Kilitli
            </span>
          ) : canJoin ? (
            <span className="inline-flex items-center gap-1 font-medium text-accent">
              Katıl <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          ) : (
            <span className="text-muted">İzle</span>
          )}
        </div>
      </div>
    </Link>
  );
}
