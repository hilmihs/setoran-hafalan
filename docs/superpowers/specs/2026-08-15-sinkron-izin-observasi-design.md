# Sinkronisasi Izin (Shakwa) → Observasi & Gating Attestation

Tanggal: 2026-08-15

## Latar

Fitur **Shakwa** dan **Observasi** tidak sejajar penuh. Sudah ada satu jembatan:
izin pra-kelas (`shakwa_izin`) dipakai jadi alasan `hits_tabayyun` otomatis saat
ketua kelas mengisi observasi di `/hits/ketua`, supaya pengajar tak ditagih
klarifikasi dua kali dan tak kena teguran ghosting 72 jam.

Audit jembatan ini menemukan bocor. Dokumen ini menutup dua di antaranya
(A dan B) dan menerapkan dua perubahan attestation dari feedback pengajar.

Kosakata jenis sudah selaras: `KMT`/`KBLA`/`JKG` sama di `shakwa_izin` dan
`hits_pelanggaran`; `TIDAK_HADIR` (izin) jadi jaring pengaman. Bukan di sini
bocornya.

## Ruang lingkup

Termasuk:

1. **Bagian 1 — Bocor A (urutan):** izin di-link dua arah, urutan input apa pun.
2. **Bagian 2 — Bocor B (izin yatim):** koordinator observasi melihat izin yang
   belum ke-match tabayyun.
3. **Bagian 3 — Hapus opsi "Belum"** di dua field attestation.

Tidak termasuk (ditunda): Bocor C (flag beda menit izin vs catatan ketua).

## Kondisi sekarang (referensi)

- `src/lib/shakwa.ts` — konfigurasi kategori terpusat. `izin.fieldTambahan`
  `sudah_info_koordinator` opsi `['Sudah','Belum']`; `tali_kasih.fieldTambahan`
  `sudah_presensi` opsi `['Sudah','Belum']`, `punya_rekening_cimb`
  `['Sudah','Belum']`.
- `src/lib/shakwa-izin.ts` — `cariIzinCocok`, `alasanDariIzin`,
  `tandaiIzinTerpakai`, konstanta `PENANDA_IZIN`. Forward-match saja.
- `src/app/shakwa/actions.ts:224-236` — insert baris `shakwa_izin` setelah
  simpan shakwa (hanya bila `pengajar` login).
- `src/app/hits/ketua/actions.ts:~318-345` — forward-match: saat tabayyun BARU
  dibuat (`!existing`) panggil `cariIzinCocok`; bila ada izin →
  `status='awaiting_reason'`, `alasan_pengajar`, `alasan_submitted_at`,
  `tandaiIzinTerpakai`. Cabang `existing.status !== 'decided'` hanya update
  `kondisi`.
- `src/app/observasi/koordinator/page.tsx` — dashboard koordinator KK,
  gender-scoped (`viewGender`), sudah baca `hits_tabayyun`.

## Bagian 1 — Reverse-link izin → tabayyun (Bocor A)

### Masalah

Forward-match hanya jalan saat tabayyun pertama dibuat. Bila **ketua isi
observasi dulu** (tabayyun `pending` tercipta tanpa izin), lalu pengajar kirim
izin, tabayyun tak pernah dikunjungi ulang — pengajar tetap ditagih klarifikasi
dan berisiko teguran ghosting. Retro-match saat ketua-edit tak cukup karena edit
mungkin tak pernah terjadi. Fix sejati = link dari sisi izin.

### Perubahan

Fungsi baru di `src/lib/shakwa-izin.ts`:

```
backfillTabayyunDariIzin(izin: IzinCocok): Promise<string | null>
```

Logika:

1. Query `hits_tabayyun` join `keterangan:keterangan_id(tanggal)`:
   - `pengajar_id = izin.pengajarId`
   - `status = 'pending'` (belum ada alasan; jangan sentuh `awaiting_reason`/`decided`)
   - `alasan_pengajar` IS NULL
   - `keterangan.tanggal = izin.tanggal`
   - bila `izin.halaqahId` ada: `halaqah_id = izin.halaqahId`; bila null,
     cocok semua halaqah pengajar pada tanggal itu.
2. Filter kecocokan jenis mirror `cariIzinCocok`: `tabayyun.kondisi === izin.jenis`
   ATAU `izin.jenis === 'TIDAK_HADIR'` (net).
3. Ambil kandidat pertama. Bila ada → update:
   `status='awaiting_reason'`, `alasan_pengajar=alasanDariIzin(izin)`,
   `alasan_submitted_at=izin.dikirimAt`. Lalu `tandaiIzinTerpakai(izin.id, tabId)`.
   Return `tabId`.
4. Tak ada kandidat → return `null` (izin tetap tersimpan; jadi kandidat
   forward-match berikutnya dan muncul di panel yatim Bagian 2).

Catatan: `IzinCocok.pengajarId` belum ada di tipe saat ini (`cariIzinCocok`
menerima `pengajarId` sebagai argumen, bukan field hasil). Tambah `pengajarId`
ke tipe `IzinCocok`, atau buat tipe input terpisah untuk fungsi ini. Pilih:
fungsi terima objek baris `ShakwaIzin` + `nomorTiket` + `dikirimAt` langsung,
bukan `IzinCocok`, supaya tak mengubah kontrak `cariIzinCocok`.

### Pemanggilan

`src/app/shakwa/actions.ts`, setelah insert `shakwa_izin` berhasil
(~baris 235). Untuk tiap baris izin yang tersimpan, panggil
`backfillTabayyunDariIzin`. Kegagalan di-log (`console.error`), tak
menggagalkan submit shakwa — konsisten dengan penanganan `izinErr` sekarang.

Butuh `shakwa_izin.id` hasil insert → ubah insert agar `.select('id, ...')`
mengembalikan baris, atau query ulang. Ambil field yang dibutuhkan
`backfillTabayyunDariIzin` (id, pengajar_id, halaqah_id, tanggal, jenis, menit,
jadwal_ganti, alasan, + nomor_tiket & created_at dari shakwa induk).

### Forward-match

Tetap seperti sekarang di `hits/ketua/actions.ts`. Dua arah → semua urutan
input tertutup.

## Bagian 2 — Surface izin yatim (Bocor B)

### Masalah

Izin hanya dikonsumsi bila ada baris pelanggaran (tabayyun tercipta). Bila
pengajar lapor KMT tapi ketua catat bersih, izin nyangkut di `shakwa_izin`
dengan `dipakai_tabayyun_id` null selamanya — tak terlihat di observasi,
discrepancy tak pernah ketahuan.

### Perubahan

Fungsi baru di `src/lib/shakwa-izin.ts`:

```
getIzinYatim(viewGender: 'ikhwan' | 'akhwat', today: string): Promise<IzinYatimRow[]>
```

Query `shakwa_izin`:

- `dipakai_tabayyun_id` IS NULL
- `tanggal <= today`
- batasi jendela waktu (mis. 14 hari terakhir) agar tak menumpuk data lama
- join `shakwa:shakwa_id(nomor_tiket)` dan nama pengajar
- gender scope: join `hits_halaqah(gender)` via `halaqah_id`; bila `halaqah_id`
  null, derivasi gender dari pengajar (`pengajar.gender`). Sertakan hanya yang
  `gender === viewGender`.

`IzinYatimRow`: `{ id, nomorTiket, pengajarNama, tanggal, jenis, menit, jadwalGanti, halaqahNama | null }`.

Definisi MVP: cukup izin belum-terpakai dalam jendela. Peningkatan opsional
(tak wajib fase ini): saring hanya yang observasinya sudah diisi ketua tapi
tak ada tabayyun cocok (discrepancy sejati) — dicatat sebagai TODO, bukan
scope sekarang.

### UI

Panel baru di `src/app/observasi/koordinator/page.tsx`, judul
"Izin belum ke-match". Kolom: pengajar, tanggal, jenis (label via
`IZIN_JENIS_LABEL`), nomor tiket, halaqah. Read-only. Ikuti pola panel
sekitar (kartu + tabel/daftar, `force-dynamic`, gender scope `viewGender`).
Bila kosong, sembunyikan atau tampilkan state kosong ringkas.

## Bagian 3 — Hapus opsi "Belum"

`src/lib/shakwa.ts`:

- `tali_kasih` → `sudah_presensi`: opsi `['Sudah','Belum']` → `['Sudah']`.
- `izin` → `sudah_info_koordinator`: opsi `['Sudah','Belum']` → `['Sudah']`.
- `tali_kasih` → `punya_rekening_cimb`: **tetap** `['Sudah','Belum']`.

Efek: radio tunggal "Sudah", tetap wajib dipilih (validasi server
`shakwa/actions.ts:163-169` sudah menolak kosong & nilai di luar `opsi`).
Attestation dipaksa: pengajar mengonfirmasi absensi selesai sebelum lapor.
Config terpusat → form (`ShakwaForm.tsx`) dan rekap ikut otomatis, tak perlu
edit lain.

## Data & migrasi

Tak ada perubahan skema DB. Semua kolom sudah ada (`shakwa_izin`,
`hits_tabayyun`, `hits_halaqah`). Murni logika aplikasi + config.

## Error handling

- `backfillTabayyunDariIzin` gagal → `console.error`, submit shakwa tetap
  sukses (izin tersimpan, terjaring forward-match / panel yatim).
- `getIzinYatim` gagal → panel tampil kosong + log; tak menggagalkan render
  dashboard.

## Testing / verifikasi

Skenario izin (dua arah):

1. Pengajar kirim izin KMT tgl X **sebelum** ketua isi → ketua isi observasi
   dgn pelanggaran KMT → tabayyun `awaiting_reason`, alasan dari izin
   (forward, sudah ada — cek regresi).
2. Ketua isi observasi KMT tgl X **dulu** (tabayyun `pending`) → pengajar
   kirim izin KMT tgl X → tabayyun jadi `awaiting_reason`, `dipakai_tabayyun_id`
   terisi (reverse — baru).
3. Izin `TIDAK_HADIR` tgl X → cocok ke tabayyun kondisi apa pun tgl X.
4. Tabayyun sudah `decided`/`awaiting_reason`/punya `alasan_pengajar` → izin
   TIDAK menimpa.
5. Izin tgl X, ketua catat bersih (tak ada tabayyun) → izin muncul di panel
   yatim, gender benar.

Attestation:

6. Form talikasih & izin: field terkait hanya menampilkan "Sudah"; submit
   tanpa memilih → ditolak; `punya_rekening_cimb` masih punya "Belum".

## File tersentuh

- `src/lib/shakwa-izin.ts` — `backfillTabayyunDariIzin`, `getIzinYatim`, tipe.
- `src/app/shakwa/actions.ts` — panggil backfill sesudah insert izin; ambil id.
- `src/app/observasi/koordinator/page.tsx` — panel izin yatim.
- `src/lib/shakwa.ts` — hapus opsi "Belum" di dua field.
