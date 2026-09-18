// Main-process only: no release credentials or updater IPC exposed to the renderer.
function setupUpdater({ app, autoUpdater, dialog, Menu, getWindow, timers = globalThis }) {
  let busy = false;
  let downloaded = false;
  let promptOpen = false;
  let disposed = false;
  let startupTimer;
  let interval;
  const supported = app.isPackaged && process.platform === 'win32';

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  function message(options) {
    const win = getWindow();
    return win && !win.isDestroyed()
      ? dialog.showMessageBox(win, options)
      : dialog.showMessageBox(options);
  }

  async function offerInstall() {
    if (promptOpen || disposed) return;
    promptOpen = true;
    try {
      const { response } = await message({
        type: 'info', title: 'Güncelleme hazır',
        message: 'Yeni sürüm indirildi.',
        detail: 'Yeniden başlatırsan açık görüşmen sonlanır. Hazır olduğunda kurulumu başlatabilirsin.',
        buttons: ['Daha sonra', 'Şimdi yeniden başlat'], defaultId: 0, cancelId: 0,
      });
      if (response === 1 && !disposed) {
        const win = getWindow();
        // Renderer'a "Guncelleniyor" yukleme ekranina gecmesi icin haber
        // verilir; kurulum "sifirdan setup" sihirbazi gibi gorunmesin diye
        // sessiz (isSilent=true) calisir - pencerelerin kapanip yeniden
        // acilmasi zaten dogal bir gecikme birakir.
        if (win && !win.isDestroyed()) win.webContents.send('update-installing');
        autoUpdater.quitAndInstall(true, true);
      }
    } finally { promptOpen = false; }
  }

  async function check(manual = false) {
    if (disposed) return;
    if (!supported) {
      if (manual) await message({ type: 'info', message: 'Güncellemeler kurulu Windows sürümünde kullanılabilir.' });
      return;
    }
    if (downloaded) return manual ? offerInstall() : undefined;
    if (busy) {
      if (manual) await message({ type: 'info', message: 'Güncelleme denetleniyor veya indiriliyor. Lütfen bekle.' });
      return;
    }
    busy = true;
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
      else if (manual) await message({ type: 'info', message: 'En güncel sürümü kullanıyorsun.', detail: `Sürüm: ${app.getVersion()}` });
    } catch {
      // Background network failures are retried on the next scheduled check.
      if (manual) await message({ type: 'warning', message: 'Güncelleme alınamadı.', detail: 'İnternet bağlantını kontrol edip tekrar dene. Yayınlanmış bir sürüm henüz bulunmuyor olabilir.' });
    } finally { busy = false; }
  }

  function refreshMenu() {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Uygulama', submenu: [
        { label: `Sürüm ${app.getVersion()}`, enabled: false },
        { label: downloaded ? 'Güncellemeyi yükle…' : 'Güncellemeleri denetle', click: () => { void check(true).catch(() => {}); } },
        { type: 'separator' }, { role: 'quit', label: 'Çıkış' },
      ] },
      { label: 'Düzen', submenu: [{ role: 'undo', label: 'Geri al' }, { role: 'redo', label: 'Yinele' }, { type: 'separator' }, { role: 'cut', label: 'Kes' }, { role: 'copy', label: 'Kopyala' }, { role: 'paste', label: 'Yapıştır' }, { role: 'selectAll', label: 'Tümünü seç' }] },
    ]));
  }
  const onDownloaded = () => {
    downloaded = true;
    refreshMenu();
    void offerInstall().catch(() => {});
  };
  const onError = () => {}; // Error events must be handled; check() owns user feedback.
  autoUpdater.on('error', onError);
  autoUpdater.on('update-downloaded', onDownloaded);
  refreshMenu();
  if (supported) {
    startupTimer = timers.setTimeout(() => { void check().catch(() => {}); }, 15_000);
    interval = timers.setInterval(() => { void check().catch(() => {}); }, 4 * 60 * 60 * 1000);
    startupTimer.unref?.();
    interval.unref?.();
  }
  function dispose() {
    disposed = true;
    timers.clearTimeout(startupTimer);
    timers.clearInterval(interval);
    autoUpdater.removeListener('error', onError);
    autoUpdater.removeListener('update-downloaded', onDownloaded);
  }
  app.once('will-quit', dispose);
  return { check, dispose };
}

module.exports = { setupUpdater };
