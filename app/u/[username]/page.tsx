"use client";

import { Camera, Clapperboard, Flame, Gamepad2, Heart, Pin, ImagePlus, Mic, Pencil, Play, Shield, ShoppingBag, Sparkles, Square, Trash2, Trophy, Video, Volume2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import DubCard, { DUB_CARD_SELECT, DubCardSkeleton, type DubCardData } from "@/components/DubCard";
import { SceneThumb } from "@/components/SceneBits";
import { Avatar, Button, ButtonLink, cx, EmptyState, IconButton, Notice, PROFILE_COLORS, Progress, Skeleton, UserName } from "@/components/ui";
import { squareAvatar } from "@/lib/image";
import { refreshMe, useMe } from "@/lib/auth";
import { compatLabel, compatPercent, currentStreak, levelInfo, levelTitle, streakDoneToday } from "@/lib/progress";
import { ensureUser, errMsg, publicUrl, sb } from "@/lib/supabase";
import { bannerClass, PLAQUES } from "@/lib/shop";
import Guestbook from "@/components/Guestbook";
import { fetchUserGames, GameCard, inShowcase, PinButton, type GameItem } from "@/components/Showcase";
import VoiceRecorder from "@/components/VoiceRecorder";
import { bannerImage } from "@/lib/image";
import type { Profile, SceneListItem, ShowcaseItem } from "@/lib/types";
import BadgeIcon from "@/components/BadgeIcon";
import AwardPlaque from "@/components/AwardPlaque";
import { computeBadges, featuredBadges, fetchBadgeStats, TIER_LABEL, type BadgeState } from "@/lib/badges";

type Compat = { partner: string; username: string; display_name: string; color: string; avatar_path?: string | null; shared_dubs: number; shared_likes: number; score: number };
type Row = { lines: number; dubs: DubCardData | null };
type CreatorStats = { scenes: number; plays: number; others: number; likes: number; creator_xp: number };

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const me = useMe();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dubs, setDubs] = useState<DubCardData[]>([]);
  const [lines, setLines] = useState(0);
  const [compat, setCompat] = useState<Compat[]>([]);
  const [myCompat, setMyCompat] = useState<Compat | null>(null);
  const [badges, setBadges] = useState<BadgeState[] | null>(null);
  const [creator, setCreator] = useState<CreatorStats | null>(null);
  const [scenes, setScenes] = useState<SceneListItem[]>([]);
  const [tab, setTab] = useState<"dublajlar" | "oyunlar" | "sahneler">("dublajlar");
  const [games, setGames] = useState<GameItem[] | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [dubsLoaded, setDubsLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState<{ slug: string; name: string; tag: string; color: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: p, error } = await sb().from("profiles").select("*").eq("username", decodeURIComponent(username).toLowerCase()).maybeSingle();
      if (error) throw error;
      setProfile((p as Profile) ?? null);
      if (!p) return;
      const [{ data: rows }, { data: c }, st, { data: cs }, { data: sc }] = await Promise.all([
        sb().from("dub_participants").select(`lines, dubs(${DUB_CARD_SELECT})`).eq("user_id", p.id),
        sb().rpc("compat_for", { p_user: p.id }),
        fetchBadgeStats(sb, p.id).catch(() => null),
        sb().rpc("creator_stats", { p_user: p.id }),
        sb().rpc("list_scenes", { p_creator: p.id, p_sort: "populer", p_limit: 60 }),
      ]);
      setCreator((cs as CreatorStats) ?? null);
      sb()
        .from("team_members")
        .select("teams(slug, name, tag, color)")
        .eq("user_id", p.id)
        .maybeSingle()
        .then(({ data }) => setTeam(((data as unknown as { teams: { slug: string; name: string; tag: string; color: string } } | null)?.teams) ?? null));
      setScenes(((sc as SceneListItem[]) ?? []).filter((x) => x.line_count > 0));
      fetchUserGames(p.id)
        .then(setGames)
        .catch(() => setGames([]));
      // Rozetler bağımsız: istatistik alınamazsa (ör. migration 004 yoksa) sadece rozet bölümü gizlenir
      try {
        setBadges(st ? computeBadges(st) : []);
      } catch {
        setBadges([]);
      }
      const list = ((rows as unknown as Row[]) ?? []).filter((r) => r.dubs).sort((a, b) => b.dubs!.created_at.localeCompare(a.dubs!.created_at));
      setDubs(list.map((r) => r.dubs!));
      setLines(list.reduce((s, r) => s + r.lines, 0));
      setCompat((c as Compat[]) ?? []);
      setDubsLoaded(true);
    } catch (e) {
      setError(errMsg(e));
      setDubsLoaded(true);
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

  if (profile === undefined) return <ProfileSkeleton />;
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
  const showcase: ShowcaseItem[] = (p.showcase ?? []).filter((x) =>
    x.t === "dub" ? dubs.some((d) => d.id === x.id) : (games ?? []).some((g) => g.id === x.id),
  );

  async function togglePin(t: ShowcaseItem["t"], id: string) {
    const cur = p.showcase ?? [];
    const on = inShowcase(cur, t, id);
    if (!on && cur.length >= 3) return setError("Vitrine en fazla 3 şey sabitlenebilir. Önce birini kaldır.");
    const next = on ? cur.filter((x) => !(x.t === t && x.id === id)) : [...cur, { t, id }];
    setPinBusy(true);
    setError(null);
    const { error } = await sb().rpc("set_showcase", { p_items: next });
    setPinBusy(false);
    if (error) return setError(errMsg(error));
    setProfile((pr) => (pr ? { ...pr, showcase: next } : pr));
    await refreshMe();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      {error && (
        <div className="pt-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {/* Kapak + başlık: kapak üstte, sadece profil fotoğrafı kapağın altına taşar */}
      <section className="relative -mx-4 mb-6 overflow-hidden border-b border-line bg-surface sm:mx-0 sm:mt-6 sm:rounded-[var(--radius-card)] sm:border">
        <div className="relative h-32 sm:h-48">
          {p.banner_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={publicUrl("avatars", p.banner_path)} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className={cx("absolute inset-0", p.equipped?.banner ? bannerClass(p.equipped.banner) : "bg-[radial-gradient(900px_200px_at_85%_0%,#ff7a1a22,transparent),linear-gradient(180deg,#18181b,#111113)]")} />
          )}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/45 to-transparent" />
          {team && (
            <Link
              href={`/ekip/${team.slug}`}
              className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium backdrop-blur-sm hover:bg-black/75"
              style={{ color: team.color }}
            >
              <Shield className="size-3.5" /> [{team.tag}] {team.name}
            </Link>
          )}
        </div>

        <div className="relative z-10 px-4 pb-5 sm:px-6">
          <div className="-mt-11 flex items-end justify-between gap-3 sm:-mt-14">
            <span className="shrink-0 rounded-full bg-surface p-1">
              <Avatar name={p.display_name} color={p.color} path={p.avatar_path} size={96} frame={p.equipped?.frame} className="ring-1 ring-line-strong" />
            </span>
            {isMe && (
              <div className="flex flex-wrap justify-end gap-2 pb-1">
                <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                  Profili düzenle
                </Button>
                <ButtonLink href="/magaza" size="sm" variant="ghost" icon={<ShoppingBag className="size-3.5" />}>
                  Mağaza
                </ButtonLink>
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight sm:text-[28px]">
                  <UserName name={p.display_name} fx={p.equipped?.name} />
                </h1>
                {p.voice_path && <VoiceButton path={p.voice_path} />}
                {badges &&
                  featuredBadges(badges).map((b) => (
                    <span key={b.id} title={`${b.name}${b.note ? " · " + b.note : ""} — ${b.desc}`}>
                      <BadgeIcon id={b.id} tier={b.tier} icon={b.icon} size={28} />
                    </span>
                  ))}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span>
                  @{p.username} · {new Date(p.created_at).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })} tarihinden beri
                </span>
                {creator && creator.scenes > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-fg-2" title="Kütüphaneye sahne ekledi">
                    <Video className="size-3" /> Yapımcı · {creator.scenes} sahne
                  </span>
                )}
              </p>
              {p.bio && <p className="mt-2 max-w-lg text-sm text-fg-2">{p.bio}</p>}
            </div>

            {(badges?.some((b) => b.id === "kurucu" && b.earned) || (p.equipped?.plaque && PLAQUES[p.equipped.plaque]) || myCompat) && (
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {badges?.some((b) => b.id === "kurucu" && b.earned) && <AwardPlaque eyebrow="FAM-IO · ÖZEL ROZET" title="Kurucu" tone="gold" />}
                {p.equipped?.plaque && PLAQUES[p.equipped.plaque] && (
                  <AwardPlaque eyebrow="FAM-IO · PLAKET" title={PLAQUES[p.equipped.plaque].title} tone={PLAQUES[p.equipped.plaque].tone} />
                )}
                {myCompat && (
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2">
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
            )}
          </div>
        </div>
      </section>

      {/* Vitrin */}
      {(showcase.length > 0 || (isMe && dubsLoaded && (dubs.length > 0 || (games?.length ?? 0) > 0))) && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <Pin className="size-4 text-accent" />
            <h2 className="text-sm font-medium">Vitrin</h2>
            {isMe && <span className="text-xs text-muted">{showcase.length}/3</span>}
          </div>
          {showcase.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-5 text-center text-sm text-muted">
              Dublajlarındaki ya da oyunlarındaki iğne düğmesiyle en sevdiğin 3 şeyi buraya sabitle.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {showcase.map((x) => {
                const d = x.t === "dub" ? dubs.find((y) => y.id === x.id) : undefined;
                const g = x.t !== "dub" ? games?.find((y) => y.id === x.id) : undefined;
                return (
                  <div key={x.t + x.id} className="relative">
                    {d ? <DubCard dub={d} highlight={p.display_name} /> : g ? <GameCard g={g} /> : null}
                    {isMe && <PinButton on disabled={pinBusy} onClick={() => togglePin(x.t, x.id)} />}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

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

      {badges === null ? (
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-[var(--radius-card)]" />
          ))}
        </section>
      ) : (
        badges.length > 0 && <BadgeGrid badges={badges} isMe={!!isMe} />
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Dublajlar / Sahneleri */}
        <section className="min-w-0">
          <div className="mb-4 flex items-center gap-1 border-b border-line" role="tablist">
            <TabBtn on={tab === "dublajlar"} onClick={() => setTab("dublajlar")} count={dubs.length}>
              Dublajlar
            </TabBtn>
            {((games?.length ?? 0) > 0 || isMe) && (
              <TabBtn on={tab === "oyunlar"} onClick={() => setTab("oyunlar")} count={games?.length ?? 0}>
                Oyunlar
              </TabBtn>
            )}
            {(scenes.length > 0 || isMe) && (
              <TabBtn on={tab === "sahneler"} onClick={() => setTab("sahneler")} count={scenes.length}>
                Eklediği sahneler
              </TabBtn>
            )}
          </div>
          {tab === "dublajlar" ? (
            !dubsLoaded ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <DubCardSkeleton />
                <DubCardSkeleton />
              </div>
            ) : dubs.length === 0 ? (
              <EmptyState
                icon={<Mic className="size-5" />}
                title={isMe ? "Henüz tamamlanmış bir sahnen yok" : "Henüz dublaj yok"}
                action={
                  isMe && (
                    <ButtonLink href="/sahneler" size="sm" variant="primary">
                      Sahne seç
                    </ButtonLink>
                  )
                }
              >
                {isMe ? "Bir oda kur ya da arkadaşının odasına katıl. Tamamladığın her sahne buraya işlenir." : "Tamamladığı sahneler burada görünecek."}
              </EmptyState>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {dubs.map((d) => (
                  <div key={d.id} className="relative">
                    <DubCard dub={d} highlight={p.display_name} />
                    {isMe && <PinButton on={inShowcase(p.showcase, "dub", d.id)} disabled={pinBusy} onClick={() => togglePin("dub", d.id)} />}
                  </div>
                ))}
              </div>
            )
          ) : tab === "oyunlar" ? (
            games === null ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-28 rounded-[var(--radius-card)]" />
                <Skeleton className="h-28 rounded-[var(--radius-card)]" />
              </div>
            ) : games.length === 0 ? (
              <EmptyState
                icon={<Gamepad2 className="size-5" />}
                title={isMe ? "Henüz sahnesiz oyun oynamadın" : "Henüz oyun yok"}
                action={
                  isMe && (
                    <ButtonLink href="/oyna" size="sm" variant="primary">
                      Oyun kur
                    </ButtonLink>
                  )
                }
              >
                Kulaktan kulağa, Kim konuştu?, Efekt yarışması, Duygu ruleti ve Sesli hikâye oyunları burada görünür.
              </EmptyState>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {games.map((g) => (
                  <div key={g.id} className="relative">
                    <GameCard g={g} />
                    {isMe && <PinButton on={inShowcase(p.showcase, g.t, g.id)} disabled={pinBusy} onClick={() => togglePin(g.t, g.id)} />}
                  </div>
                ))}
              </div>
            )
          ) : (
            <CreatorPanel stats={creator} scenes={scenes} isMe={!!isMe} />
          )}
        </section>

        {/* Uyum */}
        <aside className="flex flex-col gap-4">
          <Guestbook profileId={p.id} ownerName={p.display_name} isOwner={!!isMe} />
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
                        <Avatar name={c.display_name} color={c.color} path={c.avatar_path} size={28} />
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
              <li>Oylamada aldığın her oy: +10 XP</li>
            </ul>
            <h3 className="mt-4 text-sm font-medium">Yapımcı XP&apos;si</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-muted">
              <li>Eklediğin sahne başkalarınca tamamlanınca: +15 XP</li>
              <li>O sahneden çıkan dublaj beğenilince: +2 XP</li>
            </ul>
          </div>
        </aside>
      </div>

      {editing && isMe && <EditProfile profile={p} onClose={() => setEditing(false)} />}
    </main>
  );
}

function BadgeGrid({ badges, isMe }: { badges: BadgeState[]; isMe: boolean }) {
  const [all, setAll] = useState(false);
  const earned = badges.filter((b) => b.earned);
  // Kazanılmamış özel rozetleri gösterme (onlar elle verilir); diğerlerini ilerlemesiyle göster
  const locked = badges.filter((b) => !b.earned && !b.special);
  const shown = all ? [...earned, ...locked] : [...earned, ...locked.sort((a, b) => b.current / b.goal - a.current / a.goal).slice(0, Math.max(0, 8 - earned.length))];
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          Rozetler <span className="ml-1 font-mono text-xs text-muted">{earned.length}/{earned.length + locked.length}</span>
        </h2>
        {locked.length > 0 && (
          <button className="text-xs text-muted hover:text-fg" onClick={() => setAll((a) => !a)}>
            {all ? "Daha az göster" : "Tümünü göster"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((b) => (
          <div key={b.id} className={cx("panel flex items-center gap-3 p-3", !b.earned && "border-dashed")}>
            <BadgeIcon id={b.id} tier={b.tier} icon={b.icon} size={48} locked={!b.earned} />
            <div className="min-w-0 flex-1">
              <p className={cx("truncate text-sm font-medium", !b.earned && "text-fg-2")}>{b.name}</p>
              <p className="line-clamp-2 text-[11px] leading-snug text-muted">{b.note ?? b.desc}</p>
              {b.earned ? (
                <p className="mt-1 font-mono text-[10px] tracking-wide text-muted uppercase">{TIER_LABEL[b.tier]}</p>
              ) : (
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={b.current / b.goal} className="h-0.5" />
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {b.current}/{b.goal}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {isMe && earned.length === 0 && <p className="mt-3 text-xs text-muted">İlk dublajını tamamlayınca ilk rozetini alırsın.</p>}
    </section>
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
  // undefined: değişmedi · null: kaldırılacak · Blob: yeni fotoğraf
  const [photo, setPhoto] = useState<{ blob: Blob; ext: string; url: string } | null | undefined>(undefined);
  const [banner, setBanner] = useState<{ blob: Blob; ext: string; url: string } | null | undefined>(undefined);
  const [voice, setVoice] = useState<{ blob: Blob; ext: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const r = await squareAvatar(file);
      setPhoto({ ...r, url: URL.createObjectURL(r.blob) });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function pickBanner(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const r = await bannerImage(file);
      setBanner({ ...r, url: URL.createObjectURL(r.blob) });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function uploadAs(kind: string, blob: Blob, ext: string) {
    const path = `${profile.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await sb().storage.from("avatars").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
    if (error) throw error;
    return path;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const patch: Partial<Profile> = { display_name: name.trim(), bio: bio.trim() || null, color };
      if (banner) patch.banner_path = await uploadAs("banner", banner.blob, banner.ext);
      else if (banner === null) patch.banner_path = null;
      if (voice) patch.voice_path = await uploadAs("voice", voice.blob, voice.ext);
      else if (voice === null) patch.voice_path = null;
      if (photo) {
        const path = `${profile.id}/${Date.now()}.${photo.ext}`;
        const { error: up } = await sb().storage.from("avatars").upload(path, photo.blob, { contentType: photo.blob.type, cacheControl: "31536000" });
        if (up) throw up;
        patch.avatar_path = path;
      } else if (photo === null) {
        patch.avatar_path = null;
      }
      const { error } = await sb().from("profiles").update(patch).eq("id", profile.id);
      if (error) throw error;
      // Eski dosyaları sil (depolama dolmasın)
      const old = [
        photo !== undefined && profile.avatar_path,
        banner !== undefined && profile.banner_path,
        voice !== undefined && profile.voice_path,
      ].filter(Boolean) as string[];
      if (old.length) sb().storage.from("avatars").remove(old).catch(() => {});
      await refreshMe();
      onClose();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  const previewSrc = photo ? photo.url : photo === null ? null : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <form className="panel pop-in flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Profili düzenle</h2>
          <IconButton label="Kapat" type="button" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex items-center gap-4">
          <label className="group relative cursor-pointer rounded-full" title="Profil fotoğrafı seç">
            <Avatar
              name={name || profile.username}
              color={color}
              path={previewSrc === undefined ? profile.avatar_path : null}
              src={previewSrc ?? undefined}
              size={64}
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <Camera className="size-5" />
            </span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <label className={cx("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-3 text-[13px] hover:bg-surface-3")}>
                <Camera className="size-3.5" /> Fotoğraf seç
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
              {(photo || (photo === undefined && profile.avatar_path)) && (
                <Button type="button" size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setPhoto(null)}>
                  Kaldır
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted">Kare olarak kırpılır ve küçültülür. Fotoğraf yoksa baş harfin renkli gösterilir.</p>
          </div>
        </div>
        <div>
          <span className="eyebrow mb-1.5 block">Kapak görseli</span>
          <div className="relative h-20 overflow-hidden rounded-lg border border-line">
            {banner || (banner === undefined && profile.banner_path) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner ? banner.url : publicUrl("avatars", profile.banner_path!)} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className={cx("absolute inset-0", profile.equipped?.banner ? bannerClass(profile.equipped.banner) : "bg-surface-2")} />
            )}
            <div className="absolute right-2 bottom-2 flex gap-1.5">
              <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-black/70 px-2 text-xs hover:bg-black/85">
                <ImagePlus className="size-3.5" /> Görsel seç
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickBanner(e.target.files?.[0])} />
              </label>
              {(banner || (banner === undefined && profile.banner_path)) && (
                <button type="button" className="inline-flex h-7 items-center rounded-md bg-black/70 px-2 text-xs hover:bg-black/85" onClick={() => setBanner(null)}>
                  Kaldır
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted">3:1 oranında kırpılır. Görsel yoksa mağazadan aldığın hazır kapak görünür.</p>
        </div>
        <div>
          <span className="eyebrow mb-1.5 block">İmza sesi</span>
          <VoiceRecorder
            value={voice === null ? null : profile.voice_path ? publicUrl("avatars", profile.voice_path) : null}
            onChange={(blob, ext) => setVoice({ blob, ext })}
            onRemove={() => setVoice(null)}
          />
          <p className="mt-1 text-[11px] text-muted">5 saniyelik selamın. Profilinde dinlenir, odaya katıldığında diğerlerine çalar.</p>
        </div>
        <DiscordLink />
        <div>
          <span className="eyebrow mb-1.5 block">Renk</span>
          <div className="flex flex-wrap gap-1.5">
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Renk ${c}`}
                aria-pressed={color === c}
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

function TabBtn({ on, onClick, count, children }: { on: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cx(
        "-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors",
        on ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
      )}
    >
      {children}
      <span className="font-mono text-xs text-muted">{count}</span>
    </button>
  );
}

function CreatorPanel({ stats, scenes, isMe }: { stats: CreatorStats | null; scenes: SceneListItem[]; isMe: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function play(id: string) {
    setBusy(id);
    setError(null);
    try {
      await ensureUser();
      const { data, error } = await sb().rpc("create_room", { p_scene: id, p_nickname: "" });
      if (error) throw error;
      router.push(`/oda/${data}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(null);
    }
  }
  if (scenes.length === 0)
    return (
      <EmptyState
        icon={<Video className="size-5" />}
        title={isMe ? "Henüz sahne eklemedin" : "Henüz sahne eklememiş"}
        action={
          isMe && (
            <ButtonLink href="/sahneler/yeni" size="sm" variant="primary">
              Sahne ekle
            </ButtonLink>
          )
        }
      >
        {isMe ? "Eklediğin sahne başkaları tarafından her tamamlandığında +15 XP kazanırsın." : "Kütüphaneye eklediği sahneler burada görünür."}
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-4">
          {[
            ["Sahne", stats.scenes],
            ["Oynanma", stats.plays],
            ["Beğeni", stats.likes],
            ["Yapımcı XP", stats.creator_xp],
          ].map(([l, v]) => (
            <div key={l} className="bg-surface px-4 py-3">
              <p className="eyebrow">{l}</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{v}</p>
            </div>
          ))}
        </div>
      )}
      {error && <Notice>{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {scenes.map((s) => (
          <div key={s.id} className="panel flex flex-col overflow-hidden">
            <SceneThumb videoPath={s.video_path} thumbPath={s.thumb_path}>
              <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
                <Play className="size-3 fill-current" /> {s.dub_count}
              </span>
            </SceneThumb>
            <div className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.title}</p>
                <p className="truncate text-[11px] text-muted">
                  {s.role_count} karakter{s.tags.length ? " · " + s.tags.map((t) => "#" + t).join(" ") : ""}
                </p>
              </div>
              <Button size="sm" loading={busy === s.id} disabled={!!busy} onClick={() => play(s.id)}>
                Oda kur
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6" aria-busy="true" aria-label="Profil yükleniyor">
      <section className="flex items-center gap-4 pt-10 pb-8">
        <Skeleton className="size-[72px] rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </section>
      <Skeleton className="h-36 w-full rounded-[var(--radius-card)]" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:w-2/3">
        <DubCardSkeleton />
        <DubCardSkeleton />
      </div>
    </main>
  );
}

function VoiceButton({ path }: { path: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  return (
    <button
      className={cx("inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors", playing ? "border-accent/60 bg-accent/10 text-accent" : "border-line-strong text-fg-2 hover:text-fg")}
      title="İmza sesini dinle"
      onClick={() => {
        if (playing) {
          ref.current?.pause();
          return setPlaying(false);
        }
        const a = new Audio(publicUrl("avatars", path));
        ref.current = a;
        a.onended = () => setPlaying(false);
        a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }}
    >
      {playing ? <Square className="size-3" /> : <Volume2 className="size-3.5" />} İmza sesi
    </button>
  );
}

function DiscordLink() {
  const me = useMe();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = me.status === "in" ? me.user.id : null;
  useEffect(() => {
    if (!uid) return;
    sb()
      .from("discord_links")
      .select("discord_id")
      .eq("user_id", uid)
      .maybeSingle()
      .then(({ data, error }) => setLinked(error ? null : !!data));
  }, [uid]);
  if (linked === null) return null;
  return (
    <div>
      <span className="eyebrow mb-1.5 block">Discord</span>
      {linked ? (
        <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
          <span className="text-ok">Discord hesabın bağlı</span>
          <button
            type="button"
            className="text-xs text-muted hover:text-fg"
            onClick={async () => {
              await sb().rpc("discord_unlink");
              setLinked(false);
            }}
          >
            Bağlantıyı kaldır
          </button>
        </div>
      ) : code ? (
        <div className="rounded-lg border border-accent/40 bg-accent/[0.06] px-3 py-2 text-sm">
          Discord&apos;da şunu yaz: <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-accent">/baglan kod:{code}</code>
          <p className="mt-1 text-[11px] text-muted">Kod 10 dakika geçerli. Bağlanınca Discord&apos;dan /dublaj ile oda kurabilirsin.</p>
        </div>
      ) : (
        <Button
          size="sm"
          type="button"
          onClick={async () => {
            setError(null);
            const { data, error } = await sb().rpc("discord_link_code");
            if (error) setError(errMsg(error));
            else setCode(String(data));
          }}
        >
          Discord&apos;u bağla
        </Button>
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
