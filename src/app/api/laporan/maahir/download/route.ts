import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSession } from '@/lib/session';
import { getLaporanMaahir } from '@/lib/laporan-maahir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function bulanLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${BULAN_ID[m - 1]} ${y}`;
}
function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s.session || (s.session.role !== 'koordinator' && s.session.role !== 'syaikh')) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  const bulan = req.nextUrl.searchParams.get('bulan');
  if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
    return NextResponse.json({ error: 'Parameter bulan harus YYYY-MM.' }, { status: 400 });
  }
  const [, mStr] = bulan.split('-');
  const mNum = parseInt(mStr);
  if (mNum < 1 || mNum > 12) {
    return NextResponse.json({ error: 'Bulan tidak valid.' }, { status: 400 });
  }

  const lap = await getLaporanMaahir(bulan);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir';
  wb.created = new Date();
  const ws = wb.addWorksheet(bulanLabel(bulan));
  ws.columns = [
    { key: 'a', width: 6 },
    { key: 'b', width: 46 },
    { key: 'c', width: 14 },
    { key: 'd', width: 12 },
    { key: 'e', width: 24 },
    { key: 'f', width: 14 },
    { key: 'g', width: 12 },
  ];

  const bold = (row: ExcelJS.Row) => { row.font = { bold: true }; return row; };
  const blank = () => ws.addRow([]);

  bold(ws.addRow([`LAPORAN BULANAN MAAHIR — ${bulanLabel(bulan)}`]));
  blank();

  // ---------- helper blok observasi ----------
  function obsHeader(judul: string) {
    bold(ws.addRow([judul]));
    bold(ws.addRow(['No', 'Hal yang diobservasi', 'Aktual', 'Benchmark', 'Notes']));
  }
  function obsRow(no: string | number, hal: string, aktual: string, benchmark: string, notes = '') {
    ws.addRow([no, hal, aktual, benchmark, notes]);
  }

  // ===================== TAKHASSUS =====================
  const t = lap.takhassus;
  obsHeader('MAAHIR TAKHASSUS (IKHWAN & AKHWAT)');
  obsRow(1, "Setoran Al-Qur'an per bulan", t.setoran.aktual === null ? '' : String(t.setoran.aktual), String(t.setoran.benchmark));
  obsRow(2, 'Kehadiran peserta per bulan', pct(t.kehadiran.aktual), `${t.kehadiran.benchmark}%`);
  obsRow(3, 'Jumlah peserta dengan absensi di bawah target', `${t.dibawahTarget.jumlah} orang`, '');
  obsRow(4, 'Kehadiran pengajar per bulan', `${t.kehadiranPengajar}%`, '80%');
  obsRow(5, 'Jumlah pengajar dengan absensi di bawah target', `${t.pengajarDibawahTarget} orang`, '');
  blank();

  bold(ws.addRow(['Rincian setoran', 'Peserta', 'Gender', 'Jumlah setoran', 'Keterangan']));
  for (const p of t.setoran.peserta) {
    ws.addRow(['', p.name, p.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat', '', '']);
  }
  blank();

  bold(ws.addRow(['Kehadiran peserta', 'Ikhwan', 'Akhwat', 'Rata-rata']));
  ws.addRow(['', pct(t.kehadiran.avgIkhwan), pct(t.kehadiran.avgAkhwat), pct(t.kehadiran.aktual)]);
  blank();

  bold(ws.addRow(['Peserta < 80%', 'Kelas', 'Kehadiran', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Keterangan']));
  for (const st of t.dibawahTarget.list) {
    ws.addRow([st.name, st.kelasName, pct(st.persen), st.counts.H, st.counts.I, st.counts.S, st.counts.A, st.keterangan]);
  }
  bold(ws.addRow(['CATATAN / POIN MENARIK:', t.catatan ?? '']));
  blank();
  blank();

  // ===================== MAAHIR =====================
  const m = lap.maahir;
  obsHeader('MAAHIR (SELAIN TAKHASSUS)');
  obsRow(1, 'Ujian teori mustawa (3 bulan)', '—', '70');
  obsRow(2, 'Ujian praktek mustawa (3 bulan)', '—', '70');
  obsRow(3, 'Kehadiran peserta per bulan', pct(m.kehadiran.aktual), `${m.kehadiran.benchmark}%`);
  obsRow(4, 'Rata-rata keseluruhan Ujian (teori + praktek)', '—', '70');
  obsRow(5, 'Jumlah peserta dengan nilai akhir program di bawah target', '—', '');
  obsRow(6, 'Hafalan matan per mustawa (3 bulan)', '—', '60');
  obsRow(7, 'Jumlah peserta dengan hafalan matan di bawah target', '—', '');
  obsRow(8, 'Jumlah peserta dengan absensi di bawah target', `${m.dibawahTarget.jumlah} orang`, '');
  obsRow(9, 'Kehadiran pengajar per bulan', `${m.kehadiranPengajar}%`, '85%');
  obsRow(10, 'Jumlah pengajar dengan absensi di bawah target', `${m.pengajarDibawahTarget} orang`, '');
  blank();

  bold(ws.addRow(['Kehadiran peserta', 'Ikhwan', 'Akhwat', 'Rata-rata']));
  ws.addRow(['', pct(m.kehadiran.avgIkhwan), pct(m.kehadiran.avgAkhwat), pct(m.kehadiran.aktual)]);
  blank();

  bold(ws.addRow(['Peserta < 80%', 'Kehadiran', 'Kelas']));
  for (const st of m.dibawahTarget.list) {
    ws.addRow([st.name, pct(st.persen), st.kelasName]);
  }
  blank();
  blank();

  // ===================== AT-TIBYAN =====================
  const a = lap.atTibyan;
  obsHeader('AT-TIBYAN');
  obsRow(1, 'Kehadiran peserta per bulan', pct(a.kehadiran.aktual), `${a.kehadiran.benchmark}%`);
  obsRow(
    2,
    'Jumlah peserta dengan absensi di bawah target',
    `${a.dibawahTarget.total} orang`,
    '',
    `Ikhwan ${a.dibawahTarget.ikhwan} · Akhwat ${a.dibawahTarget.akhwat}`
  );
  blank();

  bold(ws.addRow(['Kehadiran peserta', 'Ikhwan', 'Akhwat', 'Rata-rata']));
  ws.addRow(['', pct(a.kehadiran.avgIkhwan), pct(a.kehadiran.avgAkhwat), pct(a.kehadiran.aktual)]);
  blank();

  bold(ws.addRow(['Peserta < 100%', 'Tidak hadir', 'Kelas', 'Keterangan']));
  for (const st of a.dibawahTarget.list) {
    ws.addRow([st.name, `${st.counts.I + st.counts.S + st.counts.A}x`, st.kelasName, st.keterangan]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="laporan-maahir-${bulan}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
