const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { io: connect } = require('socket.io-client');
const jwt = require('jsonwebtoken');

// Never connect this suite to the configured production database.
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = 'direct-call-local-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-calls-${randomUUID()}.db`);
const db = require('../db');
const { server, io, ready } = require('../index');
const sockets = [];
const event = (socket, name) => new Promise(resolve => socket.once(name, resolve));
const emit = (socket, name, payload) => socket.timeout(2000).emitWithAck(name, payload);

test.after(async () => {
  for (const socket of sockets) socket.disconnect();
  await new Promise(resolve => io.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(process.env.DB_PATH + suffix); } catch {}
  }
});

test('direct call requires consent, excludes third parties, and handles cancellation', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const users = [];
  for (const username of ['callAlice', 'callBobby', 'callCarol']) {
    const userId = await db.createUser(username, 'unused-test-hash');
    const token = jwt.sign({ userId, username }, process.env.JWT_SECRET);
    const socket = connect(base, { auth: { token }, reconnection: false, forceNew: true });
    sockets.push(socket);
    await event(socket, 'authenticated');
    users.push({ userId, username, socket });
  }
  const [a,b,c] = users;
  await db.createFriendRequest(a.userId,b.userId);
  await db.acceptFriendRequest(a.userId,b.userId);
  const incoming = event(b.socket, 'incoming-call');
  assert.equal((await emit(a.socket, 'call-friend', { toUsername: b.username })).ok, true);
  const { roomCode } = await incoming;
  assert.ok((await emit(a.socket,'join-room',{roomCode})).error, 'caller cannot join before consent');
  assert.ok((await emit(c.socket,'call-response',{roomCode,accepted:true})).error);
  assert.ok((await emit(b.socket,'call-response',{roomCode,accepted:'true'})).error);
  assert.equal((await emit(b.socket,'call-response',{roomCode,accepted:true})).ok,true);
  assert.ok((await emit(c.socket,'join-room',{roomCode})).error, 'knowing the code must not grant access');
  const aJoin = await emit(a.socket,'join-room',{roomCode});
  const bJoin = await emit(b.socket,'join-room',{roomCode});
  assert.equal(aJoin.roomType,'call');
  assert.equal(bJoin.ok,true);
  assert.ok((await emit(c.socket,'join-friend-room',{targetUsername:a.username})).error);
  const left = event(b.socket,'peer-left');
  a.socket.emit('leave-room');
  await left;
  b.socket.emit('leave-room');
  // A fresh connection bypasses the per-socket cooldown for the next scenario.
  const token = jwt.sign({userId:a.userId,username:a.username},process.env.JWT_SECRET);
  const again = connect(base,{auth:{token},reconnection:false,forceNew:true});
  sockets.push(again);
  await event(again,'authenticated');
  const incoming2 = event(b.socket,'incoming-call');
  await emit(again,'call-friend',{toUsername:b.username});
  const second = await incoming2;
  const cancelled = event(b.socket,'call-cancelled');
  again.emit('cancel-call',{roomCode:second.roomCode});
  await cancelled;
  assert.ok((await emit(b.socket,'call-response',{roomCode:second.roomCode,accepted:true})).error, 'cancelled call cannot be accepted');
});
