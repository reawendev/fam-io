"use client";

import { Check, Download, Heart, Link2, MessageCircle, Play, RotateCcw, Send, Share2, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, ButtonLink, cx, IconButton, Notice, Progress, Spinner } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { downloadBlob, exportDub, exportSupported, slugify } from "@/lib/exporter";
import { DubPlayer, recItem, unlockAudio, type DubItem } from "@/lib/player";
import { timeAgo } from "@/lib/progress";
import { isEffect } from "@/lib/effects";
import VotePanel from "@/components/VotePanel";
import { errMsg, publicUrl, sb } from "@/lib/supabase";
import { sortLines, type DubComment, type ProfileLite, type SceneFull } from "@/lib/types";

type Full = {
  id: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  scenes: SceneFull | null;
  dub_cast: { role_id: string; user_id: string; profiles: ProfileLite | null }[];
  dub_recordings: { line_id: string; user_id: string; audio_path: string; offset_time: number; effect?: string }[];
  dub_participants: { user_id: string; lines: number; profiles: ProfileLite | null }[];
};

const SELECT =
  "id, created_at, like_count, comment_count, scenes(*, scene_roles(*), scene_lines(*)), dub_cast(role_id, user_id, profiles(username, display_name, color)), dub_recordings(line_id, user_id, audio_path, offset_time, effect), dub_participants(user_id, lines, profiles(username, display_name, color))";

type ExportState =
  | { kind: "idle" }
  | { kind: "working"; phase: "loading" | "rendering" | "finishing"; progress: number }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function DubView({ id }: { id: string }) {
  const me = useMe();
  const path = usePathname();
  const [dub, setDub] = useState<Full | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<DubPlayer | null>(null);
  const itemsRef = useRef<DubItem[]>([]);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [pos, setPos] = useState(0);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState<DubComment[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exp, setExp] = useState<ExportState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const scene = dub?.scenes ?? null;
  const roles = useMemo(() => (scene ? [...scene.scene_roles].sort((a, b) => a.sort - b.sort) : []), [scene]);
  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const lines = useMemo(() => (scene ? sortLines(scene.scene_lines) : []), [scene]);
  const castByRole = useMemo(() => Object.fromEntries((dub?.dub_cast ?? []).map((c) => [c.role_id, c])), [dub]);
  const recorded = useMemo(() => new Set((dub?.dub_recordings ?? []).map((r) => r.line_id)), [dub]);

  const loadComments = useCallback(async () => {
    const { data } = await sb()
      .from("dub_comments")
      .select("*, profiles(username, display_name, color)")
      .eq("dub_id", id)
      .order("created_at", { ascending: true });
    setComments((data as DubComment[]) ?? []);
  }, [id]);

  const loadLikes = useCallback(async () => {
    const { data } = await sb().from("dubs").select("like_count").eq("id", id).maybeSingle();
    if (data) setLikeCount(data.like_count);
  }, [id]);

  // Dublajı yükle
  useEffect(() => {
    (async () => {
      const { data, error } = await sb().from("dubs").select(SELECT).eq("id", id).maybeSingle();
      if (error) setError(errMsg(error));
      setDub((data as unknown as Full) ?? null);
      if (data) setLikeCount((data as unknown as Full).like_count);
    })();
    loadComments();
  }, [id, loadComments]);

  // Beğenmiş miyim?
  useEffect(() => {
    if (me.status !== "in") return setLiked(false);
    sb()
      .from("dub_likes")
      .select("user_id")
      .eq("dub_id", id)
      .eq("user_id", me.user.id)
      .maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [id, me]);

  // Canlı yorum / beğeni
  useEffect(() => {
    const ch = sb()
      .channel(`dub:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dub_comments", filter: `dub_id=eq.${id}` }, () => loadComments())
      .on("postgres_changes", { event: "*", schema: "public", table: "dub_likes", filter: `dub_id=eq.${id}` }, () => loadLikes())
      .subscribe();
    return () => {
      sb().removeChannel(ch);
    };
  }, [id, loadComments, loadLikes]);

  // Oynatıcıyı hazırla
  useEffect(() => {
    if (!dub?.scenes || !videoRef.current) return;
    const lineById = Object.fromEntries(dub.scenes.scene_lines.map((l) => [l.id, l]));
    const items = dub.dub_recordings
      .filter((r) => lineById[r.line_id])
      .map((r) => recItem(publicUrl("recordings", r.audio_path), r.offset_time, lineById[r.line_id], r.line_id, isEffect(r.effect) ? r.effect : undefined));
    itemsRef.current = items;
    const p = new DubPlayer(videoRef.current, { originalVolume: dub.scenes.original_volume });
    playerRef.current = p;
    p.onTick = setPos;
    p.onEnd = () => setPlaying(false);
    p.load(items, dub.scenes.bg_audio_path ? publicUrl("scenes", dub.scenes.bg_audio_path) : null)
      .then(() => setReady(true))
      .catch((e) => setError(errMsg(e)));
    return () => p.destroy();
  }, [dub]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function play() {
    await unlockAudio(videoRef.current);
    setStarted(true);
    setPlaying(true);
    playerRef.current?.play(0, 0.15);
  }
  function stop() {
    playerRef.current?.stop();
    setPlaying(false);
  }

  async function toggleLike() {
    if (me.status !== "in") return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    const q = next
      ? sb().from("dub_likes").insert({ dub_id: id })
      : sb().from("dub_likes").delete().eq("dub_id", id).eq("user_id", me.user.id);
    const { error } = await q;
    if (error) {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      setError(errMsg(error));
    }
  }

  async function share() {
    const url = `${location.origin}/d/${id}`;
    const title = scene ? `${scene.title} — fam-io dublajı` : "fam-io dublajı";
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    const { error } = await sb().from("dub_comments").insert({ dub_id: id, body: draft.trim() });
    setPosting(false);
    if (error) return setError(errMsg(error));
    setDraft("");
    loadComments();
  }

  async function removeComment(cid: string) {
    const { error } = await sb().from("dub_comments").delete().eq("id", cid);
    if (error) return setError(errMsg(error));
    setComments((cs) => cs.filter((c) => c.id !== cid));
  }

  async function download() {
    if (!scene) return;
    if (!exportSupported()) return setExp({ kind: "error", message: "Bu tarayıcı video dışa aktarmayı desteklemiyor. Bilgisayarda Chrome ya da Edge dene." });
    const ac = new AbortController();
    abortRef.current = ac;
    setExp({ kind: "working", phase: "loading", progress: 0 });
    try {
      const res = await exportDub({
        videoUrl: publicUrl("scenes", scene.video_path),
        items: itemsRef.current,
        bgUrl: scene.bg_audio_path ? publicUrl("scenes", scene.bg_audio_path) : null,
        originalVolume: scene.original_volume,
        signal: ac.signal,
        onPhase: (phase) => setExp((s) => ({ kind: "working", phase, progress: s.kind === "working" ? s.progress : 0 })),
        onProgress: (f) => setExp((s) => (s.kind === "working" ? { ...s, progress: f } : s)),
      });
      downloadBlob(res.blob, `${slugify(scene.title)}-fam-io.${res.ext}`);
      setExp({ kind: "done" });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") setExp({ kind: "idle" });
      else setExp({ kind: "error", message: "Video üretilemedi: " + errMsg(e) });
    }
  }

  if (dub === undefined)
    return (
      <main className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-20 text-sm text-muted sm:px-6">
        <Spinner /> Dublaj yükleniyor
      </main>
    );
  if (dub === null || !scene)
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
        <Notice>{error ?? "Bu dublaj bulunamadı ya da sahnesi silinmiş."}</Notice>
        <ButtonLink href="/" size="sm" className="self-start">
          Ana sayfa
        </ButtonLink>
      </main>
    );

  const dur = playerRef.current?.duration || scene.duration || 0;
  const active = lines.filter((l) => pos >= l.start_time && pos <= l.end_time);
  const people = dub.dub_participants.filter((p) => p.profiles);
  const loginHref = `/hesap?next=${encodeURIComponent(path)}`;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
            {playing && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 px-4">
                {active.map((l) => {
                  const r = roleById[l.role_id];
                  const who = castByRole[l.role_id]?.profiles?.display_name;
                  return (
                    <span key={l.id} className="inline-flex items-center gap-1.5 rounded bg-black/80 px-2.5 py-1 text-[13px]">
                      <span className="size-1.5 rounded-full" style={{ background: r?.color }} />
                      {who && <span className="font-medium">{who}</span>}
                      <span className="text-fg-2">{r?.name}</span>
                      {!recorded.has(l.id) && <span className="text-muted">· kayıt yok</span>}
                    </span>
                  );
                })}
              </div>
            )}
            {!playing && (
              <button
                onClick={play}
                disabled={!ready}
                className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 transition-colors hover:bg-black/45"
                aria-label={started ? "Tekrar oynat" : "Oynat"}
              >
                <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg shadow-black/40 transition-transform group-hover:scale-105">
                  {!ready ? <Spinner className="size-6 text-accent-fg" /> : started ? <RotateCcw className="size-6" /> : <Play className="ml-1 size-7 fill-current" />}
                </span>
                <span className="text-sm font-medium">{!ready ? "Sesler yükleniyor" : started ? "Tekrar izle" : "Dublajı izle"}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 border-t border-line px-3 py-2.5">
            <IconButton label={playing ? "Durdur" : "Oynat"} onClick={playing ? stop : play} disabled={!ready}>
              {playing ? <Square className="size-4" /> : <Play className="size-4" />}
            </IconButton>
            <Progress value={dur ? pos / dur : 0} tone="fg" />
          </div>
        </div>

        {/* Başlık + aksiyonlar */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{scene.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {people.map((p) => p.profiles!.display_name).join(", ")} · {timeAgo(dub.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {me.status === "in" ? (
              <Button
                variant={liked ? "primary" : "secondary"}
                icon={<Heart className={cx("size-4", liked && "fill-current")} />}
                onClick={toggleLike}
                aria-pressed={liked}
              >
                {likeCount}
              </Button>
            ) : (
              <ButtonLink href={loginHref} icon={<Heart className="size-4" />}>
                {likeCount}
              </ButtonLink>
            )}
            <Button icon={copied ? <Check className="size-4 text-ok" /> : <Share2 className="size-4" />} onClick={share}>
              {copied ? "Link kopyalandı" : "Paylaş"}
            </Button>
            {exp.kind === "working" ? (
              <Button icon={<Square className="size-4" />} onClick={() => abortRef.current?.abort()}>
                {exp.phase === "rendering" ? `%${Math.round(exp.progress * 100)}` : "Hazırlanıyor"}
              </Button>
            ) : (
              <Button icon={<Download className="size-4" />} onClick={download} disabled={!ready}>
                İndir
              </Button>
            )}
          </div>
        </div>
        {exp.kind === "working" && (
          <p className="text-xs text-muted">Video tarayıcında gerçek zamanlı üretiliyor (klip süresi kadar). Bu sekmeyi açık tut.</p>
        )}
        {exp.kind === "error" && <Notice>{exp.message}</Notice>}
        {error && <Notice>{error}</Notice>}

        {/* Yorumlar */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="size-4 text-muted" /> Yorumlar
            </h2>
            <span className="font-mono text-xs text-muted">{comments.length}</span>
          </div>
          {comments.length > 0 && (
            <ul className="divide-y divide-line">
              {comments.map((c) => (
                <li key={c.id} className="group flex gap-3 px-4 py-3">
                  {c.profiles ? (
                    <Link href={`/u/${c.profiles.username}`}>
                      <Avatar name={c.profiles.display_name} color={c.profiles.color} size={28} />
                    </Link>
                  ) : (
                    <Avatar name="?" size={28} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">
                      {c.profiles && (
                        <Link href={`/u/${c.profiles.username}`} className="font-medium hover:underline">
                          {c.profiles.display_name}
                        </Link>
                      )}
                      <span className="ml-2 text-xs text-muted">{timeAgo(c.created_at)}</span>
                    </p>
                    <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-fg-2">{c.body}</p>
                  </div>
                  {me.status === "in" && me.user.id === c.user_id && (
                    <IconButton label="Yorumu sil" className="size-7 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => removeComment(c.id)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {me.status === "in" ? (
            <form onSubmit={post} className="flex items-end gap-2 border-t border-line p-3">
              <Avatar name={me.profile.display_name} color={me.profile.color} size={28} />
              <textarea
                className="field min-h-10 flex-1 resize-none py-2"
                rows={1}
                maxLength={500}
                placeholder="Yorum yaz"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    (e.currentTarget.form as HTMLFormElement).requestSubmit();
                  }
                }}
              />
              <Button variant="primary" loading={posting} disabled={!draft.trim()} icon={<Send className="size-4" />} aria-label="Gönder" />
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
              Yorum yapmak ve beğenmek için giriş yap.
              <ButtonLink href={loginHref} size="sm">
                Giriş yap
              </ButtonLink>
            </div>
          )}
        </section>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-medium">Seslendirenler</h2>
          </div>
          <ul className="flex flex-col gap-1 p-2">
            {roles.map((r) => {
              const c = castByRole[r.id];
              return (
                <li key={r.id}>
                  {c?.profiles ? (
                    <Link href={`/u/${c.profiles.username}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
                      <Avatar name={c.profiles.display_name} color={c.profiles.color} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{c.profiles.display_name}</span>
                        <span className="block text-xs" style={{ color: r.color }}>
                          {r.name}
                        </span>
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-2 py-2 text-sm text-muted">
                      <span className="size-7 rounded-full border border-dashed border-line-strong" />
                      <span style={{ color: r.color }}>{r.name}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <VotePanel dubId={id} scene={scene} me={me.status === "in" ? me.user.id : null} />
        <div className="panel flex flex-col gap-2 p-4 text-sm">
          <p className="text-muted">Bu sahneyi sen de seslendir.</p>
          <ButtonLink href="/sahneler" variant="primary" size="sm" icon={<Link2 className="size-3.5" />}>
            Oda kur
          </ButtonLink>
        </div>
      </aside>
    </main>
  );
}
