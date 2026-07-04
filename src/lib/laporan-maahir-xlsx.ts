// Bangun workbook XLSX bergaya untuk Laporan Bulanan Maahir (dibaca pemangku
// keputusan). Dipisah dari route agar bisa diuji/di-generate mandiri.

import ExcelJS from 'exceljs';
import type { LaporanMaahir } from '@/lib/laporan-maahir';

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
export function bulanLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${BULAN_ID[m - 1]} ${y}`;
}
function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}

const C = {
  title: 'FF0F5132', section: 'FF166534', sub: 'FFD1FAE5', subInk: 'FF065F46',
  head: 'FFDCFCE7', headInk: 'FF14532D', danger: 'FFFEE2E2', dangerInk: 'FF991B1B',
  border: 'FFCBD5E1', zebra: 'FFF6FBF8', ok: 'FF15803D', bad: 'FFB91C1C',
  muted: 'FF64748B', white: 'FFFFFFFF', ink: 'FF1F2937',
};
const NCOL = 8;

export async function buildLaporanMaahirWorkbook(lap: LaporanMaahir, bulan: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir HITS';
  wb.created = new Date();
  const ws = wb.addWorksheet(bulanLabel(bulan), {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'portrait', fitToPage: true, fitToWidth: 1,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
  ws.columns = [
    { width: 6 }, { width: 40 }, { width: 16 }, { width: 14 },
    { width: 22 }, { width: 12 }, { width: 12 }, { width: 18 },
  ];

  const thin = { style: 'thin' as const, color: { argb: C.border } };
  const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
  let r = 1;
  const merge = (row: number, c1: number, c2: number) => ws.mergeCells(row, c1, row, c2);
  const cell = (row: number, col: number) => ws.getCell(row, col);

  merge(r, 1, NCOL);
  const title = cell(r, 1);
  title.value = 'LAPORAN BULANAN MAAHIR';
  title.font = { bold: true, size: 16, color: { argb: C.white }, name: 'Calibri' };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.title } };
  ws.getRow(r).height = 26;
  r++;
  merge(r, 1, NCOL);
  const subt = cell(r, 1);
  subt.value = `Program Halaqah Tahsin & Tahfizh — ${bulanLabel(bulan)}`;
  subt.font = { italic: true, size: 10, color: { argb: C.white } };
  subt.alignment = { vertical: 'middle', horizontal: 'center' };
  subt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.section } };
  ws.getRow(r).height = 16;
  r += 2;

  function band(text: string, fill = C.section, ink = C.white) {
    merge(r, 1, NCOL);
    const c = cell(r, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: ink } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    ws.getRow(r).height = 20;
    r++;
  }
  function subBand(text: string) {
    merge(r, 1, NCOL);
    const c = cell(r, 1);
    c.value = text;
    c.font = { bold: true, size: 10, color: { argb: C.subInk } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sub } };
    ws.getRow(r).height = 16;
    r++;
  }
  function tableHead(cells: Array<{ text: string; from: number; to: number; align?: 'left' | 'center' }>) {
    for (const cd of cells) {
      if (cd.to > cd.from) merge(r, cd.from, cd.to);
      const c = cell(r, cd.from);
      c.value = cd.text;
      c.font = { bold: true, size: 10, color: { argb: C.headInk } };
      c.alignment = { vertical: 'middle', horizontal: cd.align ?? 'center', wrapText: true, indent: cd.align === 'left' ? 1 : 0 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
    }
    for (let col = 1; col <= NCOL; col++) cell(r, col).border = allBorders;
    ws.getRow(r).height = 20;
    r++;
  }
  type CellDef = { text: string | number; from: number; to: number; align?: 'left' | 'center'; ink?: string; bold?: boolean; fill?: string };
  function dataRow(cells: CellDef[], zebra = false) {
    for (const cd of cells) {
      if (cd.to > cd.from) merge(r, cd.from, cd.to);
      const c = cell(r, cd.from);
      c.value = cd.text;
      c.font = { size: 10, bold: cd.bold, color: { argb: cd.ink ?? C.ink } };
      c.alignment = { vertical: 'middle', horizontal: cd.align ?? 'center', wrapText: cd.align === 'left', indent: cd.align === 'left' ? 1 : 0 };
      if (cd.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cd.fill } };
    }
    if (zebra) {
      for (let col = 1; col <= NCOL; col++) {
        const c = cell(r, col);
        if (!c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      }
    }
    for (let col = 1; col <= NCOL; col++) cell(r, col).border = allBorders;
    ws.getRow(r).height = 17;
    r++;
  }
  const spacer = () => { r++; };
  const inkForPct = (aktual: number | null, benchmark: number) =>
    aktual === null ? C.muted : aktual >= benchmark ? C.ok : C.bad;

  function obsHead() {
    tableHead([
      { text: 'No', from: 1, to: 1 },
      { text: 'Hal yang diobservasi', from: 2, to: 2, align: 'left' },
      { text: 'Aktual', from: 3, to: 3 },
      { text: 'Benchmark', from: 4, to: 4 },
      { text: 'Notes', from: 5, to: NCOL, align: 'left' },
    ]);
  }
  function obsRow(no: number, hal: string, aktual: string, benchmark: string, opts?: { ink?: string; notes?: string }, zebra = false) {
    dataRow([
      { text: no, from: 1, to: 1, ink: C.muted },
      { text: hal, from: 2, to: 2, align: 'left' },
      { text: aktual, from: 3, to: 3, bold: true, ink: opts?.ink },
      { text: benchmark, from: 4, to: 4, ink: C.muted },
      { text: opts?.notes ?? '', from: 5, to: NCOL, align: 'left', ink: C.muted },
    ], zebra);
  }

  // ===== TAKHASSUS =====
  const t = lap.takhassus;
  band('MAAHIR TAKHASSUS (IKHWAN & AKHWAT)');
  obsHead();
  obsRow(1, "Setoran Al-Qur'an per bulan", t.setoran.aktual === null ? '—' : String(t.setoran.aktual), String(t.setoran.benchmark));
  obsRow(2, 'Kehadiran peserta per bulan', pct(t.kehadiran.aktual), `${t.kehadiran.benchmark}%`, { ink: inkForPct(t.kehadiran.aktual, t.kehadiran.benchmark) }, true);
  obsRow(3, 'Jumlah peserta dengan absensi di bawah target', `${t.dibawahTarget.jumlah} orang`, '');
  obsRow(4, 'Kehadiran pengajar per bulan', `${t.kehadiranPengajar}%`, '80%', { ink: C.ok }, true);
  obsRow(5, 'Jumlah pengajar dengan absensi di bawah target', `${t.pengajarDibawahTarget} orang`, '');
  spacer();

  subBand('Rincian Setoran — Peserta Takhassus');
  tableHead([
    { text: 'Peserta', from: 1, to: 2, align: 'left' },
    { text: 'Gender', from: 3, to: 3 },
    { text: 'Jumlah Setoran', from: 4, to: 5 },
    { text: 'Keterangan', from: 6, to: NCOL, align: 'left' },
  ]);
  t.setoran.peserta.forEach((p, i) => {
    dataRow([
      { text: p.name, from: 1, to: 2, align: 'left' },
      { text: p.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat', from: 3, to: 3, ink: C.muted },
      { text: '', from: 4, to: 5 },
      { text: '', from: 6, to: NCOL, align: 'left' },
    ], i % 2 === 1);
  });
  spacer();

  subBand('Kehadiran Peserta per Gender');
  tableHead([
    { text: 'Ikhwan', from: 1, to: 3 },
    { text: 'Akhwat', from: 4, to: 5 },
    { text: 'Rata-rata', from: 6, to: NCOL },
  ]);
  dataRow([
    { text: pct(t.kehadiran.avgIkhwan), from: 1, to: 3, bold: true },
    { text: pct(t.kehadiran.avgAkhwat), from: 4, to: 5, bold: true },
    { text: pct(t.kehadiran.aktual), from: 6, to: NCOL, bold: true, ink: inkForPct(t.kehadiran.aktual, t.kehadiran.benchmark) },
  ]);
  spacer();

  band('Peserta di Bawah Target (< 80%)', C.danger, C.dangerInk);
  tableHead([
    { text: 'Peserta', from: 1, to: 2, align: 'left' },
    { text: 'Kelas', from: 3, to: 3 },
    { text: 'Kehadiran', from: 4, to: 4 },
    { text: 'Hadir', from: 5, to: 5 },
    { text: 'Izin', from: 6, to: 6 },
    { text: 'Sakit', from: 7, to: 7 },
    { text: 'Alpa', from: 8, to: 8 },
  ]);
  if (t.dibawahTarget.list.length === 0) {
    dataRow([{ text: 'Tidak ada peserta di bawah target.', from: 1, to: NCOL, align: 'left', ink: C.muted }]);
  } else {
    t.dibawahTarget.list.forEach((st, i) => {
      dataRow([
        { text: st.name, from: 1, to: 2, align: 'left' },
        { text: st.kelasName, from: 3, to: 3, ink: C.muted },
        { text: pct(st.persen), from: 4, to: 4, bold: true, ink: C.bad },
        { text: st.counts.H, from: 5, to: 5 },
        { text: st.counts.I, from: 6, to: 6 },
        { text: st.counts.S, from: 7, to: 7 },
        { text: st.counts.A, from: 8, to: 8 },
      ], i % 2 === 1);
    });
  }
  spacer();
  band('CATATAN / POIN MENARIK', C.sub, C.subInk);
  dataRow([{ text: t.catatan ?? '', from: 1, to: NCOL, align: 'left', ink: C.muted }]);
  spacer(); spacer();

  // ===== MAAHIR =====
  const m = lap.maahir;
  band('MAAHIR (SELAIN TAKHASSUS)');
  obsHead();
  obsRow(1, 'Ujian teori mustawa (3 bulan)', '—', '70');
  obsRow(2, 'Ujian praktek mustawa (3 bulan)', '—', '70', undefined, true);
  obsRow(3, 'Kehadiran peserta per bulan', pct(m.kehadiran.aktual), `${m.kehadiran.benchmark}%`, { ink: inkForPct(m.kehadiran.aktual, m.kehadiran.benchmark) });
  obsRow(4, 'Rata-rata keseluruhan Ujian (teori + praktek)', '—', '70', undefined, true);
  obsRow(5, 'Jumlah peserta dengan nilai akhir program di bawah target', '—', '');
  obsRow(6, 'Hafalan matan per mustawa (3 bulan)', '—', '60', undefined, true);
  obsRow(7, 'Jumlah peserta dengan hafalan matan di bawah target', '—', '');
  obsRow(8, 'Jumlah peserta dengan absensi di bawah target', `${m.dibawahTarget.jumlah} orang`, '', undefined, true);
  obsRow(9, 'Kehadiran pengajar per bulan', `${m.kehadiranPengajar}%`, '85%', { ink: C.ok });
  obsRow(10, 'Jumlah pengajar dengan absensi di bawah target', `${m.pengajarDibawahTarget} orang`, '', undefined, true);
  spacer();

  subBand('Kehadiran Peserta per Gender');
  tableHead([
    { text: 'Ikhwan', from: 1, to: 3 },
    { text: 'Akhwat', from: 4, to: 5 },
    { text: 'Rata-rata', from: 6, to: NCOL },
  ]);
  dataRow([
    { text: pct(m.kehadiran.avgIkhwan), from: 1, to: 3, bold: true },
    { text: pct(m.kehadiran.avgAkhwat), from: 4, to: 5, bold: true },
    { text: pct(m.kehadiran.aktual), from: 6, to: NCOL, bold: true, ink: inkForPct(m.kehadiran.aktual, m.kehadiran.benchmark) },
  ]);
  spacer();

  band('Peserta di Bawah Target (< 80%)', C.danger, C.dangerInk);
  tableHead([
    { text: 'Peserta', from: 1, to: 3, align: 'left' },
    { text: 'Kehadiran', from: 4, to: 5 },
    { text: 'Kelas', from: 6, to: NCOL, align: 'left' },
  ]);
  if (m.dibawahTarget.list.length === 0) {
    dataRow([{ text: 'Tidak ada peserta di bawah target.', from: 1, to: NCOL, align: 'left', ink: C.muted }]);
  } else {
    m.dibawahTarget.list.forEach((st, i) => {
      dataRow([
        { text: st.name, from: 1, to: 3, align: 'left' },
        { text: pct(st.persen), from: 4, to: 5, bold: true, ink: C.bad },
        { text: st.kelasName, from: 6, to: NCOL, align: 'left', ink: C.muted },
      ], i % 2 === 1);
    });
  }
  spacer(); spacer();

  // ===== AT-TIBYAN =====
  const a = lap.atTibyan;
  band('AT-TIBYAN');
  obsHead();
  obsRow(1, 'Kehadiran peserta per bulan', pct(a.kehadiran.aktual), `${a.kehadiran.benchmark}%`, { ink: inkForPct(a.kehadiran.aktual, a.kehadiran.benchmark) });
  obsRow(2, 'Jumlah peserta dengan absensi di bawah target', `${a.dibawahTarget.total} orang`, '', { notes: `Ikhwan ${a.dibawahTarget.ikhwan} · Akhwat ${a.dibawahTarget.akhwat}` }, true);
  spacer();

  subBand('Kehadiran Peserta per Gender');
  tableHead([
    { text: 'Ikhwan', from: 1, to: 3 },
    { text: 'Akhwat', from: 4, to: 5 },
    { text: 'Rata-rata', from: 6, to: NCOL },
  ]);
  dataRow([
    { text: pct(a.kehadiran.avgIkhwan), from: 1, to: 3, bold: true },
    { text: pct(a.kehadiran.avgAkhwat), from: 4, to: 5, bold: true },
    { text: pct(a.kehadiran.aktual), from: 6, to: NCOL, bold: true, ink: inkForPct(a.kehadiran.aktual, a.kehadiran.benchmark) },
  ]);
  spacer();

  band('Peserta di Bawah Target (< 100%)', C.danger, C.dangerInk);
  tableHead([
    { text: 'Peserta', from: 1, to: 2, align: 'left' },
    { text: 'Tidak Hadir', from: 3, to: 3 },
    { text: 'Kelas', from: 4, to: 5, align: 'left' },
    { text: 'Keterangan', from: 6, to: NCOL, align: 'left' },
  ]);
  if (a.dibawahTarget.list.length === 0) {
    dataRow([{ text: 'Tidak ada peserta di bawah target.', from: 1, to: NCOL, align: 'left', ink: C.muted }]);
  } else {
    a.dibawahTarget.list.forEach((st, i) => {
      dataRow([
        { text: st.name, from: 1, to: 2, align: 'left' },
        { text: `${st.tidakHadir}x`, from: 3, to: 3, bold: true, ink: C.bad },
        { text: st.kelasName, from: 4, to: 5, align: 'left', ink: C.muted },
        { text: st.keterangan, from: 6, to: NCOL, align: 'left', ink: C.muted },
      ], i % 2 === 1);
    });
  }

  return wb.xlsx.writeBuffer();
}
