import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { listEndpoints, recentDeliveries } from '@/lib/webhooks';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import WebhooksAdmin from './WebhooksAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminWebhooksPage() {
  await requireAdmin();
  const endpoints = await listEndpoints();
  const deliveries = await recentDeliveries(50);
  const webhooksOn = process.env.WEBHOOKS === 'on';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20, paddingBottom: 80 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — Webhooks</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/api-keys" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
                {Icon.back(12)} API Keys
              </Link>
              <LogoutButton />
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>Webhooks (Push)</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Kirim event ke URL konsumen saat data berubah (mis. setoran disubmit/dinilai).
            Tiap kiriman ditandatangani HMAC (<code>x-maahir-signature</code>). Gagal → retry
            otomatis dengan backoff. <strong>Secret hanya tampil sekali</strong> saat endpoint dibuat.
          </p>

          {!webhooksOn && (
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
              ⚠️ Master-switch <code>WEBHOOKS</code> belum <code>on</code> — event tidak
              di-enqueue &amp; worker dispatch balas 404. Set env <code>WEBHOOKS=on</code> lalu restart.
            </div>
          )}

          <WebhooksAdmin endpoints={endpoints} deliveries={deliveries} />
        </div>
      </div>
    </main>
  );
}
