require('dotenv').config();

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const db = require('./db');
const cloudinaryStore = require('./cloudinary');
const avatarCatalog = require('./avatar-catalog.json');
const bannerCatalog = require('./banner-catalog.json');

// Kullanicinin bildirdigi Content-Type'a guvenmeden, dosyanin ilk baytlarina
// (magic number) bakarak gercek turunu tespit eder. Yalnizca bu ucu
// destekliyoruz (banner icin GIF de dahil, profil resmi icin degil).
function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF' && (buffer.toString('ascii', 3, 6) === '87a' || buffer.toString('ascii', 3, 6) === '89a')) return 'gif';
  return null;
}

const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const bannerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
function publicAvatar(user) {
  const id = user?.avatar_id;
  if (id === 'phoenix' && user?.username?.toLowerCase() !== 'necr0n') return 'panda';
  if (id === 'custom' && user?.avatar_url) return 'custom';
  return avatarCatalog.some((avatar) => avatar.id === id) ? id : 'panda';
}

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
const MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS = 5 * 60 * 1000;

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
function isAdmin(username) {
  return typeof username === 'string' && username.toLowerCase() === 'necr0n';
}
function isValidServerOrChannelName(v) {
  return typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 40;
}
function isValidInviteCode(v) {
  return typeof v === 'string' && /^[A-F0-9]{6,12}$/i.test(v);
}
function isValidCommunityIcon(v, username) {
  return typeof v === 'string' && avatarCatalog.some((avatar) => avatar.id === v) && (v !== 'phoenix' || username.toLowerCase() === 'necr0n');
}
function isValidChannelType(v) {
  return v === 'text' || v === 'voice';
}
function generateTempPassword() {
  // 0/O/1/I/l gibi karistirilabilir karakterler haric tutuldu; elle iletilecek.
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let pass = '';
  for (let i = 0; i < 12; i++) pass += chars[bytes[i] % chars.length];
  return pass;
}

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map(); // roomCode -> { members, createdAt, messages, seenClientIds, type, ownerUserId, ownerUsername, access, lastNotifiedOpen }
const onlineUsers = new Map(); // usernameLower -> Set<socketId>
const pendingCalls = new Map(); // roomCode -> { callerSocketId, calleeSocketId, timeoutHandle }
const ownerActiveRoom = new Map(); // ownerUserId -> roomCode (sadece sahibin fiilen odada oldugu 'room' tipi odalar)
const gameStatusByUsername = new Map(); // usernameLower -> { game, since } (aninlik, kalici degil, opsiyonel/opt-in)

function gameStatusFields(usernameKey) {
  const entry = gameStatusByUsername.get(usernameKey);
  return { game: entry?.game || null, gameSince: entry?.since || null };
}

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

// Bir kullanicinin baglantisi olsa bile "gorunmez" (invisible) tercihi
// secmisse arkadaslarina/topluluklarina cevrimdisi gibi gorunur.
function isUserOnline(username) {
  const set = onlineUsers.get(username.toLowerCase());
  if (!set) return false;
  for (const socketId of set) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.data.visibility !== 'invisible') return true;
  }
  return false;
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

async function emitToServerMembers(serverId, event, payload) {
  for (const member of await db.listServerMembers(serverId)) {
    emitToUser(member.username, event, payload);
  }
}

async function emitToServerModerators(serverId, event, payload) {
  for (const member of await db.listServerMembers(serverId)) {
    if (member.role === 'owner' || member.role === 'moderator') emitToUser(member.username, event, payload);
  }
}

async function notifyCommunityPresence(userId, username, online) {
  for (const community of await db.listServersForUser(userId)) {
    await emitToServerMembers(community.id, 'server-member-presence', {
      serverId: community.id,
      username,
      online,
    });
  }
}

async function notifyCommunityGameStatus(userId, username, game, gameSince) {
  for (const community of await db.listServersForUser(userId)) {
    await emitToServerMembers(community.id, 'server-member-game-status', {
      serverId: community.id,
      username,
      game,
      gameSince,
    });
  }
}

function channelRoomMembers(room) {
  if (!room) return [];
  return [...room.members].map((sid) => {
    const data = io.sockets.sockets.get(sid)?.data || {};
    return { username: data.username || 'Bilinmeyen', avatarId: data.avatarId || 'panda' };
  });
}

function publishServerChannelCount(room) {
  if (!room || room.type !== 'server-channel') return;
  emitToServerMembers(room.serverId, 'server-channel-count', {
    serverId: room.serverId,
    channelId: room.channelId,
    memberCount: room.members.size,
    members: channelRoomMembers(room),
  }).catch((err) => console.error('kanal kisi sayisi yayinlanamadi:', err.message));
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

function createRoomEntry({ ownerUserId = null, ownerUsername = null, type = 'room' } = {}) {
  const code = generateRoomCode();
  rooms.set(code, {
    members: new Set(),
    createdAt: Date.now(),
    messages: [],
    seenClientIds: new Map(),
    type, // 'room' (kullanicinin olusturdugu oda) | 'call' (birebir arama)
    ownerUserId,
    ownerUsername,
    access: 'invite', // 'invite' | 'friends' - sadece type==='room' icin anlamli
    lastNotifiedOpen: false,
  });
  return code;
}

function cleanupEmptyRoom(code) {
  const room = rooms.get(code);
  if (room && room.members.size === 0) rooms.delete(code);
}

// Bir sunucu sesli kanalinin canli oturumunu dondurur; yoksa olusturur.
// Kod rastgele degil, kanal kimligine sabit baglidir (herkes ayni koda
// varmali) ve rastgele oda kodlarindan (hex) ayirt edilebilsin diye
// alfabetik bir on ek tasir.
function getOrCreateChannelRoom(channel) {
  const code = `CH${channel.id}`;
  let room = rooms.get(code);
  if (!room) {
    room = {
      members: new Set(),
      createdAt: Date.now(),
      messages: [],
      seenClientIds: new Map(),
      type: 'server-channel',
      ownerUserId: null,
      ownerUsername: null,
      access: 'invite',
      lastNotifiedOpen: false,
      serverId: channel.server_id,
      channelId: channel.id,
      channelName: channel.name,
    };
    rooms.set(code, room);
  }
  return code;
}

// Bir katilimciyi (rizasi olsun olmasin) bir odadan sunucu tarafinda cikarir:
// digerlerine 'peer-left' yayinlar (P2P ses baglantisini kesen asil
// mekanizma) ve kendisine 'kicked-from-room' bildirir. Hem soket uzerinden
// gelen kick-participant hem de REST uzerinden gelen sunucu-uyesi cikarma
// akislari bunu paylasir.
function forceKickFromRoom(roomCode, targetSocketId) {
  const room = rooms.get(roomCode);
  if (!room || !room.members.has(targetSocketId)) return;
  room.members.delete(targetSocketId);
  publishServerChannelCount(room);
  io.to(roomCode).emit('peer-left', { id: targetSocketId });
  const targetSocket = io.sockets.sockets.get(targetSocketId);
  if (targetSocket) {
    targetSocket.leave(roomCode);
    // Atilan soketin kendi 'currentRoom' durumu da sifirlanmali; aksi halde
    // ayni odaya/kanala tekrar katilma denemesinde sunucu onu "zaten iceride"
    // sanip room.members'a yeniden eklemeden erken donus yapar (odadan fiilen
    // dusmus olmasina ragmen durum bilgisi eski oday hala gosterirdi).
    if (targetSocket.data.currentRoom === roomCode) targetSocket.data.currentRoom = null;
    targetSocket.emit('kicked-from-room', { roomCode });
  }
  cleanupEmptyRoom(roomCode);
}

// Bir kullanici sunucudan (topluluktan) cikarildiginda/atildiginda, o
// sunucunun herhangi bir sesli kanalinda o an bulunuyorsa oradan da atar.
function kickUserFromServerVoiceChannels(serverId, targetUserId) {
  for (const [code, room] of rooms) {
    if (room.type !== 'server-channel' || room.serverId !== serverId) continue;
    for (const sid of [...room.members]) {
      const s = io.sockets.sockets.get(sid);
      if (s && s.data.userId === targetUserId) forceKickFromRoom(code, sid);
    }
  }
}

// Sahibin, kendi 'room' tipindeki odasinda fiilen (en az bir soketiyle) bulunup
// bulunmadigini kontrol eder. Sahiplik istemciden degil, oda olusturulurken
// sunucuda atanan ownerUserId'den okunur.
function isOwnerInRoom(room) {
  if (!room || !room.ownerUserId) return false;
  for (const sid of room.members) {
    const s = io.sockets.sockets.get(sid);
    if (s && s.data.userId === room.ownerUserId) return true;
  }
  return false;
}

// Bir kullanicinin arkadaslara acik ve fiilen erisilebilir bir odasi varsa
// oda kodunu dondurur; yoksa null. Bu, arkadas-uzerinden-katilim akisinin
// tek yetkili kaynagidir (istemciye guvenilmez).
function getOpenRoomForUser(ownerUserId) {
  const roomCode = ownerActiveRoom.get(ownerUserId);
  if (!roomCode) return null;
  const room = rooms.get(roomCode);
  if (!room || room.type !== 'room' || room.access !== 'friends' || !isOwnerInRoom(room)) return null;
  return roomCode;
}

function refreshOwnerRoomStatus(room) {
  if (!room || room.type !== 'room' || !room.ownerUserId) return;
  const isOpen = !!getOpenRoomForUser(room.ownerUserId);
  if (room.lastNotifiedOpen === isOpen) return;
  room.lastNotifiedOpen = isOpen;
  notifyFriends(room.ownerUserId, 'friend-room-status', { username: room.ownerUsername, roomOpen: isOpen }).catch((err) =>
    console.error('friend-room-status bildirim hatasi:', err.message)
  );
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
    io.to(call.calleeSocketId).emit('call-cancelled', { roomCode, reason: 'timeout' });
    cleanupEmptyRoom(roomCode);
  }, CALL_TIMEOUT_MS);
}

// ---- HTTP API ----

// Giris (brute-force korumasi icin siki) ve kayit (kotuye kullanim onleme icin
// daha gevsek - UNIQUE kisiti zaten hesap spam'ini anlamsizlastirir) ayri limitlere sahip.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
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

function requireAdmin(req, res, next) {
  if (!isAdmin(req.username)) return res.status(403).json({ error: 'yetkisiz' });
  next();
}

app.get('/', (_req, res) => res.send('Sesli sohbet sinyalleşme sunucusu çalışıyor.'));

app.post(
  '/api/register',
  registerLimiter,
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
  loginLimiter,
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

app.get('/api/me', requireAuth, asyncRoute(async (req, res) => {
  const user = await db.getUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
  res.json({
    username: user.username,
    avatarId: publicAvatar(user),
    statusMessage: user.status_message || '',
    visibility: user.visibility === 'invisible' ? 'invisible' : 'online',
    bannerId: user.banner_id || '',
    notes: user.notes || '',
  });
}));

app.post('/api/profile/avatar', requireAuth, friendLimiter, asyncRoute(async (req, res) => {
  const user = await db.getUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
  const { avatarId } = req.body || {};
  if (!avatarCatalog.some((avatar) => avatar.id === avatarId)) return res.status(400).json({ error: 'Gecersiz profil resmi.' });
  if (avatarId === 'phoenix' && user.username.toLowerCase() !== 'necr0n') {
    return res.status(403).json({ error: 'Anka kusu yalnizca necr0n hesabina ozeldir.' });
  }
  const oldPublicId = await db.setAvatar(user.id, avatarId);
  cloudinaryStore.deleteImage(oldPublicId);
  const payload = { username: user.username, avatarId };
  const recipients = new Set(onlineUsers.get(user.username.toLowerCase()) || []);
  for (const sid of recipients) {
    const active = io.sockets.sockets.get(sid);
    if (active) active.data.avatarId = avatarId;
  }
  for (const friend of await db.listFriends(user.id)) {
    for (const sid of onlineUsers.get(friend.username.toLowerCase()) || []) recipients.add(sid);
  }
  for (const room of rooms.values()) {
    if ([...room.members].some((sid) => io.sockets.sockets.get(sid)?.data.userId === user.id)) {
      for (const sid of room.members) recipients.add(sid);
    }
  }
  for (const sid of recipients) io.to(sid).emit('profile-updated', payload);
  res.json(payload);
}));

app.post('/api/profile/banner', requireAuth, friendLimiter, asyncRoute(async (req, res) => {
  const user = await db.getUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
  const { bannerId } = req.body || {};
  if (!bannerCatalog.some((banner) => banner.id === bannerId)) return res.status(400).json({ error: 'Gecersiz banner.' });
  const oldPublicId = await db.setBanner(user.id, bannerId);
  cloudinaryStore.deleteImage(oldPublicId);
  const payload = { username: user.username, bannerId };
  const recipients = new Set(onlineUsers.get(user.username.toLowerCase()) || []);
  for (const sid of recipients) {
    const active = io.sockets.sockets.get(sid);
    if (active) active.data.bannerId = bannerId;
  }
  for (const friend of await db.listFriends(user.id)) {
    for (const sid of onlineUsers.get(friend.username.toLowerCase()) || []) recipients.add(sid);
  }
  for (const room of rooms.values()) {
    if ([...room.members].some((sid) => io.sockets.sockets.get(sid)?.data.userId === user.id)) {
      for (const sid of room.members) recipients.add(sid);
    }
  }
  for (const sid of recipients) io.to(sid).emit('profile-updated', payload);
  res.json(payload);
}));

function broadcastProfileUpdate(user, payload) {
  const recipients = new Set(onlineUsers.get(user.username.toLowerCase()) || []);
  for (const sid of recipients) {
    const active = io.sockets.sockets.get(sid);
    if (active) {
      if ('avatarId' in payload) active.data.avatarId = payload.avatarId;
      if ('bannerId' in payload) active.data.bannerId = payload.bannerId;
    }
  }
  db.listFriends(user.id).then((friends) => {
    for (const friend of friends) {
      for (const sid of onlineUsers.get(friend.username.toLowerCase()) || []) recipients.add(sid);
    }
    for (const room of rooms.values()) {
      if ([...room.members].some((sid) => io.sockets.sockets.get(sid)?.data.userId === user.id)) {
        for (const sid of room.members) recipients.add(sid);
      }
    }
    for (const sid of recipients) io.to(sid).emit('profile-updated', payload);
  });
}

app.post(
  '/api/profile/avatar-upload',
  requireAuth,
  friendLimiter,
  avatarUpload.single('avatar'),
  asyncRoute(async (req, res) => {
    if (!cloudinaryStore.configured) return res.status(503).json({ error: 'gorsel yukleme su an yapilandirilmamis' });
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
    if (!req.file) return res.status(400).json({ error: 'dosya bulunamadi' });
    const type = detectImageType(req.file.buffer);
    if (type !== 'png' && type !== 'jpeg') return res.status(400).json({ error: 'yalnizca PNG veya JPEG yukleyebilirsin' });

    const result = await cloudinaryStore.uploadImage(req.file.buffer, 'alo-app/avatars');
    const oldPublicId = await db.setAvatarUpload(user.id, result.secure_url, result.public_id);
    cloudinaryStore.deleteImage(oldPublicId);

    const payload = { username: user.username, avatarId: 'custom' };
    broadcastProfileUpdate(user, payload);
    res.json(payload);
  })
);

app.post(
  '/api/profile/banner-upload',
  requireAuth,
  friendLimiter,
  bannerUpload.single('banner'),
  asyncRoute(async (req, res) => {
    if (!cloudinaryStore.configured) return res.status(503).json({ error: 'gorsel yukleme su an yapilandirilmamis' });
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
    if (!req.file) return res.status(400).json({ error: 'dosya bulunamadi' });
    const type = detectImageType(req.file.buffer);
    if (type !== 'png' && type !== 'jpeg' && type !== 'gif') {
      return res.status(400).json({ error: 'yalnizca PNG, JPEG veya GIF yukleyebilirsin' });
    }

    const result = await cloudinaryStore.uploadImage(req.file.buffer, 'alo-app/banners');
    const oldPublicId = await db.setBannerUpload(user.id, result.secure_url, result.public_id);
    cloudinaryStore.deleteImage(oldPublicId);

    const payload = { username: user.username, bannerId: 'custom' };
    broadcastProfileUpdate(user, payload);
    res.json(payload);
  })
);

// Yuklenen profil resmi/banner gorsellerini sunar - Discord vb. uygulamalardaki
// avatar CDN'leri gibi kimlik dogrulama gerektirmez (hassas veri degildir);
// yalnizca gercek Cloudinary adresine yonlendirir, dosyayi kendimiz saklamayiz.
app.get('/api/images/avatar/:username', asyncRoute(async (req, res) => {
  if (!isValidUsername(req.params.username)) return res.status(404).end();
  const url = await db.getAvatarUrlByUsername(req.params.username);
  if (!url) return res.status(404).end();
  res.redirect(url);
}));

app.get('/api/images/banner/:username', asyncRoute(async (req, res) => {
  if (!isValidUsername(req.params.username)) return res.status(404).end();
  const url = await db.getBannerUrlByUsername(req.params.username);
  if (!url) return res.status(404).end();
  res.redirect(url);
}));

app.post('/api/profile/notes', requireAuth, friendLimiter, asyncRoute(async (req, res) => {
  const user = await db.getUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
  const { notes } = req.body || {};
  if (typeof notes !== 'string' || notes.length > 20000) return res.status(400).json({ error: 'Gecersiz not.' });
  await db.setNotes(user.id, notes);
  res.json({ notes });
}));

app.post('/api/profile/password', requireAuth, loginLimiter, asyncRoute(async (req, res) => {
  const user = await db.getUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
  const { currentPassword, newPassword } = req.body || {};
  if (!isNonEmptyString(currentPassword, 72) || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'mevcut sifre hatali' });
  }
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ error: 'yeni sifre en az 6 karakter olmali' });
  }
  await db.setPasswordHash(user.id, bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
}));

app.post('/api/profile/status', requireAuth, friendLimiter, asyncRoute(async (req, res) => {
  const user = await db.getUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
  const { statusMessage } = req.body || {};
  if (typeof statusMessage !== 'string' || statusMessage.length > 60) {
    return res.status(400).json({ error: 'durum mesaji en fazla 60 karakter olabilir' });
  }
  const clean = statusMessage.trim();
  await db.setStatusMessage(user.id, clean);
  const payload = { username: user.username, statusMessage: clean };
  const recipients = new Set(onlineUsers.get(user.username.toLowerCase()) || []);
  for (const friend of await db.listFriends(user.id)) {
    for (const sid of onlineUsers.get(friend.username.toLowerCase()) || []) recipients.add(sid);
  }
  for (const room of rooms.values()) {
    if ([...room.members].some((sid) => io.sockets.sockets.get(sid)?.data.userId === user.id)) {
      for (const sid of room.members) recipients.add(sid);
    }
  }
  for (const sid of recipients) io.to(sid).emit('friend-status-message', payload);
  res.json(payload);
}));

app.post('/api/profile/visibility', requireAuth, friendLimiter, asyncRoute(async (req, res) => {
  const user = await db.getUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'gecersiz oturum' });
  const { visibility } = req.body || {};
  if (visibility !== 'online' && visibility !== 'invisible') {
    return res.status(400).json({ error: 'gecersiz durum' });
  }
  const wasVisible = isUserOnline(user.username);
  await db.setVisibility(user.id, visibility);
  const usernameKey = user.username.toLowerCase();
  for (const sid of onlineUsers.get(usernameKey) || []) {
    const active = io.sockets.sockets.get(sid);
    if (active) active.data.visibility = visibility;
  }
  // Bu degisiklik baskalarinin gordugu cevrimici/cevrimdisi durumunu fiilen
  // degistiriyorsa (yalnizca kullanici o an bagliysa gecerli), arkadaslara
  // ve topluluklara ayni "friend-online"/"friend-offline" olaylariyla
  // haber verilir - istemci tarafinda ekstra bir dinleyici gerekmez.
  const isNowVisible = isUserOnline(user.username);
  if (wasVisible !== isNowVisible) {
    const event = isNowVisible ? 'friend-online' : 'friend-offline';
    notifyFriends(user.id, event, { username: user.username }).catch((err) => console.error(err.message));
    notifyCommunityPresence(user.id, user.username, isNowVisible).catch((err) => console.error(err.message));
  }
  res.json({ ok: true, visibility });
}));

const METERED_ICE_CACHE_MS = 60 * 60 * 1000; // Metered kimlik bilgileri saatlerce gecerli; her istekte cekmeye gerek yok.
let meteredIceCache = null; // { servers, fetchedAt }

async function fetchMeteredIceServers() {
  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;
  if (!appName || !apiKey) return null;

  if (meteredIceCache && Date.now() - meteredIceCache.fetchedAt < METERED_ICE_CACHE_MS) {
    return meteredIceCache.servers;
  }
  try {
    const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`metered ${res.status}`);
    const servers = await res.json();
    if (!Array.isArray(servers) || servers.length === 0) throw new Error('beklenmeyen yanit');
    meteredIceCache = { servers, fetchedAt: Date.now() };
    return servers;
  } catch (err) {
    console.error('metered TURN kimlik bilgisi alinamadi:', err.message);
    // Eski onbellek varsa (suresi gecmis olsa da) tamamen sesiz kalmaktansa onu kullan.
    return meteredIceCache ? meteredIceCache.servers : null;
  }
}

app.get(
  '/api/ice-servers',
  requireAuth,
  asyncRoute(async (_req, res) => {
    const metered = await fetchMeteredIceServers();
    if (metered) {
      return res.json({ iceServers: metered });
    }

    // Metered yapilandirilmamissa/ulasilamazsa eski statik TURN_URL yontemine dus.
    const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (process.env.TURN_URL) {
      // Birden fazla TURN adresi (farkli port/protokol) virgulle ayrilarak
      // TURN_URL icinde verilebilir; kisitlayici aglarda (ornegin UDP engelli)
      // TCP/443 secenegi baglanmayi kurtarabilir.
      const urls = process.env.TURN_URL.split(',').map((u) => u.trim()).filter(Boolean);
      iceServers.push({
        urls: urls.length > 1 ? urls : urls[0],
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
    res.json({ iceServers });
  })
);

app.get(
  '/api/friends',
  requireAuth,
  asyncRoute(async (req, res) => {
    const friendRows = await db.listFriends(req.userId);
    const dmPins = await db.listDmPins(req.userId);
    const friends = friendRows.map((f) => ({
      username: f.username,
      avatarId: publicAvatar(f),
      bannerId: f.banner_id || '',
      online: isUserOnline(f.username),
      roomOpen: !!getOpenRoomForUser(f.id),
      statusMessage: f.status_message || '',
      pinned: dmPins.has(f.id),
      ...gameStatusFields(f.username.toLowerCase()),
    }));
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
    if (await db.isEitherUserBlocked(req.userId, target.id)) return res.status(403).json({ error: 'bu kullaniciyla etkilesim engellendi' });
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
    if (await db.isEitherUserBlocked(req.userId, from.id)) return res.status(403).json({ error: 'bu kullaniciyla etkilesim engellendi' });

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

// ---- Engelleme ve sikayet ----

app.get(
  '/api/blocks',
  requireAuth,
  asyncRoute(async (req, res) => {
    const rows = await db.listBlockedUsers(req.userId);
    res.json({ users: rows.map((row) => ({ username: row.username, avatarId: publicAvatar(row), blockedAt: Number(row.created_at) })) });
  })
);

app.post(
  '/api/blocks/:username',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const targetUsername = req.params.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    if (target.id === req.userId) return res.status(400).json({ error: 'kendini engelleyemezsin' });
    await db.blockUser(req.userId, target.id);
    emitToUser(target.username, 'friend-removed', { username: req.username });
    res.json({ ok: true });
  })
);

app.delete(
  '/api/blocks/:username',
  requireAuth,
  asyncRoute(async (req, res) => {
    const target = await db.getUserByUsername(req.params.username);
    if (target) await db.unblockUser(req.userId, target.id);
    res.json({ ok: true });
  })
);

app.post(
  '/api/reports',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const { username: targetUsername, serverId, reason } = req.body || {};
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (cleanReason.length < 3 || cleanReason.length > 500) return res.status(400).json({ error: 'sikayet nedeni 3-500 karakter olmali' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target || target.id === req.userId) return res.status(400).json({ error: 'gecersiz hedef kullanici' });
    let validServerId = null;
    if (serverId !== undefined && serverId !== null) {
      validServerId = Number(serverId);
      if (!(await db.getServerMember(validServerId, req.userId)) || !(await db.getServerMember(validServerId, target.id))) {
        return res.status(403).json({ error: 'bu topluluk icin sikayet olusturamazsin' });
      }
    }
    await db.createUserReport(req.userId, target.id, validServerId, cleanReason);
    res.json({ ok: true });
  })
);

// ---- Ozel mesajlar (DM) ----
// Yalnizca mevcut arkadaslar arasinda; kalici (veritabaninda), gonderen her
// zaman sunucu tarafindan dogrulanan JWT kimligi. Sunucu, istemcinin
// bildirdigi gonderen bilgisine hicbir zaman guvenmez.

app.get(
  '/api/dm/conversations',
  requireAuth,
  asyncRoute(async (req, res) => {
    const friends = await db.listFriends(req.userId);
    const dmPins = await db.listDmPins(req.userId);
    const conversations = await Promise.all(
      friends.map(async (friend) => {
        const last = await db.getLastDirectMessage(req.userId, friend.id);
        const unreadCount = await db.countUnreadDirectMessages(req.userId, friend.id);
        return {
          username: friend.username,
          avatarId: publicAvatar(friend),
          bannerId: friend.banner_id || '',
          online: isUserOnline(friend.username),
          statusMessage: friend.status_message || '',
          ...gameStatusFields(friend.username.toLowerCase()),
          lastText: last ? last.text : null,
          lastAt: last ? Number(last.created_at) : null,
          lastFromSelf: last ? Number(last.from_user_id) === req.userId : null,
          unreadCount,
          pinned: dmPins.has(friend.id),
          pinnedAt: dmPins.get(friend.id) || null,
        };
      })
    );
    conversations.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned) return b.pinnedAt - a.pinnedAt;
      return 0;
    });
    res.json({ conversations });
  })
);

app.get(
  '/api/dm/:username/messages',
  requireAuth,
  asyncRoute(async (req, res) => {
    const targetUsername = req.params.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    if (!(await db.areFriends(req.userId, target.id))) {
      return res.status(403).json({ error: 'bu kullaniciyla arkadas degilsiniz' });
    }

    const beforeRaw = Number(req.query.before);
    const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;
    const rows = await db.getDirectMessages(req.userId, target.id, { before, limit: 50 });
    res.json({
      messages: rows.map((m) => ({
        id: m.id,
        from: Number(m.from_user_id) === req.userId ? req.username : target.username,
        text: m.text,
        ts: Number(m.created_at),
      })),
    });
  })
);

app.post(
  '/api/dm/:username/read',
  requireAuth,
  asyncRoute(async (req, res) => {
    const targetUsername = req.params.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    await db.markDmRead(req.userId, target.id, Date.now());
    res.json({ ok: true });
  })
);

app.post(
  '/api/dm/:username/pin',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const targetUsername = req.params.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    if (!(await db.areFriends(req.userId, target.id))) {
      return res.status(403).json({ error: 'bu kullaniciyla arkadas degilsiniz' });
    }
    const { pinned } = req.body || {};
    if (pinned) await db.pinDm(req.userId, target.id);
    else await db.unpinDm(req.userId, target.id);
    res.json({ ok: true, pinned: !!pinned });
  })
);

// ---- Yonetim paneli (yalnizca necr0n hesabi) ----

app.get(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const users = await db.listAllUsers();
    res.json({
      users: users.map((u) => ({
        username: u.username,
        avatarId: publicAvatar(u),
        createdAt: u.created_at,
        friendCount: Number(u.friend_count),
        online: isUserOnline(u.username),
      })),
    });
  })
);

app.get(
  '/api/admin/reports',
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const reports = await db.listOpenReports();
    res.json({ reports: reports.map((row) => ({ ...row, created_at: Number(row.created_at) })) });
  })
);

app.post(
  '/api/admin/reports/:reportId/resolve',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const reportId = Number(req.params.reportId);
    if (!Number.isInteger(reportId) || reportId < 1) return res.status(400).json({ error: 'gecersiz sikayet' });
    const resolved = await db.resolveUserReport(reportId);
    if (!resolved) return res.status(404).json({ error: 'acik sikayet bulunamadi' });
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/users/:username/reset-password',
  requireAuth,
  requireAdmin,
  loginLimiter,
  asyncRoute(async (req, res) => {
    const targetUsername = req.params.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });

    const tempPassword = generateTempPassword();
    await db.setPasswordHash(target.id, bcrypt.hashSync(tempPassword, 10));
    // Sifre yalnizca bu cevapta bir kez donuyor; hicbir yerde duz metin olarak saklanmiyor/loglanmiyor.
    res.json({ ok: true, tempPassword });
  })
);

app.delete(
  '/api/admin/users/:username',
  requireAuth,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const targetUsername = req.params.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    if (targetUsername.toLowerCase() === req.username.toLowerCase()) {
      return res.status(400).json({ error: 'kendi hesabini bu yoldan silemezsin' });
    }
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });

    // Cevrimiciyse soket baglantilarini kes; silinen hesap uzerinden islem yapmaya devam edemesin.
    const socketIds = onlineUsers.get(targetUsername.toLowerCase());
    if (socketIds) {
      for (const sid of [...socketIds]) {
        io.sockets.sockets.get(sid)?.disconnect(true);
      }
    }

    await db.deleteUserAccount(target.id);
    res.json({ ok: true });
  })
);

// ---- Sunucular (topluluklar) ----
// Not: metin kanallari bu surumde yok, yalnizca sesli kanallar. Yetkilendirme
// her zaman sunucuda server_members tablosundan okunur, istemciye guvenilmez.

function publicServerMember(row) {
  return {
    username: row.username,
    avatarId: publicAvatar(row),
    bannerId: row.banner_id || '',
    statusMessage: row.status_message || '',
    ...gameStatusFields(row.username.toLowerCase()),
    role: row.role,
    online: isUserOnline(row.username),
  };
}

async function requireServerMembership(req, res, serverId) {
  const server = await db.getServerById(serverId);
  if (!server) {
    res.status(404).json({ error: 'topluluk bulunamadi' });
    return null;
  }
  const member = await db.getServerMember(serverId, req.userId);
  if (!member) {
    res.status(403).json({ error: 'bu toplulugun uyesi degilsin' });
    return null;
  }
  return { server, member };
}

app.post(
  '/api/servers',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const { name } = req.body || {};
    if (!isValidServerOrChannelName(name)) return res.status(400).json({ error: 'gecersiz topluluk adi (2-40 karakter)' });
    const { serverId, defaultChannelId } = await db.createServer(name.trim(), req.userId);
    const server = await db.getServerById(serverId);
    await db.addServerAuditLog(serverId, req.userId, 'community_created', server.name);
    res.json({
      id: server.id,
      name: server.name,
      iconId: server.icon_id,
      inviteCode: server.invite_code,
      role: 'owner',
      defaultChannelId,
    });
  })
);

app.get(
  '/api/servers',
  requireAuth,
  asyncRoute(async (req, res) => {
    const rows = await db.listServersForUserWithUnread(req.userId);
    res.json({
      servers: rows.map((s) => ({
        id: s.id,
        name: s.name,
        iconId: s.icon_id,
        role: s.role,
        isOwner: s.owner_user_id === req.userId,
        unreadCount: Number(s.unread_count) || 0,
        pinned: s.pinned_at != null,
      })),
    });
  })
);

app.post(
  '/api/servers/:id/pin',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    const { pinned } = req.body || {};
    await db.setServerPinned(req.userId, serverId, !!pinned);
    res.json({ ok: true, pinned: !!pinned });
  })
);

app.post(
  '/api/servers/join',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const { inviteCode } = req.body || {};
    if (!isValidInviteCode(inviteCode)) return res.status(400).json({ error: 'gecersiz davet kodu' });
    const server = await db.getServerByInviteCode(inviteCode.toUpperCase());
    if (!server) return res.status(404).json({ error: 'davet kodu gecersiz' });
    if (await db.getServerBan(server.id, req.userId)) return res.status(403).json({ error: 'bu topluluktan yasaklandin' });
    const already = await db.getServerMember(server.id, req.userId);
    if (already) return res.status(409).json({ error: 'zaten bu toplulugun uyesisin' });
    if (server.join_approval_required) {
      if (await db.getJoinRequest(server.id, req.userId)) {
        return res.status(409).json({ error: 'katilim istegin zaten gonderildi, onay bekleniyor' });
      }
      await db.createJoinRequest(server.id, req.userId, req.userId);
      await emitToServerModerators(server.id, 'server-join-request', { serverId: server.id, username: req.username });
      return res.json({ pending: true, id: server.id, name: server.name });
    }
    await db.addServerMember(server.id, req.userId, 'member');
    await db.addServerAuditLog(server.id, req.userId, 'member_joined', req.username);
    emitToServerMembers(server.id, 'server-members-updated', { serverId: server.id }).catch(() => {});
    res.json({ id: server.id, name: server.name, iconId: server.icon_id, role: 'member' });
  })
);

app.get(
  '/api/servers/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    const [members, channels, unreadByChannel] = await Promise.all([
      db.listServerMembers(serverId),
      db.listChannels(serverId),
      db.getUnreadCountsByChannel(serverId, req.userId),
    ]);
    res.json({
      id: ctx.server.id,
      name: ctx.server.name,
      iconId: ctx.server.icon_id,
      role: ctx.member.role,
      inviteCode: ctx.member.role === 'owner' ? ctx.server.invite_code : undefined,
      joinApprovalRequired: !!ctx.server.join_approval_required,
      members: members.map(publicServerMember),
      channels: channels.map((c) =>
        c.type === 'text'
          ? { id: c.id, name: c.name, type: 'text', position: Number(c.position), unreadCount: unreadByChannel.get(c.id) || 0 }
          : {
              id: c.id,
              name: c.name,
              type: 'voice',
              position: Number(c.position),
              memberCount: rooms.get(`CH${c.id}`)?.members.size || 0,
              members: channelRoomMembers(rooms.get(`CH${c.id}`)),
            }
      ),
    });
  })
);

app.post(
  '/api/servers/:id/channels',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') {
      return res.status(403).json({ error: 'yalnizca topluluk sahibi veya moderator kanal olusturabilir' });
    }
    const { name, type } = req.body || {};
    if (!isValidServerOrChannelName(name)) return res.status(400).json({ error: 'gecersiz kanal adi (2-40 karakter)' });
    const channelType = type === undefined ? 'text' : type;
    if (!isValidChannelType(channelType)) return res.status(400).json({ error: "kanal turu 'text' veya 'voice' olmali" });
    const channelId = await db.createChannel(serverId, name.trim(), channelType);
    const createdChannel = await db.getChannelById(channelId);
    const payload =
      channelType === 'text'
        ? { id: channelId, name: name.trim(), type: 'text', position: Number(createdChannel.position), unreadCount: 0 }
        : { id: channelId, name: name.trim(), type: 'voice', position: Number(createdChannel.position), memberCount: 0 };
    await db.addServerAuditLog(serverId, req.userId, 'channel_created', name.trim(), channelType);
    for (const m of await db.listServerMembers(serverId)) emitToUser(m.username, 'server-channel-created', { serverId, channel: payload });
    res.json(payload);
  })
);

app.delete(
  '/api/servers/:id/channels/:channelId',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const channelId = Number(req.params.channelId);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') {
      return res.status(403).json({ error: 'yalnizca sahip veya moderator kanal silebilir' });
    }
    const channel = await db.getChannelById(channelId);
    if (!channel || channel.server_id !== serverId) return res.status(404).json({ error: 'kanal bulunamadi' });

    const roomCode = `CH${channelId}`;
    const room = rooms.get(roomCode);
    if (room) {
      for (const sid of [...room.members]) forceKickFromRoom(roomCode, sid);
      rooms.delete(roomCode);
    }
    await db.deleteChannel(channelId);
    await db.addServerAuditLog(serverId, req.userId, 'channel_deleted', channel.name, channel.type);
    for (const m of await db.listServerMembers(serverId)) emitToUser(m.username, 'server-channel-deleted', { serverId, channelId });
    res.json({ ok: true });
  })
);

// Bir metin kanali islemi icin uyelik VE kanalin gercekten o topluluga ait
// oldugunu dogrular; channelId'nin baska bir topluluga ait olma ihtimaline
// karsi server_id her zaman kanal satirindan (istemciden degil) okunur.
async function requireTextChannelAccess(req, res, serverId, channelId) {
  const channel = await db.getChannelById(channelId);
  if (!channel || channel.type !== 'text' || channel.server_id !== serverId) {
    res.status(404).json({ error: 'kanal bulunamadi' });
    return null;
  }
  const member = await db.getServerMember(serverId, req.userId);
  if (!member) {
    res.status(403).json({ error: 'bu toplulugun uyesi degilsin' });
    return null;
  }
  return { channel, member };
}

app.get(
  '/api/servers/:id/channels/:channelId/messages',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const channelId = Number(req.params.channelId);
    const ctx = await requireTextChannelAccess(req, res, serverId, channelId);
    if (!ctx) return;
    const beforeRaw = Number(req.query.before);
    const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;
    const rows = await db.getServerMessages(channelId, req.userId, { before, limit: 50 });
    res.json({
      messages: rows.map((m) => ({
        id: m.id,
        channelId,
        from: m.username,
        avatarId: publicAvatar(m),
        text: m.text,
        ts: Number(m.created_at),
      })),
    });
  })
);

app.post(
  '/api/servers/:id/channels/:channelId/read',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const channelId = Number(req.params.channelId);
    const ctx = await requireTextChannelAccess(req, res, serverId, channelId);
    if (!ctx) return;
    await db.markChannelRead(req.userId, channelId, Date.now());
    res.json({ ok: true });
  })
);

app.post(
  '/api/servers/:id/settings',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner') return res.status(403).json({ error: 'yalnizca sahip topluluk ayarlarini degistirebilir' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ctx.server.name;
    const iconId = req.body?.iconId === undefined ? ctx.server.icon_id : req.body.iconId;
    if (!isValidServerOrChannelName(name)) return res.status(400).json({ error: 'gecersiz topluluk adi (2-40 karakter)' });
    if (!isValidCommunityIcon(iconId, req.username)) return res.status(400).json({ error: 'gecersiz topluluk simgesi' });
    await db.updateServerProfile(serverId, { name, iconId });
    if (req.body?.joinApprovalRequired !== undefined) {
      await db.setServerJoinApproval(serverId, !!req.body.joinApprovalRequired);
    }
    await db.addServerAuditLog(serverId, req.userId, 'community_updated', name, iconId);
    await emitToServerMembers(serverId, 'server-updated', { serverId, name, iconId });
    res.json({ ok: true, name, iconId, joinApprovalRequired: !!req.body?.joinApprovalRequired });
  })
);

// Sade bir uye, davet kodunu kopyalamak zorunda kalmadan arkadaslarindan
// birini toplulugu dogrudan davet edebilir. Topluluk "katilim onayi"
// istiyorsa bu bir istek olusturur (davet kodu ile katilimla ayni kuyruk),
// istemiyorsa arkadas dogrudan uye olarak eklenir.
app.post(
  '/api/servers/:id/invite-friend',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    const targetUsername = req.body?.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    if (!(await db.areFriends(req.userId, target.id))) {
      return res.status(403).json({ error: 'yalnizca arkadaslarini davet edebilirsin' });
    }
    if (await db.getServerBan(serverId, target.id)) return res.status(403).json({ error: 'bu kullanici topluluktan yasaklanmis' });
    if (await db.getServerMember(serverId, target.id)) return res.status(409).json({ error: 'zaten bu toplulugun uyesi' });

    if (ctx.server.join_approval_required) {
      if (await db.getJoinRequest(serverId, target.id)) {
        return res.status(409).json({ error: 'bu kullanici icin zaten bekleyen bir istek var' });
      }
      await db.createJoinRequest(serverId, target.id, req.userId);
      await emitToServerModerators(serverId, 'server-join-request', { serverId, username: target.username });
      emitToUser(target.username, 'server-invite-received', { serverId, serverName: ctx.server.name, fromUsername: req.username, pending: true });
      return res.json({ ok: true, pending: true });
    }

    await db.addServerMember(serverId, target.id, 'member');
    await db.addServerAuditLog(serverId, req.userId, 'member_invited', target.username);
    emitToServerMembers(serverId, 'server-members-updated', { serverId }).catch(() => {});
    emitToUser(target.username, 'server-invite-received', { serverId, serverName: ctx.server.name, fromUsername: req.username, pending: false });
    res.json({ ok: true, pending: false });
  })
);

app.get(
  '/api/servers/:id/join-requests',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') return res.status(403).json({ error: 'yetkin yok' });
    const rows = await db.listJoinRequests(serverId);
    res.json({
      requests: rows.map((r) => ({
        username: r.username,
        avatarId: publicAvatar(r),
        requestedBy: r.requested_by_username,
        createdAt: Number(r.created_at),
      })),
    });
  })
);

app.post(
  '/api/servers/:id/join-requests/:username/approve',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') return res.status(403).json({ error: 'yetkin yok' });
    const target = await db.getUserByUsername(req.params.username);
    if (!target || !(await db.getJoinRequest(serverId, target.id))) return res.status(404).json({ error: 'istek bulunamadi' });
    await db.deleteJoinRequest(serverId, target.id);
    await db.addServerMember(serverId, target.id, 'member');
    await db.addServerAuditLog(serverId, req.userId, 'join_request_approved', target.username);
    emitToServerMembers(serverId, 'server-members-updated', { serverId }).catch(() => {});
    emitToUser(target.username, 'server-join-approved', { serverId, serverName: ctx.server.name });
    res.json({ ok: true });
  })
);

app.post(
  '/api/servers/:id/join-requests/:username/deny',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') return res.status(403).json({ error: 'yetkin yok' });
    const target = await db.getUserByUsername(req.params.username);
    if (!target || !(await db.getJoinRequest(serverId, target.id))) return res.status(404).json({ error: 'istek bulunamadi' });
    await db.deleteJoinRequest(serverId, target.id);
    await db.addServerAuditLog(serverId, req.userId, 'join_request_denied', target.username);
    emitToUser(target.username, 'server-join-denied', { serverId, serverName: ctx.server.name });
    res.json({ ok: true });
  })
);

app.post(
  '/api/servers/:id/channels/:channelId/rename',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const channelId = Number(req.params.channelId);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') return res.status(403).json({ error: 'yetkin yok' });
    const channel = await db.getChannelById(channelId);
    if (!channel || Number(channel.server_id) !== serverId) return res.status(404).json({ error: 'kanal bulunamadi' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!isValidServerOrChannelName(name)) return res.status(400).json({ error: 'gecersiz kanal adi (2-40 karakter)' });
    await db.renameChannel(channelId, name);
    await db.addServerAuditLog(serverId, req.userId, 'channel_renamed', channel.name, name);
    await emitToServerMembers(serverId, 'server-channel-updated', { serverId, channelId, name });
    res.json({ ok: true, name });
  })
);

app.post(
  '/api/servers/:id/channels/reorder',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') return res.status(403).json({ error: 'yetkin yok' });
    const channelIds = Array.isArray(req.body?.channelIds) ? req.body.channelIds.map(Number) : [];
    const channels = await db.listChannels(serverId);
    const expected = channels.map((channel) => Number(channel.id)).sort((a, b) => a - b);
    const received = [...channelIds].sort((a, b) => a - b);
    if (channelIds.length !== expected.length || new Set(channelIds).size !== channelIds.length || expected.some((id, index) => id !== received[index])) {
      return res.status(400).json({ error: 'kanal sirasi tum kanallari tam olarak icermeli' });
    }
    await db.reorderChannels(serverId, channelIds);
    await db.addServerAuditLog(serverId, req.userId, 'channels_reordered');
    await emitToServerMembers(serverId, 'server-channels-reordered', { serverId, channelIds });
    res.json({ ok: true });
  })
);

app.post(
  '/api/servers/:id/transfer',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner') return res.status(403).json({ error: 'yalnizca sahip sahipligi devredebilir' });
    const targetUsername = req.body?.username;
    if (!isValidUsername(targetUsername) || targetUsername.toLowerCase() === req.username.toLowerCase()) return res.status(400).json({ error: 'gecersiz hedef kullanici' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target || !(await db.getServerMember(serverId, target.id))) return res.status(404).json({ error: 'hedef topluluk uyesi degil' });
    await db.transferServerOwnership(serverId, req.userId, target.id);
    await db.addServerAuditLog(serverId, req.userId, 'ownership_transferred', target.username);
    await emitToServerMembers(serverId, 'server-owner-transferred', { serverId, oldOwner: req.username, newOwner: target.username });
    res.json({ ok: true });
  })
);

app.get(
  '/api/servers/:id/audit-log',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') return res.status(403).json({ error: 'yetkin yok' });
    const rows = await db.listServerAuditLog(serverId);
    res.json({ entries: rows.map((row) => ({ ...row, created_at: Number(row.created_at) })) });
  })
);

app.post(
  '/api/servers/:id/invite/regenerate',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner') return res.status(403).json({ error: 'yalnizca sahip davet kodunu yenileyebilir' });
    const inviteCode = await db.regenerateInviteCode(serverId);
    await db.addServerAuditLog(serverId, req.userId, 'invite_regenerated');
    res.json({ inviteCode });
  })
);

app.post(
  '/api/servers/:id/members/:username/role',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner') return res.status(403).json({ error: 'yalnizca sahip rol degistirebilir' });
    const { role } = req.body || {};
    if (role !== 'member' && role !== 'moderator') return res.status(400).json({ error: 'gecersiz rol' });
    const targetUsername = req.params.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    if (target.id === req.userId) return res.status(400).json({ error: 'kendi rolunu degistiremezsin' });
    const targetMember = await db.getServerMember(serverId, target.id);
    if (!targetMember) return res.status(404).json({ error: 'kullanici bu toplulugun uyesi degil' });
    await db.setServerMemberRole(serverId, target.id, role);
    await db.addServerAuditLog(serverId, req.userId, 'member_role_changed', target.username, role);
    emitToUser(target.username, 'server-role-changed', { serverId, role });
    res.json({ ok: true, role });
  })
);

app.post(
  '/api/servers/:id/members/:username/remove',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    const targetUsername = req.params.username;
    if (!isValidUsername(targetUsername)) return res.status(400).json({ error: 'gecersiz kullanici adi' });
    const target = await db.getUserByUsername(targetUsername);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    if (target.id === req.userId) return res.status(400).json({ error: 'kendini bu yoldan cikaramazsin' });
    const targetMember = await db.getServerMember(serverId, target.id);
    if (!targetMember) return res.status(404).json({ error: 'kullanici bu toplulugun uyesi degil' });

    const requesterIsOwner = ctx.member.role === 'owner';
    const requesterIsMod = ctx.member.role === 'moderator';
    if (targetMember.role === 'owner') return res.status(403).json({ error: 'sahip cikarilamaz' });
    if (!requesterIsOwner && !(requesterIsMod && targetMember.role === 'member')) {
      return res.status(403).json({ error: 'bu kullaniciyi cikarma yetkin yok' });
    }

    await db.removeServerMember(serverId, target.id);
    await db.addServerAuditLog(serverId, req.userId, 'member_removed', target.username);
    kickUserFromServerVoiceChannels(serverId, target.id);
    emitToUser(target.username, 'server-removed', { serverId });
    res.json({ ok: true });
  })
);

app.get(
  '/api/servers/:id/bans',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') return res.status(403).json({ error: 'yetkin yok' });
    const bans = await db.listServerBans(serverId);
    res.json({ bans: bans.map((row) => ({ username: row.username, avatarId: publicAvatar(row), reason: row.reason, bannedBy: row.banned_by, createdAt: Number(row.created_at) })) });
  })
);

app.post(
  '/api/servers/:id/members/:username/ban',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    const target = await db.getUserByUsername(req.params.username);
    if (!target) return res.status(404).json({ error: 'kullanici bulunamadi' });
    const targetMember = await db.getServerMember(serverId, target.id);
    if (!targetMember) return res.status(404).json({ error: 'kullanici bu toplulugun uyesi degil' });
    if (targetMember.role === 'owner' || target.id === req.userId) return res.status(403).json({ error: 'bu kullanici yasaklanamaz' });
    const allowed = ctx.member.role === 'owner' || (ctx.member.role === 'moderator' && targetMember.role === 'member');
    if (!allowed) return res.status(403).json({ error: 'bu kullaniciyi yasaklama yetkin yok' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
    await db.banServerMember(serverId, target.id, req.userId, reason);
    await db.addServerAuditLog(serverId, req.userId, 'member_banned', target.username, reason);
    kickUserFromServerVoiceChannels(serverId, target.id);
    emitToUser(target.username, 'server-removed', { serverId, banned: true });
    await emitToServerMembers(serverId, 'server-members-updated', { serverId });
    res.json({ ok: true });
  })
);

app.delete(
  '/api/servers/:id/bans/:username',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner' && ctx.member.role !== 'moderator') return res.status(403).json({ error: 'yetkin yok' });
    const target = await db.getUserByUsername(req.params.username);
    if (target) await db.unbanServerMember(serverId, target.id);
    await db.addServerAuditLog(serverId, req.userId, 'member_unbanned', req.params.username);
    res.json({ ok: true });
  })
);

app.post(
  '/api/servers/:id/leave',
  requireAuth,
  friendLimiter,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role === 'owner') {
      return res.status(400).json({ error: 'sahip topluluktan ayrilamaz; silmek istersen toplulugu sil' });
    }
    await db.removeServerMember(serverId, req.userId);
    await db.addServerAuditLog(serverId, req.userId, 'member_left', req.username);
    kickUserFromServerVoiceChannels(serverId, req.userId);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/servers/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const serverId = Number(req.params.id);
    const ctx = await requireServerMembership(req, res, serverId);
    if (!ctx) return;
    if (ctx.member.role !== 'owner') return res.status(403).json({ error: 'yalnizca sahip toplulugu silebilir' });

    const members = await db.listServerMembers(serverId);
    const channels = await db.listChannels(serverId);
    for (const c of channels) {
      const roomCode = `CH${c.id}`;
      const room = rooms.get(roomCode);
      if (room) {
        for (const sid of [...room.members]) forceKickFromRoom(roomCode, sid);
        rooms.delete(roomCode);
      }
    }
    await db.deleteServer(serverId);
    for (const m of members) {
      if (m.username.toLowerCase() !== req.username.toLowerCase()) emitToUser(m.username, 'server-removed', { serverId });
    }
    res.json({ ok: true });
  })
);

// multer, dosya limiti asildiginda vb. route handler'a hic girmeden bir
// hata firlatir - bunu daha spesifik bir mesajla (asagidaki genel
// yakalayicidan once) JSON olarak dondurur.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'dosya cok buyuk' : 'dosya yuklenemedi';
    return res.status(400).json({ error: msg });
  }
  next(err);
});

app.use((err, _req, res, next) => {
  if (err) return res.status(400).json({ error: 'gecersiz istek' });
  next();
});

// ---- Socket.IO (sinyalleşme + eslesme + sohbet) ----

io.use(async (socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (typeof token !== 'string') return next(new Error('unauthorized'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.getUserById(payload.userId);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = payload.userId;
    socket.data.username = user.username;
    socket.data.avatarId = publicAvatar(user);
    socket.data.bannerId = user.banner_id || '';
    socket.data.visibility = user.visibility === 'invisible' ? 'invisible' : 'online';
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const { userId, username } = socket.data;
  const usernameKey = username.toLowerCase();
  socket.data.currentRoom = null;
  let lastCallAttempt = 0;
  let chatTimestamps = [];
  let dmTimestamps = [];
  let serverMsgTimestamps = [];
  const seenDmClientIds = new Map();

  const cameOnline = addOnlineSocket(usernameKey, socket.id);
  socket.emit('authenticated', { username, avatarId: socket.data.avatarId, bannerId: socket.data.bannerId });
  if (cameOnline && socket.data.visibility !== 'invisible') {
    notifyFriends(userId, 'friend-online', { username }).catch((err) => console.error(err.message));
    notifyCommunityPresence(userId, username, true).catch((err) => console.error(err.message));
  }

  function leaveCurrentRoom() {
    if (!socket.data.currentRoom) return;
    const room = rooms.get(socket.data.currentRoom);
    if (room) {
      room.members.delete(socket.id);
      publishServerChannelCount(room);
      socket.to(socket.data.currentRoom).emit('peer-left', { id: socket.id });
      if (room.ownerUserId && ownerActiveRoom.get(room.ownerUserId) === socket.data.currentRoom && !isOwnerInRoom(room)) {
        ownerActiveRoom.delete(room.ownerUserId);
      }
      cleanupEmptyRoom(socket.data.currentRoom);
      refreshOwnerRoomStatus(room);
    }
    socket.leave(socket.data.currentRoom);
    socket.data.currentRoom = null;
  }

  socket.on('create-room', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const access = payload && payload.access === 'friends' ? 'friends' : 'invite';
    const roomCode = createRoomEntry({ ownerUserId: userId, ownerUsername: username, type: 'room' });
    rooms.get(roomCode).access = access;
    ack({ roomCode });
  });

  socket.on('join-room', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { roomCode } = payload || {};
    if (!isValidRoomCode(roomCode)) return ack({ error: 'gecersiz oda kodu' });
    const room = rooms.get(roomCode);
    if (!room) return ack({ error: 'oda bulunamadi' });

    // Direct calls are private even when somebody knows the internal room code.
    if (room.type === 'call') {
      if (!room.callAccepted || !room.callUserIds?.has(userId)) {
        return ack({ error: 'bu ozel gorusmeye katilamazsin' });
      }
      const otherSession = [...room.members].some((sid) => sid !== socket.id && io.sockets.sockets.get(sid)?.data.userId === userId);
      if (otherSession) return ack({ error: 'bu gorusme baska cihazinda acik' });
    }
    if (socket.data.currentRoom === roomCode) {
      return ack({ ok: true, roomCode, roomType: room.type, existingPeers: [...room.members].filter((sid) => sid !== socket.id).map((id) => ({ id, displayName: io.sockets.sockets.get(id)?.data.username || 'Bilinmeyen', avatarId: io.sockets.sockets.get(id)?.data.avatarId || 'panda' })), chatHistory: room.messages, isOwner: room.ownerUserId === userId, access: room.type === 'room' ? room.access : null });
    }

    leaveCurrentRoom();
    socket.data.currentRoom = roomCode;
    chatTimestamps = [];
    socket.join(roomCode);

    const existingPeers = [...room.members].map((id) => ({
      id,
      displayName: io.sockets.sockets.get(id)?.data.username || 'Bilinmeyen',
      avatarId: io.sockets.sockets.get(id)?.data.avatarId || 'panda',
    }));

    room.members.add(socket.id);
    socket.to(roomCode).emit('peer-joined', { id: socket.id, displayName: username, avatarId: socket.data.avatarId });

    const isOwner = room.type === 'room' && room.ownerUserId === userId;
    if (isOwner) ownerActiveRoom.set(userId, roomCode);
    refreshOwnerRoomStatus(room);

    ack({
      ok: true,
      roomCode,
      existingPeers,
      chatHistory: room.messages,
      roomType: room.type,
      isOwner,
      access: room.type === 'room' ? room.access : null,
    });
  });

  socket.on('leave-room', () => leaveCurrentRoom());

  socket.on('join-server-channel', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const channelId = Number(payload && payload.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) return ack({ error: 'gecersiz kanal' });

    (async () => {
      const channel = await db.getChannelById(channelId);
      if (!channel || channel.type !== 'voice') return ack({ error: 'kanal bulunamadi' });
      const member = await db.getServerMember(channel.server_id, userId);
      if (!member) return ack({ error: 'bu toplulugun uyesi degilsin' });

      const roomCode = getOrCreateChannelRoom(channel);
      const room = rooms.get(roomCode);

      if (socket.data.currentRoom === roomCode) {
        return ack({
          ok: true,
          roomCode,
          roomType: room.type,
          channelName: channel.name,
          existingPeers: [...room.members]
            .filter((sid) => sid !== socket.id)
            .map((id) => ({
              id,
              displayName: io.sockets.sockets.get(id)?.data.username || 'Bilinmeyen',
              avatarId: io.sockets.sockets.get(id)?.data.avatarId || 'panda',
            })),
          chatHistory: room.messages,
        });
      }

      leaveCurrentRoom();
      socket.data.currentRoom = roomCode;
      chatTimestamps = [];
      socket.join(roomCode);

      const existingPeers = [...room.members].map((id) => ({
        id,
        displayName: io.sockets.sockets.get(id)?.data.username || 'Bilinmeyen',
        avatarId: io.sockets.sockets.get(id)?.data.avatarId || 'panda',
      }));

      room.members.add(socket.id);
      publishServerChannelCount(room);
      socket.to(roomCode).emit('peer-joined', { id: socket.id, displayName: username, avatarId: socket.data.avatarId });

      ack({ ok: true, roomCode, roomType: room.type, channelName: channel.name, existingPeers, chatHistory: room.messages });
    })().catch((err) => {
      console.error('join-server-channel hatasi:', err.message);
      ack({ error: 'sunucu hatasi' });
    });
  });

  // ---- topluluk metin kanali mesajlari ----
  // Ses kanallarinin aksine katilim (Socket.IO room join) gerekmez: yeni
  // mesaj her zaman toplulugun tum cevrimici uyelerine yayinlanir (ayni
  // 'server-channel-created' vb. olaylarin izledigi desen), istemci mesaji
  // acik kanala aitse gosterir, degilse yalnizca okunmamis sayacini artirir.
  // Uyelik ve yetki her istekte sunucuda (DB'den) yeniden dogrulanir.

  socket.on('send-server-message', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const channelId = Number(payload && payload.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) return ack({ error: 'gecersiz kanal' });
    const { text, clientMessageId } = payload || {};
    if (typeof clientMessageId !== 'string' || clientMessageId.length === 0 || clientMessageId.length > 64) {
      return ack({ error: 'gecersiz istek' });
    }
    if (typeof text !== 'string' || text.trim().length === 0) return ack({ error: 'bos mesaj gonderilemez' });
    if (text.length > CHAT_MAX_LENGTH) return ack({ error: `mesaj cok uzun (en fazla ${CHAT_MAX_LENGTH} karakter)` });

    const now = Date.now();
    serverMsgTimestamps = serverMsgTimestamps.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (serverMsgTimestamps.length >= CHAT_RATE_LIMIT) {
      return ack({ error: 'cok hizli mesaj gonderiyorsun, biraz yavasla' });
    }

    (async () => {
      const channel = await db.getChannelById(channelId);
      if (!channel || channel.type !== 'text') return ack({ error: 'kanal bulunamadi' });
      const member = await db.getServerMember(channel.server_id, userId);
      if (!member) return ack({ error: 'bu toplulugun uyesi degilsin' });

      serverMsgTimestamps.push(now);
      const { id: messageId, duplicate } = await db.insertServerMessage({
        id: crypto.randomUUID(),
        serverId: channel.server_id,
        channelId,
        fromUserId: userId,
        text,
        createdAt: now,
        clientMessageId,
      });
      if (!duplicate) await db.markChannelRead(userId, channelId, now);

      const stored = await db.getServerMessageById(messageId);
      const message = {
        id: stored.id,
        channelId,
        serverId: channel.server_id,
        from: stored.username,
        avatarId: publicAvatar(stored),
        text: stored.text,
        ts: Number(stored.created_at),
      };
      ack({ ok: true, message });
      if (!duplicate) {
        emitToServerMembers(channel.server_id, 'server-text-message', message).catch((err) =>
          console.error('server-text-message yayin hatasi:', err.message)
        );
      }
    })().catch((err) => {
      console.error('send-server-message hatasi:', err.message);
      ack({ error: 'sunucu hatasi' });
    });
  });

  socket.on('delete-server-message', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { messageId } = payload || {};
    if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > 64) {
      return ack({ error: 'gecersiz istek' });
    }

    (async () => {
      const message = await db.getServerMessageById(messageId);
      if (!message) return ack({ error: 'mesaj bulunamadi' });
      const member = await db.getServerMember(message.server_id, userId);
      if (!member) return ack({ error: 'bu toplulugun uyesi degilsin' });

      const isOwnMessage = Number(message.from_user_id) === userId;
      const canModerate = member.role === 'owner' || member.role === 'moderator';
      const withinWindow = Date.now() - Number(message.created_at) <= MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS;

      if ((isOwnMessage || canModerate) && withinWindow) {
        await db.deleteServerMessage(messageId);
        await db.addServerAuditLog(message.server_id, userId, isOwnMessage ? 'own_message_deleted' : 'message_moderated', message.username, messageId);
        ack({ ok: true, mode: 'everyone' });
        emitToServerMembers(message.server_id, 'server-message-deleted', {
          serverId: message.server_id,
          channelId: message.channel_id,
          messageId,
        }).catch((err) => console.error('server-message-deleted yayin hatasi:', err.message));
        return;
      }

      await db.hideServerMessageForUser(messageId, userId);
      ack({ ok: true, mode: 'me' });
    })().catch((err) => {
      console.error('delete-server-message hatasi:', err.message);
      ack({ error: 'sunucu hatasi' });
    });
  });

  socket.on('set-room-access', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!socket.data.currentRoom) return ack({ error: 'bir odada degilsin' });
    const room = rooms.get(socket.data.currentRoom);
    if (!room || room.type !== 'room' || room.ownerUserId !== userId) {
      return ack({ error: 'sadece oda sahibi erisimi degistirebilir' });
    }
    const { access } = payload || {};
    if (access !== 'invite' && access !== 'friends') return ack({ error: 'gecersiz erisim modu' });
    room.access = access;
    refreshOwnerRoomStatus(room);
    ack({ ok: true, access });
  });

  socket.on('join-friend-room', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { targetUsername } = payload || {};
    if (!isValidUsername(targetUsername)) return ack({ error: 'gecersiz kullanici adi' });

    (async () => {
      const targetUser = await db.getUserByUsername(targetUsername);
      if (!targetUser || !(await db.areFriends(userId, targetUser.id))) {
        return ack({ error: 'bu kullaniciyla arkadas degilsiniz' });
      }
      const roomCode = getOpenRoomForUser(targetUser.id);
      if (!roomCode) {
        return ack({ error: `${targetUsername} kullanicisinin su anda acik bir odasi yok` });
      }
      ack({ ok: true, roomCode });
    })().catch((err) => {
      console.error('join-friend-room hatasi:', err.message);
      ack({ error: 'sunucu hatasi' });
    });
  });

  socket.on('signal', (payload) => {
    const { to, data } = payload || {};
    if (!socket.data.currentRoom) return;
    const room = rooms.get(socket.data.currentRoom);
    if (!room || !room.members.has(socket.id) || typeof to !== 'string' || !room.members.has(to)) return;
    if (!isValidSignalData(data)) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat-message', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!socket.data.currentRoom) return ack({ error: 'bir odada degilsin' });
    const room = rooms.get(socket.data.currentRoom);
    if (!room || !room.members.has(socket.id)) return ack({ error: 'oda bulunamadi' });

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

    const message = { id: crypto.randomUUID(), from: username, avatarId: socket.data.avatarId, text, ts: now };

    room.messages.push(message);
    if (room.messages.length > CHAT_HISTORY_LIMIT) room.messages.shift();
    room.seenClientIds.set(clientMessageId, message);
    if (room.seenClientIds.size > CHAT_HISTORY_LIMIT) {
      room.seenClientIds.delete(room.seenClientIds.keys().next().value);
    }

    socket.to(socket.data.currentRoom).emit('chat-message', message);
    ack({ ok: true, message });
  });

  socket.on('kick-participant', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!socket.data.currentRoom) return ack({ error: 'bir odada degilsin' });
    const room = rooms.get(socket.data.currentRoom);
    if (!room) return ack({ error: 'oda bulunamadi' });

    const { targetSocketId } = payload || {};
    if (typeof targetSocketId !== 'string' || targetSocketId.length === 0) {
      return ack({ error: 'gecersiz istek' });
    }
    if (targetSocketId === socket.id) return ack({ error: 'kendini atamazsin' });

    // Uyelik/yetki kontrolunden sonra gercek yaptirim (P2P baglanti kesme)
    // forceKickFromRoom'da: atilan tarafin kendi istemcisine guvenilmez,
    // digerlerine 'peer-left' yayinlanmasi asil yaptirimdir.
    if (room.type === 'room') {
      if (room.ownerUserId !== userId) return ack({ error: 'sadece oda sahibi birini atabilir' });
      if (!room.members.has(targetSocketId)) return ack({ error: 'kullanici bu odada degil' });
      forceKickFromRoom(socket.data.currentRoom, targetSocketId);
      return ack({ ok: true });
    }

    if (room.type === 'server-channel') {
      if (!room.members.has(targetSocketId)) return ack({ error: 'kullanici bu odada degil' });
      db.getServerMember(room.serverId, userId)
        .then((member) => {
          if (!member || (member.role !== 'owner' && member.role !== 'moderator')) {
            return ack({ error: 'yetkin yok' });
          }
          forceKickFromRoom(socket.data.currentRoom, targetSocketId);
          ack({ ok: true });
        })
        .catch((err) => {
          console.error('kick-participant hatasi:', err.message);
          ack({ error: 'sunucu hatasi' });
        });
      return;
    }

    ack({ error: 'bu oda tipinde atma islemi desteklenmiyor' });
  });

  socket.on('dm-message', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { toUsername, text, clientMessageId } = payload || {};
    if (!isValidUsername(toUsername)) return ack({ error: 'gecersiz kullanici adi' });
    if (typeof clientMessageId !== 'string' || clientMessageId.length === 0 || clientMessageId.length > 64) {
      return ack({ error: 'gecersiz istek' });
    }

    const existing = seenDmClientIds.get(clientMessageId);
    if (existing) return ack({ ok: true, message: existing });

    if (typeof text !== 'string' || text.trim().length === 0) return ack({ error: 'bos mesaj gonderilemez' });
    if (text.length > CHAT_MAX_LENGTH) return ack({ error: `mesaj cok uzun (en fazla ${CHAT_MAX_LENGTH} karakter)` });
    if (toUsername.toLowerCase() === usernameKey) return ack({ error: 'kendine mesaj gonderemezsin' });

    const now = Date.now();
    dmTimestamps = dmTimestamps.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (dmTimestamps.length >= CHAT_RATE_LIMIT) {
      return ack({ error: 'cok hizli mesaj gonderiyorsun, biraz yavasla' });
    }

    (async () => {
      const target = await db.getUserByUsername(toUsername);
      if (!target || !(await db.areFriends(userId, target.id))) {
        return ack({ error: 'bu kullaniciyla arkadas degilsiniz' });
      }
      if (await db.isEitherUserBlocked(userId, target.id)) return ack({ error: 'bu kullaniciyla etkilesim engellendi' });

      dmTimestamps.push(now);
      const message = { id: crypto.randomUUID(), from: username, text, ts: now };
      await db.insertDirectMessage({ id: message.id, fromUserId: userId, toUserId: target.id, text, createdAt: now });

      seenDmClientIds.set(clientMessageId, message);
      if (seenDmClientIds.size > 50) {
        seenDmClientIds.delete(seenDmClientIds.keys().next().value);
      }

      emitToUser(target.username, 'dm-message', message);
      ack({ ok: true, message });
    })().catch((err) => {
      console.error('dm-message hatasi:', err.message);
      ack({ error: 'sunucu hatasi' });
    });
  });

  socket.on('delete-dm-message', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { messageId } = payload || {};
    if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > 64) {
      return ack({ error: 'gecersiz istek' });
    }

    (async () => {
      const message = await db.getDirectMessageById(messageId);
      if (!message) return ack({ error: 'mesaj bulunamadi' });
      const fromId = Number(message.from_user_id);
      const toId = Number(message.to_user_id);
      if (userId !== fromId && userId !== toId) return ack({ error: 'bu mesaji silme yetkin yok' });

      const isOwnMessage = userId === fromId;
      const withinWindow = Date.now() - Number(message.created_at) <= MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS;

      if (isOwnMessage && withinWindow) {
        await db.deleteDirectMessage(messageId);
        ack({ ok: true, mode: 'everyone' });
        const other = await db.getUserById(toId);
        if (other) emitToUser(other.username, 'dm-message-deleted', { messageId, withUsername: username });
        return;
      }

      await db.hideDirectMessageForUser(messageId, userId);
      ack({ ok: true, mode: 'me' });
    })().catch((err) => {
      console.error('delete-dm-message hatasi:', err.message);
      ack({ error: 'sunucu hatasi' });
    });
  });

  socket.on('call-friend', async (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { toUsername } = payload || {};

    const now = Date.now();
    if (now - lastCallAttempt < CALL_COOLDOWN_MS) return ack({ error: 'cok hizli araniyor, biraz bekle' });
    lastCallAttempt = now;

    if (!isValidUsername(toUsername)) return ack({ error: 'gecersiz kullanici adi' });
    if (toUsername.toLowerCase() === usernameKey) return ack({ error: 'kendini arayamazsin' });
    if (isUserBusy(usernameKey)) return ack({ error: 'once mevcut gorusmeni veya aramani bitir' });

    const targetUser = await db.getUserByUsername(toUsername);
    if (!targetUser || !(await db.areFriends(userId, targetUser.id)) || (await db.isEitherUserBlocked(userId, targetUser.id))) {
      socket.emit('call-failed', { toUsername, reason: 'not-friends' });
      return ack({ ok: true });
    }

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

      // Recheck after database awaits: another caller may have won the race.
      if (!socket.connected) return;
      if (!io.sockets.sockets.has(targetSocketId)) return ack({ error: 'kullanici cevrimdisi' });
      if (isUserBusy(usernameKey) || isUserBusy(toUsername.toLowerCase())) {
        return ack({ error: 'kullanici veya sen su anda mesgulsun' });
      }

      const roomCode = createRoomEntry({ type: 'call' });
      rooms.get(roomCode).callUserIds = new Set([userId, targetUser.id]);
      rooms.get(roomCode).callAccepted = false;
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

  socket.on('call-response', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const { roomCode, accepted } = payload || {};
    const call = pendingCalls.get(roomCode);
    if (!call || call.calleeSocketId !== socket.id) return ack({ error: 'arama sona ermis veya sana ait degil' });
    if (typeof accepted !== 'boolean') return ack({ error: 'gecersiz arama cevabi' });

    clearTimeout(call.timeoutHandle);
    pendingCalls.delete(roomCode);

    if (accepted) {
      rooms.get(roomCode).callAccepted = true;
      io.to(call.callerSocketId).emit('call-accepted', { roomCode });
    } else {
      io.to(call.callerSocketId).emit('call-declined', { byUsername: username });
      cleanupEmptyRoom(roomCode);
    }
    ack({ ok: true });
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

  socket.on('set-game-status', (payload) => {
    const { game } = payload || {};
    const clean = typeof game === 'string' ? game.trim().slice(0, 60) : '';
    const existing = gameStatusByUsername.get(usernameKey);
    let since = null;
    if (clean) {
      if (existing?.game === clean) return; // gereksiz tekrar yayin yok
      since = Date.now();
      gameStatusByUsername.set(usernameKey, { game: clean, since });
    } else {
      if (!existing) return;
      gameStatusByUsername.delete(usernameKey);
    }
    notifyFriends(userId, 'friend-game-status', { username, game: clean || null, gameSince: since }).catch((err) => console.error(err.message));
    notifyCommunityGameStatus(userId, username, clean || null, since).catch((err) => console.error(err.message));
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
      notifyCommunityPresence(userId, username, false).catch((err) => console.error(err.message));
      if (gameStatusByUsername.has(usernameKey)) {
        gameStatusByUsername.delete(usernameKey);
        notifyFriends(userId, 'friend-game-status', { username, game: null, gameSince: null }).catch((err) => console.error(err.message));
        notifyCommunityGameStatus(userId, username, null, null).catch((err) => console.error(err.message));
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await db.testConnection();
  } catch (err) {
    // Baglanti dizesi/sifre asla loglanmiyor - yalnizca kisa, makine
    // tarafinda uretilen bir hata kodu (varsa) ve genel bir yonlendirme.
    console.error(
      `Veritabanina baglanilamadi${err.code ? ` (${err.code})` : ''}. ` +
        `${db.dialect === 'postgres' ? 'DATABASE_URL' : 'DB_PATH'} degiskenini kontrol edin.`
    );
    throw new Error('veritabani baglantisi dogrulanamadi');
  }
  await db.init();
  console.log(`Veritabani hazir (${db.dialect === 'postgres' ? 'PostgreSQL' : 'yerel SQLite'}).`);
  server.listen(PORT, () => console.log(`Sinyalleşme sunucusu ${PORT} portunda çalışıyor`));
}

const ready = start().catch((err) => {
  console.error('Sunucu baslatilamadi:', err.message);
  process.exit(1);
});

module.exports = { app, server, io, ready };
