import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase-admin';
import { sanitizeRows } from './api-serialize';
import { apiOk, parsePaging } from './api-response';

// Helper generik list resource read-only: paginasi + filter eq + sanitize.
// Dipakai route master-data & setoran agar tipis dan konsisten.

export interface ListOpts {
  /** [queryParam, kolomDB] — filter eq bila param ada di URL. */
  filters?: Array<[string, string]>;
  order?: { col: string; ascending?: boolean };
  /** detik Cache-Control (default 60 utk master data). */
  cache?: number;
}

function coerce(v: string): string | boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

export async function listTable(
  req: NextRequest,
  table: string,
  opts: ListOpts = {}
): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const paging = parsePaging(sp);

  let q = supabaseAdmin.from(table).select('*', { count: 'exact' });
  for (const [param, col] of opts.filters ?? []) {
    const v = sp.get(param);
    if (v !== null && v !== '') q = q.eq(col, coerce(v));
  }
  if (opts.order) q = q.order(opts.order.col, { ascending: opts.order.ascending ?? true });
  q = q.range(paging.from, paging.to);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return apiOk(
    sanitizeRows(rows),
    { page: paging.page, limit: paging.limit, count: rows.length, total: count ?? undefined },
    { cache: opts.cache ?? 60 }
  );
}
