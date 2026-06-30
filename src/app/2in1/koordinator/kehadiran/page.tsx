import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getMaahirRekap } from '@/lib/maahir-rekap';
import { PRESENSI_ANCHOR, weekRangeLabel } from '@/lib/maahir-presensi';
import { MaahirRekapTable } from '@/components/MaahirRekapTable';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

type SP = { month?: string; gender?: string };

const GENDER_TABS: Array<{ key: string; label: string }> = [
  { key: 'semua', label: 'Semua' },
  { key: 'ikhwan', label: 'Ikhwan' },
  { key: 'akhwat', label: 'Akhwat' },
];

export default async function KoordinatorKehadiranPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const s = await getSession();
  // Terima koordinator dari accesses (bukan hanya role aktif) supaya user
  // multi-role bisa buka dari beranda tanpa ke-redirect ke login.
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (!accesses.some((a) => a.role === 'koordinator')) {
    redirect('/2in1/koordinator/login');
  }

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : nowMonth;
  const genderParam = searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
    ? searchParams.gender
    : undefined;

  const rekap = await getMaahirRekap(month, { gender: genderParam });
  const monthOptions = monthOptionsSince(ANCHOR_MONTH);

  const totalBelum = rekap.reduce((sum, k) => sum + k.belumDiisi, 0);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Kehadiran Maahir
          </div>
          <Link href="/2in1/koordinator" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ marginBottom: 12, alignItems: 'center' }}>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Rekap kehadiran anggota semua kelas Maahir
            </p>
            <MonthNavSelect options={monthOptions} value={month} />
          </div>

          {/* Filter gender */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {GENDER_TABS.map((t) => {
              const active =
                (t.key === 'semua' && !genderParam) || t.key === genderParam;
              const params = new URLSearchParams();
              params.set('month', month);
              if (t.key !== 'semua') params.set('gender', t.key);
              return (
                <Link
                  key={t.key}
                  href={`?${params.toString()}`}
                  className={active ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          {totalBelum > 0 && (
            <div className="banner banner-error" style={{ marginBottom: 16 }}>
              <div className="desc">
                <strong>{totalBelum} presensi belum diisi</strong> oleh ketua kelas pada bulan ini.
              </div>
            </div>
          )}

          {rekap.length === 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada data untuk filter ini.
            </p>
          )}

          {rekap.map((k) => (
            <div key={k.kelasId} style={{ marginBottom: 28 }}>
              <SectionHeader
                title={`${k.kelasName}`}
                style={{ marginBottom: 6 }}
                right={
                  k.belumDiisi > 0 ? (
                    <span className="badge badge-merah">{k.belumDiisi} belum diisi</span>
                  ) : (
                    <span className="badge badge-hijau">Lengkap</span>
                  )
                }
              />
              <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                {k.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · {k.jadwalHari.join(', ')} ·{' '}
                {k.anggota.length} anggota · {k.pertemuan.length}/{k.sessions.length} pertemuan terisi
              </div>

              {k.sessions.length > 0 && (
                <details style={{ marginBottom: 10 }}>
                  <summary className="t-small" style={{ cursor: 'pointer', color: 'var(--muted-2)', userSelect: 'none' }}>
                    Rincian {k.sessions.length} pertemuan — {k.sessions.filter((x) => !x.filled).length} belum diisi
                  </summary>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {k.sessions.map((sn, i) => {
                      const label = sn.mingguan
                        ? weekRangeLabel(sn.tanggal)
                        : new Date(sn.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
                            weekday: 'short', day: 'numeric', month: 'short',
                          });
                      const isTibyan = sn.program === 'at_tibyan';
                      return (
                        <span
                          key={`${sn.program}-${sn.tanggal}-${i}`}
                          className={`badge ${sn.filled ? 'badge-hijau' : 'badge-merah'}`}
                          style={{ fontSize: 11 }}
                          title={sn.filled ? 'Sudah diisi' : 'Belum diisi'}
                        >
                          <span className="dot" />
                          {label}{isTibyan ? ' · Tibyan' : ''} {sn.filled ? '✓' : '✗'}
                        </span>
                      );
                    })}
                  </div>
                </details>
              )}

              <MaahirRekapTable kelas={k} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
