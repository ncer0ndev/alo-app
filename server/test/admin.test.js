const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = 'admin-isolated-test-only';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-admin-${randomUUID()}.db`);

const db = require('../db');
const { server, io, ready } = require('../index');

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(process.env.DB_PATH + suffix);
    } catch {
      // dosya olmayabilir
    }
  }
});

test('admin: yalnizca necr0n kullanicilar panelini gorebilir ve sifre sifirlayabilir', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;

  const adminId = await db.createUser('necr0n', 'unused-test-hash');
  const adminToken = jwt.sign({ userId: adminId, username: 'necr0n' }, process.env.JWT_SECRET);

  const regularId = await db.createUser('adminTestRegular', 'unused-test-hash');
  const regularToken = jwt.sign({ userId: regularId, username: 'adminTestRegular' }, process.env.JWT_SECRET);

  await db.createUser('adminTestTarget', await require('bcryptjs').hash('original-pass', 10));

  // Admin olmayan biri panele erisemez.
  const deniedList = await fetch(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${regularToken}` } });
  assert.equal(deniedList.status, 403);
  const deniedReset = await fetch(`${base}/api/admin/users/adminTestTarget/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${regularToken}` },
  });
  assert.equal(deniedReset.status, 403);

  // necr0n kullanici listesini gorebilir.
  const listRes = await fetch(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  const usernames = listBody.users.map((u) => u.username);
  assert.ok(usernames.includes('necr0n'));
  assert.ok(usernames.includes('adminTestRegular'));
  assert.ok(usernames.includes('adminTestTarget'));

  // necr0n hedef kullanicinin sifresini sifirlayabilir; eski sifre artik gecersiz, yeni gecici sifreyle giris yapilabilir.
  const resetRes = await fetch(`${base}/api/admin/users/adminTestTarget/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(resetRes.status, 200);
  const resetBody = await resetRes.json();
  assert.ok(resetBody.tempPassword && resetBody.tempPassword.length >= 8);

  const oldLoginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'adminTestTarget', password: 'original-pass' }),
  });
  assert.equal(oldLoginRes.status, 401);

  const newLoginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'adminTestTarget', password: resetBody.tempPassword }),
  });
  assert.equal(newLoginRes.status, 200);
});

test('profil: kullanici kendi sifresini degistirebilir, yanlis mevcut sifre reddedilir', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const bcrypt = require('bcryptjs');
  const userId = await db.createUser('passChangeUser', bcrypt.hashSync('startpass1', 10));
  const token = jwt.sign({ userId, username: 'passChangeUser' }, process.env.JWT_SECRET);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const wrongRes = await fetch(`${base}/api/profile/password`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ currentPassword: 'yanlis-sifre', newPassword: 'yenisifre1' }),
  });
  assert.equal(wrongRes.status, 401);

  const okRes = await fetch(`${base}/api/profile/password`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ currentPassword: 'startpass1', newPassword: 'yenisifre1' }),
  });
  assert.equal(okRes.status, 200);

  const oldLoginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'passChangeUser', password: 'startpass1' }),
  });
  assert.equal(oldLoginRes.status, 401);

  const newLoginRes = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'passChangeUser', password: 'yenisifre1' }),
  });
  assert.equal(newLoginRes.status, 200);
});

test('admin: kullanici hesabi silme - yetkilendirme, kendi hesabini silememe, arkadaslik/topluluk temizligi', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const bcrypt = require('bcryptjs');

  const admin = await db.getUserByUsername('necr0n');
  const adminToken = jwt.sign({ userId: admin.id, username: 'necr0n' }, process.env.JWT_SECRET);
  const adminAuth = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  const regularId = await db.createUser('delTestRegular', 'unused-test-hash');
  const regularToken = jwt.sign({ userId: regularId, username: 'delTestRegular' }, process.env.JWT_SECRET);

  // Admin olmayan biri hesap silemez.
  const deniedDelete = await fetch(`${base}/api/admin/users/delTestVictim1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${regularToken}` },
  });
  assert.equal(deniedDelete.status, 403);

  // Admin kendi hesabini bu yoldan silemez.
  const selfDelete = await fetch(`${base}/api/admin/users/necr0n`, { method: 'DELETE', headers: adminAuth });
  assert.equal(selfDelete.status, 400);

  // Var olmayan kullanici 404 doner.
  const missingDelete = await fetch(`${base}/api/admin/users/hicYokBoyleBiri`, { method: 'DELETE', headers: adminAuth });
  assert.equal(missingDelete.status, 404);

  // --- Silinecek kullanici: arkadasi var, tek basina sahip oldugu bir topluluk var. ---
  const victim1Id = await db.createUser('delTestVictim1', bcrypt.hashSync('pass12345', 10));
  const victim1Token = jwt.sign({ userId: victim1Id, username: 'delTestVictim1' }, process.env.JWT_SECRET);
  const victim1Auth = { Authorization: `Bearer ${victim1Token}`, 'Content-Type': 'application/json' };

  const friendId = await db.createUser('delTestFriend', 'unused-test-hash');
  await db.createFriendRequest(victim1Id, friendId);
  await db.acceptFriendRequest(victim1Id, friendId);
  assert.ok(await db.areFriends(victim1Id, friendId));

  const soloServer = await (
    await fetch(`${base}/api/servers`, { method: 'POST', headers: victim1Auth, body: JSON.stringify({ name: 'Solo Topluluk' }) })
  ).json();

  const deleteVictim1 = await fetch(`${base}/api/admin/users/delTestVictim1`, { method: 'DELETE', headers: adminAuth });
  assert.equal(deleteVictim1.status, 200);

  // Hesap artik giris yapamaz.
  const loginAfterDelete = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'delTestVictim1', password: 'pass12345' }),
  });
  assert.equal(loginAfterDelete.status, 401);

  // Arkadaslik temizlenmis: eski arkadas artik onu listesinde gormuyor.
  const friendToken = jwt.sign({ userId: friendId, username: 'delTestFriend' }, process.env.JWT_SECRET);
  const friendsListRes = await fetch(`${base}/api/friends`, { headers: { Authorization: `Bearer ${friendToken}` } });
  const friendsListBody = await friendsListRes.json();
  assert.ok(!friendsListBody.friends.some((f) => f.username === 'delTestVictim1'));

  // Tek basina sahip oldugu topluluk tamamen silinmis (baska uye yoktu).
  const soloServerAfter = await fetch(`${base}/api/servers/${soloServer.id}`, { headers: adminAuth });
  assert.equal(soloServerAfter.status, 404);

  // Yonetim panelindeki kullanici listesinde artik gorunmuyor.
  const usersAfter = await (await fetch(`${base}/api/admin/users`, { headers: adminAuth })).json();
  assert.ok(!usersAfter.users.some((u) => u.username === 'delTestVictim1'));

  // --- Silinecek kullanici: baska uyeleri olan bir toplulugun sahibi. ---
  const victim2Id = await db.createUser('delTestVictim2', 'unused-test-hash');
  const victim2Token = jwt.sign({ userId: victim2Id, username: 'delTestVictim2' }, process.env.JWT_SECRET);
  const victim2Auth = { Authorization: `Bearer ${victim2Token}`, 'Content-Type': 'application/json' };

  const memberId = await db.createUser('delTestMember', 'unused-test-hash');
  const memberToken = jwt.sign({ userId: memberId, username: 'delTestMember' }, process.env.JWT_SECRET);
  const memberAuth = { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' };

  const sharedServer = await (
    await fetch(`${base}/api/servers`, { method: 'POST', headers: victim2Auth, body: JSON.stringify({ name: 'Paylasilan Topluluk' }) })
  ).json();
  await fetch(`${base}/api/servers/join`, {
    method: 'POST',
    headers: memberAuth,
    body: JSON.stringify({ inviteCode: sharedServer.inviteCode }),
  });

  const deleteVictim2 = await fetch(`${base}/api/admin/users/delTestVictim2`, { method: 'DELETE', headers: adminAuth });
  assert.equal(deleteVictim2.status, 200);

  // Topluluk silinmemis, sahiplik kalan uyeye devredilmis.
  const sharedServerAfter = await (await fetch(`${base}/api/servers/${sharedServer.id}`, { headers: memberAuth })).json();
  assert.equal(sharedServerAfter.role, 'owner');
  assert.ok(!sharedServerAfter.members.some((m) => m.username === 'delTestVictim2'));
});
