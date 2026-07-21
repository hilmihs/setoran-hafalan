import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { dispatchDue, webhooksEnabled } from '@/lib/webhooks';

// Worker pengiriman webhook. Dipicu cron (hit endpoint ini) atau CLI.
// Auth: Bearer <ADMIN_API_TOKEN> (token yang sama dgn konsol admin).
// Master-switch: WEBHOOKS=on (selain itu → 404).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.ADMIN_API_TOKEN ?? '';
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const given = m?.[1] ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!webhooksEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const batchRaw = parseInt(req.nextUrl.searchParams.get('batch') ?? '', 10);
  const batch = Number.isFinite(batchRaw) && batchRaw > 0 ? Math.min(batchRaw, 200) : 50;
  const result = await dispatchDue(batch);
  return NextResponse.json({ ok: true, ...result });
}
