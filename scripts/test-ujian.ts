/**
 * test-ujian.ts — aturan murni ujian hafalan 2in1 (src/lib/ujian.ts):
 * warna predikat, pemilihan periode default, perkiraan +3 bulan, validasi
 * jadwal, dan status peserta. Tanpa DB.
 *
 * Jalankan: npm run test-ujian
 */
import {
  PREDIKAT_WARNA,
  formatRentang,
  isPredikat,
  perkiraanBerikutnya,
  pilihPeriode,
  statusPeriode,
  statusUjianPeserta,
  todayJakarta,
  validasiPeriode,
} from '../src/lib/ujian';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

console.log('# predikat');
check('mumtaz hijau', PREDIKAT_WARNA.mumtaz === 'hijau');
check('jayyid kuning', PREDIKAT_WARNA.jayyid === 'kuning');
check('maqbul & dhaif merah', PREDIKAT_WARNA.maqbul === 'merah' && PREDIKAT_WARNA.dhaif === 'merah');
check('isPredikat tolak warna', !isPredikat('hijau') && isPredikat('dhaif'));

console.log('# status periode (rentang inklusif)');
const sep = { id: 'sep', mulai: '2026-09-21', selesai: '2026-09-27' };
check('sehari sebelum = akan', statusPeriode(sep, '2026-09-20') === 'akan');
check('hari pertama = berlangsung', statusPeriode(sep, '2026-09-21') === 'berlangsung');
check('hari terakhir = berlangsung', statusPeriode(sep, '2026-09-27') === 'berlangsung');
check('sehari sesudah = selesai', statusPeriode(sep, '2026-09-28') === 'selesai');

console.log('# pilih periode');
const des = { id: 'des', mulai: '2026-12-21', selesai: '2026-12-27' };
check('kosong → null', pilihPeriode([], '2026-09-17') === null);
check('hanya ada yang akan datang → itu', pilihPeriode([sep], '2026-09-17')?.id === 'sep');
check('sedang berlangsung menang', pilihPeriode([des, sep], '2026-09-24')?.id === 'sep');
check('setelah selesai, jauh dari berikutnya → periode lalu', pilihPeriode([sep, des], '2026-10-15')?.id === 'sep');
check('≤14 hari sebelum berikutnya → berikutnya', pilihPeriode([sep, des], '2026-12-07')?.id === 'des');
check('15 hari sebelum → masih periode lalu', pilihPeriode([sep, des], '2026-12-06')?.id === 'sep');

console.log('# perkiraan berikutnya (+3 bulan, panjang sama)');
const nx = perkiraanBerikutnya(sep);
check('21–27 Sep → 21–27 Des', nx.mulai === '2026-12-21' && nx.selesai === '2026-12-27', JSON.stringify(nx));
const akhirBulan = perkiraanBerikutnya({ mulai: '2026-11-30', selesai: '2026-12-06' });
check('30 Nov → 28 Feb (dijepit), panjang 6 hari', akhirBulan.mulai === '2027-02-28' && akhirBulan.selesai === '2027-03-06', JSON.stringify(akhirBulan));
check('lintas tahun', perkiraanBerikutnya(des).mulai === '2027-03-21');

console.log('# validasi jadwal');
check('valid', validasiPeriode({ nama: 'Ujian', mulai: '2026-09-21', selesai: '2026-09-27' }) === null);
check('nama kosong', validasiPeriode({ nama: ' ', mulai: '2026-09-21', selesai: '2026-09-27' }) !== null);
check('selesai < mulai', validasiPeriode({ nama: 'x', mulai: '2026-09-27', selesai: '2026-09-21' }) !== null);
check('tanggal kalender palsu', validasiPeriode({ nama: 'x', mulai: '2026-02-30', selesai: '2026-03-02' }) !== null);
check('terlalu panjang', validasiPeriode({ nama: 'x', mulai: '2026-01-01', selesai: '2026-06-01' }) !== null);

console.log('# status peserta');
check('tanpa baris = belum', statusUjianPeserta(null) === 'belum');
check('draft (hanya alasan) = belum', statusUjianPeserta({ status: 'draft' }) === 'belum');
check('submitted = menunggu', statusUjianPeserta({ status: 'submitted' }) === 'menunggu');
check('checked = dinilai', statusUjianPeserta({ status: 'checked' }) === 'dinilai');

console.log('# format');
check('satu bulan', formatRentang('2026-09-21', '2026-09-27') === '21–27 Sep 2026', formatRentang('2026-09-21', '2026-09-27'));
check('lintas bulan', formatRentang('2026-09-28', '2026-10-04') === '28 Sep – 4 Okt 2026', formatRentang('2026-09-28', '2026-10-04'));
check('todayJakarta pakai zona WIB', todayJakarta(new Date('2026-09-20T18:00:00Z')) === '2026-09-21');

console.log(`\n${passed} lulus, ${failed} gagal`);
if (failed) process.exit(1);
