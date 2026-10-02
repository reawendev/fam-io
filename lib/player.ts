"use client";

import { applyEffect, effectTail, type EffectId } from "./effects";

/**
 * DubPlayer: videoyu ve tüm ses kayıtlarını Web Audio saatine göre senkron oynatır.
 * - Kayıtlar AudioBufferSourceNode ile örnek hassasiyetinde planlanır.
 * - Her kayıt sadece kendi replik aralığında çalınır (geri sayım sırasındaki sesler kırpılır).
 * - Video ses saatini takip eder; kayma olursa hız ayarı / seek ile düzeltilir.
 * - Çıkış hoparlör yerine bir MediaStream'e yönlendirilebilir (video dışa aktarımı için).
 */

let ctx: AudioContext | null = null;
const mediaGains = new WeakMap<HTMLMediaElement, GainNode>();

export function audioCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "playback" });
  }
  return ctx;
}

export function audioUnlocked() {
  return !!ctx && ctx.state === "running";
}

/** Kullanıcı tıklamasının içinde çağır: ses bağlamını ve videoyu "açar" (iOS/Chrome otomatik oynatma kuralları). */
export async function unlockAudio(video?: HTMLVideoElement | null) {
  const c = audioCtx();
  if (c.state !== "running") await c.resume();
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
  if (video) {
    try {
      const wasMuted = video.muted;
      video.muted = true;
      await video.play();
      video.pause();
      video.muted = wasMuted;
    } catch {}
  }
}

/**
 * Video elemanının kendi sesini Web Audio üzerinden geçirir (iOS'ta video.volume çalışmaz).
 * Bir eleman için yalnızca bir kez oluşturulabilir; `output` sadece ilk çağrıda kullanılır.
 */
export function mediaGain(video: HTMLMediaElement, output?: AudioNode): GainNode | null {
  const existing = mediaGains.get(video);
  if (existing) return existing;
  try {
    const c = audioCtx();
    const src = c.createMediaElementSource(video);
    const g = c.createGain();
    src.connect(g).connect(output ?? c.destination);
    mediaGains.set(video, g);
    return g;
  } catch {
    return null;
  }
}

export type DubItem = {
  url: string;
  /** Kaydın başladığı video saniyesi */
  at: number;
  /** Sadece bu video aralığı çalınır (geri sayım ve sonrası kırpılır) */
  from?: number;
  to?: number;
  key?: string;
  /** Oynatırken uygulanacak ses efekti */
  effect?: EffectId;
};

type Loaded = { buf: AudioBuffer; at: number; from: number; to: number };

export const LINE_PAD = 0.15; // replik başından önce bırakılan pay (sn)
export const LINE_TAIL = 0.4; // replik bitiminden sonra bırakılan pay (sn)
const FADE = 0.012;

async function decode(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ses indirilemedi (${res.status})`);
  const ab = await res.arrayBuffer();
  return await new Promise<AudioBuffer>((resolve, reject) => {
    const p = audioCtx().decodeAudioData(ab, resolve, reject);
    if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(resolve, reject);
  });
}

/** Dinleyicinin ses seviyesi (0–1.5), cihazda hatırlanır */
export function getListenerVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem("famio.volume") ?? "");
    return isFinite(v) ? Math.max(0, Math.min(1.5, v)) : 1;
  } catch {
    return 1;
  }
}
export function saveListenerVolume(v: number) {
  try {
    localStorage.setItem("famio.volume", String(v));
  } catch {}
}

/** Replik aralıkları → orijinal sesin kısılacağı aralıklar (birleşik, sıralı) */
export function duckRanges(lines: { start_time: number; end_time: number }[], pre = DUCK_PRE, post = DUCK_POST) {
  const rs = lines
    .map((l) => [Math.max(0, l.start_time - pre), l.end_time + post] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of rs) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 0.25) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}
const DUCK_PRE = 0.08;
const DUCK_POST = 0.12;
const DUCK_RAMP = 0.06;

export type DubPlayerOptions = {
  /** Orijinal video sesinin seviyesi (0 = kapalı, 1 = olduğu gibi, 2 = iki kat) */
  originalVolume?: number;
  /**
   * Replik aralıkları: orijinal ses sadece bu aralıklarda kısılır, geri kalanında olduğu gibi çalar.
   * Verilmezse orijinal ses baştan sona originalVolume seviyesinde çalar.
   */
  duck?: { start_time: number; end_time: number }[];
  /** Replik anında orijinal sesin seviyesi (varsayılan 0: tamamen kısık) */
  duckLevel?: number;
  /** Genel ses seviyesi (varsayılan: dinleyicinin kayıtlı seviyesi) */
  volume?: number;
  /** Ses çıkışı (varsayılan: hoparlör) */
  output?: AudioNode;
  /** Hoparlör gecikmesini videoya yansıt (dışa aktarımda kapalı olmalı) */
  latencyCompensation?: boolean;
};

export class DubPlayer {
  private video: HTMLVideoElement;
  private items: Loaded[] = [];
  private bg: AudioBuffer | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private raf = 0;
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  private startAt = 0;
  private startPos = 0;
  private endAt: number | null = null;
  private master: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private origGain: GainNode | null = null;
  private ranges: [number, number][] | null = null;
  private vol = 1;
  private opts: { originalVolume: number; latencyCompensation: boolean; duckLevel: number; output?: AudioNode };
  running = false;
  duration = 0;
  onTick?: (pos: number) => void;
  onEnd?: () => void;
  failed: string[] = [];

  constructor(video: HTMLVideoElement, opts: DubPlayerOptions = {}) {
    this.video = video;
    this.opts = {
      originalVolume: opts.originalVolume ?? 0,
      latencyCompensation: opts.latencyCompensation ?? true,
      duckLevel: opts.duckLevel ?? 0,
      output: opts.output,
    };
    this.ranges = opts.duck?.length ? duckRanges(opts.duck) : null;
    this.vol = opts.volume ?? (opts.output ? 1 : getListenerVolume());
  }

  /** Genel ses seviyesi (seslendirmeler + orijinal ses) */
  setVolume(v: number) {
    this.vol = Math.max(0, Math.min(1.5, v));
    if (this.master) this.master.gain.value = this.vol;
    if (this.origGain && !this.running) this.origGain.gain.value = this.opts.originalVolume * this.vol;
    // Çalarken: planlanmış kısmaları yeni seviyeyle baştan kur
    if (this.running) this.scheduleDuck(this.position());
  }

  async load(items: DubItem[], bgUrl: string | null, onProgress?: (done: number, total: number) => void) {
    const total = items.length + (bgUrl ? 1 : 0) + 1;
    let done = 0;
    const step = () => onProgress?.(++done, total);

    const videoReady = new Promise<void>((resolve) => {
      if (this.video.readyState >= 3) return resolve();
      const ok = () => {
        this.video.removeEventListener("canplay", ok);
        resolve();
      };
      this.video.addEventListener("canplay", ok);
      this.video.preload = "auto";
      if (this.video.readyState === 0) this.video.load();
      setTimeout(resolve, 20000);
    }).then(step);

    const bgP = bgUrl
      ? decode(bgUrl)
          .then((b) => (this.bg = b))
          .catch(() => this.failed.push("arka plan sesi"))
          .finally(step)
      : Promise.resolve();

    const loaded: Loaded[] = [];
    const itemP = Promise.all(
      items.map((it) =>
        decode(it.url)
          .then((raw) => applyEffect(audioCtx(), raw, it.effect))
          .then((buf) =>
            loaded.push({
              buf,
              at: it.at,
              from: Math.max(it.at, it.from ?? it.at),
              to: Math.min(it.at + buf.duration, it.to ?? Infinity),
            }),
          )
          .catch(() => this.failed.push(it.key ?? it.url))
          .finally(step),
      ),
    );

    await Promise.all([videoReady, bgP, itemP]);
    this.items = loaded;
    this.duration = this.video.duration || 0;
  }

  private latency() {
    if (!this.opts.latencyCompensation) return 0;
    const c = audioCtx();
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }

  private setupGraph() {
    const c = audioCtx();
    if (!this.master) {
      this.master = c.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.opts.output ?? c.destination);
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      this.voiceBus = c.createGain();
      this.voiceBus.gain.value = 1.2;
      this.voiceBus.connect(comp).connect(this.master);
    }
    if (this.opts.originalVolume > 0) {
      const g = mediaGain(this.video, this.opts.output);
      this.origGain = g;
      if (g) {
        g.gain.cancelScheduledValues(0);
        g.gain.value = this.opts.originalVolume * this.vol;
      }
      this.video.muted = false;
      this.video.volume = 1;
    } else {
      this.origGain = null;
      this.video.muted = true;
    }
  }

  /**
   * Orijinal sesi replik aralıklarında kıs. Zamanlar ses saatinde: video saniyesi t,
   * (startAt + gecikme + t − startPos) anında hoparlöre ulaşır.
   */
  private scheduleDuck(fromPos: number) {
    const g = this.origGain;
    if (!g) return;
    const c = audioCtx();
    const base = this.opts.originalVolume * this.vol;
    const low = this.opts.duckLevel * base;
    const now = c.currentTime;
    const t0 = this.startAt + this.latency() - this.startPos; // video saniyesi → ses saati
    g.gain.cancelScheduledValues(0);
    g.gain.setValueAtTime(base, now);
    if (!this.ranges) return;
    let last = now;
    for (const [a, b] of this.ranges) {
      if (b <= fromPos) continue;
      if (this.endAt != null && a >= this.endAt) break;
      const ta = t0 + a;
      const tb = t0 + b;
      if (tb <= now) continue;
      if (ta - DUCK_RAMP <= now) {
        g.gain.setValueAtTime(low, Math.max(now, last));
      } else {
        g.gain.setValueAtTime(base, Math.max(last, ta - DUCK_RAMP));
        g.gain.linearRampToValueAtTime(low, ta);
      }
      g.gain.setValueAtTime(low, Math.max(tb, last));
      g.gain.linearRampToValueAtTime(base, tb + DUCK_RAMP * 1.5);
      last = tb + DUCK_RAMP * 1.5;
    }
  }

  position(): number {
    const c = audioCtx();
    return this.startPos + Math.max(0, c.currentTime - this.latency() - this.startAt);
  }

  /**
   * @param startPos videonun hangi saniyesinden başlanacağı
   * @param delaySec şu andan kaç saniye sonra başlanacağı
   * @param endAt bu video saniyesinde dur (varsayılan: video sonu)
   */
  play(startPos = 0, delaySec = 0.15, endAt: number | null = null) {
    this.stop();
    const c = audioCtx();
    this.setupGraph();
    this.running = true;
    this.startPos = startPos;
    this.endAt = endAt;
    this.startAt = c.currentTime + Math.max(0.05, delaySec);

    // [from, to) video aralığını, videonun startPos anı startAt'e denk gelecek şekilde planla
    const sched = (buf: AudioBuffer, at: number, from: number, to: number, dest: AudioNode, fade: boolean) => {
      const segFrom = Math.max(from, startPos);
      const segTo = endAt != null ? Math.min(to, endAt) : to;
      if (segTo - segFrom <= 0.01) return;
      const s = c.createBufferSource();
      s.buffer = buf;
      const when = this.startAt + (segFrom - startPos);
      const dur = segTo - segFrom;
      if (fade) {
        const g = c.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(1, when + FADE);
        g.gain.setValueAtTime(1, Math.max(when + FADE, when + dur - FADE));
        g.gain.linearRampToValueAtTime(0, when + dur);
        s.connect(g).connect(dest);
      } else {
        s.connect(dest);
      }
      s.start(when, segFrom - at, dur);
      this.sources.push(s);
    };
    for (const it of this.items) sched(it.buf, it.at, it.from, it.to, this.voiceBus!, true);
    if (this.bg) sched(this.bg, 0, 0, this.bg.duration, this.master!, false);
    this.scheduleDuck(startPos);

    this.video.pause();
    this.video.playbackRate = 1;
    this.video.currentTime = startPos;
    const latency = this.latency();
    const ms = (this.startAt - c.currentTime + latency) * 1000;
    this.playTimer = setTimeout(() => this.video.play().catch(() => {}), Math.max(0, ms - 40));

    const loop = () => {
      if (!this.running) return;
      const pos = this.position();
      const started = c.currentTime - latency >= this.startAt;
      if (started && !this.video.paused && !this.video.seeking) {
        const diff = this.video.currentTime - pos;
        if (Math.abs(diff) > 0.3) this.video.currentTime = pos;
        else if (Math.abs(diff) > 0.04) this.video.playbackRate = 1 - Math.max(-0.1, Math.min(0.1, diff * 0.6));
        else if (this.video.playbackRate !== 1) this.video.playbackRate = 1;
      } else if (started && this.video.paused && !this.video.ended) {
        this.video.play().catch(() => {});
      }
      this.onTick?.(started ? pos : startPos);
      const end = this.endAt ?? (this.duration || this.video.duration || 0);
      if (end && pos >= end - 0.03) {
        this.stop();
        this.onEnd?.();
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.playTimer) clearTimeout(this.playTimer);
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
      s.disconnect();
    }
    this.sources = [];
    this.video.pause();
    this.video.playbackRate = 1;
    if (this.origGain) {
      this.origGain.gain.cancelScheduledValues(0);
      this.origGain.gain.value = this.opts.originalVolume * this.vol;
    }
  }

  destroy() {
    this.stop();
    this.onTick = undefined;
    this.onEnd = undefined;
    this.master?.disconnect();
  }
}

/**
 * Videonun orijinal sesini bir aralıkta çalar (kayıttan önce repliği dinlemek için).
 * Dönen fonksiyon çalmayı durdurur.
 */
export function playOriginal(video: HTMLVideoElement, from: number, to: number, onEnd?: () => void): () => void {
  const g = mediaGain(video);
  if (g) {
    g.gain.cancelScheduledValues(0);
    g.gain.value = getListenerVolume();
  }
  video.muted = false;
  video.volume = 1;
  let raf = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    video.pause();
    video.muted = true;
    onEnd?.();
  };
  const start = () => {
    video.play().catch(stop);
    const loop = () => {
      if (stopped) return;
      if (video.currentTime >= to || video.ended) return stop();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };
  if (Math.abs(video.currentTime - from) < 0.02) start();
  else {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      if (!stopped) start();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = from;
  }
  return stop;
}

/** Kayıt → oynatma öğesi (replik aralığına kırpılmış) */
export function recItem(
  url: string,
  offset: number,
  line: { start_time: number; end_time: number },
  key?: string,
  effect?: EffectId,
): DubItem {
  return { url, at: offset, from: line.start_time - LINE_PAD, to: line.end_time + LINE_TAIL + effectTail(effect), key, effect };
}
