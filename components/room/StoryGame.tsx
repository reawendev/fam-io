"use client";

import { BookOpen, Headphones, Send, SkipForward } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { Avatar, Button, cx, Notice, Spinner } from "@/components/ui";
import { PARTY_MAX_SEC } from "@/lib/modes";
import { uploadPartyClip, useOnePlayer, type StoryState } from "@/lib/party";
import { errMsg, sb } from "@/lib/supabase";
import type { LobbyProps } from "./Lobby";

const LISTENS = 2;

/** Sesli hikâye: sırası gelen sadece bir önceki parçayı duyar ve bir cümle ekler */
export default function StoryGame({ room, me, players, isHost, reload }: Omit<LobbyProps, "scene" | "assignments">) {
  const ms = room.mode_state ?? {};
  const [st, setSt] = useState<StoryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [blob, setBlob] = useState<{ b: Blob; ext: string } | null>(null);
  const [listens, setListens] = useState(0);
  const player = useOnePlayer();

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("party_state", { p_room: room.id });
    if (error) return setError(errMsg(error));
    setSt(data as StoryState);
  }, [room.id]);

  useEffect(() => {
    setBlob(null);
    setListens(0);
    setError(null);
    player.stop();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ms.turn]);

  const byId = Object.fromEntries(players.map((p) => [p.user_id, p]));
  const cur = st?.current ? byId[st.current] : undefined;
  const myTurn = !!st && st.current === me && !!st.token;
  const order = st?.order ?? ms.order ?? [];

  function listen() {
    if (!st?.prev || listens >= LISTENS) return;
    setListens((n) => n + 1);
    player.play("prev", st.prev);
  }

  async function send() {
    if (!st?.token || !blob) return;
    setBusy("send");
    setError(null);
    try {
      const path = await uploadPartyClip(st.token, blob.b, blob.ext);
      const { error } = await sb().rpc("party_submit_clip", { p_room: room.id, p_path: path });
      if (error) throw error;
      setBlob(null);
      await load();
      reload?.();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function skip() {
    if (!confirm(`${cur?.nickname ?? "Bu oyuncu"} atlansın mı? Sıra bir sonrakine geçer.`)) return;
    setBusy("skip");
    const { error } = await sb().rpc("party_skip", { p_room: room.id });
    setBusy(null);
    if (error) setError(errMsg(error));
    else reload?.();
  }

  const turn = st?.turn ?? ms.turn ?? 1;
  const turns = st?.turns ?? ms.turns ?? 1;

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${((turn - 1) / turns) * 100}%` }} />
          </div>
          <span className="font-mono text-xs text-muted">
            Parça {Math.min(turn, turns)}/{turns}
          </span>
        </div>

        <div className="panel relative overflow-hidden p-5">
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_160px_at_0%_0%,rgba(255,122,26,0.12),transparent)]" />
          <p className="eyebrow relative flex items-center gap-1.5">
            <BookOpen className="size-3.5" /> Hikâyenin açılışı
          </p>
          <p className="relative mt-2 text-xl leading-snug font-medium tracking-tight sm:text-2xl">{st?.topic ?? ms.topic}</p>
        </div>

        {error && <Notice>{error}</Notice>}

        {!st ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted">
            <Spinner /> Hazırlanıyor
          </div>
        ) : myTurn ? (
          <div className="panel flex flex-col gap-4 p-5">
            <div>
              <p className="text-lg font-semibold tracking-tight text-accent">Sıra sende!</p>
              <p className="mt-1 text-sm text-fg-2">
                {st.prev
                  ? "Sadece bir önceki parçayı duyabilirsin. Dinle ve hikâyeye bir cümle ekle."
                  : "Hikâyeyi sen başlatıyorsun: açılış cümlesinden devam et."}
              </p>
            </div>
            {st.prev && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant={listens === 0 ? "primary" : "secondary"} icon={<Headphones className="size-4" />} disabled={listens >= LISTENS || player.now === "prev"} onClick={listen}>
                  {player.now === "prev" ? "Dinleniyor…" : listens === 0 ? "Önceki parçayı dinle" : "Bir daha dinle"}
                </Button>
                <span className="text-xs text-muted">{LISTENS - listens > 0 ? `${LISTENS - listens} dinleme hakkın kaldı` : "Dinleme hakkın bitti"}</span>
              </div>
            )}
            <VoiceRecorder
              key={turn}
              value={null}
              max={PARTY_MAX_SEC.hikaye}
              size="md"
              label={`Kaydet (${PARTY_MAX_SEC.hikaye} sn)`}
              disabled={!!st.prev && listens === 0}
              onChange={(b, ext) => setBlob({ b, ext })}
            />
            {st.prev && listens === 0 && <p className="-mt-2 text-xs text-muted">Kayda geçmeden önce dinle.</p>}
            <Button variant="primary" className="self-start" icon={<Send className="size-4" />} loading={busy === "send"} disabled={!blob || !!busy} onClick={send}>
              Gönder ve sırayı devret
            </Button>
          </div>
        ) : (
          <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
            {cur ? (
              <Avatar name={cur.nickname} color={cur.color} path={cur.avatar_path} frame={cur.equipped?.frame} size={56} />
            ) : (
              <Spinner />
            )}
            <p className="font-medium">{cur ? `Şu an anlatan: ${cur.nickname}` : "Sıradaki hazırlanıyor"}</p>
            <p className="max-w-sm text-sm text-muted">
              Hikâyenin geri kalanını finalde hep birlikte dinleyeceksiniz.
              {st.mine > 0 ? ` Senin ${st.mine} parçan var.` : ""}
            </p>
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <div className="panel">
          <div className="panel-head">
            <h3 className="text-sm font-medium">Anlatım sırası</h3>
          </div>
          <ol className="flex flex-col gap-1 p-2">
            {order.map((u, i) => {
              const p = byId[u];
              const active = st?.current === u;
              return (
                <li key={u} className={cx("flex items-center gap-2.5 rounded-lg px-2 py-1.5", active && "bg-accent/[0.08]")}>
                  <span className="w-4 text-center font-mono text-xs text-muted">{i + 1}</span>
                  <Avatar name={p?.nickname ?? "?"} color={p?.color} path={p?.avatar_path} size={24} />
                  <span className={cx("min-w-0 flex-1 truncate text-sm", !p && "text-muted line-through")}>
                    {p?.nickname ?? "Ayrıldı"}
                    {u === me && <span className="ml-1 text-xs text-muted">(sen)</span>}
                  </span>
                  {active && <span className="rec-dot size-2 rounded-full bg-rec" aria-label="Anlatıyor" />}
                </li>
              );
            })}
          </ol>
          {isHost && st && !myTurn && st.current && (
            <div className="border-t border-line p-3">
              <Button size="sm" variant="ghost" className="w-full" icon={<SkipForward className="size-3.5" />} loading={busy === "skip"} disabled={!!busy} onClick={skip}>
                Sırayı atla
              </Button>
            </div>
          )}
        </div>
        <div className="panel p-4 text-xs leading-relaxed text-muted">Sıra herkese {Math.max(1, Math.ceil(turns / Math.max(1, order.length)))} kez gelir. Kısa ve net cümleler hikâyeyi daha komik yapar.</div>
      </aside>
    </main>
  );
}
