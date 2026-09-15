# Laporan Bulanan Maahir — riwayat SP & alasan tidak hadir

Tanggal: 2026-09-15. Cabang: `feat/dashboard-evaluasi-filter`.

## Masalah

Laporan bulanan Maahir (`/2in1/laporan/maahir` + export Excel) hanya
menampilkan angka: "SP2, alpa 1, izin 3" atau "kehadiran 60%, tidak hadir 4x".
Pembaca laporan tak bisa melihat **mengapa** — tanggal berapa, izin atau alpa,
dan alasan yang diisi ketua kelas. Koordinator harus membuka halaman lain untuk
menjawab "kok dia kena SP?".

## Sasaran

Semua di laporan bulanan, rentang periode tetap **28 bulan lalu s/d 27 bulan
ini** (`monthRange` untuk kehadiran; `getMaahirSP({ bulan })` untuk SP —
keduanya sudah memakai `periodeStartDate`/`periodeEndDate`; awal akumulasi
per kelas dari `spMulaiKelas` tetap berlaku, mis. periode Agustus 2026 untuk
kelas umum mulai 1 Agustus, bukan 28 Juli).

1. **Blok Pendataan SP** — tiap peserta punya daftar kronologis sesi
   pelanggaran yang membentuk SP-nya:
   `04/09 Maahir · izin — "sakit gigi"`, `11/09 At-Tibyan · alpa → SP1`, …
   Sesi yang diputihkan tak tampil (memang sudah tak dihitung). Tanda `→ SPn`
   pada sesi yang membuat hitungannya menembus ambang.
2. **Tabel "peserta di bawah target"** (Takhassus, Maahir, At-Tibyan) — kolom
   Keterangan diganti daftar per sesi tidak hadir: tanggal · status
   (izin/sakit/alpa/tanpa ket.) · alasan. Sakit tetap tampil (ditandai udzur)
   walau tak menggerus persen. "Tanpa ket." = pertemuan terisi untuk kelasnya
   tapi peserta ini tak punya baris presensi.
3. Muncul di halaman web **dan** export Excel (sel multi-baris, tinggi baris
   menyesuaikan).

## Sumber data

- `kehadiran_peserta.catatan` — alasan yang diisi ketua kelas (wajib untuk
  izin/alpa di `PresensiWizardForm`).
- `pertemuan_program.program` — `kelas_maahir` | `at_tibyan`, untuk label.

Kedua kolom sudah terekspos di API publik (`registry.ts`), jadi menambahkan
riwayat ke `SPPeserta`/`StudentAtt` tak membuka data baru.

## Perubahan

### `src/lib/maahir-sp.ts`
- `SesiSP` diperkaya: `program`, `kelasName`, `catatan`.
- Tipe baru `SesiRiwayatSP = { tanggal, program, kelasName, jenis, catatan,
  menjadi: 1|2|3|null }` dan fungsi murni `susunRiwayat(sesi)` yang mengurutkan
  menaik (tanggal, lalu program) dan menandai `menjadi` dengan logika yang sama
  dengan `hitungPenetapan`.
- `SPPeserta.riwayat: SesiRiwayatSP[]`. Query kehadiran ikut menarik `catatan`.

### `src/lib/laporan-maahir.ts`
- Tipe baru `SesiTakHadir = { tanggal, status: 'izin'|'sakit'|'alpa'|
  'tanpa_keterangan', catatan }`; `StudentAtt.riwayat: SesiTakHadir[]`.
- Loop kehadiran menyimpan baris per `anggota|scope|pertemuan`; `studentsFor`
  menyusun riwayat dari pertemuan terisi yang lolos saringan periode & pemutihan
  (penyebut yang sama dengan `terisi`), sehingga jumlah izin+alpa+tanpa ket.
  = `tidakHadir`.
- `keterangan` lama tetap ada (kompatibilitas), tapi UI memakai `riwayat`.

### UI & Excel
- `page.tsx`: `BawahTargetTable` kolom Keterangan → daftar riwayat; `SPBlock`
  tambah kolom Riwayat.
- `laporan-maahir-xlsx.ts`: `dataRow` menaikkan tinggi baris bila ada teks
  multi-baris; tabel SP dapat kolom Riwayat; kolom Keterangan tabel di bawah
  target berisi riwayat.

### Uji
- `scripts/test-sp-pemutihan.ts`: seed kelas diganti nama yang cocok pola
  kumulatif penuh (`Maahir 6A - Ikhwan`) karena `SP_START_UMUM` membuat sesi
  Maret 2026 tersaring (baseline sudah gagal 22 sebelum perubahan ini); tambah
  kasus riwayat (urutan, `menjadi`, `catatan` terbawa, sesi diputihkan hilang).
- `npm run typecheck`.
