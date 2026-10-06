const { verifyToken } = require('./lib/auth');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak: peran tidak berwenang' });
    }
    next();
  };
}

function requireActive(req, res, next) {
  if (req.user.status !== 'aktif') {
    return res.status(403).json({ error: 'Akun belum diverifikasi admin' });
  }
  next();
}

module.exports = { authenticate, requireRole, requireActive };
