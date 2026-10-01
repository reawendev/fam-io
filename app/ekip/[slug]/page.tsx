"use client";

import { Check, Copy, Crown, ImagePlus, LogOut, Pencil, RefreshCw, Shield, UserX, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import TeamBadge from "@/components/TeamBadge";
import { Avatar, Button, ButtonLink, cx, IconButton, Modal, Notice, Skeleton, UserName } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { squareAvatar } from "@/lib/image";
import { levelInfo } from "@/lib/progress";
import { errMsg, sb } from "@/lib/supabase";
import { TEAM_COLORS, TEAM_COLUMNS, type Team, type TeamRow } from "@/lib/teams";
import type { Equipped } from "@/lib/types";

type Member = {
  user_id: string;
  role: "kaptan" | "uye";
  joined_at: string;
  profiles: { username: string; display_name: string; color: string; avatar_path: string | null; xp: number; equipped?: Equipped } | null;
};

export default function EkipPage() {
  const { slug } = useParams<{ slug: string }>();
  const me = useMe();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [weekly, setWeekly] = useState<Record<string, number>>({});
  const [rank, setRank] = useState<{ pos: number; xp: number; of: number } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = me.status === "in" ? me.user.id : null;

  const load = useCallback(async () => {
    const { data: t, error } = await sb().from("teams").select(TEAM_COLUMNS).eq("slug", slug).maybeSingle();
    if (error) setError(errMsg(error));
    setTeam((t as Team) ?? null);
    if (!t) return;
    const [{ data: m }, { data: board }, { data: lb }] = await Promise.all([
      sb()
        .from("team_members")
        .select("user_id, role, joined_at, profiles(username, display_name, color, avatar_path, xp, equipped)")
        .eq("team_id", (t as Team).id)
        .order("joined_at"),
      sb().rpc("team_board", { p_period: "week" }),
      sb().rpc("leaderboard", { p_period: "week", p_limit: 100 }),
    ]);
    setMembers((m as unknown as Member[]) ?? []);
    const rows = (board as TeamRow[]) ?? [];
    const i = rows.findIndex((r) => r.team_id === (t as Team).id);
    setRank(i >= 0 ? { pos: i + 1, xp: rows[i].xp, of: rows.length } : null);
    setWeekly(Object.fromEntries(((lb as { user_id: string; xp: number }[]) ?? []).map((r) => [r.user_id, r.xp])));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const isCaptain = !!team && uid === team.owner;
  const isMember = members.some((m) => m.user_id === uid);

  useEffect(() => {
    if (!isCaptain) return setInvite(null);
    sb()
      .rpc("team_invite_code")
      .then(({ data }) => setInvite((data as string) ?? null));
  }, [isCaptain]);

  async function act(fn: string, args: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    const { data, error } = await sb().rpc(fn, args);
    setBusy(null);
    if (error) {
      setError(errMsg(error));
      return null;
    }
    await load();
    return data ?? true;
  }

  async function copyInvite() {
    if (!invite) return;
    const url = `${location.origin}/ekipler?davet=${invite}`;
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) await navigator.share({ title: team?.name, text: `${team?.name} ekibine katıl. Kod: ${invite}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {}
  }

  if (team === undefined)
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Skeleton className="h-40 rounded-[var(--radius-card)]" />
      </main>
    );
  if (team === null)
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
        <Notice>Bu ekip bulunamadı.</Notice>
        <ButtonLink href="/ekipler" size="sm" className="self-start">
          Ekipler
        </ButtonLink>
      </main>
    );

  const sorted = [...members].sort((a, b) => (weekly[b.user_id] ?? 0) - (weekly[a.user_id] ?? 0));
  const total = members.reduce((s, m) => s + (m.profiles?.xp ?? 0), 0);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <section className="relative mt-6 overflow-hidden rounded-[var(--radius-card)] border border-line p-6" style={{ background: `radial-gradient(700px 200px at 90% -20%, ${team.color}33, transparent), var(--color-surface)` }}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <TeamBadge tag={team.tag} color={team.color} logo={team.logo_path} size={80} className="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow flex items-center gap-1.5">
              <Shield className="size-3.5" /> Ekip
            </p>
            <h1 className="mt-1 flex flex-wrap items-baseline gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {team.name}
              <span className="font-mono text-base" style={{ color: team.color }}>
                [{team.tag}]
              </span>
            </h1>
            {team.description && <p className="mt-1 max-w-xl text-sm text-fg-2">{team.description}</p>}
            <p className="mt-2 text-xs text-muted">
              {members.length} üye · toplam {total} XP
              {rank && ` · bu hafta ${rank.pos}. (${rank.xp} XP)`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isCaptain && (
              <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                Düzenle
              </Button>
            )}
            {isMember && (
              <Button
                size="sm"
                variant="ghost"
                icon={<LogOut className="size-3.5" />}
                loading={busy === "leave"}
                onClick={async () => {
                  if (!confirm(isCaptain ? "Ekipten ayrılırsan kaptanlık en eski üyeye geçer (kimse kalmazsa ekip silinir). Emin misin?" : "Ekipten ayrılmak istiyor musun?")) return;
                  if (await act("leave_team", {}, "leave")) router.push("/ekipler");
                }}
              >
                Ayrıl
              </Button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}

      {isCaptain && invite && (
        <div className="panel mt-4 flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Davet kodu</p>
            <p className="text-xs text-muted">Linki ya da kodu arkadaşlarına gönder. Sızdıysa yenile; eski kod çalışmaz.</p>
          </div>
          <span className="rounded-md bg-bg px-3 py-1.5 font-mono text-lg tracking-[0.25em]">{invite}</span>
          <Button size="sm" icon={copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />} onClick={copyInvite}>
            {copied ? "Kopyalandı" : "Linki kopyala"}
          </Button>
          <IconButton
            label="Kodu yenile"
            onClick={async () => {
              const v = await act("regen_team_invite", {}, "regen");
              if (typeof v === "string") setInvite(v);
            }}
          >
            <RefreshCw className={cx("size-4", busy === "regen" && "animate-spin")} />
          </IconButton>
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium">Üyeler · bu haftanın katkısı</h2>
        <ol className="panel divide-y divide-line">
          {sorted.map((m, i) => {
            const p = m.profiles;
            if (!p) return null;
            return (
              <li key={m.user_id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <span className="w-5 text-center font-mono text-xs text-muted">{i + 1}</span>
                <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar name={p.display_name} color={p.color} path={p.avatar_path} frame={p.equipped?.frame} size={32} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <UserName name={p.display_name} fx={p.equipped?.name} className="truncate" />
                      {m.role === "kaptan" && <Crown className="size-3.5 shrink-0 text-accent" aria-label="Kaptan" />}
                    </span>
                    <span className="block text-[11px] text-muted">
                      @{p.username} · Lv {levelInfo(p.xp).level}
                    </span>
                  </span>
                </Link>
                <span className="font-mono text-sm">
                  {weekly[m.user_id] ?? 0} <span className="text-[11px] text-muted">XP</span>
                </span>
                {isCaptain && m.user_id !== uid && (
                  <IconButton
                    label="Ekipten çıkar"
                    className="hover:text-red-300"
                    onClick={() => confirm(`${p.display_name} ekipten çıkarılsın mı?`) && act("kick_team_member", { p_user: m.user_id }, "kick")}
                  >
                    <UserX className="size-4" />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {editing && <EditTeam team={team} onClose={() => setEditing(false)} onSaved={load} />}
    </main>
  );
}

function EditTeam({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: team.name, tag: team.tag, color: team.color, description: team.description ?? "" });
  const [logo, setLogo] = useState<{ blob: Blob; url: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let logoPath = logo === null ? null : team.logo_path;
      if (logo) {
        const { data: s } = await sb().auth.getSession();
        const uid = s.session?.user.id;
        logoPath = `${uid}/team-${Date.now()}.jpg`;
        const { error } = await sb().storage.from("avatars").upload(logoPath, logo.blob, { contentType: logo.blob.type, cacheControl: "31536000" });
        if (error) throw error;
      }
      const { error } = await sb().rpc("update_team", {
        p_name: form.name,
        p_tag: form.tag,
        p_color: form.color,
        p_description: form.description,
        p_logo_path: logoPath,
      });
      if (error) throw error;
      if (logo !== undefined && team.logo_path) sb().storage.from("avatars").remove([team.logo_path]).catch(() => {});
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} label="Ekibi düzenle">
      <form onSubmit={save} className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Ekibi düzenle</h2>
          <IconButton label="Kapat" type="button" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.url} alt="" className="size-16 rounded-xl object-cover" />
          ) : (
            <TeamBadge tag={form.tag || "?"} color={form.color} logo={logo === null ? null : team.logo_path} size={64} className="rounded-xl" />
          )}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-3 text-[13px] hover:bg-surface-3">
              <ImagePlus className="size-3.5" /> Logo seç
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const r = await squareAvatar(f, 256);
                    setLogo({ blob: r.blob, url: URL.createObjectURL(r.blob) });
                  } catch (err) {
                    setError(errMsg(err));
                  }
                }}
              />
            </label>
            {(logo || (logo === undefined && team.logo_path)) && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setLogo(null)}>
                Logoyu kaldır
              </Button>
            )}
          </div>
        </div>
        <input className="field" maxLength={30} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <div className="flex gap-2">
          <input
            className="field w-24 font-mono uppercase"
            maxLength={4}
            value={form.tag}
            onChange={(e) => setForm({ ...form, tag: e.target.value.toLocaleUpperCase("tr").replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, "") })}
          />
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {TEAM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Renk ${c}`}
                onClick={() => setForm({ ...form, color: c })}
                className={cx("size-5 rounded-full ring-offset-2 ring-offset-surface", form.color === c && "ring-2 ring-fg")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <textarea className="field h-16 resize-none py-2" maxLength={160} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Açıklama" />
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="primary" loading={busy} disabled={form.name.trim().length < 2 || form.tag.length < 2}>
            Kaydet
          </Button>
        </div>
      </form>
    </Modal>
  );
}
