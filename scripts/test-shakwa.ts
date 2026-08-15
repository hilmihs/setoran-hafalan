// Uji fungsi murni Shakwa: routing kategori→tujuan WA, nomor tiket, rentang
// rekap, penanda alasan izin, dan periode SP per bulan.
// Jalankan: npm run test-shakwa
import {
  KATEGORI,
  KATEGORI_BY_VALUE,
  TUJUAN_WA,
  HALAQAH_OPTIONS,
  STATUS_LABEL,
  STATUS_PILIHAN,
  nomorTiket,
  kategoriDef,
} from '@/lib/shakwa';
import { alasanDariIzin, berasalDariIzin, izinCocokKondisi, dalamJendelaYatim, PENANDA_IZIN } from '@/lib/shakwa-izin';
import { rentangShakwa } from '@/lib/shakwa-rekap';
import { periodeStartDate, periodeEndDate } from '@/lib/maahir-sp';
import { normalizeWhatsApp } from '@/lib/whatsapp';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// --- Kategori & routing WA ---
eq(KATEGORI.length, 8, 'ada 8 kategori');
eq(kategoriDef('tidak_ada'), null, 'kategori asing ditolak');
eq(kategoriDef('izin')?.butuhLogin, true, 'izin wajib login');
eq(kategoriDef('tali_kasih')?.butuhLogin, true, 'tali kasih wajib login');
eq(
  KATEGORI.filter((k) => k.butuhLogin).map((k) => k.value),
  ['izin', 'tali_kasih'],
  'hanya izin & tali kasih yang wajib login'
);

const tujuanDari = (v: string) => KATEGORI_BY_VALUE[v as keyof typeof KATEGORI_BY_VALUE].waTujuan;
eq(tujuanDari('pengajar'), 'koordinator_pengajar', 'pengajar → koordinator pengajar');
eq(tujuanDari('izin'), 'koordinator_pengajar', 'izin → koordinator pengajar');
eq(tujuanDari('peserta'), 'koordinator_peserta', 'peserta → koordinator peserta');
eq(tujuanDari('ketidaksesuaian_aplikasi'), 'koordinator_peserta', 'ketidaksesuaian → koordinator peserta');
eq(tujuanDari('tali_kasih'), 'tali_kasih', 'tali kasih → tim tali kasih');
eq(tujuanDari('evaluasi'), null, 'evaluasi tanpa WA');
eq(tujuanDari('modul_kurikulum'), null, 'modul & kurikulum tanpa WA');
eq(tujuanDari('cerita_menarik'), null, 'cerita menarik tanpa WA');

eq(normalizeWhatsApp(TUJUAN_WA.koordinator_pengajar.nomor), '6281280683665', 'nomor koordinator pengajar');
eq(normalizeWhatsApp(TUJUAN_WA.koordinator_peserta.nomor), '6281994771197', 'nomor koordinator peserta');
eq(normalizeWhatsApp(TUJUAN_WA.tali_kasih.nomor), '6289673092288', 'nomor tali kasih');

eq(HALAQAH_OPTIONS.length, 8, 'ada 8 pilihan halaqoh');
eq(HALAQAH_OPTIONS[0], 'HITS JANUARI', 'halaqoh pertama');

// --- Status: kosakata kolom vs label tampilan ---
eq(STATUS_PILIHAN, ['submitted', 'in_review', 'resolved'], "'closed' tak ditawarkan ke koordinator");
eq(STATUS_LABEL.submitted, 'Baru', 'label submitted');
eq(STATUS_LABEL.resolved, 'Selesai', 'label resolved');

// --- Nomor tiket ---
eq(nomorTiket('2026-08-12', 1), 'SKW-20260812-001', 'tiket pertama hari itu');
eq(nomorTiket('2026-08-12', 42), 'SKW-20260812-042', 'tiket ke-42');

// --- Rentang rekap ---
eq(rentangShakwa({ tanggal: '2026-08-12' }), { mulai: '2026-08-12', sampai: '2026-08-12' }, 'hari tunggal');
eq(
  rentangShakwa({ dari: '2026-08-01', sampai: '2026-08-07' }),
  { mulai: '2026-08-01', sampai: '2026-08-07' },
  'rentang normal'
);
eq(
  rentangShakwa({ dari: '2026-08-07', sampai: '2026-08-01' }),
  { mulai: '2026-08-01', sampai: '2026-08-07' },
  'rentang terbalik dibetulkan'
);
eq(
  rentangShakwa({ tanggal: '2026-08-12', dari: '2026-08-01', sampai: '2026-08-07' }),
  { mulai: '2026-08-01', sampai: '2026-08-07' },
  'rentang menang atas tanggal tunggal'
);

// --- Alasan dari izin pra-kelas ---
const izin = {
  id: 'x', shakwaId: 'y', nomorTiket: 'SKW-20260812-003', tanggal: '2026-08-12',
  jenis: 'KMT' as const, menit: 15, jadwalGanti: null, alasan: 'Sakit demam',
  dikirimAt: '2026-08-11T02:00:00.000Z',
  pengajarId: 'p', halaqahId: null,
};
const teks = alasanDariIzin(izin);
eq(teks.startsWith(`${PENANDA_IZIN} SKW-20260812-003]`), true, 'alasan diawali penanda + nomor tiket');
eq(teks.includes('Sakit demam'), true, 'alasan pengajar ikut');
eq(teks.includes('15 menit'), true, 'rincian menit ikut');
eq(berasalDariIzin(teks), true, 'penanda terbaca sebagai izin pra-kelas');
eq(berasalDariIzin('Ketiduran, mohon maaf'), false, 'alasan tabayyun biasa bukan izin');
eq(berasalDariIzin(null), false, 'alasan kosong bukan izin');
eq(
  alasanDariIzin({ ...izin, jenis: 'JKG', menit: null, jadwalGanti: '2026-08-14' }).includes('diganti 2026-08-14'),
  true,
  'JKG mencantumkan tanggal ganti'
);

// --- Periode SP per bulan (28 → 27) ---
eq(periodeStartDate('2026-08'), '2026-07-28', 'awal periode Agustus');
eq(periodeEndDate('2026-08'), '2026-08-27', 'akhir periode Agustus');
eq(periodeStartDate('2026-01'), '2025-12-28', 'awal periode Januari lintas tahun');

// --- Attestation: opsi "Belum" dihapus (feedback pengajar) ---
const opsiField = (kategori: string, field: string) =>
  kategoriDef(kategori)?.fieldTambahan.find((f) => f.name === field)?.opsi;
eq(opsiField('tali_kasih', 'sudah_presensi'), ['Sudah'], 'talikasih sudah_presensi hanya "Sudah"');
eq(opsiField('izin', 'sudah_info_koordinator'), ['Sudah'], 'izin sudah_info_koordinator hanya "Sudah"');
eq(opsiField('tali_kasih', 'punya_rekening_cimb'), ['Sudah', 'Belum'], 'rekening CIMB tetap Sudah/Belum');

// --- Predikat kecocokan izin ↔ kondisi tabayyun ---
eq(izinCocokKondisi('KMT', 'KMT'), true, 'jenis sama → cocok');
eq(izinCocokKondisi('KBLA', 'KMT'), false, 'jenis beda → tak cocok');
eq(izinCocokKondisi('TIDAK_HADIR', 'BADAL'), true, 'TIDAK_HADIR net → cocok kondisi apa pun');
eq(izinCocokKondisi('TIDAK_HADIR', 'TIDAK_LATIHAN'), true, 'TIDAK_HADIR net → cocok TIDAK_LATIHAN');
eq(izinCocokKondisi('JKG', 'BADAL'), false, 'JKG vs BADAL → tak cocok');

// --- Jendela izin yatim (default 14 hari) ---
eq(dalamJendelaYatim('2026-08-15', '2026-08-15', 14), true, 'hari ini masuk jendela');
eq(dalamJendelaYatim('2026-08-02', '2026-08-15', 14), true, 'tepat 13 hari lalu masuk');
eq(dalamJendelaYatim('2026-08-01', '2026-08-15', 14), false, '14 hari lalu di luar jendela');
eq(dalamJendelaYatim('2026-08-16', '2026-08-15', 14), false, 'masa depan di luar jendela');

if (failed) { console.error(`\n${failed} uji gagal.`); process.exit(1); }
console.log('\nSemua uji Shakwa lolos.');
