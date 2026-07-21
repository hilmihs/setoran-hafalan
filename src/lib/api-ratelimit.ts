// Rate limit in-memory per API key (token bucket).
//
// Single-instance VPS (Next standalone) → cukup in-memory. Reset saat redeploy;
// dapat diterima. Kalau nanti multi-instance, ganti ke store bersama (Redis/DB).
//
// Default: 120 request / menit / key. Override via env API_RATE_LIMIT_PER_MIN.

interface Bucket {
  tokens: number;
  updatedAtMs: number;
}

const buckets = new Map<string, Bucket>();

function capacity(): number {
  const n = parseInt(process.env.API_RATE_LIMIT_PER_MIN ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * nowMs di-inject-able untuk test. Isi ulang token linear: cap per 60 detik.
 */
export function checkRateLimit(key: string, nowMs: number = Date.now()): RateResult {
  const cap = capacity();
  const refillPerMs = cap / 60000; // token per ms
  const b = buckets.get(key);

  if (!b) {
    buckets.set(key, { tokens: cap - 1, updatedAtMs: nowMs });
    return { ok: true, remaining: cap - 1, retryAfterSec: 0 };
  }

  const elapsed = Math.max(0, nowMs - b.updatedAtMs);
  b.tokens = Math.min(cap, b.tokens + elapsed * refillPerMs);
  b.updatedAtMs = nowMs;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 };
  }

  // Butuh 1 token → berapa detik lagi.
  const needed = 1 - b.tokens;
  const retryAfterSec = Math.ceil(needed / refillPerMs / 1000);
  return { ok: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) };
}

// Untuk test — kosongkan state.
export function __resetRateLimit() {
  buckets.clear();
}
