"use client";

import { Award, Clapperboard, Eraser, HardDrive, ImageIcon, Play, Send, Settings, Shield, Trash2, Upload, UserPlus, Users, Volume2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BadgeIcon from "@/components/BadgeIcon";
import { Avatar, Button, ButtonLink, cx, EmptyState, Notice, PageHeader, Progress, Skeleton } from "@/components/ui";
import { useIsAdmin } from "@/lib/admin";
import { useMe } from "@/lib/auth";
import { BADGES } from "@/lib/badges";
import { videoThumbnail } from "@/lib/image";
import { errMsg, publicUrl, sb, type Bucket } from "@/lib/supabase";
import type { SceneListItem } from "@/lib/types";
import { fmtMB } from "@/lib/compress";
import { Panel } from "@/components/admin/Panel";
import UsersPanel from "@/components/admin/UsersPanel";
import PlaquesPanel from "@/components/admin/PlaquesPanel";
import ShopPanel from "@/components/admin/ShopPanel";
import RoomsPanel from "@/components/admin/RoomsPanel";
import { playItemSound } from "@/lib/shop";

type Stats = {
  users: number;
  scenes: number;
  dubs: number;
  rooms: number;
  comments: number;
  storage: Partial<Record<Bucket, { files: number; bytes: number }>>;
  settings: { discord: boolean; site_url: string | null; early_member_limit: string | null };
  pg_net: boolean;
  pg_cron: boolean;
};
type AdminUser = { id: string; username: string; display_name: string; color: string; avatar_path: string | null; xp: number; created_at: string; badges: string[] };
type Orphan = { bucket: Bucket; name: string; bytes: number; created_at: string };

type Tab = "genel" | "uyeler" | "magaza" | "sahneler" | "odalar";
const TABS: { id: Tab; label: string }[] = [
  { id: "genel", label: "Genel" },
  { id: "uyeler", label: "Üyeler ve XP" },
  { id: "magaza", label: "Mağaza" },
  { id: "sahneler", label: "Sahneler" },
  { id: "odalar", label: "Odalar" },
];

const FREE_STORAGE = 1024 * 1024 * 1024; // Supabase ücretsiz plan: 1 GB
const SPECIAL = BADGES.filter((b) => b.special && b.id !== "erken_uye");

export default function Yonetim() {
  const me = useMe();
  const admin = useIsAdmin();
  const [checked, setChecked] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("genel");
  useEffect(() => {
    const h = location.hash.slice(1) as Tab;
    if (TABS.some((t) => t.id === h)) setTab(h);
  }, []);
  function pick(t: Tab) {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  }

  const loadStats = useCallback(async () => {
    const { data, error } = await sb().rpc("admin_stats");
    if (error) setError(errMsg(error));
    else setStats(data as Stats);
  }, []);

  useEffect(() => {
    if (me.status === "loading") return;
    const t = setTimeout(() => setChecked(true), 1200);
    return () => clearTimeout(t);
  }, [me.status]);
  useEffect(() => {
    if (admin) loadStats();
  }, [admin, loadStats]);

  if (!admin)
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        {checked || me.status === "out" ? (
          <EmptyState icon={<Shield className="size-5" />} title="Bu sayfa yöneticiler için" action={<ButtonLink href="/" size="sm">Ana sayfa</ButtonLink>}>
            Yönetim paneli sadece &quot;Kurucu&quot; rozeti olanlara açık. Kurulum için README&apos;deki rozet SQL&apos;ini çalıştır.
          </EmptyState>
        ) : (
          <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
        )}
      </main>
    );

  const used = Object.values(stats?.storage ?? {}).reduce((s, b) => s + (b?.bytes ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <PageHeader eyebrow="Kurucu" title="Yönetim" description="Üyeler ve XP, mağaza, plaketler, sahneler, odalar ve ayarlar. Bu sayfayı sadece Kurucu rozeti olanlar görür." />
      {error && (
        <div className="mb-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {/* Genel bakış */}
      <section className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ["Üye", stats?.users],
            ["Sahne", stats?.scenes],
            ["Dublaj", stats?.dubs],
            ["Açık oda", stats?.rooms],
            ["Yorum", stats?.comments],
          ] as const
        ).map(([l, v]) => (
          <div key={l} className="bg-surface p-4">
            <p className="eyebrow">{l}</p>
            {v === undefined ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-1 text-2xl font-semibold tracking-tight">{v}</p>}
          </div>
        ))}
      </section>

      <nav className="sticky top-0 z-20 -mx-4 mt-6 mb-6 flex gap-1 overflow-x-auto border-b border-line bg-bg/90 px-4 backdrop-blur sm:mx-0 sm:px-0" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            className={cx(
              "-mb-px h-10 shrink-0 border-b-2 px-3 text-sm transition-colors",
              tab === t.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "genel" && (
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel icon={<HardDrive className="size-4" />} title="Depolama" right={<span className="font-mono text-xs text-muted">{fmtMB(used)} / 1 GB</span>}>
          <div className="flex flex-col gap-3 p-4">
            <Progress value={used / FREE_STORAGE} tone={used / FREE_STORAGE > 0.85 ? "rec" : "accent"} className="h-1.5" />
            <ul className="grid grid-cols-3 gap-2 text-xs">
              {(["scenes", "recordings", "avatars"] as Bucket[]).map((b) => (
                <li key={b} className="rounded-lg border border-line bg-bg p-2.5">
                  <p className="text-muted">{b === "scenes" ? "Sahneler" : b === "recordings" ? "Kayıtlar" : "Profil foto"}</p>
                  <p className="mt-0.5 font-mono text-fg-2">{fmtMB(stats?.storage[b]?.bytes ?? 0)}</p>
                  <p className="font-mono text-[10px] text-muted">{stats?.storage[b]?.files ?? 0} dosya</p>
                </li>
              ))}
            </ul>
            <Cleanup onDone={loadStats} hasCron={!!stats?.pg_cron} />
          </div>
        </Panel>

        <SettingsPanel stats={stats} onSaved={loadStats} />
      </div>
      )}

      {tab === "uyeler" && (
        <>
          <UsersPanel />
          <BadgesPanel />
        </>
      )}
      {tab === "magaza" && (
        <>
          <ShopPanel />
          <PlaquesPanel />
          <SoundsPanel />
        </>
      )}
      {tab === "sahneler" && <ScenesPanel uid={me.status === "in" ? me.user.id : ""} />}
      {tab === "odalar" && <RoomsPanel onChanged={loadStats} />}
    </main>
  );
}


// ------------------------------------------------------------
function Cleanup({ onDone, hasCron }: { onDone: () => void; hasCron: boolean }) {
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function scan() {
    setBusy("scan");
    setMsg(null);
    const { data, error } = await sb().rpc("storage_orphans", { p_min_age_hours: 24 });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setOrphans((data as Orphan[]) ?? []);
  }

  async function removeAll() {
    if (!orphans?.length) return;
    if (!confirm(`${orphans.length} dosya kalıcı olarak silinecek. Emin misin?`)) return;
    setBusy("rm");
    let removed = 0;
    let failed = 0;
    for (const bucket of ["recordings", "scenes", "avatars"] as Bucket[]) {
      const names = orphans.filter((o) => o.bucket === bucket).map((o) => o.name);
      for (let i = 0; i < names.length; i += 100) {
        const chunk = names.slice(i, i + 100);
        const { data, error } = await sb().storage.from(bucket).remove(chunk);
        if (error) failed += chunk.length;
        else {
          removed += data?.length ?? 0;
          failed += chunk.length - (data?.length ?? 0);
        }
      }
    }
    setBusy(null);
    setOrphans(null);
    setMsg({
      tone: failed ? "error" : "info",
      text: failed ? `${removed} dosya silindi, ${failed} dosya silinemedi (005 migration'ındaki depolama yetkilerini kontrol et).` : `${removed} dosya silindi.`,
    });
    onDone();
  }

  async function rooms() {
    setBusy("rooms");
    const { data, error } = await sb().rpc("admin_cleanup_rooms", { p_days: 3 });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: `${data} eski oda silindi. Kayıt dosyaları bir gün sonra "Kullanılmayan dosyalar"da görünür.` });
    onDone();
  }

  const total = orphans?.reduce((s, o) => s + o.bytes, 0) ?? 0;
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Eraser className="size-3.5" />} loading={busy === "scan"} disabled={!!busy} onClick={scan}>
          Kullanılmayan dosyaları bul
        </Button>
        <Button size="sm" variant="ghost" loading={busy === "rooms"} disabled={!!busy} onClick={rooms}>
          3 günlük eski odaları sil
        </Button>
      </div>
      {orphans && (
        <div className="rounded-lg border border-line bg-bg p-3 text-xs">
          {orphans.length === 0 ? (
            <p className="text-muted">Temiz. Silinecek dosya yok.</p>
          ) : (
            <>
              <p className="text-fg-2">
                {orphans.length} dosya · {fmtMB(total)} — tekrar çekimler, silinen odalar, yarım kalan yüklemeler (en az 1 günlük).
              </p>
              <ul className="mt-2 max-h-32 overflow-auto font-mono text-[10px] text-muted">
                {orphans.slice(0, 50).map((o) => (
                  <li key={o.bucket + o.name} className="truncate">
                    {o.bucket}/{o.name} · {fmtMB(o.bytes)}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="danger" className="mt-2" icon={<Trash2 className="size-3.5" />} loading={busy === "rm"} disabled={!!busy} onClick={removeAll}>
                Hepsini sil
              </Button>
            </>
          )}
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <p className="text-[11px] leading-relaxed text-muted">
        {hasCron
          ? "pg_cron açık: eski odalar her gece otomatik siliniyor."
          : "İpucu: Supabase'de pg_cron eklentisini açıp README'deki tek satırlık SQL'i çalıştırırsan eski odalar her gece otomatik silinir."}
      </p>
    </div>
  );
}

// ------------------------------------------------------------
function SettingsPanel({ stats, onSaved }: { stats: Stats | null; onSaved: () => void }) {
  const [webhook, setWebhook] = useState("");
  const [site, setSite] = useState("");
  const [early, setEarly] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!stats) return;
    setSite(stats.settings.site_url ?? "");
    setEarly(stats.settings.early_member_limit ?? "50");
  }, [stats]);

  async function save(key: string, value: string) {
    setBusy(key);
    setMsg(null);
    const { error } = await sb().rpc("admin_set_setting", { p_key: key, p_value: value });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: "Kaydedildi." });
    if (key === "discord_webhook_url") setWebhook("");
    onSaved();
  }

  async function test() {
    setBusy("test");
    setMsg(null);
    const { data, error } = await sb().rpc("admin_discord_test");
    setBusy(null);
    setMsg(error ? { tone: "error", text: errMsg(error) } : { tone: "info", text: String(data) });
  }

  return (
    <Panel icon={<Settings className="size-4" />} title="Ayarlar">
      <div className="flex flex-col gap-4 p-4">
        <div>
          <label className="eyebrow mb-1.5 flex items-center justify-between" htmlFor="wh">
            <span>Discord webhook</span>
            <span className={cx("normal-case", stats?.settings.discord ? "text-ok" : "text-muted")}>
              {stats?.settings.discord ? "ayarlı" : "ayarlı değil"}
              {stats && !stats.pg_net && " · pg_net kapalı"}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              id="wh"
              className="field"
              type="password"
              autoComplete="off"
              placeholder={stats?.settings.discord ? "Değiştirmek için yeni adresi yapıştır" : "https://discord.com/api/webhooks/…"}
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
            />
            <Button loading={busy === "discord_webhook_url"} disabled={!webhook.trim()} onClick={() => save("discord_webhook_url", webhook.trim())}>
              Kaydet
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="ghost" icon={<Send className="size-3.5" />} loading={busy === "test"} disabled={!stats?.settings.discord} onClick={test}>
              Test mesajı gönder
            </Button>
            {stats?.settings.discord && (
              <Button size="sm" variant="ghost" loading={busy === "discord_webhook_url"} onClick={() => confirm("Discord bildirimleri kapatılsın mı?") && save("discord_webhook_url", "")}>
                Kapat
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">Adres veritabanında saklanır, tarayıcıya hiç gönderilmez.</p>
        </div>
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="site">
            Site adresi (Discord linkleri ve paylaşım görseli için)
          </label>
          <div className="flex gap-2">
            <input id="site" className="field" placeholder="https://fam-io.vercel.app" value={site} onChange={(e) => setSite(e.target.value)} />
            <Button loading={busy === "site_url"} onClick={() => save("site_url", site.trim())}>
              Kaydet
            </Button>
          </div>
        </div>
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="early">
            Erken Üye rozeti: ilk kaç üye
          </label>
          <div className="flex gap-2">
            <input id="early" className="field w-28" inputMode="numeric" value={early} onChange={(e) => setEarly(e.target.value.replace(/\D/g, ""))} />
            <Button loading={busy === "early_member_limit"} disabled={!early} onClick={() => save("early_member_limit", early)}>
              Kaydet
            </Button>
          </div>
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------
function BadgesPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [username, setUsername] = useState("");
  const [badge, setBadge] = useState(SPECIAL[0]?.id ?? "beta");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async (query: string) => {
    const { data, error } = await sb().rpc("admin_users", { p_q: query || null });
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setUsers((data as AdminUser[]) ?? []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    const id = badge === "__custom" ? custom.trim().toLowerCase() : badge;
    if (!username.trim() || !id) return;
    setBusy(true);
    setMsg(null);
    const { error } = await sb().rpc("admin_grant_badge", { p_username: username.trim(), p_badge: id, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: `@${username.trim()} kullanıcısına rozet verildi.` });
    setNote("");
    load(q.trim());
  }

  async function revoke(u: AdminUser, b: string) {
    if (!confirm(`@${u.username} kullanıcısından "${b}" rozeti alınsın mı?`)) return;
    const { error } = await sb().rpc("admin_revoke_badge", { p_username: u.username, p_badge: b });
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    load(q.trim());
  }

  const def = (id: string) => BADGES.find((b) => b.id === id);

  return (
    <Panel icon={<Award className="size-4" />} title="Özel rozetler" className="mt-6">
      <div className="grid gap-0 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form onSubmit={grant} className="flex flex-col gap-3 border-b border-line p-4 lg:border-r lg:border-b-0">
          <p className="text-xs text-muted">Kurucu, Beta Test, Discord Ekibi gibi rozetler elle verilir. Kurucu rozeti yönetim yetkisi de verir.</p>
          <input className="field" placeholder="Kullanıcı adı" value={username} onChange={(e) => setUsername(e.target.value)} />
          <select className="field" value={badge} onChange={(e) => setBadge(e.target.value)}>
            {SPECIAL.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value="__custom">Özel kimlik…</option>
          </select>
          {badge === "__custom" && (
            <input className="field font-mono" placeholder="yilin_sesi" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^a-z0-9_]/gi, ""))} />
          )}
          <input
            className="field"
            placeholder={badge === "__custom" ? "Rozet adı (profilde görünür)" : "Not (isteğe bağlı)"}
            value={note}
            maxLength={60}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button variant="primary" icon={<UserPlus className="size-4" />} loading={busy} disabled={!username.trim() || (badge === "__custom" && !custom)}>
            Rozeti ver
          </Button>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        </form>
        <div className="min-w-0">
          <div className="border-b border-line p-3">
            <input className="field" placeholder="Üye ara" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {users === null ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted">
              <Users className="size-4" /> Üye bulunamadı.
            </p>
          ) : (
            <ul className="max-h-[360px] divide-y divide-line overflow-auto">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={u.display_name} color={u.color} path={u.avatar_path} size={28} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setUsername(u.username)} title="Forma yaz">
                    <span className="block truncate text-sm">{u.display_name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      @{u.username} · {u.xp} XP
                    </span>
                  </button>
                  <span className="flex flex-wrap justify-end gap-1">
                    {u.badges.map((b) => {
                      const d = def(b);
                      return (
                        <button key={b} onClick={() => revoke(u, b)} title={`${d?.name ?? b} — kaldırmak için tıkla`} className="rounded-full transition-opacity hover:opacity-60">
                          <BadgeIcon id={b} tier={d?.tier ?? "ozel"} icon={d?.icon ?? "Award"} size={26} />
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------
function ScenesPanel({ uid }: { uid: string }) {
  const [scenes, setScenes] = useState<SceneListItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [thumbs, setThumbs] = useState<[number, number] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("list_scenes", { p_sort: "yeni", p_limit: 200 });
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setScenes((data as SceneListItem[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function del(s: SceneListItem) {
    if (!confirm(`"${s.title}" sahnesi ve bu sahneyle yapılmış ${s.dub_count} dublaj kalıcı olarak silinecek. Emin misin?`)) return;
    setBusy(s.id);
    const { error } = await sb().rpc("admin_delete_scene", { p_scene: s.id });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: "Sahne silindi. Dosyaları \"Kullanılmayan dosyaları bul\" ile temizleyebilirsin." });
    load();
  }

  async function owner(s: SceneListItem) {
    const u = prompt(`"${s.title}" sahnesinin yapımcısı kim olsun? (kullanıcı adı)`, s.creator?.username ?? "");
    if (!u) return;
    setBusy(s.id);
    const { error } = await sb().rpc("admin_set_scene_owner", { p_scene: s.id, p_username: u });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    load();
  }

  async function makeThumbs() {
    const todo = (scenes ?? []).filter((s) => !s.thumb_path);
    setThumbs([0, todo.length]);
    let fail = 0;
    for (let i = 0; i < todo.length; i++) {
      const s = todo[i];
      try {
        const { blob, ext } = await videoThumbnail(publicUrl("scenes", s.video_path));
        const path = `${uid}/${s.id}-thumb-${Date.now()}.${ext}`;
        const { error } = await sb().storage.from("scenes").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
        if (error) throw error;
        const { error: e2 } = await sb().rpc("admin_set_scene_thumb", { p_scene: s.id, p_path: path });
        if (e2) throw e2;
      } catch {
        fail++;
      }
      setThumbs([i + 1, todo.length]);
    }
    setThumbs(null);
    setMsg({ tone: fail ? "error" : "info", text: fail ? `${todo.length - fail} kapak oluşturuldu, ${fail} sahnede hata.` : `${todo.length} kapak oluşturuldu.` });
    load();
  }

  const missing = (scenes ?? []).filter((s) => !s.thumb_path).length;

  return (
    <Panel
      icon={<Clapperboard className="size-4" />}
      title="Sahneler"
      right={
        missing > 0 && (
          <Button size="sm" icon={<ImageIcon className="size-3.5" />} loading={!!thumbs} onClick={makeThumbs}>
            {thumbs ? `${thumbs[0]}/${thumbs[1]}` : `Eksik ${missing} kapağı oluştur`}
          </Button>
        )
      }
    >
      {msg && (
        <div className="border-b border-line p-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      {scenes === null ? (
        <div className="flex flex-col gap-2 p-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : scenes.length === 0 ? (
        <p className="p-4 text-sm text-muted">Kütüphanede sahne yok.</p>
      ) : (
        <ul className="divide-y divide-line">
          {scenes.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
              <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded bg-black">
                {s.thumb_path && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicUrl("scenes", s.thumb_path)} alt="" className="size-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{s.title}</p>
                <p className="truncate text-[11px] text-muted">
                  {s.creator ? (
                    <Link href={`/u/${s.creator.username}`} className="hover:text-fg">
                      @{s.creator.username}
                    </Link>
                  ) : (
                    <span className="text-amber-200">sahipsiz</span>
                  )}{" "}
                  · {s.dub_count} oynanma · {s.line_count} replik
                </p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => owner(s)}>
                Yapımcı
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} loading={busy === s.id} onClick={() => del(s)} aria-label="Sahneyi sil" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------
// Ses efektleri: efekt düğmeleri ve giriş seslerine gerçek ses dosyası yükle
// ------------------------------------------------------------
const MAX_SOUND = 2 * 1024 * 1024;

function soundExt(f: File) {
  const m = f.name.toLowerCase().match(/\.(mp3|ogg|wav|m4a|webm|aac)$/);
  return m ? m[1] : "mp3";
}

async function uploadSound(prefix: string, f: File) {
  if (!f.type.startsWith("audio/") && !/\.(mp3|ogg|wav|m4a|webm|aac)$/i.test(f.name)) throw new Error("Bir ses dosyası seç (mp3, ogg, wav, m4a).");
  if (f.size > MAX_SOUND) throw new Error("Ses dosyası en fazla 2 MB olabilir.");
  const path = `${prefix}-${Date.now()}.${soundExt(f)}`;
  const { error } = await sb().storage.from("sounds").upload(path, f, { contentType: f.type || "audio/mpeg", cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

type SoundRow = { id: string; kind: "board" | "sound"; name: string; price: number; sort: number; emoji: string | null; audio_path: string | null };

function SoundsPanel() {
  const [rows, setRows] = useState<SoundRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, { name: string; emoji: string; price: string }>>({});
  const [add, setAdd] = useState<{ kind: "board" | "sound"; name: string; emoji: string; price: string; file: File | null }>({ kind: "board", name: "", emoji: "", price: "0", file: null });

  const load = useCallback(async () => {
    const { data, error } = await sb().from("shop_items").select("*").in("kind", ["board", "sound"]).order("kind").order("sort");
    if (error) setMsg({ tone: "error", text: errMsg(error) });
    const list = (data as SoundRow[]) ?? [];
    setRows(list);
    setDraft(Object.fromEntries(list.map((r) => [r.id, { name: r.name, emoji: r.emoji ?? "", price: String(r.price) }])));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "info", text: ok });
      await load();
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  async function save(r: SoundRow, path: string | null) {
    const d = draft[r.id];
    const { error } = await sb().rpc("admin_save_sound", {
      p_id: r.id,
      p_kind: r.kind,
      p_name: d?.name ?? r.name,
      p_price: Number(d?.price ?? r.price) || 0,
      p_emoji: d?.emoji ?? r.emoji,
      p_audio_path: path,
    });
    if (error) throw error;
  }

  function replaceFile(r: SoundRow, f: File | undefined) {
    if (!f) return;
    run(
      "f" + r.id,
      async () => {
        const path = await uploadSound(r.id, f);
        await save(r, path);
        if (r.audio_path) sb().storage.from("sounds").remove([r.audio_path]).catch(() => {});
      },
      `${r.name}: ses dosyası yüklendi.`,
    );
  }

  return (
    <Panel icon={<Volume2 className="size-4" />} title="Ses efektleri" className="mt-6">
      <div className="flex flex-col gap-4 p-4">
        <p className="text-xs leading-relaxed text-muted">
          Efekt düğmelerine ve giriş seslerine gerçek ses dosyası yükle (mp3/ogg/wav, en fazla 2 MB). Dosyası olmayan sesler eski sentez sesi çalar. Ses bulmak için{" "}
          <a href="https://www.myinstants.com/en/index/tr/" target="_blank" rel="noreferrer" className="text-fg-2 underline">
            myinstants
          </a>{" "}
          gibi sitelerden indirip buraya yükleyebilirsin; şarkı ve dizi kesitleri telifli olabilir, sorumluluk yükleyende.
        </p>
        {msg && <Notice tone={msg.tone === "error" ? "error" : "info"}>{msg.text}</Notice>}
        {rows === null ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted">
                  <th className="pb-2 font-normal">Ses</th>
                  <th className="pb-2 font-normal">Ad</th>
                  <th className="pb-2 font-normal">Emoji</th>
                  <th className="pb-2 font-normal">Fiyat</th>
                  <th className="pb-2 font-normal">Dosya</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const d = draft[r.id] ?? { name: r.name, emoji: r.emoji ?? "", price: String(r.price) };
                  const dirty = d.name !== r.name || d.emoji !== (r.emoji ?? "") || d.price !== String(r.price);
                  return (
                    <tr key={r.id}>
                      <td className="py-2 pr-2">
                        <button
                          className="inline-flex size-8 items-center justify-center rounded-full border border-line-strong text-fg-2 hover:border-accent hover:text-accent"
                          aria-label={`${r.name} dinle`}
                          onClick={() => playItemSound(r)}
                        >
                          <Play className="size-3.5" />
                        </button>
                      </td>
                      <td className="py-2 pr-2">
                        <input className="field h-8 w-40 px-2 text-[13px]" value={d.name} maxLength={40} onChange={(e) => setDraft({ ...draft, [r.id]: { ...d, name: e.target.value } })} />
                        <span className="mt-0.5 block text-[10px] text-muted">{r.kind === "board" ? "efekt düğmesi" : "giriş sesi"}</span>
                      </td>
                      <td className="py-2 pr-2">
                        <input className="field h-8 w-14 px-2 text-center" value={d.emoji} maxLength={4} onChange={(e) => setDraft({ ...draft, [r.id]: { ...d, emoji: e.target.value } })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input className="field h-8 w-20 px-2 font-mono text-[13px]" inputMode="numeric" value={d.price} onChange={(e) => setDraft({ ...draft, [r.id]: { ...d, price: e.target.value.replace(/\D/g, "") } })} />
                      </td>
                      <td className="py-2 pr-2">
                        <span className={cx("text-xs", r.audio_path ? "text-ok" : "text-muted")}>{r.audio_path ? "dosya" : "sentez"}</span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {dirty && (
                            <Button size="sm" variant="primary" loading={busy === "s" + r.id} disabled={!!busy} onClick={() => run("s" + r.id, () => save(r, null), `${d.name} kaydedildi.`)}>
                              Kaydet
                            </Button>
                          )}
                          <label className={cx("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-fg-2 hover:border-line-strong", busy && "pointer-events-none opacity-50")}>
                            <Upload className="size-3.5" /> {busy === "f" + r.id ? "Yükleniyor…" : r.audio_path ? "Değiştir" : "Dosya yükle"}
                            <input type="file" accept="audio/*" className="sr-only" onChange={(e) => replaceFile(r, e.target.files?.[0])} />
                          </label>
                          {r.audio_path && (
                            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run("c" + r.id, async () => {
                              const { error } = await sb().rpc("admin_clear_sound", { p_id: r.id });
                              if (error) throw error;
                              sb().storage.from("sounds").remove([r.audio_path!]).catch(() => {});
                            }, `${r.name} sentez sese döndü.`)}>
                              Sentez
                            </Button>
                          )}
                          <button
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-red-300 disabled:opacity-40"
                            aria-label={`${r.name} sil`}
                            disabled={!!busy}
                            onClick={() => {
                              if (!confirm(`${r.name} mağazadan silinsin mi? Satın alanlarda da kaybolur.`)) return;
                              run("d" + r.id, async () => {
                                const { error } = await sb().rpc("admin_delete_sound", { p_id: r.id });
                                if (error) throw error;
                                if (r.audio_path) sb().storage.from("sounds").remove([r.audio_path]).catch(() => {});
                              }, `${r.name} silindi.`);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <form
          className="flex flex-col gap-2 rounded-lg border border-line bg-bg p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!add.file) return;
            run(
              "add",
              async () => {
                const path = await uploadSound(add.kind, add.file!);
                const { error } = await sb().rpc("admin_save_sound", {
                  p_id: null,
                  p_kind: add.kind,
                  p_name: add.name.trim(),
                  p_price: Number(add.price) || 0,
                  p_emoji: add.emoji || null,
                  p_audio_path: path,
                });
                if (error) {
                  sb().storage.from("sounds").remove([path]).catch(() => {});
                  throw error;
                }
                setAdd({ kind: add.kind, name: "", emoji: "", price: "0", file: null });
              },
              "Yeni ses mağazaya eklendi.",
            );
          }}
        >
          <p className="text-xs font-medium">Yeni ses ekle</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className="field h-9 w-40 px-2 text-[13px]" value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as "board" | "sound" })}>
              <option value="board">Efekt düğmesi</option>
              <option value="sound">Giriş sesi</option>
            </select>
            <input className="field h-9 w-44" placeholder="Ad" maxLength={40} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
            <input className="field h-9 w-16 text-center" placeholder="😂" maxLength={4} value={add.emoji} onChange={(e) => setAdd({ ...add, emoji: e.target.value })} />
            <input className="field h-9 w-24 font-mono" placeholder="Fiyat" inputMode="numeric" value={add.price} onChange={(e) => setAdd({ ...add, price: e.target.value.replace(/\D/g, "") })} />
            <input type="file" accept="audio/*" className="text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-3 file:px-2.5 file:py-1.5 file:text-fg-2" onChange={(e) => setAdd({ ...add, file: e.target.files?.[0] ?? null })} />
            <Button variant="primary" size="sm" loading={busy === "add"} disabled={!!busy || !add.file || add.name.trim().length < 1}>
              Ekle
            </Button>
          </div>
          <p className="text-[11px] text-muted">Fiyatı 0 olan efekt düğmeleri herkeste hazır gelir; diğerleri mağazadan alınır.</p>
        </form>
      </div>
    </Panel>
  );
}
