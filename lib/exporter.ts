"use client";

import { audioCtx, DubPlayer, type DubItem } from "./player";

/**
 * Dublajlı videoyu tamamen tarayıcıda üretir: video kareleri bir canvas'a çizilir,
 * sesler Web Audio ile miks edilir, MediaRecorder ikisini tek dosyaya yazar.
 * Sunucu ya da ücretli servis yok. Gerçek zamanlı çalışır (klip ne kadar sürüyorsa o kadar).
 */

export type ExportResult = { blob: Blob; ext: "mp4" | "webm"; mime: string };

// Önce gerçek H.264/AAC MP4 (her yerde açılır), yoksa WebM, en son düz MP4 (Safari).
// Düz "video/mp4" başa konmaz: bazı tarayıcılar MP4 kabına VP9 koyuyor, QuickTime/WhatsApp açamıyor.
const CANDIDATES: [string, "mp4" | "webm"][] = [
  ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"],
  ["video/mp4;codecs=avc1.4D401F,mp4a.40.2", "mp4"],
  ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"],
  ["video/webm;codecs=vp9,opus", "webm"],
  ["video/webm;codecs=vp8,opus", "webm"],
  ["video/webm", "webm"],
  ["video/mp4", "mp4"],
];

export function exportSupported() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "captureStream" in HTMLCanvasElement.prototype
  );
}

function pickFormat() {
  for (const [mime, ext] of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return { mime: "", ext: "webm" as const };
}

export async function exportDub(opts: {
  videoUrl: string;
  items: DubItem[];
  bgUrl: string | null;
  originalVolume: number;
  maxWidth?: number;
  onPhase?: (phase: "loading" | "rendering" | "finishing") => void;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<ExportResult> {
  const c = audioCtx();
  if (c.state !== "running") await c.resume();

  // Görünmez bir video elemanı: izleyenin oynatıcısını etkilemez
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = true;
  video.preload = "auto";
  video.src = opts.videoUrl;
  Object.assign(video.style, { position: "fixed", left: "-9999px", top: "0", width: "2px", height: "2px", opacity: "0" });
  document.body.appendChild(video);

  const dest = c.createMediaStreamDestination();
  const player = new DubPlayer(video, { originalVolume: opts.originalVolume, output: dest, latencyCompensation: false });

  let raf = 0;
  let vfc = 0;
  const cleanup = () => {
    cancelAnimationFrame(raf);
    if (vfc && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(vfc);
    player.destroy();
    video.removeAttribute("src");
    video.load();
    video.remove();
  };

  try {
    opts.onPhase?.("loading");
    await player.load(opts.items, opts.bgUrl);
    if (opts.signal?.aborted) throw new DOMException("İptal edildi", "AbortError");

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const scale = Math.min(1, (opts.maxWidth ?? 1280) / vw);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((vw * scale) / 2) * 2;
    canvas.height = Math.round((vh * scale) / 2) * 2;
    const g = canvas.getContext("2d", { alpha: false })!;
    const draw = () => g.drawImage(video, 0, 0, canvas.width, canvas.height);
    g.fillStyle = "#000";
    g.fillRect(0, 0, canvas.width, canvas.height);

    // Kare çizimi: mümkünse her yeni video karesinde, değilse her animasyon karesinde
    if ("requestVideoFrameCallback" in video) {
      const onFrame = () => {
        draw();
        vfc = video.requestVideoFrameCallback(onFrame);
      };
      vfc = video.requestVideoFrameCallback(onFrame);
    } else {
      const loop = () => {
        draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    const stream = canvas.captureStream(30);
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);

    const { mime, ext } = pickFormat();
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 5_000_000,
      audioBitsPerSecond: 160_000,
    });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

    opts.onPhase?.("rendering");
    const duration = player.duration || video.duration;
    const ended = new Promise<void>((resolve, reject) => {
      player.onTick = (pos) => opts.onProgress?.(duration ? Math.min(1, pos / duration) : 0);
      player.onEnd = () => resolve();
      opts.signal?.addEventListener("abort", () => reject(new DOMException("İptal edildi", "AbortError")), { once: true });
    });

    rec.start(1000);
    player.play(0, 0.25);
    try {
      await ended;
    } finally {
      opts.onPhase?.("finishing");
      draw();
      await new Promise((r) => setTimeout(r, 250));
      if (rec.state !== "inactive") rec.stop();
      await stopped;
    }
    const type = rec.mimeType || mime || `video/${ext}`;
    return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm", mime: type };
  } finally {
    cleanup();
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function slugify(s: string) {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return (
    s
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (ch) => map[ch] ?? ch)
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "sahne"
  );
}
