// Mesaj basina "benden sil" (yalnizca bu kullanicidan gizle) icin: mesaj
// gonderiminden 5 dakika sonra artik "herkesten sil" yapilamiyor, bunun
// yerine mesaj yalnizca isteyen kullanicinin kendi gorunumunden gizleniyor.
// Asil mesaj satiri (direct_messages/server_messages) silinmiyor, bu yuzden
// digerlerinin gorunumu etkilenmiyor. Mesaj gercekten silinirse (herkesten
// sil ya da moderator silmesi) buradaki satirlar CASCADE ile otomatik
// temizlenir.

const sqlite = [
  `CREATE TABLE IF NOT EXISTS dm_message_hides (
    message_id TEXT NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS server_message_hides (
    message_id TEXT NOT NULL REFERENCES server_messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, user_id)
  )`,
];

const postgres = [
  `CREATE TABLE IF NOT EXISTS dm_message_hides (
    message_id TEXT NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS server_message_hides (
    message_id TEXT NOT NULL REFERENCES server_messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, user_id)
  )`,
];

module.exports = { name: '0003_message_hide', sqlite, postgres };
