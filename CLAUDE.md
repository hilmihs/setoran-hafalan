# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Maahir — an internal platform (deployed at `maahir.muhajirproject.org`) for a Qur'an
education program. Started as weekly memorization submission ("setoran hafalan") with
musyrif review, and grew into a multi-module system: HITS teacher competency scoring
(Matrix Skill Guru), Evaluasi Halaqah, attendance (kehadiran), observasi, shakwa
(complaints), reports, and a read-only public API. Domain language is Indonesian —
match it when naming things and writing UI/comments.

## Commands

```bash
npm run dev          # Next dev server (localhost:3000)
npm run build        # next build + postbuild (copies static/public into .next/standalone)
npm run lint         # BROKEN — no eslint config in the repo, so `next lint` drops
                     # into an interactive setup wizard and hangs. Never put it in
                     # a verification step; `npm run typecheck` is the real gate.
npm run typecheck    # tsc --noEmit — run this after any TS change; there is no test runner
npm run apply-migration   # apply supabase/migrations/*.sql to the DB in DATABASE_URL
```

The `test-*` and `seed-*` scripts in `package.json` are standalone `tsx` scripts
(`scripts/*.ts`), **not** a test framework. Run one directly, e.g.
`npm run test-ranking`, `npm run seed`. Most load `.env.local` via `--env-file`;
a few don't (check the script entry). "Run a single test" = run that one npm script.

### `npm run db` hits PRODUCTION

`npm run db "<SQL>"` is a thin CLI over the admin HTTP endpoint (`/api/admin/db`),
targeting `ADMIN_API_URL` / `NEXT_PUBLIC_APP_URL` — **the live production app**, not
local Postgres. Writes need `--confirm` (bare run only previews `wouldAffect`). For
local dev/seed work, use a local `DATABASE_URL` + the `supabaseAdmin` client, not `npm run db`.

The endpoint (`src/app/api/admin/db/route.ts` → `runAdminSql`) gates by
`ADMIN_DB_API=on` (else 404), Bearer `ADMIN_API_TOKEN`, and every statement is audited.
READ (`SELECT`/`WITH`/`EXPLAIN`) runs in a `READ ONLY` tx capped at 1000 rows; WRITE
rolls back unless `confirm:true`. If `npm run db` dies with `fetch failed`, prod is just
slow (node `fetch` aborts connect at ~10s) — retry, or `curl --max-time 60` the same
endpoint.

## Architecture

### Postgres direct — `supabaseAdmin` is a shim, not Supabase

Despite the name, this app **no longer uses Supabase** (no PostgREST/GoTrue/Storage).
It talks straight to PostgreSQL 17 via `node-postgres` and stores audio on the local
filesystem. To avoid rewriting ~568 call-sites, `src/lib/supabase-admin.ts` exports a
`supabaseAdmin` object whose query-builder API mirrors supabase-js, implemented in
`src/lib/pg-shim.ts` (over `pg-core.ts`) and `src/lib/pg-storage.ts` (filesystem).

- Supported: `.from().select/insert/update/upsert/delete`, filters
  (`eq/neq/in/gte/lte/gt/lt/is/ilike`), `order/limit/range`, `single/maybeSingle`,
  embedded to-one joins (`alias:fk_col(cols)`), `.select()` after mutation → RETURNING.
- **Not** supported (throws clearly if used): `.rpc`, to-many embeds, `.or`,
  filtering on embedded columns.
- `supabaseAdmin` is server-only — never import it into client components.
- Audio lives at `${STORAGE_DIR}/${bucket}/...`, served via `/api/audio` with signed
  URLs derived from `SESSION_SECRET`.

Env: `DATABASE_URL`, `STORAGE_DIR`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL` (see
`.env.example`). `next.config.js` sets `output: 'standalone'` and a 60mb server-action
body limit for audio uploads.

### Auth & multi-role (`src/lib/session.ts`, `access.ts`, `roles.ts`)

Custom auth: iron-session cookie + bcrypt, no external auth service. The unit of
identity is a **WhatsApp number**, and one WA can hold several roles at once.
`loadAccessesForWa()` queries all role tables in parallel and returns every active
role; the session stores `accesses[]`. When >1 role exists the user sees a feature
selector. Roles: `peserta`, `musyrif`, `koordinator`, `koordinator_kehadiran`
(restricted), `syaikh`, `pengajar` (+ `is_ketua`), `ketua_kelas`,
`koordinator_ketua_kelas`. `ROLE_LANDING` maps each role to its landing page;
`requireRole`/`requirePengajar`/etc. guard server pages and redirect (not 500) on
mismatch. Admin can impersonate ("login as") — see `impersonator` in session +
`admin-impersonate.ts`.

**Superadmin is not a role** — it's a hardcoded WA allowlist `SUPERADMIN_WAS`
(`src/lib/constants.ts`). `requireAdmin()`/`isSuperadmin()` (`admin-guard.ts`) check
the logged-in WA against it; `getAdminActor()` attributes audit to the real admin even
mid-impersonation. **RLS** is enabled on every table (`0005_*`, legacy real-Supabase
era) but effectively bypassed — the app connects as a raw pg superuser, so access
control lives entirely in app code (guards + the api-public sanitizer). Never rely on
RLS for authorization here.

Gender separation (ikhwan/akhwat) is enforced in layers: URL routing, per-query
`gender` filters, and DB triggers.

### App structure

- `src/app/<module>/<role>/` — pages grouped by feature module then role
  (e.g. `hits/koordinator`, `evaluasi/pengajar`, `2in1/musyrif`). `2in1/` is the
  combined setoran+attendance flow; other top-level dirs are the newer modules
  (`hits`, `evaluasi`, `kehadiran`, `observasi`, `shakwa`, `matrix`, `laporan`, `admin`).
- `src/app/api/` — route handlers. Most business logic lives in `src/lib/*.ts`
  (one file per concern; `hits-*.ts`, `maahir-*.ts`, `evaluasi*.ts`, `shakwa*.ts`,
  `laporan*.ts`, `matrix-*.ts`). Keep route handlers thin, put logic in `lib`.
- `src/types/db.ts` — hand-maintained types mirroring the DB schema and session shapes.
- Path alias `@/*` → `src/*`.
- **Mutations = Server Actions** (`'use server'`, usually `actions.ts` per route dir),
  not API routes. API routes are reserved for audio serving, the public `v1` API, the
  admin SQL endpoint, health, and a few sync/setoran handlers.

### Subsystem map

Each module is `src/app/<module>/<role>/` + a cluster of `src/lib/<prefix>-*.ts`.

| Module | Purpose | Routes | Key lib |
|---|---|---|---|
| 2in1 (setoran) | Hafalan/tilawah recording + attendance | `2in1/`, `musyrif`, `syaikh`, `peserta` | `attendance.ts`, `laporan.ts`, `setoran-target.ts`, `week.ts` |
| HITS soft-skill (`hits_*`) | Halaqah, pertemuan, pengajuan, ranking, disiplin/hutang | `hits/*` | ~30 `hits-*.ts` (`hits-ranking`, `hits-rekap`, `hits-pertemuan`, `hits-pengajuan`) |
| Observasi ketua kelas | Class-monitor observation (new = `hits_keterangan_harian`) | `observasi/{ketua-kelas,koordinator}`, `hits/{ketua,koordinator}` | `hits-observasi.ts`, `hits-observasi-cakupan.ts` |
| Matrix skill guru (`matrix_*`) | Teacher-skill indicator matrix (recomputed) | `matrix/koordinator` (`?tampilan=blok\|tabel`) | `matrix-compute.ts`, `matrix-indicators.ts`, `matrix-blok*.ts` |
| Maahir (laporan/SP/pemutihan) | Reporting, warning letters (SP), attendance whitewash | `laporan`, `2in1/maahir-mandiri` | `maahir-sp.ts`, `maahir-rekap.ts`, `maahir-pemutihan*.ts` |
| Shakwa | Public complaint/izin form + koordinator dashboard | `shakwa/*` | `shakwa.ts`, `shakwa-izin.ts`, `shakwa-rekap.ts` |
| Evaluasi | Halaqah/pengajar evaluation (fed by hilmihs `eval_*`) | `evaluasi/{koordinator,pengajar}` | `evaluasi.ts`, `evaluasi-pengajar.ts`, `evaluasi-halaqah.ts`, `evaluasi-peserta.ts` |
| Ketersediaan (`ks_*`) | Teaching-availability → rolling halaqah formation → push to CMS tilawah | `ketersediaan/{pengajar,koordinator,konfirmasi/[token],undangan/[token]}` | `ketersediaan-*.ts`, `lib/tilawah/` |
| Admin | Superadmin SQL console, users, audit, api-keys | `admin/*` | `admin-db.ts`, `admin-crud*.ts`, `admin-users.ts` |

### Ketersediaan Mengajar HITS (`src/lib/ketersediaan-*.ts`, `src/lib/tilawah/`)

Rolling teacher-availability → halaqah formation → outbound write to the **CMS
tilawah** (a separate Laravel app). Design: `docs/superpowers/specs/2026-08-30-*.md`;
CMS contract: `docs/API-TILAWAH.md`.

- **Slots are stored decomposed**, not as text: `ks_slot.hari_idx` (0=Senin…6=Ahad)
  + time. Real files mix `"16.00"` with `"16:00"` and `"Jumat"` with `"Jum'at"`, so
  text comparison is unreliable. `hari_idx` deliberately matches tilawah's `int_days`.
- **Conflict detection spans three sources**: `hits_halaqah` across *all* active
  batches, `kelas_hits` (Maahir classes), and halaqah this module created —
  the last is required because new halaqah do *not* appear in `hits_halaqah`
  (that table comes from the manually-synced Google Sheet).
- **Everything roots on `ks_periode` with cascade delete**, so a trial period can be
  removed whole. (`0067` fixed two `RESTRICT` FKs that silently blocked this.)
- **Who may fill the form is a per-period list** (`ks_kelayakan`, `0085`), not the
  `pengajar` role: the official roster is much shorter than the 172 active accounts.
  Rule (`ketersediaan-kelayakan.ts`): a period with **zero** rows = everyone may fill
  (old behaviour); with rows = only `boleh=true`. Koordinator edits it per gender in
  `PanelKelayakan`; an isian from someone off the list is **deleted** (summary copied
  to `ks_log` first) and the person notified via a `wa.me` link — except an isian whose
  slots are all **offline**, which koordinator assigns anyway (the Masjid Al-Kautsar
  teachers keep teaching offline while staying out of the online roster).
- **Writing to CMS tilawah is off by default** (`ks_periode.kirim_nyata`), unlocked
  per period by superadmin. The CMS has no working delete for user accounts, so a
  wrong write cannot be undone. Outbox is per-step and idempotent.
- **CMS tilawah is a fragile contract**: no API token (Laravel session + XSRF),
  resource key spelled three ways, `POST /api/users` answers *302 yet still creates*,
  enrolment needs the full user body. All of it in `docs/API-TILAWAH.md` — read it
  before touching `lib/tilawah/`.
- **No WhatsApp gateway exists anywhere in this repo.** All notification is `wa.me`
  deep-links a human clicks. WhatsApp Cloud API has no group endpoints at all, so
  group creation is done by the teacher pasting an invite link.
- **Still hidden** behind `bolehLihatFiturTersembunyi()`. Server actions are public POST
  endpoints, so every action re-checks via `aktor()` / `jagaFiturKetersediaan()`
  (`src/lib/ketersediaan-akses.ts`) — a page guard alone is not enough.
- Registrant CSVs: only `https://docs.google.com/spreadsheets/…` links are fetched
  (`ketersediaan-csv-url.ts`, SSRF guard). Several CSVs may feed one period; one person
  (normalized WA + name) = one queue entry, older submissions become `diganti`.
- Several periods can share one form (e.g. two tahap of one batch); the coordinator
  dashboard has a virtual `?periode=gabungan` view whose capacity numbers come from
  running the allocation engine in memory (`ketersediaan-gabungan.ts`), not estimates.
- Concurrency: allocation and outbox take Postgres advisory locks and claim rows
  conditionally; `0079` adds partial unique indexes as a backstop.
- Tests: `npm run test-ketersediaan` (pure), `test-ketersediaan-impor` and
  `test-ketersediaan-koordinator` (PGlite with real migrations — add new migration
  files to their `MIGRASI` lists), `test-ketersediaan-alur` (pure flow),
  `test-ketersediaan-e2e` (dev DB), `test-tilawah-staging` (staging CMS; `KIRIM_NYATA=1` writes).
- Periodic work: `POST /api/ketersediaan/berkala` (Bearer `CRON_SECRET`) pulls
  registrants, shifts expired confirmations, ages out stale availability for **every
  active period**. It deliberately does **not** run allocation — halaqah still wait
  for a coordinator. No scheduler calls it yet.

### Matrix Skill Guru — one route, two views

`/matrix/koordinator?tampilan=blok|tabel` is the **only** matrix page (koordinator
+ syaikh). `tabel` = 14 indicators, teguran, risk, finalized status, print, XLSX
export; `blok` = ranking split by the Maahir class type the teacher *attends*
(`matrix-blok.ts`; ikhwan: Takhassus → Tahfizh → Talaqqi → lintas → tanpa kelas), with
podium and month-over-month deltas. Landing view is per role — koordinator gets
`tabel`, syaikh gets `blok`. Both views are built from the same row set, and
there is **one** detail page (`pengajar/[id]`); koordinator notes are hidden from
syaikh. `/2in1/koordinator/matrix{,/[pengajar_id]}` are redirect stubs only —
don't add features there.

**Two taxonomies, two sources.** Ikhwan blocks are *derived* from
`program_kelas_anggota`. Akhwat blocks are *stored* in `pengajar.matrix_blok`
(`0082`), order Takhashush → Koordinator → Tahfidz → Alumni/Talaqqi → Maahir 6
→ belum dikelompokkan, seeded from the koordinator's own subjective list
(`scripts/sql/0082-seed-matrix-blok-akhwat.sql`). Deriving them was tried and
does not work: akhwat class names mix "Halaqah Pagi/Siang" with "Talaqqi" so
Tahfidz can't be told apart from Alumni/Talaqqi, and Takhashush/Koordinator have
no class at all. `getBlokMatrix()` is the single entry point for both; NULL =
"Belum dikelompokkan", and ~16 active akhwat accounts sit there on purpose
(absent from the list). Changing someone's block is an UPDATE on that column —
there is no UI for it yet.

### Public read-only API (`/api/v1/[...path]`)

Registry-driven, outbound read-only (`GET` only), server-to-server (no CORS).
`src/lib/api-public/registry.ts` declares each entity (table, columns, filters, scope
`maahir`|`hits`). Bearer key auth (`k_live_...`), per-key scopes, rate/burst limits,
and TTL cache all live in `api-public/`. A `FORBIDDEN_COLUMNS` allowlist audit runs at
module load and throws if any entity exposes secrets (WA numbers, hashes, tokens,
audio URLs, free-text notes) — when adding an entity/column, respect this. Docs:
`docs/API-PUBLIC.md`.

Usage tracking has two layers: `api_client.request_count`/`last_used_at` (per key)
and `api_pemakaian_endpoint` (`0081`) — one row per key + endpoint + day, accrued in
memory and flushed with `flushUsage()` every 60s, shown on `/admin/api-keys`.
Rejected calls (missing scope, unknown entity, bad params) are counted in
`jumlah_gagal`. Query params are deliberately NOT stored (they carry person ids).

### HITS Google Sheets sync (`src/lib/hits-sync.ts`, `hits-sheets.ts`)

HITS halaqah/kaldik/peserta data is pulled from **published-to-web Google Sheets** as
CSV (`/export?format=csv&gid=`, no service account). `syncBatch(batchId)` upserts into
`hits_*` tables — **sheet = source of truth**, keyed by stable name; rows absent from
the sheet get `active=false`. Runs **manually per-batch** from
`/hits/koordinator/validasi` (there is no all-batch cron; the daily systemd timer is
hilmihs/evaluasi, not this). `source='manual'` rows are immune to reconciliation;
curated columns (`level`, `pengajar_*`, `is_ketua`, `ketua_wa`) are never overwritten —
but **`active` IS overwritten**.

- **There is no `status`/`selesai` column on `hits_halaqah`.** "Berjalan vs selesai" =
  the `active` bool. Koordinator coverage (`hits-observasi-cakupan.ts`) only counts
  `active=true` halaqah with a `pengajar_id`, scoped per month.
- **Gotcha:** setting a halaqah `active=false` manually **reverts to `true` on the next
  sync of its batch** if it still appears in the sheet. To retire a halaqah durably,
  also remove/deactivate it from the sheet (or its `hits_sheet_source`).

### hilmihs sync (`src/lib/hilmihs/`)

Pulls master data from the separate `hilmihs.web.id` agent API (a **different** API —
Bearer `AGENT_TOKEN`, docs `docs/API_hilmihswebid.md`) into local mirror tables
(`eval_*`) that drive Evaluasi Halaqah. Triggered by `/api/evaluasi/sync/pull`
(protected by `CRON_SECRET`, called from a VPS systemd timer) → `apply`. Pengajar are
matched to eval halaqah by WA number, not maahir id.

**Never edit a mirrored column in place.** `COMPARE` (`sync.ts`) lists the columns that
decide "changed upstream" — for halaqah `nama, gender, level, pengajar_id, batch_id`, for
peserta `nama, gender, halaqah_id, urutan`. Writing to one locally makes the next pull
stage an `update` that reverts it. Local corrections go in dedicated `*_override` columns
(`0068`: `eval_halaqah.nama_override/level_override`, `eval_peserta.nama_override`), which
sync never reads or writes; the app displays `override ?? base` via `evaluasi-halaqah.ts` /
`evaluasi-peserta.ts`. Rows the app invents get an id prefix instead (`manual:` peserta),
which `diff.ts` skips when staging deactivations.

### Deploy (Azure Pipelines → self-hosted VPS)

`azure-pipelines.yml` builds on `main`, ships env + build to the VPS over SSH/SCP, and
runs under systemd unit `next-maahir.service`. Runtime env comes from an Azure Variable
Group (prefix `ENV_`) written to `maahir.env` and wired in via a systemd
`EnvironmentFile` drop-in. **Gotcha:** Azure *secret* variables don't appear in
`printenv` unless explicitly mapped into the task `env:` — a new secret var must be
added there too, or the app boots without it. Manual server setup: `HANDOFF.md`.

### Migrations

`supabase/migrations/NNNN_*.sql`, sequential. Apply one file with
`npm run apply-migration -- supabase/migrations/NNNN_name.sql` (runs against
`DATABASE_URL`; for prod, feed the SQL through `npm run db --confirm` instead —
strip the file's own `begin;`/`commit;` since the admin endpoint wraps its own tx).
Schema-touching changes need a new migration file **and** matching updates to
`src/types/db.ts`.

**Gotcha — number collisions:** parallel feature branches have already produced
duplicate prefixes (two `0052_*` exist: `evaluasi_sesi_dihapus` + `evaluasi_sync`).
Apply order among same-numbered files isn't guaranteed, so never rely on it — and
`ls supabase/migrations/ | tail -1` before picking the next number — and check
unmerged branches too. It has already bitten twice on this branch: `0069` and
`0070` were both taken by `main` while Ketersediaan was in flight. Ketersediaan owns `0063`–`0067`, `0071`, `0072`; `0069` `program_kelas_anggota`;
`0070` setoran target; `0073`–`0075` evaluasi; `0076` check-in Maahir;
`0077`–`0079` ketersediaan; `0080` ujian 2in1; `0081` api pemakaian;
`0082` matrix blok akhwat; `0083` program_kelas.ikut_tibyan; `0085` ketersediaan
kelayakan (next free: `0086` — note `scripts/sql/0084-*.sh` is a data fix, not a
migration).

unmerged branches too. Ketersediaan (`docs/ketersediaan-mengajar-hits`) holds
`0063`–`0067`, `0071`, `0072` — applied to prod but not yet on `main`.

**Gotcha — DDL applied straight to prod:** some columns exist in production with
no migration file at all, because they were added through `/api/admin/db`. A
fresh local DB is therefore *not* equivalent to prod — `program_kelas_anggota`
was missing `active`/`mulai_tanggal`/`selesai_tanggal` until `0069` backfilled
the file. When a feature works in prod but dies locally, diff
`information_schema.columns` before debugging the code.
