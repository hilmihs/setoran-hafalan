# HANDOFF — Deploy Maahir (Setoran Hafalan / HITS) di server sendiri

Tutorial lengkap dari server kosong sampai situs `maahir.muhajirproject.org`
jalan lagi, memakai **PostgreSQL lokal** (sudah lepas dari Supabase).

Ditulis 13 Juli 2026. Ikuti berurutan. Perkiraan waktu: 30–60 menit.

> Ringkas untuk yang sudah paham: pasang Postgres 17 → `psql -f
> db-migration/maahir_full_dump.sql` → set env `DATABASE_URL` + `STORAGE_DIR` +
> `SESSION_SECRET` → `npm install && npm run build` → jalankan → `MAINTENANCE_MODE=off`.

---

## 0. Arsitektur (yang perlu dipahami)

- **Framework:** Next.js 14 (App Router, mode `standalone`), Node.js 24.
- **Database:** PostgreSQL 17 — aplikasi bicara **langsung** via `node-postgres`.
  **Tidak** ada Supabase / PostgREST / GoTrue lagi.
- **Auth:** custom (iron-session cookie + bcrypt). Tidak ada layanan auth eksternal.
- **Audio setoran:** file di **filesystem** (`${STORAGE_DIR}/setoran-audio/...`),
  diserve route `/api/audio`. Audio lama (~4.8 GB) **tidak dimigrasikan** — hanya
  setoran baru yang punya audio.
- **Yang dibutuhkan server:** PostgreSQL 17, Node.js, Nginx (reverse proxy),
  1 folder storage. Itu saja.

---

## 1. Prasyarat server

Contoh di Ubuntu 22.04/24.04 (VPS lama pakai `103.181.142.223`, path
`/var/www/html/maahir`). Sesuaikan.

```bash
# Node.js 24 (via nvm — dipakai pipeline lama)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. "$HOME/.nvm/nvm.sh"
nvm install 24.15.0 && nvm use 24.15.0
node -v    # v24.x

# PostgreSQL 17 (repo resmi PGDG)
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | \
  sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt install -y postgresql-17
sudo systemctl enable --now postgresql
psql --version   # psql (PostgreSQL) 17.x
```

---

## 2. Buat database & user

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE maahir;
CREATE USER maahir_app WITH PASSWORD 'GANTI_PASSWORD_KUAT';
GRANT ALL PRIVILEGES ON DATABASE maahir TO maahir_app;
ALTER DATABASE maahir OWNER TO maahir_app;
SQL
```

`DATABASE_URL` nanti = `postgres://maahir_app:GANTI_PASSWORD_KUAT@localhost:5432/maahir`.

> **Catatan restore:** dump memakai `SET session_replication_role = replica`
> (mematikan trigger/FK saat load) yang butuh hak superuser. Cara termudah:
> jalankan langkah restore (bagian 3) sebagai user **postgres** (superuser), lalu
> aplikasi konek sebagai `maahir_app`. Kalau ingin `maahir_app` yang restore,
> beri: `sudo -u postgres psql -c "ALTER ROLE maahir_app SUPERUSER;"` (boleh
> dicabut lagi setelah restore).

---

## 3. Ambil kode + data

```bash
# Kode (repo). Pipeline lama deploy ke /var/www/html/maahir.
cd /var/www/html/maahir
git fetch origin main && git reset --hard origin/main

# Paket handoff (dikirim terpisah — berisi data sensitif, TIDAK di git):
#   maahir-db-handoff.tar.gz
# Taruh di server lalu extract di root repo:
tar -xzf maahir-db-handoff.tar.gz     # → _backup_supabase/ + db-migration/maahir_full_dump.sql
```

Isi paket: `db-migration/maahir_full_dump.sql` (roles+schema+data, 1 file) +
`_backup_supabase/data/*.json` (cadangan per-tabel) + manifest.

---

## 4. Restore database

Cara **tercepat** (satu file):

```bash
sudo -u postgres psql -d maahir -f db-migration/maahir_full_dump.sql
```

Verifikasi jumlah baris:

```bash
sudo -u postgres psql -d maahir -c "SELECT
  (SELECT count(*) FROM peserta)   AS peserta,     -- 84
  (SELECT count(*) FROM setoran)   AS setoran,     -- 186
  (SELECT count(*) FROM audit_log) AS audit,       -- 4432
  (SELECT count(*) FROM hits_keterangan_harian) AS ket;  -- 5574
"
```

<details><summary>Alternatif bertahap (kalau dump tak dipakai)</summary>

```bash
sudo -u postgres psql -d maahir -f db-migration/00_roles.sql   # role anon/authenticated/service_role
sudo -u postgres psql -d maahir -f db-migration/schema.sql      # enum+tabel+fungsi+RLS
DATABASE_URL="postgres://maahir_app:...@localhost:5432/maahir" npm run load-data
```
</details>

Beri kepemilikan objek ke user app (kalau restore sbg postgres):

```bash
sudo -u postgres psql -d maahir -c "
  GRANT ALL ON ALL TABLES IN SCHEMA public TO maahir_app;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO maahir_app;
  GRANT ALL ON SCHEMA public TO maahir_app;"
```

---

## 5. Folder storage audio

```bash
sudo mkdir -p /var/www/html/maahir/storage/setoran-audio
sudo chown -R $USER:$USER /var/www/html/maahir/storage   # atau user service
```

Audio lama tidak ada (direlakan) — folder ini untuk setoran BARU.

---

## 6. Environment variables

Server lama meng-inject env via Azure Variable Group (`ENV_*`) → `env_vars.sh`.
Set/ubah nilai berikut (buang var Supabase lama):

```bash
DATABASE_URL=postgres://maahir_app:GANTI_PASSWORD_KUAT@localhost:5432/maahir
STORAGE_DIR=/var/www/html/maahir/storage
SUPABASE_AUDIO_BUCKET=setoran-audio
SESSION_SECRET=<32+ karakter acak — generate: openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=https://maahir.muhajirproject.org

# Maintenance: biarkan terkunci sampai semua terverifikasi, lalu matikan.
MAINTENANCE_MODE=on
# (opsional) MAINTENANCE_BYPASS_TOKEN=<rahasia> → akses admin saat maintenance
#            via https://maahir.muhajirproject.org/?maintenance_bypass=<rahasia>
```

> ⚠️ Kalau `SESSION_SECRET` diganti dari yang lama, semua sesi login ter-reset
> (user login ulang) — itu wajar. Password user tetap (hash tersimpan di DB).
> Var lama `NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
> SUPABASE_SERVICE_ROLE_KEY` **tidak dipakai lagi** — hapus.

---

## 7. Build & jalankan

```bash
cd /var/www/html/maahir
nvm exec 24.15.0 npm install
nvm exec 24.15.0 npm run build
# mode standalone: copy static
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/ 2>/dev/null || true
```

Jalankan (systemd service `next-maahir`, seperti setup lama). Contoh unit — env
di-source dari `env_vars.sh`:

```ini
# /etc/systemd/system/next-maahir.service
[Service]
WorkingDirectory=/var/www/html/maahir
EnvironmentFile=/var/www/html/maahir/env_vars.sh
ExecStart=/root/.nvm/versions/node/v24.15.0/bin/node .next/standalone/server.js
Restart=always
Environment=PORT=3000 HOSTNAME=0.0.0.0
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart next-maahir
sudo systemctl status next-maahir --no-pager
```

Nginx tetap reverse-proxy ke `127.0.0.1:3000` (config lama). Pastikan
`client_max_body_size 64m;` ada (untuk upload audio setoran).

---

## 8. Verifikasi (WAJIB sebelum buka maintenance)

```bash
# 1. Health — cek env kebaca
curl -s http://localhost:3000/api/health | jq
#   harap: ok:true, DATABASE_URL_set:true, STORAGE_DIR terisi

# 2. Set password uji utk 1 akun (mis. koordinator), lalu login manual di browser
sudo -u postgres psql -d maahir -c "
  UPDATE koordinator SET password_hash =
  '\$2a\$12\$<hash>' WHERE whatsapp_number='6285822950406';"
#   (atau pakai script: npm run set-password — lihat package.json)
```

Cek manual di browser (pakai `?maintenance_bypass=<token>` kalau masih maintenance):
- Login tiap peran (peserta, musyrif, koordinator, syaikh, pengajar, ketua kelas).
- Buka dashboard koordinator → daftar peserta + kelas + musyrif tampil.
- Buka 1 setoran → data tampil (audio lama tak ada; wajar).
- Submit 1 setoran baru + rekaman → cek file muncul di `${STORAGE_DIR}/setoran-audio/`.

---

## 9. Matikan maintenance → situs normal

Set `MAINTENANCE_MODE=off` (di env_vars.sh / Variable Group), lalu redeploy /
restart service. Situs kembali normal.

---

## 10. Deploy berikutnya (pipeline)

Repo auto-deploy via Azure DevOps: **push ke `main`** → SSH ke server →
`git reset --hard` → `npm install` → `npm run build` → `systemctl restart
next-maahir`. Jadi update = merge ke `main`. (Kalau tak pakai pipeline, ulangi
langkah 7 manual.)

---

## 11. Troubleshooting

| Gejala | Sebab & solusi |
|--------|----------------|
| Halaman "Terjadi kendala" / 500 | Cek `journalctl -u next-maahir -n 50`. Sering: `DATABASE_URL belum di-set` atau Postgres tak jalan. |
| `DATABASE_URL belum di-set` | Env tak ter-load service. Pastikan `EnvironmentFile` benar & `env_vars.sh` berisi `export DATABASE_URL=...` atau `DATABASE_URL=...`. |
| `password authentication failed` | Password/user di `DATABASE_URL` salah, atau `pg_hba.conf` belum izinkan md5/scram utk localhost. |
| Login gagal semua | Cek tabel terisi (`SELECT count(*) FROM koordinator`). Hash bcrypt cost 12. |
| Audio 404 saat play | Wajar untuk rekaman LAMA (tak dimigrasikan). Rekaman baru harus muncul di `${STORAGE_DIR}`. |
| Situs selalu 503 maintenance | `MAINTENANCE_MODE` masih `on`/`auto`. Set `off` + restart. |
| Upload audio gagal (413) | Nginx `client_max_body_size 64m;` belum ada. |

### Uji lokal tanpa Postgres sistem (dev)
```bash
npm run test-restore   # restore schema+data di PGlite (WASM) — cek baris + FK
npm run test-shim      # 18 pola query aplikasi (embed/or/count/upsert)
```

---

## 12. Referensi berkas

- `db-migration/README.md` — detail teknis migrasi DB.
- `db-migration/maahir_full_dump.sql` — dump restore satu-file (dari paket handoff).
- `src/lib/pg-shim.ts` — shim yang menggantikan supabase-js (kalau perlu menambah
  operator query baru, di sini tempatnya).
- `src/lib/pg-storage.ts` + `src/app/api/audio/` — storage audio filesystem.
- `.env.example` — daftar env lengkap.
