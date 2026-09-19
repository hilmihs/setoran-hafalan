# Presensi Halaqah Tahfizh Akhwat — rapikan takhassus & At-Tibyan

Tanggal: 2026-09-18. Status: disetujui pemilik produk (percakapan 18 Sep).

## Latar

Sejak 15 Sep 2026 presensi akhwat yang mengikuti halaqah syaikhah dipecah
menjadi 10 kelas `program_kelas` per hari: `Maahir Halaqah Pagi (Senin…Jum'at)`
dan `Maahir Halaqah Siang (Senin…Jum'at)`. Anggota dan `ketua_wa` sudah sesuai
jadwal resmi (Nafilah: Pagi Senin & Jum'at; Feni: Pagi Selasa & Kamis; Lubna:
Pagi Rabu; Ruqayyah: seluruh Siang). Dua hal belum beres.

1. **Anggota takhassus ikut tercantum di halaqah.** Salma, Radiatam, dan
   Annida adalah anggota `Maahir Takhassus Akhwat` (ketua Salma), tetapi juga
   terdaftar di beberapa kelas halaqah. Jam takhassus (Sel/Rab/Jum 09.00–11.30)
   sama dengan Halaqah Pagi, sehingga kehadiran pagi mereka tercatat dua kali,
   dan SP (dijumlah per WA lintas kelas) ikut dobel. Keputusan: presensi
   anggota takhassus **hanya** oleh ketua kelas Takhassus; sesi siang tambahan
   mereka tidak dipresensi.
2. **At-Tibyan tertagih berulang.** Setiap kelas `harian` otomatis menagih satu
   sesi At-Tibyan tiap Sabtu (`expectedDaysForKelas`). Dengan 10 kelas dan satu
   orang di sampai 5 kelas, Ruqayyah ditagih 5 form At-Tibyan tiap Sabtu dan satu
   alpa Sabtu dihitung 5× di SP serta tampil 5× di rekap At-Tibyan. Keputusan:
   At-Tibyan akhwat halaqah + takhassus diisi **satu orang, satu form**:
   Annidaul Jannah.

Nama resmi programnya "Halaqah Tahfizh"; nama kelas mengikuti.

## Bagian 1 — Data prod (tanpa perubahan kode)

### 1a. Cabut anggota takhassus dari kelas halaqah

`program_kelas_anggota.active = false` untuk 8 baris berikut (semua
`mulai_tanggal = 2026-09-15`, baru 1 baris kehadiran: Radiatam, Pagi Rabu 16 Sep):

| Nama | WA | Kelas |
|---|---|---|
| Salma | 6282136573097 | Pagi (Selasa), Pagi (Jum'at), Siang (Selasa) |
| Radiatam Mardhiyah | 6281261306563 | Pagi (Rabu), Pagi (Jum'at) |
| Annidaul Jannah | 6285788064547 | Siang (Senin), Siang (Rabu), Siang (Jum'at) |

Dipakai `active=false`, bukan `selesai_tanggal`: baris ini salah masuk, bukan
perpindahan, dan rekap/SP/form ketua semuanya sudah menyaring `active`.
Baris kehadiran Radiatam 16 Sep dibiarkan (yatim, tak dibaca karena anggotanya
nonaktif).

### 1b. Rename 10 kelas

`Maahir Halaqah Pagi (X)` → `Maahir Halaqah Tahfizh Pagi (X)`,
`Maahir Halaqah Siang (X)` → `Maahir Halaqah Tahfizh Siang (X)`.

Tak ada efek samping di Matrix: sejak `0082` (matrix blok akhwat) blok akhwat
disimpan di `pengajar.matrix_blok`, bukan diturunkan dari nama kelas;
`jenisKelasMaahir()` (prefiks `tahfi`) hanya dipakai untuk ikhwan. Tidak ada
kode lain yang mencocokkan nama `Halaqah Pagi/Siang`.

## Bagian 2 — Kolom `ikut_tibyan` + kelas At-Tibyan gabungan

### Skema — migrasi `0083_program_kelas_ikut_tibyan.sql`

```sql
alter table program_kelas
  add column if not exists ikut_tibyan boolean not null default true;
comment on column program_kelas.ikut_tibyan is
  'Bila false, kelas ini tidak ditagih sesi At-Tibyan Sabtu. Dipakai kelas halaqah per-hari akhwat yang At-Tibyan-nya dicatat lewat kelas gabungan.';
```

Default `true` → semua kelas lama berperilaku persis seperti sekarang. Nomor
`0083`: `0077`–`0082` sudah terpakai di cabang lain (`0082` = matrix-blok-akhwat) (cek `git log --all`).

### Kode

- `src/lib/maahir-presensi.ts` — `expectedDaysForKelas`: cabang harian hanya
  menyisipkan sesi `at_tibyan` bila `k.ikut_tibyan !== false`. Cabang mingguan
  tidak tersentuh (memang tanpa At-Tibyan). Karena `getUnfilledMaahirDays`,
  `getUnfilledDaysForAnggota`, `maahir-rekap`, `laporan-maahir`,
  `maahir-checkin-pengajar`, dan `maahir-mandiri/actions` semuanya lewat fungsi
  ini, tagihan, penyebut rekap, dan laporan ikut otomatis.
- `src/lib/program-kelas.ts` — `ProgramKelasRow` tambah `ikut_tibyan: boolean`;
  `PK_COLS` tambah kolomnya.
- `src/lib/maahir-rekap.ts` (query kelas ±baris 112) dan
  `src/lib/laporan-maahir.ts` (±baris 230) menulis daftar kolom kelas sendiri,
  bukan lewat `PK_COLS` — keduanya tambah `ikut_tibyan`. (Kasus `mulai_tanggal`
  di `8b76ded` terjadi karena kolom tertinggal di satu query; jangan terulang.)
  `maahir-sp.ts` tak perlu: ia menghitung baris `pertemuan_program` nyata, tak
  memakai `expectedDaysInRange`. `maahir-checkin-pengajar.ts` sudah lewat `PK_COLS`.
- `src/lib/api-public/registry.ts` — entitas `program-kelas` tambah kolom
  `ikut_tibyan` (boolean, bukan rahasia; lolos audit `FORBIDDEN_COLUMNS`).
- `scripts/seed-program-kelas.ts` dan skrip uji yang membuat literal
  `ProgramKelasRow` (`test-setoran-target`, `test-sp-pemutihan`,
  `test-bulk-pemutihan`, `test-checkin-pengajar`) tambah `ikut_tibyan: true`
  agar typecheck lolos.

Tidak ada UI baru: kolom diatur lewat SQL admin, sama seperti `self_attendance`
dan `presensi_sifat`.

### Data prod (setelah migrasi)

1. `ikut_tibyan = false` untuk 10 kelas Halaqah Tahfizh **dan**
   `Maahir Takhassus Akhwat` (11 baris). Takhassus Ikhwan dan kelas lain tetap
   `true`.
2. Kelas baru:
   - `name`: `Maahir Halaqah Tahfizh (At-Tibyan)`; `gender`: akhwat;
     `jadwal_hari`: `{}` (tak ada sesi kelas_maahir); `waktu_mulai/selesai`:
     08:30/10:30; `ketua_wa`: 6285788064547 (Annidaul Jannah); `wakil_wa`: null;
     `self_attendance`: false; `presensi_sifat`: harian; `mulai_tanggal`:
     2026-09-15; `ikut_tibyan`: true.
   - Anggota 28 orang, `mulai_tanggal = 2026-09-15`: 24 nama unik dari 10 kelas
     halaqah (setelah 1a) + 4 anggota Takhassus Akhwat (Salma, Radiatam,
     Annida, Nur Afifah). `is_ketua = true` untuk Annida. Khoirun Nisa ber-WA
     null — boleh, `UNIQUE (program_kelas_id, whatsapp_number)` mengizinkan null.
   - Sesi At-Tibyan Sabtu 19 Sep 2026 adalah tagihan pertama.

Kelas Talaqqi lama, 6A–6D, dan Intensif tidak berubah: anggotanya tidak
beririsan dengan halaqah, At-Tibyan mereka tetap lewat ketua masing-masing.

### Perilaku yang dihasilkan

- Ketua halaqah per-hari hanya ditagih hari jadwalnya. Sabtu tidak muncul.
- Annida: menu ketua kelas menampilkan satu kelas, tagihan satu form At-Tibyan
  per Sabtu untuk 28 orang; tombol Libur berlaku seperti biasa.
- Salma: tetap ketua Takhassus (Sel/Rab/Jum), tak lagi ditagih At-Tibyan.
- SP dan rekap At-Tibyan: satu baris per orang per Sabtu.
- Rekap koordinator tampilan `kelas_maahir` akan memuat kelas At-Tibyan dengan
  0 pertemuan; rekap `at_tibyan` memuat 28 orang di satu kelas. Diterima.
- Laporan bulanan blok At-Tibyan menghitung per anggota-kelas; karena kini satu
  orang satu baris, rata-ratanya tak lagi bias ke orang yang ada di banyak kelas.

## Urutan rilis

1. DDL `0083` **lebih dulu** lewat `/api/admin/db` (`npm run db -- --confirm`,
   dijalankan pemilik; asisten menyiapkan perintah + jumlah baris yang
   diharapkan). Kolom ber-default aman untuk kode lama; sebaliknya kode baru
   men-`select ikut_tibyan` dan akan gagal bila kolomnya belum ada.
2. Merge + deploy kode (default `true` → tanpa perubahan perilaku sampai data
   diubah).
3. DML Bagian 1 (8 update anggota, 10 rename), lalu Bagian 2 (11 update
   `ikut_tibyan`, 1 insert kelas, 28 insert anggota). Verifikasi dengan
   `SELECT` sebelum Sabtu 19 Sep.
4. Beri tahu Annida (akun ketua lewat WA-nya sudah ada: ia anggota takhassus →
   punya akun peserta) dan Salma.

## Pengujian

- `npm run typecheck`.
- `npm run test-target`: angka 21 sesi takhassus ikhwan tetap (kolom baru
  default `true`, At-Tibyan tetap disaring `program === 'kelas_maahir'`).
- Tambah kasus murni di `scripts/test-setoran-target.ts` (atau skrip kecil
  baru `scripts/test-presensi-tibyan.ts`): kelas harian `ikut_tibyan=false`
  dengan `jadwal_hari=['Senin']` pada rentang yang memuat Sabtu → tak ada
  `at_tibyan`; kelas `jadwal_hari=[]`, `ikut_tibyan=true` → hanya `at_tibyan`
  tiap Sabtu; kelas default → perilaku lama.
- Setelah DML: `SELECT` cek 11 kelas `ikut_tibyan=false`, 28 anggota kelas
  At-Tibyan, 8 anggota nonaktif; buka `/2in1/ketua-kelas` sebagai Annida
  ("login sebagai") → tagihan At-Tibyan Sabtu 19 Sep muncul, Ruqayyah tidak.

## Di luar cakupan

- UI koordinator untuk mengatur `ikut_tibyan`.
- Presensi sesi siang tambahan anggota takhassus (diputuskan tidak dicatat).
- Blok Matrix akhwat (cabang terpisah).
