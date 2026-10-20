import { icon, esc, statusTag } from '../core/ui.js';

export function sopKeyForJenis(jenis) {
  return ['nasi', 'sayur', 'lauk', 'buah', 'campuran', 'sisa_nasi', 'kulit_buah'].includes(jenis)
    ? 'basah'
    : jenis === 'kering'
      ? 'kering'
      : null;
}

const SOP = {
  basah: {
    title: 'SOP Makanan Basah',
    warn: 'Makanan basah mudah basi & tumbuh bakteri — utamakan rantai dingin dan waktu singkat.',
    sections: [
      {
        title: 'Packing',
        items: [
          'Gunakan wadah food-grade tertutup rapat (container/box mika bersegel)',
          'Pisahkan makanan matang dan mentah — jangan dicampur',
          'Label wadah: nama makanan, jam masak/sisa, masa simpan, porsi',
          'Bungkus dengan ice gel/cold pack bila suhu harus tetap dingin',
          'Hindari kertas koran / wadah terbuka saat pengantaran',
        ],
      },
      {
        title: 'Penyimpanan',
        items: [
          'Suhu penyimpanan ≤ 5°C (chiller) atau ≤ -18°C (freezer) bila bisa',
          'Bila tidak ada chiller: simpan di tempat paling dingin, maksimal 2 jam sebelum penjemputan',
          'Jangan simpan di bawah matahari / ruang panas dapur',
          'Simpan berdasarkan FEFO (First Expired, First Out)',
        ],
      },
      {
        title: 'Suhu & Rentang Aman',
        items: [
          'Zona berbahaya 5°C–60°C — makanan basah jangan lama di rentang ini',
          'Target: dari dapur → kurir → TPS dalam ≤ 4 jam (ideal ≤ 2 jam)',
          'Saat tiba, TPS cek bau, tekstur, dan suhu — bila ragu, olah segera',
        ],
      },
      {
        title: 'Hygiene & Transport',
        items: [
          'Cuci tangan / pakai sarung tangan saat mengemas',
          'Dasar kendaraan bersih; makanan tidak bersentuhan langsung dengan lantai bagasi',
          'Antar langsung — tidak boleh ditinggal di dashboard panas',
          'Foto kondisi makanan saat penjemputan sebagai bukti rantai penanganan',
        ],
      },
    ],
  },
  kering: {
    title: 'SOP Makanan Kering',
    warn: 'Makanan kering lebih tahan lama, tapi tetap jaga kelembapan & kemasan utuh.',
    sections: [
      {
        title: 'Packing',
        items: [
          'Pakai kemasan asli yang masih utuh, atau ziplock/foil food-grade',
          'Pastikan kemasan tidak sobek, bocor, atau lembap',
          'Gabungkan item serupa dalam kardus/kotak bertumpuk rapi',
          'Label: nama produk, tanggal kedaluwarsa, jumlah, kondisi kemasan',
        ],
      },
      {
        title: 'Penyimpanan',
        items: [
          'Simpan kering, sejuk, teduh — hindari kelembapan tinggi',
          'Jauhkan dari bau menyengat (mis. deterjen, bensin) agar tidak menyerap aroma',
          'Angin-anginkan gudang; jangan menumpuk menempel lantai lembap',
          'Rotasi stok FEFO — yang kedaluwarsa paling dekat didahulukan',
        ],
      },
      {
        title: 'Rentang Aman',
        items: [
          'Umumnya aman di suhu ruang selama kemasan tersegel',
          'Hindari suhu ekstrem & sinar matahari langsung (bisa mencairkan/rusak)',
          'Cek masa simpan sebelum dicatat; yang kedaluwarsa tidak boleh diolah',
        ],
      },
      {
        title: 'Hygiene & Transport',
        items: [
          'Kemas lapis luar bersih; jangan taruh di bagasi basah',
          'Pisahkan dari makanan basah saat dijadikan satu rute',
          'Foto kemasan utuh saat penjemputan',
        ],
      },
    ],
  },
};

function sopHeader(type, s) {
  return `<div class="sop-head">
    ${icon('shield', 16)}
    <div>
      <strong>${s.title}</strong>
      <div class="sop-warn">${esc(s.warn)}</div>
    </div>
    <span class="sop-badge">${type === 'basah' ? icon('refresh', 14) + ' Rantai dingin' : icon('package', 14) + ' Jaga kering'}</span>
  </div>`;
}

export function sopHtml(type, { compact = false } = {}) {
  const s = SOP[type];
  if (!s) return '';
  if (compact) {
    return `<div class="sop sop-compact">
      <div class="sop-head" style="margin-bottom:var(--sp-2)">
        ${icon('shield', 14)} <strong>${s.title}</strong> ${statusTag(type)}
      </div>
      <ul class="sop-list">
        ${s.sections.flatMap((sec) => sec.items.slice(0, 2)).slice(0, 6).map((i) => `<li>${icon('check', 12)}<span>${esc(i)}</span></li>`).join('')}
      </ul>
    </div>`;
  }
  return `<details class="sop-details">
    <summary>${icon('shield', 14)} Panduan SOP ${type === 'basah' ? 'Makanan Basah' : 'Makanan Kering'} — buka panduan</summary>
    <div class="sop">
      ${sopHeader(type, s)}
      <div class="sop-grid">
        ${s.sections
          .map(
            (sec) => `<div>
              <div class="sop-sec-title">${esc(sec.title)}</div>
              <ul class="sop-list">${sec.items.map((i) => `<li>${icon('check', 12)}<span>${esc(i)}</span></li>`).join('')}</ul>
            </div>`
          )
          .join('')}
      </div>
    </div>
  </details>`;
}

export function bindSopToggle(root) {
  const el = root || document;
  const sel = el.querySelector('[name="jenis_makanan"]');
  const box = el.querySelector('#sopBox');
  if (!sel || !box || box._bound) return;
  box._bound = true;
  const paint = () => {
    const t = sel.value === 'kering' ? 'kering' : 'basah';
    box.innerHTML = sopHtml(t);
  };
  sel.addEventListener('change', paint);
  paint();
}
