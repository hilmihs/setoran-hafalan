// Uji fungsi murni Evaluasi Halaqah: taksonomi Lahn, skor, tier, ambang.
// Jalankan: npm run test-evaluasi
import {
  JALIY, KHAFIY, ALL_LAHN, LAHN_BY_KEY, emptyCounts,
  scoreOf, tierOf, AMBANG, columnFor,
  buildTrackGeometry,
} from '@/lib/evaluasi';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

eq(JALIY.length, 4, 'jaliy count');
eq(KHAFIY.length, 7, 'khafiy count');
eq(ALL_LAHN.length, 11, 'all lahn count');
eq(LAHN_BY_KEY.mad.group, 'jaliy', 'lookup group');
eq(columnFor('idghammimi'), 'kh_idgham_mimi', 'column mapping');

const c = { ...emptyCounts(), huruf: 1, idghambighunnah: 3, ikhfahakiki: 2, iqlab: 1, ikhfasyafawi: 2 };
eq(scoreOf(c), { skor: 78, jaliyCount: 1, khafiyCount: 8 }, 'scoreOf sample');
eq(scoreOf(emptyCounts()), { skor: 100, jaliyCount: 0, khafiyCount: 0 }, 'perfect');
eq(scoreOf({ ...emptyCounts(), huruf: 17 }).skor, 0, 'floor at zero');

eq(tierOf(95).label, 'Mumtaz', 'tier mumtaz');
eq(tierOf(70).label, 'Standar', 'tier standar boundary');
eq(tierOf(69).label, 'Cukup — di bawah standar', 'tier cukup');
eq(tierOf(10).label, 'Perlu pengulangan', 'tier ulang');
eq(AMBANG, 70, 'ambang const');

// --- Rapor trend-chart geometry ---
const empty = buildTrackGeometry([null, null, null, null]);
eq(empty.avg, null, 'geometry kosong: avg null');
eq(empty.points, '', 'geometry kosong: points kosong');
eq(empty.trend, 0, 'geometry kosong: trend 0');
eq(empty.sessions.map((x) => x.filled), [false, false, false, false], 'geometry kosong: semua unfilled');

const g = buildTrackGeometry([74, 79, 86, null]);
eq(g.sessions.filter((x) => x.filled).length, 3, 'geometry 3 filled');
eq(g.avg, 80, 'geometry avg 80 (round 79.667)');
eq(g.trend, 7, 'geometry trend 7');
eq(g.sessions[3].filled, false, 'geometry sesi ke-4 unfilled');
eq(g.points, '16,29.7 92,26.3 168,21.5', 'geometry points 3 titik');

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll evaluasi tests passed.');
