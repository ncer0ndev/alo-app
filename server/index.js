const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.get('/', (_req, res) => res.send('Sesli sohbet sinyalleşme sunucusu çalışıyor.'));

const rooms = new Map();

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join-room', ({ roomCode, displayName }) => {
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
