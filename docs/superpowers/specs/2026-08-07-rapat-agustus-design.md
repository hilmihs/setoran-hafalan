# Tindak lanjut rapat Agustus 2026 — desain

Lima item dari catatan rapat, sudah dibrainstorm bersama user 2026-08-07.
Item SP (nomor 1) **sudah selesai & ter-deploy** (`1a18cb4`); sisanya belum dikerjakan.

---

## 1. SP + pemutihan — SELESAI (`1a18cb4`, deploy 2026-08-07)

Pemutihan bisa per-tanggal (`maahir_pemutihan.tanggal`, NULL = sebulan penuh),
pembatalan meninggalkan jejak (`dibatalkan_pada`/`dibatalkan_oleh`, indeks unik
parsial), daftar SP menampilkan SP efektif + `spKotor` dan menahan peserta yang
SP-nya luruh sebagai bank data, aksi memutihkan pindah ke
`/2in1/koordinator/kehadiran/sp/[anggotaId]`. Uji: `npm run test-sp` (29 assertion).

**Sisa keputusan user:** 3 baris pemutihan Juli (Tasmiah, Recca, Saad — dibuat
Wildatun Uyun 02-08) masih berbentuk sebulan-penuh. Kalau maksud aslinya hanya
satu-dua tanggal, ketiganya perlu dibatalkan lalu diputihkan ulang per-tanggal —
tapi itu mengubah angka laporan Juli yang sudah beredar, jadi menunggu perintah.

**Selesai 2026-08-08.** Recca & Saad dikonversi ke per-tanggal — pemutihan
sebulan ikut menghapus 10 dan 5 kehadiran mereka; kini hanya sesi izin/alpa yang
dianulir, dan baris sebulannya ditandai dibatalkan sebagai jejak. Tasmiah
**dibiarkan sebulan penuh**: seluruh 9 sesinya izin dengan alasan "ibu sakit",
jadi bentuk sebulan memang yang tepat. SP ketiganya tak berubah.

Matrix juga sudah dihitung ulang untuk Jun–Agu lewat
`POST /api/admin/recompute-matrix` (token sama dengan /api/admin/db) — ternyata
tak perlu koordinator membuka halaman, berbeda dari dugaan awal.

---

## 2. Export XLSX + halaman cetak — `/hits/koordinator?mode=bulan`

Permintaan user: export XLSX rapi **dan** PDF untuk halaman ranking disiplin HITS.

**PDF tidak dibuat di server.** Repo nol library PDF; `output: 'standalone'` bikin
paket yang membaca file dari `node_modules` saat runtime (pdfkit & .afm-nya) gagal
hanya di prod; memori mencatat react-pdf pernah OOM di VPS. Keputusan: **halaman
cetak** `/hits/koordinator/cetak` dengan `@media print` — user menekan Ctrl+P →
Save as PDF. Warna merah/kuning/hijau dipaksa ikut tercetak
(`print-color-adjust: exact`), header tabel berulang tiap halaman, kontrol
navigasi/sort disembunyikan.

**XLSX** lewat ExcelJS mengikuti pola `src/lib/kehadiran-matrix-xlsx.ts` +
route `src/app/api/laporan/maahir/kehadiran/download/route.ts`.

Isi kedua export = blok yang sudah ada di halaman: ranking disiplin
(Pengajar · KMT · KBLA · JKG · TL · skor), rincian insiden per pengajar berikut
status tabayyun/putusan, cakupan observasi ketua kelas, dan daftar pengajar
tanpa data. Filter `month`/`gender` ikut dari querystring yang sama.

---

## 3. Cutoff presensi tanggal 28 (item 1️⃣4️⃣)

**Bentuk:** satu periode terbuka. Sebuah tanggal boleh ditulis hanya bila
`periodeMonthOf(tanggal) === periodeMonthOf(hari ini)`. Karena `periodeMonthOf`
(window 28–27, `maahir-pemutihan.ts`) berganti bulan tepat pada tanggal 28,
kuncinya jatuh sendiri tanpa penjadwal apa pun.

**Cakupan kunci — ketiga jalur tulis + pembuat induknya:**
- `PUT /api/2in1/kehadiran/[pertemuan_id]` (ketua kelas)
- `submitSelfPresensi` di `2in1/maahir-mandiri/actions.ts` (peserta Takhassus)
- `POST /api/2in1/setoran-kelas` (setoran halaman)
- pembuatan `pertemuan_program` tanggal lama: `ketua-kelas/presensi/page.tsx`
  (upsert saat render), `maahir-mandiri/actions.ts`, `POST /api/2in1/pertemuan`

Alat koordinator (pemutihan, libur, laporan) **tidak** dikunci.

**Sesi yang telanjur belum terisi saat kunci jatuh:** hangus untuk peserta — tak
ada yang kena alpa gara-gara ketuanya lalai — tetapi jumlahnya dilaporkan sebagai
"presensi tak terisi: N sesi" per kelas di laporan bulanan, supaya kelalaian
tetap terlihat koordinator.

**Wajib menyertai kunci:** `getUnfilledMaahirDays` dan `getUnfilledDaysForAnggota`
harus berhenti menagih tanggal di luar periode terbuka. Tanpa itu banner
"N presensi belum diisi" menampilkan angka yang tak mungkin dinolkan.

**Konsekuensi yang diterima:** `PERIODE_DIBUKA` di `ketua-kelas/setoran/page.tsx`
turun dari 2 jadi 1 — alasan asli commit `6b167fe` (menyusulkan pertemuan sebelum
tanggal 28) memang ditiadakan oleh kebijakan ini.

---

## 4. Penilai ketua kelompok (item 7️⃣) — sebagian besar entri data

Akhwat **sudah lengkap**: Wildatun Uyun (4 kelompok), Andi Hikmah Amaliyah (5),
Rafika Salma (4) — 13 kelompok tercakup. Ikhwan **nol**.

Yang dikerjakan:
- Tugaskan di `penilai_ketua_kelompok`: Ahmad Abdus Syukur → Kelompok 1 & 2 Ikhwan,
  Ahmad Syukri → Kelompok 3, Muhammad Sofyan → Kelompok 4.
- `pengajar` "Rafika Salma" di-rename jadi **Rofiqotus Salma** (orang yang sama;
  penugasannya tak berubah).
- ⚠️ "Ahmad Abdus Syukur" punya **dua baris `pengajar`** (`5b4ef67b…`, `784e8060…`).
  Tentukan baris mana yang hidup sebelum menugaskan, jangan menugaskan yang duplikat.

Tak ada UI penugasan penilai di aplikasi (hanya `getKelompokDinilaiIds` untuk
membaca), jadi penugasan lewat SQL. Kalau ke depan sering berubah, UI penugasan
layak dibuat — di luar lingkup sekarang.

---

## 5. Manajemen halaqah & SOP → soft skill (item 1️⃣3️⃣)

Ubah `kategori` dua indikator di `src/lib/matrix-indicators.ts` dari `inspeksi`
jadi `soft`: `skor_manajemen_halaqah` (:111) dan `skor_kepatuhan_sop` (:143).
Sumber datanya **tidak** pindah (tetap Penilaian Pedagogis & Inspeksi/Observasi).

Akibat: blok Inspeksi tinggal 2 indikator, Soft Skill jadi 5. `KATEGORI_STANDAR`
keduanya sudah 4, jadi ambangnya tak berubah, tapi `rata_rata_pedagogis` dan
`rata_rata_soft_skill` di `matrix_rekap` bergeser untuk bulan yang dihitung ulang
(sejak `MATRIX_LIVE_ANCHOR = '2026-06'`). Bulan seed sebelumnya tetap memakai
pengelompokan lama — perbedaan ini harus disebut saat menyerahkan hasilnya.

---

## 6. PDF matrix berwarna (item 5️⃣)

Memakai mekanisme yang sama dengan bagian 2: halaman cetak untuk
`/matrix/koordinator`, memanfaatkan `scoreColor()` (`matrix-indicators.ts:189`,
standar 3.67) yang sudah ada. Dikerjakan setelah halaman cetak HITS terbukti
jalan, supaya polanya cuma ditulis sekali.

---

## Ditunda — perlu diperjelas di rapat

"Kehadiran anggota kelompok masuk ke matrix kehadiran." Matrix kehadiran yang ada
berisi **peserta Maahir** (grid peserta × tanggal), sedangkan anggota kelompok
adalah **pengajar** — dua populasi berbeda, dan belum jelas apakah yang diminta
presensi pertemuan kelompok (fitur baru) atau tampilan matrix per-pengajar.
