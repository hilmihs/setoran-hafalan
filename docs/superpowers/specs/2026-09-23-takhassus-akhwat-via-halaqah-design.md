# Presensi & setoran Takhassus akhwat lewat ketua Halaqah Tahfizh

Tanggal: 2026-09-23. Status: disetujui pemilik produk (percakapan 23 Sep).
Berlaku: **Senin 28 Sep 2026** — awal periode bulanan baru (28–27), supaya
laporan September tak tersentuh.

## Latar

Spec 18 Sep (`2026-09-18-halaqah-tahfizh-akhwat-presensi-design.md`) memutuskan
presensi anggota takhassus akhwat **hanya** diisi ketua kelas Takhassus (Salma),
dan baris mereka di 10 kelas halaqah per-hari dinonaktifkan (`active=false`).

Keputusan itu dibalik. Mulai 28 Sep:

- Peserta takhassus akhwat dipresensi **di kelas halaqah Pagi/Siang tempat
  mereka hadir**, oleh ketua kelas halaqah yang bertugas hari itu.
- Ketua yang sama menginput **setoran harian** (halaman) peserta takhassus itu.
- Ketua kelas Takhassus tidak lagi mengisi presensi kelas Takhassus.
- Target setoran bulanan takhassus akhwat: **80 halaman**, semua peserta.

Ikhwan tidak berubah (Takhassus ikhwan tetap `self_attendance`).

## Penempatan (data prod, 23 Sep)

Mengaktifkan kembali baris yang dinonaktifkan rilis 0083, `mulai_tanggal`
digeser ke `2026-09-28`:

| Peserta | WA | Kelas halaqah |
|---|---|---|
| Salma | 6282136573097 | Pagi (Selasa), Pagi (Jum'at), Siang (Selasa) |
| Radiatam Mardhiyah | 6281261306563 | Pagi (Rabu), Pagi (Jum'at) |
| Annidaul Jannah | 6285788064547 | Siang (Senin), Siang (Rabu), Siang (Jum'at) |

Nur Afifah (6282269092601) sedang **cuti** — tak ditempatkan. Konsekuensinya
tak ada sesi yang menagihnya (tak ada SP), dan di blok setoran ia tampil tanpa
target ("—"). Penempatannya menyusul, cukup INSERT baris halaqah.

## Pilihan pendekatan

1. **Kolom tanggal pengalihan per kelas (dipilih).**
2. Hardcode nama kelas + tanggal di kode — tanpa migrasi, tapi aturan bisnis
   terkubur; `isTakhassusKelas` by-name sudah contoh rapuhnya.
3. Akhiri keanggotaan Takhassus (`selesai_tanggal`) — target
   (`maahir_setoran_target`) dan blok laporan terikat ke keanggotaan itu, jadi
   semuanya harus dibangun ulang.

## Rancangan

### Skema — migrasi `0087_program_kelas_presensi_via_halaqah.sql`

```sql
alter table program_kelas add column presensi_via_halaqah_mulai date;
```

Makna: mulai tanggal ini, sesi `kelas_maahir` kelas ini **tidak dipresensi
sendiri**; anggotanya dipresensi (kehadiran + setoran) di kelas lain tempat
mereka menjadi anggota aktif, dicocokkan lewat WA. NULL = perilaku lama.

Kelas Takhassus tetap ada dan tetap jadi sumber: daftar siapa peserta
takhassus, target setoran, dan baris di blok Takhassus laporan.

Ikut diperbarui: `ProgramKelasRow` + `PK_COLS` (`program-kelas.ts`), select
kolom di `laporan-maahir.ts`, `src/types/db.ts` bila kelas ini dimodelkan di
sana, dan skema PGlite di skrip uji yang membuat `program_kelas`.

### Sesi "dipresensi" vs sesi "terjadwal"

`expectedDaysInRange` **tidak** diubah: dipakai juga check-in pengajar
(`maahir-checkin-pengajar.ts`) — kelas Takhassus tetap diajar Sel/Rab/Jum,
jadi sesi pengajarnya tetap ada.

Fungsi baru `expectedPresensiInRange(k, start, end, libur)` di
`maahir-presensi.ts` = `expectedDaysInRange` minus sesi `kelas_maahir` dengan
`tanggal >= k.presensi_via_halaqah_mulai`. Dipakai di semua tempat yang
bertanya "presensi mana yang harus diisi":

- `getUnfilledMaahirDays` → Salma tak ditagih lagi mulai 28 Sep (tunggakan
  sampai 27 Sep tetap muncul sampai terisi/terkunci).
- `maahir-rekap.ts` (`belumDiisi`) dan `laporan-maahir.ts`
  (`presensiTakTerisi`) → kelas Takhassus akhwat tak tercatat lalai.

### Siapa "peserta takhassus via halaqah" — `src/lib/takhassus-via-halaqah.ts`

```ts
type TakhassusVia = { wa: string; kelasId: string; anggotaId: string; mulai: string };
getTakhassusVia(): Promise<Map<wa, TakhassusVia>>
setorViaHalaqah(via, anggota, tanggal): boolean   // WA ada, kelas ≠ Takhassus-nya, tanggal >= mulai
adaTakhassusVia(kelasIds): Promise<boolean>        // menu setoran di beranda ketua
```

Sumber: anggota aktif (`active=true`) kelas yang `presensi_via_halaqah_mulai`
tidak NULL. Satu query kecil; dipakai UI ketua, API, dan laporan.

### Ketua halaqah — isi presensi & setoran

- `presensi/page.tsx` & `pertemuan/[id]/page.tsx`: selain kelas Takhassus
  (perilaku lama), kolom setoran muncul **per baris** untuk anggota yang WA-nya
  takhassus-via dan tanggal sesi ≥ `mulai`: baris peserta di
  `PresensiWizardForm`/`KehadiranForm` mendapat flag `takhassus`, di samping
  `showSetoran` (kelas Takhassus = semua baris) yang tetap. Label kecil
  "Takhassus" di baris itu.
  Isian `materi` (per pertemuan) tetap hanya untuk kelas Takhassus.
- `/2in1/ketua-kelas/setoran` (isi susulan): kelas halaqah yang punya anggota
  takhassus-via ikut tampil; gridnya hanya baris anggota itu dan tanggal ≥
  `mulai`. Menu "Setoran Hafalan" di beranda ketua muncul bila ada kelas
  seperti itu. Panel target per peserta tetap hanya untuk kelas Takhassus.
- API `PUT /api/2in1/kehadiran/[pertemuan_id]` dan
  `POST /api/2in1/setoran-kelas`: `setoran_halaman` hanya diterima bila kelas
  Takhassus, atau anggota takhassus-via pada tanggal ≥ `mulai`. Selain itu
  diabaikan (kehadiran) / ditolak (setoran-kelas) — hari ini API kehadiran
  menerima setoran dari kelas Maahir mana pun.

### Laporan bulanan (`laporan-maahir.ts`)

Untuk tiap anggota takhassus-via (baris Takhassus) dan baris-baris halaqah
milik WA yang sama:

- **Blok Takhassus — kehadiran:** satu baris per peserta. Sesi = sesi kelas
  Takhassus sebelum `mulai` + sesi halaqahnya sejak `mulai`. Hitungan H/I/S/A/T,
  penyebut, riwayat tidak hadir, online digabung lalu persen dihitung sekali
  dengan rumus yang sama (sakit keluar penyebut, pemutihan sebulan → 100).
  `studentsFor` dipecah jadi *hitung mentah per baris anggota* + *finalisasi*
  supaya penggabungan tak menyalin rumus.
- **Blok Halaqah (Maahir):** baris halaqah milik WA takhassus-via dikeluarkan
  seluruhnya (tak tampil dua kali). Aman karena baris itu dibuat dengan
  `mulai_tanggal` = tanggal pengalihan; sesi sebelum itu memang tak ada. Kelas
  tanpa `jadwal_hari` (At-Tibyan gabungan) tak ikut diserap.
- **Blok Takhassus — setoran:** halaman dari baris halaqah (≥ `mulai`) digabung
  ke peserta. `sesiTarget` menghitung sesi terjadwal kelas Takhassus sebelum
  `mulai` + sesi terjadwal kelas-kelas halaqahnya sejak `mulai` (dalam rentang
  keanggotaan masing-masing). Target tetap dicari di kelas Takhassus
  (`targetBulananPada(kelasTakhassus, anggotaTakhassus, tanggalTerakhir)`).
- **At-Tibyan:** tak berubah — lewat kelas gabungan At-Tibyan, dengan kelas
  halaqah `ikut_tibyan=false` (lihat prasyarat rilis).
- **SP:** `maahir-sp.ts` sudah menjumlah per WA lintas kelas; kelas Takhassus
  tak punya sesi lagi setelah `mulai`, jadi tak ada dobel. Tak diubah.
- **Pemutihan:** berlaku per `anggota_id`. Pemutihan sebulan pada baris
  Takhassus peserta via berlaku untuk seluruh baris gabungannya; pemutihan
  per-tanggal tetap per baris tempat sesi itu.

### Target

Default kelas `Maahir Takhassus Akhwat` 80 hal/bulan, `anggota_id` NULL,
`berlaku_mulai 2026-09-28` — di-seed lewat SQL rilis. Koordinator tetap bisa
mengoreksi di `/2in1/koordinator/target-setoran`.

## Rilis (tanggal 28 Sep)

Kode boleh ter-deploy lebih dulu: selama kolom masih NULL, semua jalur lama.
Tetapi **DDL harus jalan sebelum kode**, karena kode memilih kolom baru.

**Prasyarat yang ternyata belum jalan:** per 23 Sep, rilis 0083 di prod baru
langkah [A] (DDL) dan [B] (cabut takhassus). Rename, `ikut_tibyan=false`, dan
kelas At-Tibyan gabungan ([C]–[H]) belum — 10 kelas halaqah masih menagih
At-Tibyan sendiri-sendiri. Rancangan ini bergantung pada [D]–[F]: tanpanya,
mengaktifkan kembali takhassus di kelas halaqah membuat mereka tertagih
At-Tibyan di tiap kelas halaqahnya.

Urutan (`scripts/sql/0087-rilis-takhassus-via-halaqah.sql`):

1. [A] DDL `0087` (user, lewat `!npm run db -- --confirm`).
2. Deploy kode.
3. 0083 [C]–[H] (`scripts/sql/0083-rilis-halaqah-tahfizh-akhwat.sql`).
4. Pada/sesudah 28 Sep: [B] aktifkan 8 baris halaqah, `mulai_tanggal='2026-09-28'`;
   [C] `presensi_via_halaqah_mulai='2026-09-28'` untuk Takhassus Akhwat;
   [D] target default 80 berlaku 28 Sep; [V] SELECT verifikasi. Idempoten.

Peserta Takhassus tanpa baris halaqah (Nur Afifah, cuti) tetap dialihkan:
sesi Takhassus sesudah tanggal pengalihan tak menagihnya, baik di kehadiran
maupun di hitungan sesi target.

## Pengujian

- `npm run typecheck`.
- `npm run test-presensi-tibyan` diperluas: `expectedPresensiInRange` memotong
  sesi `kelas_maahir` sejak tanggal pengalihan, `expectedDaysInRange` tidak.
- Skrip baru `npm run test-takhassus-via` (PGlite, pola `test-setoran-target`):
  periode Oktober (28 Sep–27 Okt) dan September (tak berubah); gabungan
  kehadiran, setoran, `sesiTarget`, target 80, tak dobel di blok Halaqah,
  `presensiTakTerisi` bersih untuk kelas Takhassus.
- `npm run test-target` & `test-sp` tetap lulus.
