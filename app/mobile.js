(() => {
  if (window.api || !/^https?:$/.test(location.protocol)) return;
  document.documentElement.classList.add('web-client');
  const mobileInfo = document.createElement('section'); mobileInfo.className = 'social-tools';
  const mobileVersion = document.createElement('p'); mobileVersion.textContent = 'Mobil sürüm: 2026.11.07-b';
  const permissionHelp = document.createElement('p');
  permissionHelp.textContent = 'Mikrofon izni her görüşmede soruluyorsa Safari → Sayfa menüsü → Web Sitesi Ayarları → Mikrofon → İzin Ver seç. Site verilerini temizlemek veya özel gezinmek bu tercihi sıfırlayabilir. Ekran paylaşımı için her seferinde sistem onayı gerekir.';
  const shareDiagnostic = document.createElement('p'); shareDiagnostic.setAttribute('role', 'status');
  shareDiagnostic.textContent = sessionStorage.getItem('alo-last-share-state') || 'Henüz ekran paylaşımı denenmedi.';
  mobileInfo.append(mobileVersion, permissionHelp, shareDiagnostic);
  document.querySelector('#tab-settings').append(mobileInfo);
  document.addEventListener('alo-share-state', event => {
    const labels = { 'device-ended': 'Ekran yakalama cihaz/tarayıcı tarafından sonlandırıldı.', 'user-stop': 'Paylaşım durdurma düğmesiyle kapatıldı.', 'room-or-owner-change': 'ALO, oda veya paylaşan kişi değiştiği için yakalamayı kapattı.', 'connection-paused': 'Bağlantı kesildi; ALO ekran yakalamayı kapatmadı.' };
    const text = labels[event.detail?.reason];
    if (!text) return;
    shareDiagnostic.textContent = text + (event.detail.hidden ? ' ALO arka plandaydı.' : ' ALO ön plandaydı.');
    sessionStorage.setItem('alo-last-share-state', shareDiagnostic.textContent);
  });
  // Native Safari controls offer its own PiP/fullscreen affordances where supported.
  const sharedVideo = document.querySelector('#shared-screen');
  if (sharedVideo) sharedVideo.controls = true;
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
  // A channel/member drawer must not remain over the conversation after selection.
  const community = document.querySelector('#community-area');
  document.querySelector('.server-channel-rail')?.addEventListener('click', event => {
    if (mobile.matches && event.target.closest('button, [role="button"]')) {
      community.classList.remove('show-channels');
      document.querySelector('#toggle-channels')?.setAttribute('aria-expanded', 'false');
    }
  });
  for (const [id, other] of [['toggle-channels', 'show-members'], ['toggle-members', 'show-channels']]) {
    document.getElementById(id)?.addEventListener('click', () => { if (mobile.matches) community.classList.remove(other); });
  }
  const resume = document.createElement('button'); resume.type = 'button';
  resume.className = 'btn mobile-resume-call'; resume.hidden = true;
  resume.textContent = 'Görüşme sesini devam ettir'; document.body.append(resume);
  async function resumeMedia() {
    if (!currentRoomCode) { resume.hidden = true; return; }
    resume.hidden = false;
    let blocked = false;
    try { if (audioContext?.state === 'suspended' || audioContext?.state === 'interrupted') await audioContext.resume(); } catch { blocked = true; }
    await Promise.all([...document.querySelectorAll('audio, #shared-screen')].filter(element => element.srcObject).map(async element => { try { await element.play(); } catch { blocked = true; } }));
    const interrupted = localStream?.getAudioTracks().some(track => track.muted || track.readyState === 'ended');
    resume.hidden = !blocked && !interrupted;
    if (interrupted) resume.textContent = 'Mikrofon duraklatıldı · Gerekirse kanala yeniden katıl';
    else resume.textContent = 'Görüşme sesini devam ettir';
  }
  resume.onclick = resumeMedia;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void resumeMedia(); });
  window.addEventListener('pageshow', () => { void resumeMedia(); });
  // A screen wake lock only prevents locking while the page is visible;
  // it cannot grant background execution privileges on iOS.
  let wakeLock = null, requestingWakeLock = false;
  async function updateWakeLock() {
    if (!currentRoomCode || document.hidden) {
      if (wakeLock) { const lock = wakeLock; wakeLock = null; await lock.release().catch(() => {}); }
      if (!currentRoomCode) resume.hidden = true;
      return;
    }
    if (wakeLock || requestingWakeLock || !navigator.wakeLock) return;
    requestingWakeLock = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      if (!currentRoomCode || document.hidden) { wakeLock = null; await lock.release(); }
    } catch { /* Unsupported or denied: voice remains usable in the foreground. */ }
    finally { requestingWakeLock = false; }
  }
  document.addEventListener('visibilitychange', () => { void updateWakeLock(); });
  setInterval(() => { void updateWakeLock(); }, 2000);
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
