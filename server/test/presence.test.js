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
process.env.JWT_SECRET = 'presence-isolated-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-presence-${randomUUID()}.db`);

const db = require('../db');
const { server, io, ready } = require('../index');
const sockets = [];
const event = (socket, name) => new Promise((resolve) => socket.once(name, resolve));

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

test('oyun durumu: yalnizca arkadaslara gercek zamanli yayinlanir ve /api/friends yansitir', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const alice = await makeUser(base, 'presenceAlice');
  const bob = await makeUser(base, 'presenceBob');
  const stranger = await makeUser(base, 'presenceStranger');
  await db.createFriendRequest(alice.userId, bob.userId);
  await db.acceptFriendRequest(alice.userId, bob.userId);

  const bobHears = event(bob.socket, 'friend-game-status');
  let strangerHeard = false;
  stranger.socket.once('friend-game-status', () => { strangerHeard = true; });

  alice.socket.emit('set-game-status', { game: 'Valorant' });
  const bobPayload = await bobHears;
  assert.equal(bobPayload.username, alice.username);
  assert.equal(bobPayload.game, 'Valorant');

  await new Promise((r) => setTimeout(r, 150));
  assert.equal(strangerHeard, false, 'arkadas olmayan oyun durumu bildirimi almamali');

  const friendsRes = await fetch(`${base}/api/friends`, { headers: { Authorization: `Bearer ${jwt.sign({ userId: bob.userId, username: bob.username }, process.env.JWT_SECRET)}` } });
  const friendsBody = await friendsRes.json();
  const aliceEntry = friendsBody.friends.find((f) => f.username === alice.username);
  assert.equal(aliceEntry.game, 'Valorant');

  // Oyunu kapatinca (bos gonderince) bildirim gider ve /api/friends null doner.
  const bobHearsClear = event(bob.socket, 'friend-game-status');
  alice.socket.emit('set-game-status', { game: null });
  const clearPayload = await bobHearsClear;
  assert.equal(clearPayload.game, null);

  // Baglanti tamamen kesilince de oyun durumu temizlenip arkadasa bildirilir.
  bob.socket.emit('set-game-status', { game: 'Dota 2' });
  await new Promise((r) => setTimeout(r, 150));
  const aliceHearsOffline = event(alice.socket, 'friend-game-status');
  bob.socket.disconnect();
  const offlinePayload = await aliceHearsOffline;
  assert.equal(offlinePayload.game, null);
});

test('durum mesaji: kaydedilir, arkadaslara yayinlanir ve uzunluk sinirlanir', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'statusOwner');
  const friend = await makeUser(base, 'statusFriend');
  await db.createFriendRequest(owner.userId, friend.userId);
  await db.acceptFriendRequest(owner.userId, friend.userId);
  const ownerToken = jwt.sign({ userId: owner.userId, username: owner.username }, process.env.JWT_SECRET);

  const tooLong = await fetch(`${base}/api/profile/status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusMessage: 'x'.repeat(61) }),
  });
  assert.equal(tooLong.status, 400);

  const friendHears = event(friend.socket, 'friend-status-message');
  const okRes = await fetch(`${base}/api/profile/status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusMessage: '  ranked grind  ' }),
  });
  assert.equal(okRes.status, 200);
  const okBody = await okRes.json();
  assert.equal(okBody.statusMessage, 'ranked grind');

  const heard = await friendHears;
  assert.equal(heard.username, owner.username);
  assert.equal(heard.statusMessage, 'ranked grind');

  const friendsRes = await fetch(`${base}/api/friends`, { headers: { Authorization: `Bearer ${jwt.sign({ userId: friend.userId, username: friend.username }, process.env.JWT_SECRET)}` } });
  const friendsBody = await friendsRes.json();
  const ownerEntry = friendsBody.friends.find((f) => f.username === owner.username);
  assert.equal(ownerEntry.statusMessage, 'ranked grind');
});
