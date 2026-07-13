# Migrasi Database Maahir — Keluar dari Supabase

Panduan untuk memindahkan database aplikasi **Setoran Hafalan / HITS Maahir**
(`maahir.muhajirproject.org`) dari Supabase ke host lain.

> Ditulis 13 Juli 2026, saat project Supabase `yvjbqrrczwvlsaqbjwrq` masuk status
> **restricted** (`exceed_storage_size_quota`) karena rekaman audio ~4.8 GB
> melewati kuota free tier. Data tabel sudah diamankan; audio perlu langkah
> tambahan (lihat bagian **Audio / Storage**).

---

## 0. Ringkas: yang WAJIB dipahami dulu

**Aplikasi TIDAK memakai koneksi Postgres langsung.** Ia bicara ke Supabase
lewat `@supabase/supabase-js` → **PostgREST** (REST di atas Postgres) dan
**Supabase Storage** (bucket audio). Autentikasi login **custom** (iron-session +
bcrypt), **bukan** Supabase Auth — jadi tidak ada ketergantungan ke skema `auth`.

Konsekuensi: **Postgres polos saja TIDAK cukup untuk menjalankan aplikasi.**
Target harus menyediakan, minimal:

| Komponen        | Dipakai untuk                                   | Wajib? |
|-----------------|-------------------------------------------------|--------|
| PostgreSQL 17   | Semua data                                      | Ya     |
| PostgREST       | Semua query aplikasi (via supabase-js)          | Ya     |
| Supabase Storage| Simpan/serve rekaman audio setoran              | Ya (kalau fitur audio dipakai) |
| GoTrue (Auth)   | —                                               | Tidak (auth custom) |

→ **Rekomendasi target: Self-Hosted Supabase** (Docker) atau **project Supabase
baru di akun/host lain**. Keduanya menyediakan PostgREST + Storage sehingga kode
aplikasi **tidak perlu diubah** — cukup ganti 3 env (URL + 2 key).

Kalau host tujuan benar-benar hanya menyediakan "PostgreSQL", database tetap bisa
di-restore (schema + data di bawah ini valid & teruji), tapi **aplikasi belum
akan jalan** sampai ada PostgREST + Storage di depannya. Diskusikan ini dengan
penyedia host.

---

## 1. Isi paket backup

```
_backup_supabase/                 (TIDAK di-commit — berisi data sensitif)
  data/<tabel>.json               58 tabel, 26.277 baris — LENGKAP ✅
  storage/<path>.webm             rekaman audio — SEBAGIAN (7 file) ⚠️
  storage-manifest.json           daftar 608 objek audio (path+size) — LENGKAP
  manifest.json                   ringkasan + jumlah baris per tabel

db-migration/                     (di-commit KECUALI dump)
  README.md                       file ini
  00_roles.sql                    buat role anon/authenticated/service_role
  schema.sql                      gabungan 44 migrasi (schema lengkap)
  load-data.ts                    muat data/*.json ke Postgres tujuan (butuh Node)
  maahir_full_dump.sql            ⭐ SATU file: roles+schema+data. Restore 1 perintah.
                                  TIDAK di-git (data sensitif) — dikirim bersama
                                  _backup_supabase, atau regen `npm run generate-dump`.
  docker-compose.yml              Postgres 17 lokal (untuk restore/test)

supabase/migrations/*.sql         44 migrasi asli (sumber schema, urut nomor)
scripts/export-supabase.ts        script export (re-run untuk lanjutkan audio)
scripts/test-restore-pglite.ts    verifikasi restore end-to-end (tanpa docker)
```

Status verifikasi: `npm run test-restore` **LULUS** — 44/44 migrasi apply di
Postgres bersih, jumlah baris 58 tabel cocok manifest, 80 foreign key valid
(tidak ada baris yatim).

---

## 2. Restore database (langkah inti)

Berlaku untuk target apa pun (self-hosted Supabase, project Supabase baru, atau
Postgres polos). Butuh `psql` + `DATABASE_URL` ke Postgres 17 tujuan.

### Cara TERCEPAT — satu file (tanpa Node)

```bash
psql "$DATABASE_URL" -f db-migration/maahir_full_dump.sql
```

File ini = `00_roles.sql` + `schema.sql` + semua data (INSERT). Idempotent
(TRUNCATE dulu, load ulang). Sudah diverifikasi: restore ulang di Postgres bersih
menghasilkan jumlah baris persis sama dgn manifest. Kalau file belum ada, buat:
`npm run generate-dump` (butuh `_backup_supabase/data`).

> Butuh koneksi sbg superuser / role yg boleh `SET session_replication_role`
> (postgres default di self-hosted Supabase & project Supabase bisa). Kalau tidak,
> pakai cara bertahap di bawah.

### Cara bertahap (schema + loader Node)

```bash
# 1) Role Supabase (anon/authenticated/service_role) — dibutuhkan RLS policy.
psql "$DATABASE_URL" -f db-migration/00_roles.sql

# 2) Schema (enum, tabel, fungsi, trigger, RLS). Bisa pakai file gabungan:
psql "$DATABASE_URL" -f db-migration/schema.sql
#    ATAU jalankan migrasi satu per satu (identik):
#    for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# 3) Data (butuh Node + `npm i pg`). Loader mematikan trigger/FK saat load,
#    truncate dulu (buang baris seed migrasi), lalu insert dari JSON.
export DATABASE_URL   # postgres://user:pass@host:5432/db
npm run load-data
```

Verifikasi cepat setelah load:

```bash
psql "$DATABASE_URL" -c "SELECT
  (SELECT count(*) FROM peserta)   AS peserta,      -- 84
  (SELECT count(*) FROM setoran)   AS setoran,      -- 186
  (SELECT count(*) FROM audit_log) AS audit;"       -- 4432
```

Catatan:
- Tabel ad-hoc `_bak_merge_basmah_20260709` (87 baris) **tidak** dibuat oleh
  migrasi (backup manual lama). Datanya ada di `data/`; buat manual kalau perlu.
- RLS: server aplikasi pakai **service_role** (bypass RLS), jadi app tetap jalan
  walau policy belum sempurna. Policy tetap dibuat oleh schema.sql untuk anon key.

---

## 3. Pilihan Target

### Opsi A — Self-Hosted Supabase (rekomendasi, app tanpa perubahan kode)

1. Ikuti https://supabase.com/docs/guides/self-hosting/docker (clone `supabase`,
   `docker compose up -d`). Ini sudah menyediakan Postgres + PostgREST + Storage +
   Kong (gateway) + role anon/authenticated/service_role.
2. Restore schema + data ke Postgres-nya (bagian 2). Karena role sudah ada,
   `00_roles.sql` akan idempotent (aman).
3. Buat bucket storage `setoran-audio` (private), lalu upload audio (bagian 4).
4. Ambil dari `docker-compose`/`.env` Supabase: `SUPABASE_URL` (mis.
   `http://<host>:8000`), `ANON_KEY`, `SERVICE_ROLE_KEY`.
5. Set env aplikasi (bagian 5), deploy, matikan maintenance (bagian 6).

### Opsi B — Project Supabase baru (akun/region lain)

1. Buat project baru di Supabase. Di **SQL Editor**, jalankan `00_roles.sql`
   (idempotent — role sudah ada) lalu `schema.sql`.
2. Load data: pakai **connection string** project baru (Settings → Database →
   Connection string / URI) sebagai `DATABASE_URL`, jalankan `npm run load-data`.
3. Storage → buat bucket `setoran-audio` (private) → upload audio (bagian 4).
4. Ambil URL + anon key + service_role key baru → set env (bagian 5).

### Opsi C — Postgres polos (mis. dari host tujuan)

- Restore DB persis bagian 2 (sudah teruji jalan di Postgres 17 murni).
- **Aplikasi belum jalan** tanpa PostgREST + Storage. Perlu pasang PostgREST
  (https://postgrest.org) + storage-api sendiri, atau bungkus dengan Opsi A.
- Untuk test lokal cepat DB-nya: `docker compose -f db-migration/docker-compose.yml up -d`.

---

## 4. Audio / Storage (⚠️ butuh aksi)

- Bucket `setoran-audio`: **608 objek, ~4.8 GB** rekaman `.webm` (setoran peserta
  & musyrif). Daftar lengkap di `_backup_supabase/storage-manifest.json`.
- Saat export, project sudah restricted → **hanya 7 file** yang sempat terunduh.
  Sisanya **belum** ada byte-nya (byte audio hanya bisa diambil lewat Storage API
  yang sekarang terkunci).

**Untuk menyelamatkan audio penuh, salah satu:**
1. **Lepas restriction dulu** (di Supabase: hapus spend cap / tambah billing /
   kosongkan storage sampai < kuota) supaya Storage API aktif lagi, LALU:
   ```bash
   npm run export-supabase     # resume: lewati yg sudah ada, unduh sisa ~601 file
   ```
   Ini menaruh semua audio di `_backup_supabase/storage/<path>`.
2. Setelah audio ada di lokal, upload ke bucket target (Opsi A/B) dengan
   `scripts/upload-storage.ts` (lihat catatan di bawah) atau `supabase storage cp`.

> Path objek = `{peserta_id}/{week_start}/{jenis}.webm` dan
> `musyrif/{musyrif_id}/{week_start}/{jenis}.webm`. Tabel `rekaman` /
> `rekaman_musyrif` menyimpan path relatif ini, jadi cukup dipertahankan sama.

Kalau audio lama direlakan (mulai bersih), tabel `rekaman`/`setoran` tetap valid;
hanya link download audio lama yang mati.

---

## 5. Env aplikasi yang perlu diganti

Di server (`/var/www/html/maahir`, env via Azure Variable Group `ENV_*` →
`env_vars.sh`), ganti nilai berikut ke host baru:

```
NEXT_PUBLIC_SUPABASE_URL=<url PostgREST/Supabase baru>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key baru>
SUPABASE_SERVICE_ROLE_KEY=<service_role key baru>
SUPABASE_AUDIO_BUCKET=setoran-audio      # tetap
SESSION_SECRET=<biarkan sama>            # ganti = semua sesi login logout
NEXT_PUBLIC_APP_URL=https://maahir.muhajirproject.org
```

Tidak ada env lain yang berubah. Kode aplikasi tidak perlu disentuh.

---

## 6. Matikan mode maintenance

Situs saat ini **terkunci maintenance** (semua halaman 503) sejak 13 Juli 2026,
diatur di `src/lib/maintenance.ts` + `src/middleware.ts`.

Cara mengontrol lewat env:

```
MAINTENANCE_MODE=off        # matikan total (situs normal)
MAINTENANCE_MODE=on         # kunci paksa
MAINTENANCE_MODE=auto       # default: aktif bila now >= MAINTENANCE_START
MAINTENANCE_BYPASS_TOKEN=<rahasia>   # admin bisa akses: buka
                                     # https://maahir..../?maintenance_bypass=<rahasia>
```

Setelah migrasi selesai & terverifikasi → set `MAINTENANCE_MODE=off`, deploy.

---

## 7. Deploy

Deploy otomatis via Azure DevOps: push ke branch `main` → pipeline SSH ke
`103.181.142.223`, `git reset --hard`, `npm install`, `npm run build`, restart
`systemctl restart next-maahir`. Jadi cukup merge perubahan env/kode ke `main`.

---

## 8. Checklist migrasi

- [ ] Target menyediakan PostgREST + Storage (Opsi A/B) — atau sadar app belum
      jalan (Opsi C)
- [ ] `00_roles.sql` + `schema.sql` ter-apply tanpa error
- [ ] `npm run load-data` selesai; `npm run test-restore` LULUS (opsional lokal)
- [ ] Jumlah baris cocok (peserta 84, setoran 186, audit_log 4432, dst.)
- [ ] (Audio) restriction dilepas → `npm run export-supabase` selesai → upload ke bucket
- [ ] Bucket `setoran-audio` (private) ada di target
- [ ] Env aplikasi (URL + anon + service_role) diganti ke host baru
- [ ] Test login 1 akun tiap role + buka 1 setoran (cek data & audio)
- [ ] `MAINTENANCE_MODE=off` → deploy → situs normal
