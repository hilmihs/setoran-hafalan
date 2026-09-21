# Kelayakan Pengajar — Ketersediaan Mengajar HITS

Tanggal: 2026-09-21
Modul: `ketersediaan` (`src/app/ketersediaan/*`, `src/lib/ketersediaan-*.ts`)

## Masalah

Halaman `/ketersediaan/pengajar` terbuka untuk **setiap** akun dengan role
`pengajar` yang aktif (172 orang: 52 ikhwan, 120 akhwat). Kenyataannya daftar
pengajar yang boleh mengajar satu batch ditentukan koordinator lewat dropdown
"Nama Lengkap Pengajar" di form Google — jauh lebih pendek (37 ikhwan, ±76
akhwat). Akibatnya orang di luar daftar ikut mengisi ketersediaan dan masuk
hitungan pasokan slot serta antrean alokasi.

Yang dibutuhkan:

1. Daftar kelayakan per periode yang bisa **ditambah/dikurangi koordinator**.
2. Halaman pengajar tertutup bagi yang tidak layak.
3. Isian yang sudah terlanjur masuk dari orang di luar daftar **dihapus**, dan
   orangnya **dikabari**.

## Rancangan

### 1. `ks_kelayakan` — daftar per periode

```sql
create table ks_kelayakan (
  id           uuid primary key default gen_random_uuid(),
  periode_id   uuid not null references ks_periode(id) on delete cascade,
  pengajar_id  uuid not null references pengajar(id) on delete cascade,
  boleh        boolean not null default true,
  alasan       text,
  diubah_oleh  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (periode_id, pengajar_id)
);
```

Aturan baca (`src/lib/ketersediaan-kelayakan.ts`):

- Periode **punya ≥1 baris** → mode daftar: hanya `boleh=true` yang layak.
- Periode **tanpa baris sama sekali** → semua pengajar layak. Ini mempertahankan
  perilaku sekarang, supaya periode lama (dan periode baru yang belum disetel)
  tidak mendadak terkunci total.
- Kelayakan dinilai per pengajar, bukan per gender; penyaringan gender tetap
  berjalan seperti sebelumnya di daftar slot.

Rooted di `ks_periode` dengan cascade delete, sejalan dengan tabel `ks_*` lain.

### 2. Gerbang di sisi pengajar

`/ketersediaan/pengajar`: bila tidak layak, form tidak dirender — muncul pesan
"belum terdaftar sebagai pengajar batch ini, hubungi koordinator". Server action
penyimpanan isian juga memeriksa ulang (halaman yang sudah terbuka sebelum
koordinator mencabut kelayakan tidak boleh lolos).

### 3. Panel koordinator

`PanelKelayakan` di `/ketersediaan/koordinator`:

- Daftar pengajar **segender koordinator**, dengan toggle boleh/tidak.
- Baris yang **belum mengajar** (tidak punya `hits_halaqah` aktif maupun
  `kelas_hits`) diberi badge dan diurutkan di atas — mereka justru kandidat yang
  paling perlu dimunculkan.
- Perubahan tercatat di `ks_log` (`entitas='ks_kelayakan'`).
- Tombol "salin kelayakan dari periode sebelumnya".

### 4. Anulir isian di luar daftar

Panel menampilkan isian milik pengajar tak layak:

- Tombol **Hapus isian** → `ks_pengisian` dihapus (cascade ke `ks_ketersediaan`).
  Ringkasan slot disalin ke `ks_log` lebih dulu agar jejaknya tidak hilang.
- Tombol **Kirim WA** per orang (`wa.me`, template pemberitahuan). Tidak ada
  gateway WhatsApp di repo ini — pemberitahuan tetap diklik manusia.

### 5. Seed daftar awal

Script pencocokan nama form → akun `pengajar`: normalisasi huruf kecil, spasi
ganda, apostrof, `bin/binti`. Nama yang tidak cocok atau ambigu dilaporkan, tidak
ditebak. Ikhwan 37 nama; akhwat ±76 nama hasil pembacaan tangkapan layar form.

Keadaan prod saat spesifikasi ini ditulis: 93 isian (27 ikhwan, 66 akhwat).
Lima di antaranya di luar daftar, tetapi hanya satu yang benar-benar dianulir:

- **Syamsunnas** — 4 slot online → isiannya dihapus.
- **Fauzi Rahman, Annisa Hasanah, Nur Latifah Anshoriah, Rinny Chandrawatty** —
  seluruhnya slot **offline** di Masjid Al-Kautsar Matraman. Mereka tetap mengajar
  offline, hanya tidak ikut halaqah online, jadi `boleh` tetap false (form online
  tertutup) sementara isian offline-nya dibiarkan utuh.

Karena itu panel tidak menawarkan penghapusan untuk isian yang seluruh slotnya
offline: slot offline hanya bisa ditambahkan koordinator, jadi isian semacam itu
tidak mungkin "liar".

## Yang sengaja tidak dikerjakan

- Tidak mengubah `pengajar.active` — menonaktifkan orang tetap urusan menu
  "Nonaktifkan Orang" (`/2in1/koordinator/nonaktif`).
- Tidak menambah status baru di `ks_pengisian.status`; anulir = hapus baris.
- Tidak menyentuh alur basi/pengingat/penonaktifan otomatis yang sudah ada.

## Uji

- `scripts/test-ketersediaan.ts`: aturan kelayakan murni (daftar kosong = semua
  layak; ada daftar = hanya `boleh=true`).
- `npm run typecheck` sebagai gerbang utama (tidak ada test runner di repo ini,
  dan `npm run lint` rusak).
