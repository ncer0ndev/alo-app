// Ozel roller: sahibin topluluk icin tanimladigi, gercek yetkiler tasiyan
// (uye at, banla, kanal yonet, mesaj moderasyonu, baskalarina rol verme)
// etiketler. Bir uyenin birden fazla ozel rolu olabilir (server_member_roles
// coktan-coka tablosu); etkin yetkileri, sahip oldugu tum rollerin OR'u
// alinarak hesaplanir (bkz. server/index.js getMemberPermissions). Temel
// Sahip/Moderator/Uye sistemine EK bir katmandir, onun yerine gecmez -
// moderator hala mevcut yetkilerini korur, ozel roller bunlara ilave yetki
// taniyabilir (ornegin sade bir uyeye yalnizca "rol ver" yetkisi vermek
// gibi).

const sqlite = [
  `CREATE TABLE IF NOT EXISTS server_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#5865f2',
    can_kick INTEGER NOT NULL DEFAULT 0,
    can_ban INTEGER NOT NULL DEFAULT 0,
    can_manage_channels INTEGER NOT NULL DEFAULT 0,
    can_manage_roles INTEGER NOT NULL DEFAULT 0,
    can_manage_messages INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_roles_server ON server_roles(server_id)',
  `CREATE TABLE IF NOT EXISTS server_member_roles (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES server_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_member_roles_server_user ON server_member_roles(server_id, user_id)',
];

const postgres = [
  `CREATE TABLE IF NOT EXISTS server_roles (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#5865f2',
    can_kick INTEGER NOT NULL DEFAULT 0,
    can_ban INTEGER NOT NULL DEFAULT 0,
    can_manage_channels INTEGER NOT NULL DEFAULT 0,
    can_manage_roles INTEGER NOT NULL DEFAULT 0,
    can_manage_messages INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_roles_server ON server_roles(server_id)',
  `CREATE TABLE IF NOT EXISTS server_member_roles (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES server_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_server_member_roles_server_user ON server_member_roles(server_id, user_id)',
];

module.exports = { name: '0004_custom_roles', sqlite, postgres };
