# HITS — Rekap Indisipliner & Tabayyun (Koordinator)

**Tanggal:** 2026-07-27
**Status:** Disetujui (desain)

## Masalah

Koordinator HITS di `/hits/koordinator` cuma lihat **hitungan** pelanggaran per pengajar
(KMT/KBLA/JKG/TL). Tak ada tempat lihat **naratif** tiap insiden indisipliner beserta:
- Siapa lapor (ketua kelas + nomor WA)
- Alasan pengajar
- Hasil tabayyun (status)
- Apakah udzur syar'i diterima/tidak + alasan putusan

Data-nya sudah ada (`hits_keterangan_harian`, `hits_tabayyun`), tapi tak terkonsolidasi
untuk dilihat per bulan / per halaqah.

## Cakupan

Fitur **read-only** (lihat saja). Putusan tabayyun/udzur tetap di alur existing
(observasi/koordinator) — TIDAK dipindah/diduplikasi di sini.

Menampilkan **semua insiden indisipliner** termasuk yang belum masuk tabayyun.

## Sumber Data

Tanpa tabel baru. Query:

- **`hits_keterangan_harian`** — filter insiden indisipliner:
  `kondisi IN ('KMT','KBLA','JKG')` **OR** `latihan_diberikan IS FALSE` (= TL / Tidak Latihan).
  Satu baris keterangan bisa membawa >1 pelanggaran (mis. KMT + TL).
- **LEFT JOIN `hits_tabayyun` ON `keterangan_id`** — relasi **1:1** (terverifikasi:
  443 keterangan → tepat 1 tabayyun; sisanya tanpa tabayyun). Bawa `alasan_pengajar`,
  `status`, `is_udzur_syari`, `keputusan_catatan`, `decided_at`.
- **`hits_halaqah`** — nama, gender, pengajar.
- **`ketua_kelas`** (active, by `hits_halaqah_id`) — nama + `whatsapp_number`.

Volume all-time ~1034 insiden → **filter bulan + gender wajib** (default bulan berjalan)
biar ringan.

## Unit Baris = 1 Insiden (1 keterangan)

Kolom:

| Field | Sumber |
|---|---|
| Tanggal | `keterangan.tanggal` |
| Halaqah | `halaqah.name` |
| Pertemuan | `keterangan.pertemuan_no` |
| Pelanggaran (badge multi) | derive: KMT/KBLA/JKG dari `kondisi`; TL bila `latihan_diberikan=false` |
| Alasan pengajar | `tabayyun.alasan_pengajar` |
| Status tabayyun | derive dari ada/tidak tabayyun + `tabayyun.status` |
| Udzur? | `tabayyun.is_udzur_syari` → ✅ diterima / ❌ tolak / — |
| Alasan putusan | `tabayyun.keputusan_catatan` |
| Ketua (WA) | `ketua.name` + tombol WA via `buildWaMeUrl(ketua.whatsapp_number, …)` |

**Status tabayyun (derive):**
- tak ada baris tabayyun → `belum ditabayyun`
- `status='awaiting_reason'` → `nunggu alasan pengajar`
- `status='pending'` → `pending koordinator`
- `status='decided'` → `diputus`

## Permukaan (dua-duanya)

### 1. Page rekap baru — `/hits/koordinator/indisipliner`

- Menu/kartu baru di dashboard `/hits/koordinator` (samping ketua-kelas/pertemuan/pengajuan/validasi).
- Filter **bulan** (`MonthNavSelect`) + **gender** (`GenderNavSelect`) — pola existing.
- Ringkasan atas: total insiden, % udzur diterima (dari yg diputus), jumlah belum ditabayyun.
- List **dikelompokkan per halaqah**: header = nama halaqah · pengajar · ketua + tombol WA;
  di bawahnya baris insiden bulan itu.
- Guard akses: `requireKoordinatorKetuaKelas()` (sama seperti page koordinator).

### 2. Perkaya `/hits/koordinator/halaqah/[id]`

- Tambah section **"Indisipliner & Tabayyun (bulan berjalan / sesuai filter)"** di bawah grid
  kondisi harian.
- Baris insiden halaqah itu + kolom tabayyun/udzur/alasan + WA ketua.

## Arsitektur / Unit

- **`getIndisiplinerRekap({ month, gender })`** — helper baru di `src/lib/hits-rekap.ts`.
  Return list insiden ter-enrich (halaqah, pengajar, ketua+WA, pelanggaran[], tabayyun fields,
  status derive) + ringkasan agregat. Dipakai kedua permukaan (page rekap pakai lintas-halaqah;
  halaqah detail pakai `getIndisiplinerRekapForHalaqah(halaqahId, month)` — varian filter 1 halaqah).
- **Page** `src/app/hits/koordinator/indisipliner/page.tsx` — server component, susun UI.
- **Komponen tabel** (opsional) `src/components/IndisiplinerRekapTable.tsx` bila markup besar;
  kalau ringkas, inline di page.
- **Edit** `src/app/hits/koordinator/page.tsx` — tambah link menu.
- **Edit** `src/app/hits/koordinator/halaqah/[id]/page.tsx` — tambah section insiden.

## Reuse

`MonthNavSelect`, `GenderNavSelect`, `buildWaMeUrl`, `HITS_PELANGGARAN_LABEL`,
`HITS_KONDISI_LABEL`, badge style `kondisiStyle`, pola `fetchInChunks` di `hits-rekap.ts`.

## Non-Goal (YAGNI)

- Tak ada aksi putus/edit tabayyun di sini (murni lihat).
- Tak ada export PDF/print (kecuali diminta kemudian).
- Tak ada notifikasi WA otomatis (tombol WA hanya buka chat ke ketua, manual).

## Error / Edge

- Halaqah tanpa ketua aktif → tampil "belum ditunjuk", tombol WA disembunyikan.
- Insiden tanpa tabayyun → kolom tabayyun/udzur/alasan tampil "—", status `belum ditabayyun`.
- Bulan tanpa insiden → empty state ramah.

## Testing / Verifikasi

- Bandingkan jumlah badge per pelanggaran (KMT/KBLA/JKG/TL) di rekap vs hitungan existing
  di ranking disiplin (harus konsisten untuk bulan+gender sama).
- Cek 1 halaqah yg diketahui punya insiden diputus (udzur diterima & tolak) muncul benar.
- Cek halaqah tanpa ketua aktif tak error.
