import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(2);
}

function scoreColor(value: number | null | undefined, standar: number): string {
  if (value === null || value === undefined) return 'var(--muted-2)';
  if (value >= standar) return 'var(--hijau-ink)';
  if (value >= standar - 1) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}

interface SearchParams {
  bulan?: string;
  kelompok?: string;
}

export default async function MatrixKoordinatorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireOneOfRoles(['koordinator_hits', 'koordinator_ketua_kelas']);
  const selectedMonth = searchParams.bulan || currentYearMonth();
  const selectedKelompok = searchParams.kelompok || '';
  const isKoordinatorHits = session.role === 'koordinator_hits';
  const backHref = isKoordinatorHits ? '/kehadiran/koordinator' : '/observasi/koordinator';

  const { data: kelompokList } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name')
    .eq('gender', session.gender)
    .order('name');

  let pengajarQuery = supabaseAdmin
    .from('pengajar')
    .select('id, name, kelompok_id, active')
    .eq('gender', session.gender);
  if (selectedKelompok) {
    pengajarQuery = pengajarQuery.eq('kelompok_id', selectedKelompok);
  }
  const { data: pengajarList } = await pengajarQuery.order('name');

  const pengajarIds = (pengajarList ?? []).map((p) => p.id);
  const kelompokMap = new Map((kelompokList ?? []).map((k) => [k.id, k.name]));
  const pengajarMap = new Map((pengajarList ?? []).map((p) => [p.id, p]));

  const { data: matrixData } = pengajarIds.length
    ? await supabaseAdmin
        .from('matrix_rekap')
        .select(
          'pengajar_id, year_month, rata_rata_hard_skill, rata_rata_pedagogis, rata_rata_soft_skill, rata_rata_keseluruhan, ranking, total_teguran_bulan, total_teguran_kumulatif, finalized_at'
        )
        .eq('year_month', selectedMonth)
        .in('pengajar_id', pengajarIds)
        .order('ranking', { ascending: true, nullsFirst: false })
    : { data: [] };

  const { data: availableMonths } = await supabaseAdmin
    .from('matrix_rekap')
    .select('year_month')
    .in('pengajar_id', pengajarIds.length ? pengajarIds : ['00000000-0000-0000-0000-000000000000'])
    .order('year_month', { ascending: false });

  const monthOptions = Array.from(
    new Set([currentYearMonth(), ...(availableMonths ?? []).map((m) => m.year_month)])
  ).sort()
    .reverse();

  const rows = (pengajarList ?? []).map((p) => {
    const m = (matrixData ?? []).find((mm) => mm.pengajar_id === p.id);
    return {
      pengajar: p,
      kelompokName: kelompokMap.get(p.kelompok_id ?? '') ?? '—',
      matrix: m,
    };
  });

  rows.sort((a, b) => {
    const ra = a.matrix?.ranking ?? Number.POSITIVE_INFINITY;
    const rb = b.matrix?.ranking ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.pengajar.name.localeCompare(b.pengajar.name);
  });

  const totalPengajar = rows.length;
  const withMatrix = rows.filter((r) => r.matrix);
  const avgKeseluruhan = withMatrix.length
    ? withMatrix.reduce((s, r) => s + Number(r.matrix?.rata_rata_keseluruhan ?? 0), 0) / withMatrix.length
    : 0;
  const flaggedTeguran = rows.filter((r) => (r.matrix?.total_teguran_kumulatif ?? 0) >= 3).length;
  const finalizedCount = withMatrix.filter((r) => r.matrix?.finalized_at).length;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Matrix HITS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link
                href={backHref}
                className="btn btn-sm btn-ghost"
                style={{ height: 30, padding: '0 10px' }}
              >
                {Icon.back(12)} Dashboard
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="btn btn-sm btn-ghost"
                  style={{ height: 30, padding: '0 10px' }}
                >
                  {Icon.logout(12)} Keluar
                </button>
              </form>
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Matrix Skill Pengajar — {session.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
          </h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            Rekap bulanan 14 indikator. Pengajar dengan teguran kumulatif ≥3 di-highlight.
          </p>

          {/* Filter bar */}
          <form
            method="get"
            className="card-flat"
            style={{
              padding: 12,
              marginBottom: 16,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ flex: '1 1 160px', minWidth: 140 }}>
              <label
                className="t-tiny"
                htmlFor="matrix_bulan"
                style={{ display: 'block', marginBottom: 4 }}
              >
                Bulan
              </label>
              <select
                id="matrix_bulan"
                name="bulan"
                defaultValue={selectedMonth}
                className="select"
                style={{ height: 38 }}
              >
                {monthOptions.map((ym) => (
                  <option key={ym} value={ym}>
                    {ym}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '2 1 220px', minWidth: 180 }}>
              <label
                className="t-tiny"
                htmlFor="matrix_kelompok"
                style={{ display: 'block', marginBottom: 4 }}
              >
                Kelompok
              </label>
              <select
                id="matrix_kelompok"
                name="kelompok"
                defaultValue={selectedKelompok}
                className="select"
                style={{ height: 38 }}
              >
                <option value="">Semua kelompok</option>
                {(kelompokList ?? []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-ghost btn-sm" style={{ height: 38 }}>
              Terapkan
            </button>
            {(selectedKelompok || selectedMonth !== currentYearMonth()) && (
              <Link href="/matrix/koordinator" className="btn btn-ghost btn-sm" style={{ height: 38 }}>
                Reset
              </Link>
            )}
          </form>

          {/* Stats */}
          <div
            className="card-flat"
            style={{
              padding: '16px 20px',
              marginBottom: 20,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Pengajar</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{totalPengajar}</div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Rata-rata Keseluruhan</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(avgKeseluruhan, 3.5) }}>
                {fmtNum(avgKeseluruhan)}
              </div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Teguran ≥3</div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: flaggedTeguran > 0 ? 'var(--merah-ink)' : 'inherit',
                }}
              >
                {flaggedTeguran}
              </div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Finalized</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {finalizedCount}/{withMatrix.length}
              </div>
            </div>
          </div>

          {/* Empty state */}
          {totalPengajar === 0 && (
            <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
              <p className="t-body" style={{ color: 'var(--muted)' }}>
                Tidak ada pengajar untuk filter ini.
              </p>
            </div>
          )}

          {totalPengajar > 0 && withMatrix.length === 0 && (
            <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
              <p className="t-body" style={{ color: 'var(--muted)' }}>
                Belum ada data matrix untuk bulan {selectedMonth}. Data akan muncul setelah
                penilaian masyaikh & pedagogis bulanan disinkronisasi ke <code>matrix_rekap</code>.
              </p>
            </div>
          )}

          {/* Table */}
          {withMatrix.length > 0 && (
            <div
              className="card-flat"
              style={{ padding: 0, overflowX: 'auto' }}
            >
              <table
                className="t-mono"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                  minWidth: 880,
                }}
              >
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>#</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Pengajar</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Kelompok</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>
                      Hard
                    </th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>
                      Pedagogis
                    </th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>
                      Soft
                    </th>
                    <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'right' }}>
                      Rata-rata
                    </th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>
                      Teguran (bln/kum)
                    </th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const m = row.matrix;
                    const teguranKum = m?.total_teguran_kumulatif ?? 0;
                    const isFlagged = teguranKum >= 3;
                    const isInactive = !row.pengajar.active;
                    return (
                      <tr
                        key={row.pengajar.id}
                        style={{
                          background: isFlagged
                            ? 'var(--merah-tint)'
                            : idx % 2
                            ? 'var(--surface)'
                            : 'transparent',
                          borderTop: '1px solid var(--line)',
                        }}
                      >
                        <td style={{ padding: '10px 12px', color: 'var(--muted-2)' }}>
                          {m?.ranking ?? '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {row.pengajar.name}
                          {isInactive && (
                            <span
                              className="badge badge-merah"
                              style={{ marginLeft: 8, fontSize: 10 }}
                            >
                              Nonaktif
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>
                          {row.kelompokName}
                        </td>
                        <td
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                            color: scoreColor(Number(m?.rata_rata_hard_skill ?? 0), 3),
                          }}
                        >
                          {fmtNum(Number(m?.rata_rata_hard_skill))}
                        </td>
                        <td
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                            color: scoreColor(Number(m?.rata_rata_pedagogis ?? 0), 4),
                          }}
                        >
                          {fmtNum(Number(m?.rata_rata_pedagogis))}
                        </td>
                        <td
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                            color: scoreColor(Number(m?.rata_rata_soft_skill ?? 0), 4),
                          }}
                        >
                          {fmtNum(Number(m?.rata_rata_soft_skill))}
                        </td>
                        <td
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: scoreColor(Number(m?.rata_rata_keseluruhan ?? 0), 3.5),
                          }}
                        >
                          {fmtNum(Number(m?.rata_rata_keseluruhan))}
                        </td>
                        <td
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                            color: isFlagged ? 'var(--merah-ink)' : 'inherit',
                            fontWeight: isFlagged ? 700 : 400,
                          }}
                        >
                          {m?.total_teguran_bulan ?? 0} / {teguranKum}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          {m?.finalized_at ? (
                            <span className="badge badge-hijau">
                              <span className="dot" />
                              Final
                            </span>
                          ) : m ? (
                            <span className="badge badge-kuning">
                              <span className="dot" />
                              Draft
                            </span>
                          ) : (
                            <span className="badge badge-neutral">
                              <span className="dot" />
                              Belum
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 16 }}>
            Standar per kategori: Hard ≥3, Pedagogis ≥4, Soft ≥4. Hijau = melampaui standar,
            kuning = mendekati, merah = di bawah. Teguran ≥3 (kumulatif) = peringatan terakhir
            sebelum nonaktif (4 teguran).
          </p>
        </div>
      </div>
    </main>
  );
}
