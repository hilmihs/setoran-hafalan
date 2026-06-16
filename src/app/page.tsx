import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { getSession, getAllAccesses } from '@/lib/session';
import { currentCycleStart, formatCycleRange } from '@/lib/week';
import { formatCycleRangeShort } from '@/lib/week';
import { ROLE_LANDING } from '@/lib/roles';
import { featureLinksFor } from '@/lib/feature-links';
import { getSessionWa, findKetuaProgramKelas } from '@/lib/program-kelas';
import { getUnfilledMaahirDays } from '@/lib/maahir-presensi';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const s = await getSession();
  const accesses = await getAllAccesses();

  if (accesses.length >= 1) {
    // Ketua/wakil kelas Maahir wajib selesaikan presensi yang terluput dulu.
    const wa = await getSessionWa();
    const isKetuaMaahir = wa ? (await findKetuaProgramKelas(wa)).length > 0 : false;
    if (wa && isKetuaMaahir) {
      const unfilled = await getUnfilledMaahirDays(wa);
      if (unfilled.length > 0) redirect('/2in1/ketua-kelas/presensi');
    }

    const available = featureLinksFor(accesses);

    // Ketua Maahir tak punya entri di FEATURE_LINKS (berbasis role); tambah kartu sintetis.
    if (available.length === 1 && !isKetuaMaahir) {
      redirect(available[0].href);
    }

    const userName = accesses[0]?.name ?? '';

    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="page" style={{ paddingTop: 56 }}>
            <div className="wordmark" style={{ marginBottom: 24 }}>
              <span className="mark">M</span>
              Muhajir Project Tilawah
            </div>

            <h1 className="t-h1" style={{ marginBottom: 6 }}>
              Assalamu&apos;alaikum, {userName}
            </h1>
            <p className="t-body" style={{ marginBottom: 26 }}>
              Pilih fitur yang ingin Anda akses:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isKetuaMaahir && (
                <a
                  href="/2in1/ketua-kelas"
                  className="card-flat"
                  style={{
                    display: 'block',
                    padding: '16px 20px',
                    textDecoration: 'none',
                    color: 'inherit',
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Presensi Kelas Maahir</div>
                  <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                    Isi kehadiran anggota kelas — Kelas Maahir, Muallim Najih, At-Tibyan
                  </div>
                </a>
              )}
              {available.map((card) => (
                <a
                  key={card.href}
                  href={card.href}
                  className="card-flat"
                  style={{
                    display: 'block',
                    padding: '16px 20px',
                    textDecoration: 'none',
                    color: 'inherit',
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {card.title}
                  </div>
                  <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                    {card.description}
                  </div>
                </a>
              ))}
            </div>

            <form
              action={async () => {
                'use server';
                const { logout } = await import('@/lib/auth');
                await logout();
              }}
              style={{ textAlign: 'center', marginTop: 24 }}
            >
              <button type="submit" className="btn-ghost">
                Keluar
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 56 }}>
          <div className="wordmark" style={{ marginBottom: 24 }}>
            <span className="mark">M</span>
            Muhajir Project Tilawah
          </div>

          <h1 className="t-h1" style={{ marginBottom: 6 }}>Assalamu&apos;alaikum</h1>
          <p className="t-body" style={{ marginBottom: 26 }}>
            Masuk dengan nomor WhatsApp dan password Anda.
          </p>

          <LoginForm />

          <p
            className="t-small"
            style={{ textAlign: 'center', marginTop: 22, color: 'var(--muted-2)' }}
          >
            Periode {formatCycleRangeShort(currentCycleStart())}
          </p>
        </div>
      </div>
    </main>
  );
}
