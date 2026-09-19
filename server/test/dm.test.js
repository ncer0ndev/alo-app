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
const adapter = require('../db-adapter');
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

test('dm: 5 dakika icinde herkesten silinebilir, sonrasinda yalnizca kendinden gizlenir, alici her zaman yalnizca kendinden gizleyebilir', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const users = [];
  for (const username of ['dmCarol', 'dmDave']) {
    const userId = await db.createUser(username, 'unused-test-hash');
    const token = jwt.sign({ userId, username }, process.env.JWT_SECRET);
    const socket = connect(base, { auth: { token }, reconnection: false, forceNew: true });
    sockets.push(socket);
    await event(socket, 'authenticated');
    users.push({ userId, username, token, socket });
  }
  const [carol, dave] = users;
  const authHeader = (u) => ({ Authorization: `Bearer ${u.token}` });
  await db.createFriendRequest(carol.userId, dave.userId);
  await db.acceptFriendRequest(carol.userId, dave.userId);

  // Taze mesaj: gonderen 5 dakika icinde herkesten silebilir, karsi taraf da alir.
  const freshAck = await emit(carol.socket, 'dm-message', { toUsername: dave.username, text: 'taze mesaj', clientMessageId: randomUUID() });
  assert.equal(freshAck.ok, true);
  const daveNotified = event(dave.socket, 'dm-message-deleted');
  const freshDelete = await emit(carol.socket, 'delete-dm-message', { messageId: freshAck.message.id });
  assert.equal(freshDelete.ok, true);
  assert.equal(freshDelete.mode, 'everyone');
  const notice = await daveNotified;
  assert.equal(notice.messageId, freshAck.message.id);
  const goneForBoth = await db.getDirectMessages(dave.userId, carol.userId, { limit: 10 });
  assert.ok(!goneForBoth.some((m) => m.id === freshAck.message.id));

  // Eski mesaj (5 dakikayi gecmis): gonderen artik herkesten silemez, yalnizca kendinden gizler.
  const oldAck = await emit(carol.socket, 'dm-message', { toUsername: dave.username, text: 'eski mesaj', clientMessageId: randomUUID() });
  await adapter.query({ sql: 'UPDATE direct_messages SET created_at = ? WHERE id = ?', args: [Date.now() - 6 * 60 * 1000, oldAck.message.id] });
  const lateDelete = await emit(carol.socket, 'delete-dm-message', { messageId: oldAck.message.id });
  assert.equal(lateDelete.ok, true);
  assert.equal(lateDelete.mode, 'me');
  const stillThereForDave = await db.getDirectMessages(dave.userId, carol.userId, { limit: 10 });
  assert.ok(stillThereForDave.some((m) => m.id === oldAck.message.id), 'alici icin hala durmali');
  const hiddenForCarol = await db.getDirectMessages(carol.userId, dave.userId, { limit: 10 });
  assert.ok(!hiddenForCarol.some((m) => m.id === oldAck.message.id), 'gonderenin kendi gorunumunden gizlenmis olmali');

  // Alici, taze bir mesaji bile herkesten silemez - yalnizca kendinden gizleyebilir.
  const forRecipient = await emit(carol.socket, 'dm-message', { toUsername: dave.username, text: 'aliciya', clientMessageId: randomUUID() });
  const recipientDelete = await emit(dave.socket, 'delete-dm-message', { messageId: forRecipient.message.id });
  assert.equal(recipientDelete.ok, true);
  assert.equal(recipientDelete.mode, 'me', 'alici mesaji herkesten silememeli');
  const stillThereForCarol = await db.getDirectMessages(carol.userId, dave.userId, { limit: 10 });
  assert.ok(stillThereForCarol.some((m) => m.id === forRecipient.message.id), 'gonderen icin hala durmali');

  // Ilgisiz bir kullanici baskasinin DM'sini silemez.
  const outsiderUserId = await db.createUser('dmOutsider', 'unused-test-hash');
  const outsiderToken = jwt.sign({ userId: outsiderUserId, username: 'dmOutsider' }, process.env.JWT_SECRET);
  const outsiderSocket = connect(base, { auth: { token: outsiderToken }, reconnection: false, forceNew: true });
  sockets.push(outsiderSocket);
  await event(outsiderSocket, 'authenticated');
  const outsiderDelete = await emit(outsiderSocket, 'delete-dm-message', { messageId: forRecipient.message.id });
  assert.ok(outsiderDelete.error, 'ilgisiz kullanici DM silemez');
});
