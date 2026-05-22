import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { getSession } from '@/lib/session';
import { currentCycleStart, formatCycleRange } from '@/lib/week';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const s = await getSession();
  if (s.session?.role === 'peserta') redirect('/peserta');
  if (s.session?.role === 'musyrif') redirect('/musyrif');
  if (s.session?.role === 'koordinator') redirect('/koordinator');
  if (s.session?.role === 'syaikh') redirect('/syaikh');

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 56 }}>
          <div className="wordmark" style={{ marginBottom: 24 }}>
            <span className="mark">M</span>
            Maahir
          </div>

          <h1 className="t-h1" style={{ marginBottom: 6 }}>Setoran Hafalan</h1>
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
