const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');
const usingRemote = !!process.env.TURSO_DATABASE_URL;

if (!usingRemote) {
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
}

const client = createClient(
  usingRemote
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${LOCAL_DB_PATH}` }
);

function isUniqueViolation(err) {
  return typeof err?.message === 'string' && err.message.includes('UNIQUE');
}

async function createSchema() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      username_lower TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const columns = await client.execute('PRAGMA table_info(users)');
  if (!columns.rows.some((column) => column.name === 'avatar_id')) {
    await client.execute("ALTER TABLE users ADD COLUMN avatar_id TEXT NOT NULL DEFAULT 'panda'");
  }
  if (!columns.rows.some((column) => column.name === 'status_message')) {
    await client.execute("ALTER TABLE users ADD COLUMN status_message TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.rows.some((column) => column.name === 'visibility')) {
    await client.execute("ALTER TABLE users ADD COLUMN visibility TEXT NOT NULL DEFAULT 'online'");
  }
  if (!columns.rows.some((column) => column.name === 'banner_id')) {
    await client.execute("ALTER TABLE users ADD COLUMN banner_id TEXT NOT NULL DEFAULT ''");
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS friendships (
      user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_a_id, user_b_id),
      CHECK (user_a_id < user_b_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (from_user_id, to_user_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  await client.execute('CREATE INDEX IF NOT EXISTS idx_dm_from_to ON direct_messages(from_user_id, to_user_id, created_at)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_dm_to_from ON direct_messages(to_user_id, from_user_id, created_at)');
  await client.execute(`
    CREATE TABLE IF NOT EXISTS dm_read_state (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      other_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, other_user_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const serverColumns = await client.execute('PRAGMA table_info(servers)');
  if (!serverColumns.rows.some((column) => column.name === 'icon_id')) {
    await client.execute("ALTER TABLE servers ADD COLUMN icon_id TEXT NOT NULL DEFAULT 'robot'");
  }
  if (!serverColumns.rows.some((column) => column.name === 'join_approval_required')) {
    await client.execute('ALTER TABLE servers ADD COLUMN join_approval_required INTEGER NOT NULL DEFAULT 0');
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_members (
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (server_id, user_id)
    )
  `);
  const serverMemberColumns = await client.execute('PRAGMA table_info(server_members)');
  if (!serverMemberColumns.rows.some((column) => column.name === 'pinned_at')) {
    await client.execute('ALTER TABLE server_members ADD COLUMN pinned_at INTEGER');
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS dm_pins (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pinned_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, friend_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_join_requests (
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (server_id, user_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'voice',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const channelColumns = await client.execute('PRAGMA table_info(server_channels)');
  if (!channelColumns.rows.some((column) => column.name === 'position')) {
    await client.execute('ALTER TABLE server_channels ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
    await client.execute('UPDATE server_channels SET position = id');
  }
  await client.execute('CREATE INDEX IF NOT EXISTS idx_server_channels_server ON server_channels(server_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id)');
  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_messages (
      id TEXT PRIMARY KEY,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES server_channels(id) ON DELETE CASCADE,
      from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      client_message_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  await client.execute('CREATE INDEX IF NOT EXISTS idx_server_messages_channel ON server_messages(channel_id, created_at)');
  await client.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_server_messages_client_id ON server_messages(channel_id, client_message_id) WHERE client_message_id IS NOT NULL'
  );
  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_channel_read_state (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES server_channels(id) ON DELETE CASCADE,
      last_read_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, channel_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_bans (
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      banned_by_user_id INTEGER NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (server_id, user_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (blocker_user_id, blocked_user_id),
      CHECK (blocker_user_id <> blocked_user_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_user_id INTEGER NOT NULL REFERENCES users(id),
      reported_user_id INTEGER NOT NULL REFERENCES users(id),
      server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      actor_user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )
  `);
  await client.execute('CREATE INDEX IF NOT EXISTS idx_server_bans_server ON server_bans(server_id, created_at)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_user_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status, created_at)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_server_audit_server ON server_audit_log(server_id, created_at)');
}

async function countUsers() {
  const res = await client.execute('SELECT COUNT(*) AS c FROM users');
  return Number(res.rows[0].c);
}

async function migrateFromJsonIfNeeded() {
  const legacyPath = path.join(DATA_DIR, 'users.json');
  const marker = path.join(DATA_DIR, '.migrated-from-json');
  if (!fs.existsSync(legacyPath) || fs.existsSync(marker)) return;
  if ((await countUsers()) > 0) {
    fs.writeFileSync(marker, new Date().toISOString());
    return;
  }

  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  } catch (err) {
    console.error('users.json okunamadi, gocs atlaniyor:', err.message);
    return;
  }

  const entries = Object.entries(legacy).filter(([, u]) => u && u.username && u.passwordHash);
  if (entries.length === 0) {
    fs.writeFileSync(marker, new Date().toISOString());
    return;
  }

  const statements = entries.map(([key, u]) => ({
    sql: 'INSERT INTO users (username, username_lower, password_hash) VALUES (?, ?, ?)',
    args: [u.username, key, u.passwordHash],
  }));
  await client.batch(statements, 'write');

  for (const [key, u] of entries) {
    const me = await getUserByUsername(key);
    if (!me) continue;
    for (const friendKey of u.friends || []) {
      const other = await getUserByUsername(friendKey);
      if (!other) continue;
      await client
        .execute({
          sql: 'INSERT OR IGNORE INTO friendships (user_a_id, user_b_id) VALUES (?, ?)',
          args: [Math.min(me.id, other.id), Math.max(me.id, other.id)],
        })
        .catch(() => {});
    }
    for (const fromKey of u.incomingRequests || []) {
      const other = await getUserByUsername(fromKey);
      if (!other) continue;
      await client
        .execute({
          sql: 'INSERT OR IGNORE INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)',
          args: [other.id, me.id],
        })
        .catch(() => {});
    }
  }

  fs.writeFileSync(marker, new Date().toISOString());
  console.log(`Gocs tamamlandi: ${entries.length} kullanici users.json'dan tasindi.`);
}

// Onceki surum node:sqlite kullaniyordu (server/data/app.db). Uzak (Turso) bir
// veritabanina geciliyorsa ve yerelde bu eski dosya varsa, verileri bir kez
// kopyalar. Yerel dosya modunda calisiliyorsa zaten ayni dosya kullanildigindan
// bu adima gerek yoktur.
async function migrateFromLegacyLocalSqliteIfNeeded() {
  if (!usingRemote) return;
  const marker = path.join(DATA_DIR, '.migrated-to-remote');
  if (fs.existsSync(marker)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(LOCAL_DB_PATH)) {
    fs.writeFileSync(marker, new Date().toISOString());
    return;
  }
  if ((await countUsers()) > 0) {
    fs.writeFileSync(marker, new Date().toISOString());
    return;
  }

  let legacyDb;
  try {
    const { DatabaseSync } = require('node:sqlite');
    legacyDb = new DatabaseSync(LOCAL_DB_PATH, { readOnly: true });
  } catch (err) {
    console.error('eski yerel veritabani acilamadi, gocs atlaniyor:', err.message);
    return;
  }

  let users, friendships, requests;
  try {
    users = legacyDb.prepare('SELECT * FROM users').all();
    friendships = legacyDb.prepare('SELECT * FROM friendships').all();
    requests = legacyDb.prepare('SELECT * FROM friend_requests').all();
  } catch {
    users = [];
    friendships = [];
    requests = [];
  } finally {
    legacyDb.close();
  }

  if (users.length === 0) {
    fs.writeFileSync(marker, new Date().toISOString());
    return;
  }

  const statements = users.map((u) => ({
    sql: 'INSERT INTO users (id, username, username_lower, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [u.id, u.username, u.username_lower, u.password_hash, u.created_at],
  }));
  for (const f of friendships) {
    statements.push({
      sql: 'INSERT OR IGNORE INTO friendships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)',
      args: [f.user_a_id, f.user_b_id, f.created_at],
    });
  }
  for (const r of requests) {
    statements.push({
      sql: 'INSERT OR IGNORE INTO friend_requests (from_user_id, to_user_id, created_at) VALUES (?, ?, ?)',
      args: [r.from_user_id, r.to_user_id, r.created_at],
    });
  }
  await client.batch(statements, 'write');

  fs.writeFileSync(marker, new Date().toISOString());
  console.log(`Gocs tamamlandi: ${users.length} kullanici eski yerel veritabanindan tasindi.`);
}

async function init() {
  await createSchema();
  await migrateFromJsonIfNeeded();
  await migrateFromLegacyLocalSqliteIfNeeded();
}

async function createUser(username, passwordHash) {
  const result = await client.execute({
    sql: 'INSERT INTO users (username, username_lower, password_hash) VALUES (?, ?, ?)',
    args: [username, username.toLowerCase(), passwordHash],
  });
  return Number(result.lastInsertRowid);
}

async function getUserByUsername(username) {
  const res = await client.execute({
    sql: 'SELECT * FROM users WHERE username_lower = ?',
    args: [username.toLowerCase()],
  });
  return res.rows[0] || null;
}

async function getUserById(id) {
  const res = await client.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return res.rows[0] || null;
}

async function areFriends(idA, idB) {
  const res = await client.execute({
    sql: 'SELECT 1 FROM friendships WHERE user_a_id = ? AND user_b_id = ?',
    args: [Math.min(idA, idB), Math.max(idA, idB)],
  });
  return res.rows.length > 0;
}

async function listFriends(userId) {
  const res = await client.execute({
    sql: `SELECT u.id, u.username, u.avatar_id, u.status_message FROM friendships f
          JOIN users u ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
          WHERE f.user_a_id = ? OR f.user_b_id = ?`,
    args: [userId, userId, userId],
  });
  return res.rows;
}

async function listIncomingRequests(userId) {
  const res = await client.execute({
    sql: `SELECT u.id, u.username FROM friend_requests r
          JOIN users u ON u.id = r.from_user_id
          WHERE r.to_user_id = ?`,
    args: [userId],
  });
  return res.rows;
}

async function listOutgoingRequests(userId) {
  const res = await client.execute({
    sql: `SELECT u.id, u.username FROM friend_requests r
          JOIN users u ON u.id = r.to_user_id
          WHERE r.from_user_id = ?`,
    args: [userId],
  });
  return res.rows;
}

async function hasPendingRequest(fromId, toId) {
  const res = await client.execute({
    sql: 'SELECT 1 FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?',
    args: [fromId, toId],
  });
  return res.rows.length > 0;
}

async function createFriendRequest(fromId, toId) {
  try {
    await client.execute({
      sql: 'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)',
      args: [fromId, toId],
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

async function acceptFriendRequest(fromId, toId) {
  const a = Math.min(fromId, toId);
  const b = Math.max(fromId, toId);
  const results = await client.batch(
    [
      { sql: 'DELETE FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?', args: [fromId, toId] },
      { sql: 'INSERT OR IGNORE INTO friendships (user_a_id, user_b_id) VALUES (?, ?)', args: [a, b] },
    ],
    'write'
  );
  return Number(results[0].rowsAffected) > 0;
}

async function declineFriendRequest(fromId, toId) {
  await client.execute({
    sql: 'DELETE FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?',
    args: [fromId, toId],
  });
}

async function removeFriend(idA, idB) {
  await client.execute({
    sql: 'DELETE FROM friendships WHERE user_a_id = ? AND user_b_id = ?',
    args: [Math.min(idA, idB), Math.max(idA, idB)],
  });
}

async function insertDirectMessage({ id, fromUserId, toUserId, text, createdAt }) {
  await client.execute({
    sql: 'INSERT INTO direct_messages (id, from_user_id, to_user_id, text, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [id, fromUserId, toUserId, text, createdAt],
  });
}

async function getDirectMessages(userId, otherUserId, { before, limit = 50 } = {}) {
  const args = [userId, otherUserId, otherUserId, userId];
  let sql = `SELECT id, from_user_id, to_user_id, text, created_at FROM direct_messages
             WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`;
  if (typeof before === 'number') {
    sql += ' AND created_at < ?';
    args.push(before);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(limit);
  const res = await client.execute({ sql, args });
  return res.rows.reverse();
}

async function getLastDirectMessage(userId, otherUserId) {
  const res = await client.execute({
    sql: `SELECT id, from_user_id, to_user_id, text, created_at FROM direct_messages
          WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
          ORDER BY created_at DESC LIMIT 1`,
    args: [userId, otherUserId, otherUserId, userId],
  });
  return res.rows[0] || null;
}

async function getDmReadState(userId, otherUserId) {
  const res = await client.execute({
    sql: 'SELECT last_read_at FROM dm_read_state WHERE user_id = ? AND other_user_id = ?',
    args: [userId, otherUserId],
  });
  return res.rows[0] ? Number(res.rows[0].last_read_at) : 0;
}

async function countUnreadDirectMessages(userId, otherUserId) {
  const lastReadAt = await getDmReadState(userId, otherUserId);
  const res = await client.execute({
    sql: 'SELECT COUNT(*) AS c FROM direct_messages WHERE from_user_id = ? AND to_user_id = ? AND created_at > ?',
    args: [otherUserId, userId, lastReadAt],
  });
  return Number(res.rows[0].c);
}

async function markDmRead(userId, otherUserId, ts) {
  await client.execute({
    sql: `INSERT INTO dm_read_state (user_id, other_user_id, last_read_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id, other_user_id) DO UPDATE SET last_read_at = MAX(last_read_at, excluded.last_read_at)`,
    args: [userId, otherUserId, ts],
  });
}

async function listAllUsers() {
  const res = await client.execute(`
    SELECT u.id, u.username, u.avatar_id, u.created_at,
      (SELECT COUNT(*) FROM friendships f WHERE f.user_a_id = u.id OR f.user_b_id = u.id) AS friend_count
    FROM users u
    ORDER BY u.created_at DESC
  `);
  return res.rows;
}

async function setPasswordHash(userId, passwordHash) {
  await client.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [passwordHash, userId] });
}

async function setStatusMessage(userId, statusMessage) {
  await client.execute({ sql: 'UPDATE users SET status_message = ? WHERE id = ?', args: [statusMessage, userId] });
}

async function setVisibility(userId, visibility) {
  await client.execute({ sql: 'UPDATE users SET visibility = ? WHERE id = ?', args: [visibility, userId] });
}

async function setBanner(userId, bannerId) {
  await client.execute({ sql: 'UPDATE users SET banner_id = ? WHERE id = ?', args: [bannerId, userId] });
}

// ---- sunucular (topluluklar) ----

function generateInviteCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

async function createServer(name, ownerUserId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = generateInviteCode();
    try {
      const result = await client.execute({
        sql: 'INSERT INTO servers (name, owner_user_id, invite_code) VALUES (?, ?, ?)',
        args: [name, ownerUserId, inviteCode],
      });
      const serverId = Number(result.lastInsertRowid);
      await client.execute({
        sql: "INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, 'owner')",
        args: [serverId, ownerUserId],
      });
      // Her topluluk, ilk girişte/oluşturulduğunda açılacak bir ana metin
      // kanalıyla ("genel") başlar; istemci sıradaki ilk metin kanalını
      // (position ASC) varsayılan olarak açar, bu yuzden ayrı bir "varsayılan
      // kanal" bayrağına gerek yok.
      const defaultChannelId = await createChannel(serverId, 'genel', 'text');
      return { serverId, defaultChannelId };
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new Error('davet kodu uretilemedi, tekrar dene');
}

async function getServerByInviteCode(code) {
  const res = await client.execute({ sql: 'SELECT * FROM servers WHERE invite_code = ?', args: [code] });
  return res.rows[0] || null;
}

async function getServerById(id) {
  const res = await client.execute({ sql: 'SELECT * FROM servers WHERE id = ?', args: [id] });
  return res.rows[0] || null;
}

async function getServerMember(serverId, userId) {
  const res = await client.execute({
    sql: 'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
    args: [serverId, userId],
  });
  return res.rows[0] || null;
}

async function addServerMember(serverId, userId, role = 'member') {
  try {
    await client.execute({
      sql: 'INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)',
      args: [serverId, userId, role],
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

async function removeServerMember(serverId, userId) {
  await client.execute({
    sql: 'DELETE FROM server_members WHERE server_id = ? AND user_id = ?',
    args: [serverId, userId],
  });
}

async function setServerMemberRole(serverId, userId, role) {
  await client.execute({
    sql: 'UPDATE server_members SET role = ? WHERE server_id = ? AND user_id = ?',
    args: [role, serverId, userId],
  });
}

async function setServerJoinApproval(serverId, required) {
  await client.execute({
    sql: 'UPDATE servers SET join_approval_required = ? WHERE id = ?',
    args: [required ? 1 : 0, serverId],
  });
}

async function createJoinRequest(serverId, userId, requestedByUserId) {
  try {
    await client.execute({
      sql: 'INSERT INTO server_join_requests (server_id, user_id, requested_by_user_id, created_at) VALUES (?, ?, ?, ?)',
      args: [serverId, userId, requestedByUserId, Date.now()],
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

async function getJoinRequest(serverId, userId) {
  const res = await client.execute({
    sql: 'SELECT * FROM server_join_requests WHERE server_id = ? AND user_id = ?',
    args: [serverId, userId],
  });
  return res.rows[0] || null;
}

async function deleteJoinRequest(serverId, userId) {
  await client.execute({
    sql: 'DELETE FROM server_join_requests WHERE server_id = ? AND user_id = ?',
    args: [serverId, userId],
  });
}

async function listJoinRequests(serverId) {
  const res = await client.execute({
    sql: `SELECT jr.created_at, u.id AS user_id, u.username, u.avatar_id, req.username AS requested_by_username
          FROM server_join_requests jr
          JOIN users u ON u.id = jr.user_id
          JOIN users req ON req.id = jr.requested_by_user_id
          WHERE jr.server_id = ?
          ORDER BY jr.created_at ASC`,
    args: [serverId],
  });
  return res.rows;
}

async function listServersForUser(userId) {
  const res = await client.execute({
    sql: `SELECT s.id, s.name, s.icon_id, s.owner_user_id, s.invite_code, s.created_at, m.role
          FROM server_members m JOIN servers s ON s.id = m.server_id
          WHERE m.user_id = ?
          ORDER BY s.created_at ASC`,
    args: [userId],
  });
  return res.rows;
}

async function listServerMembers(serverId) {
  const res = await client.execute({
    sql: `SELECT u.id, u.username, u.avatar_id, u.banner_id, u.status_message, m.role FROM server_members m
          JOIN users u ON u.id = m.user_id
          WHERE m.server_id = ?
          ORDER BY m.joined_at ASC`,
    args: [serverId],
  });
  return res.rows;
}

async function regenerateInviteCode(serverId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = generateInviteCode();
    try {
      await client.execute({ sql: 'UPDATE servers SET invite_code = ? WHERE id = ?', args: [inviteCode, serverId] });
      return inviteCode;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new Error('davet kodu uretilemedi, tekrar dene');
}

async function deleteServer(serverId) {
  // Yabanci anahtarlar bu istemcide zorlanmadigindan (PRAGMA foreign_keys
  // kapali), kaskad silme acikca elle yapiliyor.
  await client.batch(
    [
      {
        sql: 'DELETE FROM server_channel_read_state WHERE channel_id IN (SELECT id FROM server_channels WHERE server_id = ?)',
        args: [serverId],
      },
      { sql: 'DELETE FROM server_messages WHERE server_id = ?', args: [serverId] },
      { sql: 'DELETE FROM server_audit_log WHERE server_id = ?', args: [serverId] },
      { sql: 'DELETE FROM server_bans WHERE server_id = ?', args: [serverId] },
      { sql: 'UPDATE user_reports SET server_id = NULL WHERE server_id = ?', args: [serverId] },
      { sql: 'DELETE FROM server_channels WHERE server_id = ?', args: [serverId] },
      { sql: 'DELETE FROM server_members WHERE server_id = ?', args: [serverId] },
      { sql: 'DELETE FROM servers WHERE id = ?', args: [serverId] },
    ],
    'write'
  );
}

async function createChannel(serverId, name, type = 'text') {
  const result = await client.execute({
    sql: `INSERT INTO server_channels (server_id, name, type, position)
          VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM server_channels WHERE server_id = ?))`,
    args: [serverId, name, type, serverId],
  });
  return Number(result.lastInsertRowid);
}

async function listChannels(serverId, type) {
  const res = await client.execute(
    type
      ? { sql: 'SELECT * FROM server_channels WHERE server_id = ? AND type = ? ORDER BY position ASC, id ASC', args: [serverId, type] }
      : { sql: 'SELECT * FROM server_channels WHERE server_id = ? ORDER BY position ASC, id ASC', args: [serverId] }
  );
  return res.rows;
}

async function getChannelById(id) {
  const res = await client.execute({ sql: 'SELECT * FROM server_channels WHERE id = ?', args: [id] });
  return res.rows[0] || null;
}

async function deleteChannel(channelId) {
  // Yabanci anahtarlar bu istemcide zorlanmadigindan, kaskad silme elle yapiliyor.
  await client.batch(
    [
      { sql: 'DELETE FROM server_channel_read_state WHERE channel_id = ?', args: [channelId] },
      { sql: 'DELETE FROM server_messages WHERE channel_id = ?', args: [channelId] },
      { sql: 'DELETE FROM server_channels WHERE id = ?', args: [channelId] },
    ],
    'write'
  );
}

async function updateServerProfile(serverId, { name, iconId }) {
  await client.execute({ sql: 'UPDATE servers SET name = ?, icon_id = ? WHERE id = ?', args: [name, iconId, serverId] });
}

async function renameChannel(channelId, name) {
  await client.execute({ sql: 'UPDATE server_channels SET name = ? WHERE id = ?', args: [name, channelId] });
}

async function reorderChannels(serverId, channelIds) {
  await client.batch(
    channelIds.map((channelId, position) => ({
      sql: 'UPDATE server_channels SET position = ? WHERE id = ? AND server_id = ?',
      args: [position, channelId, serverId],
    })),
    'write'
  );
}

async function transferServerOwnership(serverId, currentOwnerId, newOwnerId) {
  await client.batch(
    [
      { sql: "UPDATE server_members SET role = 'member' WHERE server_id = ? AND user_id = ?", args: [serverId, currentOwnerId] },
      { sql: "UPDATE server_members SET role = 'owner' WHERE server_id = ? AND user_id = ?", args: [serverId, newOwnerId] },
      { sql: 'UPDATE servers SET owner_user_id = ? WHERE id = ? AND owner_user_id = ?', args: [newOwnerId, serverId, currentOwnerId] },
    ],
    'write'
  );
}

async function getServerBan(serverId, userId) {
  const res = await client.execute({ sql: 'SELECT * FROM server_bans WHERE server_id = ? AND user_id = ?', args: [serverId, userId] });
  return res.rows[0] || null;
}

async function banServerMember(serverId, userId, bannedByUserId, reason) {
  await client.batch(
    [
      {
        sql: `INSERT INTO server_bans (server_id, user_id, banned_by_user_id, reason, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(server_id, user_id) DO UPDATE SET banned_by_user_id = excluded.banned_by_user_id,
                reason = excluded.reason, created_at = excluded.created_at`,
        args: [serverId, userId, bannedByUserId, reason, Date.now()],
      },
      { sql: 'DELETE FROM server_members WHERE server_id = ? AND user_id = ?', args: [serverId, userId] },
    ],
    'write'
  );
}

async function unbanServerMember(serverId, userId) {
  await client.execute({ sql: 'DELETE FROM server_bans WHERE server_id = ? AND user_id = ?', args: [serverId, userId] });
}

async function listServerBans(serverId) {
  const res = await client.execute({
    sql: `SELECT u.username, u.avatar_id, b.reason, b.created_at, actor.username AS banned_by
          FROM server_bans b JOIN users u ON u.id = b.user_id JOIN users actor ON actor.id = b.banned_by_user_id
          WHERE b.server_id = ? ORDER BY b.created_at DESC`,
    args: [serverId],
  });
  return res.rows;
}

async function blockUser(blockerUserId, blockedUserId) {
  const a = Math.min(blockerUserId, blockedUserId);
  const b = Math.max(blockerUserId, blockedUserId);
  await client.batch(
    [
      { sql: 'INSERT OR IGNORE INTO user_blocks (blocker_user_id, blocked_user_id, created_at) VALUES (?, ?, ?)', args: [blockerUserId, blockedUserId, Date.now()] },
      { sql: 'DELETE FROM friendships WHERE user_a_id = ? AND user_b_id = ?', args: [a, b] },
      { sql: 'DELETE FROM friend_requests WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)', args: [blockerUserId, blockedUserId, blockedUserId, blockerUserId] },
    ],
    'write'
  );
}

async function unblockUser(blockerUserId, blockedUserId) {
  await client.execute({ sql: 'DELETE FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?', args: [blockerUserId, blockedUserId] });
}

async function isEitherUserBlocked(userAId, userBId) {
  const res = await client.execute({
    sql: `SELECT 1 FROM user_blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?)
          OR (blocker_user_id = ? AND blocked_user_id = ?) LIMIT 1`,
    args: [userAId, userBId, userBId, userAId],
  });
  return res.rows.length > 0;
}

async function listBlockedUsers(userId) {
  const res = await client.execute({
    sql: `SELECT u.username, u.avatar_id, b.created_at FROM user_blocks b
          JOIN users u ON u.id = b.blocked_user_id WHERE b.blocker_user_id = ? ORDER BY b.created_at DESC`,
    args: [userId],
  });
  return res.rows;
}

async function createUserReport(reporterUserId, reportedUserId, serverId, reason) {
  await client.execute({
    sql: 'INSERT INTO user_reports (reporter_user_id, reported_user_id, server_id, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [reporterUserId, reportedUserId, serverId || null, reason, Date.now()],
  });
}

async function listOpenReports() {
  const res = await client.execute({
    sql: `SELECT r.id, reporter.username AS reporter, reported.username AS reported, r.server_id, r.reason, r.status, r.created_at
          FROM user_reports r JOIN users reporter ON reporter.id = r.reporter_user_id
          JOIN users reported ON reported.id = r.reported_user_id
          WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 200`,
  });
  return res.rows;
}

async function resolveUserReport(reportId) {
  const result = await client.execute({
    sql: "UPDATE user_reports SET status = 'resolved' WHERE id = ? AND status = 'open'",
    args: [reportId],
  });
  return Number(result.rowsAffected) > 0;
}

async function addServerAuditLog(serverId, actorUserId, action, target = '', details = '') {
  await client.execute({
    sql: 'INSERT INTO server_audit_log (server_id, actor_user_id, action, target, details, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [serverId, actorUserId, action, target, details, Date.now()],
  });
}

async function listServerAuditLog(serverId, limit = 100) {
  const res = await client.execute({
    sql: `SELECT a.id, u.username AS actor, a.action, a.target, a.details, a.created_at
          FROM server_audit_log a JOIN users u ON u.id = a.actor_user_id
          WHERE a.server_id = ? ORDER BY a.created_at DESC LIMIT ?`,
    args: [serverId, limit],
  });
  return res.rows;
}

// ---- topluluk metin kanali mesajlari ----

async function insertServerMessage({ id, serverId, channelId, fromUserId, text, createdAt, clientMessageId }) {
  try {
    await client.execute({
      sql: `INSERT INTO server_messages (id, server_id, channel_id, from_user_id, text, client_message_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, serverId, channelId, fromUserId, text, clientMessageId || null, createdAt],
    });
    return { id, duplicate: false };
  } catch (err) {
    if (isUniqueViolation(err) && clientMessageId) {
      const res = await client.execute({
        sql: 'SELECT id FROM server_messages WHERE channel_id = ? AND client_message_id = ?',
        args: [channelId, clientMessageId],
      });
      if (res.rows[0]) return { id: res.rows[0].id, duplicate: true };
    }
    throw err;
  }
}

async function getServerMessageById(id) {
  const res = await client.execute({
    sql: `SELECT m.*, u.username, u.avatar_id FROM server_messages m
          JOIN users u ON u.id = m.from_user_id
          WHERE m.id = ?`,
    args: [id],
  });
  return res.rows[0] || null;
}

async function getServerMessages(channelId, { before, limit = 50 } = {}) {
  const args = [channelId];
  let sql = `SELECT m.id, m.from_user_id, m.text, m.created_at, u.username, u.avatar_id FROM server_messages m
             JOIN users u ON u.id = m.from_user_id
             WHERE m.channel_id = ?`;
  if (typeof before === 'number') {
    sql += ' AND m.created_at < ?';
    args.push(before);
  }
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  args.push(limit);
  const res = await client.execute({ sql, args });
  return res.rows.reverse();
}

async function deleteServerMessage(id) {
  await client.execute({ sql: 'DELETE FROM server_messages WHERE id = ?', args: [id] });
}

async function getChannelReadState(userId, channelId) {
  const res = await client.execute({
    sql: 'SELECT last_read_at FROM server_channel_read_state WHERE user_id = ? AND channel_id = ?',
    args: [userId, channelId],
  });
  return res.rows[0] ? Number(res.rows[0].last_read_at) : 0;
}

async function markChannelRead(userId, channelId, ts) {
  await client.execute({
    sql: `INSERT INTO server_channel_read_state (user_id, channel_id, last_read_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_at = MAX(last_read_at, excluded.last_read_at)`,
    args: [userId, channelId, ts],
  });
}

// Bir sunucudaki tum metin kanallari icin, verilen kullanicinin okunmamis
// mesaj sayisini tek sorguda dondurur (kanal basina N+1 sorgudan kacinir).
async function getUnreadCountsByChannel(serverId, userId) {
  const res = await client.execute({
    sql: `SELECT c.id AS channel_id,
            (SELECT COUNT(*) FROM server_messages sm WHERE sm.channel_id = c.id AND sm.created_at > COALESCE(r.last_read_at, 0)) AS unread
          FROM server_channels c
          LEFT JOIN server_channel_read_state r ON r.channel_id = c.id AND r.user_id = ?
          WHERE c.server_id = ? AND c.type = 'text'`,
    args: [userId, serverId],
  });
  const map = new Map();
  for (const row of res.rows) map.set(Number(row.channel_id), Number(row.unread));
  return map;
}

// Bir kullanici hesabini ve ona ait tum verileri siler (yonetim paneli).
// Yabanci anahtarlar bu istemcide zorlanmadigindan (PRAGMA foreign_keys
// kapali), kaskad silme acikca elle yapiliyor. Kullanicinin sahibi oldugu
// topluluklar icin: baska uye varsa sahiplik en eski katilan uyeye devredilir,
// yoksa topluluk (kanallari/mesajlariyla birlikte) tamamen silinir.
async function deleteUserAccount(userId) {
  const ownedServers = await client.execute({ sql: 'SELECT id FROM servers WHERE owner_user_id = ?', args: [userId] });
  for (const row of ownedServers.rows) {
    const serverId = Number(row.id);
    const nextOwner = await client.execute({
      sql: 'SELECT user_id FROM server_members WHERE server_id = ? AND user_id != ? ORDER BY joined_at ASC LIMIT 1',
      args: [serverId, userId],
    });
    if (nextOwner.rows[0]) {
      await transferServerOwnership(serverId, userId, Number(nextOwner.rows[0].user_id));
    } else {
      await deleteServer(serverId);
    }
  }

  await client.batch(
    [
      { sql: 'DELETE FROM server_members WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM server_channel_read_state WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM server_messages WHERE from_user_id = ?', args: [userId] },
      { sql: 'DELETE FROM server_bans WHERE user_id = ? OR banned_by_user_id = ?', args: [userId, userId] },
      { sql: 'DELETE FROM user_reports WHERE reporter_user_id = ? OR reported_user_id = ?', args: [userId, userId] },
      { sql: 'DELETE FROM server_audit_log WHERE actor_user_id = ?', args: [userId] },
      { sql: 'DELETE FROM friendships WHERE user_a_id = ? OR user_b_id = ?', args: [userId, userId] },
      { sql: 'DELETE FROM friend_requests WHERE from_user_id = ? OR to_user_id = ?', args: [userId, userId] },
      { sql: 'DELETE FROM direct_messages WHERE from_user_id = ? OR to_user_id = ?', args: [userId, userId] },
      { sql: 'DELETE FROM dm_read_state WHERE user_id = ? OR other_user_id = ?', args: [userId, userId] },
      { sql: 'DELETE FROM user_blocks WHERE blocker_user_id = ? OR blocked_user_id = ?', args: [userId, userId] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [userId] },
    ],
    'write'
  );
}

// listServersForUser'a, her sunucunun metin kanallarindaki toplam okunmamis
// mesaj sayisini ekler (topluluk sekmesindeki rozet icin).
async function listServersForUserWithUnread(userId) {
  const res = await client.execute({
    sql: `SELECT s.id, s.name, s.icon_id, s.owner_user_id, s.invite_code, s.created_at, m.role, m.pinned_at,
            (SELECT COUNT(*) FROM server_messages sm
              JOIN server_channels ch ON ch.id = sm.channel_id AND ch.type = 'text' AND ch.server_id = s.id
              LEFT JOIN server_channel_read_state r ON r.channel_id = ch.id AND r.user_id = ?
              WHERE sm.created_at > COALESCE(r.last_read_at, 0)) AS unread_count
          FROM server_members m JOIN servers s ON s.id = m.server_id
          WHERE m.user_id = ?
          ORDER BY (m.pinned_at IS NULL) ASC, m.pinned_at DESC, s.created_at ASC`,
    args: [userId, userId],
  });
  return res.rows;
}

async function setServerPinned(userId, serverId, pinned) {
  await client.execute({
    sql: 'UPDATE server_members SET pinned_at = ? WHERE user_id = ? AND server_id = ?',
    args: [pinned ? Date.now() : null, userId, serverId],
  });
}

async function pinDm(userId, friendId) {
  await client.execute({
    sql: 'INSERT INTO dm_pins (user_id, friend_id, pinned_at) VALUES (?, ?, ?) ON CONFLICT (user_id, friend_id) DO UPDATE SET pinned_at = excluded.pinned_at',
    args: [userId, friendId, Date.now()],
  });
}

async function unpinDm(userId, friendId) {
  await client.execute({ sql: 'DELETE FROM dm_pins WHERE user_id = ? AND friend_id = ?', args: [userId, friendId] });
}

async function listDmPins(userId) {
  const res = await client.execute({ sql: 'SELECT friend_id, pinned_at FROM dm_pins WHERE user_id = ?', args: [userId] });
  return new Map(res.rows.map((row) => [Number(row.friend_id), Number(row.pinned_at)]));
}

module.exports = {
  async setAvatar(userId, avatarId) {
    await client.execute({ sql: 'UPDATE users SET avatar_id = ? WHERE id = ?', args: [avatarId, userId] });
  },
  setStatusMessage,
  setVisibility,
  setBanner,
  usingRemote,
  init,
  createUser,
  getUserByUsername,
  getUserById,
  areFriends,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  hasPendingRequest,
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  insertDirectMessage,
  getDirectMessages,
  getLastDirectMessage,
  getDmReadState,
  countUnreadDirectMessages,
  markDmRead,
  listAllUsers,
  setPasswordHash,
  createServer,
  getServerByInviteCode,
  getServerById,
  getServerMember,
  addServerMember,
  removeServerMember,
  setServerMemberRole,
  setServerJoinApproval,
  createJoinRequest,
  getJoinRequest,
  deleteJoinRequest,
  listJoinRequests,
  listServersForUser,
  listServersForUserWithUnread,
  setServerPinned,
  pinDm,
  unpinDm,
  listDmPins,
  listServerMembers,
  regenerateInviteCode,
  deleteServer,
  createChannel,
  listChannels,
  getChannelById,
  deleteChannel,
  insertServerMessage,
  getServerMessageById,
  getServerMessages,
  deleteServerMessage,
  getChannelReadState,
  markChannelRead,
  getUnreadCountsByChannel,
  updateServerProfile,
  renameChannel,
  reorderChannels,
  transferServerOwnership,
  getServerBan,
  banServerMember,
  unbanServerMember,
  listServerBans,
  blockUser,
  unblockUser,
  isEitherUserBlocked,
  listBlockedUsers,
  createUserReport,
  listOpenReports,
  resolveUserReport,
  addServerAuditLog,
  listServerAuditLog,
  deleteUserAccount,
};
