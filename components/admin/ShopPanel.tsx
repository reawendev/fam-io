"use client";

import { Save, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, cx, Notice, Skeleton, UserName } from "@/components/ui";
import { bannerClass, KIND_LABEL, type ShopItem, type ShopKind } from "@/lib/shop";
import { errMsg, sb } from "@/lib/supabase";
import { Panel, type Msg } from "./Panel";

const KINDS: ShopKind[] = ["frame", "name", "banner"];

/** Mağaza: çerçeve, isim efekti ve kapakların adı / fiyatı / sırası (plaket ve sesler kendi bölümlerinde) */
export default function ShopPanel() {
  const [rows, setRows] = useState<ShopItem[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { name: string; price: string; sort: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [kind, setKind] = useState<ShopKind>("frame");

  const load = useCallback(async () => {
    const { data, error } = await sb().from("shop_items").select("*").in("kind", KINDS).order("sort");
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    const list = (data as ShopItem[]) ?? [];
    setRows(list);
    setDraft(Object.fromEntries(list.map((r) => [r.id, { name: r.name, price: String(r.price), sort: String(r.sort) }])));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(it: ShopItem) {
    const d = draft[it.id];
    setBusy(it.id);
    setMsg(null);
    const { error } = await sb().rpc("admin_update_item", {
      p_id: it.id,
      p_name: d.name,
      p_price: Math.max(0, Math.trunc(Number(d.price) || 0)),
      p_sort: d.sort === "" ? null : Math.trunc(Number(d.sort) || 0),
    });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: `${d.name} kaydedildi.` });
    load();
  }

  const list = (rows ?? []).filter((r) => r.kind === kind);

  return (
    <Panel icon={<ShoppingBag className="size-4" />} title="Mağaza ürünleri">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cx("h-8 rounded-md px-3 text-[13px] transition-colors", kind === k ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Ad, fiyat ve sıra. Fiyatı 0 yaparsan herkese bedava olur. Görünüşleri kodda; plaketler ve sesler aşağıda ayrı.</p>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {rows === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {list.map((it) => {
              const d = draft[it.id] ?? { name: it.name, price: String(it.price), sort: String(it.sort) };
              const dirty = d.name !== it.name || d.price !== String(it.price) || d.sort !== String(it.sort);
              return (
                <li key={it.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="flex w-28 shrink-0 items-center justify-center">
                    {it.kind === "frame" ? (
                      <Avatar name="Ö" size={36} frame={it.id} />
                    ) : it.kind === "name" ? (
                      <UserName name="Örnek" fx={it.id} className="text-sm font-semibold" />
                    ) : (
                      <span className={cx("block h-8 w-24 rounded-md", bannerClass(it.id))} />
                    )}
                  </span>
                  <input
                    className="field h-8 min-w-36 flex-1 text-[13px]"
                    value={d.name}
                    maxLength={60}
                    onChange={(e) => setDraft({ ...draft, [it.id]: { ...d, name: e.target.value } })}
                  />
                  <label className="flex items-center gap-1 text-[11px] text-muted">
                    XP
                    <input
                      className="field h-8 w-20 px-2 font-mono text-[13px]"
                      inputMode="numeric"
                      value={d.price}
                      onChange={(e) => setDraft({ ...draft, [it.id]: { ...d, price: e.target.value.replace(/[^0-9]/g, "") } })}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-muted">
                    Sıra
                    <input
                      className="field h-8 w-14 px-2 font-mono text-[13px]"
                      inputMode="numeric"
                      value={d.sort}
                      onChange={(e) => setDraft({ ...draft, [it.id]: { ...d, sort: e.target.value.replace(/[^0-9-]/g, "") } })}
                    />
                  </label>
                  <Button size="sm" icon={<Save className="size-3.5" />} loading={busy === it.id} disabled={!dirty || !!busy} onClick={() => save(it)}>
                    Kaydet
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
