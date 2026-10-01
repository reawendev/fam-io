"use client";

import { Circle, Crown, Dices, Flag, Gavel, Headphones, Play, RotateCcw, Square, Swords, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MicWave from "@/components/MicWave";
import { Avatar, Button, cx, Notice, Progress, RoleTag, Spinner } from "@/components/ui";
import { refreshMe } from "@/lib/auth";
import { DubPlayer, LINE_TAIL, playOriginal, recItem, unlockAudio } from "@/lib/player";
import { errMsg, publicUrl, sb } from "@/lib/supabase";
import { fmtTime, type SceneLine } from "@/lib/types";
import type { RoomProps } from "./Lobby";

type Match = {
  id: string;
  round: number;
  slot: number;
  a: string;
  b: string | null;
  line_id: string;
  status: "bekliyor" | "kayit" | "oylama" | "bitti";
  winner: string | null;
};
type Take = { match_id: string; user_id: string; audio_path: string; offset_time: number };
type Vote = { match_id: string; voter: string; pick: string };

const PREROLL = 3;

function pickMime(): { mimeType?: string; ext: string } {
  const cands: [string, string][] = [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/webm", "webm"],
    ["audio/mp4", "m4a"],
  ];
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported)
    for (const [m, e] of cands) if (MediaRecorder.isTypeSupported(m)) return { mimeType: m, ext: e };
  return { ext: "webm" };
}

/**
 * Düello modu: eleme usulü turnuva. Her maçta iki oyuncu aynı repliği seslendirir,
 * diğerleri oylar, oda sahibi oylamayı kapatır; kazanan bir sonraki tura geçer.
 */
export default function DuelArena({ room, scene, me, players, isHost, reload }: RoomProps) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null); // "orig" | user id
  const [rec, setRec] = useState<{ phase: "arming" | "rec" | "upload"; offset?: number } | null>(null);
  const [t, setT] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<DubPlayer | null>(null);
  const stopOrigRef = useRef<(() => void) | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const cancelRef = useRef(false);
  const endRef = useRef<number>(0);

  const lineById = useMemo(() => Object.fromEntries(scene.scene_lines.map((l) => [l.id, l])), [scene]);
  const roleById = useMemo(() => Object.fromEntries(scene.scene_roles.map((r) => [r.id, r])), [scene]);
  const person = (uid?: string | null) => players.find((p) => p.user_id === uid);
  const nameOf = (uid?: string | null) => person(uid)?.nickname ?? "Ayrılan oyuncu";

  const load = useCallback(async () => {
    const { data: ms, error } = await sb().from("duel_matches").select("*").eq("room_id", room.id).order("round").order("slot");
    if (error) return setError(errMsg(error));
    const list = (ms as Match[]) ?? [];
    setMatches(list);
    const ids = list.map((m) => m.id);
    if (!ids.length) return;
    const [{ data: tk }, { data: vt }] = await Promise.all([
      sb().from("duel_takes").select("*").in("match_id", ids),
      sb().from("duel_votes").select("*").in("match_id", ids),
    ]);
    setTakes((tk as Take[]) ?? []);
    setVotes((vt as Vote[]) ?? []);
  }, [room.id]);

  useEffect(() => {
    load();
    const ch = sb()
      .channel(`duel:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "duel_matches", filter: `room_id=eq.${room.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "duel_votes" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "duel_takes" }, () => load())
      .subscribe();
    const iv = setInterval(load, 4000);
    return () => {
      sb().removeChannel(ch);
      clearInterval(iv);
    };
  }, [room.id, room.status, load]);

  useEffect(
    () => () => {
      stream?.getTracks().forEach((x) => x.stop());
      playerRef.current?.destroy();
      stopOrigRef.current?.();
    },
    [stream],
  );

  // Kaydı replik bitince durdur
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        setT(v.currentTime);
        const mr = mrRef.current;
        if (mr && mr.state === "recording" && (v.currentTime >= endRef.current || v.ended)) {
          v.pause();
          mr.stop();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const active = matches?.find((m) => m.status === "kayit" || m.status === "oylama") ?? null;
  const line: SceneLine | undefined = active ? lineById[active.line_id] : undefined;
  const iAmIn = !!active && (active.a === me || active.b === me);
  const myTake = active ? takes.find((x) => x.match_id === active.id && x.user_id === me) : undefined;
  const matchVotes = active ? votes.filter((v) => v.match_id === active.id) : [];
  const count = (uid: string) => matchVotes.filter((v) => v.pick === uid).length;
  const myVote = matchVotes.find((v) => v.voter === me)?.pick;
  const rounds = useMemo(() => {
    const r = new Map<number, Match[]>();
    for (const m of matches ?? []) r.set(m.round, [...(r.get(m.round) ?? []), m]);
    return [...r.entries()];
  }, [matches]);
  const totalRounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, room.mode_state?.players?.length ?? players.length))));

  function stopPlay() {
    playerRef.current?.stop();
    stopOrigRef.current?.();
    stopOrigRef.current = null;
    setPlaying(null);
  }

  async function listen(who: "orig" | string) {
    const v = videoRef.current;
    if (!v || !line) return;
    if (playing === who) return stopPlay();
    stopPlay();
    await unlockAudio(v);
    setPlaying(who);
    if (who === "orig") {
      stopOrigRef.current = playOriginal(v, Math.max(0, line.start_time - 0.6), line.end_time + 0.4, () => setPlaying(null));
      return;
    }
    const tk = takes.find((x) => x.match_id === active!.id && x.user_id === who);
    if (!tk) return setPlaying(null);
    try {
      playerRef.current?.destroy();
      const p = new DubPlayer(v);
      playerRef.current = p;
      await p.load([recItem(publicUrl("recordings", tk.audio_path), tk.offset_time, line, tk.user_id)], null);
      p.onEnd = () => setPlaying(null);
      p.play(Math.max(0, line.start_time - 0.8), 0.1, line.end_time + LINE_TAIL + 0.2);
    } catch (e) {
      setError(errMsg(e));
      setPlaying(null);
    }
  }

  async function record() {
    const v = videoRef.current;
    if (!v || !line || !active) return;
    stopPlay();
    setError(null);
    cancelRef.current = false;
    setRec({ phase: "arming" });
    try {
      let s = stream;
      if (!s?.getAudioTracks().some((x) => x.readyState === "live")) {
        s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        setStream(s);
      }
      v.muted = true;
      await new Promise<void>((res) => {
        const target = Math.max(0, line.start_time - PREROLL);
        if (Math.abs(v.currentTime - target) < 0.01) return res();
        const done = () => {
          v.removeEventListener("seeked", done);
          res();
        };
        v.addEventListener("seeked", done);
        v.currentTime = target;
        setTimeout(done, 3000);
      });
      endRef.current = line.end_time + LINE_TAIL;
      const { mimeType, ext } = pickMime();
      const mr = new MediaRecorder(s!, mimeType ? { mimeType } : undefined);
      mrRef.current = mr;
      const chunks: BlobPart[] = [];
      let offset = 0;
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstart = () => {
        offset = v.currentTime;
        setRec({ phase: "rec", offset });
      };
      mr.onstop = async () => {
        mrRef.current = null;
        if (cancelRef.current) return setRec(null);
        setRec({ phase: "upload" });
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || mimeType || "audio/webm" });
          const path = `${room.id}/${me}/duel-${active.id.slice(0, 8)}-${Date.now()}.${ext}`;
          const { error: e1 } = await sb().storage.from("recordings").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
          if (e1) throw e1;
          const { error: e2 } = await sb().rpc("duel_save", { p_match: active.id, p_path: path, p_offset: offset });
          if (e2) throw e2;
          if (myTake?.audio_path) sb().storage.from("recordings").remove([myTake.audio_path]).catch(() => {});
          await load();
        } catch (e) {
          setError("Kayıt gönderilemedi: " + errMsg(e));
        } finally {
          setRec(null);
        }
      };
      await v.play();
      mr.start();
    } catch (e) {
      const msg = errMsg(e);
      setError(/Permission|NotAllowed|denied/i.test(msg) ? "Mikrofon izni verilmedi." : "Kayıt başlatılamadı: " + msg);
      setRec(null);
    }
  }

  function cancel() {
    cancelRef.current = true;
    videoRef.current?.pause();
    if (mrRef.current?.state === "recording") mrRef.current.stop();
    else setRec(null);
  }

  async function rpc(fn: string, args: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    const { error } = await sb().rpc(fn, args);
    if (error) setError(errMsg(error));
    await load();
    await reload?.();
    refreshMe().catch(() => {});
    setBusy(null);
  }

  // ---------- Şampiyon ekranı ----------
  const champion = room.mode_state?.champion;
  if (room.status === "finale") {
    const champ = person(champion);
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 pb-24 sm:px-6">
        <section className="panel relative flex flex-col items-center gap-3 overflow-hidden px-6 py-10 text-center">
          <div className="glow-pulse pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" aria-hidden />
          <Trophy className="relative size-8 text-accent" />
          <p className="eyebrow relative">Düello şampiyonu</p>
          <span className="relative">
            <Crown className="absolute -top-6 left-1/2 size-6 -translate-x-1/2 text-accent" />
            <Avatar name={champ?.nickname ?? "?"} color={champ?.color} path={champ?.avatar_path} frame={champ?.equipped?.frame} size={88} />
          </span>
          <h1 className="relative text-3xl font-semibold tracking-tight">{champ?.nickname ?? nameOf(champion)}</h1>
          <p className="relative text-sm text-muted">
            {scene.title} sahnesinde {room.mode_state?.players?.length ?? players.length} kişilik turnuvayı kazandı · +50 XP
            {champion === me && " · tebrikler!"}
          </p>
          {isHost ? (
            <Button variant="primary" className="relative mt-2" icon={<Dices className="size-4" />} loading={busy === "reset"} onClick={() => rpc("reset_room", { p_room: room.id }, "reset")}>
              Yeni turnuva
            </Button>
          ) : (
            <p className="relative mt-2 text-xs text-muted">Yeni turnuvayı oda sahibi başlatır.</p>
          )}
        </section>
        {error && <Notice>{error}</Notice>}
        <Bracket rounds={rounds} totalRounds={totalRounds} nameOf={nameOf} me={me} />
      </main>
    );
  }

  // ---------- Turnuva sürüyor ----------
  const curRole = line ? roleById[line.role_id] : null;
  const speaking = !!line && t >= line.start_time && t <= line.end_time;
  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="panel overflow-hidden">
          <div className="relative bg-black">
            <video ref={videoRef} src={publicUrl("scenes", scene.video_path)} crossOrigin="anonymous" playsInline muted preload="auto" className="aspect-video w-full" />
            {rec && line && (
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded bg-black/75 px-2 py-1 font-mono text-[11px] font-medium tracking-wider">
                    <span className={cx("size-2 rounded-full", rec.phase === "rec" ? "rec-dot bg-rec" : "bg-muted")} />
                    {rec.phase === "rec" ? "DÜELLO KAYDI" : rec.phase === "upload" ? "GÖNDERİLİYOR" : "HAZIRLANIYOR"}
                    {rec.phase === "rec" && (
                      <span className="ml-1.5 border-l border-white/15 pl-2">
                        <MicWave stream={stream} bars={28} className="h-5 w-24 sm:w-32" />
                      </span>
                    )}
                  </span>
                  {speaking && <span className="rounded bg-rec px-2 py-1 text-xs font-semibold text-white">Şimdi konuş</span>}
                </div>
                {line.start_time - t > 0 && Math.ceil(line.start_time - t) <= 3 && rec.phase === "rec" && (
                  <div className="flex justify-center">
                    <span key={Math.ceil(line.start_time - t)} className="count-in font-mono text-7xl font-semibold text-white tabular-nums sm:text-8xl">
                      {Math.ceil(line.start_time - t)}
                    </span>
                  </div>
                )}
                <div className="flex flex-col items-center gap-2.5">
                  {line.text && <span className="max-w-[90%] rounded-md bg-black/80 px-3 py-1.5 text-center text-lg font-medium sm:text-2xl">{line.text}</span>}
                  <Progress value={(t - line.start_time) / (line.end_time - line.start_time)} tone={speaking ? "rec" : "fg"} className="h-1.5 max-w-md bg-white/15" />
                </div>
              </div>
            )}
            {playing && (
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded bg-black/80 px-2 py-1 text-xs font-medium">
                {playing === "orig" ? <Headphones className="size-3.5" /> : <Play className="size-3.5" />}
                {playing === "orig" ? "Orijinal" : nameOf(playing)}
              </span>
            )}
          </div>
        </div>

        {error && <Notice>{error}</Notice>}

        {!matches ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Turnuva yükleniyor
          </div>
        ) : !active || !line ? (
          <div className="panel px-6 py-10 text-center text-sm text-muted">Sıradaki maç hazırlanıyor…</div>
        ) : (
          <div className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">
                {active.round === totalRounds ? "Final" : active.round === totalRounds - 1 && totalRounds > 1 ? "Yarı final" : `${active.round}. tur`} · maç {active.slot + 1}
              </span>
              {curRole && <RoleTag name={curRole.name} color={curRole.color} />}
              <span className="font-mono text-xs text-muted">
                {fmtTime(line.start_time)} · {(line.end_time - line.start_time).toFixed(1)} sn
              </span>
              <Button size="sm" variant="ghost" className="ml-auto" icon={playing === "orig" ? <Square className="size-3.5" /> : <Headphones className="size-3.5" />} disabled={!!rec} onClick={() => listen("orig")}>
                Orijinali dinle
              </Button>
            </div>
            <p className="mt-3 text-xl leading-snug font-medium sm:text-2xl">{line.text || <span className="text-muted">Metinsiz replik — orijinali dinle.</span>}</p>

            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
              {[active.a, active.b!].map((uid, i) => {
                const p = person(uid);
                const n = count(uid);
                const lead = active.status === "oylama" && n > 0 && n >= count(i === 0 ? active.b! : active.a);
                return (
                  <div key={uid} className={cx("flex flex-col items-center gap-2 rounded-xl border p-3 text-center", i === 1 && "col-start-3", lead ? "border-accent/50 bg-accent/[0.06]" : "border-line bg-bg")}>
                    <Avatar name={nameOf(uid)} color={p?.color} path={p?.avatar_path} frame={p?.equipped?.frame} size={48} />
                    <span className="text-sm font-medium">
                      {nameOf(uid)}
                      {uid === me && <span className="text-muted"> (sen)</span>}
                    </span>
                    {active.status === "oylama" ? (
                      <>
                        <Button size="sm" className="w-full" icon={playing === uid ? <Square className="size-3.5" /> : <Play className="size-3.5" />} onClick={() => listen(uid)}>
                          {playing === uid ? "Durdur" : "Dinle"}
                        </Button>
                        <Button
                          size="sm"
                          variant={myVote === uid ? "primary" : "secondary"}
                          className="w-full"
                          disabled={uid === me || !!busy}
                          loading={busy === "vote" + uid}
                          onClick={() => rpc("duel_vote", { p_match: active.id, p_pick: uid }, "vote" + uid)}
                        >
                          {myVote === uid ? "Oyun burada" : "Oy ver"}
                        </Button>
                        <span className="font-mono text-xs text-fg-2">{n} oy</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted">{uid === me ? (myTake ? "kaydın gönderildi" : "sıra sende") : "kaydediyor"}</span>
                    )}
                  </div>
                );
              })}
              <span className="col-start-2 row-start-1 flex items-center">
                <Swords className="size-5 text-accent" />
              </span>
            </div>

            {active.status === "kayit" && iAmIn && (
              <div className="mt-5 flex flex-wrap gap-2">
                {rec && rec.phase !== "upload" ? (
                  <Button variant="danger" size="lg" className="flex-1" icon={<Square className="size-4" />} onClick={cancel}>
                    İptal
                  </Button>
                ) : (
                  <Button variant="rec" size="lg" className="flex-1" loading={rec?.phase === "upload"} icon={myTake ? <RotateCcw className="size-4" /> : <Circle className="size-3.5 fill-current" />} onClick={record}>
                    {myTake ? "Tekrar çek" : "Kaydet"}
                  </Button>
                )}
                {myTake && !rec && (
                  <Button size="lg" icon={playing === me ? <Square className="size-4" /> : <Play className="size-4" />} onClick={() => listen(me)}>
                    Kaydımı dinle
                  </Button>
                )}
              </div>
            )}
            {active.status === "kayit" && (
              <p className="mt-3 text-xs text-muted">
                {iAmIn
                  ? "Video repliğin 3 saniye öncesinden başlar; 3-2-1 bitince konuş. İkiniz de kaydedince oylama açılır, rakibinin kaydını oylamadan önce duyamazsın."
                  : `${nameOf(active.a)} ve ${nameOf(active.b)} kaydediyor. İkisi de bitirince oylama açılır.`}
              </p>
            )}
            {active.status === "oylama" && (
              <p className="mt-3 text-xs text-muted">İkisini de dinle, daha iyi seslendirene oy ver. Kendine oy veremezsin. Eşitlikte yazı tura atılır.</p>
            )}

            {isHost && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {active.status === "oylama" && (
                  <Button variant="primary" size="sm" icon={<Gavel className="size-3.5" />} loading={busy === "close"} onClick={() => rpc("duel_close", { p_match: active.id }, "close")}>
                    Oylamayı kapat ({matchVotes.length} oy)
                  </Button>
                )}
                <span className="text-xs text-muted">Biri gitti mi?</span>
                {[active.a, active.b!].map((uid) => (
                  <Button
                    key={uid}
                    size="sm"
                    variant="ghost"
                    icon={<Flag className="size-3.5" />}
                    disabled={!!busy}
                    onClick={() => confirm(`${nameOf(uid)} hükmen kaybetsin mi?`) && rpc("duel_forfeit", { p_match: active.id, p_loser: uid }, "forfeit")}
                  >
                    {nameOf(uid)} çekildi
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <Bracket rounds={rounds} totalRounds={totalRounds} nameOf={nameOf} me={me} activeId={active?.id} compact />
        <p className="px-1 text-xs text-muted">Her maç kazanana +10 XP, şampiyona +50 XP. Tek kalan oyuncu o turu bay geçer.</p>
      </aside>
    </main>
  );
}

function Bracket({
  rounds,
  totalRounds,
  nameOf,
  me,
  activeId,
  compact,
}: {
  rounds: [number, Match[]][];
  totalRounds: number;
  nameOf: (uid?: string | null) => string;
  me: string;
  activeId?: string;
  compact?: boolean;
}) {
  const title = (r: number) => (r === totalRounds ? "Final" : r === totalRounds - 1 && totalRounds > 1 ? "Yarı final" : `${r}. tur`);
  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Trophy className="size-4 text-muted" /> Turnuva ağacı
        </h3>
      </div>
      <div className={cx("flex gap-3 overflow-x-auto p-3", compact ? "flex-col" : "flex-row")}>
        {rounds.map(([r, ms]) => (
          <div key={r} className={cx("flex min-w-44 flex-col gap-2", !compact && "flex-1 justify-around")}>
            <p className="eyebrow">{title(r)}</p>
            {ms.map((m) => (
              <div key={m.id} className={cx("rounded-lg border text-[13px]", m.id === activeId ? "border-accent/60" : "border-line")}>
                {[m.a, m.b].map((uid, i) => (
                  <div
                    key={i}
                    className={cx(
                      "flex items-center justify-between gap-2 px-2.5 py-1.5",
                      i === 0 && "border-b border-line",
                      m.winner && uid === m.winner && "font-medium text-accent",
                      m.winner && uid !== m.winner && "text-muted line-through decoration-muted/40",
                    )}
                  >
                    <span className="truncate">{uid ? nameOf(uid) + (uid === me ? " (sen)" : "") : <span className="text-muted no-underline">bay</span>}</span>
                    {m.winner && uid === m.winner && <Crown className="size-3.5 shrink-0" />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
