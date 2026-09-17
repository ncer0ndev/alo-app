const { io } = require('socket.io-client');

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const authScreen = document.getElementById('auth-screen');
const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');

const serverUrlInput = document.getElementById('server-url');
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

const roomTitle = document.getElementById('room-title');
const muteBtn = document.getElementById('mute-btn');
const leaveBtn = document.getElementById('leave-btn');
const participantsList = document.getElementById('participants');

let socket = null;
let localStream = null;
let muted = false;
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

function getServerUrl() {
  return serverUrlInput.value.trim().replace(/\/+$/, '');
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
  showScreen(joinScreen);
}

function logout() {
  clearSession();
  authUsernameInput.value = '';
  authPasswordInput.value = '';
  showScreen(authScreen);
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

async function joinRoom() {
  const roomCode = roomCodeInput.value.trim();
  const { token, username } = getSession();

  if (!roomCode) {
    setStatus('oda kodu gerekli', 'error');
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus('mikrofona erisilemedi: ' + err.message, 'error');
    return;
  }

  socket = io(getServerUrl());

  socket.on('connect', () => {
    socket.emit('join-room', { roomCode, token });
  });

  socket.on('join-error', ({ error }) => {
    setStatus(error, 'error');
    socket.disconnect();
    logout();
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

  roomTitle.textContent = `--- room: ${roomCode} ---`;
  showScreen(roomScreen);
  renderParticipants(username);
}

function leaveRoom() {
  if (socket) socket.disconnect();
  Object.keys(peerConnections).forEach(cleanupPeer);
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  localStream = null;
  socket = null;

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
joinBtn.addEventListener('click', joinRoom);
leaveBtn.addEventListener('click', leaveRoom);
muteBtn.addEventListener('click', toggleMute);

const existingSession = getSession();
if (existingSession.token && existingSession.username) {
  enterJoinScreen(existingSession.username);
}
