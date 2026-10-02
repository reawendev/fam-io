"use client";

import { Crop, Pause, Play, Scissors, Square, Volume2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, cx, Notice, Progress } from "@/components/ui";
import { errMsg } from "@/lib/supabase";
import { fmtTime } from "@/lib/types";
import { aspectCrop, editSupported, editVideo, type CropRect } from "@/lib/videoEdit";

const RATIOS: { id: string; label: string; ratio: number | null }[] = [
  { id: "orig", label: "Orijinal", ratio: null },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

/**
 * Sahne videosunu kes, kırp, sesini ayarla. Sonuç yeni bir dosya olarak döner;
 * editör yükler ve replikleri kesilen başlangıç kadar kaydırır.
 */
export default function VideoEditPanel({
  src,
  lineCount,
  dubCount,
  onApply,
  onClose,
}: {
  src: string;
  lineCount: number;
  dubCount: number;
  onApply: (file: File, cut: { start: number; end: number }) => Promise<void>;
  onClose: () => void;
}) {
  const vRef = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(0);
  const [dims, setDims] = useState<[number, number]>([0, 0]);
  const [t, setT] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [ratio, setRatio] = useState("orig");
  const [shift, setShift] = useState(0.5);
  const [gain, setGain] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [work, setWork] = useState<{ p: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      setT(v.currentTime);
      if (!v.paused && v.currentTime >= end - 0.02 && end > 0) {
        v.pause();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end]);

  useEffect(() => {
    const v = vRef.current;
    if (v) v.volume = Math.min(1, gain);
  }, [gain]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const r = RATIOS.find((x) => x.id === ratio)?.ratio ?? null;
  const [w, h] = dims;
  const crop: CropRect | null = useMemo(() => {
    if (!r || !w || !h) return null;
    const portrait = r < w / h; // kırpma yatayda mı (dar) dikeyde mi
    return aspectCrop(w, h, r, portrait ? shift : 0.5, portrait ? 0.5 : shift);
  }, [r, w, h, shift]);
  const horizontal = !!r && r < w / h;

  const changed = start > 0.05 || (dur > 0 && end < dur - 0.05) || !!crop || Math.abs(gain - 1) > 0.01;
  const len = Math.max(0, end - start);

  function preview() {
    const v = vRef.current;
    if (!v) return;
    if (!v.paused) {
      v.pause();
      return;
    }
    if (v.currentTime < start || v.currentTime >= end - 0.05) v.currentTime = start;
    v.play().catch(() => {});
  }

  async function apply() {
    setError(null);
    if (len < 1) return setError("Kalan bölüm en az 1 saniye olmalı.");
    const ac = new AbortController();
    abortRef.current = ac;
    setWork({ p: 0 });
    try {
      vRef.current?.pause();
      const blob = await fetch(src).then((res) => {
        if (!res.ok) throw new Error(`Video indirilemedi (${res.status})`);
        return res.blob();
      });
      const file = await editVideo(blob, {
        start,
        end,
        crop,
        gain,
        signal: ac.signal,
        onProgress: (p) => setWork({ p }),
      });
      await onApply(file, { start, end });
      onClose();
    } catch (e) {
      if (ac.signal.aborted) setError(null);
      else setError("Video düzenlenemedi: " + errMsg(e));
    } finally {
      setWork(null);
      abortRef.current = null;
    }
  }

  const pct = (x: number) => (dur ? `${(x / dur) * 100}%` : "0%");

  return (
    <div className="panel overflow-hidden">
      <div className="panel-head">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Wand2 className="size-4 text-muted" /> Videoyu düzenle
        </h2>
        <button className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" onClick={onClose} aria-label="Kapat" disabled={!!work}>
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Önizleme + kırpma alanı */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video
              ref={vRef}
              src={src}
              crossOrigin="anonymous"
              playsInline
              preload="auto"
              className="block aspect-video w-full object-contain"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDur(v.duration || 0);
                setEnd(v.duration || 0);
                setDims([v.videoWidth, v.videoHeight]);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {crop && w > 0 && <CropOverlay w={w} h={h} crop={crop} />}
          </div>

          {/* Zaman çizelgesi */}
          <div>
            <div
              className="relative h-9 cursor-pointer overflow-hidden rounded-md border border-line bg-bg"
              onClick={(e) => {
                const rc = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rc.left) / rc.width) * dur;
                if (vRef.current) vRef.current.currentTime = Math.max(0, Math.min(dur, x));
              }}
            >
              <div className="absolute inset-y-0 bg-accent/20" style={{ left: pct(start), width: pct(len) }} />
              <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: pct(start) }} />
              <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: pct(end) }} />
              <div className="absolute inset-y-0 w-px bg-fg" style={{ left: pct(t) }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} onClick={preview} disabled={!dur}>
                {playing ? "Durdur" : "Seçimi oynat"}
              </Button>
              <span className="font-mono text-xs text-muted">
                {fmtTime(t)} / {fmtTime(dur)}
              </span>
              <span className="ml-auto font-mono text-xs text-fg-2">Kalan: {fmtTime(len)}</span>
            </div>
          </div>
        </div>

        {/* Ayarlar */}
        <div className="flex flex-col gap-4">
          <section>
            <p className="flex items-center gap-1.5 text-[13px] font-medium">
              <Scissors className="size-3.5 text-muted" /> Kes
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <TimeField label="Başlangıç" value={start} max={end - 0.5} onChange={setStart} onNow={() => setStart(Math.min(t, end - 0.5))} />
              <TimeField label="Bitiş" value={end} min={start + 0.5} max={dur} onChange={setEnd} onNow={() => setEnd(Math.max(t, start + 0.5))} />
            </div>
          </section>

          <section>
            <p className="flex items-center gap-1.5 text-[13px] font-medium">
              <Crop className="size-3.5 text-muted" /> Kırp
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {RATIOS.map((x) => (
                <button
                  key={x.id}
                  onClick={() => {
                    setRatio(x.id);
                    setShift(0.5);
                  }}
                  className={cx(
                    "h-7 rounded-md border px-2.5 text-xs transition-colors",
                    ratio === x.id ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
            {crop && (
              <label className="mt-2 block text-xs text-muted">
                {horizontal ? "Yatay konum" : "Dikey konum"}
                <input type="range" min={0} max={1} step={0.01} value={shift} onChange={(e) => setShift(+e.target.value)} className="mt-1 w-full" />
              </label>
            )}
            {crop && (
              <p className="mt-1 font-mono text-[11px] text-muted">
                {w}×{h} → {crop.width}×{crop.height}
              </p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <Volume2 className="size-3.5 text-muted" /> Video sesi
              </p>
              <span className="font-mono text-xs text-muted">%{Math.round(gain * 100)}</span>
            </div>
            <input type="range" min={0} max={3} step={0.05} value={gain} onChange={(e) => setGain(+e.target.value)} className="mt-2 w-full" />
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Dosyanın kendi sesi kısılır ya da yükseltilir. Önizlemede en fazla %100 duyulur; yükseltme kaydederken uygulanır.
            </p>
          </section>

          {(start > 0.05 || end < dur - 0.05) && lineCount > 0 && (
            <Notice tone="warn">
              Replikler yeni başlangıca göre kaydırılır{start > 0.05 ? ` (−${start.toFixed(1)} sn)` : ""}; kesilen bölümdeki replikler silinir.
              {dubCount > 0 && " Bu sahneyle yapılmış eski dublajlar yeni videoyla kayabilir."}
            </Notice>
          )}
          {error && <Notice>{error}</Notice>}
          {!editSupported() && <Notice tone="warn">Bu tarayıcı video düzenlemeyi desteklemiyor. Bilgisayarda Chrome ya da Edge kullan.</Notice>}

          {work ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-2">Video hazırlanıyor…</span>
                <span className="font-mono text-muted">%{Math.round(work.p * 100)}</span>
              </div>
              <Progress value={work.p} />
              <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} onClick={() => abortRef.current?.abort()}>
                İptal
              </Button>
            </div>
          ) : (
            <Button variant="primary" icon={<Wand2 className="size-4" />} disabled={!changed || !dur || !editSupported()} onClick={apply}>
              Uygula ve yükle
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  min = 0,
  max,
  onChange,
  onNow,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  onNow: () => void;
}) {
  const [txt, setTxt] = useState(value.toFixed(1));
  useEffect(() => setTxt(value.toFixed(1)), [value]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{label} (sn)</span>
      <input
        className="field h-8 px-2 font-mono text-[13px]"
        inputMode="decimal"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => {
          const v = parseFloat(txt.replace(",", "."));
          if (isFinite(v)) onChange(Math.max(min, Math.min(max, +v.toFixed(2))));
          else setTxt(value.toFixed(1));
        }}
      />
      <button className="self-start text-[11px] text-accent hover:underline" onClick={onNow} type="button">
        Şu anki an
      </button>
    </div>
  );
}

/** Kırpılacak alanın dışını karart */
function CropOverlay({ w, h, crop }: { w: number; h: number; crop: CropRect }) {
  // Video aspect-video kutuda "contain" ile durur: önce videonun kutudaki yerini bul
  const boxR = 16 / 9;
  const vr = w / h;
  const vw = vr > boxR ? 100 : (vr / boxR) * 100;
  const vh = vr > boxR ? (boxR / vr) * 100 : 100;
  const vx = (100 - vw) / 2;
  const vy = (100 - vh) / 2;
  const L = vx + (crop.left / w) * vw;
  const T = vy + (crop.top / h) * vh;
  const W = (crop.width / w) * vw;
  const H = (crop.height / h) * vh;
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute rounded-sm border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
        style={{ left: `${L}%`, top: `${T}%`, width: `${W}%`, height: `${H}%` }}
      />
    </div>
  );
}
