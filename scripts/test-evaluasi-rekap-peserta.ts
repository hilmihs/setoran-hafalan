// Uji fungsi murni Peringkat Peserta: pembacaan penyaring dan pengurutan baris.
// Jalankan: npm run test-evaluasi-rekap-peserta
import {
  bacaFilterPeserta, urutkanPeserta,
  type BarisPeserta,
} from '@/lib/evaluasi-rekap-peserta';
import { nilaiAkhirTrackOf } from '@/lib/evaluasi';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// ── bacaFilterPeserta ──
eq(
  bacaFilterPeserta({}, 'ikhwan'),
  { program: '', batch: '', gender: 'ikhwan', urut: 'qn', arah: 'naik' },
  'kosong → gender pemakai, urut nilai QN menaik'
);
eq(
  bacaFilterPeserta({ gender: 'semua', urut: 'nama', arah: 'turun' }, 'ikhwan').urut,
  'nama',
  'urut dikenali'
);
// Nilai ngawur (URL diketik tangan) tak boleh menghasilkan urutan acak — jatuh
// ke default, bukan ke kolom yang tak ada.
eq(bacaFilterPeserta({ urut: 'skor-rahasia' }, 'ikhwan').urut, 'qn', 'urut ngawur → default');
eq(bacaFilterPeserta({ arah: 'menyamping' }, 'ikhwan').arah, 'naik', 'arah ngawur → default');
eq(bacaFilterPeserta({ gender: 'lainnya' }, 'akhwat').gender, 'akhwat', 'gender ngawur → gender pemakai');
// Parameter yang diulang di URL datang sebagai larik.
eq(bacaFilterPeserta({ urut: ['pb', 'qn'] }, 'ikhwan').urut, 'pb', 'larik → elemen pertama');

// ── urutkanPeserta ──
/** Baris uji: nilai akhir dibuat lewat rumus asli, bukan angka yang dipaksakan,
 *  supaya uji ini ikut menangkap perubahan rumus nilai akhir. */
function baris(nama: string, ujianQn: number | null, ujianPb: number | null, halaqah = 'H1'): BarisPeserta {
  return {
    id: `p-${nama}`,
    nama,
    halaqahId: `h-${halaqah}`,
    halaqahNama: halaqah,
    sub: 'Ikhwan',
    gender: 'ikhwan',
    pengajar: '—',
    qn: nilaiAkhirTrackOf('qn', [], ujianQn, { ujianSaja: true }),
    pb: nilaiAkhirTrackOf('pb', [], ujianPb, { ujianSaja: true }),
  };
}

// Lantai 55 berlaku: ujian 30 → nilai akhir 55.
const ROWS: BarisPeserta[] = [
  baris('Cecep', 90, 60, 'H2'),
  baris('Ahmad', null, null, 'H1'),
  baris('Budi', 30, 95, 'H3'),
  baris('Dedi', 72, null, 'H1'),
];

eq(
  urutkanPeserta(ROWS, 'qn', 'naik').map((r) => r.nama),
  ['Budi', 'Dedi', 'Cecep', 'Ahmad'],
  'urut QN menaik, tanpa nilai di bawah'
);
// Tanpa nilai tetap di bawah saat arah dibalik — bukan ikut naik ke puncak.
eq(
  urutkanPeserta(ROWS, 'qn', 'turun').map((r) => r.nama),
  ['Cecep', 'Dedi', 'Budi', 'Ahmad'],
  'urut QN menurun, tanpa nilai tetap di bawah'
);
eq(
  urutkanPeserta(ROWS, 'pb', 'naik').map((r) => r.nama),
  ['Cecep', 'Budi', 'Ahmad', 'Dedi'],
  'urut PB menaik; dua tanpa nilai di bawah, terurut nama'
);
eq(
  urutkanPeserta(ROWS, 'nama', 'naik').map((r) => r.nama),
  ['Ahmad', 'Budi', 'Cecep', 'Dedi'],
  'urut nama menaik'
);
eq(
  urutkanPeserta(ROWS, 'halaqah', 'naik').map((r) => r.halaqahNama),
  ['H1', 'H1', 'H2', 'H3'],
  'urut halaqah menaik'
);
eq(
  urutkanPeserta(ROWS, 'halaqah', 'naik').map((r) => r.nama),
  ['Ahmad', 'Dedi', 'Cecep', 'Budi'],
  'halaqah sama → tie-break nama, bukan urutan masuk'
);
// Lantai nilai ikut menentukan peringkat: ujian 30 tidak boleh diurutkan
// sebagai 30 kalau yang dicetak 55.
eq(urutkanPeserta(ROWS, 'qn', 'naik')[0].qn.nilai, 55, 'nilai terendah adalah nilai berlantai');

// Masukan tak boleh dimutasi — halaman merender larik yang sama untuk beberapa
// keperluan (tabel dan kartu ringkasan).
const asli = ROWS.map((r) => r.nama);
urutkanPeserta(ROWS, 'nama', 'turun');
eq(ROWS.map((r) => r.nama), asli, 'urutkanPeserta tidak memutasi masukan');

if (failed) { console.error(`\n${failed} gagal`); process.exit(1); }
console.log('\nsemua lulus');
