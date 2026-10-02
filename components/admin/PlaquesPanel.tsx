"use client";

import { Award, Pipette, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import AwardPlaque, { PLAQUE_TONES, type PlaqueColors } from "@/components/AwardPlaque";
import { Button, cx, Notice, Skeleton } from "@/components/ui";
import { loadPlaques, paletteFrom, PLAQUE_EYEBROW, plaqueLook, type ShopItem } from "@/lib/shop";
import { errMsg, sb } from "@/lib/supabase";
import { Panel, type Msg } from "./Panel";

type Draft = { id: string | null; name: string; price: string; title: string; eyebrow: string; colors: PlaqueColors };

const COLOR_FIELDS: { k: keyof PlaqueColors; label: string }[] = [
  { k: "bg1", label: "Zemin (açık)" },
  { k: "bg2", label: "Zemin (koyu)" },
  { k: "ink", label: "Yazı" },
  { k: "sub", label: "Üst yazı" },
  { k: "line", label: "Çerçeve çizgisi" },
];

const PRESETS: { label: string; colors: PlaqueColors }[] = [
  { label: "Altın", colors: PLAQUE_TONES.gold },
  { label: "Gümüş", colors: PLAQUE_TONES.silver },
  { label: "Bronz", colors: PLAQUE_TONES.bronze },
  { label: "Yakut", colors: paletteFrom("#e0435b") },
  { label: "Zümrüt", colors: paletteFrom("#2fbf71") },
  { label: "Safir", colors: paletteFrom("#3b82f6") },
  { label: "Ametist", colors: paletteFrom("#9d5cf0") },
  { label: "Turuncu", colors: paletteFrom("#ff7a1a") },
  { label: "Gece", colors: { bg1: "#3a3d52", bg2: "#14151f", ink: "#f5f2ff", sub: "#b7b2d6", line: "#6d6a8f" } },
];

const EMPTY: Draft = { id: null, name: "", price: "1000", title: "", eyebrow: PLAQUE_EYEBROW, colors: PLAQUE_TONES.gold };

/** Plaketler: tasarım ve animasyon aynı, yazı / renk / fiyat yönetimden */
export default function PlaquesPanel() {
  const [rows, setRows] = useState<ShopItem[] | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [base, setBase] = useState("#ff7a1a");

  const load = useCallback(async () => {
    const { data, error } = await sb().from("shop_items").select("*").eq("kind", "plaque").order("sort");
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setRows((data as ShopItem[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function edit(it: ShopItem) {
    const look = plaqueLook(it.id, it.meta);
    setD({
      id: it.id,
      name: it.name,
      price: String(it.price),
      title: look?.title ?? "",
      eyebrow: look?.eyebrow ?? PLAQUE_EYEBROW,
      colors: look?.colors ?? PLAQUE_TONES.gold,
    });
    setMsg(null);
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    const { data, error } = await sb().rpc("admin_save_plaque", {
      p_id: d.id,
      p_name: d.name.trim() || `Plaket: ${d.title.trim()}`,
      p_price: Math.max(0, Math.trunc(Number(d.price) || 0)),
      p_title: d.title.trim(),
      p_eyebrow: d.eyebrow.trim(),
      p_colors: d.colors,
      p_sort: null,
    });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: d.id ? "Plaket güncellendi." : "Yeni plaket mağazaya eklendi." });
    setD((x) => ({ ...x, id: data as string }));
    loadPlaques(true);
    load();
  }

  async function remove() {
    if (!d.id || !confirm(`"${d.title}" plaketi silinsin mi? Satın alanlardan da kalkar.`)) return;
    setBusy("del");
    const { error } = await sb().rpc("admin_delete_plaque", { p_id: d.id });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: errMsg(error) });
    setMsg({ tone: "info", text: "Plaket silindi." });
    setD(EMPTY);
    loadPlaques(true);
    load();
  }

  const setColor = (k: keyof PlaqueColors, v: string) => setD((x) => ({ ...x, colors: { ...x.colors, [k]: v } }));

  return (
    <Panel
      icon={<Award className="size-4" />}
      title="Plaketler"
      className="mt-6"
      right={
        <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setD(EMPTY)}>
          Yeni plaket
        </Button>
      }
    >
      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Liste */}
        <div className="border-b border-line p-2 lg:border-r lg:border-b-0">
          {rows === null ? (
            <div className="flex flex-col gap-2 p-1">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-3 text-sm text-muted">Henüz plaket yok. Sağdan ekle.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((it) => {
                const look = plaqueLook(it.id, it.meta);
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => edit(it)}
                      className={cx("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors", d.id === it.id ? "bg-surface-3" : "hover:bg-surface-2")}
                    >
                      <span
                        className="h-6 w-9 shrink-0 rounded border"
                        style={{ background: `linear-gradient(135deg, ${look?.colors.bg1}, ${look?.colors.bg2})`, borderColor: look?.colors.line }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{look?.title ?? it.name}</span>
                        <span className="block font-mono text-[11px] text-muted">{it.price} XP</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Düzenleyici */}
        <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">{d.id ? "Plaketi düzenle" : "Yeni plaket"} · Hologram parıltısı, 3D eğilme ve amblem aynı kalır; yazıyı ve renkleri sen seçersin.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Plaket yazısı
                <input className="field h-9" maxLength={28} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Ör. Yılın Sesi" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Üst yazı
                <input className="field h-9" maxLength={32} value={d.eyebrow} onChange={(e) => setD({ ...d, eyebrow: e.target.value.toLocaleUpperCase("tr") })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Mağazadaki adı
                <input className="field h-9" maxLength={60} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder={`Plaket: ${d.title || "…"}`} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Fiyat (XP)
                <input className="field h-9 font-mono" inputMode="numeric" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value.replace(/[^0-9]/g, "") })} />
              </label>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-muted">Hazır renkler</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setD({ ...d, colors: p.colors })}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2 text-xs text-fg-2 hover:border-line-strong"
                  >
                    <span className="size-3.5 rounded-full border" style={{ background: `linear-gradient(135deg, ${p.colors.bg1}, ${p.colors.bg2})`, borderColor: p.colors.line }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Tek renkten üret</span>
              <input type="color" value={base} onChange={(e) => setBase(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-line bg-bg" />
              <Button size="sm" icon={<Pipette className="size-3.5" />} onClick={() => setD({ ...d, colors: paletteFrom(base) })}>
                Uygula
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COLOR_FIELDS.map((f) => (
                <label key={f.k} className="flex flex-col gap-1 text-[11px] text-muted">
                  {f.label}
                  <span className="flex items-center gap-1.5">
                    <input type="color" value={d.colors[f.k]} onChange={(e) => setColor(f.k, e.target.value)} className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-bg" />
                    <input
                      className="field h-8 min-w-0 px-1.5 font-mono text-[11px]"
                      value={d.colors[f.k]}
                      maxLength={7}
                      onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setColor(f.k, e.target.value)}
                    />
                  </span>
                </label>
              ))}
            </div>

            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Save className="size-4" />} loading={busy === "save"} disabled={!!busy || !d.title.trim()} onClick={save}>
                {d.id ? "Kaydet" : "Mağazaya ekle"}
              </Button>
              {d.id && (
                <Button variant="danger" icon={<Trash2 className="size-4" />} loading={busy === "del"} disabled={!!busy} onClick={remove}>
                  Sil
                </Button>
              )}
            </div>
          </div>

          {/* Canlı önizleme */}
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-bg p-5">
            <p className="eyebrow self-start">Önizleme</p>
            <AwardPlaque eyebrow={d.eyebrow || PLAQUE_EYEBROW} title={d.title || "Plaket yazısı"} colors={d.colors} className="w-full max-w-[260px]" />
            <p className="text-center text-[11px] text-muted">Üzerine gel: eğilme ve parıltı. Profilde ve mağazada böyle görünür.</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
