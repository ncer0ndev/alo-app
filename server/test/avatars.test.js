const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { io: connect } = require('socket.io-client');
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = 'avatar-isolated-test';
process.env.PORT = '0';
process.env.DB_PATH = path.join(os.tmpdir(), `alo-avatars-${randomUUID()}.db`);
// Exercise the migration from an existing users table without avatar_id.
const { DatabaseSync } = require('node:sqlite');
const oldDb = new DatabaseSync(process.env.DB_PATH);
oldDb.exec("CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, username_lower TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO users(username,username_lower,password_hash) VALUES ('legacy','legacy','existing-hash');");
oldDb.close();
const db = require('../db');
const { server, io, ready } = require('../index');
const sockets = [];
test.after(async () => {
  sockets.forEach(s => s.disconnect());
  await new Promise(resolve => io.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + suffix); } catch {} }
});
test('avatar migration, account restriction, persistence and live room updates', { timeout: 15000 }, async () => {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  const legacy = await db.getUserByUsername('legacy');
  assert.equal(legacy.avatar_id, 'panda');
  assert.equal(legacy.password_hash, 'existing-hash');
  const accounts = [];
  for (const username of ['necr0n','regular']) {
    const userId = await db.createUser(username,'test-hash');
    const token = jwt.sign({userId,username},process.env.JWT_SECRET);
    const socket = connect(base,{auth:{token},reconnection:false});
    sockets.push(socket);
    const initial = await new Promise(resolve=>socket.once('authenticated',resolve));
    assert.equal(initial.avatarId,'panda');
    accounts.push({username,userId,token,socket});
  }
  const [owner, other] = accounts;
  const request = async (account, avatarId, extra = {}) => {
    const res = await fetch(`${base}/api/profile/avatar`, {method:'POST', headers:{Authorization:`Bearer ${account.token}`,'Content-Type':'application/json'},body:JSON.stringify({avatarId,...extra})});
    return {status:res.status,body:await res.json()};
  };
  assert.equal((await request(other,'phoenix',{username:'necr0n',userId:owner.userId})).status,403);
  assert.equal((await request(other,'../../malicious')).status,400);
  assert.equal((await request(other,{id:'panda'})).status,400);
  assert.equal((await request(owner,'phoenix')).status,200);
  const emit = (socket,name,payload)=>socket.timeout(2000).emitWithAck(name,payload);
  const {roomCode}=await emit(owner.socket,'create-room',{});
  await emit(owner.socket,'join-room',{roomCode});
  const joined = await emit(other.socket,'join-room',{roomCode});
  assert.equal(joined.existingPeers[0].avatarId,'phoenix');
  const changed = new Promise(resolve=>owner.socket.once('profile-updated',resolve));
  assert.equal((await request(other,'fox')).status,200);
  assert.equal((await changed).avatarId,'fox');
  const chat=await emit(other.socket,'chat-message',{clientMessageId:'avatar-test',text:'Merhaba'});
  assert.equal(chat.message.avatarId,'fox');
  const saved = new DatabaseSync(process.env.DB_PATH,{readOnly:true});
  assert.equal(saved.prepare('SELECT avatar_id FROM users WHERE username_lower = ?').get('regular').avatar_id,'fox');
  saved.close();
  const me=await fetch(`${base}/api/me`,{headers:{Authorization:`Bearer ${owner.token}`}});
  assert.equal((await me.json()).avatarId,'phoenix');
  const noAuth=await fetch(`${base}/api/profile/avatar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({avatarId:'fox'})});
  assert.equal(noAuth.status,401);
});
test('client artwork catalog matches server allowlist and includes 20 avatars',()=>{
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../app/avatar-catalog.js'),'utf8'),context);
  const catalog=require('../avatar-catalog.json');
  assert.equal(catalog.length,20);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.AVATAR_CATALOG)),catalog);
  for(const sheet of [1,2]) assert.ok(fs.existsSync(path.join(__dirname,`../../app/assets/avatars/collection-${sheet}.jpg`)));
});
