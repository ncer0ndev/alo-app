const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.DATABASE_URL;
process.env.DB_PATH = path.join(os.tmpdir(), `alo-dbintegrity-${randomUUID()}.db`);

const db = require('../db');
const { runMigrations } = require('../migrate');

test.after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(process.env.DB_PATH + suffix);
    } catch {
      // dosya olmayabilir, sorun degil
    }
  }
});

test('migration runner iki kez calisinca hata vermez ve tekrar uygulamaz', async () => {
  await db.init();
  const first = await runMigrations();
  assert.equal(first.applied, 0, 'zaten uygulanmis migration tekrar uygulanmamali');
  const second = await runMigrations();
  assert.equal(second.applied, 0);
  assert.ok(second.total >= 1);
});

test('kullanici adi buyuk/kucuk harf farkli olsa da benzersiz olmali', async () => {
  const base = `CaseTest${randomUUID().slice(0, 8)}`;
  await db.createUser(base, 'hash1');

  await assert.rejects(
    () => db.createUser(base.toUpperCase(), 'hash2'),
    /UNIQUE|duplicate|unique/i,
    'ayni kullanici adi (farkli harf durumuyla) reddedilmeliydi'
  );
  await assert.rejects(() => db.createUser(base.toLowerCase(), 'hash3'), /UNIQUE|duplicate|unique/i);

  // Orijinal (dogru harf durumuyla) hala tek basina bulunabilmeli.
  const found = await db.getUserByUsername(base.toLowerCase());
  assert.equal(found.username, base);
});

test('topluluk silinince kanallari ve mesajlari da kaskad olarak siliniyor', async () => {
  const ownerId = await db.createUser(`CascadeOwner${randomUUID().slice(0, 8)}`, 'hash');
  const { serverId, defaultChannelId } = await db.createServer('Kaskad Test', ownerId);
  const voiceChannelId = await db.createChannel(serverId, 'sesli', 'voice');

  const msgId = randomUUID();
  await db.insertServerMessage({
    id: msgId,
    serverId,
    channelId: defaultChannelId,
    fromUserId: ownerId,
    text: 'silinecek mesaj',
    createdAt: Date.now(),
  });
  await db.markChannelRead(ownerId, defaultChannelId, Date.now());

  await db.deleteServer(serverId);

  assert.equal(await db.getServerById(serverId), null);
  assert.equal(await db.getChannelById(defaultChannelId), null);
  assert.equal(await db.getChannelById(voiceChannelId), null);
  assert.equal(await db.getServerMessageById(msgId), null);
  assert.equal(await db.getChannelReadState(ownerId, defaultChannelId), 0);
});

test('kanal silinince yalnizca o kanalin mesajlari gider, diger kanal etkilenmez', async () => {
  const ownerId = await db.createUser(`ChanDelOwner${randomUUID().slice(0, 8)}`, 'hash');
  const { serverId, defaultChannelId } = await db.createServer('Kanal Silme Test', ownerId);
  const otherChannelId = await db.createChannel(serverId, 'ikinci', 'text');

  const keepMsgId = randomUUID();
  const goneMsgId = randomUUID();
  await db.insertServerMessage({ id: keepMsgId, serverId, channelId: defaultChannelId, fromUserId: ownerId, text: 'kalsin', createdAt: Date.now() });
  await db.insertServerMessage({ id: goneMsgId, serverId, channelId: otherChannelId, fromUserId: ownerId, text: 'gitsin', createdAt: Date.now() });

  await db.deleteChannel(otherChannelId);

  assert.ok(await db.getServerMessageById(keepMsgId), 'silinmeyen kanaldaki mesaj korunmali');
  assert.equal(await db.getServerMessageById(goneMsgId), null, 'silinen kanaldaki mesaj gitmeli');
  assert.ok(await db.getServerById(serverId), 'topluluk kendisi etkilenmemeli');
});

test('kullanici hesabi silinince veri butunlugu bozulmuyor (sahiplik devri ve yetim kayit kalmiyor)', async () => {
  const ownerId = await db.createUser(`DelOwner${randomUUID().slice(0, 8)}`, 'hash');
  const memberId = await db.createUser(`DelMember${randomUUID().slice(0, 8)}`, 'hash');
  const { serverId } = await db.createServer('Silme Test', ownerId);
  await db.addServerMember(serverId, memberId, 'member');

  await db.deleteUserAccount(ownerId);

  // Baska uye vardi: sahiplik devredilmeli, topluluk silinmemeli.
  const server = await db.getServerById(serverId);
  assert.ok(server, 'baska uye varken topluluk silinmemeliydi');
  assert.equal(Number(server.owner_user_id), memberId);
  const newOwnerMembership = await db.getServerMember(serverId, memberId);
  assert.equal(newOwnerMembership.role, 'owner');

  // Silinen kullaniciya iliskin hicbir uyelik kaydi kalmamali.
  assert.equal(await db.getServerMember(serverId, ownerId), null);
  assert.equal(await db.getUserById(ownerId), null);

  // Son uye de silinirse topluluk tamamen gitmeli.
  await db.deleteUserAccount(memberId);
  assert.equal(await db.getServerById(serverId), null);
});
