import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Initials } from '@/components/icons';
import { MatrixTrendChart } from '@/components/charts/MatrixTrendChart';
import { MatrixRadarChart, type RadarDataPoint } from '@/components/charts/MatrixRadarChart';

export const dynamic = 'force-dynamic';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

const INDIKATOR: Array<{
  field: string;
  label: string;
  short: string;
  kategori: 'Hard Skill' | 'Pedagogis' | 'Soft Skill';
  standar: number;
}> = [
  { field: 'skor_bacaan',            label: 'Kualitas Bacaan',       short: 'Bacaan',    kategori: 'Hard Skill', standar: 3 },
  { field: 'skor_hafalan',           label: 'Hafalan (Tahfidz)',      short: 'Hafalan',   kategori: 'Hard Skill', standar: 1 },
  { field: 'skor_tajwid',            label: 'Tajwid (nilai rekaman)', short: 'Tajwid',    kategori: 'Hard Skill', standar: 2 },
  { field: 'skor_kehadiran_maahir',  label: 'Kehadiran Kelas Maahir',short: 'Hdr Maahir',kategori: 'Hard Skill', standar: 4 },
  { field: 'skor_kehadiran_tibyan',  label: 'Kehadiran At-Tibyan',   short: 'At-Tibyan', kategori: 'Hard Skill', standar: 4 },
  { field: 'skor_metode_pengajaran', label: 'Metode Pengajaran',     short: 'Metode',    kategori: 'Pedagogis',  standar: 4 },
  { field: 'skor_kepatuhan_silabus', label: 'Kepatuhan Silabus',     short: 'Silabus',   kategori: 'Pedagogis',  standar: 4 },
  { field: 'skor_manajemen_halaqah', label: 'Manajemen Halaqah',     short: 'Halaqah',   kategori: 'Pedagogis',  standar: 4 },
  { field: 'skor_kepatuhan_sop',     label: 'Kepatuhan SOP Teknis',  short: 'SOP',       kategori: 'Pedagogis',  standar: 4 },
  { field: 'skor_kedisiplinan_waktu',label: 'Kedisiplinan Waktu',    short: 'Disiplin',  kategori: 'Soft Skill', standar: 4 },
  { field: 'skor_komitmen_jadwal',   label: 'Komitmen Jadwal',       short: 'Komitmen',  kategori: 'Soft Skill', standar: 4 },
  { field: 'skor_tanggung_jawab',    label: 'Tanggung Jawab',        short: 'Tanggung J',kategori: 'Soft Skill', standar: 4 },
  { field: 'skor_evaluasi_penguasaan',label:'Evaluasi & Penguasaan', short: 'Evaluasi',  kategori: 'Soft Skill', standar: 4 },
];

const KATEGORI_COLOR: Record<string, string> = {
  'Hard Skill': 'var(--hijau)',
  'Pedagogis':  'var(--kuning)',
  'Soft Skill': 'var(--accent)',
};

const KATEGORI_TINT: Record<string, string> = {
  'Hard Skill': 'var(--hijau-tint)',
  'Pedagogis':  'var(--kuning-tint)',
  'Soft Skill': 'var(--accent-tint)',
};

const KATEGORI_INK: Record<string, string> = {
  'Hard Skill': 'var(--hijau-ink)',
  'Pedagogis':  'var(--kuning-ink)',
  'Soft Skill': 'var(--accent-2)',
};

function skorColor(n: number | null, standar: number): string {
  if (n === null || n === undefined) return 'var(--muted-2)';
  if (n >= standar) return 'var(--hijau-ink)';
  if (n >= standar - 1) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}

function skorColorGlobal(n: number | null): string {
  if (n === null || n === undefined) return 'var(--muted-2)';
  if (n >= 3) return 'var(--hijau-ink)';
  if (n >= 2) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}

function fmt2(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(2);
}

function fmtRankDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta > 0) return `▲${delta}`;
  if (delta < 0) return `▼${Math.abs(delta)}`;
  return null;
}

export default async function MatrixDetailPage({
  params,
  searchParams,
}: {
  params: { pengajar_id: string };
  searchParams: { bulan?: string };
}) {
  const session = await requireOneOfRoles(['koordinator', 'syaikh']);

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

  // Riwayat 6 bulan untuk trend — dipakai juga untuk delta (history[1])
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

  // Delta dari snapshot bulan lalu (history[1] — index 0 adalah bulan ini)
  const prevSnapshot = (history ?? []).length > 1 ? (history ?? [])[1] : null;
  const deltaTotal =
    matrix?.rata_rata_keseluruhan != null && prevSnapshot?.rata_rata_keseluruhan != null
      ? Math.round((Number(matrix.rata_rata_keseluruhan) - Number(prevSnapshot.rata_rata_keseluruhan)) * 10) / 10
      : null;
  const deltaRank =
    matrix?.ranking != null && prevSnapshot?.ranking != null
      ? Number(prevSnapshot.ranking) - Number(matrix.ranking)
      : null;

  // Radar data
  const radarData: RadarDataPoint[] = INDIKATOR.map((ind) => ({
    indikator: ind.short,
    skor: matrix ? ((matrix as Record<string, number | null>)[ind.field] ?? null) : null,
    standar: ind.standar,
  }));

  const kategoris: Array<'Hard Skill' | 'Pedagogis' | 'Soft Skill'> = ['Hard Skill', 'Pedagogis', 'Soft Skill'];
  const rataField: Record<string, string> = {
    'Hard Skill': 'rata_rata_hard_skill',
    'Pedagogis':  'rata_rata_pedagogis',
    'Soft Skill': 'rata_rata_soft_skill',
  };

  const backHref = `/2in1/koordinator/matrix?bulan=${ym}`;

  const memenuhi =
    matrix?.rata_rata_keseluruhan != null
      ? Number(matrix.rata_rata_keseluruhan) >= 3
      : null;

  return (
    <main style={{ minHeight: '100vh', paddingBottom: 80 }}>
      {/* Topbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <Link href={backHref} className="topbar back" style={{ flexShrink: 0 }}>
          ← Kembali
        </Link>
        <span style={{ width: 1, height: 14, background: 'var(--line-2)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pengajar.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {kelompokName} · {pengajar.gender} · {monthLabel}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '20px 16px 0',
          maxWidth: 800,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Header card: big avatar + identity */}
        <div
          className="card-flat"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '18px 20px',
            marginBottom: 16,
          }}
        >
          <div
            className="avatar"
            style={{
              width: 56,
              height: 56,
              fontSize: 20,
              background: 'var(--accent-tint)',
              color: 'var(--accent-2)',
              flexShrink: 0,
            }}
          >
            <Initials name={pengajar.name} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {pengajar.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              {kelompokName} · {pengajar.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 2 }}>{monthLabel}</div>
          </div>
        </div>

        {/* 3-stat summary band */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
            marginBottom: 20,
          }}
        >
          {/* Ranking */}
          <div className="stat">
            <div className="t-tiny" style={{ marginBottom: 4 }}>Ranking</div>
            <div className="v t-mono">
              {matrix?.ranking ?? '—'}
            </div>
            {deltaRank !== null && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: deltaRank > 0 ? 'var(--hijau-ink)' : deltaRank < 0 ? 'var(--merah-ink)' : 'var(--muted)',
                }}
              >
                {fmtRankDelta(deltaRank) ?? '='}
              </div>
            )}
          </div>

          {/* Skor Keseluruhan */}
          <div className="stat">
            <div className="t-tiny" style={{ marginBottom: 4 }}>Skor Keseluruhan</div>
            <div
              className="v t-mono"
              style={{ color: skorColorGlobal(matrix?.rata_rata_keseluruhan ?? null) }}
            >
              {fmt2(matrix?.rata_rata_keseluruhan)}
            </div>
            {deltaTotal !== null && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: deltaTotal > 0 ? 'var(--hijau-ink)' : deltaTotal < 0 ? 'var(--merah-ink)' : 'var(--muted)',
                }}
              >
                {deltaTotal > 0 ? `▲${deltaTotal.toFixed(1)}` : deltaTotal < 0 ? `▼${Math.abs(deltaTotal).toFixed(1)}` : '='}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="stat">
            <div className="t-tiny" style={{ marginBottom: 4 }}>Status</div>
            {memenuhi === null ? (
              <div className="v" style={{ fontSize: 14, color: 'var(--muted)' }}>Belum dinilai</div>
            ) : memenuhi ? (
              <div>
                <span className="badge badge-hijau">
                  <span className="dot" />
                  Memenuhi Standar
                </span>
              </div>
            ) : (
              <div>
                <span className="badge badge-merah">
                  <span className="dot" />
                  Perlu Pembinaan
                </span>
              </div>
            )}
          </div>
        </div>

        {!matrix && (
          <div
            className="card-flat"
            style={{
              padding: '14px 18px',
              marginBottom: 20,
              borderLeft: '3px solid var(--kuning)',
            }}
          >
            <p className="t-small" style={{ color: 'var(--muted)' }}>
              Belum ada data matrix untuk bulan ini. Buka halaman Matrix untuk menghitung.
            </p>
          </div>
        )}

        {/* Radar island */}
        {matrix && (
          <div className="card-flat" style={{ padding: '16px', marginBottom: 20 }}>
            <div className="t-tiny" style={{ marginBottom: 10 }}>
              Profil Kompetensi (14 Indikator)
            </div>
            <MatrixRadarChart data={radarData} height={260} />
            <div
              style={{
                display: 'flex',
                gap: 14,
                justifyContent: 'center',
                marginTop: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 20,
                    height: 2,
                    borderBottom: '2px dashed var(--muted-2)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Standar</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background: 'var(--accent)',
                    opacity: 0.5,
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Skor Aktual</span>
              </div>
            </div>
          </div>
        )}

        {/* Per-indikator progress bars */}
        {matrix &&
          kategoris.map((kat) => {
            const rataVal = (matrix as Record<string, number | null>)[rataField[kat]];
            const color = KATEGORI_COLOR[kat];
            const ink = KATEGORI_INK[kat];
            const tint = KATEGORI_TINT[kat];
            return (
              <div key={kat} style={{ marginBottom: 20 }}>
                {/* Kategori header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    padding: '6px 10px',
                    background: tint,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <div
                    className="t-tiny"
                    style={{ color: ink }}
                  >
                    {kat}
                  </div>
                  <div
                    className="t-mono"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: skorColorGlobal(rataVal),
                    }}
                  >
                    {fmt2(rataVal)}
                  </div>
                </div>

                {INDIKATOR.filter((i) => i.kategori === kat).map((ind) => {
                  const val = (matrix as Record<string, number | null>)[ind.field];
                  const pct = val !== null ? (val / 4) * 100 : 0;
                  const stdPct = (ind.standar / 4) * 100;
                  return (
                    <div
                      key={ind.field}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--r-sm)',
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          marginBottom: 6,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                            {ind.label}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted-2)' }}>
                            standar ≥ {ind.standar}
                          </div>
                        </div>
                        <div
                          className="t-mono"
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: skorColor(val, ind.standar),
                          }}
                        >
                          {val !== null ? val : '—'}
                        </div>
                      </div>

                      {/* Progress bar with standar tick */}
                      <div
                        style={{
                          position: 'relative',
                          height: 8,
                          background: 'var(--line)',
                          borderRadius: 4,
                          overflow: 'visible',
                        }}
                      >
                        {val !== null && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: `${pct}%`,
                              background: color,
                              borderRadius: 4,
                              transition: 'width 0.25s ease',
                            }}
                          />
                        )}
                        {/* Standar tick */}
                        <div
                          className="std-tick"
                          style={{
                            left: `${stdPct}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

        {/* Trend chart + compact table */}
        {(history ?? []).length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <div className="section-row" style={{ marginBottom: 10 }}>
              <div className="t-tiny">Trend Bulanan</div>
            </div>

            <div className="card-flat" style={{ padding: '12px 0 4px', marginBottom: 12 }}>
              <MatrixTrendChart data={history ?? []} height={220} />
            </div>

            {/* Compact history table */}
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Bulan</th>
                      <th style={{ textAlign: 'center' }}>Hard</th>
                      <th style={{ textAlign: 'center' }}>Ped.</th>
                      <th style={{ textAlign: 'center' }}>Soft</th>
                      <th style={{ textAlign: 'center' }}>Total</th>
                      <th style={{ textAlign: 'center' }}>#</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history ?? []).map((h) => (
                      <tr
                        key={h.year_month}
                        style={{
                          background: h.year_month === ym ? 'var(--accent-tint)' : undefined,
                          fontWeight: h.year_month === ym ? 600 : undefined,
                        }}
                      >
                        <td style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                          {new Date(h.year_month + '-01T00:00:00').toLocaleDateString('id-ID', {
                            month: 'short',
                            year: '2-digit',
                          })}
                        </td>
                        <td
                          className="t-mono"
                          style={{
                            textAlign: 'center',
                            color: skorColorGlobal(h.rata_rata_hard_skill ?? null),
                          }}
                        >
                          {h.rata_rata_hard_skill != null ? Number(h.rata_rata_hard_skill).toFixed(1) : '—'}
                        </td>
                        <td
                          className="t-mono"
                          style={{
                            textAlign: 'center',
                            color: skorColorGlobal(h.rata_rata_pedagogis ?? null),
                          }}
                        >
                          {h.rata_rata_pedagogis != null ? Number(h.rata_rata_pedagogis).toFixed(1) : '—'}
                        </td>
                        <td
                          className="t-mono"
                          style={{
                            textAlign: 'center',
                            color: skorColorGlobal(h.rata_rata_soft_skill ?? null),
                          }}
                        >
                          {h.rata_rata_soft_skill != null ? Number(h.rata_rata_soft_skill).toFixed(1) : '—'}
                        </td>
                        <td
                          className="t-mono"
                          style={{
                            textAlign: 'center',
                            fontWeight: 700,
                            color: skorColorGlobal(h.rata_rata_keseluruhan ?? null),
                          }}
                        >
                          {h.rata_rata_keseluruhan != null ? Number(h.rata_rata_keseluruhan).toFixed(1) : '—'}
                        </td>
                        <td
                          className="t-mono"
                          style={{ textAlign: 'center', color: 'var(--muted-2)' }}
                        >
                          {h.ranking ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
