# Nonaktifkan Orang + Penataan Agustus 2026 — Design

Tanggal: 2026-08-01

Lima pekerjaan yang dirilis bersama. Dua berupa fitur kode (A, B), tiga berupa
operasi data (C, D, E). Semua keputusan di bawah sudah dikonfirmasi koordinator.

---

## A. Nonaktifkan orang — untuk koordinator 2in1

### Tujuan

Koordinator bisa menonaktifkan seseorang tanpa lewat admin. Sekarang toggle
`active` hanya ada di `/admin/users` (`toggleUserActive`), admin-only dan
per-baris-per-role — padahal satu orang punya baris di banyak tabel.

### Perilaku

Halaman baru `/2in1/koordinator/nonaktif`:

- Daftar semua `pengajar` (185 orang) + kotak pencarian nama/WA.
- Tiap baris: nama, kelompok, status aktif, tombol **Nonaktifkan** / **Aktifkan**.
- Baris menampilkan role lain yang ikut terkena (peserta setoran, musyrif,
  ketua kelas, anggota kelas Maahir) supaya efeknya terlihat sebelum diklik.

Satu klik menonaktifkan **semua baris ber-WA sama** di:

| Tabel | Kolom |
|---|---|
| `pengajar` | `active` |
| `peserta` | `active` |
| `musyrif` | `active` |
| `ketua_kelas` | `active` |
| `koordinator_ketua_kelas` | `active` |
| `program_kelas_anggota` | `active` (**kolom baru**) |

Tabel `koordinator` dan `syaikh` **tidak** disentuh — koordinator tak boleh
menonaktifkan koordinator lain atau dirinya sendiri.

### Akses

`requireKoordinator()` — semua role `koordinator`. Koordinator dengan
`kehadiran_only = true` (Risa Afrianti) tidak dapat akses.

### Migrasi DB (jalankan di prod SEBELUM deploy kode)

```sql
ALTER TABLE program_kelas_anggota ADD COLUMN active boolean NOT NULL DEFAULT true;
```

Urutan wajib: ALTER dulu, baru deploy. Terbalik → kode menyeleksi kolom yang
belum ada → 500 di semua halaman kehadiran.

### Titik kode yang perlu filter `active = true`

Sepuluh berkas membaca `program_kelas_anggota`:

| Berkas | Baris | Perlu filter? |
|---|---|---|
| `src/lib/maahir-rekap.ts` | 119 | ya |
| `src/lib/laporan-maahir.ts` | 183 | ya |
| `src/lib/maahir-sp.ts` | 76 | ya |
| `src/lib/matrix-compute.ts` | 216, 218 | ya |
| `src/lib/program-kelas.ts` | 93 | ya |
| `src/app/2in1/ketua-kelas/presensi/page.tsx` | 51 | ya |
| `src/app/2in1/ketua-kelas/pertemuan/[id]/page.tsx` | 33 | ya |
| `src/app/2in1/ketua-kelas/setoran/page.tsx` | 67 | ya |
| `src/app/2in1/koordinator/kehadiran/pemutihan/page.tsx` | 35 | ya |
| `src/app/api/2in1/kehadiran/[pertemuan_id]/route.ts` | 62 | ya |
| `src/app/2in1/maahir-mandiri/actions.ts` | 24, 73 | ya |
| `src/app/2in1/ketua-kelas/libur/actions.ts` | 53 | tidak (hanya cek keanggotaan ketua) |

### Konsekuensi yang diterima

Keputusan koordinator: orang nonaktif **hilang total dari semua rekap dan
laporan**, termasuk bulan-bulan yang sudah lewat. Artinya laporan bulanan yang
sudah diunduh/dikirim tidak akan cocok lagi bila dibuka ulang setelah ada
penonaktifan — rata-rata kelas berubah surut. Ini disadari dan diterima.

### Audit

Tiap aksi menulis `audit_log`: `action = 'koordinator.orang.toggle_active'`,
detail berisi WA, nama, daftar tabel yang terpengaruh, dan nilai tujuan.

---

## B. Setoran musyrif diarahkan ke Ahmad Abdus Syukur

### Keadaan sekarang

`setoran_musyrif` diperiksa oleh `syaikh`, dipilih otomatis berdasarkan gender
musyrif: Syaikh Ahmad (ikhwan), Radiatam Mardhiyah (akhwat). Ahmad Abdus Syukur
ada di tabel `koordinator`, bukan `syaikh`.

### Masalah yang harus dihindari

Empat titik memakai `.eq('gender', g).eq('active', true).maybeSingle()`:

- `src/app/2in1/musyrif/setor/page.tsx:37`
- `src/app/api/2in1/setoran-musyrif/submit/route.ts:48`
- `src/app/api/setoran-musyrif/submit/route.ts:48`
- `src/app/2in1/syaikh/page.tsx:117` (daftar rekan, tanpa `maybeSingle` — aman)

`maybeSingle()` **gagal** bila cocok lebih dari satu baris. Menambah syaikh
ikhwan kedua yang aktif tanpa perubahan kode akan langsung merusak halaman setor
musyrif ikhwan dan endpoint submit-nya.

### Perubahan

```sql
ALTER TABLE syaikh ADD COLUMN penerima_utama boolean NOT NULL DEFAULT false;
```

Ketiga titik `maybeSingle()` diubah menjadi:

```ts
.eq('gender', musyrifGender)
.eq('active', true)
.order('penerima_utama', { ascending: false })
.order('created_at', { ascending: true })
.limit(1)
.maybeSingle()
```

Data:

- Insert Ahmad Abdus Syukur ke `syaikh`: gender `ikhwan`, WA `6285822950406`,
  password awal = 6 digit terakhir WA (`950406`), `active = true`,
  `penerima_utama = true`.
- Syaikh Ahmad tetap `active = true`, `penerima_utama = false` — masih bisa login
  dan melihat riwayat pemeriksaannya.
- Radiatam Mardhiyah (akhwat) tak berubah; sebagai satu-satunya syaikh akhwat
  aktif dia tetap terpilih.

Setoran musyrif ikhwan periode berjalan otomatis mengarah ke Ahmad Abdus Syukur.
Baris `setoran_musyrif.checked_by_syaikh_id` yang lama tetap menunjuk Syaikh
Ahmad — riwayat tidak diubah.

### Catatan login

WA `6285822950406` kini punya dua role (`koordinator` + `syaikh`).
`getAccesses()` di `src/lib/access.ts` sudah mengembalikan banyak role dan
aplikasi sudah punya chooser, jadi tak ada perubahan auth. Perlu diverifikasi
manual setelah rilis.

---

## C. Diapari & Hammad Syakir → Tahfidzul Qur'an 1 & 2

Keduanya **sudah terdaftar** — tak ada akun baru:

| Nama | WA | pengajar | peserta | anggota Maahir |
|---|---|---|---|---|
| Muhammad bin Jafar Diapari | 6281318484953 | ada | kelas Dal | Maahir Alumni/Talaqqi |
| Hammad Syakir | 6289531510494 | ada | kelas Ha | Maahir Alumni/Talaqqi |

Cara pemindahan: **bukan** `UPDATE program_kelas_id`. Kalau id anggota dipindah,
baris `kehadiran_peserta` Juli mereka masih menempel di pertemuan Alumni/Talaqqi
sementara anggotanya sudah bukan milik kelas itu — rekap Juli kelas lama jadi
timpang.

Sebagai gantinya:

1. Baris lama di Alumni/Talaqqi → `active = false` (kolom dari bagian A).
2. Insert baris baru di kelas tujuan dengan `mulai_tanggal = '2026-08-01'`:
   - Muhammad bin Jafar Diapari → `Maahir Tahfidzul Qur'an 1`
   - Hammad Syakir → `Maahir Tahfidzul Qur'an 2`

`peserta.kelas_id` (kelas setoran ke musyrif) tidak disentuh.

Bergantung pada migrasi bagian A — dikerjakan setelahnya.

---

## D. Penilaian pedagogis: Nabilla Putri Hasdar menggantikan Tasmiah

Akses penilaian pedagogis ditentukan `pengajar.is_ketua`
(`src/app/kehadiran/ketua-kelompok/penilaian/page.tsx:51`). Tasmiah Siti Salamah
adalah ketua **Kelompok 12 Akhwat**; Nabilla Putri Hasdar anggota kelompok yang
sama.

```sql
UPDATE pengajar SET is_ketua = false WHERE id = '87779bd9-b618-4662-93d7-8b35b12b691b'; -- Tasmiah Siti Salamah
UPDATE pengajar SET is_ketua = true  WHERE name = 'Nabilla Putri Hasdar'
  AND kelompok_id = '487af0d1-1e04-4d11-95ca-96d03189c230';
```

Disadari: `is_ketua` juga membawa presensi kelompok dan penilaian peserta.
Ketiganya memang ikut berpindah — itu yang dikehendaki.

Murni data, tak ada perubahan kode.

---

## E. Gabung kelas Intensif Akhwat

### Keadaan sekarang

| | Maahir Intensif Siang Akhwat | Maahir Intensif Sore Akhwat |
|---|---|---|
| id | `334f6f76-…` | `357b1fe0-…` |
| Jadwal | Selasa, Kamis 13:00–15:30 | Selasa, Kamis 15:30–17:30 |
| Anggota | 11 (ketua Khasyi Hania Nataprawira) | 9 (ketua Khaulah) |
| Pertemuan | 26 | 28 |

Tak ada nama yang tumpang tindih.

### Keputusan

Buat **kelas baru** `Maahir Intensif Akhwat`:

- gender `akhwat`, `jadwal_hari = {Selasa,Kamis}`, `waktu_mulai = 13:00`,
  `waktu_selesai = 17:30`
- `ketua_wa = '6281296738785'` (Khaulah), `wakil_wa = NULL`
- `self_attendance` dan `presensi_sifat` mengikuti kelas Sore

20 anggota (11 + 9) di-insert sebagai baris baru dengan
`mulai_tanggal = '2026-08-01'`. Khaulah `is_ketua = true`; Khasyi Hania
Nataprawira masuk sebagai anggota biasa.

Kedua kelas lama: seluruh anggotanya di-`active = false`, pertemuan dan presensi
Juli **tetap di kelas lama**. Laporan Juli tidak berubah sama sekali. Kelas lama
menjadi kosong dan tak lagi muncul di daftar aktif.

Konsekuensi yang diterima: pada laporan Juli tetap muncul dua kelas terpisah;
kelas gabungan baru mulai punya angka sejak Agustus.

Khaulah sudah punya baris `pengajar` (WA `6281296738785`) sehingga login ketua
kelas tetap berfungsi tanpa provisioning tambahan.

Bergantung pada migrasi bagian A.

---

## F. Setoran hafalan hanya untuk kelas Takhassus

### Masalah

Kolom/lembar isian setoran halaman muncul di **semua** kelas Maahir. Ketua
Maahir Intensif Sore Akhwat diminta mengisi setoran padahal kelasnya tidak
menyetor hafalan. Penyebabnya syarat yang dipakai di mana-mana adalah
`program === 'kelas_maahir'` — benar untuk membedakan dari At-Tibyan, tapi
terlalu longgar: semua kelas Maahir lolos.

Setoran hafalan hanya berlaku untuk `Maahir Takhassus Ikhwan` dan
`Maahir Takhassus Akhwat`. Blok Rincian Setoran di laporan bulanan memang sudah
hanya menampilkan dua kelas itu — sisi input yang belum ikut dibatasi.

### Perubahan

Pindahkan daftar nama takhassus ke `src/lib/program-kelas.ts` dan ekspor
`isTakhassusKelas(name: string): boolean`. `src/lib/laporan-maahir.ts`
mengimpor dari sana supaya sumbernya satu.

Syarat baru di enam titik: `program === 'kelas_maahir' && isTakhassusKelas(namaKelas)`

| Berkas | Baris | Perubahan |
|---|---|---|
| `src/app/2in1/ketua-kelas/setoran/page.tsx` | 34–49 | saring `myKelas` ke takhassus saja; bila kosong tampilkan "Kelas ini tidak mengisi setoran hafalan" |
| `src/app/2in1/ketua-kelas/page.tsx` | 139 | sembunyikan tautan "Isi setoran pertemuan yang lalu" bila ketua tak pegang kelas takhassus |
| `src/app/2in1/ketua-kelas/presensi/page.tsx` | 153 | tambah syarat takhassus pada `showSetoran` |
| `src/app/2in1/ketua-kelas/pertemuan/[id]/page.tsx` | 89 | idem |
| `src/app/2in1/maahir-mandiri/page.tsx` | 84 | idem pada `askSetoran` |
| `src/app/2in1/maahir-mandiri/riwayat/page.tsx` | 81 | idem |

Data `setoran_halaman` yang terlanjur terisi di kelas non-takhassus tidak
dihapus — tak dipakai laporan dan aman ditinggal.

Kode saja, tanpa migrasi. Tak bergantung pada bagian lain.

---

## Urutan pengerjaan

1. **A-1** `ALTER TABLE program_kelas_anggota` di prod.
2. **B-1** `ALTER TABLE syaikh` di prod.
3. **A-2** Kode: filter `active`, halaman + server action koordinator, audit.
4. **B-2** Kode: pemilihan syaikh via `penerima_utama` di 3 titik `maybeSingle()`.
5. **F** Kode: batasi setoran hafalan ke kelas takhassus.
6. Deploy + verifikasi `/api/health` dan halaman setor musyrif ikhwan.
7. **B-3, C, D, E** operasi data lewat `npm run db --confirm`.

Langkah 1–2 mendahului deploy. Langkah 6 menyusul setelah kode hidup karena C
dan E memakai kolom `active` yang baru.

## Verifikasi

- Rekap kehadiran & laporan bulanan tetap tampil normal untuk semua kelas
  sesudah filter `active` ditambahkan (belum ada yang dinonaktifkan → angka
  harus persis sama dengan sebelum rilis).
- Nonaktifkan satu akun uji → hilang dari presensi ketua kelas, daftar setoran
  koordinator, rekap, dan laporan; `audit_log` tercatat.
- Musyrif ikhwan membuka halaman setor → tujuan tertulis Ahmad Abdus Syukur,
  submit berhasil.
- Musyrif akhwat → tetap Radiatam Mardhiyah.
- Ahmad Abdus Syukur login → muncul pilihan role koordinator / syaikh.
- Kelas `Maahir Intensif Akhwat` muncul dengan 20 anggota; Khaulah bisa membuka
  presensi; laporan Juli tak berubah.
- Ketua kelas non-takhassus: tautan "Isi setoran pertemuan yang lalu" hilang,
  kolom setoran tak muncul di form presensi maupun presensi mandiri.
- Ketua Maahir Takhassus Ikhwan/Akhwat: setoran tetap bisa diisi seperti biasa.
