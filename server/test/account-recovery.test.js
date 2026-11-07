const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
delete process.env.DATABASE_URL;
process.env.DB_PATH = path.join(os.tmpdir(), `alo-recovery-${crypto.randomUUID()}.db`);
const db = require('../db');
const adapter = require('../db-adapter');
const { createRecovery } = require('../account-recovery');
const messages = [], invalidated = [];
const recovery = createRecovery({ db, publicUrl: 'https://alo.example', sendMail: async mail => messages.push(mail), invalidateSessions: id => invalidated.push(id) });
const tokenFrom = mail => new URLSearchParams(new URL(mail.text.split('\n')[1]).hash.slice(1)).get('token');
test.before(() => db.init());
test.after(() => { for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + suffix); } catch {} } });

test('existing account verifies email and resets password with one-time hashed tokens', async () => {
  const id = await db.createUser('recoveryUser', await bcrypt.hash('oldpassword', 10));
  await assert.rejects(recovery.addEmail(id, 'user@example.com', 'wrong'));
  await recovery.addEmail(id, ' User@Example.com ', 'oldpassword');
  assert.equal((await db.getUserById(id)).email, null);
  const verifyToken = tokenFrom(messages.at(-1));
  const stored = await adapter.query({ sql: 'SELECT token_hash FROM account_tokens WHERE user_id = ?', args: [id] });
  assert.notEqual(stored.rows[0].token_hash, verifyToken);
  await recovery.forgot('user@example.com');
  assert.equal(messages.length, 1, 'unverified email cannot recover a password');
  await recovery.consume('verify', verifyToken);
  assert.equal((await recovery.status(id)).email, 'user@example.com');
  await assert.rejects(recovery.consume('verify', verifyToken));
  await recovery.forgot('missing@example.com');
  assert.equal(messages.length, 1);
  await recovery.forgot('user@example.com');
  const resetToken = tokenFrom(messages.at(-1));
  await recovery.forgot('user@example.com');
  assert.equal(messages.length, 2, 'repeated requests are throttled per account');
  await assert.rejects(recovery.consume('verify', resetToken));
  const results = await Promise.allSettled([recovery.consume('reset', resetToken, 'newpassword'), recovery.consume('reset', resetToken, 'newpassword')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const user = await db.getUserById(id);
  assert.equal(await bcrypt.compare('newpassword', user.password_hash), true);
  assert.equal(Number(user.auth_version), 1);
  assert.deepEqual(invalidated, [Number(id)]);
  await assert.rejects(recovery.consume('reset', resetToken, 'anotherpassword'));
});

test('expired links and duplicate email claims cannot change an account', async () => {
  const id = await db.createUser('expiredUser', await bcrypt.hash('oldpassword', 10));
  await recovery.addEmail(id, 'expired@example.com', 'oldpassword');
  const token = tokenFrom(messages.at(-1));
  await adapter.query({ sql: 'UPDATE account_tokens SET expires_at = 0 WHERE user_id = ?', args: [id] });
  await assert.rejects(recovery.consume('verify', token));
  await recovery.addEmail(id, 'user@example.com', 'oldpassword');
  await assert.rejects(recovery.consume('verify', tokenFrom(messages.at(-1))));
  assert.equal((await db.getUserById(id)).email, null);
});

test('delivery failures remove unusable links', async () => {
  const id = await db.createUser('deliveryUser', await bcrypt.hash('oldpassword', 10));
  const failed = createRecovery({ db, publicUrl: 'https://alo.example', sendMail: async () => { throw Error('offline'); } });
  await assert.rejects(failed.addEmail(id, 'delivery@example.com', 'oldpassword'));
  assert.equal((await recovery.status(id)).pendingEmail, null);
});
