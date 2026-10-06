const base = process.env.BASE_URL || 'http://localhost:3000';

async function api(p, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + p, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p} -> ${res.status} ${data.error || ''}`);
  return data;
}

async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return r.token;
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(200),
]);

(async () => {
  const home = await fetch(base + '/');
  const csp = home.headers.get('content-security-policy') || '';
  if (!csp.includes("default-src 'self'")) throw new Error('CSP header tidak ada/lemah');
  if (home.headers.get('x-frame-options') !== 'DENY') throw new Error('X-Frame-Options bukan DENY');
  console.log('✓ P3 security headers: CSP + X-Frame-Options');

  let badEmail = false;
  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: { nama: 'Invalid', email: 'bukan-email', password: 'tes123', role: 'donor' },
    });
  } catch (e) {
    badEmail = String(e.message).includes('400');
  }
  if (!badEmail) throw new Error('Email validasi tidak aktif');
  console.log('✓ P3 validasi format email');

  const admin = await login('admin@foodrescue.id', 'admin123');
  const donor = await login('donor@foodrescue.id', 'donor123');
  const penerima = await login('penerima@foodrescue.id', 'penerima123');
  const penerima2 = await login('penerima2@foodrescue.id', 'penerima123');
  const kurir = await login('kurir@foodrescue.id', 'kurir123');
  console.log('✓ LOGIN semua aktor');

  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: { nama: 'Tes Baru', email: `tes${Date.now()}@x.id`, password: 'tes123', role: 'donor' },
  });
  console.log('✓ FR-01 register:', reg.message);

  const pendingUsers = await api('/api/admin/users', { token: admin });
  const pending = pendingUsers.find((u) => u.status === 'menunggu' && u.email.startsWith('tes'));
  if (pending) {
    await api(`/api/admin/users/${pending.id_user}/status`, {
      method: 'PATCH',
      token: admin,
      body: { status: 'aktif' },
    });
    console.log('✓ FR-10 verifikasi user:', pending.email);
  }

  const allMatches = await api('/api/admin/matches', { token: admin });
  const active = allMatches.filter((m) =>
    ['diajukan', 'diterima', 'dijemput', 'terkirim'].includes(m.status)
  );
  if (active.length) {
    console.log(`✓ info: ${active.length} alokasi aktif sudah ada (dilewati, tidak di-reset via API)`);
  }

  const fdListing = new FormData();
  fdListing.append('nama_makanan', `Surplus Tes ${Date.now()}`);
  fdListing.append('jumlah_porsi', '30');
  fdListing.append('expiry_time', new Date(Date.now() + 4 * 3600000).toISOString());
  fdListing.append('jenis_makanan', 'basah');
  fdListing.append('lat', '-7.6245');
  fdListing.append('lng', '111.525');
  fdListing.append('foto_kondisi', new Blob([png], { type: 'image/png' }), 'food.png');
  await api('/api/food', { method: 'POST', token: donor, form: fdListing });

  await api('/api/needs', {
    method: 'POST',
    token: penerima,
    body: {
      judul: `Kebutuhan Tes ${Date.now()}`,
      porsi_dibutuhkan: 30,
      urgensi: 'kritis',
      lat: -7.615,
      lng: 111.515,
    },
  });
  console.log('✓ data listing & kebutuhan segar dibuat');

  const run = await api('/api/matches/run', { method: 'POST', token: admin });
  console.log(`✓ FR-04 AI Matching: ${run.dibuat} alokasi, ${run.durasi_ms}ms (target <3000)`);
  if (run.dibuat < 1) throw new Error('Matching tidak membuat alokasi');

  const courierMatches = await api('/api/matches', { token: kurir });
  const match = courierMatches.find((m) => m.status === 'diajukan');
  if (!match) throw new Error('No alokasi berstatus diajukan');

  const recMatches = await api('/api/matches', { token: penerima });
  const rec2Matches = await api('/api/matches', { token: penerima2 });
  const belongsToP2 = rec2Matches.some((m) => m.id_alokasi === match.id_alokasi);
  const recipientToken = belongsToP2 ? penerima2 : penerima;
  const recipientName = belongsToP2 ? 'penerima2' : 'penerima';
  console.log(
    `✓ Alokasi #${match.id_alokasi} skor=${match.skor_persen}% jarak=${match.jarak_km}km rute=${match.rute.total_jarak_km}km/${match.rute.total_durasi_menit}m penerima=${recipientName}`
  );
  console.log('✓ FR-05 rute:', match.rute.segmen.map((l) => `${l.dari}->${l.ke} ${l.jarak_km}km`).join(' | '));

  const fdPickup = new FormData();
  fdPickup.append('foto_jemput', new Blob([png], { type: 'image/png' }), 'pickup.png');
  const pick = await api(`/api/deliveries/${match.id_alokasi}/pickup`, {
    method: 'POST',
    token: kurir,
    form: fdPickup,
  });
  console.log('✓ FR-07 pickup+foto:', pick.message);

  const otpInfo = await api(`/api/deliveries/${match.id_alokasi}/otp-status`, { token: recipientToken });
  console.log('✓ FR-08 OTP:', otpInfo.kode);
  if (!otpInfo.kode) throw new Error('OTP tidak ada');

  const fdDeliver = new FormData();
  fdDeliver.append('foto_antar', new Blob([png], { type: 'image/png' }), 'deliver.png');
  const del = await api(`/api/deliveries/${match.id_alokasi}/deliver`, {
    method: 'POST',
    token: kurir,
    form: fdDeliver,
  });
  console.log('✓ FR-07 deliver+foto antar:', del.message);

  const ver = await api(`/api/deliveries/${match.id_alokasi}/verify-otp`, {
    method: 'POST',
    token: recipientToken,
    body: { otp: otpInfo.kode },
  });
  console.log('✓ FR-08 verifikasi OTP:', ver.message);

  const final = await api(`/api/matches/${match.id_alokasi}`, { token: admin });
  console.log('✓ status final:', final.status);
  if (final.status !== 'terverifikasi') throw new Error('Expected terverifikasi');

  const stats = await api('/api/admin/stats', { token: admin });
  console.log(
    '✓ FR-09 stats:',
    JSON.stringify({
      porsi_tersalurkan: stats.dampak.porsi_tersalurkan,
      pengurangan_food_waste_persen: stats.dampak.pengurangan_food_waste_persen,
      rata_rata_skor_persen: stats.dampak.rata_rata_skor_persen,
      audit: stats.dampak.log_audit,
      under_target: stats.kinerja.semua_di_bawah_target,
    })
  );
  if (stats.dampak.porsi_tersalurkan < 1) throw new Error('FR-09 porsi tersalurkan kosong');

  const logs = await api('/api/admin/logs', { token: admin });
  console.log(`✓ audit logs: ${logs.length} entri`);

  const notif = await api('/api/notifications', { token: recipientToken });
  console.log(`✓ FR-06 notifikasi penerima: ${notif.length} entri`);

  await new Promise((r) => setTimeout(r, 400));
  const outbox = await api('/api/admin/outbox', { token: admin });
  console.log(
    `✓ Outbox: ${outbox.pesan.length} pesan · WA=${outbox.kanal.whatsapp} · Email=${outbox.kanal.email}`
  );

  const imm = await fetch(`${base}/api/admin/logs`).then((r) => r.status);
  console.log('✓ RBAC: /api/admin/logs tanpa token ->', imm);

  const reg2 = await api('/api/auth/register', {
    method: 'POST',
    body: { nama: 'Tes Reset', email: `reset${Date.now()}@x.id`, password: 'lama123', role: 'donor' },
  });
  void reg2;
  const pending2 = (await api('/api/admin/users', { token: admin })).find(
    (u) => u.status === 'menunggu' && u.email.startsWith('reset')
  );
  if (pending2) {
    await api(`/api/admin/users/${pending2.id_user}/status`, {
      method: 'PATCH',
      token: admin,
      body: { status: 'aktif' },
    });
  }
  await api('/api/auth/forgot-password', { method: 'POST', body: { email: pending2.email } });
  await new Promise((r) => setTimeout(r, 300));
  const out2 = await api('/api/admin/outbox', { token: admin });
  const resetMsg = out2.pesan.find(
    (m) => m.kanal === 'email' && m.subjek && m.subjek.includes('Reset') && m.isi.match(/\b\d{6}\b/)
  );
  if (!resetMsg) throw new Error('Kode reset tidak ada di outbox');
  const resetCode = resetMsg.isi.match(/\b(\d{6})\b/)[1];
  await api('/api/auth/reset-password', {
    method: 'POST',
    body: { email: pending2.email, kode: resetCode, password: 'baru456' },
  });
  await login(pending2.email, 'baru456');
  console.log('✓ Lupa sandi: kode dari outbox → reset → login sandi baru OK');

  const rlEmail = `rl${Date.now()}@x.id`;
  let rateLimited = false;
  for (let i = 0; i < 6; i++) {
    try {
      await api('/api/auth/login', { method: 'POST', body: { email: rlEmail, password: 'salah' } });
    } catch (e) {
      if (String(e.message).includes('429')) {
        rateLimited = true;
        break;
      }
    }
  }
  if (!rateLimited) throw new Error('Rate limit login tidak aktif');
  console.log('✓ Rate limit login: setelah 5 gagal → 429');

  const fdBad = new FormData();
  fdBad.append('nama_makanan', 'Surplus Palsu');
  fdBad.append('jumlah_porsi', '5');
  fdBad.append('expiry_time', new Date(Date.now() + 3600000).toISOString());
  fdBad.append('foto_kondisi', new Blob([Buffer.from('not-an-image-polyglot')], { type: 'image/png' }), 'evil.png');
  let badImage = false;
  try {
    await api('/api/food', { method: 'POST', token: donor, form: fdBad });
  } catch (e) {
    badImage = String(e.message).includes('400');
  }
  if (!badImage) throw new Error('Magic-bytes upload tidak aktif');
  console.log('✓ P3 magic-bytes upload: file palsu ditolak 400');

  console.log('\n=== SEMUA UJI E2E LULUS ===');
})().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
