# Fitur Matrix Skill Guru HITS

Dokumentasi lengkap fitur-fitur dalam sistem Matrix Skill Guru HITS — platform penilaian kompetensi pengajar Halaqah Ilmu Tajwid & Sirah (HITS).

## Ringkasan

Sistem ini menilai 90+ pengajar HITS secara terstruktur melalui **3 kategori kompetensi** dengan **14 indikator**, masing-masing berskala 0–4. Data dikumpulkan dari berbagai sumber (check-in kehadiran, observasi kelas, penilaian manual) dan diagregasi menjadi **Matrix Skill Guru** setiap bulan.

Tujuan utama: menggantikan proses penilaian manual via Google Spreadsheet yang lambat dan rawan error.

---

## Arsitektur & Role

### Role Baru (di samping role 2in1 yang sudah ada)

| Role | Tabel DB | Login | Deskripsi |
|------|----------|-------|-----------|
| **Pengajar** | `pengajar` | WA + password | Guru HITS yang dinilai. 6 kelompok ikhwan, 13 kelompok akhwat |
| **Ketua Kelompok Pengajar** | `pengajar` (is_ketua=true) | WA + password | Ketua dari masing-masing kelompok. Bukan tabel terpisah |
| **Koordinator HITS** | `koordinator_hits` | WA + password | 2 ikhwan (Abdul Muhsin, Ahmad Abdus Syukur), 3 akhwat (Salma, Wildatun, Radiatam) |
| **Ketua Kelas** | `ketua_kelas` | WA + password / magic link | Ketua kelas peserta HITS yang mengobservasi pengajar |
| **Koordinator Ketua Kelas** | `koordinator_ketua_kelas` | WA + password | 1 ikhwan, 1 akhwat. Mengelola proses observasi & tabayyun |

### Multi-Role Access

Satu nomor WA bisa memiliki beberapa role sekaligus (misal: pengajar + musyrif 2in1). Saat login, sistem mengecek semua 8 tabel role secara paralel. Jika ditemukan >1 role, pengguna melihat **Feature Selector** di halaman utama.

### Hierarki

```
Syaikh Ahmad ──────────┐
Koordinator HITS ──────┤── Menilai: Kualitas Bacaan & Hafalan
                       │
Ketua Kelompok Pengajar ── Menilai: 4 Indikator Pedagogis
                       │
Koordinator Ketua Kelas ── Mengelola: Tabayyun & Teguran
   └─ Ketua Kelas ──────── Mengobservasi: Kondisi Kelas
                       │
Pengajar ──────────────┘── Yang dinilai (90+ orang)
```

---

## Fitur 1: Barnamij Itsnain fii Wahid (Setoran Hafalan)

**Route**: `/2in1/*`
**Status**: Sudah diimplementasi

Fitur asli dari repo ini — sistem pencatatan setoran hafalan Al-Qur'an dengan siklus 2 pekan.

### Hubungan ke Matrix

Skor tajwid dari setoran hafalan pengajar masuk ke indikator **Tajwid** di Hard Skill matrix. Koneksi dilakukan via `pengajar.musyrif_id` yang menghubungkan tabel `pengajar` ke `musyrif`.

### Role Terkait
- **Peserta**: Murid yang menyetor hafalan
- **Musyrif**: Guru yang memeriksa setoran peserta
- **Koordinator**: Monitoring setoran
- **Syaikh**: Memeriksa setoran musyrif

---

## Fitur 2: Penilaian Masyaikh (Kualitas Bacaan & Hafalan)

**Route**: `/penilaian-masyaikh`
**Status**: Belum diimplementasi (schema DB sudah ada)

### Cara Kerja

Syaikh Ahmad dan Koordinator HITS mengisi **2 indikator** per pengajar setiap bulan:

| Indikator | Skala | Standar |
|-----------|-------|---------|
| Kualitas Bacaan | 0–4 | 3 |
| Hafalan (Tahfidz) | 0–4 | 1 |

Masing-masing indikator memiliki kolom **keterangan** opsional.

### Skala Referensi

**Kualitas Bacaan** (berdasarkan poin Lahn Jaliy + Lahn Khafiy):
- Skala 0: 1–23 poin
- Skala 1: 24–46 poin
- Skala 2: 47–69 poin
- Skala 3 (Standar): 70–85 poin
- Skala 4: 86–100 poin

**Hafalan** (berdasarkan jumlah juz):
- Skala 0: 0–4 juz
- Skala 1 (Standar): 5–10 juz
- Skala 2: 11–15 juz
- Skala 3: 16–20 juz
- Skala 4: 21–30 juz

### Carry-Forward

Jika tidak diupdate sampai akhir bulan, nilai bulan lalu dianggap tetap berlaku.

---

## Fitur 3: Sistem Kehadiran 3 Program

**Route**: `/kehadiran/*`
**Status**: Sudah diimplementasi

### Program yang Dilacak

| Program | Hari | Waktu |
|---------|------|-------|
| Kelas Maahir | Bervariasi per kelas (Sen–Jum) | Bervariasi per kelas |
| Kajian At-Tibyan | Sabtu | 08:45 – 10:00 |
| Program Muallim Najih | Jumat | 19:30 – 20:30 |

### Alur Check-in Pengajar (`/kehadiran/pengajar`)

1. Pengajar buka halaman → sistem deteksi program hari ini
2. Untuk setiap program: pilih **Hadir** / **Izin** / **Sakit**
3. Jika check-in setelah waktu mulai → otomatis ditandai **Terlambat**
4. Jika tidak check-in sampai program selesai → status derived **Alpa**
5. **Backfill**: Jika belum check-in berhari-hari, muncul pertanyaan berurutan (maks 5 sesi terakhir)
6. Jika ada 2 program dalam 1 hari → ditanya masing-masing

### Pengajuan Alasan

Pengajar yang terlambat/alpa bisa mengajukan alasan melalui form. Sistem generate link **wa.me** ke ketua kelompok untuk notifikasi.

### Dashboard Ketua Kelompok (`/kehadiran/ketua-kelompok`)

- **Kartu kesehatan kelompok**: rata-rata kehadiran, jumlah pending
- Tabel anggota dengan status kehadiran bulan ini
- Tombol **Terima/Tolak** pengajuan alasan
- Tombol **Reminder** via wa.me ke anggota yang belum check-in

### Dashboard Koordinator HITS (`/kehadiran/koordinator`)

- Overview kehadiran seluruh pengajar (filter per gender)
- Status pengajuan alasan lintas kelompok
- **CRUD Libur Program**: umumkan program libur pada tanggal tertentu
- Reminder ke ketua kelompok yang punya tugas pending
- Per-kelompok breakdown: nama ketua, jumlah anggota, % hadir

### Konversi ke Skala Matrix

Rata-rata kehadiran bulanan per program dikonversi:
- 0–20% → Skala 0
- 21–40% → Skala 1
- 41–60% → Skala 2
- 61–79% → Skala 3
- 80–100% → Skala 4 (Standar)

---

## Fitur 4: Presensi Kajian Adab Ketua

**Route**: `/hits/ketua` (landing), `/observasi/koordinator/kajian` (dashboard koordinator)
**Status**: Sudah diimplementasi
**Database**: `hits_kajian_presensi`, `hits_kajian_libur` (migration 0040)

### Tujuan

**Kajian Adab** adalah kegiatan rutin setiap **Ahad (Minggu) pukul 16:00 WIB**, wajib dihadiri oleh semua **ketua kelas**. Fitur F4 melacak kehadiran ketua kelas di kegiatan ini. 

**Penting**: Rekap kehadiran Kajian Adab **TERPISAH** dari Matrix Skill Guru pengajar. Ketua kelas bukanlah pengajar dan tidak masuk dalam penilaian 14 indikator kompetensi pengajar.

### Alur Check-in Ketua

1. Ketua kelas buka landing `/hits/ketua` → sistem menampilkan kartu **"Kajian Adab"**
2. Pada hari **Ahad non-libur**:
   - Ketua memilih status: **Hadir** / **Izin** / **Sakit**
   - Check-in **setelah 16:00** → otomatis ditandai **Terlambat**
   - Check-in **pada/sebelum 16:00** → ditandai **Hadir**
3. **Backfill** status: Jika belum check-in berhari-hari, sistem menanyakan status Ahad terakhir (maksimal hari-H saja, tidak bisa backfill mundur)

### Alur Alpa (Lifecycle)

| Kondisi | Status | Aksi |
|---------|--------|------|
| Ahad terlewat, **belum** check-in | **Belum** | Sistem catat "belum-isi" di dashboard koordinator |
| Dashboard koordinator menunjukkan "belum-isi" | **Belum** → **Reminder Dikirim** | Koordinator KK kirim wa.me reminder ke ketua (countdown 3 hari) |
| **3 hari berlalu** setelah reminder, ketua **tidak** merespons | **Alpa** | Sistem otomatis tercatat Alpa |
| Ahad terlewat, **tidak ada reminder dikirim** | **Belum** | Tetap "belum-isi" (bukan Alpa otomatis) |

### Dashboard Koordinator KK (`/observasi/koordinator/kajian`)

**Rekap Kehadiran Bulanan**:
- Tabel ketua kelas dengan kolom: Nama, Hadir (%), Terlambat, Izin, Sakit, Alpa, Belum
- Filter per gender (ikhwan/akhwat) atau all

**Panel "Perlu Ditindak"** (window 21 hari terakhir + reminder aktif):
- List ketua dengan status "belum-isi" yang belum direminder
- Tombol **Reminder** (generate wa.me link + catat tanggal kirim reminder)
- Tombol **Tandai Alpa** (manual escalation)

**CRUD Libur Kajian**:
- Koordinator KK umumkan libur Kajian Adab pada tanggal tertentu
- Hari libur tidak perlu check-in (tidak ada status otomatis Alpa)

### Data & Historis

**Status Implementasi**: Sudah diimplementasi.

**Data Historis**:
- Rekap Sep 2025 – Jun 2026 diimpor dari file "Observasi HITS Akhwat" via script `scripts/import-kajian-adab.ts`
- Pencocokan berdasarkan **nama ketua** (case-insensitive, fuzzy match)
- **Data ketua ikhwan tidak tersedia historis** → dimulai kosong (Ahad depan forward)

**Tabel Database**:
- `hits_kajian_presensi` (id, ketua_kelas_id, tanggal_ahad, status, created_at)
- `hits_kajian_libur` (id, tanggal_ahad, deskripsi, created_by, created_at)

---

## Fitur 5: Penilaian Pedagogis (Kompetensi Pedagogis/Metodologi)

**Route**: `/pedagogis`
**Status**: Belum diimplementasi (schema DB sudah ada)

### 4 Indikator (semua standar: 4)

| Indikator | Deskripsi |
|-----------|-----------|
| Metode Pengajaran Modul | Cara pengajar menyampaikan materi |
| Kepatuhan Silabus | Kesesuaian dengan silabus yang ditetapkan |
| Manajemen Halaqah | Pengelolaan kelas/halaqah |
| Evaluasi & Penguasaan | Evaluasi peserta dan penguasaan materi |

Diisi oleh **Ketua Kelompok Pengajar** untuk setiap anggota kelompoknya, setiap bulan. Masing-masing indikator bernilai 0–4 dengan kolom keterangan opsional.

### Skala Referensi (berdasarkan teguran)
- Skala 4: 0 teguran (Standar)
- Skala 3: 1 teguran
- Skala 2: 2 teguran
- Skala 1: 3 teguran
- Skala 0: 4 teguran

---

## Fitur 6: Sistem Observasi & Tabayyun (Kompetensi Profesionalisme/Soft Skill)

**Route**: `/observasi/*`
**Status**: Belum diimplementasi (schema DB sudah ada)

### 5a. Observasi Ketua Kelas (`/observasi/ketua-kelas`)

Setiap sesi kelas, ketua kelas melaporkan:

**Kondisi Kelas:**
| Kode | Label | Deskripsi |
|------|-------|-----------|
| KBBS | Kelas Berjalan Baik & Sesuai | Tidak ada masalah |
| KMT | Kelas Mulai Terlambat | Dimulai >5 menit dari jadwal |
| JKG | Jadwal Kelas Ganti | Jadwal dipindahkan |
| KBLA | Kelas Berakhir Lebih Awal | Durasi KBM < 90 menit |
| LIBUR | Tidak Ada Kelas | Kelas libur |

**Indikator Tambahan:**
- Pengajar on-cam: Ya / Tidak
- Latihan mandiri diberikan: Ya / Tidak
  - Status latihan: TAL (Tidak Ada Latihan) / PTML (Peserta Tidak Mengerjakan) / SML (Semua Mengerjakan)
  - Jika diberikan: semua siswa selesai? Ya / Tidak

### 5b. Alur Tabayyun (Klarifikasi)

Ketika kondisi **bukan KBBS**:
1. Sistem buat record tabayyun → Koordinator KK kirim wa.me ke pengajar
2. Pengajar buka link → isi alasan di form web
3. Koordinator putuskan: **udzur syar'i** atau bukan
4. Jika bukan udzur → **teguran** diterbitkan
5. **Timeout 48 jam**: Jika pengajar tidak merespons → escalate ke Koordinator HITS

### 5c. Sistem Teguran

| Teguran ke- | Aksi |
|-------------|------|
| 1 | Peringatan via WhatsApp |
| 2 | Peringatan kedua |
| 3 | Peringatan keras + peringatan nonaktivasi |
| **4** | **Surat penonaktifan pengajar** |

**Penting**: Teguran dihitung **GLOBAL** dari gabungan semua kategori. 4 teguran dari kombinasi apapun = nonaktivasi.

### 5d. Indikator Soft Skill

| Indikator | Sumber Data | Standar |
|-----------|-------------|---------|
| Kedisiplinan Waktu | Observasi KMT/KBLA | 4 |
| Komitmen Jadwal & Kehadiran | Jumlah pindah jadwal | 4 |
| Tanggung Jawab & Keadilan | Penggantian kelas untuk peserta | 4 |
| Kepatuhan SOP Teknis | On-cam + latihan mandiri | 4 |

**Skala Kedisiplinan** (berdasarkan jumlah KMT/KBLA):
- 0 kejadian → Skala 4 | 1 → Skala 3 | 2 → Skala 2 | 3 → Skala 1 | 4+ → Skala 0

**Skala Komitmen Jadwal** (berdasarkan jumlah pindah jadwal):
- 1–4 pindah → Skala 4 | 5–6 → Skala 3 | 7–8 → Skala 2 | 9–10 → Skala 1 | 11+ → Skala 0

---

## Fitur 7: Matrix Skill Guru & Ranking

**Route**: `/matrix/*`
**Status**: Belum diimplementasi (schema DB sudah ada)

### Matrix Rekap Bulanan

Setiap akhir bulan, sistem mengagregasi semua data menjadi snapshot matrix per pengajar.

### 14 Indikator dalam 3 Kategori

| # | Indikator | Kategori | Standar |
|---|-----------|----------|---------|
| 1 | Kualitas Bacaan | A. Hard Skill | **3** |
| 2 | Hafalan (Tahfidz) | A. Hard Skill | **1** |
| 3 | Tajwid | A. Hard Skill | **2** |
| 4 | Kehadiran Kelas Maahir | A. Hard Skill | 4 |
| 5 | Kehadiran Kajian At-Tibyan | A. Hard Skill | 4 |
| 6 | Kehadiran Program Muallim Najih | A. Hard Skill | 4 |
| 7 | Metode Pengajaran Modul | B. Pedagogis | 4 |
| 8 | Kepatuhan Silabus | B. Pedagogis | 4 |
| 9 | Manajemen Halaqah | B. Pedagogis | 4 |
| 10 | Evaluasi & Penguasaan | B. Pedagogis | 4 |
| 11 | Kedisiplinan Waktu | C. Soft Skill | 4 |
| 12 | Komitmen Jadwal & Kehadiran | C. Soft Skill | 4 |
| 13 | Tanggung Jawab & Keadilan | C. Soft Skill | 4 |
| 14 | Kepatuhan SOP Teknis | C. Soft Skill | 4 |

> **Perhatian**: Standar tiap indikator BERBEDA (Bacaan=3, Hafalan=1, Tajwid=2, sisanya=4). Spider chart dan color-coding harus memperhitungkan standar per-indikator.

### Ranking Dashboard (`/matrix/ranking`)

- Koordinator HITS melihat ranking pengajar (ikhwan lihat ikhwan, akhwat lihat akhwat)
- Filter: per bulan atau all-time
- Klik nama → profil detail dengan spider/radar chart

### Profil Pengajar (`/matrix/pengajar/[id]`)

- Spider chart: 14 axis, skor aktual + overlay garis standar
- Info halaqah yang dipegang
- Trend skor per bulan
- Histori teguran

---

## Template WhatsApp

Sistem menggunakan **wa.me link** dengan pesan pre-filled. User tetap harus tap "Kirim" di WhatsApp.

| Template | Dari → Ke | Trigger |
|----------|-----------|---------|
| `tplReminderPengajarCheckin` | Ketua kelompok → Pengajar | Reminder check-in |
| `tplPengajarAlasanToKetuaKelompok` | Pengajar → Ketua kelompok | Ajukan alasan terlambat/alpa |
| `tplTabayyunToPengajar` | Koordinator KK → Pengajar | Request klarifikasi |
| `tplPengajarReminderTabayyun` | Pengajar → Koordinator KK | Reminder follow-up |
| `tplTeguranToPengajar` | Koordinator KK → Pengajar | Teguran ke-N |
| `tplSuratNonaktif` | Koordinator KK → Pengajar | Penonaktifan |
| `tplJadwalPindahToKoorKK` | Pengajar → Koordinator KK | Notif pindah jadwal |
| `tplJadwalPindahToKetuaKelas` | Pengajar → Ketua kelas | Notif pindah jadwal |
| `tplReminderKetuaKelasObservasi` | Koordinator KK → Ketua kelas | Reminder observasi |
| `tplReminderLatihanMandiri` | Koordinator KK → Pengajar | Reminder latihan |
| `tplReminderSiswaLatihan` | (ke ketua kelas) | Reminder siswa |
| `tplAlasanDiterima` | Koordinator KK → Pengajar | Alasan diterima |
| `tplLiburProgram` | Koordinator → Pengajar | Libur program |
| `tplReminderKetuaKelompokTugas` | Koordinator HITS → Ketua kelompok | Tugas pending |
| `tplMagicLinkKetuaKelas` | Koordinator KK → Ketua kelas | Link observasi |
| `tplReminderKajianAdab` | Koordinator KK → Ketua kelas | Reminder presensi Kajian Adab |

---

## Cara Seed Data Demo

### Prasyarat

1. Migration `0004_matrix_skill_guru.sql` sudah dijalankan di Supabase
2. File `.env.local` sudah dikonfigurasi

### Menjalankan Seed

```bash
pnpm seed-hits
```

Script akan membuat:
- 19 kelompok pengajar (6 ikhwan + 13 akhwat)
- 90+ pengajar beserta nomor WA
- 5 koordinator HITS
- 2 koordinator ketua kelas
- 2 program kehadiran (At-Tibyan, Muallim Najih)
- Demo: beberapa record check-in, pengajuan alasan, dan libur program

### Akun Demo

| Role | Nomor WA | Nama | Password |
|------|----------|------|----------|
| Pengajar | 081399741809 | Hilmi Hanif Sobandi | hits123 |
| Ketua Kelompok | 082199266821 | Muhammad Sofyan | hits123 |
| Koordinator HITS | 081280672014 | Abdul Muhsin | hits123 |
| Koordinator KK | 081280630437 | Koordinator KK Ikhwan | hits123 |

---

## Status Implementasi

### Sudah Diimplementasi

- [x] Schema database (migration 0004 — 19 tabel baru; migration 0040 — kajian adab)
- [x] TypeScript types untuk semua tabel baru
- [x] Auth multi-role (8 role, login paralel, feature selector)
- [x] Route restructuring (setoran hafalan → `/2in1/`)
- [x] Landing page dengan feature selector
- [x] Halaman check-in pengajar (`/kehadiran/pengajar`)
- [x] Dashboard ketua kelompok (`/kehadiran/ketua-kelompok`)
- [x] Dashboard koordinator HITS kehadiran (`/kehadiran/koordinator`)
- [x] Presensi Kajian Adab ketua (F4): check-in, alur alpa, dashboard koordinator KK
- [x] Leaderboard disiplin pengajar F5 (`/hits/koordinator`): ranking %KBBS + hutang menit, toggle bulanan/mingguan (7-hari)
- [x] Attendance library (derive status, backfill, scale calculation)
- [x] Scale calculation library (15 fungsi konversi)
- [x] 16 template WhatsApp baru (termasuk tplReminderKajianAdab)
- [x] Seed script demo data
- [x] Script import data historis Kajian Adab (`scripts/import-kajian-adab.ts`)
- [x] Dokumentasi fitur

### Belum Diimplementasi

- [ ] Halaman penilaian masyaikh (`/penilaian-masyaikh`)
- [ ] Halaman penilaian pedagogis (`/pedagogis`)
- [ ] Halaman observasi ketua kelas (`/observasi/ketua-kelas`)
- [ ] Dashboard koordinator ketua kelas (`/observasi/koordinator`)
- [ ] Alur tabayyun (form alasan + keputusan)
- [ ] Sistem teguran & surat penonaktifan
- [ ] Tracking pindah jadwal
- [ ] Matrix rekap generator (agregasi bulanan)
- [ ] Ranking dashboard (`/matrix/ranking`)
- [ ] Profil pengajar dengan spider chart (`/matrix/pengajar/[id]`)
- [ ] Export Excel matrix
- [ ] Halaman profil sendiri untuk pengajar (`/profil`)
- [ ] Magic-link login untuk ketua kelas
- [ ] Google Sheets integration (presensi peserta)

---

## Struktur File Baru

```
src/
  app/
    2in1/                    # Setoran hafalan (pindah dari root)
      peserta/
      musyrif/
      koordinator/
      syaikh/
      laporan/
    kehadiran/               # Fitur kehadiran (SUDAH)
      pengajar/              # Check-in pengajar
      ketua-kelompok/        # Dashboard ketua kelompok
      koordinator/           # Dashboard koordinator HITS
    penilaian-masyaikh/      # (BELUM)
    pedagogis/               # (BELUM)
    observasi/               # (BELUM)
      ketua-kelas/
      koordinator/
    matrix/                  # (BELUM)
      ranking/
      pengajar/[id]/
      rekap/
    profil/                  # (BELUM)
  lib/
    auth.ts                  # Multi-role login (DIUBAH)
    session.ts               # 8 guard functions (DIUBAH)
    roles.ts                 # Route mapping per role (BARU)
    attendance.ts            # Logic kehadiran (BARU)
    scales.ts                # Fungsi konversi skala (BARU)
    whatsapp.ts              # 15 template baru (DIUBAH)
  types/
    db.ts                    # Semua interface HITS (DIUBAH)

supabase/
  migrations/
    0004_matrix_skill_guru.sql  # 19 tabel baru (BARU)

scripts/
  seed-hits-demo.ts          # Seed data demo HITS (BARU)

docs/
  FITUR-HITS.md              # Dokumentasi ini (BARU)
```
