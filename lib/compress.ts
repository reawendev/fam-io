"use client";

/**
 * Sahne videolarını yüklemeden önce tarayıcıda küçültür (WebCodecs + Mediabunny).
 * - En fazla 1280×720, orta kalite; ses korunur (orijinali dinlemek için gerekli).
 * - Chrome/Edge/Safari'de H.264/AAC MP4, desteklenmezse VP9/Opus WebM üretir.
 * - Sıkıştırma işe yaramazsa (zaten küçükse ya da sonuç büyükse) orijinal dosya kullanılır.
 * Ücretsiz planın 1 GB depolama ve 5 GB/ay trafik sınırını çok daha geç doldurmak için.
 */

export type CompressResult = {
  file: File;
  compressed: boolean;
  /** Sıkıştırılmadıysa nedeni */
  reason?: "small" | "unsupported" | "no-gain";
  before: number;
  after: number;
};

const MAX_W = 1280;
const MAX_H = 720;
const SKIP_BELOW = 6 * 1024 * 1024; // 6 MB altı ve 720p'den küçükse dokunma

export function compressionSupported() {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

function even(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

export async function compressVideo(
  file: File,
  opts: { onProgress?: (p: number) => void; signal?: AbortSignal } = {},
): Promise<CompressResult> {
  const before = file.size;
  if (!compressionSupported()) return { file, compressed: false, reason: "unsupported", before, after: before };

  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const vt = await input.getPrimaryVideoTrack();
  if (!vt) throw new Error("Bu dosyada görüntü bulunamadı.");

  const w = vt.displayWidth;
  const h = vt.displayHeight;
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  if (scale >= 1 && before < SKIP_BELOW) return { file, compressed: false, reason: "small", before, after: before };
  const outW = even(w * scale);
  const outH = even(h * scale);

  // Önce her yerde açılan MP4 (H.264 + AAC), olmazsa WebM (VP9/VP8 + Opus)
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
    if (!vCodec) return { file, compressed: false, reason: "unsupported", before, after: before };
    format = new mb.WebMOutputFormat();
    ext = "webm";
    type = "video/webm";
  }

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format, target });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: { width: outW, height: outH, fit: "contain", codec: vCodec, quality: mb.QUALITY_MEDIUM, forceTranscode: true },
    audio: aCodec ? { codec: aCodec, bitrate: 128_000 } : { discard: true },
    showWarnings: false,
  });
  if (!conversion.isValid) return { file, compressed: false, reason: "unsupported", before, after: before };

  conversion.onProgress = (p) => opts.onProgress?.(Math.min(1, p));
  const onAbort = () => conversion.cancel();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await conversion.execute();
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }

  const buf = target.buffer;
  if (!buf) return { file, compressed: false, reason: "unsupported", before, after: before };
  const after = buf.byteLength;
  if (after >= before * 0.9) return { file, compressed: false, reason: "no-gain", before, after: before };

  const name = file.name.replace(/\.[^.]+$/, "") + "-720p." + ext;
  return { file: new File([buf], name, { type }), compressed: true, before, after };
}

export function fmtMB(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
