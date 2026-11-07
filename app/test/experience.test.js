const test = require('node:test');
const assert = require('node:assert/strict');
const { friendlyError } = require('../experience');
test('technical network and server failures become actionable messages', () => {
  assert.equal(friendlyError(new TypeError('Failed to fetch')), 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  assert.equal(friendlyError('postgres constraint stack', 500), 'Sunucu şu anda işlemi tamamlayamadı. Biraz sonra tekrar dene.');
  assert.equal(friendlyError('timeout', 429), 'Çok hızlı işlem yaptın. Biraz bekleyip tekrar dene.');
  assert.equal(friendlyError('NotAllowedError'), 'İzin verilmedi. Mikrofon veya ekran kaydı iznini kontrol et.');
});
test('useful validation messages are retained', () => {
  assert.equal(friendlyError('Bu kullanıcı adı zaten alınmış.', 409), 'Bu kullanıcı adı zaten alınmış.');
});
