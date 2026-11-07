const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
delete process.env.DATABASE_URL;
process.env.JWT_SECRET = 'friend-groups-isolated-tests';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-groups-${randomUUID()}.db`);
const db = require('../db');
const jwt = require('jsonwebtoken');
const { server, io, ready } = require('../index');
test.after(async () => { await new Promise(resolve => io.close(resolve)); });
test('private groups reject outsiders, preserve messages and validate profile data', async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await db.createUser('groupOwner', 'hash');
  const outsider = await db.createUser('groupOutsider', 'hash');
  const auth = id => ({ Authorization: 'Bearer ' + jwt.sign({ userId: id, username: id === owner ? 'groupOwner' : 'groupOutsider' }, process.env.JWT_SECRET), 'Content-Type': 'application/json' });
  const adapter = require('../db-adapter');
  const result = await adapter.query({ sql: 'INSERT INTO friend_groups(name,owner_id) VALUES (?,?) RETURNING id', args: ['Test', owner] });
  const id = Number(result.rows[0].id);
  await adapter.query({ sql: 'INSERT INTO friend_group_members(group_id,user_id) VALUES (?,?)', args: [id, owner] });
  for (const endpoint of ['messages', 'call']) {
    const res = await fetch(`${base}/api/groups/${id}/${endpoint}`, { method: 'POST', headers: auth(outsider), body: JSON.stringify({ text: 'unauthorized' }) });
    assert.equal(res.status, 403);
  }
  let res = await fetch(`${base}/api/groups/${id}/messages`, { method: 'POST', headers: auth(owner), body: JSON.stringify({ text: 'kalıcı mesaj' }) });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/api/groups/${id}/messages`, { headers: auth(owner) });
  assert.equal((await res.json()).messages[0].text, 'kalıcı mesaj');
  res = await fetch(`${base}/api/social-profile`, { method: 'POST', headers: auth(owner), body: JSON.stringify({ about: 'Merhaba', presence: 'busy', duration: 30 }) });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/api/social-profile/groupOwner`, { headers: auth(owner) });
  assert.equal((await res.json()).presence, 'busy');
});
