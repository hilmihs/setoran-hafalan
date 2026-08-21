# Evaluasi Halaqah Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production "Evaluasi Halaqah" feature — a Pengajar mobile flow to score each peserta's Qur'an recitation by counting Lahn (tajwid errors) per session, and a Koordinator desktop dashboard that aggregates those scores across halaqah.

**Architecture:** New self-contained evaluation domain in Postgres (migration `0051`), owning its own tables plus **local mirror tables** for master entities (pengajar / halaqah / peserta / batch) that will be populated by the user's sync API *later*. Until that API lands, a seed script fills the mirrors with the mockup's demo data so both role flows run end-to-end. Scoring is a pure library (`src/lib/evaluasi.ts`) unit-tested with the repo's `tsx` script convention. UI follows the existing "server RSC fetches → `'use client'` form → debounced `fetch` POST to `/api/**/upsert`" pattern; styling uses the repo's `globals.css` semantic classes + inline `var(--...)`, NOT Tailwind utilities. Roles reuse `pengajar` (editor) and `koordinator` (dashboard) — no new runtime role.

**Tech Stack:** Next.js 14 App Router, TypeScript, `supabaseAdmin` (node-postgres shim), iron-session, `tsx` test scripts.

**Design source of truth:** `docs/design/evaluasi-halaqah/mockup.dc.html` (decoded from Claude Design `Evaluasi Halaqah.dc.html`). Every screen's exact markup, inline styles, colors, and copy live there — render from it. Screen IDs referenced below (`p-home`, `p-setup`, `p-daftar`, `p-nilai`, `p-ringkasan`, `p-rapor`, `k-home`, `k-halaqah`, `k-settings`) match the `<sc-if>` blocks in that file. The mockup's `<script data-dc-script>` (bottom of file) is the behavioral spec: `scoreOf`, `tierOf`, `buildTrack`, state shape, navigation.

---

## Domain rules (locked from mockup `data-dc-script`)

**Lahn categories (11).** Stored as one count column each.

| Group | key | Label (UI) | Column |
|---|---|---|---|
| Jaliy (−6 each) | `huruf` | JK. Huruf | `jk_huruf` |
| Jaliy | `harakat` | JK. Harakat | `jk_harakat` |
| Jaliy | `mad` | JK. Mad | `jk_mad` |
| Jaliy | `tasydid` | JK. Tasydid | `jk_tasydid` |
| Khafiy (−2 each) | `izhar` | JK. Izhar | `kh_izhar` |
| Khafiy | `idghambighunnah` | JK. Idgham Bighunnah | `kh_idgham_bighunnah` |
| Khafiy | `idghambilaghunnah` | JK. Idgham Bilaghunnah | `kh_idgham_bilaghunnah` |
| Khafiy | `idghammimi` | JK. Idgham Mimi & Ghunnah | `kh_idgham_mimi` |
| Khafiy | `iqlab` | JK. Iqlab | `kh_iqlab` |
| Khafiy | `ikhfahakiki` | JK. Ikhfa Hakiki | `kh_ikhfa_hakiki` |
| Khafiy | `ikhfasyafawi` | JK. Ikhfa Syafawi | `kh_ikhfa_syafawi` |

**Score:** `skor = max(0, 100 − 6×(sum Jaliy) − 2×(sum Khafiy))`.

**Tiers:** `>=90` Mumtaz · `>=70` Standar · `>=50` "Cukup — di bawah standar" · else "Perlu pengulangan". Colors in mockup `tierOf()`.

**Thresholds (ambang):** standar = **70** (constant `AMBANG`). Ujian Akhir uses a per-halaqah lulus threshold; mockup hardcodes **65** (`ambangMustawa`). Store `ambang` per session so it is configurable.

**Period axes:** `jenis ∈ {qn, pb, ujian}` × `nomor_sesi` (1..4 for qn/pb, 1..`ujianAttempts` for ujian). Each (halaqah, jenis, nomor_sesi) is one **evaluasi_sesi** with its own scheduled date, surat, ayat range, ambang.

**Config (koordinator, per gender):** track display names (default "Evaluasi QN" / "Evaluasi PB"), `ujian_attempts ∈ {1,2}`, and the scheduled dates per track/session.

---

## File Structure

**Create:**
- `supabase/migrations/0051_evaluasi_halaqah.sql` — all tables + trigger + seed-safe.
- `src/lib/evaluasi.ts` — pure scoring/tier/lahn-taxonomy lib (single source of truth, shared client+server).
- `src/lib/evaluasi-sesi.ts` — server helpers: resolve/aggregate sessions, ownership guards (server-only, imports `supabaseAdmin`).
- `scripts/test-evaluasi.ts` — pure-function tests (mirrors `scripts/test-shakwa.ts`).
- `scripts/seed-evaluasi.ts` — populate mirror + demo eval data from mockup constants.
- `src/app/api/evaluasi/sesi/upsert/route.ts` — create/update a session (setup screen).
- `src/app/api/evaluasi/nilai/upsert/route.ts` — upsert one peserta's scores for a session.
- `src/app/api/evaluasi/kirim/route.ts` — finalize (mark session submitted).
- `src/app/api/evaluasi/config/upsert/route.ts` — koordinator config (track names, attempts, schedule).
- `src/app/api/evaluasi/sync/route.ts` — **stub** endpoint the user's master-data API will call later; validates + upserts mirror rows.
- Pengajar flow (mobile):
  - `src/app/evaluasi/pengajar/page.tsx` — `p-home` (RSC).
  - `src/app/evaluasi/pengajar/EvaluasiPengajarApp.tsx` — `'use client'` shell owning navigation + all sub-screens (`p-setup`→`p-rapor`). Mirrors the mockup's single-component state machine.
  - `src/app/evaluasi/pengajar/screens/` — `Setup.tsx`, `Daftar.tsx`, `Nilai.tsx`, `Ringkasan.tsx`, `Rapor.tsx` (presentational, driven by the shell).
- Koordinator flow (desktop):
  - `src/app/evaluasi/koordinator/page.tsx` — `k-home` dashboard (RSC).
  - `src/app/evaluasi/koordinator/[halaqahId]/page.tsx` — `k-halaqah` drill-down (RSC).
  - `src/app/evaluasi/koordinator/pengaturan/page.tsx` — `k-settings` (RSC) + `PengaturanForm.tsx` (`'use client'`).
  - `src/components/evaluasi/RaporTrackChart.tsx` — SVG trend chart (`buildTrack`), shared by rapor.
  - `src/components/evaluasi/WaRecapSheet.tsx` — WhatsApp recap bottom-sheet.

**Modify:**
- `src/types/db.ts` — add row types + extend `PengajarSession`/`KoordinatorSession` usage is unchanged (reuse existing).
- `src/middleware.ts:12` — add `'/evaluasi'` to `PROTECTED`.
- `src/lib/roles.ts` — no new role; add `/evaluasi/pengajar` and `/evaluasi/koordinator` as optional landing shortcuts (non-breaking).
- `package.json` scripts — add `test-evaluasi`, `seed-evaluasi`.

---

## Phasing

- **Phase 0** — Scoring/taxonomy lib + tests (no DB). Produces a verified pure library.
- **Phase 1** — Migration `0051` + `src/types/db.ts` + seed script. Produces a queryable schema with demo data.
- **Phase 2** — API routes (sesi, nilai, kirim, config, sync-stub). Produces a working persistence layer (curl-testable).
- **Phase 3** — Pengajar mobile flow. Produces the end-to-end scoring UX.
- **Phase 4** — Koordinator dashboard + drill-down + settings.
- **Phase 5** — WA recap + PDF export + middleware/landing wiring + final verification.

Each phase ends green (typecheck + relevant test/build) and is committed. Phases 3–4 depend only on 0–2.

---

## Testing approach (repo convention)

This repo has **no jest/vitest** — tests are `tsx` scripts of pure functions using a local `eq()` helper, run via `npm run test-*` (see `scripts/test-shakwa.ts`). Follow that exactly for `src/lib/evaluasi.ts`. UI and DB-touching code are verified by `npm run typecheck`, `npm run build`, and manual walkthrough via the `run` skill. Do **not** introduce a test framework.

---

## Phase 0 — Scoring & taxonomy library

### Task 0.1: Lahn taxonomy + scoring (pure lib)

**Files:**
- Create: `src/lib/evaluasi.ts`
- Test: `scripts/test-evaluasi.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the failing test** — `scripts/test-evaluasi.ts`

```ts
// Uji fungsi murni Evaluasi Halaqah: taksonomi Lahn, skor, tier, ambang.
// Jalankan: npm run test-evaluasi
import {
  JALIY, KHAFIY, ALL_LAHN, LAHN_BY_KEY, emptyCounts,
  scoreOf, tierOf, AMBANG, columnFor,
} from '@/lib/evaluasi';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

eq(JALIY.length, 4, 'jaliy count');
eq(KHAFIY.length, 7, 'khafiy count');
eq(ALL_LAHN.length, 11, 'all lahn count');
eq(LAHN_BY_KEY.mad.group, 'jaliy', 'lookup group');
eq(columnFor('idghammimi'), 'kh_idgham_mimi', 'column mapping');

// score: 1 jaliy(-6) + 3 idghambighunnah + 2 ikhfahakiki + 1 iqlab + 2 ikhfasyafawi
// = -6 - 2*(3+2+1+2) = -6 - 16 = 100-22 = 78
const c = { ...emptyCounts(), huruf: 1, idghambighunnah: 3, ikhfahakiki: 2, iqlab: 1, ikhfasyafawi: 2 };
eq(scoreOf(c), { skor: 78, jaliyCount: 1, khafiyCount: 8 }, 'scoreOf sample');
eq(scoreOf(emptyCounts()), { skor: 100, jaliyCount: 0, khafiyCount: 0 }, 'perfect');
// floor at 0: 17 jaliy = -102 -> 0
eq(scoreOf({ ...emptyCounts(), huruf: 17 }).skor, 0, 'floor at zero');

eq(tierOf(95).label, 'Mumtaz', 'tier mumtaz');
eq(tierOf(70).label, 'Standar', 'tier standar boundary');
eq(tierOf(69).label, 'Cukup — di bawah standar', 'tier cukup');
eq(tierOf(10).label, 'Perlu pengulangan', 'tier ulang');
eq(AMBANG, 70, 'ambang const');

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll evaluasi tests passed.');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/test-evaluasi.ts`
Expected: FAIL — `Cannot find module '@/lib/evaluasi'`.

- [ ] **Step 3: Write minimal implementation** — `src/lib/evaluasi.ts`

```ts
// Single source of truth untuk Evaluasi Halaqah: taksonomi Lahn, skor, tier.
// Aman diimpor dari client & server (tanpa dependensi Node).

export type LahnGroup = 'jaliy' | 'khafiy';
export interface LahnDef {
  key: string;      // key runtime (mis. 'idghammimi')
  label: string;    // label UI (mis. 'JK. Idgham Mimi & Ghunnah')
  group: LahnGroup;
  column: string;   // kolom DB (mis. 'kh_idgham_mimi')
}

export const JALIY: LahnDef[] = [
  { key: 'huruf',   label: 'JK. Huruf',   group: 'jaliy', column: 'jk_huruf' },
  { key: 'harakat', label: 'JK. Harakat', group: 'jaliy', column: 'jk_harakat' },
  { key: 'mad',     label: 'JK. Mad',     group: 'jaliy', column: 'jk_mad' },
  { key: 'tasydid', label: 'JK. Tasydid', group: 'jaliy', column: 'jk_tasydid' },
];

export const KHAFIY: LahnDef[] = [
  { key: 'izhar',             label: 'JK. Izhar',                  group: 'khafiy', column: 'kh_izhar' },
  { key: 'idghambighunnah',   label: 'JK. Idgham Bighunnah',       group: 'khafiy', column: 'kh_idgham_bighunnah' },
  { key: 'idghambilaghunnah', label: 'JK. Idgham Bilaghunnah',     group: 'khafiy', column: 'kh_idgham_bilaghunnah' },
  { key: 'idghammimi',        label: 'JK. Idgham Mimi & Ghunnah',  group: 'khafiy', column: 'kh_idgham_mimi' },
  { key: 'iqlab',             label: 'JK. Iqlab',                  group: 'khafiy', column: 'kh_iqlab' },
  { key: 'ikhfahakiki',       label: 'JK. Ikhfa Hakiki',           group: 'khafiy', column: 'kh_ikhfa_hakiki' },
  { key: 'ikhfasyafawi',      label: 'JK. Ikhfa Syafawi',          group: 'khafiy', column: 'kh_ikhfa_syafawi' },
];

export const ALL_LAHN: LahnDef[] = [...JALIY, ...KHAFIY];
export const LAHN_BY_KEY: Record<string, LahnDef> =
  Object.fromEntries(ALL_LAHN.map((d) => [d.key, d]));
export const LAHN_BY_COLUMN: Record<string, LahnDef> =
  Object.fromEntries(ALL_LAHN.map((d) => [d.column, d]));

export const AMBANG = 70;                // ambang standar global
export const AMBANG_UJIAN_DEFAULT = 65;  // default lulus Ujian Akhir (mockup)
export const JENIS = ['qn', 'pb', 'ujian'] as const;
export type Jenis = (typeof JENIS)[number];

export type LahnCounts = Record<string, number>;
export function emptyCounts(): LahnCounts {
  const c: LahnCounts = {};
  for (const d of ALL_LAHN) c[d.key] = 0;
  return c;
}
export function columnFor(key: string): string {
  const d = LAHN_BY_KEY[key];
  if (!d) throw new Error(`unknown lahn key: ${key}`);
  return d.column;
}

export interface Score { skor: number; jaliyCount: number; khafiyCount: number; }
export function scoreOf(counts: LahnCounts): Score {
  const j = JALIY.reduce((a, d) => a + (counts[d.key] || 0), 0);
  const kf = KHAFIY.reduce((a, d) => a + (counts[d.key] || 0), 0);
  return { skor: Math.max(0, 100 - j * 6 - kf * 2), jaliyCount: j, khafiyCount: kf };
}

export interface Tier { label: string; color: string; }
export function tierOf(skor: number): Tier {
  if (skor >= 90) return { label: 'Mumtaz', color: 'oklch(0.40 0.10 150)' };
  if (skor >= 70) return { label: 'Standar', color: 'oklch(0.40 0.10 150)' };
  if (skor >= 50) return { label: 'Cukup — di bawah standar', color: 'oklch(0.48 0.10 75)' };
  return { label: 'Perlu pengulangan', color: 'oklch(0.46 0.14 25)' };
}

export function initials(nama: string): string {
  return nama.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

// Konversi antara counts (keyed) dan kolom DB (kh_/jk_).
export function countsToColumns(counts: LahnCounts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of ALL_LAHN) out[d.column] = Math.max(0, counts[d.key] || 0);
  return out;
}
export function columnsToCounts(row: Record<string, unknown>): LahnCounts {
  const c = emptyCounts();
  for (const d of ALL_LAHN) c[d.key] = Number(row[d.column] || 0);
  return c;
}
```

- [ ] **Step 4: Add npm scripts** — `package.json` (after `test-shakwa` line)

```json
    "test-evaluasi": "tsx scripts/test-evaluasi.ts",
    "seed-evaluasi": "tsx --env-file=.env.local scripts/seed-evaluasi.ts",
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm run test-evaluasi`
Expected: all `ok`, ends `All evaluasi tests passed.`

- [ ] **Step 6: Commit**

```bash
git add src/lib/evaluasi.ts scripts/test-evaluasi.ts package.json
git commit -m "feat(evaluasi): scoring & Lahn taxonomy lib with tests"
```

### Task 0.2: Rapor trend-chart geometry (pure)

**Files:** Modify `src/lib/evaluasi.ts`; Modify `scripts/test-evaluasi.ts`.

Port `buildTrack()` geometry from the mockup into a pure `buildTrackGeometry(history: (number|null)[], opts)` returning `{ points, sessions, avg, trend, ambangY, chartW, chartH }` (see mockup lines defining `W=260,H=92,padX=16,padY=12`, `yFor`, `linePoints`). Keep it framework-free so `RaporTrackChart.tsx` only renders.

- [ ] **Step 1:** Add a test asserting: empty history → `avg: null`, `points: ''`; history `[74,79,86,null]` → 3 filled points, `avg: 80` (round of 79.67), `trend: 7`. Compute expected `cx/cy` from the same formulas and assert the first/last point strings.
- [ ] **Step 2:** Run `npm run test-evaluasi` → FAIL (function missing).
- [ ] **Step 3:** Implement `buildTrackGeometry` in `src/lib/evaluasi.ts` copying the mockup math verbatim (`xs`, `yFor`, filled points join, `avg`, `trend`, `ambangY = yFor(AMBANG)`).
- [ ] **Step 4:** Run `npm run test-evaluasi` → PASS.
- [ ] **Step 5:** Commit `feat(evaluasi): pure rapor trend-chart geometry`.

---

## Phase 1 — Schema & mirror

### Task 1.1: Migration `0051_evaluasi_halaqah.sql`

**Files:** Create `supabase/migrations/0051_evaluasi_halaqah.sql`.

> Mirror tables carry only the fields the two flows need to display/aggregate; the user's sync API will keep them fresh. FKs between eval tables use `on delete cascade`; refs into mirror tables use the mirror PK (text ids from the source system).

- [ ] **Step 1: Write the migration**

```sql
-- 0051_evaluasi_halaqah.sql
-- Fitur "Evaluasi Halaqah": penilaian bacaan peserta per-sesi via hitungan Lahn.
-- Master data (halaqah/pengajar/peserta/batch) DIMIRROR dari API sinkron user.

begin;

-- ── Mirror master data (diisi scripts/seed-evaluasi.ts, lalu API sync) ──
create table if not exists eval_batch (
  id           text primary key,
  nama         text not null,
  aktif        boolean not null default true,
  synced_at    timestamptz not null default now()
);

create table if not exists eval_pengajar (
  id           text primary key,
  nama         text not null,
  gender       gender not null,
  whatsapp     text,
  synced_at    timestamptz not null default now()
);

create table if not exists eval_halaqah (
  id           text primary key,
  nama         text not null,               -- mis. 'A-14'
  gender       gender not null,
  mustawa      smallint,                    -- level angka (nullable; dari source)
  level        text,                        -- 'qn'|'pb' bila relevan (opsional)
  pengajar_id  text references eval_pengajar(id) on delete set null,
  batch_id     text references eval_batch(id) on delete set null,
  ambang_ujian smallint not null default 65,
  synced_at    timestamptz not null default now()
);
create index if not exists idx_eval_halaqah_pengajar on eval_halaqah(pengajar_id);
create index if not exists idx_eval_halaqah_batch on eval_halaqah(batch_id);

create table if not exists eval_peserta (
  id           text primary key,
  nama         text not null,
  gender       gender not null,
  halaqah_id   text references eval_halaqah(id) on delete cascade,
  is_ketua     boolean not null default false,
  aktif        boolean not null default true,
  urutan       integer not null default 0,  -- urutan tampil dalam halaqah
  synced_at    timestamptz not null default now()
);
create index if not exists idx_eval_peserta_halaqah on eval_peserta(halaqah_id);

-- ── Konfigurasi koordinator per gender ──
create table if not exists eval_config (
  gender         gender primary key,
  nama_qn        text not null default 'Evaluasi QN',
  nama_pb        text not null default 'Evaluasi PB',
  ujian_attempts smallint not null default 2 check (ujian_attempts between 1 and 2),
  -- jadwal[jenis] = array tanggal ISO; disimpan jsonb agar fleksibel jumlah.
  jadwal         jsonb not null default '{"qn":[],"pb":[],"ujian":[]}'::jsonb,
  updated_at     timestamptz not null default now()
);

-- ── Sesi evaluasi (satu baris per halaqah×jenis×nomor_sesi) ──
create table if not exists evaluasi_sesi (
  id           uuid primary key default gen_random_uuid(),
  halaqah_id   text not null references eval_halaqah(id) on delete cascade,
  jenis        text not null check (jenis in ('qn','pb','ujian')),
  nomor_sesi   smallint not null check (nomor_sesi between 1 and 4),
  tgl_jadwal   date,
  surat        text not null default 'Al-Baqarah',
  ayat_mulai   smallint not null default 142,
  ayat_selesai smallint not null default 157,
  ambang       smallint not null default 70,
  status       text not null default 'draft' check (status in ('draft','terkirim')),
  dibuat_oleh  text references eval_pengajar(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (halaqah_id, jenis, nomor_sesi)
);
create index if not exists idx_evaluasi_sesi_halaqah on evaluasi_sesi(halaqah_id);

-- ── Nilai per peserta per sesi ──
create table if not exists evaluasi_nilai (
  id             uuid primary key default gen_random_uuid(),
  sesi_id        uuid not null references evaluasi_sesi(id) on delete cascade,
  peserta_id     text not null references eval_peserta(id) on delete cascade,
  hadir          boolean not null default true,
  ayat_terakhir  smallint,
  jk_huruf   smallint not null default 0 check (jk_huruf   >= 0),
  jk_harakat smallint not null default 0 check (jk_harakat >= 0),
  jk_mad     smallint not null default 0 check (jk_mad     >= 0),
  jk_tasydid smallint not null default 0 check (jk_tasydid >= 0),
  kh_izhar             smallint not null default 0 check (kh_izhar             >= 0),
  kh_idgham_bighunnah  smallint not null default 0 check (kh_idgham_bighunnah  >= 0),
  kh_idgham_bilaghunnah smallint not null default 0 check (kh_idgham_bilaghunnah >= 0),
  kh_idgham_mimi       smallint not null default 0 check (kh_idgham_mimi       >= 0),
  kh_iqlab             smallint not null default 0 check (kh_iqlab             >= 0),
  kh_ikhfa_hakiki      smallint not null default 0 check (kh_ikhfa_hakiki      >= 0),
  kh_ikhfa_syafawi     smallint not null default 0 check (kh_ikhfa_syafawi     >= 0),
  skor           smallint not null default 100,  -- turunan, disimpan utk query cepat
  catatan        text,
  confirmed      boolean not null default false, -- konfirmasi lulus utk ujian
  done           boolean not null default false, -- pengajar sudah simpan
  updated_at     timestamptz not null default now(),
  unique (sesi_id, peserta_id)
);
create index if not exists idx_evaluasi_nilai_sesi on evaluasi_nilai(sesi_id);
create index if not exists idx_evaluasi_nilai_peserta on evaluasi_nilai(peserta_id);

-- trigger updated_at (fungsi set_updated_at() sudah ada di skema; buat jika belum)
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create function set_updated_at() returns trigger language plpgsql as $fn$
    begin new.updated_at = now(); return new; end $fn$;
  end if;
end $$;

drop trigger if exists trg_eval_config_updated on eval_config;
create trigger trg_eval_config_updated before update on eval_config
  for each row execute function set_updated_at();
drop trigger if exists trg_evaluasi_sesi_updated on evaluasi_sesi;
create trigger trg_evaluasi_sesi_updated before update on evaluasi_sesi
  for each row execute function set_updated_at();
drop trigger if exists trg_evaluasi_nilai_updated on evaluasi_nilai;
create trigger trg_evaluasi_nilai_updated before update on evaluasi_nilai
  for each row execute function set_updated_at();

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `npm run db -- migrate` (inspect `scripts/db.ts` for the exact subcommand; if it applies all pending migrations, just `npm run db`). Verify no error.
Expected: migration `0051` applied.

- [ ] **Step 3: Verify tables exist**

Run: `npm run db -- query "select table_name from information_schema.tables where table_name like 'eval%' or table_name like 'evaluasi%' order by 1"` (or the repo's query subcommand).
Expected: `eval_batch, eval_config, eval_halaqah, eval_pengajar, eval_peserta, evaluasi_nilai, evaluasi_sesi`.

- [ ] **Step 4: Commit** — `feat(evaluasi): migration 0051 schema + mirror tables`.

### Task 1.2: Row types in `src/types/db.ts`

**Files:** Modify `src/types/db.ts` (append near other row interfaces).

- [ ] **Step 1:** Add and export interfaces `EvalBatch, EvalPengajar, EvalHalaqah, EvalPeserta, EvalConfig, EvaluasiSesi, EvaluasiNilai` matching the columns above (use `string` for text ids, `number` for smallints, `boolean`, `string | null` for nullables, `Jenis` from `@/lib/evaluasi` for `jenis`, and a `jadwal: { qn: string[]; pb: string[]; ujian: string[] }` shape for `EvalConfig.jadwal`).
- [ ] **Step 2:** Run `npm run typecheck` → PASS.
- [ ] **Step 3:** Commit — `feat(evaluasi): row types`.

### Task 1.3: Seed script (demo data from mockup)

**Files:** Create `scripts/seed-evaluasi.ts`.

Port the mockup constants: `PESERTA` (9), `HALAQAH_LIST` (6), `HIST` (per-peserta qn/pb/ujian history), `B15_PESERTA`, `SESSION = {qn:4,pb:2,ujian:1}`, schedule dates. Insert into mirror tables + `eval_config` + create `evaluasi_sesi` rows for the current sessions + `evaluasi_nilai` for the pre-filled `work` entries (`p1|qn|4`, `p2|qn|4`, `p3|qn|4`) so the pengajar flow opens mid-session exactly like the mockup.

- [ ] **Step 1:** Write the seed using `supabaseAdmin.from('eval_*').upsert(...)`. For history, create prior `evaluasi_sesi` (qn sesi 1–3, pb sesi 1) and `evaluasi_nilai` rows whose stored `skor` equals the `HIST` values (reverse-engineer counts is unnecessary — set `skor` directly and leave counts 0 for historical rows, flag them `done:true`; the rapor chart reads `skor`). Add a header comment + `// Jalankan: npm run seed-evaluasi`.
- [ ] **Step 2:** Run `npm run seed-evaluasi`. Expected: prints inserted counts, exits 0.
- [ ] **Step 3:** Verify: query `select count(*) from evaluasi_nilai` > 0, `select nama from eval_halaqah order by nama` lists A-09..B-15.
- [ ] **Step 4:** Commit — `chore(evaluasi): seed demo data from mockup`.

---

## Phase 2 — API routes

> All routes: `export const runtime = 'nodejs'`; read session via `getSession()` + `accesses`; validate; authorize by re-querying ownership/gender; persist via `supabaseAdmin`; return `{ ok: true, ... }` or `{ error }` with status; wrap in try/catch → 500. Pattern reference: `src/app/api/penilaian-pedagogis/upsert/route.ts`.

### Task 2.1: `POST /api/evaluasi/nilai/upsert`

**Files:** Create `src/app/api/evaluasi/nilai/upsert/route.ts`.

Body: `{ sesi_id, peserta_id, hadir, ayat_terakhir, counts: LahnCounts, catatan, confirmed, done }`. Steps:
- [ ] **Step 1:** Resolve pengajar from session; `401` if not a `pengajar` role.
- [ ] **Step 2:** Load `evaluasi_sesi` by `sesi_id`; join `eval_halaqah` to check `halaqah.pengajar_id === session.pengajar_id` → `403` otherwise; `404` if sesi missing. Reject if `status === 'terkirim'` → `409 {error:'Sesi sudah dikirim'}`.
- [ ] **Step 3:** Compute `skor = scoreOf(counts).skor` server-side (never trust client). Map counts→columns via `countsToColumns`.
- [ ] **Step 4:** `upsert({ sesi_id, peserta_id, hadir, ayat_terakhir, ...columns, skor, catatan, confirmed, done, updated_at }, { onConflict: 'sesi_id,peserta_id' })`.
- [ ] **Step 5:** Return `{ ok: true, skor }`.
- [ ] **Step 6:** Manual test: `curl` with a seeded `sesi_id`/`peserta_id` (grab via query) and a session cookie; expect `{ok:true,skor:...}`. Commit.

### Task 2.2: `POST /api/evaluasi/sesi/upsert`

**Files:** Create `src/app/api/evaluasi/sesi/upsert/route.ts`.

Body: `{ halaqah_id, jenis, nomor_sesi, tgl_jadwal?, surat, ayat_mulai, ayat_selesai, ambang }`. Authorize pengajar owns `halaqah_id`. Validate `jenis ∈ JENIS`, `1 ≤ nomor_sesi ≤ 4`, `ayat_mulai ≤ ayat_selesai`. `upsert(..., { onConflict: 'halaqah_id,jenis,nomor_sesi' })` returning the row `id`. Return `{ ok:true, sesi_id }`. Commit.

### Task 2.3: `POST /api/evaluasi/kirim`

**Files:** Create `src/app/api/evaluasi/kirim/route.ts`.

Body: `{ sesi_id }`. Authorize owner pengajar. Guard: every `hadir` peserta in the halaqah must have a `done:true` `evaluasi_nilai` row → else `400 {error:'Masih ada peserta belum dinilai'}`. Set `evaluasi_sesi.status = 'terkirim'`. Return `{ ok:true }`. Commit.

### Task 2.4: `POST /api/evaluasi/config/upsert`

**Files:** Create `src/app/api/evaluasi/config/upsert/route.ts`.

Role: `koordinator`. Body: `{ nama_qn, nama_pb, ujian_attempts, jadwal }`. Scope by `session` gender (koordinator edits own gender's config). Validate `ujian_attempts ∈ {1,2}`, `jadwal` shape, ISO date strings. `upsert` on `gender` PK. Return `{ ok:true }`. Commit.

### Task 2.5: `POST /api/evaluasi/sync` (stub for user's master-data API)

**Files:** Create `src/app/api/evaluasi/sync/route.ts`.

- [ ] **Step 1:** Auth via the existing public-API key pattern (`src/lib/api-public/auth.ts`) — this endpoint is machine-to-machine, not session-based. Return `401` on bad key.
- [ ] **Step 2:** Accept `{ batch?: EvalBatch[], pengajar?: EvalPengajar[], halaqah?: EvalHalaqah[], peserta?: EvalPeserta[] }`. Validate each array's required fields.
- [ ] **Step 3:** Upsert each provided array into its mirror table by `id`, stamping `synced_at = now()`.
- [ ] **Step 4:** Return `{ ok:true, counts: { batch, pengajar, halaqah, peserta } }`.
- [ ] **Step 5:** Add a short section to `docs/API-PUBLIC.md` documenting the payload (so the user can wire their API). Commit.

> NOTE: exact source field names come from the user's API. Keep the mirror columns and map in this route; when the real API spec arrives, adjust only the field mapping here.

---

## Phase 3 — Pengajar mobile flow

> Render from `docs/design/evaluasi-halaqah/mockup.dc.html` screens `p-*`. Container: `max-width:460px; margin:0 auto` (mockup). Drop the top "Pratinjau tampilan" role switcher entirely — role comes from auth. All screens live under one `'use client'` shell that mirrors the mockup's state machine but persists via the Phase-2 APIs instead of local-only state.

### Task 3.1: RSC entry `p-home`

**Files:** Create `src/app/evaluasi/pengajar/page.tsx`.

- [ ] **Step 1:** `export const dynamic = 'force-dynamic'`. `const session = await requirePengajar()`. Load the pengajar's halaqah (`eval_halaqah where pengajar_id = session.pengajar_id`), its peserta, current sessions + existing `evaluasi_nilai`, and `eval_config` for the gender. Compute the three home cards (qn/pb/ujian) with current `nomor_sesi`, scheduled date, and progress dots (mockup `homeCards`). Load recent finished sessions for "Riwayat sesi".
- [ ] **Step 2:** Render header (avatar initials, name, halaqah meta line) + the "Mulai penilaian" cards + "Riwayat sesi" list exactly per mockup `p-home`, then mount `<EvaluasiPengajarApp initial={...} />` for the interactive sub-screens. Pass all loaded data as serializable props.
- [ ] **Step 3:** `npm run build` compiles the route. Commit.

### Task 3.2: Client shell `EvaluasiPengajarApp.tsx`

**Files:** Create `src/app/evaluasi/pengajar/EvaluasiPengajarApp.tsx` + `screens/*`.

- [ ] **Step 1:** `'use client'`. State: `{ screen, jenis, activeSession, included, activeIdx, work, raporId, waOpen }` seeded from props (mirror mockup `state`, minus `role`). `work` keyed `id|jenis|sesi` → `{ counts, catatan, ayat, done, confirmed }`, hydrated from server rows via `columnsToCounts`.
- [ ] **Step 2:** Navigation helpers (`nav`, `backHome`, …) and per-screen derived values ported from mockup `renderVals()` (`daftarItems`, `nilai`, `ringkasan`, `rapor`, tiles). Reuse `scoreOf/tierOf/initials/emptyCounts` from `@/lib/evaluasi` — do NOT re-implement.
- [ ] **Step 3:** Wire persistence: on `simpanLanjut` POST `/api/evaluasi/nilai/upsert` (set `done:true`); on note/count/ayat change debounce 800ms then POST (same pattern as `PenilaianPedagogisForm.save()`); on `kirim` POST `/api/evaluasi/kirim`. Optimistic local state + per-peserta `saving|saved|error` indicator.
- [ ] **Step 4:** Render `screens/Setup.tsx`, `Daftar.tsx`, `Nilai.tsx`, `Ringkasan.tsx`, `Rapor.tsx` conditioned on `screen`. Each is presentational, styled verbatim from the mockup (tap-tiles with `−` badge, score ring `conic-gradient`, ayat stepper, sticky footers). `Nilai.tsx` tile-tap increments a count and re-scores live.
- [ ] **Step 5:** `npm run typecheck` + `npm run build` pass. Commit per screen (5 commits) or one `feat(evaluasi): pengajar flow screens`.

### Task 3.3: Rapor chart component

**Files:** Create `src/components/evaluasi/RaporTrackChart.tsx`.

- [ ] **Step 1:** Props `{ label, history: (number|null)[], jenis }`. Call `buildTrackGeometry` (Task 0.2) and render the SVG (dashed ambang line, polyline, dots, S{n}·score labels, insight text) exactly per mockup `p-rapor` tracks.
- [ ] **Step 2:** Use in `Rapor.tsx` for the three tracks (qn/pb/ujian). Build. Commit.

---

## Phase 4 — Koordinator dashboard

> Render from mockup `k-*`. Container `max-width:1180px`. Desktop tables use `card-flat`/`k-table` classes + inline `var(--...)`.

### Task 4.1: `k-home` dashboard RSC

**Files:** Create `src/app/evaluasi/koordinator/page.tsx`.

- [ ] **Step 1:** `dynamic='force-dynamic'`; `const session = await requireKoordinator()`. Scope halaqah to `session` gender (koordinator sees own gender). Aggregate per halaqah: total peserta, selesai (done nilai in current session), rata-rata skor, bermasalah (skor < ambang), top Lahn (mode of highest-count column across peserta). Compute the 4 stat cards (halaqah binaan, peserta dinilai/total, rata-rata, perlu perhatian).
- [ ] **Step 2:** Render header + stat grid + halaqah table (Halaqah, Pengajar, Kelengkapan bar, Rata-rata, Bermasalah, Lahn terbanyak, "Ingatkan" button when incomplete) per mockup `k-home`. Each row links to `/evaluasi/koordinator/[halaqahId]`. "⚙ Pengaturan" links to `/evaluasi/koordinator/pengaturan`.
- [ ] **Step 3:** Build. Commit.

### Task 4.2: `k-halaqah` drill-down RSC

**Files:** Create `src/app/evaluasi/koordinator/[halaqahId]/page.tsx`.

- [ ] **Step 1:** `requireKoordinator()`; verify halaqah gender === session gender → else `notFound()`. Load peserta + their current-session scores, compute per-peserta tier, and Lahn distribution (% per category across the halaqah). Compose the "catatan masalah" line (bermasalah count + top Lahn).
- [ ] **Step 2:** Render peserta list (initials, name, tier, score) + distribution bars + problem note per mockup `k-halaqah`. Build. Commit.

### Task 4.3: `k-settings` config

**Files:** Create `src/app/evaluasi/koordinator/pengaturan/page.tsx` + `PengaturanForm.tsx`.

- [ ] **Step 1:** RSC loads `eval_config` for gender, passes to `'use client'` `PengaturanForm`. Form edits track names (text inputs), ujian attempts (1/2 segmented like mockup), and schedule date inputs per track/session (mockup `settings`).
- [ ] **Step 2:** Debounced POST `/api/evaluasi/config/upsert`. Build + typecheck. Commit.

---

## Phase 5 — WA recap, PDF, wiring, verification

### Task 5.1: WhatsApp recap sheet

**Files:** Create `src/components/evaluasi/WaRecapSheet.tsx`; use in `Ringkasan.tsx`.

- [ ] **Step 1:** Bottom-sheet (mockup `ringkasan.waOpen`) showing generated recap text (`waText` format from mockup: title, month, per-peserta `• nama: skor`, rata-rata). "Buka WhatsApp" opens `https://wa.me/?text=${encodeURIComponent(text)}` (or use `src/lib/whatsapp.ts` helper if it builds share links). Build. Commit.

### Task 5.2: PDF export

**Files:** Reuse `src/components/PrintButton.tsx` pattern.

- [ ] **Step 1:** Wire "Unduh PDF" buttons (rapor, ringkasan, koordinator rekap) to a print view. Follow the existing `PrintButton`/`@media print` approach used elsewhere (grep `PrintButton` usage). If existing pattern is `window.print()` on a print-styled route, add a minimal print stylesheet for the rapor card. Build. Commit.

### Task 5.3: Middleware + landing wiring

**Files:** Modify `src/middleware.ts`, `src/lib/roles.ts`.

- [ ] **Step 1:** Add `'/evaluasi'` to `PROTECTED` in `src/middleware.ts:12`.
- [ ] **Step 2:** (Optional, non-breaking) add convenience links to `/evaluasi/pengajar` and `/evaluasi/koordinator` from the pengajar/koordinator dashboards or `FeatureNav`. Do not change `ROLE_LANDING` defaults.
- [ ] **Step 3:** `npm run build`. Commit.

### Task 5.4: End-to-end verification

- [ ] **Step 1:** `npm run test-evaluasi` → all pass.
- [ ] **Step 2:** `npm run typecheck` → clean.
- [ ] **Step 3:** `npm run build` → succeeds.
- [ ] **Step 4:** Use the `run` skill: log in as a seeded pengajar → walk p-home→setup→daftar→nilai (tap tiles, watch score) →ringkasan→kirim→rapor. Log in as koordinator → dashboard → drill-down → pengaturan. Confirm data persists across reload (reads from DB).
- [ ] **Step 5:** Final commit / open PR.

---

## Design Decisions & Assumptions (confirm at review)

1. **Master data is mirrored, not FK'd into HITS/2in1 tables.** Per the user, pengajar/peserta/halaqah/batch arrive via a sync API later; this plan defines `eval_*` mirror tables + a `/api/evaluasi/sync` endpoint and seeds demo data meanwhile. When the API spec arrives, only the sync route's field mapping and the seed change.
2. **`mustawa`** stored as a nullable smallint on `eval_halaqah` (design shows "Mustawa 2"); ujian lulus threshold stored as `eval_halaqah.ambang_ujian` (default 65) rather than a global constant, so it is per-halaqah configurable.
3. **`jenis` (qn/pb/ujian)** is an evaluation-type axis independent of any HITS `hits_level`. Track *display names* for qn/pb are coordinator-editable via `eval_config`.
4. **Historical scores** for the rapor trend charts are stored as `evaluasi_nilai.skor` directly (seed sets them); per-Lahn breakdown only exists for sessions actually scored in-app.
5. **Roles reused:** `pengajar` (editor) + `koordinator` (read/config). No new runtime role, no `roles.ts` landing changes required.
6. **Gender scoping:** koordinator sees/edits only their own gender, matching the existing pedagogis convention.

---

## Self-Review notes

- Spec coverage: every mockup screen (`p-home/setup/daftar/nilai/ringkasan/rapor`, `k-home/halaqah/settings`) maps to a task (3.1–3.3, 4.1–4.3, 5.1–5.2). Scoring/tier/chart math → 0.1–0.2. Persistence → 2.1–2.5. Config → 2.4/4.3.
- Type consistency: `LahnCounts`, `scoreOf`, `countsToColumns/columnsToCounts`, `buildTrackGeometry`, `Jenis` defined in Phase 0 and referenced unchanged thereafter. Column names in migration match `LahnDef.column` values in `evaluasi.ts` — **cross-check these two lists during Task 1.1** (11 columns: `jk_huruf/harakat/mad/tasydid`, `kh_izhar/idgham_bighunnah/idgham_bilaghunnah/idgham_mimi/iqlab/ikhfa_hakiki/ikhfa_syafawi`).
- Placeholder scan: none — code shown for the load-bearing lib/migration/test; repetitive UI screens point to the in-repo mockup as the exact rendering source (not a vague "similar to").
