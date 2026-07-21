'use client';

import { useState, useTransition } from 'react';
import type { ApiKeyRow } from '@/lib/api-keys';
import { API_SCOPES, API_SCOPE_LABEL, type ApiScope } from '@/lib/api-scopes';
import {
  createKeyAction,
  revokeKeyAction,
  activateKeyAction,
  updateScopesAction,
} from './actions';

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

export default function ApiKeysAdmin({
  keys,
  usage = {},
}: {
  keys: ApiKeyRow[];
  usage?: Record<string, number>;
}) {
  const [pending, start] = useTransition();
  const [newKey, setNewKey] = useState<{ key: string; prefix: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setNewKey(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await createKeyAction(fd);
      if (res.ok && res.fullKey) {
        setNewKey({ key: res.fullKey, prefix: res.prefix ?? '' });
        form.reset();
      } else {
        setErr(res.error ?? 'gagal membuat kunci');
      }
    });
  }

  return (
    <div>
      {/* ── Form buat kunci ── */}
      <form onSubmit={onCreate} className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h2 className="t-h2" style={{ marginTop: 0, marginBottom: 12 }}>Buat Kunci Baru</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <label className="t-small">
            Nama konsumen
            <input name="name" required placeholder="mis. web-yayasan" className="input" style={{ width: '100%' }} />
          </label>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
            <legend className="t-small" style={{ padding: '0 6px' }}>Scope (akses data)</legend>
            {API_SCOPES.map((s) => (
              <label key={s} className="t-small" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
                <input type="checkbox" name="scopes" value={s} />
                <span><code>{s}</code> — {API_SCOPE_LABEL[s]}</span>
              </label>
            ))}
          </fieldset>

          <label className="t-small">
            Kadaluarsa (opsional)
            <input name="expires_at" type="date" className="input" style={{ width: '100%' }} />
          </label>

          <label className="t-small">
            Catatan (opsional)
            <input name="note" className="input" style={{ width: '100%' }} />
          </label>

          <div>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Membuat…' : 'Buat Kunci'}
            </button>
          </div>
        </div>

        {err && <p className="t-small" style={{ color: 'var(--danger, #dc2626)', marginTop: 10 }}>{err}</p>}

        {newKey && (
          <div
            style={{
              marginTop: 14,
              background: 'var(--ok-bg, #ecfdf5)',
              border: '1px solid var(--ok-border, #6ee7b7)',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <p className="t-small" style={{ margin: '0 0 6px', fontWeight: 600 }}>
              ✅ Kunci dibuat — salin sekarang, tak akan ditampilkan lagi:
            </p>
            <code
              style={{
                display: 'block',
                wordBreak: 'break-all',
                background: 'var(--bg)',
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {newKey.key}
            </code>
          </div>
        )}
      </form>

      {/* ── Daftar kunci ── */}
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Kunci Terdaftar ({keys.length})</h2>
      {keys.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada kunci.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Nama</th>
                <th style={{ textAlign: 'left' }}>Prefix</th>
                <th style={{ textAlign: 'left' }}>Scope</th>
                <th style={{ textAlign: 'left' }}>Status</th>
                <th style={{ textAlign: 'left' }}>Total req</th>
                <th style={{ textAlign: 'left' }}>Dipakai</th>
                <th style={{ textAlign: 'left' }}>Kadaluarsa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <KeyRow key={k.id} row={k} pending={pending} start={start} total={usage[k.id] ?? 0} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KeyRow({
  row,
  pending,
  start,
  total,
}: {
  row: ApiKeyRow;
  pending: boolean;
  start: React.TransitionStartFunction;
  total: number;
}) {
  const [editing, setEditing] = useState(false);
  const [scopes, setScopes] = useState<string[]>(row.scopes);

  function toggle(s: ApiScope) {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }
  function saveScopes() {
    start(async () => {
      await updateScopesAction(row.id, scopes);
      setEditing(false);
    });
  }

  return (
    <tr>
      <td>{row.name}</td>
      <td><code style={{ fontSize: 12 }}>{row.key_prefix}</code></td>
      <td>
        {editing ? (
          <div style={{ display: 'grid', gap: 2 }}>
            {API_SCOPES.map((s) => (
              <label key={s} className="t-small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />
                <code style={{ fontSize: 11 }}>{s}</code>
              </label>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button className="btn btn-sm btn-primary" onClick={saveScopes} disabled={pending}>Simpan</button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setScopes(row.scopes); setEditing(false); }}>Batal</button>
            </div>
          </div>
        ) : (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {row.scopes.length ? row.scopes.map((s) => <code key={s} style={{ fontSize: 11 }}>{s}</code>) : '—'}
            <button className="btn btn-xs btn-ghost" onClick={() => setEditing(true)} title="edit scope">✎</button>
          </span>
        )}
      </td>
      <td>
        {row.active ? (
          <span style={{ color: 'var(--ok, #059669)' }}>aktif</span>
        ) : (
          <span style={{ color: 'var(--muted-2)' }}>dicabut</span>
        )}
      </td>
      <td className="t-small">{total.toLocaleString('id-ID')}</td>
      <td className="t-small">{fmt(row.last_used_at)}</td>
      <td className="t-small">{row.expires_at ? fmt(row.expires_at) : '—'}</td>
      <td>
        {row.active ? (
          <button
            className="btn btn-sm btn-ghost"
            disabled={pending}
            onClick={() => start(async () => { await revokeKeyAction(row.id); })}
          >
            Cabut
          </button>
        ) : (
          <button
            className="btn btn-sm btn-ghost"
            disabled={pending}
            onClick={() => start(async () => { await activateKeyAction(row.id); })}
          >
            Aktifkan
          </button>
        )}
      </td>
    </tr>
  );
}
