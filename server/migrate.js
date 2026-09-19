// Surumlu migration runner. db.js'in init() fonksiyonu icinden (sunucu
// acilisinda) cagrilir; ayrica "node migrate.js" ile elle/CI icinde de
// calistirilabilir. Uygulanan migration'lari schema_migrations tablosunda
// izler, yalnizca henuz uygulanmamis olanlari, dosya adina gore sirayla
// calistirir - her acilista semayi yeniden kontrol eden eski createSchema()
// yerine gecti.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const adapter = require('./db-adapter');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function loadMigrations() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();
  return files.map((f) => require(path.join(MIGRATIONS_DIR, f)));
}

async function ensureMigrationsTable() {
  const sql =
    adapter.dialect === 'postgres'
      ? `CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           applied_at TEXT NOT NULL DEFAULT TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
         )`
      : `CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           applied_at TEXT NOT NULL DEFAULT (datetime('now'))
         )`;
  await adapter.query({ sql });
}

async function getAppliedNames() {
  const res = await adapter.query({ sql: 'SELECT name FROM schema_migrations' });
  return new Set(res.rows.map((row) => row.name));
}

// Migration'lari uygular; her migration TEK bir transaction icinde calisir
// (yari uygulanmis bir migration'in veritabaninda kalmamasi icin).
async function runMigrations() {
  await ensureMigrationsTable();
  const applied = await getAppliedNames();
  const migrations = loadMigrations();
  let appliedCount = 0;

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    const statements = adapter.dialect === 'postgres' ? migration.postgres : migration.sqlite;
    const withBookkeeping = [
      ...statements.map((sql) => ({ sql })),
      { sql: 'INSERT INTO schema_migrations (name) VALUES (?)', args: [migration.name] },
    ];
    await adapter.batch(withBookkeeping);
    console.log(`migration uygulandi: ${migration.name}`);
    appliedCount++;
  }

  return { total: migrations.length, applied: appliedCount };
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then(({ total, applied }) => {
      console.log(`migration tamamlandi (${adapter.dialect}): ${applied}/${total} yeni migration uygulandi.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('migration basarisiz:', err.message);
      process.exit(1);
    });
}
