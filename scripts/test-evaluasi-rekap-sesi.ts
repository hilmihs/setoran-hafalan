// Uji fungsi murni Rekap Sesi: penyusunan tabel satu sesi dan labelnya.
// Jalankan: npm run test-evaluasi-rekap-sesi
import { susunRekapSesi, labelSesi, labelPendek } from '@/lib/evaluasi-rekap-sesi';
import { emptyCounts } from '@/lib/evaluasi';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

const peserta = [
  { id: 'a', nama: 'Ahmad' },
  { id: 'b', nama: 'Budi' },
  { id: 'c', nama: 'Citra' },
  { id: 'd', nama: 'Dewi' },
];
const nilai = {
  // 1 jaliy (huruf) + 2 khafiy (izhar, iqlab) → 100 − 6 − 4 = 90
  a: { counts: { ...emptyCounts(), huruf: 1, izhar: 1, iqlab: 1 }, hadir: true, done: true, catatan: ' bagus ' },
  // 6 jaliy → 100 − 36 = 64 (di bawah ambang 70)
  b: { counts: { ...emptyCounts(), mad: 6 }, hadir: true, done: true, catatan: '' },
  // absen: counts diabaikan, tak masuk rata-rata maupun total
  c: { counts: { ...emptyCounts(), huruf: 9 }, hadir: false, done: false, catatan: '' },
  // 'd' tidak punya baris nilai → hadir tapi belum dinilai
};

const r = susunRekapSesi(peserta, nilai);
eq(r.baris.map((b) => [b.id, b.status, b.skor, b.jaliy, b.khafiy]),
  [['a', 'hadir', 90, 1, 2], ['b', 'hadir', 64, 6, 0], ['c', 'absen', null, 9, 0], ['d', 'belum', null, 0, 0]],
  'status & skor per baris');
eq(r.baris[0].tier, 'Mumtaz', 'tier dari skor 90');
eq(r.baris[0].catatan, 'bagus', 'catatan dipangkas');
eq([r.dinilai, r.absen, r.belum], [2, 1, 1], 'hitung dinilai/absen/belum');
eq(r.rata, 77, 'rata hanya dari yang dinilai: (90+64)/2 = 77');
eq([r.standar, r.bawah], [1, 1], 'standar/bawah pada ambang 70');
eq([r.totalCounts.huruf, r.totalCounts.mad, r.totalCounts.izhar], [1, 6, 1], 'total kesalahan tak memasukkan peserta absen');

// Map juga diterima.
const r2 = susunRekapSesi(peserta.slice(0, 1), new Map([['a', nilai.a]]));
eq(r2.rata, 90, 'input Map');

// Tanpa nilai sama sekali.
const r3 = susunRekapSesi(peserta, {});
eq([r3.rata, r3.dinilai, r3.belum], [null, 0, 4], 'tanpa nilai: rata null, semua belum');

// Ambang khusus (ujian 65).
const r4 = susunRekapSesi(peserta, nilai, 65);
eq([r4.standar, r4.bawah], [1, 1], 'ambang 65: 64 tetap di bawah');

// Label sesi.
const nama = (t: 'qn' | 'pb') => (t === 'qn' ? 'Evaluasi QN' : 'Evaluasi PB');
eq(labelSesi('qn', 2, nama), 'Evaluasi QN — Sesi 2', 'label sesi berkala');
eq(labelSesi('ujian', 1, nama), 'Ujian Evaluasi QN', 'label ujian QN');
eq(labelSesi('ujian', 2, nama), 'Ujian Evaluasi PB', 'label ujian PB');
eq(labelSesi('ujian', 3, nama), 'Ujian 3', 'label ujian di luar 1/2');
eq(labelPendek('JK. Idgham Mimi & Ghunnah'), 'Idgham Mimi & Ghunnah', 'label pendek buang awalan');

if (failed) { console.error(`\n${failed} gagal`); process.exit(1); }
console.log('\nsemua lolos');
