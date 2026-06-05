import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { getSession, getAllAccesses } from '@/lib/session';
import { currentCycleStart, formatCycleRange } from '@/lib/week';
import { ROLE_LANDING } from '@/lib/roles';
import type { RoleAccess } from '@/types/db';

export const dynamic = 'force-dynamic';

const FEATURE_CARDS: {
  roles: RoleAccess['role'][];
  title: string;
  description: string;
  href: string;
}[] = [
  {
    roles: ['peserta', 'musyrif', 'koordinator', 'syaikh'],
    title: 'Barnamij 2in1',
    description: 'Setoran Hafalan — Tuhfatul Athfal, Al-Jazariyyah, Syawahid',
    href: '/2in1',
  },
  {
    roles: ['pengajar'],
    title: 'Kehadiran Program',
    description: 'Check-in kehadiran Kelas Maahir, Kajian At-Tibyan, Muallim Najih',
    href: '/kehadiran/pengajar',
  },
  {
    roles: ['koordinator_hits'],
    title: 'Koordinator Pengajar HITS',
    description: 'Check-in kehadiran pengajar, reminder, dan monitoring per kelompok',
    href: '/kehadiran/koordinator',
  },
  {
    roles: ['ketua_kelas'],
    title: 'Observasi Kelas',
    description: 'Laporan kondisi kelas dan performa pengajar',
    href: '/observasi/ketua-kelas',
  },
  {
    roles: ['koordinator_ketua_kelas'],
    title: 'Koordinator Ketua Kelas',
    description: 'Tabayyun, reminder observasi, dan monitoring kondisi halaqah',
    href: '/observasi/koordinator',
  },
];

export default async function HomePage() {
  const s = await getSession();
  const accesses = await getAllAccesses();

  if (accesses.length === 1) {
    redirect(ROLE_LANDING[accesses[0].role]);
  }

  if (accesses.length > 1) {
    const available = FEATURE_CARDS.filter((card) =>
      card.roles.some((r) => accesses.find((a) => a.role === r))
    );

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
            Pekan {formatCycleRange(currentCycleStart())}
          </p>
        </div>
      </div>
    </main>
  );
}
