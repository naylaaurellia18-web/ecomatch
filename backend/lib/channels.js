const db = require('../db');
const { sendWhatsApp, sendEmail } = require('./messenger');

const OUTBOX_STATUS = { queued: 'antre', sent: 'terkirim', simulated: 'simulasi', failed: 'gagal' };

async function record(row) {
  try {
    await db.run(
      `INSERT INTO outbox_pesan (kanal, id_user, tujuan, subjek, isi, status, error, referensi_penerus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.channel,
        row.userId ?? null,
        row.to ?? null,
        row.subject ?? null,
        row.body,
        OUTBOX_STATUS[row.status] || row.status,
        row.error ?? null,
        row.providerRef ?? null,
      ]
    );
  } catch (e) {
    console.error('outbox insert:', e.message);
  }
}

function channelStatus() {
  return {
    whatsapp: process.env.CALLMEBOT_APIKEY || process.env.WHATSAPP_API_URL ? 'live' : 'simulated',
    email: process.env.SMTP_HOST ? 'live' : 'simulated',
  };
}

async function fanout({ userId, title, message }) {
  if (!userId) return;
  const user = await db.get('SELECT id_user, nama, email, telepon FROM user WHERE id_user = ?', [userId]);
  if (!user) return;

  const body = `${title}\n${message}`;

  if (user.telepon) {
    const wa = await sendWhatsApp(user.telepon, body);
    if (wa.skipped) return;
    await record({
      channel: 'whatsapp',
      userId: user.id_user,
      to: wa.to || user.telepon,
      subject: title,
      body: message,
      status: wa.ok ? (wa.simulated ? 'simulated' : 'sent') : 'failed',
      error: wa.error || null,
      providerRef: wa.response || null,
    });
  }

  if (user.email) {
    const mailTo = process.env.NOTIFY_EMAIL || user.email;
    const mail = await sendEmail(mailTo, title, message);
    if (mail.skipped) return;
    await record({
      channel: 'email',
      userId: user.id_user,
      to: mail.to || mailTo,
      subject: title,
      body: message,
      status: mail.ok ? (mail.simulated ? 'simulated' : 'sent') : 'failed',
      error: mail.error || null,
      providerRef: mail.response || null,
    });
  }
}

module.exports = { fanout, channelStatus, record };
