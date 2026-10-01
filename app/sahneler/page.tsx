"use client";

import { Clapperboard, Flame, Pencil, Play, Plus, Search, SearchX, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CreatorTag, SceneThumb } from "@/components/SceneBits";
import { Button, ButtonLink, cx, EmptyState, Notice, PageHeader, RoleTag, Skeleton } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { ensureUser, errMsg, sb } from "@/lib/supabase";
import { fmtTime, type SceneListItem } from "@/lib/types";

const SORTS = [
  { id: "trend", label: "Trend", icon: <Flame className="size-3.5" /> },
  { id: "yeni", label: "Yeni" },
  { id: "populer", label: "En çok oynanan" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

const ROLE_FILTERS = [
  { id: null, label: "Tümü" },
  { id: 1, label: "Tek kişilik" },
  { id: 2, label: "2 kişilik" },
  { id: 3, label: "3 kişilik" },
  { id: 4, label: "4+" },
] as const;

export default function Sahneler() {
  const router = useRouter();
  const me = useMe();
  const [scenes, setScenes] = useState<SceneListItem[] | null>(null);
  const [tags, setTags] = useState<{ tag: string; n: number }[]>([]);
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("trend");
  const [roles, setRoles] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ?etiket=anime ile gelinirse
  useEffect(() => {
    const t = new URLSearchParams(location.search).get("etiket");
    if (t) setTag(t.toLocaleLowerCase("tr"));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebQ(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    sb()
      .rpc("popular_tags", { p_limit: 14 })
      .then(({ data }) => setTags((data as { tag: string; n: number }[]) ?? []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setScenes(null);
    (async () => {
      try {
        const { data, error } = await sb().rpc("list_scenes", {
          p_q: debQ || null,
          p_tag: tag,
          p_sort: sort,
          p_roles: roles === 4 ? null : roles,
          p_limit: 120,
        });
        if (error) throw error;
        let list = (data as SceneListItem[]) ?? [];
        if (roles === 4) list = list.filter((s) => s.role_count >= 4);
        if (!cancelled) setScenes(list);
      } catch (e) {
        if (!cancelled) {
          setError(errMsg(e));
          setScenes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debQ, tag, sort, roles]);

  async function createRoom(sceneId: string) {
    await ensureUser();
    setBusy(sceneId);
    setError(null);
    try {
      const { data, error } = await sb().rpc("create_room", { p_scene: sceneId, p_nickname: "" });
      if (error) throw error;
      router.push(`/oda/${data}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(null);
    }
  }

  const myId = me.status === "in" ? me.user.id : null;
  const filtering = !!debQ || !!tag || roles !== null;
  const tagChips = useMemo(() => {
    const list = tags.map((t) => t.tag);
    if (tag && !list.includes(tag)) list.unshift(tag);
    return list;
  }, [tags, tag]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <PageHeader
        eyebrow="Kütüphane"
        title="Sahneler"
        description="Arkadaşlarının eklediği sahneler. Birini seç, oda kur, kodu paylaş."
        actions={
          <ButtonLink href="/sahneler/yeni" variant="primary" icon={<Plus className="size-4" />}>
            Sahne ekle
          </ButtonLink>
        }
      />

      {/* Arama ve filtreler */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              className="field pl-9"
              placeholder="Sahne, açıklama ya da etiket ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Sahne ara"
            />
            {q && (
              <button className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg" onClick={() => setQ("")} aria-label="Aramayı temizle">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Sıralama">
            {SORTS.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={sort === s.id}
                onClick={() => setSort(s.id)}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors",
                  sort === s.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {"icon" in s && s.icon}
                {s.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <Users className="size-3.5" />
            <select
              className="field h-9 w-auto pr-8 text-[13px]"
              value={roles ?? ""}
              onChange={(e) => setRoles(e.target.value ? Number(e.target.value) : null)}
              aria-label="Karakter sayısı"
            >
              {ROLE_FILTERS.map((r) => (
                <option key={String(r.id)} value={r.id ?? ""}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {tagChips.length > 0 && (
          <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
            {tagChips.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
                className={cx(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs transition-colors",
                  tag === t ? "border-accent/50 bg-accent/10 text-accent" : "border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                #{t}
                {tag === t && <X className="size-3" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {scenes === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      ) : scenes.length === 0 ? (
        filtering ? (
          <EmptyState
            icon={<SearchX className="size-5" />}
            title="Bu filtreye uyan sahne yok"
            action={
              <Button
                size="sm"
                onClick={() => {
                  setQ("");
                  setTag(null);
                  setRoles(null);
                }}
              >
                Filtreleri temizle
              </Button>
            }
          >
            Farklı bir arama dene ya da bu sahneyi kütüphaneye ilk sen ekle.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<Clapperboard className="size-5" />}
            title="Kütüphane boş"
            action={
              <ButtonLink href="/sahneler/yeni" variant="primary" size="sm" icon={<Plus className="size-4" />}>
                İlk sahneyi ekle
              </ButtonLink>
            }
          >
            Kısa bir klip yükle, karakterleri ve replikleri işaretle. Sahnen her seslendirildiğinde yapımcı XP&apos;si kazanırsın.
          </EmptyState>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((s, i) => (
            <SceneCard
              key={s.id}
              s={s}
              rank={sort === "trend" && !filtering && i < 3 && s.week_dubs > 0 ? i + 1 : null}
              mine={myId === s.created_by}
              busy={busy}
              onTag={setTag}
              onCreate={() => createRoom(s.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function SceneCard({
  s,
  rank,
  mine,
  busy,
  onTag,
  onCreate,
}: {
  s: SceneListItem;
  rank: number | null;
  mine: boolean;
  busy: string | null;
  onTag: (t: string) => void;
  onCreate: () => void;
}) {
  const draft = s.line_count === 0;
  return (
    <article className="panel group flex flex-col overflow-hidden transition-colors hover:border-line-strong">
      <SceneThumb videoPath={s.video_path} thumbPath={s.thumb_path}>
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          {rank ? (
            <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-fg">
              <Flame className="size-3" /> #{rank} trend
            </span>
          ) : (
            <span />
          )}
          {draft && <span className="rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-amber-200">Taslak</span>}
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          {s.dub_count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
              <Play className="size-3 fill-current" /> {s.dub_count}
            </span>
          ) : (
            <span className="rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-fg-2">Henüz oynanmadı</span>
          )}
          {s.duration ? (
            <span className="rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{fmtTime(s.duration).replace(/\.\d$/, "")}</span>
          ) : null}
        </div>
      </SceneThumb>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-medium leading-snug">{s.title}</h3>
          {s.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{s.description}</p>}
          <CreatorTag creator={s.creator} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.roles.map((r) => (
            <RoleTag key={r.id} name={r.name} color={r.color} />
          ))}
        </div>
        {s.tags.length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {s.tags.map((t) => (
              <button key={t} onClick={() => onTag(t)} className="text-xs text-muted transition-colors hover:text-accent">
                #{t}
              </button>
            ))}
          </div>
        )}
        <p className="font-mono text-[11px] text-muted">
          {s.role_count} karakter · {s.line_count} replik
          {s.week_dubs > 0 && <span className="text-accent"> · bu hafta {s.week_dubs} kez</span>}
        </p>
        <div className="mt-auto flex gap-2 pt-1">
          <Button variant="primary" size="sm" className="flex-1" loading={busy === s.id} disabled={!!busy || draft} onClick={onCreate}>
            Oda kur
          </Button>
          {mine && (
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
}

function SceneCardSkeleton() {
  return (
    <div className="panel flex flex-col overflow-hidden">
      <Skeleton className="aspect-video rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="mt-2 h-8 w-full" />
      </div>
    </div>
  );
}
