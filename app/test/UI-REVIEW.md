# Arayüz kontrolü

`app` dizininde `npm run test:ui` çalıştırıp `http://127.0.0.1:45422` adresini açın.
“Tüm kontrolleri çalıştır” düğmesi gerçek uygulamayı 1280×720, 900×700 ve
720×560 boyutlarında kontrol eder. Üç önizleme ayrıca görsel inceleme içindir.

Testler menü/içerik hizalamasını, klavye navigasyonunu, DM görünürlüğünü,
dört tema ile modern düzenin birlikte çalışmasını, klasik etiketlerin geri
gelmesini, sohbet yüksekliğini, mesaj kutusunun görünürlüğünü, üye menülerini,
dar pencere panellerini ve yatay taşmayı doğrular.

Sunucu geçici bir yerel veritabanı ve test hesapları oluşturur; üretim
adresinin yerine yalnızca önizlemede yerel adres kullanılır. Ctrl+C ile
durdurun. `test` dizini uygulama paketine dahil edilmez.

Kontrollerden sonra üç önizlemeyi gözle de inceleyin. Bu testler gerçek
mikrofon, hoparlör ve Electron bildirimlerinin yerini tutmaz.
