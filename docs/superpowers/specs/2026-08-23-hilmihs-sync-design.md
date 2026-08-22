# Sinkron Master Data hilmihs.web.id → maahir (Evaluasi Halaqah)

**Tanggal:** 2026-08-23
**Status:** Design disetujui (Section A–E), menunggu review spec sebelum writing-plans.

## Tujuan

Menarik **live master data** (program/batch, halaqah, pengajar, peserta) dari API agent
`hilmihs.web.id` ke tabel mirror `eval_*` di maahir, supaya fitur **Evaluasi Halaqah**
(penilaian bacaan Qur'an per-Lahn) menilai peserta nyata, bukan data seed. Sinkron
berarah **pull** (maahir menarik; hilmihs read-only GET), dengan **staging review**:
tak ada perubahan menyentuh mirror tanpa persetujuan admin.

Menggantikan asumsi lama di `docs/superpowers/plans/2026-08-21-evaluasi-halaqah.md`
(Task 2.5) yang mengira user API akan **push** ke `/api/evaluasi/sync`. Arah dibalik:
maahir yang menarik.

## Konteks sumber (hasil probe live 2026-08-22)

- **Base:** `https://hilmihs.web.id/api/agent`, header `Authorization: Bearer <AGENT_TOKEN>`,
  server-to-server, GET saja. Envelope `{ ...payload, meta:{ generatedAt, caps, truncated } }`.
  Dokumentasi konsumen: `docs/API_hilmihswebid.md`.
- **Scope program:** hanya `dataSourceType === 'tilawah_api'` (12 program: dpq,
  hits-nurul-iman, hits-regular{,-apr,-jan}, hits-safar{,-jan}, hits-ortu-abk,
  hkm-presensi, tahfizh-nurul-iman, rbi, tafm-laz). **Dikecualikan:** `hkm` (berkah_api,
  kosong) & `mabni` (mabni_api, pengajar tanpa phone). Filter by dataSourceType →
  program berkah/mabni baru auto-terbuang.
- **Bentuk field asli per entity** (seragam lintas program tilawah_api):
  - `GET /{program}/pengajar` → baris `{ pengajar (nama), phone, genders:[1|2], ... }`
    — **TANPA id**. phone tanpa kode negara (mis. `81331732974`), bisa null.
  - `GET /{program}/halaqah` → `{ halaqahId (int, unik per-program), name, pengajar (nama),
    guruPhone, level (teks "HITS Dasar"/"HITS Lanjutan"), gender (1|2), type, ... }`
    — tanpa pengajar_id; pengajar dirujuk lewat nama/guruPhone.
  - `GET /{program}/peserta?limit=&offset=` → `fields` termasuk `{ tilawahUserId (int),
    name, userCode, gender (1|2), halaqahId, halaqahName, level, pengajar (nama), ... }`.
    `phone` ada tapi **opt-in** (`?fields=…,phone`); tak diambil (PII, tak diperlukan).
    `meta.truncated.rows` bawa total sebenarnya → **paginasi** via offset (cap 512 KB → 413).

## Section A — Model mirror & identitas

Pemetaan `hilmihs` → `eval_*` (tabel dari migration `0051`, sudah ada):

| Mirror | id (PK text) | Kolom dari sumber |
|---|---|---|
| `eval_batch` | `<slug>` program | `nama` = program name, `aktif` = `!syncPaused`. 1 batch = 1 program. |
| `eval_pengajar` | `wa:<phoneNormal>` bila phone ada, else `nm:<slug>:<nama>` | `nama`, `whatsapp` = phone dinormalisasi (62…), `gender` = `genders[0]` (1→ikhwan, 2→akhwat). **Dedup lintas-program by phone** → satu pengajar memegang halaqah dari banyak program. |
| `eval_halaqah` | `<slug>:<halaqahId>` | `nama` = name, `gender` (1/2→enum), `level` = teks sumber, `pengajar_id` = id pengajar dari `guruPhone` (`wa:<phoneNormal>`; null bila guruPhone null), `batch_id` = `<slug>`, `mustawa` = null (tak ada di sumber), `ambang_ujian` = 65 (default). |
| `eval_peserta` | `<slug>:<tilawahUserId>` | `nama` = name, `gender`, `halaqah_id` = `<slug>:<halaqahId>`, `is_ketua` = false, `urutan` = index urutan sumber, `aktif` = true. (`userCode` opsional disimpan bila kolom ditambah; tidak wajib.) |

**Normalisasi phone:** pakai `normalizeWhatsApp()` yang sudah ada (`src/lib/whatsapp.ts`) —
`0…`/tanpa-kode → `62…`. Nilai kosong/null → tak jadi kunci `wa:`.

**Konversi gender:** `1 → 'ikhwan'`, `2 → 'akhwat'`. Sumber lain (mis. `genders[]`) ambil
elemen pertama.

**Prefix `<slug>:`** wajib untuk halaqah & peserta karena `halaqahId`/`tilawahUserId`
hanya unik per-program; tanpa prefix akan tabrakan antar-batch (mis. halaqahId 14 ada di
banyak program).

**Match login pengajar:** pengajar login maahir (sesi `pengajar`) dicocokkan ke
`eval_pengajar` lewat **nomor WA ternormalisasi** (`eval_pengajar.whatsapp` ↔
maahir `pengajar.whatsapp_number`). Pengajar phone null (jarang di tilawah_api) tetap
di-mirror (id `nm:…`) tapi tak bisa login-menilai sendiri; koordinator tetap bisa melihat.

## Section B — Alur pull → staging → apply

```
[systemd timer harian / tombol admin]
  → POST /api/evaluasi/sync/pull   (guard: Authorization: Bearer <CRON_SECRET>)
      fetch 12 program × { pengajar, halaqah, peserta(paginasi offset) }   ← hilmihs
      map → bentuk mirror (Section A)
      DIFF vs isi eval_* sekarang → { create | update | deactivate } per entity
      tulis baris diff ke  eval_sync_stage  (before/after JSON + flags[])
      catat  eval_sync_run  (waktu, source meta.generatedAt, jumlah per aksi, status)
      → TAK menyentuh eval_* langsung
[admin /evaluasi/koordinator/sync]
  → review baris staging (approve/tolak per item, atau "approve semua")
  → POST /api/evaluasi/sync/apply  → terapkan baris ter-approve ke eval_*
```

**Aturan diff:**
- id baru (belum di mirror) → op `create`.
- id ada, ≥1 field mirror berubah → op `update` (simpan `before`/`after`).
- id di mirror tapi **hilang** dari hasil fetch program itu → op `deactivate`
  (`aktif = false`; **tidak** hard-delete).
- **Idempotent:** re-pull sebelum apply → baris stage di-upsert per `(entity, entity_id)`,
  tak menumpuk ganda. Baris yang sudah di-apply tak muncul lagi kecuali ada diff baru.
- **Hard-delete dilarang** (FK `evaluasi_nilai`/`evaluasi_sesi` → mirror
  `on delete cascade` akan menghapus nilai). Penghapusan sumber = soft-deactivate.

**Flag "tabrakan" yang ditandai untuk review** (dipisah dari "approve semua", wajib dilihat):
- Pengajar halaqah berubah (guruPhone beda) padahal halaqah punya `evaluasi_sesi` aktif / ada nilai.
- Peserta pindah `halaqah_id` padahal sudah ada nilai di halaqah lama.
- Gender kosong/ambigu, atau nama pengajar berubah untuk phone yang sama.
- `deactivate` atas peserta/halaqah yang punya nilai (disorot, bukan diblok).

Baris ber-flag tetap bisa di-apply, tapi ditandai merah dan **tidak** ikut "approve semua"
diam-diam — harus di-approve terpisah.

## Section C — Mirror → evaluasi (sesi & nilai)

Pemisahan tegas:
- `eval_*` = **master read-only** hasil sync; tak pernah diedit tangan.
- `evaluasi_sesi` / `evaluasi_nilai` = **milik maahir** (transaksional), nyantol ke id mirror.
  **Sync tak pernah menyentuh sesi/nilai.**

Alur pemakaian (UI Phase 3–4 rencana evaluasi, dibangun terpisah):
```
Pengajar login maahir → cocok eval_pengajar by WA
  → lihat eval_halaqah WHERE pengajar_id = <eval_pengajar.id>
  → per halaqah: buat evaluasi_sesi (qn/pb/ujian × nomor)   [API sesi/upsert — Phase 2 evaluasi]
  → peserta = eval_peserta WHERE halaqah_id = <halaqah>
  → nilai per peserta (hitung Lahn → skor)                  [API nilai/upsert — Phase 2]
  → kirim/finalize                                          [API kirim — Phase 2]
Koordinator (gender-scoped) → dashboard agregat + drill-down + config track/jadwal
```

Efek sync ke data transaksi:
- Peserta/halaqah di-**deactivate** → nilai lama tetap (historis), tak muncul di sesi baru.
- Pengajar halaqah **ganti** → `eval_halaqah.pengajar_id` update; `evaluasi_sesi.dibuat_oleh`
  lama tetap pengajar asal; pengajar baru memegang ke depan; guard tulis (ownership) ikut pindah.
- FK sesi/nilai → mirror `on delete cascade`, tapi karena hanya soft-deactivate, nilai aman.

**Konsekuensi seed:** `scripts/seed-evaluasi.ts` memakai id palsu (`A-14`, `p1`) yang tak
cocok dengan id mirror asli (`<slug>:<int>`). Setelah sync live jalan, seed jadi demo-only
dan sebaiknya tidak dipakai di lingkungan yang sudah tersinkron (agar id palsu tak bercampur
dengan id sumber).

## Section D — Trigger & secret (runtime VPS)

Runtime = VPS `103.181.142.223`, Next.js `standalone` di systemd `next-maahir.service`,
di belakang nginx. Azure DevOps = CI/CD + brankas secret (Variable Group `Maahir-Prod`,
prefix `ENV_`).

**Secret:**
- Di Variable Group `Maahir-Prod`: `ENV_AGENT_TOKEN`, `ENV_CRON_SECRET` (sudah masuk).
  Pipeline emit ke `maahir.env` → systemd EnvironmentFile → `process.env`.
- App membaca via `apiEnv('AGENT_TOKEN')` / `apiEnv('CRON_SECRET')`
  (`src/lib/api-public/env.ts` — sudah menerima nama berprefix `ENV_` maupun polos).
- Dev: `.env.local` (`AGENT_TOKEN=…`, `CRON_SECRET=…`). `.env.example`: tambah 2 placeholder.

**Trigger** (VPS-side, bukan Vercel/Azure cron):
- **Pull endpoint** `POST /api/evaluasi/sync/pull` — guard `Authorization: Bearer <CRON_SECRET>`.
  Trigger-agnostic (timer/crontab/manual bisa menembak).
- **Harian:** systemd timer `next-maahir-sync.timer` di VPS →
  `curl -H "Authorization: Bearer $CRON_SECRET" https://maahir.muhajirproject.org/api/evaluasi/sync/pull`.
  Di-provision via SSH task **idempotent** di `azure-pipelines.yml` (pola sama drop-in env
  yang sudah ada). Jadwal awal: sekali/hari (mis. 02:00 WIB).
- **Manual:** tombol "Sinkronkan sekarang" di `/evaluasi/koordinator/sync` (sesi admin) →
  panggil pull (server action / fetch internal ber-CRON_SECRET), lalu tampilkan hasil staging.

## Section E — Tabel & file baru

**Migration `supabase/migrations/0052_evaluasi_sync.sql`:**
- `eval_sync_run` — audit tiap pull: `id uuid`, `started_at`, `finished_at`,
  `source_generated_at`, `counts jsonb` (create/update/deactivate per entity), `status`
  (`running`/`ok`/`error`), `error text`.
- `eval_sync_stage` — baris diff pending: `id uuid`, `run_id → eval_sync_run`,
  `entity text` (batch/pengajar/halaqah/peserta), `op text` (create/update/deactivate),
  `entity_id text` (id mirror target), `before jsonb`, `after jsonb`, `flags text[]`,
  `applied_at timestamptz null`, `applied_by text null`, `rejected boolean default false`,
  unik `(entity, entity_id)` untuk baris belum-diproses (idempotent upsert).
- (Opsional) `eval_peserta.user_code text` + `eval_pengajar` tetap; `synced_at` sudah ada.

**Lib (`src/lib/hilmihs/`):**
- `client.ts` — fetch wrapper: base+Bearer dari `apiEnv('AGENT_TOKEN')`, paginasi offset,
  penanganan 413 (kecilkan limit), baca envelope+`meta.truncated`, error datar hilmihs.
- `map.ts` — **pure**: response hilmihs → bentuk mirror (gender 1/2→enum, prefix id,
  phone-normal, kunci pengajar wa:/nm:). Unit-test `tsx` (pola `scripts/test-*.ts`).
- `sync.ts` — orkestrasi (server, `supabaseAdmin`): fetch 12 program → map → diff vs mirror
  → tulis `eval_sync_stage` + `eval_sync_run`. Serta `apply(stageIds)` memindahkan ke mirror.

**API:**
- `src/app/api/evaluasi/sync/pull/route.ts` — guard `CRON_SECRET`, jalankan `sync.ts` pull.
- `src/app/api/evaluasi/sync/apply/route.ts` — sesi admin/koordinator, apply stage terpilih.
- **Hapus** stub `src/app/api/evaluasi/sync/route.ts` (POST push — arah kebalik, tak dipakai).

**UI:**
- `src/app/evaluasi/koordinator/sync/page.tsx` + `SyncReviewPanel.tsx` — daftar `eval_sync_run`
  terakhir, tabel `eval_sync_stage` (approve/tolak per item, "approve semua" untuk non-flag,
  bagian terpisah untuk baris ber-flag), tombol "Sinkronkan sekarang".

**Infra:** SSH task idempotent di `azure-pipelines.yml` memasang `next-maahir-sync.timer`.

## Testing

- `map.ts` → unit test `tsx` murni: gender 1/2, prefix id, dedup pengajar by phone,
  guruPhone null → pengajar_id null, diff create/update/deactivate.
- `client.ts`/`sync.ts`/route → `npm run typecheck` + `npm run build`; probe live `/programs`
  memakai `AGENT_TOKEN` dev; jalankan pull ke DB dev, cek `eval_sync_stage` terisi;
  apply, cek mirror.
- Verifikasi E2E: pull → review → apply → pengajar (WA match) melihat halaqah miliknya.

## Keputusan & asumsi terkunci

1. Scope = `dataSourceType === 'tilawah_api'` (12 program); hkm(berkah)/mabni(mabni) dilewati.
2. Arah = **pull** oleh maahir; hilmihs read-only. Stub push `/api/evaluasi/sync` dibuang.
3. Identitas: pengajar by phone (`wa:`), fallback `nm:<slug>:<nama>`; halaqah/peserta prefix `<slug>:`.
4. Semua perubahan lewat **staging** (termasuk import pertama; ada "approve semua" untuk non-flag).
5. Penghapusan sumber = **soft-deactivate**, nilai tak pernah dihapus.
6. Match login maahir↔eval by nomor WA ternormalisasi.
7. Trigger harian = systemd timer VPS menembak `/sync/pull` ber-CRON_SECRET; plus tombol manual.
8. Secret via `apiEnv` (`ENV_`-aware); dev di `.env.local`.

## Di luar cakupan spec ini

- UI penilaian pengajar & dashboard koordinator evaluasi (Phase 3–4 plan evaluasi) — terpisah.
- Sinkron balik (write) ke hilmihs — tidak ada; API sumber read-only.
