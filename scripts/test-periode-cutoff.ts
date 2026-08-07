/**
 * test-periode-cutoff.ts — kunci pengisian presensi tanggal 28.
 * Semua fungsinya murni, jadi "hari ini" disuntikkan sebagai argumen dan
 * perilaku di batas periode bisa diperiksa tanpa menunggu kalender.
 *
 * Jalankan: npm run test-cutoff
 */
import {
  batasAwalPengisian,
  periodeBerjalan,
  periodeEndDate,
  periodeMonthOf,
  periodeStartDate,
  presensiTerbuka,
} from '../src/lib/periode-laporan';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

// ── window 28–27 ──
check('27 Agu masih periode Agustus', periodeMonthOf('2026-08-27') === '2026-08');
check('28 Agu sudah periode September', periodeMonthOf('2026-08-28') === '2026-09');
check('31 Des menyeberang tahun', periodeMonthOf('2026-12-31') === '2027-01', periodeMonthOf('2026-12-31'));
check('1 Jan masih periode Januari', periodeMonthOf('2027-01-01') === '2027-01');

check('periode Agu mulai 28 Jul', periodeStartDate('2026-08') === '2026-07-28');
check('periode Jan mulai 28 Des thn lalu', periodeStartDate('2027-01') === '2026-12-28');
check('periode Agu berakhir 27 Agu', periodeEndDate('2026-08') === '2026-08-27');

// ── kunci ──
// Hari ini 27 Agu: periode berjalan Agustus (28 Jul – 27 Agu).
{
  const hariIni = '2026-08-27';
  check('27 Agu: periode berjalan Agustus', periodeBerjalan(hariIni) === '2026-08');
  check('27 Agu: batas awal 28 Jul', batasAwalPengisian(hariIni) === '2026-07-28');
  check('27 Agu: sesi 5 Agu MASIH terbuka', presensiTerbuka('2026-08-05', hariIni));
  check('27 Agu: sesi 28 Jul MASIH terbuka', presensiTerbuka('2026-07-28', hariIni));
  check('27 Agu: sesi 27 Jul sudah terkunci', !presensiTerbuka('2026-07-27', hariIni));
  check('27 Agu: sesi hari ini terbuka', presensiTerbuka(hariIni, hariIni));
}

// Hari ini 28 Agu: kunci jatuh — seluruh periode Agustus tertutup.
{
  const hariIni = '2026-08-28';
  check('28 Agu: periode berjalan pindah ke September', periodeBerjalan(hariIni) === '2026-09');
  check('28 Agu: batas awal jadi 28 Agu', batasAwalPengisian(hariIni) === '2026-08-28');
  check('28 Agu: sesi 5 Agu TERKUNCI', !presensiTerbuka('2026-08-05', hariIni));
  check('28 Agu: sesi 27 Agu TERKUNCI', !presensiTerbuka('2026-08-27', hariIni));
  check('28 Agu: sesi hari ini terbuka', presensiTerbuka(hariIni, hariIni));
  check('28 Agu: sesi 3 Sep (nanti) terbuka', presensiTerbuka('2026-09-03', hariIni));
}

// Pergantian tahun tak boleh bikin kunci salah buka.
{
  const hariIni = '2027-01-05';
  check('5 Jan: periode berjalan Januari', periodeBerjalan(hariIni) === '2027-01');
  check('5 Jan: sesi 29 Des terbuka', presensiTerbuka('2026-12-29', hariIni));
  check('5 Jan: sesi 27 Des terkunci', !presensiTerbuka('2026-12-27', hariIni));
}

console.log(`\n${passed} lulus, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
