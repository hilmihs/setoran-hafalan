'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Status = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';

// H / I / S / A / T sesuai keterangan kehadiran peserta.
const STATUS_OPTIONS: { value: Status; code: string; label: string; color: string }[] = [
  { value: 'hadir', code: 'H', label: 'Hadir', color: 'var(--hijau)' },
  { value: 'izin', code: 'I', label: 'Izin', color: '#64b5f6' },
  { value: 'sakit', code: 'S', label: 'Sakit', color: '#ce93d8' },
  { value: 'tidak_ada_keterangan', code: 'A', label: 'Alpa', color: 'var(--merah)' },
  { value: 'terlambat', code: 'T', label: 'Terlambat', color: 'var(--kuning)' },
];

type PesertaRow = {
  id: string;
  name: string;
  status: Status;
  catatan: string;
};

export function PresensiWizardForm({
  pertemuanId,
  pesertaList,
  remaining,
}: {
  pertemuanId: string;
  pesertaList: PesertaRow[];
  remaining: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PesertaRow[]>(pesertaList);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cegah double-submit / flicker saat berpindah ke hari berikutnya.
  const done = useRef(false);

  function updateRow(id: string, patch: Partial<PesertaRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function markAll(status: Status) {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  }

  async function saveAndNext() {
    if (done.current) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/2in1/kehadiran/${pertemuanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map((r) => ({
            anggota_id: r.id,
            status: r.status,
            catatan: r.catatan || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      done.current = true;
      // Server hitung ulang hari yang belum terisi → maju ke berikutnya / dashboard.
      router.replace('/2in1/ketua-kelas/presensi');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal simpan');
      setSubmitting(false);
    }
  }

  const hadir = rows.filter((r) => r.status === 'hadir' || r.status === 'terlambat').length;

  return (
    <div>
      {/* Summary + bulk */}
      <div className="section-row" style={{ marginBottom: 10 }}>
        <div className="t-small">
          <span style={{ color: 'var(--hijau-ink)', fontWeight: 600 }}>{hadir}</span>
          <span style={{ color: 'var(--muted-2)' }}> / {rows.length} hadir</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => markAll(o.value)}
            className="btn btn-xs btn-ghost"
            style={{ fontSize: 11 }}
          >
            Semua {o.code}
          </button>
        ))}
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <div className="desc">{error}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((p) => (
          <div key={p.id} className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{p.name}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => updateRow(p.id, { status: o.value })}
                  title={o.label}
                  style={{
                    minWidth: 34,
                    padding: '5px 9px',
                    fontSize: 12,
                    fontWeight: p.status === o.value ? 700 : 500,
                    background: p.status === o.value ? o.color : 'var(--bg-input, #f0f0f0)',
                    color: p.status === o.value ? '#fff' : 'var(--muted-2)',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {o.code}
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

      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '10px 2px 0' }}>
        H = Hadir · I = Izin · S = Sakit · A = Alpa · T = Terlambat
      </div>

      <button
        type="button"
        onClick={saveAndNext}
        disabled={submitting}
        className={`btn btn-block ${submitting ? 'btn-soft' : 'btn-primary'}`}
        style={{ marginTop: 16 }}
      >
        {submitting ? 'Menyimpan…' : remaining > 1 ? 'Simpan & Lanjut →' : 'Simpan & Selesai'}
      </button>
    </div>
  );
}
