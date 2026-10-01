"use client";

import { Check, Headphones, PenLine, Square, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, cx, Notice, RoleTag, Spinner } from "@/components/ui";
import { playOriginal, unlockAudio } from "@/lib/player";
import { errMsg, publicUrl, sb } from "@/lib/supabase";
import { suggestedChars } from "@/lib/modes";
import { fmtTime, sortLines } from "@/lib/types";
import type { RoomProps } from "./Lobby";

type Assigned = { line_id: string; author: string; text: string | null };

/**
 * Senarist modu, yazım aşaması: herkes kendisine düşen replikleri (kendi seslendirmediği karakterlerin)
 * parodi olarak yeniden yazar. Kaydetmek otomatik; bitince "Yazdım" denir, oda sahibi kayda geçirir.
 */
export default function Writer({ room, scene, me, players, assignments, isHost, reload }: RoomProps) {
  const roles = useMemo(() => Object.fromEntries(scene.scene_roles.map((r) => [r.id, r])), [scene]);
  const lineById = useMemo(() => Object.fromEntries(scene.scene_lines.map((l) => [l.id, l])), [scene]);
  const [mine, setMine] = useState<Assigned[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, "kaydediliyor" | "kaydedildi" | "hata">>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const meDone = players.find((p) => p.user_id === me)?.done ?? false;

  useEffect(() => {
    sb()
      .from("room_line_texts")
      .select("line_id, author, text")
      .eq("room_id", room.id)
      .eq("author", me)
      .then(({ data, error }) => {
        if (error) setError(errMsg(error));
        const rows = ((data as Assigned[]) ?? []).filter((r) => lineById[r.line_id]);
        rows.sort((a, b) => lineById[a.line_id].start_time - lineById[b.line_id].start_time);
        setMine(rows);
        setDrafts(Object.fromEntries(rows.map((r) => [r.line_id, r.text ?? ""])));
      });
  }, [room.id, me, lineById]);

  useEffect(() => () => stopRef.current?.(), []);

  function save(lineId: string, text: string) {
    clearTimeout(timers.current[lineId]);
    timers.current[lineId] = setTimeout(async () => {
      setSaved((s) => ({ ...s, [lineId]: "kaydediliyor" }));
      const { error } = await sb().rpc("write_line", { p_room: room.id, p_line: lineId, p_text: text });
      setSaved((s) => ({ ...s, [lineId]: error ? "hata" : "kaydedildi" }));
      if (error) setError(errMsg(error));
    }, 600);
  }

  async function listen(lineId: string) {
    const v = videoRef.current;
    const l = lineById[lineId];
    if (!v || !l) return;
    stopRef.current?.();
    if (playing === lineId) return setPlaying(null);
    await unlockAudio(v);
    setPlaying(lineId);
    stopRef.current = playOriginal(v, Math.max(0, l.start_time - 0.6), l.end_time + 0.4, () => setPlaying(null));
  }

  async function toggleDone() {
    const { error } = await sb().from("room_players").update({ done: !meDone }).eq("room_id", room.id).eq("user_id", me);
    if (error) setError(errMsg(error));
    else reload?.();
  }

  async function finish() {
    const notDone = players.filter((p) => !p.done);
    if (notDone.length && !confirm(`${notDone.map((p) => p.nickname).join(", ")} henüz bitirmedi. Yine de kayda geçelim mi? Yazılmayan replikler orijinal kalır.`)) return;
    const { error } = await sb().rpc("finish_writing", { p_room: room.id });
    if (error) setError(errMsg(error));
    else reload?.();
  }

  const written = mine?.filter((r) => (drafts[r.line_id] ?? "").trim()).length ?? 0;
  const myRoleIds = new Set(assignments.filter((a) => a.user_id === me).map((a) => a.role_id));

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="panel flex items-start gap-3 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <PenLine className="size-4" />
          </span>
          <div>
            <h2 className="font-medium">Senaryoyu yeniden yaz</h2>
            <p className="mt-1 text-sm text-muted">
              Sana düşen repliklerin yerine komik bir şey yaz. Ağız hareketine uysun diye repliğin süresine yakın uzunlukta tut. Yazdıkların kayıt aşamasına kadar gizli kalır.
            </p>
          </div>
        </div>
        <video ref={videoRef} src={publicUrl("scenes", scene.video_path)} crossOrigin="anonymous" playsInline muted preload="auto" className="hidden" />
        {error && <Notice>{error}</Notice>}
        {mine === null ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Replikler yükleniyor
          </div>
        ) : mine.length === 0 ? (
          <div className="panel px-6 py-10 text-center text-sm text-muted">Bu turda sana yazacak replik düşmedi. Diğerlerini bekle.</div>
        ) : (
          <ol className="flex flex-col gap-3">
            {mine.map((r, i) => {
              const l = lineById[r.line_id];
              const role = roles[l.role_id];
              const dur = l.end_time - l.start_time;
              const max = suggestedChars(dur);
              const val = drafts[r.line_id] ?? "";
              return (
                <li key={r.line_id} className="panel p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <RoleTag name={role?.name ?? ""} color={role?.color ?? "#888"} />
                    <span className="font-mono text-[11px] text-muted">
                      {fmtTime(l.start_time)} · {dur.toFixed(1)} sn
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      icon={playing === r.line_id ? <Square className="size-3.5" /> : <Headphones className="size-3.5" />}
                      onClick={() => listen(r.line_id)}
                    >
                      {playing === r.line_id ? "Durdur" : "Sahneyi dinle"}
                    </Button>
                  </div>
                  {l.text && <p className="mt-2 text-sm text-muted line-through decoration-muted/50">{l.text}</p>}
                  <textarea
                    className="field mt-2 h-auto min-h-16 resize-none py-2 text-[15px]"
                    rows={2}
                    maxLength={200}
                    placeholder={l.text ? "Yeni repliği yaz…" : "Bu replikte ne desin?"}
                    value={val}
                    onChange={(e) => {
                      setDrafts((d) => ({ ...d, [r.line_id]: e.target.value }));
                      save(r.line_id, e.target.value);
                    }}
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span className={cx(val.length > max ? "text-amber-200" : "text-muted")}>
                      {val.length}/{max} önerilen{val.length > max && " · biraz uzun, hızlı konuşmak gerekebilir"}
                    </span>
                    <span className={cx(saved[r.line_id] === "hata" ? "text-red-300" : "text-muted")}>
                      {saved[r.line_id] === "kaydediliyor" ? "kaydediliyor…" : saved[r.line_id] === "kaydedildi" ? "kaydedildi" : saved[r.line_id] === "hata" ? "kaydedilemedi" : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <div className="panel">
          <div className="panel-head">
            <h3 className="text-sm font-medium">Yazarlar</h3>
            <span className="font-mono text-xs text-muted">
              {players.filter((p) => p.done).length}/{players.length} bitti
            </span>
          </div>
          <ul className="flex flex-col gap-1 p-2">
            {players.map((p) => (
              <li key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                <Avatar name={p.nickname} color={p.color} path={p.avatar_path} frame={p.equipped?.frame} size={24} />
                <span className="min-w-0 flex-1 truncate">
                  {p.nickname}
                  {p.user_id === me && <span className="text-muted"> (sen)</span>}
                </span>
                <span className={cx("text-xs", p.done ? "text-ok" : "text-muted")}>{p.done ? "bitti" : "yazıyor"}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-line p-3">
            <p className="text-xs text-muted">
              {mine ? `${written}/${mine.length} replik yazdın.` : ""} Senin seslendireceğin karakterler:{" "}
              {[...myRoleIds].map((id) => roles[id]?.name).filter(Boolean).join(", ") || "yok"}
            </p>
            <Button size="sm" variant={meDone ? "ghost" : "secondary"} icon={meDone ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />} onClick={toggleDone}>
              {meDone ? "Düzenlemeye devam et" : "Yazdım"}
            </Button>
            {isHost ? (
              <Button variant="primary" onClick={finish}>
                Kayda geç
              </Button>
            ) : (
              <p className="py-1 text-center text-xs text-muted">Herkes bitirince oda sahibi kayda geçirir.</p>
            )}
          </div>
        </div>
      </aside>
    </main>
  );
}
