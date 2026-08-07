/**
 * test-hits-xlsx.ts — uji workbook "Ranking Disiplin Pengajar" tanpa DB:
 * bangun dari rekap sintetis, lalu BACA ULANG file hasilnya dan periksa isinya.
 * Menangkap kesalahan ExcelJS (merge, fill, numFmt) yang tak terlihat typecheck.
 *
 * Jalankan: npm run test-hits-xlsx
 */
import ExcelJS from 'exceljs';
import { buildHitsDisiplinWorkbook } from '../src/lib/hits-disiplin-xlsx';
import type { HitsKoordinatorRekap } from '../src/lib/hits-koordinator-rekap';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

const rekap = {
  mode: 'bulan',
  start: '2026-08-01',
  end: '2026-09-01',
  periodeLabel: '2026-08',
  genderLabel: 'Akhwat',
  gender: 'akhwat',
  ranked: [
    {
      pengajarId: 'p1', pengajarNama: 'Fulanah Disiplin', gender: 'akhwat',
      halaqahCount: 2, halaqahIds: ['h1', 'h2'], kbbs: 9, nonLibur: 10,
      kmt: 0, kbla: 0, jkg: 0, tidakLatihan: 0, hutangSaldo: 0,
      pctKbbs: 90, rank: 1,
    },
    {
      pengajarId: 'p2', pengajarNama: 'Fulanah Bermasalah', gender: 'akhwat',
      halaqahCount: 1, halaqahIds: ['h3'], kbbs: 4, nonLibur: 10,
      kmt: 3, kbla: 1, jkg: 2, tidakLatihan: 1, hutangSaldo: 45,
      pctKbbs: 40, rank: 2,
    },
  ],
  noData: [
    {
      pengajarId: 'p3', pengajarNama: 'Fulanah Tanpa Data', gender: 'akhwat',
      halaqahCount: 1, halaqahIds: ['h4'], kbbs: 0, nonLibur: 0,
      kmt: 0, kbla: 0, jkg: 0, tidakLatihan: 0, hutangSaldo: 0,
      pctKbbs: null, rank: null,
    },
  ],
  insidenByPengajar: new Map([
    ['p2', [
      {
        keteranganId: 'k1', halaqahId: 'h3', halaqahName: 'Halaqah 3',
        tanggal: '2026-08-05', pertemuanNo: 4,
        pelanggaran: [{ jenis: 'KMT', detail: '12 menit' }],
        catatanKetua: 'Ustadzah datang telat', status: 'diputus',
        alasanPengajar: 'Ban motor bocor', isUdzurSyari: false,
        keputusanCatatan: null, decidedAt: '2026-08-06T02:00:00Z',
      },
      {
        keteranganId: 'k2', halaqahId: 'h3', halaqahName: 'Halaqah 3',
        tanggal: '2026-08-12', pertemuanNo: 5,
        pelanggaran: [{ jenis: 'TIDAK_LATIHAN', detail: '' }],
        catatanKetua: null, status: 'nunggu_alasan',
        alasanPengajar: null, isUdzurSyari: null,
        keputusanCatatan: null, decidedAt: null,
      },
    ]],
  ]),
  cakupanByPengajar: new Map([
    ['p1', {
      pengajarId: 'p1', sudah: 10, belum: 0, total: 10, persen: 100,
      pertemuan: [{ tanggal: '2026-08-05', halaqahId: 'h1', halaqahName: 'Halaqah 1', pertemuanNo: 4, status: 'sudah', libur: false }],
    }],
    ['p2', {
      pengajarId: 'p2', sudah: 6, belum: 4, total: 10, persen: 60,
      pertemuan: [
        { tanggal: '2026-08-05', halaqahId: 'h3', halaqahName: 'Halaqah 3', pertemuanNo: 4, status: 'sudah', libur: false },
        { tanggal: '2026-08-19', halaqahId: 'h3', halaqahName: 'Halaqah 3', pertemuanNo: 6, status: 'belum', libur: false },
        { tanggal: '2026-08-26', halaqahId: 'h3', halaqahName: 'Halaqah 3', pertemuanNo: 7, status: 'pragenerate', libur: false },
      ],
    }],
  ]),
} as unknown as HitsKoordinatorRekap;

async function main() {
  const buf = await buildHitsDisiplinWorkbook(rekap);
  check('menghasilkan buffer non-kosong', buf.length > 1000, String(buf.length));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const nama = wb.worksheets.map((w) => w.name);
  check('3 sheet dengan nama benar',
    JSON.stringify(nama) === JSON.stringify(['Ranking', 'Rincian Insiden', 'Cakupan Observasi']),
    JSON.stringify(nama));

  // ── Ranking ──
  {
    const ws = wb.getWorksheet('Ranking')!;
    check('judul terisi', String(ws.getCell(1, 1).value).includes('Ranking Disiplin'));
    check('subjudul memuat periode & gender',
      String(ws.getCell(2, 1).value).includes('2026-08') &&
      String(ws.getCell(2, 1).value).includes('Akhwat'),
      String(ws.getCell(2, 1).value));
    check('header di baris 4', ws.getCell(4, 1).value === '#' && ws.getCell(4, 2).value === 'Pengajar');
    check('baris pertama = peringkat 1', ws.getCell(5, 1).value === 1 && ws.getCell(5, 2).value === 'Fulanah Disiplin');
    check('%KBBS disimpan sbg pecahan + numFmt persen',
      ws.getCell(5, 5).value === 0.9 && ws.getCell(5, 5).numFmt === '0%',
      `${ws.getCell(5, 5).value} / ${ws.getCell(5, 5).numFmt}`);
    check('pelanggaran 0 dikosongkan', ws.getCell(5, 8).value === null);
    check('pelanggaran >0 tetap angka', ws.getCell(6, 8).value === 3, String(ws.getCell(6, 8).value));
    const fill = ws.getCell(6, 5).fill as ExcelJS.FillPattern;
    check('%KBBS 40% diberi latar merah', fill?.fgColor?.argb === 'FFFEE2E2', JSON.stringify(fill));
    const fillOk = ws.getCell(5, 5).fill as ExcelJS.FillPattern;
    check('%KBBS 90% diberi latar hijau', fillOk?.fgColor?.argb === 'FFDCFCE7', JSON.stringify(fillOk));
    // baris 7 kosong, 8 = judul blok noData, 9 = barisnya
    check('blok tanpa data disebut', String(ws.getCell(8, 1).value ?? '').includes('Belum ada data'),
      String(ws.getCell(8, 1).value));
    check('pengajar tanpa data tercantum', ws.getCell(9, 2).value === 'Fulanah Tanpa Data',
      String(ws.getCell(9, 2).value));
  }

  // ── Rincian insiden ──
  {
    const ws = wb.getWorksheet('Rincian Insiden')!;
    check('insiden baris 1 = pengajar bermasalah', ws.getCell(5, 1).value === 'Fulanah Bermasalah');
    check('pelanggaran diterjemahkan + detail',
      ws.getCell(5, 5).value === 'Kelas Mulai Terlambat (12 menit)', String(ws.getCell(5, 5).value));
    check('putusan ditolak terbaca', ws.getCell(5, 8).value === 'Udzur ditolak', String(ws.getCell(5, 8).value));
    check('status belum diputus memakai label status',
      ws.getCell(6, 8).value === 'Nunggu alasan pengajar', String(ws.getCell(6, 8).value));
    check('catatan kosong jadi string kosong', ws.getCell(6, 6).value === '' || ws.getCell(6, 6).value === null);
  }

  // ── Cakupan observasi ──
  {
    const ws = wb.getWorksheet('Cakupan Observasi')!;
    check('cakupan p1 100%', ws.getCell(5, 5).value === 1, String(ws.getCell(5, 5).value));
    check('cakupan p2 60%', ws.getCell(6, 5).value === 0.6, String(ws.getCell(6, 5).value));
    const belum = String(ws.getCell(6, 6).value ?? '');
    check('pragenerate ikut dihitung sbg belum',
      belum.includes('2026-08-19') && belum.includes('2026-08-26'), belum);
    check('yang sudah tak masuk daftar belum', !belum.includes('2026-08-05'), belum);
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
