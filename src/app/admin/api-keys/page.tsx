import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { listApiKeys } from '@/lib/api-keys';
import { getUsageTotals } from '@/lib/api-usage';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import ApiKeysAdmin from './ApiKeysAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminApiKeysPage() {
  await requireAdmin();
  const keys = await listApiKeys();
  const usage = await getUsageTotals();
  const usageObj: Record<string, number> = {};
  usage.forEach((v, k) => (usageObj[k] = v));
  const publicApiOn = process.env.PUBLIC_API === 'on';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20, paddingBottom: 80 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — API Keys</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/db" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
                {Icon.back(12)} Konsol DB
              </Link>
              <LogoutButton />
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>Public Read API — Kunci Akses</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Kelola kunci untuk konsumen eksternal (server-to-server, read-only) di{' '}
            <code>/api/v1</code>. Kunci penuh <strong>hanya tampil sekali</strong> saat dibuat —
            salin &amp; simpan aman. Batasi tiap kunci lewat <em>scope</em>; cabut kapan saja.
          </p>

          {!publicApiOn && (
            <div
              className="t-small"
              style={{
                background: 'var(--warn-bg, #fff7ed)',
                border: '1px solid var(--warn-border, #fdba74)',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 16,
              }}
            >
              ⚠️ Master-switch <code>PUBLIC_API</code> belum <code>on</code> — seluruh{' '}
              <code>/api/v1/*</code> membalas <strong>404</strong>. Set env <code>PUBLIC_API=on</code>{' '}
              lalu restart agar API aktif.
            </div>
          )}

          <ApiKeysAdmin keys={keys} usage={usageObj} />
        </div>
      </div>
    </main>
  );
}
