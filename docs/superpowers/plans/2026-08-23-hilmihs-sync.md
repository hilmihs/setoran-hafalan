# Sinkron hilmihs.web.id → Mirror Evaluasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarik master data (batch/halaqah/pengajar/peserta) dari API agent hilmihs.web.id (program `tilawah_api`) ke mirror `eval_*` maahir lewat alur pull → staging review → apply, supaya fitur Evaluasi Halaqah menilai peserta nyata.

**Architecture:** Pull-only client (hilmihs read-only GET). Pull mengisi tabel staging (`eval_sync_stage`) berisi diff (create/update/deactivate) + audit run (`eval_sync_run`); tak menyentuh mirror. Admin review lalu apply memindahkan diff ter-approve ke `eval_*`. Trigger harian = systemd timer VPS menembak endpoint pull ber-CRON_SECRET; plus tombol manual. Identitas: pengajar by nomor WA, id halaqah/peserta di-prefix `<slug>:`, penghapusan sumber = soft-deactivate.

**Tech Stack:** Next.js 14 App Router, TypeScript, `supabaseAdmin` (node-postgres shim via `poolExec`), iron-session (`getSession`/`isSuperadmin`), `tsx` test scripts, systemd/Azure-DevOps pipeline.

**Spec:** `docs/superpowers/specs/2026-08-23-hilmihs-sync-design.md` (Section A–E, disetujui).

---

## Konvensi repo yang WAJIB dipatuhi

- **Test = skrip `tsx` fungsi murni** dengan helper `eq()` lokal, dijalankan `npm run <script>` (lihat `scripts/test-shakwa.ts`). TIDAK ada jest/vitest. Jangan tambah framework test.
- **DB dev vs prod:** `npm run db` MENEMBAK PRODUKSI (HTTP admin `/api/admin/db`). JANGAN pakai untuk apply migration dev. Migration/seed dev jalan lewat `supabaseAdmin`/`poolExec` dengan `DATABASE_URL` dev (`tsx --env-file=.env.local`). **Sebelum apply migration, pastikan `DATABASE_URL` di `.env.local` menunjuk DB dev, bukan prod.**
- **Env:** rahasia dibaca via `apiEnv('NAMA')` (`src/lib/api-public/env.ts`) yang menerima `NAMA` maupun `ENV_NAMA`. Prod: Variable Group `Maahir-Prod` (`ENV_AGENT_TOKEN`, `ENV_CRON_SECRET`, sudah ada). Dev: `.env.local`.
- **Gaya UI:** kelas semantik `globals.css` (`card-flat`, `k-table`, `badge`, `btn`) + inline `var(--...)`. BUKAN Tailwind utility.
- Setiap task berakhir hijau (typecheck + test/build relevan) lalu commit.

## File yang dibuat / diubah

**Buat:**
- `src/lib/hilmihs/types.ts` — tipe response hilmihs + tipe baris mirror-shape hasil map.
- `src/lib/hilmihs/map.ts` — fungsi murni: response → bentuk mirror (gender, prefix id, phone-key). Diuji.
- `src/lib/hilmihs/client.ts` — fetch wrapper (Bearer, paginasi, 413).
- `src/lib/hilmihs/diff.ts` — fungsi murni: (fetched mirror-shape, current mirror) → daftar diff. Diuji.
- `src/lib/hilmihs/sync.ts` — orkestrasi pull (server): fetch semua program → map → diff → tulis stage+run.
- `src/lib/hilmihs/apply.ts` — terapkan baris stage ter-approve ke mirror.
- `scripts/test-hilmihs.ts` — test murni map + diff.
- `scripts/apply-migration.ts` — runner migration dev (poolExec, satu file .sql).
- `supabase/migrations/0052_evaluasi_sync.sql` — tabel `eval_sync_run`, `eval_sync_stage`.
- `src/app/api/evaluasi/sync/pull/route.ts` — endpoint pull (guard CRON_SECRET).
- `src/app/api/evaluasi/sync/apply/route.ts` — endpoint apply (guard superadmin).
- `src/app/evaluasi/koordinator/sync/page.tsx` — halaman review (RSC).
- `src/app/evaluasi/koordinator/sync/SyncReviewPanel.tsx` — `'use client'` panel review.
- `src/app/evaluasi/koordinator/sync/actions.ts` — server actions (trigger pull, approve/reject/apply).

**Ubah:**
- `src/types/db.ts` — tambah tipe `EvalSyncRun`, `EvalSyncStage`.
- `package.json` — script `test-hilmihs`, `apply-migration`.
- `.env.example` — placeholder `AGENT_TOKEN=`, `CRON_SECRET=`.
- `azure-pipelines.yml` — SSH task idempotent pasang `next-maahir-sync.timer`.

**Hapus:**
- `src/app/api/evaluasi/sync/route.ts` — stub push (arah kebalik).

---

## Phasing & dependency (untuk 10-agent / subagent-driven)

- Task 1 (types) → tak ada dep.
- Task 2 (map) dep 1. Task 3 (client) dep 1. Task 4 (migration+row types) dep tak ada.
- Task 5 (diff) dep 1,2. Task 6 (sync pull) dep 2,3,4,5. Task 7 (apply lib) dep 4.
- Task 8 (pull+apply routes) dep 6,7. Task 9 (UI) dep 8. Task 10 (infra/docs/E2E) dep 8,9.

Eksekusi berurutan dengan review antar-task (subagent-driven). Task murni (2,5) TDD penuh; task IO (3,6,7,8,9) diverifikasi typecheck+build+probe.

---

## Task 1: Tipe response & mirror-shape

**Files:**
- Create: `src/lib/hilmihs/types.ts`

- [ ] **Step 1: Tulis tipe**

```ts
// Tipe kontrak API agent hilmihs.web.id (docs/API_hilmihswebid.md) + bentuk baris
// mirror-shape yang dihasilkan map.ts. Field sumber sesuai probe live 2026-08-22.

/** gender numerik sumber: 1 = ikhwan, 2 = akhwat. */
export type SrcGender = 1 | 2;

export interface SrcProgram {
  slug: string;
  name: string;
  dataSourceType: 'tilawah_api' | 'berkah_api' | 'mabni_api' | string;
  syncPaused: boolean;
  batch: { family: string; label: string; order: number } | null;
}
export interface ProgramsResponse {
  programs: SrcProgram[];
  families: Record<string, string[]>;
  meta: { generatedAt: string };
}

export interface SrcPengajar {
  pengajar: string;            // nama; bisa "(tanpa pengajar)"
  phone: string | null;        // tanpa kode negara, bisa null
  genders: SrcGender[];
}
export interface SrcHalaqah {
  halaqahId: number;
  name: string;
  pengajar: string | null;
  guruPhone: string | null;
  level: string | null;        // teks: "HITS Dasar" / "M1" / ...
  gender: SrcGender;
  type: string | null;
}
export interface SrcPeserta {
  tilawahUserId: number;
  name: string;
  userCode: string | null;
  gender: SrcGender;
  halaqahId: number;
  halaqahName: string | null;
  pengajar: string | null;
}

/** Envelope generik hilmihs. */
export interface Envelope<T> {
  meta: { generatedAt: string; caps?: Record<string, number>; truncated?: Record<string, number> };
  [k: string]: T[] | unknown;
}

// ── Bentuk mirror-shape (hasil map, cocok kolom eval_*). Gender sudah enum. ──
import type { Gender } from '@/types/db';

export interface MirrorBatch { id: string; nama: string; aktif: boolean }
export interface MirrorPengajar { id: string; nama: string; gender: Gender; whatsapp: string | null }
export interface MirrorHalaqah {
  id: string; nama: string; gender: Gender; level: string | null;
  pengajar_id: string | null; batch_id: string; mustawa: number | null; ambang_ujian: number;
}
export interface MirrorPeserta {
  id: string; nama: string; gender: Gender; halaqah_id: string;
  is_ketua: boolean; aktif: boolean; urutan: number;
}
export interface MirrorSnapshot {
  batch: MirrorBatch[];
  pengajar: MirrorPengajar[];
  halaqah: MirrorHalaqah[];
  peserta: MirrorPeserta[];
}

export type MirrorEntity = 'batch' | 'pengajar' | 'halaqah' | 'peserta';
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (tak ada error tipe; `Gender` diimpor dari `@/types/db`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/hilmihs/types.ts
git commit -m "feat(hilmihs): tipe response API + mirror-shape"
```

---

## Task 2: Mapping murni response → mirror-shape

**Files:**
- Create: `src/lib/hilmihs/map.ts`
- Test: `scripts/test-hilmihs.ts` (bagian map)
- Modify: `package.json`

- [ ] **Step 1: Tulis test map (gagal dulu)** — `scripts/test-hilmihs.ts`

```ts
// Uji fungsi murni sinkron hilmihs: map response → mirror-shape, dan diff.
// Jalankan: npm run test-hilmihs
import {
  konvGender, pengajarId, prefixId, normalizeWaOrNull,
  mapPengajar, mapHalaqah, mapPeserta, mapBatch,
} from '@/lib/hilmihs/map';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

eq(konvGender(1), 'ikhwan', 'gender 1');
eq(konvGender(2), 'akhwat', 'gender 2');
eq(prefixId('hits-regular', 54), 'hits-regular:54', 'prefix id');
eq(normalizeWaOrNull('81331732974'), '6281331732974', 'wa normal');
eq(normalizeWaOrNull(null), null, 'wa null');
eq(pengajarId('6281331732974', 'hits-regular', 'Fulan'), 'wa:6281331732974', 'pengajar id by wa');
eq(pengajarId(null, 'hits-regular', 'Fulan'), 'nm:hits-regular:Fulan', 'pengajar id by nama');

eq(
  mapBatch({ slug: 'hits-regular', name: 'HITS Reguler', dataSourceType: 'tilawah_api', syncPaused: false, batch: null }),
  { id: 'hits-regular', nama: 'HITS Reguler', aktif: true },
  'mapBatch'
);
eq(
  mapPengajar('hits-regular', { pengajar: 'Abdul Hakim', phone: '81331732974', genders: [1] }),
  { id: 'wa:6281331732974', nama: 'Abdul Hakim', gender: 'ikhwan', whatsapp: '6281331732974' },
  'mapPengajar'
);
eq(
  mapHalaqah('hits-regular', { halaqahId: 54, name: 'HITS 006', pengajar: 'Abdul Hakim', guruPhone: '81331732974', level: 'HITS Lanjutan', gender: 1, type: 'online' }),
  { id: 'hits-regular:54', nama: 'HITS 006', gender: 'ikhwan', level: 'HITS Lanjutan', pengajar_id: 'wa:6281331732974', batch_id: 'hits-regular', mustawa: null, ambang_ujian: 65 },
  'mapHalaqah'
);
eq(
  mapPeserta('hits-regular', { tilawahUserId: 101, name: 'A Devy', userCode: 'M2453153', gender: 2, halaqahId: 55, halaqahName: 'HITS 007', pengajar: 'Risa' }, 3),
  { id: 'hits-regular:101', nama: 'A Devy', gender: 'akhwat', halaqah_id: 'hits-regular:55', is_ketua: false, aktif: true, urutan: 3 },
  'mapPeserta'
);
// halaqah tanpa guruPhone → pengajar_id null
eq(
  mapHalaqah('dpq', { halaqahId: 9, name: 'X', pengajar: null, guruPhone: null, level: null, gender: 2, type: null }).pengajar_id,
  null, 'halaqah guruPhone null → pengajar_id null'
);

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll hilmihs tests passed.');
```

- [ ] **Step 2: Jalankan → gagal**

Run: `npx tsx --env-file=.env.local scripts/test-hilmihs.ts`
Expected: FAIL — `Cannot find module '@/lib/hilmihs/map'`.

- [ ] **Step 3: Implementasi** — `src/lib/hilmihs/map.ts`

```ts
// Fungsi MURNI: response hilmihs → bentuk mirror eval_*. Aman diuji tsx.
import { normalizeWhatsApp } from '@/lib/whatsapp';
import type { Gender } from '@/types/db';
import type {
  SrcGender, SrcPengajar, SrcHalaqah, SrcPeserta, SrcProgram,
  MirrorBatch, MirrorPengajar, MirrorHalaqah, MirrorPeserta,
} from './types';

export function konvGender(g: SrcGender): Gender {
  return g === 2 ? 'akhwat' : 'ikhwan';
}

export function prefixId(slug: string, srcId: number): string {
  return `${slug}:${srcId}`;
}

/** Normalisasi WA; null/kosong → null (bukan '62'). */
export function normalizeWaOrNull(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return null;
  return normalizeWhatsApp(phone);
}

/** Identitas pengajar: by WA bila ada, else by nama+program (fallback stabil). */
export function pengajarId(waNormal: string | null, slug: string, nama: string): string {
  return waNormal ? `wa:${waNormal}` : `nm:${slug}:${nama}`;
}

export function mapBatch(p: SrcProgram): MirrorBatch {
  return { id: p.slug, nama: p.name, aktif: !p.syncPaused };
}

export function mapPengajar(slug: string, r: SrcPengajar): MirrorPengajar {
  const wa = normalizeWaOrNull(r.phone);
  return {
    id: pengajarId(wa, slug, r.pengajar),
    nama: r.pengajar,
    gender: konvGender(r.genders?.[0] ?? 1),
    whatsapp: wa,
  };
}

export function mapHalaqah(slug: string, r: SrcHalaqah): MirrorHalaqah {
  const wa = normalizeWaOrNull(r.guruPhone);
  return {
    id: prefixId(slug, r.halaqahId),
    nama: r.name,
    gender: konvGender(r.gender),
    level: r.level ?? null,
    pengajar_id: wa ? `wa:${wa}` : (r.pengajar ? `nm:${slug}:${r.pengajar}` : null),
    batch_id: slug,
    mustawa: null,
    ambang_ujian: 65,
  };
}

export function mapPeserta(slug: string, r: SrcPeserta, urutan: number): MirrorPeserta {
  return {
    id: prefixId(slug, r.tilawahUserId),
    nama: r.name,
    gender: konvGender(r.gender),
    halaqah_id: prefixId(slug, r.halaqahId),
    is_ketua: false,
    aktif: true,
    urutan,
  };
}
```

> **Catatan konsistensi:** `mapHalaqah.pengajar_id` untuk kasus guruPhone-null-tapi-nama-ada memakai `nm:<slug>:<nama>` — SAMA dengan `pengajarId(null, slug, nama)`. Sepanjang nama pengajar di endpoint halaqah identik dengan di endpoint pengajar, id-nya nyambung.

- [ ] **Step 4: Tambah script** — `package.json` (setelah baris `test-evaluasi`)

```json
    "test-hilmihs": "tsx --env-file=.env.local scripts/test-hilmihs.ts",
```

- [ ] **Step 5: Jalankan → lulus**

Run: `npm run test-hilmihs`
Expected: semua `ok`, berakhir `All hilmihs tests passed.` (bagian diff belum ada — tambah di Task 5; untuk sekarang test hanya berisi map).

- [ ] **Step 6: Commit**

```bash
git add src/lib/hilmihs/map.ts scripts/test-hilmihs.ts package.json
git commit -m "feat(hilmihs): mapping murni response→mirror + test"
```

---

## Task 3: Fetch client

**Files:**
- Create: `src/lib/hilmihs/client.ts`

- [ ] **Step 1: Implementasi** — `src/lib/hilmihs/client.ts`

```ts
// Klien HTTP API agent hilmihs.web.id. Server-only (baca AGENT_TOKEN).
// Read-only GET, envelope + meta.truncated, paginasi offset, 413 = kecilkan limit.
import { apiEnv } from '@/lib/api-public/env';
import type {
  ProgramsResponse, Envelope, SrcPengajar, SrcHalaqah, SrcPeserta,
} from './types';

const BASE = 'https://hilmihs.web.id/api/agent';

function token(): string {
  const t = apiEnv('AGENT_TOKEN');
  if (!t || t.length < 24) throw new Error('AGENT_TOKEN belum di-set / terlalu pendek');
  return t;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error(`hilmihs ${path}: respons non-JSON (${res.status})`); }
  if (!res.ok) {
    const err = (data as { error?: string })?.error ?? res.statusText;
    throw new Error(`hilmihs ${path}: ${res.status} ${err}`);
  }
  return data as T;
}

export async function getPrograms(): Promise<ProgramsResponse> {
  return get<ProgramsResponse>('programs');
}

export async function getPengajar(slug: string): Promise<SrcPengajar[]> {
  const r = await get<Envelope<SrcPengajar>>(`${slug}/pengajar`);
  return (r.rows as SrcPengajar[]) ?? [];
}

export async function getHalaqah(slug: string): Promise<SrcHalaqah[]> {
  const r = await get<Envelope<SrcHalaqah>>(`${slug}/halaqah`);
  return (r.rows as SrcHalaqah[]) ?? [];
}

/** Paginasi peserta via offset sampai habis (meta.truncated.rows = total). */
export async function getPeserta(slug: string, pageSize = 300): Promise<SrcPeserta[]> {
  const out: SrcPeserta[] = [];
  let offset = 0;
  // ceiling per-route 500; 300 aman < 512KB.
  for (let guard = 0; guard < 100; guard++) {
    const r = await get<Envelope<SrcPeserta>>(`${slug}/peserta?limit=${pageSize}&offset=${offset}`);
    const rows = (r.rows as SrcPeserta[]) ?? [];
    out.push(...rows);
    const total = r.meta?.truncated?.rows ?? out.length;
    offset += rows.length;
    if (rows.length === 0 || out.length >= total) break;
  }
  return out;
}

/** Slug program tilawah_api saja (buang berkah/mabni). */
export async function tilawahSlugs(): Promise<string[]> {
  const { programs } = await getPrograms();
  return programs.filter((p) => p.dataSourceType === 'tilawah_api').map((p) => p.slug);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Probe live (opsional, butuh AGENT_TOKEN di .env.local)**

Run:
```bash
npx tsx --env-file=.env.local -e "import('./src/lib/hilmihs/client.ts').then(async m => { const s = await m.tilawahSlugs(); console.log('tilawah:', s.length); console.log('halaqah[0]:', (await m.getHalaqah(s[0]))[0]); })"
```
Expected: cetak jumlah slug tilawah (12) + satu baris halaqah. (Lewati bila token belum ada — typecheck cukup untuk lolos task.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/hilmihs/client.ts
git commit -m "feat(hilmihs): fetch client (bearer, paginasi, filter tilawah)"
```

---

## Task 4: Migration 0052 + row types

**Files:**
- Create: `supabase/migrations/0052_evaluasi_sync.sql`
- Create: `scripts/apply-migration.ts`
- Modify: `src/types/db.ts`, `package.json`

- [ ] **Step 1: Tulis migration** — `supabase/migrations/0052_evaluasi_sync.sql`

```sql
-- 0052_evaluasi_sync.sql
-- Staging sinkron master data hilmihs → mirror eval_*. Pull menulis diff ke sini;
-- apply memindahkannya ke eval_*. Tak ada FK ke eval_* (baris deactivate bisa
-- merujuk id yang masih ada; create merujuk id yang belum ada).

begin;

create table if not exists eval_sync_run (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  source_generated_at timestamptz,
  counts              jsonb not null default '{}'::jsonb, -- {pengajar:{create,update,deactivate},...}
  status              text not null default 'running' check (status in ('running','ok','error')),
  error               text
);

create table if not exists eval_sync_stage (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references eval_sync_run(id) on delete cascade,
  entity      text not null check (entity in ('batch','pengajar','halaqah','peserta')),
  op          text not null check (op in ('create','update','deactivate')),
  entity_id   text not null,          -- id mirror target (mis. 'hits-regular:54')
  before      jsonb,                  -- null utk create
  after       jsonb,                  -- null utk deactivate
  flags       text[] not null default '{}',
  applied_at  timestamptz,
  applied_by  text,
  rejected    boolean not null default false,
  rejected_by text,
  created_at  timestamptz not null default now()
);
-- Satu baris pending per (entity, entity_id): re-pull sebelum apply = upsert, tak dobel.
create unique index if not exists uq_eval_sync_stage_pending
  on eval_sync_stage(entity, entity_id)
  where applied_at is null and rejected = false;
create index if not exists idx_eval_sync_stage_run on eval_sync_stage(run_id);

commit;
```

- [ ] **Step 2: Runner migration dev** — `scripts/apply-migration.ts`

```ts
// Apply satu file migration ke DB yang ditunjuk DATABASE_URL (poolExec langsung).
// JANGAN pakai `npm run db` untuk migration — itu menembak PRODUKSI (HTTP admin).
// Jalankan: npm run apply-migration -- supabase/migrations/0052_evaluasi_sync.sql
import { readFileSync } from 'node:fs';
import { poolExec } from '../src/lib/pg-core';

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: npm run apply-migration -- <path.sql>'); process.exit(2); }
  const sql = readFileSync(file, 'utf8');
  console.log(`▶ apply ${file} ke DATABASE_URL dev …`);
  await poolExec(sql);
  console.log('✓ selesai');
}
main().catch((e) => { console.error('✗', e); process.exit(1); });
```

- [ ] **Step 3: Tambah script** — `package.json`

```json
    "apply-migration": "tsx --env-file=.env.local scripts/apply-migration.ts",
```

- [ ] **Step 4: Tambah row types** — `src/types/db.ts` (dekat interface baris lain)

```ts
export interface EvalSyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  source_generated_at: string | null;
  counts: Record<string, { create?: number; update?: number; deactivate?: number }>;
  status: 'running' | 'ok' | 'error';
  error: string | null;
}
export interface EvalSyncStage {
  id: string;
  run_id: string;
  entity: 'batch' | 'pengajar' | 'halaqah' | 'peserta';
  op: 'create' | 'update' | 'deactivate';
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  flags: string[];
  applied_at: string | null;
  applied_by: string | null;
  rejected: boolean;
  rejected_by: string | null;
  created_at: string;
}
```

- [ ] **Step 5: Apply ke dev + verifikasi**

> Pastikan dulu `DATABASE_URL` di `.env.local` = DB dev (bukan prod).

Run: `npm run apply-migration -- supabase/migrations/0052_evaluasi_sync.sql`
Expected: `✓ selesai`.

Verifikasi (query dev via supabaseAdmin):
Run: `npx tsx --env-file=.env.local -e "import('./src/lib/supabase-admin.ts').then(async m => { const {data} = await m.supabaseAdmin.from('eval_sync_stage').select('id').limit(1); console.log('eval_sync_stage OK', data); })"`
Expected: `eval_sync_stage OK []` (tabel ada, kosong).

- [ ] **Step 6: Typecheck + Commit**

Run: `npm run typecheck` → PASS.
```bash
git add supabase/migrations/0052_evaluasi_sync.sql scripts/apply-migration.ts src/types/db.ts package.json
git commit -m "feat(hilmihs): migration 0052 staging + row types + runner"
```

---

## Task 5: Diff murni

**Files:**
- Create: `src/lib/hilmihs/diff.ts`
- Modify: `scripts/test-hilmihs.ts` (tambah test diff)

- [ ] **Step 1: Tambah test diff** — `scripts/test-hilmihs.ts` (tambahkan sebelum blok penutup `if (failed)`)

```ts
import { diffEntity } from '@/lib/hilmihs/diff';

// current mirror: 1 pengajar (butuh update nama), 1 hilang (deactivate)
const cur = [
  { id: 'wa:628111', nama: 'Lama', gender: 'ikhwan', whatsapp: '628111', aktif: true },
  { id: 'wa:628999', nama: 'Hilang', gender: 'ikhwan', whatsapp: '628999', aktif: true },
];
const fetched = [
  { id: 'wa:628111', nama: 'Baru', gender: 'ikhwan', whatsapp: '628111' }, // update
  { id: 'wa:628222', nama: 'Fresh', gender: 'ikhwan', whatsapp: '628222' }, // create
];
const d = diffEntity('pengajar', fetched, cur, ['nama', 'gender', 'whatsapp']);
eq(d.map((x) => `${x.op}:${x.entity_id}`).sort(),
   ['create:wa:628222', 'deactivate:wa:628999', 'update:wa:628111'],
   'diff ops');
const upd = d.find((x) => x.op === 'update')!;
eq([upd.before?.nama, upd.after?.nama], ['Lama', 'Baru'], 'diff before/after');
// tak ada perubahan → tak ada baris
eq(diffEntity('pengajar', [{ id: 'wa:628111', nama: 'Baru', gender: 'ikhwan', whatsapp: '628111' }],
     [{ id: 'wa:628111', nama: 'Baru', gender: 'ikhwan', whatsapp: '628111', aktif: true }],
     ['nama', 'gender', 'whatsapp']).length, 0, 'diff no-op');
```

- [ ] **Step 2: Jalankan → gagal**

Run: `npm run test-hilmihs`
Expected: FAIL — `Cannot find module '@/lib/hilmihs/diff'`.

- [ ] **Step 3: Implementasi** — `src/lib/hilmihs/diff.ts`

```ts
// Fungsi MURNI: bandingkan baris mirror-shape hasil fetch vs baris mirror sekarang,
// hasilkan daftar diff (create/update/deactivate). Deactivate = ada di mirror
// (aktif) tapi hilang dari fetch. Update = field pembanding berubah.
import type { MirrorEntity } from './types';

export interface DiffRow {
  entity: MirrorEntity;
  op: 'create' | 'update' | 'deactivate';
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  flags: string[];
}

type Row = { id: string; aktif?: boolean } & Record<string, unknown>;

/**
 * @param compareCols kolom yang memicu 'update' bila berbeda.
 * Baris current yang sudah aktif=false diabaikan untuk deactivate (tak dobel).
 */
export function diffEntity(
  entity: MirrorEntity,
  fetched: Row[],
  current: Row[],
  compareCols: string[]
): DiffRow[] {
  const curById = new Map(current.map((r) => [r.id, r]));
  const fetchedIds = new Set(fetched.map((r) => r.id));
  const out: DiffRow[] = [];

  for (const f of fetched) {
    const c = curById.get(f.id);
    if (!c) {
      out.push({ entity, op: 'create', entity_id: f.id, before: null, after: f, flags: [] });
      continue;
    }
    const changed = compareCols.some((k) => normalize(c[k]) !== normalize(f[k]));
    if (changed) {
      out.push({ entity, op: 'update', entity_id: f.id, before: c, after: f, flags: [] });
    }
  }
  for (const c of current) {
    if (!fetchedIds.has(c.id) && c.aktif !== false) {
      out.push({ entity, op: 'deactivate', entity_id: c.id, before: c, after: null, flags: [] });
    }
  }
  return out;
}

function normalize(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}
```

- [ ] **Step 4: Jalankan → lulus**

Run: `npm run test-hilmihs`
Expected: semua `ok` (map + diff), `All hilmihs tests passed.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/hilmihs/diff.ts scripts/test-hilmihs.ts
git commit -m "feat(hilmihs): diff murni create/update/deactivate + test"
```

---

## Task 6: Orkestrasi pull (fetch→map→diff→stage)

**Files:**
- Create: `src/lib/hilmihs/sync.ts`

- [ ] **Step 1: Implementasi** — `src/lib/hilmihs/sync.ts`

```ts
// Orkestrasi PULL (server): tarik semua program tilawah_api → map → diff vs mirror
// → tulis eval_sync_stage + eval_sync_run. TIDAK menyentuh eval_* langsung.
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPrograms, getPengajar, getHalaqah, getPeserta } from './client';
import { mapBatch, mapPengajar, mapHalaqah, mapPeserta } from './map';
import { diffEntity, type DiffRow } from './diff';
import type {
  MirrorBatch, MirrorPengajar, MirrorHalaqah, MirrorPeserta, MirrorEntity,
} from './types';

const COMPARE: Record<MirrorEntity, string[]> = {
  batch: ['nama', 'aktif'],
  pengajar: ['nama', 'gender', 'whatsapp'],
  halaqah: ['nama', 'gender', 'level', 'pengajar_id', 'batch_id', 'ambang_ujian'],
  peserta: ['nama', 'gender', 'halaqah_id', 'urutan'],
};

/** Tarik & petakan snapshot lengkap dari semua program tilawah_api. */
async function fetchSnapshot(): Promise<{
  generatedAt: string;
  batch: MirrorBatch[]; pengajar: MirrorPengajar[];
  halaqah: MirrorHalaqah[]; peserta: MirrorPeserta[];
}> {
  const { programs, meta } = await getPrograms();
  const tilawah = programs.filter((p) => p.dataSourceType === 'tilawah_api');

  const batch = tilawah.map(mapBatch);
  const pengajarMap = new Map<string, MirrorPengajar>(); // dedup lintas-program by id (wa:)
  const halaqah: MirrorHalaqah[] = [];
  const peserta: MirrorPeserta[] = [];

  for (const p of tilawah) {
    const [pj, hq, ps] = await Promise.all([
      getPengajar(p.slug), getHalaqah(p.slug), getPeserta(p.slug),
    ]);
    for (const r of pj) { const m = mapPengajar(p.slug, r); pengajarMap.set(m.id, m); }
    for (const r of hq) {
      halaqah.push(mapHalaqah(p.slug, r));
      // pengajar halaqah yang tak muncul di /pengajar tetap terdaftar (by guruPhone/nama)
      const m = mapPengajar(p.slug, { pengajar: r.pengajar ?? '(tanpa pengajar)', phone: r.guruPhone, genders: [r.gender] });
      if (!pengajarMap.has(m.id)) pengajarMap.set(m.id, m);
    }
    ps.forEach((r, i) => peserta.push(mapPeserta(p.slug, r, i)));
  }
  return { generatedAt: meta.generatedAt, batch, pengajar: [...pengajarMap.values()], halaqah, peserta };
}

async function currentMirror<T>(table: string, cols: string): Promise<T[]> {
  const { data } = await supabaseAdmin.from(table).select(cols);
  return (data ?? []) as T[];
}

/** Tandai flag "tabrakan" pada diff sebelum ditulis (Section B). */
async function annotate(diffs: DiffRow[]): Promise<DiffRow[]> {
  // halaqah pengajar ganti / deactivate entity ber-nilai → flag. Cek keberadaan nilai.
  for (const d of diffs) {
    if (d.entity === 'halaqah' && d.op === 'update') {
      const b = d.before as { pengajar_id?: string } | null;
      const a = d.after as { pengajar_id?: string } | null;
      if (b && a && b.pengajar_id !== a.pengajar_id) {
        const { data } = await supabaseAdmin
          .from('evaluasi_sesi').select('id').eq('halaqah_id', d.entity_id).limit(1);
        if ((data ?? []).length) d.flags.push('pengajar-ganti-saat-sesi-ada');
      }
    }
    if ((d.entity === 'peserta' || d.entity === 'halaqah') && d.op === 'deactivate') {
      const col = d.entity === 'peserta' ? 'peserta_id' : null;
      if (col) {
        const { data } = await supabaseAdmin
          .from('evaluasi_nilai').select('id').eq(col, d.entity_id).limit(1);
        if ((data ?? []).length) d.flags.push('deactivate-ada-nilai');
      }
    }
    const after = d.after as { gender?: string | null } | null;
    if (after && (after.gender === null || after.gender === undefined)) d.flags.push('gender-kosong');
  }
  return diffs;
}

/** Jalankan satu putaran pull. Return ringkasan. */
export async function runPull(): Promise<{ runId: string; total: number; counts: Record<string, number> }> {
  const { data: runRow } = await supabaseAdmin
    .from('eval_sync_run').insert({ status: 'running' }).select('id').single();
  const runId = (runRow as { id: string }).id;

  try {
    const snap = await fetchSnapshot();
    const curBatch = await currentMirror<MirrorBatch & { aktif: boolean }>('eval_batch', 'id, nama, aktif');
    const curPeng = await currentMirror('eval_pengajar', 'id, nama, gender, whatsapp');
    const curHal = await currentMirror('eval_halaqah', 'id, nama, gender, level, pengajar_id, batch_id, ambang_ujian');
    const curPes = await currentMirror('eval_peserta', 'id, nama, gender, halaqah_id, urutan, aktif');

    let diffs: DiffRow[] = [
      ...diffEntity('batch', snap.batch as never, curBatch as never, COMPARE.batch),
      ...diffEntity('pengajar', snap.pengajar as never, curPeng as never, COMPARE.pengajar),
      ...diffEntity('halaqah', snap.halaqah as never, curHal as never, COMPARE.halaqah),
      ...diffEntity('peserta', snap.peserta as never, curPes as never, COMPARE.peserta),
    ];
    diffs = await annotate(diffs);

    // Hapus baris pending lama (belum di-apply/reject) supaya idempotent, lalu insert baru.
    await supabaseAdmin.from('eval_sync_stage').delete().is('applied_at', null).eq('rejected', false);
    if (diffs.length) {
      await supabaseAdmin.from('eval_sync_stage').insert(
        diffs.map((d) => ({
          run_id: runId, entity: d.entity, op: d.op, entity_id: d.entity_id,
          before: d.before, after: d.after, flags: d.flags,
        }))
      );
    }

    const counts: Record<string, number> = {};
    for (const d of diffs) counts[`${d.entity}.${d.op}`] = (counts[`${d.entity}.${d.op}`] ?? 0) + 1;

    await supabaseAdmin.from('eval_sync_run').update({
      finished_at: new Date().toISOString(),
      source_generated_at: snap.generatedAt,
      counts, status: 'ok',
    }).eq('id', runId);

    return { runId, total: diffs.length, counts };
  } catch (e) {
    await supabaseAdmin.from('eval_sync_run').update({
      finished_at: new Date().toISOString(),
      status: 'error', error: e instanceof Error ? e.message : String(e),
    }).eq('id', runId);
    throw e;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Dry-run ke dev (butuh AGENT_TOKEN + DATABASE_URL dev)**

Run: `npx tsx --env-file=.env.local -e "import('./src/lib/hilmihs/sync.ts').then(async m => console.log(await m.runPull()))"`
Expected: `{ runId: '…', total: <N>, counts: { 'pengajar.create': …, 'halaqah.create': …, 'peserta.create': … } }` (import pertama → semua `create`). Cek `eval_sync_stage` terisi.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hilmihs/sync.ts
git commit -m "feat(hilmihs): orkestrasi pull fetch→map→diff→stage + flag tabrakan"
```

---

## Task 7: Apply stage → mirror

**Files:**
- Create: `src/lib/hilmihs/apply.ts`

- [ ] **Step 1: Implementasi** — `src/lib/hilmihs/apply.ts`

```ts
// Terapkan baris eval_sync_stage ter-approve ke mirror eval_*. Urutan penting
// (batch/pengajar dulu, lalu halaqah, lalu peserta) supaya FK terpenuhi.
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EvalSyncStage } from '@/types/db';

const TABLE: Record<string, string> = {
  batch: 'eval_batch', pengajar: 'eval_pengajar', halaqah: 'eval_halaqah', peserta: 'eval_peserta',
};
const ORDER = ['batch', 'pengajar', 'halaqah', 'peserta'];

/** Apply baris stage id tertentu. Reject → hanya ditandai, tak sentuh mirror. */
export async function applyStages(stageIds: string[], actor: string): Promise<{ applied: number }> {
  const { data } = await supabaseAdmin
    .from('eval_sync_stage')
    .select('id, entity, op, entity_id, after')
    .in('id', stageIds)
    .is('applied_at', null)
    .eq('rejected', false);
  const rows = (data ?? []) as Pick<EvalSyncStage, 'id' | 'entity' | 'op' | 'entity_id' | 'after'>[];

  const now = new Date().toISOString();
  let applied = 0;

  for (const entity of ORDER) {
    for (const r of rows.filter((x) => x.entity === entity)) {
      const table = TABLE[entity];
      if (r.op === 'deactivate') {
        await supabaseAdmin.from(table).update({ aktif: false, synced_at: now }).eq('id', r.entity_id);
      } else {
        // create / update: upsert baris mirror dari `after` (+ synced_at).
        await supabaseAdmin.from(table).upsert({ ...(r.after as object), synced_at: now }, { onConflict: 'id' });
      }
      await supabaseAdmin.from('eval_sync_stage')
        .update({ applied_at: now, applied_by: actor }).eq('id', r.id);
      applied++;
    }
  }
  return { applied };
}

export async function rejectStages(stageIds: string[], actor: string): Promise<{ rejected: number }> {
  const { error } = await supabaseAdmin.from('eval_sync_stage')
    .update({ rejected: true, rejected_by: actor })
    .in('id', stageIds).is('applied_at', null);
  if (error) throw new Error(error.message);
  return { rejected: stageIds.length };
}
```

> **Catatan:** `eval_batch`/`eval_halaqah` tak punya kolom `aktif`? — Cek: `eval_batch.aktif` ADA (0051), `eval_halaqah` TAK punya `aktif`. Untuk `op='deactivate'` entity `halaqah`, set kolom yang ada: `eval_halaqah` tak punya `aktif` → gunakan penonaktifan via peserta-nya saja; JADI **batasi deactivate ke entity `peserta` & `batch`** di Task 6 (jangan hasilkan diff deactivate untuk halaqah/pengajar). Sesuaikan `diffEntity` pemanggilan: untuk halaqah & pengajar, JANGAN kirim baris current yang hilang sebagai deactivate — filter op deactivate untuk entity itu di `runPull` sebelum insert.

- [ ] **Step 2: Sesuaikan Task 6** — di `runPull`, setelah `diffs = await annotate(diffs)`, tambahkan:

```ts
    // eval_halaqah & eval_pengajar tak punya kolom 'aktif' → buang usulan deactivate
    // untuk keduanya (hanya batch & peserta yang bisa di-nonaktifkan).
    diffs = diffs.filter((d) => !(d.op === 'deactivate' && (d.entity === 'halaqah' || d.entity === 'pengajar')));
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hilmihs/apply.ts src/lib/hilmihs/sync.ts
git commit -m "feat(hilmihs): apply stage→mirror (urut FK) + batasi deactivate"
```

---

## Task 8: API routes pull + apply, hapus stub push

**Files:**
- Create: `src/app/api/evaluasi/sync/pull/route.ts`, `src/app/api/evaluasi/sync/apply/route.ts`
- Delete: `src/app/api/evaluasi/sync/route.ts`

- [ ] **Step 1: Pull route** — `src/app/api/evaluasi/sync/pull/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api-public/env';
import { runPull } from '@/lib/hilmihs/sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = apiEnv('CRON_SECRET');
  if (!secret || secret.length < 16) return false;
  const h = req.headers.get('authorization') ?? '';
  return h === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPull();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Apply route** — `src/app/api/evaluasi/sync/apply/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { isSuperadmin, getAdminActor } from '@/lib/admin-guard';
import { applyStages, rejectStages } from '@/lib/hilmihs/apply';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!(await isSuperadmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const actor = (await getAdminActor())?.wa ?? 'admin';
  const body = await req.json();
  const { action, stageIds } = body as { action: 'apply' | 'reject'; stageIds: string[] };
  if (!Array.isArray(stageIds) || !stageIds.length) {
    return NextResponse.json({ error: 'stageIds wajib' }, { status: 400 });
  }
  try {
    const result = action === 'reject'
      ? await rejectStages(stageIds, actor)
      : await applyStages(stageIds, actor);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
```

> Cek signature `getAdminActor()` di `src/lib/admin-guard.ts` (return `RoleAccess | null`; `.wa` bila ada). Bila bentuk beda, ambil identitas actor sesuai yang tersedia (fallback `'admin'`).

- [ ] **Step 3: Hapus stub push**

```bash
git rm src/app/api/evaluasi/sync/route.ts
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck` → PASS.
Run: `npm run build` → sukses (route ter-compile).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/evaluasi/sync/pull/route.ts src/app/api/evaluasi/sync/apply/route.ts
git commit -m "feat(hilmihs): route pull (CRON_SECRET) + apply (superadmin), hapus stub push"
```

---

## Task 9: UI review staging

**Files:**
- Create: `src/app/evaluasi/koordinator/sync/page.tsx`, `SyncReviewPanel.tsx`, `actions.ts`

- [ ] **Step 1: Server actions** — `src/app/evaluasi/koordinator/sync/actions.ts`

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { isSuperadmin, getAdminActor } from '@/lib/admin-guard';
import { runPull } from '@/lib/hilmihs/sync';
import { applyStages, rejectStages } from '@/lib/hilmihs/apply';

async function guard(): Promise<string> {
  if (!(await isSuperadmin())) throw new Error('Unauthorized');
  return (await getAdminActor())?.wa ?? 'admin';
}

export async function triggerPull() {
  await guard();
  const r = await runPull();
  revalidatePath('/evaluasi/koordinator/sync');
  return r;
}
export async function approve(stageIds: string[]) {
  const actor = await guard();
  const r = await applyStages(stageIds, actor);
  revalidatePath('/evaluasi/koordinator/sync');
  return r;
}
export async function reject(stageIds: string[]) {
  const actor = await guard();
  const r = await rejectStages(stageIds, actor);
  revalidatePath('/evaluasi/koordinator/sync');
  return r;
}
```

- [ ] **Step 2: RSC page** — `src/app/evaluasi/koordinator/sync/page.tsx`

```tsx
import { redirect } from 'next/navigation';
import { isSuperadmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EvalSyncRun, EvalSyncStage } from '@/types/db';
import { SyncReviewPanel } from './SyncReviewPanel';

export const dynamic = 'force-dynamic';

export default async function SyncReviewPage() {
  if (!(await isSuperadmin())) redirect('/');

  const { data: runs } = await supabaseAdmin
    .from('eval_sync_run').select('*').order('started_at', { ascending: false }).limit(1);
  const lastRun = (runs ?? [])[0] as EvalSyncRun | undefined;

  const { data: stageRows } = await supabaseAdmin
    .from('eval_sync_stage').select('*')
    .is('applied_at', null).eq('rejected', false)
    .order('entity').order('op');
  const stage = (stageRows ?? []) as EvalSyncStage[];

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }} className="page">
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Sinkron hilmihs → Evaluasi</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 14 }}>
          {lastRun
            ? `Pull terakhir: ${lastRun.started_at} · status ${lastRun.status} · sumber ${lastRun.source_generated_at ?? '—'}`
            : 'Belum pernah pull.'}
        </p>
        <SyncReviewPanel stage={stage} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Client panel** — `src/app/evaluasi/koordinator/sync/SyncReviewPanel.tsx`

```tsx
'use client';
import { useState, useTransition } from 'react';
import type { EvalSyncStage } from '@/types/db';
import { triggerPull, approve, reject } from './actions';

const OP_STYLE: Record<string, { bg: string; ink: string }> = {
  create: { bg: 'var(--hijau-tint)', ink: 'var(--hijau-ink)' },
  update: { bg: 'var(--kuning-tint)', ink: 'var(--kuning-ink)' },
  deactivate: { bg: 'var(--merah-tint)', ink: 'var(--merah-ink)' },
};

export function SyncReviewPanel({ stage }: { stage: EvalSyncStage[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const flagged = stage.filter((s) => s.flags.length);
  const clean = stage.filter((s) => !s.flags.length);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function act(fn: (ids: string[]) => Promise<unknown>, ids: string[]) {
    setMsg(null);
    start(async () => { const r = await fn(ids); setMsg(JSON.stringify(r)); setSel(new Set()); });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-primary" disabled={pending}
          onClick={() => act(() => triggerPull(), [])}>
          {pending ? '…' : '⟳ Sinkronkan sekarang'}
        </button>
        <button className="btn btn-sm btn-ghost" disabled={pending || !clean.length}
          onClick={() => act(approve, clean.map((s) => s.id))}>
          ✓ Approve semua non-flag ({clean.length})
        </button>
        <button className="btn btn-sm btn-ghost" disabled={pending || !sel.size}
          onClick={() => act(approve, [...sel])}>Approve terpilih ({sel.size})</button>
        <button className="btn btn-sm btn-ghost" disabled={pending || !sel.size}
          onClick={() => act(reject, [...sel])}>Tolak terpilih</button>
      </div>
      {msg && <p className="t-tiny" style={{ color: 'var(--muted-2)' }}>{msg}</p>}

      {flagged.length > 0 && (
        <>
          <h2 className="t-h3" style={{ color: 'var(--merah-ink)', margin: '10px 0 6px' }}>
            ⚠ Perlu perhatian ({flagged.length})
          </h2>
          <StageTable rows={flagged} sel={sel} toggle={toggle} />
        </>
      )}
      <h2 className="t-h3" style={{ margin: '14px 0 6px' }}>Perubahan ({clean.length})</h2>
      <StageTable rows={clean} sel={sel} toggle={toggle} />
    </div>
  );
}

function StageTable({ rows, sel, toggle }: {
  rows: EvalSyncStage[]; sel: Set<string>; toggle: (id: string) => void;
}) {
  if (!rows.length) return <p className="t-tiny" style={{ color: 'var(--muted)' }}>—</p>;
  return (
    <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="k-table">
          <thead><tr>
            <th style={{ width: 30 }}></th><th>Entity</th><th>Op</th><th>ID</th>
            <th>Nama (after)</th><th>Flags</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const os = OP_STYLE[r.op];
              const nama = (r.after as { nama?: string } | null)?.nama
                ?? (r.before as { nama?: string } | null)?.nama ?? '—';
              return (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="t-tiny">{r.entity}</td>
                  <td><span className="badge" style={{ background: os.bg, color: os.ink, borderColor: os.ink }}>{r.op}</span></td>
                  <td className="t-mono t-tiny">{r.entity_id}</td>
                  <td className="t-tiny">{nama}</td>
                  <td className="t-tiny" style={{ color: 'var(--merah-ink)' }}>{r.flags.join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck` → PASS.
Run: `npm run build` → sukses.

- [ ] **Step 5: Commit**

```bash
git add src/app/evaluasi/koordinator/sync/
git commit -m "feat(hilmihs): UI review staging (pull, approve/tolak, flag terpisah)"
```

---

## Task 10: Infra timer + env docs + verifikasi E2E

**Files:**
- Modify: `azure-pipelines.yml`, `.env.example`

- [ ] **Step 1: `.env.example`** — tambah (dekat konfigurasi lain)

```
# API agent hilmihs.web.id (server-to-server, read-only). Prod: ENV_AGENT_TOKEN di Variable Group.
AGENT_TOKEN=
# Rahasia proteksi endpoint cron sinkron. Prod: ENV_CRON_SECRET di Variable Group.
CRON_SECRET=
```

- [ ] **Step 2: SSH task systemd timer** — `azure-pipelines.yml` (tambah task Ssh@0 SETELAH task "🔗 Wire maahir.env", sebelum deploy)

```yaml
  - task: Ssh@0
    displayName: "⏱️ Pasang systemd timer sinkron hilmihs (harian)"
    inputs:
      sshEndpoint: "server-staging@103.181.142.223"
      runOptions: "inline"
      failOnStdErr: false
      inline: |
        # Timer harian menembak endpoint pull ber-CRON_SECRET. Idempotent.
        # CRON_SECRET dibaca dari maahir.env yang sudah terpasang.
        SECRET=$(grep '^ENV_CRON_SECRET=' /var/www/html/maahir/maahir.env | cut -d= -f2- | tr -d '"')
        URL="https://maahir.muhajirproject.org/api/evaluasi/sync/pull"
        sudo tee /etc/systemd/system/next-maahir-sync.service >/dev/null <<EOF
        [Unit]
        Description=Pull master data hilmihs -> mirror evaluasi maahir
        [Service]
        Type=oneshot
        ExecStart=/usr/bin/curl -fsS -X POST -H "Authorization: Bearer ${SECRET}" ${URL}
        EOF
        sudo tee /etc/systemd/system/next-maahir-sync.timer >/dev/null <<EOF
        [Unit]
        Description=Jalankan sinkron hilmihs tiap hari 02:00
        [Timer]
        OnCalendar=*-*-* 02:00:00
        Persistent=true
        [Install]
        WantedBy=timers.target
        EOF
        sudo systemctl daemon-reload
        sudo systemctl enable --now next-maahir-sync.timer
        echo "✅ timer aktif:"; sudo systemctl list-timers next-maahir-sync.timer --no-pager || true
```

> **Catatan keamanan:** `SECRET` hanya dipakai inline di ExecStart file service (mode default root-only `/etc/systemd/system`). Tak dicetak ke log (script tak `echo` nilai). Timezone server diasumsikan WIB; bila server UTC, ganti `OnCalendar` ke `19:00:00` (= 02:00 WIB).

- [ ] **Step 3: Commit infra**

```bash
git add azure-pipelines.yml .env.example
git commit -m "feat(hilmihs): systemd timer harian + dokumentasi env"
```

- [ ] **Step 4: Verifikasi E2E (dev)**

- [ ] a. `npm run test-hilmihs` → semua pass.
- [ ] b. `npm run typecheck` → clean. `npm run build` → sukses.
- [ ] c. Set `AGENT_TOKEN` + `DATABASE_URL` dev di `.env.local`. Apply migration (Task 4 step 5).
- [ ] d. Jalankan pull manual:
  `npx tsx --env-file=.env.local -e "import('./src/lib/hilmihs/sync.ts').then(m=>m.runPull()).then(r=>console.log(r))"`
  → `total > 0`, `eval_sync_stage` terisi (import pertama = semua create).
- [ ] e. Login superadmin, buka `/evaluasi/koordinator/sync` → daftar stage muncul, "Approve semua non-flag" → cek `eval_pengajar`/`eval_halaqah`/`eval_peserta` terisi.
- [ ] f. Pull lagi → total 0 baris baru (idempotent, tak ada diff).
- [ ] g. Login pengajar yang WA-nya cocok `eval_pengajar.whatsapp` → (setelah UI evaluasi Phase 3 ada) melihat halaqah miliknya. Untuk sekarang cukup query:
  `select * from eval_halaqah where pengajar_id = 'wa:<wa-pengajar>'` → ada barisnya.

- [ ] **Step 5: Commit akhir / buka PR**

```bash
git commit --allow-empty -m "chore(hilmihs): verifikasi E2E sinkron master data selesai"
```

---

## Self-Review (diisi penulis plan)

- **Spec coverage:** Section A (map identitas) → Task 1,2. Section B (pull/stage/apply/flag) → Task 5,6,7,9. Section C (mirror↔sesi, tak sentuh transaksi) → dijaga: sync hanya sentuh `eval_*`+stage, tak pernah `evaluasi_sesi/nilai`; flag pengajar-ganti/deactivate-ada-nilai di Task 6. Section D (trigger+secret) → Task 8 (CRON guard, apiEnv), Task 10 (timer). Section E (tabel+file) → Task 4 (0052), Task 2/3/5/6/7 (lib), Task 8 (routes+hapus stub), Task 9 (UI).
- **Placeholder scan:** semua step lib/route/migration/test berisi kode nyata. UI Task 9 kode penuh. Nilai domain konkret (`maahir.muhajirproject.org`).
- **Konsistensi tipe:** `MirrorPengajar/Halaqah/Peserta` (Task 1) dipakai konsisten di map (Task 2), diff via kolom (Task 5), sync (Task 6). `DiffRow` (Task 5) dipakai sync+annotate. `EvalSyncStage`/`EvalSyncRun` (Task 4) dipakai apply+UI. `applyStages/rejectStages` nama konsisten Task 7→8→9.
- **Catatan verifikasi runtime:** signature `getAdminActor()` & keberadaan kolom `aktif` pada `eval_halaqah`/`eval_pengajar` dikonfirmasi di Task 7 (deactivate dibatasi ke batch & peserta). `poolExec(sql)` menerima multi-statement (Task 4).
