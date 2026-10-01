# Izin Shakwa: pilihan badal pengajar

Tanggal: 2026-10-01 · Status: disetujui

## Masalah

Pengajar yang tidak bisa mengajar dan melapor lewat formulir Shakwa (kategori
`izin`) hanya bisa memilih KMT, KBLA, JKG (jadwal kelas ganti = reschedule), atau
TIDAK_HADIR. Tidak ada cara menyatakan "kelas tetap jalan, diajar pengajar lain"
(badal) — padahal observasi ketua kelas sudah mengenal pelanggaran `BADAL`
(dengan `badal_nama` teks bebas).

## Keputusan

- Jenis izin baru **`BADAL`** — namanya sama dengan pelanggaran observasi, jadi
  `izinCocokKondisi` mencocokkan BADAL↔BADAL tanpa aturan tambahan.
- Pengganti **wajib** dipilih dari daftar pengajar HITS (tabel `pengajar`,
  `active = true`), **gender sama** dengan pengirim, bukan dirinya sendiri.
- Disimpan sebagai FK `shakwa_izin.badal_pengajar_id`, bukan teks.

Ditolak: memakai ulang `TIDAK_HADIR` + kolom opsional (mengaburkan arti "kelas
kosong" vs "dibadalkan" di rekap); nama teks bebas (tak bisa menjamin gender,
tak ada nomor WA untuk mengabari badal).

## Data — migrasi `0091_shakwa_izin_badal.sql`

```sql
alter table shakwa_izin drop constraint shakwa_izin_jenis_check;
alter table shakwa_izin add constraint shakwa_izin_jenis_check
  check (jenis in ('KMT', 'KBLA', 'JKG', 'TIDAK_HADIR', 'BADAL'));
alter table shakwa_izin add column badal_pengajar_id uuid references pengajar(id);
alter table shakwa_izin add constraint shakwa_izin_badal_check
  check ((jenis = 'BADAL') = (badal_pengajar_id is not null));
```

Nama constraint lama harus dicek di prod (`pg_constraint`) sebelum DDL dijalankan
— `0049` memakai CHECK inline, jadi namanya hasil generate Postgres.
Gender tidak dijaga trigger DB; dijaga di setiap server action yang menulis kolom
ini (dua tempat, lihat bawah). `src/types/db.ts` ikut diperbarui.

## Form pengajar (`/shakwa`)

- `IZIN_JENIS` mendapat `{ value: 'BADAL', label: 'Digantikan pengajar lain (badal)',
  butuhMenit: false, butuhTanggalGanti: false, butuhBadal: true }`.
- Saat jenis BADAL dipilih, kolom ke-4 rincian menjadi `<select name="izin_badal">`
  wajib, berisi pengajar aktif segender (tanpa diri sendiri), urut nama.
  Daftar dimuat di `page.tsx` hanya bila yang login pengajar.
- `izin_badal` dikirim sebagai array sejajar per baris (kosong untuk jenis lain),
  sama seperti `izin_jadwal_ganti` / `izin_menit`.

## Validasi server (`src/app/shakwa/actions.ts`)

Server action adalah endpoint POST publik, jadi validasi UI tidak cukup. Untuk
tiap baris BADAL: `badal_pengajar_id` wajib, ada di `pengajar`, `active = true`,
`gender` = gender pengajar pengirim, bukan pengirim sendiri. Gagal →
`Rincian ke-N: …`. Baris non-BADAL yang membawa `izin_badal` diabaikan (disimpan null).

## Setelah terkirim

`KirimShakwaResult` mendapat `badalWa: Array<{ nama: string; url: string }>`.
Layar sukses menampilkan tombol "Kabari badal: <nama>" per badal (wa.me, pesan
berisi tanggal, halaqah atau "semua halaqah saya", nomor tiket). Nomor WA badal
terlihat oleh pengajar pengirim lewat link itu — disengaja.

## Kartu koordinator (`/shakwa/koordinator`)

- Baris izin BADAL menampilkan "Badal: <nama>".
- `IzinBadalForm` (pola `IzinJadwalGantiForm`): dropdown pengajar segender untuk
  mengganti badal. Action `ubahBadalIzin` memvalidasi ulang (aktif, segender
  dengan pengajar izin, bukan diri sendiri), menulis audit (nilai lama → baru).
  Daftar pengajar dimuat sekali per halaman, sesuai gender tampilan koordinator.

## Observasi ketua kelas (`/hits/ketua`)

Untuk slot pertemuan yang **belum diisi** (`keterangan = null`), `page.tsx` mencari
izin BADAL milik pengajar halaqah pada tanggal slot (izin ber-`halaqah_id` sama,
atau tanpa halaqah). Bila ada, slot membawa `badalIzin: { nama }` dan form
menginisialisasi BADAL tercentang + `badal_nama` terisi. Ketua tetap bisa mengubah
sebelum simpan. Slot yang sudah terisi tidak disentuh.

## Rantai tabayyun

`IzinCocok` mendapat `badalNama`; `alasanDariIzin` menambahkan `badal: <nama>` ke
rincian. Hutang menit BADAL tetap 0 (tak berubah).

## Pengujian

- `npm run typecheck`.
- Tes murni (`scripts/test-shakwa-izin-badal.ts`, npm script `test-shakwa-badal`):
  validasi baris izin (BADAL tanpa pengganti, beda gender, diri sendiri, non-aktif),
  `izinCocokKondisi('BADAL','BADAL')`, `alasanDariIzin` dengan badal.
- Uji UI di DB lokal (docker `maahir-postgres`): kirim izin badal, kartu koordinator,
  prefill observasi.

## Rilis

DDL `0091` dijalankan di prod **sebelum** kode ter-deploy (insert BADAL akan
ditolak CHECK lama; kolom baru belum ada). Perintah disiapkan siap-tempel `!`
untuk dijalankan user. Deploy hanya atas izin eksplisit "push main".
