# Setoran Hafalan

Sistem setoran hafalan pekanan untuk peserta, dengan pemeriksaan oleh musyrif
dan monitoring oleh koordinator.

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (Postgres + Storage)
- **Tailwind CSS** untuk styling
- **iron-session** untuk session musyrif/koordinator
- **bcryptjs** untuk password hashing

## Setup

### 1. Install dependencies

```bash
pnpm install
# atau: npm install
```

### 2. Setup Supabase project

1. Buat project baru di [supabase.com](https://supabase.com)
2. Di SQL Editor, jalankan migration: `supabase/migrations/0001_initial_schema.sql`
3. Di Storage, buat bucket bernama `setoran-audio` (private — bukan public)

### 3. Konfigurasi environment

Copy `.env.example` ke `.env.local` dan isi:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`: dari Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY`: dari Project Settings → API (⚠ rahasia, jangan commit)
- `SESSION_SECRET`: generate dengan `openssl rand -base64 32`

### 4. Seed data dummy

```bash
pnpm seed
```

Akan membuat 1 koordinator, 2 musyrif, 2 kelas, dan 6 peserta dengan password
default `password123`. **Ganti password setelah seed:**

```bash
pnpm set-password
```

### 5. Run dev server

```bash
pnpm dev
```

Buka [http://localhost:3000](http://localhost:3000)

## Struktur Proyek

```
src/
  app/                  # Next.js App Router pages
    page.tsx            # Landing page
    ikhwan/             # Halaman peserta ikhwan
    akhwat/             # Halaman peserta akhwat
    musyrif/            # Login, dashboard, dan /musyrif/cek/[id]
    koordinator/        # Login & dashboard monitoring
    api/setoran/submit/ # Endpoint upload 3 audio + create setoran
  components/
    AudioRecorder.tsx   # MediaRecorder UI dengan play/re-record
    SetoranForm.tsx     # Form peserta (kelas → nama → 3 rekaman)
    CekForm.tsx         # Form pemeriksaan musyrif
    LoginForm.tsx       # Form login (musyrif & koordinator)
    PesertaPage.tsx     # Wrapper untuk halaman /ikhwan dan /akhwat
  lib/
    supabase-admin.ts   # Supabase client server-side (service role)
    supabase-browser.ts # Supabase client browser
    session.ts          # iron-session helpers
    week.ts             # Perhitungan pekan (Senin–Minggu, TZ Jakarta)
    whatsapp.ts         # Generate wa.me links + template pesan
  types/
    db.ts               # TypeScript types yang mirror schema database

scripts/
  seed.ts               # Seed data dummy
  set-password.ts       # Set password musyrif/koordinator
  cleanup-audio.ts      # Hapus audio > 12 pekan setelah checked

supabase/
  migrations/           # SQL migrations
```

## Roadmap Pengembangan

- [x] Schema database + migration
- [x] Project setup, types, helpers
- [x] Komponen `<AudioRecorder>` dengan MediaRecorder API
- [x] Halaman setoran peserta (pilih kelas → nama → rekam 3 audio → submit)
- [x] Halaman login + pemeriksaan musyrif
- [x] Integrasi wa.me untuk notifikasi (4 skenario)
- [x] Dashboard koordinator + tombol reminder
- [x] Script retensi audio (`pnpm cleanup-audio`) — pasang sendiri ke cron

## Catatan Teknis

### Pemisahan ikhwan/akhwat

Diterapkan di multiple layers:
1. URL routing (`/ikhwan`, `/akhwat`)
2. Server filter berdasarkan kolom `gender` di setiap query
3. Trigger SQL memastikan peserta hanya bisa dimasukkan ke kelas dengan
   gender yang cocok (same untuk musyrif → kelas)

### Keterbatasan wa.me

Link `wa.me/nomor?text=pesan` membuka WhatsApp dengan pesan pre-filled,
tapi user **tetap harus tap tombol Kirim**. Untuk volume kecil (30–100 peserta)
ini masih wajar. Kalau di masa depan butuh full automation, perlu upgrade ke
WhatsApp Business API atau third-party seperti Fonnte.

### Retensi audio

Dua aturan retensi (lihat `scripts/cleanup-audio.ts`):

- **Belum dicek** — audio dihapus jika sudah 3 pekan sejak `recorded_at`
  dan musyrif belum cek (`checked_at IS NULL`).
- **Sudah dicek** — audio dihapus 1 pekan setelah `checked_at`.

Audit trail (nilai + masukan) tetap di tabel `rekaman`, hanya file
storage yang dihapus + `audio_url` di-null-kan. Script dipanggil via
cron (mis. tiap hari).
# setoran-hafalan
