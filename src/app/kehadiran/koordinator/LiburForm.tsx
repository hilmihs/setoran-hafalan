'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createLibur } from './actions';

interface Props {
  programs: { id: string; name: string }[];
}

export function LiburForm({ programs }: Props) {
  const [state, action] = useFormState(createLibur, undefined);

  return (
    <form action={action} className="card-flat" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Program
          </label>
          <select
            name="program_id"
            required
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 14,
            }}
          >
            <option value="">Pilih program...</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Tanggal
          </label>
          <input
            type="date"
            name="tanggal"
            required
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 14,
            }}
          />
        </div>

        <div>
          <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Keterangan
          </label>
          <input
            type="text"
            name="keterangan"
            placeholder="Opsional — misal: Libur Hari Raya"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 14,
            }}
          />
        </div>

        {state?.error && (
          <p className="t-small" style={{ color: 'var(--danger)' }}>{state.error}</p>
        )}
        {state?.ok && (
          <p className="t-small" style={{ color: 'var(--success, #4caf50)', fontWeight: 600 }}>
            Libur berhasil disimpan.
          </p>
        )}

        <SubmitBtn />
      </div>
    </form>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending} style={{ marginTop: 4 }}>
      {pending ? 'Menyimpan...' : 'Simpan Libur'}
    </button>
  );
}
