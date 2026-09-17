const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { io: ioClient } = require('socket.io-client');

const TEST_PORT = 3211;
const TEST_DB = path.join(__dirname, `.test-${process.pid}.db`);

process.env.JWT_SECRET = 'test-secret-only-for-automated-tests';
process.env.PORT = String(TEST_PORT);
process.env.DB_PATH = TEST_DB;

const { server } = require('../index');
const BASE = `http://localhost:${TEST_PORT}`;

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

  const { roomCode } = await new Promise((resolve) => s1.emit('create-room', resolve));
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

  const { roomCode: roomA } = await new Promise((resolve) => s1.emit('create-room', resolve));
  await new Promise((resolve) => s1.emit('join-room', { roomCode: roomA }, resolve));
  await new Promise((resolve) => s2.emit('join-room', { roomCode: roomA }, resolve));

  const { roomCode: roomB } = await new Promise((resolve) => s1.emit('create-room', resolve));
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
