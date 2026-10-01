"use client";

import { Circle, ImageIcon, Music, Pause, Play, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { btn, Button, cx, IconButton, Notice, PageHeader, Progress, Spinner, Swatch } from "@/components/ui";
import { ensureUser, errMsg, publicUrl, sb } from "@/lib/supabase";
import { compressionSupported, compressVideo, fmtMB } from "@/lib/compress";
import { videoThumbnail } from "@/lib/image";
import { fmtTime, MAX_ROLES, ROLE_COLORS, sortLines, type SceneFull, type SceneLine, type SceneRole } from "@/lib/types";

type EdRole = Pick<SceneRole, "id" | "name" | "color" | "sort">;
type EdLine = Pick<SceneLine, "id" | "role_id" | "start_time" | "end_time" | "text">;

const MAX_VIDEO_MB = 50; // Supabase ücretsiz planda dosya başına üst sınır
const MAX_INPUT_MB = 1024; // sıkıştırılacak ham dosya için makul üst sınır
const MAX_TAGS = 5;
export const TAG_SUGGESTIONS = ["anime", "film", "dizi", "çizgi film", "oyun", "komedi", "dram", "aksiyon", "korku", "reklam", "meme", "müzikal"];
const normTag = (t: string) => t.trim().replace(/^#/, "").replace(/\s+/g, " ").toLocaleLowerCase("tr").slice(0, 24);

function extOf(f: File) {
  const m = f.name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "bin";
}

export default function SceneEditor({ initial }: { initial?: SceneFull }) {
  const router = useRouter();
  const isNew = !initial;
  const [sceneId] = useState(() => initial?.id ?? crypto.randomUUID());
  // /sahneler/yeni?istek=<id>: kaydedince bu sahne isteği karşılar
  const [istek, setIstek] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!isNew) return;
    const id = new URLSearchParams(location.search).get("istek");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    sb()
      .from("scene_requests")
      .select("id, title, status")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        const r = data as { id: string; title: string; status: string } | null;
        if (r && r.status === "acik") {
          setIstek({ id: r.id, title: r.title });
          setTitle((t) => t || r.title);
        }
      });
  }, [isNew]);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [videoPath, setVideoPath] = useState(initial?.video_path ?? "");
  const [videoSrc, setVideoSrc] = useState(initial ? publicUrl("scenes", initial.video_path) : "");
  const [bgPath, setBgPath] = useState<string | null>(initial?.bg_audio_path ?? null);
  const [origVol, setOrigVol] = useState(initial?.original_volume ?? 0);
  const [duration, setDuration] = useState(initial?.duration ?? 0);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [thumbPath, setThumbPath] = useState<string | null>(initial?.thumb_path ?? null);
  const [thumbAt, setThumbAt] = useState<number | null>(null); // null: otomatik kare
  const [videoChanged, setVideoChanged] = useState(false);

  const [roles, setRoles] = useState<EdRole[]>(
    initial ? [...initial.scene_roles].sort((a, b) => a.sort - b.sort) : [],
  );
  const [lines, setLines] = useState<EdLine[]>(initial ? sortLines(initial.scene_lines) : []);
  const [selRole, setSelRole] = useState<string | null>(initial?.scene_roles[0]?.id ?? null);

  const [uploading, setUploading] = useState<string | null>(null);
  const [compress, setCompress] = useState<{ progress: number; size: number } | null>(null);
  const [compressNote, setCompressNote] = useState<string | null>(null);
  const compressAbort = useRef<AbortController | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stopAt = useRef<number | null>(null);
  const holdStart = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);

  // Oynatma zamanını takip et
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        setT(v.currentTime);
        if (stopAt.current !== null && v.currentTime >= stopAt.current) {
          v.pause();
          stopAt.current = null;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- Yükleme ----------
  async function upload(original: File, kind: "video" | "bg") {
    setError(null);
    setCompressNote(null);
    let file = original;
    if (kind === "video") {
      if (file.size > MAX_INPUT_MB * 1024 * 1024) {
        setError(`Dosya çok büyük (${fmtMB(file.size)}). Daha kısa bir klip seç.`);
        return;
      }
      // Büyük / yüksek çözünürlüklü videoyu önce tarayıcıda 720p'ye küçült
      const ac = new AbortController();
      compressAbort.current = ac;
      setCompress({ progress: 0, size: file.size });
      try {
        const r = await compressVideo(file, { signal: ac.signal, onProgress: (p) => setCompress({ progress: p, size: original.size }) });
        file = r.file;
        if (r.compressed) setCompressNote(`${fmtMB(r.before)} → ${fmtMB(r.after)} (720p'ye sıkıştırıldı)`);
        else if (r.reason === "unsupported" && !compressionSupported()) setCompressNote("Bu tarayıcı sıkıştırmayı desteklemiyor; video olduğu gibi yüklendi.");
      } catch (e) {
        setCompress(null);
        if (ac.signal.aborted) return;
        setError("Video sıkıştırılamadı: " + errMsg(e));
        return;
      } finally {
        compressAbort.current = null;
      }
      setCompress(null);
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(
        `Dosya ${fmtMB(file.size)}; en fazla ${MAX_VIDEO_MB} MB olabilir.` +
          (kind === "video" ? " Klibi kısalt ya da Chrome/Edge ile yükle (otomatik sıkıştırma için)." : ""),
      );
      return;
    }
    setUploading(kind);
    try {
      const u = await ensureUser();
      const path = `${u.id}/${sceneId}-${kind}-${Date.now()}.${extOf(file)}`;
      const { error } = await sb().storage.from("scenes").upload(path, file, {
        contentType: file.type || undefined,
        cacheControl: "31536000",
      });
      if (error) throw error;
      if (kind === "video") {
        setVideoPath(path);
        setVideoSrc(URL.createObjectURL(file));
        setVideoChanged(true);
        setThumbAt(null);
      } else {
        setBgPath(path);
      }
    } catch (e) {
      setError("Yükleme başarısız: " + errMsg(e));
    } finally {
      setUploading(null);
    }
  }

  // ---------- Roller ----------
  function addRole() {
    if (roles.length >= MAX_ROLES) return;
    const used = new Set(roles.map((r) => r.color));
    const color = ROLE_COLORS.find((c) => !used.has(c)) ?? ROLE_COLORS[roles.length % ROLE_COLORS.length];
    const r: EdRole = { id: crypto.randomUUID(), name: `Karakter ${roles.length + 1}`, color, sort: roles.length };
    setRoles([...roles, r]);
    setSelRole(r.id);
  }
  function updateRole(id: string, patch: Partial<EdRole>) {
    setRoles(roles.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRole(id: string) {
    const n = lines.filter((l) => l.role_id === id).length;
    if (n && !confirm(`Bu karakterin ${n} repliği de silinecek. Emin misin?`)) return;
    setRoles(roles.filter((r) => r.id !== id).map((r, i) => ({ ...r, sort: i })));
    setLines(lines.filter((l) => l.role_id !== id));
    if (selRole === id) setSelRole(null);
  }

  // ---------- Replikler ----------
  const addLine = useCallback(
    (start: number, end: number) => {
      if (!selRole) {
        setError("Önce bir karakter seç.");
        return;
      }
      if (end - start < 0.2) return;
      setLines((ls) =>
        sortLines([
          ...ls,
          { id: crypto.randomUUID(), role_id: selRole, start_time: +start.toFixed(2), end_time: +end.toFixed(2), text: "" },
        ] as SceneLine[]),
      );
    },
    [selRole],
  );
  function updateLine(id: string, patch: Partial<EdLine>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((ls) => ls.filter((l) => l.id !== id));
  }
  function playSegment(l: EdLine) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, l.start_time - 0.3);
    stopAt.current = l.end_time + 0.2;
    v.play();
  }

  const beginHold = useCallback(() => {
    const v = videoRef.current;
    if (!v || holdStart.current !== null) return;
    if (!selRole) {
      setError("Önce bir karakter seç.");
      return;
    }
    holdStart.current = v.currentTime;
    setHolding(true);
    if (v.paused) v.play();
  }, [selRole]);
  const endHold = useCallback(() => {
    const v = videoRef.current;
    if (!v || holdStart.current === null) return;
    addLine(holdStart.current, v.currentTime);
    holdStart.current = null;
    setHolding(false);
  }, [addLine]);

  // Klavye kısayolları
  useEffect(() => {
    function typing(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
    }
    function down(e: KeyboardEvent) {
      if (typing(e)) return;
      const v = videoRef.current;
      if (!v) return;
      if (e.code === "Space") {
        e.preventDefault();
        stopAt.current = null;
        if (v.paused) v.play();
        else v.pause();
      } else if (e.key.toLowerCase() === "k" && !e.repeat) {
        beginHold();
      } else if (e.key === "ArrowLeft") {
        v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 0.1 : 1));
      } else if (e.key === "ArrowRight") {
        v.currentTime = Math.min(v.duration || 0, v.currentTime + (e.shiftKey ? 0.1 : 1));
      } else if (/^[1-7]$/.test(e.key)) {
        const r = roles[Number(e.key) - 1];
        if (r) setSelRole(r.id);
      }
    }
    function up(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k") endHold();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [roles, beginHold, endHold]);

  // ---------- Kaydet / Sil ----------
  async function save() {
    setError(null);
    if (!title.trim()) return setError("Sahneye bir isim ver.");
    if (!videoPath) return setError("Video yükle.");
    if (roles.length === 0) return setError("En az bir karakter ekle.");
    if (roles.some((r) => !r.name.trim())) return setError("Karakter isimleri boş olamaz.");
    if (lines.length === 0) return setError("En az bir replik işaretle.");
    const bad = lines.find((l) => !(l.end_time > l.start_time) || l.start_time < 0);
    if (bad) return setError(`Geçersiz zaman aralığı: ${fmtTime(bad.start_time)} – ${fmtTime(bad.end_time)}`);

    setSaving(true);
    try {
      const u = await ensureUser();
      const db = sb();
      const thumb = await ensureThumb(u.id);
      const { error: e1 } = await db.from("scenes").upsert({
        id: sceneId,
        title: title.trim(),
        description: description.trim() || null,
        video_path: videoPath,
        bg_audio_path: bgPath,
        original_volume: origVol,
        duration: duration || null,
        tags,
        thumb_path: thumb,
      });
      if (e1) throw e1;

      const lineIds = lines.map((l) => l.id);
      const roleIds = roles.map((r) => r.id);
      if (!isNew) {
        const delLines = db.from("scene_lines").delete().eq("scene_id", sceneId);
        const { error } = lineIds.length
          ? await delLines.not("id", "in", `(${lineIds.join(",")})`)
          : await delLines;
        if (error) throw error;
        const { error: e2 } = await db
          .from("scene_roles")
          .delete()
          .eq("scene_id", sceneId)
          .not("id", "in", `(${roleIds.join(",")})`);
        if (e2) throw e2;
      }
      const { error: e3 } = await db
        .from("scene_roles")
        .upsert(roles.map((r, i) => ({ id: r.id, scene_id: sceneId, name: r.name.trim(), color: r.color, sort: i })));
      if (e3) throw e3;
      const { error: e4 } = await db.from("scene_lines").upsert(
        lines.map((l) => ({
          id: l.id,
          scene_id: sceneId,
          role_id: l.role_id,
          start_time: l.start_time,
          end_time: l.end_time,
          text: l.text?.trim() || null,
        })),
      );
      if (e4) throw e4;
      if (isNew && istek) {
        const { error: e5 } = await sb().rpc("fulfill_scene_request", { p_id: istek.id, p_scene: sceneId });
        router.push(e5 ? "/istekler" : "/istekler?karsilandi=1");
        return;
      }
      router.push("/sahneler");
    } catch (e) {
      setError("Kaydedilemedi: " + errMsg(e));
      setSaving(false);
    }
  }

  /** Kapak karesi yoksa / video değiştiyse / elle kare seçildiyse üret ve yükle. Başarısız olursa kaydı engellemez. */
  async function ensureThumb(uid: string): Promise<string | null> {
    if (thumbPath && !videoChanged && thumbAt === null) return thumbPath;
    try {
      const { blob, ext } = await videoThumbnail(videoSrc, thumbAt ?? undefined);
      const path = `${uid}/${sceneId}-thumb-${Date.now()}.${ext}`;
      const { error } = await sb().storage.from("scenes").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
      if (error) throw error;
      if (thumbPath) sb().storage.from("scenes").remove([thumbPath]).catch(() => {});
      setThumbPath(path);
      setVideoChanged(false);
      setThumbAt(null);
      return path;
    } catch {
      return thumbPath;
    }
  }

  function addTag(raw: string) {
    const parts = raw.split(",").map(normTag).filter(Boolean);
    if (!parts.length) return;
    setTags((cur) => [...cur, ...parts.filter((p) => !cur.includes(p))].slice(0, MAX_TAGS));
    setTagDraft("");
  }

  async function removeScene() {
    if (!confirm("Sahne ve bu sahneyle kurulmuş tüm odalar silinecek. Emin misin?")) return;
    const { error } = await sb().from("scenes").delete().eq("id", sceneId);
    if (error) return setError(errMsg(error));
    const paths = [videoPath, bgPath, thumbPath].filter(Boolean) as string[];
    if (paths.length) await sb().storage.from("scenes").remove(paths);
    router.push("/sahneler");
  }

  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const dur = duration || videoRef.current?.duration || 0;
  const activeLines = lines.filter((l) => t >= l.start_time && t <= l.end_time);
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    stopAt.current = null;
    if (v.paused) v.play();
    else v.pause();
  };
  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const v = videoRef.current;
    if (v && dur) v.currentTime = Math.max(0, Math.min(dur, ((e.clientX - rect.left) / rect.width) * dur));
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <PageHeader
        eyebrow="Sahne editörü"
        title={isNew ? "Yeni sahne" : title || "Sahneyi düzenle"}
        description="Klibi yükle, karakterleri ekle, karakter konuşurken K tuşuna basılı tutarak replikleri işaretle."
        actions={
          <>
            {!isNew && (
              <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={removeScene}>
                Sil
              </Button>
            )}
            {compress && (
              <Button size="sm" variant="ghost" onClick={() => compressAbort.current?.abort()}>
                Sıkıştırmayı iptal et
              </Button>
            )}
            <Button variant="primary" icon={<Save className="size-4" />} onClick={save} loading={saving} disabled={!!uploading || !!compress}>
              Kaydet
            </Button>
          </>
        }
      />

      {istek && (
        <div className="mb-5">
          <Notice tone="info">
            Bu sahne <b className="text-fg">“{istek.title}”</b> isteğini karşılayacak. Kaydedince XP hesabına eklenir.
          </Notice>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Notice>{error}</Notice>
        </div>
      )}
      {compressNote && (
        <div className="mb-5">
          <Notice tone="info">{compressNote}</Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* SOL: video + zaman çizelgesi + replikler */}
        <div className="flex min-w-0 flex-col gap-4">
          {!videoSrc ? (
            <label className="panel flex aspect-video cursor-pointer flex-col items-center justify-center gap-3 border-dashed text-center transition-colors hover:border-line-strong hover:bg-surface-2">
              <span className="flex size-11 items-center justify-center rounded-lg border border-line bg-surface-2">
                {uploading === "video" || compress ? <Spinner className="size-5" /> : <Upload className="size-5 text-fg-2" />}
              </span>
              <span>
                <span className="block font-medium">
                  {compress ? `Sıkıştırılıyor %${Math.round(compress.progress * 100)}` : uploading === "video" ? "Yükleniyor" : "Video yükle"}
                </span>
                <span className="mt-1 block text-[13px] text-muted">
                  {compress
                    ? `${fmtMB(compress.size)} · 720p'ye küçültülüyor, sekmeyi açık tut`
                    : "Büyük videolar otomatik olarak 720p'ye sıkıştırılır · 30 sn–2 dk ideal"}
                </span>
              </span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                disabled={!!uploading || !!compress}
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "video")}
              />
              {compress && (
                <span className="mt-1 w-56">
                  <Progress value={compress.progress} />
                </span>
              )}
            </label>
          ) : (
            <div className="panel overflow-hidden">
              <div className="relative bg-black">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  playsInline
                  className="aspect-video w-full"
                  onLoadedMetadata={(e) => setDuration(+e.currentTarget.duration.toFixed(2))}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onClick={togglePlay}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 px-4">
                  {activeLines.map((l) => (
                    <span key={l.id} className="rounded bg-black/80 px-2.5 py-1 text-sm">
                      <span style={{ color: roleById[l.role_id]?.color }}>{roleById[l.role_id]?.name}</span>
                      {l.text ? <span className="text-fg">: {l.text}</span> : null}
                    </span>
                  ))}
                </div>
              </div>

              {/* Oynatma çubuğu */}
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
                <IconButton label={playing ? "Durdur" : "Oynat"} onClick={togglePlay}>
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </IconButton>
                <span className="font-mono text-xs text-fg-2 tabular-nums">
                  {fmtTime(t)} <span className="text-muted">/ {fmtTime(dur)}</span>
                </span>
                <div className="flex-1" />
                {selRole && (
                  <span className="hidden text-xs text-muted sm:inline">
                    İşaretlenecek: <span style={{ color: roleById[selRole]?.color }}>{roleById[selRole]?.name}</span>
                  </span>
                )}
                <button
                  className={btn(holding ? "rec" : "secondary", "sm", "min-w-44 touch-none")}
                  onMouseDown={beginHold}
                  onMouseUp={endHold}
                  onMouseLeave={endHold}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    beginHold();
                  }}
                  onTouchEnd={endHold}
                  disabled={!selRole}
                >
                  <Circle className={cx("size-3", holding ? "rec-dot fill-current" : "text-rec fill-rec")} />
                  {holding ? "Konuşuyor…" : "Basılı tut: işaretle"}
                  <span className="kbd ml-1">K</span>
                </button>
              </div>

              {/* Karakter şeritli zaman çizelgesi */}
              <div className="border-t border-line p-3">
                <div className="flex">
                  <div className="w-24 shrink-0" />
                  <div className="relative h-4 flex-1 cursor-pointer" onClick={seekTo}>
                    {dur > 0 &&
                      Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => i * 5).map((s) => (
                        <span key={s} className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-muted" style={{ left: `${(s / dur) * 100}%` }}>
                          {s % 10 === 0 ? `${s}s` : "·"}
                        </span>
                      ))}
                  </div>
                </div>
                <div className="relative mt-1 flex flex-col gap-1">
                  {(roles.length ? roles : [{ id: "_", name: "—", color: "#555", sort: 0 }]).map((r) => (
                    <div key={r.id} className="flex items-center">
                      <button
                        className={cx(
                          "flex w-24 shrink-0 items-center gap-1.5 truncate pr-2 text-left text-xs transition-colors",
                          selRole === r.id ? "text-fg" : "text-muted hover:text-fg-2",
                        )}
                        onClick={() => r.id !== "_" && setSelRole(r.id)}
                      >
                        <Swatch color={r.color} className="size-2" />
                        <span className="truncate">{r.name}</span>
                      </button>
                      <div
                        className={cx("relative h-6 flex-1 cursor-pointer rounded bg-surface-2", selRole === r.id && "ring-1 ring-line-strong")}
                        onClick={seekTo}
                      >
                        {dur > 0 &&
                          lines
                            .filter((l) => l.role_id === r.id)
                            .map((l) => (
                              <div
                                key={l.id}
                                title={`${fmtTime(l.start_time)}–${fmtTime(l.end_time)}${l.text ? " · " + l.text : ""}`}
                                className="absolute top-1 bottom-1 rounded-sm"
                                style={{
                                  left: `${(l.start_time / dur) * 100}%`,
                                  width: `${Math.max(0.4, ((l.end_time - l.start_time) / dur) * 100)}%`,
                                  background: r.color,
                                  opacity: 0.85,
                                }}
                              />
                            ))}
                        {holding && holdStart.current !== null && dur > 0 && selRole === r.id && (
                          <div
                            className="absolute top-1 bottom-1 rounded-sm bg-rec/70"
                            style={{ left: `${(holdStart.current / dur) * 100}%`, width: `${((t - holdStart.current) / dur) * 100}%` }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  {dur > 0 && (
                    <div
                      className="pointer-events-none absolute -top-1 -bottom-1 w-px bg-fg"
                      style={{ left: `calc(6rem + (100% - 6rem) * ${Math.min(1, t / dur)})` }}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-3 py-2.5 text-[11px] text-muted">
                <span><span className="kbd">Space</span> oynat / durdur</span>
                <span><span className="kbd">1</span>–<span className="kbd">7</span> karakter seç</span>
                <span><span className="kbd">K</span> basılı tut = replik</span>
                <span><span className="kbd">←</span> <span className="kbd">→</span> 1 sn · Shift ile 0.1 sn</span>
              </div>
            </div>
          )}

          {videoSrc && (
            <div className="panel">
              <div className="panel-head">
                <h2 className="text-sm font-medium">Replikler</h2>
                <span className="font-mono text-xs text-muted">{lines.length}</span>
              </div>
              {lines.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  Sağdan bir karakter seç, videoyu oynat ve karakter konuşurken <span className="kbd">K</span> tuşuna basılı tut.
                </p>
              ) : (
                <div className="max-h-[440px] divide-y divide-line overflow-auto">
                  {lines.map((l) => (
                    <div key={l.id} className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[110px_150px_1fr_auto]">
                      <select
                        className="field h-8 px-2 text-[13px]"
                        style={{ color: roleById[l.role_id]?.color }}
                        value={l.role_id}
                        onChange={(e) => updateLine(l.id, { role_id: e.target.value })}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          aria-label="Başlangıç"
                          className="field h-8 w-[68px] px-2 font-mono text-xs"
                          value={l.start_time}
                          onChange={(e) => updateLine(l.id, { start_time: +e.target.value })}
                          onBlur={() => setLines((ls) => sortLines(ls as SceneLine[]))}
                        />
                        <span className="text-muted">–</span>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          aria-label="Bitiş"
                          className="field h-8 w-[68px] px-2 font-mono text-xs"
                          value={l.end_time}
                          onChange={(e) => updateLine(l.id, { end_time: +e.target.value })}
                        />
                      </div>
                      <input
                        placeholder="Replik metni (kayıtta altyazı olur)"
                        className="field col-span-4 h-8 text-[13px] sm:col-span-1"
                        value={l.text ?? ""}
                        onChange={(e) => updateLine(l.id, { text: e.target.value })}
                      />
                      <div className="col-start-4 row-start-1 flex sm:col-start-auto sm:row-start-auto">
                        <IconButton label="Dinle" onClick={() => playSegment(l)}>
                          <Play className="size-3.5" />
                        </IconButton>
                        <IconButton label="Sil" className="hover:text-red-300" onClick={() => removeLine(l.id)}>
                          <X className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SAĞ */}
        <aside className="flex flex-col gap-4">
          <div className="panel flex flex-col gap-3 p-4">
            <div>
              <label className="eyebrow mb-1.5 block" htmlFor="title">
                Sahne adı
              </label>
              <input id="title" className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="eyebrow mb-1.5 block" htmlFor="desc">
                Açıklama
              </label>
              <textarea
                id="desc"
                className="field h-20 resize-none py-2"
                placeholder="Opsiyonel"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="eyebrow mb-1.5 flex justify-between" htmlFor="tag">
                <span>Etiketler</span>
                <span className="normal-case">
                  {tags.length}/{MAX_TAGS}
                </span>
              </label>
              <div className="field flex h-auto min-h-10 flex-wrap items-center gap-1.5 py-1.5">
                {tags.map((t) => (
                  <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-3 pr-1 pl-2 text-xs">
                    #{t}
                    <button type="button" className="rounded p-0.5 text-muted hover:text-fg" aria-label={`${t} etiketini kaldır`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {tags.length < MAX_TAGS && (
                  <input
                    id="tag"
                    className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                    placeholder={tags.length ? "" : "anime, komedi…"}
                    value={tagDraft}
                    maxLength={40}
                    onChange={(e) => (e.target.value.includes(",") ? addTag(e.target.value) : setTagDraft(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(tagDraft);
                      } else if (e.key === "Backspace" && !tagDraft && tags.length) setTags(tags.slice(0, -1));
                    }}
                    onBlur={() => tagDraft && addTag(tagDraft)}
                  />
                )}
              </div>
              {tags.length < MAX_TAGS && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {TAG_SUGGESTIONS.filter((t) => !tags.includes(t))
                    .slice(0, 8)
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addTag(t)}
                        className="h-6 rounded-full border border-line px-2 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-fg"
                      >
                        + {t}
                      </button>
                    ))}
                </div>
              )}
            </div>
            {videoSrc && (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-bg p-2">
                <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-black">
                  {thumbPath && thumbAt === null && !videoChanged ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={publicUrl("scenes", thumbPath)} alt="Kapak" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted">
                      <ImageIcon className="size-4" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">Kapak</p>
                  <p className="text-[11px] leading-snug text-muted">
                    {thumbAt !== null ? `${fmtTime(thumbAt)} karesi kaydedilince kapak olur` : thumbPath && !videoChanged ? "Kart ve paylaşım görselinde görünür" : "Kaydedince otomatik oluşturulur"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" type="button" onClick={() => setThumbAt(videoRef.current?.currentTime ?? 0)} title="Videoda şu anki kareyi kapak yap">
                  Bu kare
                </Button>
              </div>
            )}
            {videoSrc && (
              <label className={btn("secondary", "sm", "cursor-pointer")}>
                {uploading === "video" || compress ? <Spinner /> : <Upload className="size-3.5" />}
                {compress ? `Sıkıştırılıyor %${Math.round(compress.progress * 100)}` : "Videoyu değiştir"}
                <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "video")} />
              </label>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="text-sm font-medium">Karakterler</h2>
              <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={addRole} disabled={roles.length >= MAX_ROLES}>
                Ekle
              </Button>
            </div>
            <div className="flex flex-col gap-1 p-2">
              {roles.length === 0 && <p className="px-2 py-3 text-sm text-muted">1–7 karakter ekle.</p>}
              {roles.map((r, i) => (
                <div
                  key={r.id}
                  className={cx(
                    "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                    selRole === r.id ? "border-line-strong bg-surface-2" : "border-transparent hover:bg-surface-2/60",
                  )}
                  onClick={() => setSelRole(r.id)}
                >
                  <span className="kbd">{i + 1}</span>
                  <label className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded-full" style={{ background: r.color }} title="Renk">
                    <input
                      type="color"
                      value={r.color}
                      onChange={(e) => updateRole(r.id, { color: e.target.value })}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    value={r.name}
                    maxLength={60}
                    onChange={(e) => updateRole(r.id, { name: e.target.value })}
                  />
                  <span className="font-mono text-[11px] text-muted">{lines.filter((l) => l.role_id === r.id).length}</span>
                  <IconButton
                    label="Karakteri sil"
                    className="size-6 hover:text-red-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRole(r.id);
                    }}
                  >
                    <X className="size-3.5" />
                  </IconButton>
                </div>
              ))}
            </div>
          </div>

          <div className="panel flex flex-col gap-4 p-4">
            <h2 className="text-sm font-medium">Finaldeki arka plan sesi</h2>
            <div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-fg-2">Orijinal video sesi</span>
                <span className="font-mono text-xs text-muted">{Math.round(origVol * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={origVol}
                onChange={(e) => setOrigVol(+e.target.value)}
                className="mt-2 w-full"
              />
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Klipte orijinal konuşmalar varsa 0 bırak. Video zaten konuşmasızsa açabilirsin.
              </p>
            </div>
            <div className="border-t border-line pt-4">
              <p className="text-[13px] text-fg-2">Ayrı müzik / efekt dosyası</p>
              <div className="mt-2 flex items-center gap-2">
                <label className={btn("secondary", "sm", "cursor-pointer")}>
                  {uploading === "bg" ? <Spinner /> : <Music className="size-3.5" />}
                  {bgPath ? "Değiştir" : "Ses yükle"}
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "bg")} />
                </label>
                {bgPath && (
                  <IconButton label="Kaldır" onClick={() => setBgPath(null)}>
                    <X className="size-4" />
                  </IconButton>
                )}
              </div>
              {bgPath && <audio controls src={publicUrl("scenes", bgPath)} className="mt-2 h-8 w-full" />}
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Ücretsiz bir vokal ayırıcıyla (ör. Ultimate Vocal Remover) konuşmaları silip sadece müzik ve efekti yükleyebilirsin.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
