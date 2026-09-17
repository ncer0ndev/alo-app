const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { io: ioClient } = require('socket.io-client');

const TEST_PORT = Number(process.env.ALO_TEST_PORT || 3211);
const TEST_DB = path.join(__dirname, `.test-${process.pid}.db`);

process.env.JWT_SECRET = 'test-secret-only-for-automated-tests';
process.env.PORT = String(TEST_PORT);
process.env.DB_PATH = TEST_DB;

const { server, ready } = require('../index');
const BASE = `http://localhost:${TEST_PORT}`;

test.before(async () => {
  await ready;
});

test.after(() => {
  server.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      // dosya olmayabilir, sorun degil
    }
  }
});

let uniqueCounter = 0;
function uniqueUsername(prefix) {
  uniqueCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uniqueCounter}`;
}

async function register(username, password) {
  const res = await fetch(`${BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return { status: res.status, body: await res.json() };
}

function connectSocket(token) {
  return ioClient(BASE, { auth: { token }, reconnection: false, forceNew: true });
}

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

test('ayni kullanici adiyla eszamanli kayit: sadece biri basarili olur', async () => {
  const username = uniqueUsername('race');
  const [a, b] = await Promise.all([register(username, 'password1'), register(username, 'password1')]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
});

test('token olmadan socket baglantisi reddedilir', async () => {
  const socket = ioClient(BASE, { reconnection: false, forceNew: true });
  const err = await waitFor(socket, 'connect_error');
  assert.ok(err);
  socket.close();
});

test('sinyal mesaji sadece ayni odadaki alicilara iletilir', async () => {
  const u1 = await register(uniqueUsername('sig1'), 'password1');
  const u2 = await register(uniqueUsername('sig2'), 'password1');
  const u3 = await register(uniqueUsername('sig3'), 'password1');

  const s1 = connectSocket(u1.body.token);
  const s2 = connectSocket(u2.body.token);
  const s3 = connectSocket(u3.body.token);
  await Promise.all([waitFor(s1, 'authenticated'), waitFor(s2, 'authenticated'), waitFor(s3, 'authenticated')]);

  const { roomCode } = await new Promise((resolve) => s1.emit('create-room', {}, resolve));
  const join1 = await new Promise((resolve) => s1.emit('join-room', { roomCode }, resolve));
  const join2 = await new Promise((resolve) => s2.emit('join-room', { roomCode }, resolve));
  assert.ok(join1.ok && join2.ok);
  // s3 bilerek odaya katilmiyor - farkli oda/disaridaki kullanici

  const receivedByS2 = waitFor(s2, 'signal');
  let receivedByS3 = false;
  s3.once('signal', () => { receivedByS3 = true; });

  s1.emit('signal', { to: s2.id, data: { candidate: { foo: 'bar' } } });
  // s3'e (odada olmayan birine) sinyal gondermeye calis - sunucu yok saymali
  s1.emit('signal', { to: s3.id, data: { candidate: { foo: 'bar' } } });

  const got = await receivedByS2;
  assert.equal(got.from, s1.id);

  await new Promise((r) => setTimeout(r, 200));
  assert.equal(receivedByS3, false, 's3 odada degilken sinyal almamali');

  s1.close(); s2.close(); s3.close();
});

test('arama cevabini sadece hedeflenen kisi verebilir', async () => {
  const caller = await register(uniqueUsername('caller'), 'password1');
  const callee = await register(uniqueUsername('callee'), 'password1');
  const stranger = await register(uniqueUsername('outsider'), 'password1');

  // arkadas yap: caller -> callee istek, callee kabul
  const callerAuth = { Authorization: `Bearer ${caller.body.token}` };
  const calleeAuth = { Authorization: `Bearer ${callee.body.token}` };

  await fetch(`${BASE}/api/friends/request`, {
    method: 'POST',
    headers: { ...callerAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: callee.body.username }),
  });
  await fetch(`${BASE}/api/friends/accept`, {
    method: 'POST',
    headers: { ...calleeAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: caller.body.username }),
  });

  const sCaller = connectSocket(caller.body.token);
  const sCallee = connectSocket(callee.body.token);
  const sStranger = connectSocket(stranger.body.token);
  await Promise.all([waitFor(sCaller, 'authenticated'), waitFor(sCallee, 'authenticated'), waitFor(sStranger, 'authenticated')]);

  const incomingPromise = waitFor(sCallee, 'incoming-call');
  sCaller.emit('call-friend', { toUsername: callee.body.username }, () => {});
  const { roomCode } = await incomingPromise;

  // yabanci kullanici, kendine ait olmayan aramayi kabul etmeye calisiyor
  sStranger.emit('call-response', { roomCode, accepted: true });

  let acceptedEventFired = false;
  sCaller.once('call-accepted', () => { acceptedEventFired = true; });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(acceptedEventFired, false, 'yabanci kullanicinin cevabi gecerli sayilmamali');

  // gercek alici kabul edince basarili olmali
  const realAccept = waitFor(sCaller, 'call-accepted');
  sCallee.emit('call-response', { roomCode, accepted: true });
  const acceptedPayload = await realAccept;
  assert.equal(acceptedPayload.roomCode, roomCode);

  sCaller.close(); sCallee.close(); sStranger.close();
});

test('oda degistirince eski odadaki katilimcilar peer-left bildirimi alir', async () => {
  const u1 = await register(uniqueUsername('sw1'), 'password1');
  const u2 = await register(uniqueUsername('sw2'), 'password1');
  const s1 = connectSocket(u1.body.token);
  const s2 = connectSocket(u2.body.token);
  await Promise.all([waitFor(s1, 'authenticated'), waitFor(s2, 'authenticated')]);

  const { roomCode: roomA } = await new Promise((resolve) => s1.emit('create-room', {}, resolve));
  await new Promise((resolve) => s1.emit('join-room', { roomCode: roomA }, resolve));
  await new Promise((resolve) => s2.emit('join-room', { roomCode: roomA }, resolve));

  const { roomCode: roomB } = await new Promise((resolve) => s1.emit('create-room', {}, resolve));
  const leftPromise = waitFor(s2, 'peer-left');
  await new Promise((resolve) => s1.emit('join-room', { roomCode: roomB }, resolve));

  const leftPayload = await leftPromise;
  assert.equal(leftPayload.id, s1.id);

  s1.close(); s2.close();
});

test('mesgul kullanici tekrar aranamaz, arama iptali karsi tarafa iletilir', async () => {
  const a = await register(uniqueUsername('busyA'), 'password1');
  const b = await register(uniqueUsername('busyB'), 'password1');
  const c = await register(uniqueUsername('busyC'), 'password1');

  const authA = { Authorization: `Bearer ${a.body.token}` };
  const authB = { Authorization: `Bearer ${b.body.token}` };
  const authC = { Authorization: `Bearer ${c.body.token}` };

  await fetch(`${BASE}/api/friends/request`, { method: 'POST', headers: { ...authA, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: b.body.username }) });
  await fetch(`${BASE}/api/friends/accept`, { method: 'POST', headers: { ...authB, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: a.body.username }) });
  await fetch(`${BASE}/api/friends/request`, { method: 'POST', headers: { ...authC, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: b.body.username }) });
  await fetch(`${BASE}/api/friends/accept`, { method: 'POST', headers: { ...authB, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.body.username }) });

  const sA = connectSocket(a.body.token);
  const sB = connectSocket(b.body.token);
  const sC = connectSocket(c.body.token);
  await Promise.all([waitFor(sA, 'authenticated'), waitFor(sB, 'authenticated'), waitFor(sC, 'authenticated')]);

  // A, B'yi ariyor - B'nin telefonu calmaya baslar
  const bIncoming = waitFor(sB, 'incoming-call');
  sA.emit('call-friend', { toUsername: b.body.username }, () => {});
  const { roomCode } = await bIncoming;

  // C de ayni anda B'yi arasin - B mesgul oldugu icin basarisiz olmali
  const cFailed = waitFor(sC, 'call-failed');
  sC.emit('call-friend', { toUsername: b.body.username }, () => {});
  const failPayload = await cFailed;
  assert.equal(failPayload.reason, 'busy');

  // A aramayi iptal edince B'ye call-cancelled gitmeli
  const bCancelled = waitFor(sB, 'call-cancelled');
  sA.emit('cancel-call', { roomCode });
  const cancelPayload = await bCancelled;
  assert.equal(cancelPayload.roomCode, roomCode);

  sA.close(); sB.close(); sC.close();
});

test('gecersiz oda koduna katilma yeni oda olusturmaz', async () => {
  const u1 = await register(uniqueUsername('ijoin'), 'password1');
  const s1 = connectSocket(u1.body.token);
  await waitFor(s1, 'authenticated');

  const result = await new Promise((resolve) => s1.emit('join-room', { roomCode: 'DEADBEEF99' }, resolve));
  assert.ok(result.error, 'olmayan oda kodu hata dondurmeli');

  s1.close();
});

test('sohbet: ayni odadakiler mesajlasabilir, farkli oda goremez, yetkisiz gonderim reddedilir', async () => {
  const u1 = await register(uniqueUsername('chat1'), 'password1');
  const u2 = await register(uniqueUsername('chat2'), 'password1');
  const outsider = await register(uniqueUsername('chatout'), 'password1');

  const s1 = connectSocket(u1.body.token);
  const s2 = connectSocket(u2.body.token);
  const sOutsider = connectSocket(outsider.body.token);
  await Promise.all([waitFor(s1, 'authenticated'), waitFor(s2, 'authenticated'), waitFor(sOutsider, 'authenticated')]);

  const { roomCode } = await new Promise((resolve) => s1.emit('create-room', {}, resolve));
  await new Promise((resolve) => s1.emit('join-room', { roomCode }, resolve));
  await new Promise((resolve) => s2.emit('join-room', { roomCode }, resolve));

  // yetkisiz gonderim: odada olmayan biri mesaj gonderemez
  const unauthorizedResult = await new Promise((resolve) =>
    sOutsider.emit('chat-message', { text: 'merhaba', clientMessageId: 'c-unauth' }, resolve)
  );
  assert.ok(unauthorizedResult.error, 'odada olmayan kullanici mesaj gonderememeli');

  // ayni odadaki mesajlasma
  const received = waitFor(s2, 'chat-message');
  const ack = await new Promise((resolve) => s1.emit('chat-message', { text: 'selam!', clientMessageId: 'c-1' }, resolve));
  assert.ok(ack.ok && ack.message.id);
  assert.equal(ack.message.from, u1.body.username);
  const msg = await received;
  assert.equal(msg.text, 'selam!');
  assert.equal(msg.from, u1.body.username);

  // bos mesaj reddedilir
  const emptyResult = await new Promise((resolve) => s1.emit('chat-message', { text: '   ', clientMessageId: 'c-2' }, resolve));
  assert.ok(emptyResult.error, 'bos mesaj kabul edilmemeli');

  // 2000 karakteri asan mesaj reddedilir
  const longResult = await new Promise((resolve) =>
    s1.emit('chat-message', { text: 'a'.repeat(2001), clientMessageId: 'c-3' }, resolve)
  );
  assert.ok(longResult.error, 'cok uzun mesaj kabul edilmemeli');

  // ayni clientMessageId ile tekrar gonderim (retry) ayni mesaji dondurur, kopya olusturmaz
  const retryAck1 = await new Promise((resolve) => s1.emit('chat-message', { text: 'tekrar test', clientMessageId: 'c-retry' }, resolve));
  const retryAck2 = await new Promise((resolve) => s1.emit('chat-message', { text: 'tekrar test', clientMessageId: 'c-retry' }, resolve));
  assert.equal(retryAck1.message.id, retryAck2.message.id, 'ayni clientMessageId ayni mesaj id sini dondurmeli');

  // farkli oda, bu odanin mesajlarini gormemeli (baska bir socket ile ayri oda)
  const s3 = connectSocket(outsider.body.token);
  await waitFor(s3, 'authenticated');
  const { roomCode: otherRoom } = await new Promise((resolve) => s3.emit('create-room', {}, resolve));
  await new Promise((resolve) => s3.emit('join-room', { roomCode: otherRoom }, resolve));

  let leaked = false;
  s3.on('chat-message', () => { leaked = true; });
  s1.emit('chat-message', { text: 'baska odaya sizmamali', clientMessageId: 'c-4' }, () => {});
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(leaked, false, 'baska odadaki kullanici bu odanin mesajini almamali');

  s1.close(); s2.close(); sOutsider.close(); s3.close();
});

test('sohbet: hiz siniri asilinca mesaj reddedilir', async () => {
  const u1 = await register(uniqueUsername('chatrate'), 'password1');
  const s1 = connectSocket(u1.body.token);
  await waitFor(s1, 'authenticated');
  const { roomCode } = await new Promise((resolve) => s1.emit('create-room', {}, resolve));
  await new Promise((resolve) => s1.emit('join-room', { roomCode }, resolve));

  let lastResult;
  for (let i = 0; i < 12; i++) {
    lastResult = await new Promise((resolve) =>
      s1.emit('chat-message', { text: `mesaj ${i}`, clientMessageId: `rate-${i}` }, resolve)
    );
  }
  assert.ok(lastResult.error, 'hiz siniri asilinca hata donmeli');

  s1.close();
});

test('sohbet: oda degistirince gecmis temizlenir, yeni katilan gecmisi ack ile alir', async () => {
  const u1 = await register(uniqueUsername('chathist'), 'password1');
  const u2 = await register(uniqueUsername('chathist2'), 'password1');
  const s1 = connectSocket(u1.body.token);
  const s2 = connectSocket(u2.body.token);
  await Promise.all([waitFor(s1, 'authenticated'), waitFor(s2, 'authenticated')]);

  const { roomCode: roomA } = await new Promise((resolve) => s1.emit('create-room', {}, resolve));
  await new Promise((resolve) => s1.emit('join-room', { roomCode: roomA }, resolve));
  await new Promise((resolve) => s1.emit('chat-message', { text: 'roomA mesaji', clientMessageId: 'hist-1' }, resolve));

  // s1 baska bir odaya gecer, roomA bosalir ve gecmisi silinir
  const { roomCode: roomB } = await new Promise((resolve) => s1.emit('create-room', {}, resolve));
  await new Promise((resolve) => s1.emit('join-room', { roomCode: roomB }, resolve));

  // s2 simdi roomA'ya katilsin - artik kimse yoktu, oda ve gecmisi silinmis olmali (yeni bos oda)
  const joinRoomAResult = await new Promise((resolve) => s2.emit('join-room', { roomCode: roomA }, resolve));
  assert.ok(joinRoomAResult.error, 'bosalan oda silinmis olmali, tekrar katilim basarisiz olmali');

  // roomB'ye katilan biri, oradaki gecmisi almamali (henuz mesaj yok)
  const joinRoomBResult = await new Promise((resolve) => s2.emit('join-room', { roomCode: roomB }, resolve));
  assert.ok(joinRoomBResult.ok);
  assert.deepEqual(joinRoomBResult.chatHistory, []);

  s1.close(); s2.close();
});

// ---- arkadas listesinden onaysiz oda katilimi ----

async function makeFriends(a, b) {
  await fetch(`${BASE}/api/friends/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: b.username }),
  });
  await fetch(`${BASE}/api/friends/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: a.username }),
  });
}

async function removeFriendship(a, b) {
  await fetch(`${BASE}/api/friends/remove`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: b.username }),
  });
}

test('arkadas odasi: sahibin arkadasi acik odaya onaysiz katilabilir', async () => {
  const owner = (await register(uniqueUsername('fro'), 'password1')).body;
  const friend = (await register(uniqueUsername('frf'), 'password1')).body;
  await makeFriends(owner, friend);

  const sOwner = connectSocket(owner.token);
  const sFriend = connectSocket(friend.token);
  await Promise.all([waitFor(sOwner, 'authenticated'), waitFor(sFriend, 'authenticated')]);

  const { roomCode } = await new Promise((resolve) => sOwner.emit('create-room', { access: 'friends' }, resolve));
  const joinAck = await new Promise((resolve) => sOwner.emit('join-room', { roomCode }, resolve));
  assert.ok(joinAck.ok && joinAck.isOwner && joinAck.access === 'friends');

  // arkadas listesi REST uzerinden de "odada" gormeli
  const friendsRes = await fetch(`${BASE}/api/friends`, { headers: { Authorization: `Bearer ${friend.token}` } });
  const friendsBody = await friendsRes.json();
  assert.equal(friendsBody.friends.find((f) => f.username === owner.username)?.roomOpen, true);

  // gercek zamanli bildirim de gelmis olmali (join sirasinda tetiklendi)
  const directJoinAck = await new Promise((resolve) => sFriend.emit('join-friend-room', { targetUsername: owner.username }, resolve));
  assert.ok(directJoinAck.ok, `beklenmeyen hata: ${directJoinAck.error}`);
  assert.equal(directJoinAck.roomCode, roomCode);

  // donen kod ile gercekten (onay/oda kodu istemeden) odaya girebiliyor mu?
  const finalJoin = await new Promise((resolve) => sFriend.emit('join-room', { roomCode: directJoinAck.roomCode }, resolve));
  assert.ok(finalJoin.ok);

  sOwner.close(); sFriend.close();
});

test('arkadas odasi: arkadas olmayan ve baska katilimcinin arkadasi dogrudan katilamaz', async () => {
  const owner = (await register(uniqueUsername('fro2'), 'password1')).body;
  const friend = (await register(uniqueUsername('frf2'), 'password1')).body;
  const stranger = (await register(uniqueUsername('frs2'), 'password1')).body;
  const participantFriend = (await register(uniqueUsername('frpf2'), 'password1')).body;
  await makeFriends(owner, friend);
  await makeFriends(friend, participantFriend); // participantFriend, ODA SAHIBI degil katilimci olan friend'in arkadasi

  const sOwner = connectSocket(owner.token);
  const sFriend = connectSocket(friend.token);
  const sStranger = connectSocket(stranger.token);
  const sParticipantFriend = connectSocket(participantFriend.token);
  await Promise.all([
    waitFor(sOwner, 'authenticated'),
    waitFor(sFriend, 'authenticated'),
    waitFor(sStranger, 'authenticated'),
    waitFor(sParticipantFriend, 'authenticated'),
  ]);

  const { roomCode } = await new Promise((resolve) => sOwner.emit('create-room', { access: 'friends' }, resolve));
  await new Promise((resolve) => sOwner.emit('join-room', { roomCode }, resolve));
  // friend (sahibin gercek arkadasi) odaya katilir - katilimci olur ama SAHIP degildir
  await new Promise((resolve) => sFriend.emit('join-room', { roomCode }, resolve));

  const strangerResult = await new Promise((resolve) => sStranger.emit('join-friend-room', { targetUsername: owner.username }, resolve));
  assert.ok(strangerResult.error, 'arkadas olmayan katilamamali');

  const participantFriendResult = await new Promise((resolve) =>
    sParticipantFriend.emit('join-friend-room', { targetUsername: friend.username }, resolve)
  );
  assert.ok(participantFriendResult.error, 'sahip olmayan bir katilimcinin arkadasi bu yolla katilamamali');

  sOwner.close(); sFriend.close(); sStranger.close(); sParticipantFriend.close();
});

test('arkadas odasi: ozel (yalnizca davetle) odaya ve birebir aramaya dogrudan katilim reddedilir', async () => {
  const owner = (await register(uniqueUsername('fropriv'), 'password1')).body;
  const friend = (await register(uniqueUsername('frfpriv'), 'password1')).body;
  await makeFriends(owner, friend);

  const sOwner = connectSocket(owner.token);
  const sFriend = connectSocket(friend.token);
  await Promise.all([waitFor(sOwner, 'authenticated'), waitFor(sFriend, 'authenticated')]);

  // varsayilan erisim 'invite' (yalnizca davetle)
  const { roomCode } = await new Promise((resolve) => sOwner.emit('create-room', {}, resolve));
  await new Promise((resolve) => sOwner.emit('join-room', { roomCode }, resolve));

  const privateResult = await new Promise((resolve) => sFriend.emit('join-friend-room', { targetUsername: owner.username }, resolve));
  assert.ok(privateResult.error, 'ozel odaya dogrudan katilim reddedilmeli');

  // birebir arama odasi da bu yolla erisilemez olmali
  // Ozel arama baslatmadan once mevcut gorusmeden ayrilmak gerekir.
  sOwner.emit('leave-room');
  const bIncoming = waitFor(sFriend, 'incoming-call');
  sOwner.emit('call-friend', { toUsername: friend.username }, () => {});
  await bIncoming; // arama basladi, callee henuz kabul etmedi

  const callRoomResult = await new Promise((resolve) => sFriend.emit('join-friend-room', { targetUsername: owner.username }, resolve));
  assert.ok(callRoomResult.error, 'birebir arama arkadas-odasi mekanizmasiyla erisilebilir olmamali');

  sOwner.close(); sFriend.close();
});

test('arkadas odasi: erisim kapatilinca, arkadaslik kaldirilinca veya sahip ayrilinca eski bilgilerle katilim basarisiz olur', async () => {
  const owner = (await register(uniqueUsername('froX'), 'password1')).body;
  const friendA = (await register(uniqueUsername('frfXa'), 'password1')).body;
  const friendB = (await register(uniqueUsername('frfXb'), 'password1')).body;
  await makeFriends(owner, friendA);
  await makeFriends(owner, friendB);

  const sOwner = connectSocket(owner.token);
  const sFriendA = connectSocket(friendA.token);
  const sFriendB = connectSocket(friendB.token);
  await Promise.all([waitFor(sOwner, 'authenticated'), waitFor(sFriendA, 'authenticated'), waitFor(sFriendB, 'authenticated')]);

  const { roomCode } = await new Promise((resolve) => sOwner.emit('create-room', { access: 'friends' }, resolve));
  await new Promise((resolve) => sOwner.emit('join-room', { roomCode }, resolve));

  // erisimi kapat -> friendA artik katilamaz
  const closeAck = await new Promise((resolve) => sOwner.emit('set-room-access', { access: 'invite' }, resolve));
  assert.ok(closeAck.ok);
  const afterCloseResult = await new Promise((resolve) => sFriendA.emit('join-friend-room', { targetUsername: owner.username }, resolve));
  assert.ok(afterCloseResult.error, 'erisim kapatildiktan sonra katilim basarisiz olmali');

  // tekrar ac, friendB arkadasligini kaldir -> friendB katilamaz
  await new Promise((resolve) => sOwner.emit('set-room-access', { access: 'friends' }, resolve));
  await removeFriendship(owner, friendB);
  const afterUnfriendResult = await new Promise((resolve) => sFriendB.emit('join-friend-room', { targetUsername: owner.username }, resolve));
  assert.ok(afterUnfriendResult.error, 'arkadasliktan cikarilan kisi katilamamali');

  // sahip ayrilir -> friendA (hala arkadas ve erisim acik) artik katilamaz, mevcut katilimcilar (yok burda) etkilenmez
  sOwner.emit('leave-room');
  await new Promise((r) => setTimeout(r, 150));
  const afterOwnerLeftResult = await new Promise((resolve) => sFriendA.emit('join-friend-room', { targetUsername: owner.username }, resolve));
  assert.ok(afterOwnerLeftResult.error, 'sahip ayrildiktan sonra katilim basarisiz olmali');

  sOwner.close(); sFriendA.close(); sFriendB.close();
});

test('arkadas odasi: sahip ayrilinca mevcut gorusme surer, son kisi ayrilinca oda temizlenir', async () => {
  const owner = (await register(uniqueUsername('froY'), 'password1')).body;
  const friend = (await register(uniqueUsername('frfY'), 'password1')).body;
  await makeFriends(owner, friend);

  const sOwner = connectSocket(owner.token);
  const sFriend = connectSocket(friend.token);
  await Promise.all([waitFor(sOwner, 'authenticated'), waitFor(sFriend, 'authenticated')]);

  const { roomCode } = await new Promise((resolve) => sOwner.emit('create-room', { access: 'friends' }, resolve));
  await new Promise((resolve) => sOwner.emit('join-room', { roomCode }, resolve));
  const friendJoinAck = await new Promise((resolve) => sFriend.emit('join-room', { roomCode }, resolve));
  assert.ok(friendJoinAck.ok);

  const peerLeftPromise = waitFor(sFriend, 'peer-left');
  sOwner.emit('leave-room');
  const peerLeftPayload = await peerLeftPromise;
  assert.ok(peerLeftPayload.id, 'sahip ayrilinca digerine peer-left gitmeli, gorusme sürmeli');

  // oda hala var mi kontrolu: friend tekrar ayni koda (kendine) baglanabilir durumda olmali (oda silinmemis)
  const stillThereAck = await new Promise((resolve) => sFriend.emit('join-room', { roomCode }, resolve));
  assert.ok(stillThereAck.ok, 'sahip ayrildiktan sonra oda hala var olmali (katilimci kalmis)');

  // simdi son kisi de ayrilsin -> oda ve gecmis temizlenmeli
  sFriend.emit('leave-room');
  await new Promise((r) => setTimeout(r, 150));
  const afterAllLeftAck = await new Promise((resolve) => sFriend.emit('join-room', { roomCode }, resolve));
  assert.ok(afterAllLeftAck.error, 'son kisi ayrildiktan sonra oda silinmis olmali');

  sOwner.close(); sFriend.close();
});

test('arkadas odasi: erisim acilip kapaninca arkadasa gercek zamanli bildirim gider', async () => {
  const owner = (await register(uniqueUsername('froZ'), 'password1')).body;
  const friend = (await register(uniqueUsername('frfZ'), 'password1')).body;
  await makeFriends(owner, friend);

  const sOwner = connectSocket(owner.token);
  const sFriend = connectSocket(friend.token);
  await Promise.all([waitFor(sOwner, 'authenticated'), waitFor(sFriend, 'authenticated')]);

  const { roomCode } = await new Promise((resolve) => sOwner.emit('create-room', {}, resolve));

  const openStatusPromise = waitFor(sFriend, 'friend-room-status');
  await new Promise((resolve) => sOwner.emit('join-room', { roomCode }, resolve));
  await new Promise((resolve) => sOwner.emit('set-room-access', { access: 'friends' }, resolve));
  const openPayload = await openStatusPromise;
  assert.equal(openPayload.username, owner.username);
  assert.equal(openPayload.roomOpen, true);

  const closeStatusPromise = waitFor(sFriend, 'friend-room-status');
  await new Promise((resolve) => sOwner.emit('set-room-access', { access: 'invite' }, resolve));
  const closePayload = await closeStatusPromise;
  assert.equal(closePayload.roomOpen, false);

  sOwner.close(); sFriend.close();
});
