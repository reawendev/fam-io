# Rozet görselleri — üretim rehberi

Sitede şu an her rozet için **kod ile çizilmiş vektör** bir görsel var (bronz / gümüş / altın madalyon, özel rozetler için holografik altıgen). Daha gösterişli görseller istersen aşağıdaki promptlarla üretip değiştirebilirsin.

## Nasıl eklenir?

1. Görseli **512×512 PNG, şeffaf arka plan** olarak kaydet.
2. Dosya adı rozetin kimliği olsun: `public/badges/<id>.png` (ör. `public/badges/erken_uye.png`).
3. `lib/badges.ts` içindeki listeye kimliği ekle:
   ```ts
   export const CUSTOM_BADGE_IMAGES: string[] = ["erken_uye", "kurucu"];
   ```
4. `git push` → site güncellenince yeni görsel görünür. Eklemediğin rozetler vektör çizimle kalır.

> Kazanılmamış rozetler sitede otomatik olarak gri ve soluk gösterilir; ayrı "kilitli" görsel üretmene gerek yok.

## Araç ipuçları

- **Midjourney:** promptun sonuna `--ar 1:1 --style raw --v 7` ekle. Şeffaf arka plan vermediği için düz koyu arka planla üret, sonra bir arka plan silici kullan (ör. remove.bg ya da Photoshop "Remove background").
- **ChatGPT / DALL·E, Ideogram, Recraft:** "transparent background" ifadesini koru. Recraft'ta "Icon" ya da "3D" stilini seç.
- Seti tutarlı tutmak için önce **tek bir rozet** üret, beğendiğin sonucu referans görsel olarak diğerlerinde de kullan (Midjourney `--sref`, ChatGPT'de "aynı stilde").
- Promptlar İngilizce; görsel modelleri İngilizceyle daha tutarlı sonuç veriyor.

---

## 1. Ortak stil (her promptun başına ekle)

```
A premium mobile-game achievement badge, 3D rendered, front view, perfectly centered, single object,
polished metal and glossy enamel, crisp beveled edges, soft studio lighting with a thin rim light,
subtle warm orange accent glow (#FF7A1A), clean readable silhouette that still works at 32 pixels,
minimal detail, no text, no letters, no numbers, transparent background, 1:1
```

**Negatif (destekleyen araçlarda):**
```
text, letters, watermark, signature, cluttered background, multiple objects, cropped, blurry, photorealistic hands, faces
```

## 2. Seviye çerçeveleri

| Seviye | Çerçeveye eklenecek tarif |
|---|---|
| **Bronz** | `round medallion with a notched rim, warm bronze and copper metal, dark charcoal enamel center` |
| **Gümüş** | `round medallion with a notched rim, brushed silver platinum metal, dark charcoal enamel center, cool highlights` |
| **Altın** | `round medallion with a notched rim, rich polished gold, dark charcoal enamel center, tiny sparkle highlights` |
| **Özel** | `hexagonal emblem, iridescent holographic metal shifting from orange to pink to violet to cyan, dark glass center, faint light rays behind` |

Prompt yapısı: **Ortak stil + Seviye çerçevesi + Motif**

---

## 3. Rozetler

### Özel rozetler (profilde isminin yanında görünür)

| id | Ad | Motif (prompta ekle) |
|---|---|---|
| `kurucu` | Kurucu | `a regal crown resting on top of a vintage studio microphone, gold details` |
| `erken_uye` | Erken Üye | `a glowing four-point star rising from a film reel, early dawn light, sense of "first ones"` |
| `beta` | Beta Test | `a bubbling laboratory flask with a tiny sound wave inside the liquid` |
| `discord` | Discord Ekibi | `a lightning bolt crossing a chat speech bubble, electric energy` (Discord logosunu kullanma; telif/marka sorunu olur) |
| `destekci` | Destekçi | `a faceted gemstone cradled by two small hands made of sound waves` |

### Sahne sayısı

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `ilk_perde` | İlk Perde | Bronz | `a clapperboard snapping shut, small motion lines` |
| `sahne_tozu` | Sahne Tozu | Gümüş | `a strip of film curling around, with sparkling dust particles` |
| `studyo_kurdu` | Stüdyo Kurdu | Altın | `a retro "on air" studio radio console with glowing knobs` |

### Seri

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `kivilcim` | Kıvılcım | Bronz | `a small spark igniting into a tiny flame` |
| `alev_alev` | Alev Alev | Gümüş | `a tall roaring flame with blue core` |
| `yanardag` | Yanardağ | Altın | `a stylized volcano erupting with golden lava` |

### Oylama

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `turun_sesi` | Turun Seslendirmeni | Bronz | `a classic dynamic microphone with a small spotlight beam` |
| `altin_mikrofon` | Altın Mikrofon | Altın | `a golden condenser microphone on a stand, trophy-like, laurel leaves around the base` |
| `guldurucu` | Güldüren | Bronz | `a laughing face emoji-style mask, tears of joy` |
| `kahkaha_makinesi` | Kahkaha Makinesi | Altın | `comedy and tragedy theatre masks, the comedy mask larger and laughing` |

### Sosyal

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `begenilen` | Beğenilen | Bronz | `a glossy heart with a small shine` |
| `yildiz` | Yıldız | Altın | `a five-point star with a trail, like a shooting star` |
| `yorumcu` | Yorumcu | Bronz | `two overlapping speech bubbles` |
| `uyumlu_ikili` | Uyumlu İkili | Gümüş | `two microphones leaning toward each other forming a heart shape` |
| `ruh_ikizi` | Ruh İkizi | Altın | `two sound waves intertwining into an infinity symbol` |

### Ustalık

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `dil_cambazi` | Dil Cambazı | Gümüş | `a tongue-twister: a swirling ribbon of sound waves forming a knot` |
| `ses_bukucu` | Ses Bükücü | Gümüş | `a magic wand bending a sound wave into a spiral` |
| `usta` | Usta | Altın | `a trophy cup with a microphone engraved on it` |

### Yapımcı (sahne ekleyenler)

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `yonetmen` | Yönetmen | Bronz | `a director's chair with a small megaphone` |
| `ilk_gosterim` | İlk Gösterim | Bronz | `a single cinema ticket stub with a tiny star punched in it` |
| `yapimci` | Yapımcı | Gümüş | `a clapperboard snapping shut with a small spark` |
| `gise_rekoru` | Gişe Rekoru | Gümüş | `an overflowing popcorn bucket with a rising arrow made of popcorn` |
| `alkis_tufani` | Alkış Tufanı | Gümüş | `two clapping hands bursting with confetti` |
| `kult_klasik` | Kült Klasik | Altın | `a vintage film reel with a laurel wreath around it` |
| `studyo_sahibi` | Stüdyo Sahibi | Altın | `a tiny recording studio building with a glowing red "on air" lamp` |

### Liderlik

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `haftanin_sesi` | Haftanın Sesi | Altın | `a medal on a ribbon with a microphone in the center and a small "7-day" calendar ring around it (no numbers, just seven dots)` |
| `hanedan` | Hanedan | Altın | `a small castle tower topped with a crown and a microphone-shaped flag` |

### Oyun modları

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `partici` | Partici | Bronz | `a party popper bursting confetti shaped like tiny sound waves` |
| `parti_krali` | Parti Kralı | Altın | `a crown resting on top of a disco ball microphone` |
| `hikaye_anlatici` | Hikâye Anlatıcı | Bronz | `an open storybook with a speech bubble rising from its pages` |
| `istek_avcisi` | İstek Avcısı | Bronz | `an inbox tray with a film reel dropping into it` |
| `dilek_perisi` | Dilek Perisi | Gümüş | `a magic wand with a film clapperboard star at its tip` |
| `kulak_misafiri` | Kulak Misafiri | Bronz | `a single cupped ear with three small sound waves entering it` |
| `fisildayan` | Fısıldayan | Gümüş | `two stylized profiles facing each other with a curly whisper line passing between their lips and ear` |
| `zincir_halkasi` | Zincir Halkası | Bronz | `three chain links where the middle one is shaped like a speech bubble` |
| `senarist` | Senarist | Bronz | `a fountain pen writing on a tiny film script page` |
| `foley_ustasi` | Foley Ustası | Bronz | `a pair of coconut shells and a small door hinge with sound lines` |
| `kart_ustasi` | Kart Ustası | Gümüş | `a fanned hand of three playing cards with microphone symbols instead of suits` |
| `dedektif` | Dedektif | Gümüş | `a magnifying glass revealing a hidden theater mask` |
| `usta_hain` | Usta Hain | Gümüş | `a venetian masquerade mask with a sly glint` |
| `kurnaz` | Kurnaz | Altın | `a venetian mask with a fox silhouette, crown-like gold filigree` |
| `sampiyon` | Şampiyon | Altın | `two crossed microphones like swords under a small crown` |
| `yenilmez` | Yenilmez | Altın | `a trophy cup with crossed microphones and a laurel wreath` |

### Mağaza ve ekip

| id | Ad | Seviye | Motif |
|---|---|---|---|
| `koleksiyoncu` | Koleksiyoncu | Gümüş | `a small treasure chest overflowing with tiny badges and stars` |
| `takim_oyuncusu` | Takım Oyuncusu | Bronz | `a shield with three small figures holding hands` |

---

## Örnek (tam prompt)

**Altın Mikrofon:**
```
A premium mobile-game achievement badge, 3D rendered, front view, perfectly centered, single object,
polished metal and glossy enamel, crisp beveled edges, soft studio lighting with a thin rim light,
subtle warm orange accent glow (#FF7A1A), clean readable silhouette that still works at 32 pixels,
minimal detail, no text, no letters, no numbers, transparent background, 1:1,
round medallion with a notched rim, rich polished gold, dark charcoal enamel center, tiny sparkle highlights,
a golden condenser microphone on a stand, trophy-like, laurel leaves around the base
```

## Yeni özel rozet eklemek

Katalogda olmayan bir rozeti de verebilirsin (ör. "Yılın Sesi 2026"). Supabase SQL Editor:

```sql
insert into user_badges (user_id, badge, note)
select id, 'yilin_sesi_2026', 'Yılın Sesi 2026' from profiles where username = 'ali';
```

`note` alanı rozetin adı olarak görünür. Görsel eklemek istersen `public/badges/yilin_sesi_2026.png` + `CUSTOM_BADGE_IMAGES` listesine ekle.
