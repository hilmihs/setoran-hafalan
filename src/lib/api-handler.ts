import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, publicApiEnabled, type AuthedKey } from './api-auth';
import { apiError } from './api-response';
import { checkRateLimit } from './api-ratelimit';
import { recordUsage } from './api-usage';
import { hasScope, type ApiScope } from './api-scopes';

// Konteks route Next 14 (params dinamis, opsional).
export interface RouteCtx {
  params?: Record<string, string>;
}

export type ApiHandler = (
  req: NextRequest,
  ctx: { key: AuthedKey; params: Record<string, string> }
) => Promise<NextResponse> | NextResponse;

/**
 * Bungkus handler route /api/v1:
 *   1. Master-switch mati  → 404 (sembunyikan keberadaan).
 *   2. Key invalid         → 401.
 *   3. Scope kurang        → 403.
 *   4. Rate limit lewat     → 429 + Retry-After.
 *   5. Handler error        → 500 (pesan aman).
 */
export function withApiKey(requiredScope: ApiScope, handler: ApiHandler) {
  return async (req: NextRequest, ctx?: RouteCtx): Promise<NextResponse> => {
    if (!publicApiEnabled()) {
      return apiError('not_found', 'not found', 404);
    }

    const key = await authenticateApiKey(req);
    if (!key) {
      return apiError('unauthorized', 'API key tidak valid atau tidak ada', 401);
    }

    if (!hasScope(key.scopes, requiredScope)) {
      return apiError('forbidden', `key ini tidak punya scope '${requiredScope}'`, 403);
    }

    const rl = checkRateLimit(key.id);
    if (!rl.ok) {
      return apiError('rate_limited', 'terlalu banyak request', 429, {
        'Retry-After': String(rl.retryAfterSec),
      });
    }

    recordUsage(key.id); // non-blocking, buffered

    try {
      return await handler(req, { key, params: ctx?.params ?? {} });
    } catch (e) {
      // Jangan bocorkan detail internal ke konsumen.
      console.error('[api/v1] handler error:', e);
      return apiError('internal_error', 'terjadi kesalahan internal', 500);
    }
  };
}
