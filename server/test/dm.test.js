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
process.env.JWT_SECRET = 'dm-isolated-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-dm-${randomUUID()}.db`);

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

test('dm: yalnizca arkadaslar mesajlasabilir, kalicidir, okunmadi sayaci dogru calisir', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const users = [];
  for (const username of ['dmAlice', 'dmBob', 'dmStranger']) {
    const userId = await db.createUser(username, 'unused-test-hash');
    const token = jwt.sign({ userId, username }, process.env.JWT_SECRET);
    const socket = connect(base, { auth: { token }, reconnection: false, forceNew: true });
    sockets.push(socket);
    await event(socket, 'authenticated');
    users.push({ userId, username, token, socket });
  }
  const [alice, bob, stranger] = users;
  const authHeader = (u) => ({ Authorization: `Bearer ${u.token}` });

  // Arkadas degilken mesaj gonderilemez (sosyal muhendislikle hedefe sozde-yetki kazandirmaya calisma).
  const rejected = await emit(alice.socket, 'dm-message', {
    toUsername: bob.username,
    text: 'merhaba',
    clientMessageId: randomUUID(),
  });
  assert.ok(rejected.error, 'arkadas olmayan kullaniciya DM reddedilmeli');

  // Kendine mesaj da anlamsiz, reddedilmeli.
  const selfDm = await emit(alice.socket, 'dm-message', {
    toUsername: alice.username,
    text: 'kendime not',
    clientMessageId: randomUUID(),
  });
  assert.ok(selfDm.error, 'kullanici kendine DM gonderememeli');

  await db.createFriendRequest(alice.userId, bob.userId);
  await db.acceptFriendRequest(alice.userId, bob.userId);

  const bobReceives = event(bob.socket, 'dm-message');
  const ack = await emit(alice.socket, 'dm-message', {
    toUsername: bob.username,
    text: 'selam bob',
    clientMessageId: randomUUID(),
  });
  assert.equal(ack.ok, true);
  assert.equal(ack.message.from, alice.username);
  const delivered = await bobReceives;
  assert.equal(delivered.text, 'selam bob');
  assert.equal(delivered.from, alice.username);

  // Ayni clientMessageId ile tekrar gonderim (agdan kaynakli retry) ayni mesaji dondurmeli, ikinci kayit olusturmamali.
  const dupClientId = randomUUID();
  const first = await emit(alice.socket, 'dm-message', { toUsername: bob.username, text: 'tekrar', clientMessageId: dupClientId });
  const second = await emit(alice.socket, 'dm-message', { toUsername: bob.username, text: 'tekrar', clientMessageId: dupClientId });
  assert.equal(first.message.id, second.message.id, 'ayni clientMessageId ikinci kayit olusturmamali');

  // Yabanci kullanici mesaj gecmisini goremez.
  const strangerHistory = await fetch(`${base}/api/dm/${bob.username}/messages`, { headers: authHeader(stranger) });
  assert.equal(strangerHistory.status, 403);

  // Gecmis kalici: bob kendi tarafindan mesajlari cekebilir.
  const bobHistoryRes = await fetch(`${base}/api/dm/${alice.username}/messages`, { headers: authHeader(bob) });
  const bobHistory = await bobHistoryRes.json();
  assert.equal(bobHistoryRes.status, 200);
  assert.ok(bobHistory.messages.some((m) => m.text === 'selam bob' && m.from === alice.username));

  // Okunmadi sayaci: bob henuz okumadi. Iki farkli mesaj gonderildi ("selam bob", "tekrar");
  // ayni clientMessageId'li ikinci "tekrar" denemesi idempotency nedeniyle yeni kayit olusturmadi.
  const convBeforeRes = await fetch(`${base}/api/dm/conversations`, { headers: authHeader(bob) });
  const convBefore = await convBeforeRes.json();
  const aliceConvBefore = convBefore.conversations.find((c) => c.username === alice.username);
  assert.equal(aliceConvBefore.unreadCount, 2);
  assert.equal(aliceConvBefore.lastFromSelf, false);

  // Okundu olarak isaretlenince sayac sifirlanir.
  const readRes = await fetch(`${base}/api/dm/${alice.username}/read`, { method: 'POST', headers: authHeader(bob) });
  assert.equal(readRes.status, 200);
  const convAfterRes = await fetch(`${base}/api/dm/conversations`, { headers: authHeader(bob) });
  const convAfter = await convAfterRes.json();
  const aliceConvAfter = convAfter.conversations.find((c) => c.username === alice.username);
  assert.equal(aliceConvAfter.unreadCount, 0);

  // Arkadasliktan cikarilinca DM gonderme ve okuma tekrar reddedilir.
  await db.removeFriend(alice.userId, bob.userId);
  const afterUnfriend = await emit(alice.socket, 'dm-message', {
    toUsername: bob.username,
    text: 'hala arkadasiz mi',
    clientMessageId: randomUUID(),
  });
  assert.ok(afterUnfriend.error, 'arkadasliktan cikinca DM gonderimi reddedilmeli');
  const historyAfterUnfriend = await fetch(`${base}/api/dm/${alice.username}/messages`, { headers: authHeader(bob) });
  assert.equal(historyAfterUnfriend.status, 403, 'arkadasliktan cikinca gecmis de goruntulenememeli');
});
