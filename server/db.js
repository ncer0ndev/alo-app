const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS friendships (
    user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (from_user_id, to_user_id)
  );
`);

function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

function migrateFromJsonIfNeeded() {
  const legacyPath = path.join(__dirname, 'data', 'users.json');
  const marker = path.join(__dirname, 'data', '.migrated-from-json');
  if (!fs.existsSync(legacyPath) || fs.existsSync(marker)) return;

  const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (existing.c > 0) {
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

  const insertUser = db.prepare('INSERT INTO users (username, username_lower, password_hash) VALUES (?, ?, ?)');
  const findUserId = db.prepare('SELECT id FROM users WHERE username_lower = ?');
  const insertFriendship = db.prepare('INSERT OR IGNORE INTO friendships (user_a_id, user_b_id) VALUES (?, ?)');
  const insertRequest = db.prepare('INSERT OR IGNORE INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)');

  const run = transaction((entries) => {
    for (const [key, u] of entries) {
      if (!u || !u.username || !u.passwordHash) continue;
      insertUser.run(u.username, key, u.passwordHash);
    }
    for (const [key, u] of entries) {
      if (!u) continue;
      const me = findUserId.get(key);
      if (!me) continue;
      for (const friendKey of u.friends || []) {
        const other = findUserId.get(friendKey);
        if (!other) continue;
        insertFriendship.run(Math.min(me.id, other.id), Math.max(me.id, other.id));
      }
      for (const fromKey of u.incomingRequests || []) {
        const other = findUserId.get(fromKey);
        if (!other) continue;
        insertRequest.run(other.id, me.id);
      }
    }
  });

  run(Object.entries(legacy));
  fs.writeFileSync(marker, new Date().toISOString());
  console.log(`Gocs tamamlandi: ${Object.keys(legacy).length} kullanici users.json'dan SQLite'a tasindi.`);
}

migrateFromJsonIfNeeded();

const stmts = {
  insertUser: db.prepare('INSERT INTO users (username, username_lower, password_hash) VALUES (?, ?, ?)'),
  getUserByUsernameLower: db.prepare('SELECT * FROM users WHERE username_lower = ?'),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  areFriends: db.prepare('SELECT 1 FROM friendships WHERE user_a_id = ? AND user_b_id = ?'),
  listFriends: db.prepare(`
    SELECT u.id, u.username FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a_id = @id THEN f.user_b_id ELSE f.user_a_id END
    WHERE f.user_a_id = @id OR f.user_b_id = @id
  `),
  listIncoming: db.prepare(`
    SELECT u.id, u.username FROM friend_requests r
    JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id = ?
  `),
  listOutgoing: db.prepare(`
    SELECT u.id, u.username FROM friend_requests r
    JOIN users u ON u.id = r.to_user_id
    WHERE r.from_user_id = ?
  `),
  hasPendingRequest: db.prepare('SELECT 1 FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?'),
  insertRequest: db.prepare('INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)'),
  deleteRequest: db.prepare('DELETE FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?'),
  insertFriendship: db.prepare('INSERT OR IGNORE INTO friendships (user_a_id, user_b_id) VALUES (?, ?)'),
  deleteFriendship: db.prepare('DELETE FROM friendships WHERE user_a_id = ? AND user_b_id = ?'),
};

module.exports = {
  createUser(username, passwordHash) {
    const info = stmts.insertUser.run(username, username.toLowerCase(), passwordHash);
    return Number(info.lastInsertRowid);
  },
  getUserByUsername(username) {
    return stmts.getUserByUsernameLower.get(username.toLowerCase());
  },
  getUserById(id) {
    return stmts.getUserById.get(id);
  },
  areFriends(idA, idB) {
    return !!stmts.areFriends.get(Math.min(idA, idB), Math.max(idA, idB));
  },
  listFriends(userId) {
    return stmts.listFriends.all({ id: userId });
  },
  listIncomingRequests(userId) {
    return stmts.listIncoming.all(userId);
  },
  listOutgoingRequests(userId) {
    return stmts.listOutgoing.all(userId);
  },
  hasPendingRequest(fromId, toId) {
    return !!stmts.hasPendingRequest.get(fromId, toId);
  },
  createFriendRequest: transaction((fromId, toId) => {
    if (stmts.hasPendingRequest.get(fromId, toId)) return false;
    if (stmts.areFriends.get(Math.min(fromId, toId), Math.max(fromId, toId))) return false;
    stmts.insertRequest.run(fromId, toId);
    return true;
  }),
  acceptFriendRequest: transaction((fromId, toId) => {
    const result = stmts.deleteRequest.run(fromId, toId);
    if (Number(result.changes) === 0) return false;
    stmts.insertFriendship.run(Math.min(fromId, toId), Math.max(fromId, toId));
    return true;
  }),
  declineFriendRequest(fromId, toId) {
    stmts.deleteRequest.run(fromId, toId);
  },
  removeFriend(idA, idB) {
    stmts.deleteFriendship.run(Math.min(idA, idB), Math.max(idA, idB));
  },
};
