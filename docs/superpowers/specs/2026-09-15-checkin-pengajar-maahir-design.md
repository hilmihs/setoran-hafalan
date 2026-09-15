# Check-in Kehadiran Pengajar Kelas Maahir

Tanggal: 2026-09-15. Mulai berlaku: **2026-09-16**.

## Masalah

Kehadiran pengajar kelas Maahir (6A–6D akhwat) belum terekam sama sekali —
laporan bulanan memakai angka default 100%. Koordinator butuh: pengajar
check-in di awal sesi, menuliskan materi pertemuan, lalu rekap bulanan
(16 bulan lalu s/d 15 bulan ini) dengan rincian per pengajar berikut capaian
materinya.

Jadwal yang diberikan (semua sudah ada di `program_kelas`, jam cocok):

| Pengajar | Kelas | Jadwal |
|---|---|---|
| Ustadzah Salma (koordinator, WA …3097) | Maahir 6C | Senin & Kamis 07.30–09.00 |
| Ustadzah Salma | Maahir 6D | Senin & Kamis 12.30–14.00 |
| Ustadzah Radiatam Mardhiyah (akun koordinator "Reda", WA …6563) | Maahir 6A | Senin & Kamis 09.00–10.30 |
| Ustadzah Ruqayyah (pengajar HITS, WA …2400) | Maahir 6B | Senin & Kamis 12.30–14.00 |

Pemantau rekap: Ustadzah Wilda, Ustadzah Salma, Ustadz Ahmad Abdus Syukur,
Ustadz Abdul Muhsin (semuanya role koordinator) + superadmin. Koordinator
aktif ada 9, jadi role saja tidak cukup — perlu penanda.

## Keputusan desain

1. **Akses diturunkan dari nomor WA, bukan role sesi baru.** Tabel
   `maahir_pengajar` menyimpan nama, gender, WA, `active`; siapa mengajar kelas
   apa di `maahir_pengajar_kelas`. Guard halaman = `getSessionWa()` →
   `findPengajarMaahir(wa)`, sama seperti ketua kelas Maahir
   (`findKetuaProgramKelas`). Tak ada password baru, tak perlu logout–login,
   login lewat akun mana pun yang sudah dimiliki. Syarat: orangnya sudah punya
   akun di salah satu tabel role (keempat ustadzah sudah).
2. **Pemantau rekap** = superadmin ATAU baris `koordinator` dengan kolom baru
   `rekap_pengajar_maahir = true`. Dicek per-request, jadi tanpa re-login.
3. **Tanpa aturan terlambat.** Jam check-in dicatat apa adanya dan ditampilkan.
4. **Sesi terjadwal** diturunkan dari `program_kelas.jadwal_hari` + jam,
   dikurangi `program_kelas_libur` (`getLiburDatesForKelas`) — tak ada input
   jadwal baru. Hanya program `kelas_maahir` (sesi At-Tibyan Sabtu yang
   disisipkan `expectedDaysInRange` dibuang).
5. **Periode 16–15**: bulan `YYYY-MM` = 16 bulan sebelumnya s/d 15 bulan itu.
   Helper murni `periode-pengajar.ts`. Anchor `CHECKIN_PENGAJAR_ANCHOR =
   '2026-09-16'`; periode pertama = `2026-10` (16 Sep–15 Okt).
6. **Pengisian & sunting hanya periode berjalan.** Sesi hari ini → check-in;
   sesi lampau periode ini yang belum diisi → boleh disusulkan, ditandai
   `susulan = true`. Materi dan catatan boleh disunting selama periodenya
   masih berjalan. Lewat tanggal 15 → terkunci; koreksi lewat superadmin.
7. **Materi opsional saat check-in** (boleh diisi setelah kelas), tapi rekap
   menandai "materi belum diisi".
8. Angka "Kehadiran pengajar 100% default" di laporan bulanan **dibiarkan** —
   periodenya beda (28–27). Bisa disambung belakangan.

## Skema (`supabase/migrations/0076_maahir_checkin_pengajar.sql`)

```sql
create table maahir_pengajar (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender text not null check (gender in ('ikhwan','akhwat')),
  whatsapp_number text not null unique,     -- normalized 62xxx
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table maahir_pengajar_kelas (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references maahir_pengajar(id) on delete cascade,
  program_kelas_id uuid not null references program_kelas(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pengajar_id, program_kelas_id)
);
create table maahir_checkin_pengajar (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references maahir_pengajar(id) on delete cascade,
  program_kelas_id uuid not null references program_kelas(id) on delete cascade,
  tanggal date not null,
  status text not null check (status in ('hadir','izin','sakit')),
  checked_in_at timestamptz not null default now(),   -- jam isi, apa adanya
  susulan boolean not null default false,             -- diisi bukan di hari-H
  materi text,
  catatan text,                                       -- alasan izin/sakit dsb.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pengajar_id, program_kelas_id, tanggal)
);
create index on maahir_checkin_pengajar (tanggal desc);
alter table koordinator add column rekap_pengajar_maahir boolean not null default false;
-- RLS enable (konvensi 0005) — tak dipakai untuk otorisasi.
```

Data awal TIDAK di file migrasi (nomor WA prod tak boleh masuk repo):
`scripts/sql/0076-rilis-checkin-pengajar-maahir.sh` menyalin WA dari baris
koordinator/pengajar yang sudah ada (dicocokkan lewat id) — 3 baris
`maahir_pengajar` (Salma mengampu 2 kelas), 4 baris `maahir_pengajar_kelas`,
dan flag `rekap_pengajar_maahir` untuk 4 koordinator pemantau.

`src/types/db.ts` ditambah `MaahirPengajar`, `MaahirPengajarKelas`,
`MaahirCheckinPengajar`.

## Modul (`src/lib/maahir-checkin-pengajar.ts` + `periode-pengajar.ts`)

- `periodePengajarOf(tanggal)`, `periodePengajarRange(month)` → `{start,end}`,
  `periodePengajarBerjalan()`, `periodePengajarTerbuka(tanggal)`,
  `periodePengajarOptions()` (sejak anchor).
- `findPengajarMaahir(wa)` → `{ pengajar, kelas: ProgramKelasRow[] } | null`.
- `bolehLihatRekapPengajarMaahir()` → superadmin || koordinator flag.
- `sesiTerjadwal(kelas, start, end)` → tanggal kelas_maahir minus libur.
- `getSesiPengajar(pengajarId, kelasList, month)` → per sesi: tanggal, kelas,
  jam, checkin | null, `bolehIsi` (periode berjalan & tanggal ≤ hari ini).
- `getRekapPengajar(month)` → semua pengajar aktif: terjadwal (yang sudah
  lewat), hadir, izin, sakit, belum diisi, persen = hadir / terjadwal-lewat,
  materi terisi / hadir; plus rincian sesi tiap pengajar.
- `simpanCheckin({ pengajar, kelasId, tanggal, status, materi, catatan })`
  (server action wrapper memanggil ini): validasi kelas milik pengajar, tanggal
  terjadwal, periode terbuka, tanggal ≤ hari ini; upsert; `susulan = tanggal <
  hari ini` saat baris pertama dibuat; audit `maahir_checkin.submit`.
- `suntingMateri(...)` — update materi/catatan bila periode masih terbuka.

## Halaman

- `/kehadiran/pengajar-maahir` (server page, guard WA): topbar + FeatureNav;
  sesi hari ini (kartu per kelas: status terisi + jam, atau form check-in:
  status hadir/izin/sakit, materi, catatan); sesi lampau periode ini belum
  diisi (form susulan); ringkasan periode berjalan (terjadwal/hadir/izin/
  sakit/belum); tautan ke rinci.
- `/kehadiran/pengajar-maahir/rekap?bulan=` — rincian sendiri: tabel tanggal ·
  kelas · status · jam · materi · catatan, materi bisa disunting inline bila
  periode terbuka.
- `/2in1/koordinator/kehadiran/pengajar?bulan=` (guard pemantau): ringkasan
  semua pengajar + rincian per pengajar (SearchableBlocks/`<details>`), tombol
  Export Excel → `/api/laporan/kehadiran-pengajar/download?bulan=`.
- Home (`src/app/page.tsx`): kartu sintetis "Check-in Kelas Maahir" bila
  `findPengajarMaahir(wa)`; kartu "Rekap Kehadiran Pengajar Maahir" bila
  pemantau. FeatureNav: `featureLinksFor` dapat opsi `pengajarMaahir` &
  `rekapPengajarMaahir` dan dua entri `FEATURE_LINKS` bertanda
  `requires: 'pengajarMaahir' | 'rekapPengajarMaahir'`.
- Hub `/2in1/koordinator/kehadiran`: tautan ke rekap pengajar bila pemantau.

Semua mutasi = Server Actions (`actions.ts` di dir rute). Format jam WIB
`HH.MM`, tanggal `Sen, 16 Sep`.

## Excel

`src/lib/kehadiran-pengajar-xlsx.ts` (exceljs): sheet 1 "Rekap" (pengajar,
kelas, terjadwal, hadir, izin, sakit, belum, %); sheet 2 "Rincian" (pengajar,
kelas, tanggal, status, jam, susulan, materi, catatan). Judul memuat label
periode 16–15.

## Uji

- `scripts/test-checkin-pengajar.ts` (PGlite, pola `test-sp-pemutihan.ts`):
  periode 16–15 (batas tahun), sesi terjadwal minus libur, check-in hari-H vs
  susulan, tolak tanggal tak terjadwal / periode tertutup / kelas bukan
  miliknya, rekap persen & materi-belum-diisi. Skrip npm `test-checkin-pengajar`.
- `npm run typecheck`.

## Rilis

1. Merge kode → deploy (pipeline `maheer`).
2. Jalankan `scripts/sql/0076-rilis-checkin-pengajar-maahir.sh` dari root repo
   (DDL per statement + seed 3 pengajar, 4 pemetaan kelas, flag 4 pemantau;
   idempoten, berbasis uuid, tanpa nomor WA literal). Harus dijalankan user
   sendiri — `npm run db -- --confirm` ditolak untuk asisten.
3. Verifikasi: login sebagai Ustadzah Salma → kartu "Check-in Kelas Maahir"
   muncul di beranda; koordinator pemantau → rekap terbuka; koordinator lain →
   tautan tak tampil dan halaman mengalihkan ke beranda.
