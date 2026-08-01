// Webhook (push) — enqueue event ke outbox, dispatch dengan retry + HMAC sign.
//
// NB: sengaja TIDAK `import 'server-only'` — dipakai ulang CLI (scripts/webhook.ts,
// scripts/webhook-dispatch.ts) via tsx. Server-side only (impor poolExec).
import { randomBytes, createHmac } from 'crypto';
import { poolExec } from './pg-core';
import { normalizeEvents, type WebhookEvent } from './webhook-events';

export function webhooksEnabled(): boolean {
  return process.env.WEBHOOKS === 'on';
}

// ── Endpoint CRUD ─────────────────────────────────────────────────────
export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  note: string | null;
  created_at: string;
  last_delivery_at: string | null;
  failure_count: number;
}

export interface CreateEndpointResult {
  endpoint: WebhookEndpoint;
  /** Secret HMAC — ditampilkan sekali; konsumen pakai untuk verifikasi tanda tangan. */
  secret: string;
}

export async function createEndpoint(input: {
  url: string;
  events: string[];
  note?: string | null;
  createdByWa?: string | null;
}): Promise<CreateEndpointResult> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('url wajib http(s)://…');
  const events: WebhookEvent[] = normalizeEvents(input.events);
  const secret = randomBytes(24).toString('hex');
  const { rows } = await poolExec(
    `INSERT INTO webhook_endpoints (url, secret, events, note, created_by_wa)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, url, events, active, note, created_at, last_delivery_at, failure_count`,
    [url, secret, events, input.note ?? null, input.createdByWa ?? null]
  );
  return { endpoint: rows[0] as WebhookEndpoint, secret };
}

export async function listEndpoints(): Promise<WebhookEndpoint[]> {
  const { rows } = await poolExec(
    `SELECT id, url, events, active, note, created_at, last_delivery_at, failure_count
     FROM webhook_endpoints ORDER BY created_at DESC`
  );
  return rows as WebhookEndpoint[];
}

export async function setEndpointActive(id: string, active: boolean): Promise<void> {
  await poolExec(`UPDATE webhook_endpoints SET active = $2 WHERE id = $1`, [id, active]);
}

export async function deleteEndpoint(id: string): Promise<void> {
  await poolExec(`DELETE FROM webhook_endpoints WHERE id = $1`, [id]);
}

// ── Emit: enqueue delivery per endpoint yang berlangganan ─────────────
// events = {} → langganan SEMUA event. Best-effort, tak pernah throw ke caller.
export async function emitWebhook(event: WebhookEvent, payload: unknown): Promise<void> {
  if (!webhooksEnabled()) return;
  try {
    const body = { event, data: payload, emitted_at: new Date().toISOString() };
    await poolExec(
      `INSERT INTO webhook_deliveries (endpoint_id, event, payload)
       SELECT id, $1, $2::jsonb FROM webhook_endpoints
       WHERE active AND (cardinality(events) = 0 OR $1 = ANY(events))`,
      [event, JSON.stringify(body)]
    );
  } catch (e) {
    console.error('[webhooks] emit gagal:', e);
  }
}

// ── Signature ─────────────────────────────────────────────────────────
export function signPayload(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Backoff eksponensial: 30s, 60s, 120s, … maks 1 jam.
function backoffSec(attempts: number): number {
  return Math.min(3600, 30 * Math.pow(2, Math.max(0, attempts - 1)));
}

export interface DispatchResult {
  processed: number;
  delivered: number;
  failed: number;
  retried: number;
}

/**
 * Kirim delivery pending yang jatuh tempo. Dipanggil cron (via route/CLI).
 * batch = maks delivery per run. Tiap delivery: POST JSON + HMAC header.
 */
export async function dispatchDue(batch = 50): Promise<DispatchResult> {
  const res: DispatchResult = { processed: 0, delivered: 0, failed: 0, retried: 0 };

  const { rows } = await poolExec(
    `SELECT d.id, d.event, d.payload, d.attempts, d.max_attempts,
            e.url, e.secret, e.id AS endpoint_id
     FROM webhook_deliveries d
     JOIN webhook_endpoints e ON e.id = d.endpoint_id
     WHERE d.status = 'pending' AND d.next_attempt_at <= now() AND e.active
     ORDER BY d.next_attempt_at ASC
     LIMIT $1`,
    [batch]
  );

  for (const row of rows) {
    res.processed++;
    const rawBody = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload);
    const attempts = Number(row.attempts) + 1;
    const maxAttempts = Number(row.max_attempts);
    const sig = signPayload(String(row.secret), rawBody);

    let ok = false;
    let errMsg = '';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const resp = await fetch(String(row.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-maahir-event': String(row.event),
          'x-maahir-delivery': String(row.id),
          'x-maahir-signature': `sha256=${sig}`,
        },
        body: rawBody,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      ok = resp.status >= 200 && resp.status < 300;
      if (!ok) errMsg = `HTTP ${resp.status}`;
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    if (ok) {
      await poolExec(
        `UPDATE webhook_deliveries
         SET status='delivered', attempts=$2, delivered_at=now(), last_error=NULL
         WHERE id=$1`,
        [row.id, attempts]
      );
      await poolExec(
        `UPDATE webhook_endpoints SET last_delivery_at=now(), failure_count=0 WHERE id=$1`,
        [row.endpoint_id]
      );
      res.delivered++;
    } else if (attempts >= maxAttempts) {
      await poolExec(
        `UPDATE webhook_deliveries SET status='failed', attempts=$2, last_error=$3 WHERE id=$1`,
        [row.id, attempts, errMsg]
      );
      await poolExec(
        `UPDATE webhook_endpoints SET failure_count=failure_count+1 WHERE id=$1`,
        [row.endpoint_id]
      );
      res.failed++;
    } else {
      const delay = backoffSec(attempts);
      await poolExec(
        `UPDATE webhook_deliveries
         SET attempts=$2, last_error=$3, next_attempt_at = now() + ($4 || ' seconds')::interval
         WHERE id=$1`,
        [row.id, attempts, errMsg, String(delay)]
      );
      await poolExec(
        `UPDATE webhook_endpoints SET failure_count=failure_count+1 WHERE id=$1`,
        [row.endpoint_id]
      );
      res.retried++;
    }
  }

  return res;
}

// Deliveries terbaru (untuk admin).
export async function recentDeliveries(limit = 50) {
  const { rows } = await poolExec(
    `SELECT id, endpoint_id, event, status, attempts, last_error, created_at, delivered_at, next_attempt_at
     FROM webhook_deliveries ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}
