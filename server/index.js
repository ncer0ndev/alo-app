const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
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
  users[key] = { username, passwordHash };
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

app.get('/api/me', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ username: payload.username });
  } catch {
    res.status(401).json({ error: 'Geçersiz oturum.' });
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join-room', ({ roomCode, token }) => {
    let displayName;
    try {
      displayName = jwt.verify(token, JWT_SECRET).username;
    } catch {
      socket.emit('join-error', { error: 'Geçersiz oturum, tekrar giriş yap.' });
      return;
    }

    currentRoom = roomCode;
    socket.data.displayName = displayName;
    socket.join(roomCode);

    if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
    const peers = rooms.get(roomCode);

    const existingPeers = [...peers].map((id) => ({
      id,
      displayName: io.sockets.sockets.get(id)?.data.displayName || 'Bilinmeyen',
    }));
    socket.emit('existing-peers', existingPeers);

    peers.add(socket.id);
    socket.to(roomCode).emit('peer-joined', { id: socket.id, displayName });
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      rooms.get(currentRoom)?.delete(socket.id);
      socket.to(currentRoom).emit('peer-left', { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sinyalleşme sunucusu ${PORT} portunda çalışıyor`));
