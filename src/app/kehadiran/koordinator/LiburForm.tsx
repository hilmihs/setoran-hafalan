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
          <label className="t-small" htmlFor="libur_program_id" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Program
          </label>
          <select
            id="libur_program_id"
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
          <label className="t-small" htmlFor="libur_tanggal" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Tanggal
          </label>
          <input
            id="libur_tanggal"
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
          <label className="t-small" htmlFor="libur_keterangan" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Keterangan
          </label>
          <input
            id="libur_keterangan"
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
