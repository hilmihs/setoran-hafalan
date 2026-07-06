// Uji fungsi murni week helpers + ranking disiplin. Jalankan: npm run test-ranking
import { weekStartMonday, weekBounds, formatWeekRangeShort, recentMondays } from '@/lib/week';

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

if (failed) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test lolos');
