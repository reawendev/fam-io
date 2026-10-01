"use client";

import { Check, Coins, Lock, Play, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AwardPlaque from "@/components/AwardPlaque";
import { Avatar, Button, ButtonLink, cx, EmptyState, Notice, PageHeader, Skeleton, UserName } from "@/components/ui";
import { refreshMe, useMe } from "@/lib/auth";
import { levelInfo } from "@/lib/progress";
import { balance, bannerClass, KIND_LABEL, PLAQUES, playJingle, type ShopItem, type ShopKind } from "@/lib/shop";
import { errMsg, sb } from "@/lib/supabase";

const KINDS: ShopKind[] = ["frame", "name", "banner", "plaque", "sound"];

export default function Magaza() {
  const me = useMe();
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<ShopKind>("frame");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const uid = me.status === "in" ? me.user.id : null;

  const load = useCallback(async () => {
    const { data, error } = await sb().from("shop_items").select("*").order("sort");
    if (error) setError(errMsg(error));
    setItems((data as ShopItem[]) ?? []);
    if (uid) {
      const { data: mine } = await sb().from("user_items").select("item_id").eq("user_id", uid);
      setOwned(new Set(((mine as { item_id: string }[]) ?? []).map((x) => x.item_id)));
    }
  }, [uid]);
  useEffect(() => {
    load();
  }, [load]);

  const profile = me.status === "in" ? me.profile : null;
  const bal = profile ? balance(profile) : 0;
  const equipped = profile?.equipped ?? {};
  const list = useMemo(() => (items ?? []).filter((i) => i.kind === kind), [items, kind]);

  async function buy(it: ShopItem) {
    if (!confirm(`${it.name} ${it.price} XP. Satın alınsın mı? (Level'in düşmez, sadece bakiyenden harcanır.)`)) return;
    setBusy(it.id);
    setError(null);
    const { error } = await sb().rpc("buy_item", { p_item: it.id });
    if (error) {
      setError(errMsg(error));
      setBusy(null);
      return;
    }
    await sb().rpc("equip_item", { p_kind: it.kind, p_item: it.id });
    await Promise.all([load(), refreshMe()]);
    setFlash(it.id);
    setTimeout(() => setFlash(null), 1600);
    setBusy(null);
  }

  async function equip(it: ShopItem, on: boolean) {
    setBusy(it.id);
    setError(null);
    const { error } = await sb().rpc("equip_item", { p_kind: it.kind, p_item: on ? it.id : null });
    if (error) setError(errMsg(error));
    await refreshMe();
    setBusy(null);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <PageHeader
        eyebrow="Kozmetik"
        title="Mağaza"
        description="Kazandığın XP ile profilini süsle. Harcamak level'ini düşürmez; bakiye = toplam XP − harcadıkların."
        actions={
          profile ? (
            <div className="panel flex items-center gap-3 px-4 py-2.5">
              <Coins className="size-5 text-accent" />
              <div>
                <p className="font-mono text-lg font-semibold leading-none">{bal} XP</p>
                <p className="mt-1 text-[11px] text-muted">
                  harcanabilir · toplam {profile.xp} · Lv {levelInfo(profile.xp).level}
                </p>
              </div>
            </div>
          ) : me.status === "out" ? (
            <ButtonLink href="/hesap?next=/magaza" variant="primary">
              Giriş yap
            </ButtonLink>
          ) : null
        }
      />

      <div className="mb-6 flex overflow-x-auto rounded-lg border border-line bg-surface p-0.5" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cx("h-9 flex-1 shrink-0 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors", kind === k ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {items === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="size-5" />} title="Mağaza boş">
          Veritabanı güncel değil olabilir: supabase/migrations/006_modlar_magaza_ekipler.sql dosyasını çalıştır.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((it) => {
            const has = it.price === 0 || owned.has(it.id);
            const on = equipped[it.kind] === it.id;
            const afford = bal >= it.price;
            return (
              <article key={it.id} className={cx("panel flex flex-col overflow-hidden transition-colors", on ? "border-accent/50" : "hover:border-line-strong", flash === it.id && "pop-in")}>
                <div className="relative flex h-36 items-center justify-center overflow-hidden border-b border-line bg-bg">
                  <Preview it={it} name={profile?.display_name ?? "Sen"} color={profile?.color} avatar={profile?.avatar_path ?? null} />
                  {on && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg">
                      <Check className="size-3" /> Takılı
                    </span>
                  )}
                </div>
                <div className="flex flex-1 items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="font-mono text-xs text-muted">{it.price === 0 ? "ücretsiz" : has ? "sende var" : `${it.price} XP`}</p>
                  </div>
                  {!profile ? null : has ? (
                    <Button size="sm" variant={on ? "ghost" : "secondary"} loading={busy === it.id} disabled={!!busy} onClick={() => equip(it, !on)}>
                      {on ? "Çıkar" : "Tak"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy === it.id}
                      disabled={!!busy || !afford}
                      icon={!afford ? <Lock className="size-3.5" /> : undefined}
                      onClick={() => buy(it)}
                      title={!afford ? `${it.price - bal} XP daha gerekli` : undefined}
                    >
                      {afford ? "Satın al" : `${it.price - bal} XP eksik`}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {profile && (
        <p className="mt-8 text-center text-xs text-muted">
          Taktıkların{" "}
          <Link href={`/u/${profile.username}`} className="text-fg-2 hover:underline">
            profilinde
          </Link>
          , lobide ve liderlik tablosunda görünür. Giriş sesi, odaya katıldığında diğerlerine çalar (imza sesin varsa o çalar).
        </p>
      )}
    </main>
  );
}

function Preview({ it, name, color, avatar }: { it: ShopItem; name: string; color?: string; avatar: string | null }) {
  if (it.kind === "frame") return <Avatar name={name} color={color} path={avatar} size={72} frame={it.id} />;
  if (it.kind === "name") return <UserName name={name} fx={it.id} className="text-3xl font-semibold tracking-tight" />;
  if (it.kind === "banner") return <div className={cx("absolute inset-0", bannerClass(it.id))} />;
  if (it.kind === "plaque") {
    const p = PLAQUES[it.id];
    return p ? <AwardPlaque eyebrow="FAM-IO · PLAKET" title={p.title} tone={p.tone} className="w-[220px]" /> : null;
  }
  return (
    <button
      onClick={() => playJingle(it.id)}
      className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg shadow-black/40 transition-transform hover:scale-105"
      aria-label={`${it.name} dinle`}
    >
      <Play className="ml-1 size-6 fill-current" />
    </button>
  );
}
