import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ProcessClient } from './ProcessClient';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordProcessPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const { data: req } = await supabaseAdmin
    .from('password_reset_requests')
    .select('id, whatsapp_number, requester_name, status, decided_by_wa, decided_at, created_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!req) notFound();

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="page" style={{ paddingTop: 32, maxWidth: 520, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/" className="t-small" style={{ color: 'var(--muted)' }}>
            ← Home
          </Link>
        </div>
        <h1 className="t-h1" style={{ marginBottom: 6 }}>Permintaan Reset Password</h1>
        <p className="t-body" style={{ marginBottom: 20, color: 'var(--muted)' }}>
          ID: <code style={{ fontFamily: 'var(--font-mono), monospace' }}>{req.id.slice(0, 8)}…</code>
        </p>

        {req.status === 'pending' ? (
          <ProcessClient request={req} />
        ) : (
          <div className="banner banner-success">
            <div>
              <div className="title">Sudah diproses</div>
              <div className="desc">
                Status: <strong>{req.status === 'accepted' ? 'Diterima' : 'Ditolak'}</strong><br />
                Diproses oleh: {req.decided_by_wa ?? '—'}<br />
                Pada: {req.decided_at ? new Date(req.decided_at).toLocaleString('id-ID') : '—'}<br />
                {req.status === 'accepted' && (
                  <>
                    <br />
                    Password baru sudah dikirim ke pemohon ({req.requester_name ?? req.whatsapp_number}). Password tidak ditampilkan lagi demi keamanan.
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
