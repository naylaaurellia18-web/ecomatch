const db = require('../db');

async function audit(userId, action, entity, entityId, detail = null) {
  await db.run(
    `INSERT INTO log_audit (id_user, aksi, entitas, id_entitas, detail)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      action,
      entity,
      entityId != null ? String(entityId) : null,
      detail ? JSON.stringify(detail) : null,
    ]
  );
}

async function notify(userId, title, message, alokasiId = null) {
  await db.run(
    `INSERT INTO notifikasi (id_user, id_alokasi, judul, pesan)
     VALUES (?, ?, ?, ?)`,
    [userId, alokasiId, title, message]
  );
  setImmediate(() => {
    require('./channels')
      .fanout({ userId, title, message })
      .catch((e) => console.error('fanout kanal:', e.message));
  });
}

module.exports = { audit, notify };
