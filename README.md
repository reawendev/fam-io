<div align="center">

# 🎙️ fam-io

### Sahneyi seç, rolünü al, sesini ver.

Arkadaşlarınla film, dizi ve çizgi film sahnelerini seslendirdiğin **çok oyunculu dublaj oyunu**.<br/>
Herkes karakterini seçer, repliklerini kaydeder, final **herkesin ekranında aynı anda** başlar ve dublajlı video indirilir.

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white)

**Ücretsiz · Filigransız · Profil, seri ve level sistemiyle**

</div>

---

<!--
Ekran görüntüleri: docs/ klasörüne koyup aşağıdaki satırların yorumunu kaldır.
<p align="center">
  <img src="docs/lobi.png" width="32%" />
  <img src="docs/kayit.png" width="32%" />
  <img src="docs/final.png" width="32%" />
</p>
-->

## ✨ Özellikler

| | |
|---|---|
| 👤 **Profiller** | Kullanıcı adı + şifre ile profil. Dublajların, level'in, serin ve en uyumlu partnerlerin profilinde. |
| 🔥 **Günlük seri** | Her gün bir sahne tamamla, seri büyüsün. Günün ilk sahnesi bonus XP verir. |
| 🏆 **Level ve XP** | Sahne tamamla, replik seslendir, beğeni topla; level atla. |
| 💞 **Uyum** | Birlikte yaptığınız sahnelere ve aldıkları beğenilere göre arkadaşlarınla uyum yüzden. |
| 💬 **Beğeni ve yorum** | Dublajlara beğeni ve yorum bırak, canlı güncellenir. |
| 🔗 **Paylaşım linki** | Her dublajın herkese açık bir sayfası var; hesabı olmayan da izleyebilir. |
| 🎛️ **Ses efektleri** | Robot, Sincap, Kalın ses, Dev, Telefon, Megafon, Mağara, Uzaylı. Kayıttan sonra da değiştirilebilir; senkron bozulmaz. |
| 🗳️ **Final oylaması** | "Turun seslendirmeni" ve "En komik replik". Her oy +10 XP. |
| 🏅 **Rozetler** | 20+ otomatik rozet ve Kurucu, Erken Üye gibi özel rozetler; en iyileri isminin yanında. |
| 🗜️ **Otomatik sıkıştırma** | Yüklenen videolar tarayıcıda 720p'ye küçültülür; ücretsiz depolama çok daha geç dolar. |
| 💬 **Discord bildirimi** | Her yeni dublaj Discord kanalınıza otomatik düşer. |
| 🎭 **Karakter seçimi** | Herkes lobide istediği karakteri seçer; seçilmeyenler başlarken rastgele dağıtılır. |
| 🎧 **Orijinali dinle** | Kayıttan önce repliğin orijinal sesini dinle, benzer bir replik uydur. |
| 🎬 **Replik bazlı kayıt** | 3-2-1 geri sayım, altyazı ve ilerleme çubuğu. Geri sayım sırasındaki sesler finale girmez. |
| ↻ **Sınırsız tekrar çekim** | Kaydını dinle, beğenmezsen tekrar çek. Kendi sesinle tüm sahneyi önizle. |
| 🍿 **Senkron final** | Final, sunucu saatine göre herkesin ekranında aynı saniyede başlar; sonunda jenerik gelir. |
| ⬇️ **Videoyu indir** | Dublajlı video tamamen tarayıcıda üretilir (MP4/WebM). Sunucu yok, ücret yok, filigran yok. |
| 🤫 **Gizli kayıtlar** | Diğer oyuncuların kayıtları veritabanı seviyesinde (RLS) final başlayana kadar görünmez. |
| ✂️ **Sahne editörü** | Klibini yükle, 1–7 karakter ekle, karakter konuşurken **K**'ya basılı tutarak replikleri işaretle. |
| 🧊 **3D dublaj makinesi** | Ana sayfada döndürülebilir, tıklanabilir 3D sahne (Lobi → Kayıt → Miks → Prömiyer → İndir). |
| 🔒 **Arkadaş kapısı** | İsteğe bağlı site şifresiyle sadece tanıdıklara açık. |

## 🕹️ Nasıl oynanır?

```
 1. Oda kur        →  Kütüphaneden sahne seç, 5 haneli kodu arkadaşlarına at
 2. Karakter seç    →  Lobide herkes istediği karakteri alır
 3. Kaydet          →  Orijinali dinle (O), kaydet (R), beğenmezsen tekrar çek, "Hazırım" de
 4. Final           →  Oda sahibi başlatır, herkes aynı anda ilk kez izler
 5. İndir           →  Dublajlı videoyu MP4 olarak kaydet
```

## 🧠 Nasıl çalışıyor?

```mermaid
flowchart LR
    A[Lobi<br/>claim_role] -->|start_game<br/>kalanlar rastgele| B[Kayıt]
    B -->|start_finale<br/>finale_at = now + 6 sn| C[Final]
    C -->|reset_room| A
    C -->|start_finale| C
```

**Kayıt hizalama ve kırpma.** Her kayıt, MediaRecorder'ın başladığı andaki `video.currentTime` ile birlikte saklanır; böylece cihaz gecikmesi ne olursa olsun ses videoda doğru yere oturur. Oynatırken her kayıt sadece kendi replik aralığında çalınır, geri sayım sırasındaki sesler kırpılır.

**Tarayıcıda video üretimi.** Video kareleri bir canvas'a çizilir, sesler Web Audio ile miks edilir, `MediaRecorder` ikisini tek dosyaya yazar. H.264 destekleyen tarayıcılarda MP4, diğerlerinde WebM üretilir.

**Senkron final.** İstemci, `server_now()` RPC'siyle sunucu saatiyle arasındaki farkı ölçer ve `finale_at` anına göre geri sayar. Tüm ses kayıtları Web Audio API ile örnek hassasiyetinde planlanır. Video ses saatini takip eder; kayma olursa oynatma hızını ince ayarlayarak ya da atlayarak düzeltir. Bluetooth kulaklık gecikmesi de hesaba katılır.

**Sıfır render maliyeti.** Final sunucuda video olarak üretilmez, tarayıcıda canlı birleştirilir. Bu sayede proje Supabase ve Vercel'in ücretsiz katmanlarında rahatça çalışır.

**Güvenlik.** Rol dağıtma, kayıt kaydetme ve finali başlatma gibi yazma işlemleri yalnızca yetki kontrolü yapan `security definer` Postgres fonksiyonlarıyla yapılır. Kayıtlar Row Level Security ile korunur.

## 🛠️ Teknolojiler

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend:** Supabase (Postgres + RLS, Realtime, Storage, Auth)
- **Medya:** MediaRecorder API, Web Audio API (efektler dahil), WebCodecs + Mediabunny (sıkıştırma), Canvas captureStream
- **3D:** three.js (prosedürel, model dosyası yok)
- **Dağıtım:** Vercel

## 🚀 Kurulum

### 1. Supabase

1. [supabase.com](https://supabase.com) üzerinde yeni bir proje oluştur (ücretsiz plan yeterli).
2. **SQL Editor**'a `supabase/schema.sql` dosyasının tamamını yapıştır ve **Run**'a bas.
3. **Authentication → Sign In / Providers → Email** altında **"Confirm email" seçeneğini kapat.** (Kullanıcı adı + şifre ile giriş için gerekli; hiç e-posta gönderilmez.) "Allow new users to sign up" açık kalmalı.
4. **Project Settings → API** sayfasından `Project URL` ve `anon public` anahtarını kopyala.

### 2. Yerel geliştirme

```bash
git clone https://github.com/<kullanici-adi>/fam-io.git
cd fam-io
cp .env.example .env.local   # Supabase bilgilerini doldur
npm install
npm run dev
```

→ http://localhost:3000

### 3. Ortam değişkenleri

| Değişken | Açıklama |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase proje URL'si |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) anahtarı |
| `SITE_PASSWORD` | *(opsiyonel)* Tanımlanırsa site sadece şifreyi bilenlere açılır (paylaşım linkleri hariç) |
| `NEXT_PUBLIC_AUTH_EMAIL_DOMAIN` | *(opsiyonel)* Kullanıcı adından üretilen gizli e-posta adreslerinin alan adı |

### 4. Vercel'e deploy (komut satırından)

Windows'ta proje klasöründe `cmd` aç:

```bat
deploy env   :: ilk sefer: giriş yapar, projeyi bağlar, .env.local'i Vercel'e yükler ve yayınlar
deploy       :: sonraki güncellemeler
deploy preview
```

`deploy.cmd` Vercel CLI yoksa kurar, giriş yapılmamışsa giriş ister, proje bağlı değilse `vercel link` çalıştırır.
macOS/Linux'ta: `npx vercel link`, sonra `npm run deploy`.

> 💡 Tarayıcılar mikrofonu yalnızca **HTTPS** üzerinde (ve localhost'ta) açar. Telefondan denemek için deploy edilmiş sürümü kullan.

### Güncelleme (mevcut kurulum)

Veritabanı değişiklikleri `supabase/migrations/` klasöründe. Eski bir kurulumu güncellerken yeni dosyaları sırayla SQL Editor'da çalıştır.
Sıfırdan kurulumda sadece `schema.sql` yeterli. Ayrıntılar: [CHANGELOG.md](CHANGELOG.md).

## 🏆 Puan sistemi

| Olay | XP |
|---|---|
| Sahne tamamla | 40 |
| Seslendirdiğin her replik | +10 (en çok 20 replik) |
| Sahnedeki her partner | +10 (en çok 5) |
| Günün ilk sahnesi | +20 + seri × 5 (en çok +50) |
| Dublajın beğenildi | +5 (beğeni geri alınırsa −5) |
| Oylamada aldığın her oy | +10 (oy geri alınırsa −10) |

- **Level:** 1→2 için 100 XP, sonraki her level 50 XP daha fazla ister.
- **Seri:** En az bir replik kaydettiğin bir sahne finale ulaşınca o gün sayılır (İstanbul saati). Bir gün atlarsan sıfırlanır.
- **Uyum:** Birlikte tamamlanan sahne başına +10, o sahnelerin aldığı beğeni başına +3 puan; yüzdeye çevrilir.
- Bir odada finali tekrar oynatmak yeni XP vermez; her tur bir kez sayılır.

> **Şifresini unutan bir arkadaşın için** Supabase SQL Editor'da (kullanıcı adını ve yeni şifreyi değiştir):
> ```sql
> update auth.users set encrypted_password = extensions.crypt('yeni-sifre', extensions.gen_salt('bf'))
>  where email = 'kullaniciadi@users.fam-io.app';
> ```

## 🏅 Rozetler

Rozetlerin çoğu otomatik kazanılır (sunucudaki istatistiklerden hesaplanır). Özel rozetleri Supabase SQL Editor'dan sen verirsin:

```sql
-- ver (kurucu, beta, discord, destekci ya da katalog dışı yeni bir ad)
insert into user_badges (user_id, badge, note)
select id, 'kurucu', 'fam-io kurucusu' from profiles where username = 'kullaniciadi';

-- geri al
delete from user_badges where badge = 'beta' and user_id = (select id from profiles where username = 'kullaniciadi');

-- "Erken Üye" sınırını değiştir (varsayılan ilk 50 üye)
update app_settings set value = '100' where key = 'early_member_limit';
```

Görselleri kendin üretmek istersen: [docs/rozet-gorselleri.md](docs/rozet-gorselleri.md).

## 💬 Discord bildirimi (opsiyonel)

Her yeni dublaj Discord kanalınıza düşer. Kendi sunucun gerekmez; mesajı Supabase gönderir.

1. **Discord:** Kanal ayarları → **Entegrasyonlar** → **Webhook'lar** → **Yeni Webhook** → **Webhook URL'sini kopyala**.
2. **Supabase:** Database → **Extensions** → `pg_net`'i aç (migration açmayı dener; kapalıysa buradan aç).
3. **Supabase SQL Editor:**
   ```sql
   insert into app_settings (key, value) values
     ('discord_webhook_url', 'https://discord.com/api/webhooks/...'),
     ('site_url', 'https://sitenin-adresi.vercel.app')
   on conflict (key) do update set value = excluded.value;

   select discord_test();   -- kanala deneme mesajı gider
   ```
4. Kapatmak için: `delete from app_settings where key = 'discord_webhook_url';`

Webhook adresi `app_settings` tablosunda durur; bu tablo tarayıcıdan okunamaz, yani adres kimseyle paylaşılmaz.

## 🎞️ Sahne hazırlama ipuçları

- **30 sn – 2 dk** arası klipler idealdir. Büyük/yüksek çözünürlüklü videolar yüklenirken tarayıcıda otomatik olarak 720p'ye sıkıştırılır (Chrome/Edge/Safari); sıkıştırılmış dosya en fazla 50 MB olabilir.
- Orijinal konuşmalar finalde duyulmasın diye video sesi varsayılan olarak kapalıdır.
- Müzik ve efektler de duyulsun istersen klibin sesini bir vokal ayırıcıyla (ör. *Ultimate Vocal Remover*) ayır, sadece müzik/efekt kısmını editördeki **Ayrı müzik/efekt dosyası** alanına yükle.
- Replik metinlerini yazarsan kayıt sırasında altyazı olarak gösterilir.
- En iyi ses için oyunculara kulaklık önerin.
- Videoyu indirme en iyi masaüstü Chrome/Edge'de çalışır; üretim klip süresi kadar sürer, bu sırada sekmeyi açık tut.

## 📁 Proje yapısı

```
fam-io/
├── app/
│   ├── page.tsx                 # Ana sayfa: oda kur / katıl, son dublajlar
│   ├── hesap/                   # Giriş yap / profil oluştur
│   ├── u/[username]/            # Profil: level, seri, dublajlar, uyum
│   ├── d/[id]/                  # Herkese açık dublaj sayfası (beğeni, yorum, indir)
│   ├── sahneler/                # Sahne kütüphanesi ve editör
│   ├── oda/[code]/page.tsx      # Oda: lobi → kayıt → final
│   ├── giris/ + api/giris/      # Opsiyonel site şifresi
│   └── globals.css
├── components/
│   ├── ui.tsx                   # Ortak arayüz bileşenleri (Button, Panel, RoleTag…)
│   ├── SceneEditor.tsx          # Video yükleme, karakterler, replik işaretleme
│   ├── DubView.tsx              # Dublaj oynatıcı + beğeni + yorum
│   ├── DubCard.tsx              # Dublaj kartı (akış ve profil)
│   ├── VotePanel.tsx            # Final oylaması
│   ├── BadgeIcon.tsx            # Rozet çizimleri
│   ├── landing/DubbingMachine3D.tsx  # Ana sayfadaki 3D makine
│   └── room/
│       ├── useRoom.ts           # Oda durumu + Supabase Realtime
│       ├── Lobby.tsx
│       ├── Recorder.tsx         # Replik bazlı kayıt ve önizleme
│       └── Finale.tsx           # Senkron final ve jenerik
├── lib/
│   ├── player.ts                # DubPlayer: senkron oynatma + replik kırpma
│   ├── exporter.ts              # Tarayıcıda MP4/WebM üretimi
│   ├── supabase.ts              # İstemci, sunucu saat farkı
│   ├── auth.ts                  # Kullanıcı adı + şifre, oturum/profil store'u
│   ├── progress.ts              # Level, seri, uyum hesapları
│   ├── effects.ts               # Ses efektleri (perde kaydırma, filtreler, yankı)
│   ├── badges.ts                # Rozet kataloğu
│   ├── compress.ts              # Yüklemeden önce 720p sıkıştırma
│   └── types.ts
├── supabase/schema.sql          # Tablolar, RLS, RPC fonksiyonları, storage
├── supabase/migrations/         # Mevcut kurulumlar için güncellemeler
├── deploy.cmd                   # Windows'tan tek komutla Vercel deploy
└── proxy.ts                     # Şifre kapısı (Next.js 16 proxy)
```

## 🙏 Teşekkür

Ana sayfadaki 3D sahne, [Agentic Factory 3D](https://github.com/eugeneshilow/agentic-3d-templates) şablonundan fam-io'nun dublaj akışına göre uyarlanmıştır.

## ⚖️ Not

fam-io arkadaşlar arası, ticari olmayan kullanım için tasarlanmıştır. Yüklediğin içeriklerin haklarından sen sorumlusun; telif hakkıyla korunan içerikleri herkese açık şekilde yayınlama.

---

<div align="center">

**Developed by Reawen** 🎙️

</div>
