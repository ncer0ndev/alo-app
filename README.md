# ALO // VOICE

Electron masaüstü istemcisi (`app/`) + Node.js/Express/Socket.IO sinyalleşme
sunucusu (`server/`) olan bir sesli sohbet uygulaması: hesaplar, arkadaşlıklar,
birebir aramalar, topluluklar (metin/ses kanalları, roller, moderasyon) ve
kalıcı mesaj geçmişi içerir.

## Veritabanı

Sunucu tek bir sorgu kod tabanını (`server/db.js`) iki farklı motora karşı
çalıştırır - bkz. `server/db-adapter.js`:

- **Yerel geliştirme / testler**: `DATABASE_URL` tanımlı değilse otomatik
  olarak yerel bir SQLite dosyası kullanılır (varsayılan `server/data/app.db`,
  `DB_PATH` ile özelleştirilebilir). Kurulum gerekmez, `npm start` yeter.
- **Production**: `DATABASE_URL` bir PostgreSQL bağlantı dizesi olarak
  tanımlıysa sunucu otomatik olarak PostgreSQL'e geçer.

Şema, `server/migrations/` altındaki sürümlü migration dosyalarıyla
yönetilir (her migration hem SQLite hem PostgreSQL için DDL içerir).
Sunucu açılışında otomatik olarak uygulanmamış migration'ları çalıştırır
(`server/migrate.js`); elle çalıştırmak için:

```bash
cd server
node migrate.js
# veya
npm run migrate
```

Sunucu, dinlemeye başlamadan önce veritabanı bağlantısını doğrular
(`db.testConnection()`); bağlantı kurulamazsa şifre/bağlantı dizesi
LOGLANMADAN anlaşılır bir hata basılıp süreç sonlanır - hiçbir otomatik
şema sıfırlama yapılmaz.

### Render'da PostgreSQL ile deploy

1. Render Dashboard'da bir **PostgreSQL** instance'ı oluşturun (ücretsiz
   katman yeterlidir).
2. Web servisinizin ortam değişkenlerine, Postgres instance'ının **Internal
   Database URL** değerini `DATABASE_URL` olarak ekleyin (aynı Render
   bölgesindeyse internal URL SSL gerektirmez ve daha hızlıdır; dışarıdan
   bağlanıyorsanız External URL'i kullanın - bu durumda varsayılan SSL
   davranışı zaten doğrudur, `PGSSLMODE` ayarlamanıza gerek yoktur).
3. `JWT_SECRET`'ı (uzun, rastgele bir değer) ekleyin - bkz. `server/.env.example`.
4. Deploy edin. Sunucu ilk açılışta migration'ları otomatik uygular ve
   tabloları oluşturur; elle bir şey yapmanız gerekmez.
5. **Eski Turso verisi taşınacaksa** (yalnızca bir kez, elle): önce yeni
   Postgres'e karşı `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` (kaynak) ve
   `DATABASE_URL` (hedef) ile
   ```bash
   node scripts/migrate-turso-to-postgres.js
   ```
   çalıştırın. Bu komut yalnızca OKUR (kaynağa hiç yazmaz), hedefte önce
   migration'ları çalıştırıp sonra tüm tabloları bağımlılık sırasında
   kopyalar. Sunucu başlangıcına bağlı değildir, otomatik tetiklenmez -
   deploy'dan önce, ayrı bir adım olarak elle çalıştırılmalıdır. Yerel bir
   SQLite dosyasından taşımak için `--from-sqlite <yol>` kullanın.

Tüm ortam değişkenlerinin tam listesi ve açıklamaları için
`server/.env.example` dosyasına bakın.

## Kullanıcıların kendi profil resmi/banner'ı yüklemesi

Katalogdaki hazır seçeneklerin yanında, kullanıcılar kendi PNG/JPEG profil
resimlerini ve PNG/JPEG/**animasyonlu GIF** banner'larını yükleyebilir.
Yüklenen dosyalar veritabanını şişirmemek için harici, ücretsiz bir
Cloudinary hesabında saklanır - sunucu yalnızca dönen URL'i tutar.

1. [cloudinary.com](https://cloudinary.com) üzerinde ücretsiz bir hesap açın
   (kredi kartı istemez, 25GB'a kadar ücretsiz).
2. Dashboard'da görünen **API Environment variable** kutusundaki değeri
   (örn. `cloudinary://123456789:AbCdEf...@your-cloud-name`) kopyalayıp
   `CLOUDINARY_URL` olarak sunucunuzun ortam değişkenlerine ekleyin.
3. Bu değişken boşsa yükleme uç noktaları düzgün bir hata döner; katalogdan
   seçim (mevcut davranış) etkilenmez.

## Yerel geliştirme

```bash
cd server
npm install
cp .env.example .env   # JWT_SECRET doldurun, DATABASE_URL'i BOŞ bırakın
npm start
```

```bash
cd app
npm install
npm start
```

## macOS sürümü

GitHub Actions içindeki **Publish macOS release (unsigned)** iş akışı,
Apple Silicon ve Intel Mac'lerde çalışan tek bir Universal uygulama üretir.
İş akışını çalıştırırken daha önce kullanılmamış bir sürüm numarası girin.
Çıktılar GitHub Releases bölümüne `.dmg`, `.zip` ve `latest-mac.yml` olarak
yüklenir.

Apple Developer hesabı kullanılmadığı için uygulama imzasızdır. İlk açılışta
Finder'da ALO'ya sağ tıklayıp **Aç** seçeneğini kullanın ve macOS onayını verin.
Mikrofon izni istendiğinde izin verin. Apple Silicon ve Intel için ayrı dosya
seçmeye gerek yoktur; `universal` paket ikisini de içerir.

Yerel olarak yalnızca macOS üzerinde paketlemek için:

```bash
cd app
npm ci
npm run dist:mac
```

## Mobil web / PWA

Sunucu aynı hesap ve görüşme altyapısını `/mobile/` altında mobil web arayüzüyle
birlikte sunar. Yerelde `server/` içinde `npm start` sonrası
`http://localhost:3000/mobile/` açılabilir. Gerçek telefonda mikrofon ve PWA
kurulumu için HTTPS üzerinden yayınlanmalıdır. Masaüstü Electron istemcisi
aynı kod tabanını kullanır ve mobil düzen yalnızca web istemcisinde uygulanır.

Yayın sonrasında iPhone'da Safari → Paylaş → Ana Ekrana Ekle, Android'de
Chrome → Uygulamayı yükle / Ana ekrana ekle kullanılabilir. Android yükleme
istemini tarayıcı desteklediğinde Ayarlar'da yükleme düğmesi de çıkar.

Web istemcisinde tepsi, başlangıç uygulaması, oyun algılama ve sistem genelinde
bas-konuş gösterilmez. Ekran paylaşma desteği cihazdan kontrol edilir;
desteklenmeyen telefonda yayın düğmesi gizlenir, gelen paylaşım izlenebilir.
Hoparlör yönlendirme ve arka plan/ekran kilidi sırasında görüşmenin sürmesi
tarayıcıya bağlıdır; gerçek iPhone/Android üzerinde ayrıca test edilmelidir.

Service worker yalnızca çevrimdışı karşılama sayfasını ve kurulum ikonlarını
saklar; mesajlar, tokenlar ve API yanıtları cache'e alınmaz. Yeni sürümün
etkinleşmesi açık eski PWA pencereleri kapandıktan sonra gerçekleşir; açık
görüşme sırasında zorla yenileme yapılmaz.

Mobil statik dosya testi:

```bash
cd server
node --test test/mobile-web.test.js
```

## Testler

```bash
cd server
npm test
```

Her test dosyası kendi izole geçici SQLite dosyasını kullanır (gerçek bir
PostgreSQL'e ihtiyaç duymaz), bu yüzden `npm test` hep hızlı ve yerel çalışır.

### Masaüstü sürüm yayınlama

`app/package.json` ve `app/package-lock.json` sürümlerini birlikte artırın.
GitHub Actions içindeki **Publish Windows and Mac release** akışını çalıştırın.
Akış iki platformu aynı koddan derler; her ikisi başarılı olduğunda dosyaları
önce taslağa yükler ve `vX.Y.Z` etiketli yayını son sürüm olarak yayınlar.
Yayınlanmış sürüm numarası tekrar kullanılmaz.
Windows güncellemeyi uygulama içinden indirir ve onayla kurar.
Apple imzası olmayan Mac sürümünde güncelleme düğmesi indirme sayfasını açar;
DMG içindeki uygulama Uygulamalar klasöründeki eski sürümün yerine kopyalanır.

### E-posta doğrulama ve şifre sıfırlama

Eski hesaplar **Ayarlar → E-posta ve hesap kurtarma** bölümünden mevcut
şifrelerini girerek adres ekler. Adres, 30 dakikalık tek kullanımlık bağlantıyla
doğrulanana kadar şifre kurtarmada kullanılmaz. Giriş ekranındaki **Şifremi
unuttum** düğmesi doğrulanmış adrese bağlantı gönderir. Şifre sıfırlanınca
eski HTTP/Socket oturumları geçersiz olur ve açık bağlantılar kapatılır.

Sunucuda şu ortam değişkenlerini tanımlayın (anahtarı repoya eklemeyin):
- `RESEND_API_KEY`: Resend gönderim anahtarı.
- `MAIL_FROM`: Resend üzerinde doğrulanmış alan adınızdan gönderen adresi.
- `PUBLIC_APP_URL`: Kullanıcıların erişebildiği HTTPS sunucu adresi,
  örneğin `https://alo-app.onrender.com`.

Resend hesabında alan adını ekleyin, verilen DNS kayıtlarını alan adı
sağlayıcısında tanımlayıp doğrulayın; ardından gönderim anahtarı oluşturun.
Üç değişkeni Render Environment bölümüne ekleyip sunucuyu yeniden başlatın.
Bağlantı sayfası `/account/` adresindedir; masaüstü uygulamasının kurulu
olması gerekmez. Bağlantı anahtarı URL parçasında taşınır, sayfa açılınca
adres çubuğundan kaldırılır ve yalnızca kullanıcı onayladığında gönderilir.

Ayarlar eksikse gönderim açık bir mesajla kapalı tutulur. API yanıtları veya
sunucu kayıtları doğrulama/sıfırlama anahtarlarını içermez. Otomatik testler
sahte bir gönderici kullanır; gerçek posta göndermez.

### Brevo ile gönderim

Resend yerine Brevo kullanmak için Render Environment alanına
`BREVO_API_KEY`, `MAIL_FROM` (Brevo'da doğrulanmış gönderen e-postası) ve
`PUBLIC_APP_URL` ekleyin. `MAIL_FROM`, düz e-posta adresi veya
`ALO <gonderen@example.com>` biçiminde olabilir. Brevo anahtarı varsa Brevo
seçilir; yoksa mevcut Resend ayarları korunur. İletişim HTTPS API üzerinden
yapılır; SMTP portlarına ihtiyaç yoktur. Brevo'nun hesap/gönderici onayı ve
ücretsiz adreslere uyguladığı gönderici değiştirme kuralları geçerlidir.
Anahtarı tarayıcıya, masaüstü paketine veya GitHub'a koymayın.
