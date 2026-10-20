/* Konstanta tampilan — dipertahankan dari versi lama agar data & label identik. */

export const LOCATIONS = [
  { label: 'Kota Madiun', lat: -7.6245, lng: 111.525 },
  { label: 'Caruban', lat: -7.5494, lng: 111.6403 },
  { label: 'Mejayan', lat: -7.5519, lng: 111.4536 },
  { label: 'Balerejo', lat: -7.5483, lng: 111.5597 },
  { label: 'Dagangan', lat: -7.6061, lng: 111.6244 },
  { label: 'Dolopo', lat: -7.7503, lng: 111.55 },
  { label: 'Geger', lat: -7.7225, lng: 111.4683 },
  { label: 'Saradan', lat: -7.5317, lng: 111.335 },
  { label: 'Kartoharjo', lat: -7.6014, lng: 111.4844 },
  { label: 'Taman', lat: -7.6503, lng: 111.5172 },
  { label: 'Wungu', lat: -7.6833, lng: 111.5167 },
  { label: 'Sawahan', lat: -7.5267, lng: 111.4697 },
];

export const JENIS_SAMPAH = ['nasi', 'sayur', 'lauk', 'buah', 'campuran', 'lainnya'];
export const JENIS_LABEL = {
  nasi: 'Nasi', sayur: 'Sayur', lauk: 'Lauk', buah: 'Buah', campuran: 'Campuran',
  lainnya: 'Lainnya', sisa_nasi: 'Sisa Nasi', kulit_buah: 'Kulit/Sisa Buah',
};
export function jenisLabel(j) {
  return JENIS_LABEL[j] || String(j || '').replace(/_/g, ' ');
}

export const JENIS_TPS = [
  ['tps_3r', 'TPS 3R'],
  ['tps_komposter', 'TPS Komposter'],
  ['tps_maggot', 'TPS Maggot/BSSF'],
  ['tps_eco_enzyme', 'TPS Eco Enzyme'],
  ['bank_sampah', 'Bank Sampah'],
  ['lainnya', 'Lainnya'],
];

export const JENIS_PENGOLAHAN = [
  ['komposter', 'Komposter'],
  ['maggot_bsf', 'Maggot BSF'],
  ['eco_enzyme', 'Eco Enzyme'],
  ['bank_sampah', 'Bank Sampah'],
  ['lainnya', 'Lainnya'],
];

export const KATEGORI_DITERIMA = ['sisa_nasi', 'sayur', 'lauk', 'kulit_buah', 'campuran', 'lainnya'];

export const FOOD_TYPE_LABEL = { basah: 'Makanan Basah', kering: 'Makanan Kering' };

/** Batas keyakinan klasifikasi (badge warna). */
export function confLevel(pct) {
  if (pct >= 85) return 'high';
  if (pct >= 60) return 'mid';
  return 'low';
}
export function confBadge(pct) {
  const lvl = confLevel(pct);
  return lvl === 'high' ? 'badge-success' : lvl === 'mid' ? 'badge-warning' : 'badge-danger';
}
