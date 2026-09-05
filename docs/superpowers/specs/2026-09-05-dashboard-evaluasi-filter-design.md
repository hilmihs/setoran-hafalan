# Dashboard Evaluasi — penyaring program, batch, dan gender

Tanggal: 2026-09-05
Status: disetujui, siap direncanakan

## Masalah

`/evaluasi/koordinator` sudah menjadi "Dashboard Koordinator": empat kartu statistik
plus satu tabel per-halaqah. Tiga keterbatasan yang mau dihapus:

1. **Tak bisa disaring per program.** Semua halaqah binaan tampil sekaligus.
2. **Tak bisa disaring per batch.** Batch sesungguhnya (Januari/April/Juni 2026)
   tidak tersimpan di basis data sama sekali.
3. **Gender terkunci `session.gender`.** Tak ada cara melihat ikhwan dan akhwat
   berdampingan.

## Temuan yang membentuk desain

`eval_batch` hari ini bukan tabel batch — isinya **program**, satu baris per slug
hilmihs:

| id | nama | halaqah |
|---|---|---|
| `dpq` | DPQ | 3 |
| `hits-regular` | HITS Reguler (Batch Juni 2026) | 128 |
| `hits-regular-apr` | HITS Reguler (Batch April 2026) | 64 |
| `hits-regular-jan` | HITS Reguler (Batch Januari 2026) | 103 |
| `hits-safar` | HITS Safar | 9 |
| `hits-safar-jan` | HITS Safar (Batch Januari 2026) | 4 |
| … | (12 baris total) | |

API hilmihs `GET /api/agent/programs` sebetulnya sudah memisahkan keduanya lewat
`SrcProgram.batch`, tapi `mapBatch` membuangnya:

```jsonc
{ "slug": "hits-regular-apr", "name": "HITS Reguler (Batch April 2026)",
  "batch": { "family": "hits-regular", "label": "April 2026", "order": 2 } }
```

Program yang hanya punya satu angkatan (DPQ, RBI, HKM Presensi, Tahfizh Nurul Iman,
HITS Nurul Iman, HITS Ortu ABK) mengirim `"batch": null`.

Konsekuensi: **program = `batch.family`, batch = `batch.label`**, dan keduanya
harus dimirror lebih dulu sebelum penyaring bisa dibuat.

## Keputusan

### Penyimpanan: tiga kolom baru di `eval_batch`

Ditimbang tiga pilihan:

- **A — kolom baru di `eval_batch`.** Dipilih. Satu migrasi, ~15 baris perubahan
  di jalur sync, `apply.ts` tak tersentuh.
- **B — tabel `eval_program` terpisah + FK.** Ditolak. Menambah entitas baru ke
  `MirrorEntity`/`diff`/`apply`/`ORDER` dan halaman review sync, padahal sumbernya
  sendiri memodelkan batch sebagai atribut program, bukan entitas tersendiri.
- **C — regex atas nama program, tanpa migrasi.** Ditolak: `hits-safar` bernama
  `"HITS Safar"` tanpa suffix apa pun padahal punya `label: "Juli 2026"`, jadi
  hasilnya salah sejak baris pertama.

### Akses gender

Filter gender terbuka untuk **semua yang bisa membuka halaman ini** (`koordinator`
dan `koordinator_ketua_kelas`) — keputusan pemilik produk, diambil sadar. Ini
berbeda dari pemisahan gender yang ditegakkan di modul lain (routing, filter
per-kueri, trigger DB); di halaman ini koordinator ikhwan dapat melihat rekap
akhwat dan sebaliknya. Halaman ini hanya-baca, jadi tak ada jalur tulis lintas
gender yang ikut terbuka.

Default tetap `session.gender`, sehingga perilaku lama tak berubah bagi pemakai
yang ada; lintas-gender adalah pilihan eksplisit (`?gender=semua`).

## Perubahan

### 1. Migrasi `0073_eval_batch_family.sql`

```sql
alter table eval_batch add column if not exists family      text;
alter table eval_batch add column if not exists batch_label text;
alter table eval_batch add column if not exists batch_order smallint;
update eval_batch set family = id where family is null;
alter table eval_batch alter column family set not null;
create index if not exists idx_eval_batch_family on eval_batch(family);
```

Nomor 0073 dipakai karena 0071/0072 sudah terpakai di branch
`docs/ketersediaan-mengajar-hits`. Ke produksi lewat `/api/admin/db`: dipecah
per-statement, `begin;`/`commit;` dibuang (endpoint membungkus transaksinya sendiri).

`family` sengaja tak diberi FK ke `eval_batch(id)` — nilai family bisa menunjuk
slug yang belum tersinkron pada urutan pull tertentu, dan sumbernya memang
memperlakukannya sebagai label pengelompokan, bukan referensi.

### 2. `src/types/db.ts`

`EvalBatch` bertambah `family: string`, `batch_label: string | null`,
`batch_order: number | null`.

### 3. `src/lib/hilmihs/types.ts`

`MirrorBatch` bertambah tiga field yang sama.

### 4. `src/lib/hilmihs/map.ts`

```ts
export function mapBatch(p: SrcProgram): MirrorBatch {
  return {
    id: p.slug, nama: p.name, aktif: !p.syncPaused,
    family: p.batch?.family ?? p.slug,
    batch_label: p.batch?.label ?? null,
    batch_order: p.batch?.order ?? null,
  };
}
```

Program tanpa batch menjadi family beranggota tunggal — tak perlu cabang khusus
di sisi pembaca.

### 5. `src/lib/hilmihs/sync.ts`

- `COMPARE.batch` → `['nama', 'aktif', 'family', 'batch_label', 'batch_order']`
- `currentMirror('eval_batch', 'id, nama, aktif, family, batch_label, batch_order')`

`apply.ts` tak diubah: ia mengupsert isi `after` apa adanya, jadi kolom baru ikut
mendarat. Kolom kurasi `rapot_ujian_terpisah` (migrasi 0058) tetap aman karena
`ON CONFLICT DO UPDATE` hanya menyentuh kolom yang dikirim — mekanisme yang sama
yang menjaganya selama ini.

### 6. `src/lib/evaluasi.ts` — helper nama program

```ts
/** "HITS Reguler (Batch April 2026)" → "HITS Reguler". Program tanpa batch tak
 *  punya suffix itu, jadi namanya lolos utuh ("Tahsin Al-Fatihah Mustahik (LAZ)"). */
export function namaProgram(namaBatch: string): string {
  return namaBatch.replace(/\s*\(Batch\s+[^)]*\)\s*$/i, '').trim();
}
```

Label sebuah family diambil dari anggota dengan `batch_order` terkecil
(`null` diperlakukan sebagai paling kecil), supaya hasilnya deterministik saat
antar-anggota ejaannya berbeda.

### 7. `src/lib/evaluasi-dashboard.ts` (berkas baru)

`page.tsx` kini 425 baris dan akan bertambah. Seluruh logika non-render pindah ke
sini, dengan satu fungsi masuk:

```ts
export interface FilterDashboard {
  program: string;                             // '' = semua
  batch: string;                               // '' = semua
  gender: 'ikhwan' | 'akhwat' | 'semua';
}

export interface GrupDashboard {
  programId: string; programNama: string;
  batchId: string | null; batchLabel: string | null; batchOrder: number | null;
  gender: 'ikhwan' | 'akhwat';
  halaqah: number; total: number; selesai: number;
  rata: number | null; bermasalah: number;
}

export interface BarisHalaqah {
  id: string; nama: string; sub: string; pengajar: string;
  total: number; selesai: number; rata: number | null;
  bermasalah: number; lahnTop: string;
}

export async function muatDashboard(f: FilterDashboard): Promise<{
  opsiProgram: Array<{ value: string; label: string }>;
  opsiBatch:   Array<{ value: string; label: string }>;   // kosong bila program batch-tunggal
  grup: GrupDashboard[];
  halaqah: BarisHalaqah[];
  total: { halaqah: number; peserta: number; selesai: number; rata: number | null; bermasalah: number };
  namaPeriode: string;
  adaHalaqahSamaSekali: boolean;   // membedakan dua jenis keadaan kosong
}>;
```

Alur kueri:

1. Baca seluruh `eval_batch` (12 baris) → susun daftar family dan batch, lalu
   tentukan himpunan `batch_id` yang lolos filter program/batch.
2. `eval_halaqah` — `.eq('gender', …)` hanya bila gender bukan `semua`;
   `.in('batch_id', idsLolos)` hanya bila program atau batch difilter.
3. `eval_peserta` (aktif), `evaluasi_sesi` (`jenis='qn'`), `evaluasi_nilai`
   mengikuti `halaqahIds` hasil langkah 2 — sama seperti kode sekarang.

Sesi yang dihitung tetap `jenis='qn'` dengan `nomor_sesi` terbesar per halaqah.
Penyaring jenis (QN/PB/Ujian) **tidak** ditambahkan; di luar lingkup.

Beban terburuk (semua filter dilepas) ~365 halaqah dan ~3.600 baris nilai dalam
satu render server. `pg-shim` tak memasang LIMIT default, jadi tak ada pemotongan
diam-diam; batas 1000 baris hanya berlaku di endpoint `/api/admin/db`, bukan di
jalur ini.

Validasi filter berada di sini juga: `batch` yang tak termasuk `program` terpilih
(sisa query-string basi) diabaikan, dan hasilnya dropdown batch kembali ke
"Semua batch" alih-alih memunculkan halaman kosong tanpa sebab.

### 8. `src/app/evaluasi/koordinator/page.tsx`

Guard tetap `requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas'])`;
`bolehPengaturan` tetap `session.role === 'koordinator'`.

State filter di query-string (`export const dynamic = 'force-dynamic'` sudah ada):

| param | nilai | default |
|---|---|---|
| `program` | slug family (`hits-regular`, `dpq`, …) | kosong = semua |
| `batch` | slug batch (`hits-regular-apr`, …) | kosong = semua |
| `gender` | `ikhwan` \| `akhwat` \| `semua` | `session.gender` |

Ketiga dropdown memakai `QueryNavSelect` yang sudah ada — nol komponen client
baru. `GenderNavSelect` tidak dipakai karena ia memaknai nilai kosong sebagai
"semua", sedangkan di sini kosong berarti "gender saya".

Bar filter diberi kelas `no-print`.

### 9. Tampilan

**Empat kartu statistik** — bentuknya tak berubah, isinya mengikuti filter.

**Tabel ringkasan** (baru), satu baris per program × batch × gender, hanya grup
yang punya halaqah:

```
Program        Batch        Gender   Halaqah  Kelengkapan  Rata²  Bermasalah
HITS Reguler   Juni 2026    Ikhwan       96      812/903     84       61
HITS Reguler   Juni 2026    Akhwat       32      201/240     87       12
HITS Safar     Juli 2026    Ikhwan        9       40/55      79        8
DPQ            —            Ikhwan        3       12/18      91        1
```

Urutan: nama program → `batch_order` → gender. Kolom Gender disembunyikan bila
gender difilter ke satu. Seluruh tabel disembunyikan bila hanya tersisa satu grup —
tak menambah informasi apa pun di atas empat kartu.

**Tabel halaqah** tetap seperti sekarang, satu perubahan: baris `sub` memuat asal
program dan batch — `Ikhwan · HITS Reguler Juni 2026 · M1` — supaya baris tak
menjadi anonim ketika filter dilepas.

**Label periode** — `eval_config.nama_qn` tersimpan per gender. Saat gender =
`semua`: pakai nama itu bila kedua gender menuliskannya sama, kalau berbeda pakai
teks netral `Evaluasi`. Tak ada label yang menyesatkan.

**Keadaan kosong** dibedakan dua: "belum ada halaqah tersinkron" (tak ada halaqah
sama sekali) dan "tak ada halaqah yang cocok dengan filter ini" (+ tautan reset
filter).

**Cetak PDF** tetap jalan; ringkasan dan detail ikut tercetak sesuai filter aktif.

## Urutan rilis

1. **DDL 0073 di produksi lebih dulu**, per-statement lewat `/api/admin/db`.
   Aditif seluruhnya, jadi aman dijalankan sebelum kode mendarat — dan urutan ini
   menghilangkan jendela waktu di mana halaman mengkueri kolom yang belum ada.
   Kolom yang menganggur beberapa menit tak mengganggu kode lama.
2. Merge dan deploy kode ke produksi (push ke remote `maheer`, bukan `origin`).
3. Buka `/evaluasi/koordinator/sync` → pull → setujui enam baris `batch.update`
   (`hits-regular`, `hits-regular-apr`, `hits-regular-jan`, `hits-safar`,
   `hits-safar-jan`, `tafm-laz`).

Sebelum langkah 3, `family` setiap baris masih sama dengan `id`-nya sendiri, jadi
HITS Reguler tampil sebagai tiga program terpisah. Itu keadaan antara yang
disengaja, bukan kerusakan.

## Verifikasi

Tak ada test runner di repo ini. Yang dijalankan:

- `npm run typecheck` — wajib, karena `EvalBatch` dan `MirrorBatch` berubah.
- `npm run lint`.
- Manual di dev: tiap kombinasi filter; `?batch=` basi setelah program diganti;
  gender `semua` vs terkunci; kedua keadaan kosong; cetak PDF.
- `npm run test-hilmihs` — memukul API agent sungguhan; pastikan `mapBatch`
  menghasilkan `family = slug` untuk program ber-`batch: null` dan
  `family = "hits-regular"` untuk ketiga varian HITS Reguler.

## Di luar lingkup

- Penyaring jenis sesi (QN/PB/Ujian).
- Paging tabel halaqah.
- Perubahan pada `/evaluasi/koordinator/[halaqahId]`.
- Membuka modul evaluasi untuk role syaikh.
