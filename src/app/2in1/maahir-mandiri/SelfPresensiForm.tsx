'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitSelfPresensi } from './actions';

type Status = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';

const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'hadir', label: 'Hadir', color: 'var(--hijau)' },
  { value: 'izin', label: 'Izin', color: '#64b5f6' },
  { value: 'sakit', label: 'Sakit', color: '#ce93d8' },
  { value: 'terlambat', label: 'Terlambat', color: 'var(--kuning)' },
  { value: 'tidak_ada_keterangan', label: 'Tidak hadir', color: 'var(--merah)' },
];

export function SelfPresensiForm({
  kelasId,
  anggotaId,
  tanggal,
  program,
  remaining,
  askSetoran = false,
  initialStatus = 'hadir',
  initialCatatan = '',
  initialSetoran = null,
  submitLabel,
}: {
  kelasId: string;
  anggotaId: string;
  tanggal: string;
  program: string;
  remaining: number;
  askSetoran?: boolean;
  initialStatus?: Status;
  initialCatatan?: string;
  initialSetoran?: number | null;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [catatan, setCatatan] = useState(initialCatatan);
  const [setoran, setSetoran] = useState(initialSetoran === null ? '' : String(initialSetoran));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Setoran hafalan hanya untuk sesi Kelas Maahir & saat hadir/terlambat.
  const showSetoran = askSetoran && program === 'kelas_maahir' && (status === 'hadir' || status === 'terlambat');

  function save() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set('kelas_id', kelasId);
      fd.set('anggota_id', anggotaId);
      fd.set('tanggal', tanggal);
      fd.set('program', program);
      fd.set('status', status);
      fd.set('catatan', catatan);
      if (showSetoran) fd.set('setoran_halaman', setoran);
      const res = await submitSelfPresensi(undefined, fd);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setStatus(o.value)}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              border: status === o.value ? `2px solid ${o.color}` : '1px solid var(--line)',
              background: status === o.value ? o.color : 'var(--surface)',
              color: status === o.value ? '#fff' : 'inherit',
              fontWeight: status === o.value ? 700 : 500, fontSize: 14,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {showSetoran && (
        <div style={{ marginTop: 12 }}>
          <label className="field-label">Setoran hafalan (halaman)</label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={setoran}
            onChange={(e) => setSetoran(e.target.value)}
            placeholder="mis. 2"
            className="input"
            style={{ width: '100%' }}
          />
        </div>
      )}

      {(status === 'izin' || status === 'sakit' || status === 'tidak_ada_keterangan') && (
        <input
          type="text"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Catatan (opsional)…"
          className="input"
          style={{ width: '100%', marginTop: 10 }}
        />
      )}

      {error && <p className="t-small" style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</p>}

      <button type="button" onClick={save} disabled={pending}
        className={`btn btn-block ${pending ? 'btn-soft' : 'btn-primary'}`} style={{ marginTop: 16 }}>
        {pending ? 'Menyimpan…' : submitLabel ?? (remaining > 1 ? 'Simpan & Lanjut →' : 'Simpan & Selesai')}
      </button>
    </div>
  );
}
