(() => {
  const processing = document.createElement('section'); processing.className = 'social-tools call-audio-settings';
  processing.innerHTML = '<h3>SES İŞLEME</h3><p class="hint-text">Destekleyen cihazlarda konuşmayı netleştirir. Müzik veya enstrüman için bu seçenekleri kapatabilirsin.</p>';
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};
  for (const [key, title] of [['echoCancellation', 'Yankı azaltma'], ['noiseSuppression', 'Arka plan gürültüsünü azalt'], ['autoGainControl', 'Otomatik mikrofon seviyesi']]) {
    const label = document.createElement('label');
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = getSettings()[key]; toggle.disabled = !supported[key];
    const text = document.createElement('span'); text.textContent = title + (!supported[key] ? ' · Bu cihazda desteklenmiyor' : '');
    label.append(toggle, text); processing.append(label);
    toggle.onchange = async () => {
      toggle.disabled = true; const value = toggle.checked;
      try {
        for (const track of localStream?.getAudioTracks() || []) await track.applyConstraints({ ...callAudioConstraints(''), [key]: value });
        saveSetting(key, value);
      } catch { toggle.checked = !value; showToast('Bu ses ayarı cihazda uygulanamadı.', 'error'); }
      finally { toggle.disabled = false; }
    };
  }
  document.querySelector('#tab-settings').append(processing);
  const entry = document.createElement('button'); entry.type = 'button'; entry.className = 'btn btn-ghost call-health-button';
  entry.hidden = true; entry.textContent = 'Görüşme'; entry.setAttribute('aria-haspopup', 'dialog');
  document.querySelector('.header-account-actions')?.prepend(entry);
  const dialog = document.createElement('dialog'); dialog.className = 'call-health-dialog'; dialog.setAttribute('aria-labelledby', 'call-health-title');
  dialog.innerHTML = `<header><h2 id="call-health-title">Görüşme</h2><button class="btn btn-ghost" type="button" aria-label="Görüşme panelini kapat">×</button></header>
    <p class="call-connection-state" role="status" aria-live="polite"></p><p class="call-microphone-state"></p>
    <div class="call-health-actions"><button class="btn" type="button" data-recover>Yeniden bağlan</button><button class="btn btn-ghost" type="button" data-play>Ses ve mikrofonu devam ettir</button></div>
    <p class="call-health-feedback" role="status"></p><h3>KİŞİ BAZINDA SES</h3><div class="call-health-people"></div>
    <p class="hint-text">Ses düzeyleri bu cihazda hatırlanır. Bazı mobil tarayıcılar ses düzeyini cihaz düğmeleriyle sınırlar; kişi bazında susturmayı da kullanabilirsin. Bağlantı ölçümleri yalnızca cihazında gösterilir. Mikrofon testine Ayarlar’dan ulaşabilirsin.</p>`;
  document.body.append(dialog);
  const state = dialog.querySelector('.call-connection-state'), feedback = dialog.querySelector('.call-health-feedback');
  const people = dialog.querySelector('.call-health-people');
  const samples = new Map(), qualities = new Map();
  const labels = { good: 'İyi', fair: 'Dalgalı', poor: 'Zayıf', unknown: 'Ölçülüyor' };
  let polling = false, lastRoom = null, playbackBlocked = false;
  dialog.querySelector('header button').onclick = () => dialog.close();
  entry.onclick = () => { if (!dialog.open) dialog.showModal(); render(); };
  document.addEventListener('alo-playback-blocked', () => { playbackBlocked = true; render(); });
  document.addEventListener('alo-recovery-needed', () => { feedback.textContent = 'Otomatik toparlama tamamlanamadı. Yeniden bağlan düğmesini kullanabilirsin.'; render(); });
  async function action(button, fn) {
    button.disabled = true; feedback.textContent = 'Bağlantı ve ses kontrol ediliyor…';
    try { await fn(); feedback.textContent = socket?.connected ? 'Toparlama isteği gönderildi. Durumu yukarıdan izleyebilirsin.' : 'Sunucu bağlantısı bekleniyor. İnternetin gelince tekrar denenecek.'; }
    catch { feedback.textContent = 'Ses devam ettirilemedi. Mikrofon iznini kontrol edip yeniden dene.'; }
    finally { button.disabled = false; render(); }
  }
  dialog.querySelector('[data-recover]').onclick = event => action(event.currentTarget, () => recoverActiveCall(true));
  dialog.querySelector('[data-play]').onclick = event => action(event.currentTarget, async () => {
    // Start media playback synchronously inside the tap before awaiting permission.
    const plays = Object.values(audioElements).map(audio => audio.play());
    const restored = restoreCallMicrophone(true);
    const results = await Promise.allSettled(plays);
    playbackBlocked = results.some(result => result.status === 'rejected');
    if (!await restored || playbackBlocked) throw Error('media interrupted');
  });
  function render() {
    const active = !!currentRoomCode;
    entry.hidden = !active;
    if (!active) { if (dialog.open) dialog.close(); people.replaceChildren(); samples.clear(); qualities.clear(); playbackBlocked = false; feedback.textContent = ''; return; }
    const ids = Object.keys(peerConnections);
    const states = ids.map(id => peerConnections[id].connectionState);
    const worst = ids.map(id => qualities.get(id)?.grade || 'unknown').sort((a,b) => ['poor','fair','unknown','good'].indexOf(a) - ['poor','fair','unknown','good'].indexOf(b))[0] || 'unknown';
    const connected = socket?.connected && states.every(value => value === 'connected');
    const description = !navigator.onLine ? 'İnternet bağlantısı yok' : !socket?.connected ? 'Sunucuya yeniden bağlanılıyor' : roomRecovery || roomRejoinTimer ? 'Ses odasına yeniden katılınıyor' : !ids.length ? 'Ses odasındasın · Henüz başka katılımcı yok' : connected ? `Ses bağlantısı: ${labels[worst]}` : 'Ses bağlantısı kuruluyor / toparlanıyor';
    entry.textContent = !socket?.connected || !connected || roomRecovery || roomRejoinTimer ? 'Görüşme · Bağlanıyor' : ids.length ? `Görüşme · ${labels[worst]}` : 'Görüşme';
    entry.dataset.quality = connected ? worst : 'fair';
    state.textContent = description;
    const tracks = localStream?.getAudioTracks() || [];
    const micText = muted ? 'Mikrofonun kapalı' : !tracks.some(track => track.readyState === 'live') ? 'Mikrofon durmuş · Devam ettir düğmesini kullan' : tracks.some(track => track.muted) ? 'Mikrofon cihaz tarafından duraklatıldı' : 'Mikrofon hazır';
    dialog.querySelector('.call-microphone-state').textContent = micText + (playbackBlocked ? ' · Sesi duymak için devam ettir düğmesine dokun.' : '');
    if (!dialog.open) return;
    const names = [...new Set(Object.values(participantNames))];
    for (const row of [...people.children]) if (!names.includes(row.dataset.username)) row.remove();
    for (const name of names) {
      let row = [...people.children].find(row => row.dataset.username === name);
      if (!row) {
        row = document.createElement('section'); row.className = 'call-person'; row.dataset.username = name;
        const title = document.createElement('strong'); title.textContent = name;
        const metric = document.createElement('p'); metric.className = 'call-person-quality';
        const controls = document.createElement('div'); controls.className = 'call-person-controls';
        const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = String(participantVolumes[name] ?? savedParticipantVolume(name)); slider.setAttribute('aria-label', `${name} ses seviyesi`);
        const output = document.createElement('output'); output.textContent = `${slider.value}%`;
        const mute = document.createElement('button'); mute.type = 'button'; mute.className = 'btn btn-ghost';
        slider.oninput = () => {
          participantVolumes[name] = Number(slider.value); localStorage.setItem(`alo-volume:${getSession().username}:${name}`, slider.value);
          for (const [id, participant] of Object.entries(participantNames)) if (participant === name) applyParticipantVolume(id, name);
          output.textContent = `${slider.value}%`;
        };
        mute.onclick = () => {
          const key = `alo-muted:${getSession().username}:${name}`;
          localStorage.setItem(key, String(localStorage.getItem(key) !== 'true'));
          for (const [id, participant] of Object.entries(participantNames)) if (participant === name) applyParticipantVolume(id, name);
          render();
        };
        controls.append(slider, output, mute); row.append(title, metric, controls); people.append(row);
      }
      const id = getPeerIdForUsername(name), quality = qualities.get(id);
      const values = [];
      if (quality?.rtt != null) values.push(`Gidiş-dönüş: ${Math.round(quality.rtt)} ms`);
      if (quality?.jitter != null) values.push(`Ses dalgalanması: ${Math.round(quality.jitter)} ms`);
      if (quality?.loss != null) values.push(`Kayıp: %${quality.loss.toFixed(1)}`);
      row.querySelector('.call-person-quality').textContent = `${labels[quality?.grade || 'unknown']}${values.length ? ' · ' + values.join(' · ') : ''}`;
      const mute = row.querySelector('button'), silenced = localStorage.getItem(`alo-muted:${getSession().username}:${name}`) === 'true';
      mute.textContent = silenced ? 'Sesini aç' : 'Sustur'; mute.setAttribute('aria-pressed', String(silenced));
      const slider = row.querySelector('input');
      if (document.activeElement !== slider) { slider.value = String(participantVolumes[name] ?? savedParticipantVolume(name)); row.querySelector('output').textContent = `${slider.value}%`; }
    }
    if (!names.length) people.textContent = 'Katılımcılar geldiğinde ses ayarları burada görünecek.';
    else for (const child of [...people.childNodes]) if (child.nodeType === Node.TEXT_NODE) child.remove();
  }
  async function poll() {
    render();
    if (!currentRoomCode || document.hidden || polling) return;
    if (lastRoom !== currentRoomCode) { lastRoom = currentRoomCode; samples.clear(); qualities.clear(); }
    polling = true;
    try {
      const room = currentRoomCode;
      await Promise.all(Object.entries(peerConnections).map(async ([id, pc]) => {
        try {
          const report = await pc.getStats();
          if (currentRoomCode !== room || peerConnections[id] !== pc) return;
          const result = window.aloCallHealth.summarizeStats(report, samples.get(id));
          samples.set(id, result.next); qualities.set(id, result);
        } catch { qualities.delete(id); }
      }));
      for (const id of samples.keys()) if (!peerConnections[id]) { samples.delete(id); qualities.delete(id); }
      render();
    } finally { polling = false; }
  }
  setInterval(() => { void poll(); }, 2000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void poll(); });
})();
