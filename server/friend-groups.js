const adapter = require('./db-adapter');
module.exports = function register({ app, auth, limiter, route, db, createRoomEntry, rooms }) {
  const q = (sql, args = []) => adapter.query({ sql, args });
  const membership = async (id, userId) => (await q('SELECT * FROM friend_group_members WHERE group_id = ? AND user_id = ?', [id, userId])).rows.length > 0;
  app.post('/api/social-profile', auth, limiter, route(async (req, res) => {
    const { about, presence, duration } = req.body || {};
    if (typeof about !== 'string' || about.length > 300 || !['online', 'busy', 'dnd'].includes(presence) || ![0, 30, 60, 240].includes(duration)) return res.status(400).json({ error: 'Geçersiz profil bilgisi.' });
    await q('INSERT INTO social_profiles(user_id,about,presence,expires_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET about=excluded.about,presence=excluded.presence,expires_at=excluded.expires_at', [req.userId, about.trim(), presence, duration ? Date.now() + duration * 60000 : 0]);
    res.json({ ok: true });
  }));
  app.get('/api/social-profile/:username', auth, route(async (req, res) => {
    const user = await db.getUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const profile = (await q('SELECT about,presence,expires_at FROM social_profiles WHERE user_id=?', [user.id])).rows[0] || { about: '', presence: 'online', expires_at: 0 };
    if (Number(profile.expires_at) && Number(profile.expires_at) < Date.now()) profile.presence = 'online';
    const common = await q('SELECT s.name FROM servers s JOIN server_members a ON a.server_id=s.id JOIN server_members b ON b.server_id=s.id WHERE a.user_id=? AND b.user_id=?', [req.userId, user.id]);
    res.json({ ...profile, commonServers: common.rows.map(s => s.name) });
  }));
  app.get('/api/groups', auth, route(async (req, res) => {
    const result = await q('SELECT g.* FROM friend_groups g JOIN friend_group_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.id DESC', [req.userId]);
    res.json({ groups: result.rows });
  }));
  app.post('/api/groups', auth, limiter, route(async (req, res) => {
    const name = req.body?.name?.trim();
    const names = req.body?.members;
    if (typeof name !== 'string' || name.length < 2 || name.length > 40 || !Array.isArray(names) || names.length > 15 || names.some(n => typeof n !== 'string')) return res.status(400).json({ error: 'Grup adı 2–40 karakter, üye sayısı en fazla 15 olmalı.' });
    const ids = new Set([req.userId]);
    for (const username of names) {
      const user = await db.getUserByUsername(username);
      if (!user || !(await db.areFriends(req.userId, user.id))) return res.status(403).json({ error: 'Yalnızca arkadaşlarını ekleyebilirsin.' });
      ids.add(user.id);
    }
    if (ids.size < 2) return res.status(400).json({ error: 'En az bir arkadaş seç.' });
    // The transaction rolls back the group if any membership insertion fails.
    const result = await q('INSERT INTO friend_groups(name,owner_id) VALUES (?,?) RETURNING id', [name, req.userId]);
    const id = Number(result.rows[0].id);
    try {
      await adapter.batch([...ids].map(userId => ({ sql: 'INSERT INTO friend_group_members(group_id,user_id) VALUES (?,?)', args: [id, userId] })));
    } catch (error) { await q('DELETE FROM friend_groups WHERE id=?', [id]); throw error; }
    res.json({ id, name });
  }));
  app.get('/api/groups/:id/messages', auth, route(async (req, res) => {
    if (!await membership(req.params.id, req.userId)) return res.status(403).json({ error: 'Bu grubun üyesi değilsin.' });
    const messages = await q('SELECT m.id,m.text,m.created_at,u.username FROM friend_group_messages m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.id DESC LIMIT 100', [req.params.id]);
    const members = await q('SELECT u.username FROM friend_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=?', [req.params.id]);
    res.json({ messages: messages.rows.reverse(), members: members.rows });
  }));
  app.post('/api/groups/:id/messages', auth, limiter, route(async (req, res) => {
    if (!await membership(req.params.id, req.userId)) return res.status(403).json({ error: 'Bu grubun üyesi değilsin.' });
    const text = req.body?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) return res.status(400).json({ error: 'Mesaj 1–2000 karakter olmalı.' });
    await q('INSERT INTO friend_group_messages(group_id,user_id,text,created_at) VALUES (?,?,?,?)', [req.params.id, req.userId, text.trim(), Date.now()]);
    res.json({ ok: true });
  }));
  app.post('/api/groups/:id/call', auth, limiter, route(async (req, res) => {
    if (!await membership(req.params.id, req.userId)) return res.status(403).json({ error: 'Bu grubun üyesi değilsin.' });
    const members = (await q('SELECT user_id FROM friend_group_members WHERE group_id=?', [req.params.id])).rows;
    let entry = [...rooms.entries()].find(([, room]) => room.friendGroupId === Number(req.params.id));
    if (!entry) {
      const code = createRoomEntry({ type: 'call' });
      const room = rooms.get(code);
      room.friendGroupId = Number(req.params.id); room.callAccepted = true;
      room.callUserIds = new Set(members.map(member => Number(member.user_id)));
      entry = [code, room];
    }
    res.json({ roomCode: entry[0] });
  }));
};
