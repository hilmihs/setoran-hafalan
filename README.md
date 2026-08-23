# Maahir

Platform internal program pendidikan Qur'an (produksi: `maahir.muhajirproject.org`).
Berawal dari setoran hafalan pekanan dengan pemeriksaan musyrif, kini berkembang jadi
multi-modul: HITS (kompetensi & disiplin pengajar), Evaluasi Halaqah (penilaian bacaan
per-Lahn), kehadiran, observasi ketua kelas, Shakwa (aduan/izin), laporan, Matrix Skill
Guru, dan API publik read-only. Bahasa domain **Indonesia** — ikuti saat menamai & menulis UI.

> **Arsitektur lengkap ada di [`CLAUDE.md`](./CLAUDE.md)** — auth multi-role, shim
> `supabaseAdmin`, subsystem map, API publik, sinkron HITS/hilmihs, deploy. Baca itu
> sebelum menyentuh banyak file.

## Tech Stack

- **Next.js 14** (App Router) + TypeScript, `output: standalone`
- **PostgreSQL 17** langsung via `node-postgres` — **bukan Supabase**. `supabaseAdmin`
  (`src/lib/supabase-admin.ts`) adalah shim query-builder di atas `pg`, bukan client Supabase.
- **Storage audio = filesystem lokal** (`${STORAGE_DIR}/${bucket}/…`), disajikan lewat
  `/api/audio` dengan signed URL dari `SESSION_SECRET`.
- **iron-session** + **bcryptjs** untuk auth (identitas = nomor WhatsApp, multi-role).
- **Tailwind** + kelas semantik `globals.css`.

## Setup

```bash
npm install
cp .env.example .env.local     # isi DATABASE_URL, STORAGE_DIR, SESSION_SECRET, NEXT_PUBLIC_APP_URL
```

Terapkan migration ke DB dev (jangan `npm run db` — itu menembak PRODUKSI):

```bash
npm run apply-migration -- supabase/migrations/0001_initial_schema.sql
# ulangi per file, atau pakai skrip seed yang relevan
npm run seed                   # data dummy (password default 'password123')
npm run dev                    # http://localhost:3000
```

## Perintah

```bash
npm run dev          # dev server
npm run build        # next build + postbuild
npm run lint         # eslint
npm run typecheck    # tsc --noEmit — jalankan setelah tiap perubahan TS
npm run apply-migration -- <file.sql>   # apply migration ke DATABASE_URL
```

Skrip `test-*` / `seed-*` di `package.json` adalah **skrip `tsx` mandiri** (`scripts/*.ts`),
bukan framework test. "Jalankan satu test" = jalankan satu npm script (mis. `npm run test-ranking`).

> ⚠ **`npm run db` menembak PRODUKSI** (CLI atas endpoint admin `/api/admin/db`), bukan
> Postgres lokal. Tulis butuh `--confirm`. Untuk dev/seed pakai `DATABASE_URL` lokal +
> `supabaseAdmin`. Detail di `CLAUDE.md`.

## Deploy

Azure Pipelines (`azure-pipelines.yml`) build di branch `main` → kirim ke VPS via SSH/SCP,
jalan di bawah systemd `next-maahir.service`. Env dari Azure Variable Group (prefix `ENV_`)
→ `maahir.env`. Setup server manual: `HANDOFF.md`.

## Catatan teknis

### Pemisahan ikhwan/akhwat
Berlapis: URL routing, filter kolom `gender` per-query, dan trigger SQL yang memastikan
peserta/pengajar hanya masuk ke kelas dengan gender cocok.

### Keterbatasan wa.me
Notifikasi via `wa.me/<nomor>?text=…` membuka WhatsApp dengan pesan pre-filled — user
**tetap harus tap Kirim**. Cukup untuk volume kecil; automation penuh butuh WhatsApp
Business API / pihak ketiga.

### Retensi audio (`scripts/cleanup-audio.ts`)
- Belum dicek: dihapus 3 pekan sejak `recorded_at` bila `checked_at IS NULL`.
- Sudah dicek: dihapus 1 pekan setelah `checked_at`.

Audit (nilai + masukan) tetap di tabel `rekaman`; hanya file storage dihapus + `audio_url`
di-null-kan. Panggil via cron.
