import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { INDIKATOR } from '@/lib/matrix-indicators';

const KAT_SHORT: Record<string, string> = { hard: 'Hard Skill', pedagogis: 'Pedagogis', soft: 'Soft Skill' };
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const s = await getSession();
  const acc = s.accesses?.find(
    (a) => a.role === 'koordinator'
  ) ?? (s.session && s.session.role === 'koordinator'
    ? s.session
    : null);
  if (!acc) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const bulan = searchParams.get('bulan');
  const kelompokId = searchParams.get('kelompok') ?? '';
  if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
    return NextResponse.json({ error: 'Parameter bulan harus YYYY-MM.' }, { status: 400 });
  }

  const genderParam = searchParams.get('gender');
  const gender = genderParam === 'ikhwan' || genderParam === 'akhwat' ? genderParam : acc.gender;

  const { data: kelompokList } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name')
    .eq('gender', gender);
  const kelompokMap = new Map((kelompokList ?? []).map((k) => [k.id, k.name]));

  let pq = supabaseAdmin
    .from('pengajar')
    .select('id, name, kelompok_id, active')
    .eq('gender', gender)
    .neq('matrix_exclude', true); // guru observasi-saja (mis. DPQ) tak masuk matrix
  if (kelompokId) pq = pq.eq('kelompok_id', kelompokId);
  const { data: pengajarList } = await pq.order('name');

  const pengajarIds = (pengajarList ?? []).map((p) => p.id);
  const { data: matrixData } = pengajarIds.length
    ? await supabaseAdmin
        .from('matrix_rekap')
        .select('*')
        .eq('year_month', bulan)
        .in('pengajar_id', pengajarIds)
    : { data: [] };

  const matrixByPengajar = new Map((matrixData ?? []).map((m) => [m.pengajar_id, m]));

  // ── Mode "belum lengkap" (?incomplete=1): hanya pengajar dgn ≥1 indikator kosong,
  //    + kolom rincian bagian yang belum terisi (dikelompokkan per kategori) + halaqah.
  if (req.nextUrl.searchParams.get('incomplete') === '1') {
    const { data: halaqahData } = pengajarIds.length
      ? await supabaseAdmin
          .from('hits_halaqah')
          .select('pengajar_id, name')
          .in('pengajar_id', pengajarIds)
          .eq('active', true)
      : { data: [] };
    const halaqahByPengajar = new Map<string, string[]>();
    for (const h of halaqahData ?? []) {
      if (!h.pengajar_id) continue;
      const arr = halaqahByPengajar.get(h.pengajar_id) ?? [];
      arr.push(h.name);
      halaqahByPengajar.set(h.pengajar_id, arr);
    }

    const wbI = new ExcelJS.Workbook();
    wbI.creator = 'Maahir';
    wbI.created = new Date();
    const sh = wbI.addWorksheet('Belum Lengkap');
    sh.columns = [
      { header: 'Nama', key: 'nama', width: 28 },
      { header: 'Kelompok', key: 'kelompok', width: 18 },
      { header: 'Aktif', key: 'active', width: 8 },
      { header: 'Halaqah', key: 'halaqah', width: 44 },
      { header: 'Terisi', key: 'terisi', width: 8 },
      { header: 'Bagian Belum Terisi', key: 'kosong', width: 80 },
    ];
    sh.getRow(1).font = { bold: true };

    let count = 0;
    for (const p of pengajarList ?? []) {
      const m = matrixByPengajar.get(p.id) as Record<string, unknown> | undefined;
      const kosong = INDIKATOR.filter((i) => !m || m[i.key] == null);
      if (kosong.length === 0) continue; // sudah lengkap → skip
      count++;
      const byKat: Record<string, string[]> = {};
      for (const ind of kosong) (byKat[ind.kategori] ??= []).push(ind.label);
      const detail = (['hard', 'pedagogis', 'soft'] as const)
        .filter((k) => byKat[k]?.length)
        .map((k) => `${KAT_SHORT[k]}: ${byKat[k].join(', ')}`)
        .join('  |  ');
      const hal = halaqahByPengajar.get(p.id);
      sh.addRow({
        nama: p.name,
        kelompok: kelompokMap.get(p.kelompok_id ?? '') ?? '',
        active: p.active ? 'Ya' : 'Tidak',
        halaqah: hal && hal.length ? hal.join(', ') : '(tak ada halaqah aktif)',
        terisi: `${INDIKATOR.length - kosong.length}/${INDIKATOR.length}`,
        kosong: detail,
      });
    }
    if (count === 0) sh.addRow({ nama: '(semua pengajar sudah lengkap)' });

    const buf = await wbI.xlsx.writeBuffer();
    const fn = `matrix-belum-lengkap-${bulan}-${gender}${kelompokId ? `-${kelompokId.slice(0, 8)}` : ''}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${fn}"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Matrix Skill');
  sheet.columns = [
    { header: 'Rank', key: 'rank', width: 6 },
    { header: 'Nama', key: 'nama', width: 28 },
    { header: 'Kelompok', key: 'kelompok', width: 18 },
    { header: 'Aktif', key: 'active', width: 8 },
    { header: 'Bacaan', key: 'bacaan', width: 8 },
    { header: 'Hafalan', key: 'hafalan', width: 8 },
    { header: 'Tajwid', key: 'tajwid', width: 8 },
    { header: 'Kehadiran Maahir', key: 'kehadiran_maahir', width: 16 },
    { header: 'Kehadiran At-Tibyan', key: 'kehadiran_tibyan', width: 18 },
    { header: 'Rata² Hard', key: 'hard', width: 10 },
    { header: 'Metode Pengajaran', key: 'metode', width: 18 },
    { header: 'Kepatuhan Silabus', key: 'silabus', width: 18 },
    { header: 'Manajemen Halaqah', key: 'manajemen', width: 18 },
    { header: 'Kepatuhan SOP', key: 'sop', width: 14 },
    { header: 'Rata² Pedagogis', key: 'pedagogis', width: 14 },
    { header: 'Disiplin Waktu', key: 'disiplin', width: 14 },
    { header: 'Komitmen Jadwal', key: 'komitmen', width: 16 },
    { header: 'Tanggung Jawab', key: 'tanggungjawab', width: 16 },
    { header: 'Evaluasi Penguasaan', key: 'evaluasi', width: 18 },
    { header: 'Rata² Soft', key: 'soft', width: 10 },
    { header: 'Rata² Keseluruhan', key: 'keseluruhan', width: 18 },
    { header: 'Teguran Bulan', key: 'teguran_bulan', width: 14 },
    { header: 'Teguran Kumulatif', key: 'teguran_kum', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const p of pengajarList ?? []) {
    const m = matrixByPengajar.get(p.id);
    sheet.addRow({
      rank: m?.ranking ?? '',
      nama: p.name,
      kelompok: kelompokMap.get(p.kelompok_id ?? '') ?? '',
      active: p.active ? 'Ya' : 'Tidak',
      bacaan: m?.skor_bacaan ?? '',
      hafalan: m?.skor_hafalan ?? '',
      tajwid: m?.skor_tajwid ?? '',
      kehadiran_maahir: m?.skor_kehadiran_maahir ?? '',
      kehadiran_tibyan: m?.skor_kehadiran_tibyan ?? '',
      hard: m?.rata_rata_hard_skill ?? '',
      metode: m?.skor_metode_pengajaran ?? '',
      silabus: m?.skor_kepatuhan_silabus ?? '',
      manajemen: m?.skor_manajemen_halaqah ?? '',
      evaluasi: m?.skor_evaluasi_penguasaan ?? '',
      pedagogis: m?.rata_rata_pedagogis ?? '',
      disiplin: m?.skor_kedisiplinan_waktu ?? '',
      komitmen: m?.skor_komitmen_jadwal ?? '',
      tanggungjawab: m?.skor_tanggung_jawab ?? '',
      sop: m?.skor_kepatuhan_sop ?? '',
      soft: m?.rata_rata_soft_skill ?? '',
      keseluruhan: m?.rata_rata_keseluruhan ?? '',
      teguran_bulan: m?.total_teguran_bulan ?? 0,
      teguran_kum: m?.total_teguran_kumulatif ?? 0,
      status: m?.finalized_at ? 'Final' : m ? 'Draft' : 'Belum',
    });
  }

  // Standar header row (legenda di bawah)
  sheet.addRow({});
  const legendRow = sheet.addRow({
    nama: 'Standar per indikator',
    bacaan: '≥3',
    hafalan: '≥1',
    tajwid: '≥2',
    kehadiran_maahir: '≥4',
    kehadiran_tibyan: '≥4',
    metode: '≥4',
    silabus: '≥4',
    manajemen: '≥4',
    evaluasi: '≥4',
    disiplin: '≥4',
    komitmen: '≥4',
    tanggungjawab: '≥4',
    sop: '≥4',
  });
  legendRow.font = { italic: true, color: { argb: 'FF7A766F' } };

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `matrix-${bulan}-${gender}${kelompokId ? `-${kelompokId.slice(0, 8)}` : ''}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
