'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { runSeed, type SeedResult, type SeedKey } from '@/app/koordinator/admin/actions';

interface Props {
  seedKey: SeedKey;
  title: string;
  description: string;
  destructive: boolean;
}

export function SeedCard({ seedKey, title, description, destructive }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<SeedResult | undefined, FormData>(
    runSeed,
    undefined
  );

  return (
    <div
      className="card-flat"
      style={{
        padding: 16,
        marginBottom: 12,
        borderLeft: destructive ? '3px solid var(--merah)' : '3px solid var(--hijau)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h3>
            {destructive && (
              <span
                className="badge badge-merah"
                style={{ fontSize: 10, padding: '2px 6px' }}
              >
                DESTRUKTIF
              </span>
            )}
          </div>
          <p className="t-small" style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            {description}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            className="act-btn"
            onClick={() => setOpen(true)}
          >
            Jalankan
          </button>
        )}
      </div>

      {open && !state?.ok && !state?.log && (
        <form action={formAction} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="hidden" name="seed" value={seedKey} />
          <div>
            <label className="field-label">Password koordinator</label>
            <input
              className="input"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          {state?.error && (
            <div className="banner banner-error">
              <div>
                <div className="title">Gagal</div>
                <div className="desc">{state.error}</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="act-btn"
              onClick={() => setOpen(false)}
            >
              Batal
            </button>
            <ConfirmBtn destructive={destructive} />
          </div>
        </form>
      )}

      {state?.log && state.log.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            className="t-tiny"
            style={{ marginBottom: 6, color: state.ok ? 'var(--hijau-ink)' : 'var(--merah-ink)' }}
          >
            {state.ok ? '✓ Sukses' : '✗ Gagal'}
          </div>
          <pre
            style={{
              background: 'var(--surface-2, #f7f7f8)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: 10,
              fontSize: 11,
              lineHeight: 1.5,
              overflowX: 'auto',
              maxHeight: 280,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {state.log.join('\n')}
          </pre>
          <button
            type="button"
            className="act-btn"
            style={{ marginTop: 8 }}
            onClick={() => {
              setOpen(false);
              window.location.reload();
            }}
          >
            Tutup
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmBtn({ destructive }: { destructive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`act-btn ${destructive ? 'warn' : ''}`}
      style={{ flex: 1 }}
    >
      {pending ? 'Memproses…' : destructive ? 'Konfirmasi & Jalankan' : 'Jalankan'}
    </button>
  );
}
