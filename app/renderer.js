/* global io */
const SERVER_URL = 'https://alo-app.onrender.com';
const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const CALL_COOLDOWN_MS = 3000;

const authScreen = document.getElementById('auth-screen');
const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');

const authUsernameInput = document.getElementById('auth-username');
const authPasswordInput = document.getElementById('auth-password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const authStatus = document.getElementById('auth-status');

const welcomeText = document.getElementById('welcome-text');
const roomCodeInput = document.getElementById('room-code');
const joinBtn = document.getElementById('join-btn');
const logoutBtn = document.getElementById('logout-btn');
const statusEl = document.getElementById('status');
const profileUsernameEl = document.getElementById('profile-username');
const createRoomBtn = document.getElementById('create-room-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const roomCodeDisplay = document.getElementById('room-code-display');
const copyCodeBtn = document.getElementById('copy-code-btn');

const addFriendInput = document.getElementById('add-friend-input');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendStatusEl = document.getElementById('friend-status');
const incomingRequestsSection = document.getElementById('incoming-requests-section');
const incomingRequestsList = document.getElementById('incoming-requests');
const outgoingRequestsSection = document.getElementById('outgoing-requests-section');
const outgoingRequestsList = document.getElementById('outgoing-requests');
const friendsListEl = document.getElementById('friends-list');
const friendsEmptyEl = document.getElementById('friends-empty');

const incomingCallBanner = document.getElementById('incoming-call-banner');
const incomingCallText = document.getElementById('incoming-call-text');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');

const outgoingCallBanner = document.getElementById('outgoing-call-banner');
const outgoingCallText = document.getElementById('outgoing-call-text');
const cancelCallBtn = document.getElementById('cancel-call-btn');

const activeCallBar = document.getElementById('active-call-bar');
const activeCallText = document.getElementById('active-call-text');
const returnToCallBtn = document.getElementById('return-to-call-btn');

const toastEl = document.getElementById('toast');

const muteBtn = document.getElementById('mute-btn');
const leaveBtn = document.getElementById('leave-btn');
const roomSettingsBtn = document.getElementById('room-settings-btn');
const muteAllBtn = document.getElementById('mute-all-btn');
const participantsList = document.getElementById('participants');
const micIndicator = document.getElementById('mic-indicator');

const chatLogEl = document.getElementById('chat-log');
const chatScrollBtn = document.getElementById('chat-scroll-btn');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

const micSelect = document.getElementById('mic-select');
const speakerSelect = document.getElementById('speaker-select');
const micModeRadios = document.querySelectorAll('input[name="mic-mode"]');
const vadSettingsSection = document.getElementById('vad-settings');
const vadSensitivitySlider = document.getElementById('vad-sensitivity');
const pttSettingsSection = document.getElementById('ptt-settings');
const pttKeySelect = document.getElementById('ptt-key-select');
const pttKeyStatusEl = document.getElementById('ptt-key-status');
const micLevelBar = document.getElementById('mic-level-bar');
const micTestBtn = document.getElementById('mic-test-btn');
const themeRadios = document.querySelectorAll('input[name="theme-select"]');

const PTT_KEY_OPTIONS = window.api?.pttKeyOptions || ['Space'];
const VALID_THEMES = ['terminal', 'newsprint'];

let socket = null;
let localStream = null;
let muted = false;
let iceServers = DEFAULT_ICE_SERVERS;
let pendingIncomingCall = null;
let currentOutgoingCall = null;
let currentRoomCode = null;
let joining = false;
let lastCallAttemptAt = 0;
let audioContext = null;
let vadRafId = null;
let vadLastActiveTime = 0;
let speakingRafId = null;
let levelMeterCtx = null;
let levelMeterRafId = null;
let levelMeterTempStream = null;

const peerConnections = {};
const audioElements = {};
const participantNames = {};
const pendingCandidates = {};
const peerAnalysers = {};

const CHAT_HISTORY_LIMIT = 100;
let chatMessages = [];
let chatAutoScroll = true;
const seenChatMessageIds = new Set();

// ---- yardimci: bildirim / durum satirlari ----

function showToast(text, kind = 'info', durationMs = 4000) {
  toastEl.textContent = `[${kind.toUpperCase()}] ${text}`;
  toastEl.className = `toast ${kind}`;
  toastEl.classList.remove('hidden');
  if (toastEl._timeout) clearTimeout(toastEl._timeout);
  if (durationMs > 0) {
    toastEl._timeout = setTimeout(() => toastEl.classList.add('hidden'), durationMs);
  }
}

function setStatus(text, kind = 'info') {
  statusEl.textContent = text ? `[${kind.toUpperCase()}] ${text}` : '';
  statusEl.className = `status-line ${kind}`;
}

function setAuthStatus(text, kind = 'info') {
  authStatus.textContent = text ? `[${kind.toUpperCase()}] ${text}` : '';
  authStatus.className = `status-line ${kind}`;
}

function setFriendStatus(text, kind = 'info') {
  friendStatusEl.textContent = text ? `[${kind.toUpperCase()}] ${text}` : '';
  friendStatusEl.className = `status-line ${kind}`;
}

function getServerUrl() {
  return SERVER_URL;
}

// ---- oturum / ayarlar depolama ----

function getSession() {
  try {
    return {
      token: localStorage.getItem('token'),
      username: localStorage.getItem('username'),
    };
  } catch {
    return { token: null, username: null };
  }
}

function saveSession(token, username) {
  localStorage.setItem('token', token);
  localStorage.setItem('username', username);
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
}

function getSettings() {
  return {
    micMode: localStorage.getItem('micMode') || 'always',
    pttKey: localStorage.getItem('pttKey') || 'Space',
    vadSensitivity: Number(localStorage.getItem('vadSensitivity') || '50'),
    micDeviceId: localStorage.getItem('micDeviceId') || '',
    speakerDeviceId: localStorage.getItem('speakerDeviceId') || '',
  };
}

function saveSetting(key, value) {
  localStorage.setItem(key, value);
}

// ---- tema ----
// Tema secimi tamamen CSS/localStorage uzerinden calisir; gorusme, mikrofon,
// soket baglantisi, sohbet gecmisi veya yazilmakta olan mesaj gibi hicbir
// uygulama durumuna dokunmaz.

function getTheme() {
  const stored = localStorage.getItem('theme');
  return VALID_THEMES.includes(stored) ? stored : 'terminal';
}

function applyTheme(theme) {
  const safeTheme = VALID_THEMES.includes(theme) ? theme : 'terminal';
  document.documentElement.setAttribute('data-theme', safeTheme);
  localStorage.setItem('theme', safeTheme);
  themeRadios.forEach((radio) => {
    radio.checked = radio.value === safeTheme;
  });
}

function showScreen(screen) {
  [authScreen, joinScreen, roomScreen].forEach((s) => s.classList.add('hidden'));
  screen.classList.remove('hidden');
  updateActiveCallBar();
}

function updateActiveCallBar() {
  const inRoomScreen = !roomScreen.classList.contains('hidden');
  activeCallBar.classList.toggle('hidden', !currentRoomCode || inRoomScreen);
  if (currentRoomCode) activeCallText.textContent = `GÖRÜŞME DEVAM EDİYOR (${currentRoomCode})`;
}

// ---- kimlik dogrulama ----

async function authRequest(endpoint) {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;
  if (!username || !password) {
    setAuthStatus('kullanici adi ve sifre gerekli', 'error');
    return;
  }

  setAuthStatus('bağlanılıyor...', 'info');
  try {
    const res = await fetch(`${getServerUrl()}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthStatus(data.error || 'bir hata oluştu', 'error');
      return;
    }
    saveSession(data.token, data.username);
    enterJoinScreen(data.username);
  } catch (err) {
    setAuthStatus('sunucuya ulaşılamadı: ' + err.message, 'error');
  }
}

function enterJoinScreen(username) {
  setAuthStatus('');
  welcomeText.textContent = `[OK] oturum açıldı: ${username}`;
  profileUsernameEl.textContent = `kullanıcı: ${username}`;
  showTab('friends');
  showScreen(joinScreen);
  connectSocket();
  fetchIceServers();
}

function logout() {
  fullyLeaveRoom();
  if (window.api) window.api.unregisterPttShortcut();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  clearSession();
  authUsernameInput.value = '';
  authPasswordInput.value = '';
  incomingCallBanner.classList.add('hidden');
  outgoingCallBanner.classList.add('hidden');
  showScreen(authScreen);
}

// ---- sekmeler ----

function showTab(tabName) {
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  tabContents.forEach((content) => content.classList.toggle('hidden', content.id !== `tab-${tabName}`));
  if (tabName === 'settings') initSettingsTab();
}

// ---- TURN/ICE yapilandirmasi ----

async function fetchIceServers() {
  try {
    const { token } = getSession();
    const res = await fetch(`${getServerUrl()}/api/ice-servers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      iceServers = data.iceServers;
    }
  } catch {
    // varsayilan STUN ile devam edilir
  }
}

// ---- ayarlar sekmesi ----

function updateModeVisibility() {
  const mode = getSettings().micMode;
  vadSettingsSection.classList.toggle('hidden', mode !== 'voice');
  pttSettingsSection.classList.toggle('hidden', mode !== 'ptt');
}

function initSettingsTab() {
  const currentTheme = getTheme();
  themeRadios.forEach((radio) => {
    radio.checked = radio.value === currentTheme;
  });

  const settings = getSettings();
  micModeRadios.forEach((radio) => {
    radio.checked = radio.value === settings.micMode;
  });
  vadSensitivitySlider.value = settings.vadSensitivity;

  if (pttKeySelect.options.length === 0) {
    PTT_KEY_OPTIONS.forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      pttKeySelect.appendChild(opt);
    });
  }
  pttKeySelect.value = settings.pttKey;

  updateModeVisibility();
  populateDeviceLists();
}

async function ensureMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // izin verilmemis olabilir; enumerateDevices yine calisir ama etiketler bos gelir
  }
}

async function populateDeviceLists() {
  await ensureMicPermission();
  const devices = await navigator.mediaDevices.enumerateDevices();
  const settings = getSettings();

  const mics = devices.filter((d) => d.kind === 'audioinput');
  micSelect.innerHTML = '';
  mics.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `mikrofon ${i + 1}`;
    micSelect.appendChild(opt);
  });
  if (settings.micDeviceId) micSelect.value = settings.micDeviceId;

  const speakers = devices.filter((d) => d.kind === 'audiooutput');
  speakerSelect.innerHTML = '';
  speakers.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `hoparlör ${i + 1}`;
    speakerSelect.appendChild(opt);
  });
  if (settings.speakerDeviceId) speakerSelect.value = settings.speakerDeviceId;
}

async function switchMicDevice(deviceId) {
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    const newTrack = newStream.getAudioTracks()[0];
    for (const pc of Object.values(peerConnections)) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) await sender.replaceTrack(newTrack);
    }
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    localStream = newStream;
    applyMicMode();
    showToast('mikrofon değiştirildi', 'ok', 2500);
  } catch (err) {
    showToast('mikrofon değiştirilemedi: ' + err.message, 'error');
  }
}

// ---- mikrofon seviye testi (canli gorusmeden bagimsiz) ----

function stopLevelMeter() {
  if (levelMeterRafId) cancelAnimationFrame(levelMeterRafId);
  levelMeterRafId = null;
  if (levelMeterCtx) {
    levelMeterCtx.close();
    levelMeterCtx = null;
  }
  if (levelMeterTempStream) {
    levelMeterTempStream.getTracks().forEach((t) => t.stop());
    levelMeterTempStream = null;
  }
  micLevelBar.style.width = '0%';
  micTestBtn.textContent = '[ MİKROFONU TEST ET ]';
}

async function toggleLevelMeter() {
  if (levelMeterRafId) {
    stopLevelMeter();
    return;
  }

  let stream = localStream;
  if (!stream) {
    const settings = getSettings();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: settings.micDeviceId ? { deviceId: { exact: settings.micDeviceId } } : true,
      });
    } catch (err) {
      showToast('mikrofon test edilemedi: ' + err.message, 'error');
      return;
    }
    levelMeterTempStream = stream;
  }

  levelMeterCtx = new AudioContext();
  const source = levelMeterCtx.createMediaStreamSource(stream);
  const analyser = levelMeterCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  micTestBtn.textContent = '[ TESTİ DURDUR ]';

  function loop() {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const level = Math.sqrt(sum / data.length);
    micLevelBar.style.width = `${Math.min(100, level * 300)}%`;
    levelMeterRafId = requestAnimationFrame(loop);
  }
  loop();
}

// ---- mikrofon modu: her zaman acik / sesle aktif / bas konus ----
// onemli: analiz akisi (VAD) hicbir zaman kapatilmaz; sadece disariya giden
// ses (track.enabled) kontrol edilir. Manuel susturma ayri bir katmandir ve
// otomatik kapida (VAD/PTT) her zaman ustundur.

function isEffectivelyMuted() {
  return muted;
}

function applyTrackEnabledState(autoGateOpen) {
  if (!localStream) return;
  const enabled = !isEffectivelyMuted() && autoGateOpen;
  localStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
  const mode = getSettings().micMode;
  if (mode !== 'always') {
    micIndicator.textContent = muted ? '[ SUSTURULDU ]' : enabled ? '[ MİK AÇIK ]' : '[ MİK KAPALI ]';
    micIndicator.className = `status-line ${muted ? 'error' : enabled ? 'ok' : ''}`;
  }
}

function stopVoiceActivation() {
  if (vadRafId) {
    cancelAnimationFrame(vadRafId);
    vadRafId = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

function startVoiceActivation() {
  if (!localStream) return;
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(localStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  function loop() {
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSquares += v * v;
    }
    const level = Math.sqrt(sumSquares / data.length);
    const sensitivity = getSettings().vadSensitivity;
    const threshold = 0.35 - (sensitivity / 100) * 0.33;

    const now = performance.now();
    if (level > threshold) vadLastActiveTime = now;
    applyTrackEnabledState(now - vadLastActiveTime < 300);

    vadRafId = requestAnimationFrame(loop);
  }
  loop();
}

let pttToggleState = false;

function updatePttRegistration() {
  if (!window.api) return;
  const settings = getSettings();
  if (settings.micMode === 'ptt' && localStream) {
    window.api.registerPttShortcut(settings.pttKey);
  } else {
    window.api.unregisterPttShortcut();
  }
}

function applyMicMode() {
  stopVoiceActivation();
  const mode = getSettings().micMode;
  muteBtn.classList.remove('hidden');
  muteBtn.textContent = muted ? '[ MİKROFONU AÇ ]' : '[ MİKROFONU KAPAT ]';

  if (mode === 'always') {
    micIndicator.classList.add('hidden');
    applyTrackEnabledState(true);
  } else if (mode === 'ptt') {
    micIndicator.classList.remove('hidden');
    pttToggleState = false;
    applyTrackEnabledState(false);
  } else if (mode === 'voice') {
    micIndicator.classList.remove('hidden');
    startVoiceActivation();
  }

  updatePttRegistration();
}

function toggleMute() {
  if (!localStream) return;
  muted = !muted;
  muteBtn.textContent = muted ? '[ MİKROFONU AÇ ]' : '[ MİKROFONU KAPAT ]';
  const mode = getSettings().micMode;
  if (mode === 'always') {
    applyTrackEnabledState(true);
  } else if (mode === 'ptt') {
    applyTrackEnabledState(pttToggleState);
  }
  // sesle aktif modda VAD dongusu zaten her karede applyTrackEnabledState cagirir,
  // muted durumu orada da dikkate alinir.
}

// ---- oda kodu / pano ----

function copyRoomCode() {
  if (!currentRoomCode) return;
  if (window.api) window.api.copyToClipboard(currentRoomCode);
  showToast('oda kodu panoya kopyalandı', 'ok', 2500);
}

// ---- arkadaslar ----

async function apiRequest(endpoint, body) {
  const { token } = getSession();
  const res = await fetch(`${getServerUrl()}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'bir hata oluştu');
  return data;
}

async function loadFriends() {
  const { token } = getSession();
  try {
    const res = await fetch(`${getServerUrl()}/api/friends`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return;
    renderFriends(data.friends, data.incoming, data.outgoing);
  } catch {
    // sessizce yoksay, bir sonraki denemede tekrar dener
  }
}

function renderFriends(friends, incoming, outgoing) {
  incomingRequestsList.innerHTML = '';
  incomingRequestsSection.classList.toggle('hidden', incoming.length === 0);
  for (const name of incoming) {
    const li = document.createElement('li');
    li.className = 'friend-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = name;
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'btn';
    acceptBtn.textContent = '[ KABUL ]';
    acceptBtn.onclick = () => respondToRequest(name, true);
    const declineBtn = document.createElement('button');
    declineBtn.className = 'btn btn-ghost';
    declineBtn.textContent = '[ RED ]';
    declineBtn.onclick = () => respondToRequest(name, false);
    li.append(nameSpan, acceptBtn, declineBtn);
    incomingRequestsList.appendChild(li);
  }

  outgoingRequestsList.innerHTML = '';
  outgoingRequestsSection.classList.toggle('hidden', outgoing.length === 0);
  for (const name of outgoing) {
    const li = document.createElement('li');
    li.className = 'friend-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = `${name} (bekleniyor)`;
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = '[ İPTAL ]';
    cancelBtn.onclick = () => cancelOutgoingRequest(name);
    li.append(nameSpan, cancelBtn);
    outgoingRequestsList.appendChild(li);
  }

  friendsListEl.innerHTML = '';
  friendsEmptyEl.classList.toggle('hidden', friends.length > 0);
  for (const friend of friends) {
    const li = document.createElement('li');
    li.className = 'friend-row';
    li.dataset.username = friend.username.toLowerCase();
    const dot = document.createElement('span');
    dot.className = `dot ${friend.online ? 'online' : ''}`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = friend.username;
    const callBtn = document.createElement('button');
    callBtn.className = 'btn call-btn';
    callBtn.textContent = '[ ARA ]';
    callBtn.disabled = !friend.online || !!currentOutgoingCall;
    callBtn.onclick = () => callFriend(friend.username);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost';
    removeBtn.textContent = '[ SİL ]';
    removeBtn.onclick = () => removeFriend(friend.username);
    li.append(dot, name, callBtn, removeBtn);
    friendsListEl.appendChild(li);
  }
}

async function respondToRequest(fromUsername, accepted) {
  try {
    await apiRequest(accepted ? '/api/friends/accept' : '/api/friends/decline', { username: fromUsername });
    loadFriends();
  } catch (err) {
    setFriendStatus(err.message, 'error');
  }
}

async function cancelOutgoingRequest(targetUsername) {
  try {
    await apiRequest('/api/friends/cancel', { username: targetUsername });
    loadFriends();
  } catch (err) {
    setFriendStatus(err.message, 'error');
  }
}

async function removeFriend(targetUsername) {
  try {
    await apiRequest('/api/friends/remove', { username: targetUsername });
    loadFriends();
  } catch (err) {
    setFriendStatus(err.message, 'error');
  }
}

async function addFriend() {
  const username = addFriendInput.value.trim();
  if (!username) return;
  try {
    await apiRequest('/api/friends/request', { username });
    setFriendStatus(`istek gönderildi: ${username}`, 'ok');
    addFriendInput.value = '';
    loadFriends();
  } catch (err) {
    setFriendStatus(err.message, 'error');
  }
}

function setCallButtonsEnabled(enabled) {
  document.querySelectorAll('.call-btn').forEach((btn) => {
    if (enabled) {
      const row = btn.closest('.friend-row');
      const isOnline = row?.querySelector('.dot')?.classList.contains('online');
      btn.disabled = !isOnline;
    } else {
      btn.disabled = true;
    }
  });
}

function callFriend(toUsername) {
  if (!socket || currentOutgoingCall) return;
  const now = Date.now();
  if (now - lastCallAttemptAt < CALL_COOLDOWN_MS) return;
  lastCallAttemptAt = now;

  socket.emit('call-friend', { toUsername }, (ack) => {
    if (ack && ack.error) showToast(ack.error, 'error');
  });
}

function showIncomingCall(fromUsername, roomCode) {
  pendingIncomingCall = { fromUsername, roomCode };
  incomingCallText.textContent = `${fromUsername} seni arıyor`;
  incomingCallBanner.classList.remove('hidden');
}

function hideIncomingCall() {
  pendingIncomingCall = null;
  incomingCallBanner.classList.add('hidden');
}

function showOutgoingCall(toUsername, roomCode) {
  currentOutgoingCall = { toUsername, roomCode };
  outgoingCallText.textContent = `${toUsername} aranıyor...`;
  outgoingCallBanner.classList.remove('hidden');
  setCallButtonsEnabled(false);
}

function hideOutgoingCall() {
  currentOutgoingCall = null;
  outgoingCallBanner.classList.add('hidden');
  setCallButtonsEnabled(true);
}

// ---- WebRTC eslesme ----

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection({ iceServers });

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: peerId, data: { candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    let audio = audioElements[peerId];
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      document.body.appendChild(audio);
      audioElements[peerId] = audio;
    }
    audio.srcObject = event.streams[0];
    const speakerId = getSettings().speakerDeviceId;
    if (speakerId && audio.setSinkId) {
      audio.setSinkId(speakerId).catch(() => {});
    }
    setupSpeakingDetector(peerId, event.streams[0]);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      try {
        pc.restartIce();
      } catch {
        // restartIce desteklenmiyorsa sessizce yoksay
      }
    }
  };

  peerConnections[peerId] = pc;
  return pc;
}

async function callPeer(peerId) {
  const pc = createPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { to: peerId, data: { sdp: pc.localDescription } });
}

async function flushPendingCandidates(peerId) {
  const queued = pendingCandidates[peerId];
  if (!queued || queued.length === 0) return;
  delete pendingCandidates[peerId];
  const pc = peerConnections[peerId];
  if (!pc) return;
  for (const candidate of queued) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('ICE aday eklenemedi', err);
    }
  }
}

async function handleSignal({ from, data }) {
  try {
    let pc = peerConnections[from];

    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        pc = pc || createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushPendingCandidates(from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
      } else if (data.sdp.type === 'answer' && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushPendingCandidates(from);
      }
    } else if (data.candidate) {
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        (pendingCandidates[from] ||= []).push(data.candidate);
      }
    }
  } catch (err) {
    console.error('sinyal işleme hatası', err);
  }
}

function setupSpeakingDetector(peerId, stream) {
  teardownSpeakingDetector(peerId);
  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    peerAnalysers[peerId] = { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    ensureSpeakingLoop();
  } catch {
    // ses analiz edilemiyorsa konusma gostergesi olmadan devam et
  }
}

function teardownSpeakingDetector(peerId) {
  const entry = peerAnalysers[peerId];
  if (entry) {
    entry.ctx.close().catch(() => {});
    delete peerAnalysers[peerId];
  }
}

function ensureSpeakingLoop() {
  if (speakingRafId) return;
  function loop() {
    for (const [peerId, entry] of Object.entries(peerAnalysers)) {
      entry.analyser.getByteTimeDomainData(entry.data);
      let sum = 0;
      for (let i = 0; i < entry.data.length; i++) {
        const v = (entry.data[i] - 128) / 128;
        sum += v * v;
      }
      const level = Math.sqrt(sum / entry.data.length);
      const row = participantsList.querySelector(`[data-peer-id="${peerId}"]`);
      if (row) row.classList.toggle('speaking', level > 0.06);
    }
    speakingRafId = requestAnimationFrame(loop);
  }
  loop();
}

function stopSpeakingLoop() {
  if (speakingRafId) {
    cancelAnimationFrame(speakingRafId);
    speakingRafId = null;
  }
}

function cleanupPeer(peerId) {
  if (peerConnections[peerId]) {
    peerConnections[peerId].close();
    delete peerConnections[peerId];
  }
  if (audioElements[peerId]) {
    audioElements[peerId].remove();
    delete audioElements[peerId];
  }
  delete pendingCandidates[peerId];
  teardownSpeakingDetector(peerId);
  delete participantNames[peerId];
  renderParticipants();
}

function cleanupAllPeers() {
  Object.keys(peerConnections).forEach((id) => cleanupPeer(id));
  stopSpeakingLoop();
}

// ---- katilimcilar ----

function renderParticipants() {
  participantsList.innerHTML = '';
  const myUsername = getSession().username;

  const me = document.createElement('li');
  me.className = 'participant-row';
  me.innerHTML = `<span class="name own-name">${myUsername} (sen)</span>`;
  participantsList.appendChild(me);

  for (const [id, name] of Object.entries(participantNames)) {
    const li = document.createElement('li');
    li.className = 'participant-row';
    li.dataset.peerId = id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = name;

    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = '100';
    vol.className = 'volume-slider';
    vol.setAttribute('aria-label', `${name} ses seviyesi`);
    vol.oninput = () => {
      const audio = audioElements[id];
      if (audio) audio.volume = Number(vol.value) / 100;
    };

    const muteOneBtn = document.createElement('button');
    muteOneBtn.className = 'btn btn-ghost';
    muteOneBtn.textContent = '[ SUSTUR ]';
    muteOneBtn.onclick = () => {
      const audio = audioElements[id];
      if (!audio) return;
      audio.muted = !audio.muted;
      muteOneBtn.textContent = audio.muted ? '[ SESİ AÇ ]' : '[ SUSTUR ]';
    };

    li.append(nameSpan, vol, muteOneBtn);
    participantsList.appendChild(li);
  }
}

function addParticipant(id, name) {
  participantNames[id] = name;
  renderParticipants();
}

function muteAllIncoming() {
  const shouldMute = muteAllBtn.dataset.state !== 'muted';
  Object.values(audioElements).forEach((audio) => {
    audio.muted = shouldMute;
  });
  muteAllBtn.dataset.state = shouldMute ? 'muted' : '';
  muteAllBtn.textContent = shouldMute ? '[ TÜMÜNÜ AÇ ]' : '[ TÜMÜNÜ SUSTUR ]';
  participantsList.querySelectorAll('.btn-ghost').forEach((btn) => {
    if (btn.textContent.includes('SUSTUR') || btn.textContent.includes('SESİ AÇ')) {
      btn.textContent = shouldMute ? '[ SESİ AÇ ]' : '[ SUSTUR ]';
    }
  });
}

// ---- sohbet ----

function resetChat() {
  chatMessages = [];
  seenChatMessageIds.clear();
  chatAutoScroll = true;
  renderChatLog();
}

function applyChatHistory(history) {
  for (const m of history || []) {
    if (seenChatMessageIds.has(m.id)) continue;
    seenChatMessageIds.add(m.id);
    chatMessages.push({ ...m, own: m.from === getSession().username });
  }
  trimChatMessages();
  renderChatLog();
}

function trimChatMessages() {
  if (chatMessages.length > CHAT_HISTORY_LIMIT) {
    chatMessages = chatMessages.slice(chatMessages.length - CHAT_HISTORY_LIMIT);
  }
}

function formatChatTime(ts) {
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function renderChatLog() {
  chatLogEl.innerHTML = '';
  for (const m of chatMessages) {
    const div = document.createElement('div');
    div.className = `chat-message ${m.own ? 'own' : ''} ${m.pending ? 'pending' : ''} ${m.failed ? 'failed' : ''}`.trim();

    const meta = document.createElement('div');
    meta.className = 'meta';
    let metaText = `${m.from} · ${formatChatTime(m.ts)}`;
    if (m.pending) metaText += ' · gönderiliyor...';
    if (m.failed) metaText += ' · başarısız';
    meta.textContent = metaText;

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = m.text;

    div.append(meta, text);

    if (m.failed) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-ghost retry-btn';
      retryBtn.textContent = '[ TEKRAR DENE ]';
      retryBtn.onclick = () => {
        m.pending = true;
        m.failed = false;
        renderChatLog();
        sendChatWithRetry(m);
      };
      div.appendChild(retryBtn);
    }

    chatLogEl.appendChild(div);
  }

  if (chatAutoScroll) {
    scrollChatToBottom();
  } else {
    chatScrollBtn.classList.toggle('hidden', chatMessages.length === 0);
  }
}

function scrollChatToBottom() {
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  chatScrollBtn.classList.add('hidden');
}

function autoResizeChatInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 90)}px`;
}

function sendChatWithRetry(localMsg) {
  if (!socket || !socket.connected) {
    localMsg.pending = false;
    localMsg.failed = true;
    renderChatLog();
    return;
  }
  socket.emit('chat-message', { text: localMsg.text, clientMessageId: localMsg.clientMessageId }, (ack) => {
    const idx = chatMessages.findIndex((m) => m.clientMessageId === localMsg.clientMessageId);
    if (idx === -1) return;
    if (ack && ack.ok && ack.message) {
      seenChatMessageIds.add(ack.message.id);
      chatMessages[idx] = { ...ack.message, own: true, clientMessageId: localMsg.clientMessageId };
    } else {
      chatMessages[idx].pending = false;
      chatMessages[idx].failed = true;
      if (ack && ack.error) showToast(ack.error, 'error');
    }
    renderChatLog();
  });
}

function sendChatMessage() {
  const text = chatInput.value;
  if (!text.trim()) return;
  if (text.length > 2000) {
    showToast('mesaj çok uzun (en fazla 2000 karakter)', 'error');
    return;
  }
  if (!currentRoomCode) return;
  if (!socket || !socket.connected) {
    showToast('bağlantı yok, mesaj gönderilemedi', 'error');
    return;
  }

  const clientMessageId =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const localMsg = {
    id: clientMessageId,
    clientMessageId,
    from: getSession().username,
    text,
    ts: Date.now(),
    own: true,
    pending: true,
  };
  chatMessages.push(localMsg);
  trimChatMessages();
  chatAutoScroll = true;
  renderChatLog();

  chatInput.value = '';
  autoResizeChatInput();

  sendChatWithRetry(localMsg);
}

// ---- oda / gorusme yasam donguesu ----

async function acquireMicStream() {
  const settings = getSettings();
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: settings.micDeviceId ? { deviceId: { exact: settings.micDeviceId } } : true,
    });
  } catch (err) {
    showToast('mikrofona erişilemedi: ' + err.message, 'error');
    return null;
  }
}

function joinRoomAck(roomCode) {
  return new Promise((resolve) => {
    socket.emit('join-room', { roomCode }, resolve);
  });
}

async function enterRoom(roomCode, stream) {
  cleanupAllPeers();
  resetChat();
  localStream = stream;
  muted = false;

  const result = await joinRoomAck(roomCode);
  if (!result || result.error) {
    showToast(result?.error || 'odaya katılınamadı', 'error');
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    joining = false;
    return false;
  }

  currentRoomCode = roomCode;
  roomCodeDisplay.textContent = roomCode;
  showScreen(roomScreen);
  renderParticipants();
  applyChatHistory(result.chatHistory);
  applyMicMode();

  for (const peer of result.existingPeers) {
    addParticipant(peer.id, peer.displayName);
    await callPeer(peer.id);
  }

  joining = false;
  return true;
}

async function joinRoomWithCode(roomCode) {
  if (joining) return;
  joining = true;
  const stream = await acquireMicStream();
  if (!stream) {
    joining = false;
    return;
  }
  await enterRoom(roomCode, stream);
}

function joinRoom() {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    setStatus('oda kodu gerekli', 'error');
    return;
  }
  joinRoomWithCode(roomCode);
}

async function createRoom() {
  if (joining || !socket) return;
  joining = true;
  const ack = await new Promise((resolve) => socket.emit('create-room', resolve));
  if (!ack || !ack.roomCode) {
    showToast('oda oluşturulamadı', 'error');
    joining = false;
    return;
  }
  joining = false;
  await joinRoomWithCode(ack.roomCode);
}

function fullyLeaveRoom() {
  if (socket && currentRoomCode) socket.emit('leave-room');
  cleanupAllPeers();
  stopVoiceActivation();
  resetChat();
  if (window.api) window.api.unregisterPttShortcut();
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  currentRoomCode = null;
  updateActiveCallBar();
}

function leaveRoom() {
  fullyLeaveRoom();
  showScreen(joinScreen);
  setStatus('');
}

// ---- socket baglantisi ----

function connectSocket() {
  const { token } = getSession();
  socket = io(getServerUrl(), {
    auth: (cb) => cb({ token: getSession().token }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    if (currentRoomCode) {
      showToast('yeniden bağlanıldı, odaya tekrar katılınıyor...', 'ok', 3000);
      rejoinAfterReconnect();
    }
  });

  socket.on('authenticated', () => {
    loadFriends();
  });

  socket.on('disconnect', () => {
    if (currentRoomCode) {
      showToast('sunucu bağlantısı koptu, yeniden bağlanılıyor...', 'error', 0);
    }
  });

  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      showToast('oturum geçersiz, tekrar giriş yap', 'error');
      logout();
      return;
    }
    showToast('bağlantı hatası: ' + err.message, 'error', 6000);
  });

  socket.on('friend-online', ({ username }) => setFriendOnline(username, true));
  socket.on('friend-offline', ({ username }) => setFriendOnline(username, false));
  socket.on('friend-request', () => loadFriends());
  socket.on('friend-accepted', () => loadFriends());

  socket.on('incoming-call', ({ fromUsername, roomCode }) => {
    if (pendingIncomingCall || currentRoomCode) {
      socket.emit('call-response', { roomCode, accepted: false });
      return;
    }
    showIncomingCall(fromUsername, roomCode);
  });

  socket.on('call-ringing', ({ toUsername, roomCode }) => showOutgoingCall(toUsername, roomCode));

  socket.on('call-failed', ({ toUsername, reason }) => {
    const reasonText = { offline: 'çevrimdışı', 'not-friends': 'artık arkadaş değilsiniz', busy: 'meşgul' }[reason] || reason;
    showToast(`${toUsername} aranamadı: ${reasonText}`, 'error');
    hideOutgoingCall();
  });

  socket.on('call-accepted', ({ roomCode }) => {
    hideOutgoingCall();
    joinRoomWithCode(roomCode);
  });

  socket.on('call-declined', ({ byUsername }) => {
    showToast(`${byUsername} aramayı reddetti`, 'error');
    hideOutgoingCall();
  });

  socket.on('call-timeout', () => {
    showToast('arama yanıtlanmadı (zaman aşımı)', 'error');
    hideOutgoingCall();
  });

  socket.on('call-cancelled', ({ roomCode }) => {
    if (pendingIncomingCall && pendingIncomingCall.roomCode === roomCode) {
      showToast(`${pendingIncomingCall.fromUsername} aramayı iptal etti`, 'info');
      hideIncomingCall();
    }
  });

  socket.on('peer-joined', ({ id, displayName }) => {
    addParticipant(id, displayName);
  });

  socket.on('signal', handleSignal);

  socket.on('peer-left', ({ id }) => {
    cleanupPeer(id);
  });

  socket.on('chat-message', (message) => {
    if (seenChatMessageIds.has(message.id)) return;
    seenChatMessageIds.add(message.id);
    chatMessages.push({ ...message, own: false });
    trimChatMessages();
    renderChatLog();
  });

  if (window.api) {
    window.api.onPttToggle(() => {
      if (getSettings().micMode !== 'ptt' || !localStream) return;
      pttToggleState = !pttToggleState;
      applyTrackEnabledState(pttToggleState);
    });
    window.api.onPttRegisterResult(({ success, key }) => {
      if (!success) {
        pttKeyStatusEl.textContent = `[ERROR] ${key} tuşu başka bir uygulama tarafından kullanılıyor, başka tuş seç`;
        pttKeyStatusEl.className = 'status-line error';
      } else {
        pttKeyStatusEl.textContent = '';
      }
    });
  }
}

async function rejoinAfterReconnect() {
  const roomCode = currentRoomCode;
  cleanupAllPeers();
  const result = await joinRoomAck(roomCode);
  if (!result || result.error) {
    showToast('odaya yeniden katılınamadı: ' + (result?.error || ''), 'error', 0);
    currentRoomCode = null;
    showScreen(joinScreen);
    return;
  }
  renderParticipants();
  applyChatHistory(result.chatHistory);
  for (const peer of result.existingPeers) {
    addParticipant(peer.id, peer.displayName);
    await callPeer(peer.id);
  }
}

function setFriendOnline(username, online) {
  const row = friendsListEl.querySelector(`[data-username="${username.toLowerCase()}"]`);
  if (!row) return;
  row.querySelector('.dot').classList.toggle('online', online);
  const callBtn = row.querySelector('.call-btn');
  if (callBtn) callBtn.disabled = !online || !!currentOutgoingCall;
}

// ---- olay dinleyicileri ----

loginBtn.addEventListener('click', () => authRequest('/api/login'));
registerBtn.addEventListener('click', () => authRequest('/api/register'));
logoutBtn.addEventListener('click', logout);
addFriendBtn.addEventListener('click', addFriend);
joinBtn.addEventListener('click', joinRoom);
createRoomBtn.addEventListener('click', createRoom);
copyCodeBtn.addEventListener('click', copyRoomCode);
leaveBtn.addEventListener('click', leaveRoom);
muteBtn.addEventListener('click', toggleMute);
muteAllBtn.addEventListener('click', muteAllIncoming);
micTestBtn.addEventListener('click', toggleLevelMeter);

roomSettingsBtn.addEventListener('click', () => {
  showScreen(joinScreen);
  showTab('settings');
});

returnToCallBtn.addEventListener('click', () => {
  showScreen(roomScreen);
});

chatSendBtn.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

chatInput.addEventListener('input', autoResizeChatInput);

chatLogEl.addEventListener('scroll', () => {
  const threshold = 40;
  chatAutoScroll = chatLogEl.scrollTop + chatLogEl.clientHeight >= chatLogEl.scrollHeight - threshold;
  if (chatAutoScroll) chatScrollBtn.classList.add('hidden');
});

chatScrollBtn.addEventListener('click', () => {
  chatAutoScroll = true;
  scrollChatToBottom();
});

tabBtns.forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

micSelect.addEventListener('change', async () => {
  saveSetting('micDeviceId', micSelect.value);
  if (localStream) await switchMicDevice(micSelect.value);
});

speakerSelect.addEventListener('change', () => {
  saveSetting('speakerDeviceId', speakerSelect.value);
  Object.values(audioElements).forEach((audio) => {
    if (audio.setSinkId) audio.setSinkId(speakerSelect.value).catch(() => {});
  });
});

micModeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    saveSetting('micMode', radio.value);
    updateModeVisibility();
    if (localStream) applyMicMode();
  });
});

themeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    applyTheme(radio.value);
  });
});

vadSensitivitySlider.addEventListener('input', () => {
  saveSetting('vadSensitivity', vadSensitivitySlider.value);
});

pttKeySelect.addEventListener('change', () => {
  saveSetting('pttKey', pttKeySelect.value);
  updatePttRegistration();
});

acceptCallBtn.addEventListener('click', async () => {
  if (!pendingIncomingCall || joining) return;
  const { roomCode } = pendingIncomingCall;
  hideIncomingCall();
  joining = true;
  const stream = await acquireMicStream();
  if (!stream) {
    joining = false;
    socket.emit('call-response', { roomCode, accepted: false });
    return;
  }
  socket.emit('call-response', { roomCode, accepted: true });
  await enterRoom(roomCode, stream);
});

declineCallBtn.addEventListener('click', () => {
  if (!pendingIncomingCall) return;
  socket.emit('call-response', { roomCode: pendingIncomingCall.roomCode, accepted: false });
  hideIncomingCall();
});

cancelCallBtn.addEventListener('click', () => {
  if (!currentOutgoingCall) return;
  socket.emit('cancel-call', { roomCode: currentOutgoingCall.roomCode });
  hideOutgoingCall();
});

// ---- klavye erisimi: Enter ile gonder ----

authPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});
addFriendInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addFriendBtn.click();
});
roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

// ---- baslangic ----

// theme-init.js ilk boyamadan once dogru data-theme'i zaten uyguladi; burada
// sadece localStorage'daki degeri (gecersizse) kalici olarak duzeltiyoruz ve
// ayarlar sekmesindeki radyo butonlarini senkronize ediyoruz.
applyTheme(getTheme());

const existingSession = getSession();
if (existingSession.token && existingSession.username) {
  enterJoinScreen(existingSession.username);
}
