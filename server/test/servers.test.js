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
process.env.JWT_SECRET = 'servers-isolated-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-servers-${randomUUID()}.db`);

const db = require('../db');
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

test('sunucular: olusturma, davetle katilim, kanal ve rol/uye yonetimi yetkilendirmesi', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'srvOwner');
  const member = await makeUser(base, 'srvMember');
  const outsider = await makeUser(base, 'srvOutsider');

  const createRes = await fetch(`${base}/api/servers`, {
    method: 'POST',
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ name: 'Test Sunucusu' }),
  });
  assert.equal(createRes.status, 200);
  const created = await createRes.json();
  assert.equal(created.role, 'owner');
  assert.ok(created.inviteCode);

  // Bicimce gecerli ama var olmayan kod reddedilir.
  const badJoin = await fetch(`${base}/api/servers/join`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ inviteCode: 'ABCDEF123456' }),
  });
  assert.equal(badJoin.status, 404);

  // Bicimsiz kod da reddedilir (400).
  const malformedJoin = await fetch(`${base}/api/servers/join`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ inviteCode: 'not-hex!' }),
  });
  assert.equal(malformedJoin.status, 400);

  const joinRes = await fetch(`${base}/api/servers/join`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ inviteCode: created.inviteCode }),
  });
  assert.equal(joinRes.status, 200);
  const joinBody = await joinRes.json();
  assert.equal(joinBody.role, 'member');

  // Ikinci kez katilim reddedilir.
  const dupJoin = await fetch(`${base}/api/servers/join`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ inviteCode: created.inviteCode }),
  });
  assert.equal(dupJoin.status, 409);

  // Uye olmayan detay goremez.
  const outsiderDetail = await fetch(`${base}/api/servers/${created.id}`, { headers: outsider.auth });
  assert.equal(outsiderDetail.status, 403);

  const memberDetail = await (await fetch(`${base}/api/servers/${created.id}`, { headers: member.auth })).json();
  assert.equal(memberDetail.members.length, 2);
  assert.equal(memberDetail.inviteCode, undefined, 'davet kodu yalnizca sahibe gosterilmeli');

  const ownerDetail = await (await fetch(`${base}/api/servers/${created.id}`, { headers: owner.auth })).json();
  assert.ok(ownerDetail.inviteCode);

  // Sade uye kanal olusturamaz.
  const memberChannelAttempt = await fetch(`${base}/api/servers/${created.id}/channels`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ name: 'Genel' }),
  });
  assert.equal(memberChannelAttempt.status, 403);

  const channelRes = await fetch(`${base}/api/servers/${created.id}/channels`, {
    method: 'POST',
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ name: 'Genel' }),
  });
  assert.equal(channelRes.status, 200);
  const channel = await channelRes.json();
  assert.equal(channel.name, 'Genel');

  // Sahip olmayan biri rol degistiremez; sahip kendi rolunu degistiremez.
  const memberRoleAttempt = await fetch(`${base}/api/servers/${created.id}/members/srvMember/role`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ role: 'moderator' }),
  });
  assert.equal(memberRoleAttempt.status, 403);
  const selfRoleAttempt = await fetch(`${base}/api/servers/${created.id}/members/srvOwner/role`, {
    method: 'POST',
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ role: 'moderator' }),
  });
  assert.equal(selfRoleAttempt.status, 400);

  const promoteRes = await fetch(`${base}/api/servers/${created.id}/members/srvMember/role`, {
    method: 'POST',
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ role: 'moderator' }),
  });
  assert.equal(promoteRes.status, 200);

  // Artik moderator olan uye kanal olusturabilir.
  const modChannelRes = await fetch(`${base}/api/servers/${created.id}/channels`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ name: 'Moderator Kanali' }),
  });
  assert.equal(modChannelRes.status, 200);

  // Sahip sunucudan ayrilamaz.
  const ownerLeaveAttempt = await fetch(`${base}/api/servers/${created.id}/leave`, {
    method: 'POST',
    headers: jsonAuth(owner.token),
  });
  assert.equal(ownerLeaveAttempt.status, 400);

  // Moderator sahibi cikaramaz.
  const modRemoveOwnerAttempt = await fetch(`${base}/api/servers/${created.id}/members/srvOwner/remove`, {
    method: 'POST',
    headers: jsonAuth(member.token),
  });
  assert.equal(modRemoveOwnerAttempt.status, 403);
});

test('sunucular: sesli kanala katilim uyelik gerektirir, moderator/sahip odadan atabilir, uye cikarilinca kanaldan da dusuruluyor', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'vcOwner');
  const member = await makeUser(base, 'vcMember');
  const outsider = await makeUser(base, 'vcOutsider');

  const created = await (
    await fetch(`${base}/api/servers`, { method: 'POST', headers: jsonAuth(owner.token), body: JSON.stringify({ name: 'Ses Sunucusu' }) })
  ).json();
  await fetch(`${base}/api/servers/join`, { method: 'POST', headers: jsonAuth(member.token), body: JSON.stringify({ inviteCode: created.inviteCode }) });
  const channel = await (
    await fetch(`${base}/api/servers/${created.id}/channels`, {
      method: 'POST',
      headers: jsonAuth(owner.token),
      body: JSON.stringify({ name: 'Oyun', type: 'voice' }),
    })
  ).json();

  // Uye olmayan kanala katilamaz.
  const outsiderJoin = await emit(outsider.socket, 'join-server-channel', { channelId: channel.id });
  assert.ok(outsiderJoin.error);

  const ownerJoin = await emit(owner.socket, 'join-server-channel', { channelId: channel.id });
  assert.equal(ownerJoin.ok, true);
  assert.equal(ownerJoin.roomType, 'server-channel');

  const ownerSeesJoin = event(owner.socket, 'peer-joined');
  const memberJoin = await emit(member.socket, 'join-server-channel', { channelId: channel.id });
  assert.equal(memberJoin.ok, true);
  await ownerSeesJoin;

  // Sade uye (henuz moderator degil) baskasini atamaz.
  const memberKickAttempt = await emit(member.socket, 'kick-participant', { targetSocketId: owner.socket.id });
  assert.ok(memberKickAttempt.error);

  // Sahip, uyeyi kanaldan atabilir.
  const kicked = event(member.socket, 'kicked-from-room');
  const kickAck = await emit(owner.socket, 'kick-participant', { targetSocketId: member.socket.id });
  assert.equal(kickAck.ok, true);
  await kicked;

  // Uye tekrar katilsin, bu kez sunucudan tamamen cikarilinca da kanaldan dusurulmeli.
  const rejoin = await emit(member.socket, 'join-server-channel', { channelId: channel.id });
  assert.equal(rejoin.ok, true);

  const removedFromVoice = event(member.socket, 'kicked-from-room');
  const removeRes = await fetch(`${base}/api/servers/${created.id}/members/vcMember/remove`, {
    method: 'POST',
    headers: jsonAuth(owner.token),
  });
  assert.equal(removeRes.status, 200);
  await removedFromVoice;

  // Sunucudan cikarildiktan sonra kanala tekrar katilamaz.
  const rejoinAfterRemoval = await emit(member.socket, 'join-server-channel', { channelId: channel.id });
  assert.ok(rejoinAfterRemoval.error);
});

test('topluluk canli durumu: uye cevrimici bilgisi ve ses kanali kisi sayisi anlik yayinlanir', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'liveOwner');
  const member = await makeUser(base, 'liveMember');

  const created = await (
    await fetch(`${base}/api/servers`, {
      method: 'POST',
      headers: jsonAuth(owner.token),
      body: JSON.stringify({ name: 'Canli Topluluk' }),
    })
  ).json();
  await fetch(`${base}/api/servers/join`, {
    method: 'POST',
    headers: jsonAuth(member.token),
    body: JSON.stringify({ inviteCode: created.inviteCode }),
  });

  const initialDetail = await (await fetch(`${base}/api/servers/${created.id}`, { headers: owner.auth })).json();
  assert.equal(initialDetail.members.find((item) => item.username === member.username).online, true);

  const wentOffline = event(owner.socket, 'server-member-presence');
  member.socket.disconnect();
  assert.deepEqual(await wentOffline, { serverId: created.id, username: member.username, online: false });

  const cameOnline = event(owner.socket, 'server-member-presence');
  const reconnected = connect(base, { auth: { token: member.token }, reconnection: false, forceNew: true });
  sockets.push(reconnected);
  member.socket = reconnected;
  await event(reconnected, 'authenticated');
  assert.deepEqual(await cameOnline, { serverId: created.id, username: member.username, online: true });

  const channel = await (
    await fetch(`${base}/api/servers/${created.id}/channels`, {
      method: 'POST',
      headers: jsonAuth(owner.token),
      body: JSON.stringify({ name: 'Canli Ses', type: 'voice' }),
    })
  ).json();

  const ownerCount = event(owner.socket, 'server-channel-count');
  assert.equal((await emit(owner.socket, 'join-server-channel', { channelId: channel.id })).ok, true);
  assert.deepEqual(await ownerCount, {
    serverId: created.id,
    channelId: channel.id,
    memberCount: 1,
    members: [{ username: 'liveOwner', avatarId: 'panda' }],
  });

  const joinedCount = event(owner.socket, 'server-channel-count');
  assert.equal((await emit(member.socket, 'join-server-channel', { channelId: channel.id })).ok, true);
  assert.deepEqual(await joinedCount, {
    serverId: created.id,
    channelId: channel.id,
    memberCount: 2,
    members: [
      { username: 'liveOwner', avatarId: 'panda' },
      { username: 'liveMember', avatarId: 'panda' },
    ],
  });

  const leftCount = event(owner.socket, 'server-channel-count');
  member.socket.emit('leave-room');
  assert.deepEqual(await leftCount, {
    serverId: created.id,
    channelId: channel.id,
    memberCount: 1,
    members: [{ username: 'liveOwner', avatarId: 'panda' }],
  });
});
