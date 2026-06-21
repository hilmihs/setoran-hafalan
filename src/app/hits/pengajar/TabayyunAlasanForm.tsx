'use client';

import { useState, useTransition } from 'react';
import { submitAlasanTabayyun } from './actions';
import { HITS_KONDISI_LABEL, type HitsKondisi } from '@/types/db';

export type TabayyunForPengajar = {
  id: string;
  halaqah_name: string;
  kondisi: HitsKondisi;
  tanggal: string;
  pertemuan_no: number;
  status: string;
  alasan_pengajar: string | null;
};

function OneTabayyun({ t }: { t: TabayyunForPengajar }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(t.status === 'awaiting_reason' || t.status === 'decided');

  function handleSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await submitAlasanTabayyun(undefined, fd);
      if (res?.error) { setError(res.error); return; }
      if (res?.ok) setDone(true);
    });
  }

  return (
    <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.halaqah_name}</div>
        <span className="badge" style={{ background: 'var(--kuning-tint)', borderColor: 'var(--kuning-line)', color: 'var(--kuning-ink)' }}>
          {t.kondisi}
        </span>
      </div>
      <div className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        Pertemuan {t.pertemuan_no} · {t.tanggal} · {HITS_KONDISI_LABEL[t.kondisi]}
      </div>
      {done ? (
        <div className="t-small" style={{ color: 'var(--hijau-ink)' }}>
          ✓ Alasan terkirim{t.status === 'decided' ? ' · sudah diputuskan koordinator' : ' · menunggu keputusan koordinator'}.
        </div>
      ) : (
        <form action={handleSubmit}>
          <input type="hidden" name="tabayyun_id" value={t.id} />
          <textarea
            name="alasan_pengajar"
            required
            rows={2}
            placeholder="Tulis alasan/klarifikasi…"
            defaultValue={t.alasan_pengajar ?? ''}
            className="input"
            style={{ width: '100%', marginBottom: 8 }}
          />
          {error && <div className="t-small" style={{ color: 'var(--merah-ink)', marginBottom: 6 }}>{error}</div>}
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Mengirim…' : 'Kirim Alasan'}
          </button>
        </form>
      )}
    </div>
  );
}

export function TabayyunAlasanPanel({ items }: { items: TabayyunForPengajar[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 className="t-h2" style={{ marginBottom: 4 }}>Tabayyun — Klarifikasi Kondisi Kelas ({items.length})</h2>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
        Kondisi kelas tercatat tidak ideal. Mohon sampaikan alasan/klarifikasi.
      </p>
      {items.map((t) => <OneTabayyun key={t.id} t={t} />)}
    </div>
  );
}
