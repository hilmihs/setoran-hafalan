import 'server-only';
import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase-admin';
import { sha256Hex } from './api-keys';

// Autentikasi Public Read API. Master-switch: PUBLIC_API=on (selain itu, caller
// harus balas 404 — sembunyikan keberadaan endpoint, pola sama /api/admin/db).

export interface AuthedKey {
  id: string;
  name: string;
  scopes: string[];
}

export function publicApiEnabled(): boolean {
  return process.env.PUBLIC_API === 'on';
}

// Ambil key mentah dari header. Dukung `Authorization: Bearer <key>` & `x-api-key`.
function extractKey(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  const xk = req.headers.get('x-api-key');
  return xk ? xk.trim() : null;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  // Keduanya hex sha256 → panjang selalu sama (64). Cek panjang tetap dijaga.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Verifikasi key → { id, name, scopes } atau null (invalid/expired/revoked).
 * Format: mhr_<env>_<prefix8>_<secret>. Lookup by key_prefix (3 token pertama),
 * lalu bandingkan sha256(full) constant-time.
 */
export async function authenticateApiKey(req: NextRequest): Promise<AuthedKey | null> {
  const raw = extractKey(req);
  if (!raw) return null;

  const parts = raw.split('_');
  // mhr, env, prefix8, secret → tepat 4 token (hex tak mengandung '_').
  if (parts.length !== 4 || parts[0] !== 'mhr') return null;
  const keyPrefix = `${parts[0]}_${parts[1]}_${parts[2]}`;

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, key_hash, scopes, active, expires_at')
    .eq('key_prefix', keyPrefix)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.active) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;

  if (!constantTimeEqualHex(sha256Hex(raw), String(data.key_hash))) return null;

  // Stamp last_used_at best-effort (non-blocking, jangan jatuhkan request).
  void supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(
      () => {},
      () => {}
    );

  return { id: data.id, name: data.name, scopes: (data.scopes ?? []) as string[] };
}
