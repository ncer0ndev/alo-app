// Ince baglanti katmani: iki farkli SQL motorunun (yerel/test SQLite ve
// production PostgreSQL) tek bir arayuz arkasinda calismasini saglar.
// db.js'teki ~65 fonksiyonun SQL metni (parametreli, '?' yer tutuculu)
// degismeden bu katmanin uzerinden calisir - iki ayri veri modeli degil,
// tek modelin iki motora karsi calisan tek sorgu kumesi.
//
// Diyalekt secimi: process.env.DATABASE_URL varsa PostgreSQL, yoksa yerel
// SQLite dosyasi (DB_PATH ile ozellestirilebilir). Bu, Render'in yonetilen
// Postgres eklentisinin standart olarak verdigi degisken adidir ve 'pg'
// paketi tarafindan da otomatik taninir.

const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');
const DATABASE_URL = process.env.DATABASE_URL || '';
const dialect = DATABASE_URL ? 'postgres' : 'sqlite';

let pgPool = null;
let sqliteClient = null;

if (dialect === 'postgres') {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    // Render/Heroku tarzi yonetilen Postgres'ler genelde SSL gerektirir
    // ama saglayicinin CA sertifikasini paylasmaz; rejectUnauthorized:false
    // baglanti yine sifrelenmis kalirken sertifika zincirini dogrulamayi
    // atlar (yaygin, kabul edilen bir uygulama). Yerel/Docker Postgres gibi
    // SSL'siz hedefler icin PGSSLMODE=disable ile tamamen kapatilabilir.
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });
  pgPool.on('error', (err) => {
    // Havuzdaki bosta bir baglantida olusan beklenmeyen hata; yakalanmazsa
    // sureci coker - sadece logluyoruz, havuz kendini toparlar.
    console.error('PostgreSQL havuzunda beklenmeyen hata:', err.message);
  });
} else {
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
  sqliteClient = createClient({ url: `file:${LOCAL_DB_PATH}` });
}

// '?' yer tutuculari PostgreSQL'in bekledigi '$1, $2, ...' bicimine
// ceviri sirasiyla yapilir. Bu kod tabanindaki hicbir sorgu metninde
// literal '?' karakteri (ornegin bir URL icinde) gecmiyor, bu yuzden
// basit soldan-saga degistirme yeterli ve guvenlidir.
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query({ sql, args = [] }) {
  if (dialect === 'postgres') {
    const res = await pgPool.query(toPgSql(sql), args);
    return { rows: res.rows, rowsAffected: res.rowCount };
  }
  const res = await sqliteClient.execute({ sql, args });
  return { rows: res.rows, rowsAffected: Number(res.rowsAffected) };
}

// Birden fazla ifadeyi TEK bir transaction icinde atomik calistirir
// (hepsi basarili olur ya da hicbiri kalici olmaz). db.js'teki coklu-
// adimli islemler (ör. deleteServer, deleteUserAccount, acceptFriendRequest)
// bu garantiye guvenir.
async function batch(statements) {
  if (dialect === 'postgres') {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const { sql, args = [] } of statements) {
        const res = await client.query(toPgSql(sql), args);
        results.push({ rows: res.rows, rowsAffected: res.rowCount });
      }
      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  const results = await sqliteClient.batch(statements, 'write');
  return results.map((r) => ({ rows: r.rows, rowsAffected: Number(r.rowsAffected) }));
}

// Sunucu HTTP dinlemeye baslamadan once cagrilir: baglanti gercekten
// kurulabiliyor mu diye basit bir sorguyla dogrular. Basarisiz olursa
// cagiran taraf (index.js) sureci sonlandirir - hicbir otomatik
// sifirlama/yeniden-olusturma yapilmaz.
async function testConnection() {
  await query({ sql: 'SELECT 1' });
}

// Hem libsql (yerel/test SQLite) hem 'pg' (PostgreSQL) icin essiz kisit
// ihlalini taniyan tek fonksiyon - db.js'teki "varsa olusturma" (yaris
// durumuna karsi guvenli) kalibi bu ikisinin herhangi birinde calisir.
function isUniqueViolation(err) {
  if (dialect === 'postgres') return err && err.code === '23505';
  return typeof err?.message === 'string' && err.message.includes('UNIQUE');
}

module.exports = {
  dialect,
  query,
  batch,
  testConnection,
  isUniqueViolation,
  LOCAL_DB_PATH,
  DATA_DIR,
};
