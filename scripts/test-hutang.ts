// Uji fungsi murni hutang menit. Jalankan: npm run test-hutang
import { hutangMenit, allocateHutang, buildHutang, HUTANG_ANCHOR } from '@/lib/hits-hutang';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// --- hutangMenit ---
const P = (jenis: string, menit: number | null = null, jkg_opsi: string | null = null) =>
  ({ jenis, menit, jkg_opsi } as Parameters<typeof hutangMenit>[0]);
eq(hutangMenit(P('KMT', 5)), 0, 'KMT 5 menit -> 0 (dalam toleransi)');
eq(hutangMenit(P('KMT', 6)), 1, 'KMT 6 menit -> 1');
eq(hutangMenit(P('KMT', 10)), 5, 'KMT 10 menit -> 5');
eq(hutangMenit(P('KMT', null)), 0, 'KMT null -> 0');
eq(hutangMenit(P('KBLA', 8)), 8, 'KBLA 8 menit -> 8');
eq(hutangMenit(P('KBLA', 0)), 0, 'KBLA 0 -> 0');
eq(hutangMenit(P('JKG', null, 'ganti_hari')), 90, 'JKG form (jkg_opsi set) -> 90');
eq(hutangMenit(P('JKG', null, null)), 0, 'JKG backfill (jkg_opsi null) -> 0');
eq(hutangMenit(P('BADAL')), 0, 'BADAL -> 0');
eq(hutangMenit(P('TIDAK_LATIHAN')), 0, 'TIDAK_LATIHAN -> 0');

// --- allocateHutang (FIFO oldest-first) ---
const items = [
  { keterangan_id: 'a', tanggal: '2026-01-01', jenis: 'KMT', debit: 5 },
  { keterangan_id: 'b', tanggal: '2026-01-03', jenis: 'KBLA', debit: 8 },
  { keterangan_id: 'c', tanggal: '2026-01-05', jenis: 'JKG', debit: 90 },
];
// bayar 0
eq(allocateHutang(items, 0).map((r) => r.status), ['belum', 'belum', 'belum'], 'bayar 0 -> semua belum');
// bayar 5 -> lunasi a
eq(allocateHutang(items, 5).map((r) => [r.status, r.sisa]),
   [['lunas', 0], ['belum', 8], ['belum', 90]], 'bayar 5 -> a lunas');
// bayar 10 -> a lunas, b sebagian (terbayar 5, sisa 3)
eq(allocateHutang(items, 10).map((r) => [r.status, r.terbayar, r.sisa]),
   [['lunas', 5, 0], ['sebagian', 5, 3], ['belum', 0, 90]], 'bayar 10 -> b sebagian');
// overpay 200 -> semua lunas, tak negatif
eq(allocateHutang(items, 200).map((r) => [r.status, r.sisa]),
   [['lunas', 0], ['lunas', 0], ['lunas', 0]], 'overpay -> semua lunas, sisa 0');

// --- buildHutang anchor: pertemuan sebelum HUTANG_ANCHOR tak berhutang ---
const anchorKets = [
  { id: 'lama', tanggal: '2026-06-30' },       // sebelum anchor -> abaikan
  { id: 'baru', tanggal: HUTANG_ANCHOR },       // pada anchor -> hitung
];
const anchorPels = [
  { keterangan_id: 'lama', jenis: 'JKG', menit: null, jkg_opsi: null },   // backfill lama, harus diabaikan
  { keterangan_id: 'baru', jenis: 'KMT', menit: 10, jkg_opsi: null },     // -> debit 5
];
const bh = buildHutang('h1', 'p1', anchorKets, anchorPels, []);
eq([bh.total_debit, bh.saldo], [5, 5], 'anchor: JKG lama diabaikan, KMT baru 10->5');
eq(bh.rincian.map((r) => r.keterangan_id), ['baru'], 'anchor: hanya pertemuan baru di rincian');
// dengan pembayaran 5 -> lunas
eq(buildHutang('h1', 'p1', anchorKets, anchorPels, [{ menit: 5 }]).saldo, 0, 'anchor: bayar 5 -> lunas');

if (failed > 0) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test hutang lulus.');
