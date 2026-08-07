import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getMaahirSP, getMaahirPeriodeMonths, type SPLevel } from '@/lib/maahir-sp';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { Icon } from '@/components/icons';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function tanggalLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function spStyle(sp: SPLevel) {
  if (sp >= 3) return { bg: 'var(--merah-tint)', bd: 'var(--merah-line)', ink: 'var(--merah-ink)' };
  if (sp === 2) return { bg: 'var(--kuning-tint)', bd: 'var(--kuning-line)', ink: 'var(--kuning-ink)' };
  return { bg: 'var(--surface-3)', bd: 'var(--line)', ink: 'var(--muted)' };
}

export default async function PendataanSPPage({
  searchParams,
}: {
  searchParams: { gender?: string; month?: string };
}) {
  const { accesses } = await getSession();
  if (!accesses?.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  // Filter periode: SP tetap kumulatif, hanya dipotong di akhir periode bulan
  // terpilih (window 28–27) supaya bisa dilihat "per akhir bulan itu, siapa
  // sudah kena SP berapa". Kosong = s/d hari ini.
  const periodeMonths = await getMaahirPeriodeMonths();
  const monthOptions = [
    { value: '', label: 'Semua (s/d sekarang)' },
    ...periodeMonths.map((m) => ({ value: m, label: monthLabel(m) })),
  ];
  const monthFilter =
    searchParams.month && monthOptions.some((o) => o.value && o.value === searchParams.month)
      ? searchParams.month
      : '';

  const { list, summary, cutoff } = await getMaahirSP({
    gender: genderFilter,
    sampaiBulan: monthFilter || undefined,
  });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Pendataan SP</div>
            <Link href="/2in1/koordinator/kehadiran" className="back">{Icon.shield(12)} Kembali</Link>
          </div>

          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <h1 className="t-h1" style={{ marginBottom: 2 }}>Surat Peringatan Peserta</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Disiplin kehadiran Maahir (kumulatif). Alpa 1/2/≥3 → SP 1/2/3 · Izin 2/3/≥4 → SP 1/2/3.
              </p>
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
                Dihitung s/d {tanggalLabel(cutoff)}
                {monthFilter ? ' (akhir periode bulan terpilih)' : ''}.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <MonthNavSelect options={monthOptions} value={monthFilter} />
              <GenderNavSelect value={genderFilter ?? ''} />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <Stat label="Total kena SP" value={summary.total} />
            <Stat label="SP 1" value={summary.sp1} />
            <Stat label="SP 2" value={summary.sp2} tone="warn" />
            <Stat label="SP 3 (diberhentikan)" value={summary.sp3} tone="bad" />
          </div>

          {list.length === 0 ? (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center' }}>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Tak ada peserta yang kena SP pada scope ini. Alhamdulillah.
              </p>
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Peserta</th>
                      <th>Kelas</th>
                      <th style={{ textAlign: 'right' }} title="Alpa (tanpa keterangan)">Alpa</th>
                      <th style={{ textAlign: 'right' }}>Izin</th>
                      <th style={{ textAlign: 'right' }}>Telat</th>
                      <th style={{ textAlign: 'right' }} title="Hadir">Hadir</th>
                      <th style={{ textAlign: 'center' }}>SP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => {
                      const ss = spStyle(p.sp);
                      return (
                        <tr key={p.anggotaId}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td className="t-small" style={{ color: 'var(--muted-2)' }}>{p.kelasName}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: p.alpa > 0 ? 'var(--merah-ink)' : undefined }}>{p.alpa}</td>
                          <td style={{ textAlign: 'right' }}>{p.izin}</td>
                          <td style={{ textAlign: 'right', color: 'var(--muted-2)' }}>{p.terlambat}</td>
                          <td style={{ textAlign: 'right', color: 'var(--muted-2)' }}>{p.hadir}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge" style={{ background: ss.bg, borderColor: ss.bd, color: ss.ink }}>
                              SP {p.sp}{p.sp >= 3 ? ' ⚠' : ''}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 12 }}>
            SP 3 = melebihi batas → kandidat diberhentikan dari program Maahir. Angka kumulatif sejak
            program mulai s/d {tanggalLabel(cutoff)}, tanggal libur tak dihitung. Filter bulan
            memotong perhitungan di akhir periode bulan itu (window tanggal 28–27), bukan menghitung
            bulan itu saja.
          </p>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  const ink = tone === 'bad' ? 'var(--merah-ink)' : tone === 'warn' ? 'var(--kuning-ink)' : 'var(--ink)';
  return (
    <div className="card-flat" style={{ padding: '10px 14px', minWidth: 110 }}>
      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: ink }}>{value}</div>
    </div>
  );
}
