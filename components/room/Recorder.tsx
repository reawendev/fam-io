"use client";

import { Check, Circle, Clapperboard, Eye, EyeOff, Headphones, Hourglass, Link2, Play, RotateCcw, Square, Undo2, VenetianMask, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, cx, IconButton, Notice, Progress, RoleTag } from "@/components/ui";
import { errMsg, publicUrl, sb } from "@/lib/supabase";
import { DubPlayer, LINE_TAIL, playOriginal, recItem, unlockAudio } from "@/lib/player";
import { fmtTime, sortLines, type Recording, type SceneLine } from "@/lib/types";
import { EFFECTS, isEffect, type EffectId } from "@/lib/effects";
import type { RoomProps } from "./Lobby";
import MicWave from "@/components/MicWave";
import { cardInfo } from "@/lib/modes";

const PREROLL = 3; // replikten önce 3-2-1 geri sayım (bu sırada çıkan sesler finale girmez)

type MyRec = { url: string; offset: number; effect: EffectId; path?: string };
const SILENT_PEAK = 0.03; // kayıt boyunca bundan yüksek ses yoksa uyar
const FOLEY_ID = "__foley__"; // foley kaydı tüm sahneyi kapsayan sanal bir replik gibi ele alınır
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

export default function Recorder({ room, scene, me, players, assignments, isHost, reload }: RoomProps) {
  const roles = useMemo(() => [...scene.scene_roles].sort((a, b) => a.sort - b.sort), [scene]);
  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const allLines = useMemo(() => sortLines(scene.scene_lines), [scene]);
  // ---- Oyun modu ----
  const chain = room.mode === "zincir";
  const order = useMemo(() => room.mode_state?.order ?? [], [room.mode_state]);
  const myPos = order.indexOf(me);
  const prevUser = chain && myPos > 0 ? order[myPos - 1] : null;
  const prevPlayer = players.find((p) => p.user_id === prevUser);
  const prevDone = !prevUser || !!prevPlayer?.done;
  const isFoley = room.foley_user === me;
  const nickOf = (uid?: string | null) => players.find((p) => p.user_id === uid)?.nickname ?? "?";

  const myRoleIds = useMemo(() => assignments.filter((a) => a.user_id === me).map((a) => a.role_id), [assignments, me]);
  const myLines = useMemo(() => (chain ? allLines : allLines.filter((l) => myRoleIds.includes(l.role_id))), [allLines, myRoleIds, chain]);
  const meDone = players.find((p) => p.user_id === me)?.done ?? false;
  const nickOfRole = (roleId: string) => {
    const uid = assignments.find((a) => a.role_id === roleId)?.user_id;
    return players.find((p) => p.user_id === uid)?.nickname;
  };
  const hasPart = (uid: string) => (chain ? order.includes(uid) : assignments.some((a) => a.user_id === uid) || room.foley_user === uid);

  // Mod verileri: kartlar, gizli görev, yeniden yazılmış replikler, zincirde öncekinin kayıtları, foley
  const [cards, setCards] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [rewrites, setRewrites] = useState<Record<string, { text: string | null; author: string }>>({});
  const [prevRecs, setPrevRecs] = useState<Record<string, MyRec>>({});
  const [foleyRec, setFoleyRec] = useState<MyRec | null>(null);
  const textOf = (l: SceneLine) => rewrites[l.id]?.text ?? l.text;
  const foleyLine = useMemo<SceneLine>(
    () => ({ id: FOLEY_ID, scene_id: scene.id, role_id: FOLEY_ID, start_time: 0, end_time: scene.duration || 30, text: null }),
    [scene],
  );

  useEffect(() => {
    const mods = room.mods ?? [];
    if (mods.includes("kart"))
      sb()
        .from("room_cards")
        .select("line_id, card")
        .eq("room_id", room.id)
        .then(({ data }) => setCards(Object.fromEntries(((data as { line_id: string; card: string }[]) ?? []).map((c) => [c.line_id, c.card]))));
    if (mods.includes("hain"))
      sb()
        .from("room_secrets")
        .select("task")
        .eq("room_id", room.id)
        .maybeSingle()
        .then(({ data }) => setSecret((data as { task?: string } | null)?.task ?? null));
    if (room.mode === "senarist")
      sb()
        .from("room_line_texts")
        .select("line_id, author, text")
        .eq("room_id", room.id)
        .then(({ data }) =>
          setRewrites(Object.fromEntries(((data as { line_id: string; author: string; text: string | null }[]) ?? []).map((r) => [r.line_id, r]))),
        );
    if (room.foley_user === me)
      sb()
        .from("room_foley")
        .select("audio_path, offset_time")
        .eq("room_id", room.id)
        .maybeSingle()
        .then(({ data }) => {
          const f = data as { audio_path: string; offset_time: number } | null;
          if (f?.audio_path) setFoleyRec({ url: publicUrl("recordings", f.audio_path), offset: f.offset_time, effect: "dogal", path: f.audio_path });
        });
  }, [room.id, room.mods, room.mode, room.foley_user, me]);

  // Zincir: önceki oyuncunun kayıtları (o bitirince görünür hale gelir)
  useEffect(() => {
    if (!prevUser || !prevDone) return;
    sb()
      .from("recordings")
      .select("*")
      .eq("room_id", room.id)
      .eq("user_id", prevUser)
      .then(({ data }) => {
        const m: Record<string, MyRec> = {};
        for (const r of (data as Recording[]) ?? [])
          m[r.line_id] = { url: publicUrl("recordings", r.audio_path), offset: r.offset_time, effect: isEffect(r.effect) ? r.effect : "dogal" };
        setPrevRecs(m);
      });
  }, [room.id, prevUser, prevDone]);

  const [recs, setRecs] = useState<Record<string, MyRec>>({});
  // Kaydedilmemiş replikler için seçilen efekt (kayıt yüklenince sunucuya yazılır)
  const [pendingFx, setPendingFx] = useState<Record<string, EffectId>>({});
  const effectOf = (lineId: string): EffectId => recs[lineId]?.effect ?? pendingFx[lineId] ?? "dogal";
  const [selId, setSelId] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>({ kind: "idle" });
  const modeRef = useRef<Mode>(mode);
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const [t, setT] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [foleyCount, setFoleyCount] = useState<number | null>(null);
  const peakRef = useRef(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelRef = useRef(false);
  const playerRef = useRef<DubPlayer | null>(null);
  const stopOriginalRef = useRef<(() => void) | null>(null);

  const recsRef = useRef(recs);
  recsRef.current = recs;
  const pendingFxRef = useRef(pendingFx);
  pendingFxRef.current = pendingFx;
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
        for (const r of (data as Recording[]) ?? [])
          m[r.line_id] = { url: publicUrl("recordings", r.audio_path), offset: r.offset_time, effect: isEffect(r.effect) ? r.effect : "dogal", path: r.audio_path };
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
        const foley = line.id === FOLEY_ID;
        const path = `${room.id}/${me}/${foley ? "foley" : line.id}-${Date.now()}.${ext}`;
        const { error: e1 } = await sb()
          .storage.from("recordings")
          .upload(path, blob, { contentType: blob.type || "audio/webm", cacheControl: "31536000" });
        if (e1) throw e1;
        if (foley) {
          const { error: ef } = await sb().rpc("save_foley", { p_room: room.id, p_path: path, p_offset: offset });
          if (ef) throw ef;
          setFoleyRec((old) => {
            if (old?.path && old.path !== path) sb().storage.from("recordings").remove([old.path]).catch(() => {});
            return { url: URL.createObjectURL(blob), offset, effect: "dogal", path };
          });
          return;
        }
        const { error: e2 } = await sb().rpc("save_recording", { p_room: room.id, p_line: line.id, p_path: path, p_offset: offset });
        if (e2) throw e2;
        // Tekrar çekimde efekt korunur; ilk kayıtta seçilmiş efekt varsa yaz
        const fx: EffectId = recsRef.current[line.id]?.effect ?? pendingFxRef.current[line.id] ?? "dogal";
        if (!recsRef.current[line.id] && fx !== "dogal") {
          await sb().rpc("set_recording_effect", { p_room: room.id, p_line: line.id, p_effect: fx });
        }
        // Tekrar çekimde eski dosyayı sil (depolama dolmasın)
        const old = recsRef.current[line.id]?.path;
        if (old && old !== path) sb().storage.from("recordings").remove([old]).catch(() => {});
        const next = { ...recsRef.current, [line.id]: { url: URL.createObjectURL(blob), offset, effect: fx, path } };
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
    setStream(s);
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

  async function record(target: SceneLine) {
    const v = videoRef.current;
    if (!v) return;
    // Foley: tüm sahne boyunca (video süresi kadar)
    const line = target.id === FOLEY_ID && v.duration ? { ...target, end_time: v.duration } : target;
    setError(null);
    setWarn(null);
    stopAll();
    setMode({ kind: "arming", line });
    cancelRef.current = false;
    try {
      const stream = await getStream();
      v.muted = true;
      await seek(v, Math.max(0, line.start_time - PREROLL));
      if (line.id === FOLEY_ID) {
        for (let c = 3; c > 0; c--) {
          if (cancelRef.current) return setMode({ kind: "idle" });
          setFoleyCount(c);
          await new Promise((r) => setTimeout(r, 1000));
        }
        setFoleyCount(null);
        if (cancelRef.current) return setMode({ kind: "idle" });
      }
      const { mimeType, ext } = pickMime();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      // Kayıt geri sayımla birlikte başlar (hizalama için); geri sayım kısmı oynatmada kırpılır.
      mr.onstart = () => {
        peakRef.current = 0;
        setMode({ kind: "rec", line, mr, offset: v.currentTime });
      };
      mr.onstop = () => {
        const m = modeRef.current;
        if (cancelRef.current || m.kind !== "rec") return setMode({ kind: "idle" });
        setWarn(
          peakRef.current < SILENT_PEAK
            ? "Bu kayıtta neredeyse hiç ses yok. Mikrofonun sessizde ya da yanlış cihaz seçili olabilir; dinleyip gerekirse tekrar çek."
            : null,
        );
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
    if (prevUser) {
      // Kulaktan kulağa: orijinal değil, bir önceki oyuncunun kaydı
      const pr = prevRecs[line.id];
      if (!pr) return setWarn(`${prevPlayer?.nickname ?? "Önceki oyuncu"} bu repliği kaydetmemiş; bunu kendi hayal gücünle doldur.`);
      return preview(line, pr, "original");
    }
    stopAll();
    await unlockAudio();
    setMode({ kind: "original", line });
    stopOriginalRef.current = playOriginal(v, Math.max(0, line.start_time - 0.6), line.end_time + 0.4, () => {
      if (modeRef.current.kind === "original") setMode({ kind: "idle" });
    });
  }

  async function chooseEffect(line: SceneLine, fx: EffectId) {
    setError(null);
    const rec = recsRef.current[line.id];
    if (!rec) {
      setPendingFx((m) => ({ ...m, [line.id]: fx }));
      return;
    }
    if (rec.effect === fx) return;
    const { error } = await sb().rpc("set_recording_effect", { p_room: room.id, p_line: line.id, p_effect: fx });
    if (error) return setError(errMsg(error));
    const updated = { ...rec, effect: fx };
    setRecs((m) => ({ ...m, [line.id]: updated }));
    recsRef.current = { ...recsRef.current, [line.id]: updated };
    preview(line, updated);
  }

  async function preview(line: SceneLine, override?: MyRec, as: "preview" | "original" = "preview") {
    const v = videoRef.current;
    const rec = override ?? recs[line.id];
    if (!v || !rec) return;
    stopAll();
    setBusy(true);
    try {
      await unlockAudio(v);
      playerRef.current?.destroy();
      const p = new DubPlayer(v, { originalVolume: scene.original_volume, duck: scene.scene_lines });
      playerRef.current = p;
      await p.load([recItem(rec.url, rec.offset, line, line.id, rec.effect)], null);
      p.onEnd = () => setMode({ kind: "idle" });
      setMode({ kind: as, line });
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
      const p = new DubPlayer(v, { originalVolume: scene.original_volume, duck: scene.scene_lines });
      playerRef.current = p;
      const items = myLines.filter((l) => recs[l.id]).map((l) => recItem(recs[l.id].url, recs[l.id].offset, l, l.id, recs[l.id].effect));
      if (foleyRec) items.push({ url: foleyRec.url, at: foleyRec.offset, from: 0, key: FOLEY_ID });
      await p.load(items, scene.bg_audio_path ? publicUrl("scenes", scene.bg_audio_path) : null);
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
    else reload?.();
  }

  async function startFinale() {
    const notDone = players.filter((p) => !p.done && hasPart(p.user_id));
    if (notDone.length && !confirm(`${notDone.map((p) => p.nickname).join(", ")} henüz hazır değil. Yine de finali başlatalım mı?`)) return;
    const { error } = await sb().rpc("start_finale", { p_room: room.id });
    if (error) setError(errMsg(error));
    else reload?.();
  }

  const busyRec = mode.kind === "arming" || mode.kind === "rec" || mode.kind === "upload";
  const recCount = myLines.filter((l) => recs[l.id]).length + (isFoley && foleyRec ? 1 : 0);
  const partCount = myLines.length + (isFoley ? 1 : 0);
  const waitingTurn = chain && !prevDone;
  const curLine = mode.kind === "rec" || mode.kind === "arming" ? mode.line : null;
  const contextLines = allLines.filter((l) => t >= l.start_time - 0.1 && t <= l.end_time + 0.1);

  // Klavye: R kaydet, O orijinal, P dinle, Esc durdur
  const keyState = useRef({ sel, busyRec, recs, record, listenOriginal, preview, cancelRecording, stopAll, waitingTurn });
  keyState.current = { sel, busyRec, recs, record, listenOriginal, preview, cancelRecording, stopAll, waitingTurn };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || e.metaKey || e.ctrlKey || e.repeat) return;
      const s = keyState.current;
      const k = e.key.toLowerCase();
      if (k === "escape") return s.busyRec ? s.cancelRecording() : s.stopAll();
      if (!s.sel || s.busyRec || s.waitingTurn) return;
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
              <RecOverlay
                line={curLine}
                text={curLine.id === FOLEY_ID ? "Efekt sesleri: kapı, adım, patlama… ne duyuyorsan" : chain && myPos > 0 ? null : textOf(curLine)}
                card={cardInfo(cards[curLine.id])}
                foley={curLine.id === FOLEY_ID}
                t={t}
                recording={mode.kind === "rec"}
                color={roleById[curLine.role_id]?.color}
                wave={
                  <MicWave
                    stream={stream}
                    active={mode.kind === "rec"}
                    bars={28}
                    className="h-5 w-24 sm:w-32"
                    onLevel={(pk) => {
                      if (pk > peakRef.current) peakRef.current = pk;
                    }}
                  />
                }
              />
            ) : (
              contextLines.length > 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 px-4">
                  {contextLines.map((l) => (
                    <span key={l.id} className="rounded bg-black/80 px-2.5 py-1 text-sm">
                      <span style={{ color: roleById[l.role_id]?.color }}>{roleById[l.role_id]?.name}</span>
                      {textOf(l) && !(chain && myPos > 0) ? <span className="text-fg">: {textOf(l)}</span> : null}
                    </span>
                  ))}
                </div>
              )
            )}
            {(mode.kind === "original" || mode.kind === "preview" || mode.kind === "full") && (
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded bg-black/75 px-2 py-1 text-xs font-medium">
                {mode.kind === "original" ? <Headphones className="size-3.5" /> : <Play className="size-3.5" />}
                {mode.kind === "original"
                  ? prevUser
                    ? `${prevPlayer?.nickname ?? "Önceki"} böyle söyledi`
                    : "Orijinal ses"
                  : mode.kind === "preview"
                    ? "Senin kaydın"
                    : "Kendi sesinle tüm sahne"}
              </span>
            )}
            {foleyCount !== null && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
                <span className="eyebrow">Foley kaydı başlıyor</span>
                <span key={foleyCount} className="count-in font-mono text-8xl font-semibold text-white tabular-nums">
                  {foleyCount}
                </span>
              </div>
            )}
            {mode.kind === "upload" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium">Kayıt yükleniyor…</div>
            )}
          </div>
        </div>

        {error && <Notice>{error}</Notice>}
        {warn && !error && <Notice tone="warn">{warn}</Notice>}

        {secret && (
          <div className="panel flex items-start gap-3 border-red-500/30 bg-red-500/[0.05] p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
              <VenetianMask className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-red-300">Sen hainsin · kimseye söyleme</p>
              <p className={cx("mt-1 text-[15px] font-medium transition", !showSecret && "blur-sm select-none")}>{secret}</p>
              <p className="mt-1 text-xs text-muted">Görevi fark ettirmeden yap. Finalden sonra herkes haini tahmin edecek; yakalanmazsan +40 XP.</p>
            </div>
            <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? "Gizle" : "Göster"}>
              {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        )}

        {chain && (
          <div className="panel flex items-start gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Link2 className="size-4" />
            </span>
            <div className="text-sm">
              <p className="font-medium">
                Zincirde {myPos + 1}. sıradasın{myPos === 0 ? " · orijinali sadece sen duyuyorsun" : ""}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {myPos === 0
                  ? "Tüm sahneyi sen seslendir; senden sonraki kişi orijinali değil, senin kaydını duyacak. Bitince \"Kayıtlarım tamam\" de."
                  : `Orijinali duyamazsın. ${prevPlayer?.nickname ?? "Önceki oyuncu"} nasıl söylediyse onu taklit et (O tuşu). Bitince "Kayıtlarım tamam" de, sıra sonrakine geçsin.`}
              </p>
            </div>
          </div>
        )}

        {isFoley && (
          <div className="panel p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Volume2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Foley ustası sensin</p>
                <p className="mt-1 text-sm text-muted">
                  Sahne baştan sona tek seferde kaydedilir. Konuşma yok: kapı gıcırtısı, ayak sesi, rüzgâr, patlama… ağzınla ya da eşyalarla yap. 3-2-1&apos;den sonra video başlar.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {curLine?.id === FOLEY_ID ? (
                <Button variant="danger" icon={<Square className="size-4" />} onClick={cancelRecording}>
                  İptal
                </Button>
              ) : (
                <Button variant="rec" disabled={busyRec || busy} icon={foleyRec ? <RotateCcw className="size-4" /> : <Circle className="size-3.5 fill-current" />} onClick={() => record(foleyLine)}>
                  {foleyRec ? "Foley'i tekrar kaydet" : "Foley kaydını başlat"}
                </Button>
              )}
              {foleyRec && (
                <Button
                  disabled={busyRec}
                  icon={mode.kind === "preview" && mode.line.id === FOLEY_ID ? <Square className="size-4" /> : <Play className="size-4" />}
                  onClick={() => (mode.kind === "preview" ? stopAll() : preview({ ...foleyLine, end_time: videoRef.current?.duration || foleyLine.end_time }, foleyRec))}
                >
                  {mode.kind === "preview" && mode.line.id === FOLEY_ID ? "Durdur" : "Foley'i dinle"}
                </Button>
              )}
              {foleyRec && <span className="self-center text-xs text-ok">Foley kaydedildi</span>}
            </div>
          </div>
        )}

        {waitingTurn ? (
          <div className="panel flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Hourglass className="size-5 text-muted" />
            <p className="font-medium">Şu an sıra: {prevPlayer?.nickname ?? "önceki oyuncu"}</p>
            <p className="max-w-sm text-sm text-muted">O kayıtlarını bitirince senin sıran gelecek ve onun kaydını dinleyerek taklit edeceksin. Bu ekran kendiliğinden güncellenir.</p>
          </div>
        ) : myLines.length === 0 ? (
          !isFoley && (
            <div className="panel px-6 py-10 text-center">
              <p className="font-medium">Bu turda izleyicisin</p>
              <p className="mt-1 text-sm text-muted">Oyuncular kayıtlarını bitirince finali birlikte izleyeceksiniz.</p>
            </div>
          )
        ) : (
          sel && (
            <div className="panel p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <RoleTag name={roleById[sel.role_id]?.name ?? ""} color={roleById[sel.role_id]?.color ?? "#888"} />
                <span className="font-mono text-xs text-muted">
                  {fmtTime(sel.start_time)} – {fmtTime(sel.end_time)} · {(sel.end_time - sel.start_time).toFixed(1)} sn
                </span>
                {cards[sel.id] && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 text-xs font-medium text-accent" title={cardInfo(cards[sel.id])?.hint}>
                    {cardInfo(cards[sel.id])?.emoji} {cardInfo(cards[sel.id])?.name}
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-muted">
                  {myLines.filter((l) => recs[l.id]).length}/{myLines.length} kayıtlı
                </span>
              </div>
              <p className="mt-4 text-xl leading-snug font-medium sm:text-2xl">
                {chain && myPos > 0 ? (
                  <span className="text-muted">Metin gizli — {prevPlayer?.nickname ?? "öncekinin"} kaydını dinle ve duyduğunu söyle.</span>
                ) : (
                  textOf(sel) || <span className="text-muted">Metin yok — orijinali dinle, benzer bir replik uydur.</span>
                )}
              </p>
              {rewrites[sel.id]?.text && (
                <p className="mt-1 text-xs text-muted">
                  Senaryo: {nickOf(rewrites[sel.id].author)} · orijinali: {sel.text ?? "—"}
                </p>
              )}
              {cards[sel.id] && <p className="mt-1 text-xs text-accent/90">Kart: {cardInfo(cards[sel.id])?.hint}</p>}
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
                  {mode.kind === "original" ? "Durdur" : prevUser ? "Öncekini dinle" : "Orijinali dinle"} <span className="kbd ml-1">O</span>
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
              <div className="mt-5 border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="eyebrow">Ses efekti</span>
                  <span className="text-xs text-muted">{EFFECTS.find((e) => e.id === effectOf(sel.id))?.hint}</span>
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ses efekti">
                  {EFFECTS.map((fx) => {
                    const on = effectOf(sel.id) === fx.id;
                    return (
                      <button
                        key={fx.id}
                        role="radio"
                        aria-checked={on}
                        disabled={busyRec}
                        onClick={() => chooseEffect(sel, fx.id)}
                        className={cx(
                          "h-8 rounded-md border px-2.5 text-[13px] transition-colors disabled:opacity-40",
                          on ? "border-accent/60 bg-accent/10 text-accent" : "border-line-strong bg-surface-2 text-fg-2 hover:text-fg",
                        )}
                      >
                        {fx.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {recs[sel.id] ? "Efekt değişince kaydın o efektle çalar; kaydın bozulmaz, istediğin an değiştirebilirsin." : "Kaydettikten sonra da değiştirebilirsin."}
                </p>
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
                      {!(chain && myPos > 0) && textOf(l) ? <span className={mine ? "text-fg-2" : ""}> — {textOf(l)}</span> : null}
                      {cards[l.id] && <span className="ml-1">{cardInfo(cards[l.id])?.emoji}</span>}
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
              const hasRole = hasPart(p.user_id);
              const pos = chain ? order.indexOf(p.user_id) : -1;
              return (
                <li key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                  <span className={cx("relative inline-flex", p.online === false && "opacity-45 grayscale")}>
                    <Avatar name={p.nickname} color={p.color} path={p.avatar_path} size={24} />
                    {p.online !== undefined && (
                      <span className={cx("absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-surface", p.online ? "bg-ok" : "bg-muted")} />
                    )}
                  </span>
                  <span className={cx("min-w-0 flex-1 truncate", p.online === false && "text-muted")} title={p.online === false ? "Bağlantı yok" : undefined}>
                    {p.nickname}
                    {p.user_id === me && <span className="text-muted"> (sen)</span>}
                    {p.online === false && <span className="text-[11px] text-muted"> · bağlantı yok</span>}
                  </span>
                  <span className={cx("text-xs", p.done ? "text-ok" : "text-muted")}>
                    {pos >= 0 && <span className="mr-1 font-mono text-muted">{pos + 1}.</span>}
                    {!hasRole
                      ? "izleyici"
                      : p.done
                        ? "hazır"
                        : chain && pos > 0 && !players.find((x) => x.user_id === order[pos - 1])?.done
                          ? "sırada"
                          : room.foley_user === p.user_id && !assignments.some((a) => a.user_id === p.user_id)
                            ? "foley"
                            : "kayıtta"}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-line p-3">
            {partCount > 0 && !waitingTurn && (
              <>
                <Button
                  size="sm"
                  variant={meDone ? "ghost" : "secondary"}
                  disabled={!meDone && recCount === 0}
                  icon={meDone ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
                  onClick={toggleDone}
                >
                  {meDone ? "Hazır değilim" : recCount < partCount ? `Hazırım (${partCount - recCount} eksik)` : "Kayıtlarım tamam"}
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

function RecOverlay({
  line,
  text,
  card,
  foley,
  t,
  recording,
  color,
  wave,
}: {
  line: SceneLine;
  text: string | null;
  card?: { name: string; emoji: string } | null;
  foley?: boolean;
  t: number;
  recording: boolean;
  color?: string;
  wave?: React.ReactNode;
}) {
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
          {recording && wave && <span className="ml-1.5 border-l border-white/15 pl-2">{wave}</span>}
        </span>
        <span className="flex items-center gap-1.5">
          {card && (
            <span className="rounded bg-accent px-2 py-1 text-xs font-semibold text-accent-fg">
              {card.emoji} {card.name}
            </span>
          )}
          {speaking && <span className="rounded bg-rec px-2 py-1 text-xs font-semibold text-white">{foley ? "Efektler!" : "Şimdi konuş"}</span>}
        </span>
      </div>
      {until > 0 && count <= 3 && (
        <div className="flex items-center justify-center">
          <span key={count} className="count-in font-mono text-7xl font-semibold text-white tabular-nums drop-shadow-[0_2px_12px_rgba(0,0,0,.7)] sm:text-8xl">
            {count}
          </span>
        </div>
      )}
      <div className="flex flex-col items-center gap-2.5">
        {text && (
          <span
            className={cx(
              "max-w-[90%] rounded-md px-3 py-1.5 text-center text-lg font-medium transition-opacity sm:text-2xl",
              speaking ? "bg-black/85" : "bg-black/60 opacity-70",
            )}
            style={{ color: speaking ? color : undefined }}
          >
            {text}
          </span>
        )}
        <Progress value={progress} tone={speaking ? "rec" : "fg"} className="h-1.5 max-w-md bg-white/15" />
      </div>
    </div>
  );
}
