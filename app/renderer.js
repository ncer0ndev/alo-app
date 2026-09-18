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

const currentPasswordInput = document.getElementById('current-password-input');
const newPasswordInput = document.getElementById('new-password-input');
const changePasswordBtn = document.getElementById('change-password-btn');
const passwordStatusEl = document.getElementById('password-status');

const adminTabBtn = document.getElementById('admin-tab-btn');
const adminRefreshBtn = document.getElementById('admin-refresh-btn');
const adminUsersList = document.getElementById('admin-users-list');
const adminStatusEl = document.getElementById('admin-status');

const gameDetectionCheckbox = document.getElementById('game-detection-checkbox');
const myGameStatusEl = document.getElementById('my-game-status');
const statusMessageInput = document.getElementById('status-message-input');
const saveStatusBtn = document.getElementById('save-status-btn');
const statusMessageStatusEl = document.getElementById('status-message-status');
const visibilityRadios = document.querySelectorAll('input[name="visibility-select"]');
const railPresenceBtn = document.getElementById('rail-presence-btn');
const railPresenceLabel = document.getElementById('rail-presence-label');
const visibilityStatusEl = document.getElementById('visibility-status');

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

const switchRoomBanner = document.getElementById('switch-room-banner');
const switchRoomText = document.getElementById('switch-room-text');
const switchRoomConfirmBtn = document.getElementById('switch-room-confirm-btn');
const switchRoomCancelBtn = document.getElementById('switch-room-cancel-btn');

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
const roomAccessSection = document.getElementById('room-access-section');
const roomAccessRadios = document.querySelectorAll('input[name="room-access"]');
const createRoomAccessRadios = document.querySelectorAll('input[name="create-room-access"]');

const chatLogEl = document.getElementById('chat-log');
const chatScrollBtn = document.getElementById('chat-scroll-btn');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

const appShell = document.querySelector('.app-shell');
const communityRail = document.getElementById('community-rail');
const railHomeBtn = document.getElementById('rail-home-btn');
const joinTitlebarHomeBtn = document.getElementById('join-titlebar-home-btn');
const roomTitlebarHomeBtn = document.getElementById('room-titlebar-home-btn');
const homeArea = document.getElementById('home-area');
const communityArea = document.getElementById('community-area');
const serverDetailView = document.getElementById('server-detail-view');
const createServerNameInput = document.getElementById('create-server-name-input');
const createServerBtn = document.getElementById('create-server-btn');
const createServerStatusEl = document.getElementById('create-server-status');
const joinServerCodeInput = document.getElementById('join-server-code-input');
const joinServerBtn = document.getElementById('join-server-btn');
const joinServerStatusEl = document.getElementById('join-server-status');
const serversListEl = document.getElementById('servers-list');
const serversEmptyEl = document.getElementById('servers-empty');
const serversCountEl = document.getElementById('servers-count');
const serversLoadState = document.getElementById('servers-load-state');
const serversLoadMessage = document.getElementById('servers-load-message');
const serversRetryBtn = document.getElementById('servers-retry-btn');
const serverBackBtn = document.getElementById('server-back-btn');
const serverSettingsGearBtn = document.getElementById('server-settings-gear-btn');
const serverDetailNameEl = document.getElementById('server-detail-name');
const serverDetailIcon = document.getElementById('server-detail-icon');
const serverInviteSection = document.getElementById('server-invite-section');
const serverInviteCodeEl = document.getElementById('server-invite-code');
const copyServerInviteBtn = document.getElementById('copy-server-invite-btn');
const regenServerInviteBtn = document.getElementById('regen-server-invite-btn');
const serverChannelsView = document.getElementById('server-channels-view');
const serverTextChannelsList = document.getElementById('server-text-channels-list');
const serverTextChannelsEmpty = document.getElementById('server-text-channels-empty');
const serverVoiceChannelsList = document.getElementById('server-voice-channels-list');
const serverVoiceChannelsEmpty = document.getElementById('server-voice-channels-empty');
const createChannelSection = document.getElementById('create-channel-section');
const createChannelTypeSelect = document.getElementById('create-channel-type-select');
const createChannelNameInput = document.getElementById('create-channel-name-input');
const createChannelBtn = document.getElementById('create-channel-btn');

const serverTextChannelView = document.getElementById('server-text-channel-view');
const textChannelNameEl = document.getElementById('text-channel-name');
const textChannelLoadState = document.getElementById('text-channel-load-state');
const textChannelLoadMessage = document.getElementById('text-channel-load-message');
const textChannelRetryBtn = document.getElementById('text-channel-retry-btn');
const textChannelLogEl = document.getElementById('text-channel-log');
const textChannelEmptyEl = document.getElementById('text-channel-empty');
const textChannelScrollBtn = document.getElementById('text-channel-scroll-btn');
const textChannelInput = document.getElementById('text-channel-input');
const textChannelSendBtn = document.getElementById('text-channel-send-btn');
const serverMembersList = document.getElementById('server-members-list');
const serverMembersPanel = document.getElementById('server-members-panel');
const serverMembersCountEl = document.getElementById('server-members-count');
const memberHoverCard = document.getElementById('member-hover-card');
const memberHoverBanner = document.getElementById('member-hover-banner');
const memberHoverAvatarWrap = document.getElementById('member-hover-avatar-wrap');
const memberHoverName = document.getElementById('member-hover-name');
const memberHoverDot = document.getElementById('member-hover-dot');
const memberHoverRole = document.getElementById('member-hover-role');
const memberHoverStatus = document.getElementById('member-hover-status');
const memberHoverGame = document.getElementById('member-hover-game');
const serverDetailLoadState = document.getElementById('server-detail-load-state');
const serverDetailLoadMessage = document.getElementById('server-detail-load-message');
const serverDetailRetryBtn = document.getElementById('server-detail-retry-btn');
const leaveServerBtn = document.getElementById('leave-server-btn');
const deleteServerBtn = document.getElementById('delete-server-btn');
const serverDetailStatusEl = document.getElementById('server-detail-status');
const serverManagementSection = document.getElementById('server-management-section');
const serverModerationSection = document.getElementById('server-moderation-section');
const serverRenameInput = document.getElementById('server-rename-input');
const serverIconSelect = document.getElementById('server-icon-select');
const saveServerSettingsBtn = document.getElementById('save-server-settings-btn');
const serverTransferSelect = document.getElementById('server-transfer-select');
const transferServerBtn = document.getElementById('transfer-server-btn');
const loadServerBansBtn = document.getElementById('load-server-bans-btn');
const loadServerAuditBtn = document.getElementById('load-server-audit-btn');
const serverManagementList = document.getElementById('server-management-list');
const blockedUsersList = document.getElementById('blocked-users-list');
const blockedUsersEmpty = document.getElementById('blocked-users-empty');
const adminReportsList = document.getElementById('admin-reports-list');

const dmTabBadge = document.getElementById('dm-tab-badge');
const dmListView = document.getElementById('dm-list-view');
const dmThreadView = document.getElementById('dm-thread-view');
const dmConversationsList = document.getElementById('dm-conversations');
const dmConversationsEmpty = document.getElementById('dm-conversations-empty');
const dmRailList = document.getElementById('dm-rail-list');
const dmRailEmpty = document.getElementById('dm-rail-empty');
const dmBackBtn = document.getElementById('dm-back-btn');
const dmThreadUsername = document.getElementById('dm-thread-username');
const dmLogEl = document.getElementById('dm-log');
const dmScrollBtn = document.getElementById('dm-scroll-btn');
const dmInput = document.getElementById('dm-input');
const dmSendBtn = document.getElementById('dm-send-btn');

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

const notifyCallCheckbox = document.getElementById('notify-call-checkbox');
const ringtoneEnabledCheckbox = document.getElementById('ringtone-enabled-checkbox');
const ringtoneVolumeRow = document.getElementById('ringtone-volume-row');
const ringtoneVolumeSlider = document.getElementById('ringtone-volume-slider');
const ringtoneStyleSelect = document.getElementById('ringtone-style-select');
const ringtonePreviewBtn = document.getElementById('ringtone-preview-btn');
const notifyFriendCheckbox = document.getElementById('notify-friend-checkbox');
const notifyChatCheckbox = document.getElementById('notify-chat-checkbox');
const notifyDmCheckbox = document.getElementById('notify-dm-checkbox');
const notifyChatContentCheckbox = document.getElementById('notify-chat-content-checkbox');
const runInBackgroundCheckbox = document.getElementById('run-in-background-checkbox');
const launchAtLoginCheckbox = document.getElementById('launch-at-login-checkbox');

const PTT_KEY_OPTIONS = window.api?.pttKeyOptions || ['Space'];
const VALID_THEMES = ['terminal', 'newsprint', 'kinetic'];

let socket = null;
let localStream = null;
let muted = false;
let iceServers = DEFAULT_ICE_SERVERS;
let pendingIncomingCall = null;
let currentOutgoingCall = null;
let callRequestPending = false;
let currentRoomType = 'room';
let currentRoomCode = null;
let currentRoomIsOwner = false;
let currentChannelServerId = null;
let currentChannelDisplayName = null;
let currentServerChannelRole = null;
let activeServerDetail = null; // { id, name, role, inviteCode, members, channels }
let currentTextChannel = null; // { serverId, channelId, name }
let textChannelMessages = [];
let textChannelAutoScroll = true;
let textChannelLoadingOlder = false;
let textChannelHasMoreHistory = true;
const seenServerMessageIds = new Set();
let pendingRoomSwitch = null;
let myCurrentGame = null;
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

let dmConversations = [];
let currentDmUsername = null;
let dmMessages = [];
let dmAutoScroll = true;
const seenDmMessageIds = new Set();

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
    runInBackground: localStorage.getItem('runInBackground') === 'true',
    notifyIncomingCall: localStorage.getItem('notifyIncomingCall') !== 'false',
    notifyFriendRequest: localStorage.getItem('notifyFriendRequest') !== 'false',
    notifyChatMessage: localStorage.getItem('notifyChatMessage') === 'true',
    notifyDmMessage: localStorage.getItem('notifyDmMessage') !== 'false',
    notifyChatContent: localStorage.getItem('notifyChatContent') === 'true',
    ringtoneEnabled: localStorage.getItem('ringtoneEnabled') !== 'false',
    ringtoneVolume: Number(localStorage.getItem('ringtoneVolume') ?? '70'),
    ringtoneStyle: localStorage.getItem('ringtoneStyle') || 'chime',
    gameDetectionEnabled: localStorage.getItem('gameDetectionEnabled') === 'true',
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
  if (!currentRoomCode) return;
  activeCallText.textContent =
    currentRoomType === 'call'
      ? 'ÖZEL GÖRÜŞME DEVAM EDİYOR'
      : currentRoomType === 'server-channel'
      ? `KANALDA: ${currentChannelDisplayName || ''}`
      : `GÖRÜŞME DEVAM EDİYOR (${currentRoomCode})`;
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
  profileAvatars.setAccount(username);
  profileBanners.setAccount(username);
  setAuthStatus('');
  welcomeText.textContent = `[OK] oturum açıldı: ${username}`;
  profileUsernameEl.textContent = `kullanıcı: ${username}`;
  adminTabBtn.classList.toggle('hidden', username.toLowerCase() !== 'necr0n');
  showTab('friends');
  enterHomeMode();
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
  hideIncomingCall();
  hideOutgoingCall();
  dmConversations = [];
  currentDmUsername = null;
  dmMessages = [];
  seenDmMessageIds.clear();
  dmListView.classList.remove('hidden');
  dmThreadView.classList.add('hidden');
  updateDmTabBadge();
  activeServerDetail = null;
  closeTextChannel();
  latestServersList = [];
  communityRail.classList.remove('collapsed');
  railHomeBtn.classList.add('active');
  homeArea.classList.remove('hidden');
  communityArea.classList.add('hidden');
  serverDetailView.classList.add('hidden');
  serverMembersPanel.classList.add('hidden');
  showScreen(authScreen);
}

// ---- sekmeler ----

function showTab(tabName) {
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  tabContents.forEach((content) => content.classList.toggle('hidden', content.id !== `tab-${tabName}`));
  if (tabName === 'settings') {
    initSettingsTab();
    loadBlockedUsers();
  }
  if (tabName === 'dm') loadDmConversations();
  if (tabName === 'admin') loadAdminUsers();
  if (tabName === 'profile') loadOwnStatusMessage();
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

function updateRingtoneVisibility() {
  ringtoneVolumeRow.classList.toggle('hidden', !getSettings().ringtoneEnabled);
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

  notifyCallCheckbox.checked = settings.notifyIncomingCall;
  ringtoneEnabledCheckbox.checked = settings.ringtoneEnabled;
  ringtoneVolumeSlider.value = settings.ringtoneVolume;
  if (ringtoneStyleSelect.options.length === 0) {
    for (const style of RINGTONE_CATALOG) {
      const opt = document.createElement('option');
      opt.value = style.id;
      opt.textContent = style.label;
      ringtoneStyleSelect.appendChild(opt);
    }
  }
  ringtoneStyleSelect.value = settings.ringtoneStyle;
  notifyFriendCheckbox.checked = settings.notifyFriendRequest;
  notifyChatCheckbox.checked = settings.notifyChatMessage;
  notifyDmCheckbox.checked = settings.notifyDmMessage;
  notifyChatContentCheckbox.checked = settings.notifyChatContent;
  runInBackgroundCheckbox.checked = settings.runInBackground;
  gameDetectionCheckbox.checked = settings.gameDetectionEnabled;
  updateRingtoneVisibility();

  if (window.api) {
    window.api.getLaunchAtLogin().then((enabled) => {
      launchAtLoginCheckbox.checked = !!enabled;
    });
  }

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
  if (!currentRoomCode || currentRoomType === 'call') return;
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
    profileAvatars.remember(friend.username, friend.avatarId);
    profileBanners.remember(friend.username, friend.bannerId);
    const li = document.createElement('li');
    li.className = 'friend-row';
    li.dataset.username = friend.username.toLowerCase();
    li.dataset.game = friend.game || '';
    li.dataset.status = friend.statusMessage || '';
    const dot = document.createElement('span');
    dot.className = `dot ${friend.online ? 'online' : ''}`;

    const main = document.createElement('div');
    main.className = 'dm-row-main';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = friend.username;
    const presence = document.createElement('span');
    presence.className = 'preview friend-presence';
    main.append(name, presence);
    setPresenceLineText(presence, friend.game, friend.statusMessage);

    if (friend.roomOpen) {
      const statusLabel = document.createElement('span');
      statusLabel.className = 'friend-room-status';
      statusLabel.textContent = 'odada';
      const joinRoomBtn = document.createElement('button');
      joinRoomBtn.className = 'btn join-room-friend-btn';
      joinRoomBtn.textContent = '[ KATIL ]';
      joinRoomBtn.disabled = !friend.online;
      joinRoomBtn.onclick = () => joinFriendRoom(friend.username);
      li.append(dot, main, statusLabel, joinRoomBtn);
    } else {
      const callBtn = document.createElement('button');
      callBtn.className = 'btn call-btn';
      callBtn.textContent = '[ ARA ]';
      callBtn.disabled = !friend.online || !!currentOutgoingCall;
      callBtn.onclick = () => callFriend(friend.username);
      li.append(dot, main, callBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost';
    removeBtn.textContent = '[ SİL ]';
    removeBtn.onclick = () => removeFriend(friend.username);
    li.append(removeBtn);
    li.prepend(profileAvatars.image(friend.username));

    friendsListEl.appendChild(li);
  }
}

function setPresenceLineText(el, game, statusMessage) {
  const text = game ? `🎮 ${game}` : statusMessage || '';
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}

function setFriendGame(username, game) {
  const row = friendsListEl.querySelector(`[data-username="${username.toLowerCase()}"]`);
  if (!row) return;
  row.dataset.game = game || '';
  const presence = row.querySelector('.friend-presence');
  if (presence) setPresenceLineText(presence, game, row.dataset.status);
}

function setFriendStatusMessage(username, statusMessage) {
  const row = friendsListEl.querySelector(`[data-username="${username.toLowerCase()}"]`);
  if (!row) return;
  row.dataset.status = statusMessage || '';
  const presence = row.querySelector('.friend-presence');
  if (presence) setPresenceLineText(presence, row.dataset.game, statusMessage);
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

async function callFriend(toUsername) {
  if (!socket?.connected) return showToast('Aramak için sunucuya bağlı olmalısın.', 'error');
  if (currentOutgoingCall || callRequestPending || pendingIncomingCall || joining) return;
  if (currentRoomCode) return showToast('Özel arama başlatmadan önce mevcut görüşmeden ayrıl.', 'info');
  const now = Date.now();
  if (now - lastCallAttemptAt < CALL_COOLDOWN_MS) return;
  lastCallAttemptAt = now;

  callRequestPending = true;
  setCallButtonsEnabled(false);
  try {
    const ack = await emitWithTimeout('call-friend', { toUsername });
    if (ack?.error) showToast(ack.error, 'error');
  } finally {
    callRequestPending = false;
    setCallButtonsEnabled(!currentOutgoingCall);
  }
}

// ---- gelen arama zili ----
// Harici bir ses dosyasi kullanilmiyor; ton dogrudan Web Audio ile uretilir.
// Ayni cagri icin zil ust uste baslatilamaz (ringtoneCtx varsa yeni cagri yoksayilir).
// Her nota yumusak bir attack/release zarfiyla calinir (osc.start/stop'un
// dogrudan tetikledigi "cit" sesini onlemek icin) - eski zil bunu yapmiyordu
// ve iki es zamanli sert sinyal, alarm/tatbikat siren tonuna benziyordu.

const RINGTONE_CATALOG = [
  {
    id: 'chime',
    label: 'Nazik Çan',
    cycleMs: 1700,
    notes: [
      { at: 0, freq: 659.25, dur: 0.5, type: 'sine' },
      { at: 0.22, freq: 987.77, dur: 0.6, type: 'sine' },
    ],
  },
  {
    id: 'marimba',
    label: 'Marimba',
    cycleMs: 1900,
    notes: [
      { at: 0, freq: 523.25, dur: 0.3, type: 'triangle' },
      { at: 0.16, freq: 659.25, dur: 0.3, type: 'triangle' },
      { at: 0.32, freq: 783.99, dur: 0.4, type: 'triangle' },
    ],
  },
  {
    id: 'soft-bell',
    label: 'Yumuşak Zil',
    cycleMs: 1500,
    notes: [{ at: 0, freq: 739.99, dur: 0.75, type: 'sine' }],
  },
  {
    id: 'melody',
    label: 'Melodik',
    cycleMs: 2100,
    notes: [
      { at: 0, freq: 587.33, dur: 0.28, type: 'triangle' },
      { at: 0.2, freq: 739.99, dur: 0.28, type: 'triangle' },
      { at: 0.4, freq: 880.0, dur: 0.45, type: 'triangle' },
    ],
  },
];

function getRingtoneStyle() {
  const stored = getSettings().ringtoneStyle;
  return RINGTONE_CATALOG.find((r) => r.id === stored) || RINGTONE_CATALOG[0];
}

let ringtoneCtx = null;
let ringtoneGain = null;
let ringtoneTimer = null;

function playRingtoneNote(freq, startTime, duration, type) {
  const osc = ringtoneCtx.createOscillator();
  const envelope = ringtoneCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const attack = 0.02;
  const release = Math.min(0.18, duration * 0.5);
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(1, startTime + attack);
  envelope.gain.setValueAtTime(1, startTime + duration - release);
  envelope.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(envelope);
  envelope.connect(ringtoneGain);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function startRingtone() {
  const settings = getSettings();
  if (!settings.ringtoneEnabled || ringtoneCtx) return;
  try {
    ringtoneCtx = new AudioContext();
  } catch {
    ringtoneCtx = null;
    return;
  }
  ringtoneGain = ringtoneCtx.createGain();
  ringtoneGain.gain.value = Math.max(0, Math.min(1, settings.ringtoneVolume / 100));
  ringtoneGain.connect(ringtoneCtx.destination);

  const style = getRingtoneStyle();
  const ringOnce = () => {
    if (!ringtoneCtx) return;
    const now = ringtoneCtx.currentTime;
    for (const note of style.notes) {
      playRingtoneNote(note.freq, now + note.at, note.dur, note.type);
    }
  };
  ringOnce();
  ringtoneTimer = setInterval(ringOnce, style.cycleMs);
}

function previewRingtone(styleId) {
  let ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, getSettings().ringtoneVolume / 100));
  gain.connect(ctx.destination);
  const style = RINGTONE_CATALOG.find((r) => r.id === styleId) || RINGTONE_CATALOG[0];
  const now = ctx.currentTime;
  for (const note of style.notes) {
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    osc.type = note.type;
    osc.frequency.value = note.freq;
    const startTime = now + note.at;
    const attack = 0.02;
    const release = Math.min(0.18, note.dur * 0.5);
    envelope.gain.setValueAtTime(0, startTime);
    envelope.gain.linearRampToValueAtTime(1, startTime + attack);
    envelope.gain.setValueAtTime(1, startTime + note.dur - release);
    envelope.gain.linearRampToValueAtTime(0, startTime + note.dur);
    osc.connect(envelope);
    envelope.connect(gain);
    osc.start(startTime);
    osc.stop(startTime + note.dur);
  }
  setTimeout(() => ctx.close().catch(() => {}), (style.notes.at(-1).at + style.notes.at(-1).dur) * 1000 + 200);
}

function stopRingtone() {
  if (ringtoneTimer) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
  if (ringtoneCtx) {
    ringtoneCtx.close().catch(() => {});
    ringtoneCtx = null;
  }
  ringtoneGain = null;
}

function showIncomingCall(fromUsername, roomCode) {
  pendingIncomingCall = { fromUsername, roomCode };
  incomingCallText.textContent = `${fromUsername} seni arıyor`;
  incomingCallBanner.classList.remove('hidden');
  startRingtone();
}

function hideIncomingCall() {
  const roomCode = pendingIncomingCall?.roomCode;
  pendingIncomingCall = null;
  incomingCallBanner.classList.add('hidden');
  stopRingtone();
  if (roomCode && window.api) window.api.clearCallNotification(roomCode);
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

function updateDirectCallUI(roomType = 'room', displayLabel = null) {
  currentRoomType = roomType;
  const privateCall = roomType === 'call';
  const isServerChannel = roomType === 'server-channel';
  const row = roomCodeDisplay.closest('.room-code-row');
  const label = row?.querySelector('.prompt');
  if (label) label.textContent = privateCall ? 'Özel görüşme:' : isServerChannel ? 'kanal:' : 'oda kodu:';
  roomCodeDisplay.textContent = privateCall ? 'Birebir arama' : isServerChannel ? displayLabel || currentRoomCode : currentRoomCode;
  copyCodeBtn.classList.toggle('hidden', privateCall || isServerChannel);
  leaveBtn.textContent = privateCall ? '[ ARAMAYI BİTİR ]' : isServerChannel ? '[ KANALDAN AYRIL ]' : '[ ODADAN AYRIL ]';
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
  me.prepend(profileAvatars.image(myUsername));
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

    li.append(profileAvatars.image(name), nameSpan, vol, muteOneBtn);

    if (canKickInCurrentRoom()) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'btn btn-ghost';
      kickBtn.textContent = '[ AT ]';
      kickBtn.onclick = () => kickParticipant(id, name);
      li.append(kickBtn);
    }

    participantsList.appendChild(li);
  }
}

function canKickInCurrentRoom() {
  if (currentRoomType === 'call') return false;
  if (currentRoomType === 'server-channel') return currentServerChannelRole === 'owner' || currentServerChannelRole === 'moderator';
  return currentRoomIsOwner;
}

function addParticipant(id, name, avatarId) {
  profileAvatars.remember(name, avatarId);
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

async function kickParticipant(targetSocketId, targetName) {
  if (!canKickInCurrentRoom() || !socket) return;
  const ack = await emitWithTimeout('kick-participant', { targetSocketId });
  if (!ack || ack.error) {
    showToast(ack?.error || `${targetName} atılamadı`, 'error');
    return;
  }
  // Sunucu, atilan disindaki odadakilere 'peer-left' yayinlar (gonderen
  // haric); atan (biz) bu yayini kendimize almadigimizdan katilimciyi
  // burada elle temizliyoruz.
  cleanupPeer(targetSocketId);
  showToast(`${targetName} odadan atıldı`, 'ok', 3000);
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
    meta.prepend(profileAvatars.image(m.from, m.avatarId));

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

// ---- ozel mesajlar (DM) ----

function updateDmTabBadge() {
  const total = dmConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  if (total > 0) {
    dmTabBadge.textContent = total > 99 ? '99+' : String(total);
    dmTabBadge.classList.remove('hidden');
  } else {
    dmTabBadge.classList.add('hidden');
  }
}

function sortDmConversations(list) {
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0);
    return (b.lastAt || 0) - (a.lastAt || 0);
  });
}

function renderDmConversations() {
  dmConversationsList.innerHTML = '';
  const sorted = sortDmConversations(dmConversations);
  dmConversationsEmpty.classList.toggle('hidden', sorted.length > 0);

  for (const conv of sorted) {
    const li = document.createElement('li');
    li.className = 'friend-row dm-row';
    li.dataset.username = conv.username.toLowerCase();

    const dot = document.createElement('span');
    dot.className = `dot ${conv.online ? 'online' : ''}`;

    const main = document.createElement('div');
    main.className = 'dm-row-main';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = conv.username;
    const preview = document.createElement('span');
    preview.className = 'preview';
    preview.textContent = conv.lastText ? `${conv.lastFromSelf ? 'sen: ' : ''}${conv.lastText}` : 'henüz mesaj yok';
    main.append(nameSpan, preview);

    li.append(dot, main);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'btn btn-ghost pin-btn';
    pinBtn.textContent = conv.pinned ? '[ SABİTİ KALDIR ]' : '[ SABİTLE ]';
    pinBtn.onclick = (event) => {
      event.stopPropagation();
      toggleDmPin(conv.username, !conv.pinned);
    };
    li.appendChild(pinBtn);

    if (conv.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'unread-badge';
      badge.textContent = conv.unreadCount > 99 ? '99+' : String(conv.unreadCount);
      li.appendChild(badge);
    }

    li.addEventListener('click', () => openDmThread(conv.username));
    dmConversationsList.appendChild(li);
  }
  updateDmTabBadge();
  renderDmRail();
}

async function toggleDmPin(username, pinned) {
  try {
    await apiRequest(`/api/dm/${encodeURIComponent(username)}/pin`, { pinned });
    const conv = findDmConversation(username);
    if (conv) {
      conv.pinned = pinned;
      conv.pinnedAt = pinned ? Date.now() : null;
    }
    renderDmConversations();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderDmRail() {
  if (!dmRailList) return;
  dmRailList.innerHTML = '';
  const sorted = sortDmConversations(dmConversations);
  dmRailEmpty.classList.toggle('hidden', sorted.length > 0);
  for (const conv of sorted) {
    const li = document.createElement('li');
    li.className = `community-server-item dm-rail-item${conv.username.toLowerCase() === currentDmUsername?.toLowerCase() ? ' active' : ''}`;
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${conv.username} ile mesajları aç`);
    const badge = document.createElement('span');
    badge.className = 'community-server-badge';
    badge.appendChild(profileAvatars.image(conv.username));
    const main = document.createElement('div');
    main.className = 'community-server-copy';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = conv.username;
    main.append(name);
    li.append(badge, main);
    if (conv.unreadCount > 0) {
      const unread = document.createElement('span');
      unread.className = 'unread-badge';
      unread.textContent = conv.unreadCount > 99 ? '99+' : String(conv.unreadCount);
      li.appendChild(unread);
    }
    const openIt = () => {
      enterHomeMode();
      showTab('dm');
      openDmThread(conv.username);
    };
    li.addEventListener('click', openIt);
    li.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openIt();
      }
    });
    dmRailList.appendChild(li);
  }
}

async function loadDmConversations() {
  const { token } = getSession();
  try {
    const res = await fetch(`${getServerUrl()}/api/dm/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    dmConversations = data.conversations;
    if (!currentDmUsername) renderDmConversations();
    else updateDmTabBadge();
  } catch {
    // sessizce yoksay, bir sonraki denemede tekrar dener
  }
}

function findDmConversation(username) {
  return dmConversations.find((c) => c.username.toLowerCase() === username.toLowerCase());
}

function updateDmConversationPreview(username, message, fromSelf) {
  let conv = findDmConversation(username);
  if (!conv) {
    conv = { username, avatarId: 'panda', online: true, lastText: null, lastAt: null, lastFromSelf: null, unreadCount: 0 };
    dmConversations.push(conv);
  }
  conv.lastText = message.text;
  conv.lastAt = message.ts;
  conv.lastFromSelf = fromSelf;
  if (!fromSelf && currentDmUsername?.toLowerCase() !== username.toLowerCase()) {
    conv.unreadCount = (conv.unreadCount || 0) + 1;
  }
  if (!dmListView.classList.contains('hidden')) renderDmConversations();
  else updateDmTabBadge();
}

function scrollDmToBottom() {
  dmLogEl.scrollTop = dmLogEl.scrollHeight;
  dmScrollBtn.classList.add('hidden');
}

function renderDmLog() {
  dmLogEl.innerHTML = '';
  for (const m of dmMessages) {
    const div = document.createElement('div');
    div.className = `chat-message ${m.own ? 'own' : ''} ${m.pending ? 'pending' : ''} ${m.failed ? 'failed' : ''}`.trim();

    const meta = document.createElement('div');
    meta.className = 'meta';
    let metaText = `${m.own ? 'sen' : m.from} · ${formatChatTime(m.ts)}`;
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
        renderDmLog();
        sendDmWithRetry(m);
      };
      div.appendChild(retryBtn);
    }

    dmLogEl.appendChild(div);
  }

  if (dmAutoScroll) scrollDmToBottom();
  else dmScrollBtn.classList.toggle('hidden', dmMessages.length === 0);
}

async function openDmThread(targetUsername) {
  currentDmUsername = targetUsername;
  dmMessages = [];
  seenDmMessageIds.clear();
  dmAutoScroll = true;
  dmThreadUsername.textContent = targetUsername;
  dmListView.classList.add('hidden');
  dmThreadView.classList.remove('hidden');
  renderDmLog();
  renderDmRail();

  const { token } = getSession();
  try {
    const res = await fetch(`${getServerUrl()}/api/dm/${encodeURIComponent(targetUsername)}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      for (const m of data.messages) {
        if (seenDmMessageIds.has(m.id)) continue;
        seenDmMessageIds.add(m.id);
        dmMessages.push({ ...m, own: m.from === getSession().username });
      }
      if (currentDmUsername === targetUsername) renderDmLog();
    } else if (res.status === 403) {
      showToast('bu kullaniciyla artik arkadas degilsiniz', 'error');
      closeDmThread();
      return;
    }
  } catch {
    // sessizce yoksay
  }

  fetch(`${getServerUrl()}/api/dm/${encodeURIComponent(targetUsername)}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});

  const conv = findDmConversation(targetUsername);
  if (conv) conv.unreadCount = 0;
  updateDmTabBadge();
}

function closeDmThread() {
  currentDmUsername = null;
  dmThreadView.classList.add('hidden');
  dmListView.classList.remove('hidden');
  renderDmConversations();
}

function sendDmWithRetry(localMsg) {
  if (!socket || !socket.connected) {
    localMsg.pending = false;
    localMsg.failed = true;
    renderDmLog();
    return;
  }
  socket.emit(
    'dm-message',
    { toUsername: currentDmUsername, text: localMsg.text, clientMessageId: localMsg.clientMessageId },
    (ack) => {
      const idx = dmMessages.findIndex((m) => m.clientMessageId === localMsg.clientMessageId);
      if (idx === -1) return;
      if (ack && ack.ok && ack.message) {
        seenDmMessageIds.add(ack.message.id);
        dmMessages[idx] = { ...ack.message, own: true, clientMessageId: localMsg.clientMessageId };
        updateDmConversationPreview(localMsg.toUsername, ack.message, true);
      } else {
        dmMessages[idx].pending = false;
        dmMessages[idx].failed = true;
        if (ack && ack.error) showToast(ack.error, 'error');
      }
      renderDmLog();
    }
  );
}

function autoResizeDmInput() {
  dmInput.style.height = 'auto';
  dmInput.style.height = `${Math.min(dmInput.scrollHeight, 90)}px`;
}

function sendDmMessage() {
  const text = dmInput.value;
  if (!text.trim() || !currentDmUsername) return;
  if (text.length > 2000) {
    showToast('mesaj çok uzun (en fazla 2000 karakter)', 'error');
    return;
  }
  if (!socket || !socket.connected) {
    showToast('bağlantı yok, mesaj gönderilemedi', 'error');
    return;
  }

  const clientMessageId =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const localMsg = {
    id: clientMessageId,
    clientMessageId,
    toUsername: currentDmUsername,
    from: getSession().username,
    text,
    ts: Date.now(),
    own: true,
    pending: true,
  };
  dmMessages.push(localMsg);
  dmAutoScroll = true;
  renderDmLog();

  dmInput.value = '';
  autoResizeDmInput();

  sendDmWithRetry(localMsg);
}

// ---- sunucular (topluluklar) ----

async function apiDelete(endpoint) {
  const { token } = getSession();
  const res = await fetch(`${getServerUrl()}${endpoint}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'bir hata oluştu');
  return data;
}

function setServerDetailStatus(text, kind = 'info') {
  serverDetailStatusEl.textContent = text ? `[${kind.toUpperCase()}] ${text}` : '';
  serverDetailStatusEl.className = `status-line ${kind}`;
}

async function loadServersList() {
  const { token } = getSession();
  serversLoadState.className = 'community-load-state';
  serversLoadMessage.textContent = 'Topluluklar yükleniyor...';
  serversRetryBtn.classList.add('hidden');
  serversLoadState.classList.remove('hidden');
  try {
    const res = await fetch(`${getServerUrl()}/api/servers`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('topluluklar alınamadı');
    const data = await res.json();
    renderServersList(data.servers);
    serversLoadState.classList.add('hidden');
  } catch {
    serversLoadState.className = 'community-load-state error';
    serversLoadMessage.textContent = 'Topluluklar yüklenemedi.';
    serversRetryBtn.classList.remove('hidden');
  }
}

async function toggleServerPin(serverId, pinned) {
  try {
    await apiRequest(`/api/servers/${serverId}/pin`, { pinned });
    await loadServersList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function serverRoleLabel(role) {
  return role === 'owner' ? 'sahip' : role === 'moderator' ? 'moderatör' : 'üye';
}

function renderServersList(servers) {
  serversListEl.innerHTML = '';
  serversCountEl.textContent = String(servers.length);
  serversEmptyEl.classList.toggle('hidden', servers.length > 0);
  for (const s of servers) {
    const li = document.createElement('li');
    li.className = `community-server-item${activeServerDetail?.id === s.id ? ' active' : ''}`;
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${s.name} topluluğunu aç`);
    const badge = document.createElement('span');
    badge.className = 'community-server-badge';
    if (s.iconId) badge.replaceChildren(profileAvatars.imageForId(s.iconId, 'community-server-icon'));
    else badge.textContent = s.name.trim().slice(0, 2).toUpperCase();
    const main = document.createElement('div');
    main.className = 'community-server-copy';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = s.name;
    const preview = document.createElement('span');
    preview.className = 'preview';
    preview.textContent = serverRoleLabel(s.role);
    main.append(name, preview);
    li.append(badge, main);
    const pinBtn = document.createElement('button');
    pinBtn.className = 'btn btn-ghost pin-btn';
    pinBtn.textContent = s.pinned ? '[ SABİTİ KALDIR ]' : '[ SABİTLE ]';
    pinBtn.onclick = (event) => {
      event.stopPropagation();
      toggleServerPin(s.id, !s.pinned);
    };
    li.appendChild(pinBtn);
    if (s.unreadCount > 0) {
      const unread = document.createElement('span');
      unread.className = 'unread-badge';
      unread.textContent = s.unreadCount > 99 ? '99+' : String(s.unreadCount);
      li.appendChild(unread);
    }
    li.addEventListener('click', () => openServerDetail(s.id));
    li.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openServerDetail(s.id);
      }
    });
    serversListEl.appendChild(li);
  }
}

async function createServer() {
  const name = createServerNameInput.value.trim();
  if (!name) return;
  try {
    const data = await apiRequest('/api/servers', { name });
    createServerStatusEl.textContent = '';
    createServerNameInput.value = '';
    await openServerDetail(data.id);
  } catch (err) {
    createServerStatusEl.textContent = `[ERROR] ${err.message}`;
    createServerStatusEl.className = 'status-line error';
  }
}

async function joinServerByCode() {
  const inviteCode = joinServerCodeInput.value.trim();
  if (!inviteCode) return;
  try {
    const data = await apiRequest('/api/servers/join', { inviteCode });
    joinServerStatusEl.textContent = '';
    joinServerCodeInput.value = '';
    await openServerDetail(data.id);
  } catch (err) {
    joinServerStatusEl.textContent = `[ERROR] ${err.message}`;
    joinServerStatusEl.className = 'status-line error';
  }
}

// Sag tarafi "ana sayfa" (arkadaslar/DM/ayarlar sekmeleri) ile bir toplulugun
// kanal gorunumu arasinda degistirir; sol raydaki topluluk listesi ana
// sayfada tam (isim+rol), topluluk secilince simge-genisligine kuculur
// (taskbar gibi) - ayni <ul id="servers-list"> tek DOM'da kalir, CSS
// .collapsed sinifiyla gorunumu degistirir.

function enterHomeMode() {
  activeServerDetail = null;
  hideMemberHoverCard();
  closeTextChannel();
  communityRail.classList.remove('collapsed');
  railHomeBtn.classList.add('active');
  homeArea.classList.remove('hidden');
  communityArea.classList.add('hidden');
  serverDetailView.classList.add('hidden');
  serverMembersPanel.classList.add('hidden');
  loadServersList();
}

function enterCommunityMode() {
  communityRail.classList.add('collapsed');
  railHomeBtn.classList.remove('active');
  homeArea.classList.add('hidden');
  communityArea.classList.remove('hidden');
}

async function openServerDetail(serverId) {
  const { token } = getSession();
  enterCommunityMode();
  serverDetailLoadState.className = 'community-detail-state';
  serverDetailLoadMessage.textContent = 'Topluluk yükleniyor...';
  serverDetailRetryBtn.dataset.serverId = String(serverId);
  serverDetailRetryBtn.classList.add('hidden');
  serverDetailView.classList.add('hidden');
  serverMembersPanel.classList.add('hidden');
  serverDetailLoadState.classList.remove('hidden');
  try {
    const res = await fetch(`${getServerUrl()}/api/servers/${serverId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'topluluk açılamadı');
    }
    activeServerDetail = data;
    renderServerDetail();
    serverDetailLoadState.classList.add('hidden');
    serverDetailView.classList.remove('hidden');
    serverMembersPanel.classList.remove('hidden');
    if (!currentTextChannel || currentTextChannel.serverId !== serverId) {
      // Topluluga her girildiginde (ilk olusturuldugunda dahil), ana metin
      // kanali ("genel") otomatik acilir - Discord'daki gibi.
      const defaultChannel = data.channels.find((c) => c.type === 'text');
      if (defaultChannel) {
        openTextChannel(serverId, defaultChannel.id, defaultChannel.name);
      } else {
        showServerChannelsView();
      }
    }
    loadServersList();
  } catch (err) {
    serverDetailLoadState.className = 'community-detail-state error';
    serverDetailLoadMessage.textContent = err.message || 'Topluluk yüklenemedi.';
    serverDetailRetryBtn.classList.remove('hidden');
  }
}

function closeServerDetail() {
  enterHomeMode();
}

function renderVoiceChannelMembers(row, members) {
  let list = row.querySelector('.server-channel-voice-members');
  if (!members || members.length === 0) {
    if (list) list.remove();
    return;
  }
  if (!list) {
    list = document.createElement('ul');
    list.className = 'server-channel-voice-members';
    row.appendChild(list);
  }
  list.innerHTML = '';
  for (const m of members) {
    profileAvatars.remember(m.username, m.avatarId);
    const item = document.createElement('li');
    item.className = 'server-channel-voice-member';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = m.username;
    item.append(profileAvatars.image(m.username), nameSpan);
    list.appendChild(item);
  }
}

function formatGameDuration(sinceMs) {
  if (!sinceMs) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - sinceMs) / 60000));
  if (minutes < 1) return 'az önce başladı';
  if (minutes < 60) return `${minutes} dakikadır`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} sa ${rest} dk'dır` : `${hours} saattir`;
}

function showMemberHoverCard(row, username) {
  if (!activeServerDetail) return;
  const m = activeServerDetail.members.find((item) => item.username.toLowerCase() === username.toLowerCase());
  if (!m) return;
  memberHoverBanner.style.background = profileBanners.elementForId(m.bannerId || 'none').style.background;
  memberHoverAvatarWrap.replaceChildren(profileAvatars.image(m.username));
  memberHoverName.textContent = m.username;
  memberHoverDot.className = `server-member-presence${m.online ? ' online' : ''}`;
  memberHoverRole.textContent = serverRoleLabel(m.role);
  memberHoverStatus.textContent = m.statusMessage || (m.online ? 'Çevrimiçi' : 'Çevrimdışı');
  if (m.game) {
    memberHoverGame.textContent = `🎮 ${m.game} · ${formatGameDuration(m.gameSince)}`;
    memberHoverGame.classList.remove('hidden');
  } else {
    memberHoverGame.classList.add('hidden');
  }

  const rowRect = row.getBoundingClientRect();
  memberHoverCard.classList.remove('hidden');
  const cardRect = memberHoverCard.getBoundingClientRect();
  const left = Math.max(8, rowRect.left - cardRect.width - 10);
  let top = rowRect.top;
  if (top + cardRect.height > window.innerHeight - 8) top = window.innerHeight - cardRect.height - 8;
  memberHoverCard.style.left = `${left}px`;
  memberHoverCard.style.top = `${Math.max(8, top)}px`;
}

function hideMemberHoverCard() {
  memberHoverCard.classList.add('hidden');
}

function renderServerDetail() {
  if (!activeServerDetail) return;
  const d = activeServerDetail;
  serverDetailNameEl.textContent = d.name;
  serverDetailIcon.replaceChildren(profileAvatars.imageForId(d.iconId || 'robot', 'community-detail-icon-art'));
  setServerDetailStatus('');

  const isOwner = d.role === 'owner';
  const isMod = d.role === 'moderator';
  const myUsername = getSession().username.toLowerCase();
  serverMembersCountEl.textContent = String(d.members.length);

  serverInviteSection.classList.toggle('hidden', !isOwner);
  if (isOwner) serverInviteCodeEl.textContent = d.inviteCode;

  createChannelSection.classList.toggle('hidden', !isOwner && !isMod);
  leaveServerBtn.classList.toggle('hidden', isOwner);
  deleteServerBtn.classList.toggle('hidden', !isOwner);
  serverManagementSection.classList.toggle('hidden', !isOwner);
  serverModerationSection.classList.toggle('hidden', !isOwner && !isMod);
  if (isOwner) {
    serverRenameInput.value = d.name;
    serverIconSelect.replaceChildren();
    for (const avatar of window.AVATAR_CATALOG) {
      if (avatar.id === 'phoenix' && myUsername !== 'necr0n') continue;
      const option = document.createElement('option');
      option.value = avatar.id;
      option.textContent = avatar.label;
      option.selected = avatar.id === (d.iconId || 'robot');
      serverIconSelect.appendChild(option);
    }
    serverTransferSelect.replaceChildren();
    for (const member of d.members.filter((member) => member.role !== 'owner')) {
      const option = document.createElement('option');
      option.value = member.username;
      option.textContent = `${member.username} · ${serverRoleLabel(member.role)}`;
      serverTransferSelect.appendChild(option);
    }
    transferServerBtn.disabled = serverTransferSelect.options.length === 0;
    transferServerBtn.closest('.community-transfer-row').classList.toggle('hidden', serverTransferSelect.options.length === 0);
  }

  serverTextChannelsList.innerHTML = '';
  serverVoiceChannelsList.innerHTML = '';
  const textChannels = d.channels.filter((c) => c.type === 'text');
  const voiceChannels = d.channels.filter((c) => c.type !== 'text');
  serverTextChannelsEmpty.classList.toggle('hidden', textChannels.length > 0);
  serverVoiceChannelsEmpty.classList.toggle('hidden', voiceChannels.length > 0);

  for (const c of textChannels) {
    const li = document.createElement('li');
    li.className = 'server-channel-row server-channel-row--text';
    if (currentTextChannel && currentTextChannel.serverId === d.id && currentTextChannel.channelId === c.id) {
      li.classList.add('active');
    }
    li.dataset.channelId = String(c.id);
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `# ${c.name} kanalını aç`);
    const main = document.createElement('div');
    main.className = 'server-channel-copy';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.name;
    main.append(name);
    li.append(main);

    if (c.unreadCount > 0) {
      const unread = document.createElement('span');
      unread.className = 'server-channel-unread-badge';
      unread.textContent = c.unreadCount > 99 ? '99+' : String(c.unreadCount);
      li.classList.add('has-unread');
      li.append(unread);
    }

    const openIt = () => openTextChannel(d.id, c.id, c.name);
    li.addEventListener('click', openIt);
    li.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openIt();
      }
    });

    if (isOwner || isMod) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost';
      delBtn.textContent = '[ SİL ]';
      delBtn.onclick = (event) => {
        event.stopPropagation();
        deleteServerChannel(d.id, c.id);
      };
      li.append(delBtn);
      appendChannelManagementActions(li, c, d.channels);
    }

    serverTextChannelsList.appendChild(li);
  }

  for (const c of voiceChannels) {
    const li = document.createElement('li');
    li.className = 'server-channel-row server-channel-row--voice';
    li.dataset.channelId = String(c.id);
    const icon = document.createElement('span');
    icon.className = 'server-channel-icon';
    icon.textContent = '◖◗';
    icon.setAttribute('aria-hidden', 'true');
    const main = document.createElement('div');
    main.className = 'server-channel-copy';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.name;
    const preview = document.createElement('span');
    preview.className = 'preview';
    preview.textContent = `${c.memberCount} kişi`;
    main.append(name, preview);
    li.append(icon, main);

    const inThisChannel = currentRoomCode === `CH${c.id}`;
    const joinChBtn = document.createElement('button');
    joinChBtn.className = inThisChannel ? 'btn btn-ghost' : 'btn';
    joinChBtn.textContent = inThisChannel ? '[ AYRIL ]' : '[ KATIL ]';
    joinChBtn.onclick = inThisChannel ? () => leaveRoom() : () => joinServerVoiceChannel(d.id, c.id, c.name);
    li.append(joinChBtn);

    if (isOwner || isMod) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost';
      delBtn.textContent = '[ SİL ]';
      delBtn.onclick = () => deleteServerChannel(d.id, c.id);
      li.append(delBtn);
      appendChannelManagementActions(li, c, d.channels);
    }

    renderVoiceChannelMembers(li, c.members);

    serverVoiceChannelsList.appendChild(li);
  }

  serverMembersList.innerHTML = '';
  hideMemberHoverCard();
  const roleGroups = [
    ['owner', 'SAHİP'],
    ['moderator', 'MODERATÖR'],
    ['member', 'ÜYE'],
  ];
  for (const [role, label] of roleGroups) {
    const groupMembers = d.members.filter((m) => m.role === role);
    if (groupMembers.length === 0) continue;
    const head = document.createElement('li');
    head.className = 'server-member-group-head';
    head.textContent = `${label} — ${groupMembers.length}`;
    serverMembersList.appendChild(head);
    for (const m of groupMembers) serverMembersList.appendChild(buildMemberRow(m));
  }

  function buildMemberRow(m) {
    profileAvatars.remember(m.username, m.avatarId);
    profileBanners.remember(m.username, m.bannerId);
    const li = document.createElement('li');
    li.className = 'server-member-row';
    li.dataset.username = m.username.toLowerCase();
    li.classList.toggle('offline', !m.online);
    const main = document.createElement('div');
    main.className = 'dm-row-main';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = m.username;
    const preview = document.createElement('span');
    preview.className = 'preview';
    preview.textContent = serverRoleLabel(m.role);
    main.append(name, preview);
    const presence = document.createElement('span');
    presence.className = `server-member-presence${m.online ? ' online' : ''}`;
    presence.title = m.online ? 'Çevrimiçi' : 'Çevrimdışı';
    const actions = document.createElement('div');
    actions.className = 'server-member-actions';
    li.append(profileAvatars.image(m.username), presence, main, actions);
    li.addEventListener('mouseenter', () => showMemberHoverCard(li, m.username));
    li.addEventListener('mouseleave', hideMemberHoverCard);

    if (isOwner && m.role !== 'owner') {
      const roleBtn = document.createElement('button');
      roleBtn.className = 'btn btn-ghost';
      roleBtn.textContent = m.role === 'moderator' ? '[ ÜYE YAP ]' : '[ MODERATÖR YAP ]';
      roleBtn.onclick = () => setServerMemberRole(d.id, m.username, m.role === 'moderator' ? 'member' : 'moderator');
      actions.append(roleBtn);
    }

    const canRemove = m.role !== 'owner' && (isOwner || (isMod && m.role === 'member')) && m.username.toLowerCase() !== myUsername;
    if (canRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-ghost';
      removeBtn.textContent = '[ ÇIKAR ]';
      removeBtn.onclick = () => removeServerMember(d.id, m.username);
      actions.append(removeBtn);

      const banBtn = document.createElement('button');
      banBtn.className = 'btn btn-ghost';
      banBtn.textContent = '[ YASAKLA ]';
      banBtn.onclick = () => banServerMember(d.id, m.username);
      actions.append(banBtn);
    }

    if (m.username.toLowerCase() !== myUsername) {
      const blockBtn = document.createElement('button');
      blockBtn.className = 'btn btn-ghost';
      blockBtn.textContent = '[ ENGELLE ]';
      blockBtn.onclick = () => blockUser(m.username);
      const reportBtn = document.createElement('button');
      reportBtn.className = 'btn btn-ghost';
      reportBtn.textContent = '[ ŞİKÂYET ]';
      reportBtn.onclick = () => reportUser(m.username, d.id);
      actions.append(blockBtn, reportBtn);
    }

    return li;
  }
}

function appendChannelManagementActions(row, channel, channels) {
  const actions = document.createElement('span');
  actions.className = 'channel-management-actions';
  const renameBtn = document.createElement('button');
  renameBtn.className = 'btn btn-ghost';
  renameBtn.textContent = '[ AD ]';
  renameBtn.onclick = (event) => {
    event.stopPropagation();
    renameServerChannel(channel.id, channel.name);
  };
  const index = channels.findIndex((item) => item.id === channel.id);
  const upBtn = document.createElement('button');
  upBtn.className = 'btn btn-ghost';
  upBtn.textContent = '[ ↑ ]';
  upBtn.disabled = index <= 0;
  upBtn.onclick = (event) => { event.stopPropagation(); moveServerChannel(channel.id, -1); };
  const downBtn = document.createElement('button');
  downBtn.className = 'btn btn-ghost';
  downBtn.textContent = '[ ↓ ]';
  downBtn.disabled = index < 0 || index >= channels.length - 1;
  downBtn.onclick = (event) => { event.stopPropagation(); moveServerChannel(channel.id, 1); };
  actions.append(renameBtn, upBtn, downBtn);
  row.append(actions);
}

function updateCommunityMemberPresence({ serverId, username, online }) {
  if (!activeServerDetail || activeServerDetail.id !== Number(serverId) || typeof username !== 'string') return;
  const member = activeServerDetail.members.find((item) => item.username.toLowerCase() === username.toLowerCase());
  if (member) member.online = !!online;
  const row = [...serverMembersList.children].find((item) => item.dataset.username === username.toLowerCase());
  if (!row) return;
  row.classList.toggle('offline', !online);
  const presence = row.querySelector('.server-member-presence');
  if (presence) {
    presence.classList.toggle('online', !!online);
    presence.title = online ? 'Çevrimiçi' : 'Çevrimdışı';
  }
}

function updateCommunityMemberGameStatus({ serverId, username, game, gameSince }) {
  if (!activeServerDetail || activeServerDetail.id !== Number(serverId) || typeof username !== 'string') return;
  const member = activeServerDetail.members.find((item) => item.username.toLowerCase() === username.toLowerCase());
  if (member) {
    member.game = game || null;
    member.gameSince = gameSince || null;
  }
}

function updateServerChannelCount({ serverId, channelId, memberCount, members }) {
  if (!activeServerDetail || activeServerDetail.id !== Number(serverId)) return;
  const channel = activeServerDetail.channels.find((item) => item.id === Number(channelId));
  if (channel) {
    channel.memberCount = Number(memberCount) || 0;
    channel.members = members || [];
  }
  const row = serverVoiceChannelsList.querySelector(`[data-channel-id="${Number(channelId)}"]`);
  if (!row) return;
  const preview = row.querySelector('.preview');
  if (preview) preview.textContent = `${Number(memberCount) || 0} kişi`;
  renderVoiceChannelMembers(row, members);
  row.classList.remove('count-updated');
  requestAnimationFrame(() => row.classList.add('count-updated'));
  setTimeout(() => row.classList.remove('count-updated'), 500);
}

async function createServerChannel() {
  const name = createChannelNameInput.value.trim();
  if (!name || !activeServerDetail) return;
  const type = createChannelTypeSelect.value === 'voice' ? 'voice' : 'text';
  try {
    await apiRequest(`/api/servers/${activeServerDetail.id}/channels`, { name, type });
    createChannelNameInput.value = '';
    // Sunucu, olusturulan kanali kanal olayi uzerinden (server-channel-created)
    // olusturana dahil tum uyelere yayinlar; listeyi burada elle guncellemiyoruz.
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function deleteServerChannel(serverId, channelId) {
  try {
    await apiDelete(`/api/servers/${serverId}/channels/${channelId}`);
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function renameServerChannel(channelId, currentName) {
  if (!activeServerDetail) return;
  const name = prompt('Yeni kanal adı:', currentName);
  if (name === null || name.trim() === currentName) return;
  try {
    await apiRequest(`/api/servers/${activeServerDetail.id}/channels/${channelId}/rename`, { name: name.trim() });
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function moveServerChannel(channelId, direction) {
  if (!activeServerDetail) return;
  const ids = activeServerDetail.channels.map((channel) => channel.id);
  const index = ids.indexOf(channelId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  try {
    await apiRequest(`/api/servers/${activeServerDetail.id}/channels/reorder`, { channelIds: ids });
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function saveServerSettings() {
  if (!activeServerDetail) return;
  try {
    await apiRequest(`/api/servers/${activeServerDetail.id}/settings`, {
      name: serverRenameInput.value.trim(),
      iconId: serverIconSelect.value,
    });
    showToast('topluluk ayarları kaydedildi', 'ok', 2500);
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function transferServerOwnership() {
  if (!activeServerDetail || !serverTransferSelect.value) return;
  const username = serverTransferSelect.value;
  if (!confirm(`Topluluk sahipliğini ${username} kullanıcısına devretmek istediğine emin misin?`)) return;
  try {
    await apiRequest(`/api/servers/${activeServerDetail.id}/transfer`, { username });
    showToast('topluluk sahipliği devredildi', 'ok', 3000);
    await openServerDetail(activeServerDetail.id);
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function banServerMember(serverId, username) {
  const reason = prompt(`${username} için yasaklama nedeni (isteğe bağlı):`, '');
  if (reason === null) return;
  if (!confirm(`${username} topluluktan çıkarılacak ve yeniden katılamayacak. Devam edilsin mi?`)) return;
  try {
    await apiRequest(`/api/servers/${serverId}/members/${encodeURIComponent(username)}/ban`, { reason });
    await openServerDetail(serverId);
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function loadServerBans() {
  if (!activeServerDetail) return;
  const { token } = getSession();
  try {
    const res = await fetch(`${getServerUrl()}/api/servers/${activeServerDetail.id}/bans`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'yasaklılar alınamadı');
    serverManagementList.replaceChildren();
    if (data.bans.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'Yasaklanmış kullanıcı yok.';
      serverManagementList.appendChild(item);
      return;
    }
    for (const ban of data.bans) {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = `${ban.username} · ${ban.reason || 'neden belirtilmedi'} · ${ban.bannedBy}`;
      const button = document.createElement('button');
      button.className = 'btn btn-ghost';
      button.textContent = '[ YASAĞI KALDIR ]';
      button.onclick = async () => {
        await apiDelete(`/api/servers/${activeServerDetail.id}/bans/${encodeURIComponent(ban.username)}`);
        loadServerBans();
      };
      item.append(text, button);
      serverManagementList.appendChild(item);
    }
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function loadServerAuditLog() {
  if (!activeServerDetail) return;
  const { token } = getSession();
  try {
    const res = await fetch(`${getServerUrl()}/api/servers/${activeServerDetail.id}/audit-log`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'yönetim günlüğü alınamadı');
    serverManagementList.replaceChildren();
    for (const entry of data.entries) {
      const item = document.createElement('li');
      const time = new Date(entry.created_at).toLocaleString('tr-TR');
      item.textContent = `${time} · ${entry.actor} · ${entry.action}${entry.target ? ` · ${entry.target}` : ''}`;
      serverManagementList.appendChild(item);
    }
    if (!data.entries.length) {
      const item = document.createElement('li');
      item.textContent = 'Henüz yönetim kaydı yok.';
      serverManagementList.appendChild(item);
    }
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function blockUser(username) {
  if (!confirm(`${username} engellensin mi? Arkadaşlığınız varsa kaldırılacak.`)) return;
  try {
    await apiRequest(`/api/blocks/${encodeURIComponent(username)}`, {});
    showToast(`${username} engellendi`, 'ok', 2500);
    loadFriends();
    loadBlockedUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function reportUser(username, serverId = null) {
  const reason = prompt(`${username} kullanıcısını neden şikâyet ediyorsun?`, '');
  if (reason === null || !reason.trim()) return;
  try {
    await apiRequest('/api/reports', { username, serverId, reason: reason.trim() });
    showToast('şikâyet yöneticiye gönderildi', 'ok', 2500);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadBlockedUsers() {
  const { token } = getSession();
  try {
    const res = await fetch(`${getServerUrl()}/api/blocks`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) return;
    blockedUsersList.replaceChildren();
    blockedUsersEmpty.classList.toggle('hidden', data.users.length > 0);
    for (const user of data.users) {
      const item = document.createElement('li');
      item.className = 'friend-row';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = user.username;
      const button = document.createElement('button');
      button.className = 'btn btn-ghost';
      button.textContent = '[ ENGELİ KALDIR ]';
      button.onclick = async () => {
        await apiDelete(`/api/blocks/${encodeURIComponent(user.username)}`);
        loadBlockedUsers();
      };
      item.append(profileAvatars.image(user.username, user.avatarId), name, button);
      blockedUsersList.appendChild(item);
    }
  } catch {
    // Ayarlar ekraninin geri kalanini engelleme.
  }
}

async function regenerateServerInvite() {
  if (!activeServerDetail) return;
  try {
    const data = await apiRequest(`/api/servers/${activeServerDetail.id}/invite/regenerate`, {});
    activeServerDetail.inviteCode = data.inviteCode;
    serverInviteCodeEl.textContent = data.inviteCode;
    showToast('davet kodu yenilendi', 'ok', 2500);
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

function copyServerInvite() {
  if (!activeServerDetail?.inviteCode) return;
  if (window.api) window.api.copyToClipboard(activeServerDetail.inviteCode);
  showToast('davet kodu panoya kopyalandı', 'ok', 2500);
}

async function setServerMemberRole(serverId, username, role) {
  try {
    await apiRequest(`/api/servers/${serverId}/members/${encodeURIComponent(username)}/role`, { role });
    await openServerDetail(serverId);
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function removeServerMember(serverId, username) {
  try {
    await apiRequest(`/api/servers/${serverId}/members/${encodeURIComponent(username)}/remove`, {});
    await openServerDetail(serverId);
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function leaveServer() {
  if (!activeServerDetail) return;
  try {
    await apiRequest(`/api/servers/${activeServerDetail.id}/leave`, {});
    showToast('topluluktan ayrıldın', 'ok', 2500);
    closeServerDetail();
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

async function deleteServer() {
  if (!activeServerDetail) return;
  if (!confirm(`"${activeServerDetail.name}" topluluğunu kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.`)) return;
  try {
    await apiDelete(`/api/servers/${activeServerDetail.id}`);
    showToast('topluluk silindi', 'ok', 3000);
    closeServerDetail();
  } catch (err) {
    setServerDetailStatus(err.message, 'error');
  }
}

// ---- sunucu sesli kanallarina katilim ----
// Ayni WebRTC/sohbet altyapisini (oda 'room' tipiyle) paylasir; sunucu
// tarafinda 'server-channel' tipiyle ayirt edilir ve uyelik sunucuda
// dogrulanir (istemciden gelen hicbir yetki iddiasina guvenilmez).

function joinServerVoiceChannel(serverId, channelId, channelName) {
  if (joining) return;
  if (currentRoomCode) {
    pendingRoomSwitch = { type: 'server-channel', serverId, channelId, channelName };
    switchRoomText.textContent = `Mevcut görüşmeden ayrılıp "${channelName}" kanalına katılacaksın.`;
    switchRoomBanner.classList.remove('hidden');
    return;
  }
  performJoinServerVoiceChannel(serverId, channelId, channelName);
}

async function performJoinServerVoiceChannel(serverId, channelId, channelName) {
  if (joining) return;
  joining = true;
  const stream = await acquireMicStream();
  if (!stream) {
    joining = false;
    return;
  }

  teardownCurrentRoomState();
  resetChat();
  localStream = stream;
  muted = false;

  const ack = await emitWithTimeout('join-server-channel', { channelId });
  if (!ack || ack.error) {
    showToast(ack?.error || 'kanala katılınamadı', 'error');
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    joining = false;
    return;
  }

  currentRoomCode = ack.roomCode;
  currentChannelServerId = serverId;
  currentChannelDisplayName = channelName;
  const myUsername = getSession().username.toLowerCase();
  const myMembership =
    activeServerDetail && activeServerDetail.id === serverId
      ? activeServerDetail.members.find((m) => m.username.toLowerCase() === myUsername)
      : null;
  currentServerChannelRole = myMembership ? myMembership.role : null;
  currentRoomIsOwner = false;

  updateDirectCallUI('server-channel', channelName);
  roomAccessSection.classList.add('hidden');
  // Ekran degismez: kanal barinin altinda kendi profilin gorunur (ses
  // kanali listesi 'server-channel-count' ile zaten kendini de icerir),
  // tam oda ekranina "ODAYA DÖN" ile istege bagli gecilir.
  updateActiveCallBar();
  if (activeServerDetail && activeServerDetail.id === serverId) renderServerDetail();
  renderParticipants();
  applyChatHistory(ack.chatHistory);
  applyMicMode();

  for (const peer of ack.existingPeers) {
    addParticipant(peer.id, peer.displayName, peer.avatarId);
    await callPeer(peer.id);
  }

  joining = false;
}

// ---- topluluk metin kanallari ----
// Ses kanallarinin aksine bir Socket.IO odasina katilim gerekmez: mesajlar
// toplulugun tum cevrimici uyelerine yayinlanir (server-channel-created vb.
// olaylarla ayni desen), istemci mesaji acik kanaldaysa sohbete ekler,
// degilse yalnizca rozeti/bildirim durumunu gunceller.

let latestServersList = [];

function showServerChannelsView() {
  serverChannelsView.classList.remove('hidden');
  serverTextChannelView.classList.add('hidden');
}

function closeTextChannel() {
  currentTextChannel = null;
  textChannelMessages = [];
  seenServerMessageIds.clear();
  textChannelAutoScroll = true;
  textChannelHasMoreHistory = true;
  for (const row of serverTextChannelsList.children) {
    row.classList.remove('active');
  }
  showServerChannelsView();
}

function bumpServerUnreadLocally(serverId, delta) {
  const entry = latestServersList.find((s) => s.id === serverId);
  if (!entry) return;
  entry.unreadCount = Math.max(0, (entry.unreadCount || 0) + delta);
  renderServersList(latestServersList);
}

function bumpChannelUnreadLocally(serverId, channelId) {
  bumpServerUnreadLocally(serverId, 1);
  if (activeServerDetail && activeServerDetail.id === serverId) {
    const channel = activeServerDetail.channels.find((c) => c.id === channelId);
    if (channel) channel.unreadCount = (channel.unreadCount || 0) + 1;
    renderServerDetail();
  }
}

async function markTextChannelRead() {
  if (!currentTextChannel) return;
  const { serverId, channelId } = currentTextChannel;
  const channel = activeServerDetail?.id === serverId ? activeServerDetail.channels.find((c) => c.id === channelId) : null;
  const hadUnread = channel ? channel.unreadCount || 0 : 0;
  if (channel) {
    channel.unreadCount = 0;
    renderServerDetail();
  }
  if (hadUnread > 0) bumpServerUnreadLocally(serverId, -hadUnread);

  try {
    await fetch(`${getServerUrl()}/api/servers/${serverId}/channels/${channelId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getSession().token}` },
    });
  } catch {
    // sessizce yoksay; bir sonraki acilista sunucu tarafi zaten guncel kalir
  }
}

// Gelen/gecmis mesajlari clientMessageId/id bazli tekillestirerek listeye
// ekler ve zaman damgasina gore sirali tutar; var olan mesajlari (ornegin
// aninda gelen bir soket mesaji) gecmis yuklemesiyle asla ezmez.
function ingestTextChannelMessages(messages, { prepend = false } = {}) {
  const additions = [];
  const myUsername = getSession().username;
  for (const m of messages) {
    if (seenServerMessageIds.has(m.id)) continue;
    seenServerMessageIds.add(m.id);
    additions.push({ ...m, own: m.from === myUsername });
  }
  if (additions.length === 0) return additions;
  textChannelMessages = prepend ? [...additions, ...textChannelMessages] : [...textChannelMessages, ...additions];
  textChannelMessages.sort((a, b) => a.ts - b.ts);
  return additions;
}

async function loadTextChannelMessages({ older = false } = {}) {
  if (!currentTextChannel) return false;
  const { serverId, channelId } = currentTextChannel;
  const { token } = getSession();
  let url = `${getServerUrl()}/api/servers/${serverId}/channels/${channelId}/messages`;
  if (older && textChannelMessages.length > 0) {
    url += `?before=${textChannelMessages[0].ts}`;
  }
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'mesajlar alınamadı');
    if (!currentTextChannel || currentTextChannel.channelId !== channelId) return false;
    const incoming = data.messages || [];
    if (older && incoming.length < 50) textChannelHasMoreHistory = false;
    ingestTextChannelMessages(incoming, { prepend: older });
    renderTextChannelLog({ preserveScroll: older });
    return true;
  } catch (err) {
    if (older) {
      showToast(err.message || 'eski mesajlar alınamadı', 'error');
    } else {
      textChannelLoadState.className = 'community-detail-state error';
      textChannelLoadMessage.textContent = err.message || 'Mesajlar yüklenemedi.';
      textChannelRetryBtn.classList.remove('hidden');
    }
    return false;
  }
}

async function openTextChannel(serverId, channelId, channelName) {
  currentTextChannel = { serverId, channelId, name: channelName };
  textChannelMessages = [];
  seenServerMessageIds.clear();
  textChannelAutoScroll = true;
  textChannelHasMoreHistory = true;
  textChannelNameEl.textContent = channelName;
  serverChannelsView.classList.add('hidden');
  serverTextChannelView.classList.remove('hidden');
  for (const row of serverTextChannelsList.children) {
    row.classList.toggle('active', row.dataset.channelId === String(channelId));
  }
  renderTextChannelLog();

  textChannelLoadState.className = 'community-detail-state';
  textChannelLoadMessage.textContent = 'Mesajlar yükleniyor...';
  textChannelRetryBtn.classList.add('hidden');
  textChannelLoadState.classList.remove('hidden');
  textChannelLogEl.classList.add('hidden');
  textChannelEmptyEl.classList.add('hidden');

  const ok = await loadTextChannelMessages();
  if (!currentTextChannel || currentTextChannel.channelId !== channelId) return;
  if (ok) {
    textChannelLoadState.classList.add('hidden');
    textChannelLogEl.classList.remove('hidden');
    // Gecmis, gunluk hala gizliyken cizildi (scrollHeight/clientHeight o an
    // 0'di), bu yuzden asagi kaydirma sessizce etkisizdi; simdi gorunur
    // oldugu icin tekrar uyguluyoruz.
    if (textChannelAutoScroll) scrollTextChannelToBottom();
    markTextChannelRead();
  }
}

async function openServerAndTextChannel(serverId, channelId) {
  if (!activeServerDetail || activeServerDetail.id !== serverId) {
    await openServerDetail(serverId);
  }
  const channel = activeServerDetail?.id === serverId ? activeServerDetail.channels.find((c) => c.id === channelId) : null;
  if (channel && channel.type === 'text') openTextChannel(serverId, channelId, channel.name);
}

function canDeleteTextMessage(m) {
  if (m.own) return true;
  if (!activeServerDetail || !currentTextChannel || activeServerDetail.id !== currentTextChannel.serverId) return false;
  return activeServerDetail.role === 'owner' || activeServerDetail.role === 'moderator';
}

function scrollTextChannelToBottom() {
  textChannelLogEl.scrollTop = textChannelLogEl.scrollHeight;
  textChannelScrollBtn.classList.add('hidden');
}

function renderTextChannelLog({ preserveScroll = false } = {}) {
  const prevHeight = textChannelLogEl.scrollHeight;
  const prevScrollTop = textChannelLogEl.scrollTop;

  textChannelLogEl.innerHTML = '';
  textChannelEmptyEl.classList.toggle('hidden', textChannelMessages.length > 0);

  for (const m of textChannelMessages) {
    const div = document.createElement('div');
    div.className = `chat-message ${m.own ? 'own' : ''} ${m.pending ? 'pending' : ''} ${m.failed ? 'failed' : ''}`.trim();
    div.dataset.messageId = m.id;

    const meta = document.createElement('div');
    meta.className = 'meta';
    let metaText = `${m.from} · ${formatChatTime(m.ts)}`;
    if (m.pending) metaText += ' · gönderiliyor...';
    if (m.failed) metaText += ' · başarısız';
    meta.textContent = metaText;
    meta.prepend(profileAvatars.image(m.from, m.avatarId));

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
        renderTextChannelLog();
        sendTextChannelMessageWithRetry(m);
      };
      div.appendChild(retryBtn);
    } else if (!m.pending && canDeleteTextMessage(m)) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost retry-btn';
      delBtn.textContent = '[ SİL ]';
      delBtn.onclick = () => deleteTextChannelMessage(m.id);
      div.appendChild(delBtn);
    }

    textChannelLogEl.appendChild(div);
  }

  if (preserveScroll) {
    textChannelLogEl.scrollTop = textChannelLogEl.scrollHeight - prevHeight + prevScrollTop;
  } else if (textChannelAutoScroll) {
    scrollTextChannelToBottom();
  } else {
    textChannelScrollBtn.classList.toggle('hidden', textChannelMessages.length === 0);
  }
}

function autoResizeTextChannelInput() {
  textChannelInput.style.height = 'auto';
  textChannelInput.style.height = `${Math.min(textChannelInput.scrollHeight, 90)}px`;
}

function sendTextChannelMessageWithRetry(localMsg) {
  if (!socket || !socket.connected || !currentTextChannel) {
    localMsg.pending = false;
    localMsg.failed = true;
    renderTextChannelLog();
    return;
  }
  socket.emit(
    'send-server-message',
    { channelId: currentTextChannel.channelId, text: localMsg.text, clientMessageId: localMsg.clientMessageId },
    (ack) => {
      const idx = textChannelMessages.findIndex((m) => m.clientMessageId === localMsg.clientMessageId);
      if (idx === -1) return;
      if (ack && ack.ok && ack.message) {
        seenServerMessageIds.add(ack.message.id);
        textChannelMessages[idx] = { ...ack.message, own: true, clientMessageId: localMsg.clientMessageId };
      } else {
        textChannelMessages[idx].pending = false;
        textChannelMessages[idx].failed = true;
        if (ack && ack.error) showToast(ack.error, 'error');
      }
      renderTextChannelLog();
    }
  );
}

function sendTextChannelMessage() {
  const text = textChannelInput.value;
  if (!text.trim() || !currentTextChannel) return;
  if (text.length > 2000) {
    showToast('mesaj çok uzun (en fazla 2000 karakter)', 'error');
    return;
  }
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
  textChannelMessages.push(localMsg);
  textChannelAutoScroll = true;
  renderTextChannelLog();

  textChannelInput.value = '';
  autoResizeTextChannelInput();

  sendTextChannelMessageWithRetry(localMsg);
}

async function deleteTextChannelMessage(messageId) {
  const ack = await emitWithTimeout('delete-server-message', { messageId });
  if (!ack || ack.error) {
    showToast(ack?.error || 'mesaj silinemedi', 'error');
    return;
  }
  textChannelMessages = textChannelMessages.filter((m) => m.id !== messageId);
  renderTextChannelLog();
}

// Acik olmayan bir kanala mesaj gelince rozetleri gunceller ve (kanal
// ekranindayken degilse) mevcut bildirim ayarlarina uyarak sistem bildirimi
// gosterir; kullanici zaten o kanali izliyorsa gereksiz bildirim gosterilmez.
function handleIncomingServerTextMessage(message) {
  const isOpenChannel = currentTextChannel && currentTextChannel.channelId === message.channelId;
  if (isOpenChannel) {
    const wasNearBottom = textChannelLogEl.scrollTop + textChannelLogEl.clientHeight >= textChannelLogEl.scrollHeight - 40;
    const added = ingestTextChannelMessages([message]);
    if (added.length > 0) {
      textChannelAutoScroll = textChannelAutoScroll || wasNearBottom;
      renderTextChannelLog();
      markTextChannelRead();
    }
    return;
  }

  bumpChannelUnreadLocally(message.serverId, message.channelId);

  if (message.from === getSession().username) return;
  const settings = getSettings();
  if (window.api && settings.notifyChatMessage) {
    const channelName =
      (activeServerDetail?.id === message.serverId && activeServerDetail.channels.find((c) => c.id === message.channelId)?.name) ||
      'kanal';
    window.api.notifyCommunityMessage({
      serverId: message.serverId,
      channelId: message.channelId,
      channelName,
      fromUsername: message.from,
      text: message.text,
      showContent: settings.notifyChatContent,
    });
  }
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

// socket.emit + ack cevabini zaman asimiyla bekler; sunucu hic yanit
// vermezse (baglanti sorunu vb.) 'joining' kilidinde sonsuza kadar takili
// kalmayi engeller.
function emitWithTimeout(event, payload, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!socket) return resolve({ error: 'baglanti yok' });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ error: 'zaman aşımı, tekrar dene' });
    }, timeoutMs);
    socket.emit(event, payload, (ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function joinRoomAck(roomCode) {
  return emitWithTimeout('join-room', { roomCode });
}

// Onceki oda/mikrofon durumunu (varsa) guvenli bicimde temizler: sunucuya
// ayrilma bildirir, WebRTC baglantilarini/ses elemanlarini kapatir ve eski
// mikrofon akisini durdurur. Boylece oda degistirirken hayalet katilimci
// veya acik kalan mikrofon birakmaz.
function teardownCurrentRoomState() {
  if (socket && currentRoomCode) socket.emit('leave-room');
  cleanupAllPeers();
  stopVoiceActivation();
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  currentRoomCode = null;
  currentRoomIsOwner = false;
  currentChannelServerId = null;
  currentChannelDisplayName = null;
  currentServerChannelRole = null;
  updateActiveCallBar();
}

function updateRoomAccessUI(isOwner, access) {
  currentRoomIsOwner = !!isOwner;
  roomAccessSection.classList.toggle('hidden', !currentRoomIsOwner);
  if (currentRoomIsOwner) {
    roomAccessRadios.forEach((r) => {
      r.checked = r.value === access;
    });
  }
}

async function enterRoom(roomCode, stream) {
  teardownCurrentRoomState();
  resetChat();
  localStream = stream;
  muted = false;

  const result = await joinRoomAck(roomCode);
  if (!result || result.error) {
    showToast(result?.error || 'odaya katılınamadı', 'error');
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    joining = false;
    return false;
  }

  currentRoomCode = roomCode;
  roomCodeDisplay.textContent = roomCode;
  updateDirectCallUI(result.roomType);
  showScreen(roomScreen);
  renderParticipants();
  applyChatHistory(result.chatHistory);
  updateRoomAccessUI(result.isOwner, result.access);
  applyMicMode();

  for (const peer of result.existingPeers) {
    addParticipant(peer.id, peer.displayName, peer.avatarId);
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
  const selected = document.querySelector('input[name="create-room-access"]:checked');
  const access = selected && selected.value === 'friends' ? 'friends' : 'invite';
  const ack = await emitWithTimeout('create-room', { access });
  if (!ack || !ack.roomCode) {
    showToast(ack?.error || 'oda oluşturulamadı', 'error');
    joining = false;
    return;
  }
  joining = false;
  await joinRoomWithCode(ack.roomCode);
}

// ---- arkadas odasina onaysiz katilim ----

function joinFriendRoom(targetUsername) {
  if (joining) return;
  if (currentRoomCode) {
    pendingRoomSwitch = targetUsername;
    switchRoomText.textContent = `Mevcut görüşmeden ayrılıp ${targetUsername} kullanıcısının odasına katılacaksın.`;
    switchRoomBanner.classList.remove('hidden');
    return;
  }
  performJoinFriendRoom(targetUsername);
}

async function performJoinFriendRoom(targetUsername) {
  if (joining) return;
  joining = true;
  setFriendRowsBusy(true);

  const ack = await emitWithTimeout('join-friend-room', { targetUsername });
  if (!ack || ack.error) {
    showToast(ack?.error || 'odaya katılınamadı', 'error');
    joining = false;
    setFriendRowsBusy(false);
    return;
  }

  joining = false;
  const roomCode = ack.roomCode;
  const stream = await acquireMicStream();
  if (!stream) {
    setFriendRowsBusy(false);
    return;
  }
  await enterRoom(roomCode, stream);
  setFriendRowsBusy(false);
}

function setFriendRowsBusy(busy) {
  friendsListEl.querySelectorAll('button').forEach((btn) => {
    btn.disabled = busy || btn.disabled;
  });
  if (!busy) loadFriends();
}

function fullyLeaveRoom() {
  teardownCurrentRoomState();
  resetChat();
  if (window.api) window.api.unregisterPttShortcut();
}

function leaveRoom() {
  const wasServerId = currentRoomType === 'server-channel' ? currentChannelServerId : null;
  fullyLeaveRoom();
  showScreen(joinScreen);
  if (wasServerId) {
    showTab('servers');
    openServerDetail(wasServerId);
  }
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
    // Sunucu oyun durumunu baglanti omru boyunca tutar (kalici degil);
    // yeniden baglanildiginda bilinen son durumu tekrar gonderiyoruz.
    if (myCurrentGame && getSettings().gameDetectionEnabled) {
      socket.emit('set-game-status', { game: myCurrentGame });
    }
  });

  socket.on('authenticated', ({ username, avatarId, bannerId }) => {
    profileAvatars.setAccount(username, avatarId);
    profileBanners.setAccount(username, bannerId);
    loadFriends();
    loadOwnStatusMessage();
    loadDmConversations();
  });
  socket.on('profile-updated', ({ username, avatarId, bannerId }) => {
    if (avatarId) profileAvatars.remember(username, avatarId);
    if (bannerId !== undefined) profileBanners.remember(username, bannerId);
  });

  socket.on('disconnect', () => {
    if (currentRoomCode) {
      showToast('sunucu bağlantısı koptu, yeniden bağlanılıyor...', 'error', 0);
    }
    if (pendingIncomingCall) hideIncomingCall();
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
  socket.on('friend-game-status', ({ username, game }) => setFriendGame(username, game));
  socket.on('friend-status-message', ({ username, statusMessage }) => setFriendStatusMessage(username, statusMessage));
  socket.on('friend-request', ({ fromUsername } = {}) => {
    loadFriends();
    if (fromUsername && window.api && getSettings().notifyFriendRequest) {
      window.api.notifyFriendRequest({ fromUsername });
    }
  });
  socket.on('friend-accepted', () => loadFriends());
  socket.on('friend-room-status', () => loadFriends());

  socket.on('incoming-call', ({ fromUsername, roomCode }) => {
    if (pendingIncomingCall || currentRoomCode) {
      socket.emit('call-response', { roomCode, accepted: false });
      return;
    }
    showIncomingCall(fromUsername, roomCode);
    if (window.api && getSettings().notifyIncomingCall) {
      window.api.notifyIncomingCall({ fromUsername, roomCode });
    }
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
      showToast('Arama sona erdi.', 'info');
      hideIncomingCall();
    }
  });

  socket.on('peer-joined', ({ id, displayName, avatarId }) => {
    addParticipant(id, displayName, avatarId);
  });

  socket.on('signal', handleSignal);

  socket.on('peer-left', ({ id }) => {
    cleanupPeer(id);
    if (currentRoomType === 'call' && currentRoomCode) {
      leaveRoom();
      showToast('Karşı taraf görüşmeden ayrıldı.', 'info');
    }
  });

  socket.on('kicked-from-room', ({ roomCode } = {}) => {
    if (currentRoomCode && currentRoomCode === roomCode) {
      const wasServerChannel = currentRoomType === 'server-channel';
      leaveRoom();
      showToast(wasServerChannel ? 'Kanaldan çıkarıldın.' : 'Oda sahibi tarafından odadan çıkarıldın.', 'error');
    }
  });

  socket.on('server-channel-created', ({ serverId, channel }) => {
    if (activeServerDetail && activeServerDetail.id === serverId) {
      activeServerDetail.channels.push(channel);
      renderServerDetail();
    }
  });

  socket.on('server-channel-deleted', ({ serverId, channelId }) => {
    if (activeServerDetail && activeServerDetail.id === serverId) {
      activeServerDetail.channels = activeServerDetail.channels.filter((c) => c.id !== channelId);
      renderServerDetail();
    }
    if (currentTextChannel && currentTextChannel.channelId === channelId) {
      closeTextChannel();
      showToast('bu kanal silindi', 'info', 3000);
    }
  });

  socket.on('server-text-message', handleIncomingServerTextMessage);

  socket.on('server-message-deleted', ({ channelId, messageId }) => {
    if (currentTextChannel && currentTextChannel.channelId === channelId) {
      textChannelMessages = textChannelMessages.filter((m) => m.id !== messageId);
      renderTextChannelLog();
    }
  });

  socket.on('server-member-presence', updateCommunityMemberPresence);
  socket.on('server-member-game-status', updateCommunityMemberGameStatus);
  socket.on('server-channel-count', updateServerChannelCount);
  socket.on('server-updated', ({ serverId, name, iconId }) => {
    if (activeServerDetail && activeServerDetail.id === Number(serverId)) {
      activeServerDetail.name = name;
      activeServerDetail.iconId = iconId;
      renderServerDetail();
    }
    loadServersList();
  });
  socket.on('server-channel-updated', ({ serverId, channelId, name }) => {
    if (!activeServerDetail || activeServerDetail.id !== Number(serverId)) return;
    const channel = activeServerDetail.channels.find((item) => item.id === Number(channelId));
    if (channel) channel.name = name;
    if (currentTextChannel?.channelId === Number(channelId)) {
      currentTextChannel.name = name;
      textChannelNameEl.textContent = `# ${name}`;
    }
    renderServerDetail();
  });
  socket.on('server-channels-reordered', ({ serverId, channelIds }) => {
    if (!activeServerDetail || activeServerDetail.id !== Number(serverId)) return;
    const positions = new Map(channelIds.map((id, index) => [Number(id), index]));
    activeServerDetail.channels.sort((a, b) => positions.get(a.id) - positions.get(b.id));
    renderServerDetail();
  });
  socket.on('server-members-updated', ({ serverId }) => {
    if (activeServerDetail && activeServerDetail.id === Number(serverId)) openServerDetail(serverId);
  });
  socket.on('server-owner-transferred', ({ serverId }) => {
    if (activeServerDetail && activeServerDetail.id === Number(serverId)) openServerDetail(serverId);
    loadServersList();
  });
  socket.on('friend-removed', () => loadFriends());

  socket.on('server-role-changed', ({ serverId, role }) => {
    showToast(`bir topluluktaki rolün değişti: ${serverRoleLabel(role)}`, 'info', 4000);
    if (currentChannelServerId === serverId) currentServerChannelRole = role;
    if (activeServerDetail && activeServerDetail.id === serverId) openServerDetail(serverId);
  });

  socket.on('server-removed', ({ serverId }) => {
    showToast('bir topluluktan çıkarıldın', 'error', 4000);
    if (activeServerDetail && activeServerDetail.id === serverId) closeServerDetail();
    else loadServersList();
  });

  socket.on('chat-message', (message) => {
    if (seenChatMessageIds.has(message.id)) return;
    seenChatMessageIds.add(message.id);
    chatMessages.push({ ...message, own: false });
    trimChatMessages();
    renderChatLog();

    const settings = getSettings();
    if (window.api && settings.notifyChatMessage && currentRoomCode) {
      window.api.notifyChatMessage({
        roomCode: currentRoomCode,
        fromUsername: message.from,
        text: message.text,
        showContent: settings.notifyChatContent,
      });
    }
  });

  socket.on('dm-message', (message) => {
    if (seenDmMessageIds.has(message.id)) return;
    seenDmMessageIds.add(message.id);
    updateDmConversationPreview(message.from, message, false);

    if (currentDmUsername && currentDmUsername.toLowerCase() === message.from.toLowerCase()) {
      dmMessages.push({ ...message, own: false });
      dmAutoScroll = dmAutoScroll || dmLogEl.scrollTop + dmLogEl.clientHeight >= dmLogEl.scrollHeight - 40;
      renderDmLog();
      fetch(`${getServerUrl()}/api/dm/${encodeURIComponent(message.from)}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getSession().token}` },
      }).catch(() => {});
      const conv = findDmConversation(message.from);
      if (conv) conv.unreadCount = 0;
      updateDmTabBadge();
      return;
    }

    const settings = getSettings();
    if (window.api && settings.notifyDmMessage) {
      window.api.notifyDirectMessage({
        fromUsername: message.from,
        text: message.text,
        showContent: settings.notifyChatContent,
      });
    }
  });
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
    addParticipant(peer.id, peer.displayName, peer.avatarId);
    await callPeer(peer.id);
  }
}

function setFriendOnline(username, online) {
  const row = friendsListEl.querySelector(`[data-username="${username.toLowerCase()}"]`);
  if (row) {
    row.querySelector('.dot').classList.toggle('online', online);
    const callBtn = row.querySelector('.call-btn');
    if (callBtn) callBtn.disabled = !online || !!currentOutgoingCall;
  }

  const conv = findDmConversation(username);
  if (conv) {
    conv.online = online;
    if (!dmListView.classList.contains('hidden')) renderDmConversations();
  }
}

// ---- sifre degistirme ----

async function changePassword() {
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  if (!currentPassword || !newPassword) {
    passwordStatusEl.textContent = '[ERROR] mevcut ve yeni şifre gerekli';
    passwordStatusEl.className = 'status-line error';
    return;
  }
  try {
    await apiRequest('/api/profile/password', { currentPassword, newPassword });
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    passwordStatusEl.textContent = '[OK] şifre değiştirildi';
    passwordStatusEl.className = 'status-line ok';
  } catch (err) {
    passwordStatusEl.textContent = err.message;
    passwordStatusEl.className = 'status-line error';
  }
}

// ---- durum mesaji ----

async function loadOwnStatusMessage() {
  const { token } = getSession();
  try {
    const res = await fetch(`${getServerUrl()}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok) {
      statusMessageInput.value = data.statusMessage || '';
      applyVisibilityUI(data.visibility === 'invisible' ? 'invisible' : 'online');
    }
  } catch {
    // sessizce yoksay
  }
  if (myGameStatusEl) {
    myGameStatusEl.textContent = myCurrentGame ? `şu an oynuyorsun: ${myCurrentGame}` : '';
    myGameStatusEl.classList.toggle('hidden', !myCurrentGame);
  }
}

async function saveStatusMessage() {
  try {
    await apiRequest('/api/profile/status', { statusMessage: statusMessageInput.value });
    statusMessageStatusEl.textContent = '[OK] durum kaydedildi';
    statusMessageStatusEl.className = 'status-line ok';
  } catch (err) {
    statusMessageStatusEl.textContent = err.message;
    statusMessageStatusEl.className = 'status-line error';
  }
}

function applyVisibilityUI(visibility) {
  visibilityRadios.forEach((radio) => { radio.checked = radio.value === visibility; });
  railPresenceBtn.classList.toggle('invisible', visibility === 'invisible');
  railPresenceLabel.textContent = visibility === 'invisible' ? 'Çevrimdışı' : 'Aktif';
}

async function saveVisibility(visibility) {
  try {
    await apiRequest('/api/profile/visibility', { visibility });
    applyVisibilityUI(visibility);
    visibilityStatusEl.textContent = visibility === 'invisible' ? '[OK] çevrimdışı görüneceksin' : '[OK] aktif görüneceksin';
    visibilityStatusEl.className = 'status-line ok';
  } catch (err) {
    visibilityStatusEl.textContent = err.message;
    visibilityStatusEl.className = 'status-line error';
  }
}

// ---- yonetim paneli (yalnizca necr0n) ----

function formatAdminDate(iso) {
  try {
    return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('tr-TR');
  } catch {
    return iso;
  }
}

async function loadAdminUsers() {
  const { token } = getSession();
  adminStatusEl.textContent = '';
  try {
    const [usersRes, reportsRes] = await Promise.all([
      fetch(`${getServerUrl()}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${getServerUrl()}/api/admin/reports`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const data = await usersRes.json();
    if (!usersRes.ok) throw new Error(data.error || 'kullanıcılar alınamadı');
    renderAdminUsers(data.users);
    if (reportsRes.ok) renderAdminReports((await reportsRes.json()).reports);
  } catch (err) {
    adminStatusEl.textContent = `[ERROR] ${err.message}`;
    adminStatusEl.className = 'status-line error';
  }
}

function renderAdminReports(reports) {
  adminReportsList.replaceChildren();
  for (const report of reports) {
    const item = document.createElement('li');
    item.className = 'friend-row';
    const text = document.createElement('div');
    text.className = 'dm-row-main';
    const title = document.createElement('span');
    title.className = 'name';
    title.textContent = `${report.reporter} → ${report.reported}`;
    const detail = document.createElement('span');
    detail.className = 'preview';
    detail.textContent = `${report.reason}${report.server_id ? ` · topluluk ${report.server_id}` : ''}`;
    text.append(title, detail);
    const resolveBtn = document.createElement('button');
    resolveBtn.className = 'btn btn-ghost';
    resolveBtn.textContent = '[ ÇÖZÜLDÜ ]';
    resolveBtn.onclick = async () => {
      resolveBtn.disabled = true;
      try {
        await apiRequest(`/api/admin/reports/${report.id}/resolve`, { method: 'POST' });
        await loadAdminUsers();
      } catch (err) {
        adminStatusEl.textContent = `[ERROR] ${err.message}`;
        adminStatusEl.className = 'status-line error';
        resolveBtn.disabled = false;
      }
    };
    item.append(text, resolveBtn);
    adminReportsList.appendChild(item);
  }
  if (!reports.length) {
    const item = document.createElement('li');
    item.className = 'status-line';
    item.textContent = 'açık şikâyet yok';
    adminReportsList.appendChild(item);
  }
}

function renderAdminUsers(users) {
  adminUsersList.innerHTML = '';
  for (const u of users) {
    const li = document.createElement('li');
    li.className = 'friend-row admin-row';

    const row = document.createElement('div');
    row.className = 'admin-row-main';

    const dot = document.createElement('span');
    dot.className = `dot ${u.online ? 'online' : ''}`;

    const main = document.createElement('div');
    main.className = 'dm-row-main';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = u.username;
    const meta = document.createElement('span');
    meta.className = 'preview';
    meta.textContent = `${u.friendCount} arkadaş · ${formatAdminDate(u.createdAt)}`;
    main.append(nameSpan, meta);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-ghost';
    resetBtn.textContent = '[ ŞİFRE SIFIRLA ]';
    resetBtn.onclick = () => resetAdminUserPassword(u.username, li);

    row.append(dot, main, resetBtn);

    if (u.username.toLowerCase() !== getSession().username?.toLowerCase()) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-ghost';
      deleteBtn.textContent = '[ HESABI SİL ]';
      deleteBtn.onclick = () => deleteAdminUserAccount(u.username, li, deleteBtn);
      row.append(deleteBtn);
    }

    li.append(row);
    adminUsersList.appendChild(li);
  }
}

async function resetAdminUserPassword(username, rowEl) {
  const { token } = getSession();
  try {
    const res = await fetch(`${getServerUrl()}/api/admin/users/${encodeURIComponent(username)}/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'şifre sıfırlanamadı');

    let resultLine = rowEl.querySelector('.admin-reset-result');
    if (!resultLine) {
      resultLine = document.createElement('p');
      resultLine.className = 'status-line ok admin-reset-result';
      rowEl.appendChild(resultLine);
    }
    resultLine.textContent = `${username} için geçici şifre: ${data.tempPassword} (bunu kendisine ilet)`;
  } catch (err) {
    adminStatusEl.textContent = `[ERROR] ${err.message}`;
    adminStatusEl.className = 'status-line error';
  }
}

async function deleteAdminUserAccount(username, rowEl, btn) {
  if (
    !confirm(
      `"${username}" hesabını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz; kullanıcının arkadaşlıkları, mesajları ve topluluk üyelikleri de silinir.`
    )
  ) {
    return;
  }
  btn.disabled = true;
  try {
    const res = await fetch(`${getServerUrl()}/api/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getSession().token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'hesap silinemedi');
    rowEl.remove();
    adminStatusEl.textContent = `[OK] ${username} hesabı silindi`;
    adminStatusEl.className = 'status-line ok';
  } catch (err) {
    btn.disabled = false;
    adminStatusEl.textContent = `[ERROR] ${err.message}`;
    adminStatusEl.className = 'status-line error';
  }
}

// ---- olay dinleyicileri ----
// window.api dinleyicileri burada, uygulama omru boyunca yalnizca bir kez
// baglanir; connectSocket() oturum degisiminde/yeniden baglanmada tekrar
// tekrar cagrildigi icin dinleyiciler orada birikip cift bildirime yol acar.

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
  window.api.onNotificationFriendRequestClicked(() => {
    showScreen(joinScreen);
    showTab('friends');
  });
  window.api.onNotificationChatClicked(({ roomCode } = {}) => {
    if (roomCode && currentRoomCode === roomCode) showScreen(roomScreen);
  });
  window.api.onNotificationDmClicked(({ fromUsername } = {}) => {
    if (!fromUsername) return;
    showScreen(joinScreen);
    showTab('dm');
    openDmThread(fromUsername);
  });
  window.api.onNotificationCommunityClicked(({ serverId, channelId } = {}) => {
    if (!Number.isInteger(serverId) || !Number.isInteger(channelId)) return;
    showScreen(joinScreen);
    showTab('servers');
    openServerAndTextChannel(serverId, channelId);
  });
  window.api.onGameDetected(({ game } = {}) => {
    myCurrentGame = game || null;
    if (socket && socket.connected) socket.emit('set-game-status', { game: myCurrentGame });
    if (myGameStatusEl) {
      myGameStatusEl.textContent = myCurrentGame ? `şu an oynuyorsun: ${myCurrentGame}` : '';
      myGameStatusEl.classList.toggle('hidden', !myCurrentGame);
    }
  });
  window.api.onUpdateInstalling(() => {
    document.getElementById('update-overlay').classList.remove('hidden');
  });
}

loginBtn.addEventListener('click', () => authRequest('/api/login'));
registerBtn.addEventListener('click', () => authRequest('/api/register'));
logoutBtn.addEventListener('click', logout);
changePasswordBtn.addEventListener('click', changePassword);
adminRefreshBtn.addEventListener('click', loadAdminUsers);
saveStatusBtn.addEventListener('click', saveStatusMessage);
statusMessageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveStatusBtn.click();
});
visibilityRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) saveVisibility(radio.value);
  });
});
railPresenceBtn.addEventListener('click', () => {
  saveVisibility(railPresenceBtn.classList.contains('invisible') ? 'online' : 'invisible');
});
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

dmSendBtn.addEventListener('click', sendDmMessage);

dmInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendDmMessage();
  }
});

dmInput.addEventListener('input', autoResizeDmInput);

dmLogEl.addEventListener('scroll', () => {
  const threshold = 40;
  dmAutoScroll = dmLogEl.scrollTop + dmLogEl.clientHeight >= dmLogEl.scrollHeight - threshold;
  if (dmAutoScroll) dmScrollBtn.classList.add('hidden');
});

dmScrollBtn.addEventListener('click', () => {
  dmAutoScroll = true;
  scrollDmToBottom();
});

dmBackBtn.addEventListener('click', closeDmThread);

createServerBtn.addEventListener('click', createServer);
createServerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createServerBtn.click();
});
joinServerBtn.addEventListener('click', joinServerByCode);
joinServerCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinServerBtn.click();
});
serverBackBtn.addEventListener('click', closeServerDetail);
serverSettingsGearBtn.addEventListener('click', closeTextChannel);
railHomeBtn.addEventListener('click', enterHomeMode);
joinTitlebarHomeBtn.addEventListener('click', enterHomeMode);
roomTitlebarHomeBtn.addEventListener('click', () => {
  showScreen(joinScreen);
  enterHomeMode();
});
serversRetryBtn.addEventListener('click', loadServersList);
serverDetailRetryBtn.addEventListener('click', () => {
  const serverId = Number(serverDetailRetryBtn.dataset.serverId);
  if (Number.isInteger(serverId) && serverId > 0) openServerDetail(serverId);
});
copyServerInviteBtn.addEventListener('click', copyServerInvite);
regenServerInviteBtn.addEventListener('click', regenerateServerInvite);
createChannelBtn.addEventListener('click', createServerChannel);
createChannelNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createChannelBtn.click();
});
saveServerSettingsBtn.addEventListener('click', saveServerSettings);
transferServerBtn.addEventListener('click', transferServerOwnership);
loadServerBansBtn.addEventListener('click', loadServerBans);
loadServerAuditBtn.addEventListener('click', loadServerAuditLog);
leaveServerBtn.addEventListener('click', leaveServer);
deleteServerBtn.addEventListener('click', deleteServer);

textChannelRetryBtn.addEventListener('click', () => {
  if (currentTextChannel) openTextChannel(currentTextChannel.serverId, currentTextChannel.channelId, currentTextChannel.name);
});

textChannelSendBtn.addEventListener('click', sendTextChannelMessage);

textChannelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextChannelMessage();
  }
});

textChannelInput.addEventListener('input', autoResizeTextChannelInput);

textChannelLogEl.addEventListener('scroll', () => {
  const threshold = 40;
  textChannelAutoScroll = textChannelLogEl.scrollTop + textChannelLogEl.clientHeight >= textChannelLogEl.scrollHeight - threshold;
  if (textChannelAutoScroll) textChannelScrollBtn.classList.add('hidden');
  if (textChannelLogEl.scrollTop < 40 && textChannelHasMoreHistory && !textChannelLoadingOlder && currentTextChannel) {
    textChannelLoadingOlder = true;
    loadTextChannelMessages({ older: true }).finally(() => {
      textChannelLoadingOlder = false;
    });
  }
});

textChannelScrollBtn.addEventListener('click', () => {
  textChannelAutoScroll = true;
  scrollTextChannelToBottom();
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

roomAccessRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!radio.checked || !socket || !currentRoomCode || !currentRoomIsOwner) return;
    const access = radio.value;
    emitWithTimeout('set-room-access', { access }).then((ack) => {
      if (!ack || ack.error) {
        showToast(ack?.error || 'erişim değiştirilemedi', 'error');
        return;
      }
      showToast(
        access === 'friends' ? 'oda arkadaşlarına açıldı' : 'oda yalnızca davetle erişilebilir',
        'ok',
        3000
      );
    });
  });
});

switchRoomConfirmBtn.addEventListener('click', () => {
  const target = pendingRoomSwitch;
  pendingRoomSwitch = null;
  switchRoomBanner.classList.add('hidden');
  if (!target) return;
  if (typeof target === 'string') {
    performJoinFriendRoom(target);
  } else if (target.type === 'server-channel') {
    performJoinServerVoiceChannel(target.serverId, target.channelId, target.channelName);
  }
});

switchRoomCancelBtn.addEventListener('click', () => {
  pendingRoomSwitch = null;
  switchRoomBanner.classList.add('hidden');
});

vadSensitivitySlider.addEventListener('input', () => {
  saveSetting('vadSensitivity', vadSensitivitySlider.value);
});

pttKeySelect.addEventListener('change', () => {
  saveSetting('pttKey', pttKeySelect.value);
  updatePttRegistration();
});

notifyCallCheckbox.addEventListener('change', () => {
  saveSetting('notifyIncomingCall', notifyCallCheckbox.checked);
});

ringtoneEnabledCheckbox.addEventListener('change', () => {
  saveSetting('ringtoneEnabled', ringtoneEnabledCheckbox.checked);
  updateRingtoneVisibility();
});

ringtoneVolumeSlider.addEventListener('input', () => {
  saveSetting('ringtoneVolume', ringtoneVolumeSlider.value);
});

ringtoneStyleSelect.addEventListener('change', () => {
  saveSetting('ringtoneStyle', ringtoneStyleSelect.value);
});

ringtonePreviewBtn.addEventListener('click', () => {
  previewRingtone(ringtoneStyleSelect.value);
});

notifyFriendCheckbox.addEventListener('change', () => {
  saveSetting('notifyFriendRequest', notifyFriendCheckbox.checked);
});

notifyChatCheckbox.addEventListener('change', () => {
  saveSetting('notifyChatMessage', notifyChatCheckbox.checked);
});

notifyDmCheckbox.addEventListener('change', () => {
  saveSetting('notifyDmMessage', notifyDmCheckbox.checked);
});

notifyChatContentCheckbox.addEventListener('change', () => {
  saveSetting('notifyChatContent', notifyChatContentCheckbox.checked);
});

runInBackgroundCheckbox.addEventListener('change', () => {
  saveSetting('runInBackground', runInBackgroundCheckbox.checked);
  if (window.api) window.api.setBackgroundPref(runInBackgroundCheckbox.checked);
});

gameDetectionCheckbox.addEventListener('change', () => {
  saveSetting('gameDetectionEnabled', gameDetectionCheckbox.checked);
  if (window.api) window.api.setGameDetectionEnabled(gameDetectionCheckbox.checked);
  if (!gameDetectionCheckbox.checked && socket && socket.connected) {
    myCurrentGame = null;
    socket.emit('set-game-status', { game: null });
    if (myGameStatusEl) myGameStatusEl.classList.add('hidden');
  }
});

launchAtLoginCheckbox.addEventListener('change', () => {
  if (window.api) window.api.setLaunchAtLogin(launchAtLoginCheckbox.checked);
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
  const response = await emitWithTimeout('call-response', { roomCode, accepted: true });
  if (!response?.ok) {
    stream.getTracks().forEach((track) => track.stop());
    joining = false;
    showToast(response?.error || 'Arama artık geçerli değil.', 'error');
    return;
  }
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
newPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') changePasswordBtn.click();
});

// ---- baslangic ----

// theme-init.js ilk boyamadan once dogru data-theme'i zaten uyguladi; burada
// sadece localStorage'daki degeri (gecersizse) kalici olarak duzeltiyoruz ve
// ayarlar sekmesindeki radyo butonlarini senkronize ediyoruz.
applyTheme(getTheme());

if (window.api) window.api.setBackgroundPref(getSettings().runInBackground);
if (window.api) window.api.setGameDetectionEnabled(getSettings().gameDetectionEnabled);

const existingSession = getSession();
if (existingSession.token && existingSession.username) {
  enterJoinScreen(existingSession.username);
}
