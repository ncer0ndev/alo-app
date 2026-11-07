(() => {
  if (window.api || !/^https?:$/.test(location.protocol)) return;
  document.documentElement.classList.add('web-client');
  const mobile = matchMedia('(max-width: 680px)');
  const menu = document.createElement('button'); menu.className = 'mobile-menu-button'; menu.type = 'button';
  menu.textContent = '☰'; menu.setAttribute('aria-label', 'Mesajlar ve topluluklar'); menu.setAttribute('aria-expanded', 'false');
  document.querySelector('.masthead').prepend(menu);
  const backdrop = document.createElement('button'); backdrop.className = 'mobile-drawer-backdrop'; backdrop.hidden = true;
  backdrop.setAttribute('aria-label', 'Menüyü kapat'); document.body.append(backdrop);
  function close() { document.body.classList.remove('mobile-drawer-open'); menu.setAttribute('aria-expanded', 'false'); backdrop.hidden = true; }
  menu.onclick = () => {
    const open = document.body.classList.toggle('mobile-drawer-open'); menu.setAttribute('aria-expanded', String(open)); backdrop.hidden = !open;
  };
  backdrop.onclick = close;
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.querySelector('#community-rail').addEventListener('click', event => { if (event.target.closest('.community-server-item, .dm-rail-item, .rail-home-btn, .group-rail-list button')) close(); });
  mobile.addEventListener('change', close);
  // Electron-specific preferences have no equivalent in the browser.
  for (const id of ['run-in-background-checkbox', 'launch-at-login-checkbox', 'game-detection-checkbox']) {
    const label = document.getElementById(id)?.closest('label');
    if (label) { if (label.nextElementSibling?.classList.contains('hint-text')) label.nextElementSibling.hidden = true; label.hidden = true; }
  }
  document.querySelectorAll('#tab-settings .section-header').forEach(header => { if (/pencere ve tepsi|oyun durumu/i.test(header.textContent)) header.hidden = true; });
  document.querySelector('.app-settings')?.setAttribute('hidden', '');
  document.querySelector('input[name="mic-mode"][value="ptt"]')?.closest('label')?.setAttribute('hidden', '');
  const install = document.createElement('section'); install.className = 'social-tools';
  install.innerHTML = '<h3>ALO’yu telefonuna ekle</h3><p>iPhone: Safari → Paylaş → Ana Ekrana Ekle.<br>Android: tarayıcı menüsü → Uygulamayı yükle / Ana ekrana ekle.</p><button type="button" class="btn" hidden>ALO’yu yükle</button><p>Telefon kilitlenince veya başka uygulamaya geçince görüşme kesilebilir. İlk sürümde görüşme sırasında ALO’yu açık tut.</p>';
  document.querySelector('#tab-settings').prepend(install);
  let prompt = null; const installButton = install.querySelector('button');
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event; installButton.hidden = false; });
  installButton.onclick = async () => { if (!prompt) return; await prompt.prompt(); await prompt.userChoice; prompt = null; installButton.hidden = true; };
  window.addEventListener('appinstalled', () => { prompt = null; installButton.hidden = true; });
  if (!navigator.mediaDevices?.getDisplayMedia) {
    const note = document.createElement('p'); note.className = 'mobile-share-note'; note.textContent = 'Bu cihazda ekran yayınlama desteklenmiyor. Arkadaşlarının paylaştığı ekranı izleyebilirsin.';
    document.querySelector('#tab-settings').append(note);
    document.documentElement.classList.add('no-screen-capture');
  }
  // Browser clipboard requires a user gesture; desktop IPC is not available.
  document.querySelector('#copy-code-btn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentRoomCode || ''); showToast('Oda kodu kopyalandı.', 'ok'); }
    catch { showToast('Kodu seçip elle kopyalayabilirsin.', 'info'); }
  });
  document.querySelector('#copy-server-invite-btn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(activeServerDetail?.inviteCode || ''); showToast('Davet kodu kopyalandı.', 'ok'); }
    catch { showToast('Kodu seçip elle kopyalayabilirsin.', 'info'); }
  });
  if ('serviceWorker' in navigator && window.isSecureContext && location.pathname.startsWith('/mobile/')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
