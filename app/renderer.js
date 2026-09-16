const { io } = require('socket.io-client');

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');
const serverUrlInput = document.getElementById('server-url');
const displayNameInput = document.getElementById('display-name');
const roomCodeInput = document.getElementById('room-code');
const joinBtn = document.getElementById('join-btn');
const muteBtn = document.getElementById('mute-btn');
const leaveBtn = document.getElementById('leave-btn');
const statusEl = document.getElementById('status');
const roomTitle = document.getElementById('room-title');
const participantsList = document.getElementById('participants');

let socket = null;
let localStream = null;
let muted = false;
const peerConnections = {};
const audioElements = {};
const participantNames = {};

function setStatus(text) {
  statusEl.textContent = text;
}

function addParticipant(id, name) {
  participantNames[id] = name;
  renderParticipants();
}

function removeParticipant(id) {
  delete participantNames[id];
  renderParticipants();
}

function renderParticipants() {
  participantsList.innerHTML = '';
  const me = document.createElement('li');
  me.textContent = `${displayNameInput.value} (sen)`;
  participantsList.appendChild(me);
  for (const [id, name] of Object.entries(participantNames)) {
    const li = document.createElement('li');
    li.textContent = name;
    participantsList.appendChild(li);
  }
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
  const serverUrl = serverUrlInput.value.trim();
  const displayName = displayNameInput.value.trim() || 'Oyuncu';
  const roomCode = roomCodeInput.value.trim();

  if (!serverUrl || !roomCode) {
    setStatus('Sunucu adresi ve oda kodu gerekli.');
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus('Mikrofona erişilemedi: ' + err.message);
    return;
  }

  socket = io(serverUrl);

  socket.on('connect', () => {
    socket.emit('join-room', { roomCode, displayName });
  });

  socket.on('existing-peers', async (peers) => {
    for (const peer of peers) {
      addParticipant(peer.id, peer.displayName);
      await callPeer(peer.id);
    }
  });

  socket.on('peer-joined', ({ id, displayName: name }) => {
    addParticipant(id, name);
  });

  socket.on('signal', handleSignal);

  socket.on('peer-left', ({ id }) => {
    cleanupPeer(id);
  });

  socket.on('connect_error', (err) => {
    setStatus('Bağlantı hatası: ' + err.message);
  });

  roomTitle.textContent = `Oda: ${roomCode}`;
  joinScreen.classList.add('hidden');
  roomScreen.classList.remove('hidden');
  renderParticipants();
}

function leaveRoom() {
  if (socket) socket.disconnect();
  Object.keys(peerConnections).forEach(cleanupPeer);
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  localStream = null;
  socket = null;

  roomScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  setStatus('');
}

function toggleMute() {
  if (!localStream) return;
  muted = !muted;
  localStream.getAudioTracks().forEach((track) => (track.enabled = !muted));
  muteBtn.textContent = muted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat';
}

joinBtn.addEventListener('click', joinRoom);
leaveBtn.addEventListener('click', leaveRoom);
muteBtn.addEventListener('click', toggleMute);
