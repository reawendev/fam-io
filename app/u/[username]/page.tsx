"use client";

import { Clapperboard, Flame, Heart, Mic, Pencil, Sparkles, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import DubCard, { DUB_CARD_SELECT, type DubCardData } from "@/components/DubCard";
import { Avatar, Button, ButtonLink, cx, IconButton, Notice, PROFILE_COLORS, Progress, Spinner } from "@/components/ui";
import { refreshMe, useMe } from "@/lib/auth";
import { compatLabel, compatPercent, currentStreak, levelInfo, levelTitle, streakDoneToday } from "@/lib/progress";
import { errMsg, sb } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type Compat = { partner: string; username: string; display_name: string; color: string; shared_dubs: number; shared_likes: number; score: number };
type Row = { lines: number; dubs: DubCardData | null };

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const me = useMe();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dubs, setDubs] = useState<DubCardData[]>([]);
  const [lines, setLines] = useState(0);
  const [compat, setCompat] = useState<Compat[]>([]);
  const [myCompat, setMyCompat] = useState<Compat | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: p, error } = await sb().from("profiles").select("*").eq("username", decodeURIComponent(username).toLowerCase()).maybeSingle();
      if (error) throw error;
      setProfile((p as Profile) ?? null);
      if (!p) return;
      const [{ data: rows }, { data: c }] = await Promise.all([
        sb().from("dub_participants").select(`lines, dubs(${DUB_CARD_SELECT})`).eq("user_id", p.id),
        sb().rpc("compat_for", { p_user: p.id }),
      ]);
      const list = ((rows as unknown as Row[]) ?? []).filter((r) => r.dubs).sort((a, b) => b.dubs!.created_at.localeCompare(a.dubs!.created_at));
      setDubs(list.map((r) => r.dubs!));
      setLines(list.reduce((s, r) => s + r.lines, 0));
      setCompat((c as Compat[]) ?? []);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const isMe = me.status === "in" && profile && me.profile.id === profile.id;

  // Başka birinin profilindeysem: benimle uyumu
  useEffect(() => {
    if (me.status !== "in" || !profile || isMe) return setMyCompat(null);
    setMyCompat(compat.find((c) => c.partner === me.profile.id) ?? null);
  }, [me, profile, compat, isMe]);

  if (profile === undefined)
    return (
      <main className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-20 text-sm text-muted sm:px-6">
        <Spinner /> Profil yükleniyor
      </main>
    );
  if (profile === null)
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
        <Notice>@{username} adında bir kullanıcı yok.</Notice>
        <ButtonLink href="/" size="sm" className="self-start">
          Ana sayfa
        </ButtonLink>
      </main>
    );

  const p = isMe && me.status === "in" ? me.profile : profile;
  const lv = levelInfo(p.xp);
  const streak = currentStreak(p);
  const safe = streakDoneToday(p);
  const likes = dubs.reduce((s, d) => s + d.like_count, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      {error && (
        <div className="pt-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {/* Başlık */}
      <section className="flex flex-col gap-6 pt-10 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={p.display_name} color={p.color} size={72} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{p.display_name}</h1>
            <p className="mt-0.5 text-sm text-muted">
              @{p.username} · {new Date(p.created_at).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })} tarihinden beri
            </p>
            {p.bio && <p className="mt-2 max-w-lg text-sm text-fg-2">{p.bio}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMe && (
            <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              Profili düzenle
            </Button>
          )}
          {myCompat && (
            <div className="panel flex items-center gap-3 px-3 py-2">
              <Sparkles className="size-4 text-accent" />
              <div>
                <p className="text-sm font-medium">Seninle uyumu %{compatPercent(myCompat.score)}</p>
                <p className="text-xs text-muted">
                  {compatLabel(compatPercent(myCompat.score))} · {myCompat.shared_dubs} sahne birlikte
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* İstatistikler */}
      <section className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-surface p-5 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Level</span>
            <Trophy className="size-4 text-muted" />
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {lv.level} <span className="text-sm font-normal text-muted">{levelTitle(lv.level)}</span>
          </p>
          <Progress value={lv.pct} className="mt-3" />
          <p className="mt-1.5 font-mono text-[11px] text-muted">
            {lv.into} / {lv.need} XP · toplam {p.xp}
          </p>
        </div>
        <div className="bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Seri</span>
            <Flame className={cx("size-4", streak && safe ? "text-accent" : "text-muted")} />
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {streak} <span className="text-sm font-normal text-muted">gün</span>
          </p>
          <p className="mt-2 text-xs text-muted">
            En iyi: {p.best_streak} gün
            {isMe && streak > 0 && !safe ? " · Bugün bir sahne tamamla" : ""}
            {isMe && streak === 0 ? " · Bugün bir sahne tamamla, seri başlasın" : ""}
          </p>
        </div>
        <Stat label="Dublaj" value={dubs.length} icon={<Clapperboard className="size-4" />} sub={`${lines} replik seslendirdi`} />
        <Stat label="Beğeni" value={likes} icon={<Heart className="size-4" />} sub="dublajlarının toplamı" />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Dublajlar */}
        <section className="min-w-0">
          <h2 className="mb-4 text-sm font-medium">Dublajlar</h2>
          {dubs.length === 0 ? (
            <div className="panel flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Mic className="size-5 text-muted" />
              <p className="text-sm text-muted">{isMe ? "Henüz tamamlanmış bir sahnen yok. Bir oda kur ya da arkadaşının odasına katıl." : "Henüz tamamlanmış bir sahne yok."}</p>
              {isMe && (
                <ButtonLink href="/sahneler" size="sm" variant="primary" className="mt-2">
                  Sahne seç
                </ButtonLink>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {dubs.map((d) => (
                <DubCard key={d.id} dub={d} highlight={p.display_name} />
              ))}
            </div>
          )}
        </section>

        {/* Uyum */}
        <aside>
          <div className="panel">
            <div className="panel-head">
              <h2 className="text-sm font-medium">Uyum</h2>
              <span className="text-xs text-muted">birlikte yapılan sahnelere göre</span>
            </div>
            {compat.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Arkadaşlarıyla sahne tamamladıkça burada en uyumlu partnerleri görünür.</p>
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {compat.map((c, i) => {
                  const pct = compatPercent(c.score);
                  return (
                    <li key={c.partner}>
                      <Link href={`/u/${c.username}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
                        <span className="w-4 text-center font-mono text-[11px] text-muted">{i + 1}</span>
                        <Avatar name={c.display_name} color={c.color} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm">{c.display_name}</span>
                            <span className="font-mono text-xs text-fg-2">%{pct}</span>
                          </div>
                          <Progress value={pct / 100} className="mt-1.5" />
                          <p className="mt-1 text-[11px] text-muted">
                            {compatLabel(pct)} · {c.shared_dubs} sahne · {c.shared_likes} beğeni
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-muted">
              Birlikte tamamlanan her sahne +10, o sahnelerin aldığı her beğeni +3 uyum puanı.
            </p>
          </div>

          <div className="panel mt-4 p-4">
            <h3 className="text-sm font-medium">XP nasıl kazanılır?</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-muted">
              <li>Sahne tamamla: 40 XP + her replik 10 XP</li>
              <li>Her partner için +10 XP (en çok 5)</li>
              <li>Günün ilk sahnesi: +20 XP + seri × 5 (en çok 50)</li>
              <li>Dublajın beğenilince: +5 XP</li>
            </ul>
          </div>
        </aside>
      </div>

      {editing && isMe && <EditProfile profile={p} onClose={() => setEditing(false)} />}
    </main>
  );
}

function Stat({ label, value, icon, sub }: { label: string; value: number; icon: React.ReactNode; sub: string }) {
  return (
    <div className="bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <span className="text-muted">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-muted">{sub}</p>
    </div>
  );
}

function EditProfile({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [name, setName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [color, setColor] = useState(profile.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await sb()
      .from("profiles")
      .update({ display_name: name.trim(), bio: bio.trim() || null, color })
      .eq("id", profile.id);
    if (error) {
      setError(errMsg(error));
      setBusy(false);
      return;
    }
    await refreshMe();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <form className="panel fade-up flex w-full max-w-md flex-col gap-4 p-5" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Profili düzenle</h2>
          <IconButton label="Kapat" type="button" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex items-center gap-3">
          <Avatar name={name || profile.username} color={color} size={48} />
          <div className="flex flex-wrap gap-1.5">
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Renk ${c}`}
                className={cx("size-6 rounded-full ring-offset-2 ring-offset-surface transition", color === c ? "ring-2 ring-fg" : "hover:scale-110")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="eyebrow mb-1.5 block" htmlFor="dn">
            Görünen ad
          </label>
          <input id="dn" className="field" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="eyebrow mb-1.5 flex justify-between" htmlFor="bio">
            <span>Hakkında</span>
            <span className="normal-case">{bio.length}/160</span>
          </label>
          <textarea id="bio" className="field h-20 resize-none py-2" maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()}>
            Kaydet
          </Button>
        </div>
      </form>
    </div>
  );
}
