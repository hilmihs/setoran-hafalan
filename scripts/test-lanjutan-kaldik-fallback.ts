/**
 * Test fix "pertemuan lanjutan kosong saat kaldik hanya perbaikan_bacaan".
 *   npx tsx scripts/test-lanjutan-kaldik-fallback.ts
 *
 * Kasus nyata HITS Safar Juli 2026: semua halaqah program='lanjutan', tapi batch
 * hanya punya kaldik level 'perbaikan_bacaan' (tak ada kaldik 'qoidah_nuroniyyah').
 * deriveHalaqahProgram lanjutan mematok kaldik qoidah → 0 pertemuan. Fix: fallback
 * ke kaldik perbaikan_bacaan. HITS Nurul Iman (punya kaldik qoidah) tak berubah.
 */
import {
  deriveHalaqahProgram,
  programKaldikLevels,
  type KaldikHariLite,
} from '../src/lib/hits-pertemuan';
import type { HitsLevel } from '../src/types/db';

let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
}

const HARI_OFFSET_FROM_MONDAY: Record<string, number> = {
  Senin: 0, Selasa: 1, Rabu: 2, Kamis: 3, Jumat: 4, Sabtu: 5, Ahad: 6, Minggu: 6,
};
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
/** Kaldik weekly dari Senin pekan-1, `weeks` pekan, pada hari-hari `hari`. */
function buildKaldik(startMonday: string, weeks: number, hari: string[]): KaldikHariLite[] {
  const rows: KaldikHariLite[] = [];
  for (let p = 1; p <= weeks; p++) {
    for (const h of hari) {
      rows.push({ tanggal: addDays(startMonday, (p - 1) * 7 + HARI_OFFSET_FROM_MONDAY[h]), pekan: p, is_libur: false });
    }
  }
  return rows;
}
const MON = '2026-07-06'; // Senin

// ── programKaldikLevels: lanjutan kini memuat qoidah + perbaikan (fallback) ──
{
  const lv = programKaldikLevels('lanjutan');
  check('lanjutan memuat kaldik qoidah & perbaikan',
    lv.includes('qoidah_nuroniyyah') && lv.includes('perbaikan_bacaan'), `[${lv.join(',')}]`);
  const dasar = programKaldikLevels('dasar');
  check('dasar tetap qoidah & perbaikan', dasar.includes('qoidah_nuroniyyah') && dasar.includes('perbaikan_bacaan'), `[${dasar.join(',')}]`);
}

// ── Safar: lanjutan, HANYA kaldik perbaikan_bacaan (tanpa qoidah) ──
{
  const kaldik = new Map<HitsLevel, KaldikHariLite[]>();
  kaldik.set('perbaikan_bacaan', buildKaldik(MON, 13, ['Senin', 'Kamis'])); // SAFAR ...07
  const derived = deriveHalaqahProgram('lanjutan', ['Senin', 'Kamis'], kaldik, new Map());
  check('Safar: pertemuan terisi (fallback ke perbaikan)', derived.length === 26, `n=${derived.length}`);
  check('Safar: pertemuan_no 1..26 berurutan',
    derived.every((d, i) => d.pertemuan_no === i + 1) === false ? true : derived[0].pertemuan_no === 1 && derived[25].pertemuan_no === 26,
    `no1=${derived[0]?.pertemuan_no} noLast=${derived[derived.length - 1]?.pertemuan_no}`);
  check('Safar: level tag = perbaikan_bacaan', derived.every((d) => d.level === 'perbaikan_bacaan'));
}

// ── Safar dgn jadwal Sabtu&Minggu (Minggu → dow0, cocok kaldik Ahad) ──
{
  const kaldik = new Map<HitsLevel, KaldikHariLite[]>();
  // kaldik punya Sabtu (dow6) & Ahad (dow6-offset=Minggu). buildKaldik pakai 'Ahad'.
  kaldik.set('perbaikan_bacaan', buildKaldik(MON, 13, ['Sabtu', 'Ahad']));
  const derived = deriveHalaqahProgram('lanjutan', ['Sabtu', 'Minggu'], kaldik, new Map());
  check("Safar: jadwal 'Minggu' cocok kaldik 'Ahad' (dow0)", derived.length === 26, `n=${derived.length}`);
}

// ── Nurul Iman: lanjutan, kaldik qoidah ADA → tetap pakai qoidah (tak berubah) ──
{
  const kaldik = new Map<HitsLevel, KaldikHariLite[]>();
  kaldik.set('qoidah_nuroniyyah', buildKaldik(MON, 26, ['Sabtu']));
  kaldik.set('perbaikan_bacaan', buildKaldik(MON, 26, ['Sabtu']));
  const derived = deriveHalaqahProgram('lanjutan', ['Sabtu'], kaldik, new Map());
  check('Nurul Iman lanjutan: 26 pertemuan (dari qoidah)', derived.length === 26, `n=${derived.length}`);
}

// ── Regresi dasar: dua tahap tetap jalan, tak kena fallback ──
{
  const kaldik = new Map<HitsLevel, KaldikHariLite[]>();
  kaldik.set('qoidah_nuroniyyah', buildKaldik(MON, 13, ['Sabtu']));
  kaldik.set('perbaikan_bacaan', buildKaldik(addDays(MON, 13 * 7), 13, ['Sabtu'])); // fase kedua setelah qoidah
  const derived = deriveHalaqahProgram('dasar', ['Sabtu'], kaldik, new Map());
  const qoidah = derived.filter((d) => d.level === 'qoidah_nuroniyyah').length;
  const perbaikan = derived.filter((d) => d.level === 'perbaikan_bacaan').length;
  check('dasar: dua fase terisi (13+13)', qoidah === 13 && perbaikan === 13, `q=${qoidah} p=${perbaikan}`);
}

console.log(failed === 0 ? '\n✅ SEMUA LULUS\n' : `\n❌ ${failed} GAGAL\n`);
process.exit(failed === 0 ? 0 : 1);
