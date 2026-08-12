import { requireAdmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CreateKeyForm, RevokeButton } from './CreateKeyForm';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  await requireAdmin();
  const { data } = await supabaseAdmin
    .from('api_client')
    .select('id, nama, token_prefix, scopes, active, expires_at, last_used_at, request_count, revoked_at')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as any[];
  const today = new Date().toISOString().slice(0, 10);
  const status = (r: any): string =>
    !r.active ? 'dicabut' : r.expires_at && r.expires_at < today ? 'kedaluwarsa' : 'aktif';

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>API Keys</h1>
      <CreateKeyForm />
      <table style={{ width: '100%', marginTop: 24, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Prefix</th>
            <th>Scope</th>
            <th>Status</th>
            <th>Terakhir dipakai</th>
            <th>Req</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.nama}</td>
              <td>
                <code>{r.token_prefix}…</code>
              </td>
              <td>{(r.scopes ?? []).join(', ')}</td>
              <td>{status(r)}</td>
              <td>{r.last_used_at ?? '—'}</td>
              <td>{r.request_count}</td>
              <td>{r.active ? <RevokeButton id={r.id} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
