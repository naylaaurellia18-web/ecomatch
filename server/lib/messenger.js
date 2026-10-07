const DEFAULT_FROM = process.env.MAIL_FROM || 'EcoMatch <no-reply@ecomatch.local>';

function isConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = `62${p.slice(1)}`;
  if (p.startsWith('8')) p = `62${p}`;
  return p;
}

async function sendWhatsApp(phone, message) {
  const to = normalizePhone(phone);
  if (!to) return { ok: false, skipped: true, reason: 'nomor kosong' };

  const callmebotKey = process.env.CALLMEBOT_APIKEY;
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;

  if (callmebotKey) {
    try {
      const u = new URL('https://api.callmebot.com/whatsapp.php');
      u.searchParams.set('phone', to);
      u.searchParams.set('text', message);
      u.searchParams.set('apikey', callmebotKey);
      const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        return { ok: false, simulated: false, to, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true, simulated: false, to, response: text.slice(0, 500) };
    } catch (e) {
      return { ok: false, simulated: false, to, error: e.message };
    }
  }

  if (!url) {
    return { ok: true, simulated: true, to };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
              'X-Api-Key': token,
              apikey: token,
            }
          : {}),
      },
      body: JSON.stringify({
        phone: to,
        to,
        target: to,
        number: to,
        message,
        text: message,
        body: message,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, simulated: false, to, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, simulated: false, to, response: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, simulated: false, to, error: e.message };
  }
}

async function sendEmail(to, subject, body) {
  if (!to) return { ok: false, skipped: true, reason: 'email kosong' };

  if (!isConfigured()) {
    return { ok: true, simulated: true, to };
  }

  try {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === '1' || port === 465;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || DEFAULT_FROM,
      to,
      subject,
      text: body,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">
  <p><b>${escapeHtml(subject)}</b></p>
  <p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>
  <p style="color:#64748b;font-size:12px">EcoMatch — Pengalihan Sampah Makanan MBG ke TPS Pengolah</p>
</div>`,
    });
    return { ok: true, simulated: false, to, response: info.messageId || 'ok' };
  } catch (e) {
    return { ok: false, simulated: false, to, error: e.message };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendWhatsApp, sendEmail, normalizePhone, isConfigured };
