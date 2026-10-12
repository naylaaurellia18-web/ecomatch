const crypto = require('node:crypto');

function cloudinaryConfig() {
  const url = process.env.CLOUDINARY_URL;
  if (url) {
    try {
      const u = new URL(url);
      const auth = u.username || '';
      const [apiKey, apiSecret] = auth.split(':');
      return {
        cloudName: u.hostname,
        apiKey,
        apiSecret,
        secure: true,
      };
    } catch {
      return null;
    }
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret, secure: true };
  }
  return null;
}

function storageMode() {
  return cloudinaryConfig() ? 'cloudinary' : 'base64';
}

function toDataUri(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

function signCloudinary(params, apiSecret) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

async function uploadCloudinary(file, cfg) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = process.env.CLOUDINARY_FOLDER || 'ecomatch';
  const params = { folder, timestamp };
  const signature = signCloudinary(params, cfg.apiSecret);

  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'photo.jpg');
  form.append('api_key', cfg.apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  const endpoint = `https://api.cloudinary.com/v1_/${cfg.cloudName}/image/upload`;
  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message || `Cloudinary HTTP ${res.status}`);
  }
  return data.secure_url;
}

/**
 * Simpan foto: Cloudinary bila env terisi, fallback base64 (demo/lokal).
 */
async function saveImage(file) {
  if (!file || !file.buffer?.length) return null;
  const cfg = cloudinaryConfig();
  if (cfg) {
    try {
      return await uploadCloudinary(file, cfg);
    } catch (e) {
      console.error('storage: Cloudinary gagal, fallback base64:', e.message);
    }
  }
  return toDataUri(file);
}

module.exports = { saveImage, storageMode, cloudinaryConfig };
