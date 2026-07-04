import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionWa, findSelfAttendanceMembership } from '@/lib/program-kelas';
import { getUnfilledDaysForAnggota, PROGRAM_LABEL } from '@/lib/maahir-presensi';
import { LogoutButton } from '@/components/LogoutButton';
import { SelfPresensiForm } from './SelfPresensiForm';

export const dynamic = 'force-dynamic';

export default async function MaahirMandiriPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const membership = await findSelfAttendanceMembership(wa);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark"><span className="mark">M</span> Presensi Mandiri</div>
          <LogoutButton />
        </div>
        <div className="page">{children}</div>
      </div>
    </main>
  );

  if (!membership) {
    return (
      <Shell>
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Presensi Mandiri</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Akun Anda tidak terdaftar di kelas presensi mandiri.
        </p>
        <Link href="/" className="btn btn-ghost btn-block" style={{ marginTop: 16 }}>← Beranda</Link>
      </Shell>
    );
  }

  const { kelas, anggotaId, anggotaName } = membership;
  const isLeader = kelas.ketua_wa === wa || kelas.wakil_wa === wa;
  const unfilled = await getUnfilledDaysForAnggota(kelas, anggotaId);

  if (unfilled.length === 0) {
    return (
      <Shell>
        <div className="banner banner-success" style={{ marginBottom: 16 }}>
          <div>
            <div className="title">Presensi Anda sudah lengkap</div>
            <div className="desc">{kelas.name} — tidak ada hari yang perlu diisi.</div>
          </div>
        </div>
        {isLeader && (
          <Link href="/2in1/ketua-kelas/libur" className="btn btn-ghost btn-block" style={{ marginBottom: 8 }}>
            Ajukan libur pertemuan
          </Link>
        )}
        <Link href="/" className="btn btn-ghost btn-block">← Beranda</Link>
      </Shell>
    );
  }

  const day = unfilled[0];
  const tanggalLabel = new Date(day.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeRange = day.waktu_mulai
    ? `${day.waktu_mulai.slice(0, 5)}${day.waktu_selesai ? ' – ' + day.waktu_selesai.slice(0, 5) : ''}`
    : null;

  return (
    <Shell>
      <div className="card" style={{ padding: '12px 14px', marginBottom: 14, borderLeft: '3px solid var(--accent)', background: 'var(--surface-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{anggotaName}</div>
          <span className="badge badge-kuning"><span className="dot" /> Sisa {day.totalRemaining}</span>
        </div>
        <div className="t-small" style={{ marginTop: 2 }}>{kelas.name} · {PROGRAM_LABEL[day.program] ?? day.program}</div>
        <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
          {tanggalLabel}{timeRange ? ` · ${timeRange}` : ''}
        </div>
      </div>

      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
        Tandai kehadiran Anda sendiri. Setelah disimpan, lanjut otomatis ke hari berikutnya yang belum terisi.
      </p>

      <SelfPresensiForm
        key={`${day.tanggal}|${day.program}`}
        kelasId={kelas.id}
        anggotaId={anggotaId}
        tanggal={day.tanggal}
        program={day.program}
        remaining={day.totalRemaining}
      />

      {isLeader && (
        <Link href="/2in1/ketua-kelas/libur" className="btn btn-ghost btn-block" style={{ marginTop: 12 }}>
          Ajukan libur pertemuan
        </Link>
      )}
    </Shell>
  );
}
