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

## Testler

```bash
cd server
npm test
```

Her test dosyası kendi izole geçici SQLite dosyasını kullanır (gerçek bir
PostgreSQL'e ihtiyaç duymaz), bu yüzden `npm test` hep hızlı ve yerel çalışır.
