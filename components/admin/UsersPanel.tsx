"use client";

import { Check, Coins, ExternalLink, History, Minus, Package, Plus, RotateCcw, Sparkles, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BadgeIcon from "@/components/BadgeIcon";
import { Avatar, Button, cx, Notice, Progress, Skeleton, UserName } from "@/components/ui";
import { BADGES } from "@/lib/badges";
import { levelInfo, timeAgo } from "@/lib/progress";
import { KIND_LABEL, type ShopItem, type ShopKind } from "@/lib/shop";
import { errMsg, sb } from "@/lib/supabase";
import type { Equipped } from "@/lib/types";
import { Panel, type Msg } from "./Panel";

type Row = { id: string; username: string; display_name: string; color: string; avatar_path: string | null; xp: number; created_at: string; badges: string[] };
type Detail = {
  id: string;
  username: string;
  display_name: string;
  color: string;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  voice_path: string | null;
  xp: number;
  spent: number;
  equipped: Equipped;
  streak: number;
  created_at: string;
  items: string[];
  badges: string[];
  week_xp: number;
  events: { amount: number; reason: string; at: string }[];
};

const REASON: Record<string, string> = {
  dublaj: "Dublaj",
  begeni: "Beğeni",
  oy: "Oy",
  yapimci: "Yapımcı",
  yapimci_begeni: "Yapımcı beğenisi",
  yonetim: "Yönetim",
  seri: "Seri",
  duello: "Düello",
  hain: "Hain",
  kulak: "Kulaktan kulağa",
  parti: "Parti",
  hikaye: "Hikâye",
  istek: "İstek",
};
const KINDS: ShopKind[] = ["frame", "name", "plaque", "banner", "sound", "board"];

/** Üyeler: XP ekle / çıkar / ayarla, bakiye, eşyalar, profil düzeltme */
export default function UsersPanel() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async (query: string) => {
    const { data, error } = await sb().rpc("admin_users", { p_q: query || null });
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setRows((data as Row[]) ?? []);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <Panel icon={<UserCog className="size-4" />} title="Üyeler ve XP">
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-line lg:border-r lg:border-b-0">
          <div className="border-b border-line p-3">
            <input className="field" placeholder="Üye ara (ad / kullanıcı adı)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {rows === null ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted">
              <Users className="size-4" /> Üye bulunamadı.
            </p>
          ) : (
            <ul className="max-h-[520px] overflow-auto p-1.5">
              {[...rows]
                .sort((a, b) => b.xp - a.xp)
                .map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => setSel(u.id)}
                      className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors", sel === u.id ? "bg-surface-3" : "hover:bg-surface-2")}
                    >
                      <Avatar name={u.display_name} color={u.color} path={u.avatar_path} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{u.display_name}</span>
                        <span className="block truncate text-[11px] text-muted">@{u.username}</span>
                      </span>
                      <span className="font-mono text-xs text-fg-2">{u.xp}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          {msg && (
            <div className="p-4 pb-0">
              <Notice tone={msg.tone}>{msg.text}</Notice>
            </div>
          )}
          {sel ? (
            <UserDetail key={sel} id={sel} onChanged={() => load(q.trim())} />
          ) : (
            <p className="flex h-full min-h-48 items-center justify-center p-6 text-center text-sm text-muted">Soldan bir üye seç: XP, bakiye, eşyalar ve profilini buradan yönetirsin.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function UserDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [amount, setAmount] = useState("100");
  const [exact, setExact] = useState("");
  const [bal, setBal] = useState("100");
  const [prof, setProf] = useState({ display_name: "", color: "#ff7a1a", bio: "" });

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("admin_user_detail", { p_user: id });
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    const x = data as Detail;
    setD(x);
    setExact(String(x.xp));
    setProf({ display_name: x.display_name, color: x.color, bio: x.bio ?? "" });
  }, [id]);
  useEffect(() => {
    load();
    sb()
      .from("shop_items")
      .select("*")
      .order("sort")
      .then(({ data }) => setItems((data as ShopItem[]) ?? []));
  }, [load]);

  async function run(key: string, fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    setBusy(key);
    setMsg(null);
    const { error } = await fn();
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: ok });
    await load();
    onChanged();
  }

  if (!d)
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  const lv = levelInfo(d.xp);
  const balance = d.xp - d.spent;
  const n = Math.trunc(Number(amount) || 0);
  const owned = new Set(d.items);

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Başlık */}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={d.display_name} color={d.color} path={d.avatar_path} size={56} frame={d.equipped?.frame} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold tracking-tight">
            <UserName name={d.display_name} fx={d.equipped?.name} />
          </p>
          <p className="text-xs text-muted">
            @{d.username} · {timeAgo(d.created_at)} katıldı
          </p>
        </div>
        <Link href={`/u/${d.username}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg" target="_blank">
          Profil <ExternalLink className="size-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {(
          [
            ["Toplam XP", d.xp],
            ["Level", lv.level],
            ["Bakiye", balance],
            ["Son 7 gün", d.week_xp],
          ] as const
        ).map(([l, v]) => (
          <div key={l} className="bg-surface p-3">
            <p className="eyebrow">{l}</p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight">{v}</p>
          </div>
        ))}
      </div>
      <div>
        <Progress value={lv.pct} />
        <p className="mt-1 font-mono text-[11px] text-muted">
          Lv{lv.level} · {lv.into}/{lv.need} XP · sonraki levele {lv.need - lv.into} XP
        </p>
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {/* XP */}
      <section className="rounded-lg border border-line p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          <Sparkles className="size-3.5 text-accent" /> XP ekle / çıkar
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className="field h-9 w-28 font-mono" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))} />
          {[50, 100, 500, 1000].map((v) => (
            <button key={v} className="h-8 rounded-md border border-line px-2 font-mono text-xs text-muted hover:border-line-strong hover:text-fg" onClick={() => setAmount(String(v))}>
              {v}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="size-3.5" />}
            loading={busy === "add"}
            disabled={!n || !!busy}
            onClick={() => run("add", () => sb().rpc("admin_adjust_xp", { p_user: id, p_amount: Math.abs(n), p_note: null }), `+${Math.abs(n)} XP eklendi.`)}
          >
            {Math.abs(n) || ""} XP ekle
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Minus className="size-3.5" />}
            loading={busy === "sub"}
            disabled={!n || !!busy}
            onClick={() => run("sub", () => sb().rpc("admin_adjust_xp", { p_user: id, p_amount: -Math.abs(n), p_note: null }), `−${Math.abs(n)} XP çıkarıldı.`)}
          >
            {Math.abs(n) || ""} XP çıkar
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs text-muted">XP&apos;yi doğrudan ayarla</span>
          <input className="field h-8 w-28 font-mono text-[13px]" inputMode="numeric" value={exact} onChange={(e) => setExact(e.target.value.replace(/[^0-9]/g, ""))} />
          <Button
            size="sm"
            loading={busy === "set"}
            disabled={exact === "" || Number(exact) === d.xp || !!busy}
            onClick={() => {
              if (!confirm(`@${d.username} XP'si ${d.xp} → ${exact} olsun mu?`)) return;
              run("set", () => sb().rpc("admin_set_xp", { p_user: id, p_xp: Number(exact) }), `XP ${exact} yapıldı.`);
            }}
          >
            Ayarla
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted">XP değişiklikleri haftalık liderliğe &quot;Yönetim&quot; olarak işlenir. Level XP&apos;den hesaplanır.</p>
      </section>

      {/* Bakiye */}
      <section className="rounded-lg border border-line p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          <Coins className="size-3.5 text-amber-300" /> Mağaza bakiyesi
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Bakiye = XP − harcanan ({d.spent}). Bakiyeyi değiştirmek level&apos;i etkilemez.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className="field h-8 w-28 font-mono text-[13px]" inputMode="numeric" value={bal} onChange={(e) => setBal(e.target.value.replace(/[^0-9]/g, ""))} />
          <Button
            size="sm"
            icon={<Plus className="size-3.5" />}
            loading={busy === "bal+"}
            disabled={!Number(bal) || !!busy}
            onClick={() => run("bal+", () => sb().rpc("admin_adjust_balance", { p_user: id, p_amount: Number(bal) }), `Bakiyeye ${bal} eklendi.`)}
          >
            Ver
          </Button>
          <Button
            size="sm"
            icon={<Minus className="size-3.5" />}
            loading={busy === "bal-"}
            disabled={!Number(bal) || !!busy}
            onClick={() => run("bal-", () => sb().rpc("admin_adjust_balance", { p_user: id, p_amount: -Number(bal) }), `Bakiyeden ${bal} alındı.`)}
          >
            Al
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="size-3.5" />}
            loading={busy === "bal0"}
            disabled={d.spent === 0 || !!busy}
            onClick={() => run("bal0", () => sb().rpc("admin_adjust_balance", { p_user: id, p_amount: d.spent }), "Harcanan sıfırlandı: bakiye = XP.")}
          >
            Harcananı sıfırla
          </Button>
        </div>
      </section>

      {/* Eşyalar */}
      <section className="rounded-lg border border-line p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          <Package className="size-3.5 text-muted" /> Eşyalar <span className="font-mono text-xs font-normal text-muted">{d.items.length}</span>
        </p>
        <p className="mt-1 text-[11px] text-muted">Tıkla: sahip değilse bedava verilir, sahipse geri alınır (takılıysa çıkarılır).</p>
        <div className="mt-2 flex flex-col gap-2.5">
          {KINDS.map((k) => {
            const list = items.filter((i) => i.kind === k && (i.price > 0 || owned.has(i.id)));
            if (!list.length) return null;
            return (
              <div key={k}>
                <p className="eyebrow mb-1">{KIND_LABEL[k]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((i) => {
                    const has = owned.has(i.id);
                    const on = Object.values(d.equipped ?? {}).includes(i.id);
                    return (
                      <button
                        key={i.id}
                        disabled={!!busy}
                        onClick={() =>
                          has
                            ? run("it" + i.id, () => sb().rpc("admin_take_item", { p_user: id, p_item: i.id }), `${i.name} geri alındı.`)
                            : run("it" + i.id, () => sb().rpc("admin_give_item", { p_user: id, p_item: i.id }), `${i.name} verildi.`)
                        }
                        className={cx(
                          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors disabled:opacity-50",
                          has ? "border-ok/40 bg-ok/10 text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
                        )}
                        title={has ? "Geri al" : "Ver"}
                      >
                        {has && <Check className="size-3 text-ok" />}
                        {i.name.replace(/^(Plaket|Giriş sesi|Kapak): /, "")}
                        {on && <span className="text-[10px] text-accent">takılı</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Profil */}
      <section className="rounded-lg border border-line p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          <UserCog className="size-3.5 text-muted" /> Profil
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input className="field h-9" maxLength={30} value={prof.display_name} onChange={(e) => setProf({ ...prof, display_name: e.target.value })} placeholder="Görünen ad" />
          <label className="flex items-center gap-2 text-xs text-muted">
            Renk
            <input type="color" value={prof.color} onChange={(e) => setProf({ ...prof, color: e.target.value })} className="h-9 w-12 cursor-pointer rounded-md border border-line bg-bg" />
          </label>
        </div>
        <textarea className="field mt-2 h-16 resize-none py-2" maxLength={160} value={prof.bio} onChange={(e) => setProf({ ...prof, bio: e.target.value })} placeholder="Biyografi" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            loading={busy === "prof"}
            disabled={!!busy || !prof.display_name.trim()}
            onClick={() =>
              run(
                "prof",
                () => sb().rpc("admin_update_profile", { p_user: id, p_display_name: prof.display_name, p_color: prof.color, p_bio: prof.bio }),
                "Profil kaydedildi.",
              )
            }
          >
            Kaydet
          </Button>
          {(
            [
              ["avatar", "Fotoğrafı kaldır", !!d.avatar_path],
              ["banner", "Kapağı kaldır", !!d.banner_path],
              ["voice", "İmza sesini kaldır", !!d.voice_path],
              ["equipped", "Takılanları çıkar", Object.keys(d.equipped ?? {}).length > 0],
            ] as const
          ).map(([k, label, on]) => (
            <Button
              key={k}
              size="sm"
              variant="ghost"
              disabled={!on || !!busy}
              loading={busy === "clr" + k}
              onClick={() => {
                if (!confirm(`@${d.username}: ${label}?`)) return;
                run("clr" + k, () => sb().rpc("admin_update_profile", { p_user: id, ["p_clear_" + k]: true }), `${label}: tamam.`);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </section>

      {/* Rozetler */}
      {d.badges.length > 0 && (
        <section>
          <p className="eyebrow mb-2">Özel rozetler</p>
          <div className="flex flex-wrap gap-1.5">
            {d.badges.map((b) => {
              const def = BADGES.find((x) => x.id === b);
              return (
                <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs" title={def?.name ?? b}>
                  <BadgeIcon id={b} tier={def?.tier ?? "ozel"} icon={def?.icon ?? "Award"} size={18} />
                  {def?.name ?? b}
                </span>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted">Vermek / almak için aşağıdaki &quot;Özel rozetler&quot; bölümünü kullan.</p>
        </section>
      )}

      {/* Hareketler */}
      <section>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
          <History className="size-3.5 text-muted" /> Son XP hareketleri
        </p>
        {d.events.length === 0 ? (
          <p className="text-xs text-muted">Henüz yok.</p>
        ) : (
          <ul className="max-h-56 divide-y divide-line overflow-auto rounded-lg border border-line">
            {d.events.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <span className={cx("w-14 font-mono", e.amount >= 0 ? "text-ok" : "text-red-300")}>
                  {e.amount >= 0 ? "+" : ""}
                  {e.amount}
                </span>
                <span className="flex-1 text-fg-2">{REASON[e.reason] ?? e.reason}</span>
                <span className="text-muted">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
