# Maahir / HITS — Technical Handover

> **Audience:** an engineer/team taking over maintenance & operations of this app with no prior context.
> **Last updated:** 2026-08-12. Generated from the codebase (`db-migration/schema.sql`, `src/app`, `src/lib`, `scripts`, `azure-pipelines.yml`). If schema/routes change, regenerate.

The app is a **Quran hafalan & tahsin management system** for the Muhajir Project, covering two program families:
- **2in1 / Maahir** — santri (`peserta`) submit weekly recitation recordings (`setoran`), checked by `musyrif` then `syaikh`; class attendance (`program_kelas` / presensi) tracked by ketua kelas.
- **HITS** — a batch-native soft-skill/discipline tracking system for tahsin teachers (`pengajar`) organized into study circles (`halaqah`), rolling up into a monthly **Matrix Skill Guru** scorecard.

Stack: **Next.js (App Router, standalone output)** + **PostgreSQL** (accessed through a supabase-js-compatible shim) + filesystem audio storage. Deployed to a **single VPS** via **Azure Pipelines**. Auth = iron-session cookie, identity by WhatsApp number.

---

## Table of Contents
1. [Quickstart for a new maintainer](#quickstart-for-a-new-maintainer)
2. [Ops, Infra & Data Sources](#ops-infra--data-sources)
3. [Application Modules, Routes & Roles](#application-modules-routes--roles)
4. [Data Model](#data-model)
5. [HTTP API Endpoints](#http-api-endpoints)

---

## Quickstart for a new maintainer

1. **Read this doc top-to-bottom once.** The system has a lot of legacy/retired tables — Section 4 flags what is dead vs. authoritative.
2. **You cannot SSH to prod and there is no auto DB migration.** Your only prod DB access from a laptop is the **admin SQL API** — `npm run db "<SQL>"` (read) / `npm run db -- --confirm "<SQL>"` (write). See [Database Access](#database-access) and [Admin SQL API](#admin-sql-api-apiadmindb). ⚠️ note the `--` before `--confirm` when using `npm run`, or npm swallows the flag and you get a dry-run preview.
3. **Deploy = push to git remote `maheer`** (`github.com/Muhajir-Project-Dev/maheer`), which triggers Azure Pipelines → VPS. The pipeline runs no migrations, so **apply any schema change to prod first** (via the admin SQL API) before deploying code that depends on it.
4. **Local `.env.local` has no `DATABASE_URL`** → scripts that use `supabaseAdmin` directly hit an empty local DB, NOT prod. To touch prod data from a script, route through the admin API (see `scripts/db.ts`, `scripts/seed-kaldik-juli-admin.ts` as the pattern).
5. **The DB restore bundle** lives in `maahir-db-handoff/` + `maahir-db-handoff.tar.gz` (schema + full dump + Supabase export) — that's what you hand to whoever stands up a fresh Postgres.
6. **Two roles you'll hear about constantly:** `koordinator` (2in1 side) and `koordinator_ketua_kelas` (HITS side) — different people, different consoles.

---

<!-- ============================================================ -->

## Ops, Infra & Data Sources

### Hosting & Deploy

- **Hosting**: single VPS (`103.181.142.223`), app served by systemd unit `next-maahir`, reverse-proxied by nginx. App root on server: `/var/www/html/maahir`. Audio files stored under `/var/www/html/maahir/storage/setoran-audio` (filesystem, not object storage).
- **CI/CD**: Azure Pipelines (`azure-pipelines.yml`), triggered on push/PR to branch `main`. Per project memory, prod deploys are driven by pushing to git remote `maheer` (GitHub `Muhajir-Project-Dev/maheer`) — the remote/webhook wiring lives in Azure DevOps project settings, not in this repo. Variable group `Maahir-Prod`, prefix `ENV_`.
- **Deploy steps** (all via `Ssh@0`/`CopyFilesOverSSH@0` running **on the Azure agent**, connecting out to the VPS — there is **no SSH from a developer machine**):
  1. Export `ENV_*` from the Azure variable group to `env_vars.sh`, SCP to server.
  2. Ensure nginx `client_max_body_size 64m` (for ~14MB audio uploads).
  3. Ensure `storage/setoran-audio` exists, `chmod -R 0777` (behind app-level HMAC auth, not directly exposed).
  4. `git fetch origin main && git reset --hard origin/main` in `/var/www/html/maahir`, then `nvm exec 24.15.0 npm install` and `npm run build`.
  5. Copy `.next/static` into `.next/standalone/.next/`, `sudo systemctl restart next-maahir` (~2s downtime).
- **Node**: pinned only via `nvm exec 24.15.0` in the pipeline (no `engines` in `package.json`).
- **Next.js build**: `next.config.js` sets `output: 'standalone'`, `experimental.serverActions.bodySizeLimit: '60mb'` (3× ~15-min opus audio uploads).
- **`postbuild`**: copies static/public into the standalone output; `mkdir -p` fallback because `public/` can be an empty untracked dir.
- **No DB migration step**: verified — `azure-pipelines.yml` has no `DATABASE_URL`/`migrate`/`psql`/schema-apply. **Apply schema changes to prod manually (admin SQL API) before deploying dependent code.**

### Database Access

- Plain PostgreSQL, not hosted Supabase (migrated off Supabase due to quota, Jul 2026 — memory `supabase-migration-2026-07.md`).
- **Shim architecture** (`pg-core.ts` → `pg-shim.ts` → `supabase-admin.ts`):
  - `pg-core.ts`: owns the `pg.Pool` (`getPool()`, requires `DATABASE_URL`), sets type parsers so date/timestamp/numeric/int8 return in supabase-js/PostgREST JSON shapes; loads FK + column-type metadata for embedded joins.
  - `pg-shim.ts`: reimplements the supabase-js query builder (`.from().select().eq()...insert/update/upsert/delete`, to-one joins, `.single()/.maybeSingle()`) as parameterized SQL — so ~568 existing call-sites didn't change.
  - `supabase-admin.ts`: exports `supabaseAdmin` + `.storage`; storage is **filesystem** (`pg-storage.ts`) at `${STORAGE_DIR}/${bucket}/${path}`; "signed URLs" are `/api/audio/<bucket>/<path>?exp=...&sig=...` (HMAC-SHA256 with `SESSION_SECRET`).
- **Local machines have no path to prod DB**: `.env.local` has no `DATABASE_URL`; any script importing `supabaseAdmin` directly hits nothing/a local DB, never prod.
- **Only prod read/write path from a laptop**: the admin SQL HTTP API (gated `ADMIN_DB_API=on` + `ADMIN_API_TOKEN`), via `scripts/db.ts` = `npm run db "<SQL>"` (browser/script → deployed app → Postgres, no SSH). Writes default to dry-run preview (`wouldAffect`); `--confirm`/`-y` to commit, `--allow-nontx` for VACUUM etc. Scripts suffixed `*-admin.ts` route through this API for the same reason.

### Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string — required by `pg-core.ts`; **absent in local `.env.local`**. |
| `PG_POOL_MAX` | Optional pool size (default 10; 1 for PGlite tests). |
| `PG_TEST_PORT` | Port for local PGlite wire test server. |
| `STORAGE_DIR` | Filesystem root for audio (default `<cwd>/storage`). |
| `SESSION_SECRET` | HMAC key for signed audio URLs + iron-session cookies. |
| `SUPABASE_AUDIO_BUCKET` | Bucket/subfolder for setoran audio (default `setoran-audio`; legacy name). |
| `NEXT_PUBLIC_SUPABASE_URL` | Legacy Supabase URL — only read by old one-off scripts (`add-superadmin.ts`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy Supabase key — same legacy-script use. |
| `NEXT_PUBLIC_APP_URL` | Public base URL; fallback base for `scripts/db.ts`. |
| `ADMIN_API_URL` | Base URL the admin CLI targets (falls back to `NEXT_PUBLIC_APP_URL`). |
| `ADMIN_API_TOKEN` | Bearer token for `/api/admin/db`; must match server value. |
| `ADMIN_DB_API` | Master on/off for `/api/admin/db` — must literally equal `"on"`. |
| `MAINTENANCE_MODE` / `MAINTENANCE_BYPASS_TOKEN` / `MAINTENANCE_MESSAGE` / `MAINTENANCE_START` | Site-wide maintenance lock (`maintenance.ts`; memory `maintenance-mode-control.md`). |
| `KAJIAN_DRY_RUN` | `1` → run `import-kajian-adab.ts` without writing. |
| `CONFIRM_DELETE` | Guard for `delete-audio.ts` (destructive bulk storage delete). |
| `OPS_SECRET` | Present in `.env.local` but no code reference found — likely legacy/reserved. |
| `NODE_ENV` | Standard. |

### External Data Sources

- **HITS live data** (`HITS_full.json`, `HITS_jadwal.csv`, `HITS_peserta.csv`, `Jadwal_HITS_Safar_ABK_NurulIman.md` at repo root): a **manual, one-time extract** from `tilawah.muhajirproject.org` (live API), **2026-07-19** (per the markdown header). **No committed fetch/scrape script exists** (grep-confirmed) — pulled out-of-band and dropped in as static files. Any refresh needs a new manual extract or a script to be written. ⚠️ This is the "API mapping" gap: the source→schema mapping currently lives only implicitly in `HITS_full.json`'s shape + the `seed-*kaldik*` scripts (`jadwal[].date` → `hits_kaldik_hari`; halaqah matched by **name** → `batch_id`/`level` from DB).
- **Excel/PDF sources** (`docs/`): attendance/grading workbooks (`Presensi-Penilaian HITS *.xlsx`, `Observasi HITS *.xlsx`), roster/level-change PDFs (`DAFTAR PESERTA BARU *`, `DAFTAR PERPINDAHAN *`, `DAFTAR PERUBAHAN LEVEL *`), teacher-name workbook, slide decks, and a Supabase-era dump (`docs/dump-maahir-202607141600.sql`). Consumed by the `import-*`/`seed-*` scripts.

### Scripts Reference

Run via `npx tsx --env-file=.env.local scripts/<name>.ts` (or the `npm run <alias>`).

**DB/ops (admin channel, no SSH)**
| Script | Purpose |
|---|---|
| `db.ts` (`npm run db`) | Thin CLI over `/api/admin/db` — only prod read/write path from a laptop. Preview by default; `--confirm` commits, `--allow-nontx` for non-tx SQL. |
| `seed-kaldik-juli-admin.ts` | Seeds `hits_kaldik_hari` (July 2026) via admin API (local env has no `DATABASE_URL`). |
| `recompute-matrix.ts` | Recomputes `matrix_rekap` for month(s) using `computeMatrixForMonth`. |
| `diag-hits-cadence.ts` | Read-only: jadwal cadence per batch + kaldik status. |

**Import-*** (external docs → DB)
| Script | Purpose |
|---|---|
| `import-hits-docs.ts` | Halaqah roster + peserta from `docs/` xlsx/PDF. |
| `import-hits-kaldik.ts` | HITS academic calendar → `hits_kaldik_hari`. |
| `import-hits-observasi.ts` | Backfill historical HITS observasi → `hits_keterangan_harian` + ketua kelas. |
| `import-kajian-adab.ts` | One-time Kajian Adab (Akhwat) attendance xlsx → `hits_kajian_presensi` (`KAJIAN_DRY_RUN=1`). |

**Seed-*** (populate)
| Script | Purpose |
|---|---|
| `seed.ts` | Generic dev dummy data. |
| `seed-maahir.ts` / `seed-itsnain.ts` / `seed-koordinator.ts` / `seed-syaikh.ts` / `seed-peserta-password.ts` | Wrappers; logic in `src/lib/seeds/*`. |
| `seed-hits-demo.ts` / `seed-hits-demo-flow.ts` | HITS demo data / full-flow demo batch. |
| `seed-hits-kaldik-juli.ts` | `hits_kaldik_hari` July 2026 from `HITS_full.json` (dry-run default; needs `DATABASE_URL`). |
| `seed-hits-presensi.ts` | Halaqah + peserta from uploaded presensi xlsx. |
| `seed-matrix-mei2026.ts` | Historical May 2026 Matrix → `matrix_rekap`. |
| `seed-program-kelas.ts` | Maahir program kelas + anggota, matched by WA. |

**Test-*** (mostly pure-logic, offline)
| Script | Purpose |
|---|---|
| `test-hutang.ts` / `test-tabayyun.ts` / `test-kajian.ts` / `test-ranking.ts` / `test-derive-pertemuan.ts` | Pure-function tests (debt minutes, tabayyun FSM, kajian, ranking, pertemuan derivation). |
| `test-hits-pengajuan.ts` | HITS pengajuan inbox data layer vs. real DB. |
| `test-pg-shim.ts` / `test-shim-runtime.ts` / `test-restore-pglite.ts` / `pg-serve-test.ts` | Validate the supabase→pg shim & restore via PGlite (WASM Postgres). |

**One-off / cleanup**
| Script | Purpose |
|---|---|
| `add-superadmin.ts` | Creates a hardcoded superadmin (legacy `@supabase/supabase-js` path; hardcoded creds in file). |
| `cleanup-audio.ts` | Deletes `audio_url` once `checked_at` > 2 weeks old. |
| `cleanup-legacy-observasi.ts` | Retires legacy/demo observasi after unifying onto HITS. |
| `delete-audio.ts` | **Permanently deletes all audio** in the Supabase bucket (Supabase exit); gated `CONFIRM_DELETE`. |
| `export-supabase.ts` | Full data+storage export from the (then-live) Supabase project. |
| `generate-sql-dump.ts` | Portable full-restore SQL → `db-migration/maahir_full_dump.sql`. |
| `upload-storage.ts` | Uploads exported audio to a destination bucket. |
| `link-hits-pengajar-wa.ts` | Links/provisions HITS pengajar accounts by WA (`pengajar_id` null). |
| `reset-setoran.ts` / `reset-testing.ts` | Reset setoran data / wipe a testing session's setoran+audio. |
| `set-password.ts` | Set musyrif/koordinator passwords. |

### Existing Handover Artifacts

- **`maahir-db-handoff/`** (+ duplicate `maahir-db-handoff (2)/`): `_backup_supabase/` (full Supabase data+storage export from `export-supabase.ts`) and `db-migration/` (`00_roles.sql`, `schema.sql` ~90KB, `maahir_full_dump.sql` ~6.7MB from `generate-sql-dump.ts`, restore `README.md`). A working `db-migration/` also sits loose at repo root with `docker-compose.yml` + `load-data.ts` (`npm run load-data`).
- **`maahir-db-handoff.tar.gz`** (~3.0MB): compressed bundle of the above — the portable artifact for whoever restores the DB elsewhere.
- **`docs/dump-maahir-202607141600.sql`**: point-in-time raw Postgres dump from 2026-07-14.

---

<!-- ============================================================ -->

## Application Modules, Routes & Roles

### Auth & Roles

**Session** — `src/lib/session.ts`. `iron-session`, cookie `maahir-hits-session`, encrypted with `SESSION_SECRET` (≥32 chars, throws at import if missing). `httpOnly`, `sameSite: lax`, 10-year `maxAge`. Payload (`IronSessionData`): `session?` (active role), `accesses?[]` (all roles this WA is entitled to — one person can be e.g. both `pengajar` and `koordinator_ketua_kelas`), `impersonator?` (superadmin "login as").

**Login** — `src/lib/auth.ts` (`login` action from `src/app/page.tsx`). Identity = WhatsApp number (`normalizeWhatsApp`), credential = bcrypt (cost 12). Queries all 7 role tables by `whatsapp_number` in parallel; **any single matching password unlocks every active row for that WA** across tables, then re-syncs the hash into all of them (legacy account-merge quirk, not per-role passwords). **Initial/reset password = last 6 digits of the WA number** (`.slice(-6)`). `changePassword` updates all linked rows at once.

**Roles** (`RoleAccess` in `src/types/db.ts`):
| role | id field | notes |
|---|---|---|
| `peserta` | `peserta_id` | `kelas_id` |
| `musyrif` | `musyrif_id` | checks peserta setoran |
| `koordinator` | `koordinator_id` | 2in1 coordinator |
| `koordinator_kehadiran` | `koordinator_id` | restricted koordinator (`kehadiran_only=true`) — only `/2in1/koordinator/kehadiran` |
| `syaikh` | `syaikh_id` | checks musyrif setoran |
| `pengajar` | `pengajar_id` | `kelompok_id`, `is_ketua` (ketua kelompok) |
| `ketua_kelas` | `ketua_kelas_id` | HITS halaqah leader; `kelas_hits_id`/`hits_halaqah_id` |
| `koordinator_ketua_kelas` | `koordinator_kk_id` | HITS-side coordinator (distinct from 2in1 `koordinator`) |

Landing per role (`src/lib/roles.ts` `ROLE_LANDING`): peserta→`/2in1/peserta`, musyrif→`/2in1/musyrif`, koordinator→`/2in1/koordinator`, koordinator_kehadiran→`/2in1/koordinator/kehadiran`, syaikh→`/2in1/syaikh`, pengajar→`/kehadiran/pengajar`, ketua_kelas→`/hits/ketua`, koordinator_ketua_kelas→`/observasi/koordinator`.

**Superadmin** — separate from the role model: `src/lib/admin-guard.ts` (`requireAdmin`, `isSuperadmin`) checks WA against `ADMIN_WA`/`SUPERADMIN_WAS` (`src/lib/constants.ts`). Gates `/admin/*`.

**Guards** (`src/lib/session.ts`): `requireRole<T>(role)` factory → `requirePeserta`/`requireMusyrif`/`requireKoordinator`/`requireSyaikh`/`requirePengajar`/`requireKetuaKelas`/`requireKoordinatorKetuaKelas`; `requireKetuaKelompok()` (pengajar + `is_ketua`); `requireOneOfRoles(roles[])`; `getActiveSession()`/`getAllAccesses()`. On mismatch → redirect to own `ROLE_LANDING` or `/?next=<path>`.

**WA-based membership** — `src/lib/program-kelas.ts` (a Maahir "ketua kelas" can be any role type, so it's matched by WA, not a role table): `getSessionWa()`, `findKetuaProgramKelas(wa)` (ketua/wakil where `self_attendance=false`), `findKetuaWakilKelas(wa)` (incl. self_attendance, for libur requests), `getSelfAttendanceKelas`/`findSelfAttendanceMembership`.

**Route gate** — `src/middleware.ts`: checks only *cookie presence* (not role) for prefixes `/hits /observasi /matrix /kehadiran /2in1 /penilaian /laporan /audit /akun /peserta` → redirect `/?next=` if absent. Role correctness is enforced inside each page/action. Runs `maintenanceGate` first (applies even to `/api/*`). `/admin/*` is self-gated by `requireAdmin()`, not in the middleware list.

### Modules by Area

**HITS (soft-skill / halaqah tracking, batch-native)**
- `hits/ketua` — halaqah leader daily dashboard: fills `hits_keterangan_harian`; `hits/ketua/koreksi` requests corrections.
- `hits/koordinator` (`requireKoordinatorKetuaKelas`) — HITS coordinator console: `ketua-kelas`, `pengajuan` (incoming pindah/hapus/koreksi/dual requests), `pertemuan`, `validasi`, `halaqah` (+`[id]`), `koreksi/[token]`.
- `hits/ketua-dual/[token]`, `hits/hapus-pertemuan/[token]`, `hits/pindah-halaqah/[token]` — tokenized WA-link approval flows for the 4 `PengajuanJenis`.
- `isi` — short link → redirects to `/hits/ketua` (WA templates).

**2in1 / Maahir** (program_kelas attendance + assessment)
- `2in1/peserta` — setoran + assessment history.
- `2in1/musyrif` (+ `login`/`setor`/`cek`/`cek/[id]`) — submit/review setoran.
- `2in1/syaikh` (+ `login`/`cek`/`cek/[id]`/`penilaian`) — review/score setoran.
- `2in1/koordinator` (`requireKoordinator`) — `pedagogis`, `penilaian`/`penilaian-ketua`, `matrix`, `kehadiran` (also reachable by `koordinator_kehadiran`), `libur`, `admin`.
- `2in1/ketua-kelas` — WA-matched ketua/wakil: `presensi` (mandatory wizard, blocks home until caught up), `pertemuan` (+`new`/`[id]`), `rekap`, `libur`.
- `2in1/maahir-mandiri` (+`riwayat`) — self-attendance classes.
- `2in1/libur/[token]` — tokenized holiday approval. `2in1/laporan/maahir` — attendance report xlsx.

**Shared / cross-cutting**
- `akun` — change password (any role). `lupa-password` — WA reset request to `ADMIN_WA` → approved via `admin/reset-password`.
- `audit` (+`[role]`) — per-role activity log (vs. superadmin `admin/audit`).
- `admin` (`requireAdmin`, superadmin) — `users` (+`person`/`[role]`, mgmt/impersonation), `reset-password`, `audit`, `db` (raw SQL runner).
- `kehadiran/pengajar` — real `pengajar` landing (check in/out); `kehadiran/ketua-kelompok` → redirects to pedagogical scoring.
- `observasi/koordinator` (`requireKoordinatorKetuaKelas`, +`kajian`); `observasi/ketua-kelas` **retired** → redirects `/hits/ketua`.
- `shakwa` — **public** complaint/service form (no login; the only unprotected app route besides `/`). Categories `izin` & `tali_kasih` require a `pengajar` session, enforced server-side in the action. `shakwa/koordinator` (`requireKoordinator`) — inbox, daily recap, follow-up status.
- `matrix/koordinator` (+`pengajar/[id]`) — Matrix Skill Guru dashboard.
- `penilaian` (top-level) — legacy Masyaikh scoring, superseded by `2in1/syaikh/penilaian`.
- `laporan`/`koordinator`/`musyrif`/`syaikh`/`peserta` (top-level) — thin legacy redirect shims to `2in1/*`. `ikhwan`/`akhwat` — dead redirects to `/`.

### Key Domain Concepts

**HITS** — *Halaqah* (study circle: gender, weekly schedule, level). *Batch* (cohort; `batch.ts` `getCurrentPekan`, weeks 1–2 = ketua election). *Kaldik* (academic calendar per level → `hits_kaldik_hari`: date↔pekan↔`is_libur`). *Pertemuan derivation* (`hits-pertemuan.ts`): `pertemuan_no = sesiPerPekan*(pekan-1)+slot`, `sesiPerPekan` = scheduled days/week (backward-compatible with the old 2-day formula, extended to 1-day/week halaqah). *Pengajuan* (`hits-pengajuan.ts`): 4 request kinds `pindah`/`hapus`/`koreksi`/`dual`, each a tokenized WA approval link. *Tabayyun* (`hits-tabayyun.ts`): "explain yourself" FSM when a session is missed (`not_reminded`→`awaiting_within`→`ghosting` after 72h→`has_reason`/`decided`). *KBBS* = good condition (discipline denominator).

**2in1 / Maahir** — *program_kelas* (gender, jadwal_hari, ketua_wa/wakil_wa by WA, `self_attendance`, `presensi_sifat` harian/mingguan). *Presensi wajib ketua kelas* — must fill attendance for every scheduled day since `PRESENSI_ANCHOR` (`2026-06-01`); unfilled days block the home page (`maahir-presensi.ts`). *At-Tibyan* — Saturday kajian (08:30–10:00 fixed), rekap `tibyan-rekap.ts` (80% target). *Libur* — holiday ranges (`maahir-libur.ts`), global or per-class, excluded from expected attendance; tokenized approval.

**Observasi / Penilaian / Matrix** — *Observasi* legacy (`kelas_hits`/`observasi_kelas`), retired in favor of HITS. *Penilaian* — syaikh score pengajar bacaan/hafalan (rubric `penilaian-rubrik.ts`, 0–4) + ketua-kelompok 4-aspect `penilaian_pedagogis`. *Matrix (Matrix Skill Guru)* — composite 15-indicator monthly scorecard per pengajar (`matrix-compute.ts`, idempotent upsert `matrix_rekap`), linking pengajar↔peserta by WA; hard skill (maahir+tibyan attendance, bacaan/hafalan/tajwid from recordings), pedagogis (4 aspects), soft skill (%KBBS, %latihan, SOP, jadwal commitment). `risk.ts` derives per-pengajar RiskLevel.

---

<!-- ============================================================ -->

## Data Model

Source of truth: `db-migration/schema.sql` (59 `create table`; 1 (`koordinator_hits`) later dropped → **58 live tables**) + 15 enums. TS mirror: `src/types/db.ts`.

### Enums (15)

| Enum | Values |
|---|---|
| `gender` | ikhwan, akhwat |
| `status_setoran` | draft, submitted, checked |
| `jenis_rekaman` | tuhfatul_athfal, jazariyyah, syawahid |
| `nilai_rekaman` | hijau, kuning, merah |
| `kondisi_kelas` | KBBS, KMT, JKG, KBLA, LIBUR |
| `status_latihan` | TAL, PTML, SML |
| `status_checkin` | hadir, izin, sakit |
| `jenis_alasan` | terlambat, alpa |
| `status_pengajuan` | pending, accepted, rejected |
| `status_tabayyun` | pending, awaiting_reason, decided |
| `hits_level` | qoidah_nuroniyyah, perbaikan_bacaan |
| `hits_kondisi` | KBBS, KMT, JKG, KBLA, LIBUR |
| `hits_status_latihan` | TAL, PTML, SML |
| `hits_source` | sheet, manual |
| `hits_status_tabayyun` | pending, awaiting_reason, decided |

The non-prefixed `kondisi_kelas`/`status_latihan`/`status_tabayyun` back the **older** `kelas_hits`/`observasi_kelas` flow; the `hits_*` versions back the **newer** batch-native subsystem (migration 0022+) which is now authoritative for the Matrix. `hits_tabayyun.kondisi` was relaxed enum→`text` (0036) for BADAL/TIDAK_LATIHAN.

### Auth / Users & Roles (14)

| Table | Purpose | Key columns / FKs |
|---|---|---|
| `musyrif` | 2in1 pengajar who checks peserta `setoran` | `id` PK; `gender`; `whatsapp_number`; `password_hash`; `active` |
| `koordinator` | 2in1 coordinator, gender-scoped | `id`; `whatsapp_number`; `password_hash`; `active` |
| `syaikh` | Top assessor (Syaikh/Ustadzah); checks `setoran_musyrif` | `id`; `gender`; ≤1 active/gender |
| `kelas` | 2in1 kelompok, 1 musyrif/kelas | `id`; `name`+`gender` unique; `musyrif_id`; `ketua_peserta_id`/`wakil_ketua_peserta_id`; `jadwal_hari[]` |
| `peserta` | Santri submitting hafalan | `id`; `gender`; `kelas_id`; `whatsapp_number`; `password_hash`; `active` |
| `kelompok_pengajar` | Grouping of HITS pengajar | `id`; `gender` |
| `pengajar` | HITS guru being assessed; `is_ketua`=ketua kelompok | `id`; `kelompok_id`; `musyrif_id` (cross-link); `is_ketua`; `matrix_exclude`; `active` |
| `koordinator_hits` | **DROPPED** (0023) — vestigial, never had a login | dropped `cascade` |
| `kelas_hits` | Legacy HITS kelas; superseded by `hits_halaqah`, retained | `id`; `gender`; `pengajar_id` |
| `ketua_kelas` | Ketua kelas login shell (legacy `kelas_hits` + new `hits_halaqah`) | `id`; `kelas_hits_id` (legacy); `hits_halaqah_id`/`hits_halaqah_peserta_id`; `batch_id`; `magic_token`; `password_hash` nullable |
| `koordinator_ketua_kelas` | Koordinator over ketua kelas (1/gender); central HITS approver | `id`; `gender`; `link_grup_wa` |
| `batch_config` | Batch config for ketua-kelas election weeks | `id`; `start_date` |
| `password_reset_requests` | Admin-mediated password reset (WA approve/decline) | `id`; `whatsapp_number`; `status`; `new_password_plaintext`+24h TTL |
| `session_log` | Login/logout history across role tables | `id`; `actor_role`+`actor_id`; `login_at`/`logout_at` |

### 2in1 / Maahir Program — attendance (10)

| Table | Purpose | Key columns / FKs |
|---|---|---|
| `program_kelas` | Maahir class; ketua by WA not FK | `id`; `name` unique; `gender`; `ketua_wa`/`wakil_wa`; `self_attendance`; `presensi_sifat` |
| `program_kelas_anggota` | Member; may link to `peserta` | `id`; `program_kelas_id`; `peserta_id` (nullable); `is_ketua`/`is_wakil` |
| `program_kelas_libur` | Holiday range per class (null id = all) | `id`; `program_kelas_id` (nullable); `tanggal_mulai`/`tanggal_selesai` |
| `program_kelas_libur_request` | Ketua-submitted holiday request, magic-link approved | `id`; `program_kelas_id`; `token`; `status` |
| `pertemuan_program` | A meeting (kelas_maahir/at_tibyan; muallim_najih purged 0027) | `id`; `kelas_id` (legacy); `program_kelas_id` (new); `program`; `tanggal`; `created_by` |
| `kehadiran_peserta` | Attendance per peserta per pertemuan | `id`; `pertemuan_id`; `peserta_id` (legacy)/`anggota_id` (new); `status`; `setoran_halaman` |
| `program_kehadiran` | Legacy pengajar attendance programs (At-Tibyan; Muallim Najih dropped 0027) | `id`; `hari[]`; `waktu_*` |
| `checkin_pengajar` | Pengajar check-in vs program_kehadiran or kelas_hits | `id`; `pengajar_id`; XOR `program_id`/`kelas_hits_id`; `status_checkin`; `checkout_at` |
| `pengajuan_alasan` | Pengajar late/absent excuse, decided by ketua kelompok | `id`; `pengajar_id`; `jenis_alasan`; `status_pengajuan`; `decided_by` |
| `libur_program` | Legacy holiday for program_kehadiran/kelas_hits | `id`; `tanggal`; `gender`; `created_by_role` |

### Observasi — legacy, not feeding Matrix (4)

| Table | Purpose | Key columns / FKs |
|---|---|---|
| `observasi_kelas` | Ketua's daily condition of `kelas_hits` (1/kelas/day) | `id`; `kelas_hits_id`; `ketua_kelas_id`; `kondisi`; unique(`kelas_hits_id`,`tanggal`) |
| `tabayyun` | Clarification when `kondisi != KBBS`, 48h | `id`; `observasi_id`; `pengajar_id`; `koordinator_kk_id`; `status` |
| `teguran` | Warning to pengajar (legacy) | `id`; `pengajar_id`; `year_month`; `nomor_teguran`; `source_ref_*` |
| `jadwal_pindah` | Class schedule swap (cross-ref w/ JKG) | `id`; `pengajar_id`; `kelas_hits_id`; `tanggal_asal`/`tanggal_pengganti` |

### HITS — batch-native, `hits_` prefix (18)

| Table | Purpose | Key columns / FKs |
|---|---|---|
| `hits_batch` | One HITS cohort = one kaldik tab | `id`; `slug` unique; `start_date`; `active` |
| `hits_kaldik_hari` | Academic-calendar day grid per (batch,level) | `id`; `batch_id`; `level`; `tanggal`; `pekan`; `is_libur`; unique(batch,level,tanggal) |
| `hits_kaldik_pertemuan` | Manual override of pertemuan_no↔tanggal | `id`; `halaqah_id`; `level`; `pertemuan_no`; `is_skipped` |
| `hits_halaqah` | One study circle; linked to pengajar by WA | `id`; `batch_id`; `pengajar_id`; `level`; `program` dasar/lanjutan; `start_date`; unique(batch,name) |
| `hits_halaqah_peserta` | Student roster per halaqah | `id`; `halaqah_id`; `murid_id`; `is_ketua`; `ketua_wa` |
| `hits_keterangan_harian` | Daily pengajar condition + latihan per pertemuan | `id`; `halaqah_id`; `pertemuan_no`; `level`; `kondisi`; `diisi_by_*`; unique(halaqah,level,pertemuan_no) |
| `hits_tabayyun` | Batch-native clarification flow | `id`; `keterangan_id` (1:1); `pengajar_id`; `koordinator_kk_id`; `status`; `deadline_at` |
| `hits_teguran` | Batch-native warning | `id`; `pengajar_id`; `category`; `source_ref_*` (unique idempotency) |
| `hits_sheet_source` | Google Sheet ingestion config (CSV publish) | `id`; `batch_id`; `kind`; `spreadsheet_id`; `gid`; `last_synced_at` |
| `hits_pertemuan_hapus_request` | Ketua request to delete a pertemuan; magic-link approved | `id`; `halaqah_id`; `token`; `status` |
| `hits_halaqah_pindah_request` | Transfer (`transfer_out`) or claim (`claim_in`) a halaqah | `id`; `halaqah_id`; `requested_by_pengajar_id`; `target_pengajar_id`; `request_type`; `token` |
| `hits_pertemuan_koreksi` | Correction-request container | `id`; `halaqah_id`; `token`; `status` pending/selesai |
| `hits_pertemuan_koreksi_item` | Items within a koreksi | `id`; `koreksi_id`; `jenis` (set_mulai/tambah/hapus/ubah_tanggal); `status` |
| `hits_pelanggaran` | Multiple violations per pertemuan (replaces single-kondisi) | `id`; `keterangan_id`; `jenis`; `menit`; unique(keterangan,jenis) |
| `hits_hutang_bayar` | Credit-only "minute debt" repayment ledger | `id`; `halaqah_id`; `pengajar_id`; `keterangan_id`; `menit`; `tanggal` |
| `hits_kajian_presensi` | Weekly Kajian Adab attendance for ketua kelas | `id`; `ketua_wa`; `tanggal`; `status`; unique(ketua_wa,tanggal) |
| `hits_kajian_libur` | Holiday dates for Kajian Adab | `id`; `tanggal` unique |
| `ketua_dualrole_request` | One WA as ketua of >1 halaqah | `id`; `ketua_wa`; `new_halaqah_id`; `new_peserta_id`; `approver_kind`; `token` |

### Penilaian / Setoran / Matrix (9)

| Table | Purpose | Key columns / FKs |
|---|---|---|
| `setoran` | Weekly (now 2-week) hafalan submission per peserta | `id`; `peserta_id`; `week_start`; `status`; `checked_by_musyrif_id`; unique(peserta,week_start) |
| `rekaman` | 3 recordings per setoran | `id`; `setoran_id`; `jenis`; `nilai`; `audio_url`; unique(setoran,jenis) |
| `setoran_musyrif` | Musyrif's submission to syaikh (per 2-week) | `id`; `musyrif_id`; `week_start`; `status`; `checked_by_syaikh_id` |
| `rekaman_musyrif` | 3 recordings per setoran_musyrif | `id`; `setoran_musyrif_id`; `jenis`; `nilai` |
| `penilaian_masyaikh` | Monthly bacaan/hafalan score for pengajar | `id`; `pengajar_id`; `year_month`; `skor_bacaan`/`skor_hafalan`; `assessor_role` (syaikh/koordinator_hits); unique(pengajar,ym) |
| `penilaian_pedagogis` | Monthly 5-indicator pedagogical (incl. SOP) by ketua kelompok | `id`; `pengajar_id`; `year_month`; 5 `skor_*`; `assessed_by`; `catatan_umum` |
| `penilaian_peserta` | Monthly bacaan/hafalan for peserta (feeds hard-skill Matrix) | `id`; `peserta_id`; `year_month`; `skor_*`; `assessor_role` (koordinator/syaikh) |
| `matrix_rekap` | Monthly Matrix Skill Guru snapshot + ranking | `id`; `pengajar_id`; `year_month`; ~15 `skor_*`+`rata_rata_*`; `ranking`; `total_teguran_*` |
| `indikator_standar` | Reference scale per indicator | `kode` PK; `kategori` (hard/pedagogis/soft); `standar` |

### Shared / misc (4)

| Table | Purpose | Key columns / FKs |
|---|---|---|
| `audit_log` | Generic audit trail (tabayyun/teguran/penilaian, admin SQL) | `id`; `actor_role`/`actor_id`; `action`; `target_table`/`target_id`; `detail` jsonb |
| `shakwa` | Complaint/ticket (pengajar logged-in or peserta public). Dormant until 0049 revived it as the `/shakwa` feature | `id`; `nomor_tiket` (SKW-YYYYMMDD-NNN); `pelapor_type`; `pelapor_wa`; `kategori`; `halaqoh`; `jawaban` jsonb; `lampiran` text[]; `pengajar_id`; `status` (submitted/in_review/resolved/closed); `reviewed_by_*` |
| `shakwa_izin` | Pre-class leave details from a Shakwa `izin` ticket; auto-attaches as `alasan_pengajar` on the tabayyun the ketua's observation creates | `id`; `shakwa_id`; `pengajar_id`; `halaqah_id`; `tanggal`; `jenis` (KMT/KBLA/JKG/TIDAK_HADIR); `menit`; `jadwal_ganti`; `dipakai_tabayyun_id` |
| `wa_reminder_log` | Log of prepared WA reminder links (no delivery confirmation) | `id`; `sender_*`; `recipient_*`; `template_kind`; `target_*` |
| `koordinator_notes` | Collaborative notes between coordinators | `id`; `target_type`/`target_id`; `author_*`; `visibility` (peer/private) |

### Deprecated / legacy (do not build on)

- `koordinator_hits` — dropped (0023).
- `kelas_hits`, `observasi_kelas`, `tabayyun`, `teguran`, `jadwal_pindah`, `checkin_pengajar`, `program_kehadiran`, `pengajuan_alasan`, `libur_program` — the legacy single-cohort HITS flow; retained but no longer feed `matrix_rekap` (per 0022). Batch-native `hits_*` tables are authoritative.
- Muallim Najih rows (in `program_kehadiran` + dependents) hard-deleted in 0027; the table survives for At-Tibyan only.

---

<!-- ============================================================ -->

## HTTP API Endpoints

All handlers under `src/app/api/**/route.ts` (23 internal + the `/api/v1/*` public API, below). Auth shorthand: **Bearer** = `Authorization: Bearer <token>`; **Cookie** = iron-session via `getSession()`/`getSessionWa()`; **Public** = no check.

| Path | Method | Auth | Purpose | Tables |
|---|---|---|---|---|
| `/api/2in1/kehadiran/[pertemuan_id]` | GET | Cookie + must be ketua/wakil of the meeting's class | Read attendance for a meeting | `kehadiran_peserta` |
| `/api/2in1/kehadiran/[pertemuan_id]` | PUT | Cookie + must be ketua/wakil of the meeting's class | Upsert member attendance | `kehadiran_peserta` (w), reads `pertemuan_program`/`program_kelas`/`program_kelas_anggota` |
| `/api/2in1/laporan/download` | GET | Cookie, `koordinator`/`syaikh` | Monthly XLSX report | setoran/rekaman/peserta via `generateMonthlyReport()` |
| `/api/2in1/penilaian/upsert` | POST | Cookie, `koordinator`/`syaikh` | Upsert monthly peserta assessment | `penilaian_peserta` |
| `/api/2in1/pertemuan` | POST | Cookie + ketua/wakil of `program_kelas_id` | Create/upsert a meeting | `pertemuan_program` (w), reads `program_kelas` |
| `/api/2in1/rekaman/submit-single` | POST | Cookie, `peserta` | Upload one recording for cycle | `setoran`/`rekaman` (w), reads `peserta` |
| `/api/2in1/setoran-kelas` | POST | Cookie + ketua/wakil of the meeting's `program_kelas` | Ketua/wakil batch-fills `setoran_halaman` for past `kelas_maahir` meetings (attendance untouched); 403 once the report period is locked | `kehadiran_peserta` (w), reads `pertemuan_program`/`program_kelas` |
| `/api/2in1/setoran-musyrif/submit` | POST | Cookie, `musyrif` | Submit 3 recordings (notifies syaikh at `/2in1/...`) | `setoran_musyrif`/`rekaman_musyrif` (w) |
| `/api/2in1/setoran/submit` | POST | Cookie, `peserta` | Submit 3 recordings (notifies musyrif at `/2in1/...`) | `setoran`/`rekaman` (w) |
| `/api/admin/db` | POST | **Bearer `ADMIN_API_TOKEN`** (feature-gated) | Run arbitrary SQL on prod — see below | any |
| `/api/admin/recompute-matrix` | POST | **Bearer `ADMIN_API_TOKEN`** (same gate as `/api/admin/db`) | Recompute `matrix_rekap` for `{months:[YYYY-MM]}` (server-side twin of `npm run recompute-matrix`, no SSH); skips historic months < anchor | `matrix_rekap` (w) via `computeMatrixForMonth` |
| `/api/audio/[...seg]` | GET | Signed URL (HMAC `sig`+`exp`, `SESSION_SECRET`) | Serve local audio file | filesystem (`STORAGE_DIR`) |
| `/api/auth/logout` | POST | Cookie (best-effort) | Destroy session, log logout | session log |
| `/api/auth/magic-link` | GET | `?token=` vs `ketua_kelas.magic_token` (confirm interstitial on identity switch) | Passwordless Ketua Kelas login | `ketua_kelas` (r + `last_login_at`) |
| `/api/health` | GET | Public; `?probe=<ADMIN_API_TOKEN>` gates a storage self-test | Liveness/diagnostic (env presence, not values) | none |
| `/api/hits/koordinator/download` | GET | Cookie, `koordinator_ketua_kelas`/`koordinator`/`syaikh` (any access) | Export HITS Ranking Disiplin Pengajar XLSX for the open period (`?mode=bulan\|minggu&month=&week=&gender=`) | `getHitsKoordinatorRekap()` |
| `/api/laporan/download` | GET | Cookie, `koordinator`/`syaikh` | Monthly XLSX (non-2in1) | `generateMonthlyReport()` |
| `/api/laporan/maahir/download` | GET | Cookie, any `koordinator`/`syaikh` access | Laporan Maahir XLSX | `getLaporanMaahir()` |
| `/api/laporan/maahir/kehadiran/download` | GET | Cookie, any `koordinator`/`syaikh` access | Export Maahir attendance matrix (peserta × tanggal per class) XLSX for the report-month window (`?bulan=YYYY-MM`) | `getMaahirRekap()` |
| `/api/matrix/download` | GET | Cookie, `koordinator` | Export teacher skill matrix XLSX (`?incomplete=1` mode) | `kelompok_pengajar`/`pengajar`/`matrix_rekap`/`hits_halaqah` |
| `/api/penilaian-masyaikh/upsert` | POST | Cookie, `koordinator`/`syaikh` | Upsert masyaikh assessment | `penilaian_masyaikh` |
| `/api/penilaian-pedagogis/upsert` | POST | Cookie; ketua-kelompok (own kelompok) or koordinator (own gender) | Upsert pedagogical assessment | `penilaian_pedagogis`, reads `pengajar` |
| `/api/setoran-musyrif/submit` | POST | Cookie, `musyrif` | Submit 3 recordings (notifies syaikh at `/syaikh/...`), backfill via `week_start` | `setoran_musyrif`/`rekaman_musyrif` (w) |
| `/api/setoran/submit` | POST | Cookie, `peserta` | Submit 3 recordings (notifies musyrif at `/musyrif/...`) | `setoran`/`rekaman` (w) |

Notes:
- "2in1" routes are near-duplicates of the base `laporan`/`setoran`/`setoran-musyrif` routes but point WA-notification links at `/2in1/...` pages — both sets are live.
- ✅ `/api/2in1/kehadiran/[pertemuan_id]` GET was public until Agustus 2026 (anyone with a `pertemuan_id` UUID could read attendance, including the `catatan` column that holds absence reasons). Now behind `otorisasiPertemuan()`, the same ketua/wakil check PUT uses. No in-app caller ever used GET — both forms only PUT — so nothing in the UI changed.
- All non-GET writes go through `supabaseAdmin` (service-role); authorization is enforced in handlers, not Postgres RLS.

### Public API (`/api/v1/*`)

A separate **read-only, `GET`-only** API for other websites to consume Maahir data server-to-server. Full consumer contract: **[`docs/API-PUBLIC.md`](./API-PUBLIC.md)** — this is just the operator summary.

- **Auth**: per-consumer API keys, `Authorization: Bearer k_live_...`. Keys are stored **hashed** in the `api_client` table (row also carries scope, active flag, request counter) — the plaintext key is shown once at creation and never again. Managed from the superadmin page **`/admin/api-keys`**. Verification/usage logic: `src/lib/api-public/auth.ts` (`verifyBearer`).
- **Master switch**: env `PUBLIC_API` must literally equal `"on"`; otherwise every `/api/v1/*` returns `404 not_found` (indistinguishable from a missing route). Optional tuning: `PUBLIC_API_MAX_INFLIGHT` (max concurrent v1 requests, default 4), `PUBLIC_API_CACHE_TTL` (cache TTL override), `PUBLIC_API_AUTH_TTL` (key-cache TTL, default 30s).
- **Surface**: **36 raw entities** served by the catch-all `src/app/api/v1/[...path]/route.ts`, plus **6 rekap routes** under `src/app/api/v1/rekap/*` (`laporan-maahir`, `sp`, `kehadiran`, `tibyan`, `hits-disiplin`, `matrix-guru`). Three scopes gate access — `maahir`, `hits`, `penilaian`; the 4 reference-person entities (`musyrif`/`koordinator`/`syaikh`/`koordinator-ketua-kelas`) are readable by any valid key. Sensitive columns (WA numbers, password hashes, tokens, `audio_url`) are structurally excluded; the entity/column registry lives under `src/lib/api-public/`.
- **Before deploy**: (1) run the guard script **`npm run check-api`** (`scripts/check-api-registry.ts`) which diffs the entity/column registry against the live prod schema — fail = fix before shipping; (2) apply migration **`scripts/sql/2026-08-11-api-client.sql`** to prod via `npm run db -- --confirm` (creates the `api_client` table) before deploying code that reads it.

### Admin SQL API (`/api/admin/db`)

File: `src/app/api/admin/db/route.ts`; logic `src/lib/admin-db.ts` (`runAdminSql`). **POST only.**

**Master switch**: requires **both** `ADMIN_DB_API === 'on'` **and** non-empty `ADMIN_API_TOKEN`; else `404 {error:"not_found"}` (indistinguishable from a missing route).

**Auth**: `Authorization: Bearer <ADMIN_API_TOKEN>`, compared with `crypto.timingSafeEqual`. Fail → `401`.

**Body**: `{ "sql": string (required), "confirm"?: bool=false, "allowNonTx"?: bool=false }`. Missing sql → `400 sql_required`; bad JSON → `400 bad_json`.

**Response**: success `200 {ok:true, kind, columns, rows, rowCount, committed, requiresConfirm?, wouldAffect?, truncated?, notice?}`; error `400 {ok:false, error}`.

**Safety guards**:
1. **Classification** — first keyword (ignoring comments) vs `READ_KEYWORDS {SELECT,WITH,EXPLAIN,SHOW,TABLE,VALUES}`; else = write.
2. **Reads** run in `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK` (DB-level guard — a write-in-CTE is rejected by Postgres). Rows capped `MAX_ROWS=1000` (`truncated:true`).
3. **Non-tx writes** (`VACUUM`/`REINDEX`/`CLUSTER`/`CREATE|DROP DATABASE`/`ALTER SYSTEM`/`... CONCURRENTLY`) run only if **`confirm:true` AND `allowNonTx:true`**; else `requiresConfirm:true`, no-op.
4. **Transactional writes** (INSERT/UPDATE/DELETE/ALTER TABLE...) always in `BEGIN...COMMIT/ROLLBACK`:
   - `confirm` not true (default/dry-run): execute, capture `wouldAffect`, then **ROLLBACK**; response `requiresConfirm:true`, `wouldAffect:<n>`.
   - `confirm:true`: re-run and **COMMIT**, `committed:true`.
   - Every real write is a **two-call** flow: preview → resend identical SQL with `confirm:true`.
5. **Auditing** — executed statements logged to `audit_log` (`action:'admin_sql'`, `target_table:'admin_db'`, SQL truncated 4000 chars, source `'api'` vs `'console'`). Actor from `ADMIN_WA` via `loadAccessesForWa`; if none resolve, audit silently skipped. Preview-rolled-back / rejected non-tx attempts are not audited.

**CLI wrapper**: `scripts/db.ts` = `npm run db "<SQL>"`. ⚠️ With `npm run`, pass `-- --confirm` (npm eats a bare `--confirm`).
```bash
npm run db "SELECT count(*) FROM peserta"                 # read
npm run db -- --confirm "UPDATE peserta SET active=false WHERE id='...'"   # commit
npm run db -- --confirm --allow-nontx "VACUUM peserta"    # non-transactional
```
