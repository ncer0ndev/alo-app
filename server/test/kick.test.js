const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { io: connect } = require('socket.io-client');
const jwt = require('jsonwebtoken');

delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = 'kick-isolated-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-kick-${randomUUID()}.db`);

const db = require('../db');
const { server, io, ready } = require('../index');
const sockets = [];
const event = (socket, name) => new Promise((resolve) => socket.once(name, resolve));
const emit = (socket, name, payload) => socket.timeout(2000).emitWithAck(name, payload);

test.after(async () => {
  for (const socket of sockets) socket.disconnect();
  await new Promise((resolve) => io.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(process.env.DB_PATH + suffix);
    } catch {
      // dosya olmayabilir
    }
  }
});

async function makeUser(base, username) {
  const userId = await db.createUser(username, 'unused-test-hash');
  const token = jwt.sign({ userId, username }, process.env.JWT_SECRET);
  const socket = connect(base, { auth: { token }, reconnection: false, forceNew: true });
  sockets.push(socket);
  await event(socket, 'authenticated');
  return { userId, username, socket };
}

test('kick: yalnizca oda sahibi atabilir, atilan gercek zamanli cikarilir ve odaya artik mesaj/sinyal gonderemez', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'kickOwner');
  const participant = await makeUser(base, 'kickParticipant');
  const bystander = await makeUser(base, 'kickBystander');

  const { roomCode } = await emit(owner.socket, 'create-room', {});
  assert.ok(roomCode);

  const ownerJoin = await emit(owner.socket, 'join-room', { roomCode });
  assert.equal(ownerJoin.ok, true);
  assert.equal(ownerJoin.isOwner, true);

  const participantJoined = event(owner.socket, 'peer-joined');
  const participantJoin = await emit(participant.socket, 'join-room', { roomCode });
  assert.equal(participantJoin.ok, true);
  assert.equal(participantJoin.isOwner, false);
  await participantJoined;

  const bystanderJoin = await emit(bystander.socket, 'join-room', { roomCode });
  assert.equal(bystanderJoin.ok, true);

  // Sahip olmayan biri baskasini atamaz.
  const deniedKick = await emit(bystander.socket, 'kick-participant', { targetSocketId: participant.socket.id });
  assert.ok(deniedKick.error);

  // Kendini atamaz.
  const selfKick = await emit(owner.socket, 'kick-participant', { targetSocketId: owner.socket.id });
  assert.ok(selfKick.error);

  // Odada olmayan birini atamaz.
  const bogusKick = await emit(owner.socket, 'kick-participant', { targetSocketId: 'nonexistent-socket-id' });
  assert.ok(bogusKick.error);

  const kickedNotified = event(participant.socket, 'kicked-from-room');
  const bystanderSeesLeave = event(bystander.socket, 'peer-left');
  const realKick = await emit(owner.socket, 'kick-participant', { targetSocketId: participant.socket.id });
  assert.equal(realKick.ok, true);

  const kickedPayload = await kickedNotified;
  assert.equal(kickedPayload.roomCode, roomCode);
  const leftPayload = await bystanderSeesLeave;
  assert.equal(leftPayload.id, participant.socket.id);

  // Atilan kullanici kendi istemcisi 'leave-room' cagirmasa bile (ele gecirilmis
  // istemci senaryosu) artik odaya mesaj/sinyal gonderemez - sunucu buna guvenmez.
  const blockedChat = await emit(participant.socket, 'chat-message', { text: 'hala buradayim', clientMessageId: randomUUID() });
  assert.ok(blockedChat.error, 'atilan kullanici sohbete mesaj gonderememeli');
});

test('kick: birebir aramada (call tipi oda) reddedilir', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const a = await makeUser(base, 'kickCallerA');
  const b = await makeUser(base, 'kickCallerB');
  await db.createFriendRequest(a.userId, b.userId);
  await db.acceptFriendRequest(a.userId, b.userId);

  const incoming = event(b.socket, 'incoming-call');
  await emit(a.socket, 'call-friend', { toUsername: b.username });
  const { roomCode } = await incoming;
  await emit(b.socket, 'call-response', { roomCode, accepted: true });
  await emit(a.socket, 'join-room', { roomCode });
  await emit(b.socket, 'join-room', { roomCode });

  const kick = await emit(a.socket, 'kick-participant', { targetSocketId: b.socket.id });
  assert.ok(kick.error, 'birebir aramada kick ozelligi olmamali');
});
