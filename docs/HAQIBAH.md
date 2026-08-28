# Haqibatul Mu'allim — pustaka berkas pembantu pengajar

Tempat koordinator menaruh berkas pembantu pengajar HITS (panduan ujian, tatib/SOP,
modul, kurikulum, panduan aplikasi) supaya pengajar bisa membukanya sendiri tanpa
diminta lewat WhatsApp.

Rancangan lengkap: `docs/superpowers/specs/2026-08-28-haqibatul-muallim-design.md`.
Kode: `src/app/haqibah/*`, `src/lib/haqibah.ts`, `src/lib/haqibah-storage.ts`,
migrasi `supabase/migrations/0059_haqibah.sql`.

---

## 1. Siapa boleh apa

| Peran | Halaman | Bisa |
|---|---|---|
| `pengajar` (ikhwan & akhwat) | `/haqibah/pengajar` | Menelusuri folder & membuka berkas. Isinya sama untuk semua pengajar — tidak dipisah gender. |
| `koordinator_ketua_kelas` | `/haqibah/koordinator` | Semua yang di atas, plus buat folder, unggah berkas, ubah nama, hapus. |
| Superadmin (`SUPERADMIN_WAS`) | `/haqibah/koordinator` | Sama dengan koordinator ketua kelas. Superadmin bukan role di DB — cukup nomor WA-nya ada di `SUPERADMIN_WAS` (`src/lib/constants.ts`). |
| Peserta / musyrif / syaikh / role lain | — | Tidak ada akses; kalau URL-nya dibuka, dialihkan ke halaman awal (bukan 500). |

Menu masuk lewat pemilih fitur (`src/lib/feature-links.ts`): "Haqibatul Mu'allim"
untuk pengajar, "Kelola Haqibah" untuk koordinator ketua kelas.

Berkas disajikan lewat URL bertanda tangan (`/api/audio/haqibah/<uuid>.<ext>`) yang
**berlaku 1 jam**. Tautan yang disalin lalu dikirim ke orang lain akan mati sendiri
setelah lewat satu jam — bukan bug; buka ulang halamannya untuk tautan baru.

---

## 2. Batas & aturan

| Hal | Batas |
|---|---|
| Ekstensi | `pdf, xlsx, xls, docx, doc, pptx, ppt, txt, csv, jpg, jpeg, png, webp` |
| Ukuran satu berkas | 50 MB (batas body server action 60 MB) |
| Kedalaman folder | 3 tingkat; folder tingkat ke-4 ditolak — simpan berkasnya langsung di folder tingkat 3 |
| Nama folder | 1–120 karakter, unik dalam satu induk (tak peduli besar-kecil huruf) |
| Nama berkas (nama tampil) | 1–200 karakter, **tanpa ekstensi** — ekstensinya disimpan terpisah |
| Hapus folder | Hanya kalau kosong; kalau masih berisi, pesan galatnya menyebut berapa subfolder/berkas yang menghalangi |
| Pindah berkas antar folder | Belum ada. Hapus lalu unggah ulang di folder yang benar |

Nama berkas di disk sengaja UUID (`${STORAGE_DIR}/haqibah/<uuid>.<ext>`); nama tampil
hanya ada di DB. Jadi mengubah nama tidak menyentuh disk, dan tautan lama tetap sah.

---

## 3. Mengisi awal dengan `scripts/seed-haqibah.ts`

Script menyalin satu folder di disk (mis. `Haqibatul Mu'allim/`) menjadi struktur
folder + berkas di pustaka.

- Tiap subdirektori → satu folder (maksimum 3 tingkat; yang lebih dalam dilewati dan
  dilaporkan). Berkas yang tergeletak langsung di folder sumber masuk ke akar.
- Nama tampil = nama berkas tanpa ekstensi.
- Urutan diambil dari prefiks angka pada nama (`1. `, `2) `, `03 - `) bila ada;
  kalau tidak ada, dipakai posisinya di dalam folder. Prefiksnya **tidak dibuang**
  dari nama supaya sama persis dengan folder sumber — koordinator boleh merapikan
  namanya lewat UI setelahnya (urutan tetap ikut kolom `urutan`).
- Berkas dengan ekstensi tak diizinkan, berukuran 0 byte, atau lebih dari 50 MB
  ditolak dan dirangkum di akhir — script tetap jalan terus.
- **Idempoten**: folder dicocokkan berdasarkan (induk, nama), berkas berdasarkan
  (folder, nama), keduanya tanpa memandang besar-kecil huruf. Yang sudah ada
  dilewati, tidak digandakan, dan nama/urutannya tidak ditimpa. Aman diulang.

### Lokal (DB dev)

```bash
npx tsx --env-file=.env.local scripts/seed-haqibah.ts "Haqibatul Mu'allim" --dry-run
npx tsx --env-file=.env.local scripts/seed-haqibah.ts "Haqibatul Mu'allim"
```

`--dry-run` (atau `-n`) hanya membaca DB dan mencetak apa yang akan dibuat. Selalu
jalankan itu dulu.

### Di VPS (produksi)

Migrasi `0059_haqibah.sql` harus sudah masuk lebih dulu (lihat CLAUDE.md bagian
Migrations). Lalu:

```bash
# 1. kirim folder sumbernya (dari laptop)
scp -r "Haqibatul Mu'allim" root@maahir.muhajirproject.org:/tmp/haqibah-src

# 2. di server, jalankan dari checkout aplikasi supaya env & node_modules sepadan
ssh root@maahir.muhajirproject.org
cd /var/www/html/maahir
set -a; . ./env_vars.sh; set +a          # DATABASE_URL + STORAGE_DIR
nvm exec 24.15.0 npx tsx scripts/seed-haqibah.ts /tmp/haqibah-src --dry-run
nvm exec 24.15.0 npx tsx scripts/seed-haqibah.ts /tmp/haqibah-src

# 3. pastikan berkasnya bisa dibaca proses aplikasi, lalu buang sumbernya
ls -la "$STORAGE_DIR/haqibah" | head
rm -rf /tmp/haqibah-src
```

Script menulis **langsung ke Postgres** (`DATABASE_URL`) dan ke filesystem
(`STORAGE_DIR`) — bukan lewat HTTP, jadi tidak ada hubungannya dengan `npm run db`.
Karena itu ia harus dijalankan di mesin yang sama dengan DB & storage produksi.
Aplikasi tidak perlu di-restart; halaman membaca DB tiap kali dibuka.

Kalau `npx tsx` tak tersedia di server (node_modules produksi tanpa devDependencies),
pasang sekali saja dengan `npm i -D tsx` di direktori aplikasi, atau jalankan seed di
mesin lain yang bisa menjangkau DB + `STORAGE_DIR` yang sama.

### Gotcha: seed mengembalikan yang sudah dihapus

Pencocokannya per nama, bukan per jejak "pernah dihapus". Jadi kalau satu berkas
dihapus lewat UI tapi **masih ada di folder sumber**, menjalankan seed lagi akan
mengunggahnya kembali. Hapus juga dari folder sumber (atau jangan jalankan seed lagi).

---

## 4. Menghapus berkas yang salah unggah

**Cara normal — lewat UI.** `/haqibah/koordinator` → masuk ke foldernya → tombol
**Hapus** pada berkasnya. Barisnya dihapus dan berkas fisiknya ikut dibuang
(best-effort: kalau berkas di disk sudah hilang, barisnya tetap terhapus).
Folder hanya bisa dihapus kalau isinya sudah kosong.

**Cara darurat — SQL + disk.** Dipakai kalau UI tak bisa diakses. Ingat `npm run db`
menembak **produksi**:

```bash
# 1. cari barisnya (READ, aman)
npm run db "select id, nama, ext, storage_path, folder_id from haqibah_file where nama ilike '%kata-kunci%'"

# 2. hapus metadatanya (tanpa --confirm hanya pratinjau wouldAffect)
npm run db --confirm "delete from haqibah_file where id = '<uuid-baris>'"

# 3. buang berkas fisiknya di server (pakai storage_path dari langkah 1)
ssh root@maahir.muhajirproject.org "rm -f /var/www/html/maahir/storage/haqibah/<storage_path>"
```

Urutannya: hapus baris dulu, baru berkas di disk. Berkas yatim di disk tidak
mengganggu apa pun (hanya makan tempat); baris tanpa berkas akan tampil di daftar
tapi gagal dibuka — jadi jangan menghapus disk saja tanpa menghapus barisnya.

Untuk membuang satu folder beserta isinya lewat SQL (FK-nya `on delete restrict`,
jadi harus dari isi ke luar):

```bash
npm run db "select id, nama from haqibah_folder where parent_id = '<uuid-folder>'"   # pastikan tak ada subfolder
npm run db "select id, nama, storage_path from haqibah_file where folder_id = '<uuid-folder>'"
npm run db --confirm "delete from haqibah_file where folder_id = '<uuid-folder>'"
npm run db --confirm "delete from haqibah_folder where id = '<uuid-folder>'"
# lalu rm berkas-berkasnya di ${STORAGE_DIR}/haqibah/
```

---

## 5. Kalau ada masalah

| Gejala | Kemungkinan sebab |
|---|---|
| Tautan berkas 403 "invalid or expired signature" | URL-nya sudah lewat 1 jam, atau `SESSION_SECRET` berubah. Muat ulang halamannya. |
| Berkas 404 saat dibuka | Barisnya ada, berkas fisiknya tidak. Cek `${STORAGE_DIR}/haqibah/<storage_path>`; unggah ulang lalu hapus baris lamanya. |
| Unggahan ditolak "Ekstensi ... tidak didukung" | Di luar daftar bagian 2. Ubah ke PDF kalau bisa. |
| Unggahan besar gagal diam-diam | Lebih dari 50 MB, atau total satu batch melewati batas body server action 60 MB — unggah satu-satu. |
| Seed bilang "lebih dari 3 tingkat" | Ratakan strukturnya di folder sumber, lalu jalankan ulang seed. |
| Pengajar tak melihat menunya | Akun WA-nya belum punya role `pengajar` aktif, atau sedang login sebagai role lain (ganti lewat pemilih fitur). |
