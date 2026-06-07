'use client';

import { useFormState } from 'react-dom';
import { submitShakwaPeserta } from './actions';

export default function ShakwaPesertaPage() {
  const [state, action] = useFormState(submitShakwaPeserta, undefined);

  if (state?.ok) {
    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="page" style={{ paddingTop: 20 }}>
            <div className="topbar">
              <div className="wordmark">
                <span className="mark">M</span> SHAKWA
              </div>
            </div>

            <div className="card-flat" style={{ padding: '24px 20px', textAlign: 'center' }}>
              <p className="t-body" style={{ fontWeight: 600, color: 'var(--success, #4caf50)', marginBottom: 8 }}>
                Terima kasih, SHAKWA Anda telah diterima.
              </p>
              <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
                Laporan Anda akan ditinjau oleh koordinator.
              </p>
              <a href="/shakwa" className="btn" style={{ display: 'inline-block' }}>
                Kembali
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> SHAKWA
            </div>
            <a href="/shakwa" className="btn-ghost" style={{ fontSize: 14 }}>
              Kembali
            </a>
          </div>

          <div
            style={{
              background: 'var(--primary)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: 8,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            PESERTA
          </div>

          <form action={action}>
            <div style={{ marginBottom: 16 }}>
              <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                NAMA LENGKAP <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                name="nama"
                required
                placeholder="Jawaban Anda"
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
                GENDER <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(['akhwat', 'ikhwan'] as const).map((g) => (
                  <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="radio" name="gender" value={g} required />
                    <span>{g === 'akhwat' ? 'AKHWAT' : 'IKHWAN'}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Alasan keluar dari Program? <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <textarea
                name="alasan_keluar"
                required
                placeholder="Jawaban Anda"
                className="textarea"
                rows={4}
                style={{ width: '100%' }}
              />
            </div>

            <div
              style={{
                background: 'var(--primary)',
                color: 'white',
                padding: '12px 16px',
                borderRadius: 8,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              Saran dan Kritik
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="t-small" style={{ display: 'block', marginBottom: 4 }}>
                &quot;Agar Program HITS ini lebih berdampak, kira-kira apa saja yang perlu kita{' '}
                <strong>perbaiki atau tambahkan bersama?</strong>&quot;
              </label>
              <textarea
                name="saran_kritik"
                placeholder="Jawaban Anda"
                className="textarea"
                rows={4}
                style={{ width: '100%' }}
              />
            </div>

            {state?.error && (
              <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 12 }}>
                {state.error}
              </p>
            )}

            <button type="submit" className="btn" style={{ width: '100%' }}>
              Kirim
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
