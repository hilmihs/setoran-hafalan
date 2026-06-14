'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { submitShakwaPengajar } from './actions';
import { KATEGORI_PENGAJAR, HALAQOH_LIST, FORMAT_HINTS } from '@/lib/shakwa-constants';

interface Props {
  pengajarName: string;
  pengajarGender: string;
}

export function ShakwaForm({ pengajarName, pengajarGender }: Props) {
  const [state, action] = useFormState(submitShakwaPengajar, undefined);
  const [kategori, setKategori] = useState('');

  if (state?.ok) {
    return (
      <div className="card-flat" style={{ padding: '24px 20px', textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600, color: 'var(--hijau-ink)', marginBottom: 8 }}>
          Terima kasih, SHAKWA Anda telah diterima.
        </p>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
          Laporan Anda akan ditinjau oleh koordinator.
        </p>
        <a href="/kehadiran/pengajar" className="btn btn-ghost" style={{ display: 'inline-flex' }}>
          Kembali ke Dashboard
        </a>
      </div>
    );
  }

  const hint = FORMAT_HINTS[kategori];
  const izinNote = KATEGORI_PENGAJAR.find((k) => k.value === kategori && 'note' in k);

  return (
    <form action={action}>
      <div
        style={{
          background: 'var(--accent)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: 8,
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        PENGAJAR
      </div>

      <div className="card-flat" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div className="t-small" style={{ color: 'var(--muted-2)' }}>Nama</div>
        <div style={{ fontWeight: 600 }}>{pengajarName}</div>
        <div className="t-small" style={{ color: 'var(--muted-2)', marginTop: 4 }}>Gender</div>
        <div style={{ fontWeight: 600 }}>{pengajarGender === 'akhwat' ? 'AKHWAT' : 'IKHWAN'}</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
          LAPORAN TERKAIT <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {KATEGORI_PENGAJAR.map((k) => (
            <label
              key={k.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                padding: '8px 12px',
                border: '1px solid var(--line-2)',
                borderRadius: 8,
                background: kategori === k.value ? 'var(--surface-2)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="kategori"
                value={k.value}
                required
                onChange={() => setKategori(k.value)}
                style={{ marginTop: 2 }}
              />
              <div>
                <span>{k.label}</span>
                {'note' in k && (
                  <div className="t-small" style={{ color: 'var(--kuning-ink)', marginTop: 2 }}>
                    {(k as { note: string }).note}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {izinNote && (
        <div
          style={{
            background: 'var(--kuning-tint)',
            border: '1px solid var(--kuning-line)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
          }}
        >
          <p className="t-small" style={{ fontWeight: 600 }}>
            Untuk izin harian, gunakan fitur Check-in Kehadiran.
          </p>
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>
            Form ini untuk izin panjang atau kebutuhan khusus.
          </p>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
          HALAQOH <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {HALAQOH_LIST.map((h) => (
            <label key={h} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="radio" name="halaqoh" value={h} required />
              <span>{h.toUpperCase()}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
          Detail Laporan <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        {hint && (
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8, whiteSpace: 'pre-line' }}>
            Silakan tulis dengan format berikut ya...{'\n'}{hint}
          </p>
        )}
        <textarea
          name="isi"
          required
          placeholder="Jawaban Anda"
          className="textarea"
          rows={5}
          style={{ width: '100%' }}
        />
      </div>

      {state?.error && (
        <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 12 }}>
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block">
        Kirim
      </button>
    </form>
  );
}
