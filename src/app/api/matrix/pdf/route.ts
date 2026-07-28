import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  INDIKATOR,
  INDIKATOR_BY_KATEGORI,
  KATEGORI_STANDAR,
  type Kategori,
} from '@/lib/matrix-indicators';

export const runtime = 'nodejs';
export const maxDuration = 60;

const KAT_ORDER: Kategori[] = ['hard', 'pedagogis', 'soft'];
const KAT_SHORT: Record<Kategori, string> = {
  hard: 'Hard Skill',
  pedagogis: 'Pedagogis',
  soft: 'Soft Skill',
};
const STANDAR_KESELURUHAN = 3.5; // sesuai pewarnaan MatrixTable (kolom Rata²)

/** Warna cell skor relatif standar — cerminan scoreColor() untuk PDF (hex konkret). */
function pdfScaleFill(
  value: number | null | undefined,
  standar: number
): { bg: string; fg: string } {
  if (value === null || value === undefined) return { bg: '#F3F4F6', fg: '#6B7280' };
  if (value >= standar) return { bg: '#DCFCE7', fg: '#166534' };
  if (value >= standar - 1) return { bg: '#FEF9C3', fg: '#854D0E' };
  return { bg: '#FEE2E2', fg: '#991B1B' };
}

function currentYearMonthJakarta(): string {
  return new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return String(n);
}

// ── Lebar kolom (pt). A4 landscape ≈ 842pt, margin 24pt → ~794pt usable. ──────
const W_RANK = 24;
const W_NAMA = 108;
const W_KELOMPOK = 70;
const W_IND = 34; // tiap indikator
const W_AVG = 36; // rata-rata per kategori
const W_TOTAL = 42; // rata-rata keseluruhan

const styles = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingVertical: 22, fontSize: 7 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1F3A2E' },
  subtitle: { fontSize: 8, color: '#6B6B6B', marginTop: 2 },
  legendRow: { flexDirection: 'row', marginTop: 8, marginBottom: 8, gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 7, color: '#4B4B4B' },

  row: { flexDirection: 'row', alignItems: 'stretch' },
  // Header sel
  hGroup: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: '#FFFFFF',
    backgroundColor: '#1F3A2E',
    textAlign: 'center',
    paddingVertical: 3,
    borderRightWidth: 1,
    borderRightColor: '#FFFFFF',
  },
  hCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 6.5,
    color: '#FFFFFF',
    backgroundColor: '#33564A',
    textAlign: 'center',
    paddingVertical: 3,
    paddingHorizontal: 1,
    borderRightWidth: 0.5,
    borderRightColor: '#FFFFFF',
    justifyContent: 'center',
  },
  hName: { textAlign: 'left', paddingHorizontal: 3 },
  // Data sel
  cell: {
    fontSize: 6.5,
    paddingVertical: 2.5,
    paddingHorizontal: 1,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#E5E7EB',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
    justifyContent: 'center',
  },
  cellName: { textAlign: 'left', paddingHorizontal: 3 },
  cellText: { fontSize: 6.5 },
});

type RowData = {
  rank: number | null;
  nama: string;
  kelompok: string;
  active: boolean;
  scores: Record<string, number | null>;
  hard: number | null;
  pedagogis: number | null;
  soft: number | null;
  keseluruhan: number | null;
};

function ScoreCell({
  value,
  standar,
  width,
  bold,
  fixedFmt,
}: {
  value: number | null;
  standar: number;
  width: number;
  bold?: boolean;
  fixedFmt?: boolean;
}) {
  const { bg, fg } = pdfScaleFill(value, standar);
  return React.createElement(
    View,
    { style: [styles.cell, { width, backgroundColor: bg }] },
    React.createElement(
      Text,
      {
        style: {
          fontSize: 6.5,
          color: fg,
          fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica',
        },
      },
      fixedFmt ? fmt(value) : value === null || value === undefined ? '—' : String(value)
    )
  );
}

function HeaderRows() {
  const e = React.createElement;
  // Baris 1: group header per kategori
  const groupRow = e(
    View,
    { style: styles.row },
    e(Text, { style: [styles.hGroup, { width: W_RANK }] }, ''),
    e(Text, { style: [styles.hGroup, { width: W_NAMA }] }, ''),
    e(Text, { style: [styles.hGroup, { width: W_KELOMPOK }] }, ''),
    ...KAT_ORDER.map((k) =>
      e(
        Text,
        {
          key: k,
          style: [
            styles.hGroup,
            { width: INDIKATOR_BY_KATEGORI[k].length * W_IND + W_AVG },
          ],
        },
        KAT_SHORT[k]
      )
    ),
    e(Text, { style: [styles.hGroup, { width: W_TOTAL }] }, '')
  );

  // Baris 2: kolom header
  const colCells: React.ReactNode[] = [
    e(View, { key: 'rank', style: [styles.hCell, { width: W_RANK }] }, e(Text, { style: styles.cellText }, 'Rk')),
    e(View, { key: 'nama', style: [styles.hCell, styles.hName, { width: W_NAMA }] }, e(Text, { style: styles.cellText }, 'Pengajar')),
    e(View, { key: 'kel', style: [styles.hCell, styles.hName, { width: W_KELOMPOK }] }, e(Text, { style: styles.cellText }, 'Kelompok')),
  ];
  for (const k of KAT_ORDER) {
    for (const ind of INDIKATOR_BY_KATEGORI[k]) {
      colCells.push(
        e(View, { key: ind.key, style: [styles.hCell, { width: W_IND }] }, e(Text, { style: styles.cellText }, ind.short))
      );
    }
    colCells.push(
      e(View, { key: `avg-${k}`, style: [styles.hCell, { width: W_AVG }] }, e(Text, { style: styles.cellText }, 'Rt²'))
    );
  }
  colCells.push(
    e(View, { key: 'total', style: [styles.hCell, { width: W_TOTAL }] }, e(Text, { style: styles.cellText }, 'Total'))
  );
  const colRow = e(View, { style: styles.row }, ...colCells);

  return e(View, { fixed: true }, groupRow, colRow);
}

function DataRow({ r }: { r: RowData }) {
  const e = React.createElement;
  const cells: React.ReactNode[] = [
    e(View, { key: 'rank', style: [styles.cell, { width: W_RANK }] }, e(Text, { style: styles.cellText }, fmtInt(r.rank))),
    e(
      View,
      { key: 'nama', style: [styles.cell, styles.cellName, { width: W_NAMA }] },
      e(Text, { style: [styles.cellText, r.active ? {} : { color: '#991B1B' }] }, r.active ? r.nama : `${r.nama} (nonaktif)`)
    ),
    e(View, { key: 'kel', style: [styles.cell, styles.cellName, { width: W_KELOMPOK }] }, e(Text, { style: styles.cellText }, r.kelompok || '—')),
  ];
  for (const k of KAT_ORDER) {
    for (const ind of INDIKATOR_BY_KATEGORI[k]) {
      cells.push(
        e(ScoreCell, { key: ind.key, value: r.scores[ind.key] ?? null, standar: ind.standar, width: W_IND })
      );
    }
    const avgVal = k === 'hard' ? r.hard : k === 'pedagogis' ? r.pedagogis : r.soft;
    cells.push(
      e(ScoreCell, { key: `avg-${k}`, value: avgVal, standar: KATEGORI_STANDAR[k], width: W_AVG, bold: true, fixedFmt: true })
    );
  }
  cells.push(
    e(ScoreCell, { key: 'total', value: r.keseluruhan, standar: STANDAR_KESELURUHAN, width: W_TOTAL, bold: true, fixedFmt: true })
  );
  return e(View, { style: styles.row, wrap: false }, ...cells);
}

function MatrixDoc({
  rows,
  bulan,
  genderLabel,
}: {
  rows: RowData[];
  bulan: string;
  genderLabel: string;
}) {
  const e = React.createElement;
  const legend = [
    { c: '#DCFCE7', t: 'Hijau: memenuhi/melampaui standar' },
    { c: '#FEF9C3', t: 'Kuning: mendekati (kurang 1)' },
    { c: '#FEE2E2', t: 'Merah: di bawah standar' },
    { c: '#F3F4F6', t: 'Abu: belum dinilai' },
  ];
  return e(
    Document,
    null,
    e(
      Page,
      { size: 'A4', orientation: 'landscape', style: styles.page },
      e(Text, { style: styles.title }, `Matrix Skill Guru — ${bulan} · ${genderLabel}`),
      e(
        Text,
        { style: styles.subtitle },
        `${rows.length} pengajar · ${INDIKATOR.length} indikator (Hard, Pedagogis, Soft) · standar per indikator diwarnai per sel`
      ),
      e(
        View,
        { style: styles.legendRow },
        ...legend.map((l, i) =>
          e(
            View,
            { key: i, style: styles.legendItem },
            e(View, { style: [styles.legendSwatch, { backgroundColor: l.c }] }),
            e(Text, { style: styles.legendText }, l.t)
          )
        )
      ),
      e(HeaderRows, null),
      ...rows.map((r, i) => e(DataRow, { key: i, r }))
    )
  );
}

export async function GET(req: NextRequest) {
  const s = await getSession();
  const acc =
    s.accesses?.find((a) => a.role === 'koordinator') ??
    (s.session && s.session.role === 'koordinator' ? s.session : null);
  if (!acc) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const bulan = searchParams.get('bulan') || currentYearMonthJakarta();
  if (!/^\d{4}-\d{2}$/.test(bulan)) {
    return NextResponse.json({ error: 'Parameter bulan harus YYYY-MM.' }, { status: 400 });
  }
  const kelompokId = searchParams.get('kelompok') ?? '';
  const genderParam = searchParams.get('gender');
  const gender =
    genderParam === 'ikhwan' || genderParam === 'akhwat' ? genderParam : acc.gender;

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
  const matrixByPengajar = new Map(
    (matrixData ?? []).map((m) => [m.pengajar_id, m as Record<string, unknown>])
  );

  const num = (m: Record<string, unknown> | undefined, k: string): number | null =>
    m && m[k] !== null && m[k] !== undefined ? Number(m[k]) : null;

  const rows: RowData[] = (pengajarList ?? []).map((p) => {
    const m = matrixByPengajar.get(p.id);
    const scores: Record<string, number | null> = {};
    for (const ind of INDIKATOR) scores[ind.key] = num(m, ind.key);
    return {
      rank: num(m, 'ranking'),
      nama: p.name,
      kelompok: kelompokMap.get(p.kelompok_id ?? '') ?? '',
      active: p.active,
      scores,
      hard: num(m, 'rata_rata_hard_skill'),
      pedagogis: num(m, 'rata_rata_pedagogis'),
      soft: num(m, 'rata_rata_soft_skill'),
      keseluruhan: num(m, 'rata_rata_keseluruhan'),
    };
  });

  // Urut: ranking (yang punya) dulu, lalu nama — sama seperti tabel koordinator.
  rows.sort((a, b) => {
    const ra = a.rank ?? Number.POSITIVE_INFINITY;
    const rb = b.rank ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.nama.localeCompare(b.nama);
  });

  const genderLabel = gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
  const buffer = await renderToBuffer(MatrixDoc({ rows, bulan, genderLabel }));
  const fileName = `matrix-${bulan}-${gender}${kelompokId ? `-${kelompokId.slice(0, 8)}` : ''}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
