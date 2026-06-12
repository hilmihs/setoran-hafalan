'use client';

import { useRef, useState } from 'react';

type Status = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';

const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'hadir', label: 'Hadir', color: 'var(--hijau)' },
  { value: 'terlambat', label: 'Terlambat', color: 'var(--kuning)' },
  { value: 'izin', label: 'Izin', color: '#64b5f6' },
  { value: 'sakit', label: 'Sakit', color: '#ce93d8' },
  { value: 'tidak_ada_keterangan', label: 'TKK', color: 'var(--muted-2)' },
];

type PesertaRow = {
  id: string;
  name: string;
  status: Status;
  catatan: string;
};

export function KehadiranForm({
  pertemuanId,
  pesertaList,
}: {
  pertemuanId: string;
  pesertaList: PesertaRow[];
}) {
  const [rows, setRows] = useState<PesertaRow[]>(pesertaList);
  const [globalStatus, setGlobalStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateRow(pesertaId: string, patch: Partial<PesertaRow>) {
    setRows((prev) => {
      const next = prev.map((r) => r.id === pesertaId ? { ...r, ...patch } : r);
      scheduleAutoSave(next);
      return next;
    });
  }

  function markAll(status: Status) {
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, status }));
      scheduleAutoSave(next);
      return next;
    });
  }

  function scheduleAutoSave(current: PesertaRow[]) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setGlobalStatus('idle');
    saveTimeout.current = setTimeout(() => saveAll(current), 1000);
  }

  async function saveAll(current: PesertaRow[]) {
    setGlobalStatus('saving');
    setError(null);
    try {
      const res = await fetch(`/api/2in1/kehadiran/${pertemuanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: current.map((r) => ({
            peserta_id: r.id,
            status: r.status,
            catatan: r.catatan || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      setGlobalStatus('saved');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal simpan');
      setGlobalStatus('error');
    }
  }

  const hadir = rows.filter((r) => r.status === 'hadir' || r.status === 'terlambat').length;

  return (
    <div>
      {/* Summary bar */}
      <div className="section-row" style={{ marginBottom: 12 }}>
        <div className="t-small">
          <span style={{ color: 'var(--hijau-ink)', fontWeight: 600 }}>{hadir}</span>
          <span style={{ color: 'var(--muted-2)' }}> / {rows.length} hadir</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {globalStatus === 'saving' && <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>Menyimpan…</span>}
          {globalStatus === 'saved' && <span className="t-tiny" style={{ color: 'var(--hijau-ink)' }}>✓ Tersimpan</span>}
          {globalStatus === 'error' && <span className="t-tiny" style={{ color: 'var(--merah-ink)' }}>✗ Gagal</span>}
        </div>
      </div>

      {/* Bulk mark */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => markAll(o.value)}
            className="btn btn-xs btn-ghost"
            style={{ fontSize: 11 }}
          >
            Semua {o.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <div className="desc">{error}</div>
        </div>
      )}

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((p) => (
          <div key={p.id} className="card" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => updateRow(p.id, { status: o.value })}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: p.status === o.value ? 700 : 400,
                    background: p.status === o.value ? o.color : 'var(--bg-input, #f0f0f0)',
                    color: p.status === o.value ? '#fff' : 'var(--muted-2)',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {(p.status === 'izin' || p.status === 'sakit' || p.catatan) && (
              <input
                type="text"
                value={p.catatan}
                onChange={(e) => updateRow(p.id, { catatan: e.target.value })}
                placeholder="catatan..."
                style={{
                  marginTop: 6,
                  width: '100%',
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input, #f5f5f5)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => saveAll(rows)}
        className="btn btn-primary btn-block"
        style={{ marginTop: 20 }}
      >
        Simpan Kehadiran
      </button>
    </div>
  );
}
