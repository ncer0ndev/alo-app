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
