# Değişiklik notları

## 0.6.0 — 1 Ekim 2026

### Oyun modları
Lobide oda sahibi modu seçer; ekler klasik ve senarist modlarına eklenebilir.
- **Kulaktan kulağa:** Sırayla oynanır. İlk kişi orijinali dinleyip tüm sahneyi seslendirir; sonraki kişi orijinali değil, sadece bir öncekinin kaydını duyar (metin de gizli). Final, zinciri halka halka çalar; "Replik replik" bölümünde tek bir repliğin nasıl değiştiği karşılaştırılır.
- **Senarist:** Önce yazım aşaması: herkes, kendi seslendirmediği karakterlerin repliklerini yeniden yazar (repliğin süresine göre önerilen uzunluk, otomatik kayıt). Sonra yeni metinler seslendirilir; jenerikte "Senaryo" olarak yazarlar anılır.
- **Düello:** Eleme usulü turnuva. Her maçta iki oyuncu aynı repliği seslendirir (rakibin kaydı oylama açılana kadar gizli), diğerleri oylar, oda sahibi oylamayı kapatır. Tek kalan bay geçer. Maç başına +10, şampiyona +50 XP; Discord'a şampiyon duyurusu. Turnuva ağacı canlı güncellenir.
- **Ek: Zorluk kartları:** Her repliğe rastgele bir kart çıkar (Fısıldayarak, Maç spikeri gibi, Ağlayarak, Opera sanatçısı gibi… 16 kart). Kayıt ekranında ve finalde görünür; yeni oylama kategorisi "Kartı en iyi oynayan".
- **Ek: Hain:** Karakteri olan en az 3 kişi varsa biri gizlice hain seçilir ve gizli bir görev alır ("bir repliğinde patlıcan de" gibi). Finalden sonra herkes haini tahmin eder; oda sahibi ya da herkes oy verince açıklanır. Yakalanırsa doğru tahmin eden herkes +15 XP, yakalanmazsa hain +40 XP.
- **Ek: Foley ustası:** Bir oyuncu konuşmaz; tüm sahneyi tek seferde kaydedip efekt seslerini yapar. Finalde, dublaj sayfasında ve indirilen videoda duyulur.
- Oda sahibi sonuçları ("Turun seslendirmeni", "En komik replik", kart, hain) tek tuşla Discord'a gönderebilir.
- Yeni rozetler: Zincir Halkası, Senarist, Foley Ustası, Kart Ustası, Dedektif, Usta Hain, Kurnaz, Şampiyon, Yenilmez.

### XP mağazası (`/magaza`)
- Kazandığın XP ile kozmetik al: profil çerçeveleri (altın, neon, ateş, buz, gökkuşağı, hologram), isim efektleri, plaketler, giriş sesleri ve profil kapakları. Harcamak level'i düşürmez (bakiye = toplam XP − harcanan).
- Kozmetikler profilde, başlıkta, lobide, liderlikte, ekip sayfasında ve yorumlarda görünür. Giriş sesi odaya katıldığında diğerlerine çalar (lobide kapatılabilir).
- Yeni rozetler: Koleksiyoncu, Takım Oyuncusu.

### Profil
- **Kapak görseli:** Kendi görselini yükle (3:1 kırpılır) ya da mağazadan hazır kapak tak.
- **İmza sesi:** 5 saniyelik selamını kaydet; profilinde dinlenir, odaya katıldığında çalar.
- **Ziyaretçi defteri:** Profillere yorum bırakılabilir; yazan, profil sahibi ve yöneticiler silebilir. Canlı güncellenir.
- Profilde ekip etiketi, satın alınan plaket, çerçeve ve isim efekti.

### Ekipler (`/ekipler`, `/ekip/…`)
- Ekip kur (ad, 2–4 harfli etiket, renk, logo, açıklama), davet koduyla/linkiyle katıl. Bir kişi tek ekipte; ekip en çok 20 kişi.
- Haftalık ve tüm zamanlar ekip ligi (üyelerin XP toplamı). Kaptan davet kodunu yeniler, üye çıkarır; kaptan ayrılırsa kaptanlık en eski üyeye geçer.
- Liderlik tablosunda ve Discord'da ekip etiketi görünür.

### Discord komutları
- `/dublaj [sahne] [mod]` oda kurar ve kanala "Odaya katıl" butonlu davet atar (sahne adı otomatik tamamlanır), `/baglan kod:…` Discord hesabını profile bağlar, `/liderlik`, `/ekipler`, `/profil kullanici:…`.
- Kendi sunucu gerekmez: Discord istekleri Vercel'deki `/api/discord` rotasına gelir. Kurulum README'de.

### Veritabanı
- **Mevcut kurulum için:** `supabase/migrations/006_modlar_magaza_ekipler.sql` dosyasını bir kez çalıştır.
- `recordings` tekilliği artık (oda, replik, kişi); `dub_recordings` birincil anahtarı (dublaj, replik, kişi).
- Yeni tablolar: `room_cards`, `room_secrets`, `room_foley`, `room_line_texts`, `duel_matches`, `duel_takes`, `duel_votes`, `duel_results`, `dub_cards`, `dub_secrets`, `dub_foley`, `dub_line_texts`, `shop_items`, `user_items`, `profile_comments`, `teams`, `team_members`, `discord_links`, `discord_link_codes`.
- Not: 005 dosyasını 006'dan sonra tekrar çalıştırma (bazı fonksiyonları eski haline döndürür). Otomatik oda temizliği için README'deki tek satırlık cron SQL'ini kullan.

## 0.5.0 — 1 Ekim 2026

### Yeni
- **Profil fotoğrafı:** Profili düzenle → Fotoğraf seç. Tarayıcıda kare kırpılıp ~20 KB'a küçültülür; eskisi otomatik silinir. Fotoğraf her yerde görünür (başlık, lobi, kayıt, oylama, yorumlar, liderlik, kartlar).
- **Yapımcı (creator) sistemi:** Sahneyi ekleyen kişi kütüphanede, lobide, finalin jeneriğinde, dublaj sayfasında, kartlarda, paylaşım görselinde ve Discord mesajında "Oluşturan: …" olarak görünür.
  - Eklediğin sahne başkaları tarafından tamamlanınca **+15 XP**, o dublaj beğenilince **+2 XP**.
  - Profilde "Eklediği sahneler" sekmesi: sahne, oynanma, beğeni ve yapımcı XP'si.
  - Yeni rozetler: İlk Gösterim, Yapımcı, Gişe Rekoru, Alkış Tufanı, Kült Klasik (Yönetmen ve Stüdyo Sahibi bu gruba taşındı).
- **Haftalık liderlik tablosu** (`/liderlik`): Bu hafta, geçen hafta, tüm zamanlar ve yapımcılar. Pazartesi 00:00'da (İstanbul) sıfırlanır. Haftayı birinci bitiren **Haftanın Sesi** rozetini alır; 5 kez birinci olan **Hanedan** olur. Ana sayfada haftanın ilk 5'i.
- **Kütüphane:** Arama (başlık, açıklama, etiket), etiketler (en çok 5; öneriler var), karakter sayısı filtresi, Trend / Yeni / En çok oynanan sıralaması, oynanma sayıları. Sahnelerin kapak görseli var (kaydederken otomatik üretilir, editörde "Bu kare" ile seçilebilir).
- **Oda yönetimi:** Oda sahibi oyuncu çıkarabilir (çıkarılan tekrar giremez), odayı kilitleyebilir, sahipliği devredebilir. Lobiden ayrılan oda sahibinin yerine en eski oyuncu geçer; boşalan oda silinir.
- **Depolama temizliği:** Tekrar çekimde eski ses dosyası anında silinir. Yönetim panelinden kullanılmayan dosyalar ve 3 günlük hareketsiz odalar tek tıkla temizlenir; pg_cron açıksa eski odalar her gece otomatik silinir.
- **Yönetim paneli** (`/yonetim`, Kurucu rozeti olanlar): depolama kullanımı, Discord webhook / site adresi / Erken Üye ayarı ve test mesajı, rozet verme-alma, sahne silme, sahipsiz sahnelere yapımcı atama, eksik kapakları toplu üretme. Dublaj sayfasında yöneticiler yorum ve dublaj silebilir.

### Tasarım
- **Paylaşım görseli:** Dublaj linki Discord/WhatsApp/X'te sahne karesi, seslendirenlerin fotoğrafları, beğeni sayısı ve yapımcıyla 1200×630 kart olarak açılır. Sitenin kendi paylaşım görseli de var. (Vercel'de ücretsiz, `next/og`.)
- **Canlı ses dalgası:** Kayıt sırasında video üstünde mikrofon dalgası; kayıtta neredeyse hiç ses yoksa uyarı. Lobideki mikrofon testi de 8 saniyelik canlı dalga gösteriyor.
- **Ödül animasyonları:** XP kazanınca bildirim ("sen yokken +25 XP" dahil), yeni rozet açılınca dönen madalyon, level atlayınca konfetili kutlama. Aynı anda çok rozet açılırsa en değerli 3'ü gösterilir, kalanı tek bildirimde toplanır.
- **İlk giriş rehberi:** 3 adımlık tur; sonunda "Tek başına prova" ile kısa bir sahnede tüm karakterleri kendin seslendirip akışı görürsün. Menüden "Nasıl oynanır?" ile tekrar açılır.
- **Kurucu plaketi:** Kurucu rozeti olan profillerde, fareyle eğilen ve hologram gibi parlayan altın bir plaket (`components/AwardPlaque.tsx`; başka özel rozetler için de kullanılabilir).
- **Yükleniyor iskeletleri ve boş durumlar:** Kütüphane, akış, profil, liderlik, dublaj sayfası ve yönetim panelinde.
- Kütüphane artık giriş yapmadan da gezilebilir (oda kurmak için giriş gerekir).

### Veritabanı
- Yeni: `xp_events` (her XP hareketi), `profiles.avatar_path`, `scenes.tags / thumb_path / dub_count`, `dubs.creator_xp`, `rooms.locked / banned`, `avatars` bucket'ı, `scenes.created_by → profiles` bağlantısı.
- Yeni fonksiyonlar: `list_scenes`, `popular_tags`, `leaderboard`, `creator_board`, `creator_stats`, `kick_player`, `set_room_lock`, `transfer_host`, `is_admin`, `storage_orphans`, `admin_*`.
- Güncellenen: `_finalize_dub`, `_on_like`, `cast_vote`, `badge_stats`, `join_room`, `leave_room`, `compat_for`, `_notify_discord`.
- Depolama yetkileri: kullanıcılar kendi dosyalarını silebilir; yöneticiler kullanılmayan dosyaları silebilir.
- **Mevcut kurulum için:** `supabase/migrations/005_creator_liderlik_yonetim.sql` dosyasını bir kez çalıştır.

## 0.4.0 — 1 Ekim 2026

### Yeni
- **Ses efektleri:** Doğal, Robot, Kalın ses, Sincap, Dev, Telefon, Megafon, Mağara, Uzaylı. Kayıttan önce ya da sonra seçilir; kayıt bozulmaz, efekt oynatırken uygulanır ve istenildiği an değiştirilebilir. Perde değiştiren efektler süreyi korur, dudak senkronu kaymaz. Finale, paylaşım sayfasına ve indirilen videoya da uygulanır.
- **Final oylaması:** "Turun seslendirmeni" ve "En komik replik". Sadece o sahnede oynayanlar oy verir, kendine oy verilemez; oy değiştirilebilir ya da geri alınabilir. Alınan her oy +10 XP. Finalde ve dublaj sayfasında canlı güncellenir.
- **Rozetler:** 20 otomatik rozet (sahne sayısı, seri, oylama, beğeni, yorum, uyumlu ikili, efekt, sahne yükleme, level) ve özel rozetler (Kurucu, Erken Üye, Beta Test, Discord Ekibi, Destekçi). En değerli 3 rozet profilde ismin yanında görünür; kazanılmamış rozetler ilerleme çubuğuyla gösterilir. İlk 50 üye otomatik "Erken Üye" olur. Katalog dışı özel rozetler de elle verilebilir.
- **Otomatik video sıkıştırma:** Sahne yüklerken büyük videolar tarayıcıda 720p'ye küçültülür (ses korunur). Supabase'in 1 GB depolama ve 5 GB/ay trafik sınırını çok daha geç doldurur; 50 MB'tan büyük videolar da artık yüklenebilir. Chrome/Edge/Safari'de MP4 (H.264), diğerlerinde WebM.
- **Discord bildirimi:** Her yeni dublajda Discord kanalına sahne adı, seslendirenler ve link içeren bir mesaj gider. Supabase içinden gönderilir (pg_net); webhook adresi tarayıcıya hiç ulaşmaz.
- `docs/rozet-gorselleri.md`: kendi rozet görsellerini üretmek için stil rehberi ve promptlar.

### Veritabanı
- Yeni: `dub_votes`, `user_badges`, `app_settings`; `recordings.effect`, `dub_recordings.effect`.
- Yeni fonksiyonlar: `set_recording_effect`, `cast_vote`, `badge_stats`, `discord_test`.
- **Mevcut kurulum için:** `supabase/migrations/004_efekt_oylama_rozet_discord.sql` dosyasını bir kez çalıştır.

## 0.3.1 — 1 Ekim 2026

### Düzeltmeler
- **Lobide "Seç" tepki vermiyordu:** Seçim kaydediliyordu ama ekran sadece canlı güncelleme gelince yenileniyordu. Artık her işlemden (seç, bırak, sahne değiştir, başlat, hazırım, final, yeni tur) sonra oda anında yeniden yükleniyor.
- Lobideki hata mesajları sayfanın altından karakter listesinin üstüne taşındı.
- Veritabanında bir fonksiyon/tablo eksikse (migration çalıştırılmamışsa) teknik hata yerine hangi dosyanın çalıştırılması gerektiği yazıyor.

## 0.3.0 — 1 Ekim 2026

### Yeni
- **Profiller:** Herkes kullanıcı adı + şifre ile profil oluşturur (e-posta yok). Oynamak için profil zorunlu. Profil sayfası: `/u/kullaniciadi`. Görünen ad, hakkında yazısı ve renk düzenlenebilir.
- **Level ve XP:** Sahne tamamlayınca XP kazanılır (40 + replik başına 10 + partner başına 10). Dublajın beğenildiğinde +5 XP. Level eğrisi: 1→2 için 100 XP, sonraki her level 50 XP daha fazla. Unvanlar: Çaylak, Yetenek, Seslendirmen, Usta seslendirmen, Efsane.
- **Günlük seri (streak):** En az bir replik kaydettiğin bir sahne finale ulaştığında o gün sayılır (İstanbul saatine göre). Dün de oynadıysan seri artar, bir gün kaçırırsan sıfırlanır. Günün ilk sahnesi +20 XP + seri × 5 bonus verir (en çok 50).
- **Uyum:** Birlikte tamamlanan her sahne +10, o sahnelerin aldığı her beğeni +3 uyum puanı. Profilde en uyumlu partnerler yüzde ile listelenir; başkasının profilinde "Seninle uyumu" görünür.
- **Dublaj arşivi:** Her finalde dublaj kalıcı olarak kaydedilir ve katılan herkesin profiline işlenir. Oda yeni tura geçse de silinmez.
- **Paylaşım linki:** Her dublajın bir sayfası var (`/d/…`). Linke sahip herkes, hesabı olmasa da izleyebilir (site şifresi bu sayfalara uygulanmaz). Sayfadan video da indirilebilir.
- **Beğeni ve yorum:** Üyeler dublajları beğenip yorum yazabilir; ikisi de canlı güncellenir. Kendi yorumunu silebilirsin.
- Finalde "+XP kazandın" özeti ve paylaş butonu; ana sayfada "Son dublajlar" akışı; başlıkta seri ve level.

### Değişenler
- Anonim giriş ve takma ad kaldırıldı; oyuncu adı profildeki görünen addan gelir.
- Oda kurma ve odaya katılma artık profil gerektiriyor.

### Veritabanı
- Yeni tablolar: `profiles`, `dubs`, `dub_cast`, `dub_participants`, `dub_recordings`, `dub_likes`, `dub_comments`. `rooms.current_dub_id` eklendi.
- XP ve seri yalnızca sunucuda (`_finalize_dub`) hesaplanır; kullanıcılar kendi XP'sini değiştiremez.
- **Mevcut kurulum için:** SQL Editor'da `supabase/migrations/003_profiller_ve_sosyal.sql` dosyasını bir kez çalıştır.
- **Supabase ayarı:** Authentication → Sign In / Providers → Email → **Confirm email kapalı** olmalı.

## 0.2.0 — 30 Eylül 2026

### Yeni
- **Karakter seçimi:** Oyuncular lobide istedikleri karakteri seçer (birden fazla da olabilir). Aynı karakteri iki kişi alamaz. Kimsenin seçmediği karakterler başlarken en az karakteri olan oyunculara rastgele dağıtılır. Yeni turda sadece elle seçilenler korunur.
- **Videoyu indir:** Finalden sonra dublajlı video tamamen tarayıcıda üretilip indirilir (H.264 destekleyen tarayıcıda MP4, diğerlerinde WebM). Sunucu ya da ücretli servis yok; klip süresi kadar sürer.
- **Orijinali dinle:** Kayıttan önce repliğin orijinal sesi dinlenebilir (`O` tuşu). Senaryodaki her repliğin yanında da dinleme butonu var.
- **Klavye kısayolları (kayıt):** `R` kaydet / tekrar çek, `O` orijinali dinle, `P` kaydımı dinle, `Esc` durdur / iptal.
- **3D dublaj makinesi:** Ana sayfada etkileşimli 3D sahne (Lobi → Kayıt → Miks → Prömiyer → İndir). İstasyona tıklayınca "Nasıl çalışır" adımı vurgulanır.
- **Komut satırından deploy:** `deploy.cmd` (Windows) ve `npm run deploy`.

### Düzeltmeler
- **Geri sayım sesi artık finale girmiyor:** Kayıt hizalama için yine geri sayımla başlıyor ama oynatmada ve dışa aktarımda her kayıt sadece kendi replik aralığında çalınıyor (başta 0.15 sn, sonda 0.4 sn pay, kısa yumuşatma ile).
- Geri sayım 2 saniyeden 3 saniyeye çıktı ve ekranda 3-2-1 olarak gösteriliyor.
- Yeni Supabase projelerinde görülen `permission denied for table scenes` hatası (tablo yetkileri şemaya eklendi).

### Tasarım
- Arayüz baştan tasarlandı: nötr koyu yüzeyler, tek vurgu rengi, Geist yazı tipi, Lucide ikonları. Emojiler, gradyan arka plan ve cam efektleri kaldırıldı.
- Ortak arayüz bileşenleri: `components/ui.tsx`.
- Oda üst çubuğu: oda kodu (tıkla = davet linkini kopyala), sahne adı, aşama göstergesi (Lobi · Kayıt · Final).
- Sahne editöründe zaman çizelgesi her karakter için ayrı şerit olarak gösteriliyor.
- Takma ad sağ üstten her sayfada değiştirilebiliyor.

### Veritabanı
- `room_roles.picked` sütunu, `claim_role` ve `release_role` fonksiyonları eklendi; `start_game`, `reset_room`, `leave_room`, `change_scene` güncellendi.
- **Mevcut kurulum için:** Supabase SQL Editor'da `supabase/migrations/002_karakter_secimi.sql` dosyasını bir kez çalıştır.

## 0.1.0 — 29 Eylül 2026
- İlk sürüm: sahne kütüphanesi ve editörü, oda kur/katıl, rastgele rol dağıtımı, replik bazlı kayıt, senkron final, opsiyonel site şifresi.
