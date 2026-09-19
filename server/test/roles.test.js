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
process.env.JWT_SECRET = 'roles-isolated-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-roles-${randomUUID()}.db`);

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

async function createRole(base, ownerToken, serverId, { name, permissions }) {
  const res = await fetch(`${base}/api/servers/${serverId}/roles`, {
    method: 'POST',
    headers: jsonAuth(ownerToken),
    body: JSON.stringify({ name, color: '#ff0000', permissions }),
  });
  return { status: res.status, body: await res.json() };
}

async function assignRole(base, granterToken, serverId, username, roleId) {
  const res = await fetch(`${base}/api/servers/${serverId}/members/${username}/roles/${roleId}`, {
    method: 'POST',
    headers: jsonAuth(granterToken),
  });
  return { status: res.status, body: await res.json() };
}

test('ozel roller: sahip rol olusturup atayabilir, atanan kisi kendi rolundeki yetkiyi kullanabilir', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'rolOwner1');
  const helper = await makeUser(base, 'rolHelper1');
  const victim = await makeUser(base, 'rolVictim1');

  const created = await (
    await fetch(`${base}/api/servers`, { method: 'POST', headers: jsonAuth(owner.token), body: JSON.stringify({ name: 'Rol Test Toplulugu' }) })
  ).json();
  await fetch(`${base}/api/servers/join`, { method: 'POST', headers: jsonAuth(helper.token), body: JSON.stringify({ inviteCode: created.inviteCode }) });
  await fetch(`${base}/api/servers/join`, { method: 'POST', headers: jsonAuth(victim.token), body: JSON.stringify({ inviteCode: created.inviteCode }) });

  // Sade uye baskasini atamaya calisirsa reddedilmeli (henuz hicbir yetkisi yok).
  const forbiddenKick = await fetch(`${base}/api/servers/${created.id}/members/${victim.username}/remove`, { method: 'POST', headers: jsonAuth(helper.token) });
  assert.equal(forbiddenKick.status, 403);

  // Sahip, "uye atabilir" yetkisi tasiyan bir rol olusturup helper'a verir.
  const roleRes = await createRole(base, owner.token, created.id, { name: 'Yardimci', permissions: { canKick: true } });
  assert.equal(roleRes.status, 200);
  assert.equal(roleRes.body.canKick, true);
  assert.equal(roleRes.body.canBan, false);

  // canManageRoles yetkisi olmayan sahip DISINDA biri rol atayamaz.
  const forbiddenAssign = await assignRole(base, helper.token, created.id, victim.username, roleRes.body.id);
  assert.equal(forbiddenAssign.status, 403);

  const assignResult = await assignRole(base, owner.token, created.id, helper.username, roleRes.body.id);
  assert.equal(assignResult.status, 200);

  // Artik temel rolu hala "member" olan helper, ozel rolundeki yetkiyle victim'i atabilir.
  const kickRes = await fetch(`${base}/api/servers/${created.id}/members/${victim.username}/remove`, { method: 'POST', headers: jsonAuth(helper.token) });
  assert.equal(kickRes.status, 200, 'ozel rol sayesinde artik atabilmeli');

  // Sunucu detay yanitinda uyenin rolleri gorunmeli.
  const detail = await (await fetch(`${base}/api/servers/${created.id}`, { headers: jsonAuth(owner.token) })).json();
  const helperRow = detail.members.find((m) => m.username === helper.username);
  assert.ok(helperRow.roles.some((r) => r.id === roleRes.body.id && r.name === 'Yardimci'));
});

test('ozel roller: sahip rol verme yetkisini baskasina devredebilir, ama sahibin kendi rolunu baskasi degistiremez', { timeout: 20000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await makeUser(base, 'rolOwner2');
  const granter = await makeUser(base, 'rolGranter2');
  const target = await makeUser(base, 'rolTarget2');

  const created = await (
    await fetch(`${base}/api/servers`, { method: 'POST', headers: jsonAuth(owner.token), body: JSON.stringify({ name: 'Devir Test Toplulugu' }) })
  ).json();
  await fetch(`${base}/api/servers/join`, { method: 'POST', headers: jsonAuth(granter.token), body: JSON.stringify({ inviteCode: created.inviteCode }) });
  await fetch(`${base}/api/servers/join`, { method: 'POST', headers: jsonAuth(target.token), body: JSON.stringify({ inviteCode: created.inviteCode }) });

  const managerRole = await createRole(base, owner.token, created.id, { name: 'Rol Yoneticisi', permissions: { canManageRoles: true } });
  const otherRole = await createRole(base, owner.token, created.id, { name: 'Baska Rol', permissions: { canManageMessages: true } });
  await assignRole(base, owner.token, created.id, granter.username, managerRole.body.id);

  // Sadece owner rol OLUSTURABILIR - canManageRoles yetkisi olsa bile granter yeni bir rol yaratamaz.
  const forbiddenCreate = await createRole(base, granter.token, created.id, { name: 'Yasadisi Rol', permissions: {} });
  assert.equal(forbiddenCreate.status, 403);

  // Ama granter, devredilen yetkiyle BASKA bir uyeye mevcut bir rolu atayabilir.
  const delegatedAssign = await assignRole(base, granter.token, created.id, target.username, otherRole.body.id);
  assert.equal(delegatedAssign.status, 200, 'devredilen rol verme yetkisi calismali');

  // Granter, sahibin (owner) rolune dokunamaz.
  const forbiddenOnOwner = await assignRole(base, granter.token, created.id, owner.username, otherRole.body.id);
  assert.equal(forbiddenOnOwner.status, 403, 'sahibin rolunu baskasi degistirememeli');

  // Sahip kendi rolunu kendisi verebilir.
  const ownerSelfAssign = await assignRole(base, owner.token, created.id, owner.username, otherRole.body.id);
  assert.equal(ownerSelfAssign.status, 200, 'sahip kendi rolunu kendisi belirleyebilmeli');

  // Yalnizca sahip rol silebilir.
  const forbiddenDelete = await fetch(`${base}/api/servers/${created.id}/roles/${otherRole.body.id}`, { method: 'DELETE', headers: jsonAuth(granter.token) });
  assert.equal(forbiddenDelete.status, 403);
  const ownerDelete = await fetch(`${base}/api/servers/${created.id}/roles/${otherRole.body.id}`, { method: 'DELETE', headers: jsonAuth(owner.token) });
  assert.equal(ownerDelete.status, 200);
});
