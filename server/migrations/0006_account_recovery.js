const statements = [
  'ALTER TABLE users ADD COLUMN email TEXT',
  'ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN recovery_version INTEGER NOT NULL DEFAULT 0',
  'CREATE UNIQUE INDEX users_email_unique ON users(email)',
  'CREATE TABLE account_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, email TEXT, expires_at BIGINT NOT NULL, version INTEGER NOT NULL)',
  'CREATE INDEX account_tokens_user ON account_tokens(user_id, kind)',
];
module.exports = { name: '0006_account_recovery', sqlite: statements, postgres: statements };
