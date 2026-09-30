"use client";

/**
 * Ses efektleri — tamamen tarayıcıda, kayıt bozulmadan oynatma anında uygulanır.
 * Perde (pitch) değiştiren efektler süreyi korur, böylece dudak senkronu kaymaz.
 */

export type EffectId = "dogal" | "robot" | "derin" | "sincap" | "dev" | "telefon" | "megafon" | "magara" | "uzayli";

export const EFFECTS: { id: EffectId; name: string; hint: string }[] = [
  { id: "dogal", name: "Doğal", hint: "Efektsiz" },
  { id: "robot", name: "Robot", hint: "Metalik, mekanik" },
  { id: "derin", name: "Kalın ses", hint: "Daha pes ve tok" },
  { id: "sincap", name: "Sincap", hint: "İnce, hızlı çizgi film sesi" },
  { id: "dev", name: "Dev", hint: "Çok pes, gürleyen" },
  { id: "telefon", name: "Telefon", hint: "Hat üzerinden konuşma" },
  { id: "megafon", name: "Megafon", hint: "Hoparlörden anons" },
  { id: "magara", name: "Mağara", hint: "Yankılı" },
  { id: "uzayli", name: "Uzaylı", hint: "Titreşimli, tuhaf" },
];

export const isEffect = (v: unknown): v is EffectId => EFFECTS.some((e) => e.id === v);

/** Efektin sesin sonuna eklediği kuyruk (yankı için) */
export function effectTail(id: EffectId | undefined) {
  return id === "magara" ? 0.7 : id === "dev" ? 0.25 : 0;
}

// ------------------------------------------------------------
// Yardımcılar
// ------------------------------------------------------------

/** Süreyi koruyarak perde kaydırma (granüler overlap-add + yeniden örnekleme) */
function pitchShift(x: Float32Array, sr: number, semitones: number): Float32Array {
  const ratio = 2 ** (semitones / 12);
  const grain = Math.round(sr * 0.05);
  const hop = Math.round(grain / 4);
  const half = grain / 2;
  const win = new Float32Array(grain);
  for (let i = 0; i < grain; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grain - 1));
  const out = new Float32Array(x.length);
  const norm = new Float32Array(x.length);
  for (let pos = -grain; pos < x.length; pos += hop) {
    for (let i = 0; i < grain; i++) {
      const o = pos + i;
      if (o < 0 || o >= x.length) continue;
      const src = pos + half + (i - half) * ratio;
      const i0 = Math.floor(src);
      if (i0 < 0 || i0 + 1 >= x.length) continue;
      const f = src - i0;
      out[o] += (x[i0] * (1 - f) + x[i0 + 1] * f) * win[i];
      norm[o] += win[i];
    }
  }
  for (let i = 0; i < out.length; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
  return out;
}

function ringMod(x: Float32Array, sr: number, hz: number, mix: number) {
  const out = new Float32Array(x.length);
  const w = (2 * Math.PI * hz) / sr;
  for (let i = 0; i < x.length; i++) out[i] = x[i] * (1 - mix) + x[i] * Math.sin(w * i) * mix;
  return out;
}

function comb(x: Float32Array, sr: number, ms: number, fb: number) {
  const d = Math.max(1, Math.round((sr * ms) / 1000));
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] + (i >= d ? out[i - d] * fb : 0);
  return out;
}

function vibrato(x: Float32Array, sr: number, hz: number, depthMs: number) {
  const out = new Float32Array(x.length);
  const depth = (sr * depthMs) / 1000;
  for (let i = 0; i < x.length; i++) {
    const src = i - depth * (1 + Math.sin((2 * Math.PI * hz * i) / sr));
    const i0 = Math.floor(src);
    if (i0 < 0 || i0 + 1 >= x.length) continue;
    const f = src - i0;
    out[i] = x[i0] * (1 - f) + x[i0 + 1] * f;
  }
  return out;
}

function echo(x: Float32Array, sr: number, taps: [number, number][], extra: number) {
  const out = new Float32Array(x.length + Math.round(extra * sr));
  out.set(x);
  for (const [sec, g] of taps) {
    const d = Math.round(sec * sr);
    for (let i = 0; i < x.length; i++) out[i + d] += x[i] * g;
  }
  return out;
}

function peakNormalize(x: Float32Array, target: number) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak > 1e-4) {
    const k = target / peak;
    for (let i = 0; i < x.length; i++) x[i] *= k;
  }
  return x;
}

function peakOf(b: AudioBuffer) {
  let p = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
  }
  return p;
}

function distortionCurve(amount: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

/** Filtre zincirini OfflineAudioContext ile çalıştır (telefon / megafon / dev) */
async function renderFilters(
  input: AudioBuffer,
  build: (ctx: OfflineAudioContext, src: AudioNode) => AudioNode,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(input.numberOfChannels, input.length, input.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = input;
  build(ctx, src).connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7, gain = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

function mapChannels(ctx: BaseAudioContext, b: AudioBuffer, fn: (x: Float32Array) => Float32Array): AudioBuffer {
  const chans = Array.from({ length: b.numberOfChannels }, (_, c) => fn(b.getChannelData(c).slice()));
  const len = Math.max(...chans.map((c) => c.length));
  const out = ctx.createBuffer(b.numberOfChannels, len, b.sampleRate);
  chans.forEach((d, c) => out.copyToChannel(d as Float32Array<ArrayBuffer>, c));
  return out;
}

// ------------------------------------------------------------
// Efekt uygula
// ------------------------------------------------------------
export async function applyEffect(ctx: BaseAudioContext, input: AudioBuffer, id: EffectId | undefined): Promise<AudioBuffer> {
  if (!id || id === "dogal") return input;
  const sr = input.sampleRate;
  const target = Math.min(0.98, Math.max(0.3, peakOf(input)));
  let out: AudioBuffer;

  switch (id) {
    case "derin":
      out = mapChannels(ctx, input, (x) => pitchShift(x, sr, -5));
      break;
    case "sincap":
      out = mapChannels(ctx, input, (x) => pitchShift(x, sr, 7));
      break;
    case "dev": {
      const low = mapChannels(ctx, input, (x) => echo(pitchShift(x, sr, -9), sr, [[0.06, 0.35], [0.11, 0.2]], 0.25));
      out = await renderFilters(low, (c, s) => s.connect(biquad(c, "lowshelf", 200, 0.7, 5)).connect(biquad(c, "lowpass", 3800)));
      break;
    }
    case "robot":
      out = mapChannels(ctx, input, (x) => comb(ringMod(pitchShift(x, sr, -1), sr, 70, 0.85), sr, 6, 0.45));
      break;
    case "uzayli":
      out = mapChannels(ctx, input, (x) => ringMod(vibrato(pitchShift(x, sr, 4), sr, 6, 2.5), sr, 28, 0.45));
      break;
    case "magara":
      out = mapChannels(ctx, input, (x) => echo(x, sr, [[0.14, 0.5], [0.29, 0.34], [0.43, 0.22], [0.58, 0.13]], 0.7));
      break;
    case "telefon":
      out = await renderFilters(input, (c, s) => {
        const ws = c.createWaveShaper();
        ws.curve = distortionCurve(3);
        return s.connect(biquad(c, "highpass", 450, 0.9)).connect(biquad(c, "lowpass", 3000, 0.9)).connect(ws);
      });
      break;
    case "megafon":
      out = await renderFilters(input, (c, s) => {
        const ws = c.createWaveShaper();
        ws.curve = distortionCurve(25);
        ws.oversample = "2x";
        return s
          .connect(biquad(c, "highpass", 700, 1))
          .connect(biquad(c, "peaking", 1600, 1.2, 8))
          .connect(ws)
          .connect(biquad(c, "lowpass", 3200, 0.8));
      });
      break;
    default:
      return input;
  }
  for (let c = 0; c < out.numberOfChannels; c++) peakNormalize(out.getChannelData(c), target);
  return out;
}
