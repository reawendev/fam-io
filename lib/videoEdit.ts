"use client";

/**
 * Sahne editöründe videoyu tarayıcıda düzenler (WebCodecs + Mediabunny, ücretsiz, sunucusuz):
 * - Kesme: başlangıç / bitiş arası kalır
 * - Kırpma: görüntüden bir dikdörtgen (16:9, 1:1, 9:16 … ortadan ya da kaydırılmış)
 * - Ses: orijinal sesi kıs / yükselt (dosyaya işlenir, %0–300)
 * Çıktı en fazla 1280×720; Chrome/Edge/Safari'de MP4, desteklenmezse WebM.
 */

import { compressionSupported } from "./compress";

export type CropRect = { left: number; top: number; width: number; height: number };

export type EditOptions = {
  start: number;
  end: number;
  /** Görüntü koordinatlarında kırpma (displayWidth × displayHeight) */
  crop?: CropRect | null;
  /** Ses çarpanı: 0 sessiz, 1 aynı, 2 iki kat */
  gain?: number;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
};

const MAX_W = 1280;
const MAX_H = 720;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export const editSupported = compressionSupported;

/** Yükseltirken cızırtı olmasın: 0.9'un üstünü yumuşakça sınırla */
function softClip(v: number) {
  const a = Math.abs(v);
  if (a <= 0.9) return v;
  return Math.sign(v) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}

/** Bir en-boy oranı için ortalanmış kırpma dikdörtgeni; `shift` 0..1 kaydırma (0.5 = orta) */
export function aspectCrop(w: number, h: number, ratio: number | null, shiftX = 0.5, shiftY = 0.5): CropRect | null {
  if (!ratio || !w || !h) return null;
  let cw = w;
  let ch = Math.round(w / ratio);
  if (ch > h) {
    ch = h;
    cw = Math.round(h * ratio);
  }
  cw = even(cw);
  ch = even(ch);
  if (cw >= w - 1 && ch >= h - 1) return null;
  return {
    left: Math.round((w - cw) * Math.min(1, Math.max(0, shiftX))),
    top: Math.round((h - ch) * Math.min(1, Math.max(0, shiftY))),
    width: cw,
    height: ch,
  };
}

export async function editVideo(src: Blob, o: EditOptions): Promise<File> {
  if (!compressionSupported()) throw new Error("Bu tarayıcı video düzenlemeyi desteklemiyor. Bilgisayarda Chrome ya da Edge dene.");
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(src), formats: mb.ALL_FORMATS });
  const vt = await input.getPrimaryVideoTrack();
  if (!vt) throw new Error("Bu dosyada görüntü bulunamadı.");

  const srcW = o.crop?.width ?? vt.displayWidth;
  const srcH = o.crop?.height ?? vt.displayHeight;
  const scale = Math.min(1, MAX_W / srcW, MAX_H / srcH);
  const outW = even(srcW * scale);
  const outH = even(srcH * scale);

  let format: InstanceType<typeof mb.Mp4OutputFormat> | InstanceType<typeof mb.WebMOutputFormat>;
  let vCodec = await mb.getFirstEncodableVideoCodec(["avc"], { width: outW, height: outH });
  let aCodec = await mb.getFirstEncodableAudioCodec(["aac"]);
  let ext = "mp4";
  let type = "video/mp4";
  if (vCodec && aCodec) {
    format = new mb.Mp4OutputFormat({ fastStart: "in-memory" });
  } else {
    vCodec = await mb.getFirstEncodableVideoCodec(["vp9", "vp8"], { width: outW, height: outH });
    aCodec = await mb.getFirstEncodableAudioCodec(["opus"]);
    if (!vCodec) throw new Error("Bu tarayıcı video kodlayamıyor.");
    format = new mb.WebMOutputFormat();
    ext = "webm";
    type = "video/webm";
  }

  const gain = Math.max(0, Math.min(3, o.gain ?? 1));
  const process =
    Math.abs(gain - 1) < 0.01
      ? undefined
      : (sample: InstanceType<typeof mb.AudioSample>) => {
          const n = sample.numberOfChannels;
          const f = sample.numberOfFrames;
          const data = new Float32Array(n * f);
          const plane = new Float32Array(f);
          for (let ch = 0; ch < n; ch++) {
            sample.copyTo(plane, { planeIndex: ch, format: "f32-planar" });
            const off = ch * f;
            for (let i = 0; i < f; i++) {
              data[off + i] = softClip(plane[i] * gain);
            }
          }
          return new mb.AudioSample({ data, format: "f32-planar", numberOfChannels: n, sampleRate: sample.sampleRate, timestamp: sample.timestamp });
        };

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format, target });
  const conversion = await mb.Conversion.init({
    input,
    output,
    trim: { start: Math.max(0, o.start), end: o.end },
    video: {
      crop: o.crop ?? undefined,
      width: outW,
      height: outH,
      fit: "fill",
      codec: vCodec,
      quality: mb.QUALITY_MEDIUM,
      forceTranscode: true,
    },
    audio: aCodec ? { codec: aCodec, bitrate: 128_000, forceTranscode: true, process } : { discard: true },
    showWarnings: false,
  });
  if (!conversion.isValid) throw new Error("Bu video düzenlenemiyor (desteklenmeyen biçim).");

  conversion.onProgress = (p) => o.onProgress?.(Math.min(1, p));
  const onAbort = () => conversion.cancel();
  o.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await conversion.execute();
  } finally {
    o.signal?.removeEventListener("abort", onAbort);
  }
  const buf = target.buffer;
  if (!buf) throw new Error("Video üretilemedi.");
  return new File([buf], `sahne-duzenlenmis.${ext}`, { type });
}
