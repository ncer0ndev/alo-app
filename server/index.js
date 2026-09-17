const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-degistir';
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.username = jwt.verify(token, JWT_SECRET).username;
    next();
  } catch {
    res.status(401).json({ error: 'Geçersiz oturum.' });
  }
}

app.get('/', (_req, res) => res.send('Sesli sohbet sinyalleşme sunucusu çalışıyor.'));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Kullanıcı adı en az 3, şifre en az 4 karakter olmalı.' });
  }
  const users = loadUsers();
  const key = username.toLowerCase();
  if (users[key]) {
    return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users[key] = { username, passwordHash, friends: [], incomingRequests: [], outgoingRequests: [] };
  saveUsers(users);
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const user = users[(username || '').toLowerCase()];
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.username });
});

app.get('/api/friends', requireAuth, (req, res) => {
  const users = loadUsers();
  const me = users[req.username.toLowerCase()];
  if (!me) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const friends = (me.friends || []).map((key) => ({
    username: users[key]?.username || key,
    online: onlineUsers.has(key),
  }));
  const incoming = (me.incomingRequests || []).map((key) => users[key]?.username || key);
  const outgoing = (me.outgoingRequests || []).map((key) => users[key]?.username || key);
  res.json({ friends, incoming, outgoing });
});

app.post('/api/friends/request', requireAuth, (req, res) => {
  const { username: targetUsername } = req.body || {};
  const users = loadUsers();
  const meKey = req.username.toLowerCase();
  const targetKey = (targetUsername || '').toLowerCase();
  const me = users[meKey];
  const target = users[targetKey];

  if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  if (targetKey === meKey) return res.status(400).json({ error: 'Kendini ekleyemezsin.' });
  if ((me.friends || []).includes(targetKey) || (target.friends || []).includes(meKey)) {
    return res.status(409).json({ error: 'Zaten arkadaşsınız.' });
  }

  me.outgoingRequests = me.outgoingRequests || [];
  target.incomingRequests = target.incomingRequests || [];
  if (!me.outgoingRequests.includes(targetKey)) me.outgoingRequests.push(targetKey);
  if (!target.incomingRequests.includes(meKey)) target.incomingRequests.push(meKey);
  saveUsers(users);

  const targetSocketId = onlineUsers.get(targetKey);
  if (targetSocketId) io.to(targetSocketId).emit('friend-request', { fromUsername: me.username });
  res.json({ ok: true });
});

app.post('/api/friends/accept', requireAuth, (req, res) => {
  const { username: fromUsername } = req.body || {};
  const users = loadUsers();
  const meKey = req.username.toLowerCase();
  const fromKey = (fromUsername || '').toLowerCase();
  const me = users[meKey];
  const from = users[fromKey];

  if (!from || !(me.incomingRequests || []).includes(fromKey)) {
    return res.status(400).json({ error: 'Bekleyen istek bulunamadı.' });
  }

  me.incomingRequests = (me.incomingRequests || []).filter((k) => k !== fromKey);
  from.outgoingRequests = (from.outgoingRequests || []).filter((k) => k !== meKey);
  me.friends = me.friends || [];
  from.friends = from.friends || [];
  if (!me.friends.includes(fromKey)) me.friends.push(fromKey);
  if (!from.friends.includes(meKey)) from.friends.push(meKey);
  saveUsers(users);

  const fromSocketId = onlineUsers.get(fromKey);
  if (fromSocketId) io.to(fromSocketId).emit('friend-accepted', { byUsername: me.username });
  res.json({ ok: true });
});

app.post('/api/friends/decline', requireAuth, (req, res) => {
  const { username: fromUsername } = req.body || {};
  const users = loadUsers();
  const meKey = req.username.toLowerCase();
  const fromKey = (fromUsername || '').toLowerCase();
  const me = users[meKey];
  const from = users[fromKey];

  if (me) me.incomingRequests = (me.incomingRequests || []).filter((k) => k !== fromKey);
  if (from) from.outgoingRequests = (from.outgoingRequests || []).filter((k) => k !== meKey);
  saveUsers(users);
  res.json({ ok: true });
});

app.post('/api/friends/remove', requireAuth, (req, res) => {
  const { username: otherUsername } = req.body || {};
  const users = loadUsers();
  const meKey = req.username.toLowerCase();
  const otherKey = (otherUsername || '').toLowerCase();
  const me = users[meKey];
  const other = users[otherKey];

  if (me) me.friends = (me.friends || []).filter((k) => k !== otherKey);
  if (other) other.friends = (other.friends || []).filter((k) => k !== meKey);
  saveUsers(users);
  res.json({ ok: true });
});

const rooms = new Map();
const onlineUsers = new Map();
const pendingCalls = new Map();

function notifyFriends(username, event, payload) {
  const users = loadUsers();
  const me = users[username.toLowerCase()];
  if (!me) return;
  for (const friendKey of me.friends || []) {
    const socketId = onlineUsers.get(friendKey);
    if (socketId) io.to(socketId).emit(event, payload);
  }
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let username = null;

  function leaveCurrentRoom() {
    if (currentRoom) {
      rooms.get(currentRoom)?.delete(socket.id);
      socket.to(currentRoom).emit('peer-left', { id: socket.id });
      socket.leave(currentRoom);
      currentRoom = null;
    }
  }

  socket.on('authenticate', (token) => {
    try {
      username = jwt.verify(token, JWT_SECRET).username;
    } catch {
      socket.emit('auth-error', { error: 'Geçersiz oturum.' });
      return;
    }
    socket.data.displayName = username;
    onlineUsers.set(username.toLowerCase(), socket.id);
    socket.emit('authenticated', { username });
    notifyFriends(username, 'friend-online', { username });
  });

  socket.on('join-room', ({ roomCode }) => {
    if (!username) {
      socket.emit('join-error', { error: 'Önce giriş yap.' });
      return;
    }
    leaveCurrentRoom();
    currentRoom = roomCode;
    socket.join(roomCode);

    if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
    const peers = rooms.get(roomCode);

    const existingPeers = [...peers].map((id) => ({
      id,
      displayName: io.sockets.sockets.get(id)?.data.displayName || 'Bilinmeyen',
    }));
    socket.emit('existing-peers', existingPeers);

    peers.add(socket.id);
    socket.to(roomCode).emit('peer-joined', { id: socket.id, displayName: username });
  });

  socket.on('leave-room', () => leaveCurrentRoom());

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('call-friend', ({ toUsername }) => {
    if (!username) return;
    const targetKey = (toUsername || '').toLowerCase();
    const targetSocketId = onlineUsers.get(targetKey);
    if (!targetSocketId) {
      socket.emit('call-failed', { toUsername, reason: 'offline' });
      return;
    }

    const users = loadUsers();
    const me = users[username.toLowerCase()];
    if (!me || !(me.friends || []).includes(targetKey)) {
      socket.emit('call-failed', { toUsername, reason: 'not-friends' });
      return;
    }

    const roomCode = crypto.randomUUID().slice(0, 8);
    pendingCalls.set(roomCode, socket.id);
    io.to(targetSocketId).emit('incoming-call', { fromUsername: username, roomCode });
    socket.emit('call-ringing', { toUsername, roomCode });
  });

  socket.on('call-response', ({ roomCode, accepted }) => {
    const callerSocketId = pendingCalls.get(roomCode);
    if (!callerSocketId) return;
    pendingCalls.delete(roomCode);
    if (accepted) {
      io.to(callerSocketId).emit('call-accepted', { roomCode });
    } else {
      io.to(callerSocketId).emit('call-declined', { byUsername: username });
    }
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom();
    if (username) {
      onlineUsers.delete(username.toLowerCase());
      notifyFriends(username, 'friend-offline', { username });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sinyalleşme sunucusu ${PORT} portunda çalışıyor`));
