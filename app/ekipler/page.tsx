"use client";

import { ArrowRight, Crown, Plus, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TeamBadge from "@/components/TeamBadge";
import { Button, ButtonLink, cx, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { errMsg, sb } from "@/lib/supabase";
import { TEAM_COLORS, useMyTeam, type TeamRow } from "@/lib/teams";

export default function Ekipler() {
  const me = useMe();
  const router = useRouter();
  const { team } = useMyTeam();
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", tag: "", color: TEAM_COLORS[0], description: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const d = new URLSearchParams(location.search).get("davet");
    if (d) setCode(d.toUpperCase());
  }, []);

  useEffect(() => {
    setRows(null);
    sb()
      .rpc("team_board", { p_period: period })
      .then(({ data, error }) => {
        if (error) setError(errMsg(error));
        setRows((data as TeamRow[]) ?? []);
      });
  }, [period]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy("join");
    setError(null);
    const { data, error } = await sb().rpc("join_team", { p_code: code.trim() });
    setBusy(null);
    if (error) return setError(errMsg(error));
    router.push(`/ekip/${data}`);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    const { data, error } = await sb().rpc("create_team", {
      p_name: form.name.trim(),
      p_tag: form.tag.trim(),
      p_color: form.color,
      p_description: form.description.trim() || null,
    });
    setBusy(null);
    if (error) return setError(/teams_tag_check/.test(error.message) ? "Etiket 2–4 harf ya da rakam olmalı." : errMsg(error));
    router.push(`/ekip/${data}`);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <PageHeader
        eyebrow="Ekip ligi"
        title="Ekipler"
        description="Arkadaş grubunla bir ekip kur. Üyelerin kazandığı her XP ekibine yazılır; haftalık lig her pazartesi sıfırlanır."
      />

      {error && (
        <div className="mb-6">
          <Notice>{error}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Lig tablosu</h2>
            <div className="flex rounded-lg border border-line bg-surface p-0.5" role="tablist">
              {(["week", "all"] as const).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={period === p}
                  onClick={() => setPeriod(p)}
                  className={cx("h-8 rounded-md px-3 text-[13px] transition-colors", period === p ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
                >
                  {p === "week" ? "Bu hafta" : "Tüm zamanlar"}
                </button>
              ))}
            </div>
          </div>
          {rows === null ? (
            <div className="panel divide-y divide-line">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-9" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="ml-auto h-4 w-16" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={<Shield className="size-5" />} title="Henüz ekip yok">
              İlk ekibi sen kur, arkadaşlarını davet kodunla çağır.
            </EmptyState>
          ) : (
            <ol className="panel divide-y divide-line">
              {rows.map((t, i) => (
                <li key={t.team_id}>
                  <Link href={`/ekip/${t.slug}`} className={cx("flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2 sm:px-4", team?.id === t.team_id && "bg-accent/[0.06]")}>
                    <span className={cx("w-6 text-center font-mono text-sm", i < 3 ? "font-semibold text-accent" : "text-muted")}>
                      {i === 0 && t.xp > 0 ? <Crown className="mx-auto size-4" /> : i + 1}
                    </span>
                    <TeamBadge tag={t.tag} color={t.color} logo={t.logo_path} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.name}</span>
                      <span className="block text-[11px] text-muted">
                        <span className="font-mono" style={{ color: t.color }}>
                          [{t.tag}]
                        </span>{" "}
                        · {t.members} üye · {t.dubs} dublaj
                      </span>
                    </span>
                    <span className="text-right font-mono text-sm font-semibold">
                      {t.xp} <span className="text-[11px] font-normal text-muted">XP</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {period === "week" && <p className="mt-3 text-xs text-muted">Haftanın ekibi, pazartesi 00:00&apos;a (İstanbul) kadar en çok XP toplayan ekip.</p>}
        </section>

        <aside className="flex flex-col gap-4">
          {me.status !== "in" ? (
            <div className="panel flex flex-col gap-3 p-4 text-sm">
              <p className="text-muted">Ekip kurmak ya da katılmak için giriş yap.</p>
              <ButtonLink href="/hesap?next=/ekipler" variant="primary" size="sm">
                Giriş yap
              </ButtonLink>
            </div>
          ) : team === undefined ? (
            <Skeleton className="h-40 rounded-[var(--radius-card)]" />
          ) : team ? (
            <Link href={`/ekip/${team.slug}`} className="panel flex items-center gap-3 p-4 transition-colors hover:border-line-strong">
              <TeamBadge tag={team.tag} color={team.color} logo={team.logo_path} size={44} />
              <span className="min-w-0 flex-1">
                <span className="eyebrow block">Ekibin</span>
                <span className="block truncate font-medium">{team.name}</span>
              </span>
              <ArrowRight className="size-4 text-muted" />
            </Link>
          ) : (
            <>
              <form onSubmit={join} className="panel flex flex-col gap-3 p-4">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Users className="size-4 text-muted" /> Ekibe katıl
                </h3>
                <input
                  className="field font-mono tracking-[0.2em] uppercase placeholder:tracking-normal"
                  placeholder="Davet kodu"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
                <Button loading={busy === "join"} disabled={code.length < 6}>
                  Katıl
                </Button>
              </form>
              {creating ? (
                <form onSubmit={create} className="panel flex flex-col gap-3 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <Plus className="size-4 text-muted" /> Yeni ekip
                  </h3>
                  <input className="field" placeholder="Ekip adı" maxLength={30} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <div className="flex gap-2">
                    <input
                      className="field w-24 font-mono uppercase"
                      placeholder="ETİKET"
                      maxLength={4}
                      required
                      value={form.tag}
                      onChange={(e) => setForm({ ...form, tag: e.target.value.toLocaleUpperCase("tr").replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, "") })}
                    />
                    <div className="flex flex-1 flex-wrap items-center gap-1.5">
                      {TEAM_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Renk ${c}`}
                          aria-pressed={form.color === c}
                          onClick={() => setForm({ ...form, color: c })}
                          className={cx("size-5 rounded-full ring-offset-2 ring-offset-surface", form.color === c && "ring-2 ring-fg")}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <textarea className="field h-16 resize-none py-2" placeholder="Kısa açıklama (isteğe bağlı)" maxLength={160} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-bg p-2.5">
                    <TeamBadge tag={form.tag || "?"} color={form.color} />
                    <span className="truncate text-sm">{form.name || "Ekip adı"}</span>
                  </div>
                  <Button variant="primary" loading={busy === "create"} disabled={form.name.trim().length < 2 || form.tag.length < 2}>
                    Ekibi kur
                  </Button>
                </form>
              ) : (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                  Ekip kur
                </Button>
              )}
            </>
          )}
          <div className="panel p-4 text-xs leading-relaxed text-muted">
            Bir kişi aynı anda tek ekipte olabilir; ekipte en çok 20 kişi olur. Kaptan davet kodunu paylaşır, üyeleri yönetir. Kaptan ayrılırsa kaptanlık en eski üyeye geçer.
          </div>
        </aside>
      </div>
    </main>
  );
}
