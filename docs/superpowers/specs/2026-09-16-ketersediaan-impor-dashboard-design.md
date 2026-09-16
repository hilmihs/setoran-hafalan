# Impor Ketersediaan Pengajar & Dashboard Koordinator

**Tanggal:** 16 September 2026
**Status:** rancangan, menunggu persetujuan
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

## 3. Bentuk berkas xlsx (terverifikasi 16 Sep 2026)

| Sheet | Gender | Kolom | Susunan |
|---|---|---|---|
| Online - Ikhwan | ikhwan | No, Nama, WA, Online/Offline, Waktu, Prioritas | Baris 3 "Batch September 2026 …", kepala baris 4, data. Lalu baris "Batch Oktober 2026 …", kepala lagi, data. |
| Online - Akhwat | akhwat | sama | sama |
| Offline - Pejaten Ikhwan | ikhwan | No, Nama, Online/Offline, Waktu, Kelas | satu bagian, **tanpa WA** |
| Offline - Pejaten Akhwat | akhwat | sama | satu bagian, **tanpa WA** |
| Offline - Al-Kautsar Matraman | ikhwan lalu akhwat | No, Nama, Online/Offline, Waktu, Kelas | baris "Ikhwan" / "Akhwat" memisahkan bagian, **tanpa WA** |

Isi: 179 baris ketersediaan, 103 pengajar. Online: 84 nomor WA unik, 82 punya akun
`pengajar` di produksi. Tiga baris offline Matraman berjam dua waktu berbeda
("Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30") dan tidak dapat diwakili satu jam.

Pembaca berkas dibuat mengikuti **penanda**, bukan nomor baris: baris berisi
"Batch …" membuka bagian batch, baris "Ikhwan"/"Akhwat" mengganti gender, baris yang
kolom pertamanya "No" adalah kepala. Kolom dikenali dari judulnya.

## 4. Impor

### 4.1 Alur

1. Koordinator membuka **Pengaturan → Impor ketersediaan pengajar** dan mengunggah xlsx.
2. Server membaca berkas dan mengembalikan **pratinjau**. Tidak ada yang disimpan.
3. Pratinjau per bagian (September online, Oktober online, September offline):
   - jumlah pengajar dan jam; periode tujuan (pilih periode yang ada, atau "buat periode baru")
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

Migrasi `0077_ketersediaan_impor.sql` (nomor bebas terakhir diperiksa 16 Sep: `0076`):

```sql
alter table ks_ketersediaan
  add column if not exists prioritas integer check (prioritas is null or prioritas > 0);

alter table ks_pengisian
  add column if not exists sumber text not null default 'form'
  check (sumber in ('form', 'impor'));
```

Keduanya menambah kolom bernilai bawaan; tidak ada data lama yang berubah (produksi
kosong). `src/types/db.ts` diperbarui. DDL produksi dijalankan pemilik proses.

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

### 7.6 Gaya

Mengikuti token dan komponen `globals.css` yang sudah ada — `.stat`, `.badge-*`,
`.k-table`, `.filter-bar`, `.banner`, `.btn-sm` — tanpa pustaka baru. Angka memakai
`tabular-nums`. Warna semantik hanya untuk status (merah/kuning/hijau), aksen emerald
untuk yang bisa diklik. Lebar maksimum naik dari 1000px menjadi 1180px karena papan jam
dan tabel pengajar bertumpu pada kolom. Setiap tabel lebar dibungkus `.table-scroll`.

## 8. Di luar cakupan spec ini

Dikerjakan di rencana terpisah, tetapi **dibutuhkan sebelum sinkronisasi 21 September**:

- halaqah batch lama yang masih `active=true` berhenti mengunci jadwal (pakai tanggal
  pertemuan terakhir dari `hits_kaldik_hari`);
- kiriman ulang formulir: yang terakhir per nomor + nama yang berlaku;
- pita umur dua kelompok (≤45, 46+) — mengubah CHECK di `ks_pendaftar` dan `ks_usulan`;
- batch September 2026 dicatat di `hits_batch`.

Setelahnya, sebelum 14 Oktober: jumlah pertemuan per jenjang (Dasar 50, Lanjutan 26),
pemetaan `TILAWAH_*` di `azure-pipelines.yml`, batch September & Oktober dibuat di CMS
tilawah, pengiriman antrean tanpa diklik berulang.

Tidak dikerjakan: jam dua waktu dalam satu kelas (tetap dilaporkan), membuka halaman
pengajar, gateway WhatsApp.

## 9. Catatan terbuka

- **Pendaftar untuk periode mana.** Formulir pendaftar satu set; periode September dan
  Oktober masing-masing punya sumber CSV. Menempelkan formulir yang sama ke dua periode
  akan membuat pendaftar dialokasikan dua kali. Koordinator memilih satu.
- **Jam offline di Oktober kosong pengajar.** Karena sheet offline adalah ketersediaan
  September, 13 jam offline di periode Oktober tidak punya pengajar (360 pendaftar sah
  bila formulir ditempel ke Oktober).
- **Tanggal mulai KBM batch September** belum dipastikan (xlsx: 3 September). Diisi
  koordinator saat membuat periode.

## 10. Verifikasi

- `npm run typecheck`
- `NODE_PATH=./scripts/node-shims npx tsx scripts/test-ketersediaan.ts` — termasuk uji
  baru: pembaca xlsx terhadap berkas nyata (179 baris, 5 sheet, 3 bagian), pencocokan
  nama, prioritas per jam di alokasi.
- `npm run build`
- Dashboard dijalankan lokal dengan data impor dan diperiksa di lebar 1280px dan 400px.
