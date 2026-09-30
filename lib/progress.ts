import type { Profile } from "./types";

/**
 * Level eğrisi: 1→2 için 100 XP, sonraki her level 50 XP daha fazla ister.
 * (Lv2: 100, Lv3: 250, Lv4: 450, Lv5: 700 … toplam XP)
 */
export function levelInfo(xp: number) {
  let level = 1;
  let need = 100;
  let rest = Math.max(0, xp);
  while (rest >= need) {
    rest -= need;
    level++;
    need = 100 + (level - 1) * 50;
  }
  return { level, into: rest, need, pct: rest / need };
}

export function levelTitle(level: number) {
  if (level >= 20) return "Efsane";
  if (level >= 12) return "Usta seslendirmen";
  if (level >= 7) return "Seslendirmen";
  if (level >= 3) return "Yetenek";
  return "Çaylak";
}

/** İstanbul saatine göre bugünün tarihi (YYYY-MM-DD) */
export function istanbulToday(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);
}

/** Seri bugün ya da dün sürdüyse geçerli; aksi hâlde bozulmuştur (0). */
export function currentStreak(p: Pick<Profile, "streak" | "last_streak_day">) {
  if (!p.last_streak_day) return 0;
  const diff = dayDiff(istanbulToday(), p.last_streak_day);
  return diff <= 1 ? p.streak : 0;
}

/** Bugün zaten sahne tamamlandı mı? (seri bugün için güvende mi) */
export function streakDoneToday(p: Pick<Profile, "last_streak_day">) {
  return p.last_streak_day === istanbulToday();
}

/** Uyum puanı → yüzde (azalan getiri; birkaç sahneden sonra hızlı yükselir, 99'da durur) */
export function compatPercent(score: number) {
  return Math.min(99, Math.round(100 * (1 - Math.exp(-score / 60))));
}

export function compatLabel(pct: number) {
  if (pct >= 85) return "Ruh ikizi";
  if (pct >= 65) return "Çok uyumlu";
  if (pct >= 40) return "Uyumlu";
  if (pct >= 15) return "Isınıyor";
  return "Yeni tanışıyor";
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "az önce";
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}
