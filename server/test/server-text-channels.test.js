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
process.env.JWT_SECRET = 'server-text-channels-isolated-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-server-text-${randomUUID()}.db`);

const db = require('../db');
const adapter = require('../db-adapter');
const { server, io, ready } = require('../index');
const sockets = [];
const event = (socket, name, ms = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`'${name}' olayi ${ms}ms icinde gelmedi`)), ms);
    socket.once(name, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
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
  return { userId, username, token, socket, auth: { Authorization: `Bearer ${token}` } };
}

function jsonAuth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function createTextServer(base, owner, member, { serverName, channelName } = {}) {
  const created = await (
    await fetch(`${base}/api/servers`, { method: 'POST', headers: jsonAuth(owner.token), body: JSON.stringify({ name: serverName || 'Metin Toplulugu' }) })
  ).json();
  await fetch(`${base}/api/servers/join`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ inviteCode: created.inviteCode }),
  });
  const channel = await (
    await fetch(`${base}/api/servers/${created.id}/channels`, {
      method: 'POST',
      headers: jsonAuth(owner.token),
      body: JSON.stringify({ name: channelName || 'genel', type: 'text' }),
    })
  ).json();
  assert.equal(channel.type, 'text');
  return { server: created, channel };
}

test('metin kanali: uye olmayan mesaj gecmisini okuyamaz ve mesaj gonderemez', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'txtOwner1');
  const member = await makeUser(base, 'txtMember1');
  const outsider = await makeUser(base, 'txtOutsider1');
  const { server: srv, channel } = await createTextServer(base, owner, member);

  const historyRes = await fetch(`${base}/api/servers/${srv.id}/channels/${channel.id}/messages`, { headers: outsider.auth });
  assert.equal(historyRes.status, 403);

  const sendAck = await emit(outsider.socket, 'send-server-message', {
    channelId: channel.id,
    text: 'merhaba',
    clientMessageId: randomUUID(),
  });
  assert.ok(sendAck.error, 'uye olmayan mesaj gonderememeli');
});

test('metin kanali: uye mesaj gonderebilir, diger uye anlik alir, kendine ait olmayan kanal kimligi reddedilir', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'txtOwner2');
  const member = await makeUser(base, 'txtMember2');
  const { server: srv, channel } = await createTextServer(base, owner, member);

  const memberReceives = event(member.socket, 'server-text-message');
  const ack = await emit(owner.socket, 'send-server-message', {
    channelId: channel.id,
    text: 'herkese selam',
    clientMessageId: randomUUID(),
  });
  assert.equal(ack.ok, true);
  assert.equal(ack.message.text, 'herkese selam');
  assert.equal(ack.message.from, owner.username);
  const delivered = await memberReceives;
  assert.equal(delivered.text, 'herkese selam');
  assert.equal(delivered.channelId, channel.id);

  // Baska bir toplulugun kanal kimligi bu topluluga karsi kullanilamaz.
  const otherOwner = await makeUser(base, 'txtOtherOwner2');
  const otherServer = await (
    await fetch(`${base}/api/servers`, { method: 'POST', headers: jsonAuth(otherOwner.token), body: JSON.stringify({ name: 'Baska Topluluk' }) })
  ).json();
  const otherChannel = await (
    await fetch(`${base}/api/servers/${otherServer.id}/channels`, {
      method: 'POST',
      headers: jsonAuth(otherOwner.token),
      body: JSON.stringify({ name: 'gizli', type: 'text' }),
    })
  ).json();

  // owner, srv toplulugunun uyesi ama otherServer'in degil; otherChannel'i srv altinda okumaya calisiyor.
  const crossRead = await fetch(`${base}/api/servers/${srv.id}/channels/${otherChannel.id}/messages`, { headers: owner.auth });
  assert.equal(crossRead.status, 404, 'baska topluluga ait kanal kimligi bu topluluk altinda bulunamamali');

  const crossSend = await emit(owner.socket, 'send-server-message', {
    channelId: otherChannel.id,
    text: 'sizinkine yaziyorum',
    clientMessageId: randomUUID(),
  });
  assert.ok(crossSend.error, 'owner otherServer uyesi olmadigindan gonderim reddedilmeli');
});

test('metin kanali: bos/cok uzun mesaj reddedilir, hiz siniri calisir, ayni clientMessageId ikinci kayit olusturmaz', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'txtOwner3');
  const member = await makeUser(base, 'txtMember3');
  const { channel } = await createTextServer(base, owner, member);

  const emptyAck = await emit(owner.socket, 'send-server-message', { channelId: channel.id, text: '   ', clientMessageId: randomUUID() });
  assert.ok(emptyAck.error, 'bos mesaj reddedilmeli');

  const tooLong = await emit(owner.socket, 'send-server-message', {
    channelId: channel.id,
    text: 'x'.repeat(2001),
    clientMessageId: randomUUID(),
  });
  assert.ok(tooLong.error, 'cok uzun mesaj reddedilmeli');

  const dupClientId = randomUUID();
  const first = await emit(owner.socket, 'send-server-message', { channelId: channel.id, text: 'tekrar', clientMessageId: dupClientId });
  const second = await emit(owner.socket, 'send-server-message', { channelId: channel.id, text: 'tekrar', clientMessageId: dupClientId });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.message.id, second.message.id, 'ayni clientMessageId ikinci kayit olusturmamali');

  const stored = await db.getServerMessages(channel.id, owner.userId, { limit: 100 });
  const matching = stored.filter((m) => m.id === first.message.id);
  assert.equal(matching.length, 1, 'veritabaninda tek kayit olmali');

  // Hiz siniri: mevcut sohbet siniriyla (10 saniyede 8 mesaj) ayni esikte test edilir.
  let limited = null;
  for (let i = 0; i < 10; i++) {
    const res = await emit(owner.socket, 'send-server-message', { channelId: channel.id, text: `mesaj ${i}`, clientMessageId: randomUUID() });
    if (res.error) {
      limited = res;
      break;
    }
  }
  assert.ok(limited && limited.error, 'hiz siniri asilinca reddedilmeli');
});

test('metin kanali: mesajlar veritabaninda kalici saklanir (oda sohbeti gibi bellekte degil)', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'txtOwner4');
  const member = await makeUser(base, 'txtMember4');
  const { server: srv, channel } = await createTextServer(base, owner, member);

  const ack = await emit(owner.socket, 'send-server-message', { channelId: channel.id, text: 'kalici mesaj', clientMessageId: randomUUID() });
  assert.equal(ack.ok, true);

  // Dogrudan veritabanindan okunabiliyor olmasi, mesajin sunucu surecinin
  // bellek-ici 'rooms' Map'inde degil, dosya tabanli tabloda tutuldugunu kanitlar;
  // sure yeniden baslatilsa bile bu satir DB dosyasinda kalmaya devam eder.
  const rows = await db.getServerMessages(channel.id, owner.userId, { limit: 10 });
  assert.ok(rows.some((r) => r.text === 'kalici mesaj'));

  const historyRes = await fetch(`${base}/api/servers/${srv.id}/channels/${channel.id}/messages`, {
    headers: owner.auth,
  });
  const history = await historyRes.json();
  assert.ok(history.messages.some((m) => m.text === 'kalici mesaj' && m.from === owner.username));
});

test('metin kanali: normal uye baskasinin mesajini silemez, kendi mesajini silebilir, moderator herhangi bir mesaji silebilir', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'txtOwner5');
  const member = await makeUser(base, 'txtMember5');
  const other = await makeUser(base, 'txtOther5');
  const { server: srv, channel } = await createTextServer(base, owner, member);
  await fetch(`${base}/api/servers/join`, { method: 'POST', headers: jsonAuth(other.token), body: JSON.stringify({ inviteCode: srv.inviteCode }) });

  const ownerMsgAck = await emit(owner.socket, 'send-server-message', { channelId: channel.id, text: 'sahip mesaji', clientMessageId: randomUUID() });
  const memberMsgAck = await emit(member.socket, 'send-server-message', { channelId: channel.id, text: 'uye mesaji', clientMessageId: randomUUID() });
  assert.equal(ownerMsgAck.ok, true);
  assert.equal(memberMsgAck.ok, true);

  // Sade uye (other), baskasinin (member) mesajini herkesten silemez - yalnizca
  // kendi gorunumunden gizleyebilir (digerleri icin mesaj hala duruyor).
  const hideForOther = await emit(other.socket, 'delete-server-message', { messageId: memberMsgAck.message.id });
  assert.equal(hideForOther.ok, true);
  assert.equal(hideForOther.mode, 'me');
  const stillVisibleForMember = await db.getServerMessages(channel.id, member.userId, { limit: 10 });
  assert.ok(stillVisibleForMember.some((m) => m.id === memberMsgAck.message.id), 'mesaj sahibi icin hala gorunur olmali');
  const hiddenForOther = await db.getServerMessages(channel.id, other.userId, { limit: 10 });
  assert.ok(!hiddenForOther.some((m) => m.id === memberMsgAck.message.id), 'other icin artik gorunmemeli');

  // Uye kendi mesajini silebilir.
  const memberDeletesOwn = event(owner.socket, 'server-message-deleted');
  const ownDelete = await emit(member.socket, 'delete-server-message', { messageId: memberMsgAck.message.id });
  assert.equal(ownDelete.ok, true);
  const deletedEvent = await memberDeletesOwn;
  assert.equal(deletedEvent.messageId, memberMsgAck.message.id);

  // Sahip (moderator/owner), baskasinin mesajini silebilir - burada kendi mesajini test icin kullaniyoruz,
  // ayrica moderator rolu ile de dogrulaniyor.
  await fetch(`${base}/api/servers/${srv.id}/members/${other.username}/role`, {
    method: 'POST',
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ role: 'moderator' }),
  });
  const modDelete = await emit(other.socket, 'delete-server-message', { messageId: ownerMsgAck.message.id });
  assert.equal(modDelete.ok, true, 'moderator baskasinin mesajini silebilmeli');

  const remaining = await db.getServerMessages(channel.id, owner.userId, { limit: 10 });
  assert.equal(remaining.length, 0);
});

test('metin kanali: 5 dakika sonra kendi mesajini artik herkesten silemez, yalnizca kendinden gizleyebilir', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'txtOwner8');
  const member = await makeUser(base, 'txtMember8');
  const { channel } = await createTextServer(base, owner, member);

  const msgAck = await emit(member.socket, 'send-server-message', { channelId: channel.id, text: 'eski mesaj', clientMessageId: randomUUID() });
  assert.equal(msgAck.ok, true);

  await adapter.query({
    sql: 'UPDATE server_messages SET created_at = ? WHERE id = ?',
    args: [Date.now() - 6 * 60 * 1000, msgAck.message.id],
  });

  const lateDelete = await emit(member.socket, 'delete-server-message', { messageId: msgAck.message.id });
  assert.equal(lateDelete.ok, true);
  assert.equal(lateDelete.mode, 'me', '5 dakikayi gecmis kendi mesaji artik herkesten silinemez');

  const stillThereForOwner = await db.getServerMessages(channel.id, owner.userId, { limit: 10 });
  assert.ok(stillThereForOwner.some((m) => m.id === msgAck.message.id), 'mesaj digerleri icin hala durmali');
  const hiddenForMember = await db.getServerMessages(channel.id, member.userId, { limit: 10 });
  assert.ok(!hiddenForMember.some((m) => m.id === msgAck.message.id), 'kendi gorunumunden gizlenmis olmali');
});

test('metin kanali: okunmamis mesaj sayisi ve okundu durumu dogru calisir', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'txtOwner6');
  const member = await makeUser(base, 'txtMember6');
  const { server: srv, channel } = await createTextServer(base, owner, member);

  await emit(owner.socket, 'send-server-message', { channelId: channel.id, text: 'birinci', clientMessageId: randomUUID() });
  await emit(owner.socket, 'send-server-message', { channelId: channel.id, text: 'ikinci', clientMessageId: randomUUID() });

  const detailBefore = await (await fetch(`${base}/api/servers/${srv.id}`, { headers: member.auth })).json();
  const channelBefore = detailBefore.channels.find((c) => c.id === channel.id);
  assert.equal(channelBefore.unreadCount, 2);

  const listBefore = await (await fetch(`${base}/api/servers`, { headers: member.auth })).json();
  assert.equal(listBefore.servers.find((s) => s.id === srv.id).unreadCount, 2);

  // Gonderenin kendi okunmamis sayaci sifir kalmali (kendi mesaji otomatik okunmus sayilir).
  const ownerList = await (await fetch(`${base}/api/servers`, { headers: owner.auth })).json();
  assert.equal(ownerList.servers.find((s) => s.id === srv.id).unreadCount, 0);

  const readRes = await fetch(`${base}/api/servers/${srv.id}/channels/${channel.id}/read`, { method: 'POST', headers: member.auth });
  assert.equal(readRes.status, 200);

  const detailAfter = await (await fetch(`${base}/api/servers/${srv.id}`, { headers: member.auth })).json();
  assert.equal(detailAfter.channels.find((c) => c.id === channel.id).unreadCount, 0);

  const listAfter = await (await fetch(`${base}/api/servers`, { headers: member.auth })).json();
  assert.equal(listAfter.servers.find((s) => s.id === srv.id).unreadCount, 0);
});

test('metin kanali: mevcut sesli kanal davranisi bozulmadan devam eder (metin kanali ses odasi gibi acilmaz)', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'txtOwner7');
  const member = await makeUser(base, 'txtMember7');
  const { server: srv } = await createTextServer(base, owner, member);

  const voiceChannel = await (
    await fetch(`${base}/api/servers/${srv.id}/channels`, {
      method: 'POST',
      headers: jsonAuth(owner.token),
      body: JSON.stringify({ name: 'sesli-oda', type: 'voice' }),
    })
  ).json();
  assert.equal(voiceChannel.type, 'voice');

  const joinVoice = await emit(owner.socket, 'join-server-channel', { channelId: voiceChannel.id });
  assert.equal(joinVoice.ok, true);
  assert.equal(joinVoice.roomType, 'server-channel');

  // Gecersiz kanal turu reddedilir.
  const invalidType = await fetch(`${base}/api/servers/${srv.id}/channels`, {
    method: 'POST',
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ name: 'gecersiz', type: 'video' }),
  });
  assert.equal(invalidType.status, 400);
});
