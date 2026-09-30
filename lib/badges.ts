import { levelInfo } from "./progress";

/**
 * Rozet kataloğu.
 * - Otomatik rozetler badge_stats() istatistiklerinden hesaplanır (hile yapılamaz, hepsi sunucuda sayılır).
 * - Özel rozetler (special: true) Supabase'de user_badges tablosuna elle eklenir; "Erken Üye" otomatiktir.
 * - Kendi görselini üretirsen public/badges/<id>.png olarak koy ve id'yi CUSTOM_BADGE_IMAGES listesine ekle.
 */

export type Tier = "bronz" | "gumus" | "altin" | "ozel";

export type BadgeStats = {
  dubs: number;
  lines: number;
  xp: number;
  best_streak: number;
  likes: number;
  comments: number;
  scenes: number;
  effects: number;
  votes: number;
  mvp_wins: number;
  funny_wins: number;
  best_duo: number;
  member_no: number;
  early_limit: number;
  special: { badge: string; note: string | null; granted_at: string }[];
};

export type BadgeDef = {
  id: string;
  name: string;
  desc: string;
  tier: Tier;
  icon: string; // lucide-react ikon adı
  /** Otomatik rozet: hangi istatistik, hedef kaç */
  metric?: (s: BadgeStats) => number;
  goal?: number;
  special?: boolean;
};

export const BADGES: BadgeDef[] = [
  // --- Özel (profilde isminin yanında görünür) ---
  { id: "kurucu", name: "Kurucu", desc: "fam-io'yu kuran kişi.", tier: "ozel", icon: "Crown", special: true },
  { id: "erken_uye", name: "Erken Üye", desc: "fam-io'ya ilk katılanlardan.", tier: "ozel", icon: "Sparkles", special: true },
  { id: "beta", name: "Beta Test", desc: "İlk sürümleri test edip hata yakaladı.", tier: "ozel", icon: "FlaskConical", special: true },
  { id: "discord", name: "Discord Ekibi", desc: "fam-io Discord sunucusunun üyesi.", tier: "ozel", icon: "Zap", special: true },
  { id: "destekci", name: "Destekçi", desc: "fam-io'ya emeği geçti.", tier: "ozel", icon: "Gem", special: true },

  // --- Sahne sayısı ---
  { id: "ilk_perde", name: "İlk Perde", desc: "İlk dublajını tamamla.", tier: "bronz", icon: "Clapperboard", metric: (s) => s.dubs, goal: 1 },
  { id: "sahne_tozu", name: "Sahne Tozu", desc: "10 dublaj tamamla.", tier: "gumus", icon: "Film", metric: (s) => s.dubs, goal: 10 },
  { id: "studyo_kurdu", name: "Stüdyo Kurdu", desc: "50 dublaj tamamla.", tier: "altin", icon: "Radio", metric: (s) => s.dubs, goal: 50 },

  // --- Seri ---
  { id: "kivilcim", name: "Kıvılcım", desc: "3 günlük seri yap.", tier: "bronz", icon: "Flame", metric: (s) => s.best_streak, goal: 3 },
  { id: "alev_alev", name: "Alev Alev", desc: "7 günlük seri yap.", tier: "gumus", icon: "Flame", metric: (s) => s.best_streak, goal: 7 },
  { id: "yanardag", name: "Yanardağ", desc: "30 günlük seri yap.", tier: "altin", icon: "Mountain", metric: (s) => s.best_streak, goal: 30 },

  // --- Oylama ---
  { id: "turun_sesi", name: "Turun Seslendirmeni", desc: "Bir turda en çok oyu al.", tier: "bronz", icon: "Mic", metric: (s) => s.mvp_wins, goal: 1 },
  { id: "altin_mikrofon", name: "Altın Mikrofon", desc: "10 turda seslendirmen seçil.", tier: "altin", icon: "MicVocal", metric: (s) => s.mvp_wins, goal: 10 },
  { id: "guldurucu", name: "Güldüren", desc: "Bir turun en komik repliği senin olsun.", tier: "bronz", icon: "Laugh", metric: (s) => s.funny_wins, goal: 1 },
  { id: "kahkaha_makinesi", name: "Kahkaha Makinesi", desc: "10 kez en komik replik seçil.", tier: "altin", icon: "Drama", metric: (s) => s.funny_wins, goal: 10 },

  // --- Sosyal ---
  { id: "begenilen", name: "Beğenilen", desc: "Dublajların toplam 10 beğeni alsın.", tier: "bronz", icon: "Heart", metric: (s) => s.likes, goal: 10 },
  { id: "yildiz", name: "Yıldız", desc: "Dublajların toplam 100 beğeni alsın.", tier: "altin", icon: "Star", metric: (s) => s.likes, goal: 100 },
  { id: "yorumcu", name: "Yorumcu", desc: "20 yorum yaz.", tier: "bronz", icon: "MessageCircle", metric: (s) => s.comments, goal: 20 },
  { id: "uyumlu_ikili", name: "Uyumlu İkili", desc: "Aynı arkadaşınla 5 sahne tamamla.", tier: "gumus", icon: "Users", metric: (s) => s.best_duo, goal: 5 },
  { id: "ruh_ikizi", name: "Ruh İkizi", desc: "Aynı arkadaşınla 20 sahne tamamla.", tier: "altin", icon: "HeartHandshake", metric: (s) => s.best_duo, goal: 20 },

  // --- Ustalık ---
  { id: "dil_cambazi", name: "Dil Cambazı", desc: "100 replik seslendir.", tier: "gumus", icon: "AudioLines", metric: (s) => s.lines, goal: 100 },
  { id: "ses_bukucu", name: "Ses Bükücü", desc: "Efektli 10 replik seslendir.", tier: "gumus", icon: "WandSparkles", metric: (s) => s.effects, goal: 10 },
  { id: "yonetmen", name: "Yönetmen", desc: "Kütüphaneye ilk sahneni ekle.", tier: "bronz", icon: "Video", metric: (s) => s.scenes, goal: 1 },
  { id: "studyo_sahibi", name: "Stüdyo Sahibi", desc: "Kütüphaneye 10 sahne ekle.", tier: "altin", icon: "Building2", metric: (s) => s.scenes, goal: 10 },
  { id: "usta", name: "Usta", desc: "Level 10'a ulaş.", tier: "altin", icon: "Trophy", metric: (s) => levelInfo(s.xp).level, goal: 10 },
];

/** Kendi görselini eklediğin rozetlerin id'leri (public/badges/<id>.png) */
export const CUSTOM_BADGE_IMAGES: string[] = [];

export const TIER_LABEL: Record<Tier, string> = { bronz: "Bronz", gumus: "Gümüş", altin: "Altın", ozel: "Özel" };
const TIER_RANK: Record<Tier, number> = { ozel: 4, altin: 3, gumus: 2, bronz: 1 };

export type BadgeState = BadgeDef & {
  earned: boolean;
  current: number;
  goal: number;
  note?: string | null;
};

export function computeBadges(stats: BadgeStats): BadgeState[] {
  const special = new Map(stats.special.map((s) => [s.badge, s]));
  // Katalogda olmayan elle verilmiş rozetler (ör. "yilin_sesi"): not alanı rozet adı olur
  const extra: BadgeState[] = stats.special
    .filter((s) => !BADGES.some((b) => b.id === s.badge))
    .map((s) => ({
      id: s.badge,
      name: s.note || s.badge,
      desc: s.note || "Özel rozet",
      tier: "ozel" as const,
      icon: "Award",
      special: true,
      earned: true,
      current: 1,
      goal: 1,
      note: null,
    }));
  return [...extra, ...BADGES.map((b) => {
    if (b.id === "erken_uye") {
      const earned = special.has(b.id) || (stats.member_no > 0 && stats.member_no <= stats.early_limit);
      return { ...b, earned, current: earned ? 1 : 0, goal: 1, note: earned ? `#${stats.member_no}. üye` : null };
    }
    if (b.special) {
      const s = special.get(b.id);
      return { ...b, earned: !!s, current: s ? 1 : 0, goal: 1, note: s?.note ?? null };
    }
    const current = b.metric ? b.metric(stats) : 0;
    const goal = b.goal ?? 1;
    return { ...b, earned: current >= goal, current: Math.min(current, goal), goal };
  })];
}

/** İsmin yanında gösterilecek en fazla 3 rozet: önce özeller, sonra en yüksek seviye */
export function featuredBadges(list: BadgeState[], max = 3) {
  return list
    .filter((b) => b.earned)
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || list.indexOf(a) - list.indexOf(b))
    .slice(0, max);
}
