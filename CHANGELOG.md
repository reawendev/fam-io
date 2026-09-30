# Değişiklik notları

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
