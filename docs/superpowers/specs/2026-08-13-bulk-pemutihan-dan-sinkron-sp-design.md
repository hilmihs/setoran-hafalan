# Pemutihan Massal + Sinkronisasi Pendataan SP

Tanggal: 2026-08-13

## Masalah

Dua halaman melaporkan disiplin kehadiran peserta yang sama dengan angka berbeda.

`/2in1/koordinator/kehadiran` (Rekap Kehadiran) menggabungkan sesi `kelas_maahir`
dan `at_tibyan`. `/2in1/koordinator/kehadiran/sp` (Pendataan SP) hanya menghitung
`program = 'kelas_maahir'` — filter di `getMaahirSP` (`src/lib/maahir-sp.ts`).
Alpa dan izin At-Tibyan hilang dari perhitungan SP.

Dua contoh yang dilaporkan koordinator, sudah diverifikasi terhadap data produksi:

| Peserta | Rekap Kehadiran | Pendataan SP | Sebabnya |
| --- | --- | --- | --- |
| Afdal Khair (Maahir 6A - Ikhwan) | 2 alpa periode Juli | tak muncul (SP 0) | dua alpa itu sesi At-Tibyan (04 & 11 Jul) |
| Rashad Shafi Abdul Aziz (Maahir 6A - Ikhwan) | 3 izin, 1 alpa (28 Jul – 13 Agu) | izin 1, alpa 1 → SP 1 | tiga izin At-Tibyan (18 Jul, 01 & 08 Agu) tak terhitung |

Divergensi kedua yang ditemukan saat menelusuri: laporan bulanan memotong sesi di
luar rentang keanggotaan lewat `dalamPeriode` (`src/lib/laporan-maahir.ts`),
`getMaahirSP` tidak. Peserta yang pindah kelas atau gabung di tengah periode
menghasilkan angka berbeda di dua halaman.

## Keputusan

At-Tibyan **ikut menentukan** SP. Rekap Kehadiran dijadikan acuan; Pendataan SP
menyesuaikan diri.

Konsekuensinya besar. Simulasi kumulatif seluruh peserta (belum memperhitungkan
pemutihan dan tanggal libur, jadi angka riil lebih rendah): 78 orang naik level,
dan SP 3 — status kandidat diberhentikan — melonjak dari 66 ke 107 orang.

Karena itu pemutihan massal dibangun lebih dulu: tanpa alat itu, mengubah scope
SP langsung menjatuhkan status "diberhentikan" ke puluhan orang yang absennya
sudah dimaklumi secara lisan.

## Bagian 1 — Pemutihan Massal

### Model data

Migrasi `scripts/sql/2026-08-13-pemutihan-batch.sql`:

```sql
CREATE TABLE maahir_pemutihan_batch (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month           text NOT NULL,
  alasan          text,
  kelas_ids       jsonb NOT NULL,
  jumlah_peserta  int  NOT NULL DEFAULT 0,
  dibuat_oleh     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  dibatalkan_pada timestamptz,
  dibatalkan_oleh text
);
ALTER TABLE maahir_pemutihan
  ADD COLUMN batch_id uuid REFERENCES maahir_pemutihan_batch(id);
```

`kelas_ids` menyimpan snapshot kelas yang dicentang — riwayat tetap terbaca
meski kelas kemudian dihapus atau berganti nama. Pemutihan per-orang yang sudah
ada tetap `batch_id NULL`, jadi tak ada perilaku lama yang berubah.

### Batas modul

`src/lib/maahir-pemutihan-batch.ts` (baru) memegang seluruh urusan batch:
`getBatches(month?)`, `getKelasPilihan(month)`, `buatBatch({ month, kelasIds,
alasan, oleh })`, `batalkanBatch(id, oleh)`. `src/lib/maahir-pemutihan.ts` tak
berubah sama sekali — ia tetap urusan satu baris. Modul batch memakai satu
bulk-insert sendiri, bukan memanggil `simpanSatu` ratusan kali, supaya 160
peserta selesai dalam satu perjalanan ke DB.

`batch_id` juga ditambahkan ke entitas `pemutihan` di registry API publik
(`src/lib/api-public/registry.ts`) beserta filternya, agar konsumen bisa
mengelompokkan pemutihan massal tanpa menebak lewat waktu dan alasan.

Halaman baru `/2in1/koordinator/kehadiran/pemutihan/massal`, bukan tambahan ke
`PemutihanClient.tsx` yang sudah 189 baris dan punya tugas lain (cari satu orang,
kelola riwayat per-baris).

### Cara memilih sasaran

Daftar checkbox per kelas dengan jumlah anggota, ditambah chip pintasan di
atasnya yang hanya menyalakan/mematikan centang: **Semua · Ikhwan · Akhwat ·
Talaqqi · Intensif · Reguler · Takhassus · Tahfidz**. Grup diturunkan dari pola
nama kelas dan kolom `gender`, bukan dari tabel baru — seleksi yang tersimpan
tetap kelas-level, sehingga batch tetap sederhana dan bisa dibatalkan utuh.

Kasus yang memicu fitur ini — "putihkan Juli 2026 semua kelas kecuali Maahir 6A
dan 6B Ikhwan" — jadi: chip **Semua**, lalu hapus dua centang.

### Cakupan waktu

Sebulan penuh saja: satu baris per peserta dengan `tanggal NULL`. Peserta
dianggap hadir 100% pada periode 28–27 bulan itu, dan seluruh alpa/izin bulan itu
tak dihitung untuk SP. Pemutihan per-tanggal tetap dilayani halaman detail SP
yang sudah ada.

### Siapa yang kena

Anggota `active = true` yang rentang keanggotaannya
(`mulai_tanggal`/`selesai_tanggal`) bersinggungan dengan periode bulan itu.
Peserta yang sudah keluar sebelum periode dimulai tidak ikut.

### Tabrakan

Peserta yang sudah punya pemutihan sebulan-penuh aktif pada bulan itu
**dilewati**, tidak ditimpa. Dua alasan: alasan yang sudah ditulis koordinator
sebelumnya tak boleh hilang diam-diam, dan pembatalan batch hanya boleh mencabut
baris yang benar-benar dibuat batch itu. Hasil dilaporkan apa adanya —
*"159 diputihkan · 4 dilewati (sudah ada)"*.

### Pembatalan

Satu tombol menandai batch dan semua barisnya dengan `dibatalkan_pada` /
`dibatalkan_oleh`. Ini memakai semantik pembatalan yang sudah ada, jadi
`getPemutihan()` (yang memfilter `dibatalkan_pada IS NULL`) otomatis
mengabaikannya — Pendataan SP dan laporan bulanan ikut benar tanpa kode baru.
Baris tetap tersimpan sebagai bank data.

### Penanganan error

- Otorisasi lewat `requireKoordinator` yang sama dengan action pemutihan lama.
- Validasi: `month` cocok `^\d{4}-\d{2}$`, daftar kelas tidak kosong, semua id
  kelas ada di DB.
- Batch dibuat lebih dulu, lalu satu bulk-insert baris pemutihan, lalu
  `jumlah_peserta` diisi hasil nyata. Bila insert gagal total, batch langsung
  ditandai batal supaya tak meninggalkan baris yatim.
- `revalidatePath` ke `/pemutihan`, `/pemutihan/massal`, `/sp`, `/laporan/maahir`.

## Bagian 2 — Sinkronisasi Pendataan SP

### Scope

`getMaahirSP` dan `getSPDetail` menghitung `program IN ('kelas_maahir',
'at_tibyan')`. `muallim_najih` tetap di luar. Keduanya juga mulai memakai
`dalamPeriode` supaya sesi di luar rentang keanggotaan tak terhitung, sejalan
dengan laporan bulanan.

### Tanggal penetapan SP

Tiap peserta mendapat tanggal kapan ia menyentuh SP1, SP2, dan SP3. Diturunkan,
bukan diinput: sesi pelanggaran diurutkan menaik, hitungan alpa/izin dijalankan,
dan tanggal pertemuan pertama yang membuat `spLevel()` mencapai tiap level
dicatat. Sesi yang sudah diputihkan tak ikut, jadi tanggal penetapan bergerak
mundur ketika koordinator memutihkan sesuatu.

Ditampilkan di daftar Pendataan SP, halaman detail peserta, dan blok SP laporan
bulanan.

### Filter rentang tanggal

Halaman SP mengganti dropdown bulan dengan dua input tanggal. Perhitungan tetap
**kumulatif sejak program mulai sampai tanggal akhir** yang dipilih — pertanyaan
yang dijawab halaman ini adalah "per tanggal itu, siapa sudah kena SP berapa".
Tanggal awal menyaring tampilan: hanya peserta yang penetapan SP-nya jatuh di
dalam rentang yang ditampilkan.

### Rekap Kehadiran

Dropdown bulan di `/2in1/koordinator/kehadiran` dibuang. Filter rentang tanggal
sudah menjawab semuanya, dan dua kontrol yang saling menimpa membingungkan.
Nilai `month` yang masih dibutuhkan di dalam (template WhatsApp, fallback
rentang) diturunkan dari tanggal akhir lewat `periodeMonthOf`.

## Uji

`scripts/test-bulk-pemutihan.ts` mengikuti pola `scripts/test-sp-pemutihan.ts`
(PGlite lewat wire-protocol, memakai lib aplikasi apa adanya):

1. Buat batch untuk sebagian kelas → baris pemutihan terhubung ke batch, kelas
   yang tak dicentang tak tersentuh.
2. Peserta yang sudah punya pemutihan aktif dilewati, bukan ditimpa.
3. SP peserta di kelas terpilih luruh; SP peserta di kelas yang dikecualikan tetap.
4. Batalkan batch → SP kembali seperti semula, baris tetap ada sebagai jejak.
5. Alpa/izin At-Tibyan ikut menaikkan SP, dan tanggal penetapan menunjuk sesi
   pemicu yang benar.
