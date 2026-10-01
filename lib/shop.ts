"use client";

import { audioCtx } from "./player";
import type { Equipped } from "./types";
import type { PlaqueTone } from "@/components/AwardPlaque";

/**
 * XP mağazası kozmetikleri. Fiyatlar ve sahiplik veritabanında (shop_items, user_items);
 * burada sadece görünüşleri var. Bakiye = toplam XP − harcanan; harcamak level'i düşürmez.
 */

export type ShopKind = "frame" | "name" | "plaque" | "sound" | "banner";
export type ShopItem = { id: string; kind: ShopKind; name: string; price: number; sort: number };

export const KIND_LABEL: Record<ShopKind, string> = {
  frame: "Profil çerçeveleri",
  name: "İsim efektleri",
  plaque: "Plaketler",
  sound: "Giriş sesleri",
  banner: "Profil kapakları",
};

/** Avatar çerçevesi sınıfı (globals.css) */
export const frameClass = (id?: string) => (id ? `avatar-frame ${id.replace("_", "-")}` : "");
/** İsim efekti sınıfı (globals.css) */
export const nameClass = (id?: string) => (id ? `name-fx ${id.replace("_", "-")}` : "");
/** Profil kapağı sınıfı (globals.css) */
export const bannerClass = (id?: string) => (id ? `banner-preset ${id.replace("_", "-")}` : "");

export const PLAQUES: Record<string, { title: string; tone: PlaqueTone }> = {
  plaque_ses: { title: "Ses Sanatçısı", tone: "silver" },
  plaque_kahkaha: { title: "Kahkaha Ustası", tone: "bronze" },
  plaque_efsane: { title: "Dublaj Efsanesi", tone: "gold" },
};

export const balance = (p: { xp: number; spent?: number }) => Math.max(0, p.xp - (p.spent ?? 0));

// ------------------------------------------------------------
// Giriş sesleri: dosya yok, Web Audio ile üretilir
// ------------------------------------------------------------
function tone(ctx: AudioContext, out: AudioNode, freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.25, endFreq?: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(ctx: AudioContext, out: AudioNode, start: number, dur: number, vol = 0.3, hp = 800) {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(start);
}

export function playJingle(id: string | undefined, volume = 0.8) {
  if (!id) return;
  const ctx = audioCtx();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);
  const t = ctx.currentTime + 0.03;
  switch (id) {
    case "sound_zil":
      tone(ctx, out, 1046.5, t, 0.6, "sine", 0.3);
      tone(ctx, out, 784, t + 0.32, 0.9, "sine", 0.3);
      break;
    case "sound_tada":
      [523.25, 659.25, 783.99].forEach((f, i) => tone(ctx, out, f, t + i * 0.07, 0.25, "triangle", 0.22));
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(ctx, out, f, t + 0.3, 0.8, "triangle", 0.18));
      break;
    case "sound_davul":
      for (let i = 0; i < 10; i++) noise(ctx, out, t + i * 0.045, 0.06, 0.12 + i * 0.015, 1500);
      tone(ctx, out, 140, t + 0.5, 0.35, "sine", 0.6, 50);
      noise(ctx, out, t + 0.5, 0.6, 0.35, 3000);
      break;
    case "sound_lazer":
      tone(ctx, out, 1800, t, 0.25, "sawtooth", 0.12, 180);
      tone(ctx, out, 1800, t + 0.18, 0.25, "sawtooth", 0.1, 180);
      break;
    case "sound_fanfar":
      [
        [392, 0, 0.18],
        [392, 0.2, 0.18],
        [392, 0.4, 0.18],
        [523.25, 0.6, 0.7],
      ].forEach(([f, s, d]) => {
        tone(ctx, out, f, t + s, d, "sawtooth", 0.1);
        tone(ctx, out, f * 1.5, t + s, d, "square", 0.04);
      });
      break;
  }
  setTimeout(() => out.disconnect(), 2500);
}

/** Bir oyuncunun "girişte çalacak" sesi: imza sesi > giriş sesi */
export function playEntrance(p: { voice_path?: string | null; equipped?: Equipped }, voiceUrl: (path: string) => string, volume = 0.7) {
  if (p.voice_path) {
    const a = new Audio(voiceUrl(p.voice_path));
    a.volume = volume;
    a.play().catch(() => playJingle(p.equipped?.sound, volume));
    return;
  }
  playJingle(p.equipped?.sound, volume);
}
