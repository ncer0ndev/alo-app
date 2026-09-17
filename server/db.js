const path = require('path');
const fs = require('fs');
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
    sql: `SELECT u.id, u.username, u.avatar_id FROM friendships f
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

module.exports = {
  async setAvatar(userId, avatarId) {
    await client.execute({ sql: 'UPDATE users SET avatar_id = ? WHERE id = ?', args: [avatarId, userId] });
  },
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
};
