const base = 'http://localhost:3000';

async function req(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function login(email, password) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${r.data.error}`);
  return r.data.token;
}

const tabs = {
  admin: [
    ['Beranda', '/api/admin/stats'],
    ['Peta GIS', '/api/geo'],
    ['Peta GIS', '/api/matches'],
    ['Pengguna', '/api/admin/users'],
    ['Pencocokan AI', '/api/admin/matches'],
    ['Pesan Terkirim', '/api/admin/outbox'],
    ['Catatan Audit', '/api/admin/logs'],
    ['Notifikasi', '/api/notifications'],
  ],
  donor: [
    ['Stok Surplus', '/api/food'],
    ['Pencocokan Saya', '/api/matches'],
    ['Peta GIS', '/api/geo'],
    ['Peta GIS', '/api/matches'],
    ['Notifikasi', '/api/notifications'],
  ],
  recipient: [
    ['Kebutuhan Pangan', '/api/needs'],
    ['Konfirmasi OTP', '/api/matches'],
    ['Peta GIS', '/api/geo'],
    ['Peta GIS', '/api/matches'],
    ['Notifikasi', '/api/notifications'],
  ],
  courier: [
    ['Tugas Kurir', '/api/matches'],
    ['Peta GIS', '/api/geo'],
    ['Peta GIS', '/api/matches'],
    ['Notifikasi', '/api/notifications'],
  ],
};

const creds = {
  admin: ['admin@foodrescue.id', 'admin123'],
  donor: ['donor@foodrescue.id', 'donor123'],
  recipient: ['penerima@foodrescue.id', 'penerima123'],
  courier: ['kurir@foodrescue.id', 'kurir123'],
};

(async () => {
  let fails = 0;
  const report = [];

  for (const [role, list] of Object.entries(tabs)) {
    const [email, pass] = creds[role];
    let token;
    try { token = await login(email, pass); }
    catch (e) { console.log(`LOGIN FAIL ${role}: ${e.message}`); fails++; continue; }

    const seen = new Set();
    for (const [tab, path] of list) {
      const key = role + '|' + path;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = await req(path, { token });
      const mark = r.ok ? 'OK ' : 'FAIL';
      if (!r.ok) fails++;
      report.push(`${mark} [${role}] ${tab} ${path} -> ${r.status} ${r.data.error || ''}`);
    }
  }

  // OTP status for recipient on delivered matches
  const recTok = await login(...creds.recipient);
  const matches = await req('/api/matches', { token: recTok });
  const ready = (matches.data || []).filter((m) => ['dijemput', 'terkirim'].includes(m.status));
  for (const m of ready) {
    const r = await req(`/api/deliveries/${m.id_alokasi}/otp-status`, { token: recTok });
    report.push(`${r.ok ? 'OK ' : 'FAIL'} [recipient] OTP #${m.id_alokasi} -> ${r.status} ${r.data.error || ''}`);
    if (!r.ok) fails++;
  }

  console.log(report.join('\n'));
  console.log(fails ? `\n${fails} GAGAL` : '\nSEMUA ENDPOINT TAB OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
