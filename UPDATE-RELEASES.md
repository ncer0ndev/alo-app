# Windows ve macOS otomatik güncellemeleri

Uygulama kurulu Windows veya macOS sürümünde açılıştan 15 saniye sonra ve her 4 saatte
GitHub Releases üzerinde yeni kararlı sürüm arar. Güncelleme arka planda
indirilir. Kullanıcı açıkça yeniden başlatmayı seçmeden kurulum yapılmaz;
normal çıkışta da otomatik kurulum kapalıdır. Üstteki **Uygulama** menüsünden
elle kontrol veya ertelenen güncellemeyi kurma işlemi yapılabilir.

## İlk dağıtım

Otomatik güncelleme içermeyen eski kurulumlar bu özelliği kendiliğinden alamaz.
Bu değişiklikleri içeren ilk kurulum dosyasını bir kez elle yüklemek gerekir.

Güncelleme kaynağı mevcut git uzak adresine göre `ncer0ndev/alo-app` GitHub
Releases olarak ayarlandı. Bu deponun **public ve sürüm dosyalarının anonim
indirilebilir** olması gerekir. Özel depoysa kullanıcı uygulamasına token
koymayın: ayrı public dağıtım deposu açıp `build.publish.owner/repo` alanlarını
ilk dağıtımdan önce değiştirin. Depo görünürlüğü bu çalışma sırasında doğrulanmadı.

## Yeni sürüm hazırlama

1. Testleri çalıştırın ve değişiklikleri GitHub'a gönderin.
2. GitHub Actions'ta **Publish Windows release** veya
   **Publish macOS release (unsigned)** iş akışını açın.
3. Daha önce kullanılmamış, kurulu sürümden yüksek bir sürüm numarası girin.
   Workflow bu numarayı paket içine yazar; aynı sürüm numarası kurulu
   istemcileri güncellemez.
4. Windows akışı NSIS kurulum dosyası, `.blockmap` ve `latest.yml`; macOS akışı
   Universal `.dmg`, `.zip` ve `latest-mac.yml` üretip yayınlanmış GitHub
   Release'e yükler.

Alternatif yerel paketleme: Windows için `npm ci` ardından `npm run dist`,
macOS için macOS üzerinde `npm run dist:mac`. Bu komutlar yayın yapmaz.
İmzalı dağıtım için kod imzalama sertifikası/CI sırları ayrıca
yapılandırılmalıdır; sertifika veya token uygulama dosyalarına eklenmemelidir.
İmzasız kurulumlarda Windows uyarabilir; imzasız macOS paketi ilk kez açılırken
Finder'da uygulamaya sağ tıklayıp **Aç** seçilmelidir.

## Gerçek güncelleme testi

- İki farklı sürüm ve temiz bir Windows veya macOS test ortamı kullanın.
- Önce düşük sürümü kurun; yüksek sürümün yayınlanmış dosyaları ve `latest.yml`
  erişilebilir olduğunda menüden kontrol edin.
- “Daha sonra” seçildiğinde uygulamanın ve görüşmenin açık kaldığını doğrulayın.
- Menüden kurulumu seçin; onaydan sonra yeni sürümle yeniden açıldığını,
  tema/oturum tercihlerinin korunduğunu kontrol edin.
- Ağ yokken hata mesajını ve bağlantı geri geldikten sonra tekrar denemeyi sınayın.

Bu depo değişikliği kendi başına GitHub sürümü yayınlamaz. Gerçek indirme ve
kurulum testi için yayınlanmış iki sürüm gerekir. Otomatik testler güncelleme
akışını taklit eder; gerçek NSIS kurulumunun yerine geçmez.
