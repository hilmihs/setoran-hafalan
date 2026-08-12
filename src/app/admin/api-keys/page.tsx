import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { CreateKeyForm, RevokeButton } from './CreateKeyForm';

export const dynamic = 'force-dynamic';

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 12px' };

export default async function ApiKeysPage() {
  await requireAdmin();
  const { data } = await supabaseAdmin
    .from('api_client')
    .select('id, nama, token_prefix, scopes, active, expires_at, last_used_at, request_count, revoked_at')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as any[];
  const today = new Date().toISOString().slice(0, 10);
  const status = (r: any): 'aktif' | 'kedaluwarsa' | 'dicabut' =>
    !r.active ? 'dicabut' : r.expires_at && r.expires_at < today ? 'kedaluwarsa' : 'aktif';
  const badgeClass = (s: string): string =>
    s === 'aktif' ? 'badge badge-hijau' : s === 'kedaluwarsa' ? 'badge badge-kuning' : 'badge badge-merah';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20, paddingBottom: 80 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — API Keys</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/users" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>User</Link>
              <Link href="/admin/db" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>Konsol DB</Link>
              <Link href="/" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>Dashboard</Link>
              <LogoutButton />
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>API Keys</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            Key konsumen API publik <code>/api/v1/*</code>. Key mentah hanya ditampilkan <strong>sekali</strong> saat dibuat — simpan baik-baik, tidak bisa dilihat ulang.
          </p>

          <CreateKeyForm />

          <p className="t-small" style={{ color: 'var(--muted-2)', margin: '24px 0 8px' }}>{rows.length} key</p>
          <div className="card-flat" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>Nama</th>
                  <th style={th}>Prefix</th>
                  <th style={th}>Scope</th>
                  <th style={th}>Status</th>
                  <th style={th}>Terakhir dipakai</th>
                  <th style={th}>Req</th>
                  <th style={th} aria-label="aksi" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '16px 12px', color: 'var(--muted-2)' }}>Belum ada key.</td>
                  </tr>
                )}
                {rows.map((r) => {
                  const s = status(r);
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.nama}</td>
                      <td style={{ ...td, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace' }}>{r.token_prefix}…</td>
                      <td style={td}>{(r.scopes ?? []).join(', ')}</td>
                      <td style={td}><span className={badgeClass(s)}>{s}</span></td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{fmtDate(r.last_used_at)}</td>
                      <td style={td}>{r.request_count}</td>
                      <td style={td}>{r.active ? <RevokeButton id={r.id} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
