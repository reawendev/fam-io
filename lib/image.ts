"use client";

/**
 * Tarayıcıda görsel işleme (sunucu ve ücretli servis yok).
 */

function canvasToBlob(c: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Görsel üretilemedi"))), type, quality),
  );
}


/** Profil fotoğrafı: ortadan kare kırpar, size×size JPEG'e küçültür (~15–30 KB; paylaşım görselinde de kullanılabilsin diye JPEG) */
export async function squareAvatar(file: File, size = 256): Promise<{ blob: Blob; ext: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Bir görsel dosyası seç (JPG, PNG, WebP).");
  if (file.size > 15 * 1024 * 1024) throw new Error("Görsel en fazla 15 MB olabilir.");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("Bu görsel açılamadı. Başka bir dosya dene.");
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  return { blob: await canvasToBlob(c, "image/jpeg", 0.86), ext: "jpg" };
}

/**
 * Videodan kapak karesi (640×360 JPEG, ~30–60 KB). Uzak adres için CORS gerekir;
 * Supabase public bucket'ları buna izin veriyor.
 */
export async function videoThumbnail(src: string, at?: number): Promise<{ blob: Blob; ext: string }> {
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("Video açılamadı"));
      setTimeout(() => reject(new Error("Video zaman aşımı")), 15000);
    });
    const d = isFinite(v.duration) ? v.duration : 4;
    const t = Math.min(Math.max(0.1, at ?? Math.min(d * 0.35, 4)), Math.max(0.1, d - 0.1));
    await new Promise<void>((resolve, reject) => {
      v.onseeked = () => resolve();
      v.onerror = () => reject(new Error("Kare alınamadı"));
      v.currentTime = t;
      setTimeout(() => reject(new Error("Kare zaman aşımı")), 15000);
    });
    const w = 640;
    const h = 360;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    // "contain": oranı koru
    const r = Math.min(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * r;
    const dh = v.videoHeight * r;
    ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
    // JPEG: paylaşım görseli (next/og) WebP okuyamıyor
    return { blob: await canvasToBlob(c, "image/jpeg", 0.8), ext: "jpg" };
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

/** Profil kapağı: 3:1 oranında ortadan kırpar, 1500×500 JPEG (~100–200 KB) */
export async function bannerImage(file: File): Promise<{ blob: Blob; ext: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Bir görsel dosyası seç (JPG, PNG, WebP).");
  if (file.size > 20 * 1024 * 1024) throw new Error("Görsel en fazla 20 MB olabilir.");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("Bu görsel açılamadı. Başka bir dosya dene.");
  const W = 1500;
  const H = 500;
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const sw = W / scale;
  const sh = H / scale;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
  bmp.close();
  return { blob: await canvasToBlob(c, "image/jpeg", 0.84), ext: "jpg" };
}
