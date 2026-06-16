import { requirePengajar } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
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
            <LogoutButton />
          </div>

          <FeatureNav current="/shakwa/pengajar" />

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
