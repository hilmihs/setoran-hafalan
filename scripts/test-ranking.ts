// Uji fungsi murni week helpers + ranking disiplin. Jalankan: npm run test-ranking
import { weekStartMonday, weekBounds, formatWeekRangeShort, recentMondays } from '@/lib/week';
import { rankFromAggregates, type DisiplinAgg } from '@/lib/hits-ranking';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// --- week helpers (anchor 2026-06-01 Senin; 2026-07-06 juga Senin) ---
const asDate = (iso: string) => new Date(`${iso}T05:00:00Z`); // ~12:00 WIB, aman dari batas hari
eq(weekStartMonday(asDate('2026-07-06')), '2026-07-06', 'Senin -> Senin itu sendiri');
eq(weekStartMonday(asDate('2026-07-08')), '2026-07-06', 'Rabu -> Senin minggu ini');
eq(weekStartMonday(asDate('2026-07-12')), '2026-07-06', 'Minggu -> Senin minggu ini');
eq(weekStartMonday(asDate('2026-07-13')), '2026-07-13', 'Senin berikut -> dirinya');
eq(weekBounds('2026-07-06'), { start: '2026-07-06', end: '2026-07-13' }, 'weekBounds end = Senin+7');
eq(formatWeekRangeShort('2026-07-06'), '6 Jul–12 Jul', 'range dalam bulan');
eq(formatWeekRangeShort('2026-06-29'), '29 Jun–5 Jul', 'range lintas bulan');
const rm = recentMondays(3);
eq(rm.length, 3, 'recentMondays panjang 3');
eq(rm[0], weekStartMonday(), 'recentMondays[0] = minggu ini');
{
  const [y, m, d] = rm[0].split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 7);
  const prev = base.toISOString().slice(0, 10);
  eq(rm[1], prev, 'recentMondays[1] = minggu lalu (−7 hari)');
}

// --- rankFromAggregates ---
const A = (id: string, nama: string, kbbs: number, nonLibur: number, hutang: number): DisiplinAgg =>
  ({ pengajarId: id, pengajarNama: nama, gender: null, halaqahCount: 1, kbbs, nonLibur, hutangSaldo: hutang });

// A 100%, B 95% h0, C 95% h30 (seri KBBS, hutang > B -> di bawah B), D no-data
const ranked = rankFromAggregates([
  A('c', 'C', 19, 20, 30),
  A('a', 'A', 10, 10, 0),
  A('d', 'D', 0, 0, 0),
  A('b', 'B', 19, 20, 0),
]);
eq(ranked.map((r) => [r.pengajarId, r.pctKbbs, r.rank]),
   [['a', 100, 1], ['b', 95, 2], ['c', 95, 3], ['d', null, null]],
   'rank: %KBBS desc, hutang tiebreak, no-data tanpa rank');

// tiebreak nama: dua identik (%+hutang) -> alfabet
const tie = rankFromAggregates([A('z', 'Zaid', 8, 10, 0), A('y', 'Amir', 8, 10, 0)]);
eq(tie.map((r) => r.pengajarNama), ['Amir', 'Zaid'], 'seri penuh -> urut nama');

// agregat: fungsi murni terima nilai sudah dijumlah (uji pembagian pct)
eq(rankFromAggregates([A('x', 'X', 17, 20, 0)])[0].pctKbbs, 85, 'pctKbbs 17/20 -> 85 (dibulatkan)');

if (failed) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test lolos');
