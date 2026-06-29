import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePengajar } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { DecidePindahPanel } from './DecidePindahPanel';

export const dynamic = 'force-dynamic';

export default async function PindahHalaqahPage({ params }: { params: { token: string } }) {
  // Wajib login sebagai pengajar (middleware redirect unauth /hits/* → /?next=).
  const session = await requirePengajar();
  const wa = await getSessionWa();
  const { token } = params;

  const { data: req } = await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .select('*, halaqah:halaqah_id(name, pengajar_nama_sheet)')
    .eq('token', token)
    .maybeSingle();

  if (!req) {
    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }} className="page">
          <h1 className="t-h1">Pengajuan tidak ditemukan</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>Link tidak valid.</p>
        </div>
      </main>
    );
  }

  const halaqah = req.halaqah as unknown as { name: string; pengajar_nama_sheet: string | null } | null;

  const isTarget =
    (!!req.target_pengajar_id && req.target_pengajar_id === session.pengajar_id) ||
    (!!req.target_wa && !!wa && wa === req.target_wa);

  // Peserta preview.
  const { data: peserta } = await supabaseAdmin
    .from('hits_halaqah_peserta')
    .select('id, nama, status_peserta')
    .eq('halaqah_id', req.halaqah_id)
    .eq('active', true)
    .order('nama');

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 24 }} className="page">
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Pemindahan Halaqah</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
          Persetujuan pengajar tujuan
        </p>

        <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label="Halaqah" value={halaqah?.name ?? '—'} />
          <Row label="Pengajar saat ini" value={halaqah?.pengajar_nama_sheet ?? '—'} />
          <Row label="Diajukan oleh" value={req.requested_by_name} />
          <Row label="Tujuan" value={req.target_name} />
        </div>

        <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 16 }}>
          <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>
            Peserta ({peserta?.length ?? 0})
          </div>
          {(peserta ?? []).length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada peserta aktif.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(peserta ?? []).map((p) => (
                <li key={p.id} className="t-small">
                  {p.nama}
                  {p.status_peserta && p.status_peserta !== 'Aktif' && (
                    <span style={{ color: 'var(--muted-2)' }}> · {p.status_peserta}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {isTarget ? (
          <DecidePindahPanel token={token} status={req.status} catatan={req.catatan} />
        ) : (
          <div className="card-flat" style={{ padding: '16px', textAlign: 'center' }}>
            <p className="t-body" style={{ fontWeight: 600, color: 'var(--danger)' }}>
              Akun yang login bukan pengajar tujuan.
            </p>
            <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
              Link ini hanya untuk <strong>{req.target_name}</strong>. Silakan login dengan akun pengajar tujuan.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span className="t-small" style={{ color: 'var(--muted-2)', minWidth: 130 }}>{label}</span>
      <span className="t-small" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
