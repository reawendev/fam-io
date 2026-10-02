"use client";

import { useEffect, useState } from "react";
import { audioCtx } from "./player";
import { publicUrl, sb } from "./supabase";
import type { Equipped } from "./types";
import { PLAQUE_TONES, type PlaqueColors, type PlaqueTone } from "@/components/AwardPlaque";

/**
 * XP mağazası kozmetikleri. Fiyatlar ve sahiplik veritabanında (shop_items, user_items);
 * burada sadece görünüşleri var. Bakiye = toplam XP − harcanan; harcamak level'i düşürmez.
 */

export type ShopKind = "frame" | "name" | "plaque" | "sound" | "banner" | "board";
export type ShopItem = {
  id: string;
  kind: ShopKind;
  name: string;
  price: number;
  sort: number;
  audio_path?: string | null;
  emoji?: string | null;
  /** Plaketlerde görünüş (010): { title, eyebrow, colors } */
  meta?: PlaqueMeta | null;
};

export const KIND_LABEL: Record<ShopKind, string> = {
  frame: "Profil çerçeveleri",
  name: "İsim efektleri",
  plaque: "Plaketler",
  sound: "Giriş sesleri",
  banner: "Profil kapakları",
  board: "Efekt düğmeleri",
};

/** Profil kapağı sınıfı (globals.css) */
export const bannerClass = (id?: string) => (id ? `banner-preset ${id.replace("_", "-")}` : "");

/** 010 öncesi / meta'sı boş plaketler için yedek görünüş */
export const PLAQUES: Record<string, { title: string; tone: PlaqueTone }> = {
  plaque_ses: { title: "Ses Sanatçısı", tone: "silver" },
  plaque_kahkaha: { title: "Kahkaha Ustası", tone: "bronze" },
  plaque_efsane: { title: "Dublaj Efsanesi", tone: "gold" },
};

export type PlaqueMeta = { title?: string; eyebrow?: string; colors?: Partial<PlaqueColors> };
export type PlaqueLook = { title: string; eyebrow: string; colors: PlaqueColors };
export const PLAQUE_EYEBROW = "FAM-IO · PLAKET";

/** Plaket görünüşü: veritabanındaki meta > yerleşik yedek > null */
export function plaqueLook(id: string | undefined, meta?: PlaqueMeta | null): PlaqueLook | null {
  if (!id) return null;
  const fb = PLAQUES[id];
  const title = meta?.title || fb?.title;
  if (!title) return null;
  const base = PLAQUE_TONES[fb?.tone ?? "gold"];
  return { title, eyebrow: meta?.eyebrow || PLAQUE_EYEBROW, colors: { ...base, ...(meta?.colors ?? {}) } };
}

let plaquesP: Promise<Record<string, PlaqueMeta>> | null = null;
/** Tüm plaketlerin görünüşü (önbellekli). Yönetimde değişince force ile yenile. */
export function loadPlaques(force = false): Promise<Record<string, PlaqueMeta>> {
  if (!plaquesP || force)
    plaquesP = Promise.resolve(sb().from("shop_items").select("*").eq("kind", "plaque")).then(({ data }) =>
      Object.fromEntries(((data as ShopItem[] | null) ?? []).map((it) => [it.id, it.meta ?? {}])),
    );
  return plaquesP;
}

/** Bir kullanıcının taktığı plaketin görünüşü */
export function usePlaque(id: string | undefined): PlaqueLook | null {
  const [meta, setMeta] = useState<PlaqueMeta | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    let on = true;
    loadPlaques()
      .then((m) => on && setMeta(m[id] ?? null))
      .catch(() => on && setMeta(null));
    return () => {
      on = false;
    };
  }, [id]);
  if (!id) return null;
  // Ürün silinmişse (meta null ve yedek yok) gösterme
  if (meta === null && !PLAQUES[id]) return null;
  return plaqueLook(id, meta ?? undefined);
}

/** Tek renkten uyumlu plaket paleti üret (yönetim paneli) */
export function paletteFrom(hex: string): PlaqueColors {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (t: number, to: number) =>
    "#" + [r, g, b].map((v) => Math.round(v + (to - v) * t).toString(16).padStart(2, "0")).join("");
  return { bg1: mix(0.62, 255), bg2: mix(0.12, 255), ink: mix(0.72, 0), sub: mix(0.5, 0), line: mix(0.25, 0) };
}

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

/** Bir oyuncunun "girişte çalacak" sesi: imza sesi > giriş sesi (dosya varsa dosya, yoksa sentez) */
export function playEntrance(p: { voice_path?: string | null; equipped?: Equipped }, voiceUrl: (path: string) => string, volume = 0.7) {
  if (p.voice_path) {
    const a = new Audio(voiceUrl(p.voice_path));
    a.volume = volume;
    a.play().catch(() => playSoundId(p.equipped?.sound, volume));
    return;
  }
  playSoundId(p.equipped?.sound, volume);
}

// ------------------------------------------------------------
// Lobi efekt düğmeleri: ücretsiz 3 ses + mağazadan alınanlar (dosya yok, Web Audio)
// ------------------------------------------------------------
export const FREE_BOARD = ["board_badum", "board_korna", "board_alkis"];
export const BOARD_INFO: Record<string, { label: string; emoji: string }> = {
  board_badum: { label: "Ba-dum-tss", emoji: "🥁" },
  board_korna: { label: "Korna", emoji: "📯" },
  board_alkis: { label: "Alkış", emoji: "👏" },
  board_kriket: { label: "Cırcır", emoji: "🦗" },
  board_boing: { label: "Boing", emoji: "🌀" },
  board_trombon: { label: "Hüzün", emoji: "🎺" },
  board_scratch: { label: "Cızırtı", emoji: "💿" },
  board_alarm: { label: "Alarm", emoji: "🚨" },
  board_gong: { label: "Gong", emoji: "🔔" },
  board_zafer: { label: "Zafer", emoji: "🏆" },
};

export function playBoard(id: string, volume = 0.8) {
  if (!BOARD_INFO[id]) return;
  const ctx = audioCtx();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);
  const t = ctx.currentTime + 0.03;
  switch (id) {
    case "board_badum":
      tone(ctx, out, 200, t, 0.16, "sine", 0.55, 110);
      tone(ctx, out, 150, t + 0.17, 0.2, "sine", 0.55, 80);
      tone(ctx, out, 90, t + 0.4, 0.25, "sine", 0.6, 45);
      noise(ctx, out, t + 0.4, 1.1, 0.28, 5000);
      break;
    case "board_korna":
      [0, 0.34].forEach((s, i) => {
        tone(ctx, out, 349, t + s, i ? 0.45 : 0.26, "square", 0.09);
        tone(ctx, out, 440, t + s, i ? 0.45 : 0.26, "sawtooth", 0.07);
      });
      break;
    case "board_alkis":
      for (let i = 0; i < 38; i++) noise(ctx, out, t + Math.random() * 1.6, 0.05 + Math.random() * 0.04, 0.12 + Math.random() * 0.12, 900 + Math.random() * 1200);
      break;
    case "board_kriket":
      for (let g = 0; g < 3; g++) for (let i = 0; i < 4; i++) tone(ctx, out, 4600, t + g * 0.55 + i * 0.045, 0.03, "sine", 0.12);
      break;
    case "board_boing":
      tone(ctx, out, 140, t, 0.22, "sine", 0.45, 620);
      tone(ctx, out, 620, t + 0.2, 0.5, "triangle", 0.3, 160);
      break;
    case "board_trombon":
      [
        [392, 0, 0.32],
        [370, 0.36, 0.32],
        [349, 0.72, 0.32],
        [330, 1.08, 1.0],
      ].forEach(([f, s, d]) => tone(ctx, out, f, t + s, d, "sawtooth", 0.1, s > 1 ? f * 0.94 : undefined));
      break;
    case "board_scratch":
      noise(ctx, out, t, 0.18, 0.45, 1800);
      tone(ctx, out, 900, t, 0.18, "sawtooth", 0.05, 250);
      noise(ctx, out, t + 0.22, 0.22, 0.4, 1400);
      tone(ctx, out, 250, t + 0.22, 0.22, "sawtooth", 0.05, 1100);
      break;
    case "board_alarm":
      for (let i = 0; i < 6; i++) tone(ctx, out, i % 2 ? 660 : 880, t + i * 0.16, 0.15, "square", 0.08);
      break;
    case "board_gong":
      [110, 167, 233, 349].forEach((f, i) => tone(ctx, out, f, t, 2.6 - i * 0.4, "sine", 0.3 / (i + 1)));
      noise(ctx, out, t, 0.25, 0.15, 2500);
      break;
    case "board_zafer":
      [
        [523.25, 0, 0.14],
        [523.25, 0.16, 0.14],
        [523.25, 0.32, 0.14],
        [659.25, 0.48, 0.3],
        [587.33, 0.8, 0.14],
        [659.25, 0.96, 0.14],
        [783.99, 1.12, 0.8],
      ].forEach(([f, s, d]) => {
        tone(ctx, out, f, t + s, d, "sawtooth", 0.09);
        tone(ctx, out, f / 2, t + s, d, "square", 0.04);
      });
      break;
  }
  setTimeout(() => out.disconnect(), 3200);
}

// ------------------------------------------------------------
// Gerçek ses dosyaları: shop_items.audio_path ('sounds' bucket'ı) doluysa o çalar, yoksa yukarıdaki sentez sesler
// ------------------------------------------------------------
export type SoundItem = Pick<ShopItem, "id" | "kind" | "name" | "price" | "sort" | "emoji" | "audio_path">;
let soundsP: Promise<SoundItem[]> | null = null;

/** Efekt düğmeleri ve giriş sesleri (önbellekli) */
export function loadSoundItems(force = false): Promise<SoundItem[]> {
  if (!soundsP || force)
    soundsP = Promise.resolve(
      sb()
        .from("shop_items")
        .select("*")
        .in("kind", ["board", "sound"])
        .order("sort"),
    ).then(({ data }) => (Array.isArray(data) ? (data as SoundItem[]) : []));
  return soundsP;
}

/** Bir mağaza sesini çal: dosya varsa dosya, yoksa sentez */
export function playItemSound(it: Pick<SoundItem, "id" | "kind" | "audio_path">, volume = 0.8) {
  if (it.audio_path) {
    const a = new Audio(publicUrl("sounds", it.audio_path));
    a.volume = Math.min(1, volume);
    a.play().catch(() => (it.kind === "board" ? playBoard(it.id, volume) : playJingle(it.id, volume)));
    return a;
  }
  if (it.kind === "board") playBoard(it.id, volume);
  else playJingle(it.id, volume);
  return null;
}

/** Kimliğe göre çal (giriş sesi, uzaktan gelen efekt) */
export function playSoundId(id: string | undefined, volume = 0.8) {
  if (!id) return;
  loadSoundItems()
    .then((list) => {
      const it = list.find((x) => x.id === id);
      playItemSound(it ?? { id, kind: id.startsWith("board_") ? "board" : "sound", audio_path: null }, volume);
    })
    .catch(() => playJingle(id, volume));
}
