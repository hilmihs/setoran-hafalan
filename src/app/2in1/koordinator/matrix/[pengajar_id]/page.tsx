import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

const INDIKATOR: Array<{ field: string; label: string; kategori: string; standar: number }> = [
  { field: 'skor_bacaan', label: 'Kualitas Bacaan', kategori: 'Hard Skill', standar: 3 },
  { field: 'skor_hafalan', label: 'Hafalan (Tahfidz)', kategori: 'Hard Skill', standar: 1 },
  { field: 'skor_tajwid', label: 'Tajwid (nilai rekaman)', kategori: 'Hard Skill', standar: 2 },
  { field: 'skor_kehadiran_maahir', label: 'Kehadiran Kelas Maahir', kategori: 'Hard Skill', standar: 4 },
  { field: 'skor_kehadiran_tibyan', label: 'Kehadiran At-Tibyan', kategori: 'Hard Skill', standar: 4 },
  { field: 'skor_kehadiran_muallim', label: 'Kehadiran Muallim Najih', kategori: 'Hard Skill', standar: 4 },
  { field: 'skor_metode_pengajaran', label: 'Metode Pengajaran', kategori: 'Pedagogis', standar: 4 },
  { field: 'skor_kepatuhan_silabus', label: 'Kepatuhan Silabus', kategori: 'Pedagogis', standar: 4 },
  { field: 'skor_manajemen_halaqah', label: 'Manajemen Halaqah', kategori: 'Pedagogis', standar: 4 },
  { field: 'skor_evaluasi_penguasaan', label: 'Evaluasi & Penguasaan', kategori: 'Pedagogis', standar: 4 },
  { field: 'skor_kedisiplinan_waktu', label: 'Kedisiplinan Waktu', kategori: 'Soft Skill', standar: 4 },
  { field: 'skor_komitmen_jadwal', label: 'Komitmen Jadwal', kategori: 'Soft Skill', standar: 4 },
  { field: 'skor_tanggung_jawab', label: 'Tanggung Jawab', kategori: 'Soft Skill', standar: 4 },
  { field: 'skor_kepatuhan_sop', label: 'Kepatuhan SOP Teknis', kategori: 'Soft Skill', standar: 4 },
];

function skorColor(n: number | null, standar: number): string {
  if (n === null || n === undefined) return 'var(--muted-2)';
  if (n >= standar) return 'var(--hijau-ink)';
  if (n >= standar - 1) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}

export default async function MatrixDetailPage({
  params,
  searchParams,
}: {
  params: { pengajar_id: string };
  searchParams: { bulan?: string };
}) {
  const s = await getSession();
  const session = s.session;
  if (!session || (session.role !== 'koordinator' && session.role !== 'syaikh')) {
    redirect('/');
  }

  const ym = searchParams.bulan && /^\d{4}-\d{2}$/.test(searchParams.bulan)
    ? searchParams.bulan
    : currentYearMonth();

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, kelompok:kelompok_id(name)')
    .eq('id', params.pengajar_id)
    .single();
  if (!pengajar) redirect('/2in1/koordinator/matrix');

  const { data: matrix } = await supabaseAdmin
    .from('matrix_rekap')
    .select('*')
    .eq('pengajar_id', params.pengajar_id)
    .eq('year_month', ym)
    .maybeSingle();

  // Riwayat 6 bulan untuk trend
  const { data: history } = await supabaseAdmin
    .from('matrix_rekap')
    .select('year_month, rata_rata_hard_skill, rata_rata_pedagogis, rata_rata_soft_skill, rata_rata_keseluruhan, ranking')
    .eq('pengajar_id', params.pengajar_id)
    .order('year_month', { ascending: false })
    .limit(6);

  const kelompokName = (pengajar.kelompok as unknown as { name: string } | null)?.name ?? '—';
  const monthLabel = new Date(ym + '-01T00:00:00').toLocaleDateString('id-ID', {
    year: 'numeric', month: 'long',
  });

  const kategoris = ['Hard Skill', 'Pedagogis', 'Soft Skill'];
  const rataField: Record<string, string> = {
    'Hard Skill': 'rata_rata_hard_skill',
    'Pedagogis': 'rata_rata_pedagogis',
    'Soft Skill': 'rata_rata_soft_skill',
  };

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href={`/2in1/koordinator/matrix?bulan=${ym}`} className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">{pengajar.name}</div>
          <div className="sub">{kelompokName} · {pengajar.gender} · {monthLabel}</div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 18,
        }}>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>Ranking</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>
              {matrix?.ranking ?? '—'}
            </div>
          </div>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>Skor Keseluruhan</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: skorColor(matrix?.rata_rata_keseluruhan ?? null, 3) }}>
              {matrix?.rata_rata_keseluruhan != null ? Number(matrix.rata_rata_keseluruhan).toFixed(2) : '—'}
            </div>
          </div>
        </div>

        {!matrix && (
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Belum ada data matrix untuk bulan ini. Buka halaman Matrix untuk menghitung.
          </p>
        )}

        {/* 15 indikator per kategori */}
        {matrix && kategoris.map((kat) => (
          <div key={kat} style={{ marginBottom: 18 }}>
            <div className="section-row" style={{ marginBottom: 6 }}>
              <div className="t-tiny">{kat}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: skorColor((matrix as Record<string, number | null>)[rataField[kat]], 3) }}>
                {(matrix as Record<string, number | null>)[rataField[kat]] != null
                  ? Number((matrix as Record<string, number | null>)[rataField[kat]]).toFixed(2)
                  : '—'}
              </div>
            </div>
            {INDIKATOR.filter((i) => i.kategori === kat).map((ind) => {
              const val = (matrix as Record<string, number | null>)[ind.field];
              return (
                <div key={ind.field} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--bg-card)',
                  borderRadius: 8,
                  marginBottom: 4,
                }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{ind.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted-2)' }}>standar ≥ {ind.standar}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: skorColor(val, ind.standar) }}>
                    {val ?? '—'}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Trend */}
        {(history ?? []).length > 1 && (
          <div style={{ marginBottom: 18 }}>
            <div className="section-row" style={{ marginBottom: 6 }}>
              <div className="t-tiny">Trend Bulanan</div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '70px 1fr 1fr 1fr 1fr 40px',
              gap: 4,
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--muted-2)',
              textTransform: 'uppercase',
            }}>
              <div>Bulan</div>
              <div style={{ textAlign: 'center' }}>Hard</div>
              <div style={{ textAlign: 'center' }}>Ped.</div>
              <div style={{ textAlign: 'center' }}>Soft</div>
              <div style={{ textAlign: 'center' }}>Total</div>
              <div style={{ textAlign: 'center' }}>#</div>
            </div>
            {(history ?? []).map((h) => (
              <div key={h.year_month} style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 1fr 1fr 1fr 40px',
                gap: 4,
                padding: '8px',
                background: h.year_month === ym ? 'var(--bg-soft, #f5f5f5)' : 'var(--bg-card)',
                borderRadius: 8,
                marginBottom: 4,
                fontSize: 12,
                alignItems: 'center',
              }}>
                <div style={{ fontWeight: 600 }}>
                  {new Date(h.year_month + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })}
                </div>
                <div style={{ textAlign: 'center' }}>{h.rata_rata_hard_skill != null ? Number(h.rata_rata_hard_skill).toFixed(1) : '—'}</div>
                <div style={{ textAlign: 'center' }}>{h.rata_rata_pedagogis != null ? Number(h.rata_rata_pedagogis).toFixed(1) : '—'}</div>
                <div style={{ textAlign: 'center' }}>{h.rata_rata_soft_skill != null ? Number(h.rata_rata_soft_skill).toFixed(1) : '—'}</div>
                <div style={{ textAlign: 'center', fontWeight: 700 }}>{h.rata_rata_keseluruhan != null ? Number(h.rata_rata_keseluruhan).toFixed(1) : '—'}</div>
                <div style={{ textAlign: 'center', color: 'var(--muted-2)' }}>{h.ranking ?? '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
