"use client";

import { DoorClosed, DoorOpen, EyeOff, Globe, Lock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, cx, EmptyState, Notice, Skeleton } from "@/components/ui";
import { modeName } from "@/lib/modes";
import { timeAgo } from "@/lib/progress";
import { errMsg, sb } from "@/lib/supabase";
import type { GameMode, RoomStatus } from "@/lib/types";
import { Panel, type Msg } from "./Panel";

type Row = {
  id: string;
  code: string;
  mode: GameMode;
  status: RoomStatus;
  is_public: boolean;
  locked: boolean;
  created_at: string;
  players: number;
  last_seen: string | null;
  host: string | null;
  scene: string | null;
};

const STATUS: Record<RoomStatus, string> = { lobby: "Lobi", writing: "Yazım", recording: "Oyunda", finale: "Final" };

/** Tüm odalar (gizliler dahil): kim içeride, en son ne zaman ses verildi; tek tıkla kapat */
export default function RoomsPanel({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("admin_list_rooms");
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setRows((data as Row[]) ?? []);
  }, []);
  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  async function close(r: Row) {
    if (!confirm(`${r.code} odası kapatılsın mı? İçerideki herkes çıkar.`)) return;
    setBusy(r.id);
    const { error } = await sb().rpc("admin_close_room", { p_room: r.id });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: `${r.code} kapatıldı.` });
    load();
    onChanged?.();
  }

  async function closeEmpty() {
    setBusy("empty");
    const list = (rows ?? []).filter((r) => r.players === 0 || !r.last_seen || Date.now() - Date.parse(r.last_seen) > 5 * 60_000);
    for (const r of list) await sb().rpc("admin_close_room", { p_room: r.id });
    setBusy(null);
    setMsg({ tone: "info", text: `${list.length} sessiz oda kapatıldı.` });
    load();
    onChanged?.();
  }

  return (
    <Panel
      icon={<DoorOpen className="size-4" />}
      title="Odalar"
      right={
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={load}>
            Yenile
          </Button>
          <Button size="sm" variant="ghost" icon={<DoorClosed className="size-3.5" />} loading={busy === "empty"} disabled={!!busy || !rows?.length} onClick={closeEmpty}>
            Sessizleri kapat
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">
          Oyuncular 20 sn&apos;de bir &quot;buradayım&quot; der. Ses vermeyen oyuncu lobide 2, oyunda 5 dakika sonra düşer; boşalan oda kendiliğinden kapanır.
        </p>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {rows === null ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<DoorOpen className="size-5" />} title="Açık oda yok" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b border-line text-[11px] text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Kod</th>
                  <th className="px-3 py-2 font-medium">Mod / sahne</th>
                  <th className="px-3 py-2 font-medium">Durum</th>
                  <th className="px-3 py-2 font-medium">Oyuncu</th>
                  <th className="px-3 py-2 font-medium">Son ses</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const stale = !r.last_seen || Date.now() - Date.parse(r.last_seen) > 2 * 60_000;
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <Link href={`/oda/${r.code}`} className="font-mono tracking-[0.12em] text-fg hover:text-accent" target="_blank">
                          {r.code}
                        </Link>
                        <span className="ml-2 inline-flex items-center gap-1 align-middle text-muted">
                          {r.is_public ? <Globe className="size-3" aria-label="Açık" /> : <EyeOff className="size-3" aria-label="Gizli" />}
                          {r.locked && <Lock className="size-3 text-amber-200" aria-label="Kilitli" />}
                        </span>
                      </td>
                      <td className="max-w-56 px-3 py-2">
                        <span className="block truncate">{modeName(r.mode)}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {r.scene ?? "sahnesiz"} · @{r.host ?? "?"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-fg-2">{STATUS[r.status]}</td>
                      <td className="px-3 py-2 font-mono">{r.players}</td>
                      <td className={cx("px-3 py-2 text-[12px]", stale ? "text-amber-200" : "text-ok")}>{r.last_seen ? timeAgo(r.last_seen) : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="danger" loading={busy === r.id} disabled={!!busy} onClick={() => close(r)}>
                          Kapat
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}
