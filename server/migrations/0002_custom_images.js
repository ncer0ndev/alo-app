// Kullanicilarin kendi profil resmi/banner gorseli yukleyebilmesi icin:
// gercek dosya harici bir depoda (Cloudinary) tutuluyor, burada yalnizca
// donen URL ve temizlik icin gerekli public_id saklaniyor. avatar_id/
// banner_id 'custom' oldugunda bu sutunlar kullanilir (bkz. db.js).

const sqlite = [
  "ALTER TABLE users ADD COLUMN avatar_url TEXT",
  "ALTER TABLE users ADD COLUMN avatar_public_id TEXT",
  "ALTER TABLE users ADD COLUMN banner_url TEXT",
  "ALTER TABLE users ADD COLUMN banner_public_id TEXT",
];

const postgres = [
  "ALTER TABLE users ADD COLUMN avatar_url TEXT",
  "ALTER TABLE users ADD COLUMN avatar_public_id TEXT",
  "ALTER TABLE users ADD COLUMN banner_url TEXT",
  "ALTER TABLE users ADD COLUMN banner_public_id TEXT",
];

module.exports = { name: '0002_custom_images', sqlite, postgres };
