// Uji fungsi murni week helpers + ranking disiplin. Jalankan: npm run test-ranking
import { weekStartMonday, weekBounds, formatWeekRangeShort, recentMondays } from '@/lib/week';
import { rankFromAggregates, type DisiplinAgg } from '@/lib/hits-ranking';
import {
  parseRekapFilter,
  filterQuery,
  filterAktif,
  filterLabel,
  isBermasalah,
  isObsLengkap,
  FILTER_NETRAL,
} from '@/lib/hits-koordinator-rekap';
import type { CakupanPengajar } from '@/lib/hits-observasi-cakupan';

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
// onTimeBaik/onTimeTotal = ketepatan jam (penyebut TANPA pertemuan JKG/BADAL),
// stabilBaik/stabilTotal = pertemuan yang tak dipindah, atas semua pertemuan.
const A = (
  id: string, nama: string,
  onTimeBaik: number, onTimeTotal: number,
  stabilBaik: number, stabilTotal: number,
  hutang: number
): DisiplinAgg =>
  ({ pengajarId: id, pengajarNama: nama, gender: null, halaqahCount: 1, halaqahIds: [id],
     kbbs: onTimeBaik, nonLibur: stabilTotal, kmt: 0, kbla: 0, jkg: 0, tidakLatihan: 0,
     onTimeBaik, onTimeTotal, stabilBaik, stabilTotal, hutangSaldo: hutang });

// A 100%, B 95% h0, C 95% h30 (seri on-time & stabil, hutang > B -> di bawah B), D no-data
const ranked = rankFromAggregates([
  A('c', 'C', 19, 20, 20, 20, 30),
  A('a', 'A', 10, 10, 10, 10, 0),
  A('d', 'D', 0, 0, 0, 0, 0),
  A('b', 'B', 19, 20, 20, 20, 0),
]);
eq(ranked.map((r) => [r.pengajarId, r.pctOnTime, r.rank]),
   [['a', 100, 1], ['b', 95, 2], ['c', 95, 3], ['d', null, null]],
   'rank: %on-time desc, hutang tiebreak, no-data tanpa rank');

// %on-time seri -> %stabilitas yang membedakan (X sering pindah jadwal)
const stabil = rankFromAggregates([
  A('x', 'X', 10, 10, 12, 20, 0), // on-time 100%, stabil 60%
  A('w', 'W', 10, 10, 19, 20, 0), // on-time 100%, stabil 95%
]);
eq(stabil.map((r) => [r.pengajarId, r.pctStabil, r.rank]),
   [['w', 95, 1], ['x', 60, 2]],
   'seri %on-time -> %stabilitas jadi pemecah');

// Semua pertemuan dipindah: on-time tak bisa dinilai (null) tapi datanya ADA.
// Harus tetap dapat rank, di bawah yang ber-data, di atas yang tanpa data.
const semuaDipindah = rankFromAggregates([
  A('p', 'P', 0, 0, 0, 3, 0),  // 3 pertemuan, semua JKG/BADAL
  A('q', 'Q', 5, 10, 10, 10, 0), // on-time 50%
  A('r', 'R', 0, 0, 0, 0, 0),  // benar-benar tanpa data
]);
eq(semuaDipindah.map((r) => [r.pengajarId, r.pctOnTime, r.pctStabil, r.rank]),
   [['q', 50, 100, 1], ['p', null, 0, 2], ['r', null, null, null]],
   'semua pertemuan dipindah -> tetap dapat rank, di bawah yang ber-data');

// tiebreak nama: dua identik (%+hutang) -> alfabet
const tie = rankFromAggregates([A('z', 'Zaid', 8, 10, 10, 10, 0), A('y', 'Amir', 8, 10, 10, 10, 0)]);
eq(tie.map((r) => r.pengajarNama), ['Amir', 'Zaid'], 'seri penuh -> urut nama');

// agregat: fungsi murni terima nilai sudah dijumlah (uji pembagian pct)
eq(rankFromAggregates([A('x', 'X', 17, 20, 20, 20, 0)])[0].pctOnTime, 85, 'pctOnTime 17/20 -> 85 (dibulatkan)');

// --- filter rekap koordinator (chip Bermasalah + kelengkapan observasi) ---
const bersih = rankFromAggregates([A('n', 'Nihil', 10, 10, 10, 10, 0)])[0];
eq(isBermasalah(bersih), false, 'tanpa insiden -> tidak bermasalah');
eq(isBermasalah({ ...bersih, kmt: 1 }), true, 'KMT 1 -> bermasalah');
eq(isBermasalah({ ...bersih, tidakLatihan: 2 }), true, 'TL saja tetap bermasalah');
eq(isBermasalah({ ...bersih, hutangSaldo: 120 }), false, 'hutang menit bukan penanda insiden periode ini');

const cak = (sudah: number, belum: number): CakupanPengajar => ({
  pengajarId: 'x', pertemuan: [], sudah, belum, total: sudah + belum,
  persen: sudah + belum > 0 ? Math.round((sudah / (sudah + belum)) * 100) : null,
});
eq(isObsLengkap(cak(4, 0)), true, '4 dari 4 terobservasi -> lengkap');
eq(isObsLengkap(cak(3, 1)), false, 'sisa 1 belum -> belum lengkap');
eq(isObsLengkap(cak(0, 0)), false, 'nol pertemuan -> belum lengkap (bukan lengkap)');
eq(isObsLengkap(undefined), false, 'tanpa cakupan (blok belum ada data) -> belum lengkap');

eq(parseRekapFilter({}), FILTER_NETRAL, 'query kosong -> filter netral');
eq(parseRekapFilter({ masalah: '1', obs: 'belum' }), { masalah: true, obs: 'belum' }, 'parse dua filter');
eq(parseRekapFilter({ masalah: '0', obs: 'ngawur' }), FILTER_NETRAL, 'nilai asing jatuh ke netral');
eq(filterQuery(FILTER_NETRAL), '', 'filter netral tak menambah querystring');
eq(filterQuery({ masalah: true, obs: 'lengkap' }), '&masalah=1&obs=lengkap', 'querystring dua filter');
eq(parseRekapFilter({ masalah: '1', obs: 'lengkap' }), { masalah: true, obs: 'lengkap' }, 'parse(filterQuery(x)) konsisten');
eq(filterAktif(FILTER_NETRAL), false, 'netral = tidak aktif');
eq(filterAktif({ masalah: false, obs: 'belum' }), true, 'obs saja sudah dianggap aktif');
eq(filterLabel(FILTER_NETRAL), null, 'label netral null');
eq(filterLabel({ masalah: true, obs: 'belum' }), 'bermasalah · observasi belum lengkap', 'label kombinasi');

if (failed) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test lolos');
