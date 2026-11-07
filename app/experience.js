(() => {
  function friendlyError(value, status) {
    const text = String(value?.message || value || '');
    if (status === 429) return 'Çok hızlı işlem yaptın. Biraz bekleyip tekrar dene.';
    if (status === 401) return 'Oturumun sona ermiş. Lütfen tekrar giriş yap.';
    if (status >= 500) return 'Sunucu şu anda işlemi tamamlayamadı. Biraz sonra tekrar dene.';
    if (/NotAllowedError|Permission denied|permission dismissed/i.test(text)) return 'İzin verilmedi. Mikrofon veya ekran kaydı iznini kontrol et.';
    if (/NotFoundError|device.*not.*found/i.test(text)) return 'Ses cihazı bulunamadı. Mikrofonunun bağlı olduğunu kontrol et.';
    if (/fetch failed|failed to fetch|networkerror|ERR_|ECONN|timeout|timed out/i.test(text)) return 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.';
    if (/stack|SQL|postgres|constraint|TypeError|undefined|Internal Server|\bHTTP\s*\d/i.test(text)) return 'İşlem tamamlanamadı. Lütfen tekrar dene.';
    return text || 'Bir sorun oluştu. Lütfen tekrar dene.';
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { friendlyError }; return; }
  window.aloFriendlyError = friendlyError;
  const busy = document.createElement('div'); busy.className = 'request-progress'; busy.hidden = true;
  busy.setAttribute('role', 'status'); busy.innerHTML = '<span class="ux-spinner" aria-hidden="true"></span> İşlemin tamamlanıyor…';
  document.body.append(busy);
  const offline = document.createElement('section'); offline.className = 'offline-screen'; offline.hidden = true;
  offline.setAttribute('role', 'alert');
  offline.innerHTML = '<div><span class="offline-symbol" aria-hidden="true">⌁</span><h2>Bağlantın kesildi</h2><p>İnternete bağlandığında ALO yeniden bağlantı kuracak. Yazdığın mesajlar bu ekranda korunuyor.</p><button type="button" class="btn">Tekrar dene</button><p class="offline-status" role="status"></p></div>';
  document.body.append(offline);
  const nativeFetch = window.fetch.bind(window);
  let pending = 0; let timer = null;
  const syncOffline = () => { offline.hidden = navigator.onLine; };
  window.addEventListener('offline', syncOffline); window.addEventListener('online', syncOffline); syncOffline();
  offline.querySelector('button').onclick = async () => {
    const button = offline.querySelector('button'); button.disabled = true;
    const status = offline.querySelector('.offline-status'); status.textContent = 'Bağlantı kontrol ediliyor…';
    try {
      const response = await nativeFetch(getServerUrl() + '/', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!response.ok) throw new Error();
      offline.hidden = true; status.textContent = '';
      if (socket && !socket.connected) socket.connect();
    } catch { status.textContent = 'Bağlantı hâlâ kurulamıyor. Wi-Fi veya kablo bağlantını kontrol et.'; }
    finally { button.disabled = false; }
  };
  window.fetch = async (...args) => {
    pending++;
    if (pending === 1) timer = setTimeout(() => { busy.hidden = false; }, 300);
    try { return await nativeFetch(...args); }
    catch (error) { syncOffline(); throw error; }
    finally { if (--pending === 0) { clearTimeout(timer); busy.hidden = true; } }
  };
})();
