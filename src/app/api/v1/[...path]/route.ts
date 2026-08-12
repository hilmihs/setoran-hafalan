import { NextRequest } from 'next/server';
import { verifyBearer, recordUsage, flushUsage } from '@/lib/api-public/auth';
import { getEntity } from '@/lib/api-public/registry';
import { parseRequest, runEntity, scopeAllows } from '@/lib/api-public/query';
import { sanitize } from '@/lib/api-public/sanitize';
import { ok, fail, handle } from '@/lib/api-public/respond';
import { getCached, setCached, checkRateLimit, acquireInflight } from '@/lib/api-public/cache';

export const dynamic = 'force-dynamic';

const ENTITY_TTL = 60;
const MAX_INFLIGHT = Number(process.env.PUBLIC_API_MAX_INFLIGHT) || 4;

declare global {
  // eslint-disable-next-line no-var
  var __apiUsageTimer: ReturnType<typeof setInterval> | undefined;
}
if (!globalThis.__apiUsageTimer) {
  globalThis.__apiUsageTimer = setInterval(() => { void flushUsage(); }, 60_000);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(async () => {
    if (process.env.PUBLIC_API !== 'on') return fail('not_found', 'Tidak ditemukan.', 404);

    const auth = await verifyBearer(req.headers.get('authorization'));
    if (!auth.ok) return fail(auth.code, auth.message, auth.status);

    if (!checkRateLimit(auth.client.id, 120)) {
      const r = fail('rate_limited', 'Melewati batas 120/menit.', 429);
      r.headers.set('Retry-After', '2');
      return r;
    }

    const { path } = await ctx.params;
    const route = path.join('/');
    const def = getEntity(route);
    if (!def) return fail('unknown_entity', `Entitas '${route}' tidak ada.`, 404);
    if (!scopeAllows(auth.client.scopes, def.scope))
      return fail('forbidden_scope', `Key tidak punya scope '${def.scope}'.`, 403);

    const params = req.nextUrl.searchParams;
    const parsed = parseRequest(params, def);
    if (!parsed.ok) return fail(parsed.code, parsed.message, 400);

    recordUsage(auth.client.id);

    const cacheKey = `${route}?${params.toString()}|${[...auth.client.scopes].sort().join(',')}`;
    const ifNoneMatch = req.headers.get('if-none-match');
    const cached = getCached(cacheKey);
    if (cached) {
      const c = cached.value as { data: unknown; total: number };
      return ok(c.data, {
        page: parsed.page, limit: parsed.limit, total: c.total,
        has_more: parsed.page * parsed.limit < c.total,
        dari_cache: true, umur_detik: cached.umurDetik,
      }, { ifNoneMatch, ttlSec: ENTITY_TTL });
    }

    const { rows, total } = await acquireInflight(() => runEntity(def, parsed), MAX_INFLIGHT, 5000);
    const data = sanitize(rows);
    setCached(cacheKey, { data, total }, ENTITY_TTL);

    return ok(data, {
      page: parsed.page, limit: parsed.limit, total,
      has_more: parsed.page * parsed.limit < total,
      dari_cache: false, umur_detik: 0,
    }, { ifNoneMatch, ttlSec: ENTITY_TTL });
  });
}
