import { NextResponse } from 'next/server';

// Envelope respons standar Public Read API.
//   sukses : { ok: true, data, meta? }
//   error  : { ok: false, error: { code, message } }
// Konsumen bisa andalkan bentuk konsisten lintas endpoint.

export interface ApiMeta {
  count?: number;
  page?: number;
  limit?: number;
  [k: string]: unknown;
}

export function apiOk(
  data: unknown,
  meta?: ApiMeta,
  init?: { cache?: number }
): NextResponse {
  const res = NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) });
  // GET read → boleh di-cache sebentar (server-to-server / CDN).
  const maxAge = init?.cache ?? 0;
  if (maxAge > 0) {
    res.headers.set('Cache-Control', `public, max-age=${maxAge}`);
  } else {
    res.headers.set('Cache-Control', 'no-store');
  }
  return res;
}

export function apiError(
  code: string,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>
): NextResponse {
  const res = NextResponse.json({ ok: false, error: { code, message } }, { status });
  res.headers.set('Cache-Control', 'no-store');
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) res.headers.set(k, v);
  }
  return res;
}

// Paginasi seragam dari query string. limit default 50, maksimum 200.
export interface Paging {
  page: number;
  limit: number;
  from: number; // offset (0-based) untuk .range()
  to: number; // inklusif untuk .range()
}

export function parsePaging(sp: URLSearchParams): Paging {
  const rawLimit = parseInt(sp.get('limit') ?? '', 10);
  const rawPage = parseInt(sp.get('page') ?? '', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const page = Number.isFinite(rawPage) ? Math.max(rawPage, 1) : 1;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}
