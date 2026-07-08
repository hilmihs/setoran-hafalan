import Link from 'next/link';
import { requireOneOfRoles } from '@/lib/session';
import { getLaporanMaahir, type StudentAtt } from '@/lib/laporan-maahir';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { monthOptionsSince } from '@/lib/month';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

/** Persen → "84%" atau "—" bila null. */
function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}
function num(v: number | null): string {
  return v === null ? '—' : String(v);
}
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
// Periode Maahir: 28 bulan lalu s/d 27 bulan ini (bukan kalender penuh).
function periodeLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 2, 28));
  const end = new Date(Date.UTC(y, m - 1, 27));
  const f = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${f(start)} – ${f(end)}`;
}

export default async function LaporanMaahirPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await requireOneOfRoles(['koordinator', 'syaikh']);
  const dashboardHref = session.role === 'syaikh' ? '/2in1/syaikh' : '/2in1/koordinator';

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : nowMonth;

  const lap = await getLaporanMaahir(month);
  const monthOptions = monthOptionsSince(ANCHOR_MONTH);
  const downloadUrl = `/api/laporan/maahir/download?bulan=${month}`;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Laporan Bulanan Maahir
          </div>
          <Link href={dashboardHref} className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ marginBottom: 6, alignItems: 'center' }}>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Rekap program Maahir — <strong>{monthLabel(month)}</strong>
              <br />
              <span className="t-tiny">Periode {periodeLabel(month)}</span>
            </p>
            <MonthNavSelect options={monthOptions} value={month} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <a href={downloadUrl} className="btn btn-sm btn-primary" download style={{ textDecoration: 'none' }}>
              Export Excel — {monthLabel(month)}
            </a>
          </div>

          <TakhassusBlock lap={lap} />
          <MaahirBlock lap={lap} />
          <AtTibyanBlock lap={lap} />

          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 20 }}>
            Presensi mulai dilacak {monthLabel(ANCHOR_MONTH)}. Bulan sebelumnya kosong.
            Kehadiran peserta Takhassus &amp; Maahir dihitung dari sesi Kelas Maahir; At-Tibyan
            dilaporkan terpisah. Kehadiran pengajar sementara default 100%.
          </p>
        </div>
      </div>
    </main>
  );
}

/* ============ Sub-komponen tabel ============ */

function ObsRow({
  no,
  hal,
  aktual,
  benchmark,
  notes,
}: {
  no: string;
  hal: string;
  aktual: string;
  benchmark: string;
  notes?: string;
}) {
  return (
    <tr>
      <td style={{ textAlign: 'center' }}>{no}</td>
      <td>{hal}</td>
      <td style={{ textAlign: 'center', fontWeight: 600 }}>{aktual}</td>
      <td style={{ textAlign: 'center', color: 'var(--muted-2)' }}>{benchmark}</td>
      <td style={{ color: 'var(--muted-2)' }}>{notes ?? ''}</td>
    </tr>
  );
}

function ObsTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="table-scroll">
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>No</th>
              <th>{title}</th>
              <th style={{ width: 90 }}>Aktual</th>
              <th style={{ width: 90 }}>Benchmark</th>
              <th style={{ width: 160 }}>Notes</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function GenderRata({
  ikhwan,
  akhwat,
  rata,
}: {
  ikhwan: number | null;
  akhwat: number | null;
  rata: number | null;
}) {
  return (
    <div className="card-flat" style={{ padding: 10, margin: '4px 0 12px', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      <span className="t-small">Ikhwan: <strong>{pct(ikhwan)}</strong></span>
      <span className="t-small">Akhwat: <strong>{pct(akhwat)}</strong></span>
      <span className="t-small">Rata-rata: <strong>{pct(rata)}</strong></span>
    </div>
  );
}

function BawahTargetTable({ list }: { list: StudentAtt[] }) {
  if (list.length === 0) {
    return <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>Tidak ada peserta di bawah target.</p>;
  }
  return (
    <div className="table-scroll" style={{ marginBottom: 12 }}>
      <table className="k-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Peserta di bawah target</th>
            <th style={{ width: 70 }}>Kelas</th>
            <th style={{ width: 70 }}>Kehadiran</th>
            <th style={{ width: 50 }}>Hadir</th>
            <th style={{ width: 50 }}>Izin</th>
            <th style={{ width: 50 }}>Sakit</th>
            <th style={{ width: 50 }}>Alpa</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.anggotaId}>
              <td>{s.name}</td>
              <td className="t-tiny">{s.kelasName}</td>
              <td style={{ textAlign: 'center' }}>{pct(s.persen)}</td>
              <td style={{ textAlign: 'center' }}>{s.counts.H}</td>
              <td style={{ textAlign: 'center' }}>{s.counts.I}</td>
              <td style={{ textAlign: 'center' }}>{s.counts.S}</td>
              <td style={{ textAlign: 'center' }}>{s.counts.A}</td>
              <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>{s.keterangan}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TakhassusBlock({ lap }: { lap: Awaited<ReturnType<typeof getLaporanMaahir>> }) {
  const t = lap.takhassus;
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Maahir Takhassus (Ikhwan &amp; Akhwat)</h2>

      <ObsTable title="Hal yang diobservasi">
        <ObsRow no="1" hal="Setoran Al-Qur'an per bulan" aktual={num(t.setoran.aktual)} benchmark={String(t.setoran.benchmark)} />
        <ObsRow no="2" hal="Kehadiran peserta per bulan" aktual={pct(t.kehadiran.aktual)} benchmark={`${t.kehadiran.benchmark}%`} />
        <ObsRow no="3" hal="Jumlah peserta dengan absensi di bawah target" aktual={`${t.dibawahTarget.jumlah} orang`} benchmark="" />
        <ObsRow no="4" hal="Kehadiran pengajar per bulan" aktual={`${t.kehadiranPengajar}%`} benchmark="80%" />
        <ObsRow no="5" hal="Jumlah pengajar dengan absensi di bawah target" aktual={`${t.pengajarDibawahTarget} orang`} benchmark="" />
      </ObsTable>

      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '4px 0' }}>Rincian setoran — peserta ({t.setoran.peserta.length})</div>
      <div className="table-scroll" style={{ marginBottom: 12 }}>
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Peserta</th><th style={{ width: 60 }}>Gender</th><th style={{ width: 120 }}>Jumlah setoran</th><th>Keterangan</th></tr>
          </thead>
          <tbody>
            {t.setoran.peserta.map((p, i) => (
              <tr key={`${p.name}-${i}`}>
                <td>{p.name}</td>
                <td className="t-tiny">{p.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}</td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GenderRata ikhwan={t.kehadiran.avgIkhwan} akhwat={t.kehadiran.avgAkhwat} rata={t.kehadiran.aktual} />
      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '4px 0' }}>Peserta di bawah target (&lt; 80%)</div>
      <BawahTargetTable list={t.dibawahTarget.list} />
    </section>
  );
}

function MaahirBlock({ lap }: { lap: Awaited<ReturnType<typeof getLaporanMaahir>> }) {
  const m = lap.maahir;
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Maahir (selain Takhassus)</h2>

      <ObsTable title="Hal yang diobservasi">
        <ObsRow no="1" hal="Ujian teori mustawa (3 bulan)" aktual="—" benchmark="70" />
        <ObsRow no="2" hal="Ujian praktek mustawa (3 bulan)" aktual="—" benchmark="70" />
        <ObsRow no="3" hal="Kehadiran peserta per bulan" aktual={pct(m.kehadiran.aktual)} benchmark={`${m.kehadiran.benchmark}%`} />
        <ObsRow no="4" hal="Rata-rata keseluruhan Ujian (teori + praktek)" aktual="—" benchmark="70" />
        <ObsRow no="5" hal="Jumlah peserta dengan nilai akhir program di bawah target" aktual="—" benchmark="" />
        <ObsRow no="6" hal="Hafalan matan per mustawa (3 bulan)" aktual="—" benchmark="60" />
        <ObsRow no="7" hal="Jumlah peserta dengan hafalan matan di bawah target" aktual="—" benchmark="" />
        <ObsRow no="8" hal="Jumlah peserta dengan absensi di bawah target" aktual={`${m.dibawahTarget.jumlah} orang`} benchmark="" />
        <ObsRow no="9" hal="Kehadiran pengajar per bulan" aktual={`${m.kehadiranPengajar}%`} benchmark="85%" />
        <ObsRow no="10" hal="Jumlah pengajar dengan absensi di bawah target" aktual={`${m.pengajarDibawahTarget} orang`} benchmark="" />
      </ObsTable>

      <GenderRata ikhwan={m.kehadiran.avgIkhwan} akhwat={m.kehadiran.avgAkhwat} rata={m.kehadiran.aktual} />
      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '4px 0' }}>Peserta di bawah target (&lt; 80%)</div>
      {m.dibawahTarget.list.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>Tidak ada peserta di bawah target.</p>
      ) : (
        <div className="table-scroll" style={{ marginBottom: 12 }}>
          <table className="k-table" style={{ width: '100%' }}>
            <thead>
              <tr><th>Peserta di bawah target</th><th style={{ width: 90 }}>Kehadiran</th><th>Kelas</th></tr>
            </thead>
            <tbody>
              {m.dibawahTarget.list.map((s) => (
                <tr key={s.anggotaId}>
                  <td>{s.name}</td>
                  <td style={{ textAlign: 'center' }}>{pct(s.persen)}</td>
                  <td className="t-tiny">{s.kelasName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AtTibyanBlock({ lap }: { lap: Awaited<ReturnType<typeof getLaporanMaahir>> }) {
  const a = lap.atTibyan;
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>At-Tibyan</h2>

      <ObsTable title="Hal yang diobservasi">
        <ObsRow no="1" hal="Kehadiran peserta per bulan" aktual={pct(a.kehadiran.aktual)} benchmark={`${a.kehadiran.benchmark}%`} />
        <ObsRow
          no="2"
          hal="Jumlah peserta dengan absensi di bawah target"
          aktual={`${a.dibawahTarget.total} orang`}
          benchmark=""
          notes={`Ikhwan ${a.dibawahTarget.ikhwan} · Akhwat ${a.dibawahTarget.akhwat}`}
        />
      </ObsTable>

      <GenderRata ikhwan={a.kehadiran.avgIkhwan} akhwat={a.kehadiran.avgAkhwat} rata={a.kehadiran.aktual} />
      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '4px 0' }}>Peserta di bawah target (&lt; 100%)</div>
      {a.dibawahTarget.list.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>Tidak ada peserta di bawah target.</p>
      ) : (
        <div className="table-scroll" style={{ marginBottom: 12 }}>
          <table className="k-table" style={{ width: '100%' }}>
            <thead>
              <tr><th>Peserta di bawah target</th><th style={{ width: 90 }}>Tidak hadir</th><th>Kelas</th><th>Keterangan</th></tr>
            </thead>
            <tbody>
              {a.dibawahTarget.list.map((s) => (
                <tr key={s.anggotaId}>
                  <td>{s.name}</td>
                  <td style={{ textAlign: 'center' }}>{s.tidakHadir}x</td>
                  <td className="t-tiny">{s.kelasName}</td>
                  <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>{s.keterangan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
