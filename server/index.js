const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('HATA: JWT_SECRET ortam degiskeni tanimli degil. Sunucu baslatilamiyor.');
  console.error('Ornek: JWT_SECRET=<uzun-rastgele-deger> node index.js (bkz. .env.example)');
  process.exit(1);
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const ROOM_CODE_RE = /^[A-F0-9]{6,12}$/i;
const CALL_TIMEOUT_MS = 30_000;
const CALL_COOLDOWN_MS = 3_000;
const ABANDONED_ROOM_MS = 60_000;
const CHAT_MAX_LENGTH = 2000;
const CHAT_HISTORY_LIMIT = 100;
const CHAT_RATE_LIMIT = 8;
const CHAT_RATE_WINDOW_MS = 10_000;

function isNonEmptyString(v, maxLen) {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}
function isValidUsername(v) {
  return typeof v === 'string' && USERNAME_RE.test(v);
}
function isValidPassword(v) {
  return typeof v === 'string' && v.length >= 6 && v.length <= 72;
}
function isValidRoomCode(v) {
  return typeof v === 'string' && ROOM_CODE_RE.test(v);
}
function isValidSignalData(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.sdp) return typeof data.sdp === 'object' && typeof data.sdp.type === 'string' && typeof data.sdp.sdp === 'string';
  if (data.candidate) return typeof data.candidate === 'object';
  return false;
}

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map(); // roomCode -> { members: Set<socketId>, createdAt, messages: [], seenClientIds: Map }
const onlineUsers = new Map(); // usernameLower -> Set<socketId>
const pendingCalls = new Map(); // roomCode -> { callerSocketId, calleeSocketId, timeoutHandle }

function addOnlineSocket(key, socketId) {
  let set = onlineUsers.get(key);
  const wasOffline = !set || set.size === 0;
  if (!set) {
    set = new Set();
    onlineUsers.set(key, set);
  }
  set.add(socketId);
  return wasOffline;
}

function removeOnlineSocket(key, socketId) {
  const set = onlineUsers.get(key);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(key);
    return true;
  }
  return false;
}

function isUserOnline(username) {
  return onlineUsers.has(username.toLowerCase());
}

function emitToUser(username, event, payload) {
  const set = onlineUsers.get(username.toLowerCase());
  if (!set) return;
  for (const socketId of set) io.to(socketId).emit(event, payload);
}

async function notifyFriends(userId, event, payload) {
  for (const friend of await db.listFriends(userId)) {
    emitToUser(friend.username, event, payload);
  }
}

function isUserBusy(usernameKey) {
  const socketIds = onlineUsers.get(usernameKey);
  if (!socketIds) return false;
  for (const call of pendingCalls.values()) {
    if (socketIds.has(call.calleeSocketId) || socketIds.has(call.callerSocketId)) return true;
  }
  for (const room of rooms.values()) {
    if (room.members.size === 0) continue;
    for (const sid of socketIds) {
      if (room.members.has(sid)) return true;
    }
  }
  return false;
}

function generateRoomCode() {
  let code;
  do {
    code = crypto.randomBytes(5).toString('hex').toUpperCase();
  } while (rooms.has(code));
  return code;
}

function createRoomEntry() {
  const code = generateRoomCode();
  rooms.set(code, { members: new Set(), createdAt: Date.now(), messages: [], seenClientIds: new Map() });
  return code;
}

function cleanupEmptyRoom(code) {
  const room = rooms.get(code);
  if (room && room.members.size === 0) rooms.delete(code);
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.members.size === 0 && now - room.createdAt > ABANDONED_ROOM_MS) rooms.delete(code);
  }
}, 30_000).unref();

function startCallTimeout(roomCode) {
  return setTimeout(() => {
    const call = pendingCalls.get(roomCode);
    if (!call) return;
    pendingCalls.delete(roomCode);
    io.to(call.callerSocketId).emit('call-timeout', { roomCode });
    cleanupEmptyRoom(roomCode);
  }, CALL_TIMEOUT_MS);
}

// ---- HTTP API ----

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const friendLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'gecersiz oturum' });
  }
}

function asyncRoute(fn) {
  return (req, res) => {
    fn(req, res).catch((err) => {
      console.error('istek hatasi:', err.message);
      res.status(500).json({ error: 'sunucu hatasi' });
    });
  };
}

app.get('/', (_req, res) => res.send('Sesli sohbet sinyalleşme sunucusu çalışıyor.'));

app.post(
  '/api/register',
  authLimiter,
  asyncRoute(async (req, res) => {
    const { username, password } = req.body || {};
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: 'kullanici adi 3-20 karakter olmali, sadece harf/rakam/alt cizgi icerebilir' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'sifre en az 6 karakter olmali' });
    }
    if (await db.getUserByUsername(username)) {
      return res.status(409).json({ error: 'bu kullanici adi zaten alinmis' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    let userId;
    try {
      userId = await db.createUser(username, passwordHash);
    } catch {
      // ayni anda gelen eszamanli kayit denemesine karsi ikinci savunma katmani (UNIQUE kisiti)
      return res.status(409).json({ error: 'bu kullanici adi zaten alinmis' });
    }
    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username });
  })
);

app.post(
  '/api/login',
  authLimiter,
  asyncRoute(async (req, res) => {
    const { username, password } = req.body || {};
    if (!isNonEmptyString(username, 20) || !isNonEmptyString(password, 72)) {
      return res.status(400).json({ error: 'kullanici adi ve sifre gerekli' });
    }
    const user = await db.getUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'kullanici adi veya sifre hatali' });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username });
  })
);

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.username });
});

app.get('/api/ice-servers', requireAuth, (_req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  res.json({ iceServers });
});

app.get(
  '/api/friends',
  requireAuth,
  asyncRoute(async (req, res) => {
    const friendRows = await db.listFriends(req.userId);
    const friends = friendRows.map((f) => ({ username: f.username, online: isUserOnline(f.username) }));
    const incoming = (await db.listIncomingRequests(req.userId)).map((u) => u.username);
    const outgoing = (await db.listOutgoingRequests(req.userId)).map((u) => u.username);
    res.json({ friends, incoming, outgoing });
  })
);

app.post(
  '/api/friends/request',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const { username: targetUsername } = req.body || {};
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    if (targetUsername.toLowerCase() === req.username.toLowerCase()) {
      return res.status(400).json({ error: 'kendini ekleyemezsin' });
    }
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    if (await db.areFriends(req.userId, target.id)) return res.status(409).json({ error: 'zaten arkadassiniz' });

    if (await db.hasPendingRequest(target.id, req.userId)) {
      await db.acceptFriendRequest(target.id, req.userId);
      emitToUser(target.username, 'friend-accepted', { byUsername: req.username });
      return res.json({ ok: true, autoAccepted: true });
    }

    const created = await db.createFriendRequest(req.userId, target.id);
    if (!created) return res.status(409).json({ error: 'istek zaten gonderilmis' });

    emitToUser(target.username, 'friend-request', { fromUsername: req.username });
    res.json({ ok: true });
  })
);

app.post(
  '/api/friends/accept',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { username: fromUsername } = req.body || {};
    if (!isValidUsername(fromUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const from = await db.getUserByUsername(fromUsername);
    if (!from) return res.status(404).json({ error: 'kullanici bulunamadi' });

    const ok = await db.acceptFriendRequest(from.id, req.userId);
    if (!ok) return res.status(400).json({ error: 'bekleyen istek bulunamadi' });

    emitToUser(from.username, 'friend-accepted', { byUsername: req.username });
    res.json({ ok: true });
  })
);

app.post(
  '/api/friends/decline',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { username: fromUsername } = req.body || {};
    if (!isValidUsername(fromUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const from = await db.getUserByUsername(fromUsername);
    if (from) await db.declineFriendRequest(from.id, req.userId);
    res.json({ ok: true });
  })
);

app.post(
  '/api/friends/cancel',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { username: targetUsername } = req.body || {};
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (target) await db.declineFriendRequest(req.userId, target.id);
    res.json({ ok: true });
  })
);

app.post(
  '/api/friends/remove',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { username: otherUsername } = req.body || {};
    if (!isValidUsername(otherUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const other = await db.getUserByUsername(otherUsername);
    if (other) await db.removeFriend(req.userId, other.id);
    res.json({ ok: true });
  })
);

app.use((err, _req, res, next) => {
  if (err) return res.status(400).json({ error: 'gecersiz istek' });
  next();
});

// ---- Socket.IO (sinyalleşme + eslesme + sohbet) ----

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (typeof token !== 'string') return next(new Error('unauthorized'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.data.userId = payload.userId;
    socket.data.username = payload.username;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const { userId, username } = socket.data;
  const usernameKey = username.toLowerCase();
  let currentRoom = null;
  let lastCallAttempt = 0;
  let chatTimestamps = [];

  const cameOnline = addOnlineSocket(usernameKey, socket.id);
  socket.emit('authenticated', { username });
  if (cameOnline) notifyFriends(userId, 'friend-online', { username }).catch((err) => console.error(err.message));

  function leaveCurrentRoom() {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      room.members.delete(socket.id);
      socket.to(currentRoom).emit('peer-left', { id: socket.id });
      cleanupEmptyRoom(currentRoom);
    }
    socket.leave(currentRoom);
    currentRoom = null;
  }

  socket.on('create-room', (ack) => {
    if (typeof ack !== 'function') return;
    ack({ roomCode: createRoomEntry() });
  });

  socket.on('join-room', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { roomCode } = payload || {};
    if (!isValidRoomCode(roomCode)) return ack({ error: 'gecersiz oda kodu' });
    const room = rooms.get(roomCode);
    if (!room) return ack({ error: 'oda bulunamadi' });

    leaveCurrentRoom();
    currentRoom = roomCode;
    chatTimestamps = [];
    socket.join(roomCode);

    const existingPeers = [...room.members].map((id) => ({
      id,
      displayName: io.sockets.sockets.get(id)?.data.username || 'Bilinmeyen',
    }));

    room.members.add(socket.id);
    socket.to(roomCode).emit('peer-joined', { id: socket.id, displayName: username });
    ack({ ok: true, roomCode, existingPeers, chatHistory: room.messages });
  });

  socket.on('leave-room', () => leaveCurrentRoom());

  socket.on('signal', (payload) => {
    const { to, data } = payload || {};
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || typeof to !== 'string' || !room.members.has(to)) return;
    if (!isValidSignalData(data)) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat-message', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!currentRoom) return ack({ error: 'bir odada degilsin' });
    const room = rooms.get(currentRoom);
    if (!room) return ack({ error: 'oda bulunamadi' });

    const { text, clientMessageId } = payload || {};
    if (typeof clientMessageId !== 'string' || clientMessageId.length === 0 || clientMessageId.length > 64) {
      return ack({ error: 'gecersiz istek' });
    }

    const existing = room.seenClientIds.get(clientMessageId);
    if (existing) return ack({ ok: true, message: existing });

    if (typeof text !== 'string' || text.trim().length === 0) return ack({ error: 'bos mesaj gonderilemez' });
    if (text.length > CHAT_MAX_LENGTH) return ack({ error: `mesaj cok uzun (en fazla ${CHAT_MAX_LENGTH} karakter)` });

    const now = Date.now();
    chatTimestamps = chatTimestamps.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (chatTimestamps.length >= CHAT_RATE_LIMIT) {
      return ack({ error: 'cok hizli mesaj gonderiyorsun, biraz yavasla' });
    }
    chatTimestamps.push(now);

    const message = { id: crypto.randomUUID(), from: username, text, ts: now };

    room.messages.push(message);
    if (room.messages.length > CHAT_HISTORY_LIMIT) room.messages.shift();
    room.seenClientIds.set(clientMessageId, message);
    if (room.seenClientIds.size > CHAT_HISTORY_LIMIT) {
      room.seenClientIds.delete(room.seenClientIds.keys().next().value);
    }

    socket.to(currentRoom).emit('chat-message', message);
    ack({ ok: true, message });
  });

  socket.on('call-friend', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { toUsername } = payload || {};

    const now = Date.now();
    if (now - lastCallAttempt < CALL_COOLDOWN_MS) return ack({ error: 'cok hizli araniyor, biraz bekle' });
    lastCallAttempt = now;

    if (!isValidUsername(toUsername)) return ack({ error: 'gecersiz kullanici adi' });

    const targetSet = onlineUsers.get(toUsername.toLowerCase());
    const targetSocketId = targetSet ? [...targetSet].pop() : null;
    if (!targetSocketId) {
      socket.emit('call-failed', { toUsername, reason: 'offline' });
      return ack({ ok: true });
    }

    if (isUserBusy(toUsername.toLowerCase())) {
      socket.emit('call-failed', { toUsername, reason: 'busy' });
      return ack({ ok: true });
    }

    (async () => {
      const targetUser = await db.getUserByUsername(toUsername);
      if (!targetUser || !(await db.areFriends(userId, targetUser.id))) {
        socket.emit('call-failed', { toUsername, reason: 'not-friends' });
        return ack({ ok: true });
      }

      const roomCode = createRoomEntry();
      const timeoutHandle = startCallTimeout(roomCode);
      pendingCalls.set(roomCode, { callerSocketId: socket.id, calleeSocketId: targetSocketId, timeoutHandle });

      io.to(targetSocketId).emit('incoming-call', { fromUsername: username, roomCode });
      socket.emit('call-ringing', { toUsername, roomCode });
      ack({ ok: true });
    })().catch((err) => {
      console.error('call-friend hatasi:', err.message);
      ack({ error: 'sunucu hatasi' });
    });
  });

  socket.on('call-response', (payload) => {
    const { roomCode, accepted } = payload || {};
    const call = pendingCalls.get(roomCode);
    if (!call || call.calleeSocketId !== socket.id) return;

    clearTimeout(call.timeoutHandle);
    pendingCalls.delete(roomCode);

    if (accepted) {
      io.to(call.callerSocketId).emit('call-accepted', { roomCode });
    } else {
      io.to(call.callerSocketId).emit('call-declined', { byUsername: username });
      cleanupEmptyRoom(roomCode);
    }
  });

  socket.on('cancel-call', (payload) => {
    const { roomCode } = payload || {};
    const call = pendingCalls.get(roomCode);
    if (!call || call.callerSocketId !== socket.id) return;

    clearTimeout(call.timeoutHandle);
    pendingCalls.delete(roomCode);
    io.to(call.calleeSocketId).emit('call-cancelled', { roomCode });
    cleanupEmptyRoom(roomCode);
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom();

    for (const [roomCode, call] of pendingCalls) {
      if (call.callerSocketId === socket.id) {
        clearTimeout(call.timeoutHandle);
        pendingCalls.delete(roomCode);
        io.to(call.calleeSocketId).emit('call-cancelled', { roomCode });
        cleanupEmptyRoom(roomCode);
      } else if (call.calleeSocketId === socket.id) {
        clearTimeout(call.timeoutHandle);
        pendingCalls.delete(roomCode);
        io.to(call.callerSocketId).emit('call-failed', { toUsername: username, reason: 'offline' });
        cleanupEmptyRoom(roomCode);
      }
    }

    removeOnlineSocket(usernameKey, socket.id);
    if (!onlineUsers.has(usernameKey)) {
      notifyFriends(userId, 'friend-offline', { username }).catch((err) => console.error(err.message));
    }
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await db.init();
  console.log(`Veritabani hazir (${db.usingRemote ? 'uzak: Turso' : 'yerel dosya'}).`);
  server.listen(PORT, () => console.log(`Sinyalleşme sunucusu ${PORT} portunda çalışıyor`));
}

const ready = start().catch((err) => {
  console.error('Sunucu baslatilamadi:', err.message);
  process.exit(1);
});

module.exports = { app, server, io, ready };
