# Impor Ketersediaan Pengajar, Dashboard Koordinator & Aturan Sinkronisasi 21 September

**Tanggal:** 16 September 2026
**Status:** disetujui 16 Sep 2026 (mockup: artifact "Dashboard Ketersediaan Mengajar")
**Modul:** Ketersediaan Mengajar HITS (`ks_*`) — lanjutan `2026-08-30-ketersediaan-mengajar-hits-design.md`
**Tenggat:** sinkronisasi pertama Senin 21 September 2026

## 1. Masalah

Modul ketersediaan sudah di `main` tetapi belum pernah dipakai: seluruh tabel `ks_*`
di produksi kosong. Sumber kebenaran ketersediaan pengajar hari ini adalah berkas
`docs/KETERSEDIAAN PENGAJAR HITS '26.xlsx`, bukan isian pengajar di aplikasi. Modul
tidak punya jalur impor, dan halaman pengajar sengaja tetap tersembunyi.

Dashboard koordinator yang ada menumpuk sembilan bagian ke bawah dan hanya mengenal
satu periode aktif. Periode yang dibutuhkan ada dua (September dan Oktober), dan
koordinator perlu melihat keadaan sekilas: jam mana kekurangan pengajar, apa yang
harus dikerjakan hari ini.

## 2. Keputusan yang sudah diambil

| Hal | Keputusan |
|---|---|
| Sumber ketersediaan pengajar | Berkas xlsx di atas, diimpor. Bukan diisi pengajar. |
| Siapa yang melihat | Koordinator saja, lewat dashboard yang tetap tersembunyi (`bolehLihatFiturTersembunyi`). Halaman pengajar tetap tersembunyi. |
| Bagian batch di sheet online | Diimpor **keduanya**, ke **periode terpisah**: September dan Oktober. |
| Sheet offline (Pejaten Ikhwan, Pejaten Akhwat, Al-Kautsar Matraman) | **Ketersediaan untuk periode September.** |
| Prioritas | Disimpan **per jam**, sesuai kolom Prioritas di xlsx. |
| Master jam periode | **Gabungan** jam di formulir pendaftar dan jam di xlsx. |
| Formulir pendaftar | **Satu formulir melayani dua periode.** Pendaftar boleh mulai September atau Oktober; sistem menjamin satu orang hanya mendapat satu halaqah. |
| Chart | Ditambahkan: peta kekurangan hari × jam, dan arus pendaftar per hari. |
| Aturan yang ikut dikerjakan | Yang perlu sebelum sinkronisasi 21 Sep dan sebelum pengiriman pertama ke CMS (§8). |

## 3. Bentuk berkas xlsx (terverifikasi 16 Sep 2026)

| Sheet | Gender | Kolom | Susunan |
|---|---|---|---|
| Online - Ikhwan | ikhwan | No, Nama, WA, Online/Offline, Waktu, Prioritas | Baris 3 "Batch September 2026 …", kepala baris 4, data. Lalu baris "Batch Oktober 2026 …", kepala lagi, data. |
| Online - Akhwat | akhwat | sama | sama |
| Offline - Pejaten Ikhwan | ikhwan | No, Nama, Online/Offline, Waktu, Kelas | satu bagian, **tanpa WA** |
| Offline - Pejaten Akhwat | akhwat | sama | satu bagian, **tanpa WA** |
| Offline - Al-Kautsar Matraman | ikhwan lalu akhwat | No, Nama, Online/Offline, Waktu, Kelas | baris "Ikhwan" / "Akhwat" memisahkan bagian, **tanpa WA** |

Isi: 179 baris ketersediaan, 103 pengajar. Online: 84 nomor WA unik, 82 punya akun
`pengajar` di produksi. Pengajar offline (tanpa WA) dicocokkan lewat nama ke `pengajar`
aktif segender: 16 cocok tunggal, 0 ganda, 5 tidak ditemukan. Tiga baris offline Matraman berjam dua waktu berbeda
("Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30") dan tidak dapat diwakili satu jam.

Pembaca berkas dibuat mengikuti **penanda**, bukan nomor baris: baris berisi
"Batch …" membuka bagian batch, baris "Ikhwan"/"Akhwat" mengganti gender, baris yang
kolom pertamanya "No" adalah kepala. Kolom dikenali dari judulnya.

## 4. Impor

### 4.1 Alur

1. Koordinator membuka **Pengaturan → Impor ketersediaan pengajar** dan mengunggah xlsx.
2. Server membaca berkas dan mengembalikan **pratinjau**. Tidak ada yang disimpan.
3. Pratinjau per bagian (September online, Oktober online, September offline):
   - jumlah pengajar dan jam; periode tujuan dipilih dari periode yang ada (ditebak dari nama bulan). Periode dibuat lewat panel "Buat periode" di tab yang sama.
   - tabel pengajar: nama, nomor, **akun** (cocok / tidak ditemukan / gender tidak cocok),
     jam-jam beserta prioritasnya, dan masalah per baris
4. Baris tanpa WA dicocokkan lewat **nama**. Hasilnya: cocok tunggal, beberapa kandidat,
   atau tidak ketemu. Yang tidak tunggal diberi pilihan pengajar di pratinjau.
5. Koordinator menekan **Simpan**. Server membaca ulang berkas yang sama (dikirim ulang
   bersama pilihan pencocokan) dan menulis.

### 4.2 Aturan tulis

- Satu `ks_pengisian` per (periode, pengajar), `sumber = 'impor'`, `komitmen = true`,
  `status = 'aktif'`, `submitted_at = sekarang`.
- Satu `ks_ketersediaan` per jam, `status = 'terverifikasi'`, `prioritas` dari xlsx.
- Jam yang belum ada di master periode **dibuatkan** (`ks_slot`), sesuai keputusan
  gabungan. Lokasi offline diambil dari nama sheet (Pejaten, Masjid Al-Kautsar Matraman).
- **Impor ulang menggantikan**, tidak menambah: untuk pengisian bersumber impor, jam yang
  tidak ada lagi di berkas dihapus. Pengisian bersumber `form` tidak disentuh.
- Bentrok jadwal **dicatat** di `ks_ketersediaan.bentrok_alasan`, tidak mengunci.
  Koordinator yang menyusun xlsx sudah menyaring jadwal; pengecekan terhadap
  `hits_halaqah` masih mengandung kunci palsu dari batch lama yang tercatat aktif
  (lihat §8).
- Pengajar tanpa akun, gender tak cocok, jam tak terbaca, dan jam dua waktu **dilewati**
  dan dilaporkan. Tidak ada akun pengajar yang dibuat otomatis.
- Setiap impor dicatat di `ks_log` (`aksi = 'impor_ketersediaan'`) berisi ringkasan dan
  nama berkas.
- Seluruh tulis untuk satu periode berjalan dalam **satu transaksi**. Gagal di tengah
  berarti tidak ada yang tersimpan. Shim `supabaseAdmin` tidak mendukung transaksi, jadi
  penulisannya memakai klien `pg` langsung (`getPool().connect()` + `BEGIN`/`COMMIT`),
  pola yang sudah dipakai `src/lib/admin-crud.ts`.

### 4.3 Unggahan

Server action menerima `FormData`. Berkas diperiksa lewat bentuknya (`arrayBuffer`
ada, ukuran < 5 MB, nama berakhiran `.xlsx`), **bukan** `instanceof File` — runtime
produksi tidak punya global `File` dan pemeriksaan itu membuang unggahan diam-diam.
Dibaca dengan `exceljs` yang sudah menjadi dependensi.

## 5. Skema

Migrasi `0077_ketersediaan_impor_aturan.sql` (nomor bebas terakhir diperiksa 16 Sep:
`0076`; tidak ada branch lain yang memakai `0077`–`0079`). Nama constraint diperiksa di
produksi.

```sql
alter table ks_ketersediaan
  add column if not exists prioritas integer check (prioritas is null or prioritas > 0);

alter table ks_pengisian
  add column if not exists sumber text not null default 'form'
  check (sumber in ('form', 'impor'));

alter table ks_pendaftar drop constraint if exists ks_pendaftar_pita_umur_check;
alter table ks_pendaftar add constraint ks_pendaftar_pita_umur_check
  check (pita_umur in ('<=45', '46+'));
alter table ks_usulan drop constraint if exists ks_usulan_pita_umur_check;
alter table ks_usulan add constraint ks_usulan_pita_umur_check
  check (pita_umur in ('<=45', '46+'));

alter table ks_pendaftar drop constraint if exists ks_pendaftar_status_check;
alter table ks_pendaftar add constraint ks_pendaftar_status_check
  check (status in ('valid', 'ditahan', 'dialokasikan', 'batal', 'diganti'));

alter table ks_periode
  add column if not exists jumlah_pertemuan_dasar integer not null default 50
    check (jumlah_pertemuan_dasar between 0 and 200),
  add column if not exists jumlah_pertemuan_lanjutan integer not null default 26
    check (jumlah_pertemuan_lanjutan between 0 and 200);
```

Aman karena seluruh tabel `ks_*` di produksi masih kosong (diperiksa 16 Sep) — mengganti
CHECK pita umur tidak menabrak data lama. `src/types/db.ts` diperbarui. DDL produksi
dijalankan pemilik proses, satu statement per kiriman.

## 6. Prioritas per jam di mesin alokasi

`alokasikan()` saat ini mengurutkan kandidat dengan `peringkat(pengajarId)`. Diubah
menjadi `peringkat(pengajarId, slotId)`:

1. `ks_ketersediaan.prioritas` untuk pasangan itu, bila ada;
2. selain itu urutan preset yang dipilih koordinator (perilaku lama);
3. selain itu urutan waktu isi (perilaku lama).

Kaidah putaran — tak seorang pun mendapat halaqah kedua sebelum semua mendapat yang
pertama — tidak berubah. Prioritas hanya memutus urutan **di dalam** satu putaran.
Uji murni `scripts/test-ketersediaan.ts` ditambah kasus prioritas per jam.

## 7. Dashboard koordinator

Tetap satu rute, `/ketersediaan/koordinator`, dengan dua parameter:
`?periode=<id>` dan `?tab=<nama>`. Diperiksa per rute, server-rendered, bisa dibagikan
sebagai tautan.

### 7.1 Kerangka

- **Pemilih periode** di atas: tab berisi nama periode, tanggal mulai KBM, dan jumlah
  pendaftar sah. Periode yang aktif ditonjolkan.
- **Saring gender**: Semua · Ikhwan · Akhwat. Bawaan mengikuti gender koordinator bila
  sesinya bergender.
- **Tab halaman**: Ringkasan · Jam & kapasitas · Pengajar · Pendaftar · Usulan halaqah ·
  Pengaturan.

### 7.2 Ringkasan

Untuk menjawab dua pertanyaan dalam lima detik: *bagaimana keadaannya* dan *apa yang
harus saya kerjakan*.

- Empat angka: **pendaftar sah**, **pengajar tersedia**, **daya tampung** (pengajar
  tersedia × kapasitas, dijumlah per jam, dibatasi jumlah antre jam itu), **belum
  tertampung**. Masing-masing dipecah ikhwan/akhwat di bawah angkanya.
- **Perlu tindakan**: daftar pendek berurut kepentingan, tiap butir bertautan ke tab yang
  menanganinya — usulan menunggu dilepas, konfirmasi pengajar lewat tenggat, pendaftar
  ditahan, sanggahan menunggu, jam tanpa pengajar. Butir bernilai nol disembunyikan;
  bila semuanya nol, tampil "Tidak ada yang menunggu".
- **Lima jam paling kekurangan**: cuplikan dari papan jam.

### 7.3 Jam & kapasitas

Papan per jam, diurut dari kekurangan terbesar. Tiap baris:

- jam, mode, lokasi offline
- **batang permintaan vs daya tampung**: panjang = antre; bagian terisi = yang bisa
  ditampung; angka di ujung
- pengajar tersedia; halaqah yang dibutuhkan (`ceil(antre / 12)`) dan yang bisa
  dibentuk sekarang
- lencana status: **Tanpa pengajar** (merah) · **Kurang pengajar** (kuning) ·
  **Cukup** (hijau) · **Belum ada peminat** (netral)

Definisi "pengajar tersedia" disamakan dengan mesin alokasi (`terverifikasi` +
`diajukan`); sebelumnya papan memakai `terverifikasi` saja sehingga angkanya lebih kecil
dari yang dipakai alokasi.

### 7.4 Pengajar

Tabel pengajar dengan saring gender dan cari nama: nama, jam yang dipilih sebagai
**cip berprioritas** ("Senin & Rabu 20:00 · #2"), jumlah halaqah yang didapat, sumber
(impor / isian). Yang belum kebagian halaqah diurut paling atas.

### 7.5 Pendaftar, Usulan halaqah, Pengaturan

Isi panel yang sudah ada dipindahkan, tidak ditulis ulang:

- **Pendaftar**: `PanelDitahan`, `PanelPendaftar` (sumber CSV).
- **Usulan halaqah**: `PanelKerja` (alokasi, papan usulan, antrean kerja), `PanelGrupPool`,
  `PanelPengingat`.
- **Pengaturan**: impor ketersediaan (baru), `PanelSlot`, `PanelPeriode`, tautan
  pemetaan CMS tilawah, unduh xlsx.

`getPeriodeAktif()` tetap dipakai halaman lain; dashboard memakai `?periode=` dengan
bawaan periode aktif terbaru.

### 7.6 Chart

Dua chart, masing-masing punya tugas yang tidak bisa dikerjakan tabel:

1. **Peta kekurangan** — tab Ringkasan, lebar penuh di bawah "Perlu tindakan".
   Baris = pasangan hari (Senin & Rabu, Selasa & Kamis, …), kolom = jam mulai, isi sel =
   **belum tertampung** (online + offline dijumlah, ikut saring gender). Satu hue
   bergradasi (biru, 6 tingkat: kosong, 1–24, 25–49, 50–99, 100–199, ≥200), angka di dalam
   sel dengan warna teks mengikuti terang-gelap sel, tooltip saat disorot memecah
   online/offline dan jumlah pengajar. Sel tanpa pilihan jam di formulir tampil sebagai
   garis tipis, bukan nol. Grid CSS, tanpa pustaka. Tampilan tabelnya adalah papan jam.
2. **Arus pendaftar** — tab Pendaftar. Garis kumulatif per hari sejak formulir dibuka,
   satu garis per gender (ikhwan slot 1 `#2a78d6`, akhwat slot 2 `#eb6834`; lolos
   validator palet: CVD ΔE 24.7, normal ΔE 33.6, kontras ≥ 3:1 di permukaan `#ffffff`).
   Garis 2px, label di ujung garis, legenda, crosshair + tooltip. Satu sumbu Y.
   Garis tegak tipis menandai hari antrean tertua menyentuh `usia_antrean_maks_hari`.
   Memakai `recharts`, seperti `MatrixTrendChart`.

Teks, angka, dan label memakai token teks, tidak pernah warna seri.

### 7.7 Gaya

Mengikuti token dan komponen `globals.css` yang sudah ada — `.stat`, `.badge-*`,
`.k-table`, `.filter-bar`, `.banner`, `.btn-sm` — tanpa pustaka baru. Angka memakai
`tabular-nums`. Warna semantik hanya untuk status (merah/kuning/hijau), aksen emerald
untuk yang bisa diklik. Lebar maksimum naik dari 1000px menjadi 1180px karena papan jam
dan tabel pengajar bertumpu pada kolom. Setiap tabel lebar dibungkus `.table-scroll`.

## 8. Aturan yang ikut dikerjakan

Semuanya terbukti perlu dari simulasi dengan data sebenarnya (deck "Siklus Pendaftaran
HITS", 16 Sep).

### 8.1 Halaqah yang sudah selesai berhenti mengunci jadwal

`jadwalTerpakaiPengajar()` membaca `hits_halaqah.active` mentah-mentah; batch Januari
dan April masih `active=true` sehingga 38 dari 82 jam Oktober terkunci palsu. Mengubah
`active` tidak tahan karena sinkronisasi sheet menghidupkannya lagi.

Aturan baru: tiap halaqah HITS punya **tanggal selesai** = tanggal terbesar dari
`hits_kaldik_hari` untuk batch-nya (semua level) dan `hits_kaldik_pertemuan` milik
halaqah itu. Halaqah **tidak mengunci** bila tanggal selesainya lebih awal dari
**tanggal mulai KBM periode** (`ks_periode.mulai`). Halaqah tanpa kaldik tetap mengunci
(perilaku lama, aman). `jadwalTerpakaiPengajar` menerima tanggal acuan itu.

Terverifikasi di produksi 16 Sep: semua batch aktif punya kaldik. Januari selesai 30 Agu,
Juni 20 Sep, Safar Juli 4 Okt, April **11 Okt**, ABK dan Nurul Iman Juli Januari 2027.
Untuk periode yang KBM-nya sebelum 11 Okt, halaqah April tetap mengunci — memang benar.

### 8.2 Kiriman ulang formulir

Identitas pendaftar = **nomor WA ternormalisasi + nama ternormalisasi** (huruf kecil,
spasi dirapatkan). Dalam satu tarikan:

- satu identitas dengan beberapa baris → baris **terbaru** yang diproses; baris lain
  berstatus baru **`diganti`**, tidak ditampilkan sebagai tertahan;
- bila salah satu baris identitas itu sudah `dialokasikan`, baris itulah kebenarannya dan
  semua baris lain `diganti`;
- satu nomor dengan **nama berbeda** (sekeluarga) bukan lagi alasan menahan.

`diganti` dihitung ulang di setiap tarikan dari seluruh isi CSV — bukan status beku.
Yang tetap beku hanya `dialokasikan` dan `batal`, seperti sekarang.
Simulasi: 530 baris tertahan → 0; pendaftar sah naik 419 → 443 (ikhwan), 2.572 → 2.819 (akhwat).

### 8.3 Pita umur dua kelompok

`≤45` dan `46+`. Pendaftar 15–17 tahun masuk kelompok pertama. Mengganti
`pitaUmur()`, `KsPitaUmur`, `KS_PITA_UMUR`, label tampilan, dan ekspor xlsx.
Simulasi batch Oktober: ikhwan 11 → 19 halaqah.

### 8.4 Satu formulir, dua periode

Sumber CSV yang sama boleh dipasang ke periode September dan Oktober. Karena kunci baris
(`sumber_row_key`) dan identitas (§8.2) sama di kedua periode:

- pendaftar yang identitasnya sudah `dialokasikan` di periode **mana pun** tidak dihitung
  antre dan tidak ikut dialokasikan di periode lain;
- dashboard menampilkannya sebagai "sudah dapat halaqah di <periode>", terpisah dari
  angka pendaftar sah;
- `setujuiUsulan` memeriksa ulang sebelum menerbitkan token, dan menolak bila ada
  peserta yang sudah dialokasikan di periode lain sejak alokasi dijalankan.

Pengecualian dihitung saat dibaca (bukan ditulis ke baris periode lain), sehingga
membatalkan usulan di satu periode otomatis mengembalikan orangnya ke antrean periode lain.

### 8.5 Jumlah pertemuan per jenjang

`ks_periode.jumlah_pertemuan` (satu angka, bawaan 22) diganti dua kolom:
`jumlah_pertemuan_dasar` (bawaan 50) dan `jumlah_pertemuan_lanjutan` (bawaan 26).
`antrekanPengiriman` memilih sesuai `ks_usulan.level`. Kolom lama dibiarkan dan tidak
dibaca lagi — dihapus di migrasi berikutnya setelah rilis.

### 8.6 `TILAWAH_*` sampai ke aplikasi produksi

`azure-pipelines.yml` memetakan `ENV_TILAWAH_BASE_URL`, `ENV_TILAWAH_EMAIL`,
`ENV_TILAWAH_PASSWORD` ke `env:` task dan menuliskannya ke `maahir.env`, mengikuti pola
`ENV_CRON_SECRET`. Akun produksi terbukti bisa login (16 Sep, 11 program terbaca).
Nilainya diisi pemilik proses di Variable Group.

### 8.7 Tidak dikerjakan sekarang

- **Batch September 2026 di `hits_batch`.** Tidak dibutuhkan: batch itu belum ada di CMS
  tilawah maupun di Maahir, sehingga halaqah September akan lahir dari modul ini dan
  sudah terlihat oleh cek bentrok lewat `ks_usulan`.
- `program_kelas` dan `program_kehadiran` sebagai sumber bentrok — dampaknya hari ini
  satu pengajar.
- Jam dua waktu dalam satu kelas (tetap dilaporkan), gateway WhatsApp, kabar hari ke-45,
  layar centang grup T−7, pengiriman antrean tanpa klik berulang — sebelum 7/14 Okt,
  rencana terpisah.

## 9. Catatan terbuka

- **Jam offline di Oktober kosong pengajar.** Karena sheet offline adalah ketersediaan
  September, 16 jam offline di periode Oktober (11 akhwat, 5 ikhwan) tidak punya pengajar
  — 531 pendaftar sah bila formulir ditempel ke Oktober.
- **Tanggal mulai KBM batch September** belum dipastikan (xlsx: 3 September). Diisi
  koordinator saat membuat periode.

## 10. Verifikasi

- `npm run typecheck`
- Simulasi ulang dengan data sebenarnya memakai fungsi yang sudah diubah: angka batch
  Oktober harus sama dengan simulasi 16 Sep (ikhwan 19 halaqah, akhwat 54) tanpa kunci palsu.
- `NODE_PATH=./scripts/node-shims npx tsx scripts/test-ketersediaan.ts` — termasuk uji
  baru: pembaca xlsx terhadap berkas nyata (179 baris, 5 sheet, 3 bagian), pencocokan
  nama, prioritas per jam di alokasi.
- `npm run build`
- Dashboard dijalankan lokal dengan data impor dan diperiksa di lebar 1280px dan 400px.
