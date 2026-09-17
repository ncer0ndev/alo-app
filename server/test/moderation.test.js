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
process.env.JWT_SECRET = 'moderation-isolated-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-moderation-${randomUUID()}.db`);

const db = require('../db');
const { server, io, ready } = require('../index');
const sockets = [];

const event = (socket, name, ms = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} olayi gelmedi`)), ms);
    socket.once(name, (payload) => { clearTimeout(timer); resolve(payload); });
  });
const emit = (socket, name, payload) => socket.timeout(2500).emitWithAck(name, payload);
const jsonHeaders = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

async function makeUser(base, username) {
  const userId = await db.createUser(username, 'unused-test-hash');
  const token = jwt.sign({ userId, username }, process.env.JWT_SECRET);
  const socket = connect(base, { auth: { token }, reconnection: false, forceNew: true });
  sockets.push(socket);
  await event(socket, 'authenticated');
  return { userId, username, token, socket, headers: jsonHeaders(token) };
}

async function post(base, endpoint, user, body = {}) {
  const res = await fetch(`${base}${endpoint}`, { method: 'POST', headers: user.headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test.after(async () => {
  for (const socket of sockets) socket.disconnect();
  await new Promise((resolve) => io.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(process.env.DB_PATH + suffix); } catch {}
  }
});

test('moderasyon ve topluluk yonetimi: yasak, engel, sikayet, yeniden adlandirma, siralama ve sahiplik devri', { timeout: 25000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'necr0n');
  const moderator = await makeUser(base, 'modUser');
  const member = await makeUser(base, 'memberUser');
  const other = await makeUser(base, 'otherUser');

  const created = await post(base, '/api/servers', owner, { name: 'Eski Ad' });
  assert.equal(created.status, 200);
  await post(base, '/api/servers/join', moderator, { inviteCode: created.body.inviteCode });
  await post(base, '/api/servers/join', member, { inviteCode: created.body.inviteCode });
  await post(base, `/api/servers/${created.body.id}/members/${moderator.username}/role`, owner, { role: 'moderator' });

  const forbiddenSettings = await post(base, `/api/servers/${created.body.id}/settings`, member, { name: 'Olmaz', iconId: 'robot' });
  assert.equal(forbiddenSettings.status, 403);
  const settings = await post(base, `/api/servers/${created.body.id}/settings`, owner, { name: 'Yeni Ad', iconId: 'phoenix' });
  assert.equal(settings.status, 200);

  const first = await post(base, `/api/servers/${created.body.id}/channels`, owner, { name: 'Bir', type: 'text' });
  const second = await post(base, `/api/servers/${created.body.id}/channels`, owner, { name: 'Iki', type: 'voice' });
  assert.equal((await post(base, `/api/servers/${created.body.id}/channels/${first.body.id}/rename`, moderator, { name: 'Genel' })).status, 200);
  assert.equal((await post(base, `/api/servers/${created.body.id}/channels/reorder`, moderator, { channelIds: [second.body.id, first.body.id] })).status, 200);
  const reordered = await (await fetch(`${base}/api/servers/${created.body.id}`, { headers: owner.headers })).json();
  assert.deepEqual(reordered.channels.map((channel) => channel.id), [second.body.id, first.body.id]);

  const modCannotBanOwner = await post(base, `/api/servers/${created.body.id}/members/${owner.username}/ban`, moderator, { reason: 'olmaz' });
  assert.equal(modCannotBanOwner.status, 403);
  assert.equal((await post(base, `/api/servers/${created.body.id}/members/${member.username}/ban`, owner, { reason: 'kural ihlali' })).status, 200);
  assert.equal((await post(base, '/api/servers/join', member, { inviteCode: created.body.inviteCode })).status, 403);
  const bans = await (await fetch(`${base}/api/servers/${created.body.id}/bans`, { headers: moderator.headers })).json();
  assert.equal(bans.bans[0].username, member.username);
  const unban = await fetch(`${base}/api/servers/${created.body.id}/bans/${member.username}`, { method: 'DELETE', headers: moderator.headers });
  assert.equal(unban.status, 200);
  assert.equal((await post(base, '/api/servers/join', member, { inviteCode: created.body.inviteCode })).status, 200);

  assert.equal((await post(base, `/api/servers/${created.body.id}/transfer`, owner, { username: moderator.username })).status, 200);
  const afterTransfer = await (await fetch(`${base}/api/servers/${created.body.id}`, { headers: moderator.headers })).json();
  assert.equal(afterTransfer.role, 'owner');
  assert.equal(afterTransfer.members.find((item) => item.username === owner.username).role, 'member');

  await db.createFriendRequest(member.userId, other.userId);
  await db.acceptFriendRequest(member.userId, other.userId);
  assert.equal(await db.areFriends(member.userId, other.userId), true);
  assert.equal((await post(base, `/api/blocks/${other.username}`, member)).status, 200);
  assert.equal(await db.areFriends(member.userId, other.userId), false);
  const blockedDm = await emit(member.socket, 'dm-message', { toUsername: other.username, text: 'ulasmasin', clientMessageId: randomUUID() });
  assert.ok(blockedDm.error);
  const blockedCallEvent = event(member.socket, 'call-failed');
  const blockedCall = await emit(member.socket, 'call-friend', { toUsername: other.username });
  assert.equal(blockedCall.ok, true);
  assert.equal((await blockedCallEvent).reason, 'not-friends');
  assert.equal((await post(base, '/api/friends/request', other, { username: member.username })).status, 403);

  assert.equal((await post(base, '/api/reports', member, { username: other.username, reason: 'rahatsiz edici davranis' })).status, 200);
  const reportRes = await fetch(`${base}/api/admin/reports`, { headers: owner.headers });
  const reports = await reportRes.json();
  assert.equal(reportRes.status, 200);
  const openReport = reports.reports.find((report) => report.reported === other.username);
  assert.ok(openReport);
  assert.equal((await post(base, `/api/admin/reports/${openReport.id}/resolve`, owner)).status, 200);
  const afterResolve = await (await fetch(`${base}/api/admin/reports`, { headers: owner.headers })).json();
  assert.equal(afterResolve.reports.some((report) => Number(report.id) === Number(openReport.id)), false);

  const auditRes = await fetch(`${base}/api/servers/${created.body.id}/audit-log`, { headers: moderator.headers });
  const audit = await auditRes.json();
  assert.equal(auditRes.status, 200);
  assert.ok(audit.entries.some((entry) => entry.action === 'ownership_transferred'));
  assert.ok(audit.entries.some((entry) => entry.action === 'member_banned'));
});
