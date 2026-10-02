"use client";

import { Check, Dices, Download, ExternalLink, Play, RotateCcw, Share2, Sparkles, Square, Volume2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { btn, Button, cx, Notice, Progress } from "@/components/ui";
import { refreshMe } from "@/lib/auth";
import { errMsg, publicUrl, sb, serverOffset } from "@/lib/supabase";
import { audioUnlocked, DubPlayer, recItem, unlockAudio, type DubItem } from "@/lib/player";
import VolumeSlider from "@/components/VolumeSlider";
import { downloadBlob, exportDub, exportSupported, slugify } from "@/lib/exporter";
import { sortLines, type Recording } from "@/lib/types";
import { isEffect } from "@/lib/effects";
import { cardInfo } from "@/lib/modes";
import VotePanel from "@/components/VotePanel";
import type { RoomProps } from "./Lobby";

type ExportState =
  | { kind: "idle" }
  | { kind: "working"; phase: "loading" | "rendering" | "finishing"; progress: number }
  | { kind: "done"; blob: Blob; name: string }
  | { kind: "error"; message: string };

export default function Finale({ room, scene, me, players, assignments, isHost, reload }: RoomProps) {
  const roles = useMemo(() => [...scene.scene_roles].sort((a, b) => a.sort - b.sort), [scene]);
  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const lines = useMemo(() => sortLines(scene.scene_lines), [scene]);
  const nickOf = (uid?: string) => players.find((p) => p.user_id === uid)?.nickname ?? "—";
  const actorOf = (roleId: string) => assignments.find((a) => a.role_id === roleId)?.user_id;
  // Mod ekleri: yeniden yazılmış replikler, kartlar, foley
  const [rewrites, setRewrites] = useState<Record<string, { text: string | null; author: string }>>({});
  const [cards, setCards] = useState<Record<string, string>>({});
  const [foleyBy, setFoleyBy] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<DubPlayer | null>(null);
  const itemsRef = useRef<DubItem[]>([]);
  const [recorded, setRecorded] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<[number, number]>([0, 1]);
  const [loaded, setLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pos, setPos] = useState(0);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exp, setExp] = useState<ExportState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setUnlocked(audioUnlocked()), []);

  // Tüm kayıtları indir ve çöz
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await sb().from("recordings").select("*").eq("room_id", room.id);
        if (error) throw error;
        const recs = (data as Recording[]) ?? [];
        if (cancelled || !videoRef.current) return;
        setRecorded(new Set(recs.map((r) => r.line_id)));
        const lineById = Object.fromEntries(scene.scene_lines.map((l) => [l.id, l]));
        const items = recs
          .filter((r) => lineById[r.line_id])
          .map((r) => recItem(publicUrl("recordings", r.audio_path), r.offset_time, lineById[r.line_id], r.line_id, isEffect(r.effect) ? r.effect : undefined));
        const [{ data: fo }, { data: tx }, { data: cd }] = await Promise.all([
          sb().from("room_foley").select("user_id, audio_path, offset_time").eq("room_id", room.id).maybeSingle(),
          room.mode === "senarist" ? sb().from("room_line_texts").select("line_id, author, text").eq("room_id", room.id) : Promise.resolve({ data: [] }),
          room.mods?.includes("kart") ? sb().from("room_cards").select("line_id, card").eq("room_id", room.id) : Promise.resolve({ data: [] }),
        ]);
        const f = fo as { user_id: string; audio_path: string; offset_time: number } | null;
        if (f?.audio_path) {
          items.push({ url: publicUrl("recordings", f.audio_path), at: f.offset_time, from: 0, key: "foley" });
          setFoleyBy(f.user_id);
        }
        setRewrites(Object.fromEntries(((tx as { line_id: string; author: string; text: string | null }[]) ?? []).map((r) => [r.line_id, r])));
        setCards(Object.fromEntries(((cd as { line_id: string; card: string }[]) ?? []).map((c) => [c.line_id, c.card])));
        itemsRef.current = items;
        const p = new DubPlayer(videoRef.current, { originalVolume: scene.original_volume, duck: scene.scene_lines });
        playerRef.current = p;
        await p.load(items, scene.bg_audio_path ? publicUrl("scenes", scene.bg_audio_path) : null, (d, t) => !cancelled && setProgress([d, t]));
        if (p.failed.length) setError(`${p.failed.length} ses dosyası yüklenemedi; o replikler sessiz kalacak.`);
        p.onTick = (x) => setPos(x);
        p.onEnd = () => {
          setPlaying(false);
          setEnded(true);
        };
        if (!cancelled) setLoaded(true);
      } catch (e) {
        setError(errMsg(e));
      }
    })();
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
    };
  }, [room.id, scene]);

  // Sunucu saatine göre herkesle aynı anda başlat
  useEffect(() => {
    if (!loaded || !unlocked || !room.finale_at) return;
    const p = playerRef.current;
    if (!p) return;
    let iv: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    (async () => {
      const offset = await serverOffset();
      if (cancelled) return;
      const startLocal = new Date(room.finale_at!).getTime() - offset;
      const delay = (startLocal - Date.now()) / 1000;
      setEnded(false);
      if (delay > 0) {
        p.play(0, delay);
        setPlaying(true);
        const tick = () => {
          const left = (startLocal - Date.now()) / 1000;
          setCountdown(left > 0 ? Math.ceil(left) : null);
          if (left <= 0 && iv) clearInterval(iv);
        };
        tick();
        iv = setInterval(tick, 100);
      } else {
        const elapsed = -delay;
        if (elapsed < (p.duration || Infinity) - 1) {
          p.play(elapsed + 0.3, 0.3);
          setPlaying(true);
        } else {
          setEnded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
      setCountdown(null);
      p.stop();
      setPlaying(false);
    };
  }, [loaded, unlocked, room.finale_at]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function unlock() {
    await unlockAudio(videoRef.current);
    setUnlocked(true);
  }

  function replayLocal() {
    setEnded(false);
    setPlaying(true);
    playerRef.current?.play(0, 0.2);
  }
  function stopLocal() {
    playerRef.current?.stop();
    setPlaying(false);
    setEnded(true);
  }

  async function hostRpc(fn: string) {
    const { error } = await sb().rpc(fn, { p_room: room.id });
    if (error) setError(errMsg(error));
    else reload?.();
  }

  async function startExport() {
    if (!exportSupported()) {
      setExp({ kind: "error", message: "Bu tarayıcı video dışa aktarmayı desteklemiyor. Bilgisayarda Chrome ya da Edge dene." });
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setExp({ kind: "working", phase: "loading", progress: 0 });
    try {
      const res = await exportDub({
        videoUrl: publicUrl("scenes", scene.video_path),
        items: itemsRef.current,
        bgUrl: scene.bg_audio_path ? publicUrl("scenes", scene.bg_audio_path) : null,
        originalVolume: scene.original_volume,
        duck: scene.scene_lines,
        signal: ac.signal,
        onPhase: (phase) => setExp((s) => ({ kind: "working", phase, progress: s.kind === "working" ? s.progress : 0 })),
        onProgress: (f) => setExp((s) => (s.kind === "working" ? { ...s, progress: f } : s)),
      });
      const name = `${slugify(scene.title)}-fam-io.${res.ext}`;
      downloadBlob(res.blob, name);
      setExp({ kind: "done", blob: res.blob, name });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") setExp({ kind: "idle" });
      else setExp({ kind: "error", message: "Video üretilemedi: " + errMsg(e) });
    } finally {
      abortRef.current = null;
    }
  }

  const active = lines.filter((l) => pos >= l.start_time && pos <= l.end_time);
  const pct = progress[0] / progress[1];
  const dur = playerRef.current?.duration || 0;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 pb-24 sm:px-6">
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

          {playing && countdown === null && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 px-4">
              {active.map((l) => {
                const r = roleById[l.role_id];
                return (
                  <span key={l.id} className="flex flex-col items-center gap-1">
                    {rewrites[l.id]?.text && <span className="max-w-xl rounded bg-black/80 px-3 py-1 text-center text-base font-medium sm:text-lg">{rewrites[l.id].text}</span>}
                    <span className="inline-flex items-center gap-1.5 rounded bg-black/80 px-2.5 py-1 text-[13px]">
                      <span className="size-1.5 rounded-full" style={{ background: r?.color }} />
                      <span className="font-medium">{nickOf(actorOf(l.role_id))}</span>
                      <span className="text-fg-2">{r?.name}</span>
                      {cards[l.id] && <span className="text-accent">· {cardInfo(cards[l.id])?.emoji} {cardInfo(cards[l.id])?.name}</span>}
                      {!recorded.has(l.id) && <span className="text-muted">· kayıt yok</span>}
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          {(!unlocked || !loaded || countdown !== null || ended) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
              {!unlocked ? (
                <>
                  <p className="eyebrow">Final</p>
                  <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{scene.title}</p>
                  <Button variant="primary" size="lg" icon={<Volume2 className="size-4" />} onClick={unlock}>
                    Hazırım, sesi aç
                  </Button>
                  <p className="max-w-xs text-xs text-muted">Tarayıcının sesi açabilmesi için bir kez dokunman gerekiyor.</p>
                </>
              ) : !loaded ? (
                <>
                  <p className="text-sm font-medium">Kayıtlar indiriliyor</p>
                  <Progress value={pct} className="w-56" />
                </>
              ) : countdown !== null ? (
                <>
                  <p className="eyebrow">Herkes için başlıyor</p>
                  <span key={countdown} className="count-in font-mono text-8xl font-semibold text-accent tabular-nums">
                    {countdown}
                  </span>
                </>
              ) : (
                <Credits
                  roles={roles}
                  nickOf={nickOf}
                  actorOf={actorOf}
                  creator={scene.creator?.display_name}
                  foley={foleyBy ? nickOf(foleyBy) : undefined}
                  writers={[...new Set(Object.values(rewrites).filter((r) => r.text).map((r) => nickOf(r.author)))]}
                />
              )}
              {!loaded && unlocked === false && <p className="font-mono text-[11px] text-muted">yükleniyor %{Math.round(pct * 100)}</p>}
            </div>
          )}
        </div>
        {loaded && unlocked && (
          <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
            <Progress value={dur ? pos / dur : 0} tone="fg" />
            <VolumeSlider onChange={(v) => playerRef.current?.setVolume(v)} />
          </div>
        )}
      </div>

      {error && <Notice tone="warn">{error}</Notice>}

      {room.current_dub_id && <DubSaved dubId={room.current_dub_id} me={me} />}
      {room.current_dub_id && loaded && <VotePanel dubId={room.current_dub_id} scene={scene} me={me} />}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Dublajlı videoyu indir</h3>
              <p className="mt-0.5 text-xs text-muted">
                Video tarayıcında gerçek zamanlı üretilir (klip süresi kadar). Bu sırada sekmeyi açık tut.
              </p>
            </div>
            {exp.kind === "working" ? (
              <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} onClick={() => abortRef.current?.abort()}>
                İptal
              </Button>
            ) : exp.kind === "done" ? (
              <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => downloadBlob(exp.blob, exp.name)}>
                Tekrar indir
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={<Download className="size-3.5" />} disabled={!loaded} onClick={startExport}>
                Videoyu indir
              </Button>
            )}
          </div>
          {exp.kind === "working" && (
            <div className="flex items-center gap-3">
              <Progress value={exp.phase === "loading" ? 0 : exp.progress} />
              <span className="w-28 shrink-0 text-right font-mono text-[11px] text-muted">
                {exp.phase === "loading" ? "hazırlanıyor" : exp.phase === "finishing" ? "tamamlanıyor" : `%${Math.round(exp.progress * 100)}`}
              </span>
            </div>
          )}
          {exp.kind === "done" && (
            <p className="text-xs text-ok">
              {exp.name} indirildi · {(exp.blob.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
          {exp.kind === "error" && <Notice>{exp.message}</Notice>}
        </div>

        <div className="panel flex flex-wrap items-center gap-2 p-4 sm:flex-col sm:items-stretch">
          {loaded && unlocked && (
            <Button
              size="sm"
              icon={playing ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
              onClick={playing ? stopLocal : replayLocal}
            >
              {playing ? "Durdur" : "Sadece ben izle"}
            </Button>
          )}
          {isHost ? (
            <>
              <Button size="sm" variant="primary" icon={<RotateCcw className="size-3.5" />} onClick={() => hostRpc("start_finale")}>
                Herkes için tekrar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Dices className="size-3.5" />}
                onClick={() => confirm("Kayıtlar silinip lobiye dönülecek. Emin misin?") && hostRpc("reset_room")}
              >
                Yeni tur
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted">Yeni turu oda sahibi başlatır.</p>
          )}
        </div>
      </div>
      <p className="text-center text-[11px] text-muted">{nickOf(me)} olarak izliyorsun</p>
    </main>
  );
}

function Credits({
  roles,
  nickOf,
  actorOf,
  creator,
  foley,
  writers,
}: {
  roles: { id: string; name: string; color: string }[];
  nickOf: (uid?: string) => string;
  actorOf: (roleId: string) => string | undefined;
  creator?: string;
  foley?: string;
  writers?: string[];
}) {
  return (
    <div className="fade-up flex flex-col items-center gap-5">
      <p className="eyebrow">Seslendirenler</p>
      <ul className="flex flex-col gap-2">
        {roles.map((r) => (
          <li key={r.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[15px]">
            <span className={cx("text-right font-medium")} style={{ color: r.color }}>
              {r.name}
            </span>
            <span className="h-px w-6 bg-line-strong" />
            <span className="text-left text-fg">{nickOf(actorOf(r.id))}</span>
          </li>
        ))}
      </ul>
      {(foley || (writers && writers.length > 0)) && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {writers && writers.length > 0 && (
            <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <span className="text-right text-muted">Senaryo</span>
              <span className="h-px w-6 bg-line-strong" />
              <span>{writers.join(", ")}</span>
            </li>
          )}
          {foley && (
            <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <span className="text-right text-muted">Foley</span>
              <span className="h-px w-6 bg-line-strong" />
              <span>{foley}</span>
            </li>
          )}
        </ul>
      )}
      {creator && (
        <p className="text-xs text-muted">
          Sahneyi ekleyen <span className="text-fg-2">{creator}</span>
        </p>
      )}
    </div>
  );
}

export function DubSaved({ dubId, me }: { dubId: string; me: string }) {
  const [xp, setXp] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    sb()
      .from("dub_participants")
      .select("xp_gained")
      .eq("dub_id", dubId)
      .eq("user_id", me)
      .maybeSingle()
      .then(({ data }) => setXp(data ? data.xp_gained : null));
    refreshMe().catch(() => {});
  }, [dubId, me]);

  async function share() {
    const url = `${location.origin}/d/${dubId}`;
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) await navigator.share({ title: "fam-io dublajı", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  return (
    <div className="panel fade-up flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Sparkles className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">{xp != null ? `+${xp} XP kazandın` : "Dublaj kaydedildi"}</p>
          <p className="text-xs text-muted">Bu dublaj katılan herkesin profiline işlendi. Linkle paylaşabilir, beğeni ve yorum toplayabilirsin.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" icon={copied ? <Check className="size-3.5 text-ok" /> : <Share2 className="size-3.5" />} onClick={share}>
          {copied ? "Kopyalandı" : "Paylaş"}
        </Button>
        <Link href={`/d/${dubId}`} className={btn("primary", "sm")}>
          <ExternalLink className="size-3.5" /> Dublaj sayfası
        </Link>
      </div>
    </div>
  );
}
