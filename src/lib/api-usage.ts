// Usage analytics Public Read API — hitung request per kunci per hari.
//
// Increment di-buffer in-memory lalu di-flush berkala (kurangi tulis DB pada
// hot-path). Single-instance VPS → buffer cukup. Buffer hilang saat crash =
// dapat diterima (analytics, bukan billing presisi).
import { supabaseAdmin } from './supabase-admin';
import { poolExec } from './pg-core';

interface Pending {
  // key_id → day(YYYY-MM-DD) → count
  [keyId: string]: { [day: string]: number };
}

const buffer: Pending = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTotal = 0;

const FLUSH_EVERY_MS = 10_000;
const FLUSH_AT_COUNT = 50;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Catat 1 request untuk key (non-blocking). Aman dipanggil tiap request. */
export function recordUsage(keyId: string): void {
  const day = today();
  buffer[keyId] ??= {};
  buffer[keyId][day] = (buffer[keyId][day] ?? 0) + 1;
  pendingTotal += 1;

  if (pendingTotal >= FLUSH_AT_COUNT) {
    void flushUsage();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => void flushUsage(), FLUSH_EVERY_MS);
    // Jangan tahan proses hidup hanya demi flush.
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
  }
}

/** Kosongkan buffer → upsert increment ke DB. Best-effort (tak throw). */
export async function flushUsage(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const snapshot = Object.entries(buffer);
  if (snapshot.length === 0) return;
  // Reset buffer sebelum await (hindari kehilangan increment yang masuk saat flush).
  for (const k of Object.keys(buffer)) delete buffer[k];
  pendingTotal = 0;

  try {
    for (const [keyId, days] of snapshot) {
      for (const [day, count] of Object.entries(days)) {
        await poolExec(
          `INSERT INTO api_key_usage (key_id, day, count) VALUES ($1, $2, $3)
           ON CONFLICT (key_id, day) DO UPDATE SET count = api_key_usage.count + EXCLUDED.count`,
          [keyId, day, count]
        );
      }
    }
  } catch (e) {
    console.error('[api-usage] flush gagal:', e);
  }
}

export interface UsageDay {
  day: string;
  count: number;
}

/** Ambil pemakaian N hari terakhir untuk satu kunci (untuk admin). */
export async function getKeyUsage(keyId: string, days = 30): Promise<UsageDay[]> {
  const { data, error } = await supabaseAdmin
    .from('api_key_usage')
    .select('day, count')
    .eq('key_id', keyId)
    .order('day', { ascending: false })
    .limit(days);
  if (error) return [];
  return (data ?? []).map((r: any) => ({ day: String(r.day), count: Number(r.count) }));
}

/** Total pemakaian per kunci (untuk ringkasan tabel admin). */
export async function getUsageTotals(): Promise<Map<string, number>> {
  const { rows } = await poolExec(
    `SELECT key_id, SUM(count)::bigint AS total FROM api_key_usage GROUP BY key_id`
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(String(r.key_id), Number(r.total));
  return m;
}
