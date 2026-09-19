// Ilk migration: mevcut, zamanla ALTER TABLE ile evrilmis semanin NIHAI
// halini tek, surumlu bir migration olarak konsolide eder. Her iki lehce
// AYNI mantiksal modeli (ayni tablo/sutun/iliski) tarif eder; farklar
// yalnizca otomatik-artan birincil anahtar ve epoch-milisaniye sutunlarinin
// PostgreSQL'de tasabilmesi icin BIGINT kullanilmasi gibi kacinilmaz
// lehce sozdizimi farklaridir.
//
// Not (tarih/saat sutunlari): users.created_at, friendships.created_at,
// friend_requests.created_at, servers.created_at, server_members.joined_at,
// server_channels.created_at SQLite'ta datetime('now') ile "YYYY-MM-DD
// HH:MM:SS" bicimli DUZ METIN olarak saklanir ve istemci bu bicimi
// (renderer.js: iso.replace(' ', 'T') + 'Z') ayristirir. PostgreSQL
// tarafinda ayni sutunlar yine TEXT tipinde tutulur ve varsayilan degeri
// TO_CHAR(...) ile BIREBIR AYNI bicimde uretilir - boylece istemci tarafinda
// hicbir degisiklik gerekmez.

const PG_TIMESTAMP_DEFAULT = "TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

const sqlite = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    avatar_id TEXT NOT NULL DEFAULT 'panda',
    status_message TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'online',
    banner_id TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS friendships (
    user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
  )`,
  `CREATE TABLE IF NOT EXISTS friend_requests (
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (from_user_id, to_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_dm_from_to ON direct_messages(from_user_id, to_user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_dm_to_from ON direct_messages(to_user_id, from_user_id, created_at)',
  `CREATE TABLE IF NOT EXISTS dm_read_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    other_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, other_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    icon_id TEXT NOT NULL DEFAULT 'robot',
    join_approval_required INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS server_members (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    pinned_at INTEGER,
    PRIMARY KEY (server_id, user_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id)',
  `CREATE TABLE IF NOT EXISTS dm_pins (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  )`,
  `CREATE TABLE IF NOT EXISTS server_join_requests (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS server_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'voice',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    position INTEGER NOT NULL DEFAULT 0
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_channels_server ON server_channels(server_id)',
  `CREATE TABLE IF NOT EXISTS server_messages (
    id TEXT PRIMARY KEY,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES server_channels(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    client_message_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_messages_channel ON server_messages(channel_id, created_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_server_messages_client_id ON server_messages(channel_id, client_message_id) WHERE client_message_id IS NOT NULL',
  `CREATE TABLE IF NOT EXISTS server_channel_read_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES server_channels(id) ON DELETE CASCADE,
    last_read_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, channel_id)
  )`,
  `CREATE TABLE IF NOT EXISTS server_bans (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by_user_id INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, user_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_bans_server ON server_bans(server_id, created_at)',
  `CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id <> blocked_user_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_user_id)',
  `CREATE TABLE IF NOT EXISTS user_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_user_id INTEGER NOT NULL REFERENCES users(id),
    reported_user_id INTEGER NOT NULL REFERENCES users(id),
    server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status, created_at)',
  `CREATE TABLE IF NOT EXISTS server_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_audit_server ON server_audit_log(server_id, created_at)',
];

const postgres = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${PG_TIMESTAMP_DEFAULT},
    avatar_id TEXT NOT NULL DEFAULT 'panda',
    status_message TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'online',
    banner_id TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS friendships (
    user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT ${PG_TIMESTAMP_DEFAULT},
    PRIMARY KEY (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
  )`,
  `CREATE TABLE IF NOT EXISTS friend_requests (
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT ${PG_TIMESTAMP_DEFAULT},
    PRIMARY KEY (from_user_id, to_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_dm_from_to ON direct_messages(from_user_id, to_user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_dm_to_from ON direct_messages(to_user_id, from_user_id, created_at)',
  `CREATE TABLE IF NOT EXISTS dm_read_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    other_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, other_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS servers (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT ${PG_TIMESTAMP_DEFAULT},
    icon_id TEXT NOT NULL DEFAULT 'robot',
    join_approval_required INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS server_members (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT ${PG_TIMESTAMP_DEFAULT},
    pinned_at BIGINT,
    PRIMARY KEY (server_id, user_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id)',
  `CREATE TABLE IF NOT EXISTS dm_pins (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  )`,
  `CREATE TABLE IF NOT EXISTS server_join_requests (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (server_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS server_channels (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'voice',
    created_at TEXT NOT NULL DEFAULT ${PG_TIMESTAMP_DEFAULT},
    position INTEGER NOT NULL DEFAULT 0
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_channels_server ON server_channels(server_id)',
  `CREATE TABLE IF NOT EXISTS server_messages (
    id TEXT PRIMARY KEY,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES server_channels(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    client_message_id TEXT,
    created_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_messages_channel ON server_messages(channel_id, created_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_server_messages_client_id ON server_messages(channel_id, client_message_id) WHERE client_message_id IS NOT NULL',
  `CREATE TABLE IF NOT EXISTS server_channel_read_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES server_channels(id) ON DELETE CASCADE,
    last_read_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, channel_id)
  )`,
  `CREATE TABLE IF NOT EXISTS server_bans (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by_user_id INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    PRIMARY KEY (server_id, user_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_bans_server ON server_bans(server_id, created_at)',
  `CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id <> blocked_user_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_user_id)',
  `CREATE TABLE IF NOT EXISTS user_reports (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reporter_user_id INTEGER NOT NULL REFERENCES users(id),
    reported_user_id INTEGER NOT NULL REFERENCES users(id),
    server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status, created_at)',
  `CREATE TABLE IF NOT EXISTS server_audit_log (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_audit_server ON server_audit_log(server_id, created_at)',
];

module.exports = { name: '0001_init', sqlite, postgres };
