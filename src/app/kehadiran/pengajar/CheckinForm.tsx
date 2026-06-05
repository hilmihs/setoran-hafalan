'use client';

import { useState, useTransition } from 'react';
import { submitCheckin, submitAlasan } from './actions';
import type { Gender } from '@/types/db';
import type { ProgramToday } from '@/lib/attendance';

interface Props {
  programs: ProgramToday[];
  checkedKeys: string[];
  pengajarId: string;
  pengajarGender: Gender;
}

export function CheckinForm({ programs, checkedKeys }: Props) {
  const [completed, setCompleted] = useState<string[]>(checkedKeys);
  const [showAlasan, setShowAlasan] = useState(false);
  const [lastWaUrl, setLastWaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remaining = programs.filter(
    (p) => !completed.includes(`${p.type}:${p.id}:${p.tanggal}`)
  );

  const current = remaining[0];

  function handleCheckin(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitCheckin(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok && current) {
        const key = `${current.type}:${current.id}:${current.tanggal}`;
        setCompleted((prev) => [...prev, key]);
        const status = fd.get('status') as string;
        setShowAlasan(status === 'izin' || status === 'sakit');
      }
    });
  }

  function handleAlasan(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitAlasan(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok) {
        setShowAlasan(false);
        if (result.waUrl) setLastWaUrl(result.waUrl);
      }
    });
  }

  if (remaining.length === 0) {
    return (
      <div
        className="card-flat"
        style={{ padding: '24px 20px', textAlign: 'center' }}
      >
        <p className="t-body" style={{ fontWeight: 600, color: 'var(--success, #4caf50)' }}>
          Semua kehadiran sudah terisi!
        </p>
        {lastWaUrl && (
          <a
            href={lastWaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ marginTop: 12, display: 'inline-block' }}
          >
            Kirim notifikasi ke Ketua Kelompok
          </a>
        )}
      </div>
    );
  }

  if (showAlasan && current) {
    return (
      <div className="card-flat" style={{ padding: '16px 20px' }}>
        <h3 className="t-h2" style={{ marginBottom: 4 }}>Ajukan Alasan</h3>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
          {current.name} — {current.tanggal}
        </p>

        <form action={handleAlasan}>
          <input type="hidden" name="tanggal" value={current.tanggal} />
          <input type="hidden" name="jenis" value="alpa" />
          {current.type === 'program' && (
            <input type="hidden" name="program_id" value={current.id} />
          )}
          {current.type === 'kelas_maahir' && (
            <input type="hidden" name="kelas_hits_id" value={current.id} />
          )}

          <textarea
            name="alasan"
            required
            placeholder="Tulis alasan Anda..."
            style={{
              width: '100%',
              minHeight: 80,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 14,
              marginBottom: 12,
              resize: 'vertical',
            }}
          />

          {error && (
            <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn" disabled={pending} style={{ flex: 1 }}>
              {pending ? 'Mengirim...' : 'Kirim Alasan'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowAlasan(false)}
            >
              Lewati
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="card-flat" style={{ padding: '16px 20px' }}>
      <div style={{ marginBottom: 12 }}>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          {remaining.length > 1 ? `${remaining.length} program tersisa` : 'Program terakhir'}
        </p>
        <h3 className="t-h2" style={{ marginBottom: 4 }}>{current.name}</h3>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          {current.tanggal} &bull; {current.waktu_mulai} – {current.waktu_selesai}
        </p>
      </div>

      <form action={handleCheckin}>
        <input type="hidden" name="tanggal" value={current.tanggal} />
        {current.type === 'program' && (
          <input type="hidden" name="program_id" value={current.id} />
        )}
        {current.type === 'kelas_maahir' && (
          <input type="hidden" name="kelas_hits_id" value={current.id} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {(['hadir', 'izin', 'sakit'] as const).map((s) => (
            <label
              key={s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              <input type="radio" name="status" value={s} required />
              <span style={{ fontWeight: 500 }}>
                {s === 'hadir' ? 'Hadir' : s === 'izin' ? 'Izin (Tidak Hadir)' : 'Sakit'}
              </span>
            </label>
          ))}
        </div>

        {error && (
          <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
            {error}
          </p>
        )}

        <button type="submit" className="btn" disabled={pending} style={{ width: '100%' }}>
          {pending ? 'Menyimpan...' : 'Simpan'}
        </button>
      </form>

      {lastWaUrl && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <a
            href={lastWaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            Kirim notifikasi ke Ketua Kelompok
          </a>
        </div>
      )}
    </div>
  );
}
