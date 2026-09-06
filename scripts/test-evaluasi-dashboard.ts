// Uji fungsi murni Dashboard Evaluasi: penyusun opsi penyaring, pemilihan batch
// yang sah, dan urutan grup. Jalankan: npm run test-evaluasi-dashboard
import {
  susunOpsiProgram, susunOpsiBatch, batchTerpakai, idBatchLolos,
  urutkanGrup, pilihNamaTrack, bacaFilter, sesiUntukCakupan, labelCakupan,
  type BarisBatch, type GrupDashboard, type SesiRow,
} from '@/lib/evaluasi-dashboard';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// Cuplikan eval_batch produksi, cukup untuk semua cabang.
const BATCHES: BarisBatch[] = [
  { id: 'dpq', nama: 'DPQ', family: 'dpq', batch_label: null, batch_order: null },
  { id: 'hits-regular', nama: 'HITS Reguler (Batch Juni 2026)', family: 'hits-regular', batch_label: 'Juni 2026', batch_order: 3 },
  { id: 'hits-regular-apr', nama: 'HITS Reguler (Batch April 2026)', family: 'hits-regular', batch_label: 'April 2026', batch_order: 2 },
  { id: 'hits-regular-jan', nama: 'HITS Reguler (Batch Januari 2026)', family: 'hits-regular', batch_label: 'Januari 2026', batch_order: 1 },
  { id: 'hits-safar', nama: 'HITS Safar', family: 'hits-safar', batch_label: 'Juli 2026', batch_order: 2 },
  { id: 'hits-safar-jan', nama: 'HITS Safar (Batch Januari 2026)', family: 'hits-safar', batch_label: 'Januari 2026', batch_order: 1 },
];

// ── susunOpsiProgram ──
eq(
  susunOpsiProgram(BATCHES),
  [
    { value: 'dpq', label: 'DPQ' },
    { value: 'hits-regular', label: 'HITS Reguler' },
    { value: 'hits-safar', label: 'HITS Safar' },
  ],
  'opsi program: satu baris per family, terurut label'
);
// Label diambil dari anggota ber-order terkecil. "HITS Safar" (order 2) tak
// bersuffix, sedangkan "HITS Safar (Batch Januari 2026)" (order 1) bersuffix —
// hasilnya harus sama-sama "HITS Safar", dan pilihannya deterministik.
eq(
  susunOpsiProgram([BATCHES[4], BATCHES[5]]).map((o) => o.label),
  ['HITS Safar'],
  'label family dari anggota order terkecil'
);
eq(susunOpsiProgram([]), [], 'opsi program dari daftar kosong');

// ── susunOpsiBatch ──
eq(
  susunOpsiBatch(BATCHES, 'hits-regular'),
  [
    { value: 'hits-regular-jan', label: 'Januari 2026' },
    { value: 'hits-regular-apr', label: 'April 2026' },
    { value: 'hits-regular', label: 'Juni 2026' },
  ],
  'opsi batch terurut batch_order'
);
eq(susunOpsiBatch(BATCHES, 'dpq'), [], 'program berangkatan tunggal tak punya dropdown batch');
eq(susunOpsiBatch(BATCHES, ''), [], 'tanpa program terpilih tak ada opsi batch');
// Cadangan saat batch_label kosong harus memakai nama MENTAH. Lewat namaProgram
// suffix "(Batch ...)" terbuang — padahal cuma itu yang membedakan sesama
// anggota family — dan kedua opsi jadi berlabel sama persis.
eq(
  susunOpsiBatch(
    [
      { id: 'x-jan', nama: 'X (Batch Januari 2026)', family: 'x', batch_label: null, batch_order: 1 },
      { id: 'x-jun', nama: 'X (Batch Juni 2026)', family: 'x', batch_label: null, batch_order: 2 },
    ],
    'x'
  ).map((o) => o.label),
  ['X (Batch Januari 2026)', 'X (Batch Juni 2026)'],
  'cadangan label batch tetap membedakan angkatan'
);

// ── batchTerpakai: query-string basi diabaikan ──
eq(batchTerpakai(BATCHES, 'hits-regular', 'hits-regular-apr'), 'hits-regular-apr', 'batch sah dipertahankan');
eq(batchTerpakai(BATCHES, 'dpq', 'hits-regular-apr'), '', 'batch dari program lain dibuang');
// Batch tanpa program adalah penyaring TANPA KENDALI di layar: dropdown batch
// cuma muncul di bawah sebuah program, jadi setelah program dikembalikan ke
// "semua", dropdown itu lenyap sementara ?batch= diam-diam masih menyaring.
eq(batchTerpakai(BATCHES, '', 'hits-regular-apr'), '', 'batch tanpa program dibuang');
eq(batchTerpakai(BATCHES, 'hits-regular', 'tidak-ada'), '', 'batch tak dikenal dibuang');
eq(batchTerpakai(BATCHES, 'hits-regular', ''), '', 'batch kosong tetap kosong');

// ── idBatchLolos ──
eq(idBatchLolos(BATCHES, '', ''), null, 'tanpa penyaring: tak ada pembatasan');
eq(idBatchLolos(BATCHES, 'hits-safar', ''), ['hits-safar', 'hits-safar-jan'], 'saring per program');
eq(idBatchLolos(BATCHES, 'hits-regular', 'hits-regular-apr'), ['hits-regular-apr'], 'saring per batch');
eq(idBatchLolos(BATCHES, '', 'hits-regular-apr'), null, 'batch tanpa program tak menyaring apa pun');
// Batch basi tidak boleh mengosongkan hasil — halaman kosong tanpa sebab itu
// membingungkan; yang benar adalah mundur ke seluruh batch program terpilih.
eq(idBatchLolos(BATCHES, 'dpq', 'hits-regular-apr'), ['dpq'], 'batch basi mundur ke program');
// Program tak dikenal → daftar KOSONG, bukan null. Bedanya menentukan: [] jadi
// sentinel NO_ID dan menghasilkan nol baris, null berarti tak menyaring sama
// sekali. Tertukar, penyaring yang gagal malah menampilkan seluruh data.
eq(idBatchLolos(BATCHES, 'tidak-ada', ''), [], 'program tak dikenal → daftar kosong, bukan null');

// ── urutkanGrup ──
const grup = (programNama: string, batchOrder: number | null, gender: 'ikhwan' | 'akhwat'): GrupDashboard => ({
  programId: 'x', programNama, batchId: null, batchLabel: null, batchOrder: batchOrder,
  gender, halaqah: 0, total: 0, selesai: 0, rata: null, bermasalah: 0,
});
eq(
  urutkanGrup([
    grup('HITS Safar', 2, 'ikhwan'),
    grup('HITS Reguler', 3, 'akhwat'),
    grup('HITS Reguler', 3, 'ikhwan'),
    grup('HITS Reguler', 1, 'ikhwan'),
    grup('DPQ', null, 'ikhwan'),
  ]).map((g) => `${g.programNama}|${g.batchOrder}|${g.gender}`),
  [
    'DPQ|null|ikhwan',
    'HITS Reguler|1|ikhwan',
    'HITS Reguler|3|ikhwan',
    'HITS Reguler|3|akhwat',
    'HITS Safar|2|ikhwan',
  ],
  'urut: program, batch_order, ikhwan sebelum akhwat'
);

// ── pilihNamaTrack ──
const CFG = [
  { gender: 'ikhwan', nama_qn: 'Evaluasi QN' },
  { gender: 'akhwat', nama_qn: 'Evaluasi Qiroah' },
];
eq(pilihNamaTrack(CFG, 'ikhwan'), 'Evaluasi QN', 'track gender tertentu');
eq(pilihNamaTrack(CFG, 'akhwat'), 'Evaluasi Qiroah', 'track gender lain');
// Nama berbeda antar gender: label gabungan harus netral, bukan memihak salah satu.
eq(pilihNamaTrack(CFG, 'semua'), 'Evaluasi', 'nama berbeda → label netral');
eq(
  pilihNamaTrack([{ gender: 'ikhwan', nama_qn: 'Evaluasi QN' }, { gender: 'akhwat', nama_qn: 'Evaluasi QN' }], 'semua'),
  'Evaluasi QN',
  'nama sama → dipakai apa adanya'
);
eq(pilihNamaTrack([], 'semua'), 'Evaluasi QN', 'tanpa config → default');
eq(pilihNamaTrack([], 'ikhwan'), 'Evaluasi QN', 'tanpa config gender → default');

// ── bacaFilter ──
// Tanpa parameter gender, yang berlaku adalah gender pemakai sendiri. Ini yang
// menjaga halaman berperilaku persis seperti sebelum penyaring ada; lintas
// gender harus jadi pilihan yang diketik, bukan bawaan.
eq(bacaFilter({}, 'ikhwan'), { program: '', batch: '', gender: 'ikhwan', cakupan: 'semua' }, 'tanpa param → gender pemakai');
eq(bacaFilter({}, 'akhwat').gender, 'akhwat', 'tanpa param → gender pemakai (akhwat)');
eq(bacaFilter({ gender: 'semua' }, 'ikhwan').gender, 'semua', 'semua harus eksplisit');
eq(bacaFilter({ gender: 'akhwat' }, 'ikhwan').gender, 'akhwat', 'gender lain dipilih terang-terangan');
// Nilai ngawur jangan sampai melebarkan cakupan diam-diam.
eq(bacaFilter({ gender: 'xyz' }, 'ikhwan').gender, 'ikhwan', 'gender ngawur jatuh ke gender pemakai');
eq(bacaFilter({ gender: '' }, 'akhwat').gender, 'akhwat', 'gender kosong jatuh ke gender pemakai');
eq(
  bacaFilter({ program: 'hits-regular', batch: 'hits-regular-apr' }, 'ikhwan'),
  { program: 'hits-regular', batch: 'hits-regular-apr', gender: 'ikhwan', cakupan: 'semua' },
  'program dan batch diteruskan apa adanya'
);

// ── cakupan ──
eq(bacaFilter({ cakupan: 'ujian-pb' }, 'ikhwan').cakupan, 'ujian-pb', 'cakupan dibaca dari URL');
// Salah ketik tak boleh menyaring habis — itu terbaca sebagai "belum ada nilai".
eq(bacaFilter({ cakupan: 'ngawur' }, 'ikhwan').cakupan, 'semua', 'cakupan ngawur jatuh ke default');
eq(bacaFilter({ cakupan: '' }, 'ikhwan').cakupan, 'semua', 'cakupan kosong jatuh ke default');

// ── sesiUntukCakupan ──
// h1 tertinggal di sesi 2; h2 sudah sesi 4. Sesi ujian PB h2 sudah dihapus.
const SESI: SesiRow[] = [
  { id: 'a', halaqah_id: 'h1', jenis: 'qn', nomor_sesi: 1, dihapus: false },
  { id: 'b', halaqah_id: 'h1', jenis: 'qn', nomor_sesi: 2, dihapus: false },
  { id: 'c', halaqah_id: 'h2', jenis: 'qn', nomor_sesi: 4, dihapus: false },
  { id: 'd', halaqah_id: 'h2', jenis: 'pb', nomor_sesi: 1, dihapus: false },
  { id: 'e', halaqah_id: 'h2', jenis: 'ujian', nomor_sesi: 1, dihapus: false },
  { id: 'f', halaqah_id: 'h2', jenis: 'ujian', nomor_sesi: 2, dihapus: true },
];
const ids = (c: Parameters<typeof sesiUntukCakupan>[1]) =>
  sesiUntukCakupan(SESI, c).map((s) => s.id).sort();

eq(ids('semua'), ['a', 'b', 'c', 'd', 'e'], 'semua: semua sesi hidup');
// Sesi ujian PB h2 di-soft-delete → tak boleh muncul di cakupan mana pun.
eq(ids('ujian'), ['e'], 'ujian: sesi dihapus tak ikut');
eq(ids('ujian-pb'), [], 'ujian-pb: hanya sesi dihapus → kosong');
eq(ids('ujian-qn'), ['e'], 'ujian-qn: nomor_sesi 1');
eq(ids('qn'), ['a', 'b', 'c'], 'qn: semua sesi qn');
eq(ids('pb'), ['d'], 'pb: semua sesi pb');
eq(ids('evaluasi'), ['a', 'b', 'c', 'd'], 'evaluasi: qn + pb, tanpa ujian');
// Terbesar PER HALAQAH — h1 tetap terwakili sesi 2 walau h2 sudah sesi 4.
eq(ids('qn-berjalan'), ['b', 'c'], 'qn-berjalan: terbesar per halaqah');

// ── labelCakupan ──
eq(labelCakupan('qn-berjalan', 'Evaluasi QN', 'Evaluasi PB', 4), 'Evaluasi QN Sesi 4', 'label sesi berjalan menyebut nomor');
eq(labelCakupan('qn-berjalan', 'Evaluasi QN', 'Evaluasi PB', 0), 'Evaluasi QN', 'tanpa sesi → tanpa nomor');
// Cakupan lintas-sesi TIDAK boleh menyebut satu nomor sesi.
eq(labelCakupan('qn', 'Evaluasi QN', 'Evaluasi PB', 4), 'Evaluasi QN — semua sesi', 'qn tak menyebut nomor');
eq(labelCakupan('semua', 'Evaluasi QN', 'Evaluasi PB', 4), 'Keseluruhan', 'semua → Keseluruhan');
eq(labelCakupan('ujian-pb', 'Evaluasi QN', 'Evaluasi PB', 4), 'Ujian PB', 'ujian-pb');

// ── pilihNamaTrack kolom nama_pb ──
const CFG_PB = [
  { gender: 'ikhwan', nama_qn: 'Evaluasi QN', nama_pb: 'Evaluasi PB' },
  { gender: 'akhwat', nama_qn: 'Evaluasi Qiroah', nama_pb: 'Evaluasi Perbaikan' },
];
eq(pilihNamaTrack(CFG_PB, 'akhwat', 'nama_pb'), 'Evaluasi Perbaikan', 'nama_pb per gender');
// Config lama belum punya nama_pb → jangan tampilkan undefined ke layar.
eq(pilihNamaTrack([{ gender: 'ikhwan', nama_qn: 'X' }], 'ikhwan', 'nama_pb'), 'Evaluasi PB', 'nama_pb kosong → default');

if (failed) { console.error(`\n${failed} gagal`); process.exit(1); }
console.log('\nsemua lulus');
