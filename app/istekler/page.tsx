"use client";

import { ArrowBigUp, Check, Clapperboard, Inbox, Play, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SceneThumb } from "@/components/SceneBits";
import { Avatar, Button, ButtonLink, cx, EmptyState, IconButton, Modal, Notice, PageHeader, Skeleton } from "@/components/ui";
import { useIsAdmin } from "@/lib/admin";
import { useMe } from "@/lib/auth";
import { timeAgo } from "@/lib/progress";
import { ensureUser, errMsg, sb } from "@/lib/supabase";
import type { ProfileLite } from "@/lib/types";

type Req = {
  id: string;
  user_id: string;
  title: string;
  note: string | null;
  status: "acik" | "eklendi";
  scene_id: string | null;
  vote_count: number;
  created_at: string;
  fulfilled_at: string | null;
  requester: ProfileLite | null;
  fulfiller: ProfileLite | null;
  scene: { id: string; title: string; video_path: string; thumb_path: string | null } | null;
};
const SELECT =
  "*, requester:profiles!scene_requests_user_id_fkey(username, display_name, color, avatar_path), fulfiller:profiles!scene_requests_fulfilled_by_fkey(username, display_name, color, avatar_path), scene:scenes(id, title, video_path, thumb_path)";

/** Sahne istek panosu: istek bırak, oyla, eklediğin sahneyle karşıla */
export default function Istekler() {
  const me = useMe();
  const router = useRouter();
  const admin = useIsAdmin();
  const uid = me.status === "in" ? me.user.id : null;
  const [tab, setTab] = useState<"acik" | "eklendi">("acik");
  const [rows, setRows] = useState<Req[] | null>(null);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", note: "" });
  const [fulfill, setFulfill] = useState<Req | null>(null);

  const load = useCallback(async () => {
    const q = sb().from("scene_requests").select(SELECT).eq("status", tab);
    const { data, error } = await (tab === "acik"
      ? q.order("vote_count", { ascending: false }).order("created_at", { ascending: false })
      : q.order("fulfilled_at", { ascending: false })
    ).limit(100);
    if (error) setError(errMsg(error));
    setRows((data as unknown as Req[]) ?? []);
    if (uid) {
      const { data: v } = await sb().from("scene_request_votes").select("request_id").eq("user_id", uid);
      setVoted(new Set(((v as { request_id: string }[]) ?? []).map((x) => x.request_id)));
    }
  }, [tab, uid]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("karsilandi")) setNotice("Sahnen isteği karşıladı. XP hesabına eklendi!");
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    const { error } = await sb().rpc("create_scene_request", { p_title: form.title.trim(), p_note: form.note.trim() || null });
    setBusy(null);
    if (error) return setError(/scene_requests_title_check/.test(error.message) ? "Başlık 3–80 karakter olmalı." : errMsg(error));
    setForm({ title: "", note: "" });
    setTab("acik");
    load();
  }

  async function vote(r: Req) {
    if (!uid) return router.push("/hesap?next=/istekler");
    setBusy("v" + r.id);
    const { data, error } = await sb().rpc("vote_scene_request", { p_id: r.id });
    setBusy(null);
    if (error) return setError(errMsg(error));
    const on = data as boolean;
    setVoted((s) => {
      const n = new Set(s);
      if (on) n.add(r.id);
      else n.delete(r.id);
      return n;
    });
    setRows((list) => (list ?? []).map((x) => (x.id === r.id ? { ...x, vote_count: x.vote_count + (on ? 1 : -1) } : x)));
  }

  async function remove(r: Req) {
    if (!confirm(`"${r.title}" isteği silinsin mi?`)) return;
    setBusy("d" + r.id);
    const { error } = await sb().rpc("delete_scene_request", { p_id: r.id });
    setBusy(null);
    if (error) return setError(errMsg(error));
    load();
  }

  async function play(sceneId: string) {
    await ensureUser();
    setBusy("p" + sceneId);
    const { data, error } = await sb().rpc("create_room", { p_scene: sceneId, p_nickname: "" });
    if (error) {
      setBusy(null);
      return setError(errMsg(error));
    }
    router.push(`/oda/${data}`);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <PageHeader
        eyebrow="Kütüphane"
        title="Sahne istekleri"
        description="Görmek istediğin sahneyi yaz, beğendiğin isteklere oy ver. İsteği kendi eklediği sahneyle karşılayan +20 XP ve oy başına +2 XP alır."
        actions={
          <ButtonLink href="/sahneler" size="sm" variant="ghost" icon={<Clapperboard className="size-4" />}>
            Sahneler
          </ButtonLink>
        }
      />

      {notice && (
        <div className="mb-6">
          <Notice tone="info">{notice}</Notice>
        </div>
      )}
      {error && (
        <div className="mb-6">
          <Notice>{error}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="mb-4 flex rounded-lg border border-line bg-surface p-0.5" role="tablist">
            {(["acik", "eklendi"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx("h-8 flex-1 rounded-md px-3 text-[13px] transition-colors", tab === t ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
              >
                {t === "acik" ? "Bekleyenler" : "Eklenenler"}
              </button>
            ))}
          </div>

          {rows === null ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={<Inbox className="size-5" />} title={tab === "acik" ? "Bekleyen istek yok" : "Henüz karşılanan istek yok"}>
              {tab === "acik" ? "İlk isteği sen bırak; arkadaşların oylasın." : "Bir isteği karşılayan ilk yapımcı sen ol."}
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => {
                const mine = r.user_id === uid;
                const on = voted.has(r.id);
                return (
                  <li key={r.id} className="panel flex gap-3 p-3 sm:p-4">
                    {r.status === "acik" ? (
                      <button
                        onClick={() => vote(r)}
                        disabled={busy === "v" + r.id}
                        aria-pressed={on}
                        aria-label={on ? "Oyu geri al" : "Oy ver"}
                        className={cx(
                          "flex w-12 shrink-0 flex-col items-center justify-center rounded-lg border py-1.5 transition-colors",
                          on ? "border-accent bg-accent/10 text-accent" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                        )}
                      >
                        <ArrowBigUp className={cx("size-5", on && "fill-current")} />
                        <span className="font-mono text-sm font-semibold">{r.vote_count}</span>
                      </button>
                    ) : r.scene ? (
                      <div className="w-28 shrink-0 overflow-hidden rounded-lg sm:w-36">
                        <SceneThumb videoPath={r.scene.video_path} thumbPath={r.scene.thumb_path} preview={false} />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.title}</p>
                      {r.note && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{r.note}</p>}
                      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                        {r.requester && (
                          <Link href={`/u/${r.requester.username}`} className="inline-flex items-center gap-1.5 hover:text-fg">
                            <Avatar name={r.requester.display_name} color={r.requester.color} path={r.requester.avatar_path} size={16} />
                            {r.requester.display_name}
                          </Link>
                        )}
                        <span>· {timeAgo(r.created_at)}</span>
                        {r.status === "eklendi" && r.fulfiller && (
                          <span className="inline-flex items-center gap-1 text-ok">
                            <Check className="size-3.5" /> {r.fulfiller.display_name} ekledi
                          </span>
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.status === "acik" && uid && (
                          <>
                            <ButtonLink href={`/sahneler/yeni?istek=${r.id}`} size="sm" icon={<Upload className="size-3.5" />}>
                              Ben ekleyeyim
                            </ButtonLink>
                            <Button size="sm" variant="ghost" onClick={() => setFulfill(r)}>
                              Eklediğim sahneyle karşıla
                            </Button>
                          </>
                        )}
                        {r.status === "eklendi" && r.scene && (
                          <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} loading={busy === "p" + r.scene.id} onClick={() => play(r.scene!.id)}>
                            Bu sahneyle oda kur
                          </Button>
                        )}
                      </div>
                    </div>
                    {((mine && r.status === "acik") || admin) && (
                      <IconButton label="İsteği sil" className="size-8 shrink-0 hover:text-red-300" disabled={busy === "d" + r.id} onClick={() => remove(r)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          {me.status === "in" ? (
            <form onSubmit={create} className="panel flex flex-col gap-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <Plus className="size-4 text-muted" /> Sahne iste
              </h2>
              <input
                className="field"
                placeholder="Hangi sahne? (film, dizi, an…)"
                maxLength={80}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <textarea
                className="field h-20 resize-none py-2"
                placeholder="Not (isteğe bağlı): hangi dakika, kaç karakter, link…"
                maxLength={300}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
              <Button variant="primary" loading={busy === "create"} disabled={form.title.trim().length < 3}>
                İsteği bırak
              </Button>
              <p className="text-[11px] text-muted">Aynı anda en fazla 5 açık isteğin olabilir.</p>
            </form>
          ) : (
            <div className="panel flex flex-col gap-3 p-4 text-sm">
              <p className="text-muted">İstek bırakmak ve oy vermek için giriş yap.</p>
              <ButtonLink href="/hesap?next=/istekler" variant="primary" size="sm">
                Giriş yap
              </ButtonLink>
            </div>
          )}
          <div className="panel p-4 text-xs leading-relaxed text-muted">
            İstek karşılandığında isteyen +5 XP alır. Sadece kendi eklediğin, replikleri işaretlenmiş bir sahneyle karşılayabilirsin; bir sahne tek bir isteği karşılar.
          </div>
        </aside>
      </div>

      {fulfill && uid && <FulfillModal req={fulfill} uid={uid} onClose={() => setFulfill(null)} onDone={(xp) => { setFulfill(null); setNotice(xp > 0 ? `İstek karşılandı: +${xp} XP!` : "İstek karşılandı."); setTab("eklendi"); load(); }} />}
    </main>
  );
}

function FulfillModal({ req, uid, onClose, onDone }: { req: Req; uid: string; onClose: () => void; onDone: (xp: number) => void }) {
  const [scenes, setScenes] = useState<{ id: string; title: string; created_at: string }[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: mine }, { data: used }] = await Promise.all([
        sb().from("scenes").select("id, title, created_at").eq("created_by", uid).order("created_at", { ascending: false }),
        sb().from("scene_requests").select("scene_id").not("scene_id", "is", null),
      ]);
      const taken = new Set(((used as { scene_id: string }[]) ?? []).map((u) => u.scene_id));
      setScenes(((mine as { id: string; title: string; created_at: string }[]) ?? []).filter((s) => !taken.has(s.id)));
    })();
  }, [uid]);

  async function go() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const { data, error } = await sb().rpc("fulfill_scene_request", { p_id: req.id, p_scene: pick });
    setBusy(false);
    if (error) return setError(errMsg(error));
    onDone((data as number) ?? 0);
  }

  return (
    <Modal onClose={onClose} label="İsteği karşıla">
      <div className="flex flex-col gap-3 p-5">
        <div>
          <p className="eyebrow">İsteği karşıla</p>
          <p className="mt-1 font-medium">{req.title}</p>
        </div>
        {scenes === null ? (
          <Skeleton className="h-24" />
        ) : scenes.length === 0 ? (
          <p className="text-sm text-muted">
            Uygun sahnen yok.{" "}
            <Link href={`/sahneler/yeni?istek=${req.id}`} className="text-accent hover:underline">
              Yeni sahne ekle
            </Link>
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" role="radiogroup" aria-label="Sahnelerin">
            {scenes.map((s) => (
              <li key={s.id}>
                <button
                  role="radio"
                  aria-checked={pick === s.id}
                  onClick={() => setPick(s.id)}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    pick === s.id ? "border-accent bg-accent/10" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="truncate">{s.title}</span>
                  <span className="shrink-0 text-[11px] text-muted">{timeAgo(s.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="primary" loading={busy} disabled={!pick} onClick={go}>
            Karşıla
          </Button>
        </div>
      </div>
    </Modal>
  );
}
