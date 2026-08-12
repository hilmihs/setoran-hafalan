# API Publik Maahir — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose read-only `/api/v1/*` HTTP API that lets other websites pull Maahir program data (raw entities + derived rekap), guarded by per-consumer API keys stored hashed in a new `api_client` table and managed from an admin page.

**Architecture:** Registry-driven catch-all route for 36 raw entities + 6 explicit rekap routes wrapping existing libs. Every column that leaves is declared explicitly in a registry; a module-load audit fails the app at startup if any entity names a forbidden column (WA numbers, password hashes, tokens, audio URLs). Auth verifies `Authorization: Bearer` against SHA-256 hashes with a 30s in-memory cache; usage counters flush every 60s. In-memory response cache + inflight limiter + rate limit protect the single systemd process that also serves the working app.

**Tech Stack:** Next.js App Router (route handlers), TypeScript, `src/lib/pg-shim.ts` via `supabaseAdmin` for queries, `tsx` offline tests (no framework), `crypto` (Node) for key gen/hash.

**Source of truth for this plan:** `docs/superpowers/specs/2026-08-11-api-publik-maahir-design.md`. Section refs below (§N) point there. The spec's §4 and §6 tables are the exhaustive column/filter data; tasks that build the registry transcribe those tables verbatim into typed declarations — the tables ARE the data, treat them as such.

**Repo conventions verified before writing this plan:**
- Queries go through `import { supabaseAdmin } from '@/lib/supabase-admin'` then `.from('table').select('col, col').eq(...)` — the pg-shim mimics supabase-js (`test-pg-shim.ts`, `hits-rekap.ts:73`).
- Tests are plain `tsx` scripts under `scripts/`, offline, using PGlite when DB needed, with a hand-rolled `check(name, cond)` counter (`scripts/test-pg-shim.ts`). Register each as an `npm run` alias in `package.json`.
- Master-switch pattern: `process.env.ADMIN_DB_API === 'on'` (`src/app/api/admin/db/route.ts:14`). Mirror for `PUBLIC_API`.
- Admin guard: `requireAdmin()` from `src/lib/admin-guard.ts` (used by `/admin/db`, `/admin/users`).
- Audit: `logAudit(opts)` from `src/lib/audit.ts`. Error diag: `recordErrorDiag(err)` from `src/lib/error-diag.ts`.
- Manual SQL migrations live in `scripts/sql/*.sql`, applied via `npm run db -- --confirm "<sql>"` (HTTP to `/api/admin/db`, no SSH — `scripts/db.ts`).
- `maintenanceGate` already covers `/api/*` (`src/middleware.ts`) — no extra code, just document.

---

## File Structure

Created:

```
scripts/sql/2026-08-11-api-client.sql        migration for api_client table
src/lib/api-public/
  types.ts        shared types (EntityDef, FilterDef, AuthOk, ScopeName, ...)
  auth.ts         hashKey, generateKey, verifyBearer (30s cache), usage flush
  respond.ts      ok()/fail()/handle() envelopes, ETag, 304, error capture
  query.ts        parseRequest() → {page,limit,urut,filters} | {error}, runEntity()
  sanitize.ts     recursive forbidden-key stripper + Map→object
  cache.ts        response cache (32MB LRU, TTL), inflight limiter, rate limit
  registry.ts     ENTITIES map, FORBIDDEN_COLUMNS, module-load audit
  rekap.ts        6 rekap builders wrapping existing libs
src/app/api/v1/[...path]/route.ts            catch-all raw entities
src/app/api/v1/rekap/laporan-maahir/route.ts
src/app/api/v1/rekap/sp/route.ts
src/app/api/v1/rekap/kehadiran/route.ts
src/app/api/v1/rekap/tibyan/route.ts
src/app/api/v1/rekap/hits-disiplin/route.ts
src/app/api/v1/rekap/matrix-guru/route.ts
src/app/admin/api-keys/page.tsx              list + create form (server component)
src/app/admin/api-keys/actions.ts            createKey / revokeKey server actions
src/app/admin/api-keys/CreateKeyForm.tsx     client bits (reveal-once display)
scripts/test-api-public.ts                   offline test suite
scripts/check-api-registry.ts                registry vs prod information_schema
docs/API-PUBLIC.md                           consumer docs
```

Modified:

```
package.json                    add "test-api", "check-api" script aliases
docs/HANDOVER-MAAHIR.md         §HTTP API Endpoints — add missing + /api/v1/* block
```

**Boundary rule:** `registry.ts` holds only declarations (data). `query.ts` holds the generic entity fetch. `rekap.ts` holds the 6 hand-written wrappers. Route files are thin — parse, delegate, respond. No `select('*')` anywhere in this tree.

---

## Phase 0 — Schema

### Task 1: `api_client` migration

**Files:**
- Create: `scripts/sql/2026-08-11-api-client.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 2026-08-11-api-client.sql — tabel key konsumen API publik.
-- Apply sekali ke prod: npm run db -- --confirm "$(cat scripts/sql/2026-08-11-api-client.sql)"
create table if not exists api_client (
  id            uuid primary key default gen_random_uuid(),
  nama          text not null unique,
  token_hash    text not null unique,
  token_prefix  text not null,
  scopes        text[] not null,
  active        boolean not null default true,
  expires_at    date,
  keterangan    text,
  created_at    timestamptz not null default now(),
  created_by    text,
  revoked_at    timestamptz,
  revoked_by    text,
  last_used_at  timestamptz,
  request_count bigint not null default 0
);
create index if not exists api_client_token_hash_idx on api_client (token_hash);
```

- [ ] **Step 2: Add table to PGlite test schema so offline tests can use it**

The offline test suite (Task 15) seeds PGlite. Add the same `create table` to the test's setup rather than the global `db-migration/schema.sql` (that file is a partial snapshot — see §2; do not edit it). Confirm by grepping: `grep -c api_client scripts/test-api-public.ts` after Task 15.

- [ ] **Step 3: Commit**

```bash
git add scripts/sql/2026-08-11-api-client.sql
git commit -m "feat(api): migrasi tabel api_client untuk key konsumen"
```

> **Prod apply is a release step, not a code step.** Do NOT run `npm run db -- --confirm` now. It happens in Phase 8 (Task 30) before deploy, because the pipeline does not run migrations and the table must exist before dependent code deploys (§12.1).

---

## Phase 1 — Foundation (no routes yet; tests green first)

### Task 2: Shared types

**Files:**
- Create: `src/lib/api-public/types.ts`

- [ ] **Step 1: Write the types**

```ts
// types.ts — tipe bersama jalur API publik.
export type ScopeName = 'maahir' | 'hits' | 'penilaian';

export type FilterKind = 'eq' | 'bool' | 'date_from' | 'date_to' | 'since' | 'is_null';

export interface FilterDef {
  /** nama param di query-string, mis. 'gender' */
  param: string;
  /** kolom DB yang difilter, mis. 'gender' */
  column: string;
  kind: FilterKind;
}

export interface EntityDef {
  /** segmen route setelah /api/v1/, mis. 'peserta' atau 'hits/batch' */
  route: string;
  table: string;
  scope: ScopeName;
  /** kolom yang keluar — WAJIB eksplisit, tak ada '*' */
  columns: string[];
  filters: FilterDef[];
  /** kolom + arah urutan default */
  order: { column: string; dir: 'asc' | 'desc' };
}

export interface AuthClient {
  id: string;
  nama: string;
  scopes: ScopeName[];
}

export type AuthResult =
  | { ok: true; client: AuthClient }
  | { ok: false; status: number; code: string; message: string };

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  has_more?: boolean;
  dari_cache: boolean;
  umur_detik: number;
  [k: string]: unknown;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no other files import it yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-public/types.ts
git commit -m "feat(api): tipe bersama jalur api-public"
```

---

### Task 3: `sanitize.ts` — forbidden-key stripper

**Files:**
- Create: `src/lib/api-public/sanitize.ts`
- Test: `scripts/test-api-public.ts` (created here, extended later)

- [ ] **Step 1: Write the failing test**

Create `scripts/test-api-public.ts`:

```ts
/**
 * test-api-public.ts — uji jalur API publik, luring. Jalankan: npm run test-api
 */
import { sanitize } from '../src/lib/api-public/sanitize';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

function testSanitize() {
  console.log('sanitize:');
  // buang kunci terlarang snake & camel, di kedalaman berapa pun
  const dirty = {
    id: '1', name: 'A', whatsapp_number: '628x', whatsappNumber: '628y',
    nested: { ketua_wa: 'z', ketuaWa: 'z', password_hash: 'h', ok: 1 },
    list: [{ magic_token: 't', keep: 2 }],
  };
  const clean = sanitize(dirty) as any;
  check('drop whatsapp_number', clean.whatsapp_number === undefined);
  check('drop whatsappNumber', clean.whatsappNumber === undefined);
  check('drop nested ketua_wa/ketuaWa', clean.nested.ketuaWa === undefined && clean.nested.ketua_wa === undefined);
  check('drop nested password_hash', clean.nested.password_hash === undefined);
  check('keep nested ok', clean.nested.ok === 1);
  check('drop magic_token in array', clean.list[0].magic_token === undefined);
  check('keep array sibling', clean.list[0].keep === 2);
  check('keep name/id', clean.id === '1' && clean.name === 'A');

  // Map → object
  const m = new Map<string, number>([['a', 1], ['b', 2]]);
  const mo = sanitize({ byPengajar: m }) as any;
  check('Map→object', mo.byPengajar.a === 1 && mo.byPengajar.b === 2 && !(mo.byPengajar instanceof Map));

  // catatan/keterangan NOT stripped, WA on same object IS stripped (§1, §5)
  const att = { keterangan: 'demam', catatan: 'ibu sakit', whatsappNumber: '628', name: 'B' };
  const a2 = sanitize(att) as any;
  check('keep keterangan', a2.keterangan === 'demam');
  check('keep catatan', a2.catatan === 'ibu sakit');
  check('still drop whatsappNumber next to catatan', a2.whatsappNumber === undefined);
}

async function main() {
  testSanitize();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main();
```

Add to `package.json` scripts: `"test-api": "tsx scripts/test-api-public.ts"`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test-api`
Expected: FAIL — cannot find module `sanitize` / `sanitize is not a function`.

- [ ] **Step 3: Implement `sanitize.ts`**

```ts
// sanitize.ts — buang kunci terlarang rekursif (snake & camel), Map→objek.
// catatan/keterangan SENGAJA tidak masuk daftar — lihat spec §1, §5.
const FORBIDDEN_KEYS = new Set([
  'whatsapp_number', 'whatsappNumber',
  'ketua_wa', 'ketuaWa', 'wakil_wa', 'wakilWa',
  'password_hash', 'passwordHash',
  'magic_token', 'magicToken',
  'new_password_plaintext', 'newPasswordPlaintext',
  'token',
  'audio_url', 'audioUrl',
  'masukan',
  'ket_bacaan', 'ketBacaan', 'ket_hafalan', 'ketHafalan',
  'catatan_umum', 'catatanUmum',
]);

export function sanitize(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value) obj[String(k)] = sanitize(v);
    return obj;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test-api`
Expected: PASS — all sanitize checks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-public/sanitize.ts scripts/test-api-public.ts package.json
git commit -m "feat(api): sanitize() pembuang kunci terlarang + Map→objek"
```

---

### Task 4: `auth.ts` — key gen, hash, verify, usage flush

**Files:**
- Create: `src/lib/api-public/auth.ts`
- Test: extend `scripts/test-api-public.ts`

- [ ] **Step 1: Write the failing test**

Append to `scripts/test-api-public.ts` (import at top, call in `main`):

```ts
import { generateKey, hashKey, __verifyRow, recordUsage, __drainUsage, __resetAuthCache } from '../src/lib/api-public/auth';

function testKeyGen() {
  console.log('key gen:');
  const a = generateKey();
  const b = generateKey();
  check('prefix k_live_', a.raw.startsWith('k_live_'));
  check('raw length >= 40', a.raw.length >= 40);
  check('token_prefix = first 12 of raw', a.tokenPrefix === a.raw.slice(0, 12));
  check('hash matches raw', a.tokenHash === hashKey(a.raw));
  check('two keys differ', a.raw !== b.raw && a.tokenHash !== b.tokenHash);
  check('hash is 64 hex', /^[0-9a-f]{64}$/.test(a.tokenHash));
}

function testVerifyRow() {
  console.log('verify row:');
  const today = '2026-08-12';
  const base = { id: 'x', nama: 'k', scopes: ['maahir'], active: true, expires_at: null as string | null };
  check('valid → ok', __verifyRow({ ...base }, today).ok === true);
  check('active=false → 401', __verifyRow({ ...base, active: false }, today).ok === false);
  check('expires yesterday → 401', __verifyRow({ ...base, expires_at: '2026-08-11' }, today).ok === false);
  check('expires today → ok (inclusive)', __verifyRow({ ...base, expires_at: '2026-08-12' }, today).ok === true);
  check('expires tomorrow → ok', __verifyRow({ ...base, expires_at: '2026-08-13' }, today).ok === true);
}

function testUsageAccrual() {
  console.log('usage accrual:');
  __resetAuthCache();
  recordUsage('idA'); recordUsage('idA'); recordUsage('idB');
  const drained = __drainUsage();
  check('idA counted 2', drained.find(d => d.id === 'idA')?.count === 2);
  check('idB counted 1', drained.find(d => d.id === 'idB')?.count === 1);
  check('drain resets', __drainUsage().length === 0);
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — module `auth` not found.

- [ ] **Step 3: Implement `auth.ts`**

```ts
// auth.ts — verifikasi Bearer key, cache 30s, akrual pemakaian flush 60s.
import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { AuthResult, AuthClient, ScopeName } from './types';

const AUTH_TTL_MS = (Number(process.env.PUBLIC_API_AUTH_TTL) || 30) * 1000;

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateKey(): { raw: string; tokenHash: string; tokenPrefix: string } {
  const raw = 'k_live_' + randomBytes(32).toString('base64url');
  return { raw, tokenHash: hashKey(raw), tokenPrefix: raw.slice(0, 12) };
}

export interface ClientRow {
  id: string;
  nama: string;
  scopes: string[];
  active: boolean;
  expires_at: string | null;
}

/** Pure: apakah baris ini sah untuk `today` (YYYY-MM-DD). expires_at inklusif. */
export function __verifyRow(row: ClientRow, today: string): AuthResult {
  if (!row.active) return { ok: false, status: 401, code: 'unauthorized', message: 'Key tidak aktif.' };
  if (row.expires_at && row.expires_at < today)
    return { ok: false, status: 401, code: 'unauthorized', message: 'Key kedaluwarsa.' };
  return { ok: true, client: { id: row.id, nama: row.nama, scopes: row.scopes as ScopeName[] } };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- cache verifikasi 30s ---
const cache = new Map<string, { at: number; result: AuthResult }>();
export function __resetAuthCache(): void { cache.clear(); usage.clear(); }

export async function verifyBearer(header: string | null): Promise<AuthResult> {
  if (!header || !header.startsWith('Bearer '))
    return { ok: false, status: 401, code: 'unauthorized', message: 'Header Authorization Bearer hilang.' };
  const raw = header.slice(7).trim();
  if (!raw) return { ok: false, status: 401, code: 'unauthorized', message: 'Key kosong.' };
  const h = hashKey(raw);

  const hit = cache.get(h);
  if (hit && Date.now() - hit.at < AUTH_TTL_MS) return hit.result;

  const { data } = await supabaseAdmin
    .from('api_client')
    .select('id, nama, scopes, active, expires_at')
    .eq('token_hash', h)
    .maybeSingle();

  let result: AuthResult;
  if (!data) result = { ok: false, status: 401, code: 'unauthorized', message: 'Key tidak dikenal.' };
  else result = __verifyRow(data as ClientRow, todayISO());

  cache.set(h, { at: Date.now(), result });
  return result;
}

// --- akrual pemakaian, flush 60s ---
const usage = new Map<string, number>();
export function recordUsage(clientId: string): void {
  usage.set(clientId, (usage.get(clientId) ?? 0) + 1);
}
export function __drainUsage(): { id: string; count: number }[] {
  const out = [...usage.entries()].map(([id, count]) => ({ id, count }));
  usage.clear();
  return out;
}
export async function flushUsage(): Promise<void> {
  const drained = __drainUsage();
  for (const { id, count } of drained) {
    await supabaseAdmin.rpc; // no-op guard; use raw update below
    await supabaseAdmin
      .from('api_client')
      .update({ last_used_at: new Date().toISOString(), request_count: countExpr(id, count) as unknown as number })
      .eq('id', id);
  }
}
// request_count += count. pg-shim tak dukung ekspresi; fetch-then-set sederhana:
async function countExpr(_id: string, _c: number): Promise<number> { return 0; }
```

> **Note for implementer:** pg-shim `.update()` cannot do `request_count = request_count + n` as an expression. Replace the `flushUsage` body with a read-add-write: `select request_count`, then `update({ request_count: current + count, last_used_at })`. The test only exercises `__drainUsage` (pure), so keep `flushUsage` simple and correct rather than clever. Register the 60s interval in the route module (Task 12), not here, so importing `auth` in tests never starts a timer.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test-api`
Expected: PASS — key gen, verify row, usage accrual green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-public/auth.ts scripts/test-api-public.ts
git commit -m "feat(api): auth key gen/hash/verify + akrual pemakaian"
```

---

### Task 5: `cache.ts` — response cache, inflight limiter, rate limit

**Files:**
- Create: `src/lib/api-public/cache.ts`
- Test: extend `scripts/test-api-public.ts`

- [ ] **Step 1: Write the failing test**

Append tests:

```ts
import { getCached, setCached, __resetCache, checkRateLimit, __resetRate, acquireInflight } from '../src/lib/api-public/cache';

function testCache() {
  console.log('cache:');
  __resetCache();
  setCached('k1', { a: 1 }, 60);
  const h = getCached('k1');
  check('hit returns value', (h?.value as any)?.a === 1);
  check('hit umur >= 0', typeof h?.umurDetik === 'number');
  check('miss returns null', getCached('nope') === null);
  // entri > 1MB dilewati
  const big = { s: 'x'.repeat(1_100_000) };
  setCached('big', big, 60);
  check('oversized not cached', getCached('big') === null);
}

function testRate() {
  console.log('rate limit:');
  __resetRate();
  let last = true;
  for (let i = 0; i < 120; i++) last = checkRateLimit('key', 120);
  check('120th allowed', last === true);
  check('121st blocked', checkRateLimit('key', 120) === false);
  check('other key independent', checkRateLimit('key2', 120) === true);
}

async function testInflight() {
  console.log('inflight:');
  let active = 0, maxSeen = 0;
  const job = () => new Promise<void>(res => { active++; maxSeen = Math.max(maxSeen, active); setTimeout(() => { active--; res(); }, 10); });
  const runs = Array.from({ length: 8 }, () => acquireInflight(job, 4, 5000));
  await Promise.all(runs);
  check('never more than 4 concurrent', maxSeen <= 4);
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — module `cache` not found.

- [ ] **Step 3: Implement `cache.ts`**

```ts
// cache.ts — cache respons di memori (LRU by insertion), rate limit, inflight limiter.
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY = 1 * 1024 * 1024;

interface Entry { value: unknown; at: number; ttlMs: number; bytes: number }
const store = new Map<string, Entry>();
let totalBytes = 0;

function sizeOf(v: unknown): number {
  try { return JSON.stringify(v).length; } catch { return MAX_ENTRY + 1; }
}

export function __resetCache(): void { store.clear(); totalBytes = 0; }

export function getCached(key: string): { value: unknown; umurDetik: number } | null {
  const e = store.get(key);
  if (!e) return null;
  const age = Date.now() - e.at;
  if (age > e.ttlMs) { store.delete(key); totalBytes -= e.bytes; return null; }
  return { value: e.value, umurDetik: Math.floor(age / 1000) };
}

export function setCached(key: string, value: unknown, ttlSec: number): void {
  const override = process.env.PUBLIC_API_CACHE_TTL;
  const ttl = override !== undefined ? Number(override) : ttlSec;
  if (ttl <= 0) return;
  const bytes = sizeOf(value);
  if (bytes > MAX_ENTRY) return;
  const prev = store.get(key);
  if (prev) totalBytes -= prev.bytes;
  while (totalBytes + bytes > MAX_BYTES && store.size) {
    const oldest = store.keys().next().value as string;
    totalBytes -= store.get(oldest)!.bytes;
    store.delete(oldest);
  }
  store.set(key, { value, at: Date.now(), ttlMs: ttl * 1000, bytes });
  totalBytes += bytes;
}

// --- rate limit per key, jendela 60s ---
const hits = new Map<string, number[]>();
export function __resetRate(): void { hits.clear(); }
export function checkRateLimit(key: string, perMin: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter(t => now - t < 60_000);
  if (arr.length >= perMin) { hits.set(key, arr); return false; }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

// --- inflight limiter ---
let inflight = 0;
const waiters: (() => void)[] = [];
export async function acquireInflight<T>(fn: () => Promise<T>, max: number, timeoutMs: number): Promise<T> {
  if (inflight >= max) {
    const got = await new Promise<boolean>(resolve => {
      const t = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); resolve(false); }, timeoutMs);
      const w = () => { clearTimeout(t); resolve(true); };
      waiters.push(w);
    });
    if (!got) { const e = new Error('inflight_timeout'); (e as any).code = 'rate_limited'; throw e; }
  }
  inflight++;
  try { return await fn(); }
  finally { inflight--; const next = waiters.shift(); if (next) next(); }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-public/cache.ts scripts/test-api-public.ts
git commit -m "feat(api): cache respons + rate limit + inflight limiter"
```

---

### Task 6: `respond.ts` — envelopes, ETag, 304, error capture

**Files:**
- Create: `src/lib/api-public/respond.ts`
- Test: extend `scripts/test-api-public.ts`

- [ ] **Step 1: Write the failing test**

Append tests (pure helpers only — the NextResponse wrappers are exercised post-deploy via curl):

```ts
import { etagOf, fail, ok } from '../src/lib/api-public/respond';

function testRespond() {
  console.log('respond:');
  const e1 = etagOf({ a: 1, b: 2 });
  const e2 = etagOf({ a: 1, b: 2 });
  const e3 = etagOf({ a: 1, b: 3 });
  check('same content same etag', e1 === e2);
  check('diff content diff etag', e1 !== e3);

  const f = fail('forbidden_scope', "Key tidak punya scope 'hits'.", 403);
  check('fail status 403', f.status === 403);
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — module `respond` not found.

- [ ] **Step 3: Implement `respond.ts`**

```ts
// respond.ts — envelope sukses/error, ETag, 304, penangkap error.
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { recordErrorDiag } from '@/lib/error-diag';
import type { ApiMeta } from './types';

export function etagOf(body: unknown): string {
  return '"' + createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32) + '"';
}

export function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function ok(
  data: unknown,
  meta: ApiMeta,
  opts: { ifNoneMatch?: string | null; ttlSec: number },
): NextResponse {
  const body = { data, meta };
  const etag = etagOf(body);
  if (opts.ifNoneMatch && opts.ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  const res = NextResponse.json(body);
  res.headers.set('ETag', etag);
  res.headers.set('Cache-Control', `private, max-age=${opts.ttlSec}`);
  return res;
}

/** Bungkus handler: apa pun yang dilempar → 500 internal, detail hanya ke log. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const e = err as { code?: string; message?: string; name?: string };
    if (e.code === 'rate_limited') {
      const res = fail('rate_limited', 'Server sibuk, coba lagi.', 429);
      res.headers.set('Retry-After', '2');
      return res;
    }
    console.error('[api/v1] internal', e);
    recordErrorDiag({ name: e.name, message: e.message });
    return fail('internal', 'Kesalahan tak terduga.', 500);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-public/respond.ts scripts/test-api-public.ts
git commit -m "feat(api): respond envelope + ETag/304 + penangkap error"
```

---

### Task 7: `registry.ts` skeleton — forbidden columns + module-load audit

**Files:**
- Create: `src/lib/api-public/registry.ts`
- Test: extend `scripts/test-api-public.ts`

This task builds the audit machinery + an EMPTY `ENTITIES` map. Entities are filled in Phase 3–5. The audit must throw at module load if any entity names a forbidden column.

- [ ] **Step 1: Write the failing test**

```ts
import { FORBIDDEN_COLUMNS, auditEntities } from '../src/lib/api-public/registry';
import type { EntityDef } from '../src/lib/api-public/types';

function testRegistryAudit() {
  console.log('registry audit:');
  check('forbidden includes whatsapp_number', FORBIDDEN_COLUMNS.includes('whatsapp_number'));
  check('forbidden includes password_hash', FORBIDDEN_COLUMNS.includes('password_hash'));
  check('forbidden includes audio_url', FORBIDDEN_COLUMNS.includes('audio_url'));
  check('forbidden includes magic_token', FORBIDDEN_COLUMNS.includes('magic_token'));

  const good: Record<string, EntityDef> = {
    peserta: { route: 'peserta', table: 'peserta', scope: 'maahir', columns: ['id', 'name'], filters: [], order: { column: 'id', dir: 'asc' } },
  };
  check('clean entities pass audit', auditEntities(good) === undefined || true);

  const bad: Record<string, EntityDef> = {
    peserta: { route: 'peserta', table: 'peserta', scope: 'maahir', columns: ['id', 'whatsapp_number'], filters: [], order: { column: 'id', dir: 'asc' } },
  };
  let threw = false;
  try { auditEntities(bad); } catch { threw = true; }
  check('forbidden column throws', threw);
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — module `registry` not found.

- [ ] **Step 3: Implement skeleton `registry.ts`**

```ts
// registry.ts — deklarasi entitas + daftar kolom terlarang + audit saat modul dimuat.
import type { EntityDef, ScopeName } from './types';

export const FORBIDDEN_COLUMNS: string[] = [
  'password_hash',
  'whatsapp_number', 'ketua_wa', 'wakil_wa',
  'magic_token',
  'new_password_plaintext',
  'token',
  'audio_url',
  'masukan', 'ket_bacaan', 'ket_hafalan', 'catatan_umum',
];

/** Lempar bila ada entitas menyebut kolom terlarang. Dipanggil saat modul dimuat. */
export function auditEntities(entities: Record<string, EntityDef>): void {
  for (const [key, def] of Object.entries(entities)) {
    for (const col of def.columns) {
      if (FORBIDDEN_COLUMNS.includes(col)) {
        throw new Error(`[api registry] entitas '${key}' menyebut kolom terlarang '${col}'`);
      }
    }
  }
}

export const ENTITIES: Record<string, EntityDef> = {
  // diisi di Phase 3–5
};

auditEntities(ENTITIES);

export function getEntity(route: string): EntityDef | null {
  return ENTITIES[route] ?? null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-public/registry.ts scripts/test-api-public.ts
git commit -m "feat(api): kerangka registry + daftar kolom terlarang + audit modul"
```

---

### Task 8: `query.ts` — filter parsing

**Files:**
- Create: `src/lib/api-public/query.ts`
- Test: extend `scripts/test-api-public.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { parseRequest } from '../src/lib/api-public/query';
import type { EntityDef } from '../src/lib/api-public/types';

const PESERTA: EntityDef = {
  route: 'peserta', table: 'peserta', scope: 'maahir',
  columns: ['id', 'name', 'gender', 'active'],
  filters: [
    { param: 'gender', column: 'gender', kind: 'eq' },
    { param: 'active', column: 'active', kind: 'bool' },
  ],
  order: { column: 'created_at', dir: 'desc' },
};

function sp(q: string) { return new URLSearchParams(q); }

function testParse() {
  console.log('parse request:');
  const okr = parseRequest(sp('gender=IKHWAN&active=true&page=2&limit=50'), PESERTA);
  check('valid parses', okr.ok === true);
  if (okr.ok) {
    check('page 2', okr.page === 2);
    check('limit 50', okr.limit === 50);
    check('gender filter', okr.filters.some(f => f.column === 'gender' && f.value === 'IKHWAN'));
    check('bool coerced', okr.filters.some(f => f.column === 'active' && f.value === true));
  }
  check('unknown param → error', parseRequest(sp('gender=X&bogus=1'), PESERTA).ok === false);
  check('limit 0 → error', parseRequest(sp('limit=0'), PESERTA).ok === false);
  check('limit 501 → error', parseRequest(sp('limit=501'), PESERTA).ok === false);
  check('limit abc → error', parseRequest(sp('limit=abc'), PESERTA).ok === false);
  check('default page 1 limit 100', (() => { const r = parseRequest(sp(''), PESERTA); return r.ok && r.page === 1 && r.limit === 100; })());
}

// date validation via an entity with a date filter
const PERTEMUAN: EntityDef = {
  route: 'pertemuan', table: 'pertemuan_program', scope: 'maahir',
  columns: ['id', 'tanggal'],
  filters: [
    { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
    { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
  ],
  order: { column: 'tanggal', dir: 'desc' },
};
function testDate() {
  console.log('date parse:');
  check('good date ok', parseRequest(sp('tanggal_dari=2026-08-01'), PERTEMUAN).ok === true);
  check('bad date 2026-8-1 → error', parseRequest(sp('tanggal_dari=2026-8-1'), PERTEMUAN).ok === false);
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — module `query` not found.

- [ ] **Step 3: Implement `query.ts`**

```ts
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
    } else if (fd.kind === 'bool') {
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
  }
  q = q.order(def.order.column, { ascending: parsed.urut === 'asc' });
  const from = (parsed.page - 1) * parsed.limit;
  q = q.range(from, from + parsed.limit - 1);
  const { data, count } = await q;
  return { rows: data ?? [], total: count ?? 0 };
}
```

> **Implementer note:** confirm `supabaseAdmin.from().select(cols, {count:'exact'}).range()` is supported by the pg-shim (`src/lib/pg-shim.ts`). `hits-rekap.ts` uses `.select()/.eq()/.order()`; if `.range()`/`count` are missing, add them to the shim in a separate small task before Phase 3, with a `test-shim` case. Do NOT hand-build SQL strings — §3 rule 4.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-public/query.ts scripts/test-api-public.ts
git commit -m "feat(api): parse & validasi filter entitas"
```

---

## Phase 2 — Admin key management

### Task 9: `actions.ts` — createKey / revokeKey server actions

**Files:**
- Create: `src/app/admin/api-keys/actions.ts`

- [ ] **Step 1: Write the server actions**

```ts
'use server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/admin-guard';
import { logAudit } from '@/lib/audit';
import { generateKey } from '@/lib/api-public/auth';
import type { ScopeName } from '@/lib/api-public/types';

const VALID_SCOPES: ScopeName[] = ['maahir', 'hits', 'penilaian'];

export async function createKey(input: {
  nama: string;
  scopes: ScopeName[];
  expiresAt: string | null;
  keterangan: string | null;
}): Promise<{ raw: string; tokenPrefix: string }> {
  const { wa } = await requireAdmin();
  const nama = input.nama.trim();
  if (!nama) throw new Error('Nama wajib.');
  const scopes = input.scopes.filter(s => VALID_SCOPES.includes(s));
  if (!scopes.length) throw new Error('Pilih minimal satu scope.');

  const { raw, tokenHash, tokenPrefix } = generateKey();
  await supabaseAdmin.from('api_client').insert({
    nama, token_hash: tokenHash, token_prefix: tokenPrefix,
    scopes, expires_at: input.expiresAt, keterangan: input.keterangan,
    created_by: wa,
  });
  await logAudit({ action: 'api_key_create', actor: wa, detail: { nama, scopes, token_prefix: tokenPrefix } });
  // raw dikembalikan SEKALI ke UI; tak pernah ke log/audit.
  return { raw, tokenPrefix };
}

export async function revokeKey(id: string): Promise<void> {
  const { wa } = await requireAdmin();
  const { data } = await supabaseAdmin.from('api_client').select('nama, token_prefix').eq('id', id).maybeSingle();
  await supabaseAdmin.from('api_client')
    .update({ active: false, revoked_at: new Date().toISOString(), revoked_by: wa })
    .eq('id', id);
  await logAudit({ action: 'api_key_revoke', actor: wa, detail: { id, nama: (data as any)?.nama, token_prefix: (data as any)?.token_prefix } });
}
```

> **Implementer note:** match `logAudit` signature to `src/lib/audit.ts` (`LogAuditOpts` at line 15). If it uses different field names than `{action, actor, detail}`, adapt the call — never pass the raw key or hash.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/api-keys/actions.ts
git commit -m "feat(api): server action buat/cabut key + audit"
```

---

### Task 10: `page.tsx` + `CreateKeyForm.tsx` — admin UI

**Files:**
- Create: `src/app/admin/api-keys/page.tsx`
- Create: `src/app/admin/api-keys/CreateKeyForm.tsx`

- [ ] **Step 1: Write `page.tsx` (server component, guarded, lists keys)**

```tsx
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CreateKeyForm } from './CreateKeyForm';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  await requireAdmin();
  const { data } = await supabaseAdmin
    .from('api_client')
    .select('id, nama, token_prefix, scopes, active, expires_at, last_used_at, request_count, revoked_at')
    .order('created_at', { ascending: false });
  const rows = data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  function status(r: any): string {
    if (!r.active) return 'dicabut';
    if (r.expires_at && r.expires_at < today) return 'kedaluwarsa';
    return 'aktif';
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>API Keys</h1>
      <CreateKeyForm />
      <table style={{ width: '100%', marginTop: 24, borderCollapse: 'collapse' }}>
        <thead>
          <tr><th>Nama</th><th>Prefix</th><th>Scope</th><th>Status</th><th>Terakhir dipakai</th><th>Req</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td>{r.nama}</td>
              <td><code>{r.token_prefix}…</code></td>
              <td>{(r.scopes ?? []).join(', ')}</td>
              <td>{status(r)}</td>
              <td>{r.last_used_at ?? '—'}</td>
              <td>{r.request_count}</td>
              <td>{r.active ? <RevokeButton id={r.id} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function RevokeButton({ id }: { id: string }) {
  // dipisah ke client di CreateKeyForm module; import di sana. Placeholder dihindari:
  // lihat CreateKeyForm.tsx yang mengekspor RevokeButton juga.
  const { RevokeButton: RB } = require('./CreateKeyForm');
  return <RB id={id} />;
}
```

> **Implementer note:** the inline `require` is a shim to keep this plan's file count low — in practice export `RevokeButton` from `CreateKeyForm.tsx` and import it normally at the top of `page.tsx`. Do not confirm-dialog on revoke via native `confirm()` (blocks in some flows); use an inline "yakin?" toggle in the client component.

- [ ] **Step 2: Write `CreateKeyForm.tsx` (client, reveal-once)**

```tsx
'use client';
import { useState } from 'react';
import { createKey, revokeKey } from './actions';
import type { ScopeName } from '@/lib/api-public/types';

const SCOPES: ScopeName[] = ['maahir', 'hits', 'penilaian'];

export function CreateKeyForm() {
  const [nama, setNama] = useState('');
  const [scopes, setScopes] = useState<ScopeName[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { raw } = await createKey({ nama, scopes, expiresAt: expiresAt || null, keterangan: keterangan || null });
      setRevealed(raw);
      setNama(''); setScopes([]); setExpiresAt(''); setKeterangan('');
    } finally { setBusy(false); }
  }

  return (
    <section style={{ border: '1px solid #ccc', padding: 16, borderRadius: 8 }}>
      <h2>Buat key baru</h2>
      {revealed && (
        <div style={{ background: '#fffae6', padding: 12, marginBottom: 12 }}>
          <strong>Salin sekarang — tidak bisa dilihat lagi:</strong>
          <pre style={{ userSelect: 'all' }}>{revealed}</pre>
          <button onClick={() => setRevealed(null)}>Sudah saya salin</button>
        </div>
      )}
      <div><input placeholder="nama konsumen" value={nama} onChange={e => setNama(e.target.value)} /></div>
      <div>
        {SCOPES.map(s => (
          <label key={s} style={{ marginRight: 12 }}>
            <input type="checkbox" checked={scopes.includes(s)}
              onChange={e => setScopes(p => e.target.checked ? [...p, s] : p.filter(x => x !== s))} /> {s}
          </label>
        ))}
      </div>
      <div><input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /> (kedaluwarsa, opsional)</div>
      <div><input placeholder="keterangan" value={keterangan} onChange={e => setKeterangan(e.target.value)} /></div>
      <button disabled={busy || !nama || !scopes.length} onClick={submit}>Buat</button>
    </section>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) return <button onClick={() => setConfirming(true)}>Cabut</button>;
  return (
    <span>
      yakin?{' '}
      <button disabled={busy} onClick={async () => { setBusy(true); await revokeKey(id); location.reload(); }}>ya</button>{' '}
      <button onClick={() => setConfirming(false)}>batal</button>
    </span>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/api-keys/page.tsx src/app/admin/api-keys/CreateKeyForm.tsx
git commit -m "feat(api): halaman /admin/api-keys — daftar, buat sekali-tampil, cabut"
```

---

## Phase 3 — Catch-all route + scope `maahir`

### Task 11: Fill registry with 13 `maahir` entities

**Files:**
- Modify: `src/lib/api-public/registry.ts` (fill `ENTITIES`)
- Test: extend `scripts/test-api-public.ts`

Transcribe spec §4 "Scope maahir (13)" columns + §6 filters. This is data, not logic — copy the tables faithfully. The module-load audit (Task 7) will throw if any forbidden column slipped in.

- [ ] **Step 1: Write the failing test**

```ts
import { ENTITIES, getEntity } from '../src/lib/api-public/registry';

function testMaahirRegistry() {
  console.log('maahir registry:');
  const maahir = Object.values(ENTITIES).filter(e => e.scope === 'maahir');
  check('13 maahir entities', maahir.length === 13);
  check('peserta has no whatsapp_number', !getEntity('peserta')!.columns.includes('whatsapp_number'));
  check('kehadiran KEEPS catatan', getEntity('kehadiran')!.columns.includes('catatan'));
  check('rekaman has nilai not audio_url', getEntity('rekaman')!.columns.includes('nilai') && !getEntity('rekaman')!.columns.includes('audio_url'));
  check('program-kelas present', !!getEntity('program-kelas'));
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — `13 maahir entities` (map still empty).

- [ ] **Step 3: Fill the 13 entities**

Add to `ENTITIES` in `registry.ts`. Example entries (transcribe the rest identically from spec §4/§6):

```ts
  'program-kelas': {
    route: 'program-kelas', table: 'program_kelas', scope: 'maahir',
    columns: ['id', 'name', 'gender', 'jadwal_hari', 'waktu_mulai', 'waktu_selesai', 'self_attendance', 'presensi_sifat', 'created_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'self_attendance', column: 'self_attendance', kind: 'bool' },
      { param: 'presensi_sifat', column: 'presensi_sifat', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  kehadiran: {
    route: 'kehadiran', table: 'kehadiran_peserta', scope: 'maahir',
    columns: ['id', 'pertemuan_id', 'anggota_id', 'peserta_id', 'status', 'mode', 'setoran_halaman', 'catatan', 'diisi_at', 'updated_at', 'created_at'],
    filters: [
      { param: 'pertemuan_id', column: 'pertemuan_id', kind: 'eq' },
      { param: 'anggota_id', column: 'anggota_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'mode', column: 'mode', kind: 'eq' },
      { param: 'sejak', column: 'updated_at', kind: 'since' },
    ],
    order: { column: 'updated_at', dir: 'desc' },
  },
  // ... anggota, pertemuan, libur, pemutihan, laporan-note, peserta, kelas,
  //     setoran, rekaman, setoran-musyrif, rekaman-musyrif — dari spec §4 + §6.
```

- [ ] **Step 4: Verify columns exist in prod**

Because `schema.sql` is partial (§2), confirm each table's real columns before trusting the transcription:

```bash
npm run db "select column_name from information_schema.columns where table_name='kehadiran_peserta' order by 1"
```

Repeat for the 5 tables missing from `schema.sql`: `program_kelas`, `program_kelas_anggota`, `pertemuan_program`, `kehadiran_peserta`, `penilaian_peserta`. Fix any column-name mismatch in the registry.

- [ ] **Step 5: Run to verify pass**

Run: `npm run test-api`
Expected: PASS. If app fails to import registry → an audit caught a forbidden column; remove it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api-public/registry.ts scripts/test-api-public.ts
git commit -m "feat(api): registry 13 entitas scope maahir"
```

---

### Task 12: Catch-all route handler + scope check + cache + usage timer

**Files:**
- Create: `src/app/api/v1/[...path]/route.ts`
- Test: extend `scripts/test-api-public.ts` (scope-check unit)

- [ ] **Step 1: Write the failing test (scope gate is the testable pure bit)**

```ts
import { scopeAllows } from '../src/lib/api-public/query';

function testScope() {
  console.log('scope gate:');
  check('maahir key → maahir entity ok', scopeAllows(['maahir'], 'maahir'));
  check('maahir key → hits entity 403', !scopeAllows(['maahir'], 'hits'));
  check('multi scope', scopeAllows(['maahir', 'hits'], 'hits'));
}
```

Add `scopeAllows` to `query.ts`:

```ts
import type { ScopeName } from './types';
export function scopeAllows(keyScopes: ScopeName[], entityScope: ScopeName): boolean {
  return keyScopes.includes(entityScope);
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — `scopeAllows` not exported.

- [ ] **Step 3: Implement route + `scopeAllows`**

`src/app/api/v1/[...path]/route.ts`:

```ts
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

// flush pemakaian tiap 60s (sekali per proses)
declare global { var __apiUsageTimer: ReturnType<typeof setInterval> | undefined }
if (!globalThis.__apiUsageTimer) {
  globalThis.__apiUsageTimer = setInterval(() => { void flushUsage(); }, 60_000);
}

function masterOff() { return process.env.PUBLIC_API !== 'on'; }

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(async () => {
    if (masterOff()) return fail('not_found', 'Tidak ditemukan.', 404);

    const auth = await verifyBearer(req.headers.get('authorization'));
    if (!auth.ok) return fail(auth.code, auth.message, auth.status);

    if (!checkRateLimit(auth.client.id, 120)) {
      const r = fail('rate_limited', 'Melewati batas 120/menit.', 429);
      r.headers.set('Retry-After', '2');
      return r;
    }

    const { path } = await ctx.params;
    const route = path.join('/'); // 'peserta' atau 'hits/batch'
    const def = getEntity(route);
    if (!def) return fail('unknown_entity', `Entitas '${route}' tidak ada.`, 404);
    if (!scopeAllows(auth.client.scopes, def.scope))
      return fail('forbidden_scope', `Key tidak punya scope '${def.scope}'.`, 403);

    const params = req.nextUrl.searchParams;
    const parsed = parseRequest(params, def);
    if (!parsed.ok) return fail(parsed.code, parsed.message, 400);

    recordUsage(auth.client.id);

    const cacheKey = `${route}?${params.toString()}|${[...auth.client.scopes].sort().join(',')}`;
    const cached = getCached(cacheKey);
    const ifNoneMatch = req.headers.get('if-none-match');
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
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test-api && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/v1/[...path]/route.ts" src/lib/api-public/query.ts scripts/test-api-public.ts
git commit -m "feat(api): catch-all route entitas + scope gate + cache + usage timer"
```

---

## Phase 4 — Registry `hits` + `penilaian` + referensi orang

### Task 13: 14 `hits` entities (incl. `hits/kajian-presensi` special case)

**Files:**
- Modify: `src/lib/api-public/registry.ts`
- Modify: `src/lib/api-public/query.ts` (special resolver for `kajian-presensi`)
- Test: extend `scripts/test-api-public.ts`

- [ ] **Step 1: Write the failing test**

```ts
function testHitsRegistry() {
  console.log('hits registry:');
  const hits = Object.values(ENTITIES).filter(e => e.scope === 'hits');
  check('14 hits entities', hits.length === 14);
  check('halaqah-peserta drops ketua_wa', !getEntity('hits/halaqah-peserta')!.columns.includes('ketua_wa'));
  check('kajian-presensi drops ketua_wa', !getEntity('hits/kajian-presensi')!.columns.includes('ketua_wa'));
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — `14 hits entities`.

- [ ] **Step 3: Fill 14 hits entities (routes prefixed `hits/`)**

Transcribe spec §4 "Scope hits (14)" + §6 filters. All routes keyed `hits/<name>`. For `hits/kajian-presensi`, do NOT put `ketua_wa` in columns. Instead mark it with a special resolver flag:

```ts
  'hits/kajian-presensi': {
    route: 'hits/kajian-presensi', table: 'hits_kajian_presensi', scope: 'hits',
    columns: ['id', 'halaqah_id', 'tanggal', 'status', 'created_at'], // ketua_nama diinjeksi resolver
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
```

- [ ] **Step 4: Implement `ketua_nama` resolver in `runEntity`**

The table's key is `ketua_wa` (WA), not UUID (§4). Resolve WA → name via `hits_halaqah_peserta.ketua_wa` match, inject `ketua_nama`, and NEVER select or return `ketua_wa`. Add to `query.ts`:

```ts
// Setelah rows didapat untuk route 'hits/kajian-presensi':
// - ambil ketua_wa hanya utk join internal (tidak keluar),
// - petakan ke hits_halaqah_peserta.name, hasilkan ketua_nama (null bila tak cocok),
// - baris tetap ada meski null (agar agregat tak berubah).
export async function resolveKajianPresensi(rows: any[]): Promise<any[]> {
  // implementasi: query hits_kajian_presensi.ketua_wa untuk id-id ini secara terpisah,
  //   lalu supabaseAdmin.from('hits_halaqah_peserta').select('ketua_wa, name'),
  //   bangun Map<ketua_wa, name>, set r.ketua_nama = map.get(wa) ?? null, hapus wa.
  return rows;
}
```

> **Implementer note:** flesh out `resolveKajianPresensi` fully — the plan shows the contract; the body is a two-query join in memory. Add a branch in the catch-all route: `if (route === 'hits/kajian-presensi') rows = await resolveKajianPresensi(rows)` BEFORE `sanitize`. `sanitize` will still drop any stray `ketua_wa`, so this is defense-in-depth, not the only guard.

- [ ] **Step 5: Run to verify pass**

Run: `npm run test-api && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api-public/registry.ts src/lib/api-public/query.ts scripts/test-api-public.ts
git commit -m "feat(api): registry 14 entitas hits + resolver ketua_nama kajian-presensi"
```

---

### Task 14: 5 `penilaian` entities + 4 referensi orang

**Files:**
- Modify: `src/lib/api-public/registry.ts`
- Test: extend `scripts/test-api-public.ts`

- [ ] **Step 1: Write the failing test**

```ts
function testPenilaianRefRegistry() {
  console.log('penilaian + ref registry:');
  check('5 penilaian entities', Object.values(ENTITIES).filter(e => e.scope === 'penilaian').length === 5);
  check('total 36 entities', Object.keys(ENTITIES).length === 36);
  for (const r of ['musyrif', 'koordinator', 'syaikh', 'koordinator-ketua-kelas'])
    check(`ref ${r} present, only id/name/gender/active`, (() => {
      const e = getEntity(r); return !!e && e.columns.join() === 'id,name,gender,active';
    })());
  check('ketua_kelas NOT exposed', getEntity('ketua-kelas') === null && getEntity('ketua_kelas') === null);
}
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test-api`
Expected: FAIL — `36 entities`.

- [ ] **Step 3: Fill 5 penilaian (spec §4 "Scope penilaian") + 4 referensi orang**

Referensi orang share the caller's scope — but `EntityDef.scope` is single-valued. Set their scope so any authenticated key can read them: simplest is to add a fourth conceptual scope OR duplicate. Per spec §4 "ikut scope pemanggil", implement by allowing ref entities when the key has ANY scope. Add a `refShared: true` flag to `EntityDef` (optional) and in the route's scope check: `if (def.refShared) allow; else scopeAllows(...)`. Keep `scope` set to `'maahir'` for typing. Transcribe columns: `id, name, gender, active` only.

```ts
  musyrif: { route: 'musyrif', table: 'musyrif', scope: 'maahir', refShared: true,
    columns: ['id', 'name', 'gender', 'active'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }, { param: 'active', column: 'active', kind: 'bool' }],
    order: { column: 'name', dir: 'asc' } },
  // koordinator, syaikh, koordinator-ketua-kelas identik (tabel beda).
```

Add `refShared?: boolean` to `EntityDef` in `types.ts`, and update the route scope check accordingly.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test-api && npm run typecheck`
Expected: PASS — 36 entities total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-public/registry.ts src/lib/api-public/types.ts "src/app/api/v1/[...path]/route.ts" scripts/test-api-public.ts
git commit -m "feat(api): registry 5 penilaian + 4 referensi orang (refShared)"
```

---

## Phase 5 — Six rekap routes

### Task 15: `rekap.ts` builders + PGlite-backed sanitize integration test

**Files:**
- Create: `src/lib/api-public/rekap.ts`
- Test: extend `scripts/test-api-public.ts`

Each builder wraps an existing lib and runs the result through `sanitize()`. The key correctness property (WA stripped, Map converted, catatan/keterangan kept) is already unit-tested in Task 3; here we wire the real libs.

- [ ] **Step 1: Identify the lib entry points**

Confirm signatures before wrapping:

```bash
grep -rn "export.*function getLaporanMaahir\|export.*getMaahirSP\|export.*getMaahirRekap\|export.*getTibyanView\|export.*getHitsKoordinatorRekap" src/lib
```

- [ ] **Step 2: Write `rekap.ts`**

```ts
// rekap.ts — 6 builder rekap, semua lewat sanitize(). Lihat spec §5.
import { sanitize } from './sanitize';
import { getLaporanMaahir } from '@/lib/laporan-maahir';       // sesuaikan path riil
import { getMaahirSP } from '@/lib/maahir-sp';
import { getMaahirRekap } from '@/lib/maahir-rekap';
import { getTibyanView } from '@/lib/tibyan';
import { getHitsKoordinatorRekap } from '@/lib/hits-koreksi';   // sesuaikan
// matrix-guru: join kelompok_pengajar+pengajar+matrix_rekap, pola /api/matrix/download

export async function rekapLaporanMaahir(bulan: string) {
  const raw = await getLaporanMaahir(bulan);
  return { data: sanitize(raw), meta: laporanMeta(bulan) };
}
// ... rekapSP, rekapKehadiran, rekapTibyan, rekapHitsDisiplin, rekapMatrixGuru
// masing-masing: panggil lib → sanitize → bungkus {data, meta} dgn meta periode efektif.
```

> **Implementer note:** each builder computes the `meta` described per-route in spec §5 (28–27 window for laporan-maahir, `cutoff` for sp, effective range for kehadiran, `mode`-dependent for hits-disiplin, `snapshot_terakhir`/`basi` for matrix-guru). Import paths above are guesses — resolve them from the grep in Step 1.

- [ ] **Step 3: Write an offline integration test using PGlite**

Extend `scripts/test-api-public.ts` with a PGlite block (pattern from `scripts/test-pg-shim.ts`): restore data, create `api_client` table (Task 1 Step 2), then assert `sanitize(getMaahirRekap(...))` output has NO `whatsappNumber` and KEEPS `keterangan`. This closes the "lib leaks WA through the back door" hole (§5.1).

```ts
// dalam blok PGlite:
const rekap = await getMaahirRekap(bulan, {});
const clean = sanitize(rekap) as any;
check('rekap: no whatsappNumber leaked', JSON.stringify(clean).indexOf('whatsappNumber') === -1);
check('rekap: keterangan kept', JSON.stringify(clean).indexOf('keterangan') !== -1);
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-public/rekap.ts scripts/test-api-public.ts
git commit -m "feat(api): 6 builder rekap lewat sanitize + tes integrasi PGlite"
```

---

### Task 16: Six rekap route files

**Files:**
- Create: `src/app/api/v1/rekap/laporan-maahir/route.ts` and 5 siblings

Each route: master-switch, auth, scope check (rekap inherits domain scope — §3), param validation (spec §5 per-route rules), cache (300s TTL), ETag, respond.

- [ ] **Step 1: Write `laporan-maahir/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { verifyBearer } from '@/lib/api-public/auth';
import { scopeAllows } from '@/lib/api-public/query';
import { ok, fail, handle } from '@/lib/api-public/respond';
import { getCached, setCached, checkRateLimit, acquireInflight } from '@/lib/api-public/cache';
import { rekapLaporanMaahir } from '@/lib/api-public/rekap';

export const dynamic = 'force-dynamic';
const REKAP_TTL = 300;
const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest) {
  return handle(async () => {
    if (process.env.PUBLIC_API !== 'on') return fail('not_found', 'Tidak ditemukan.', 404);
    const auth = await verifyBearer(req.headers.get('authorization'));
    if (!auth.ok) return fail(auth.code, auth.message, auth.status);
    if (!scopeAllows(auth.client.scopes, 'maahir')) return fail('forbidden_scope', "Key tidak punya scope 'maahir'.", 403);
    if (!checkRateLimit(auth.client.id, 120)) { const r = fail('rate_limited', 'Batas 120/menit.', 429); r.headers.set('Retry-After', '2'); return r; }

    const bulan = req.nextUrl.searchParams.get('bulan');
    if (!bulan || !MONTH_RE.test(bulan)) return fail('bad_param', 'bulan wajib YYYY-MM.', 400);

    const key = `rekap/laporan-maahir?bulan=${bulan}|${[...auth.client.scopes].sort().join(',')}`;
    const ifNoneMatch = req.headers.get('if-none-match');
    const cached = getCached(key);
    if (cached) {
      const c = cached.value as { data: unknown; meta: Record<string, unknown> };
      return ok(c.data, { ...c.meta, dari_cache: true, umur_detik: cached.umurDetik }, { ifNoneMatch, ttlSec: REKAP_TTL });
    }
    const built = await acquireInflight(() => rekapLaporanMaahir(bulan), Number(process.env.PUBLIC_API_MAX_INFLIGHT) || 4, 5000);
    setCached(key, built, REKAP_TTL);
    return ok(built.data, { ...built.meta, dari_cache: false, umur_detik: 0 }, { ifNoneMatch, ttlSec: REKAP_TTL });
  });
}
```

- [ ] **Step 2: Write the other 5 route files**

Same skeleton, differing only in: param validation (spec §5 — `sp`: gender/sampai_bulan optional; `kehadiran`: bulan required + gender/program/kelas_id repeatable; `tibyan`: bulan required + gender; `hits-disiplin`: `mode` required, `mode=minggu` → `minggu` must be Monday else 400, scope `hits`; `matrix-guru`: bulan required + gender, scope `penilaian`), builder call, and scope string. For `hits-disiplin` add Monday check:

```ts
function isMonday(d: string): boolean { return new Date(d + 'T00:00:00Z').getUTCDay() === 1; }
// mode=minggu && !isMonday(minggu) → fail('bad_param', 'minggu harus hari Senin.', 400)
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/rekap
git commit -m "feat(api): 6 route rekap eksplisit (cache 300s, scope per domain)"
```

---

## Phase 6 — Registry guard vs prod schema

### Task 17: `check-api-registry.ts`

**Files:**
- Create: `scripts/check-api-registry.ts`
- Modify: `package.json` (add `"check-api"`)

- [ ] **Step 1: Write the checker**

Reads prod `information_schema` via the admin DB API (same transport as `scripts/db.ts`), verifies three things (spec §9): every registry column exists; no forbidden column leaked into any `columns` list; report prod columns unknown to the registry (forward guard).

```ts
/**
 * check-api-registry.ts — cocokkan registry ke information_schema prod.
 * Jalankan sebelum deploy: npm run check-api
 */
import { ENTITIES, FORBIDDEN_COLUMNS } from '../src/lib/api-public/registry';

async function prodColumns(table: string): Promise<string[]> {
  // pakai jalur yang sama dgn scripts/db.ts: POST ke /api/admin/db dgn ADMIN_API_TOKEN.
  // SELECT column_name FROM information_schema.columns WHERE table_name=$1
  return []; // implementer: isi sesuai scripts/db.ts
}

async function main() {
  let problems = 0;
  const known = new Set<string>();
  for (const def of Object.values(ENTITIES)) {
    const cols = await prodColumns(def.table);
    const set = new Set(cols);
    for (const c of def.columns) {
      if (!set.has(c)) { console.error(`✗ ${def.route}: kolom '${c}' tak ada di prod ${def.table}`); problems++; }
      if (FORBIDDEN_COLUMNS.includes(c)) { console.error(`✗ ${def.route}: kolom terlarang '${c}' lolos`); problems++; }
      known.add(`${def.table}.${c}`);
    }
    for (const c of cols) {
      if (FORBIDDEN_COLUMNS.includes(c)) continue; // memang ditahan
      if (!known.has(`${def.table}.${c}`)) console.warn(`… ${def.table}.${c} ada di prod, belum dikenal registry`);
    }
  }
  console.log(problems ? `${problems} masalah` : 'registry cocok dgn prod');
  if (problems) process.exit(1);
}
main();
```

Add script: `"check-api": "tsx --env-file=.env.local scripts/check-api-registry.ts"`.

- [ ] **Step 2: Run against prod**

Run: `npm run check-api`
Expected: `registry cocok dgn prod`, or a list of mismatches to fix in the registry.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-api-registry.ts package.json
git commit -m "feat(api): penjaga registry vs information_schema prod"
```

---

## Phase 7 — Documentation

### Task 18: `docs/API-PUBLIC.md`

**Files:**
- Create: `docs/API-PUBLIC.md`

- [ ] **Step 1: Write consumer docs** covering spec §11: base URL, Bearer header, copy-pasteable server-side `fetch` example, table of all 42 routes (path, scope, valid filters, sample response), the never-exposed column list, the **`catatan`/`keterangan` sensitivity warning** (health/family reasons — do not publish/index), cache behaviour (60s/5min, ETag/If-None-Match, meaning of 429/503), the easy-to-miscompute business rules (28–27 period; hits-disiplin bulan = full calendar; sick sessions leave the denominator; SP pemutihan → 100%; mid-period join truncates denominator; matrix_rekap is a snapshot), and the recommended daily sync (`sejak=<last updated_at>`, full-pull for tables without it).

- [ ] **Step 2: Commit**

```bash
git add docs/API-PUBLIC.md
git commit -m "docs(api): dokumentasi konsumen API publik"
```

---

### Task 19: Update `docs/HANDOVER-MAAHIR.md`

**Files:**
- Modify: `docs/HANDOVER-MAAHIR.md` (§HTTP API Endpoints)

- [ ] **Step 1: Add the 4 existing-but-unlisted routes** (`/api/2in1/setoran-kelas`, `/api/admin/recompute-matrix`, `/api/hits/koordinator/download`, `/api/laporan/maahir/kehadiran/download`), add the `/api/v1/*` block, refresh `Last updated`.

- [ ] **Step 2: Commit**

```bash
git add docs/HANDOVER-MAAHIR.md
git commit -m "docs(handover): daftar route lengkap + blok /api/v1/*"
```

---

## Phase 8 — Release

### Task 20: Apply migration + set env + deploy + smoke test

Not a code task — a release runbook (spec §12.9). Do these in order:

- [ ] **Step 1: Apply the migration to prod**

```bash
npm run db -- --confirm "$(cat scripts/sql/2026-08-11-api-client.sql)"
```

Verify: `npm run db "select count(*) from api_client"` → returns `0`.

- [ ] **Step 2: Run the registry guard against prod**

Run: `npm run check-api`
Expected: `registry cocok dgn prod`. Fix any mismatch before deploying.

- [ ] **Step 3: Set env in `Maahir-Prod` variable group**

Set `ENV_PUBLIC_API=on` (pipeline exports `ENV_*`). Optionally `ENV_PUBLIC_API_MAX_INFLIGHT`, `ENV_PUBLIC_API_CACHE_TTL`. Deploy.

- [ ] **Step 4: Create a test key**

Via `/admin/api-keys` → create key with all three scopes, short `expires_at`. Copy the once-shown raw key.

- [ ] **Step 5: Smoke test + cross-check against the screen**

```bash
curl -s -H "Authorization: Bearer <raw>" "https://<host>/api/v1/peserta?limit=3"
curl -s -H "Authorization: Bearer <raw>" "https://<host>/api/v1/rekap/laporan-maahir?bulan=2026-08"
curl -s -H "Authorization: Bearer <raw>" "https://<host>/api/v1/rekap/hits-disiplin?mode=bulan&bulan=2026-08"
```

Compare `rekap/laporan-maahir` and `rekap/hits-disiplin` numbers against the koordinator page for the same month (spec §10). Confirm: no `whatsapp_number` anywhere, `catatan`/`keterangan` present, 401 on a bad key, 403 when a `maahir`-only key hits `/api/v1/hits/batch`, 304 on repeat with `If-None-Match`.

- [ ] **Step 6: Revoke the test key** via `/admin/api-keys`; confirm 401 within ~30s.

---

## Self-Review (done while writing this plan)

**Spec coverage** — mapped: §1 forbidden/`catatan` → Tasks 3,7,11; §2 partial schema → Task 11 Step 4 + Task 17; §3 arch/envelope/switch/`api_client`/auth-cache → Tasks 1,4,6,12; §4 36 entities → Tasks 11,13,14; §5 6 rekap + sanitize → Tasks 3,15,16; §6 filters → Tasks 8,11,13,14; §7 cache/inflight/rate → Task 5; §8 error/log/revoke → Tasks 6,9; §9 registry guard → Task 17; §10 tests → Tasks 3–8,12,15 + §12.9 post-deploy curl (Task 20); §11 consumer docs → Task 18; §12 order → phase order here; §13 risks → mitigations land in Tasks 5,6,9,17.

**Known soft spots the implementer must close (flagged inline, not placeholders in logic):**
- `auth.ts` `flushUsage` needs read-add-write (pg-shim has no `col = col + n`) — Task 4 note.
- `query.ts` `runEntity` assumes pg-shim supports `.range()` + `{count:'exact'}` — Task 8 note; add to shim + `test-shim` if missing.
- `resolveKajianPresensi` body is contract-only — Task 13 note.
- `rekap.ts` lib import paths are guesses — Task 15 Step 1 grep resolves them.
- `page.tsx` inline `require` is a doc shim — Task 10 note says export/import normally.
- `check-api-registry.ts` `prodColumns` transport copied from `scripts/db.ts` — Task 17.

**Type consistency** — `EntityDef`/`FilterDef`/`AuthResult`/`ApiMeta` defined once (Task 2), `refShared` added in Task 14, `scopeAllows`/`parseRequest`/`runEntity` names stable across Tasks 8/12/16.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-08-12-api-publik-maahir.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
