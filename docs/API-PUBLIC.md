# API Publik Maahir — Dokumentasi Konsumen

Dokumen ini cukup untuk mengintegrasikan data Maahir ke website lain tanpa perlu
bertanya. Kalau ada yang tidak tercakup di sini, itu memang belum dibuka di v1.

- **Base URL**: `https://maahir.muhajirproject.org/api/v1`
- **Versi**: `v1` di URL. Perubahan yang memecah konsumen akan keluar sebagai `v2`;
  `v1` tetap hidup.
- **Hanya `GET`.** API ini keluar-saja (read-only). Tidak ada `POST`/`PUT`/`DELETE`.

---

## 1. Autentikasi & cara memanggil

Setiap request wajib membawa header Bearer berisi API key konsumen:

```
Authorization: Bearer k_live_xxxxx
```

Key dibuat oleh admin Maahir lewat halaman internal dan diserahkan ke Anda sekali.
Simpan sebagai environment variable, **jangan** ditaruh di kode klien / browser.

### Server-to-server saja

API ini dirancang untuk dipanggil **dari server ke server**. Tidak ada CORS: memanggil
dari JavaScript di browser tidak akan berhasil dan **memang tidak boleh** — key Anda
akan bocor ke publik kalau dikirim dari sisi browser. Panggil dari backend Anda
(Node, PHP, Python, dst.), simpan hasilnya, lalu tampilkan dari sana.

### Contoh `fetch` (Node.js, sisi server)

```js
// Jalankan di backend Anda, bukan di browser.
const BASE = 'https://maahir.muhajirproject.org/api/v1';
const KEY = process.env.MAAHIR_API_KEY; // 'k_live_xxxxx'

async function ambil(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/${path}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}` },
  });

  if (res.status === 304) return null;      // tidak berubah (lihat ETag di §8)
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`${res.status} ${err.error.code}: ${err.error.message}`);
  }
  return res.json();
}

// Contoh: daftar peserta akhwat yang aktif, halaman pertama.
const { data, meta } = await ambil('peserta', { gender: 'akhwat', active: 'true' });
console.log(meta.total, 'peserta', data.length, 'baris');

// Contoh rekap: laporan kehadiran Maahir bulan Agustus 2026.
const laporan = await ambil('rekap/laporan-maahir', { bulan: '2026-08' });
```

### Scope key

Tiap key punya satu atau lebih **scope**: `maahir`, `hits`, `penilaian`, `shakwa`. Sebuah route
hanya bisa diakses kalau key Anda memiliki scope route tersebut (lihat kolom Scope di
tabel §3). Route rekap mewarisi scope domainnya — tidak ada scope `rekap` terpisah.

Empat entitas **referensi orang** (`musyrif`, `koordinator`, `syaikh`,
`koordinator-ketua-kelas`) bisa dibaca oleh **key mana pun yang sah**, apa pun
scope-nya — karena hanya berisi `id`, `name`, `gender`, `active` dan dibutuhkan untuk
menerjemahkan FK seperti `checked_by_musyrif_id` menjadi nama.

---

## 2. Bentuk respons (envelope)

Semua respons berbentuk JSON. Ada tiga bentuk: sukses entitas, sukses rekap, dan error.

### Sukses — entitas mentah (`data` berupa array)

```json
{
  "data": [
    { "id": "uuid", "name": "..." }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 412,
    "has_more": true,
    "dari_cache": false,
    "umur_detik": 0
  }
}
```

- `total` — jumlah baris sebenarnya untuk filter itu (hitungan eksak, bukan perkiraan).
- `has_more` — `true` bila masih ada halaman berikutnya.
- `dari_cache` / `umur_detik` — lihat §8 (cache).

### Sukses — rekap (`data` berupa objek)

Route rekap mengembalikan **satu laporan utuh** (objek), bukan daftar, dan `meta`
berisi rentang periode efektif serta penanda cache. Contoh bentuk (isi `data`
tergantung route):

```json
{
  "data": { "...": "satu laporan utuh" },
  "meta": {
    "bulan": "2026-08",
    "mulai": "2026-07-28",
    "sampai": "2026-08-27",
    "dari_cache": false,
    "umur_detik": 0
  }
}
```

### Error

Selalu bentuk ini. Detail internal (pesan Postgres, nama tabel) tidak pernah ikut.

```json
{ "error": { "code": "forbidden_scope", "message": "Key tidak punya scope 'hits'." } }
```

### Tabel status & kode error

| HTTP | `code` | Sebab |
|---|---|---|
| 400 | `bad_param` | filter tak dikenal, `limit` di luar 1–500, `page` < 1, tanggal bukan `YYYY-MM-DD`, `minggu` bukan hari Senin, `mode`/`gender` tidak valid |
| 401 | `unauthorized` | header hilang / salah format / key tidak cocok / key kedaluwarsa / key dinonaktifkan |
| 403 | `forbidden_scope` | key sah, tapi scope-nya tidak mencakup entitas/route itu |
| 404 | `unknown_entity` | entitas tidak ada di daftar route |
| 404 | `not_found` | saklar induk API sedang mati (`PUBLIC_API` tidak `on`) |
| 429 | `rate_limited` | melewati batas per key, atau antrean request berjalan penuh — sertai `Retry-After` |
| 500 | `internal` | error tak terduga; detail hanya di log server |

Selain itu, saat aplikasi berada dalam **mode maintenance**, seluruh `/api/*` bisa ikut
tidak tersedia (mis. `503`). Perlakukan seperti gangguan sementara — **retry** dengan
jeda (lihat §8).

---

## 3. Daftar route

Total **42 route**: 36 entitas mentah + 6 route rekap.

Parameter yang berlaku di **semua** entitas mentah: `page`, `limit`, `urut`
(`asc`/`desc` pada kolom urutan default). Filter lain hanya yang terdaftar di kolom
"Filter" masing-masing. **Parameter tak dikenal → `400 bad_param`** (tidak diabaikan
diam-diam), supaya salah tulis seperti `gender=iwkhan` tidak terbaca sebagai "tanpa
filter".

### 3.1 Entitas mentah — scope `maahir` (13)

| Path `/api/v1/…` | Filter |
|---|---|
| `program-kelas` | `gender`, `self_attendance`, `presensi_sifat` |
| `anggota` | `program_kelas_id`, `is_ketua`, `is_wakil` |
| `pertemuan` | `program_kelas_id`, `program`, `tanggal_dari`, `tanggal_sampai` |
| `kehadiran` | `pertemuan_id`, `anggota_id`, `status`, `mode`, `sejak` |
| `libur` | `program_kelas_id`, `tanggal_dari`, `tanggal_sampai` |
| `pemutihan` | `anggota_id`, `month`, `aktif` |
| `laporan-note` | `month` |
| `peserta` | `gender`, `active`, `kelas_id` |
| `kelas` | `gender` |
| `setoran` | `peserta_id`, `status`, `week_start`, `tanggal_dari`, `tanggal_sampai` |
| `rekaman` | `setoran_id`, `jenis`, `nilai` |
| `setoran-musyrif` | `musyrif_id`, `status`, `week_start`, `tanggal_dari`, `tanggal_sampai` |
| `rekaman-musyrif` | `setoran_musyrif_id`, `jenis`, `nilai` |

Kolom yang keluar per entitas:

- **`program-kelas`**: `id`, `name`, `gender`, `jadwal_hari`, `waktu_mulai`, `waktu_selesai`, `self_attendance`, `presensi_sifat`, `created_at`
- **`anggota`**: `id`, `program_kelas_id`, `peserta_id`, `name`, `is_ketua`, `is_wakil`, `mulai_tanggal`, `created_at`
- **`pertemuan`**: `id`, `program_kelas_id`, `kelas_id`, `program`, `tanggal`, `nama_kegiatan`, `waktu_mulai`, `waktu_selesai`, `keterangan`, `created_at`
- **`kehadiran`**: `id`, `pertemuan_id`, `anggota_id`, `peserta_id`, `status`, `mode`, `setoran_halaman`, `catatan`, `diisi_at`, `updated_at`, `created_at` *(kolom `catatan` sensitif — lihat §7)*
- **`libur`**: `id`, `program_kelas_id`, `tanggal_mulai`, `tanggal_selesai`, `keterangan`, `created_at`
- **`pemutihan`**: `id`, `anggota_id`, `month`, `tanggal`, `alasan`, `dibuat_oleh`, `dibatalkan_pada`, `created_at`
- **`laporan-note`**: `id`, `month`, `teks`, `urutan`, `created_at`, `updated_at`
- **`peserta`**: `id`, `name`, `gender`, `kelas_id`, `active`, `created_at`
- **`kelas`**: `id`, `name`, `gender`, `musyrif_id`, `created_at`
- **`setoran`**: `id`, `peserta_id`, `week_start`, `status`, `submitted_at`, `checked_at`, `checked_by_musyrif_id`, `created_at`, `updated_at`
- **`rekaman`**: `id`, `setoran_id`, `jenis`, `duration_seconds`, `recorded_at`, `nilai`, `checked_at`, `created_at`
- **`setoran-musyrif`**: `id`, `musyrif_id`, `week_start`, `status`, `submitted_at`, `checked_at`, `checked_by_syaikh_id`, `created_at`
- **`rekaman-musyrif`**: `id`, `setoran_musyrif_id`, `jenis`, `duration_seconds`, `nilai`, `checked_at`, `created_at`

### 3.2 Entitas mentah — scope `hits` (14)

| Path `/api/v1/…` | Filter |
|---|---|
| `hits/batch` | `active` |
| `hits/halaqah` | `batch_id`, `gender`, `pengajar_id`, `level`, `program` |
| `hits/halaqah-peserta` | `halaqah_id`, `is_ketua` |
| `hits/kaldik-hari` | `batch_id`, `level`, `tanggal_dari`, `tanggal_sampai`, `pekan`, `is_libur` |
| `hits/kaldik-pertemuan` | `halaqah_id`, `level`, `pertemuan_no`, `is_skipped` |
| `hits/keterangan-harian` | `halaqah_id`, `level`, `pertemuan_no`, `kondisi`, `tanggal_dari`, `tanggal_sampai` |
| `hits/pelanggaran` | `keterangan_id`, `jenis` |
| `hits/hutang-bayar` | `halaqah_id`, `pengajar_id`, `tanggal_dari`, `tanggal_sampai` |
| `hits/teguran` | `pengajar_id`, `category`, `year_month` |
| `hits/tabayyun` | `pengajar_id`, `status`, `keterangan_id` |
| `hits/kajian-presensi` | `status`, `tanggal_dari`, `tanggal_sampai` |
| `hits/kajian-libur` | `tanggal_dari`, `tanggal_sampai` |
| `hits/pengajar` | `gender`, `active`, `kelompok_id` |
| `hits/kelompok-pengajar` | `gender` |

Kolom yang keluar per entitas:

- **`hits/batch`**: `id`, `slug`, `name`, `start_date`, `active`, `created_at`
- **`hits/halaqah`**: `id`, `batch_id`, `name`, `gender`, `pengajar_id`, `level`, `program`, `start_date`, `jadwal_hari`, `created_at`
- **`hits/halaqah-peserta`**: `id`, `halaqah_id`, `murid_id`, `nama`, `is_ketua`, `created_at`
- **`hits/kaldik-hari`**: `id`, `batch_id`, `level`, `tanggal`, `pekan`, `is_libur`
- **`hits/kaldik-pertemuan`**: `id`, `halaqah_id`, `level`, `pertemuan_no`, `tanggal`, `is_skipped`, `note`
- **`hits/keterangan-harian`**: `id`, `halaqah_id`, `level`, `pertemuan_no`, `tanggal`, `kondisi`, `status_latihan`, `created_at`
- **`hits/pelanggaran`**: `id`, `keterangan_id`, `jenis`, `menit`
- **`hits/hutang-bayar`**: `id`, `halaqah_id`, `pengajar_id`, `keterangan_id`, `menit`, `tanggal`, `created_at`
- **`hits/teguran`**: `id`, `pengajar_id`, `category`, `year_month`, `nomor_teguran`, `created_at`
- **`hits/tabayyun`**: `id`, `keterangan_id`, `pengajar_id`, `status`, `kondisi`, `deadline_at`, `created_at`
- **`hits/kajian-presensi`**: `id`, `tanggal`, `status`, `created_at`, **`ketua_nama`** *(lihat catatan di bawah)*
- **`hits/kajian-libur`**: `id`, `tanggal`
- **`hits/pengajar`**: `id`, `name`, `gender`, `kelompok_id`, `is_ketua`, `matrix_exclude`, `active`, `created_at`
- **`hits/kelompok-pengajar`**: `id`, `name`, `gender`, `created_at`

> **`hits/kajian-presensi`** aslinya berkunci nomor WA ketua. WA tidak pernah keluar;
> API meng-*resolve*-nya menjadi `ketua_nama`. Ketua yang WA-nya tak lagi terdaftar di
> halaqah mana pun keluar sebagai `ketua_nama: null` — **barisnya tetap ada** supaya
> hitungan agregat tidak berubah.

### 3.3 Entitas mentah — scope `penilaian` (5)

| Path `/api/v1/…` | Filter |
|---|---|
| `penilaian-peserta` | `peserta_id`, `year_month`, `sejak` |
| `penilaian-masyaikh` | `pengajar_id`, `year_month`, `sejak` |
| `penilaian-pedagogis` | `pengajar_id`, `year_month`, `sejak` |
| `matrix-rekap` | `pengajar_id`, `year_month`, `sejak` |
| `indikator-standar` | `kategori` |

Kolom yang keluar per entitas:

- **`penilaian-peserta`**: `id`, `peserta_id`, `year_month`, `skor_bacaan`, `skor_hafalan`, `assessor_role`, `updated_at`
- **`penilaian-masyaikh`**: `id`, `pengajar_id`, `year_month`, `skor_bacaan`, `skor_hafalan`, `assessor_role`, `updated_at`
- **`penilaian-pedagogis`**: `id`, `pengajar_id`, `year_month`, `skor_metode_pengajaran`, `skor_kepatuhan_silabus`, `skor_manajemen_halaqah`, `skor_evaluasi_penguasaan`, `skor_kepatuhan_sop`, `updated_at`
- **`matrix-rekap`**: `id`, `pengajar_id`, `year_month`, `skor_bacaan`, `skor_hafalan`, `skor_tajwid`, `skor_kehadiran_maahir`, `skor_kehadiran_tibyan`, `rata_rata_hard_skill`, `skor_metode_pengajaran`, `skor_kepatuhan_silabus`, `skor_manajemen_halaqah`, `skor_evaluasi_penguasaan`, `rata_rata_pedagogis`, `skor_kedisiplinan_waktu`, `skor_komitmen_jadwal`, `skor_tanggung_jawab`, `skor_kepatuhan_sop`, `rata_rata_soft_skill`, `rata_rata_keseluruhan`, `ranking`, `total_teguran_bulan`, `total_teguran_kumulatif`, `updated_at`
- **`indikator-standar`**: `kode`, `kategori`, `nama`, `standar`

### 3.4 Referensi orang (4 — dibaca oleh key mana pun yang sah)

| Path `/api/v1/…` | Filter | Kolom keluar |
|---|---|---|
| `musyrif` | `gender`, `active` | `id`, `name`, `gender`, `active` |
| `koordinator` | `gender`, `active` | `id`, `name`, `gender`, `active` |
| `syaikh` | `gender`, `active` | `id`, `name`, `gender`, `active` |
| `koordinator-ketua-kelas` | `gender`, `active` | `id`, `name`, `gender`, `active` |

### 3.5 Route rekap (7)

Route rekap **tidak dipaginasi** (memotong laporan membuat total & rata-rata salah).
Setiap route mewarisi scope domainnya.

| Path `/api/v1/…` | Parameter | Scope |
|---|---|---|
| `rekap/laporan-maahir` | `bulan=YYYY-MM` (**wajib**) | `maahir` |
| `rekap/sp` | `gender` (opsional), `sampai_bulan=YYYY-MM` (opsional) | `maahir` |
| `rekap/kehadiran` | `bulan=YYYY-MM` (**wajib**), `gender`, `program`, `kelas_id` (boleh berulang) | `maahir` |
| `rekap/tibyan` | `bulan=YYYY-MM` (**wajib**), `gender` | `maahir` |
| `rekap/hits-disiplin` | `mode=bulan\|minggu` (**wajib**), `bulan`, `minggu=YYYY-MM-DD`, `gender` | `hits` |
| `rekap/matrix-guru` | `bulan=YYYY-MM` (**wajib**), `gender` | `penilaian` |
| `rekap/shakwa` | `tanggal=YYYY-MM-DD`, atau `dari`+`sampai`; `kategori`, `status`, `gender` (semua opsional) | `shakwa` |

Aturan parameter rekap:

- `gender`, bila diisi, harus persis `ikhwan` atau `akhwat`; nilai lain → `400`.
- `program` pada `rekap/kehadiran`: `kelas_maahir` atau `at_tibyan`.
- `rekap/hits-disiplin`: `mode` wajib. `mode=bulan` → `bulan` wajib; `mode=minggu` →
  `minggu` wajib **dan harus jatuh pada hari Senin** (kalau bukan Senin → `400`, tidak
  dibetulkan diam-diam).
- `rekap/shakwa`: tanpa parameter tanggal → **hari ini menurut WIB**. `dari` dan `sampai`
  harus diisi berpasangan; kalau `tanggal` juga diisi, rentang yang menang. `kategori`
  memakai nilai enum (`evaluasi`, `pengajar`, `peserta`, `cerita_menarik`,
  `modul_kurikulum`, `ketidaksesuaian_aplikasi`, `izin`, `tali_kasih`); `status` salah
  satu dari `submitted` (baru), `in_review` (diproses), `resolved` (selesai), `closed`.
- Perilaku periode & bisnis tiap rekap dijelaskan di §9.

---

## 4. Pagination

Berlaku untuk entitas mentah (bukan rekap).

| Parameter | Default | Batas |
|---|---|---|
| `page` | `1` | mulai dari 1 |
| `limit` | `100` | maksimum `500` |

- `meta.total` adalah hitungan **eksak** untuk filter yang dipakai.
- Tidak ada mode "ambil semua tanpa batas" — satu request tidak boleh menarik puluhan
  ribu baris. Iterasikan `page` sampai `has_more` bernilai `false`.

```js
let page = 1, semua = [];
for (;;) {
  const { data, meta } = await ambil('kehadiran', { page, limit: '500' });
  semua.push(...data);
  if (!meta.has_more) break;
  page++;
}
```

Route rekap **tidak** menerima `page`/`limit`.

---

## 5. Tarik bertahap (incremental) & sinkronisasi harian

Tidak semua tabel bisa ditarik bertahap. Pola:

- **Tabel bertanggal** — punya `tanggal_dari` / `tanggal_sampai` (mis. `pertemuan`,
  `libur`, `hits/kaldik-hari`, `hits/keterangan-harian`, `hits/hutang-bayar`,
  `hits/kajian-presensi`, `hits/kajian-libur`; juga `setoran`/`setoran-musyrif` lewat
  `week_start`). Batasi rentang dengan dua parameter itu.
- **Tabel dengan `updated_at`** — punya filter `sejak` (`updated_at >=`), yakni
  `kehadiran`, `penilaian-peserta`, `penilaian-masyaikh`, `penilaian-pedagogis`,
  `matrix-rekap`. Simpan `updated_at` tertinggi yang pernah Anda terima, lalu di sync
  berikutnya kirim `sejak=<nilai itu>`.
- **Tabel tanpa keduanya** hanya bisa ditarik **penuh** setiap kali (mis. `peserta`,
  `kelas`, `pengajar`, `hits/halaqah`, referensi orang).

### Pola sinkronisasi harian yang disarankan

1. Untuk tabel yang punya `sejak`: kirim `sejak=<updated_at terakhir>` — Anda hanya
   menerima baris yang berubah.
2. Untuk tabel bertanggal tanpa `updated_at`: tarik ulang rentang tanggal yang relevan
   (mis. bulan berjalan), karena baris lama bisa dikoreksi.
3. Untuk tabel kecil tanpa keduanya: tarik penuh — jumlahnya sedikit.

> Catatan: `sejak` memakai `updated_at >=` (inklusif). Menyimpan nilai `updated_at`
> tertinggi lalu mengirimkannya kembali berarti baris paling akhir bisa terkirim ulang;
> deduplikasi di sisi Anda berdasarkan `id`.

---

## 6. Kolom yang tidak akan pernah keluar

Jangan menunggu kolom-kolom ini — API menolaknya secara **struktural** (aplikasi gagal
start bila ada entitas menyebutnya), bukan sekadar konvensi:

- **Hash password** (`password_hash`) di semua tabel orang.
- **Nomor WhatsApp** (`whatsapp_number`, `ketua_wa`, `wakil_wa`) — nomor pribadi
  sekaligus identitas login sistem ini.
- **Token login tanpa password** (`magic_token`).
- **Password polos hasil reset** (`new_password_plaintext`).
- **Token persetujuan** (`token`) di semua tabel request/pengajuan.
- **Komentar bebas penilai tentang orang**: `ket_bacaan`, `ket_hafalan`,
  `catatan_umum`, `masukan`.
- **`audio_url`** — file audio dilayani lewat URL bertanda-tangan berbatas waktu;
  membocorkannya berarti rekaman suara santri bisa diunduh siapa pun. Namun **`nilai`**
  (mutu bacaan: hijau/kuning/merah) **tetap keluar**, jadi statistik mutu tetap bisa
  dihitung tanpa audionya.

Selain itu, hanya kolom yang tercantum di §3 yang keluar — tidak ada `select *`, dan
tidak ada join dinamis. Gabungkan antar-entitas di sisi Anda lewat UUID (FK).

---

## 7. Data sensitif: `catatan` / `keterangan`

`kehadiran.catatan` (entitas) dan `keterangan` (di payload rekap kehadiran, gabungan
dari `catatan` yang sama) **ikut keluar** dan berisi **alasan tidak hadir**. Isinya
sering berupa informasi kesehatan dan urusan keluarga — mis. `"demam"`, `"ibu sakit"`.

Kewajiban di sisi konsumen:

- **Jangan** ditayangkan di halaman publik.
- **Jangan** dibiarkan diindeks mesin pencari (`noindex`, tidak masuk sitemap publik).
- **Batasi** aksesnya ke pengguna yang memang berhak di sistem Anda.

Kolom ini terbuka bagi pemegang key, bukan bagi internet — pengamanannya sekarang ada
di tangan Anda.

---

## 8. Cache, ETag, rate limit & maintenance

### TTL cache

| Jenis | TTL | Artinya |
|---|---|---|
| Entitas mentah | **60 detik** | data bisa tertinggal sampai ~60 detik |
| Route rekap | **300 detik (5 menit)** | data bisa tertinggal sampai ~5 menit |

Kondisi cache terlihat di `meta`: `dari_cache` (`true`/`false`) dan `umur_detik`
(umur entri yang dilayani). Kalau Anda butuh angka yang benar-benar mutakhir untuk
laporan tertentu, perhitungkan lag ini.

### ETag / If-None-Match → 304

Setiap respons membawa header `ETag` (hash isi) dan `Cache-Control: private, max-age=…`.
Simpan `ETag`, lalu di request berikutnya kirim `If-None-Match: <etag>`. Bila isi belum
berubah, server membalas **`304 Not Modified` tanpa body** — hemat bandwidth di kedua
sisi.

```js
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${KEY}`, 'If-None-Match': etagTersimpan },
});
if (res.status === 304) { /* pakai data lama */ }
```

### Rate limit — 429

- Batas **120 request/menit per key**. Melewatinya → `429 rate_limited` dengan header
  `Retry-After` (detik).
- Ada juga **batas request berjalan**: maksimum 4 request `/api/v1/*` diproses
  bersamaan. Request ke-5 menunggu paling lama 5 detik; kalau antrean tak lekas kosong,
  ia juga dibalas `429` + `Retry-After`.

Perlakukan `429` dengan menghormati `Retry-After`: tunggu sesuai nilainya lalu coba
lagi. Hindari mengirim banyak request berat (rekap / scan sebulan) secara serentak;
lebih baik dijadwalkan berurutan.

### Maintenance

Saat aplikasi dalam mode maintenance, seluruh `/api/*` bisa ikut tidak tersedia. Ini
bersifat sementara — **retry** dengan jeda. Begitu pula bila saklar induk API dimatikan
Anda menerima `404 not_found`; itu keputusan operasional, bukan kesalahan request Anda.

---

## 9. Aturan bisnis yang gampang salah dihitung ulang

**Ini alasan utama lapisan rekap ada.** Kalau Anda menghitung sendiri dari entitas
mentah tanpa aturan-aturan berikut, angka Anda akan **berbeda** dari yang dilihat
koordinator di layar Maahir — dan biasanya yang disalahkan justru aplikasi Maahir.
**Rekomendasi: ambil angka jadi dari route rekap, jangan menurunkannya ulang dari
entitas mentah.**

- **Periode `rekap/laporan-maahir` = 28→27, bukan kalender bulan.** `bulan=2026-08`
  berarti **28 Juli–27 Agustus**. Rentang aktual dikembalikan di `meta`
  (`{"bulan":"2026-08","mulai":"2026-07-28","sampai":"2026-08-27"}`) — pakai itu untuk
  melabeli grafik, jangan asumsikan 1–31.

- **`rekap/shakwa` memotong hari menurut WIB (UTC+7), bukan UTC.** Laporan yang masuk
  pukul 06.00 WIB tetap masuk hitungan hari itu. Nomor WhatsApp pelapor **tidak pernah**
  ikut keluar, dan lampiran hanya dilaporkan jumlahnya (`jumlahLampiran`) — berkasnya
  hanya bisa dibuka koordinator lewat dashboard.

- **SP di `rekap/laporan-maahir` dihitung per periode bulan itu saja** (28→27), bukan
  kumulatif sejak program berjalan. Angka kumulatif ada di `rekap/sp`. Dua-duanya sah —
  jangan saling dibandingkan seolah harus sama.

- **`rekap/hits-disiplin` mode `bulan` justru memakai kalender penuh** (1–akhir bulan),
  **berbeda** dari window 28→27 milik `laporan-maahir`. Dua route ini memakai definisi
  "bulan" yang berbeda; jangan disamakan.

- **Sesi "sakit" keluar dari penyebut kehadiran** — tidak menurunkan persentase. Kalau
  Anda menghitung `hadir / total_sesi` mentah, orang yang sakit akan tampak lebih buruk
  dari semestinya. Rekap sudah mengeluarkan sesi sakit dari penyebut.

- **Pemutihan SP membuat persen dianggap 100.** Anggota yang di-"putihkan" pada suatu
  periode dihitung seolah kehadirannya penuh. Ini tidak terlihat dari data kehadiran
  mentah saja.

- **Anggota yang bergabung di tengah periode punya penyebut terpotong** — persentasenya
  dihitung dari tanggal ia bergabung (`mulai_tanggal`), bukan dari awal periode.

- **`rekap/matrix-guru` (dan entitas `matrix-rekap`) adalah snapshot, bukan hitung
  ulang langsung.** Bulan yang belum pernah di-*recompute* menghasilkan hasil kosong,
  bukan nol. `meta.snapshot_terakhir` = kapan terakhir dihitung; `meta.basi = true` bila
  snapshot lebih tua dari akhir bulan yang diminta. API tidak memicu recompute.

- **`rekap/sp` bersifat kumulatif** sejak awal program (bukan per bulan). `sampai_bulan`
  hanya menggeser batas akhir; bila bulan yang diminta masih berjalan, batas dipotong ke
  hari ini. Tanggal efektif ada di `meta.cutoff`.

---

## Evaluasi Halaqah — sync (masuk, server-to-server)

Berbeda dari route `GET /api/v1/*` yang read-only, endpoint ini **menerima** data master
Evaluasi Halaqah (mirror `eval_batch` / `eval_pengajar` / `eval_halaqah` / `eval_peserta`)
dari sistem sumber user.

- **Path**: `POST /api/evaluasi/sync`
- **Auth**: header `Authorization: Bearer k_live_xxxxx` (API key konsumen yang sama seperti
  jalur `v1`; diverifikasi lewat `verifyBearer`).
- **Body** (JSON): setiap array opsional; yang tak dikirim dihitung `0`.

```json
{
  "batch":    [{ "id": "b1", "nama": "Batch 1", "aktif": true }],
  "pengajar": [{ "id": "p1", "nama": "Ustadz A", "gender": "ikhwan" }],
  "halaqah":  [{ "id": "h1", "nama": "Halaqah 1", "gender": "ikhwan", "pengajar_id": "p1", "batch_id": "b1" }],
  "peserta":  [{ "id": "s1", "nama": "Santri A", "gender": "ikhwan", "halaqah_id": "h1" }]
}
```

- Tiap baris **wajib** punya `id` dan `nama`; baris tanpa keduanya diabaikan.
- Upsert `onConflict: 'id'`, ditambah `synced_at` otomatis.
- **Respons**: `{ "ok": true, "counts": { "batch": n, "pengajar": n, "halaqah": n, "peserta": n } }`.
- Nama field sumber di atas **provisional** — menunggu spesifikasi API sinkron user; pemetaan
  ke kolom mirror dilakukan di route ini.

---

## 10. Ringkasan cepat

- Base URL `https://maahir.muhajirproject.org/api/v1`, header `Authorization: Bearer
  k_live_xxxxx`, **server-to-server**, hanya `GET`.
- 36 entitas mentah (paginasi `page`/`limit`, maks 500) + 6 rekap (tanpa paginasi).
- Filter tak dikenal → `400`. Scope salah → `403`. Saklar/maintenance → `404`/`503`.
- Kolom sensitif WA/hash/token/audio **tidak pernah** keluar; `catatan`/`keterangan`
  keluar tapi **wajib** dijaga (§7).
- Data bisa tertinggal ≤60 detik (rekap ≤5 menit); pakai `ETag` untuk hemat.
- **Untuk angka rekap, pakai route `rekap/*` — jangan hitung ulang sendiri (§9).**
```