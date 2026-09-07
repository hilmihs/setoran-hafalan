# Dashboard Evaluasi — Penyaring Program/Batch/Gender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan penyaring program, batch, dan gender ke `/evaluasi/koordinator`, dengan memirror `batch.family/label/order` dari hilmihs ke `eval_batch` lebih dulu.

**Architecture:** Tiga kolom baru di `eval_batch` (`family`, `batch_label`, `batch_order`) diisi oleh `mapBatch` dari `SrcProgram.batch`. Program = `family`, batch = `batch_label`. Seluruh logika kueri dan agregasi pindah dari `page.tsx` ke berkas baru `src/lib/evaluasi-dashboard.ts`; halaman hanya merender. State penyaring hidup di query-string dan digerakkan oleh `QueryNavSelect` yang sudah ada.

**Tech Stack:** Next.js App Router (server component, `force-dynamic`), PostgreSQL via `supabaseAdmin` (shim `pg-shim`, bukan Supabase sungguhan), TypeScript. Tidak ada test runner — verifikasi lewat `npm run typecheck`, `npm run lint`, dan skrip `tsx` mandiri (`npm run test-evaluasi`, `npm run test-hilmihs`).

**Spec:** `docs/superpowers/specs/2026-09-05-dashboard-evaluasi-filter-design.md`

---

## Peta berkas

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `supabase/migrations/0073_eval_batch_family.sql` | **Baru.** DDL tiga kolom + indeks + backfill. | 1 |
| `src/types/db.ts` | Tipe `EvalBatch` mengikuti skema. | 1 |
| `src/lib/hilmihs/types.ts` | Bentuk `MirrorBatch`. | 2 |
| `src/lib/hilmihs/map.ts` | `mapBatch`: response → mirror-shape. | 2 |
| `src/lib/hilmihs/sync.ts` | Kolom pembanding + kolom yang dibaca dari mirror. | 2 |
| `scripts/test-hilmihs.ts` | Uji `mapBatch`. | 2 |
| `src/lib/evaluasi.ts` | Helper murni `namaProgram`. | 3 |
| `scripts/test-evaluasi.ts` | Uji `namaProgram`. | 3 |
| `src/lib/evaluasi-dashboard.ts` | **Baru.** Parse+validasi penyaring, kueri, agregasi. | 4 |
| `scripts/test-evaluasi-dashboard.ts` | **Baru.** Uji fungsi murni penyusun opsi & urutan. | 4 |
| `package.json` | Entri skrip `test-evaluasi-dashboard`. | 4 |
| `src/app/evaluasi/koordinator/page.tsx` | Render saja: bar penyaring, kartu, dua tabel. | 5 |

Tak ada dua task yang menyentuh berkas yang sama. Kelima task boleh dikerjakan
serentak; kontrak antar-berkas sudah tertulis lengkap di bawah, jadi tak ada
yang perlu menunggu.

**Konsekuensi yang harus diterima:** Task 4 dan Task 5 belum lolos
`npm run typecheck` sampai Task 1/3 dan Task 4 mendarat. Itu **normal**, bukan
kegagalan. Setiap task punya perintah verifikasi lokalnya sendiri; typecheck
menyeluruh dijalankan orkestrator di langkah integrasi setelah kelimanya selesai.

---

## Task 1: Migrasi dan tipe `EvalBatch`

**Files:**
- Create: `supabase/migrations/0073_eval_batch_family.sql`
- Modify: `src/types/db.ts:689-697`

**Latar:** `eval_batch` hari ini menyimpan *program* (satu baris per slug hilmihs),
sehingga "HITS Reguler" muncul tiga kali sebagai tiga baris berbeda. Tiga kolom
ini yang memisahkan program dari batch.

- [ ] **Step 1: Pastikan nomor migrasi 0073 masih bebas**

Run:
```bash
for b in $(git branch --format='%(refname:short)'); do \
  git ls-tree --name-only "$b" supabase/migrations/ 2>/dev/null | sed 's|.*/||'; \
done | sort -u | tail -5
```

Expected: `0073_*` **tidak** muncul. Yang muncul sampai `0072_ketersediaan_pertemuan.sql`
(0071/0072 milik branch `docs/ketersediaan-mengajar-hits`). Kalau 0073 ternyata
sudah terpakai, naikkan ke nomor bebas berikutnya dan sesuaikan seluruh rujukan
di task ini.

- [ ] **Step 2: Tulis berkas migrasi**

Create `supabase/migrations/0073_eval_batch_family.sql`:

```sql
-- 0073_eval_batch_family.sql
-- Pisahkan "program" dari "batch" di mirror eval_batch.
--
-- eval_batch selama ini menyimpan satu baris per slug hilmihs, sehingga satu
-- program yang punya banyak angkatan ("HITS Reguler") tampak sebagai beberapa
-- program berbeda. Sumbernya sendiri sudah memisahkan keduanya lewat
-- SrcProgram.batch = { family, label, order }; tiga kolom ini memirrornya.
--
-- family sengaja TANPA foreign key ke eval_batch(id): nilainya bisa menunjuk
-- slug yang belum tersinkron pada urutan pull tertentu, dan sumber
-- memperlakukannya sebagai label pengelompokan, bukan referensi baris.
--
-- Program berangkatan tunggal (DPQ, RBI, HKM Presensi, ...) mengirim
-- batch: null → family = slug-nya sendiri, batch_label/batch_order null.

begin;

alter table eval_batch add column if not exists family      text;
alter table eval_batch add column if not exists batch_label text;
alter table eval_batch add column if not exists batch_order smallint;

-- Backfill: sebelum sync pertama, tiap baris jadi family beranggota tunggal.
update eval_batch set family = id where family is null;

alter table eval_batch alter column family set not null;

create index if not exists idx_eval_batch_family on eval_batch(family);

commit;
```

- [ ] **Step 3: Terapkan migrasi ke DB lokal dan pastikan idempoten**

Run:
```bash
npm run apply-migration -- supabase/migrations/0073_eval_batch_family.sql
npm run apply-migration -- supabase/migrations/0073_eval_batch_family.sql
```

Expected: dua-duanya sukses tanpa error. Jalan kedua membuktikan
`add column if not exists` / `create index if not exists` aman diulang — penting
karena ke produksi nanti berkas ini dipecah per-statement dan bisa terulang.

Kalau `DATABASE_URL` lokal tak menunjuk DB yang punya tabel `eval_batch`, lewati
step ini, catat di laporan bahwa migrasi belum teruji lokal, dan lanjut. **Jangan**
menjalankan `npm run db` — perintah itu menghantam produksi.

- [ ] **Step 4: Perbarui tipe `EvalBatch`**

Di `src/types/db.ts`, ganti interface `EvalBatch` (sekitar baris 689) menjadi:

```ts
export interface EvalBatch {
  id: string;
  nama: string;
  aktif: boolean;
  /** Kolom kurasi (0058), tidak ikut ditimpa sinkron hilmihs.
   *  true = nilai akhir murni skor ujian + rapot Ujian QN/PB terpisah. */
  rapot_ujian_terpisah: boolean;
  /** Slug program induk (0073). Program berangkatan tunggal → sama dengan `id`. */
  family: string;
  /** Label angkatan, mis. "April 2026". null untuk program berangkatan tunggal. */
  batch_label: string | null;
  /** Urutan angkatan dalam family, menaik. null untuk program berangkatan tunggal. */
  batch_order: number | null;
  synced_at: string;
}
```

- [ ] **Step 5: Verifikasi typecheck**

Run: `npm run typecheck`
Expected: PASS. Menambah field ke `EvalBatch` tak boleh merusak apa pun — tak ada
pemakai yang mengonstruksi objek `EvalBatch` utuh.

Kalau gagal dengan error di `src/lib/evaluasi-dashboard.ts` atau
`src/app/evaluasi/koordinator/page.tsx`, abaikan — itu berkas milik Task 4/5 yang
mungkin sudah mendarat lebih dulu. Error di berkas lain harus dibereskan.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0073_eval_batch_family.sql src/types/db.ts
git commit -m "feat(evaluasi): kolom family, batch_label, batch_order di eval_batch

eval_batch menyimpan program, bukan batch, sehingga HITS Reguler tampak
sebagai tiga program berbeda. Tiga kolom ini menyediakan tempat bagi
SrcProgram.batch dari hilmihs, yang selama ini dibuang oleh mapBatch.

family tanpa FK: nilainya bisa menunjuk slug yang belum tersinkron, dan
sumber memperlakukannya sebagai label pengelompokan."
```

---

## Task 2: Mirror `batch.family/label/order` di jalur sync hilmihs

**Files:**
- Modify: `src/lib/hilmihs/types.ts:53` (`MirrorBatch`)
- Modify: `src/lib/hilmihs/map.ts:28-30` (`mapBatch`)
- Modify: `src/lib/hilmihs/sync.ts:11-16` (`COMPARE`), `src/lib/hilmihs/sync.ts:84` (`currentMirror`)
- Test: `scripts/test-hilmihs.ts` (assertion `mapBatch` yang sudah ada)

**Latar:** `GET https://hilmihs.web.id/api/agent/programs` mengirim, per program:

```jsonc
{ "slug": "hits-regular-apr", "name": "HITS Reguler (Batch April 2026)",
  "dataSourceType": "tilawah_api", "syncPaused": false,
  "batch": { "family": "hits-regular", "label": "April 2026", "order": 2 } }
```

Program berangkatan tunggal mengirim `"batch": null`. `mapBatch` sekarang membuang
seluruh field `batch`.

`apply.ts` **tidak** perlu diubah: ia mengupsert isi `after` apa adanya, jadi kolom
baru ikut mendarat sendiri. Kolom kurasi `rapot_ujian_terpisah` tetap aman karena
`ON CONFLICT DO UPDATE` hanya menyentuh kolom yang dikirim.

- [ ] **Step 1: Tulis assertion yang gagal**

Di `scripts/test-hilmihs.ts`, **ganti** blok assertion `mapBatch` yang ada
(`eq(mapBatch({ slug: 'hits-regular', ... }), { id: ..., nama: ..., aktif: true }, 'mapBatch');`)
dengan dua assertion berikut:

```ts
// Program berangkatan tunggal: batch null → family = slug-nya sendiri.
eq(
  mapBatch({ slug: 'dpq', name: 'DPQ', dataSourceType: 'tilawah_api', syncPaused: false, batch: null }),
  { id: 'dpq', nama: 'DPQ', aktif: true, family: 'dpq', batch_label: null, batch_order: null },
  'mapBatch tanpa batch'
);
// Program berangkatan banyak: family/label/order ikut dimirror.
eq(
  mapBatch({
    slug: 'hits-regular-apr', name: 'HITS Reguler (Batch April 2026)',
    dataSourceType: 'tilawah_api', syncPaused: false,
    batch: { family: 'hits-regular', label: 'April 2026', order: 2 },
  }),
  {
    id: 'hits-regular-apr', nama: 'HITS Reguler (Batch April 2026)', aktif: true,
    family: 'hits-regular', batch_label: 'April 2026', batch_order: 2,
  },
  'mapBatch dengan batch'
);
// syncPaused → aktif false, tak terpengaruh perubahan ini.
eq(
  mapBatch({ slug: 'rbi', name: 'RBI', dataSourceType: 'tilawah_api', syncPaused: true, batch: null }).aktif,
  false,
  'mapBatch syncPaused'
);
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test-hilmihs`
Expected: FAIL. Dua baris `FAIL mapBatch tanpa batch` / `FAIL mapBatch dengan batch`
dengan `got:` yang kekurangan `family`/`batch_label`/`batch_order`.

Kemungkinan lain: gagal lebih dulu di tahap kompilasi TS karena objek harapan
tak cocok tipe `MirrorBatch`. Itu juga hitung sebagai merah yang benar.

- [ ] **Step 3: Perluas `MirrorBatch`**

Di `src/lib/hilmihs/types.ts`, ganti baris `export interface MirrorBatch ...` menjadi:

```ts
export interface MirrorBatch {
  id: string; nama: string; aktif: boolean;
  /** Slug program induk. Program berangkatan tunggal → sama dengan `id`. */
  family: string;
  batch_label: string | null;
  batch_order: number | null;
}
```

- [ ] **Step 4: Isi ketiga field di `mapBatch`**

Di `src/lib/hilmihs/map.ts`, ganti `mapBatch` menjadi:

```ts
export function mapBatch(p: SrcProgram): MirrorBatch {
  return {
    id: p.slug,
    nama: p.name,
    aktif: !p.syncPaused,
    // Program berangkatan tunggal (batch null) jadi family beranggota satu, supaya
    // sisi pembaca tak perlu cabang khusus.
    family: p.batch?.family ?? p.slug,
    batch_label: p.batch?.label ?? null,
    batch_order: p.batch?.order ?? null,
  };
}
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

Run: `npm run test-hilmihs`
Expected: PASS untuk ketiga label `mapBatch*`, dan skrip berakhir tanpa `FAIL`.

Skrip ini juga memukul API agent sungguhan. Kalau gagal karena `AGENT_TOKEN`
belum di-set atau jaringan mati, bagian `mapBatch` di atas tetap harus tampil
hijau lebih dulu — assertion murni dijalankan sebelum bagian jaringan.

- [ ] **Step 6: Ikutkan kolom baru ke diff dan pembacaan mirror**

Di `src/lib/hilmihs/sync.ts`, ganti entri `batch` di `COMPARE`:

```ts
const COMPARE: Record<MirrorEntity, string[]> = {
  batch: ['nama', 'aktif', 'family', 'batch_label', 'batch_order'],
  pengajar: ['nama', 'gender', 'whatsapp'],
  halaqah: ['nama', 'gender', 'level', 'pengajar_id', 'batch_id'],
  peserta: ['nama', 'gender', 'halaqah_id', 'urutan'],
};
```

Lalu di `runPull`, ganti baris `currentMirror` untuk batch:

```ts
    const curBatch = await currentMirror<MirrorBatch & { aktif: boolean }>(
      'eval_batch', 'id, nama, aktif, family, batch_label, batch_order'
    );
```

Tanpa perubahan kedua ini, `diffEntity` membandingkan `family` mirror yang
undefined melawan `family` hasil fetch dan menstage update yang sama berulang
kali di setiap pull.

- [ ] **Step 7: Verifikasi typecheck dan uji ulang**

Run: `npm run typecheck && npm run test-hilmihs`
Expected: typecheck PASS (abaikan error di `src/lib/evaluasi-dashboard.ts` atau
`src/app/evaluasi/koordinator/page.tsx` — itu milik Task 4/5), uji tanpa `FAIL`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hilmihs/types.ts src/lib/hilmihs/map.ts src/lib/hilmihs/sync.ts scripts/test-hilmihs.ts
git commit -m "feat(hilmihs): mirror family, label, dan order batch dari sumber

mapBatch membuang SrcProgram.batch, padahal di situlah pemisahan program
dan angkatan berada. Tanpanya penyaring batch tidak mungkin dibuat.

COMPARE.batch dan currentMirror ikut diperluas; kalau tidak, setiap pull
membandingkan kolom mirror yang tak terbaca dan menstage update yang sama
berulang-ulang."
```

---

## Task 3: Helper `namaProgram`

**Files:**
- Modify: `src/lib/evaluasi.ts` (tambah di akhir berkas)
- Test: `scripts/test-evaluasi.ts`

**Latar:** Dropdown program butuh label bersih. Nama program di sumber memuat
suffix angkatan — `"HITS Reguler (Batch April 2026)"` — yang harus dibuang.
Tapi tak semua kurung adalah angkatan: `"Tahsin Al-Fatihah Mustahik (LAZ)"` harus
lolos utuh. Karena itu polanya khusus `(Batch …)`, bukan sembarang kurung penutup.

- [ ] **Step 1: Tulis assertion yang gagal**

Di `scripts/test-evaluasi.ts`, tambahkan `namaProgram` ke daftar impor dari
`@/lib/evaluasi` (blok impor di baris 3-9), lalu tambahkan di akhir berkas
**sebelum** blok penutup yang memeriksa `failed`:

```ts
// ── nama program untuk dropdown penyaring ──
eq(namaProgram('HITS Reguler (Batch April 2026)'), 'HITS Reguler', 'buang suffix batch');
eq(namaProgram('HITS Reguler (Batch Juni 2026)'), 'HITS Reguler', 'suffix batch bulan lain');
// Kurung yang bukan angkatan harus lolos utuh — kalau tidak, dua program berbeda
// bisa bertabrakan jadi satu label.
eq(namaProgram('Tahsin Al-Fatihah Mustahik (LAZ)'), 'Tahsin Al-Fatihah Mustahik (LAZ)', 'kurung non-batch dibiarkan');
eq(namaProgram('HKM — Presensi (Halaqah Keluarga Muhajir)'), 'HKM — Presensi (Halaqah Keluarga Muhajir)', 'kurung penjelas dibiarkan');
eq(namaProgram('DPQ'), 'DPQ', 'nama tanpa kurung');
eq(namaProgram('  HITS Safar  '), 'HITS Safar', 'spasi tepi dirapikan');
// Suffix hanya dibuang di ujung, bukan di tengah.
eq(namaProgram('Kelas (Batch A) Lanjutan'), 'Kelas (Batch A) Lanjutan', 'suffix di tengah dibiarkan');
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

Run: `npm run test-evaluasi`
Expected: FAIL saat kompilasi — `namaProgram` belum diekspor dari `@/lib/evaluasi`.

- [ ] **Step 3: Tulis helper**

Tambahkan di akhir `src/lib/evaluasi.ts`:

```ts
/**
 * Nama program tanpa embel-embel angkatan, untuk label dropdown penyaring.
 * "HITS Reguler (Batch April 2026)" → "HITS Reguler".
 *
 * Polanya sengaja khusus "(Batch …)" di ujung, bukan sembarang kurung: nama
 * seperti "Tahsin Al-Fatihah Mustahik (LAZ)" dan "HKM — Presensi (Halaqah
 * Keluarga Muhajir)" harus lolos utuh, kalau tidak program yang berbeda bisa
 * bertabrakan jadi satu label.
 */
export function namaProgram(namaBatch: string): string {
  return namaBatch.replace(/\s*\(Batch\s+[^)]*\)\s*$/i, '').trim();
}
```

- [ ] **Step 4: Jalankan uji untuk memastikan lulus**

Run: `npm run test-evaluasi`
Expected: tujuh baris `ok` untuk label-label di atas, dan skrip berakhir tanpa `FAIL`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/evaluasi.ts scripts/test-evaluasi.ts
git commit -m "feat(evaluasi): helper namaProgram untuk label dropdown

Nama program di sumber memuat suffix angkatan yang tak boleh muncul di
dropdown program. Polanya dibatasi pada '(Batch ...)' di ujung supaya
'Tahsin Al-Fatihah Mustahik (LAZ)' tidak ikut terpotong."
```

---

## Task 4: `src/lib/evaluasi-dashboard.ts`

**Files:**
- Create: `src/lib/evaluasi-dashboard.ts`
- Create: `scripts/test-evaluasi-dashboard.ts`
- Modify: `package.json` (satu entri skrip)

**Latar:** `src/app/evaluasi/koordinator/page.tsx` sekarang 425 baris dan memuat
seluruh kueri plus agregasi. Menambah tiga penyaring dan satu tabel ringkasan di
sana akan membuatnya tak terpegang. Semua logika non-render pindah ke sini;
halaman tinggal merender.

**Kontrak yang dipakai Task 5** — tanda tangan di bawah ini final; jangan diubah.

- [ ] **Step 1: Tulis uji fungsi murni yang gagal**

Create `scripts/test-evaluasi-dashboard.ts`:

```ts
// Uji fungsi murni Dashboard Evaluasi: penyusun opsi penyaring, pemilihan batch
// yang sah, dan urutan grup. Jalankan: npm run test-evaluasi-dashboard
import {
  susunOpsiProgram, susunOpsiBatch, batchTerpakai, idBatchLolos,
  urutkanGrup, pilihNamaTrack,
  type BarisBatch, type GrupDashboard,
} from '@/lib/evaluasi-dashboard';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// Cuplikan eval_batch produksi, cukup untuk semua cabang.
const BATCHES: BarisBatch[] = [
  { id: 'dpq', nama: 'DPQ', family: 'dpq', batch_label: null, batch_order: null },
  { id: 'hits-regular', nama: 'HITS Reguler (Batch Juni 2026)', family: 'hits-regular', batch_label: 'Juni 2026', batch_order: 3 },
  { id: 'hits-regular-apr', nama: 'HITS Reguler (Batch April 2026)', family: 'hits-regular', batch_label: 'April 2026', batch_order: 2 },
  { id: 'hits-regular-jan', nama: 'HITS Reguler (Batch Januari 2026)', family: 'hits-regular', batch_label: 'Januari 2026', batch_order: 1 },
  { id: 'hits-safar', nama: 'HITS Safar', family: 'hits-safar', batch_label: 'Juli 2026', batch_order: 2 },
  { id: 'hits-safar-jan', nama: 'HITS Safar (Batch Januari 2026)', family: 'hits-safar', batch_label: 'Januari 2026', batch_order: 1 },
];

// ── susunOpsiProgram ──
eq(
  susunOpsiProgram(BATCHES),
  [
    { value: 'dpq', label: 'DPQ' },
    { value: 'hits-regular', label: 'HITS Reguler' },
    { value: 'hits-safar', label: 'HITS Safar' },
  ],
  'opsi program: satu baris per family, terurut label'
);
// Label diambil dari anggota ber-order terkecil. "HITS Safar" (order 2) tak
// bersuffix, sedangkan "HITS Safar (Batch Januari 2026)" (order 1) bersuffix —
// hasilnya harus sama-sama "HITS Safar", dan pilihannya deterministik.
eq(
  susunOpsiProgram([BATCHES[4], BATCHES[5]]).map((o) => o.label),
  ['HITS Safar'],
  'label family dari anggota order terkecil'
);
eq(susunOpsiProgram([]), [], 'opsi program dari daftar kosong');

// ── susunOpsiBatch ──
eq(
  susunOpsiBatch(BATCHES, 'hits-regular'),
  [
    { value: 'hits-regular-jan', label: 'Januari 2026' },
    { value: 'hits-regular-apr', label: 'April 2026' },
    { value: 'hits-regular', label: 'Juni 2026' },
  ],
  'opsi batch terurut batch_order'
);
eq(susunOpsiBatch(BATCHES, 'dpq'), [], 'program berangkatan tunggal tak punya dropdown batch');
eq(susunOpsiBatch(BATCHES, ''), [], 'tanpa program terpilih tak ada opsi batch');

// ── batchTerpakai: query-string basi diabaikan ──
eq(batchTerpakai(BATCHES, 'hits-regular', 'hits-regular-apr'), 'hits-regular-apr', 'batch sah dipertahankan');
eq(batchTerpakai(BATCHES, 'dpq', 'hits-regular-apr'), '', 'batch dari program lain dibuang');
eq(batchTerpakai(BATCHES, '', 'hits-regular-apr'), 'hits-regular-apr', 'batch tanpa program tetap sah');
eq(batchTerpakai(BATCHES, 'hits-regular', 'tidak-ada'), '', 'batch tak dikenal dibuang');
eq(batchTerpakai(BATCHES, 'hits-regular', ''), '', 'batch kosong tetap kosong');

// ── idBatchLolos ──
eq(idBatchLolos(BATCHES, '', ''), null, 'tanpa penyaring: tak ada pembatasan');
eq(idBatchLolos(BATCHES, 'hits-safar', ''), ['hits-safar', 'hits-safar-jan'], 'saring per program');
eq(idBatchLolos(BATCHES, 'hits-regular', 'hits-regular-apr'), ['hits-regular-apr'], 'saring per batch');
eq(idBatchLolos(BATCHES, '', 'hits-regular-apr'), ['hits-regular-apr'], 'batch tanpa program');
// Batch basi tidak boleh mengosongkan hasil — halaman kosong tanpa sebab itu
// membingungkan; yang benar adalah mundur ke seluruh batch program terpilih.
eq(idBatchLolos(BATCHES, 'dpq', 'hits-regular-apr'), ['dpq'], 'batch basi mundur ke program');

// ── urutkanGrup ──
const grup = (programNama: string, batchOrder: number | null, gender: 'ikhwan' | 'akhwat'): GrupDashboard => ({
  programId: 'x', programNama, batchId: null, batchLabel: null, batchOrder: batchOrder,
  gender, halaqah: 0, total: 0, selesai: 0, rata: null, bermasalah: 0,
});
eq(
  urutkanGrup([
    grup('HITS Safar', 2, 'ikhwan'),
    grup('HITS Reguler', 3, 'akhwat'),
    grup('HITS Reguler', 3, 'ikhwan'),
    grup('HITS Reguler', 1, 'ikhwan'),
    grup('DPQ', null, 'ikhwan'),
  ]).map((g) => `${g.programNama}|${g.batchOrder}|${g.gender}`),
  [
    'DPQ|null|ikhwan',
    'HITS Reguler|1|ikhwan',
    'HITS Reguler|3|ikhwan',
    'HITS Reguler|3|akhwat',
    'HITS Safar|2|ikhwan',
  ],
  'urut: program, batch_order, ikhwan sebelum akhwat'
);

// ── pilihNamaTrack ──
const CFG = [
  { gender: 'ikhwan', nama_qn: 'Evaluasi QN' },
  { gender: 'akhwat', nama_qn: 'Evaluasi Qiroah' },
];
eq(pilihNamaTrack(CFG, 'ikhwan'), 'Evaluasi QN', 'track gender tertentu');
eq(pilihNamaTrack(CFG, 'akhwat'), 'Evaluasi Qiroah', 'track gender lain');
// Nama berbeda antar gender: label gabungan harus netral, bukan memihak salah satu.
eq(pilihNamaTrack(CFG, 'semua'), 'Evaluasi', 'nama berbeda → label netral');
eq(
  pilihNamaTrack([{ gender: 'ikhwan', nama_qn: 'Evaluasi QN' }, { gender: 'akhwat', nama_qn: 'Evaluasi QN' }], 'semua'),
  'Evaluasi QN',
  'nama sama → dipakai apa adanya'
);
eq(pilihNamaTrack([], 'semua'), 'Evaluasi QN', 'tanpa config → default');
eq(pilihNamaTrack([], 'ikhwan'), 'Evaluasi QN', 'tanpa config gender → default');

if (failed) { console.error(`\n${failed} gagal`); process.exit(1); }
console.log('\nsemua lulus');
```

- [ ] **Step 2: Daftarkan skrip uji**

Di `package.json`, tambahkan tepat setelah baris `"test-evaluasi": ...`:

```json
    "test-evaluasi-dashboard": "tsx scripts/test-evaluasi-dashboard.ts",
```

- [ ] **Step 3: Jalankan uji untuk memastikan gagal**

Run: `npm run test-evaluasi-dashboard`
Expected: FAIL — modul `@/lib/evaluasi-dashboard` belum ada.

- [ ] **Step 4: Tulis berkas**

Create `src/lib/evaluasi-dashboard.ts`:

```ts
// Data untuk Dashboard Evaluasi koordinator: opsi penyaring, agregat per grup
// (program × batch × gender), dan baris per-halaqah. Halaman hanya merender.
//
// Sesi yang dihitung tetap jenis 'qn' dengan nomor_sesi terbesar per halaqah —
// "sesi berjalan", sama seperti sebelum penyaring ada.
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ALL_LAHN, AMBANG, columnsToCounts, namaProgram } from '@/lib/evaluasi';
import type { Gender } from '@/types/db';

export type GenderFilter = Gender | 'semua';

export interface FilterDashboard {
  /** Slug family program. Kosong = semua program. */
  program: string;
  /** Slug batch. Kosong = semua batch. */
  batch: string;
  gender: GenderFilter;
}

/** Baris eval_batch sebatas yang dipakai penyaring. */
export interface BarisBatch {
  id: string;
  nama: string;
  family: string;
  batch_label: string | null;
  batch_order: number | null;
}

export interface OpsiPilih {
  value: string;
  label: string;
}

export interface GrupDashboard {
  programId: string;
  programNama: string;
  batchId: string | null;
  batchLabel: string | null;
  batchOrder: number | null;
  gender: Gender;
  halaqah: number;
  total: number;
  selesai: number;
  rata: number | null;
  bermasalah: number;
}

export interface BarisHalaqah {
  id: string;
  nama: string;
  /** "Ikhwan · HITS Reguler Juni 2026 · M1" */
  sub: string;
  pengajar: string;
  total: number;
  selesai: number;
  rata: number | null;
  bermasalah: number;
  lahnTop: string;
}

export interface TotalDashboard {
  halaqah: number;
  peserta: number;
  selesai: number;
  rata: number | null;
  bermasalah: number;
}

export interface HasilDashboard {
  opsiProgram: OpsiPilih[];
  /** Kosong bila tak ada program terpilih atau program itu berangkatan tunggal. */
  opsiBatch: OpsiPilih[];
  /** Nilai batch yang benar-benar dipakai — '' bila query-string sudah basi. */
  batchTerpilih: string;
  grup: GrupDashboard[];
  halaqah: BarisHalaqah[];
  total: TotalDashboard;
  namaPeriode: string;
  /** false = mirror memang kosong; true tapi halaqah kosong = penyaringnya. */
  adaHalaqahSamaSekali: boolean;
}

// ── Fungsi murni (diuji di scripts/test-evaluasi-dashboard.ts) ──

/** Urutan anggota family: batch_order menaik, null paling depan, lalu id. */
function urutAnggota(a: BarisBatch, b: BarisBatch): number {
  const oa = a.batch_order ?? -1;
  const ob = b.batch_order ?? -1;
  return oa !== ob ? oa - ob : a.id.localeCompare(b.id);
}

/**
 * Satu opsi per family. Labelnya diambil dari anggota ber-batch_order terkecil
 * supaya deterministik ketika antar-angkatan ejaannya berbeda ("HITS Safar" vs
 * "HITS Safar (Batch Januari 2026)").
 */
export function susunOpsiProgram(batches: BarisBatch[]): OpsiPilih[] {
  const perFamily = new Map<string, BarisBatch[]>();
  for (const b of batches) {
    const arr = perFamily.get(b.family);
    if (arr) arr.push(b);
    else perFamily.set(b.family, [b]);
  }
  return Array.from(perFamily.entries())
    .map(([family, anggota]) => ({
      value: family,
      label: namaProgram([...anggota].sort(urutAnggota)[0].nama),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'id'));
}

/** Batch milik satu program. Kosong bila program itu hanya punya satu angkatan. */
export function susunOpsiBatch(batches: BarisBatch[], family: string): OpsiPilih[] {
  if (!family) return [];
  const anggota = batches.filter((b) => b.family === family);
  if (anggota.length < 2) return [];
  return [...anggota].sort(urutAnggota).map((b) => ({
    value: b.id,
    label: b.batch_label ?? namaProgram(b.nama),
  }));
}

/**
 * Batch yang benar-benar dipakai. Query-string yang tertinggal dari program
 * sebelumnya dibuang, supaya hasilnya bukan halaman kosong tanpa sebab.
 */
export function batchTerpakai(batches: BarisBatch[], program: string, batch: string): string {
  if (!batch) return '';
  const cakupan = program ? batches.filter((b) => b.family === program) : batches;
  return cakupan.some((b) => b.id === batch) ? batch : '';
}

/** batch_id yang lolos penyaring. null = tak ada pembatasan sama sekali. */
export function idBatchLolos(batches: BarisBatch[], program: string, batch: string): string[] | null {
  const dipakai = batchTerpakai(batches, program, batch);
  if (dipakai) return [dipakai];
  if (!program) return null;
  return batches.filter((b) => b.family === program).map((b) => b.id);
}

/** Urut baris ringkasan: nama program → batch_order → ikhwan sebelum akhwat. */
export function urutkanGrup(grup: GrupDashboard[]): GrupDashboard[] {
  return [...grup].sort((a, b) => {
    const p = a.programNama.localeCompare(b.programNama, 'id');
    if (p !== 0) return p;
    const oa = a.batchOrder ?? -1;
    const ob = b.batchOrder ?? -1;
    if (oa !== ob) return oa - ob;
    if (a.gender !== b.gender) return a.gender === 'ikhwan' ? -1 : 1;
    return 0;
  });
}

/**
 * Nama track untuk label periode. eval_config menyimpannya per gender, jadi saat
 * kedua gender ditampilkan bersama nama itu hanya dipakai bila keduanya sepakat —
 * kalau tidak, label netral, bukan nama salah satu gender yang menyesatkan.
 */
export function pilihNamaTrack(
  configs: Array<{ gender: string; nama_qn: string }>,
  gender: GenderFilter
): string {
  if (gender !== 'semua') {
    return configs.find((c) => c.gender === gender)?.nama_qn ?? 'Evaluasi QN';
  }
  const nama = Array.from(new Set(configs.map((c) => c.nama_qn)));
  if (nama.length === 1) return nama[0];
  if (nama.length === 0) return 'Evaluasi QN';
  return 'Evaluasi';
}

/** Baca penyaring dari query-string. Gender default = gender pemakai. */
export function bacaFilter(
  sp: { program?: string; batch?: string; gender?: string },
  genderPemakai: Gender
): FilterDashboard {
  const g = sp.gender;
  return {
    program: sp.program ?? '',
    batch: sp.batch ?? '',
    gender: g === 'ikhwan' || g === 'akhwat' || g === 'semua' ? g : genderPemakai,
  };
}

function labelBulan(): string {
  return new Date().toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

// ── Pemuat ──

interface SesiRow { id: string; halaqah_id: string; nomor_sesi: number }
interface NilaiRow extends Record<string, unknown> {
  sesi_id: string;
  peserta_id: string;
  skor: number;
  done: boolean;
}
interface Agg {
  selesai: number;
  skorSum: number;
  bermasalah: number;
  lahn: number[];
}

const NO_ID = ['00000000-0000-0000-0000-000000000000'];

export async function muatDashboard(f: FilterDashboard): Promise<HasilDashboard> {
  const { data: batchRaw } = await supabaseAdmin
    .from('eval_batch')
    .select('id, nama, family, batch_label, batch_order');
  const batches = (batchRaw ?? []) as BarisBatch[];

  const opsiProgram = susunOpsiProgram(batches);
  const batchTerpilih = batchTerpakai(batches, f.program, f.batch);
  const opsiBatch = susunOpsiBatch(batches, f.program);
  const idsLolos = idBatchLolos(batches, f.program, f.batch);
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const namaFamily = new Map(opsiProgram.map((o) => [o.value, o.label]));

  let qHalaqah = supabaseAdmin
    .from('eval_halaqah')
    .select('id, nama, gender, mustawa, level, pengajar_id, batch_id')
    .order('nama');
  if (f.gender !== 'semua') qHalaqah = qHalaqah.eq('gender', f.gender);
  if (idsLolos) qHalaqah = qHalaqah.in('batch_id', idsLolos.length ? idsLolos : NO_ID);
  const { data: halaqahRaw } = await qHalaqah;
  const halaqahList = (halaqahRaw ?? []) as Array<{
    id: string; nama: string; gender: Gender; mustawa: number | null;
    level: string | null; pengajar_id: string | null; batch_id: string | null;
  }>;

  // Membedakan "mirror memang kosong" dari "penyaringnya terlalu sempit".
  let adaHalaqahSamaSekali = halaqahList.length > 0;
  if (!adaHalaqahSamaSekali) {
    const { data: adaRaw } = await supabaseAdmin.from('eval_halaqah').select('id').limit(1);
    adaHalaqahSamaSekali = (adaRaw ?? []).length > 0;
  }

  const halaqahIds = halaqahList.map((h) => h.id);

  const { data: configRaw } = await supabaseAdmin.from('eval_config').select('gender, nama_qn');
  const namaTrack = pilihNamaTrack(
    (configRaw ?? []) as Array<{ gender: string; nama_qn: string }>,
    f.gender
  );

  const pengajarIds = Array.from(
    new Set(halaqahList.map((h) => h.pengajar_id).filter((x): x is string => !!x))
  );
  const { data: pengajarRaw } = await supabaseAdmin
    .from('eval_pengajar')
    .select('id, nama')
    .in('id', pengajarIds.length ? pengajarIds : NO_ID);
  const pengajarName = new Map(
    (pengajarRaw ?? []).map((p) => [p.id as string, p.nama as string])
  );

  const { data: pesertaRaw } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, halaqah_id')
    .in('halaqah_id', halaqahIds.length ? halaqahIds : NO_ID)
    .eq('aktif', true);
  const pesertaCount = new Map<string, number>();
  for (const p of pesertaRaw ?? []) {
    const hid = p.halaqah_id as string;
    pesertaCount.set(hid, (pesertaCount.get(hid) ?? 0) + 1);
  }

  const { data: sesiRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, halaqah_id, nomor_sesi')
    .in('halaqah_id', halaqahIds.length ? halaqahIds : NO_ID)
    .eq('jenis', 'qn');
  const sesiRows = (sesiRaw ?? []) as SesiRow[];
  const currentSesiByHalaqah = new Map<string, SesiRow>();
  for (const s of sesiRows) {
    const prev = currentSesiByHalaqah.get(s.halaqah_id);
    if (!prev || s.nomor_sesi > prev.nomor_sesi) currentSesiByHalaqah.set(s.halaqah_id, s);
  }
  const currentSesiIds = Array.from(currentSesiByHalaqah.values()).map((s) => s.id);
  const sesiToHalaqah = new Map(
    Array.from(currentSesiByHalaqah.entries()).map(([hid, s]) => [s.id, hid])
  );
  const maxSesiNo = sesiRows.reduce((a, s) => Math.max(a, s.nomor_sesi), 0);

  const { data: nilaiRaw } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select(
      'sesi_id, peserta_id, skor, done, ' +
        'jk_huruf, jk_harakat, jk_mad, jk_tasydid, kh_izhar, kh_idgham_bighunnah, kh_idgham_bilaghunnah, kh_idgham_mimi, kh_iqlab, kh_ikhfa_hakiki, kh_ikhfa_syafawi'
    )
    .in('sesi_id', currentSesiIds.length ? currentSesiIds : NO_ID);
  const nilaiRows = (nilaiRaw ?? []) as NilaiRow[];

  const aggByHalaqah = new Map<string, Agg>();
  for (const n of nilaiRows) {
    if (!n.done) continue;
    const hid = sesiToHalaqah.get(n.sesi_id);
    if (!hid) continue;
    let a = aggByHalaqah.get(hid);
    if (!a) {
      a = { selesai: 0, skorSum: 0, bermasalah: 0, lahn: new Array(ALL_LAHN.length).fill(0) };
      aggByHalaqah.set(hid, a);
    }
    const skor = Number(n.skor) || 0;
    a.selesai += 1;
    a.skorSum += skor;
    if (skor < AMBANG) a.bermasalah += 1;
    const counts = columnsToCounts(n);
    ALL_LAHN.forEach((d, i) => {
      a!.lahn[i] += counts[d.key] || 0;
    });
  }

  const topLahnLabel = (lahn: number[]): string => {
    let best = -1;
    let bestVal = 0;
    lahn.forEach((v, i) => {
      if (v > bestVal) { bestVal = v; best = i; }
    });
    return best >= 0 && bestVal > 0 ? ALL_LAHN[best].label : '—';
  };

  const grupMap = new Map<string, GrupDashboard>();
  const halaqah: BarisHalaqah[] = halaqahList.map((h) => {
    const total = pesertaCount.get(h.id) ?? 0;
    const a = aggByHalaqah.get(h.id);
    const selesai = a?.selesai ?? 0;
    const bermasalah = a?.bermasalah ?? 0;
    const b = h.batch_id ? batchById.get(h.batch_id) ?? null : null;
    const programId = b?.family ?? '';
    const programNama = (programId && namaFamily.get(programId)) || 'Tanpa program';
    const genderLabel = h.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
    const levelText = h.level ?? (h.mustawa != null ? `Mustawa ${h.mustawa}` : null);
    const asal = b?.batch_label ? `${programNama} ${b.batch_label}` : programNama;

    const kunci = `${h.batch_id ?? ''}|${h.gender}`;
    let g = grupMap.get(kunci);
    if (!g) {
      g = {
        programId, programNama,
        batchId: h.batch_id, batchLabel: b?.batch_label ?? null,
        batchOrder: b?.batch_order ?? null,
        gender: h.gender,
        halaqah: 0, total: 0, selesai: 0, rata: null, bermasalah: 0,
      };
      grupMap.set(kunci, g);
    }
    g.halaqah += 1;
    g.total += total;
    g.selesai += selesai;
    g.bermasalah += bermasalah;
    // rata dihitung ulang setelah semua halaqah terkumpul (lihat di bawah)
    g.rata = (g.rata ?? 0) + (a?.skorSum ?? 0);

    return {
      id: h.id,
      nama: h.nama,
      sub: [genderLabel, asal, levelText].filter(Boolean).join(' · '),
      pengajar: (h.pengajar_id && pengajarName.get(h.pengajar_id)) || '—',
      total,
      selesai,
      rata: a && a.selesai > 0 ? Math.round(a.skorSum / a.selesai) : null,
      bermasalah,
      lahnTop: a ? topLahnLabel(a.lahn) : '—',
    };
  });

  // g.rata sementara menampung jumlah skor; ubah jadi rata-rata sebenarnya.
  for (const g of grupMap.values()) {
    g.rata = g.selesai > 0 ? Math.round((g.rata ?? 0) / g.selesai) : null;
  }

  const totalPeserta = halaqah.reduce((a, r) => a + r.total, 0);
  const totalSelesai = halaqah.reduce((a, r) => a + r.selesai, 0);
  const totalBermasalah = halaqah.reduce((a, r) => a + r.bermasalah, 0);
  const skorDone = nilaiRows.filter((n) => n.done).map((n) => Number(n.skor) || 0);
  const rataAll = skorDone.length
    ? Math.round(skorDone.reduce((a, b2) => a + b2, 0) / skorDone.length)
    : null;

  return {
    opsiProgram,
    opsiBatch,
    batchTerpilih,
    grup: urutkanGrup(Array.from(grupMap.values())),
    halaqah,
    total: {
      halaqah: halaqahList.length,
      peserta: totalPeserta,
      selesai: totalSelesai,
      rata: rataAll,
      bermasalah: totalBermasalah,
    },
    namaPeriode:
      maxSesiNo > 0
        ? `${namaTrack} Sesi ${maxSesiNo} · ${labelBulan()}`
        : `${namaTrack} · ${labelBulan()}`,
    adaHalaqahSamaSekali,
  };
}
```

- [ ] **Step 5: Jalankan uji untuk memastikan lulus**

Run: `npm run test-evaluasi-dashboard`
Expected: seluruh baris `ok`, diakhiri `semua lulus`, exit 0.

- [ ] **Step 6: Verifikasi lint**

Run: `npx eslint src/lib/evaluasi-dashboard.ts scripts/test-evaluasi-dashboard.ts`
Expected: bersih. Perhatikan `a!.lahn[i]` di dalam `forEach` — kalau
`@typescript-eslint/no-non-null-assertion` menyalakannya, ganti dengan menyalin
`const agg = a;` sebelum `forEach` lalu pakai `agg.lahn[i]`.

- [ ] **Step 7: Verifikasi typecheck**

Run: `npm run typecheck`
Expected: berkas ini bersih. Kalau muncul error `Property 'family' does not exist
on type 'EvalBatch'`, berarti Task 1 belum mendarat — catat di laporan dan lanjut,
jangan mengubah `src/types/db.ts` (itu milik Task 1). Error di
`src/app/evaluasi/koordinator/page.tsx` juga diabaikan (milik Task 5).

- [ ] **Step 8: Commit**

```bash
git add src/lib/evaluasi-dashboard.ts scripts/test-evaluasi-dashboard.ts package.json
git commit -m "feat(evaluasi): pemuat data dashboard dengan penyaring

Seluruh kueri dan agregasi dashboard pindah dari page.tsx yang sudah 425
baris ke satu pemuat, dengan penyaring program, batch, dan gender.

Penyusun opsi dan pemilihan batch dibuat sebagai fungsi murni agar bisa
diuji tanpa basis data. Batch dari query-string yang tak cocok dengan
program terpilih diabaikan alih-alih menghasilkan halaman kosong."
```

---

## Task 5: Halaman `/evaluasi/koordinator`

**Files:**
- Modify: `src/app/evaluasi/koordinator/page.tsx` (tulis ulang; sekarang 425 baris)

**Latar:** Halaman ini memuat kueri, agregasi, dan render sekaligus. Task 4
memindahkan dua yang pertama ke `src/lib/evaluasi-dashboard.ts`. Task ini
menyisakan render, plus bar penyaring dan tabel ringkasan baru.

**Yang tidak boleh berubah:** guard `requireOneOfRoles(['koordinator',
'koordinator_ketua_kelas'])`, tombol Pengaturan hanya untuk `koordinator`,
tombol cetak, dan bentuk keempat kartu statistik.

**Catatan akses:** penyaring gender terbuka untuk kedua role yang bisa membuka
halaman ini — keputusan pemilik produk, diambil sadar. Default tetap gender
pemakai, sehingga lintas-gender adalah pilihan eksplisit.

- [ ] **Step 1: Tulis ulang halaman**

Ganti seluruh isi `src/app/evaluasi/koordinator/page.tsx`:

```tsx
import Link from 'next/link';
import { requireOneOfRoles } from '@/lib/session';
import { AMBANG } from '@/lib/evaluasi';
import { bacaFilter, muatDashboard } from '@/lib/evaluasi-dashboard';
import { PrintButton } from '@/components/PrintButton';
import { QueryNavSelect } from '@/components/QueryNavSelect';

export const dynamic = 'force-dynamic';

export default async function KoordinatorEvaluasiPage({
  searchParams,
}: {
  searchParams: { program?: string; batch?: string; gender?: string };
}) {
  // Rekap dibuka juga untuk koordinator ketua kelas — mereka memantau halaqah
  // yang sama; pengaturan tetap milik koordinator.
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);
  const bolehPengaturan = session.role === 'koordinator';

  const filter = bacaFilter(searchParams, session.gender);
  const d = await muatDashboard(filter);

  const adaFilter = !!(filter.program || d.batchTerpilih || filter.gender !== session.gender);
  const tampilkanKolomGender = filter.gender === 'semua';
  const tampilkanRingkasan = d.grup.length > 1;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="eval-print-wrap" style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 40px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="t-h1" style={{ fontSize: 20 }}>
              Dashboard Koordinator
            </div>
            <div className="t-small" style={{ marginTop: 2 }}>
              {session.name} · {d.total.halaqah} halaqah · {d.namaPeriode}
            </div>
          </div>
          <div className="no-print" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {bolehPengaturan && (
              <Link
                href="/evaluasi/koordinator/pengaturan"
                className="btn btn-ghost btn-sm"
                style={{ height: 40, padding: '0 14px', textDecoration: 'none' }}
              >
                ⚙ Pengaturan
              </Link>
            )}
            <PrintButton label="Unduh rekap PDF" />
          </div>
        </div>

        {/* Bar penyaring */}
        <div
          className="no-print"
          style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <QueryNavSelect
            param="program"
            value={filter.program}
            options={d.opsiProgram}
            ariaLabel="Pilih program"
            allLabel="Semua program"
          />
          {d.opsiBatch.length > 0 && (
            <QueryNavSelect
              param="batch"
              value={d.batchTerpilih}
              options={d.opsiBatch}
              ariaLabel="Pilih batch"
              allLabel="Semua batch"
            />
          )}
          {/* Nilai kosong berarti "gender saya", bukan "semua" — karena itu
              "semua" harus jadi opsi eksplisit, dan GenderNavSelect (yang
              memaknai kosong sebagai semua) tak dipakai di sini. */}
          <QueryNavSelect
            param="gender"
            value={filter.gender}
            options={[
              { value: 'ikhwan', label: 'Ikhwan' },
              { value: 'akhwat', label: 'Akhwat' },
              { value: 'semua', label: 'Ikhwan & Akhwat' },
            ]}
            ariaLabel="Pilih gender"
          />
          {adaFilter && (
            <Link href="/evaluasi/koordinator" className="t-small" style={{ marginLeft: 4 }}>
              Reset
            </Link>
          )}
        </div>

        {d.halaqah.length === 0 ? (
          <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {d.adaHalaqahSamaSekali ? 'Tak ada halaqah yang cocok' : 'Belum ada halaqah binaan'}
            </div>
            <p className="t-small" style={{ margin: 0 }}>
              {d.adaHalaqahSamaSekali ? (
                <>
                  Tak ada halaqah yang cocok dengan penyaring ini.{' '}
                  <Link href="/evaluasi/koordinator">Reset penyaring</Link>.
                </>
              ) : (
                'Belum ada halaqah yang tersinkron ke sistem evaluasi.'
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Kartu statistik */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{d.total.halaqah}</div>
                <div className="t-small" style={{ marginTop: 4 }}>Halaqah binaan</div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
                  {d.total.selesai}
                  <span style={{ fontSize: 15, color: 'var(--muted-2)' }}>/{d.total.peserta}</span>
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>Peserta sudah dinilai</div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26, fontWeight: 700, lineHeight: 1,
                    color: d.total.rata == null ? 'var(--muted-2)' : 'oklch(0.40 0.10 150)',
                  }}
                >
                  {d.total.rata == null ? '—' : d.total.rata}
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>Rata-rata skor</div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26, fontWeight: 700, lineHeight: 1,
                    color: d.total.bermasalah > 0 ? 'oklch(0.46 0.14 25)' : 'var(--ink)',
                  }}
                >
                  {d.total.bermasalah}
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>Peserta perlu perhatian</div>
              </div>
            </div>

            {/* Ringkasan per program × batch × gender. Disembunyikan bila cuma
                satu grup — tak menambah apa pun di atas keempat kartu. */}
            {tampilkanRingkasan && (
              <div className="card-flat" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                <div className="table-scroll">
                  <table className="k-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th>Batch</th>
                        {tampilkanKolomGender && <th>Gender</th>}
                        <th style={{ textAlign: 'center' }}>Halaqah</th>
                        <th style={{ textAlign: 'center' }}>Kelengkapan</th>
                        <th style={{ textAlign: 'center' }}>Rata-rata</th>
                        <th style={{ textAlign: 'center' }}>Bermasalah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.grup.map((g) => (
                        <tr key={`${g.batchId ?? ''}|${g.gender}`}>
                          <td className="nm">{g.programNama}</td>
                          <td style={{ color: 'var(--ink-2)' }}>{g.batchLabel ?? '—'}</td>
                          {tampilkanKolomGender && (
                            <td style={{ color: 'var(--ink-2)' }}>
                              {g.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                            </td>
                          )}
                          <td style={{ textAlign: 'center' }}>{g.halaqah}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {g.selesai}/{g.total}
                          </td>
                          <td
                            style={{
                              textAlign: 'center', fontWeight: 700,
                              color:
                                g.rata == null
                                  ? 'var(--muted-2)'
                                  : g.rata >= AMBANG
                                    ? 'oklch(0.40 0.10 150)'
                                    : 'oklch(0.46 0.14 25)',
                            }}
                          >
                            {g.rata == null ? '—' : g.rata}
                          </td>
                          <td
                            style={{
                              textAlign: 'center',
                              color: g.bermasalah > 0 ? 'oklch(0.46 0.14 25)' : 'var(--line-2)',
                            }}
                          >
                            {g.bermasalah > 0 ? g.bermasalah : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tabel halaqah */}
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-scroll">
                <table className="k-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Halaqah</th>
                      <th>Pengajar</th>
                      <th>Kelengkapan</th>
                      <th style={{ textAlign: 'center' }}>Rata-rata</th>
                      <th style={{ textAlign: 'center' }}>Bermasalah</th>
                      <th>Lahn tersering</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.halaqah.map((h) => {
                      const progPct = h.total > 0 ? Math.round((h.selesai / h.total) * 100) : 0;
                      const progColor =
                        h.selesai === h.total && h.total > 0
                          ? 'oklch(0.58 0.09 165)'
                          : h.selesai === 0
                            ? 'var(--line-2)'
                            : 'oklch(0.78 0.10 80)';
                      const rataColor =
                        h.rata == null
                          ? 'var(--muted-2)'
                          : h.rata >= AMBANG
                            ? 'oklch(0.40 0.10 150)'
                            : 'oklch(0.46 0.14 25)';
                      const showIngatkan = h.selesai < h.total;
                      return (
                        <tr key={h.id}>
                          <td>
                            <div className="nm">{h.nama}</div>
                            <div className="sub">{h.sub}</div>
                          </td>
                          <td style={{ color: 'var(--ink-2)' }}>{h.pengajar}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 64, height: 6, borderRadius: 3,
                                  background: 'var(--line)', overflow: 'hidden',
                                }}
                              >
                                <div style={{ height: '100%', background: progColor, width: `${progPct}%` }} />
                              </div>
                              <span className="t-small" style={{ whiteSpace: 'nowrap' }}>
                                {h.selesai}/{h.total}
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: rataColor }}>
                            {h.rata == null ? '—' : h.rata}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {h.bermasalah > 0 ? (
                              <span
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  minWidth: 22, height: 22, borderRadius: 999,
                                  background: 'oklch(0.96 0.03 25)', color: 'oklch(0.46 0.14 25)',
                                  fontSize: 12, fontWeight: 700,
                                }}
                              >
                                {h.bermasalah}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--line-2)' }}>—</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--muted)' }}>{h.lahnTop}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {showIngatkan && (
                              <button
                                type="button"
                                className="no-print"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  height: 30, padding: '0 10px', borderRadius: 6,
                                  fontSize: 12, fontWeight: 600, border: 'none',
                                  background: 'oklch(0.70 0.13 75)', color: '#fff',
                                  cursor: 'pointer', marginRight: 6,
                                }}
                              >
                                Ingatkan
                              </button>
                            )}
                            <Link
                              href={`/evaluasi/koordinator/${h.id}`}
                              className="btn btn-ghost btn-sm"
                              style={{ height: 30, padding: '0 10px', fontSize: 12, textDecoration: 'none' }}
                            >
                              Detail
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verifikasi typecheck**

Run: `npm run typecheck`
Expected: PASS bila Task 1, 3, dan 4 sudah mendarat. Kalau belum, error yang
muncul hanya boleh berupa "modul `@/lib/evaluasi-dashboard` tak ditemukan" atau
export yang belum ada — catat di laporan dan lanjut, jangan membuat berkas milik
task lain.

Kalau `searchParams` ditolak karena harus `Promise` (Next.js 15+), cek dulu pola
di `src/app/hits/koordinator/indisipliner/page.tsx:55-57` dan samakan dengan yang
dipakai repo ini — jangan menebak.

- [ ] **Step 3: Verifikasi lint**

Run: `npx eslint src/app/evaluasi/koordinator/page.tsx`
Expected: bersih.

- [ ] **Step 4: Commit**

```bash
git add src/app/evaluasi/koordinator/page.tsx
git commit -m "feat(evaluasi): penyaring program, batch, dan gender di dashboard

Halaman jadi render saja; kueri dan agregasi pindah ke evaluasi-dashboard.

Gender tak lagi terkunci ke gender sesi, tapi defaultnya tetap gender
pemakai sehingga lintas-gender adalah pilihan eksplisit. Tabel ringkasan
per program x batch x gender muncul hanya bila ada lebih dari satu grup.

Baris sub tiap halaqah kini memuat asal program dan batch, supaya tak
jadi anonim ketika penyaring dilepas."
```

---

## Integrasi (orkestrator, setelah kelima task selesai)

- [ ] **Step 1: Verifikasi menyeluruh**

Run: `npm run typecheck && npm run lint && npm run test-evaluasi && npm run test-hilmihs && npm run test-evaluasi-dashboard`
Expected: semuanya PASS, tak ada `FAIL`.

- [ ] **Step 2: Uji manual di dev**

Run: `npm run dev`, lalu buka `/evaluasi/koordinator` sebagai koordinator dan periksa:

| Yang diperiksa | Harapan |
|---|---|
| Muat awal tanpa query-string | Gender = gender pemakai, semua program, tak ada tautan Reset |
| Pilih program berangkatan banyak | Dropdown batch muncul, terurut Januari → April → Juni |
| Pilih program berangkatan tunggal (DPQ) | Dropdown batch **tidak** muncul |
| `?program=dpq&batch=hits-regular-apr` | Batch basi diabaikan; dropdown batch tak muncul; hasil = DPQ |
| `?gender=semua` | Kolom Gender muncul di ringkasan; kedua gender terdaftar |
| Filter sampai nol hasil | Pesan "Tak ada halaqah yang cocok" + tautan Reset |
| Hanya satu grup tersisa | Tabel ringkasan tersembunyi |
| Cetak PDF | Bar penyaring hilang; ringkasan dan detail ikut tercetak |

- [ ] **Step 3: Rilis** — ikuti urutan di spec, bagian "Urutan rilis":
  1. DDL 0073 ke produksi lebih dulu, per-statement lewat `/api/admin/db`
     (buang `begin;`/`commit;` — endpoint membungkus transaksinya sendiri).
  2. Deploy kode (push ke remote **`maheer`**, bukan `origin`).
  3. `/evaluasi/koordinator/sync` → pull → setujui enam baris `batch.update`
     (`hits-regular`, `hits-regular-apr`, `hits-regular-jan`, `hits-safar`,
     `hits-safar-jan`, `tafm-laz`).

Sebelum langkah 3, HITS Reguler tampil sebagai tiga program terpisah. Itu keadaan
antara yang disengaja.
