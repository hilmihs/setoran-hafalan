// NB: sengaja TIDAK `import 'server-only'` — modul ini dipakai ulang oleh CLI
// (scripts/apikey.ts via tsx). Sama seperti supabase-admin.ts. Tetap server-side
// (mengimpor supabaseAdmin); jangan import dari komponen client.
import { randomBytes, createHash } from 'crypto';
import { supabaseAdmin } from './supabase-admin';
import { normalizeScopes, type ApiScope } from './api-scopes';

// CRUD + generate untuk tabel api_keys. Dipakai admin page (server actions) &
// CLI (scripts/apikey.ts). READ-ONLY API → tak ada mutasi data domain di sini.

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  created_by_wa: string | null;
  note: string | null;
}

const KEY_ENV = process.env.NODE_ENV === 'production' ? 'live' : 'test';

// Hex (bukan base64url) supaya token TIDAK mengandung '_' — pemisah key
// (mhr_<env>_<prefix8>_<secret>) diparse dengan split('_').
function randomToken(nBytes: number): string {
  return randomBytes(nBytes).toString('hex');
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: string | null; // ISO, opsional
  createdByWa?: string | null;
  note?: string | null;
}

export interface CreateApiKeyResult {
  row: ApiKeyRow;
  /** Full key — HANYA dikembalikan sekali di sini, tak pernah tersimpan plaintext. */
  fullKey: string;
}

/**
 * Buat key baru. Bentuk: mhr_<env>_<prefix8>_<secret>.
 *   key_prefix tersimpan = "mhr_<env>_<prefix8>" (unik, buat lookup).
 *   key_hash   tersimpan = sha256(full key).
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const name = input.name.trim();
  if (!name) throw new Error('name wajib diisi');
  const scopes: ApiScope[] = normalizeScopes(input.scopes);
  if (scopes.length === 0) throw new Error('minimal satu scope valid (master:read|setoran:read|hits:read)');

  const prefix8 = randomToken(6).slice(0, 8); // ~8 char base64url
  const secret = randomToken(24); // ~32 char
  const keyPrefix = `mhr_${KEY_ENV}_${prefix8}`;
  const fullKey = `${keyPrefix}_${secret}`;
  const keyHash = sha256Hex(fullKey);

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
      active: true,
      expires_at: input.expiresAt ?? null,
      created_by_wa: input.createdByWa ?? null,
      note: input.note ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`gagal buat api key: ${error.message}`);
  return { row: data as ApiKeyRow, fullKey };
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, key_prefix, scopes, active, expires_at, last_used_at, created_at, created_by_wa, note')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`gagal ambil api keys: ${error.message}`);
  return (data ?? []) as ApiKeyRow[];
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('api_keys').update({ active: false }).eq('id', id);
  if (error) throw new Error(`gagal cabut api key: ${error.message}`);
}

export async function activateApiKey(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('api_keys').update({ active: true }).eq('id', id);
  if (error) throw new Error(`gagal aktifkan api key: ${error.message}`);
}

export async function updateApiKeyScopes(id: string, scopes: string[]): Promise<void> {
  const clean = normalizeScopes(scopes);
  if (clean.length === 0) throw new Error('minimal satu scope valid');
  const { error } = await supabaseAdmin.from('api_keys').update({ scopes: clean }).eq('id', id);
  if (error) throw new Error(`gagal update scope: ${error.message}`);
}
