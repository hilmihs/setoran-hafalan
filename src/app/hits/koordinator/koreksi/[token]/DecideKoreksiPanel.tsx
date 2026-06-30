'use client';
import { useState, useTransition } from 'react';
import { decideKoreksi } from './actions';

type Item = { id: string; jenis: string; level: string | null; pertemuan_no: number | null; tanggal: string | null; catatan: string | null };

export function DecideKoreksiPanel({ token, items, status }: { token: string; items: Item[]; status: string }) {
  const [approve, setApprove] = useState<Record<string, boolean>>(Object.fromEntries(items.map((it) => [it.id, true])));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(status === 'selesai');
  const [ketuaWaUrl, setKetuaWaUrl] = useState<string | null>(null);

  if (done) {
    return (
      <div className="card-flat" style={{ padding: 16, textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600, marginBottom: 12 }}>Keputusan tersimpan.</p>
        {ketuaWaUrl && <a href={ketuaWaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block">Beri tahu ketua via WA</a>}
      </div>
    );
  }

  function save() {
    setErr(null);
    start(async () => {
      const decisions = items.map((it) => ({ itemId: it.id, approve: !!approve[it.id] }));
      const res = await decideKoreksi(token, decisions);
      if (res?.error) { setErr(res.error); return; }
      setDone(true);
      if (res?.ketuaWaUrl) setKetuaWaUrl(res.ketuaWaUrl);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it) => (
        <div key={it.id} className="card" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 13 }}>
            <strong>{describe(it)}</strong>
            {it.catatan && <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{it.catatan}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={`btn btn-xs ${approve[it.id] ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setApprove((p) => ({ ...p, [it.id]: true }))}>Setujui</button>
            <button type="button" className={`btn btn-xs ${!approve[it.id] ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setApprove((p) => ({ ...p, [it.id]: false }))}>Tolak</button>
          </div>
        </div>
      ))}
      {err && <p className="t-small" style={{ color: 'var(--danger)' }}>{err}</p>}
      <button type="button" className="btn btn-primary btn-block" disabled={pending} onClick={save}>{pending ? 'Menyimpan…' : 'Simpan keputusan'}</button>
    </div>
  );
}

function describe(it: { jenis: string; level: string | null; pertemuan_no: number | null; tanggal: string | null }): string {
  if (it.jenis === 'set_mulai') return `Set tanggal mulai: ${it.tanggal}`;
  if (it.jenis === 'tambah') return `Tambah pertemuan (${it.level}): ${it.tanggal}`;
  if (it.jenis === 'hapus') return `Hapus pertemuan #${it.pertemuan_no} (${it.level})`;
  return `Ubah tanggal #${it.pertemuan_no} (${it.level}) → ${it.tanggal}`;
}
