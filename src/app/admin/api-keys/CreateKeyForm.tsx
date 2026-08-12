'use client';
import { useState } from 'react';
import { createKey, revokeKey } from './actions';
import type { ScopeName } from '@/lib/api-public/types';

const SCOPES: ScopeName[] = ['maahir', 'hits', 'penilaian'];

export function CreateKeyForm() {
  const [nama, setNama] = useState('');
  const [scopes, setScopes] = useState<ScopeName[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const { raw } = await createKey({ nama, scopes, expiresAt: expiresAt || null, keterangan: keterangan || null });
      setRevealed(raw);
      setNama('');
      setScopes([]);
      setExpiresAt('');
      setKeterangan('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal membuat key.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: '1px solid #ccc', padding: 16, borderRadius: 8 }}>
      <h2>Buat key baru</h2>
      {revealed && (
        <div style={{ background: '#fffae6', padding: 12, marginBottom: 12 }}>
          <strong>Salin sekarang — tidak bisa dilihat lagi:</strong>
          <pre style={{ userSelect: 'all', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{revealed}</pre>
          <button onClick={() => setRevealed(null)}>Sudah saya salin</button>
        </div>
      )}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
      <div>
        <input placeholder="nama konsumen" value={nama} onChange={(e) => setNama(e.target.value)} />
      </div>
      <div>
        {SCOPES.map((s) => (
          <label key={s} style={{ marginRight: 12 }}>
            <input
              type="checkbox"
              checked={scopes.includes(s)}
              onChange={(e) => setScopes((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))}
            />{' '}
            {s}
          </label>
        ))}
      </div>
      <div>
        <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /> (kedaluwarsa, opsional)
      </div>
      <div>
        <input placeholder="keterangan" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
      </div>
      <button disabled={busy || !nama || !scopes.length} onClick={submit}>
        Buat
      </button>
    </section>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) return <button onClick={() => setConfirming(true)}>Cabut</button>;
  return (
    <span>
      yakin?{' '}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await revokeKey(id);
          location.reload();
        }}
      >
        ya
      </button>{' '}
      <button onClick={() => setConfirming(false)}>batal</button>
    </span>
  );
}
