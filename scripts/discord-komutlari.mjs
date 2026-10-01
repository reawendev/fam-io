// fam-io Discord komutlarını kaydeder (bir kez çalıştırman yeterli; komutları değiştirince tekrar çalıştır).
//
// Kullanım (Windows cmd):
//   set DISCORD_APP_ID=123...
//   set DISCORD_BOT_TOKEN=abc...
//   set DISCORD_GUILD_ID=456...      (isteğe bağlı: sadece bu sunucuya, anında görünür)
//   node scripts/discord-komutlari.mjs
//
// Bot token'ı sadece bu komut için gerekir; Vercel'e koymana gerek yok.

const APP = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID;
if (!APP || !TOKEN) {
  console.error("DISCORD_APP_ID ve DISCORD_BOT_TOKEN ortam değişkenlerini ayarla.");
  process.exit(1);
}

const commands = [
  {
    name: "dublaj",
    description: "fam-io'da yeni bir dublaj odası kur ve kanala davet linki at",
    options: [
      { type: 3, name: "sahne", description: "Sahne (boş bırakırsan rastgele; Kulaktan kulağa modunda gerekmez)", required: false, autocomplete: true },
      {
        type: 3,
        name: "mod",
        description: "Oyun modu",
        required: false,
        choices: [
          { name: "Klasik", value: "klasik" },
          { name: "Kulaktan kulağa (sahnesiz)", value: "kulak" },
          { name: "Kim konuştu? (sahnesiz)", value: "kim" },
          { name: "Efekt yarışması (sahnesiz)", value: "efekt" },
          { name: "Duygu ruleti (sahnesiz)", value: "duygu" },
          { name: "Sesli hikâye (sahnesiz)", value: "hikaye" },
          { name: "Taklit zinciri", value: "zincir" },
          { name: "Senarist", value: "senarist" },
          { name: "Düello", value: "duello" },
        ],
      },
    ],
  },
  {
    name: "baglan",
    description: "Discord hesabını fam-io profiline bağla",
    options: [{ type: 3, name: "kod", description: "fam-io → Profili düzenle → Discord'u bağla", required: true }],
  },
  { name: "liderlik", description: "Bu haftanın fam-io liderlik tablosu" },
  { name: "ekipler", description: "Haftalık ekip ligi" },
  {
    name: "profil",
    description: "Bir fam-io profilini göster",
    options: [{ type: 3, name: "kullanici", description: "Kullanıcı adı", required: true }],
  },
];

const url = GUILD
  ? `https://discord.com/api/v10/applications/${APP}/guilds/${GUILD}/commands`
  : `https://discord.com/api/v10/applications/${APP}/commands`;
const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
const out = await res.json();
if (!res.ok) {
  console.error("Kaydedilemedi:", res.status, JSON.stringify(out, null, 2));
  process.exit(1);
}
console.log(`${out.length} komut kaydedildi${GUILD ? " (sunucuya özel, hemen görünür)" : " (tüm sunucular; görünmesi birkaç dakika sürebilir)"}:`);
for (const c of out) console.log("  /" + c.name);
