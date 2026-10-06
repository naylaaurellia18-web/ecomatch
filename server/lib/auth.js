const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const DEV_SECRET = 'food-rescue-ai-dev-secret-change-in-production';
const JWT_EXPIRES = '12h';

function isProduction() {
  return process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';
}

function assertJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!isProduction()) {
    return secret || DEV_SECRET;
  }
  if (!secret || secret === DEV_SECRET || secret.length < 32) {
    throw new Error(
      'JWT_SECRET wajib di-set di produksi: string acak minimal 32 karakter. ' +
        'Buat dengan: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))" ' +
        'lalu simpan di Environment Variables (Vercel/Railway).'
    );
  }
  return secret;
}

const JWT_SECRET = assertJwtSecret();

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id_user, role: user.role, nama: user.nama, status: user.status },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  generateOtp,
  generateSecret,
  isProduction,
};
