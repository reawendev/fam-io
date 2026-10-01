import type { GameMod, GameMode } from "./types";

/** Oyun modları (arayüz metinleri). Kurallar veritabanında: start_game, save_recording, duel_* */
export const MODES: { id: GameMode; name: string; short: string; desc: string; min: number }[] = [
  {
    id: "klasik",
    name: "Klasik",
    short: "Herkes kendi karakterini seslendirir",
    desc: "Karakterini seç, repliklerini kaydet, final hep birlikte izlenir. Aşağıdaki eklerle renklendirebilirsin.",
    min: 1,
  },
  {
    id: "zincir",
    name: "Kulaktan kulağa",
    short: "Orijinali sadece ilk kişi duyar",
    desc: "Sırayla oynanır. İlk kişi orijinali dinleyip tüm sahneyi seslendirir; sonraki kişi sadece bir öncekinin kaydını duyar ve onu taklit eder. Sonunda replik bambaşka bir şeye dönüşür.",
    min: 2,
  },
  {
    id: "senarist",
    name: "Senarist",
    short: "Önce yaz, sonra seslendir",
    desc: "Önce herkes, kendi seslendirmediği karakterlerin repliklerini parodi olarak yeniden yazar. Sonra bu yeni metinler seslendirilir; jenerikte yazar ve seslendiren birlikte anılır.",
    min: 1,
  },
  {
    id: "duello",
    name: "Düello",
    short: "Aynı replikte kafa kafaya, eleme usulü",
    desc: "Oyuncular eşleşir; ikisi aynı repliği seslendirir, diğerleri oylar. Kazanan bir sonraki tura geçer. Şampiyon +50 XP ve kupa alır.",
    min: 2,
  },
];

export const MOD_INFO: Record<GameMod, { name: string; desc: string }> = {
  kart: { name: "Zorluk kartları", desc: "Her repliğe rastgele bir kart çıkar: fısıldayarak, spiker gibi, ağlayarak… Finalde kartı en iyi oynayan oylanır." },
  hain: { name: "Hain", desc: "Bir oyuncuya gizli bir görev verilir. Finalden sonra herkes haini tahmin eder. En az 3 oyuncu gerekir." },
  foley: { name: "Foley ustası", desc: "Bir oyuncu konuşmaz; tüm sahne boyunca kapı, ayak sesi, patlama gibi efektleri ağzıyla ya da eşyalarla yapar." },
};

export const modeName = (m?: string | null) => MODES.find((x) => x.id === m)?.name ?? "Klasik";

/** Zorluk kartları (kimlikler veritabanındaki _card_deck() ile aynı) */
export const CARDS: Record<string, { name: string; hint: string; emoji: string }> = {
  fisilti: { name: "Fısıldayarak", hint: "Sanki biri uyuyor, sesini hiç yükseltme.", emoji: "🤫" },
  spiker: { name: "Maç spikeri gibi", hint: "Gol anı heyecanıyla, nefes nefese.", emoji: "📣" },
  aglama: { name: "Ağlayarak", hint: "Hıçkırıklar dahil, dramın dibine vur.", emoji: "😭" },
  opera: { name: "Opera sanatçısı gibi", hint: "Söyleyerek değil, şakıyarak.", emoji: "🎭" },
  dede: { name: "Yaşlı biri gibi", hint: "Titrek, yavaş, biraz da söylenerek.", emoji: "👴" },
  bebek: { name: "Bebek sesiyle", hint: "İnce, tatlı, biraz da peltek.", emoji: "👶" },
  korsan: { name: "Korsan gibi", hint: "Arrr! Kalın ve hırıltılı.", emoji: "🏴‍☠️" },
  haber: { name: "Haber sunucusu gibi", hint: "Ciddi, net, her kelime tane tane.", emoji: "📺" },
  uykulu: { name: "Uykulu", hint: "Esneyerek, gözün kapanıyormuş gibi.", emoji: "😴" },
  kizgin: { name: "Çok kızgın", hint: "Kontrolünü kaybetmek üzeresin.", emoji: "😡" },
  drama: { name: "Abartılı drama", hint: "Pembe dizi finali gibi.", emoji: "💔" },
  kotu: { name: "Çizgi film kötüsü", hint: "Muhaha! Sinsi ve gürültülü.", emoji: "🦹" },
  rapci: { name: "Rapçi gibi", hint: "Ritimle, kafiye bulursan bonus.", emoji: "🎤" },
  ogretmen: { name: "Ders anlatan öğretmen", hint: "Sabırlı ama biraz da sıkılmış.", emoji: "👩‍🏫" },
  heyecan: { name: "Aşırı heyecanlı", hint: "Her şey dünyanın en güzel haberi.", emoji: "🤩" },
  robot_dans: { name: "Robot gibi", hint: "Bip bop, monoton ve kesik kesik.", emoji: "🤖" },
};
export const cardInfo = (id?: string | null) => (id ? CARDS[id] ?? { name: id, hint: "", emoji: "🃏" } : null);

/** Senarist modunda repliğin süresine göre önerilen en fazla karakter */
export const suggestedChars = (sec: number) => Math.max(12, Math.round(sec * 16));
