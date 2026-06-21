'use client';

import { useState, useTransition } from 'react';
import { decideTabayyun, reminderTabayyunPengajar } from './actions';
import { HITS_KONDISI_LABEL } from '@/types/db';
import type { HitsKondisi } from '@/types/db';

interface Props {
  tabayyun: {
    id: string;
    pengajar_id: string;
    pengajar_name: string;
    kelas_name: string;
    tanggal: string;
    kondisi: HitsKondisi;
    alasan_pengajar: string | null;
    status: string;
    deadline_at: string;
  };
}

export function TabayyunCard({ tabayyun: t }: Props) {
  const [decided, setDecided] = useState(t.status === 'decided');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reminderPending, startReminderTransition] = useTransition();

  if (decided) {
    return (
      <div className="card-flat" style={{ padding: '12px 16px', marginBottom: 8, opacity: 0.6 }}>
        <div className="t-small" style={{ fontWeight: 600 }}>
          {t.pengajar_name} — {t.kelas_name}
        </div>
        <div className="t-small" style={{ color: 'var(--muted-2)' }}>
          {t.tanggal} &bull; {t.kondisi} &bull; Sudah diputuskan
        </div>
      </div>
    );
  }

  function handleDecide(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await decideTabayyun(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok) setDecided(true);
    });
  }

  function handleReminder() {
    startReminderTransition(async () => {
      const result = await reminderTabayyunPengajar(
        t.pengajar_id,
        t.kondisi,
        t.tanggal,
        t.kelas_name
      );
      if (result.waUrl) {
        window.open(result.waUrl, '_blank');
      }
    });
  }

  return (
    <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 8 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.pengajar_name}</div>
          {t.status === 'pending' && (
            <button
              onClick={handleReminder}
              disabled={reminderPending}
              className="act-btn wa"
              style={{ fontSize: 11, flexShrink: 0 }}
            >
              {reminderPending ? '...' : 'Reminder Tabayyun'}
            </button>
          )}
        </div>
        <div className="t-small" style={{ color: 'var(--muted-2)' }}>
          {t.kelas_name} &bull; {t.tanggal} &bull;{' '}
          <span style={{ color: 'var(--kuning-ink)', fontWeight: 600 }}>
            {t.kondisi} — {HITS_KONDISI_LABEL[t.kondisi]}
          </span>
        </div>
        {t.alasan_pengajar && (
          <div className="t-small" style={{ marginTop: 6, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
            <strong>Alasan pengajar:</strong> {t.alasan_pengajar}
          </div>
        )}
        {!t.alasan_pengajar && t.status === 'pending' && (
          <div className="t-small" style={{ marginTop: 6, color: 'var(--muted)' }}>
            Pengajar belum memberikan alasan.
          </div>
        )}
        <div className="t-small" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
          Deadline: {new Date(t.deadline_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
        </div>
      </div>

      <form action={handleDecide}>
        <input type="hidden" name="tabayyun_id" value={t.id} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="is_udzur_syari" value="true" required />
            <span className="t-small" style={{ fontWeight: 500 }}>Udzur syar&apos;i (diterima)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="is_udzur_syari" value="false" />
            <span className="t-small" style={{ fontWeight: 500 }}>Tidak diterima</span>
          </label>
        </div>

        <input
          name="keputusan_catatan"
          className="input"
          placeholder="Catatan keputusan (opsional)"
          style={{ height: 36, fontSize: 13, marginBottom: 8 }}
        />

        {error && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 4 }}>{error}</p>}

        <button type="submit" className="btn btn-sm" disabled={pending} style={{ width: '100%' }}>
          {pending ? 'Menyimpan...' : 'Putuskan'}
        </button>
      </form>
    </div>
  );
}
