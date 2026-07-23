/**
 * Test derivasi pertemuan (pure, tanpa DB).
 *   npx tsx scripts/test-derive-pertemuan.ts
 *
 * Membuktikan:
 *  1. Backward-compat: untuk jadwal 2 hari/pekan, generalisasi baru menghasilkan
 *     pertemuan_no IDENTIK dengan rumus lama (2*pekan-1 / 2*pekan) — termasuk saat
 *     ada pekan libur (gap) dan saat pekan > 13.
 *  2. Fix baru: untuk jadwal 1 hari/pekan (mis. HITS Nurul Iman / ABK), pertemuan_no
 *     jadi berurutan 1..N (bukan hanya ganjil), sepanjang berapa pun pekan.
 */
import { deriveHalaqahPertemuan, type KaldikHariLite } from '../src/lib/hits-pertemuan';

const HARI_OFFSET_FROM_MONDAY: Record<string, number> = {
  Senin: 0, Selasa: 1, Rabu: 2, Kamis: 3, Jumat: 4, Sabtu: 5, Ahad: 6,
};
const NAME_TO_UTCDAY: Record<string, number> = {
  Ahad: 0, Senin: 1, Selasa: 2, Rabu: 3, Kamis: 4, Jumat: 5, Sabtu: 6,
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function utcDay(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

/** Bangun kaldik (batch+level) dari Senin pekan-1, `weeks` pekan, pada hari-hari `hari`. */
function buildKaldik(startMonday: string, weeks: number, hari: string[], liburDates: string[] = []): KaldikHariLite[] {
  const rows: KaldikHariLite[] = [];
  for (let p = 1; p <= weeks; p++) {
    for (const h of hari) {
      const tanggal = addDays(startMonday, (p - 1) * 7 + HARI_OFFSET_FROM_MONDAY[h]);
      rows.push({ tanggal, pekan: p, is_libur: liburDates.includes(tanggal) });
    }
  }
  return rows;
}

/** Rumus LAMA (referensi) — 2 pertemuan/pekan: sorted[0]=2*pekan-1, sorted[1]=2*pekan. */
function deriveOld(jadwalHari: string[], kaldik: KaldikHariLite[]) {
  const wanted = new Set(jadwalHari.map((h) => NAME_TO_UTCDAY[h]));
  const byPekan = new Map<number, string[]>();
  for (const row of kaldik) {
    if (row.pekan == null || row.is_libur) continue;
    if (!wanted.has(utcDay(row.tanggal))) continue;
    (byPekan.get(row.pekan) ?? byPekan.set(row.pekan, []).get(row.pekan)!).push(row.tanggal);
  }
  const out: { pertemuan_no: number; tanggal: string; pekan: number }[] = [];
  for (const [pekan, dates] of [...byPekan.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...new Set(dates)].sort();
    if (sorted[0]) out.push({ pertemuan_no: 2 * pekan - 1, tanggal: sorted[0], pekan });
    if (sorted[1]) out.push({ pertemuan_no: 2 * pekan, tanggal: sorted[1], pekan });
  }
  return out;
}

const key = (d: { pertemuan_no: number; tanggal: string }) => `${d.pertemuan_no}@${d.tanggal}`;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
}
function sameSeq(a: { pertemuan_no: number; tanggal: string }[], b: { pertemuan_no: number; tanggal: string }[]) {
  return a.length === b.length && a.every((x, i) => key(x) === key(b[i]));
}

const MON = '2026-07-06'; // Senin

// ── Case A: 2 hari/pekan, 13 pekan (batch lama standar) ──
{
  const kaldik = buildKaldik(MON, 13, ['Sabtu', 'Ahad']);
  const neu = deriveHalaqahPertemuan(['Sabtu', 'Ahad'], kaldik);
  const old = deriveOld(['Sabtu', 'Ahad'], kaldik);
  check('A. 2 hari/13 pekan = identik rumus lama', sameSeq(neu, old), `${neu.length} pertemuan`);
  check('A. jumlah pertemuan 26', neu.length === 26);
  check('A. berurutan 1..26', neu.every((d, i) => d.pertemuan_no === i + 1));
}

// ── Case B: 2 hari/pekan dengan 1 hari libur (gap) ──
{
  const libur = [addDays(MON, 1 * 7 + HARI_OFFSET_FROM_MONDAY['Ahad'])]; // Ahad pekan-2 libur
  const kaldik = buildKaldik(MON, 5, ['Sabtu', 'Ahad'], libur);
  const neu = deriveHalaqahPertemuan(['Sabtu', 'Ahad'], kaldik);
  const old = deriveOld(['Sabtu', 'Ahad'], kaldik);
  check('B. gap libur = identik rumus lama', sameSeq(neu, old), `no=[${neu.map((d) => d.pertemuan_no).join(',')}]`);
  // pekan-2 hanya Sabtu -> pertemuan 3 ada, 4 tidak.
  check('B. pertemuan 4 hilang (gap dipertahankan)', !neu.some((d) => d.pertemuan_no === 4));
}

// ── Case C: 2 hari/pekan, 20 pekan (> 13, cek pekan besar tetap identik) ──
{
  const kaldik = buildKaldik(MON, 20, ['Senin', 'Rabu']);
  const neu = deriveHalaqahPertemuan(['Senin', 'Rabu'], kaldik);
  const old = deriveOld(['Senin', 'Rabu'], kaldik);
  check('C. 2 hari/20 pekan = identik rumus lama (pekan > 13)', sameSeq(neu, old), `${neu.length} pertemuan`);
  check('C. berurutan 1..40', neu.length === 40 && neu.every((d, i) => d.pertemuan_no === i + 1));
}

// ── Case D: 1 hari/pekan, 26 pekan (HITS Nurul Iman — kasus fix) ──
{
  const kaldik = buildKaldik(MON, 26, ['Sabtu']);
  const neu = deriveHalaqahPertemuan(['Sabtu'], kaldik);
  const old = deriveOld(['Sabtu'], kaldik);
  check('D. 1 hari/26 pekan berurutan 1..26', neu.length === 26 && neu.every((d, i) => d.pertemuan_no === i + 1), `no=[${neu.slice(0, 4).map((d) => d.pertemuan_no).join(',')}...]`);
  check('D. beda dari rumus lama (lama = ganjil 1,3,5..)', !sameSeq(neu, old), `lama no=[${old.slice(0, 4).map((d) => d.pertemuan_no).join(',')}...]`);
  check('D. tanggal pertemuan 1 = Sabtu pekan-1', neu[0].tanggal === addDays(MON, 5));
}

// ── Case E: 1 hari/pekan, 28 pekan (HITS ABK — dulu langgar CHECK 13) ──
{
  const kaldik = buildKaldik(MON, 28, ['Jumat']);
  const neu = deriveHalaqahPertemuan(['Jumat'], kaldik);
  check('E. 1 hari/28 pekan berurutan 1..28', neu.length === 28 && neu.every((d, i) => d.pertemuan_no === i + 1));
}

console.log(failed === 0 ? '\n✅ SEMUA LULUS\n' : `\n❌ ${failed} GAGAL\n`);
process.exit(failed === 0 ? 0 : 1);
