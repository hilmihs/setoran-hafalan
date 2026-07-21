'use client';

import { useState, useTransition } from 'react';
import type { WebhookEndpoint } from '@/lib/webhooks';
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABEL } from '@/lib/webhook-events';
import { createEndpointAction, setActiveAction, deleteEndpointAction } from './actions';

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

interface Delivery {
  id: string;
  endpoint_id: string;
  event: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
  next_attempt_at: string | null;
}

export default function WebhooksAdmin({
  endpoints,
  deliveries,
}: {
  endpoints: WebhookEndpoint[];
  deliveries: Record<string, unknown>[];
}) {
  const rows = deliveries as unknown as Delivery[];
  const [pending, start] = useTransition();
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setSecret(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await createEndpointAction(fd);
      if (res.ok && res.secret) {
        setSecret(res.secret);
        form.reset();
      } else {
        setErr(res.error ?? 'gagal membuat endpoint');
      }
    });
  }

  return (
    <div>
      {/* ── Form endpoint baru ── */}
      <form onSubmit={onCreate} className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h2 className="t-h2" style={{ marginTop: 0, marginBottom: 12 }}>Tambah Endpoint</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <label className="t-small">
            URL tujuan (https)
            <input name="url" required type="url" placeholder="https://situs-lain.com/webhook" className="input" style={{ width: '100%' }} />
          </label>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
            <legend className="t-small" style={{ padding: '0 6px' }}>Event (kosong = semua)</legend>
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="t-small" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
                <input type="checkbox" name="events" value={ev} />
                <span><code>{ev}</code> — {WEBHOOK_EVENT_LABEL[ev]}</span>
              </label>
            ))}
          </fieldset>

          <label className="t-small">
            Catatan (opsional)
            <input name="note" className="input" style={{ width: '100%' }} />
          </label>

          <div>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Menyimpan…' : 'Tambah Endpoint'}
            </button>
          </div>
        </div>

        {err && <p className="t-small" style={{ color: 'var(--danger, #dc2626)', marginTop: 10 }}>{err}</p>}

        {secret && (
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
              ✅ Endpoint dibuat — SECRET HMAC (salin sekarang, tak ditampilkan lagi):
            </p>
            <code style={{ display: 'block', wordBreak: 'break-all', background: 'var(--bg)', padding: '8px 10px', borderRadius: 6, fontSize: 13 }}>
              {secret}
            </code>
            <p className="t-small" style={{ margin: '8px 0 0', color: 'var(--muted-2)' }}>
              Konsumen verifikasi: <code>HMAC-SHA256(secret, rawBody)</code> = header <code>x-maahir-signature</code> (tanpa prefix <code>sha256=</code>).
            </p>
          </div>
        )}
      </form>

      {/* ── Daftar endpoint ── */}
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Endpoint ({endpoints.length})</h2>
      {endpoints.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada endpoint.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 24 }}>
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>URL</th>
                <th style={{ textAlign: 'left' }}>Event</th>
                <th style={{ textAlign: 'left' }}>Status</th>
                <th style={{ textAlign: 'left' }}>Gagal</th>
                <th style={{ textAlign: 'left' }}>Kirim terakhir</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e.id}>
                  <td style={{ wordBreak: 'break-all', maxWidth: 260 }}>{e.url}</td>
                  <td>{e.events.length ? e.events.map((ev) => <code key={ev} style={{ fontSize: 11, display: 'block' }}>{ev}</code>) : <em>semua</em>}</td>
                  <td>{e.active ? <span style={{ color: 'var(--ok, #059669)' }}>aktif</span> : <span style={{ color: 'var(--muted-2)' }}>nonaktif</span>}</td>
                  <td>{e.failure_count}</td>
                  <td className="t-small">{fmt(e.last_delivery_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      disabled={pending}
                      onClick={() => start(async () => { await setActiveAction(e.id, !e.active); })}
                    >
                      {e.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      disabled={pending}
                      onClick={() => start(async () => { await deleteEndpointAction(e.id); })}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pengiriman terbaru ── */}
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Pengiriman Terbaru</h2>
      {rows.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada pengiriman.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Event</th>
                <th style={{ textAlign: 'left' }}>Status</th>
                <th style={{ textAlign: 'left' }}>Percobaan</th>
                <th style={{ textAlign: 'left' }}>Dibuat</th>
                <th style={{ textAlign: 'left' }}>Terkirim</th>
                <th style={{ textAlign: 'left' }}>Error terakhir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><code style={{ fontSize: 11 }}>{d.event}</code></td>
                  <td>
                    <span style={{ color: d.status === 'delivered' ? 'var(--ok, #059669)' : d.status === 'failed' ? 'var(--danger, #dc2626)' : 'var(--muted-2)' }}>
                      {d.status}
                    </span>
                  </td>
                  <td>{d.attempts}</td>
                  <td>{fmt(d.created_at)}</td>
                  <td>{fmt(d.delivered_at)}</td>
                  <td style={{ maxWidth: 220, wordBreak: 'break-word', color: 'var(--muted-2)' }}>{d.last_error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
