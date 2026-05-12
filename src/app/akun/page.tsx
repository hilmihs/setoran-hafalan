import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ROLE_HOME: Record<string, string> = {
  peserta: '/peserta',
  musyrif: '/musyrif',
  koordinator: '/koordinator',
};

const ROLE_LABEL: Record<string, string> = {
  peserta: 'Peserta',
  musyrif: 'Musyrif',
  koordinator: 'Koordinator',
};

export default async function AkunPage() {
  const s = await getSession();
  if (!s.session) redirect('/');
  const back = ROLE_HOME[s.session.role];

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="topbar">
          <Link href={back} className="back">
            {Icon.back(12)} kembali
          </Link>
          <span className="t-small">{ROLE_LABEL[s.session.role]}</span>
        </div>

        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Pengaturan Akun
          </h1>
          <p className="t-body" style={{ marginBottom: 8 }}>
            {s.session.name}
          </p>

          <h2 className="t-h3" style={{ marginTop: 24, marginBottom: 10 }}>
            Ganti password
          </h2>
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
