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

export type DubPlayerOptions = {
  /** Orijinal video sesinin seviyesi (0 = kapalı) */
  originalVolume?: number;
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
  private opts: Required<Omit<DubPlayerOptions, "output">> & { output?: AudioNode };
  running = false;
  duration = 0;
  onTick?: (pos: number) => void;
  onEnd?: () => void;
  failed: string[] = [];

  constructor(video: HTMLVideoElement, opts: DubPlayerOptions = {}) {
    this.video = video;
    this.opts = { originalVolume: 0, latencyCompensation: true, ...opts };
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
      if (g) g.gain.value = this.opts.originalVolume;
      this.video.muted = false;
      this.video.volume = 1;
    } else {
      this.video.muted = true;
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
  if (g) g.gain.value = 1;
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
