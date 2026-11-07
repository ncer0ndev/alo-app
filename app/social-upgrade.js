// Screen sharing uses separate peer connections so voice tracks stay untouched.
(() => {
  const section = document.createElement('section'); section.className = 'social-tools app-settings';
  section.innerHTML = '<h3>Uygulama</h3><p class="app-version">Sürüm bilgisi yükleniyor…</p><button type="button" class="btn btn-ghost app-update">Güncellemeleri denetle / yükle</button><p>Güncelleme hazırsa yeniden başlatma onayı gösterilir.</p><h4>Klavye kısayolları</h4><p>Ctrl/Cmd + C: Kopyala · X: Kes · V: Yapıştır<br>Ctrl/Cmd + Z: Geri al · A: Tümünü seç</p><button type="button" class="btn btn-ghost app-exit">Uygulamayı kapat</button><p class="app-action-status" role="status"></p>';
  document.querySelector('#tab-settings').append(section);
  window.api?.getAppInfo?.().then(info => { section.querySelector('.app-version').textContent = info ? `ALO ${info.version}${info.packaged ? '' : ' · Geliştirme sürümü'}` : 'ALO'; }).catch(() => {});
  const update = section.querySelector('.app-update'); update.disabled = !window.api?.checkAppUpdate;
  update.onclick = async () => {
    update.disabled = true;
    try { await window.api.checkAppUpdate(); } catch { section.querySelector('.app-action-status').textContent = 'Güncelleme denetlenemedi. Tekrar dene.'; }
    finally { update.disabled = false; }
  };
  const exit = section.querySelector('.app-exit'); exit.disabled = !window.api?.quitApp;
  exit.onclick = () => { if (confirm('Uygulama kapanacak ve açık görüşmen sonlanacak. Devam edilsin mi?')) window.api.quitApp(); };
})();
(() => {
  const panel = document.createElement('section');
  panel.className = 'social-tools';
  panel.innerHTML = '<button class="btn" id="share-screen">Ekran paylaş</button><label><input type="checkbox" id="share-audio"> Sistem sesini paylaş (destekleniyorsa)</label><button class="btn btn-ghost" id="share-fullscreen">Tam ekran</button><span id="share-status" role="status"></span><video id="shared-screen" autoplay playsinline hidden></video>';
  document.querySelector('#room-screen').append(panel);
  const video = panel.querySelector('video');
  const status = panel.querySelector('#share-status');
  const button = panel.querySelector('#share-screen');
  const quality = document.createElement('select');
  quality.setAttribute('aria-label', 'Paylaşım kalitesi');
  quality.innerHTML = '<option value="1080:30">1080p · 30 FPS</option><option value="1080:60">1080p · 60 FPS</option><option value="720:30">720p · 30 FPS (düşük bağlantı)</option>';
  button.after(quality);
  const picker = document.createElement('dialog'); picker.className = 'screen-picker';
  picker.innerHTML = '<header><h2>Ekranını paylaş</h2><button type="button" class="btn btn-ghost" aria-label="Kapat">×</button></header><p>Paylaşmak istediğin ekranı veya pencereyi seç.</p><nav><button type="button" class="btn" data-source-type="screen">Ekranlar</button><button type="button" class="btn btn-ghost" data-source-type="window">Pencereler</button></nav><div class="screen-source-grid"></div><p class="screen-picker-status" role="status"></p>';
  document.body.append(picker);
  const audioOption = panel.querySelector('label');
  picker.querySelector('nav').after(quality, audioOption);
  const dock = document.createElement('section'); dock.className = 'voice-dock'; dock.hidden = true;
  dock.setAttribute('aria-label', 'Sesli görüşme kontrolleri');
  dock.innerHTML = '<div class="voice-dock-title"><span class="voice-dock-dot">●</span><strong></strong></div><div class="voice-dock-actions"><button type="button" class="btn btn-ghost" data-action="mute">Mikrofon</button><button type="button" class="btn btn-ghost" data-action="share">Ekran paylaş</button><button type="button" class="btn btn-ghost" data-action="leave">Ayrıl</button></div>';
  document.body.append(dock);
  const dockToggle = document.createElement('button');
  dockToggle.type = 'button'; dockToggle.className = 'voice-dock-toggle';
  dockToggle.setAttribute('aria-label', 'Görüşme kontrollerini gizle');
  dockToggle.setAttribute('aria-expanded', 'true');
  dockToggle.textContent = '−';
  dock.querySelector('.voice-dock-title').append(dockToggle);
  dockToggle.onclick = () => {
    const collapsed = dock.classList.toggle('voice-dock-collapsed');
    dockToggle.textContent = collapsed ? '+' : '−';
    dockToggle.setAttribute('aria-expanded', String(!collapsed));
    dockToggle.setAttribute('aria-label', collapsed ? 'Görüşme kontrollerini aç' : 'Görüşme kontrollerini gizle');
  };
  dock.querySelector('[data-action=mute]').onclick = () => document.querySelector('#mute-btn').click();
  dock.querySelector('[data-action=leave]').onclick = () => document.querySelector('#leave-btn').click();
  dock.querySelector('[data-action=share]').onclick = () => button.click();
  panel.classList.add('screen-floating-preview');
  async function chooseSource() {
    if (!window.api?.screenSources) return true;
    picker.showModal();
    const grid = picker.querySelector('.screen-source-grid'); grid.replaceChildren();
    const hint = picker.querySelector('.screen-picker-status'); hint.textContent = 'Önizlemeler yükleniyor…';
    let sources;
    try { sources = await window.api.screenSources(); } catch { picker.close(); throw new Error('Pencere listesi alınamadı. Ekran kaydı iznini kontrol et.'); }
    if (!picker.open) return false;
    hint.textContent = '';
    return new Promise(resolve => {
      const close = () => { picker.removeEventListener('close', close); resolve(false); };
      picker.addEventListener('close', close);
      const draw = type => {
        grid.replaceChildren();
        for (const source of sources.filter(source => source.type === type)) {
          const item = document.createElement('button'); item.type = 'button'; item.className = 'screen-source';
          const img = document.createElement('img'); img.src = source.thumbnail; img.alt = '';
          const name = document.createElement('span'); name.textContent = source.name;
          item.append(img, name);
          item.onclick = async () => {
            item.disabled = true;
            try {
              const ok = await window.api.selectScreenSource(source.id);
              if (!ok) { hint.textContent = 'Kaynak artık mevcut değil. Seçiciyi yeniden aç.'; return; }
              picker.removeEventListener('close', close); picker.close(); resolve(true);
            } catch { hint.textContent = 'Kaynak seçilemedi.'; } finally { item.disabled = false; }
          };
          grid.append(item);
        }
        if (!grid.children.length) hint.textContent = 'Bu kategoride paylaşılabilir kaynak yok.';
        else hint.textContent = '';
        picker.querySelectorAll('[data-source-type]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.sourceType === type)));
      };
      picker.querySelectorAll('[data-source-type]').forEach(btn => { btn.onclick = () => draw(btn.dataset.sourceType); });
      picker.querySelector('header button').onclick = () => picker.close();
      draw('screen');
    });
  }
  const communityShareButton = document.createElement('button');
  communityShareButton.className = 'btn btn-ghost';
  communityShareButton.textContent = 'Ekran paylaş';
  document.querySelector('#active-call-bar').append(communityShareButton);
  communityShareButton.onclick = () => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    button.click();
  };
  let stream = null;
  let owner = null;
  let boundSocket = null;
  let boundRoom = null;
  let starting = false;
  const peers = new Map();
  const candidates = new Map();
  function clearPeers() {
    for (const pc of peers.values()) pc.close();
    peers.clear(); candidates.clear(); video.srcObject = null; video.hidden = true;
  }
  function stop(notify = true) {
    quality.disabled = false;
    if (stream) { const old = stream; stream = null; old.getTracks().forEach(track => track.stop()); }
    clearPeers(); button.textContent = 'Ekran paylaş';
    if (notify && boundSocket?.connected) boundSocket.emit('screen-control', { action: 'stop' }, () => {});
  }
  function connection(id) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers });
    peers.set(id, pc);
    pc.onicecandidate = event => {
      if (event.candidate) boundSocket.emit('screen-signal', { to: id, data: { candidate: event.candidate } });
    };
    pc.ontrack = event => { video.srcObject = event.streams[0]; video.muted = false; video.hidden = false; video.play().catch(() => { status.textContent = 'Oynatmak için görüntüye tıkla.'; }); };
    if (stream) stream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') {
        const parameters = sender.getParameters();
        parameters.encodings = [{ maxBitrate: quality.value === '1080:60' ? 10000000 : quality.value === '720:30' ? 2500000 : 6000000, maxFramerate: Number(quality.value.split(':')[1]) }];
        parameters.degradationPreference = 'maintain-resolution';
        sender.setParameters(parameters).catch(() => {});
      }
    });
    return pc;
  }
  async function signal({ from, data }) {
    try {
      const pc = connection(from);
      if (data.request && stream) {
        await pc.setLocalDescription(await pc.createOffer());
        boundSocket.emit('screen-signal', { to: from, data: { sdp: pc.localDescription } });
      } else if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        for (const candidate of candidates.get(from) || []) await pc.addIceCandidate(candidate);
        candidates.delete(from);
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          boundSocket.emit('screen-signal', { to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else { if (!candidates.has(from)) candidates.set(from, []); candidates.get(from).push(data.candidate); }
      }
    } catch { status.textContent = 'Ekran bağlantısı kurulamadı. Paylaşımı yeniden başlat.'; }
  }
  function ownerChanged({ id }) {
    owner = id;
    if (!id) { stop(false); status.textContent = ''; }
    else if (id !== boundSocket.id) {
      stop(false); status.textContent = 'Ekran paylaşımı izleniyor';
      boundSocket.emit('screen-signal', { to: id, data: { request: true } });
    }
  }
  button.onclick = async () => {
    if (stream) return stop();
    if (starting || !socket?.connected || !currentRoomCode) return;
    starting = true;
    try {
      if (!await chooseSource()) return;
      const [height, fps] = quality.value.split(':').map(Number);
      const captured = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: Math.round(height * 16 / 9), max: Math.round(height * 16 / 9) }, height: { ideal: height, max: height }, frameRate: { ideal: fps, max: fps } }, audio: audioOption.querySelector('input').checked });
      captured.getVideoTracks()[0].contentHint = fps === 60 ? 'motion' : 'detail';
      stream = captured;
      const result = await new Promise(resolve => socket.timeout(5000).emit('screen-control', { action: 'start' }, (error, result) => resolve(error ? { error: 'Sunucu yanıt vermedi.' } : result)));
      if (result?.error) { captured.getTracks().forEach(track => track.stop()); throw new Error(result.error); }
      stream = captured; video.srcObject = captured; video.muted = true; video.hidden = false;
      quality.disabled = true;
      captured.getVideoTracks()[0].onended = () => stop();
      button.textContent = 'Paylaşımı durdur'; status.textContent = 'Ekranın paylaşılıyor';
    } catch (error) { stop(); status.textContent = error.message || 'Paylaşım başlatılamadı.'; }
    finally { starting = false; }
  };
  video.onclick = () => video.play().catch(() => {});
  const pipButton = document.createElement('button');
  pipButton.type = 'button'; pipButton.className = 'btn btn-ghost';
  pipButton.textContent = 'Küçük pencere (PiP)';
  pipButton.setAttribute('aria-pressed', 'false');
  panel.querySelector('#share-fullscreen').after(pipButton);
  function inPip() {
    return document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture';
  }
  function syncPip() {
    const active = inPip();
    pipButton.textContent = active ? 'PiP’den çık' : 'Küçük pencere (PiP)';
    pipButton.setAttribute('aria-pressed', String(active));
    pipButton.disabled = video.hidden || video.readyState < 1;
  }
  for (const event of ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged', 'loadedmetadata', 'emptied']) video.addEventListener(event, syncPip);
  pipButton.onclick = async () => {
    try {
      if (inPip()) {
        if (document.pictureInPictureElement === video && document.exitPictureInPicture) await document.exitPictureInPicture();
        else video.webkitSetPresentationMode('inline');
      } else {
        if (video.readyState < 2 || !video.videoWidth) {
          status.textContent = 'Yayın görüntüsü henüz hazır değil. Görüntü geldikten sonra tekrar dene.';
          return;
        }
        if (video.paused) {
          video.play().catch(() => {});
          status.textContent = 'Yayın oynatılıyor. Görüntü hareket edince PiP düğmesine tekrar dokun.';
          return;
        }
        // Invoke directly from the tap: Safari requires an active user gesture.
        if (video.webkitSupportsPresentationMode?.('picture-in-picture') && typeof video.webkitSetPresentationMode === 'function') {
          video.webkitSetPresentationMode('picture-in-picture');
        } else if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
          await video.requestPictureInPicture();
        } else {
          status.textContent = 'Bu cihaz veya bu canlı yayın için PiP desteklenmiyor. Tam ekranı kullanabilirsin.';
          return;
        }
        collapseShare();
        status.textContent = 'PiP istendi. Küçük pencere açılırsa başka uygulamaya geçerek deneyebilirsin; sesin arka planda sürmesi garanti değildir.';
      }
    } catch (error) {
      const reason = error?.name || 'UnknownError';
      console.info('ALO PiP request rejected:', reason);
      status.textContent = ['NotSupportedError', 'TypeError'].includes(reason)
        ? 'Safari bu canlı yayın için küçük pencereyi desteklemiyor. Tam ekranı kullanabilirsin.'
        : reason === 'InvalidStateError'
        ? 'Video henüz PiP için hazır değil. Görüntünün oynadığından emin olup tekrar dene.'
        : ['NotAllowedError', 'SecurityError'].includes(reason)
        ? 'Safari küçük pencereye izin vermedi. Videonun kendi kontrollerindeki PiP simgesini deneyebilirsin.'
        : 'Safari bu yayını küçük pencereye alamadı. Videonun kendi kontrollerini veya tam ekranı dene.';
    } finally { syncPip(); }
  };
  const closeExpanded = document.createElement('button');
  closeExpanded.type = 'button'; closeExpanded.className = 'btn share-expanded-close';
  closeExpanded.textContent = 'Küçült'; closeExpanded.hidden = true;
  panel.append(closeExpanded);
  function collapseShare() { panel.classList.remove('share-expanded'); closeExpanded.hidden = true; }
  closeExpanded.onclick = collapseShare;
  document.addEventListener('keydown', event => { if (event.key === 'Escape') collapseShare(); });
  panel.querySelector('#share-fullscreen').onclick = async () => {
    if (video.hidden) return;
    try {
      if (video.requestFullscreen) { await video.requestFullscreen(); return; }
      if (video.webkitEnterFullscreen) { video.webkitEnterFullscreen(); return; }
    } catch { /* Fall back to a viewport-filling player. */ }
    panel.classList.add('share-expanded'); closeExpanded.hidden = false;
    video.play().catch(() => {});
  };
  setInterval(() => {
    const inCommunityCall = !!currentRoomCode && currentRoomType === 'server-channel';
    dock.hidden = !inCommunityCall;
    document.body.classList.toggle('has-voice-dock', inCommunityCall);
    dock.querySelector('strong').textContent = currentChannelDisplayName || 'Sesli görüşme';
    dock.querySelector('[data-action=mute]').textContent = muted ? 'Mikrofonu aç' : 'Mikrofonu kapat';
    dock.querySelector('[data-action=share]').textContent = stream ? 'Paylaşımı durdur' : 'Ekran paylaş';
    const target = document.body;
    if (panel.parentElement !== target) target.append(panel);
    panel.hidden = !currentRoomCode || (!stream && !owner && !starting);
    if (panel.hidden) collapseShare();
    syncPip();
    communityShareButton.hidden = !currentRoomCode;
    communityShareButton.textContent = stream ? 'Paylaşımı durdur' : 'Ekran paylaş';
    if (socket !== boundSocket) {
      boundSocket?.off('screen-signal', signal); boundSocket?.off('screen-owner', ownerChanged);
      stop(false); boundSocket = socket; boundRoom = null;
      boundSocket?.on('screen-signal', signal); boundSocket?.on('screen-owner', ownerChanged);
    }
    if (currentRoomCode !== boundRoom || (!socket?.connected && boundRoom)) {
      stop(false); boundRoom = currentRoomCode;
      if (!socket?.connected) boundRoom = null;
      if (boundRoom && socket?.connected) socket.emit('screen-control', { action: 'state' }, ownerChanged);
    }
  }, 500);
})();

(() => {
  const section = document.createElement('section');
  section.className = 'social-tools';
  section.innerHTML = '<h3>Arkadaş grupları</h3><label>Grup adı<input id="group-name" maxlength="40"></label><label>Arkadaşların (virgülle ayır)<input id="group-members" placeholder="efe, deniz"></label><button class="btn" id="group-create">Grup oluştur</button><div id="group-list"></div><h4 id="group-title"></h4><p id="group-people"></p><div id="group-log" role="log" aria-live="polite"></div><div class="chat-input-row"><textarea id="group-message" maxlength="2000" placeholder="Grup mesajı"></textarea><button class="btn" id="group-send">Gönder</button><button class="btn" id="group-call">Grup aramasına katıl</button></div><p id="group-error" role="status"></p>';
  document.querySelector('#tab-dm').append(section);
  const el = id => section.querySelector('#' + id);
  // Group creation belongs in a dialog; only the selected thread is shown here.
  const dialog = document.createElement('dialog');
  dialog.className = 'social-guide group-create-dialog';
  dialog.innerHTML = '<h2>Yeni grup</h2><div class="group-form"></div><fieldset class="group-friend-options"><legend>Arkadaşlarını seç</legend></fieldset><p class="group-create-error" role="status"></p><button type="button" class="btn btn-ghost group-cancel">Vazgeç</button>';
  document.body.append(dialog);
  const groupName = el('group-name');
  const createButton = el('group-create');
  dialog.querySelector('.group-form').append(groupName.closest('label'));
  el('group-members').closest('label').remove();
  dialog.append(createButton);
  section.querySelector('h3').remove();
  const groupList = el('group-list');
  groupList.className = 'group-rail-list';
  document.querySelector('#dm-rail-list').after(groupList);
  section.hidden = true;
  const addButton = document.createElement('button');
  addButton.className = 'member-hover-role-add'; addButton.textContent = '+';
  addButton.setAttribute('aria-label', 'Grup oluştur');
  document.querySelector('#dm-rail-list').previousElementSibling.append(addButton);
  addButton.onclick = async () => {
    dialog.showModal();
    const options = dialog.querySelector('.group-friend-options');
    options.replaceChildren();
    const legend = document.createElement('legend'); legend.textContent = 'Arkadaşlarını seç'; options.append(legend);
    try {
      const data = await request('/api/friends');
      for (const friend of data.friends) {
        const label = document.createElement('label'); const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.value = friend.username;
        label.append(checkbox, document.createTextNode(friend.username)); options.append(label);
      }
      if (!data.friends.length) options.append('Grup oluşturmak için önce bir arkadaş ekle.');
    } catch (e) { dialog.querySelector('.group-create-error').textContent = e.message; }
  };
  dialog.querySelector('.group-cancel').onclick = () => dialog.close();
  function openGroup(group) {
    selected = group;
    enterHomeMode(); showTab('dm');
    document.querySelector('#dm-list-view').classList.add('hidden');
    document.querySelector('#dm-thread-view').classList.add('hidden');
    section.hidden = false;
    el('group-title').textContent = group.name;
    messages().catch(error);
  }
  document.addEventListener('click', event => {
    if (event.target.closest('.dm-rail-item, .dm-row, [data-tab], #dm-back-btn, #rail-home-btn')) section.hidden = true;
  });
  let selected = null;
  let fetching = false;
  let groupAccount = null;
  const error = e => { el('group-error').textContent = e.message || String(e); };
  async function request(path, body) {
    const res = await fetch(getServerUrl() + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + getSession().token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'İşlem tamamlanamadı.'); return data;
  }
  async function messages() {
    if (!selected) return;
    const id = selected.id;
    const data = await request(`/api/groups/${id}/messages`);
    if (selected?.id !== id) return;
    el('group-people').textContent = data.members.map(m => m.username).join(', ');
    const log = el('group-log'); const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.replaceChildren(...data.messages.map(message => {
      const row = document.createElement('p');
      const name = document.createElement('strong'); name.textContent = message.username + ': ';
      row.append(name, document.createTextNode(message.text)); return row;
    }));
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  async function refresh() {
    const account = getSession().username || null;
    if (account !== groupAccount) {
      groupAccount = account; selected = null; section.hidden = true; groupList.replaceChildren();
      el('group-log').replaceChildren();
    }
    if (!getSession().token || fetching) return;
    fetching = true;
    try {
      const data = await request('/api/groups');
      if ((getSession().username || null) !== account) return;
      groupList.replaceChildren(...data.groups.map(group => {
        const button = document.createElement('button'); button.className = 'btn btn-ghost'; button.textContent = group.name;
        button.onclick = () => openGroup(group);
        return button;
      }));
      if (!section.hidden) await messages();
    } catch (e) { error(e); } finally { fetching = false; }
  }
  createButton.onclick = async () => {
    try {
      createButton.disabled = true;
      const group = await request('/api/groups', { name: groupName.value, members: [...dialog.querySelectorAll('input[type=checkbox]:checked')].map(input => input.value) });
      dialog.close(); groupName.value = ''; openGroup(group); await refresh();
    } catch (e) { dialog.querySelector('.group-create-error').textContent = e.message; }
    finally { createButton.disabled = false; }
  };
  el('group-send').onclick = async () => {
    if (!selected) return error(new Error('Önce bir grup seç.'));
    try { await request(`/api/groups/${selected.id}/messages`, { text: el('group-message').value }); el('group-message').value = ''; await messages(); } catch (e) { error(e); }
  };
  el('group-call').onclick = async () => {
    if (!selected) return error(new Error('Önce bir grup seç.'));
    try {
      if (currentRoomCode && !confirm('Mevcut görüşmeden ayrılıp grup aramasına katıl?')) return;
      const data = await request(`/api/groups/${selected.id}/call`, {}); await joinRoomWithCode(data.roomCode);
    } catch (e) { error(e); }
  };
  setInterval(refresh, 4000);
})();

(() => {
  const profile = document.createElement('section'); profile.className = 'social-tools';
  profile.innerHTML = '<h3>Hakkımda ve durum</h3><textarea id="social-about" maxlength="300" placeholder="Kendinden bahset"></textarea><select id="social-presence"><option value="online">Çevrimiçi</option><option value="busy">Meşgul</option><option value="dnd">Rahatsız etmeyin</option></select><select id="social-duration"><option value="0">Süresiz</option><option value="30">30 dakika</option><option value="60">1 saat</option><option value="240">4 saat</option></select><button class="btn">Profili kaydet</button><p role="status"></p>';
  document.querySelector('#tab-profile').append(profile);
  let loadedProfile = '';
  setInterval(async () => {
    const username = getSession().username;
    if (!username || loadedProfile === username || !profile.getClientRects().length) return;
    loadedProfile = username;
    try {
      const res = await fetch(getServerUrl() + '/api/social-profile/' + encodeURIComponent(username), { headers: { Authorization: 'Bearer ' + getSession().token } });
      if (!res.ok) throw new Error(); const data = await res.json();
      if (getSession().username !== username) return;
      profile.querySelector('textarea').value = data.about;
      profile.querySelector('#social-presence').value = data.presence;
    } catch { loadedProfile = ''; }
  }, 1000);
  profile.querySelector('button').onclick = async () => {
    try {
      await apiRequest('/api/social-profile', { about: profile.querySelector('textarea').value, presence: profile.querySelector('#social-presence').value, duration: Number(profile.querySelector('#social-duration').value) });
      profile.querySelector('p').textContent = 'Profil kaydedildi.';
    } catch (error) { profile.querySelector('p').textContent = error.message; }
  };
  const info = document.createElement('p'); info.className = 'social-profile-info';
  document.querySelector('#member-hover-card').append(info);
  let lastName = '';
  setInterval(async () => {
    const card = document.querySelector('#member-hover-card');
    const name = card.classList.contains('hidden') ? '' : document.querySelector('#member-hover-name').textContent;
    if (name === lastName) return; lastName = name; info.textContent = '';
    if (!name || !getSession().token) return;
    try {
      const res = await fetch(getServerUrl() + '/api/social-profile/' + encodeURIComponent(name), { headers: { Authorization: 'Bearer ' + getSession().token } });
      if (!res.ok) return; const data = await res.json(); if (lastName !== name) return;
      info.textContent = [data.about, data.presence === 'busy' ? 'Meşgul' : data.presence === 'dnd' ? 'Rahatsız etmeyin' : '', data.commonServers.length ? 'Ortak topluluklar: ' + data.commonServers.join(', ') : ''].filter(Boolean).join(' · ');
    } catch { /* Existing profile remains usable offline. */ }
  }, 400);
})();

(() => {
  const key = name => `alo:${getSession().username || 'guest'}:${name}`;
  const read = (name, fallback) => { try { return JSON.parse(localStorage.getItem(key(name))) ?? fallback; } catch { return fallback; } };
  const write = (name, value) => localStorage.setItem(key(name), JSON.stringify(value));
  const settings = document.createElement('section'); settings.className = 'social-tools';
  settings.innerHTML = '<h3>Ses ve kullanım</h3><label><input type="checkbox" id="social-sounds"> Giriş, çıkış ve mesaj sesleri</label><label><input type="checkbox" id="social-dnd"> Rahatsız etmeyin (bildirim seslerini kapat)</label><button class="btn btn-ghost" id="social-guide">İlk kullanım rehberi ve kısayollar</button><p id="social-network" role="status"></p><h4>Son odalar</h4><div id="social-recent"></div>';
  document.querySelector('#tab-settings').append(settings);
  const sounds = settings.querySelector('#social-sounds'); const dnd = settings.querySelector('#social-dnd');
  sounds.checked = read('sounds', true); dnd.checked = read('dnd', false);
  sounds.onchange = () => write('sounds', sounds.checked);
  dnd.onchange = () => write('dnd', dnd.checked);
  const guide = document.createElement('dialog'); guide.className = 'social-guide';
  guide.innerHTML = '<h2>ALO’ya hoş geldin</h2><p>Önce Ayarlar’dan mikrofonunu ve hoparlörünü seçip mikrofon testini çalıştır.</p><p>Arkadaşlar bölümünden arkadaş ekleyebilir, Mesajlar bölümünden özel grup oluşturabilirsin. Grup üyeleri “Grup aramasına katıl” ile aynı görüşmeye girer.</p><p>Ses odasında “Ekran paylaş” ile ekranını veya bir pencereyi seç. Sistem sesi kullanılabilirliği işletim sistemine bağlıdır.</p><h3>Kısayollar</h3><p>Ctrl/Cmd + Shift + M: mikrofonu aç/kapat<br>Escape: bu rehberi kapat<br>Bas konuş tuşunu Ayarlar’dan seçebilirsin.</p><button class="btn">Anladım</button>';
  document.body.append(guide); guide.querySelector('button').onclick = () => { write('guided', true); guide.close(); };
  settings.querySelector('#social-guide').onclick = () => guide.showModal();
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyM' && localStream) { event.preventDefault(); document.querySelector('#mute-btn')?.click(); }
  });
  let lastRoom = null; let bound = null; let guidedUser = null;
  function tone(kind) {
    if (!sounds.checked || dnd.checked) return;
    try {
      const ctx = new AudioContext(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      oscillator.frequency.value = kind === 'leave' ? 330 : kind === 'message' ? 660 : 480;
      gain.gain.setValueAtTime(.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .14);
      oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .15); oscillator.onended = () => ctx.close();
    } catch { /* Browser may require an initial user gesture. */ }
  }
  const joined = () => tone('join'); const left = () => tone('leave'); const message = () => tone('message');
  setInterval(() => {
    const username = getSession().username;
    if (username && guidedUser !== username) {
      guidedUser = username; sounds.checked = read('sounds', true); dnd.checked = read('dnd', false);
      // First-run setup is handled by setup.js; this guide remains available on demand.
    }
    settings.querySelector('#social-network').textContent = !socket ? 'Oturum açılmadı' : socket.connected ? 'Bağlantı açık' : 'Bağlantı koptu — yeniden bağlanılıyor…';
    if (socket !== bound) {
      bound?.off('peer-joined', joined); bound?.off('peer-left', left); bound?.off('chat-message', message); bound?.off('dm-message', message);
      bound = socket; bound?.on('peer-joined', joined); bound?.on('peer-left', left); bound?.on('chat-message', message); bound?.on('dm-message', message);
    }
    if (lastRoom !== currentRoomCode) {
      lastRoom = currentRoomCode;
      if (lastRoom && currentRoomType === 'room') write('recent', [lastRoom, ...read('recent', []).filter(code => code !== lastRoom)].slice(0, 5));
      settings.querySelector('#social-recent').replaceChildren(...read('recent', []).map(code => {
        const btn = document.createElement('button'); btn.className = 'btn btn-ghost'; btn.textContent = code;
        btn.onclick = () => { if (!currentRoomCode || confirm('Mevcut görüşmeden ayrıl?')) joinRoomWithCode(code); }; return btn;
      }));
    }
    document.querySelectorAll('#friends-list .friend-row').forEach(row => {
      if (row.querySelector('.social-favorite')) return;
      const name = row.querySelector('.name')?.textContent; if (!name) return;
      const btn = document.createElement('button'); btn.className = 'btn btn-ghost social-favorite';
      const update = () => { const active = read('favorites', []).includes(name); btn.textContent = active ? '★' : '☆'; btn.setAttribute('aria-label', name + ' favori'); btn.setAttribute('aria-pressed', String(active)); row.style.order = active ? '-1' : '0'; };
      btn.onclick = () => { const names = read('favorites', []); write('favorites', names.includes(name) ? names.filter(n => n !== name) : [...names, name]); update(); };
      update(); row.append(btn);
    });
  }, 750);
})();
