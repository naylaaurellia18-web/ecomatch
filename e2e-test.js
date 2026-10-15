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

async function expectError(label, status, fn) {
  try {
    await fn();
  } catch (e) {
    if (String(e.message).includes(String(status))) {
      console.log(`✓ ${label} -> ${status}`);
      return;
    }
    throw new Error(`${label}: ekspektasi ${status}, dapat: ${e.message}`);
  }
  throw new Error(`${label}: seharusnya gagal ${status} tapi sukses`);
}

async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return r.token;
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(200),
]);

function wasteForm(berat = '18.5', foto = png) {
  const fd = new FormData();
  fd.append('nama_sampah', `Sisa nasi kotak tes ${Date.now()}`);
  fd.append('jenis_makanan', 'nasi');
  fd.append('berat_kg', berat);
  fd.append('waktu_produksi', new Date(Date.now() - 2 * 3600000).toISOString());
  fd.append('lat', '-7.6245');
  fd.append('lng', '111.525');
  fd.append('foto', new Blob([foto], { type: 'image/png' }), 'waste.png');
  return fd;
}

(async () => {
  // --- P3: security headers
  const home = await fetch(base + '/');
  const csp = home.headers.get('content-security-policy') || '';
  if (!csp.includes("default-src 'self'")) throw new Error('CSP header tidak ada/lemah');
  if (home.headers.get('x-frame-options') !== 'DENY') throw new Error('X-Frame-Options bukan DENY');
  console.log('✓ P3 security headers: CSP + X-Frame-Options');

  // --- Health EcoMatch
  const health = await api('/api/health');
  if (health.service !== 'EcoMatch') throw new Error(`health.service = ${health.service}`);
  if (!health.ai_routing || !health.ai_routing.bobot) throw new Error('health.ai_routing.bobot kosong');
  console.log(`✓ health: ${health.service} · ${health.db.dialek} · mesin ${health.ai_routing.mesin || 'n/a'}`);

  // --- FR-01: validasi role & email
  await expectError('FR-01 role lama ditolak', 400, () =>
    api('/api/auth/register', {
      method: 'POST',
      body: { nama: 'Invalid', email: `x${Date.now()}@x.id`, password: 'tes123', role: 'donor' },
    })
  );
  await expectError('P3 validasi format email', 400, () =>
    api('/api/auth/register', {
      method: 'POST',
      body: { nama: 'Invalid', email: 'bukan-email', password: 'tes123', role: 'donor_mbg' },
    })
  );

  // --- Login semua aktor EcoMatch
  const admin = await login('admin@ecomatch.id', 'admin123');
  const donor = await login('donor@ecomatch.id', 'donor123');
  const donor2 = await login('donor2@ecomatch.id', 'donor123');
  const tps = await login('tps@ecomatch.id', 'tps123');
  const tps2 = await login('tps2@ecomatch.id', 'tps123');
  const kurir = await login('kurir@ecomatch.id', 'kurir123');
  const kurir2 = await login('kurir2@ecomatch.id', 'kurir123');
  const pending = await login('pending@ecomatch.id', 'pending123');
  console.log('✓ LOGIN semua aktor (admin/donor/tps/kurir/pending)');

  // --- requireActive: akun menunggu ditolak
  await expectError('FR-01 akun menunggu diblokir', 403, () => api('/api/waste/mine', { token: pending }));
  // --- RBAC: tanpa token
  await expectError('RBAC /api/admin/stats tanpa token', 401, () => api('/api/admin/stats'));

  // --- FR-10: daftar user + verifikasi pendaftar baru
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: { nama: 'Tes Baru', email: `tes${Date.now()}@ecomatch.id`, password: 'tes123', role: 'donor_mbg' },
  });
  console.log('✓ FR-01 register:', reg.message);
  const users = await api('/api/admin/users', { token: admin });
  const idByEmail = Object.fromEntries(users.map((u) => [u.email, u.id_user]));
  const pendingUser = users.find((u) => u.status === 'menunggu' && u.email.startsWith('tes'));
  if (pendingUser) {
    await api(`/api/admin/users/${pendingUser.id_user}/status`, {
      method: 'PATCH',
      token: admin,
      body: { status: 'aktif' },
    });
    console.log('✓ FR-10 verifikasi user:', pendingUser.email);
  }

  // --- FR-02: bersihkan sampah tersedia lama (rerun aman), lalu unggah sampah segar
  for (const token of [donor, donor2]) {
    const mine = await api('/api/waste/mine', { token });
    for (const s of mine.filter((x) => x.status === 'tersedia')) {
      await api(`/api/waste/${s.id_sampah}`, { method: 'DELETE', token });
    }
  }
  await expectError('FR-02 foto wajib', 400, () =>
    api('/api/waste', {
      method: 'POST',
      token: donor,
      body: { nama_sampah: 'Tanpa Foto', berat_kg: 5, waktu_produksi: new Date().toISOString() },
    })
  );
  await expectError('P3 magic-bytes upload ditolak', 400, () =>
    api('/api/waste', { method: 'POST', token: donor, form: wasteForm('5', Buffer.from('bukan-gambar-polyglot')) })
  );
  await expectError('FR-02 berat tidak valid', 400, () =>
    api('/api/waste', { method: 'POST', token: donor, form: wasteForm('-3') })
  );

  const waste = await api('/api/waste', { method: 'POST', token: donor, form: wasteForm('18.5') });
  if (!waste.id_sampah || !waste.klasifikasi) throw new Error('FR-02 unggah sampah gagal');
  console.log(
    `✓ FR-02 unggah sampah: #${waste.id_sampah} kategori=${waste.klasifikasi.kategori} tingkat=${waste.klasifikasi.tingkat_pembusukan} (${waste.klasifikasi.mesin})`
  );

  // --- FR-02 detail + edit
  const detail = await api(`/api/waste/${waste.id_sampah}`, { token: donor });
  if (detail.id_sampah !== waste.id_sampah) throw new Error('FR-02 GET detail salah');
  await api(`/api/waste/${waste.id_sampah}`, {
    method: 'PATCH',
    token: donor,
    body: { berat_kg: 18.5 },
  });
  console.log('✓ FR-02 GET/PATCH detail sampah');

  // --- FR-11: klasifikasi
  const cls = await api('/api/classify', { method: 'POST', token: donor, body: { id_sampah: waste.id_sampah } });
  const clsDetail = await api(`/api/classify/${cls.id_klasifikasi}`, { token: donor });
  if (clsDetail.id_klasifikasi !== cls.id_klasifikasi) throw new Error('FR-11 GET klasifikasi salah');
  const clsVerify = await api(`/api/classify/${cls.id_klasifikasi}/verify`, {
    method: 'PATCH',
    token: admin,
    body: { kategori: cls.kategori, tingkat_pembusukan: cls.tingkat_pembusukan },
  });
  const clsTeks = await api('/api/classify', { method: 'POST', token: donor, body: { teks: 'sisa nasi sayur' } });
  if (!clsTeks.kategori) throw new Error('FR-11 klasifikasi teks kosong');
  console.log(`✓ FR-11 klasifikasi: ${cls.kategori}/${cls.tingkat_pembusukan} · verify: ${clsVerify.message}`);

  // --- FR-03: profil TPS
  const tpsMe = await api('/api/tps/me', { token: tps });
  if (!tpsMe.nama_tps) throw new Error('FR-03 /tps/me kosong');
  const tpsPatch = await api('/api/tps/me', {
    method: 'PATCH',
    token: tps,
    body: { radius_layanan_km: 15 },
  });
  const tpsList = await api('/api/tps/list', { token: tps });
  if (!Array.isArray(tpsList) || !tpsList.length) throw new Error('FR-12 /tps/list kosong');
  console.log(`✓ FR-03/FR-12 TPS: ${tpsMe.nama_tps} · sisa ${tpsMe.sisa_kapasitas_kg} kg · list ${tpsList.length}`);

  // --- FR-04: routing
  const run = await api('/api/routing/run', { method: 'POST', token: admin });
  if (run.dibuat < 1) throw new Error('Routing tidak membuat alokasi');
  if (run.durasi_ms >= 3000) throw new Error(`Routing lewat SLA: ${run.durasi_ms}ms`);
  console.log(
    `✓ FR-04 routing: ${run.dibuat} alokasi · ${run.durasi_ms}ms (SLA <3000) · mesin=${run.mesin} · rata2=${run.rata_rata_skor}`
  );

  const idAlokasi = run.id_alokasi[0];
  const aloList = await api('/api/routing', { token: admin });
  const alo = aloList.find((a) => a.id_alokasi === idAlokasi);
  if (!alo) throw new Error('Alokasi tidak muncul di GET /api/routing');
  if (!alo.rute) throw new Error('rute_json kosong');
  console.log(
    `✓ FR-04 alokasi #${alo.id_alokasi}: skor=${alo.skor_persen}% jarak=${alo.jarak_km}km rute=${alo.rute.total_jarak_km}km/${alo.rute.total_durasi_menit}m (${alo.rute.penyedia})`
  );
  console.log('✓ FR-05 rute:', alo.rute.segmen.map((l) => `${l.dari}->${l.ke} ${l.jarak_km}km`).join(' | '));

  const explain = await api(`/api/routing/${alo.id_alokasi}/explain`, { token: admin });
  if (!explain.sub_skor || !explain.bobot) throw new Error('explain tidak lengkap');
  console.log(
    `✓ FR-04 explain: kontribusi jenis=${explain.kontribusi.jenis_cocok} kap=${explain.kontribusi.kapasitas} jarak=${explain.kontribusi.jarak} urg=${explain.kontribusi.urgensi}`
  );

  // Token pelaku sesuai alokasi
  const kurirToken = alo.id_kurir === idByEmail['kurir@ecomatch.id'] ? kurir : kurir2;
  const tpsToken = alo.id_tps === idByEmail['tps@ecomatch.id'] ? tps : tps2;
  const donorToken = alo.id_donor === idByEmail['donor@ecomatch.id'] ? donor : donor2;

  // --- Peran hanya melihat alokasi masing-masing
  const kurirList = await api('/api/routing', { token: kurirToken });
  if (!kurirList.some((a) => a.id_alokasi === alo.id_alokasi)) throw new Error('Alokasi kurir tidak terlihat');
  const donorList = await api('/api/routing', { token: donorToken });
  if (!donorList.some((a) => a.id_alokasi === alo.id_alokasi)) throw new Error('Alokasi donor tidak terlihat');
  const tpsListOwn = await api('/api/routing', { token: tpsToken });
  if (!tpsListOwn.some((a) => a.id_alokasi === alo.id_alokasi)) throw new Error('Alokasi TPS tidak terlihat');
  console.log('✓ RBAC daftar alokasi per peran (kurir/donor/tps)');

  // --- FR-07: pickup
  const fdPickup = new FormData();
  fdPickup.append('foto_jemput', new Blob([png], { type: 'image/png' }), 'pickup.png');
  const pick = await api(`/api/deliveries/${alo.id_alokasi}/pickup`, {
    method: 'POST',
    token: kurirToken,
    form: fdPickup,
  });
  console.log('✓ FR-07 pickup+foto:', pick.message);

  // --- FR-08: OTP + resend (rate-limited)
  const otpInfo = await api(`/api/deliveries/${alo.id_alokasi}/otp-status`, { token: tpsToken });
  if (!otpInfo.kode) throw new Error('OTP tidak ada');
  const resend = await api(`/api/deliveries/${alo.id_alokasi}/resend-otp`, { method: 'POST', token: tpsToken });
  console.log(`✓ FR-08 OTP: ${otpInfo.kode} · ${resend.message}`);
  let resendLimit = false;
  for (let i = 0; i < 4; i++) {
    try {
      await api(`/api/deliveries/${alo.id_alokasi}/resend-otp`, { method: 'POST', token: tpsToken });
    } catch (e) {
      if (String(e.message).includes('429')) {
        resendLimit = true;
        break;
      }
    }
  }
  if (!resendLimit) throw new Error('Rate limit resend-otp tidak aktif');
  console.log('✓ FR-08 rate limit resend-otp: 429 setelah batas');
  const otpFinal = await api(`/api/deliveries/${alo.id_alokasi}/otp-status`, { token: tpsToken });

  // --- FR-07: deliver
  const fdDeliver = new FormData();
  fdDeliver.append('foto_antar', new Blob([png], { type: 'image/png' }), 'deliver.png');
  const del = await api(`/api/deliveries/${alo.id_alokasi}/deliver`, {
    method: 'POST',
    token: kurirToken,
    form: fdDeliver,
  });
  console.log('✓ FR-07 deliver+foto antar:', del.message);

  // --- FR-08: verify OTP oleh TPS
  await expectError('FR-08 OTP salah ditolak', 400, () =>
    api(`/api/deliveries/${alo.id_alokasi}/verify-otp`, { method: 'POST', token: tpsToken, body: { otp: '000000' } })
  );
  const ver = await api(`/api/deliveries/${alo.id_alokasi}/verify-otp`, {
    method: 'POST',
    token: tpsToken,
    body: { otp: otpFinal.kode },
  });
  console.log('✓ FR-08 verifikasi OTP:', ver.message);

  const aloFinal = (await api('/api/routing', { token: admin })).find((a) => a.id_alokasi === alo.id_alokasi);
  if (aloFinal.status !== 'terverifikasi') throw new Error(`Status final ${aloFinal.status}, expected terverifikasi`);
  console.log('✓ status final alokasi: terverifikasi');

  // --- FR-12: log pengolahan + dashboard
  const log = await api(`/api/tps/${alo.id_tps}/log`, {
    method: 'POST',
    token: tpsToken,
    body: { id_alokasi: alo.id_alokasi, input_kg: 17.5, output_kg: 9.2, output_jenis: 'kompos' },
  });
  const dash = await api(`/api/tps/${alo.id_tps}/dashboard`, { token: tpsToken });
  if (dash.kg_masuk < 1) throw new Error('dashboard kg_masuk kosong');
  console.log(
    `✓ FR-12 log pengolahan #${log.id_pengolahan} · dashboard: masuk=${dash.kg_masuk}kg diolah=${dash.kg_diolah}kg output=${JSON.stringify(dash.output)}`
  );

  // --- FR-06: notifikasi + tandai dibaca
  const notif = await api('/api/notifications', { token: tpsToken });
  if (!notif.length) throw new Error('Notifikasi TPS kosong');
  await api(`/api/notifications/${notif[0].id_notifikasi}/read`, { method: 'PATCH', token: tpsToken });
  console.log(`✓ FR-06 notifikasi TPS: ${notif.length} entri · PATCH read OK`);

  // --- FR-15: motivasi + klaim donor
  const motiv = await api('/api/mbg/motivation', { token: donorToken });
  if (motiv.kg_terverifikasi < 5) throw new Error(`kg_terverifikasi ${motiv.kg_terverifikasi} < 5`);
  let klaimOk = false;
  try {
    const klaim = await api('/api/mbg/motivation/claim', {
      method: 'POST',
      token: donorToken,
      body: { jenis_insentif: 'sertifikat' },
    });
    klaimOk = klaim.id_motivasi != null;
  } catch (e) {
    klaimOk = String(e.message).includes('409'); // sudah diklaim periode ini (rerun)
  }
  if (!klaimOk) throw new Error('FR-15 klaim gagal');
  console.log(
    `✓ FR-15 motivasi: dialihkan=${motiv.kg_dialihkan}kg terverifikasi=${motiv.kg_terverifikasi}kg poin=${motiv.poin} · klaim OK`
  );

  // --- FR-09: statistik admin
  const stats = await api('/api/admin/stats', { token: admin });
  if (stats.dampak.kg_dialihkan < 1) throw new Error('FR-09 kg_dialihkan kosong');
  if (!stats.users.donor_mbg && !stats.users.tps_pengolah) throw new Error('FR-09 role kosong');
  console.log(
    '✓ FR-09 stats:',
    JSON.stringify({
      kg_dialihkan: stats.dampak.kg_dialihkan,
      kg_terverifikasi: stats.dampak.kg_terverifikasi,
      rata_rata_skor_persen: stats.dampak.rata_rata_skor_persen,
      tps_aktif: stats.tps.aktif,
      klasifikasi: stats.klasifikasi.total,
      under_target: stats.kinerja.semua_di_bawah_target,
    })
  );

  // --- FR-10: audit + matches + laporan MBG
  const logs = await api('/api/admin/logs', { token: admin });
  const auditAlias = await api('/api/admin/audit', { token: admin });
  if (!Array.isArray(auditAlias) || !auditAlias.length) throw new Error('FR-10 /audit kosong');
  const matches = await api('/api/admin/matches', { token: admin });
  if (!matches.some((m) => m.id_alokasi === alo.id_alokasi)) throw new Error('/admin/matches tidak menampilkan alokasi');
  const mbgReport = await api('/api/admin/mbg/report', { token: admin });
  if (!mbgReport.baris.length) throw new Error('FR-15 laporan MBG kosong');
  console.log(`✓ FR-10 audit=${logs.length} · /audit alias OK · matches=${matches.length} · FR-15 laporan MBG=${mbgReport.baris.length} donor`);

  // --- FR-16: regulasi CRUD
  const regBaru = await api('/api/admin/regulations', {
    method: 'POST',
    token: admin,
    body: { nama_regulasi: `Perda Tes ${Date.now()}`, jenis_regulasi: 'perda', aturan: { batas: 10 } },
  });
  await api(`/api/admin/regulations/${regBaru.id_konfigurasi}`, {
    method: 'PATCH',
    token: admin,
    body: { aktif: false },
  });
  console.log('✓ FR-16 regulasi: POST + PATCH OK');

  // --- FR-14/FR-17: compliance
  const summary = await api('/api/compliance/summary', { token: admin });
  if (summary.ringkasan.kg_dialihkan < 1) throw new Error('FR-14 summary kg_dialihkan kosong');
  const report = await api('/api/compliance/report', { token: admin });
  if (!report.jumlah) throw new Error('FR-14 report kosong');
  const trace = await api(`/api/compliance/trace/${alo.id_alokasi}`, { token: admin });
  if (!trace.sampah || !trace.klasifikasi.length) throw new Error('FR-17 trace tidak lengkap');
  const regs = await api('/api/compliance/regulations', { token: admin });
  if (!regs.length) throw new Error('FR-17 regulasi kosong');
  console.log(
    `✓ FR-14 summary: dialihkan=${summary.ringkasan.kg_dialihkan}kg · report=${report.jumlah} baris · target=${summary.target.persen_alokasi}% realisasi=${summary.target.realisasi_persen}%`
  );
  console.log(`✓ FR-17 trace #${alo.id_alokasi}: ${trace.riwayat.length} entri audit · regulasi=${regs.length}`);

  // --- FR-05: geo
  const geo = await api('/api/geo', { token: donor });
  if (!geo.users.length || !geo.tps.length) throw new Error('FR-05 geo kosong');
  const nearby = await api('/api/geo/nearby?lat=-7.6245&lng=111.525&radius_km=25', { token: donor });
  if (!nearby.hasil.length) throw new Error('FR-05 nearby kosong');
  console.log(`✓ FR-05 geo: users=${geo.users.length} tps=${geo.tps.length} listings=${geo.listings.length} · nearby=${nearby.hasil.length} (${nearby.mesin})`);

  // --- FR-09: outbox + reset password
  await new Promise((r) => setTimeout(r, 400));
  const outbox = await api('/api/admin/outbox', { token: admin });
  console.log(`✓ Outbox: ${outbox.pesan.length} pesan · WA=${outbox.kanal.whatsapp} · Email=${outbox.kanal.email}`);

  const reg2 = await api('/api/auth/register', {
    method: 'POST',
    body: { nama: 'Tes Reset', email: `reset${Date.now()}@ecomatch.id`, password: 'lama123', role: 'donor_mbg' },
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

  // --- Ganti kata sandi sendiri (pengguna login) - FR baru
  const cpEmail = `ganti${Date.now()}@ecomatch.id`;
  await api('/api/auth/register', {
    method: 'POST',
    body: { nama: 'Tes Ganti Sandi', email: cpEmail, password: 'awal123', role: 'donor_mbg' },
  });
  const usersCp = await api('/api/admin/users', { token: admin });
  const cpUser = usersCp.find((u) => u.email === cpEmail);
  if (cpUser) {
    await api(`/api/admin/users/${cpUser.id_user}/status`, {
      method: 'PATCH',
      token: admin,
      body: { status: 'aktif' },
    });
  }
  const cpToken = await login(cpEmail, 'awal123');
  await expectError('Ganti sandi: kata sandi lama salah ditolak', 400, () =>
    api('/api/auth/password', {
      method: 'POST',
      token: cpToken,
      body: { password_lama: 'salahxxx', password_baru: 'baru789' },
    })
  );
  await expectError('Ganti sandi: kata sandi baru terlalu pendek', 400, () =>
    api('/api/auth/password', {
      method: 'POST',
      token: cpToken,
      body: { password_lama: 'awal123', password_baru: '123' },
    })
  );
  await expectError('Ganti sandi: butuh login (tanpa token)', 401, () =>
    api('/api/auth/password', { method: 'POST', body: { password_lama: 'awal123', password_baru: 'baru789' } })
  );
  const cpRes = await api('/api/auth/password', {
    method: 'POST',
    token: cpToken,
    body: { password_lama: 'awal123', password_baru: 'baru789' },
  });
  if (!/berhasil/i.test(cpRes.message || '')) throw new Error('Respons ganti sandi tidak sesuai');
  await login(cpEmail, 'baru789');
  await expectError('Ganti sandi: sandi lama tak berlaku lagi', 401, () => login(cpEmail, 'awal123'));
  console.log('✓ Ganti sandi sendiri: verifikasi sandi lama → ubah → login sandi baru');

  // --- Rate limit login
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

  console.log('\n=== SEMUA UJI E2E LULUS ===');
})().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
