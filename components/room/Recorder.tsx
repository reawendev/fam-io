"use client";

import { Check, Circle, Clapperboard, Headphones, Play, RotateCcw, Square, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, cx, IconButton, Notice, Progress, RoleTag } from "@/components/ui";
import { errMsg, publicUrl, sb } from "@/lib/supabase";
import { DubPlayer, LINE_TAIL, playOriginal, recItem, unlockAudio } from "@/lib/player";
import { fmtTime, sortLines, type Recording, type SceneLine } from "@/lib/types";
import type { RoomProps } from "./Lobby";

const PREROLL = 3; // replikten önce 3-2-1 geri sayım (bu sırada çıkan sesler finale girmez)

type MyRec = { url: string; offset: number };
type Mode =
  | { kind: "idle" }
  | { kind: "arming"; line: SceneLine }
  | { kind: "rec"; line: SceneLine; mr: MediaRecorder; offset: number }
  | { kind: "upload"; line: SceneLine }
  | { kind: "preview"; line: SceneLine }
  | { kind: "original"; line: SceneLine }
  | { kind: "full" };

function pickMime(): { mimeType?: string; ext: string } {
  const cands: [string, string][] = [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/webm", "webm"],
    ["audio/mp4", "m4a"],
    ["audio/ogg;codecs=opus", "ogg"],
  ];
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
    for (const [m, e] of cands) if (MediaRecorder.isTypeSupported(m)) return { mimeType: m, ext: e };
  }
  return { ext: "webm" };
}

export default function Recorder({ room, scene, me, players, assignments, isHost }: RoomProps) {
  const roles = useMemo(() => [...scene.scene_roles].sort((a, b) => a.sort - b.sort), [scene]);
  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const allLines = useMemo(() => sortLines(scene.scene_lines), [scene]);
  const myRoleIds = useMemo(() => assignments.filter((a) => a.user_id === me).map((a) => a.role_id), [assignments, me]);
  const myLines = useMemo(() => allLines.filter((l) => myRoleIds.includes(l.role_id)), [allLines, myRoleIds]);
  const meDone = players.find((p) => p.user_id === me)?.done ?? false;
  const nickOfRole = (roleId: string) => {
    const uid = assignments.find((a) => a.role_id === roleId)?.user_id;
    return players.find((p) => p.user_id === uid)?.nickname;
  };

  const [recs, setRecs] = useState<Record<string, MyRec>>({});
  const [selId, setSelId] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>({ kind: "idle" });
  const modeRef = useRef<Mode>(mode);
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const [t, setT] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelRef = useRef(false);
  const playerRef = useRef<DubPlayer | null>(null);
  const stopOriginalRef = useRef<(() => void) | null>(null);

  const recsRef = useRef(recs);
  recsRef.current = recs;
  const myLinesRef = useRef(myLines);
  myLinesRef.current = myLines;

  const sel = myLines.find((l) => l.id === selId) ?? myLines.find((l) => !recs[l.id]) ?? myLines[0];

  useEffect(() => {
    sb()
      .from("recordings")
      .select("*")
      .eq("room_id", room.id)
      .eq("user_id", me)
      .then(({ data }) => {
        const m: Record<string, MyRec> = {};
        for (const r of (data as Recording[]) ?? []) m[r.line_id] = { url: publicUrl("recordings", r.audio_path), offset: r.offset_time };
        setRecs(m);
      });
  }, [room.id, me]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      playerRef.current?.destroy();
      stopOriginalRef.current?.();
    },
    [],
  );

  const upload = useCallback(
    async (blob: Blob, line: SceneLine, offset: number, ext: string) => {
      setMode({ kind: "upload", line });
      try {
        const path = `${room.id}/${me}/${line.id}-${Date.now()}.${ext}`;
        const { error: e1 } = await sb()
          .storage.from("recordings")
          .upload(path, blob, { contentType: blob.type || "audio/webm", cacheControl: "31536000" });
        if (e1) throw e1;
        const { error: e2 } = await sb().rpc("save_recording", { p_room: room.id, p_line: line.id, p_path: path, p_offset: offset });
        if (e2) throw e2;
        const next = { ...recsRef.current, [line.id]: { url: URL.createObjectURL(blob), offset } };
        setRecs(next);
        const ml = myLinesRef.current;
        const nextLine = ml.find((l) => !next[l.id] && l.start_time > line.start_time) ?? ml.find((l) => !next[l.id]);
        setSelId(nextLine?.id ?? line.id);
      } catch (e) {
        setError("Kayıt yüklenemedi: " + errMsg(e));
      } finally {
        setMode({ kind: "idle" });
      }
    },
    [room.id, me],
  );

  // Zaman döngüsü: kaydı doğru anda durdur
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        setT(v.currentTime);
        const m = modeRef.current;
        if (m.kind === "rec" && (v.currentTime >= m.line.end_time + LINE_TAIL || v.ended)) {
          v.pause();
          if (m.mr.state !== "inactive") m.mr.stop();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function getStream() {
    if (streamRef.current?.getAudioTracks().some((tr) => tr.readyState === "live")) return streamRef.current;
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    streamRef.current = s;
    return s;
  }

  function seek(v: HTMLVideoElement, time: number) {
    return new Promise<void>((resolve) => {
      if (Math.abs(v.currentTime - time) < 0.01) return resolve();
      const done = () => {
        v.removeEventListener("seeked", done);
        resolve();
      };
      v.addEventListener("seeked", done);
      v.currentTime = time;
      setTimeout(done, 3000);
    });
  }

  function stopAll() {
    playerRef.current?.stop();
    stopOriginalRef.current?.();
    stopOriginalRef.current = null;
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.muted = true;
    const k = modeRef.current.kind;
    if (k === "preview" || k === "original" || k === "full") setMode({ kind: "idle" });
  }

  async function record(line: SceneLine) {
    const v = videoRef.current;
    if (!v) return;
    setError(null);
    stopAll();
    setMode({ kind: "arming", line });
    cancelRef.current = false;
    try {
      const stream = await getStream();
      v.muted = true;
      await seek(v, Math.max(0, line.start_time - PREROLL));
      const { mimeType, ext } = pickMime();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      // Kayıt geri sayımla birlikte başlar (hizalama için); geri sayım kısmı oynatmada kırpılır.
      mr.onstart = () => setMode({ kind: "rec", line, mr, offset: v.currentTime });
      mr.onstop = () => {
        const m = modeRef.current;
        if (cancelRef.current || m.kind !== "rec") return setMode({ kind: "idle" });
        upload(new Blob(chunks, { type: mr.mimeType || mimeType || "audio/webm" }), line, m.offset, ext);
      };
      await v.play();
      mr.start();
    } catch (e) {
      const msg = errMsg(e);
      setError(
        /Permission|NotAllowed|denied/i.test(msg)
          ? "Mikrofon izni verilmedi. Tarayıcı ayarlarından bu siteye mikrofon izni ver."
          : "Kayıt başlatılamadı: " + msg,
      );
      setMode({ kind: "idle" });
    }
  }

  function cancelRecording() {
    const m = modeRef.current;
    cancelRef.current = true;
    videoRef.current?.pause();
    if (m.kind === "rec" && m.mr.state !== "inactive") m.mr.stop();
    else setMode({ kind: "idle" });
  }

  async function listenOriginal(line: SceneLine) {
    const v = videoRef.current;
    if (!v) return;
    stopAll();
    await unlockAudio();
    setMode({ kind: "original", line });
    stopOriginalRef.current = playOriginal(v, Math.max(0, line.start_time - 0.6), line.end_time + 0.4, () => {
      if (modeRef.current.kind === "original") setMode({ kind: "idle" });
    });
  }

  async function preview(line: SceneLine) {
    const v = videoRef.current;
    const rec = recs[line.id];
    if (!v || !rec) return;
    stopAll();
    setBusy(true);
    try {
      await unlockAudio(v);
      playerRef.current?.destroy();
      const p = new DubPlayer(v);
      playerRef.current = p;
      await p.load([recItem(rec.url, rec.offset, line)], null);
      p.onEnd = () => setMode({ kind: "idle" });
      setMode({ kind: "preview", line });
      p.play(Math.max(0, line.start_time - 0.8), 0.1, line.end_time + LINE_TAIL + 0.2);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function playFull() {
    const v = videoRef.current;
    if (!v) return;
    stopAll();
    setBusy(true);
    try {
      await unlockAudio(v);
      playerRef.current?.destroy();
      const p = new DubPlayer(v, { originalVolume: scene.original_volume });
      playerRef.current = p;
      await p.load(
        myLines.filter((l) => recs[l.id]).map((l) => recItem(recs[l.id].url, recs[l.id].offset, l)),
        scene.bg_audio_path ? publicUrl("scenes", scene.bg_audio_path) : null,
      );
      p.onEnd = () => setMode({ kind: "idle" });
      setMode({ kind: "full" });
      p.play(0);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone() {
    const { error } = await sb().from("room_players").update({ done: !meDone }).eq("room_id", room.id).eq("user_id", me);
    if (error) setError(errMsg(error));
  }

  async function startFinale() {
    const notDone = players.filter((p) => !p.done && assignments.some((a) => a.user_id === p.user_id));
    if (notDone.length && !confirm(`${notDone.map((p) => p.nickname).join(", ")} henüz hazır değil. Yine de finali başlatalım mı?`)) return;
    const { error } = await sb().rpc("start_finale", { p_room: room.id });
    if (error) setError(errMsg(error));
  }

  const busyRec = mode.kind === "arming" || mode.kind === "rec" || mode.kind === "upload";
  const recCount = myLines.filter((l) => recs[l.id]).length;
  const curLine = mode.kind === "rec" || mode.kind === "arming" ? mode.line : null;
  const contextLines = allLines.filter((l) => t >= l.start_time - 0.1 && t <= l.end_time + 0.1);

  // Klavye: R kaydet, O orijinal, P dinle, Esc durdur
  const keyState = useRef({ sel, busyRec, recs, record, listenOriginal, preview, cancelRecording, stopAll });
  keyState.current = { sel, busyRec, recs, record, listenOriginal, preview, cancelRecording, stopAll };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || e.metaKey || e.ctrlKey || e.repeat) return;
      const s = keyState.current;
      const k = e.key.toLowerCase();
      if (k === "escape") return s.busyRec ? s.cancelRecording() : s.stopAll();
      if (!s.sel || s.busyRec) return;
      if (k === "r") s.record(s.sel);
      else if (k === "o") s.listenOriginal(s.sel);
      else if (k === "p" && s.recs[s.sel.id]) s.preview(s.sel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="panel overflow-hidden">
          <div className="relative bg-black">
            <video
              ref={videoRef}
              src={publicUrl("scenes", scene.video_path)}
              crossOrigin="anonymous"
              playsInline
              muted
              preload="auto"
              className="aspect-video w-full"
            />
            {curLine ? (
              <RecOverlay line={curLine} t={t} recording={mode.kind === "rec"} color={roleById[curLine.role_id]?.color} />
            ) : (
              contextLines.length > 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 px-4">
                  {contextLines.map((l) => (
                    <span key={l.id} className="rounded bg-black/80 px-2.5 py-1 text-sm">
                      <span style={{ color: roleById[l.role_id]?.color }}>{roleById[l.role_id]?.name}</span>
                      {l.text ? <span className="text-fg">: {l.text}</span> : null}
                    </span>
                  ))}
                </div>
              )
            )}
            {(mode.kind === "original" || mode.kind === "preview" || mode.kind === "full") && (
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded bg-black/75 px-2 py-1 text-xs font-medium">
                {mode.kind === "original" ? <Headphones className="size-3.5" /> : <Play className="size-3.5" />}
                {mode.kind === "original" ? "Orijinal ses" : mode.kind === "preview" ? "Senin kaydın" : "Kendi sesinle tüm sahne"}
              </span>
            )}
            {mode.kind === "upload" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium">Kayıt yükleniyor…</div>
            )}
          </div>
        </div>

        {error && <Notice>{error}</Notice>}

        {myLines.length === 0 ? (
          <div className="panel px-6 py-10 text-center">
            <p className="font-medium">Bu turda izleyicisin</p>
            <p className="mt-1 text-sm text-muted">Oyuncular kayıtlarını bitirince finali birlikte izleyeceksiniz.</p>
          </div>
        ) : (
          sel && (
            <div className="panel p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <RoleTag name={roleById[sel.role_id]?.name ?? ""} color={roleById[sel.role_id]?.color ?? "#888"} />
                <span className="font-mono text-xs text-muted">
                  {fmtTime(sel.start_time)} – {fmtTime(sel.end_time)} · {(sel.end_time - sel.start_time).toFixed(1)} sn
                </span>
                <span className="ml-auto font-mono text-xs text-muted">
                  {recCount}/{myLines.length} kayıtlı
                </span>
              </div>
              <p className="mt-4 text-xl leading-snug font-medium sm:text-2xl">
                {sel.text || <span className="text-muted">Metin yok — orijinali dinle, benzer bir replik uydur.</span>}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {mode.kind === "rec" || mode.kind === "arming" ? (
                  <Button variant="danger" size="lg" className="min-w-40 flex-1" icon={<Square className="size-4" />} onClick={cancelRecording}>
                    İptal <span className="kbd ml-1">Esc</span>
                  </Button>
                ) : (
                  <Button
                    variant="rec"
                    size="lg"
                    className="min-w-40 flex-1"
                    disabled={busyRec || busy}
                    icon={recs[sel.id] ? <RotateCcw className="size-4" /> : <Circle className="size-3.5 fill-current" />}
                    onClick={() => record(sel)}
                  >
                    {recs[sel.id] ? "Tekrar çek" : "Kaydet"} <span className="kbd ml-1 border-white/30 bg-white/15 text-white">R</span>
                  </Button>
                )}
                <Button
                  size="lg"
                  disabled={busyRec}
                  icon={mode.kind === "original" ? <Square className="size-4" /> : <Headphones className="size-4" />}
                  onClick={() => (mode.kind === "original" ? stopAll() : listenOriginal(sel))}
                >
                  {mode.kind === "original" ? "Durdur" : "Orijinali dinle"} <span className="kbd ml-1">O</span>
                </Button>
                {recs[sel.id] && (
                  <Button
                    size="lg"
                    disabled={busyRec}
                    loading={busy && mode.kind === "idle"}
                    icon={mode.kind === "preview" ? <Square className="size-4" /> : <Play className="size-4" />}
                    onClick={() => (mode.kind === "preview" ? stopAll() : preview(sel))}
                  >
                    {mode.kind === "preview" ? "Durdur" : "Kaydımı dinle"} <span className="kbd ml-1">P</span>
                  </Button>
                )}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Kaydete basınca video repliğinden {PREROLL} saniye önce başlar. 3-2-1 bitince konuş; replik bitince kayıt kendiliğinden durur.
                Geri sayım sırasında çıkan sesler finale girmez.
              </p>
            </div>
          )
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <div className="panel">
          <div className="panel-head">
            <h3 className="text-sm font-medium">Senaryo</h3>
            <span className="text-xs text-muted">{allLines.length} replik</span>
          </div>
          <ul className="max-h-[380px] overflow-auto py-1">
            {allLines.map((l) => {
              const mine = myRoleIds.includes(l.role_id);
              const r = roleById[l.role_id];
              const active = sel?.id === l.id;
              return (
                <li key={l.id} className="group relative">
                  <button
                    disabled={!mine || busyRec}
                    onClick={() => setSelId(l.id)}
                    className={cx(
                      "flex w-full items-start gap-3 py-2 pr-10 pl-4 text-left text-[13px] transition-colors",
                      mine ? "hover:bg-surface-2" : "cursor-default",
                      active && "bg-surface-2",
                    )}
                  >
                    <span className={cx("absolute top-2 bottom-2 left-0 w-0.5 rounded-r", active ? "" : "opacity-0")} style={{ background: r?.color }} />
                    <span className="w-9 shrink-0 pt-px font-mono text-[11px] text-muted">{fmtTime(l.start_time).slice(0, -2)}</span>
                    <span className={cx("min-w-0 flex-1", !mine && "text-muted")}>
                      <span className="font-medium" style={{ color: mine ? r?.color : undefined }}>
                        {r?.name}
                      </span>
                      {!mine && nickOfRole(l.role_id) ? <span className="text-muted"> · {nickOfRole(l.role_id)}</span> : null}
                      {l.text ? <span className={mine ? "text-fg-2" : ""}> — {l.text}</span> : null}
                    </span>
                    {mine &&
                      (recs[l.id] ? (
                        <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
                      ) : (
                        <span className="mt-1 size-2 shrink-0 rounded-full border border-line-strong" />
                      ))}
                  </button>
                  <IconButton
                    label="Orijinalini dinle"
                    className="absolute top-1 right-1 size-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    disabled={busyRec}
                    onClick={() => listenOriginal(l)}
                  >
                    <Headphones className="size-3.5" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3 className="text-sm font-medium">Durum</h3>
            <span className="font-mono text-xs text-muted">
              {players.filter((p) => p.done).length}/{players.filter((p) => assignments.some((a) => a.user_id === p.user_id)).length} hazır
            </span>
          </div>
          <ul className="flex flex-col gap-1 p-2">
            {players.map((p) => {
              const hasRole = assignments.some((a) => a.user_id === p.user_id);
              return (
                <li key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                  <Avatar name={p.nickname} size={24} />
                  <span className="min-w-0 flex-1 truncate">
                    {p.nickname}
                    {p.user_id === me && <span className="text-muted"> (sen)</span>}
                  </span>
                  <span className={cx("text-xs", p.done ? "text-ok" : "text-muted")}>{!hasRole ? "izleyici" : p.done ? "hazır" : "kayıtta"}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-line p-3">
            {myLines.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant={meDone ? "ghost" : "secondary"}
                  disabled={!meDone && recCount === 0}
                  icon={meDone ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
                  onClick={toggleDone}
                >
                  {meDone ? "Hazır değilim" : recCount < myLines.length ? `Hazırım (${myLines.length - recCount} eksik)` : "Kayıtlarım tamam"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyRec || recCount === 0}
                  loading={busy && mode.kind !== "preview"}
                  icon={mode.kind === "full" ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
                  onClick={() => (mode.kind === "full" ? stopAll() : playFull())}
                >
                  {mode.kind === "full" ? "Durdur" : "Kendi sesimle izle"}
                </Button>
              </>
            )}
            {isHost ? (
              <Button variant="primary" icon={<Clapperboard className="size-4" />} onClick={startFinale}>
                Finali başlat
              </Button>
            ) : (
              <p className="py-1 text-center text-xs text-muted">Herkes hazır olunca oda sahibi finali başlatır.</p>
            )}
          </div>
        </div>
      </aside>
    </main>
  );
}

function RecOverlay({ line, t, recording, color }: { line: SceneLine; t: number; recording: boolean; color?: string }) {
  const until = line.start_time - t;
  const speaking = t >= line.start_time && t <= line.end_time;
  const progress = (t - line.start_time) / (line.end_time - line.start_time);
  const count = Math.ceil(until);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded bg-black/75 px-2 py-1 font-mono text-[11px] font-medium tracking-wider">
          <span className={cx("size-2 rounded-full", recording ? "rec-dot bg-rec" : "bg-muted")} />
          {recording ? "KAYIT" : "HAZIRLANIYOR"}
        </span>
        {speaking && <span className="rounded bg-rec px-2 py-1 text-xs font-semibold text-white">Şimdi konuş</span>}
      </div>
      {until > 0 && count <= 3 && (
        <div className="flex items-center justify-center">
          <span key={count} className="count-in font-mono text-7xl font-semibold text-white tabular-nums drop-shadow-[0_2px_12px_rgba(0,0,0,.7)] sm:text-8xl">
            {count}
          </span>
        </div>
      )}
      <div className="flex flex-col items-center gap-2.5">
        {line.text && (
          <span
            className={cx(
              "max-w-[90%] rounded-md px-3 py-1.5 text-center text-lg font-medium transition-opacity sm:text-2xl",
              speaking ? "bg-black/85" : "bg-black/60 opacity-70",
            )}
            style={{ color: speaking ? color : undefined }}
          >
            {line.text}
          </span>
        )}
        <Progress value={progress} tone={speaking ? "rec" : "fg"} className="h-1.5 max-w-md bg-white/15" />
      </div>
    </div>
  );
}
