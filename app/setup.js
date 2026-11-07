(() => {
  const wizard = document.createElement('dialog'); wizard.className = 'setup-dialog';
  wizard.innerHTML = '<p class="setup-step"></p><h2></h2><div class="setup-content"></div><p class="setup-error" role="status"></p><footer><button class="btn btn-ghost" data-back>Geri</button><button class="btn" data-next>Başlayalım</button></footer>';
  document.body.append(wizard);
  let step = 0; let account = null; let devices = []; let mic = ''; let speaker = '';
  const content = wizard.querySelector('.setup-content');
  const error = wizard.querySelector('.setup-error');
  const completedKey = () => `alo:${account}:setup-v1`;
  function draw() {
    error.textContent = ''; content.replaceChildren();
    wizard.querySelector('.setup-step').textContent = `${step + 1} / 3 · Hızlı kurulum`;
    wizard.querySelector('[data-back]').hidden = step === 0;
    wizard.querySelector('[data-next]').textContent = step === 2 ? 'ALO’ya gir' : step === 0 ? 'Başlayalım' : 'Devam et';
    wizard.querySelector('h2').textContent = ['ALO’ya hoş geldin', 'Sesini hazırlayalım', 'Bildirim tercihin'][step];
    if (step === 0) {
      const text = document.createElement('p'); text.textContent = 'Bir dakikada ses cihazlarını ve bildirimlerini ayarla. Daha sonra Ayarlar’dan değiştirebilirsin.'; content.append(text);
    } else if (step === 1) {
      const explanation = document.createElement('p'); explanation.textContent = 'Cihazları listelemek için mikrofon izni gerekir. İstersen varsayılan cihazlarla devam edebilirsin.'; content.append(explanation);
      const load = document.createElement('button'); load.className = 'btn btn-ghost'; load.textContent = 'Mikrofona izin ver ve cihazları göster';
      load.onclick = async () => {
        load.disabled = true;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(track => track.stop());
          devices = await navigator.mediaDevices.enumerateDevices(); draw();
        } catch (e) { error.textContent = window.aloFriendlyError(e); load.disabled = false; }
      }; content.append(load);
      for (const [kind, title] of [['audioinput', 'Mikrofon'], ['audiooutput', 'Hoparlör']]) {
        const label = document.createElement('label'); label.textContent = title;
        const select = document.createElement('select'); const option = document.createElement('option'); option.value = ''; option.textContent = 'Sistem varsayılanı'; select.append(option);
        devices.filter(device => device.kind === kind).forEach((device, index) => { const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `${title} ${index + 1}`; select.append(option); });
        select.value = kind === 'audioinput' ? mic : speaker;
        select.onchange = () => { if (kind === 'audioinput') mic = select.value; else speaker = select.value; };
        label.append(select); content.append(label);
      }
    } else {
      const label = document.createElement('label'); label.className = 'setup-notification';
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = getSettings().notifyIncomingCall; toggle.id = 'setup-notify';
      label.append(toggle, document.createTextNode('Gelen arama bildirimlerini göster')); content.append(label);
      const text = document.createElement('p'); text.textContent = 'İlk arkadaşını ekleyerek başlayabilirsin. Bir topluluğa katılmak için sol alttaki davet kodu seçeneğini kullan.'; content.append(text);
    }
  }
  wizard.querySelector('[data-back]').onclick = () => { step--; draw(); };
  wizard.querySelector('[data-next]').onclick = () => {
    if (step < 2) { step++; draw(); return; }
    saveSetting('micDeviceId', mic); saveSetting('speakerDeviceId', speaker);
    saveSetting('notifyIncomingCall', wizard.querySelector('#setup-notify').checked);
    document.querySelector('#notify-call-checkbox').checked = wizard.querySelector('#setup-notify').checked;
    localStorage.setItem(completedKey(), 'true'); wizard.close(); showTab('friends');
  };
  wizard.addEventListener('cancel', () => { /* Escape defers setup; it can be opened again in Settings. */ });
  window.aloOpenSetup = () => {
    if (!getSession().token || wizard.open) return;
    if (currentRoomCode) { showToast('Kurulumu görüşmeden ayrıldıktan sonra açabilirsin.', 'info'); return; }
    account = getSession().username; mic = getSettings().micDeviceId; speaker = getSettings().speakerDeviceId; step = 0; draw(); wizard.showModal();
  };
  const reopen = document.createElement('button'); reopen.className = 'btn btn-ghost'; reopen.textContent = 'Hızlı kurulumu tekrar aç'; reopen.onclick = window.aloOpenSetup;
  document.querySelector('#tab-settings').append(reopen);
  let offered = null;
  setInterval(() => {
    const username = getSession().username;
    if (!getSession().token || !username || offered === username || document.querySelector('dialog[open]')) return;
    account = username;
    if (currentRoomCode) return;
    offered = username;
    if (localStorage.getItem(completedKey()) !== 'true') window.aloOpenSetup();
  }, 750);
})();
