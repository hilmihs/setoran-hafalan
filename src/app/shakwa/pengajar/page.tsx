import { requirePengajar } from '@/lib/session';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { ShakwaForm } from './ShakwaForm';

export const dynamic = 'force-dynamic';

export default async function ShakwaPengajarPage() {
  const session = await requirePengajar();

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> SHAKWA
            </div>
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

          <nav style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
            <a href="/kehadiran/pengajar" className="btn btn-sm btn-ghost">
              Kehadiran
            </a>
            <a href="/shakwa/pengajar" className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }}>
              SHAKWA
            </a>
            <a href="/" className="btn btn-sm btn-ghost">
              Menu Utama
            </a>
          </nav>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>SHAKWA</h1>
          <p className="t-body" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            Sampaikan laporan terkait program HITS.
          </p>

          <ShakwaForm
            pengajarName={session.name}
            pengajarGender={session.gender}
          />
        </div>
      </div>
    </main>
  );
}
