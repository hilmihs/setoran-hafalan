// query.ts — terjemah query-string → filter tervalidasi + jalankan ke pg-shim.
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EntityDef } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedFilter { column: string; kind: string; value: string | boolean }
export type ParseResult =
  | { ok: true; page: number; limit: number; urut: 'asc' | 'desc'; filters: ParsedFilter[] }
  | { ok: false; code: 'bad_param'; message: string };

const RESERVED = new Set(['page', 'limit', 'urut']);

export function parseRequest(params: URLSearchParams, def: EntityDef): ParseResult {
  const byParam = new Map(def.filters.map(f => [f.param, f]));
  const filters: ParsedFilter[] = [];

  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    const fd = byParam.get(k);
    if (!fd) return { ok: false, code: 'bad_param', message: `Filter tak dikenal: '${k}'.` };
    if (fd.kind === 'date_from' || fd.kind === 'date_to' || fd.kind === 'since') {
      if (!DATE_RE.test(v)) return { ok: false, code: 'bad_param', message: `Tanggal harus YYYY-MM-DD: '${k}'.` };
      filters.push({ column: fd.column, kind: fd.kind, value: v });
    } else if (fd.kind === 'bool' || fd.kind === 'is_null') {
      if (v !== 'true' && v !== 'false') return { ok: false, code: 'bad_param', message: `Nilai boolean harus true/false: '${k}'.` };
      filters.push({ column: fd.column, kind: fd.kind, value: v === 'true' });
    } else {
      filters.push({ column: fd.column, kind: fd.kind, value: v });
    }
  }

  const pageRaw = params.get('page');
  const limitRaw = params.get('limit');
  const page = pageRaw === null ? 1 : Number(pageRaw);
  const limit = limitRaw === null ? 100 : Number(limitRaw);
  if (!Number.isInteger(page) || page < 1) return { ok: false, code: 'bad_param', message: 'page harus bilangan >= 1.' };
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return { ok: false, code: 'bad_param', message: 'limit harus 1–500.' };

  const urutRaw = params.get('urut');
  if (urutRaw !== null && urutRaw !== 'asc' && urutRaw !== 'desc')
    return { ok: false, code: 'bad_param', message: "urut harus 'asc' atau 'desc'." };
  const urut = (urutRaw as 'asc' | 'desc') ?? def.order.dir;

  return { ok: true, page, limit, urut, filters };
}

/** Jalankan query entitas ke DB. Mengembalikan {rows,total}. */
export async function runEntity(def: EntityDef, parsed: Extract<ParseResult, { ok: true }>) {
  let q = supabaseAdmin.from(def.table).select(def.columns.join(', '), { count: 'exact' });
  for (const f of parsed.filters) {
    if (f.kind === 'eq' || f.kind === 'bool') q = q.eq(f.column, f.value);
    else if (f.kind === 'date_from') q = q.gte(f.column, f.value);
    else if (f.kind === 'date_to') q = q.lte(f.column, f.value);
    else if (f.kind === 'since') q = q.gte(f.column, f.value);
    else if (f.kind === 'is_null') { if (f.value === true) q = q.is(f.column, null); else q = q.not(f.column, 'is', null); }
  }
  q = q.order(def.order.column, { ascending: parsed.urut === 'asc' });
  const from = (parsed.page - 1) * parsed.limit;
  q = q.range(from, from + parsed.limit - 1);
  const { data, count } = await q;
  return { rows: data ?? [], total: count ?? 0 };
}
