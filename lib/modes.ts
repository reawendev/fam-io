import type { GameMod, GameMode } from "./types";

/** Oyun modları (arayüz metinleri). Kurallar veritabanında: start_game, save_recording, duel_* */
export const MODES: { id: GameMode; name: string; short: string; desc: string; min: number; scene: boolean }[] = [
  {
    id: "klasik",
    name: "Klasik",
    short: "Herkes kendi karakterini seslendirir",
    desc: "Karakterini seç, repliklerini kaydet, final hep birlikte izlenir. Aşağıdaki eklerle renklendirebilirsin.",
    min: 1,
    scene: true,
  },
  {
    id: "kulak",
    name: "Kulaktan kulağa",
    short: "Sahnesiz: cümle ağızdan ağıza değişir",
    desc: "Sahne yok. Herkes gizli bir cümleyi sesli okur; sonraki kişi sadece o sesi dinleyip tekrarlar, sonuncu duyduğunu yazar. Herkesin cümlesi aynı anda dolaşır, kimse beklemez. Finalde baştaki cümleyle sondaki hali karşılaştırılır.",
    min: 2,
    scene: false,
  },
  {
    id: "kim",
    name: "Kim konuştu?",
    short: "Sesini değiştir, kimse tanımasın",
    desc: "Herkes aynı cümleyi sesini değiştirerek okur. Kayıtlar isimsiz ve karışık çalınır; hangisinin kime ait olduğunu tahmin edersin. Doğru tahmin sana, seni tanıyamayanlar sana puan. 3 tur.",
    min: 3,
    scene: false,
  },
  {
    id: "efekt",
    name: "Efekt yarışması",
    short: "Ağzınla efekt yap, en iyisi kazansın",
    desc: "Ekrana bir efekt çıkar: kapı gıcırtısı, uzay gemisi kalkışı, dinozor kükremesi… Herkes ağzıyla ya da eşyalarla yapar, kayıtlar isimsiz oylanır. 3 tur.",
    min: 3,
    scene: false,
  },
  {
    id: "duygu",
    name: "Duygu ruleti",
    short: "Aynı cümle, gizli duygu",
    desc: "Herkes aynı cümleyi kendisine gizlice düşen bir duyguyla okur (aşık, şüpheli, uykulu…). Diğerleri hangi duygu olduğunu tahmin eder; doğru bilinirse ikinize de puan. 3 tur.",
    min: 2,
    scene: false,
  },
  {
    id: "hikaye",
    name: "Sesli hikâye",
    short: "Sırayla bir cümle ekle",
    desc: "Bir açılış cümlesiyle başlar. Sırası gelen, sadece bir önceki parçayı dinleyip hikâyeye bir cümle ekler. Finalde bütün hikâye baştan sona çalınır.",
    min: 2,
    scene: false,
  },
  {
    id: "zincir",
    name: "Taklit zinciri",
    short: "Sahneyi sırayla taklit edin",
    desc: "Sırayla oynanır. İlk kişi sahnenin orijinalini dinleyip tüm sahneyi seslendirir; sonraki kişi sadece bir öncekinin kaydını duyar ve onu taklit eder. Sonunda replikler bambaşka bir şeye dönüşür.",
    min: 2,
    scene: true,
  },
  {
    id: "senarist",
    name: "Senarist",
    short: "Önce yaz, sonra seslendir",
    desc: "Önce herkes, kendi seslendirmediği karakterlerin repliklerini parodi olarak yeniden yazar. Sonra bu yeni metinler seslendirilir; jenerikte yazar ve seslendiren birlikte anılır.",
    min: 1,
    scene: true,
  },
  {
    id: "duello",
    name: "Düello",
    short: "Aynı replikte kafa kafaya, eleme usulü",
    desc: "Oyuncular eşleşir; ikisi aynı repliği seslendirir, diğerleri oylar. Kazanan bir sonraki tura geçer. Şampiyon +50 XP ve kupa alır.",
    min: 2,
    scene: true,
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

export const needsScene = (m?: string | null) => !m || ["klasik", "zincir", "senarist", "duello"].includes(m);
export const isParty = (m?: string | null) => m === "kim" || m === "efekt" || m === "duygu";
/** Parti modlarında en uzun kayıt (sn) */
export const PARTY_MAX_SEC: Record<string, number> = { kim: 8, efekt: 6, duygu: 8, hikaye: 12 };

/** Duygu ruleti (kimlikler veritabanındaki _duygu_list() ile aynı) */
export const EMOTIONS: Record<string, { name: string; emoji: string }> = {
  mutlu: { name: "Mutlu", emoji: "😄" },
  uzgun: { name: "Üzgün", emoji: "😢" },
  kizgin: { name: "Kızgın", emoji: "😠" },
  korkmus: { name: "Korkmuş", emoji: "😨" },
  saskin: { name: "Şaşkın", emoji: "😲" },
  utangac: { name: "Utangaç", emoji: "😳" },
  heyecanli: { name: "Heyecanlı", emoji: "🤩" },
  sikilmis: { name: "Sıkılmış", emoji: "😒" },
  asik: { name: "Aşık", emoji: "😍" },
  supheli: { name: "Şüpheli", emoji: "🤨" },
  gururlu: { name: "Gururlu", emoji: "😌" },
  uykulu: { name: "Uykulu", emoji: "🥱" },
};
export const emotion = (id?: string | null) => (id ? (EMOTIONS[id] ?? { name: id, emoji: "🎭" }) : null);
