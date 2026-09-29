"use client";

import { Clapperboard, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ButtonLink, Notice, PageHeader, RoleTag, Spinner } from "@/components/ui";
import { ensureUser, errMsg, publicUrl, sb } from "@/lib/supabase";
import { getNick } from "@/lib/nickname";
import { fmtTime, type SceneFull } from "@/lib/types";

export default function Sahneler() {
  const router = useRouter();
  const [scenes, setScenes] = useState<SceneFull[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await ensureUser();
        setMe(u.id);
        const { data, error } = await sb()
          .from("scenes")
          .select("*, scene_roles(*), scene_lines(id, role_id, start_time, end_time)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setScenes(data as SceneFull[]);
      } catch (e) {
        setError(errMsg(e));
        setScenes([]);
      }
    })();
  }, []);

  async function createRoom(sceneId: string) {
    const nick = getNick().trim();
    if (!nick) {
      setError("Önce sağ üstten bir takma ad belirle.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(sceneId);
    setError(null);
    try {
      const { data, error } = await sb().rpc("create_room", { p_scene: sceneId, p_nickname: nick });
      if (error) throw error;
      router.push(`/oda/${data}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(null);
    }
  }

  const filtered = (scenes ?? []).filter((s) => s.title.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <PageHeader
        eyebrow="Kütüphane"
        title="Sahneler"
        description="Arkadaşlarının yüklediği tüm sahneler. Birini seç, oda kur, kodu paylaş."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input className="field w-56 pl-9" placeholder="Sahne ara" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ButtonLink href="/sahneler/yeni" variant="primary" icon={<Plus className="size-4" />}>
              Sahne yükle
            </ButtonLink>
          </>
        }
      />

      {error && (
        <div className="mb-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {scenes === null ? (
        <div className="flex items-center gap-2 py-20 text-sm text-muted">
          <Spinner /> Sahneler yükleniyor
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2">
            <Clapperboard className="size-5 text-muted" />
          </span>
          <div>
            <p className="font-medium">{q ? "Sonuç yok" : "Henüz sahne yok"}</p>
            <p className="mt-1 text-sm text-muted">
              {q ? "Farklı bir arama dene." : "Kısa bir klip yükle, karakterleri ve replikleri işaretle."}
            </p>
          </div>
          {!q && (
            <ButtonLink href="/sahneler/yeni" variant="primary" size="sm" icon={<Plus className="size-4" />}>
              İlk sahneyi yükle
            </ButtonLink>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const roles = [...s.scene_roles].sort((a, b) => a.sort - b.sort);
            return (
              <article key={s.id} className="panel group flex flex-col overflow-hidden transition-colors hover:border-line-strong">
                <div className="relative aspect-video bg-black">
                  <video
                    src={publicUrl("scenes", s.video_path) + "#t=1"}
                    preload="metadata"
                    muted
                    playsInline
                    className="size-full object-cover"
                    onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                  {s.duration ? (
                    <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
                      {fmtTime(s.duration).replace(/\.\d$/, "")}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h3 className="font-medium leading-snug">{s.title}</h3>
                    {s.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{s.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((r) => (
                      <RoleTag key={r.id} name={r.name} color={r.color} />
                    ))}
                  </div>
                  <p className="font-mono text-[11px] text-muted">
                    {s.scene_roles.length} karakter · {s.scene_lines.length} replik
                  </p>
                  <div className="mt-auto flex gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      loading={busy === s.id}
                      disabled={!!busy || s.scene_lines.length === 0}
                      onClick={() => createRoom(s.id)}
                    >
                      Oda kur
                    </Button>
                    {me === s.created_by && (
                      <Link
                        href={`/sahneler/${s.id}`}
                        className="inline-flex size-8 items-center justify-center rounded-md border border-line-strong bg-surface-2 text-fg-2 transition-colors hover:text-fg"
                        aria-label="Düzenle"
                        title="Düzenle"
                      >
                        <Pencil className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
