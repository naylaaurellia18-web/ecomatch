const crypto = require('node:crypto');

const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmail(value) {
  const s = String(value || '');
  return s.length <= EMAIL_MAX && EMAIL_RE.test(s);
}

function clampStr(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function isImageBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }
  return false;
}

function imageUploadFilter(_req, file, cb) {
  if (!/^image\//.test(file.mimetype || '')) {
    const err = new Error('Hanya file gambar yang diizinkan');
    err.status = 400;
    return cb(err);
  }
  cb(null, true);
}

function assertImageBuffer(buffer) {
  if (!isImageBuffer(buffer)) {
    const err = new Error('File bukan gambar valid (PNG/JPEG/GIF/WebP)');
    err.status = 400;
    throw err;
  }
}

module.exports = {
  isEmail,
  clampStr,
  safeEqual,
  isImageBuffer,
  imageUploadFilter,
  assertImageBuffer,
  EMAIL_MAX,
};
