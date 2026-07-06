import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { getDisiplinRanking } from '@/lib/hits-ranking';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { WeekNavSelect } from '@/components/WeekNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { weekStartMonday, weekBounds, formatWeekRangeShort, recentMondays } from '@/lib/week';
import type { Gender } from '@/types/db';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = '2026-01'; // batch HITS paling awal mulai Jan 2026

export default async function HitsKoordinatorPage({
  searchParams,
}: {
  searchParams: { mode?: string; month?: string; week?: string; gender?: string };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);

  const mode = searchParams.mode === 'minggu' ? 'minggu' : 'bulan';
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;
  const week =
    searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week)
      ? searchParams.week
      : weekStartMonday();

  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  let start: string;
  let end: string;
  let periodeLabel: string;
  if (mode === 'minggu') {
    ({ start, end } = weekBounds(week));
    periodeLabel = formatWeekRangeShort(week);
  } else {
    const [y, m] = month.split('-').map(Number);
    start = `${month}-01`;
    end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    periodeLabel = month;
  }

  const rows = await getDisiplinRanking({ start, end, gender: genderFilter });
  const ranked = rows.filter((r) => r.rank !== null);
  const noData = rows.filter((r) => r.rank === null);

  const genderLabel =
    genderFilter === 'ikhwan' ? 'Ikhwan' : genderFilter === 'akhwat' ? 'Akhwat' : 'Ikhwan & Akhwat';
  const weekOpts = recentMondays(12).map((mon) => ({ value: mon, label: formatWeekRangeShort(mon) }));
  const g = genderFilter ? `&gender=${genderFilter}` : '';
  const pctColor = (p: number) =>
    p >= 90 ? 'var(--hijau-ink)' : p >= 75 ? 'var(--kuning-ink)' : 'var(--merah-ink)';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Soft Skill HITS
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/hits/koordinator/pertemuan" className="back">
              {Icon.shield(12)} Override Pertemuan
            </Link>
            <Link href="/hits/koordinator/validasi" className="back">
              {Icon.shield(12)} Validasi & Sumber Data
            </Link>
          </div>
        </div>

        <div className="page">
          {/* ── Hero ── */}
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
            <div className="section-row" style={{ alignItems: 'flex-start', marginBottom: 0, gap: 12 }}>
              <div>
                <h1 className="t-h1" style={{ marginBottom: 4 }}>
                  Ranking Disiplin Pengajar
                </h1>
                <p className="t-small" style={{ color: 'var(--ink-2)', maxWidth: 560 }}>
                  Urut <strong>%KBBS</strong> (disiplin periode) · pemecah seri{' '}
                  <strong>hutang menit</strong> (saldo tertunggak). Lintas-batch, per pengajar.
                </p>
                <p className="t-tiny" style={{ color: 'var(--muted)', marginTop: 8 }}>
                  {mode === 'minggu' ? 'Mingguan' : 'Bulanan'} · {periodeLabel} · {genderLabel} ·{' '}
                  {ranked.length} pengajar
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Link
                    href={`?mode=bulan${g}`}
                    className="chip-select"
                    style={{ fontWeight: mode === 'bulan' ? 700 : 400, opacity: mode === 'bulan' ? 1 : 0.6 }}
                  >
                    Bulanan
                  </Link>
                  <Link
                    href={`?mode=minggu${g}`}
                    className="chip-select"
                    style={{ fontWeight: mode === 'minggu' ? 700 : 400, opacity: mode === 'minggu' ? 1 : 0.6 }}
                  >
                    Mingguan
                  </Link>
                </div>
                {mode === 'minggu' ? (
                  <WeekNavSelect options={weekOpts} value={week} />
                ) : (
                  <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
                )}
                <GenderNavSelect value={genderFilter ?? ''} />
              </div>
            </div>
          </div>

          {ranked.length === 0 && noData.length === 0 ? (
            <div className="card-flat" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: 999, margin: '0 auto 12px',
                  background: 'var(--surface-3)', display: 'grid', placeItems: 'center',
                  color: 'var(--muted)',
                }}
              >
                {Icon.shield(22)}
              </div>
              <p className="t-h3" style={{ marginBottom: 4 }}>Belum ada data</p>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Tak ada pengajar/keterangan pada periode ini.
              </p>
            </div>
          ) : (
            <>
              <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="k-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44, textAlign: 'right' }}>#</th>
                        <th>Pengajar</th>
                        <th style={{ textAlign: 'right' }}>%KBBS</th>
                        <th style={{ textAlign: 'right' }}>Hutang (mnt)</th>
                        <th style={{ textAlign: 'right' }}>Halaqah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r) => (
                        <tr key={r.pengajarId}>
                          <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {r.rank}
                          </td>
                          <td className="nm" style={{ fontWeight: 500 }}>
                            <a
                              href={`/matrix/koordinator/pengajar/${r.pengajarId}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {r.pengajarNama}
                            </a>
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', fontWeight: 700, color: pctColor(r.pctKbbs!) }}
                          >
                            {r.pctKbbs}%
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', color: r.hutangSaldo > 0 ? 'var(--merah-ink)' : 'var(--muted)' }}
                          >
                            {r.hutangSaldo || '—'}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {r.halaqahCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {noData.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div
                    className="t-tiny"
                    style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}
                  >
                    BELUM ADA DATA PERIODE INI ({noData.length})
                  </div>
                  <div
                    className="card-flat"
                    style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}
                  >
                    {noData.map((r) => (
                      <a
                        key={r.pengajarId}
                        href={`/matrix/koordinator/pengajar/${r.pengajarId}`}
                        style={{ fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}
                      >
                        {r.pengajarNama}
                        {r.hutangSaldo > 0 ? (
                          <span style={{ color: 'var(--merah-ink)' }}> · {r.hutangSaldo}mnt</span>
                        ) : null}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
