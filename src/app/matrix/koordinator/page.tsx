import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import { StatCard } from '@/components/ui/StatCard';
import { MatrixTable, type MatrixTableRow } from '@/components/MatrixTable';
import { MatrixRekapAspek } from '@/components/matrix/MatrixRekapAspek';
import Link from 'next/link';
import { computeRiskPengajar, levelColor, levelLabel, type RiskResult } from '@/lib/risk';
import { syncMatrixIfStale, isLiveMatrixMonth } from '@/lib/matrix-compute';
import { INDIKATOR, scoreColor, type IndikatorKey } from '@/lib/matrix-indicators';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

interface SearchParams {
  bulan?: string;
  kelompok?: string;
  gender?: string;
  sync?: string;
  q?: string;
}

const SCORE_COLS =
  'pengajar_id, year_month, skor_bacaan, skor_hafalan, skor_tajwid, skor_kehadiran_maahir, skor_kehadiran_tibyan, rata_rata_hard_skill, skor_metode_pengajaran, skor_kepatuhan_silabus, skor_manajemen_halaqah, skor_evaluasi_penguasaan, rata_rata_pedagogis, skor_kedisiplinan_waktu, skor_komitmen_jadwal, skor_tanggung_jawab, skor_kepatuhan_sop, rata_rata_soft_skill, rata_rata_keseluruhan, ranking, total_teguran_bulan, total_teguran_kumulatif, finalized_at';

export default async function MatrixKoordinatorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireOneOfRoles(['koordinator']);
  const selectedMonth = searchParams.bulan || currentYearMonth();
  const selectedKelompok = searchParams.kelompok || '';
  const q = (searchParams.q || '').trim();
  const gender: Gender =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : session.gender;
  const isKoordinator = session.role === 'koordinator';
  const backHref = isKoordinator ? '/2in1/koordinator' : '/observasi/koordinator';
  const live = isLiveMatrixMonth(selectedMonth);

  // Sinkronisasi hemat: hanya recompute bila data basi (>5 mnt) atau ?sync=1 (tombol).
  // Bulan historis (seed) tak pernah dihitung ulang.
  try {
    await syncMatrixIfStale(selectedMonth, searchParams.sync === '1');
  } catch (e) {
    console.error('sync matrix gagal:', e);
  }

  const { data: kelompokList } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name')
    .eq('gender', gender)
    .order('name');

  let pengajarQuery = supabaseAdmin
    .from('pengajar')
    .select('id, name, kelompok_id, active')
    .eq('gender', gender);
  if (selectedKelompok) {
    pengajarQuery = pengajarQuery.eq('kelompok_id', selectedKelompok);
  }
  if (q) {
    pengajarQuery = pengajarQuery.ilike('name', `%${q}%`);
  }
  const { data: pengajarList } = await pengajarQuery.order('name');

  const pengajarIds = (pengajarList ?? []).map((p) => p.id);
  const kelompokMap = new Map((kelompokList ?? []).map((k) => [k.id, k.name]));

  const { data: matrixData } = pengajarIds.length
    ? await supabaseAdmin
        .from('matrix_rekap')
        .select(SCORE_COLS)
        .eq('year_month', selectedMonth)
        .in('pengajar_id', pengajarIds)
    : { data: [] };
  const matrixByPengajar = new Map((matrixData ?? []).map((m) => [m.pengajar_id, m]));

  const { data: availableMonths } = await supabaseAdmin
    .from('matrix_rekap')
    .select('year_month')
    .in('pengajar_id', pengajarIds.length ? pengajarIds : ['00000000-0000-0000-0000-000000000000'])
    .order('year_month', { ascending: false });

  const monthOptions = Array.from(
    new Set([currentYearMonth(), ...(availableMonths ?? []).map((m) => m.year_month)])
  ).sort().reverse();

  const riskByPengajar = new Map<string, RiskResult>();
  if (pengajarIds.length) {
    const results = await Promise.all(
      pengajarIds.map(async (id) => [id, await computeRiskPengajar(id)] as const)
    );
    for (const [id, r] of results) riskByPengajar.set(id, r);
  }

  const rows: MatrixTableRow[] = (pengajarList ?? []).map((p) => {
    const m = matrixByPengajar.get(p.id) as Record<string, unknown> | undefined;
    const risk = riskByPengajar.get(p.id);
    const scores: Partial<Record<IndikatorKey, number | null>> = {};
    for (const ind of INDIKATOR) {
      const v = m?.[ind.key];
      scores[ind.key] = v === null || v === undefined ? null : Number(v);
    }
    const num = (k: string) => (m && m[k] !== null && m[k] !== undefined ? Number(m[k]) : null);
    return {
      id: p.id,
      name: p.name,
      kelompokName: kelompokMap.get(p.kelompok_id ?? '') ?? '—',
      active: p.active,
      ranking: m ? (num('ranking') as number | null) : null,
      scores,
      hard: num('rata_rata_hard_skill'),
      pedagogis: num('rata_rata_pedagogis'),
      soft: num('rata_rata_soft_skill'),
      keseluruhan: num('rata_rata_keseluruhan'),
      teguranBulan: (num('total_teguran_bulan') as number) ?? 0,
      teguranKum: (num('total_teguran_kumulatif') as number) ?? 0,
      risk: risk
        ? { level: risk.level, score: risk.score, label: levelLabel(risk.level), color: levelColor(risk.level) }
        : null,
      finalized: m ? Boolean(m.finalized_at) : null,
      hasMatrix: Boolean(m),
    };
  });

  rows.sort((a, b) => {
    const ra = a.ranking ?? Number.POSITIVE_INFINITY;
    const rb = b.ranking ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  const totalPengajar = rows.length;
  const withMatrix = rows.filter((r) => r.hasMatrix);
  const avgKeseluruhan = withMatrix.length
    ? withMatrix.reduce((s, r) => s + (r.keseluruhan ?? 0), 0) / withMatrix.length
    : 0;
  const belowStd = withMatrix.filter((r) => (r.keseluruhan ?? 0) < 3).length;
  const flaggedTeguran = rows.filter((r) => r.teguranKum >= 3).length;
  const finalizedCount = withMatrix.filter((r) => r.finalized).length;

  // Helper bangun query string mempertahankan filter.
  const qs = (over: Partial<SearchParams>) => {
    const p = new URLSearchParams();
    const g = over.gender ?? gender;
    const b = over.bulan ?? selectedMonth;
    const k = over.kelompok ?? selectedKelompok;
    const qq = over.q ?? q;
    if (g !== session.gender) p.set('gender', g);
    if (b !== currentYearMonth()) p.set('bulan', b);
    if (k) p.set('kelompok', k);
    if (qq) p.set('q', qq);
    const s = p.toString();
    return s ? `/matrix/koordinator?${s}` : '/matrix/koordinator';
  };

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Matrix Skill Guru
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link href={backHref} className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
                {Icon.back(12)} Dashboard
              </Link>
              <LogoutButton />
            </div>
          </div>

          <FeatureNav current="/matrix/koordinator" />

          {/* Hero header */}
          <div
            style={{
              borderRadius: 'var(--r-xl)',
              padding: '22px 24px',
              marginBottom: 18,
              background: 'linear-gradient(135deg, var(--accent-tint), var(--surface))',
              border: '1px solid var(--accent-line)',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 className="t-h1" style={{ marginBottom: 4 }}>Matrix Skill Pengajar</h1>
                <p className="t-small" style={{ color: 'var(--muted)' }}>
                  Rekap 14 indikator · {gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · {selectedMonth}
                  {live ? ' · sinkron live' : ' · data final'}
                </p>
              </div>
              {/* Gender toggle */}
              <div style={{ display: 'inline-flex', background: 'var(--surface-3)', borderRadius: 999, padding: 3, gap: 2 }}>
                {(['ikhwan', 'akhwat'] as Gender[]).map((g) => (
                  <Link
                    key={g}
                    href={qs({ gender: g, kelompok: '' })}
                    className="btn btn-sm"
                    style={{
                      height: 32,
                      borderRadius: 999,
                      background: gender === g ? 'var(--accent)' : 'transparent',
                      color: gender === g ? '#fff' : 'var(--ink-2)',
                      border: 'none',
                    }}
                  >
                    {g === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                  </Link>
                ))}
              </div>
            </div>

            <div className="matrix-stat-grid" style={{ marginTop: 18 }}>
              <StatCard value={totalPengajar} label="Pengajar" />
              <StatCard value={fmtNum(avgKeseluruhan)} mono label="Rata-rata" valueColor={scoreColor(avgKeseluruhan, 3.5)} />
              <StatCard value={belowStd} label="Di bawah standar" valueColor={belowStd > 0 ? 'var(--merah-ink)' : undefined} />
              <StatCard value={flaggedTeguran} label="Teguran ≥3" valueColor={flaggedTeguran > 0 ? 'var(--merah-ink)' : undefined} />
              <StatCard value={`${finalizedCount}/${withMatrix.length}`} label="Finalized" />
            </div>
          </div>

          {/* Filter bar */}
          <form method="get" className="card-flat" style={{ padding: 12, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input type="hidden" name="gender" value={gender} />
            <div style={{ flex: '1 1 150px', minWidth: 130 }}>
              <label className="t-tiny" htmlFor="matrix_bulan" style={{ display: 'block', marginBottom: 4 }}>Bulan</label>
              <select id="matrix_bulan" name="bulan" defaultValue={selectedMonth} className="select" style={{ height: 38 }}>
                {monthOptions.map((ym) => <option key={ym} value={ym}>{ym}</option>)}
              </select>
            </div>
            <div style={{ flex: '2 1 220px', minWidth: 180 }}>
              <label className="t-tiny" htmlFor="matrix_kelompok" style={{ display: 'block', marginBottom: 4 }}>Kelompok</label>
              <select id="matrix_kelompok" name="kelompok" defaultValue={selectedKelompok} className="select" style={{ height: 38 }}>
                <option value="">Semua kelompok</option>
                {(kelompokList ?? []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
            <div style={{ flex: '2 1 200px', minWidth: 160 }}>
              <label className="t-tiny" htmlFor="matrix_q" style={{ display: 'block', marginBottom: 4 }}>Cari nama</label>
              <input id="matrix_q" name="q" type="search" defaultValue={q} placeholder="Nama pengajar…" className="input" style={{ height: 38 }} />
            </div>
            <button type="submit" className="btn btn-ghost btn-sm" style={{ height: 38 }}>Terapkan</button>
            {live && (
              <Link href={`${qs({})}${qs({}).includes('?') ? '&' : '?'}sync=1`} className="btn btn-ghost btn-sm" style={{ height: 38 }} title="Hitung ulang dari sumber data">
                ↻ Sinkronkan
              </Link>
            )}
            <a
              href={`/api/matrix/download?bulan=${selectedMonth}&gender=${gender}${selectedKelompok ? `&kelompok=${selectedKelompok}` : ''}`}
              className="btn btn-accent btn-sm"
              style={{ height: 38, marginLeft: 'auto' }}
            >
              Export Excel
            </a>
          </form>

          {totalPengajar === 0 && (
            <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
              <p className="t-body" style={{ color: 'var(--muted)' }}>Tidak ada pengajar untuk filter ini.</p>
            </div>
          )}

          {totalPengajar > 0 && withMatrix.length === 0 && (
            <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
              <p className="t-body" style={{ color: 'var(--muted)' }}>
                Belum ada data matrix untuk bulan {selectedMonth}. Isi penilaian masyaikh, pedagogis,
                kehadiran & laporan ketua kelas, lalu klik <strong>Sinkronkan</strong>.
              </p>
            </div>
          )}

          {withMatrix.length > 0 && (
            <>
              <MatrixRekapAspek rows={withMatrix} />
              <MatrixTable rows={rows} month={selectedMonth} gender={gender} />
            </>
          )}

          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 16 }}>
            Standar: Bacaan ≥3 · Hafalan ≥1 · Tajwid ≥2 · Kehadiran ≥4 · Pedagogis ≥4 · Soft ≥4.
            Hijau = melampaui, kuning = mendekati, merah = di bawah. Teguran kumulatif ≥3 = peringatan
            terakhir sebelum nonaktif (4 teguran).
          </p>
        </div>
      </div>
    </main>
  );
}
