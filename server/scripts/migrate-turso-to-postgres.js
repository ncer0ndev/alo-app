#!/usr/bin/env node
// Tek seferlik, ELLE calistirilan veri aktarim araci: eski Turso (ya da
// herhangi bir yerel SQLite dosyasi) kaynagindan PostgreSQL hedefine 16
// tabloyu bagimlilik sirasinda kopyalar. Sunucu baslangicina baglanmaz,
// hicbir zaman otomatik calismaz. Kaynaga YAZMAZ (salt okunur), hedefe
// yazmadan once migration'lari calistirir.
//
// Kullanim:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... DATABASE_URL=postgres://... \
//     node scripts/migrate-turso-to-postgres.js
// veya yerel bir SQLite dosyasindan:
//   node scripts/migrate-turso-to-postgres.js --from-sqlite ./data/app.db
//
// Onerilir: once bos/test bir Postgres veritabanina karsi deneyin, sonucu
// (satir sayilari) kontrol edin, ancak sonra gercek hedefe karsi calistirin.

const path = require('path');
const { createClient } = require('@libsql/client');

const args = process.argv.slice(2);
const fromSqliteIdx = args.indexOf('--from-sqlite');
const fromSqlitePath = fromSqliteIdx !== -1 ? args[fromSqliteIdx + 1] : null;

if (!process.env.DATABASE_URL) {
  console.error('HATA: DATABASE_URL (hedef PostgreSQL) tanimli degil.');
  process.exit(1);
}
if (!fromSqlitePath && !process.env.TURSO_DATABASE_URL) {
  console.error('HATA: Kaynak belirtilmedi. TURSO_DATABASE_URL/TURSO_AUTH_TOKEN set edin ya da --from-sqlite <yol> verin.');
  process.exit(1);
}

// Kaynak (salt okunur) - Turso ya da yerel bir SQLite dosyasi.
const sourceClient = createClient(
  fromSqlitePath ? { url: `file:${path.resolve(fromSqlitePath)}` } : { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
);

// Hedef - db-adapter.js'i DOGRUDAN kullanir (dialect zaten DATABASE_URL'den
// 'postgres' olarak secilecek), boylece migration/ON CONFLICT gibi ayni
// mantik burada da gecerli olur.
const adapter = require('../db-adapter');
const { runMigrations } = require('../migrate');

// Tablolar, FK bagimlilik sirasinda. autoIncrement:true olanlar icin id
// aktarimindan sonra PostgreSQL identity sirasi son degere sifirlanir.
const TABLES = [
  { name: 'users', autoIncrement: true },
  { name: 'friendships', autoIncrement: false },
  { name: 'friend_requests', autoIncrement: false },
  { name: 'direct_messages', autoIncrement: false },
  { name: 'dm_read_state', autoIncrement: false },
  { name: 'dm_pins', autoIncrement: false },
  { name: 'servers', autoIncrement: true },
  { name: 'server_members', autoIncrement: false },
  { name: 'server_join_requests', autoIncrement: false },
  { name: 'server_channels', autoIncrement: true },
  { name: 'server_messages', autoIncrement: false },
  { name: 'server_channel_read_state', autoIncrement: false },
  { name: 'server_bans', autoIncrement: false },
  { name: 'user_blocks', autoIncrement: false },
  { name: 'user_reports', autoIncrement: true },
  { name: 'server_audit_log', autoIncrement: true },
];

async function copyTable({ name, autoIncrement }) {
  let source;
  try {
    source = await sourceClient.execute(`SELECT * FROM ${name}`);
  } catch (err) {
    // Cok eski bir kaynakta bu tablo hic olusmamis olabilir (o ozellik
    // eklenmeden onceki bir veritabani) - aktarilacak bir sey yok, devam.
    if (typeof err?.message === 'string' && /no such table/i.test(err.message)) {
      console.log(`  ${name}: kaynakta bu tablo yok (eski surum), atlandi.`);
      return 0;
    }
    throw err;
  }
  if (source.rows.length === 0) {
    console.log(`  ${name}: kaynakta 0 satir, atlandi.`);
    return 0;
  }
  const columns = Object.keys(source.rows[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const overriding = autoIncrement && adapter.dialect === 'postgres' ? ' OVERRIDING SYSTEM VALUE' : '';
  const sql = `INSERT INTO ${name} (${columns.join(', ')})${overriding} VALUES (${placeholders})`;

  // Cok buyuk tablolarda tek transaction'da asiri buyumemesi icin 500'luk
  // gruplar halinde yazilir.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < source.rows.length; i += CHUNK) {
    const chunk = source.rows.slice(i, i + CHUNK);
    const statements = chunk.map((row) => ({ sql, args: columns.map((c) => row[c]) }));
    await adapter.batch(statements);
    written += chunk.length;
  }

  if (autoIncrement && adapter.dialect === 'postgres') {
    await adapter.query({
      sql: `SELECT setval(pg_get_serial_sequence('${name}', 'id'), COALESCE((SELECT MAX(id) FROM ${name}), 1))`,
    });
  }

  console.log(`  ${name}: ${written} satir aktarildi.`);
  return written;
}

async function main() {
  console.log(`Kaynak: ${fromSqlitePath ? `yerel dosya (${fromSqlitePath})` : 'Turso'}`);
  console.log(`Hedef: PostgreSQL (${adapter.dialect === 'postgres' ? 'dogrulandi' : 'HATA: DATABASE_URL postgres degil!'})`);
  if (adapter.dialect !== 'postgres') {
    throw new Error('Hedef PostgreSQL degil - DATABASE_URL kontrol edin.');
  }

  await adapter.testConnection();
  console.log('Hedef baglantisi dogrulandi.');

  console.log('Hedefte migration calistiriliyor...');
  await runMigrations();

  console.log('Tablolar kopyalaniyor:');
  let total = 0;
  for (const table of TABLES) {
    total += await copyTable(table);
  }

  console.log(`\nTamamlandi. Toplam ${total} satir aktarildi.`);
  console.log('Not: kaynak veritabanina hicbir yazma islemi yapilmadi.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Aktarim basarisiz:', err.message);
    process.exit(1);
  });
