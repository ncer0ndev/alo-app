const { io } = require('socket.io-client');
const { clipboard } = require('electron');

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const SERVER_URL = 'https://alo-app.onrender.com';

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
const friendsListEl = document.getElementById('friends-list');
const friendsEmptyEl = document.getElementById('friends-empty');

const incomingCallBanner = document.getElementById('incoming-call-banner');
const incomingCallText = document.getElementById('incoming-call-text');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');

const muteBtn = document.getElementById('mute-btn');
const leaveBtn = document.getElementById('leave-btn');
const participantsList = document.getElementById('participants');

let socket = null;
let localStream = null;
let muted = false;
let pendingIncomingCall = null;
let currentRoomCode = null;
const peerConnections = {};
const audioElements = {};
const participantNames = {};

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

function showScreen(screen) {
  [authScreen, joinScreen, roomScreen].forEach((s) => s.classList.add('hidden'));
  screen.classList.remove('hidden');
}

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

async function authRequest(endpoint) {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;
  if (!username || !password) {
    setAuthStatus('kullanici adi ve sifre gerekli', 'error');
    return;
  }

  setAuthStatus('baglaniliyor...', 'info');
  try {
    const res = await fetch(`${getServerUrl()}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthStatus(data.error || 'bir hata olustu', 'error');
      return;
    }
    saveSession(data.token, data.username);
    enterJoinScreen(data.username);
  } catch (err) {
    setAuthStatus('sunucuya ulasilamadi: ' + err.message, 'error');
  }
}

function enterJoinScreen(username) {
  setAuthStatus('');
  welcomeText.textContent = `[OK] oturum acildi: ${username}`;
  profileUsernameEl.textContent = `kullanici: ${username}`;
  showTab('friends');
  showScreen(joinScreen);
  connectSocket();
}

function showTab(tabName) {
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  tabContents.forEach((content) => content.classList.toggle('hidden', content.id !== `tab-${tabName}`));
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createRoom() {
  joinRoomWithCode(generateRoomCode());
}

function copyRoomCode() {
  if (!currentRoomCode) return;
  clipboard.writeText(currentRoomCode);
  setStatus('oda kodu panoya kopyalandi', 'ok');
}

function logout() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  clearSession();
  authUsernameInput.value = '';
  authPasswordInput.value = '';
  incomingCallBanner.classList.add('hidden');
  showScreen(authScreen);
}

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
  if (!res.ok) throw new Error(data.error || 'bir hata olustu');
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
    renderFriends(data.friends, data.incoming);
  } catch {
    // sessizce yoksay, bir sonraki denemede tekrar dener
  }
}

function renderFriends(friends, incoming) {
  incomingRequestsList.innerHTML = '';
  if (incoming.length === 0) {
    incomingRequestsSection.classList.add('hidden');
  } else {
    incomingRequestsSection.classList.remove('hidden');
    for (const name of incoming) {
      const li = document.createElement('li');
      li.className = 'friend-row';
      li.innerHTML = `<span class="name">${escapeHtml(name)}</span>`;
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn';
      acceptBtn.textContent = '[ KABUL ]';
      acceptBtn.onclick = () => respondToRequest(name, true);
      const declineBtn = document.createElement('button');
      declineBtn.className = 'btn btn-ghost';
      declineBtn.textContent = '[ RED ]';
      declineBtn.onclick = () => respondToRequest(name, false);
      li.appendChild(acceptBtn);
      li.appendChild(declineBtn);
      incomingRequestsList.appendChild(li);
    }
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
    callBtn.className = 'btn';
    callBtn.textContent = '[ ARA ]';
    callBtn.disabled = !friend.online;
    callBtn.onclick = () => callFriend(friend.username);
    li.appendChild(dot);
    li.appendChild(name);
    li.appendChild(callBtn);
    friendsListEl.appendChild(li);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function respondToRequest(fromUsername, accepted) {
  try {
    await apiRequest(accepted ? '/api/friends/accept' : '/api/friends/decline', { username: fromUsername });
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
    setFriendStatus(`istek gonderildi: ${username}`, 'ok');
    addFriendInput.value = '';
  } catch (err) {
    setFriendStatus(err.message, 'error');
  }
}

function callFriend(toUsername) {
  if (!socket) return;
  setStatus(`${toUsername} araniyor...`, 'info');
  socket.emit('call-friend', { toUsername });
}

function showIncomingCall(fromUsername, roomCode) {
  pendingIncomingCall = { fromUsername, roomCode };
  incomingCallText.textContent = `${fromUsername} seni ariyor`;
  incomingCallBanner.classList.remove('hidden');
}

function hideIncomingCall() {
  pendingIncomingCall = null;
  incomingCallBanner.classList.add('hidden');
}

function connectSocket() {
  const { token } = getSession();
  socket = io(getServerUrl());

  socket.on('connect', () => {
    socket.emit('authenticate', token);
  });

  socket.on('authenticated', () => {
    loadFriends();
  });

  socket.on('auth-error', () => {
    logout();
  });

  socket.on('friend-online', ({ username }) => setFriendOnline(username, true));
  socket.on('friend-offline', ({ username }) => setFriendOnline(username, false));
  socket.on('friend-request', () => loadFriends());
  socket.on('friend-accepted', () => loadFriends());

  socket.on('incoming-call', ({ fromUsername, roomCode }) => showIncomingCall(fromUsername, roomCode));

  socket.on('call-ringing', () => setStatus('araniyor, bekleniyor...', 'info'));

  socket.on('call-failed', ({ toUsername, reason }) => {
    const reasonText = reason === 'offline' ? 'cevrimdisi' : 'artik arkadas degilsiniz';
    setStatus(`${toUsername} aranamadi: ${reasonText}`, 'error');
  });

  socket.on('call-accepted', ({ roomCode }) => {
    setStatus('');
    joinRoomWithCode(roomCode);
  });

  socket.on('call-declined', ({ byUsername }) => {
    setStatus(`${byUsername} aramayi reddetti`, 'error');
  });

  socket.on('join-error', ({ error }) => {
    setStatus(error, 'error');
  });

  socket.on('existing-peers', async (peers) => {
    for (const peer of peers) {
      addParticipant(peer.id, peer.displayName);
      await callPeer(peer.id);
    }
  });

  socket.on('peer-joined', ({ id, displayName }) => {
    addParticipant(id, displayName);
  });

  socket.on('signal', handleSignal);

  socket.on('peer-left', ({ id }) => {
    cleanupPeer(id);
  });

  socket.on('connect_error', (err) => {
    setStatus('baglanti hatasi: ' + err.message, 'error');
  });
}

function setFriendOnline(username, online) {
  const row = friendsListEl.querySelector(`[data-username="${username.toLowerCase()}"]`);
  if (!row) return;
  row.querySelector('.dot').classList.toggle('online', online);
  row.querySelector('.btn').disabled = !online;
}

function renderParticipants(myUsername) {
  participantsList.innerHTML = '';
  const me = document.createElement('li');
  me.textContent = `${myUsername} (sen)`;
  me.style.color = 'var(--secondary)';
  participantsList.appendChild(me);
  for (const name of Object.values(participantNames)) {
    const li = document.createElement('li');
    li.textContent = name;
    participantsList.appendChild(li);
  }
}

function addParticipant(id, name) {
  participantNames[id] = name;
  renderParticipants(getSession().username);
}

function removeParticipant(id) {
  delete participantNames[id];
  renderParticipants(getSession().username);
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

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

async function handleSignal({ from, data }) {
  let pc = peerConnections[from];

  if (data.sdp) {
    if (data.sdp.type === 'offer') {
      pc = pc || createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
    } else if (data.sdp.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
  } else if (data.candidate && pc) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
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
  removeParticipant(peerId);
}

async function joinRoomWithCode(roomCode) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus('mikrofona erisilemedi: ' + err.message, 'error');
    return;
  }

  socket.emit('join-room', { roomCode });

  currentRoomCode = roomCode;
  roomCodeDisplay.textContent = roomCode;
  showScreen(roomScreen);
  renderParticipants(getSession().username);
}

function joinRoom() {
  const roomCode = roomCodeInput.value.trim();
  if (!roomCode) {
    setStatus('oda kodu gerekli', 'error');
    return;
  }
  joinRoomWithCode(roomCode);
}

function leaveRoom() {
  if (socket) socket.emit('leave-room');
  Object.keys(peerConnections).forEach(cleanupPeer);
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  localStream = null;
  currentRoomCode = null;

  showScreen(joinScreen);
  setStatus('');
}

function toggleMute() {
  if (!localStream) return;
  muted = !muted;
  localStream.getAudioTracks().forEach((track) => (track.enabled = !muted));
  muteBtn.textContent = muted ? '[ MIKROFONU AC ]' : '[ MIKROFONU KAPAT ]';
}

loginBtn.addEventListener('click', () => authRequest('/api/login'));
registerBtn.addEventListener('click', () => authRequest('/api/register'));
logoutBtn.addEventListener('click', logout);
addFriendBtn.addEventListener('click', addFriend);
joinBtn.addEventListener('click', joinRoom);
createRoomBtn.addEventListener('click', createRoom);
copyCodeBtn.addEventListener('click', copyRoomCode);
leaveBtn.addEventListener('click', leaveRoom);
muteBtn.addEventListener('click', toggleMute);

tabBtns.forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

acceptCallBtn.addEventListener('click', () => {
  if (!pendingIncomingCall) return;
  const { roomCode } = pendingIncomingCall;
  socket.emit('call-response', { roomCode, accepted: true });
  hideIncomingCall();
  joinRoomWithCode(roomCode);
});

declineCallBtn.addEventListener('click', () => {
  if (!pendingIncomingCall) return;
  socket.emit('call-response', { roomCode: pendingIncomingCall.roomCode, accepted: false });
  hideIncomingCall();
});

const existingSession = getSession();
if (existingSession.token && existingSession.username) {
  enterJoinScreen(existingSession.username);
}
