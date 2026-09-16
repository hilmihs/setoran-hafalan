# Impor Ketersediaan, Dashboard Koordinator & Aturan 21 September — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koordinator dapat mengimpor ketersediaan pengajar dari xlsx dan membaca keadaan dua periode (September, Oktober) dalam dashboard yang jelas, dengan aturan pembentukan halaqah yang sudah dibetulkan untuk sinkronisasi pertama Senin 21 September 2026.

**Architecture:** Tiga fase berurutan dalam modul `ks_*` yang sudah ada. Fase A mengubah skema (satu migrasi `0077`) dan aturan di `src/lib/ketersediaan-*.ts`, diuji dengan uji murni dan uji integrasi PGlite yang memakai migrasi asli. Fase B menambah pembaca xlsx murni, pencocok pengajar murni, dan penulis transaksional. Fase C memecah `/ketersediaan/koordinator` menjadi dashboard bertab berbasis `?periode=&tab=&g=`, dengan perhitungan murni terpisah dari komponen.

**Tech Stack:** Next.js 14 App Router (server components + server actions), TypeScript ES2022, `node-postgres` lewat shim `supabaseAdmin` dan `getPool()`, `exceljs`, `recharts` 2, PGlite + `pglite-socket` untuk uji integrasi, `tsx` untuk skrip uji.

**Spec:** `docs/superpowers/specs/2026-09-16-ketersediaan-impor-dashboard-design.md`

---

## Aturan kerja untuk seluruh rencana

- Semua perintah dijalankan dari root worktree:
  `/data/Downloads/04_Dev-Projects/setoran-hafalan-skeleton/setoran-hafalan/.claude/worktrees/impor-ketersediaan`
- Branch: `feat/ketersediaan-impor-dashboard` (dibuat dari `maheer/main` = yang ter-deploy).
- **Jangan menjalankan `npm run db`, `npm run lint`, atau apa pun yang menulis ke produksi.** `npm run db` menembak produksi; `npm run lint` menggantung.
- Gerbang verifikasi: `npm run typecheck`, `npm run test-ketersediaan`, `npm run test-ketersediaan-impor`, `npm run build`.
- Bahasa: nama, komentar, dan teks UI dalam Bahasa Indonesia, mengikuti berkas di sekitarnya.
- Berkas xlsx asli (`docs/KETERSEDIAAN PENGAJAR HITS '26.xlsx`) berisi nama dan nomor WA orang — **jangan pernah di-commit**. Uji memakai berkas tiruan yang dibuat di dalam skrip.
- Commit tiap akhir task, pesan conventional-commits berbahasa Indonesia, diakhiri:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## Peta berkas

| Berkas | Tindakan | Tanggung jawab |
|---|---|---|
| `package.json` | ubah | skrip uji `test-ketersediaan` (NODE_PATH) dan `test-ketersediaan-impor` |
| `supabase/migrations/0077_ketersediaan_impor_aturan.sql` | baru | prioritas per jam, sumber pengisian, pita 2 kelompok, status `diganti`, pertemuan per jenjang |
| `scripts/emit-ketersediaan-sql.ts` | ubah | ikut mencetak `0077` untuk DDL produksi |
| `src/types/db.ts` | ubah | tipe `ks_*` mengikuti migrasi |
| `src/lib/ketersediaan-slot.ts` | ubah | `pitaUmur` dua kelompok; `masihBerjalanPada` |
| `src/lib/ketersediaan-pendaftar.ts` | ubah | `identitasPendaftar`, kiriman terakhir → `diganti` |
| `src/lib/ketersediaan-bentrok.ts` | ubah | `tanggalSelesaiHalaqah`; halaqah selesai tak mengunci |
| `src/lib/ketersediaan-alokasi.ts` | ubah | `peringkat(pengajarId, slotId)` |
| `src/lib/ketersediaan-jalankan.ts` | ubah | prioritas per jam, acuan tanggal, pengecualian lintas periode |
| `src/lib/ketersediaan-konfirmasi.ts` | ubah | `cariPengganti` memakai prioritas per jam |
| `src/lib/ketersediaan-lintas-periode.ts` | baru | identitas yang sudah dialokasikan di periode lain |
| `src/lib/ketersediaan-permintaan.ts` | ubah | `terpakai_lain`, definisi pengajar tersedia disamakan |
| `src/lib/ketersediaan-pertemuan.ts` | ubah | `jumlahPertemuanUntuk` |
| `src/lib/tilawah/push.ts` | ubah | jumlah pertemuan sesuai jenjang |
| `src/lib/tilawah/client.ts` | ubah | baca `TILAWAH_*` atau `ENV_TILAWAH_*` |
| `azure-pipelines.yml` | ubah | petakan `ENV_TILAWAH_*` |
| `src/app/ketersediaan/pengajar/{actions.ts,page.tsx}` | ubah | acuan tanggal periode untuk cek bentrok |
| `src/lib/ketersediaan-impor-xlsx.ts` | baru | baca xlsx ketersediaan (murni) |
| `src/lib/ketersediaan-impor-cocok.ts` | baru | cocokkan baris ke akun pengajar (murni) |
| `src/lib/ketersediaan-impor.ts` | baru | pratinjau + simpan transaksional |
| `src/app/ketersediaan/koordinator/impor/actions.ts` | baru | server action unggah/pratinjau/simpan |
| `src/app/ketersediaan/koordinator/PanelImpor.tsx` | baru | UI impor |
| `src/lib/ketersediaan-dasbor.ts` | baru | hitungan dashboard murni (baris jam, peta, arus) |
| `src/app/ketersediaan/koordinator/data.ts` | baru | pemuat data dashboard (dipindah dari page + baru) |
| `src/app/ketersediaan/koordinator/dasbor/navigasi.ts` | baru | tipe tab/gender + `tautanDasbor` |
| `src/app/ketersediaan/koordinator/dasbor/KepalaDasbor.tsx` | baru | periode, saring gender, tab |
| `src/app/ketersediaan/koordinator/dasbor/TabRingkasan.tsx` | baru | angka + perlu tindakan + peta |
| `src/app/ketersediaan/koordinator/dasbor/PetaKekurangan.tsx` | baru | heatmap hari × jam |
| `src/app/ketersediaan/koordinator/dasbor/TabJam.tsx` | baru | papan jam |
| `src/app/ketersediaan/koordinator/dasbor/DaftarPengajar.tsx` | baru | tabel pengajar + cari (client) |
| `src/app/ketersediaan/koordinator/dasbor/ArusPendaftarChart.tsx` | baru | garis kumulatif pendaftar (client) |
| `src/app/ketersediaan/koordinator/page.tsx` | tulis ulang | rakit dashboard bertab |
| `src/app/ketersediaan/koordinator/PanelPeriode.tsx` | ubah | `PeriodeBaru` diekspor; dua angka pertemuan |
| `src/app/ketersediaan/koordinator/actions.ts` | ubah | `ubahAturanPeriode` dua angka pertemuan; `setujuiUsulan` cek lintas periode |
| `src/app/globals.css` | ubah | kelas `.ks-*` untuk dashboard |
| `scripts/test-ketersediaan.ts` | ubah | uji murni baru |
| `scripts/test-ketersediaan-impor.ts` | baru | uji integrasi PGlite |
| `scripts/test-tilawah.ts` | ubah | fixture periode memakai kolom pertemuan baru |

---

# Fase A — Skema & aturan

### Task 1: Skrip uji, migrasi `0077`, dan tipe

**Files:**
- Modify: `package.json` (baris `"test-ketersediaan"` ~63)
- Create: `supabase/migrations/0077_ketersediaan_impor_aturan.sql`
- Modify: `scripts/emit-ketersediaan-sql.ts:13-21`
- Modify: `src/types/db.ts` (`KsPeriode`, `KsPengisian`, `KsKetersediaan`, `KsPendaftarStatus`)

- [ ] **Step 1: Perbaiki skrip uji murni dan daftarkan uji integrasi**

`npm run test-ketersediaan` gagal hari ini dengan `MODULE_NOT_FOUND: server-only` karena tidak memakai shim. Di `package.json`, ganti baris:

```json
    "test-ketersediaan": "tsx scripts/test-ketersediaan.ts",
```

menjadi:

```json
    "test-ketersediaan": "NODE_PATH=./scripts/node-shims tsx scripts/test-ketersediaan.ts",
    "test-ketersediaan-impor": "NODE_PATH=./scripts/node-shims tsx scripts/test-ketersediaan-impor.ts",
```

- [ ] **Step 2: Pastikan uji murni hijau sebelum mengubah apa pun**

Run: `npm run test-ketersediaan`
Expected: baris terakhir `SEMUA LULUS`

- [ ] **Step 3: Tulis migrasi**

Create `supabase/migrations/0077_ketersediaan_impor_aturan.sql`:

```sql
-- 0077 — Ketersediaan: impor xlsx pengajar & aturan sinkronisasi 21 September 2026.
-- Rancangan: docs/superpowers/specs/2026-09-16-ketersediaan-impor-dashboard-design.md
--
-- Aman dijalankan di produksi karena seluruh tabel ks_* masih kosong (diperiksa
-- 16 Sep 2026): mengganti CHECK pita umur tidak menabrak baris lama.
-- Nama constraint diperiksa di produksi lewat pg_constraint.

begin;

-- Prioritas xlsx berlaku per jam, bukan per pengajar.
alter table ks_ketersediaan
  add column if not exists prioritas integer check (prioritas is null or prioritas > 0);

-- Impor ulang hanya boleh menimpa isian yang dulu datang dari impor.
alter table ks_pengisian
  add column if not exists sumber text not null default 'form'
  check (sumber in ('form', 'impor'));

-- Pita umur dua kelompok: sampai 45 tahun, dan 46 ke atas.
alter table ks_pendaftar drop constraint if exists ks_pendaftar_pita_umur_check;
alter table ks_pendaftar add constraint ks_pendaftar_pita_umur_check
  check (pita_umur in ('<=45', '46+'));
alter table ks_usulan drop constraint if exists ks_usulan_pita_umur_check;
alter table ks_usulan add constraint ks_usulan_pita_umur_check
  check (pita_umur in ('<=45', '46+'));

-- Kiriman formulir yang sudah digantikan kiriman lebih baru dari orang yang sama.
alter table ks_pendaftar drop constraint if exists ks_pendaftar_status_check;
alter table ks_pendaftar add constraint ks_pendaftar_status_check
  check (status in ('valid', 'ditahan', 'dialokasikan', 'batal', 'diganti'));

-- Jumlah pertemuan berbeda per jenjang. Kolom lama jumlah_pertemuan dibiarkan
-- dan tidak dibaca lagi; dihapus di migrasi berikutnya setelah rilis.
alter table ks_periode
  add column if not exists jumlah_pertemuan_dasar integer not null default 50
    check (jumlah_pertemuan_dasar between 0 and 200),
  add column if not exists jumlah_pertemuan_lanjutan integer not null default 26
    check (jumlah_pertemuan_lanjutan between 0 and 200);

commit;
```

- [ ] **Step 4: Sertakan `0077` di pencetak DDL produksi**

Di `scripts/emit-ketersediaan-sql.ts`, ganti blok `const BERKAS = [...]` menjadi:

```ts
const BERKAS = [
  '0063_ketersediaan_inti.sql',
  '0064_ketersediaan_pendaftar.sql',
  '0065_ketersediaan_alokasi.sql',
  '0066_ketersediaan_hilir.sql',
  '0067_ketersediaan_cascade.sql',
  '0072_ketersediaan_pertemuan.sql',
  '0071_ketersediaan_rekaman.sql',
  '0077_ketersediaan_impor_aturan.sql',
];
```

- [ ] **Step 5: Perbarui tipe**

Di `src/types/db.ts`, di dalam `interface KsPeriode`, ganti:

```ts
  /** Banyak pertemuan yang dibuat di CMS tilawah per halaqah. 0 = tidak membuat. */
  jumlah_pertemuan: number;
```

menjadi:

```ts
  /** Lama (0072). Tidak dibaca lagi — diganti dua kolom per jenjang di bawah. */
  jumlah_pertemuan: number;
  /** Pertemuan yang dibuat di CMS tilawah untuk halaqah HITS Dasar. 0 = tidak membuat. */
  jumlah_pertemuan_dasar: number;
  /** Pertemuan yang dibuat di CMS tilawah untuk halaqah HITS Lanjutan. 0 = tidak membuat. */
  jumlah_pertemuan_lanjutan: number;
```

Tepat di atas `export interface KsPengisian {`, tambahkan:

```ts
/** Asal isian: pengajar mengisi sendiri, atau diimpor koordinator dari xlsx. */
export type KsPengisianSumber = 'form' | 'impor';

```

Di dalam `interface KsPengisian`, setelah `terkunci: boolean;` tambahkan:

```ts
  sumber: KsPengisianSumber;
```

Di dalam `interface KsKetersediaan`, setelah `catatan: string | null;` tambahkan:

```ts
  /** Urutan prioritas pengajar di jam ini (1 = didahulukan). null = tidak diatur. */
  prioritas: number | null;
```

Ganti:

```ts
export type KsPendaftarStatus = 'valid' | 'ditahan' | 'dialokasikan' | 'batal';
```

menjadi:

```ts
/** `diganti` = kiriman formulir lama dari orang yang sama, digantikan kiriman terbarunya. */
export type KsPendaftarStatus = 'valid' | 'ditahan' | 'dialokasikan' | 'batal' | 'diganti';
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: keluar tanpa galat

- [ ] **Step 7: Commit**

```bash
git add package.json supabase/migrations/0077_ketersediaan_impor_aturan.sql scripts/emit-ketersediaan-sql.ts src/types/db.ts
git commit -m "feat(ketersediaan): migrasi 0077 — prioritas per jam, sumber impor, pita 2 kelompok, status diganti, pertemuan per jenjang

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Pita umur dua kelompok

**Files:**
- Modify: `src/types/db.ts` (`KsPitaUmur`, `KS_PITA_UMUR`)
- Modify: `src/lib/ketersediaan-slot.ts:276-282`
- Test: `scripts/test-ketersediaan.ts:175-177` dan fixture pita di baris 203–259

- [ ] **Step 1: Ubah uji dulu**

Di `scripts/test-ketersediaan.ts`, ganti tiga baris:

```ts
eq(pitaUmur(17), '<=17', 'pita 17');
eq(pitaUmur(18), '18-25', 'pita 18');
eq(pitaUmur(46), '46+', 'pita 46');
```

menjadi:

```ts
eq(pitaUmur(15), '<=45', 'pita 15 ikut kelompok pertama');
eq(pitaUmur(45), '<=45', 'pita 45 masih kelompok pertama');
eq(pitaUmur(46), '46+', 'pita 46');
```

Lalu ganti seluruh literal pita lama pada fixture:

```bash
sed -i "s/'18-25'/'<=45'/g; s/'26-35'/'46+'/g" scripts/test-ketersediaan.ts
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan`
Expected: `FAIL pita 15 ikut kelompok pertama` (dan kegagalan tipe tidak menghentikan tsx)

- [ ] **Step 3: Ubah tipe dan fungsi**

Di `src/types/db.ts` ganti:

```ts
export type KsPitaUmur = '<=17' | '18-25' | '26-35' | '36-45' | '46+';

export const KS_PITA_UMUR: KsPitaUmur[] = ['<=17', '18-25', '26-35', '36-45', '46+'];
```

menjadi:

```ts
/** Dua kelompok umur (keputusan 16 Sep 2026). Pendaftar 15–17 tahun ikut kelompok pertama. */
export type KsPitaUmur = '<=45' | '46+';

export const KS_PITA_UMUR: KsPitaUmur[] = ['<=45', '46+'];
```

Di `src/lib/ketersediaan-slot.ts` ganti seluruh fungsi `pitaUmur`:

```ts
export function pitaUmur(umur: number): KsPitaUmur {
  if (umur <= 17) return '<=17';
  if (umur <= 25) return '18-25';
  if (umur <= 35) return '26-35';
  if (umur <= 45) return '36-45';
  return '46+';
}
```

menjadi:

```ts
/**
 * Dua kelompok saja. Lima pita lama membuat kelompok jarang genap 12 orang:
 * pada data 16 Sep 2026 ikhwan hanya membentuk 11 halaqah dengan lima pita,
 * 19 dengan dua pita, dari pengajar dan pendaftar yang sama.
 */
export function pitaUmur(umur: number): KsPitaUmur {
  return umur <= 45 ? '<=45' : '46+';
}
```

- [ ] **Step 4: Jalankan uji dan typecheck**

Run: `npm run test-ketersediaan && npm run typecheck`
Expected: `SEMUA LULUS`, typecheck tanpa galat

- [ ] **Step 5: Commit**

```bash
git add src/types/db.ts src/lib/ketersediaan-slot.ts scripts/test-ketersediaan.ts
git commit -m "feat(ketersediaan): pita umur jadi dua kelompok (<=45, 46+)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Identitas pendaftar & kiriman terakhir

**Files:**
- Modify: `src/lib/ketersediaan-pendaftar.ts` (fungsi baru, `BarisSiap`, `saring`, `HasilTarik`, `tarikSumber`)
- Test: `scripts/test-ketersediaan.ts`

- [ ] **Step 1: Tulis uji yang gagal**

Di `scripts/test-ketersediaan.ts`, ganti baris import:

```ts
import { bacaTanggal, deteksiFormatTanggal } from '@/lib/ketersediaan-pendaftar';
```

menjadi:

```ts
import {
  bacaTanggal,
  deteksiFormatTanggal,
  identitasPendaftar,
  saring,
  type BarisMentah,
} from '@/lib/ketersediaan-pendaftar';
```

Ganti `import type { KsHariIdx } from '@/types/db';` menjadi:

```ts
import type { KsHariIdx, KsSlot } from '@/types/db';
```

Tepat sebelum baris `console.log(failed === 0 ? '\nSEMUA LULUS' : ...` tambahkan:

```ts
// ── Identitas & kiriman ulang ──────────────────────────────────────────────
console.log('\n# kiriman ulang formulir');

eq(identitasPendaftar('0812-3456-7890', '  Siti   Aminah '), '81234567890|siti aminah', 'identitas: nomor & nama dinormalkan');
eq(identitasPendaftar('6281234567890', 'SITI AMINAH'), '81234567890|siti aminah', 'identitas: 62 dan huruf besar setara');
eq(identitasPendaftar(null, 'Siti'), null, 'identitas: tanpa nomor → null');

const slotUji = {
  id: 'SL',
  periode_id: 'P',
  kelompok: 'akhwat',
  mode: 'online',
  label: 'Senin & Rabu 20:00 - 21:30 WIB',
  hari: ['Senin', 'Rabu'],
  hari_idx: [0, 2],
  waktu_mulai: '20:00',
  waktu_selesai: '21:30',
  lokasi: null,
  aktif: true,
  urutan: 0,
  created_at: '',
  updated_at: '',
} as KsSlot;

const kiriman = (nama: string, wa: string, waktu: string): BarisMentah => ({
  nama,
  wa,
  tanggal_lahir: null,
  umur_isian: 30,
  gender: 'akhwat',
  level: 'HITS Dasar',
  slot_label_raw: 'Online Senin & Rabu 20:00 - 21:30 WIB',
  rekaman_url: null,
  didaftar_pada: waktu,
  kunci: `${wa}-${waktu}`,
});

const ulang = saring(
  [
    kiriman('Siti Aminah', '081234567890', '2026-09-09T03:00:00.000Z'),
    kiriman('siti  aminah', '6281234567890', '2026-09-10T03:00:00.000Z'),
    kiriman('Rahma', '081234567890', '2026-09-09T04:00:00.000Z'),
  ],
  [slotUji],
  new Date('2026-09-16T05:00:00Z')
);
eq(ulang.map((b) => b.status), ['diganti', 'valid', 'valid'], 'kiriman lama diganti, sekeluarga tetap sah');
eq(ulang[0].alasan_ditahan, [], 'baris diganti tidak membawa alasan tertahan');

const sudahDapat = saring(
  [kiriman('Siti Aminah', '081234567890', '2026-09-12T03:00:00.000Z')],
  [slotUji],
  new Date('2026-09-16T05:00:00Z'),
  { identitasDialokasikan: new Set(['81234567890|siti aminah']) }
);
eq(sudahDapat[0].status, 'diganti', 'identitas yang sudah dialokasikan: kiriman lain diganti');
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan`
Expected: gagal — `identitasPendaftar is not a function` atau status `ditahan` karena nomor ganda

- [ ] **Step 3: Tambah fungsi identitas**

Di `src/lib/ketersediaan-pendaftar.ts`, tepat setelah fungsi `normalWa` tambahkan:

```ts
/** Nama untuk dibandingkan: huruf kecil, tanpa tanda diakritik, spasi dirapatkan. */
export function namaNormal(nama: string): string {
  return nama
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Identitas satu pendaftar: nomor WA ternormalisasi + nama ternormalisasi.
 *
 * Bukan nomor saja: satu nomor lazim dipakai sekeluarga (ibu mendaftarkan
 * anak-anaknya), dan mereka orang yang berbeda. Bukan juga kunci baris sheet:
 * kiriman ulang dari orang yang sama menghasilkan timestamp baru.
 */
export function identitasPendaftar(wa: string | null | undefined, nama: string): string | null {
  const w = normalWa(wa);
  const n = namaNormal(nama ?? '');
  if (!w || !n) return null;
  return `${w}|${n}`;
}
```

- [ ] **Step 4: Status `diganti` di `BarisSiap`**

Di `interface BarisSiap`, ganti:

```ts
  status: 'valid' | 'ditahan';
```

menjadi:

```ts
  status: 'valid' | 'ditahan' | 'diganti';
```

- [ ] **Step 5: Ubah `saring`**

Ganti tanda tangan:

```ts
export function saring(
  baris: readonly BarisMentah[],
  slots: readonly KsSlot[],
  sekarang: Date
): BarisSiap[] {
```

menjadi:

```ts
export function saring(
  baris: readonly BarisMentah[],
  slots: readonly KsSlot[],
  sekarang: Date,
  opts: {
    /** Identitas yang barisnya sudah dialokasikan — semua kiriman lainnya diganti. */
    identitasDialokasikan?: ReadonlySet<string>;
  } = {}
): BarisSiap[] {
```

Ganti blok penghitung nomor ganda:

```ts
  // Nomor ganda ditentukan atas seluruh tarikan, bukan per baris.
  const hitungWa = new Map<string, number>();
  for (const b of baris) {
    const n = normalWa(b.wa);
    if (n) hitungWa.set(n, (hitungWa.get(n) ?? 0) + 1);
  }

  const out: BarisSiap[] = [];
  for (const b of baris) {
    const alasan: string[] = [];

    const wa = normalWa(b.wa);
    if (!wa) alasan.push('Nomor WhatsApp kosong atau tidak sah');
    else if ((hitungWa.get(wa) ?? 0) > 1) alasan.push('Nomor WhatsApp dipakai lebih dari satu pendaftar');
```

menjadi:

```ts
  // Kiriman ulang: satu orang yang mengisi formulir berkali-kali hanya diwakili
  // kiriman TERBARU — aturan yang sama dengan formulir pengajar. Nomor yang sama
  // dengan nama berbeda (sekeluarga) bukan kiriman ulang.
  const terbaru = new Map<string, number>();
  for (let i = 0; i < baris.length; i++) {
    const id = identitasPendaftar(baris[i].wa, baris[i].nama);
    if (!id) continue;
    const j = terbaru.get(id);
    if (j === undefined || (baris[i].didaftar_pada ?? '') >= (baris[j].didaftar_pada ?? '')) {
      terbaru.set(id, i);
    }
  }

  const out: BarisSiap[] = [];
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i];
    const alasan: string[] = [];

    const identitas = identitasPendaftar(b.wa, b.nama);
    const diganti =
      identitas !== null &&
      (Boolean(opts.identitasDialokasikan?.has(identitas)) || terbaru.get(identitas) !== i);

    const wa = normalWa(b.wa);
    if (!wa) alasan.push('Nomor WhatsApp kosong atau tidak sah');
```

Di bagian akhir `out.push({...})` dalam `saring`, ganti dua baris:

```ts
      status: alasan.length === 0 ? 'valid' : 'ditahan',
      alasan_ditahan: alasan,
```

menjadi:

```ts
      status: diganti ? 'diganti' : alasan.length === 0 ? 'valid' : 'ditahan',
      alasan_ditahan: diganti ? [] : alasan,
```

- [ ] **Step 6: Ubah `HasilTarik` dan `tarikSumber`**

Di `interface HasilTarik`, setelah `ditahan: number;` tambahkan:

```ts
  /** Kiriman lama yang digantikan kiriman terbaru dari orang yang sama. */
  diganti: number;
```

Di `tarikSumber`, pada objek awal `hasil`, setelah `ditahan: 0,` tambahkan `diganti: 0,`.

Ganti blok dari `const siap = saring(baris, slots, sekarang);` sampai baris `const stempel = sekarang.toISOString();`:

```ts
  const siap = saring(baris, slots, sekarang);

  const { data: adaRows } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id, sumber_row_key, status')
    .eq('periode_id', periode.id);
  const ada = new Map(
    ((adaRows ?? []) as { id: string; sumber_row_key: string; status: string }[]).map((r) => [
      r.sumber_row_key,
      r,
    ])
  );

  const stempel = sekarang.toISOString();
```

menjadi:

```ts
  const { data: adaRows } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id, sumber_row_key, status, wa_normal, nama')
    .eq('periode_id', periode.id);
  const adaList = (adaRows ?? []) as {
    id: string;
    sumber_row_key: string;
    status: string;
    wa_normal: string | null;
    nama: string;
  }[];
  const ada = new Map(adaList.map((r) => [r.sumber_row_key, r]));
  // Orang yang sudah masuk usulan: baris itulah kebenarannya (dibekukan di bawah),
  // semua kirimannya yang lain berstatus diganti.
  const identitasDialokasikan = new Set(
    adaList
      .filter((r) => r.status === 'dialokasikan')
      .map((r) => identitasPendaftar(r.wa_normal, r.nama))
      .filter((x): x is string => x !== null)
  );

  const siap = saring(baris, slots, sekarang, { identitasDialokasikan });

  const stempel = sekarang.toISOString();
```

Ganti:

```ts
    if (b.status === 'valid') hasil.valid++;
    else hasil.ditahan++;
```

menjadi:

```ts
    if (b.status === 'valid') hasil.valid++;
    else if (b.status === 'diganti') hasil.diganti++;
    else hasil.ditahan++;
```

Ganti isi `terakhir_pesan`:

```ts
      terakhir_pesan: `${hasil.baru} baru, ${hasil.diperbarui} diperbarui, ${hasil.ditahan} ditahan`,
```

menjadi:

```ts
      terakhir_pesan: `${hasil.baru} baru, ${hasil.diperbarui} diperbarui, ${hasil.ditahan} ditahan, ${hasil.diganti} diganti kiriman baru`,
```

- [ ] **Step 7: Jalankan uji dan typecheck**

Run: `npm run test-ketersediaan && npm run typecheck`
Expected: `SEMUA LULUS`, typecheck tanpa galat

- [ ] **Step 8: Commit**

```bash
git add src/lib/ketersediaan-pendaftar.ts scripts/test-ketersediaan.ts
git commit -m "feat(ketersediaan): kiriman ulang formulir — yang terakhir per nomor+nama berlaku, lainnya diganti

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Halaqah yang sudah selesai berhenti mengunci jadwal

**Files:**
- Modify: `src/lib/ketersediaan-slot.ts` (fungsi baru `masihBerjalanPada`)
- Modify: `src/lib/ketersediaan-bentrok.ts`
- Modify: `src/lib/ketersediaan-jalankan.ts:122-130`
- Modify: `src/app/ketersediaan/pengajar/actions.ts:76`
- Modify: `src/app/ketersediaan/pengajar/page.tsx:56`
- Test: `scripts/test-ketersediaan.ts`

- [ ] **Step 1: Tulis uji murni yang gagal**

Di `scripts/test-ketersediaan.ts`, tambahkan `masihBerjalanPada,` ke daftar import dari `@/lib/ketersediaan-slot` (urut abjad, setelah `jamKeMenit,`). Tepat sebelum baris `console.log(failed === 0 ? ...` tambahkan:

```ts
// ── Halaqah selesai ─────────────────────────────────────────────────────────
console.log('\n# halaqah yang sudah selesai');

eq(masihBerjalanPada('2026-08-30', '2026-10-21'), false, 'selesai sebelum KBM → tidak mengunci');
eq(masihBerjalanPada('2026-10-11', '2026-09-21'), true, 'selesai setelah KBM → mengunci');
eq(masihBerjalanPada('2026-10-21', '2026-10-21'), true, 'selesai tepat di hari KBM → masih mengunci');
eq(masihBerjalanPada(null, '2026-10-21'), true, 'tanpa kaldik → tetap mengunci (aman)');
eq(masihBerjalanPada('2026-08-30', null), true, 'tanpa acuan → perilaku lama');
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan`
Expected: gagal — `masihBerjalanPada is not a function`

- [ ] **Step 3: Implementasi fungsi murni**

Di `src/lib/ketersediaan-slot.ts`, tepat sebelum `export function hitungUmur`, tambahkan:

```ts
/**
 * Apakah sebuah halaqah masih menempati jamnya pada tanggal acuan (YYYY-MM-DD).
 *
 * Tanpa tanggal selesai atau tanpa acuan dianggap masih — mengunci jam yang
 * ternyata kosong lebih murah daripada membuka jam yang ternyata masih terisi.
 */
export function masihBerjalanPada(selesai: string | null, acuan: string | null): boolean {
  if (!selesai || !acuan) return true;
  return selesai.slice(0, 10) >= acuan.slice(0, 10);
}
```

- [ ] **Step 4: Jalankan uji murni**

Run: `npm run test-ketersediaan`
Expected: `SEMUA LULUS`

- [ ] **Step 5: Tanggal selesai di `ketersediaan-bentrok.ts`**

Ganti import:

```ts
import {
  bentrok,
  rentangDariHalaqah,
  rentangDariSlot,
  type RentangJadwal,
} from '@/lib/ketersediaan-slot';
```

menjadi:

```ts
import {
  bentrok,
  masihBerjalanPada,
  rentangDariHalaqah,
  rentangDariSlot,
  type RentangJadwal,
} from '@/lib/ketersediaan-slot';
```

Di `interface JadwalTerpakai`, setelah `label: string;` tambahkan:

```ts
  /** Tanggal pertemuan terakhir menurut kaldik; null bila tak diketahui atau bukan halaqah HITS. */
  selesai: string | null;
```

Di `interface HalaqahRow`, setelah `name: string;` tambahkan:

```ts
  batch_id: string | null;
```

Tepat sebelum `/** Semua jam yang sudah terpakai oleh seorang pengajar, ...` tambahkan:

```ts
/**
 * Tanggal pertemuan terakhir tiap halaqah HITS.
 *
 * `hits_halaqah` tidak punya kolom selesai, dan `active` tidak bisa dipercaya:
 * batch Januari dan April 2026 masih `active=true` jauh setelah kelasnya
 * berakhir, dan sinkronisasi sheet menghidupkannya lagi bila dimatikan manual.
 * Kalender pendidikan justru lengkap untuk semua batch aktif (diperiksa 16 Sep
 * 2026), jadi tanggal selesai = tanggal terbesar di kaldik batch-nya, atau di
 * koreksi pertemuan halaqah itu bila lebih akhir.
 *
 * `cacheBatch` dipakai ulang oleh pemanggil yang memeriksa banyak pengajar
 * sekaligus, supaya kaldik satu batch hanya dibaca sekali.
 */
export async function tanggalSelesaiHalaqah(
  halaqah: readonly { id: string; batch_id: string | null }[],
  cacheBatch: Map<string, string | null> = new Map()
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (halaqah.length === 0) return out;

  const batchBaru = [
    ...new Set(halaqah.map((h) => h.batch_id).filter((b): b is string => Boolean(b))),
  ].filter((b) => !cacheBatch.has(b));
  if (batchBaru.length > 0) {
    const { data } = await supabaseAdmin
      .from('hits_kaldik_hari')
      .select('batch_id, tanggal')
      .in('batch_id', batchBaru);
    for (const b of batchBaru) cacheBatch.set(b, null);
    for (const r of (data ?? []) as { batch_id: string; tanggal: string }[]) {
      const lama = cacheBatch.get(r.batch_id);
      if (!lama || r.tanggal > lama) cacheBatch.set(r.batch_id, r.tanggal);
    }
  }

  const { data: koreksi } = await supabaseAdmin
    .from('hits_kaldik_pertemuan')
    .select('halaqah_id, tanggal')
    .in(
      'halaqah_id',
      halaqah.map((h) => h.id)
    );
  const koreksiTerakhir = new Map<string, string>();
  for (const r of (koreksi ?? []) as { halaqah_id: string; tanggal: string }[]) {
    const lama = koreksiTerakhir.get(r.halaqah_id);
    if (!lama || r.tanggal > lama) koreksiTerakhir.set(r.halaqah_id, r.tanggal);
  }

  for (const h of halaqah) {
    const kandidat = [
      h.batch_id ? (cacheBatch.get(h.batch_id) ?? null) : null,
      koreksiTerakhir.get(h.id) ?? null,
    ].filter((x): x is string => Boolean(x));
    out.set(h.id, kandidat.sort().pop() ?? null);
  }
  return out;
}

```

Ganti tanda tangan dan awal `jadwalTerpakaiPengajar`:

```ts
export async function jadwalTerpakaiPengajar(pengajarId: string): Promise<JadwalTerpakai[]> {
  const [{ data: halaqah }, { data: kelas }, { data: usulan }] = await Promise.all([
    supabaseAdmin
      .from('hits_halaqah')
      .select('id, name, jadwal_raw, jadwal_hari, waktu_mulai, waktu_selesai, batch:batch_id(name)')
```

menjadi:

```ts
export async function jadwalTerpakaiPengajar(
  pengajarId: string,
  opts: {
    /**
     * Tanggal mulai KBM periode yang sedang diisi (YYYY-MM-DD). Halaqah HITS yang
     * pertemuan terakhirnya lebih awal dari tanggal ini tidak mengunci apa pun.
     * Tanpa acuan, perilaku lama: setiap halaqah aktif mengunci.
     */
    acuan?: string | null;
    cacheSelesaiBatch?: Map<string, string | null>;
  } = {}
): Promise<JadwalTerpakai[]> {
  const [{ data: halaqah }, { data: kelas }, { data: usulan }] = await Promise.all([
    supabaseAdmin
      .from('hits_halaqah')
      .select('id, name, batch_id, jadwal_raw, jadwal_hari, waktu_mulai, waktu_selesai, batch:batch_id(name)')
```

Ganti loop halaqah:

```ts
  for (const h of (halaqah ?? []) as HalaqahRow[]) {
    const rentang = rentangDariHalaqah(h);
    // Halaqah tanpa jam yang dapat dibaca tidak boleh mengunci slot apa pun —
    // tak ada dasar menyatakan bentrok. Baris observasi lama seperti
    // "HITS 6 (observasi)" hanya berisi "Selasa & Jum'at" tanpa jam.
    if (!rentang) continue;
    out.push({
      sumber: 'hits',
      nama: h.name,
      batch: h.batch?.name ?? null,
      rentang,
      label: h.jadwal_raw ?? '',
    });
  }
```

menjadi:

```ts
  const halaqahRows = (halaqah ?? []) as HalaqahRow[];
  const selesai = opts.acuan
    ? await tanggalSelesaiHalaqah(halaqahRows, opts.cacheSelesaiBatch)
    : new Map<string, string | null>();

  for (const h of halaqahRows) {
    const rentang = rentangDariHalaqah(h);
    // Halaqah tanpa jam yang dapat dibaca tidak boleh mengunci slot apa pun —
    // tak ada dasar menyatakan bentrok. Baris observasi lama seperti
    // "HITS 6 (observasi)" hanya berisi "Selasa & Jum'at" tanpa jam.
    if (!rentang) continue;
    const tanggalSelesai = selesai.get(h.id) ?? null;
    if (opts.acuan && !masihBerjalanPada(tanggalSelesai, opts.acuan)) continue;
    out.push({
      sumber: 'hits',
      nama: h.name,
      batch: h.batch?.name ?? null,
      rentang,
      label: h.jadwal_raw ?? '',
      selesai: tanggalSelesai,
    });
  }
```

Pada `out.push` untuk `sumber: 'maahir'`, setelah baris `label: ...` tambahkan `selesai: null,`. Pada `out.push` untuk `sumber: 'usulan'`, setelah `label: u.slot.label,` tambahkan `selesai: null,`.

- [ ] **Step 6: Pemanggil memakai tanggal mulai periode**

`src/lib/ketersediaan-jalankan.ts` — ganti:

```ts
  const jadwalPengajar = new Map<string, RentangJadwal[]>();
  for (const id of pengajarDipakai) {
    const terpakai = await jadwalTerpakaiPengajar(id);
```

menjadi:

```ts
  const jadwalPengajar = new Map<string, RentangJadwal[]>();
  const cacheSelesaiBatch = new Map<string, string | null>();
  for (const id of pengajarDipakai) {
    const terpakai = await jadwalTerpakaiPengajar(id, { acuan: periode.mulai, cacheSelesaiBatch });
```

`src/app/ketersediaan/pengajar/actions.ts` — ganti:

```ts
  const terpakai = await jadwalTerpakaiPengajar(sesi.pengajar_id);
```

menjadi:

```ts
  const terpakai = await jadwalTerpakaiPengajar(sesi.pengajar_id, { acuan: periode.mulai });
```

`src/app/ketersediaan/pengajar/page.tsx` — ganti:

```ts
    jadwalTerpakaiPengajar(sesi.pengajar_id),
```

menjadi:

```ts
    jadwalTerpakaiPengajar(sesi.pengajar_id, { acuan: periode.mulai }),
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: tanpa galat. (Perilaku terhadap basis data diuji di Task 9.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/ketersediaan-slot.ts src/lib/ketersediaan-bentrok.ts src/lib/ketersediaan-jalankan.ts src/app/ketersediaan/pengajar/actions.ts src/app/ketersediaan/pengajar/page.tsx scripts/test-ketersediaan.ts
git commit -m "fix(ketersediaan): halaqah yang kaldiknya sudah selesai tidak lagi mengunci jadwal pengajar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Prioritas per jam

**Files:**
- Modify: `src/lib/ketersediaan-alokasi.ts` (`MasukanAlokasi.peringkat`, dua pemanggilan di `alokasikan`)
- Modify: `src/lib/ketersediaan-jalankan.ts` (baca `prioritas`, peringkat per jam)
- Modify: `src/lib/ketersediaan-konfirmasi.ts` (`cariPengganti`)
- Test: `scripts/test-ketersediaan.ts`

- [ ] **Step 1: Tulis uji yang gagal**

Di `scripts/test-ketersediaan.ts`, tepat sebelum baris `console.log(failed === 0 ? ...` tambahkan:

```ts
// ── Prioritas per jam ───────────────────────────────────────────────────────
console.log('\n# prioritas per jam');

// Pengajar yang sama punya urutan berlawanan di dua jam. Diuji satu jam per
// panggilan supaya hasilnya ditentukan prioritas, bukan kaidah putaran.
const prioritasJam: Record<string, number> = { 'J1|p1': 2, 'J1|p2': 1, 'J2|p1': 1, 'J2|p2': 2 };
const peringkatJam = (id: string, slot: string) => prioritasJam[`${slot}|${id}`] ?? 99;

const hasilJ1 = alokasikan({
  slots: [slotAlokasi('J1', [0, 2], '06:00', '07:30', 1)],
  tersedia: new Map([['J1', ['p1', 'p2']]]),
  sudahDiSlot: new Map(),
  jadwalPengajar: new Map(),
  peringkat: peringkatJam,
});
eq(hasilJ1.penempatan[0]?.pengajar_id, 'p2', 'jam J1 jatuh ke prioritas #1 di J1');
eq(hasilJ1.penempatan[0]?.urutan_prioritas, 1, 'urutan_prioritas dicatat per jam');

const hasilJ2 = alokasikan({
  slots: [slotAlokasi('J2', [1, 3], '20:00', '21:30', 1)],
  tersedia: new Map([['J2', ['p1', 'p2']]]),
  sudahDiSlot: new Map(),
  jadwalPengajar: new Map(),
  peringkat: peringkatJam,
});
eq(hasilJ2.penempatan[0]?.pengajar_id, 'p1', 'jam J2 jatuh ke prioritas #1 di J2');
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan`
Expected: `FAIL jam J1 jatuh ke prioritas #1 di J1` (peringkat dipanggil tanpa slot → 99 untuk semua → urut abjad → `p1`)

- [ ] **Step 3: Peringkat menerima slot di `ketersediaan-alokasi.ts`**

Ganti:

```ts
  /** pengajar_id → nomor urut prioritas; kecil lebih didahulukan. */
  peringkat: (pengajarId: string) => number;
```

menjadi:

```ts
  /**
   * Nomor urut prioritas pengajar DI JAM ITU; kecil lebih didahulukan. Prioritas
   * dari xlsx berlaku per jam — pengajar yang sama bisa #1 di satu jam dan #4 di
   * jam lain. Hanya memutus urutan di dalam satu putaran; kaidah pemerataan tetap.
   */
  peringkat: (pengajarId: string, slotId: string) => number;
```

Ganti:

```ts
          .sort((a, b) => {
            const pa = masukan.peringkat(a);
            const pb = masukan.peringkat(b);
```

menjadi:

```ts
          .sort((a, b) => {
            const pa = masukan.peringkat(a, s.slot.id);
            const pb = masukan.peringkat(b, s.slot.id);
```

Ganti:

```ts
          urutan_prioritas: masukan.peringkat(pilih),
```

menjadi:

```ts
          urutan_prioritas: masukan.peringkat(pilih, s.slot.id),
```

- [ ] **Step 4: Jalankan uji murni**

Run: `npm run test-ketersediaan`
Expected: `SEMUA LULUS`

- [ ] **Step 5: `jalankanAlokasi` membaca prioritas per jam**

Di `src/lib/ketersediaan-jalankan.ts` ganti:

```ts
  const { data: ketRows } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('slot_id, status, pengisian:pengisian_id(pengajar_id, periode_id, status)')
    .in('status', ['terverifikasi', 'diajukan']);

  const slotIds = new Set(slots.map((s) => s.id));
  const tersedia = new Map<string, string[]>();
  const pengajarDipakai = new Set<string>();
  for (const k of (ketRows ?? []) as {
    slot_id: string;
    pengisian?: { pengajar_id: string; periode_id: string; status: string } | null;
  }[]) {
```

menjadi:

```ts
  const { data: ketRows } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('slot_id, status, prioritas, pengisian:pengisian_id(pengajar_id, periode_id, status)')
    .in('status', ['terverifikasi', 'diajukan']);

  const slotIds = new Set(slots.map((s) => s.id));
  const tersedia = new Map<string, string[]>();
  const pengajarDipakai = new Set<string>();
  /** `${slot_id}|${pengajar_id}` → prioritas di jam itu. */
  const prioritasJam = new Map<string, number>();
  for (const k of (ketRows ?? []) as {
    slot_id: string;
    prioritas: number | null;
    pengisian?: { pengajar_id: string; periode_id: string; status: string } | null;
  }[]) {
```

Di dalam loop yang sama, tepat setelah baris `if (!slotIds.has(k.slot_id)) continue;` tambahkan:

```ts
    if (k.prioritas !== null) prioritasJam.set(`${k.slot_id}|${p.pengajar_id}`, k.prioritas);
```

Ganti properti `peringkat` di pemanggilan `alokasikan`:

```ts
    peringkat: (id) => {
      // Peringkat dibaca dari urutan sesuai gender pengajar; keduanya digabung
      // supaya satu fungsi cukup untuk mesin yang tidak mengenal gender.
      const dariIkhwan = urutan.ikhwan.peringkat.get(id);
```

menjadi:

```ts
    peringkat: (id, slotId) => {
      // Prioritas per jam (dari impor xlsx) menang. Selebihnya urutan preset atau
      // waktu isi sesuai gender; keduanya digabung supaya satu fungsi cukup untuk
      // mesin yang tidak mengenal gender.
      const dariJam = prioritasJam.get(`${slotId}|${id}`);
      if (dariJam !== undefined) return dariJam;
      const dariIkhwan = urutan.ikhwan.peringkat.get(id);
```

- [ ] **Step 6: `cariPengganti` memakai prioritas per jam**

Di `src/lib/ketersediaan-konfirmasi.ts`, dalam `cariPengganti`, ganti:

```ts
  const { data: ket } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('slot_id, pengisian:pengisian_id(pengajar_id, periode_id, status, submitted_at)')
    .eq('slot_id', slotId)
    .in('status', ['terverifikasi', 'diajukan']);
```

menjadi:

```ts
  const { data: ket } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('slot_id, prioritas, pengisian:pengisian_id(pengajar_id, periode_id, status, submitted_at)')
    .eq('slot_id', slotId)
    .in('status', ['terverifikasi', 'diajukan']);
```

Ganti blok `const kandidat = ...` sampai `return kandidat[0]?.pengajar_id ?? null;` menjadi:

```ts
  const kandidat = ((ket ?? []) as {
    prioritas: number | null;
    pengisian?: { pengajar_id: string; periode_id: string; status: string; submitted_at: string | null } | null;
  }[])
    .filter((k) => Boolean(k.pengisian))
    .map((k) => ({ ...k.pengisian!, prioritas: k.prioritas }))
    .filter((p) => p.periode_id === periodeId && p.status !== 'nonaktif')
    .filter((p) => p.pengajar_id !== kecuali && !dipakai.has(p.pengajar_id))
    // Prioritas di jam ini dulu; pemutus seri dokumen konsep: pengisi form lebih awal.
    .sort(
      (a, b) =>
        (a.prioritas ?? Number.MAX_SAFE_INTEGER) - (b.prioritas ?? Number.MAX_SAFE_INTEGER) ||
        (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')
    );

  return kandidat[0]?.pengajar_id ?? null;
```

- [ ] **Step 7: Uji dan typecheck**

Run: `npm run test-ketersediaan && npm run typecheck`
Expected: `SEMUA LULUS`, typecheck tanpa galat

- [ ] **Step 8: Commit**

```bash
git add src/lib/ketersediaan-alokasi.ts src/lib/ketersediaan-jalankan.ts src/lib/ketersediaan-konfirmasi.ts scripts/test-ketersediaan.ts
git commit -m "feat(ketersediaan): prioritas pengajar berlaku per jam di alokasi dan pergeseran

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Satu formulir, dua periode

**Files:**
- Create: `src/lib/ketersediaan-lintas-periode.ts`
- Modify: `src/lib/ketersediaan-jalankan.ts` (permintaan)
- Modify: `src/lib/ketersediaan-permintaan.ts` (`RingkasSlot.terpakai_lain`, definisi tersedia)
- Modify: `src/app/ketersediaan/koordinator/actions.ts` (`setujuiUsulan`)

Perilaku terhadap basis data diuji di Task 9.

- [ ] **Step 1: Buat modul lintas periode**

Create `src/lib/ketersediaan-lintas-periode.ts`:

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { identitasPendaftar } from '@/lib/ketersediaan-pendaftar';

/**
 * Satu formulir pendaftaran melayani lebih dari satu periode: pendaftar yang sama
 * boleh mulai September atau Oktober. Tiap periode menyimpan salinan barisnya
 * sendiri, jadi yang mencegah satu orang mendapat dua halaqah adalah identitasnya
 * (nomor + nama), bukan id baris.
 *
 * Dihitung saat dibaca, tidak ditulis ke periode lain: membatalkan usulan di satu
 * periode otomatis mengembalikan orangnya ke antrean periode lain.
 *
 * @returns identitas → nama periode tempat ia sudah dialokasikan
 */
export async function identitasTerpakaiLintasPeriode(periodeId: string): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('wa_normal, nama, periode:periode_id(nama)')
    .neq('periode_id', periodeId)
    .eq('status', 'dialokasikan');

  const out = new Map<string, string>();
  for (const r of (data ?? []) as {
    wa_normal: string | null;
    nama: string;
    periode?: { nama: string } | null;
  }[]) {
    const id = identitasPendaftar(r.wa_normal, r.nama);
    if (id && !out.has(id)) out.set(id, r.periode?.nama ?? 'periode lain');
  }
  return out;
}
```

- [ ] **Step 2: Alokasi melewati orang yang sudah dapat di periode lain**

Di `src/lib/ketersediaan-jalankan.ts` tambahkan import:

```ts
import { identitasPendaftar } from '@/lib/ketersediaan-pendaftar';
import { identitasTerpakaiLintasPeriode } from '@/lib/ketersediaan-lintas-periode';
```

Ganti blok permintaan:

```ts
  const { data: pendaftarRows } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id, slot_id, level_pilihan, pita_umur, didaftar_pada')
    .eq('periode_id', periode.id)
    .eq('status', 'valid');

  const pendaftar: PendaftarAlokasi[] = ((pendaftarRows ?? []) as {
    id: string;
    slot_id: string | null;
    level_pilihan: string | null;
    pita_umur: KsPitaUmur | null;
    didaftar_pada: string | null;
  }[])
    .filter((p): p is typeof p & { slot_id: string } => Boolean(p.slot_id))
```

menjadi:

```ts
  const [{ data: pendaftarRows }, terpakaiLain] = await Promise.all([
    supabaseAdmin
      .from('ks_pendaftar')
      .select('id, slot_id, level_pilihan, pita_umur, didaftar_pada, wa_normal, nama')
      .eq('periode_id', periode.id)
      .eq('status', 'valid'),
    identitasTerpakaiLintasPeriode(periode.id),
  ]);

  const pendaftar: PendaftarAlokasi[] = ((pendaftarRows ?? []) as {
    id: string;
    slot_id: string | null;
    level_pilihan: string | null;
    pita_umur: KsPitaUmur | null;
    didaftar_pada: string | null;
    wa_normal: string | null;
    nama: string;
  }[])
    .filter((p): p is typeof p & { slot_id: string } => Boolean(p.slot_id))
    .filter((p) => {
      // Sudah masuk usulan di periode lain dari formulir yang sama.
      const id = identitasPendaftar(p.wa_normal, p.nama);
      return !id || !terpakaiLain.has(id);
    })
```

- [ ] **Step 3: Ringkasan slot memisahkan `terpakai_lain`**

Di `src/lib/ketersediaan-permintaan.ts` tambahkan import:

```ts
import { identitasPendaftar } from '@/lib/ketersediaan-pendaftar';
import { identitasTerpakaiLintasPeriode } from '@/lib/ketersediaan-lintas-periode';
```

Di `interface RingkasSlot`, setelah `ditahan: number;` tambahkan:

```ts
  /** Pendaftar sah di periode ini yang sudah masuk usulan di periode lain. Tidak ikut antre. */
  terpakai_lain: number;
```

Ganti komentar dan tipe properti:

```ts
  /** Pengajar terverifikasi yang menyatakan bersedia di slot ini. */
  pengajar_tersedia: number;
```

menjadi:

```ts
  /** Pengajar bersedia di slot ini (terverifikasi + diajukan) — definisi yang sama dengan mesin alokasi. */
  pengajar_tersedia: number;
```

Di `interface PendaftarRingkas`, setelah `didaftar_pada: string | null;` tambahkan:

```ts
  wa_normal: string | null;
  nama: string;
```

Ganti bagian `Promise.all` di awal `ringkasSlot`:

```ts
  const [{ data: pendaftar }, { data: ketersediaan }, { data: usulan }, riwayat] = await Promise.all([
    supabaseAdmin
      .from('ks_pendaftar')
      .select('slot_id, status, didaftar_pada')
      .eq('periode_id', periode.id),
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot_id, status, pengisian:pengisian_id(pengajar_id, status)')
      .eq('status', 'terverifikasi'),
```

menjadi:

```ts
  const [{ data: pendaftar }, { data: ketersediaan }, { data: usulan }, riwayat, terpakaiLain] = await Promise.all([
    supabaseAdmin
      .from('ks_pendaftar')
      .select('slot_id, status, didaftar_pada, wa_normal, nama')
      .eq('periode_id', periode.id),
    // Sama dengan mesin alokasi: 'diajukan' juga pasokan. Sebelumnya papan hanya
    // menghitung 'terverifikasi', jadi angka di layar selalu lebih kecil dari yang
    // benar-benar dipakai alokasi.
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot_id, status, pengisian:pengisian_id(pengajar_id, status)')
      .in('status', ['terverifikasi', 'diajukan']),
```

Pada baris berikutnya dalam `Promise.all` yang sama, ganti `riwayatSlot(slots),` menjadi:

```ts
    riwayatSlot(slots),
    identitasTerpakaiLintasPeriode(periode.id),
```

Ganti:

```ts
  const antre = new Map<string, number>();
  const dialokasikan = new Map<string, number>();
```

menjadi:

```ts
  const antre = new Map<string, number>();
  const lain = new Map<string, number>();
  const dialokasikan = new Map<string, number>();
```

Ganti:

```ts
    if (p.status === 'valid') {
      antre.set(p.slot_id, (antre.get(p.slot_id) ?? 0) + 1);
```

menjadi:

```ts
    if (p.status === 'valid') {
      const id = identitasPendaftar(p.wa_normal, p.nama);
      if (id && terpakaiLain.has(id)) {
        lain.set(p.slot_id, (lain.get(p.slot_id) ?? 0) + 1);
        continue;
      }
      antre.set(p.slot_id, (antre.get(p.slot_id) ?? 0) + 1);
```

Pada objek `out.set(s.id, {...})`, setelah `ditahan: ditahan.get(s.id) ?? 0,` tambahkan:

```ts
      terpakai_lain: lain.get(s.id) ?? 0,
```

- [ ] **Step 4: Setujui usulan memeriksa ulang**

Di `src/app/ketersediaan/koordinator/actions.ts`, ganti import:

```ts
import { tarikSumber, tebakPemetaan } from '@/lib/ketersediaan-pendaftar';
```

menjadi:

```ts
import { identitasPendaftar, tarikSumber, tebakPemetaan } from '@/lib/ketersediaan-pendaftar';
import { identitasTerpakaiLintasPeriode } from '@/lib/ketersediaan-lintas-periode';
```

Di `setujuiUsulan`, tepat setelah:

```ts
  const periode = await getPeriode(usulan.periode_id as string);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };
```

tambahkan:

```ts
  // Periode lain bisa melahirkan usulan untuk orang yang sama setelah alokasi ini
  // dijalankan. Periksa sebelum pengajar dihubungi.
  const [{ data: identitasPeserta }, terpakaiLain] = await Promise.all([
    supabaseAdmin
      .from('ks_usulan_peserta')
      .select('pendaftar:pendaftar_id(wa_normal, nama)')
      .eq('usulan_id', input.usulanId),
    identitasTerpakaiLintasPeriode(usulan.periode_id as string),
  ]);
  const sudahDiLain = ((identitasPeserta ?? []) as {
    pendaftar?: { wa_normal: string | null; nama: string } | null;
  }[])
    .map((p) => (p.pendaftar ? identitasPendaftar(p.pendaftar.wa_normal, p.pendaftar.nama) : null))
    .filter((id): id is string => id !== null && terpakaiLain.has(id));
  if (sudahDiLain.length > 0) {
    return {
      ok: false,
      error: `${sudahDiLain.length} peserta usulan ini sudah mendapat halaqah di ${terpakaiLain.get(sudahDiLain[0])}. Batalkan usulan ini, lalu jalankan alokasi lagi.`,
    };
  }
```

- [ ] **Step 5: Typecheck dan uji murni**

Run: `npm run typecheck && npm run test-ketersediaan`
Expected: tanpa galat, `SEMUA LULUS`

- [ ] **Step 6: Commit**

```bash
git add src/lib/ketersediaan-lintas-periode.ts src/lib/ketersediaan-jalankan.ts src/lib/ketersediaan-permintaan.ts src/app/ketersediaan/koordinator/actions.ts
git commit -m "feat(ketersediaan): satu formulir untuk dua periode tanpa satu orang dapat dua halaqah

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Jumlah pertemuan per jenjang

**Files:**
- Modify: `src/lib/ketersediaan-pertemuan.ts` (fungsi baru)
- Modify: `src/lib/tilawah/push.ts:73-80`
- Modify: `src/app/ketersediaan/koordinator/actions.ts` (`ubahAturanPeriode`)
- Modify: `src/app/ketersediaan/koordinator/PanelPeriode.tsx` (`AturanPeriode`)
- Modify: `scripts/test-tilawah.ts:176`
- Test: `scripts/test-ketersediaan.ts`

- [ ] **Step 1: Tulis uji yang gagal**

Di `scripts/test-ketersediaan.ts`, tambahkan `jumlahPertemuanUntuk,` ke import dari `@/lib/ketersediaan-pertemuan` (sebelum `namaPertemuan,`). Tepat sebelum baris `console.log(failed === 0 ? ...` tambahkan:

```ts
// ── Pertemuan per jenjang ───────────────────────────────────────────────────
console.log('\n# jumlah pertemuan per jenjang');

const aturanPertemuan = { jumlah_pertemuan_dasar: 50, jumlah_pertemuan_lanjutan: 26 };
eq(jumlahPertemuanUntuk(aturanPertemuan, 'HITS Dasar'), 50, 'Dasar 50 pertemuan');
eq(jumlahPertemuanUntuk(aturanPertemuan, 'HITS Lanjutan'), 26, 'Lanjutan 26 pertemuan');
eq(jumlahPertemuanUntuk(aturanPertemuan, 'hits lanjutan'), 26, 'huruf kecil tetap dikenali');
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan`
Expected: gagal — `jumlahPertemuanUntuk is not a function`

- [ ] **Step 3: Implementasi**

Di `src/lib/ketersediaan-pertemuan.ts`, tambahkan di baris import paling atas (bila belum ada import tipe, tambahkan baris baru di awal berkas):

```ts
import type { KsPeriode } from '@/types/db';
```

Lalu tambahkan di akhir berkas:

```ts
/**
 * Jumlah pertemuan yang dibuat di CMS tilawah untuk satu halaqah.
 * HITS Dasar dan Lanjutan berbeda panjangnya (50 dan 26 per keputusan 16 Sep
 * 2026), jadi angkanya dipilih dari jenjang usulan, bukan satu angka periode.
 * "Alumni HITS" sudah dilebur ke Lanjutan oleh `bacaLevel`.
 */
export function jumlahPertemuanUntuk(
  periode: Pick<KsPeriode, 'jumlah_pertemuan_dasar' | 'jumlah_pertemuan_lanjutan'>,
  level: string
): number {
  return /lanjut/i.test(level) ? periode.jumlah_pertemuan_lanjutan : periode.jumlah_pertemuan_dasar;
}
```

- [ ] **Step 4: Jalankan uji murni**

Run: `npm run test-ketersediaan`
Expected: `SEMUA LULUS`

- [ ] **Step 5: Antrean pengiriman memakai jenjang**

Di `src/lib/tilawah/push.ts`, tambahkan import:

```ts
import { jumlahPertemuanUntuk } from '@/lib/ketersediaan-pertemuan';
```

(Bila berkas sudah mengimpor dari `@/lib/ketersediaan-pertemuan`, tambahkan `jumlahPertemuanUntuk` ke import yang sudah ada.)

Ganti:

```ts
  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select('periode:periode_id(jumlah_pertemuan)')
    .eq('id', usulanId)
    .maybeSingle();
  const jumlahPertemuan =
    (usulan?.periode as { jumlah_pertemuan: number } | null)?.jumlah_pertemuan ?? 0;
```

menjadi:

```ts
  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select('level, periode:periode_id(jumlah_pertemuan_dasar, jumlah_pertemuan_lanjutan)')
    .eq('id', usulanId)
    .maybeSingle();
  const aturan = usulan?.periode as
    | { jumlah_pertemuan_dasar: number; jumlah_pertemuan_lanjutan: number }
    | null
    | undefined;
  const jumlahPertemuan = aturan ? jumlahPertemuanUntuk(aturan, String(usulan?.level ?? '')) : 0;
```

- [ ] **Step 6: Aksi aturan periode**

Di `src/app/ketersediaan/koordinator/actions.ts`, dalam tanda tangan `ubahAturanPeriode`, ganti `jumlahPertemuan: number;` menjadi:

```ts
  jumlahPertemuanDasar: number;
  jumlahPertemuanLanjutan: number;
```

Dalam objek `patch`, ganti `jumlah_pertemuan: input.jumlahPertemuan,` menjadi:

```ts
    jumlah_pertemuan_dasar: Math.max(0, Math.min(200, input.jumlahPertemuanDasar)),
    jumlah_pertemuan_lanjutan: Math.max(0, Math.min(200, input.jumlahPertemuanLanjutan)),
```

- [ ] **Step 7: Panel aturan periode**

Di `src/app/ketersediaan/koordinator/PanelPeriode.tsx`, dalam `AturanPeriode`, ganti:

```tsx
  const [pertemuan, setPertemuan] = useState(periode.jumlah_pertemuan);
```

menjadi:

```tsx
  const [pertemuanDasar, setPertemuanDasar] = useState(periode.jumlah_pertemuan_dasar);
  const [pertemuanLanjutan, setPertemuanLanjutan] = useState(periode.jumlah_pertemuan_lanjutan);
```

Ganti:

```tsx
        <Angka label="Pertemuan per halaqah" nilai={pertemuan} ubah={setPertemuan} min={0} max={200} />
```

menjadi:

```tsx
        <Angka label="Pertemuan · HITS Dasar" nilai={pertemuanDasar} ubah={setPertemuanDasar} min={0} max={200} />
        <Angka label="Pertemuan · HITS Lanjutan" nilai={pertemuanLanjutan} ubah={setPertemuanLanjutan} min={0} max={200} />
```

Ganti paragraf keterangannya:

```tsx
        Pertemuan dibuat di CMS tilawah pada hari slot, berturut-turut sejak tanggal mulai.
        Halaqah HITS Reguler di CMS lazimnya berisi 22 pertemuan. Isi 0 bila pertemuan
        akan dibuat manual di sana.
```

menjadi:

```tsx
        Pertemuan dibuat di CMS tilawah pada hari slot, berturut-turut sejak tanggal mulai.
        HITS Dasar 50 pertemuan, HITS Lanjutan 26. Pendaftar &ldquo;Alumni HITS&rdquo; ikut
        Lanjutan. Isi 0 bila pertemuan akan dibuat manual di sana.
```

Ganti `jumlahPertemuan: pertemuan,` di pemanggilan `ubahAturanPeriode` menjadi:

```tsx
              jumlahPertemuanDasar: pertemuanDasar,
              jumlahPertemuanLanjutan: pertemuanLanjutan,
```

- [ ] **Step 8: Fixture uji staging**

Di `scripts/test-tilawah.ts`, ganti:

```ts
      jumlah_pertemuan: 4,
```

menjadi:

```ts
      jumlah_pertemuan_dasar: 4,
      jumlah_pertemuan_lanjutan: 4,
```

- [ ] **Step 9: Typecheck dan uji**

Run: `npm run typecheck && npm run test-ketersediaan`
Expected: tanpa galat, `SEMUA LULUS`

- [ ] **Step 10: Commit**

```bash
git add src/lib/ketersediaan-pertemuan.ts src/lib/tilawah/push.ts src/app/ketersediaan/koordinator/actions.ts src/app/ketersediaan/koordinator/PanelPeriode.tsx scripts/test-tilawah.ts scripts/test-ketersediaan.ts
git commit -m "feat(ketersediaan): jumlah pertemuan per jenjang — Dasar 50, Lanjutan 26

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Kredensial tilawah sampai ke aplikasi produksi

**Files:**
- Modify: `src/lib/tilawah/client.ts:56-74`
- Modify: `azure-pipelines.yml:25-27`

- [ ] **Step 1: Pastikan hanya klien yang membaca env tilawah**

Run: `grep -rn "process.env.TILAWAH\|process.env.ENV_TILAWAH" src`
Expected: hanya baris di `src/lib/tilawah/client.ts`

- [ ] **Step 2: Klien membaca nama polos atau berawalan `ENV_`**

Di `src/lib/tilawah/client.ts`, ganti:

```ts
function konfigurasi(): { base: string; email: string; password: string } {
  const base = (process.env.TILAWAH_BASE_URL ?? '').replace(/\/$/, '');
  const email = process.env.TILAWAH_EMAIL ?? '';
  const password = process.env.TILAWAH_PASSWORD ?? '';
```

menjadi:

```ts
/**
 * Nilai env tilawah. Pipeline produksi menulis variabel ber-awalan ENV_
 * (`ENV_TILAWAH_BASE_URL`) ke maahir.env, sementara lokal memakai nama polos —
 * pola yang sama dengan `apiEnv` untuk API publik. Makro Azure yang belum diisi
 * tertulis mentah sebagai "$(NAMA)"; itu dianggap kosong, bukan alamat.
 */
function envTilawah(nama: 'TILAWAH_BASE_URL' | 'TILAWAH_EMAIL' | 'TILAWAH_PASSWORD'): string {
  const nilai = (process.env[nama] ?? process.env[`ENV_${nama}`] ?? '').trim();
  return nilai.startsWith('$(') ? '' : nilai;
}

function konfigurasi(): { base: string; email: string; password: string } {
  const base = envTilawah('TILAWAH_BASE_URL').replace(/\/$/, '');
  const email = envTilawah('TILAWAH_EMAIL');
  const password = envTilawah('TILAWAH_PASSWORD');
```

Ganti:

```ts
export function tilawahTerkonfigurasi(): boolean {
  return Boolean(
    process.env.TILAWAH_BASE_URL && process.env.TILAWAH_EMAIL && process.env.TILAWAH_PASSWORD
  );
}
```

menjadi:

```ts
export function tilawahTerkonfigurasi(): boolean {
  return Boolean(
    envTilawah('TILAWAH_BASE_URL') && envTilawah('TILAWAH_EMAIL') && envTilawah('TILAWAH_PASSWORD')
  );
}
```

- [ ] **Step 3: Pipeline memetakan rahasia tilawah**

Di `azure-pipelines.yml`, ganti:

```yaml
    env:
      ENV_AGENT_TOKEN: $(ENV_AGENT_TOKEN)
      ENV_CRON_SECRET: $(ENV_CRON_SECRET)
```

menjadi:

```yaml
    env:
      ENV_AGENT_TOKEN: $(ENV_AGENT_TOKEN)
      ENV_CRON_SECRET: $(ENV_CRON_SECRET)
      # CMS tilawah (modul ketersediaan). Klien membaca ENV_TILAWAH_* bila nama
      # polosnya tidak ada; nilai "$(...)" yang belum diisi dianggap kosong.
      ENV_TILAWAH_BASE_URL: $(ENV_TILAWAH_BASE_URL)
      ENV_TILAWAH_EMAIL: $(ENV_TILAWAH_EMAIL)
      ENV_TILAWAH_PASSWORD: $(ENV_TILAWAH_PASSWORD)
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: tanpa galat

- [ ] **Step 5: Commit**

```bash
git add src/lib/tilawah/client.ts azure-pipelines.yml
git commit -m "fix(tilawah): kredensial CMS terbaca di produksi lewat ENV_TILAWAH_*

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Uji integrasi PGlite — migrasi dan aturan

**Files:**
- Create: `scripts/test-ketersediaan-impor.ts`

- [ ] **Step 1: Tulis harness dan uji aturan**

Create `scripts/test-ketersediaan-impor.ts`:

```ts
/**
 * test-ketersediaan-impor.ts — uji integrasi Ketersediaan terhadap Postgres
 * sungguhan (PGlite lewat wire-protocol), memakai migrasi ks_* yang ASLI dan lib
 * aplikasi apa adanya. Tidak menyentuh produksi maupun berkas xlsx asli.
 *
 * Jalankan: npm run test-ketersediaan-impor
 * Opsional: KS_XLSX=/jalur/berkas.xlsx untuk ikut memeriksa berkas nyata.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PG_TEST_PORT ?? 54333);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

// Tabel luar yang dirujuk migrasi ks_* dan cek bentrok — bentuk minimum.
const PRASYARAT = `
CREATE TYPE gender AS ENUM ('ikhwan', 'akhwat');
CREATE TABLE pengajar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, gender gender NOT NULL, whatsapp_number text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE hits_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, start_date date
);
CREATE TABLE hits_halaqah (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES hits_batch(id), name text NOT NULL,
  jadwal_raw text, jadwal_hari text[] NOT NULL DEFAULT '{}',
  waktu_mulai time, waktu_selesai time,
  pengajar_id uuid REFERENCES pengajar(id), active boolean NOT NULL DEFAULT true
);
CREATE TABLE hits_kaldik_hari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES hits_batch(id), level text,
  tanggal date NOT NULL, is_libur boolean NOT NULL DEFAULT false
);
CREATE TABLE hits_kaldik_pertemuan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqah_id uuid NOT NULL REFERENCES hits_halaqah(id),
  pertemuan_no int NOT NULL, tanggal date NOT NULL
);
CREATE TABLE kelas_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  pengajar_id uuid REFERENCES pengajar(id),
  jadwal_hari text, jadwal_waktu_mulai time, jadwal_waktu_selesai time
);
`;

const MIGRASI = [
  '0063_ketersediaan_inti',
  '0064_ketersediaan_pendaftar',
  '0065_ketersediaan_alokasi',
  '0066_ketersediaan_hilir',
  '0067_ketersediaan_cascade',
  '0071_ketersediaan_rekaman',
  '0072_ketersediaan_pertemuan',
  '0077_ketersediaan_impor_aturan',
];

const ID = {
  ahmad: 'a0000000-0000-4000-8000-000000000001',
  bilal: 'a0000000-0000-4000-8000-000000000002',
  khadijah: 'a0000000-0000-4000-8000-000000000003',
  aisyah: 'a0000000-0000-4000-8000-000000000004',
  batchLama: 'b0000000-0000-4000-8000-000000000001',
  batchBaru: 'b0000000-0000-4000-8000-000000000002',
  h1: 'c0000000-0000-4000-8000-000000000001',
  h2: 'c0000000-0000-4000-8000-000000000002',
  h3: 'c0000000-0000-4000-8000-000000000003',
  sep: 'd0000000-0000-4000-8000-000000000001',
  okt: 'd0000000-0000-4000-8000-000000000002',
  slotSep: 'e0000000-0000-4000-8000-000000000001',
  slotOkt: 'e0000000-0000-4000-8000-000000000002',
};

const SEED = `
INSERT INTO pengajar (id, name, gender, whatsapp_number) VALUES
  ('${ID.ahmad}', 'Ahmad Fauzan', 'ikhwan', '6281111111111'),
  ('${ID.bilal}', 'Bilal Hakim', 'ikhwan', '6281222222222'),
  ('${ID.khadijah}', 'Khadijah Maryam', 'akhwat', '6281333333333'),
  ('${ID.aisyah}', 'Aisyah Rahma', 'akhwat', '6281444444444');

-- Batch lama selesai 30 Agustus; batch baru berjalan sampai Januari 2027.
INSERT INTO hits_batch (id, name, start_date) VALUES
  ('${ID.batchLama}', 'HITS Online Januari 2026', '2026-01-01'),
  ('${ID.batchBaru}', 'HITS untuk Orangtua ABK Juli 2026', '2026-07-03');
INSERT INTO hits_kaldik_hari (batch_id, level, tanggal) VALUES
  ('${ID.batchLama}', 'qoidah_nuroniyyah', '2026-01-12'),
  ('${ID.batchLama}', 'perbaikan_bacaan', '2026-08-30'),
  ('${ID.batchBaru}', 'qoidah_nuroniyyah', '2026-07-03'),
  ('${ID.batchBaru}', 'qoidah_nuroniyyah', '2027-01-08');

INSERT INTO hits_halaqah (id, batch_id, name, jadwal_raw, jadwal_hari, waktu_mulai, waktu_selesai, pengajar_id) VALUES
  ('${ID.h1}', '${ID.batchLama}', 'HITS 031', 'Online Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], '20:00', '21:30', '${ID.ahmad}'),
  ('${ID.h2}', '${ID.batchBaru}', 'HITS ABK 2', 'Online Selasa & Kamis 06:00 - 07:30 WIB', ARRAY['Selasa','Kamis'], '06:00', '07:30', '${ID.ahmad}'),
  ('${ID.h3}', '${ID.batchLama}', 'HITS 044', 'Online Sabtu & Ahad 13:00 - 14:30 WIB', ARRAY['Sabtu','Ahad'], '13:00', '14:30', '${ID.bilal}');
-- H3 dikoreksi: pertemuan terakhirnya mundur ke 1 November.
INSERT INTO hits_kaldik_pertemuan (halaqah_id, pertemuan_no, tanggal) VALUES ('${ID.h3}', 50, '2026-11-01');

INSERT INTO ks_periode (id, nama, mulai, selesai) VALUES
  ('${ID.sep}', 'Batch September 2026', '2026-09-21', '2026-12-31'),
  ('${ID.okt}', 'Batch Oktober 2026', '2026-10-21', '2027-01-31');
INSERT INTO ks_slot (id, periode_id, kelompok, mode, label, hari, hari_idx, waktu_mulai, waktu_selesai) VALUES
  ('${ID.slotSep}', '${ID.sep}', 'akhwat', 'online', 'Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], ARRAY[0,2]::smallint[], '20:00', '21:30'),
  ('${ID.slotOkt}', '${ID.okt}', 'akhwat', 'online', 'Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], ARRAY[0,2]::smallint[], '20:00', '21:30');

-- Siti ada di formulir kedua periode dan sudah dialokasikan di September.
INSERT INTO ks_pendaftar (periode_id, sumber_row_key, nama, wa, wa_normal, slot_id, status, pita_umur) VALUES
  ('${ID.sep}', 'k-siti', 'Siti Aminah', '6285000000001', '85000000001', '${ID.slotSep}', 'dialokasikan', '<=45'),
  ('${ID.okt}', 'k-siti', 'Siti Aminah', '6285000000001', '85000000001', '${ID.slotOkt}', 'valid', '<=45'),
  ('${ID.okt}', 'k-rahma', 'Rahma', '6285000000002', '85000000002', '${ID.slotOkt}', 'valid', '46+');
`;

async function gagalInsert(db: PGlite, sql: string): Promise<boolean> {
  try {
    await db.query(sql);
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const db = new PGlite();
  await db.exec(PRASYARAT);
  for (const m of MIGRASI) {
    const sql = readFileSync(`supabase/migrations/${m}.sql`, 'utf8').replace(/^\s*(begin|commit)\s*;\s*$/gim, '');
    await db.exec(sql);
  }
  await db.exec(SEED);

  console.log('\n# migrasi 0077');
  check(
    'pita lama ditolak',
    await gagalInsert(db, `INSERT INTO ks_pendaftar (periode_id, sumber_row_key, pita_umur) VALUES ('${ID.okt}', 'x1', '18-25')`)
  );
  check(
    'status diganti diterima',
    !(await gagalInsert(db, `INSERT INTO ks_pendaftar (periode_id, sumber_row_key, status) VALUES ('${ID.okt}', 'x2', 'diganti')`))
  );
  // PGlite `query` hanya menerima satu statement; siapkan pengisiannya dulu.
  await db.exec(`INSERT INTO ks_pengisian (periode_id, pengajar_id) VALUES ('${ID.okt}', '${ID.khadijah}')`);
  check(
    'prioritas 0 ditolak',
    await gagalInsert(
      db,
      `INSERT INTO ks_ketersediaan (pengisian_id, slot_id, prioritas)
         SELECT id, '${ID.slotOkt}', 0 FROM ks_pengisian WHERE pengajar_id = '${ID.khadijah}'`
    )
  );
  check(
    'sumber pengisian bawaan = form',
    (await db.query<{ sumber: string }>(`SELECT sumber FROM ks_pengisian WHERE pengajar_id = '${ID.khadijah}'`)).rows[0]?.sumber === 'form'
  );
  const pertemuan = await db.query<{ d: number; l: number }>(
    `SELECT jumlah_pertemuan_dasar d, jumlah_pertemuan_lanjutan l FROM ks_periode WHERE id = '${ID.okt}'`
  );
  check('bawaan pertemuan 50/26', pertemuan.rows[0].d === 50 && pertemuan.rows[0].l === 26, JSON.stringify(pertemuan.rows[0]));
  await db.exec(`DELETE FROM ks_pendaftar WHERE sumber_row_key IN ('x1','x2'); DELETE FROM ks_pengisian;`);

  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.PG_POOL_MAX = '1';
  process.env.SESSION_SECRET ??= '0123456789abcdef0123456789abcdef0123';

  try {
    const bentrok = await import('../src/lib/ketersediaan-bentrok');
    const lintas = await import('../src/lib/ketersediaan-lintas-periode');
    const permintaan = await import('../src/lib/ketersediaan-permintaan');
    const periodeLib = await import('../src/lib/ketersediaan-periode');

    console.log('\n# halaqah selesai tidak mengunci');
    {
      const tanpaAcuan = await bentrok.jadwalTerpakaiPengajar(ID.ahmad);
      check('tanpa acuan: dua halaqah mengunci (perilaku lama)', tanpaAcuan.length === 2, JSON.stringify(tanpaAcuan.map((t) => t.nama)));
      const okt = await bentrok.jadwalTerpakaiPengajar(ID.ahmad, { acuan: '2026-10-21' });
      check('acuan 21 Okt: HITS 031 (selesai 30 Agu) tidak mengunci', okt.map((t) => t.nama).join() === 'HITS ABK 2', JSON.stringify(okt.map((t) => t.nama)));
      check('tanggal selesai terbawa', okt[0]?.selesai === '2027-01-08', String(okt[0]?.selesai));
      const bilal = await bentrok.jadwalTerpakaiPengajar(ID.bilal, { acuan: '2026-10-21' });
      check('koreksi pertemuan memperpanjang: HITS 044 masih mengunci', bilal.map((t) => t.nama).join() === 'HITS 044', JSON.stringify(bilal));
    }

    console.log('\n# satu formulir dua periode');
    {
      const terpakai = await lintas.identitasTerpakaiLintasPeriode(ID.okt);
      check('Siti terdeteksi sudah dapat di September', terpakai.get('85000000001|siti aminah') === 'Batch September 2026', JSON.stringify([...terpakai]));
      check('periode September sendiri tidak mengecualikan Siti', (await lintas.identitasTerpakaiLintasPeriode(ID.sep)).size === 0);

      const periode = await periodeLib.getPeriode(ID.okt);
      const slots = await periodeLib.listSlot(ID.okt);
      const ringkas = await permintaan.ringkasSlot(periode!, slots, new Date('2026-09-16T05:00:00Z'));
      const r = ringkas.get(ID.slotOkt)!;
      check('Oktober: antre hanya Rahma', r.antre === 1, JSON.stringify(r));
      check('Oktober: Siti dihitung terpakai_lain', r.terpakai_lain === 1, JSON.stringify(r));
    }

    // ── [SISIPAN IMPOR] ── Task 12 menambahkan uji impor tepat di atas baris ini.
  } finally {
    await server.stop();
    await db.close();
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('UJI GAGAL DIJALANKAN', e);
  process.exit(1);
});
```

- [ ] **Step 2: Jalankan**

Run: `npm run test-ketersediaan-impor`
Expected: semua baris `✓`, baris akhir `N lulus, 0 gagal`, kode keluar 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-ketersediaan-impor.ts
git commit -m "test(ketersediaan): uji integrasi PGlite untuk migrasi 0077 dan aturan baru

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Fase B — Impor xlsx

### Task 10: Pembaca xlsx ketersediaan

**Files:**
- Create: `src/lib/ketersediaan-impor-xlsx.ts`
- Test: `scripts/test-ketersediaan-impor.ts`

- [ ] **Step 1: Tambah pembuat berkas tiruan dan uji pembaca**

Di `scripts/test-ketersediaan-impor.ts`, tepat sebelum `async function gagalInsert(`, tambahkan:

```ts
/**
 * Berkas tiruan dengan susunan yang sama persis dengan berkas nyata 16 Sep 2026:
 * sheet online bertumpuk dua batch, sheet offline tanpa WA, Matraman bertumpuk
 * ikhwan lalu akhwat, dan satu kelas dengan dua waktu berbeda.
 */
async function xlsxTiruan(opsi: { tanpaBaris?: 'bilal-sabtu' } = {}): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  const on = wb.addWorksheet('Online - Ikhwan');
  on.addRow(['KETERSEDIAAN PENGAJAR HITS ONLINE — IKHWAN']);
  on.addRow([]);
  on.addRow(['Batch September 2026 (mulai 3 September 2026)']);
  on.addRow(['No', 'Nama', 'WA', 'Online/Offline', 'Waktu', 'Prioritas']);
  on.addRow([1, 'Ahmad Fauzan', '081111111111', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 1]);
  on.addRow([2, 'Bilal Hakim', '081222222222', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 2]);
  if (opsi.tanpaBaris !== 'bilal-sabtu') {
    on.addRow([3, 'Bilal Hakim', '081222222222', 'Online', 'Sabtu & Ahad 13:00 - 14:30 WIB', 1]);
  }
  on.addRow([4, 'Tanpa Akun', '089999999999', 'Online', 'Sabtu & Ahad 13:00 - 14:30 WIB', 2]);
  on.addRow([]);
  on.addRow(['Batch Oktober 2026 (mulai 19 Oktober 2026)']);
  on.addRow(['No', 'Nama', 'WA', 'Online/Offline', 'Waktu', 'Prioritas']);
  on.addRow([1, 'Bilal Hakim', '081222222222', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 1]);
  on.addRow([2, 'Ahmad Fauzan', '081111111111', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 2]);

  const pj = wb.addWorksheet('Offline - Pejaten Akhwat');
  pj.addRow(['JADWAL KBM HITS OFFLINE — Lokasi Pejaten AKHWAT (Batch September 2026)']);
  pj.addRow([]);
  pj.addRow(['Akhwat']);
  pj.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  pj.addRow([1, 'Ustadzah Khadijah Maryam', 'Offline', "Selasa & Jum'at, 09.00 - 10.30", 'Kelas A']);
  pj.addRow([2, 'Nama Asing', 'Offline', 'Senin & Kamis, 09.00 - 10.30', 'Kelas B']);

  const mt = wb.addWorksheet('Offline - Al-Kautsar Matraman');
  mt.addRow(['JADWAL KBM HITS OFFLINE — Lokasi Masjid Al-Kautsar Matraman (Batch September 2026)']);
  mt.addRow([]);
  mt.addRow(['Ikhwan']);
  mt.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  mt.addRow([1, 'Bilal Hakim', 'Offline', 'Selasa dan Kamis 20.00 - 21.30']);
  mt.addRow([]);
  mt.addRow(['Akhwat']);
  mt.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  mt.addRow([1, 'Aisyah Rahma', 'Offline', 'Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30']);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

```

Di `main()`, tepat sebelum `const db = new PGlite();`, tambahkan:

```ts
  console.log('\n# pembaca xlsx');
  {
    const { bacaKetersediaanXlsx } = await import('../src/lib/ketersediaan-impor-xlsx');
    const hasil = await bacaKetersediaanXlsx(await xlsxTiruan());
    const ringkas = hasil.bagian.map((b) => `${b.kunci}:${b.baris.length}`).join();
    check(
      'tiga bagian dengan jumlah baris benar',
      ringkas === 'online|September 2026:4,online|Oktober 2026:2,offline|September 2026:4',
      ringkas
    );
    const semua = hasil.bagian.flatMap((b) => b.baris);
    const ahmad = semua.find((b) => b.nama === 'Ahmad Fauzan' && b.bagian === 'online|September 2026');
    check('WA dinormalkan', ahmad?.wa === '81111111111', String(ahmad?.wa));
    check('prioritas terbaca', ahmad?.prioritas === 1, String(ahmad?.prioritas));
    check('jam terurai', ahmad?.slot?.label === 'Senin & Rabu 20:00 - 21:30 WIB', String(ahmad?.slot?.label));
    const pejaten = semua.find((b) => b.sheet === 'Offline - Pejaten Akhwat');
    check('lokasi Pejaten dari judul', pejaten?.lokasi === 'Pejaten', String(pejaten?.lokasi));
    check('offline tanpa kolom WA → wa null', pejaten?.wa === null);
    const matIkhwan = semua.find((b) => b.sheet === 'Offline - Al-Kautsar Matraman' && b.gender === 'ikhwan');
    check('lokasi Matraman utuh', matIkhwan?.lokasi === 'Masjid Al-Kautsar Matraman', String(matIkhwan?.lokasi));
    const aisyah = semua.find((b) => b.nama === 'Aisyah Rahma');
    check('bagian kedua Matraman bergender akhwat', aisyah?.gender === 'akhwat');
    check('jam dua waktu ditandai', aisyah?.masalah.join() === 'dua_waktu' && aisyah?.slot === null, JSON.stringify(aisyah?.masalah));
    check('tidak ada baris terlewat', hasil.terlewat.length === 0, JSON.stringify(hasil.terlewat));

    if (process.env.KS_XLSX) {
      const buf = readFileSync(process.env.KS_XLSX);
      const nyata = await bacaKetersediaanXlsx(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      );
      const baris = nyata.bagian.flatMap((b) => b.baris);
      check('berkas nyata: 179 baris', baris.length === 179, String(baris.length));
      check('berkas nyata: 3 jam dua waktu', baris.filter((b) => b.masalah.includes('dua_waktu')).length === 3);
      check('berkas nyata: tiga bagian', nyata.bagian.length === 3, nyata.bagian.map((b) => b.kunci).join());
    }
  }

```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan-impor`
Expected: `UJI GAGAL DIJALANKAN` dengan `Cannot find module '../src/lib/ketersediaan-impor-xlsx'`

- [ ] **Step 3: Implementasi pembaca**

Create `src/lib/ketersediaan-impor-xlsx.ts`:

```ts
import 'server-only';
import ExcelJS from 'exceljs';
import type { Gender, KsMode } from '@/types/db';
import { uraikanSlot, type SlotTerurai } from '@/lib/ketersediaan-slot';
import { normalWa } from '@/lib/ketersediaan-pendaftar';

/**
 * Pembaca berkas "KETERSEDIAAN PENGAJAR HITS" — sumber kebenaran ketersediaan
 * pengajar selama pengajar belum mengisi sendiri di aplikasi.
 *
 * Susunan berkas nyata (16 Sep 2026) dibaca lewat PENANDA, bukan nomor baris:
 *  · sheet online menumpuk beberapa batch — baris "Batch September 2026 …"
 *    membuka bagian, baris sesudahnya kepala kolom (No, Nama, WA, …);
 *  · sheet offline satu batch yang disebut di judul "(Batch September 2026)",
 *    tanpa kolom WA;
 *  · sheet Matraman menumpuk ikhwan lalu akhwat — baris "Ikhwan"/"Akhwat"
 *    mengganti gender.
 * Kolom dikenali dari judulnya supaya urutannya boleh berubah.
 */

export type MasalahBaris = 'jam_tak_terbaca' | 'dua_waktu' | 'wa_tak_sah';

export interface BarisImpor {
  /** Stabil selama berkasnya sama: kunci pilihan manual koordinator. */
  kunci: string;
  sheet: string;
  nomorBaris: number;
  /** Kunci bagian, mis. "online|Oktober 2026". */
  bagian: string;
  gender: Gender;
  mode: KsMode;
  lokasi: string | null;
  nama: string;
  /** Nomor ternormalisasi (tanpa 62/0); null bila sheet tidak punya kolom WA. */
  wa: string | null;
  waktu: string;
  slot: SlotTerurai | null;
  prioritas: number | null;
  masalah: MasalahBaris[];
}

export interface BagianImpor {
  kunci: string;
  judul: string;
  mode: KsMode;
  /** "September 2026" */
  batch: string;
  baris: BarisImpor[];
}

export interface HasilBacaXlsx {
  bagian: BagianImpor[];
  /** Baris data yang tak dapat ditempatkan (gender atau batch tak diketahui) — dilaporkan, tidak ditebak. */
  terlewat: { sheet: string; nomorBaris: number; alasan: string }[];
}

/** Satu rentang jam. Lebih dari satu dalam satu sel = satu kelas berjam beda per hari. */
const POLA_RENTANG = /\d{1,2}\s*[.:]\s*\d{2}\s*[-–—]\s*\d{1,2}\s*[.:]\s*\d{2}/g;

function teks(v: ExcelJS.CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v && v.result !== undefined && v.result !== null) return String(v.result).trim();
    return '';
  }
  return String(v).trim();
}

function batchDari(s: string): string | null {
  const m = s.match(/batch\s+([a-z]+\s+\d{4})/i);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

function lokasiDari(judul: string, namaSheet: string): string | null {
  // "… — Lokasi Pejaten AKHWAT (Batch …)" · "… — Lokasi Masjid Al-Kautsar Matraman (Batch …)"
  const m = judul.match(/lokasi\s+(.+?)\s*(?:\b(?:ikhwan|akhwat)\b\s*)?\(/i);
  if (m) return m[1].trim();
  const dariSheet = namaSheet
    .replace(/^offline\s*-\s*/i, '')
    .replace(/\b(ikhwan|akhwat)\b/gi, '')
    .trim();
  return dariSheet || null;
}

export async function bacaKetersediaanXlsx(data: ArrayBuffer): Promise<HasilBacaXlsx> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);

  const bagian = new Map<string, BagianImpor>();
  const terlewat: HasilBacaXlsx['terlewat'] = [];

  wb.eachSheet((ws) => {
    const judul = teks(ws.getRow(1).getCell(1).value);
    const modeSheet: KsMode = /offline/i.test(`${ws.name} ${judul}`) ? 'offline' : 'online';
    let gender: Gender | null = /akhwat/i.test(ws.name) ? 'akhwat' : /ikhwan/i.test(ws.name) ? 'ikhwan' : null;
    let batch = batchDari(judul);
    const lokasi = modeSheet === 'offline' ? lokasiDari(judul, ws.name) : null;
    let kolom: Map<string, number> | null = null;

    ws.eachRow({ includeEmpty: false }, (row, nomorBaris) => {
      const sel = (i: number) => teks(row.getCell(i).value);
      const pertama = sel(1);
      if (!pertama) return;

      const batchBaris = /^batch\s/i.test(pertama) ? batchDari(pertama) : null;
      if (batchBaris) {
        batch = batchBaris;
        kolom = null;
        return;
      }
      if (/^(ikhwan|akhwat)$/i.test(pertama)) {
        gender = pertama.toLowerCase() as Gender;
        kolom = null;
        return;
      }
      if (/^no\.?$/i.test(pertama)) {
        const peta = new Map<string, number>();
        row.eachCell((cell, i) => peta.set(teks(cell.value).toLowerCase(), i));
        kolom = peta;
        return;
      }

      const petaKolom: Map<string, number> | null = kolom;
      if (!petaKolom || !/^\d+$/.test(pertama)) return;
      const ambil = (nama: string) => {
        const i = petaKolom.get(nama);
        return i ? sel(i) : '';
      };

      const nama = ambil('nama');
      const waktu = ambil('waktu');
      if (!nama || !waktu) return;
      const g: Gender | null = gender;
      const b: string | null = batch;
      if (!g || !b) {
        terlewat.push({ sheet: ws.name, nomorBaris, alasan: !g ? 'gender tidak diketahui' : 'batch tidak diketahui' });
        return;
      }

      const modeTeks = ambil('online/offline');
      const mode: KsMode = /offline/i.test(modeTeks) ? 'offline' : /online/i.test(modeTeks) ? 'online' : modeSheet;
      const waMentah = petaKolom.has('wa') ? ambil('wa') : '';
      const wa = waMentah ? normalWa(waMentah) : null;
      const prioritasTeks = ambil('prioritas');
      const prioritas = /^\d+$/.test(prioritasTeks) && Number(prioritasTeks) > 0 ? Number(prioritasTeks) : null;

      const masalah: MasalahBaris[] = [];
      const rentang = waktu.match(POLA_RENTANG) ?? [];
      const slot = rentang.length > 1 ? null : uraikanSlot(waktu);
      if (rentang.length > 1) masalah.push('dua_waktu');
      else if (!slot) masalah.push('jam_tak_terbaca');
      if (waMentah && !wa) masalah.push('wa_tak_sah');

      const kunciBagian = `${mode}|${b}`;
      if (!bagian.has(kunciBagian)) {
        bagian.set(kunciBagian, {
          kunci: kunciBagian,
          judul: `${mode === 'online' ? 'Online' : 'Offline'} · Batch ${b}`,
          mode,
          batch: b,
          baris: [],
        });
      }
      bagian.get(kunciBagian)!.baris.push({
        kunci: `${ws.name}#${nomorBaris}`,
        sheet: ws.name,
        nomorBaris,
        bagian: kunciBagian,
        gender: g,
        mode,
        lokasi: mode === 'offline' ? lokasi : null,
        nama,
        wa,
        waktu,
        slot,
        prioritas,
        masalah,
      });
    });
  });

  return { bagian: [...bagian.values()], terlewat };
}
```

- [ ] **Step 4: Jalankan uji**

Run: `npm run test-ketersediaan-impor`
Expected: semua `✓` di bagian `# pembaca xlsx` dan bagian lain tetap `✓`.

Lalu periksa berkas nyata (tidak di-commit, hanya dibaca):

Run: `KS_XLSX="/data/Downloads/04_Dev-Projects/setoran-hafalan-skeleton/setoran-hafalan/docs/KETERSEDIAAN PENGAJAR HITS '26.xlsx" npm run test-ketersediaan-impor`
Expected: tiga baris `berkas nyata: …` bertanda `✓`

- [ ] **Step 5: Typecheck dan commit**

Run: `npm run typecheck`
Expected: tanpa galat

```bash
git add src/lib/ketersediaan-impor-xlsx.ts scripts/test-ketersediaan-impor.ts
git commit -m "feat(ketersediaan): pembaca xlsx ketersediaan pengajar berbasis penanda bagian

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Pencocok akun pengajar

**Files:**
- Create: `src/lib/ketersediaan-impor-cocok.ts`
- Test: `scripts/test-ketersediaan-impor.ts`

- [ ] **Step 1: Tulis uji yang gagal**

Di `scripts/test-ketersediaan-impor.ts`, tepat sebelum `const db = new PGlite();` (sesudah blok `# pembaca xlsx`), tambahkan:

```ts
  console.log('\n# pencocokan akun pengajar');
  {
    const { cocokkanPengajar, namaPengajarNormal } = await import('../src/lib/ketersediaan-impor-cocok');
    const daftar = [
      { id: 'p-adam', name: 'Adam Malik', gender: 'ikhwan' as const, whatsapp_number: '6281500000001', active: true },
      { id: 'p-khad', name: 'Khadijah Maryam', gender: 'akhwat' as const, whatsapp_number: '6281500000002', active: true },
      { id: 'p-mf1', name: 'Muhammad Fauzi', gender: 'ikhwan' as const, whatsapp_number: '6281500000003', active: true },
      { id: 'p-mf2', name: 'Fauzi Muhammad Ali', gender: 'ikhwan' as const, whatsapp_number: '6281500000004', active: true },
      { id: 'p-mati', name: 'Umar Said', gender: 'ikhwan' as const, whatsapp_number: '6281500000005', active: false },
    ];
    check('gelar dibuang', namaPengajarNormal('Ustadzah  Khadijah Maryam') === 'khadijah maryam');
    check('cocok lewat WA', cocokkanPengajar({ nama: 'siapa saja', wa: '81500000001', gender: 'ikhwan' }, daftar).pengajar_id === 'p-adam');
    check('WA tanpa akun tidak jatuh ke nama', cocokkanPengajar({ nama: 'Adam Malik', wa: '89999999999', gender: 'ikhwan' }, daftar).status === 'tanpa_akun');
    check('WA milik akun bergender lain', cocokkanPengajar({ nama: 'x', wa: '81500000002', gender: 'ikhwan' }, daftar).status === 'gender_beda');
    check('nama persis setelah gelar dibuang', cocokkanPengajar({ nama: 'Ustadzah Khadijah Maryam', wa: null, gender: 'akhwat' }, daftar).pengajar_id === 'p-khad');
    const panjang = cocokkanPengajar({ nama: 'Adam Malik Nurzuhdi Al Suyudi', wa: null, gender: 'ikhwan' }, daftar);
    check('nama panjang cocok lewat dua kata', panjang.pengajar_id === 'p-adam' && panjang.cara === 'nama', JSON.stringify(panjang));
    check('dua kandidat → nama_ganda', cocokkanPengajar({ nama: 'Fauzi Muhammad', wa: null, gender: 'ikhwan' }, daftar).status === 'nama_ganda');
    check('akun nonaktif tidak dipakai', cocokkanPengajar({ nama: 'Umar Said', wa: null, gender: 'ikhwan' }, daftar).status === 'nama_tak_ketemu');
    check('pilihan manual dipakai', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'akhwat' }, daftar, 'p-khad').cara === 'manual');
    check('pilihan manual beda gender ditolak', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'ikhwan' }, daftar, 'p-khad').pengajar_id === null);
    check('pilihan lewati', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'akhwat' }, daftar, 'lewati').status === 'dilewati');
  }

```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan-impor`
Expected: `Cannot find module '../src/lib/ketersediaan-impor-cocok'`

- [ ] **Step 3: Implementasi**

Create `src/lib/ketersediaan-impor-cocok.ts`:

```ts
import 'server-only';
import type { Gender } from '@/types/db';
import { normalWa } from '@/lib/ketersediaan-pendaftar';

/**
 * Cocokkan satu baris xlsx ke akun `pengajar`.
 *
 * Nomor WA dipakai bila ada — itu identitas login aplikasi ini. Nomor yang tidak
 * punya akun TIDAK jatuh ke pencocokan nama: nama mirip bukan bukti orang yang
 * sama, dan memasangkannya diam-diam lebih berbahaya daripada melewatinya.
 *
 * Sheet offline tidak punya kolom WA, jadi dicocokkan lewat nama pada pengajar
 * aktif segender: persis setelah gelar dibuang, lalu sekurangnya dua kata sama.
 * Diuji 16 Sep 2026 terhadap 20 pengajar offline: 16 cocok tunggal, 5 tidak
 * ditemukan, 0 ganda. Yang tidak tunggal dipilihkan koordinator.
 */

export interface PengajarRingkas {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  active: boolean;
}

export type StatusCocok = 'cocok' | 'tanpa_akun' | 'gender_beda' | 'nama_tak_ketemu' | 'nama_ganda' | 'dilewati';

export interface HasilCocok {
  pengajar_id: string | null;
  status: StatusCocok;
  cara: 'wa' | 'nama' | 'manual' | null;
  /** Nama akun yang dipasangkan — ditampilkan supaya koordinator bisa memeriksa. */
  nama_akun: string | null;
  kandidat: { id: string; name: string }[];
}

const GELAR = new Set(['ustadz', 'ustadzah', 'ust', 'ustz', 'al', 'bin', 'binti']);

export function namaPengajarNormal(nama: string): string {
  return nama
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .split(' ')
    .filter((t) => t && !GELAR.has(t))
    .join(' ');
}

function kata(nama: string): Set<string> {
  return new Set(namaPengajarNormal(nama).split(' ').filter((t) => t.length > 2));
}

const hasil = (h: Partial<HasilCocok> & Pick<HasilCocok, 'status'>): HasilCocok => ({
  pengajar_id: null,
  cara: null,
  nama_akun: null,
  kandidat: [],
  ...h,
});

export function cocokkanPengajar(
  baris: { nama: string; wa: string | null; gender: Gender },
  daftar: readonly PengajarRingkas[],
  /** id pengajar pilihan koordinator, atau 'lewati'. */
  pilihan?: string
): HasilCocok {
  const aktif = daftar.filter((p) => p.active);

  if (pilihan === 'lewati') return hasil({ status: 'dilewati', cara: 'manual' });
  if (pilihan) {
    const p = aktif.find((x) => x.id === pilihan && x.gender === baris.gender);
    return p
      ? hasil({ status: 'cocok', cara: 'manual', pengajar_id: p.id, nama_akun: p.name })
      : hasil({ status: 'nama_tak_ketemu', cara: 'manual' });
  }

  if (baris.wa) {
    const p = aktif.find((x) => normalWa(x.whatsapp_number) === baris.wa);
    if (!p) return hasil({ status: 'tanpa_akun', cara: 'wa' });
    if (p.gender !== baris.gender) return hasil({ status: 'gender_beda', cara: 'wa', nama_akun: p.name });
    return hasil({ status: 'cocok', cara: 'wa', pengajar_id: p.id, nama_akun: p.name });
  }

  const segender = aktif.filter((p) => p.gender === baris.gender);
  const sasaran = namaPengajarNormal(baris.nama);
  let cocok = segender.filter((p) => namaPengajarNormal(p.name) === sasaran);
  if (cocok.length === 0) {
    const k = kata(baris.nama);
    const syarat = Math.min(2, k.size);
    cocok =
      syarat === 0
        ? []
        : segender.filter((p) => {
            const milik = kata(p.name);
            let sama = 0;
            for (const x of k) if (milik.has(x)) sama++;
            return sama >= syarat;
          });
  }

  if (cocok.length === 1) {
    return hasil({ status: 'cocok', cara: 'nama', pengajar_id: cocok[0].id, nama_akun: cocok[0].name });
  }
  if (cocok.length > 1) {
    return hasil({ status: 'nama_ganda', cara: 'nama', kandidat: cocok.map(({ id, name }) => ({ id, name })) });
  }
  return hasil({ status: 'nama_tak_ketemu', cara: 'nama' });
}
```

- [ ] **Step 4: Jalankan uji dan typecheck**

Run: `npm run test-ketersediaan-impor && npm run typecheck`
Expected: semua `✓`, typecheck tanpa galat

- [ ] **Step 5: Commit**

```bash
git add src/lib/ketersediaan-impor-cocok.ts scripts/test-ketersediaan-impor.ts
git commit -m "feat(ketersediaan): pencocok akun pengajar untuk impor — WA dulu, nama untuk sheet offline

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Pratinjau dan penulis impor

**Files:**
- Create: `src/lib/ketersediaan-impor.ts`
- Test: `scripts/test-ketersediaan-impor.ts` (menggantikan baris penanda `// ── [SISIPAN IMPOR] ──`)

- [ ] **Step 1: Tulis uji integrasi yang gagal**

Di `scripts/test-ketersediaan-impor.ts`, ganti baris:

```ts
    // ── [SISIPAN IMPOR] ── Task 12 menambahkan uji impor tepat di atas baris ini.
```

dengan:

```ts
    console.log('\n# impor xlsx ke basis data');
    {
      const impor = await import('../src/lib/ketersediaan-impor');
      const { supabaseAdmin } = await import('../src/lib/supabase-admin');
      const { getPool } = await import('../src/lib/pg-core');
      const q = async <T,>(sql: string, p: unknown[] = []) => (await getPool().query(sql, p)).rows as T[];
      const aktor = { wa: '628100000009', nama: 'Koor Uji' };

      // Ahmad dan Khadijah sudah mengisi sendiri di Oktober — impor tidak boleh menyentuhnya.
      await supabaseAdmin.from('ks_pengisian').insert({ periode_id: ID.okt, pengajar_id: ID.ahmad, sumber: 'form', komitmen: true });
      await supabaseAdmin.from('ks_pengisian').insert({ periode_id: ID.okt, pengajar_id: ID.khadijah, sumber: 'form', komitmen: true });

      const berkas = await xlsxTiruan();
      const pilihan = { tujuan: {} as Record<string, string>, manual: {} as Record<string, string> };
      const pratinjau = await impor.susunPratinjau(berkas, pilihan);
      const tebak = Object.fromEntries(pratinjau.bagian.map((b) => [b.kunci, b.tujuan]));
      check(
        'tujuan ditebak dari nama bulan',
        tebak['online|September 2026'] === ID.sep && tebak['offline|September 2026'] === ID.sep && tebak['online|Oktober 2026'] === ID.okt,
        JSON.stringify(tebak)
      );
      const asing = pratinjau.baris.find((b) => b.nama === 'Nama Asing')!;
      check('nama asing perlu dipilih', asing.cocok.status === 'nama_tak_ketemu' && !asing.siap);
      check('tanpa akun terdeteksi', pratinjau.baris.find((b) => b.nama === 'Tanpa Akun')?.cocok.status === 'tanpa_akun');
      check(
        'Khadijah offline cocok lewat nama',
        pratinjau.baris.find((b) => b.sheet === 'Offline - Pejaten Akhwat' && b.cocok.pengajar_id === ID.khadijah)?.cocok.cara === 'nama'
      );

      pilihan.manual[asing.kunci] = 'lewati';
      const h1 = await impor.simpanImpor(berkas, pilihan, aktor, 'uji.xlsx');
      const sep1 = h1.periode.find((p) => p.id === ID.sep)!;
      const okt1 = h1.periode.find((p) => p.id === ID.okt)!;
      check('September: 3 pengajar, 5 jam, 4 jam baru', sep1.pengajar === 3 && sep1.jam === 5 && sep1.slotBaru === 4, JSON.stringify(sep1));
      check('Oktober: Bilal masuk, Ahmad dilindungi', okt1.pengajar === 1 && okt1.jam === 1 && okt1.dilindungi === 1 && okt1.slotBaru === 1, JSON.stringify(okt1));

      const ket = await q<{ nama: string; label: string; prioritas: number | null; bentrok_alasan: string | null; lokasi: string | null; sumber: string; pmode: string }>(
        `select p.name nama, s.label, k.prioritas, k.bentrok_alasan, s.lokasi, i.sumber, i.mode pmode
           from ks_ketersediaan k
           join ks_pengisian i on i.id = k.pengisian_id
           join pengajar p on p.id = i.pengajar_id
           join ks_slot s on s.id = k.slot_id
          where i.periode_id = $1
          order by p.name, s.label`,
        [ID.sep]
      );
      const bilalSabtu = ket.find((k) => k.nama === 'Bilal Hakim' && k.label.startsWith('Sabtu'));
      check('bentrok dicatat, tidak mengunci', Boolean(bilalSabtu?.bentrok_alasan?.includes('HITS 044')), JSON.stringify(bilalSabtu));
      check('halaqah yang sudah selesai tidak tercatat bentrok', ket.find((k) => k.nama === 'Ahmad Fauzan')?.bentrok_alasan === null);
      check('prioritas per jam tersimpan', ket.find((k) => k.nama === 'Bilal Hakim' && k.label.startsWith('Senin'))?.prioritas === 2);
      check('lokasi offline dari judul sheet', ket.find((k) => k.nama === 'Khadijah Maryam')?.lokasi === 'Pejaten');
      check('pengisian Bilal = keduanya', ket.find((k) => k.nama === 'Bilal Hakim')?.pmode === 'keduanya');
      check('semua pengisian September bersumber impor', ket.every((k) => k.sumber === 'impor'));
      const formOkt = await q<{ nama: string }>(
        `select p.name nama from ks_pengisian i join pengajar p on p.id = i.pengajar_id
          where i.periode_id = $1 and i.sumber = 'form' order by 1`,
        [ID.okt]
      );
      check('isian sendiri di Oktober utuh', formOkt.map((r) => r.nama).join() === 'Ahmad Fauzan,Khadijah Maryam', JSON.stringify(formOkt));

      const h2 = await impor.simpanImpor(berkas, pilihan, aktor, 'uji.xlsx');
      const sep2 = h2.periode.find((p) => p.id === ID.sep)!;
      check('impor ulang idempoten', sep2.jam === 5 && sep2.slotBaru === 0 && sep2.dihapus === 0, JSON.stringify(sep2));
      const slotSep = await q<{ n: string }>(`select count(*)::text n from ks_slot where periode_id = $1`, [ID.sep]);
      check('master September: 1 lama + 4 dari impor', slotSep[0].n === '5', slotSep[0].n);

      const h3 = await impor.simpanImpor(await xlsxTiruan({ tanpaBaris: 'bilal-sabtu' }), pilihan, aktor, 'uji.xlsx');
      check('jam yang hilang dari berkas dihapus', h3.periode.find((p) => p.id === ID.sep)?.dihapus === 1, JSON.stringify(h3.periode));

      const log = await q<{ n: string }>(`select count(*)::text n from ks_log where aksi = 'impor_ketersediaan'`);
      check('setiap impor tercatat per periode', log[0].n === '6', log[0].n);
    }
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan-impor`
Expected: `Cannot find module '../src/lib/ketersediaan-impor'`

- [ ] **Step 3: Implementasi**

Create `src/lib/ketersediaan-impor.ts`:

```ts
import 'server-only';
import { getPool } from '@/lib/pg-core';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsModePengajar, KsPeriode } from '@/types/db';
import { listPeriode } from '@/lib/ketersediaan-periode';
import { alasanTerkunci, jadwalTerpakaiPengajar, kunciSlot, type JadwalTerpakai } from '@/lib/ketersediaan-bentrok';
import { bacaKetersediaanXlsx, type BarisImpor } from '@/lib/ketersediaan-impor-xlsx';
import { cocokkanPengajar, type HasilCocok, type PengajarRingkas } from '@/lib/ketersediaan-impor-cocok';

/**
 * Impor ketersediaan pengajar dari xlsx: pratinjau dulu, lalu simpan.
 *
 * Aturan tulis (spec §4.2):
 *  · satu ks_pengisian per (periode, pengajar) bersumber 'impor', status aktif;
 *  · satu ks_ketersediaan per jam, 'terverifikasi', membawa prioritas per jam;
 *  · jam yang belum ada di master periode dibuatkan;
 *  · impor ulang MENGGANTIKAN hasil impor sebelumnya — jam dan pengajar yang tak
 *    ada lagi di berkas dihapus. Isian bersumber 'form' tidak pernah disentuh;
 *  · bentrok jadwal hanya DICATAT, tidak mengunci: koordinator yang menyusun xlsx
 *    sudah menyaring jadwal;
 *  · satu transaksi per periode — gagal di tengah, tak ada yang tersimpan.
 */

export interface PilihanImpor {
  /** kunci bagian → id periode tujuan */
  tujuan: Record<string, string>;
  /** kunci baris → id pengajar, atau 'lewati' */
  manual: Record<string, string>;
}

export interface BarisPratinjau extends BarisImpor {
  cocok: HasilCocok;
  siap: boolean;
}

export interface BagianPratinjau {
  kunci: string;
  judul: string;
  batch: string;
  baris: number;
  pengajar: number;
  siap: number;
  bermasalah: number;
  /** Pilihan koordinator, atau tebakan dari nama bulan bila hanya satu periode cocok. */
  tujuan: string | null;
}

export interface Pratinjau {
  bagian: BagianPratinjau[];
  baris: BarisPratinjau[];
  pengajar: Record<Gender, { id: string; name: string }[]>;
  periode: { id: string; nama: string; mulai: string }[];
}

export interface HasilPeriode {
  id: string;
  nama: string;
  pengajar: number;
  jam: number;
  slotBaru: number;
  /** Jam milik pengajar terimpor yang tak ada lagi di berkas. */
  dihapus: number;
  /** Pengajar hasil impor lama yang tak ada lagi di berkas. */
  pengajarDihapus: number;
  /** Pengajar yang dilewati karena sudah mengisi sendiri. */
  dilindungi: number;
}

export interface HasilSimpan {
  periode: HasilPeriode[];
  /** Baris yang tidak diimpor: bermasalah, tanpa akun, atau dilewati. */
  dilewati: number;
}

export function barisSiap(r: Pick<BarisPratinjau, 'masalah' | 'slot' | 'cocok'>): boolean {
  return r.masalah.length === 0 && r.slot !== null && r.cocok.status === 'cocok' && r.cocok.pengajar_id !== null;
}

function tebakTujuan(batch: string, periode: readonly KsPeriode[]): string | null {
  const bulan = batch.split(/\s+/)[0]?.toLowerCase();
  if (!bulan) return null;
  const cocok = periode.filter((p) => p.nama.toLowerCase().includes(bulan));
  return cocok.length === 1 ? cocok[0].id : null;
}

const urutNama = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export async function susunPratinjau(data: ArrayBuffer, pilihan: PilihanImpor): Promise<Pratinjau> {
  const [{ bagian }, periode, { data: pengajarRows }] = await Promise.all([
    bacaKetersediaanXlsx(data),
    listPeriode(),
    supabaseAdmin.from('pengajar').select('id, name, gender, whatsapp_number, active'),
  ]);
  const daftar = (pengajarRows ?? []) as PengajarRingkas[];

  const baris: BarisPratinjau[] = bagian.flatMap((b) =>
    b.baris.map((r) => {
      const cocok = cocokkanPengajar(r, daftar, pilihan.manual[r.kunci]);
      return { ...r, cocok, siap: barisSiap({ masalah: r.masalah, slot: r.slot, cocok }) };
    })
  );

  const ringkasBagian: BagianPratinjau[] = bagian.map((b) => {
    const milik = baris.filter((r) => r.bagian === b.kunci);
    const siap = milik.filter((r) => r.siap).length;
    return {
      kunci: b.kunci,
      judul: b.judul,
      batch: b.batch,
      baris: milik.length,
      pengajar: new Set(milik.map((r) => r.cocok.pengajar_id ?? `?${r.nama}`)).size,
      siap,
      bermasalah: milik.length - siap,
      tujuan: pilihan.tujuan[b.kunci] ?? tebakTujuan(b.batch, periode),
    };
  });

  const aktif = daftar.filter((p) => p.active);
  return {
    bagian: ringkasBagian,
    baris,
    pengajar: {
      ikhwan: aktif.filter((p) => p.gender === 'ikhwan').map(({ id, name }) => ({ id, name })).sort(urutNama),
      akhwat: aktif.filter((p) => p.gender === 'akhwat').map(({ id, name }) => ({ id, name })).sort(urutNama),
    },
    periode: periode.map((p) => ({ id: p.id, nama: p.nama, mulai: p.mulai })),
  };
}

export async function simpanImpor(
  data: ArrayBuffer,
  pilihan: PilihanImpor,
  aktor: { wa: string | null; nama: string },
  namaBerkas: string
): Promise<HasilSimpan> {
  const pratinjau = await susunPratinjau(data, pilihan);

  const tanpaTujuan = pratinjau.bagian.filter((b) => b.siap > 0 && !b.tujuan);
  if (tanpaTujuan.length > 0) {
    throw new Error(`Pilih periode tujuan untuk: ${tanpaTujuan.map((b) => b.judul).join(', ')}.`);
  }

  const tujuanBagian = new Map(pratinjau.bagian.map((b) => [b.kunci, b.tujuan]));
  const perPeriode = new Map<string, BarisPratinjau[]>();
  for (const r of pratinjau.baris) {
    const t = r.siap ? tujuanBagian.get(r.bagian) : null;
    if (!t) continue;
    if (!perPeriode.has(t)) perPeriode.set(t, []);
    perPeriode.get(t)!.push(r);
  }

  const periodeById = new Map((await listPeriode()).map((p) => [p.id, p]));
  const hasil: HasilSimpan = { periode: [], dilewati: pratinjau.baris.filter((r) => !r.siap).length };
  for (const [periodeId, rows] of perPeriode) {
    const periode = periodeById.get(periodeId);
    if (!periode) throw new Error('Periode tujuan tidak ditemukan. Muat ulang halaman.');
    hasil.periode.push(await simpanSatuPeriode(periode, rows, aktor, namaBerkas));
  }
  return hasil;
}

/** Offline di lokasi berbeda pada jam yang sama adalah dua jam berbeda. */
function kunciJam(g: Gender, mode: string, hariIdx: readonly number[], mulai: string, lokasi: string | null): string {
  const tempat = mode === 'offline' ? (lokasi ?? '').trim().toLowerCase() : '';
  return `${g}|${mode}|${hariIdx.join(',')}|${mulai.slice(0, 5)}|${tempat}`;
}

async function simpanSatuPeriode(
  periode: KsPeriode,
  rows: readonly BarisPratinjau[],
  aktor: { wa: string | null; nama: string },
  namaBerkas: string
): Promise<HasilPeriode> {
  // 1. Kelompokkan per pengajar. Jam kembar untuk orang yang sama: prioritas terkecil.
  const perPengajar = new Map<string, Map<string, BarisPratinjau>>();
  for (const r of rows) {
    const pid = r.cocok.pengajar_id!;
    const k = kunciJam(r.gender, r.mode, r.slot!.hari_idx, r.slot!.waktu_mulai, r.lokasi);
    if (!perPengajar.has(pid)) perPengajar.set(pid, new Map());
    const jam = perPengajar.get(pid)!;
    const lama = jam.get(k);
    if (!lama || (r.prioritas ?? Number.MAX_SAFE_INTEGER) < (lama.prioritas ?? Number.MAX_SAFE_INTEGER)) {
      jam.set(k, r);
    }
  }

  // 2. Bentrok dibaca SEBELUM transaksi, lewat koneksi terpisah, supaya
  //    transaksinya pendek dan tidak menunggu koneksi lain.
  const cacheSelesaiBatch = new Map<string, string | null>();
  const terpakai = new Map<string, JadwalTerpakai[]>();
  for (const pid of perPengajar.keys()) {
    terpakai.set(pid, await jadwalTerpakaiPengajar(pid, { acuan: periode.mulai, cacheSelesaiBatch }));
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const { rows: slotRows } = await client.query<{
      id: string;
      kelompok: Gender;
      mode: string;
      hari_idx: number[];
      waktu_mulai: string;
      lokasi: string | null;
      urutan: number;
    }>(
      `select id, kelompok::text as kelompok, mode, hari_idx, waktu_mulai::text as waktu_mulai, lokasi, urutan
         from ks_slot where periode_id = $1`,
      [periode.id]
    );
    const slotId = new Map(slotRows.map((s) => [kunciJam(s.kelompok, s.mode, s.hari_idx, s.waktu_mulai, s.lokasi), s.id]));
    let urutan = slotRows.reduce((m, s) => Math.max(m, s.urutan), 0);

    let slotBaru = 0;
    let jam = 0;
    let dihapus = 0;
    let dilindungi = 0;
    const tersimpan: string[] = [];

    for (const [pid, jamMilik] of perPengajar) {
      const semua = [...jamMilik.values()];
      const modes = new Set(semua.map((r) => r.mode));
      const mode: KsModePengajar = modes.size > 1 ? 'keduanya' : semua[0].mode;
      const lokasi = semua.find((r) => r.mode === 'offline')?.lokasi ?? null;

      const { rows: pengisian } = await client.query<{ id: string }>(
        `insert into ks_pengisian (periode_id, pengajar_id, mode, lokasi, komitmen, submitted_at, status, sumber)
         values ($1, $2, $3, $4, true, now(), 'aktif', 'impor')
         on conflict (periode_id, pengajar_id) do update
           set mode = excluded.mode, lokasi = excluded.lokasi, komitmen = true, status = 'aktif',
               submitted_at = now(), updated_at = now()
           where ks_pengisian.sumber = 'impor'
         returning id`,
        [periode.id, pid, mode, lokasi]
      );
      if (pengisian.length === 0) {
        dilindungi++;
        continue;
      }
      const pengisianId = pengisian[0].id;
      tersimpan.push(pid);

      const slotMilik: string[] = [];
      for (const [k, r] of jamMilik) {
        const s = r.slot!;
        let sid = slotId.get(k);
        if (!sid) {
          const { rows: baru } = await client.query<{ id: string }>(
            `insert into ks_slot (periode_id, kelompok, mode, label, hari, hari_idx, waktu_mulai, waktu_selesai, lokasi, urutan)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             returning id`,
            [
              periode.id,
              r.gender,
              r.mode,
              s.label,
              s.hari,
              s.hari_idx,
              s.waktu_mulai,
              s.waktu_selesai,
              r.mode === 'offline' ? (r.lokasi ?? 'Offline') : null,
              ++urutan,
            ]
          );
          sid = baru[0].id;
          slotId.set(k, sid);
          slotBaru++;
        }
        slotMilik.push(sid);

        const tabrakan = kunciSlot(
          [{ id: sid, hari_idx: s.hari_idx, waktu_mulai: s.waktu_mulai, waktu_selesai: s.waktu_selesai }],
          terpakai.get(pid) ?? []
        ).get(sid);

        await client.query(
          `insert into ks_ketersediaan (pengisian_id, slot_id, status, prioritas, bentrok_alasan)
           values ($1, $2, 'terverifikasi', $3, $4)
           on conflict (pengisian_id, slot_id) do update
             set status = 'terverifikasi', prioritas = excluded.prioritas,
                 bentrok_alasan = excluded.bentrok_alasan, updated_at = now()`,
          [pengisianId, sid, r.prioritas, tabrakan ? alasanTerkunci(tabrakan) : null]
        );
        jam++;
      }

      const hapusJam = await client.query(
        'delete from ks_ketersediaan where pengisian_id = $1 and not (slot_id = any($2::uuid[]))',
        [pengisianId, slotMilik]
      );
      dihapus += hapusJam.rowCount ?? 0;
    }

    const hapusPengajar = await client.query(
      `delete from ks_pengisian
        where periode_id = $1 and sumber = 'impor' and not (pengajar_id = any($2::uuid[]))`,
      [periode.id, [...perPengajar.keys()]]
    );
    const pengajarDihapus = hapusPengajar.rowCount ?? 0;

    await client.query(
      `insert into ks_log (periode_id, entitas, aksi, sesudah, aktor_wa, aktor_nama)
       values ($1, 'ks_pengisian', 'impor_ketersediaan', $2::jsonb, $3, $4)`,
      [
        periode.id,
        JSON.stringify({ berkas: namaBerkas, pengajar: tersimpan.length, jam, slot_baru: slotBaru, dihapus, pengajar_dihapus: pengajarDihapus, dilindungi }),
        aktor.wa,
        aktor.nama,
      ]
    );

    await client.query('COMMIT');
    return { id: periode.id, nama: periode.nama, pengajar: tersimpan.length, jam, slotBaru, dihapus, pengajarDihapus, dilindungi };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Jalankan uji dan typecheck**

Run: `npm run test-ketersediaan-impor && npm run typecheck`
Expected: semua `✓` termasuk bagian `# impor xlsx ke basis data`; typecheck tanpa galat

- [ ] **Step 5: Commit**

```bash
git add src/lib/ketersediaan-impor.ts scripts/test-ketersediaan-impor.ts
git commit -m "feat(ketersediaan): pratinjau & simpan impor ketersediaan dalam satu transaksi per periode

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Server action impor

**Files:**
- Create: `src/app/ketersediaan/koordinator/impor/actions.ts`

- [ ] **Step 1: Implementasi**

Create `src/app/ketersediaan/koordinator/impor/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireOneOfRoles } from '@/lib/session';
import { bolehLihatFiturTersembunyi } from '@/lib/admin-guard';
import { getSessionWa } from '@/lib/program-kelas';
import { simpanImpor, susunPratinjau, type PilihanImpor, type Pratinjau } from '@/lib/ketersediaan-impor';

export type HasilPratinjau = { ok: true; pratinjau: Pratinjau } | { ok: false; error: string };
export type HasilSimpanImpor = { ok: true; pesan: string } | { ok: false; error: string };

const BATAS_BYTE = 5 * 1024 * 1024;

async function jaga(): Promise<{ wa: string | null; nama: string } | string> {
  const sesi = await requireOneOfRoles(['koordinator']);
  if (!(await bolehLihatFiturTersembunyi())) return 'Fitur ini belum dibuka.';
  return { wa: await getSessionWa(), nama: sesi.name };
}

async function bacaForm(fd: FormData): Promise<{ data: ArrayBuffer; nama: string; pilihan: PilihanImpor } | string> {
  const berkas = fd.get('berkas');
  // Runtime produksi tidak punya global File: `instanceof File` selalu false dan
  // unggahan terbuang diam-diam. Yang diperiksa bentuknya.
  if (!berkas || typeof berkas === 'string' || typeof (berkas as Blob).arrayBuffer !== 'function') {
    return 'Pilih berkas xlsx dulu.';
  }
  const b = berkas as Blob & { name?: string };
  if (!/\.xlsx$/i.test(b.name ?? '')) return 'Berkas harus berformat .xlsx.';
  if (b.size > BATAS_BYTE) return 'Berkas lebih dari 5 MB.';

  let pilihan: PilihanImpor = { tujuan: {}, manual: {} };
  const mentah = fd.get('pilihan');
  if (typeof mentah === 'string' && mentah) {
    try {
      const p = JSON.parse(mentah) as Partial<PilihanImpor>;
      pilihan = { tujuan: p.tujuan ?? {}, manual: p.manual ?? {} };
    } catch {
      return 'Pilihan tidak terbaca. Muat ulang halaman.';
    }
  }
  return { data: await b.arrayBuffer(), nama: b.name ?? 'ketersediaan.xlsx', pilihan };
}

export async function pratinjauImporXlsx(fd: FormData): Promise<HasilPratinjau> {
  const aktor = await jaga();
  if (typeof aktor === 'string') return { ok: false, error: aktor };
  const form = await bacaForm(fd);
  if (typeof form === 'string') return { ok: false, error: form };
  try {
    return { ok: true, pratinjau: await susunPratinjau(form.data, form.pilihan) };
  } catch (e) {
    return { ok: false, error: `Berkas tidak dapat dibaca: ${(e as Error).message}` };
  }
}

export async function simpanImporXlsx(fd: FormData): Promise<HasilSimpanImpor> {
  const aktor = await jaga();
  if (typeof aktor === 'string') return { ok: false, error: aktor };
  const form = await bacaForm(fd);
  if (typeof form === 'string') return { ok: false, error: form };
  try {
    const h = await simpanImpor(form.data, form.pilihan, aktor, form.nama);
    revalidatePath('/ketersediaan/koordinator');
    const perPeriode = h.periode.map((p) => {
      const bagian = [`${p.pengajar} pengajar, ${p.jam} jam`];
      if (p.slotBaru) bagian.push(`${p.slotBaru} jam baru di master`);
      if (p.dihapus) bagian.push(`${p.dihapus} jam lama dihapus`);
      if (p.pengajarDihapus) bagian.push(`${p.pengajarDihapus} pengajar tak lagi di berkas`);
      if (p.dilindungi) bagian.push(`${p.dilindungi} dilewati karena mengisi sendiri`);
      return `${p.nama}: ${bagian.join(', ')}`;
    });
    return { ok: true, pesan: `Tersimpan. ${perPeriode.join(' · ')}. ${h.dilewati} baris tidak diimpor.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: tanpa galat

- [ ] **Step 3: Commit**

```bash
git add src/app/ketersediaan/koordinator/impor/actions.ts
git commit -m "feat(ketersediaan): server action pratinjau & simpan impor xlsx

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Gaya dashboard `.ks-*`

**Files:**
- Modify: `src/app/globals.css` (tambah di akhir berkas)

Semua kelas diberi awalan `ks-` supaya tidak mengganggu halaman lain. Warna hanya dari token yang ada. Heatmap memakai satu hue biru bergradasi (tervalidasi, spec §7.6), teks sel putih pada dua tingkat tergelap.

- [ ] **Step 1: Tambahkan CSS**

Tambahkan di akhir `src/app/globals.css`:

```css
/* =========================================================
   Ketersediaan Mengajar — dashboard koordinator (.ks-*)
   ========================================================= */
.ks-periode { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 14px; }
.ks-periode-kartu {
  display: grid; gap: 4px; padding: 12px 14px; text-decoration: none; color: var(--ink);
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md);
}
.ks-periode-kartu:hover { border-color: var(--line-2); }
.ks-periode-kartu[aria-current="true"] {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 16%, transparent);
}
.ks-periode-kartu .nm { font-weight: 700; font-size: 15px; }
.ks-periode-kartu .meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }

.ks-kontrol { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.ks-seg { display: inline-flex; gap: 2px; padding: 3px; background: var(--surface-3); border-radius: 9px; }
.ks-seg a { padding: 6px 14px; border-radius: 7px; font-size: 13px; font-weight: 600; color: var(--muted); text-decoration: none; }
.ks-seg a[aria-current="true"] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-card); }

.ks-tab { display: flex; gap: 2px; margin-top: 18px; border-bottom: 1px solid var(--line-2); overflow-x: auto; }
.ks-tab a {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; margin-bottom: -1px;
  font-size: 13.5px; font-weight: 600; color: var(--muted); text-decoration: none; white-space: nowrap;
  border-bottom: 2px solid transparent;
}
.ks-tab a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--ink); }
.ks-tab .n { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: var(--merah-tint); color: var(--merah-ink); }
.ks-periode-kartu:focus-visible, .ks-seg a:focus-visible, .ks-tab a:focus-visible, .ks-tugas a:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px;
}

.ks-isi { display: grid; gap: 16px; margin-top: 18px; }
.ks-kartu { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-card); }
.ks-kartu-kepala { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px 16px 0; }
.ks-kartu-kepala h2 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.ks-kartu-kepala p { margin: 0; font-size: 12.5px; color: var(--muted); }
.ks-kartu-isi { padding: 12px 16px 16px; }

.ks-angka { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 860px) { .ks-angka { grid-template-columns: repeat(2, 1fr); } }
.ks-angka .stat .v { font-size: 30px; }
.ks-angka .stat .pecah { font-size: 12px; color: var(--muted); }
.ks-angka .stat .pecah b { color: var(--ink-2); font-weight: 600; }
.ks-angka .stat .ket { font-size: 11.5px; color: var(--muted); margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--line); }
.ks-angka .stat.buruk .v { color: var(--merah-ink); }
.ks-catatan-angka { font-size: 12.5px; color: var(--muted); }

.ks-dua { display: grid; grid-template-columns: 1.05fr 1fr; gap: 16px; }
@media (max-width: 860px) { .ks-dua { grid-template-columns: 1fr; } }

.ks-tugas { list-style: none; margin: 0; padding: 0; }
.ks-tugas li + li { border-top: 1px solid var(--line); }
.ks-tugas a { display: grid; grid-template-columns: 10px 1fr auto; gap: 12px; align-items: center; padding: 12px 2px; color: inherit; text-decoration: none; }
.ks-tugas a:hover .judul { color: var(--accent-2); }
.ks-tugas .tanda { width: 8px; height: 8px; border-radius: 50%; }
.ks-tugas .judul { font-size: 13.5px; font-weight: 600; }
.ks-tugas .desk { font-size: 12.5px; color: var(--muted); margin-top: 1px; }
.ks-tugas .ke { font-size: 12px; font-weight: 600; color: var(--accent-2); white-space: nowrap; }

.ks-jam td .nm { font-weight: 600; white-space: nowrap; }
.ks-jam td .sub { white-space: nowrap; }
.ks-jam th.r, .ks-jam td.r { text-align: right; font-variant-numeric: tabular-nums; }
.ks-batang { position: relative; height: 10px; min-width: 160px; background: var(--surface-3); border-radius: 5px; }
.ks-batang .antre { position: absolute; inset: 0 auto 0 0; border-radius: 5px; background: var(--merah-line); }
.ks-batang.nol .antre { background: color-mix(in oklch, var(--merah) 55%, white); }
.ks-batang .tampung { position: absolute; inset: 0 auto 0 0; border-radius: 5px; background: var(--accent); }
.ks-batang-ket { margin-top: 5px; font-size: 11.5px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ks-batang-ket b { color: var(--ink-2); font-weight: 600; }
.ks-legenda { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 12px; color: var(--muted); }
.ks-legenda i { display: inline-block; width: 18px; height: 8px; margin-right: 6px; border-radius: 3px; vertical-align: 0; }

.ks-chip-daftar { display: flex; flex-wrap: wrap; gap: 6px; }
.ks-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; font-size: 12px; white-space: nowrap; background: var(--surface-2); border: 1px solid var(--line); border-radius: 6px; }
.ks-chip .pr { font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px; font-weight: 600; color: var(--accent-2); }
.ks-chip.bentrok { background: var(--kuning-tint); border-color: var(--kuning-line); }
.ks-cari { height: 36px; min-width: 220px; padding: 0 12px; font: inherit; font-size: 13px; color: var(--ink); background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--r-sm); }
.ks-cari:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 18%, transparent); }

/* Peta kekurangan: satu hue biru, gelap = lebih banyak belum tertampung. */
.ks-peta { border-collapse: separate; border-spacing: 2px; font-size: 12px; font-variant-numeric: tabular-nums; }
.ks-peta th { padding: 4px 8px; font-weight: 600; color: var(--muted); white-space: nowrap; }
.ks-peta thead th { font-size: 11px; text-align: center; }
.ks-peta tbody th { text-align: right; }
.ks-peta td { position: relative; min-width: 48px; height: 34px; padding: 0 6px; text-align: center; border-radius: 4px; }
.ks-peta td.kosong { background: repeating-linear-gradient(135deg, transparent 0 4px, var(--line) 4px 5px); }
.ks-peta td.t0 { background: var(--surface-2); color: var(--muted); }
.ks-peta td.t1 { background: #cde2fb; color: var(--ink); }
.ks-peta td.t2 { background: #9ec5f4; color: var(--ink); }
.ks-peta td.t3 { background: #5598e7; color: var(--ink); }
.ks-peta td.t4 { background: #256abf; color: #fff; }
.ks-peta td.t5 { background: #104281; color: #fff; }
.ks-peta td:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
.ks-peta .tip {
  position: absolute; z-index: 5; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  display: none; min-width: 180px; padding: 8px 10px; text-align: left; white-space: nowrap;
  font-size: 12px; color: var(--ink); background: var(--surface); border: 1px solid var(--line-2);
  border-radius: 8px; box-shadow: var(--shadow-raised);
}
.ks-peta td:hover .tip, .ks-peta td:focus .tip { display: block; }
.ks-peta-legenda { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 10px; font-size: 12px; color: var(--muted); }
.ks-peta-legenda span { display: inline-flex; align-items: center; gap: 6px; }
.ks-peta-legenda i { display: inline-block; width: 14px; height: 14px; border-radius: 3px; }

/* Impor */
.ks-unggah { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 16px; background: var(--surface-2); border: 1px dashed var(--line-2); border-radius: var(--r-md); }
.ks-berkas-ikon { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; font-size: 11px; font-weight: 700; color: #fff; background: var(--hijau-ink); border-radius: 8px; }
.ks-bagian-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 14px; }
.ks-bagian { display: grid; gap: 8px; padding: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); }
.ks-bagian-judul { font-size: 14px; font-weight: 700; }
.ks-bagian-angka { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ks-bagian-angka div { display: grid; padding: 8px 10px; background: var(--surface-2); border-radius: 8px; }
.ks-bagian-angka b { font-size: 18px; font-variant-numeric: tabular-nums; }
.ks-bagian-angka span { font-size: 11px; color: var(--muted); }
.ks-masalah { display: grid; gap: 8px; margin-top: 14px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r-md); }
.ks-masalah.kuning { background: var(--kuning-tint); border-color: var(--kuning-line); }
.ks-masalah.merah { background: var(--merah-tint); border-color: var(--merah-line); }
.ks-masalah-kepala { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13.5px; }
.ks-masalah .k-table { background: var(--surface); border-radius: 8px; }
.ks-simpan { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-md); }
.ks-simpan p { margin: 0; font-size: 12.5px; color: var(--ink-2); }
```

- [ ] **Step 2: Periksa kurung kurawal seimbang**

Run: `node -e "const c=require('fs').readFileSync('src/app/globals.css','utf8');const o=(c.match(/{/g)||[]).length,t=(c.match(/}/g)||[]).length;console.log(o===t?'kurung seimbang':'KURUNG TIDAK SEIMBANG',o,t)"`
Expected: `kurung seimbang`

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style(ketersediaan): kelas .ks-* untuk dashboard koordinator dan impor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Panel impor

**Files:**
- Create: `src/app/ketersediaan/koordinator/PanelImpor.tsx`

- [ ] **Step 1: Implementasi**

Create `src/app/ketersediaan/koordinator/PanelImpor.tsx`:

```tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BarisPratinjau, Pratinjau } from '@/lib/ketersediaan-impor';
import { pratinjauImporXlsx, simpanImporXlsx } from './impor/actions';
import { Bagian, Kotak } from './ui';

const LABEL_MASALAH: Record<string, string> = {
  jam_tak_terbaca: 'jam tidak terbaca',
  dua_waktu: 'satu kelas dengan dua waktu berbeda',
  wa_tak_sah: 'nomor WA tidak sah',
};

const LABEL_COCOK: Record<string, string> = {
  cocok: 'cocok',
  tanpa_akun: 'nomor ini belum punya akun pengajar',
  gender_beda: 'akun bernomor ini bergender lain',
  nama_tak_ketemu: 'nama tidak ditemukan',
  nama_ganda: 'nama cocok ke beberapa akun',
  dilewati: 'tidak diimpor',
};

function formData(berkas: File, tujuan: Record<string, string>, manual: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set('berkas', berkas);
  fd.set('pilihan', JSON.stringify({ tujuan, manual }));
  return fd;
}

export function PanelImpor() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [tujuan, setTujuan] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [pending, mulai] = useTransition();

  function muat(b: File, t: Record<string, string>, m: Record<string, string>) {
    setGalat(null);
    setPesan(null);
    mulai(async () => {
      const r = await pratinjauImporXlsx(formData(b, t, m));
      if (!r.ok) {
        setGalat(r.error);
        return;
      }
      setPratinjau(r.pratinjau);
      // Tebakan server (dari nama bulan) menjadi nilai awal pilihan periode.
      setTujuan(
        Object.fromEntries(
          r.pratinjau.bagian.filter((x) => x.tujuan).map((x) => [x.kunci, x.tujuan as string])
        )
      );
    });
  }

  function pilihTujuan(kunci: string, periodeId: string) {
    if (!berkas || !periodeId) return;
    const t = { ...tujuan, [kunci]: periodeId };
    setTujuan(t);
    muat(berkas, t, manual);
  }

  function pilihAkun(kunciBaris: string, nilai: string) {
    if (!berkas) return;
    const m = { ...manual };
    if (nilai) m[kunciBaris] = nilai;
    else delete m[kunciBaris];
    setManual(m);
    muat(berkas, tujuan, m);
  }

  function simpan() {
    if (!berkas) return;
    setGalat(null);
    setPesan(null);
    mulai(async () => {
      const r = await simpanImporXlsx(formData(berkas, tujuan, manual));
      if (r.ok) {
        setPesan(r.pesan);
        router.refresh();
      } else {
        setGalat(r.error);
      }
    });
  }

  const baris: BarisPratinjau[] = pratinjau?.baris ?? [];
  const perluPilih = baris.filter(
    (b) =>
      b.masalah.length === 0 &&
      (b.cocok.status === 'nama_tak_ketemu' || b.cocok.status === 'nama_ganda' || b.cocok.cara === 'manual')
  );
  const tanpaAkun = baris.filter((b) => b.cocok.status === 'tanpa_akun' || b.cocok.status === 'gender_beda');
  const jamBermasalah = baris.filter((b) => b.masalah.length > 0);
  const lewatNama = baris.filter((b) => b.cocok.status === 'cocok' && b.cocok.cara === 'nama');
  const namaPeriode = new Map((pratinjau?.periode ?? []).map((p) => [p.id, p.nama]));
  const belumBertujuan = (pratinjau?.bagian ?? []).filter((b) => b.siap > 0 && !tujuan[b.kunci]);
  const akanDisimpan = (pratinjau?.bagian ?? [])
    .filter((b) => b.siap > 0 && tujuan[b.kunci])
    .map((b) => `${b.siap} jam ${b.judul} → ${namaPeriode.get(tujuan[b.kunci])}`);

  return (
    <Bagian
      judul="Impor ketersediaan pengajar"
      keterangan="Berkas xlsx adalah sumber kebenaran. Impor ulang menggantikan hasil impor sebelumnya; isian yang diisi pengajar sendiri tidak disentuh."
    >
      <div className="ks-unggah">
        <span className="ks-berkas-ikon" aria-hidden="true">XLSX</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{berkas ? berkas.name : 'Belum ada berkas'}</div>
          <div className="t-small">
            {pending
              ? 'Membaca…'
              : pratinjau
                ? `${baris.length} baris dibaca · belum ada yang disimpan`
                : 'Pilih berkas KETERSEDIAAN PENGAJAR HITS (.xlsx)'}
          </div>
        </div>
        <input
          ref={input}
          id="impor-xlsx"
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBerkas(f);
            setPratinjau(null);
            setTujuan({});
            setManual({});
            muat(f, {}, {});
          }}
        />
        <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => input.current?.click()}>
          {berkas ? 'Ganti berkas' : 'Pilih berkas'}
        </button>
      </div>

      {galat && <Kotak nada="galat">{galat}</Kotak>}
      {pesan && <Kotak nada="baik">{pesan}</Kotak>}

      {pratinjau && (
        <>
          {pratinjau.periode.length === 0 && (
            <Kotak nada="galat">
              Belum ada periode. Buat periode Batch September dan Batch Oktober di bagian &ldquo;Buat periode&rdquo; di
              bawah, lalu pilih berkas lagi.
            </Kotak>
          )}

          <div className="ks-bagian-grid">
            {pratinjau.bagian.map((b) => (
              <div key={b.kunci} className="ks-bagian">
                <div>
                  <div className="ks-bagian-judul">{b.judul}</div>
                  <div className="t-small">
                    {b.baris} baris · {b.pengajar} pengajar
                  </div>
                </div>
                <div className="ks-bagian-angka">
                  <div>
                    <b>{b.siap}</b>
                    <span>siap disimpan</span>
                  </div>
                  <div>
                    <b>{b.bermasalah}</b>
                    <span>perlu diperiksa</span>
                  </div>
                </div>
                <label className="field-label" htmlFor={`tujuan-${b.kunci}`} style={{ marginBottom: 0 }}>
                  Masuk ke periode
                </label>
                <select
                  id={`tujuan-${b.kunci}`}
                  className="select"
                  value={tujuan[b.kunci] ?? ''}
                  disabled={pending}
                  onChange={(e) => pilihTujuan(b.kunci, e.target.value)}
                >
                  <option value="">— pilih periode —</option>
                  {pratinjau.periode.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {perluPilih.length > 0 && (
            <div className="ks-masalah kuning">
              <div className="ks-masalah-kepala">
                <span className="badge badge-kuning">
                  <span className="dot" />
                  {perluPilih.length} baris
                </span>
                <b>Pilih akun pengajarnya</b>
              </div>
              <p className="t-small" style={{ margin: 0, color: 'var(--ink-2)' }}>
                Sheet offline tidak memuat nomor WA, jadi pengajar dicocokkan lewat nama. Yang dibiarkan kosong tidak
                diimpor.
              </p>
              <div className="table-scroll">
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Nama di berkas</th>
                      <th>Sheet · jam</th>
                      <th>Akun pengajar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perluPilih.map((b) => (
                      <tr key={b.kunci}>
                        <td>
                          <div className="nm">{b.nama}</div>
                          <div className="sub">{LABEL_COCOK[b.cocok.status]}</div>
                        </td>
                        <td>
                          {b.sheet}
                          <div className="sub">{b.waktu}</div>
                        </td>
                        <td style={{ minWidth: 240 }}>
                          <select
                            className="select"
                            aria-label={`Akun pengajar untuk ${b.nama}`}
                            value={manual[b.kunci] ?? ''}
                            disabled={pending}
                            onChange={(e) => pilihAkun(b.kunci, e.target.value)}
                          >
                            <option value="">— pilih pengajar {b.gender} —</option>
                            {b.cocok.kandidat.length > 0 && (
                              <optgroup label="Kandidat dari nama">
                                {b.cocok.kandidat.map((k) => (
                                  <option key={`k-${k.id}`} value={k.id}>
                                    {k.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label={`Semua pengajar ${b.gender}`}>
                              {pratinjau.pengajar[b.gender].map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </optgroup>
                            <option value="lewati">Tidak diimpor</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tanpaAkun.length > 0 && (
            <div className="ks-masalah merah">
              <div className="ks-masalah-kepala">
                <span className="badge badge-merah">
                  <span className="dot" />
                  {tanpaAkun.length} baris
                </span>
                <b>Nomor WA tanpa akun pengajar yang cocok — dilewati</b>
              </div>
              <p className="t-small" style={{ margin: 0, color: 'var(--ink-2)' }}>
                Buat atau betulkan akunnya dulu, lalu impor ulang. Nama yang mirip tidak dipasangkan otomatis.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {tanpaAkun.map((b) => (
                  <li key={b.kunci}>
                    {b.nama} · {b.waktu} — {LABEL_COCOK[b.cocok.status]}
                    {b.cocok.nama_akun ? ` (${b.cocok.nama_akun})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {jamBermasalah.length > 0 && (
            <div className="ks-masalah merah">
              <div className="ks-masalah-kepala">
                <span className="badge badge-merah">
                  <span className="dot" />
                  {jamBermasalah.length} baris
                </span>
                <b>Jam tidak bisa disimpan — dilewati</b>
              </div>
              <p className="t-small" style={{ margin: 0, color: 'var(--ink-2)' }}>
                Satu jam di sistem hanya bisa menyimpan satu waktu. Kelas yang harinya berjam beda belum didukung.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {jamBermasalah.map((b) => (
                  <li key={b.kunci}>
                    {b.nama} · {b.sheet} · &ldquo;{b.waktu}&rdquo; — {b.masalah.map((m) => LABEL_MASALAH[m]).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lewatNama.length > 0 && (
            <details className="ks-masalah">
              <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
                {lewatNama.length} baris dicocokkan lewat nama — periksa sebelum menyimpan
              </summary>
              <div className="table-scroll">
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Nama di berkas</th>
                      <th>Akun yang dipasangkan</th>
                      <th>Sheet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lewatNama.map((b) => (
                      <tr key={b.kunci}>
                        <td className="nm">{b.nama}</td>
                        <td>{b.cocok.nama_akun}</td>
                        <td>{b.sheet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="ks-simpan">
            <p>
              {akanDisimpan.length > 0 ? <>Akan disimpan: {akanDisimpan.join(' · ')}.</> : 'Belum ada baris yang siap disimpan.'}
              {belumBertujuan.length > 0 && <> Pilih periode untuk: {belumBertujuan.map((b) => b.judul).join(', ')}.</>}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending || akanDisimpan.length === 0 || belumBertujuan.length > 0}
              onClick={simpan}
            >
              {pending ? 'Memproses…' : 'Simpan impor'}
            </button>
          </div>
        </>
      )}
    </Bagian>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: tanpa galat

- [ ] **Step 3: Commit**

```bash
git add src/app/ketersediaan/koordinator/PanelImpor.tsx
git commit -m "feat(ketersediaan): panel impor xlsx dengan pratinjau dan pilihan akun manual

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Fase C — Dashboard koordinator

### Task 16: Hitungan dashboard (murni)

**Files:**
- Create: `src/lib/ketersediaan-dasbor.ts`
- Test: `scripts/test-ketersediaan.ts`

- [ ] **Step 1: Tulis uji yang gagal**

Di `scripts/test-ketersediaan.ts`, tambahkan import setelah import `@/lib/ketersediaan-pertemuan`:

```ts
import {
  jumlahkan,
  susunArus,
  susunBarisJam,
  susunPeta,
  tanggalBatasAntrean,
  tingkatPeta,
} from '@/lib/ketersediaan-dasbor';
import type { RingkasSlot } from '@/lib/ketersediaan-permintaan';
```

Tepat sebelum baris `console.log(failed === 0 ? ...` tambahkan:

```ts
// ── Hitungan dashboard ─────────────────────────────────────────────────────
console.log('\n# hitungan dashboard');

const slotDasbor = (
  id: string,
  kelompok: 'ikhwan' | 'akhwat',
  hari: string[],
  hariIdx: KsHariIdx[],
  mulai: string,
  mode: 'online' | 'offline' = 'online'
) =>
  ({
    id,
    periode_id: 'P',
    kelompok,
    mode,
    label: `${hari.join(' & ')} ${mulai} - 23:00 WIB`,
    hari,
    hari_idx: hariIdx,
    waktu_mulai: `${mulai}:00`,
    waktu_selesai: '23:00:00',
    lokasi: mode === 'offline' ? 'Pejaten' : null,
    aktif: true,
    urutan: 0,
    created_at: '',
    updated_at: '',
  }) as KsSlot;

const ringkasDasbor = (antre: number, tersedia: number, terpakai = 0) =>
  ({
    slot_id: '',
    antre,
    dialokasikan: 0,
    ditahan: 0,
    terpakai_lain: 0,
    pengajar_tersedia: tersedia,
    pengajar_terpakai: terpakai,
    halaqah_hidup: 0,
    butuh_halaqah: 0,
    dapat_dibentuk: 0,
    belum_tertampung: 0,
    antrean_tertua_hari: null,
    butuh_pengajar: false,
    riwayat: null,
  }) as RingkasSlot;

const barisJam = susunBarisJam(
  [
    slotDasbor('A', 'akhwat', ['Selasa', 'Kamis'], [1, 3], '20:00'),
    slotDasbor('B', 'akhwat', ['Senin', 'Rabu'], [0, 2], '20:00'),
    slotDasbor('C', 'akhwat', ['Senin', 'Rabu'], [0, 2], '20:00', 'offline'),
    slotDasbor('D', 'ikhwan', ['Sabtu', 'Ahad'], [5, 6], '13:00'),
  ],
  new Map([
    ['A', ringkasDasbor(432, 6)],
    ['B', ringkasDasbor(20, 2, 1)],
    ['C', ringkasDasbor(30, 0)],
    ['D', ringkasDasbor(0, 3)],
  ]),
  12
);
eq(barisJam.map((b) => b.slot_id), ['A', 'C', 'B', 'D'], 'jam diurut dari kekurangan terbesar');
eq(barisJam.map((b) => b.status), ['kurang', 'tanpa_pengajar', 'kurang', 'kosong'], 'status per jam');
eq([barisJam[0].tampung, barisJam[0].sisa, barisJam[0].butuh, barisJam[0].bisa], [72, 360, 36, 6], 'daya tampung dibatasi pengajar');
eq(barisJam.find((b) => b.slot_id === 'B')?.tampung, 12, 'pengajar yang sudah terpakai tidak dihitung bebas');
eq(jumlahkan(barisJam).sisa, 398, 'jumlah belum tertampung');

const peta = susunPeta(barisJam);
eq(peta.hari.map((h) => h.label), ['Senin & Rabu', 'Selasa & Kamis', 'Sabtu & Ahad'], 'baris peta urut hari');
eq(peta.jam, ['13:00', '20:00'], 'kolom peta urut jam');
eq(
  peta.sel['0,2|20:00'],
  { antre: 50, sisa: 38, pengajar: 2, sisaOnline: 8, sisaOffline: 30, jumlahJam: 2 },
  'sel peta menjumlah online dan offline'
);
eq([0, 1, 49, 50, 199, 360].map(tingkatPeta), [0, 1, 2, 3, 4, 5], 'tingkat warna peta');

eq(
  susunArus([
    { didaftar_pada: '2026-09-09T03:19:20.000Z', gender: 'akhwat' },
    { didaftar_pada: '2026-09-09T20:00:00.000Z', gender: 'ikhwan' },
    { didaftar_pada: '2026-09-11T01:00:00.000Z', gender: 'akhwat' },
  ]),
  [
    { tanggal: '2026-09-09', ikhwan: 0, akhwat: 1 },
    { tanggal: '2026-09-10', ikhwan: 1, akhwat: 1 },
    { tanggal: '2026-09-11', ikhwan: 1, akhwat: 2 },
  ],
  'arus kumulatif per hari WIB, hari tanpa pendaftar tetap ada'
);
eq(tanggalBatasAntrean('2026-09-09', 21), '2026-09-30', 'hari antrean tertua genap 21 hari');
```

- [ ] **Step 2: Jalankan — harus gagal**

Run: `npm run test-ketersediaan`
Expected: `Cannot find module '@/lib/ketersediaan-dasbor'`

- [ ] **Step 3: Implementasi**

Create `src/lib/ketersediaan-dasbor.ts`:

```ts
import type { Gender, KsHariIdx, KsMode, KsSlot } from '@/types/db';
import type { RingkasSlot } from '@/lib/ketersediaan-permintaan';

/**
 * Hitungan dashboard koordinator ketersediaan — murni, tanpa basis data.
 * Komponen hanya menampilkan; semua angka lahir di sini supaya bisa diuji.
 */

export type StatusJam = 'tanpa_pengajar' | 'kurang' | 'cukup' | 'kosong';

export interface BarisJam {
  slot_id: string;
  kelompok: Gender;
  mode: KsMode;
  lokasi: string | null;
  label: string;
  /** "Senin & Rabu" */
  hari: string;
  hariIdx: KsHariIdx[];
  /** "20:00" */
  jam: string;
  antre: number;
  pengajar: number;
  /** Yang bisa ditampung pengajar bebas di jam ini, tidak lebih dari yang mengantre. */
  tampung: number;
  sisa: number;
  butuh: number;
  bisa: number;
  dialokasikan: number;
  tertahan: number;
  terpakaiLain: number;
  status: StatusJam;
}

export function susunBarisJam(
  slots: readonly KsSlot[],
  ringkas: ReadonlyMap<string, RingkasSlot>,
  kapasitas: number
): BarisJam[] {
  return slots
    .map((s): BarisJam => {
      const r = ringkas.get(s.id);
      const antre = r?.antre ?? 0;
      const pengajar = r?.pengajar_tersedia ?? 0;
      const bebas = Math.max(0, pengajar - (r?.pengajar_terpakai ?? 0));
      const tampung = Math.min(antre, bebas * kapasitas);
      const sisa = antre - tampung;
      const butuh = Math.ceil(antre / kapasitas);
      const status: StatusJam =
        antre === 0 ? 'kosong' : pengajar === 0 ? 'tanpa_pengajar' : sisa > 0 ? 'kurang' : 'cukup';
      return {
        slot_id: s.id,
        kelompok: s.kelompok,
        mode: s.mode,
        lokasi: s.lokasi,
        label: s.label,
        hari: s.hari.join(' & '),
        hariIdx: s.hari_idx,
        jam: s.waktu_mulai.slice(0, 5),
        antre,
        pengajar,
        tampung,
        sisa,
        butuh,
        bisa: Math.min(butuh, bebas),
        dialokasikan: r?.dialokasikan ?? 0,
        tertahan: r?.ditahan ?? 0,
        terpakaiLain: r?.terpakai_lain ?? 0,
        status,
      };
    })
    .sort((a, b) => b.sisa - a.sisa || b.antre - a.antre || a.label.localeCompare(b.label));
}

export interface AngkaJam {
  antre: number;
  tampung: number;
  sisa: number;
  dialokasikan: number;
  tertahan: number;
  terpakaiLain: number;
}

export function jumlahkan(baris: readonly BarisJam[]): AngkaJam {
  const out: AngkaJam = { antre: 0, tampung: 0, sisa: 0, dialokasikan: 0, tertahan: 0, terpakaiLain: 0 };
  for (const b of baris) {
    out.antre += b.antre;
    out.tampung += b.tampung;
    out.sisa += b.sisa;
    out.dialokasikan += b.dialokasikan;
    out.tertahan += b.tertahan;
    out.terpakaiLain += b.terpakaiLain;
  }
  return out;
}

export interface SelPeta {
  antre: number;
  sisa: number;
  pengajar: number;
  sisaOnline: number;
  sisaOffline: number;
  /** Berapa jam master yang jatuh di sel ini (online + offline di lokasi mana pun). */
  jumlahJam: number;
}

export interface Peta {
  hari: { kunci: string; label: string }[];
  jam: string[];
  sel: Record<string, SelPeta>;
}

export function kunciSel(kunciHari: string, jam: string): string {
  return `${kunciHari}|${jam}`;
}

/** Heatmap pasangan hari × jam mulai. Online dan offline dijumlah; tooltip memecahnya. */
export function susunPeta(baris: readonly BarisJam[]): Peta {
  const sel: Record<string, SelPeta> = {};
  const hari = new Map<string, { kunci: string; label: string; idx: readonly number[] }>();
  const jam = new Set<string>();

  for (const b of baris) {
    const kh = b.hariIdx.join(',');
    if (!hari.has(kh)) hari.set(kh, { kunci: kh, label: b.hari, idx: b.hariIdx });
    jam.add(b.jam);
    const k = kunciSel(kh, b.jam);
    const s = (sel[k] ??= { antre: 0, sisa: 0, pengajar: 0, sisaOnline: 0, sisaOffline: 0, jumlahJam: 0 });
    s.antre += b.antre;
    s.sisa += b.sisa;
    s.pengajar += b.pengajar;
    s.jumlahJam += 1;
    if (b.mode === 'online') s.sisaOnline += b.sisa;
    else s.sisaOffline += b.sisa;
  }

  const urutHari = [...hari.values()].sort((a, b) => {
    for (let i = 0; i < Math.max(a.idx.length, b.idx.length); i++) {
      const beda = (a.idx[i] ?? 9) - (b.idx[i] ?? 9);
      if (beda !== 0) return beda;
    }
    return 0;
  });

  return { hari: urutHari.map(({ kunci, label }) => ({ kunci, label })), jam: [...jam].sort(), sel };
}

/** Enam tingkat warna: 0, 1–24, 25–49, 50–99, 100–199, 200+. */
export function tingkatPeta(sisa: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (sisa <= 0) return 0;
  if (sisa < 25) return 1;
  if (sisa < 50) return 2;
  if (sisa < 100) return 3;
  if (sisa < 200) return 4;
  return 5;
}

export interface TitikArus {
  tanggal: string;
  ikhwan: number;
  akhwat: number;
}

const HARI_MS = 86_400_000;

function tanggalWib(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Pendaftar kumulatif per hari (WIB), tanpa lubang tanggal. */
export function susunArus(pendaftar: readonly { didaftar_pada: string | null; gender: Gender | null }[]): TitikArus[] {
  const harian = new Map<string, { ikhwan: number; akhwat: number }>();
  for (const p of pendaftar) {
    if (!p.didaftar_pada || !p.gender) continue;
    const t = tanggalWib(p.didaftar_pada);
    const h = harian.get(t) ?? { ikhwan: 0, akhwat: 0 };
    h[p.gender] += 1;
    harian.set(t, h);
  }
  const tanggal = [...harian.keys()].sort();
  if (tanggal.length === 0) return [];

  const out: TitikArus[] = [];
  let ikhwan = 0;
  let akhwat = 0;
  const akhir = tanggal[tanggal.length - 1];
  for (let d = new Date(`${tanggal[0]}T00:00:00Z`); d.toISOString().slice(0, 10) <= akhir; d = new Date(d.getTime() + HARI_MS)) {
    const t = d.toISOString().slice(0, 10);
    ikhwan += harian.get(t)?.ikhwan ?? 0;
    akhwat += harian.get(t)?.akhwat ?? 0;
    out.push({ tanggal: t, ikhwan, akhwat });
  }
  return out;
}

/** Tanggal antrean tertua genap `usiaMaksHari` — sejak itu sisa pita boleh digabung. */
export function tanggalBatasAntrean(pertama: string | null, usiaMaksHari: number): string | null {
  if (!pertama) return null;
  return new Date(new Date(`${pertama}T00:00:00Z`).getTime() + usiaMaksHari * HARI_MS).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Jalankan uji dan typecheck**

Run: `npm run test-ketersediaan && npm run typecheck`
Expected: `SEMUA LULUS`, typecheck tanpa galat

- [ ] **Step 5: Commit**

```bash
git add src/lib/ketersediaan-dasbor.ts scripts/test-ketersediaan.ts
git commit -m "feat(ketersediaan): hitungan dashboard — baris jam, peta kekurangan, arus pendaftar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17: Pemuat data dashboard

**Files:**
- Create: `src/app/ketersediaan/koordinator/data.ts`

Pemuat panel lama (`muatAntrean`, `muatUsulan`, `muatGrupPool`, `muatSumber`) dipindah dari `page.tsx` dengan satu perbaikan: `muatUsulan` kini hanya menarik peserta milik usulan periode ini (sebelumnya menarik peserta seluruh periode lalu menyaring di memori). `page.tsx` belum diubah di task ini, jadi untuk sementara ada dua salinan — Task 23 menghapus yang di `page.tsx`.

- [ ] **Step 1: Implementasi**

Create `src/app/ketersediaan/koordinator/data.ts`:

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsMode, KsPendaftarSumber, KsPengisianSumber } from '@/types/db';
import type { BarisAntrean, KartuUsulan } from './PanelKerja';
import type { BarisGrup } from './PanelGrupPool';

const STATUS_HIDUP = ['disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'];

// ── Panel lama (dipindah dari page.tsx) ────────────────────────────────────

export async function muatAntrean(periodeId: string): Promise<BarisAntrean[]> {
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar:pengajar_id(name, gender)')
    .eq('periode_id', periodeId);
  const namaPengisian = new Map(
    ((pengisian ?? []) as { id: string; pengajar?: { name: string; gender: Gender } | null }[]).map(
      (p) => [p.id, p.pengajar?.name ?? '—']
    )
  );
  if (namaPengisian.size === 0) return [];

  const { data: baris } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('id, pengisian_id, status, sanggahan_status, bentrok_alasan, catatan, slot:slot_id(label)')
    .in('status', ['perlu_konfirmasi', 'diajukan']);

  const out: BarisAntrean[] = [];
  for (const b of (baris ?? []) as {
    id: string;
    pengisian_id: string;
    status: string;
    sanggahan_status: string | null;
    bentrok_alasan: string | null;
    catatan: string | null;
    slot?: { label: string } | null;
  }[]) {
    const nama = namaPengisian.get(b.pengisian_id);
    if (!nama) continue;
    // Yang perlu disentuh koordinator: sanggahan menunggu, atau baris yang
    // gagal salah satu butir verifikasi. Baris 'diajukan' yang bersih tidak
    // ditampilkan — menumpuknya hanya membuat antrean terlihat panjang palsu.
    const perluDisentuh = b.sanggahan_status === 'menunggu' || b.status === 'perlu_konfirmasi';
    if (!perluDisentuh) continue;
    out.push({
      id: b.id,
      pengajar: nama,
      slot: b.slot?.label ?? '—',
      status: b.status,
      sanggahan_status: b.sanggahan_status,
      bentrok_alasan: b.bentrok_alasan,
      catatan: b.catatan,
    });
  }
  return out;
}

export async function muatUsulan(periodeId: string): Promise<KartuUsulan[]> {
  const { data } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, status, level, pita_umur, pita_digabung, putaran, tanggal_mulai, token_kedaluwarsa, tilawah_halaqah_id, grup_wa_link, slot:slot_id(label), pengajar:pengajar_id(name)'
    )
    .eq('periode_id', periodeId)
    .in('status', ['usulan', 'disetujui', 'menunggu', 'dikonfirmasi', 'kedaluwarsa', 'dikirim', 'gagal'])
    .order('created_at', { ascending: false })
    .limit(200);

  const baris = (data ?? []) as {
    id: string;
    status: string;
    level: string;
    pita_umur: string | null;
    pita_digabung: boolean;
    putaran: number;
    tanggal_mulai: string | null;
    token_kedaluwarsa: string | null;
    tilawah_halaqah_id: number | null;
    grup_wa_link: string | null;
    slot?: { label: string } | null;
    pengajar?: { name: string } | null;
  }[];
  if (baris.length === 0) return [];

  const { data: peserta } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('usulan_id, status')
    .in(
      'usulan_id',
      baris.map((b) => b.id)
    );
  const hitung = new Map<string, number>();
  const terenrol = new Map<string, number>();
  for (const p of (peserta ?? []) as { usulan_id: string; status: string }[]) {
    hitung.set(p.usulan_id, (hitung.get(p.usulan_id) ?? 0) + 1);
    if (p.status === 'terenroll') terenrol.set(p.usulan_id, (terenrol.get(p.usulan_id) ?? 0) + 1);
  }

  return baris.map((b) => ({
    id: b.id,
    status: b.status,
    slot: b.slot?.label ?? '—',
    pengajar: b.pengajar?.name ?? '(belum ada)',
    level: b.level,
    pita: b.pita_digabung ? 'pita digabung' : (b.pita_umur ?? '—'),
    putaran: b.putaran,
    peserta: hitung.get(b.id) ?? 0,
    terenrol: terenrol.get(b.id) ?? 0,
    tanggal_mulai: b.tanggal_mulai,
    tenggat: b.token_kedaluwarsa,
    tilawah_halaqah_id: b.tilawah_halaqah_id,
    grup_wa_link: b.grup_wa_link,
  }));
}

export async function muatGrupPool(periodeId: string): Promise<BarisGrup[]> {
  const { data } = await supabaseAdmin
    .from('ks_grup_pool')
    .select('id, gender, invite_link, status, usulan:usulan_id(nama_halaqah, slot:slot_id(label))')
    .eq('periode_id', periodeId)
    .order('created_at', { ascending: true });

  return ((data ?? []) as {
    id: string;
    gender: Gender;
    invite_link: string;
    status: string;
    usulan?: { nama_halaqah: string | null; slot?: { label: string } | null } | null;
  }[]).map((b) => ({
    id: b.id,
    gender: b.gender,
    invite_link: b.invite_link,
    status: b.status,
    halaqah: b.usulan ? (b.usulan.nama_halaqah ?? b.usulan.slot?.label ?? 'terpakai') : null,
  }));
}

export async function muatSumber(periodeId: string): Promise<KsPendaftarSumber[]> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar_sumber')
    .select('*')
    .eq('periode_id', periodeId)
    .order('created_at', { ascending: true });
  return (data ?? []) as KsPendaftarSumber[];
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface JamPengajar {
  label: string;
  mode: KsMode;
  prioritas: number | null;
  /** Alasan bentrok yang dicatat saat impor — ditampilkan, tidak mengunci. */
  bentrok: string | null;
}

export interface BarisPengajarDasbor {
  id: string;
  nama: string;
  gender: Gender;
  sumber: KsPengisianSumber;
  status: string;
  halaqah: number;
  jam: JamPengajar[];
}

export async function muatPengajarDasbor(periodeId: string): Promise<BarisPengajarDasbor[]> {
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar_id, status, sumber, pengajar:pengajar_id(name, gender)')
    .eq('periode_id', periodeId);
  const baris = (pengisian ?? []) as {
    id: string;
    pengajar_id: string;
    status: string;
    sumber: KsPengisianSumber;
    pengajar?: { name: string; gender: Gender } | null;
  }[];
  if (baris.length === 0) return [];

  const [{ data: ket }, { data: usulan }] = await Promise.all([
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('pengisian_id, status, prioritas, bentrok_alasan, slot:slot_id(label, mode)')
      .in(
        'pengisian_id',
        baris.map((b) => b.id)
      ),
    supabaseAdmin.from('ks_usulan').select('pengajar_id').eq('periode_id', periodeId).in('status', STATUS_HIDUP),
  ]);

  const jamPer = new Map<string, JamPengajar[]>();
  for (const k of (ket ?? []) as {
    pengisian_id: string;
    status: string;
    prioritas: number | null;
    bentrok_alasan: string | null;
    slot?: { label: string; mode: KsMode } | null;
  }[]) {
    if (k.status === 'ditolak' || !k.slot) continue;
    const daftar = jamPer.get(k.pengisian_id) ?? [];
    daftar.push({
      label: k.slot.label.replace(/\s*WIB$/, ''),
      mode: k.slot.mode,
      prioritas: k.prioritas,
      bentrok: k.bentrok_alasan,
    });
    jamPer.set(k.pengisian_id, daftar);
  }

  const halaqah = new Map<string, number>();
  for (const u of (usulan ?? []) as { pengajar_id: string | null }[]) {
    if (u.pengajar_id) halaqah.set(u.pengajar_id, (halaqah.get(u.pengajar_id) ?? 0) + 1);
  }

  return baris
    .filter((b) => b.pengajar)
    .map((b) => ({
      id: b.pengajar_id,
      nama: b.pengajar!.name,
      gender: b.pengajar!.gender,
      sumber: b.sumber,
      status: b.status,
      halaqah: halaqah.get(b.pengajar_id) ?? 0,
      jam: (jamPer.get(b.id) ?? []).sort(
        (x, y) => (x.prioritas ?? 99) - (y.prioritas ?? 99) || x.label.localeCompare(y.label)
      ),
    }))
    // Yang belum kebagian halaqah paling atas: itu yang perlu diperhatikan.
    .sort((a, b) => a.halaqah - b.halaqah || a.nama.localeCompare(b.nama));
}

/** Pengajar yang benar-benar ikut hitungan pasokan: punya jam dan tidak nonaktif. */
export function hitungPengajarTersedia(rows: readonly BarisPengajarDasbor[], gender?: Gender): number {
  return rows.filter((r) => r.status !== 'nonaktif' && r.jam.length > 0 && (!gender || r.gender === gender)).length;
}

export interface TugasGender {
  usulanMenunggu: number;
  tenggatLewat: number;
  sanggahan: number;
}

export async function muatTugas(periodeId: string, sekarang: Date): Promise<Record<Gender, TugasGender>> {
  const kosong = (): TugasGender => ({ usulanMenunggu: 0, tenggatLewat: 0, sanggahan: 0 });
  const out: Record<Gender, TugasGender> = { ikhwan: kosong(), akhwat: kosong() };

  const [{ data: usulan }, { data: sanggah }] = await Promise.all([
    supabaseAdmin
      .from('ks_usulan')
      .select('status, token_kedaluwarsa, slot:slot_id(kelompok)')
      .eq('periode_id', periodeId)
      .in('status', ['usulan', 'menunggu']),
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot:slot_id(kelompok, periode_id)')
      .eq('sanggahan_status', 'menunggu'),
  ]);

  for (const u of (usulan ?? []) as {
    status: string;
    token_kedaluwarsa: string | null;
    slot?: { kelompok: Gender } | null;
  }[]) {
    if (!u.slot) continue;
    if (u.status === 'usulan') out[u.slot.kelompok].usulanMenunggu += 1;
    else if (u.token_kedaluwarsa && new Date(u.token_kedaluwarsa) < sekarang) out[u.slot.kelompok].tenggatLewat += 1;
  }
  for (const s of (sanggah ?? []) as { slot?: { kelompok: Gender; periode_id: string } | null }[]) {
    if (s.slot && s.slot.periode_id === periodeId) out[s.slot.kelompok].sanggahan += 1;
  }
  return out;
}

export interface PendaftarRingkas {
  didaftar_pada: string | null;
  gender: Gender | null;
  status: string;
}

/** Semua pendaftar periode kecuali kiriman yang digantikan dan yang dibatalkan. */
export async function muatPendaftarRingkas(periodeId: string): Promise<PendaftarRingkas[]> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('didaftar_pada, gender, status')
    .eq('periode_id', periodeId);
  return ((data ?? []) as PendaftarRingkas[]).filter((p) => p.status !== 'diganti' && p.status !== 'batal');
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: tanpa galat

- [ ] **Step 3: Commit**

```bash
git add src/app/ketersediaan/koordinator/data.ts
git commit -m "refactor(ketersediaan): pemuat data dashboard koordinator dipisah dari halaman

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: Navigasi dan kepala dashboard

**Files:**
- Create: `src/app/ketersediaan/koordinator/dasbor/navigasi.ts`
- Create: `src/app/ketersediaan/koordinator/dasbor/KepalaDasbor.tsx`

- [ ] **Step 1: Navigasi**

Create `src/app/ketersediaan/koordinator/dasbor/navigasi.ts`:

```ts
import type { Gender } from '@/types/db';

export type TabDasbor = 'ringkasan' | 'jam' | 'pengajar' | 'pendaftar' | 'usulan' | 'pengaturan';
export type SaringGender = Gender | 'semua';

export const DAFTAR_TAB: { kunci: TabDasbor; label: string }[] = [
  { kunci: 'ringkasan', label: 'Ringkasan' },
  { kunci: 'jam', label: 'Jam & kapasitas' },
  { kunci: 'pengajar', label: 'Pengajar' },
  { kunci: 'pendaftar', label: 'Pendaftar' },
  { kunci: 'usulan', label: 'Usulan halaqah' },
  { kunci: 'pengaturan', label: 'Pengaturan' },
];

export function bacaTab(nilai: string | undefined): TabDasbor {
  return DAFTAR_TAB.some((t) => t.kunci === nilai) ? (nilai as TabDasbor) : 'ringkasan';
}

export function bacaGender(nilai: string | undefined, bawaan: SaringGender): SaringGender {
  return nilai === 'ikhwan' || nilai === 'akhwat' || nilai === 'semua' ? nilai : bawaan;
}

/**
 * Tautan dashboard. Gender selalu ditulis: tanpa itu, memilih "Semua" akan jatuh
 * kembali ke bawaan sesi koordinator yang bergender.
 */
export function tautanDasbor(p: { periode: string | null; tab: TabDasbor; g: SaringGender }): string {
  const q = new URLSearchParams();
  if (p.periode) q.set('periode', p.periode);
  if (p.tab !== 'ringkasan') q.set('tab', p.tab);
  q.set('g', p.g);
  return `/ketersediaan/koordinator?${q.toString()}`;
}
```

- [ ] **Step 2: Kepala dashboard**

Create `src/app/ketersediaan/koordinator/dasbor/KepalaDasbor.tsx`:

```tsx
import Link from 'next/link';
import type { KsPeriode } from '@/types/db';
import { DAFTAR_TAB, tautanDasbor, type SaringGender, type TabDasbor } from './navigasi';

const tanggalPanjang = (t: string) =>
  new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const LABEL_GENDER: Record<SaringGender, string> = { semua: 'Semua', ikhwan: 'Ikhwan', akhwat: 'Akhwat' };

export function KepalaDasbor({
  periode,
  aktif,
  tab,
  g,
  hitungan,
}: {
  periode: readonly KsPeriode[];
  aktif: KsPeriode;
  tab: TabDasbor;
  g: SaringGender;
  /** Lencana merah di tab: jumlah hal yang menunggu tindakan. */
  hitungan: Partial<Record<TabDasbor, number>>;
}) {
  return (
    <>
      <nav className="ks-periode" aria-label="Pilih periode">
        {periode.map((p) => (
          <Link
            key={p.id}
            href={tautanDasbor({ periode: p.id, tab, g })}
            className="ks-periode-kartu"
            aria-current={p.id === aktif.id ? 'true' : undefined}
          >
            <span className="nm">{p.nama}</span>
            <span className="meta">
              <span>KBM mulai {tanggalPanjang(p.mulai)}</span>
              {!p.aktif && <span className="badge badge-neutral">nonaktif</span>}
              {p.kirim_nyata && (
                <span className="badge badge-merah">
                  <span className="dot" />
                  kirim nyata
                </span>
              )}
            </span>
          </Link>
        ))}
      </nav>

      <div className="ks-kontrol">
        <nav className="ks-seg" aria-label="Saring gender">
          {(['semua', 'ikhwan', 'akhwat'] as const).map((x) => (
            <Link key={x} href={tautanDasbor({ periode: aktif.id, tab, g: x })} aria-current={x === g ? 'true' : undefined}>
              {LABEL_GENDER[x]}
            </Link>
          ))}
        </nav>
        <span className="t-small" style={{ color: 'var(--ink-2)' }}>
          Kapasitas {aktif.kapasitas_halaqah} per halaqah · sisa kelompok umur boleh digabung setelah antrean{' '}
          {aktif.usia_antrean_maks_hari} hari
        </span>
      </div>

      <nav className="ks-tab" aria-label="Bagian dashboard">
        {DAFTAR_TAB.map((t) => (
          <Link
            key={t.kunci}
            href={tautanDasbor({ periode: aktif.id, tab: t.kunci, g })}
            aria-current={t.kunci === tab ? 'page' : undefined}
          >
            {t.label}
            {(hitungan[t.kunci] ?? 0) > 0 && <span className="n">{hitungan[t.kunci]}</span>}
          </Link>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 3: Typecheck dan commit**

Run: `npm run typecheck`
Expected: tanpa galat

```bash
git add src/app/ketersediaan/koordinator/dasbor/navigasi.ts src/app/ketersediaan/koordinator/dasbor/KepalaDasbor.tsx
git commit -m "feat(ketersediaan): kepala dashboard — pilih periode, saring gender, tab

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 19: Tab jam & kapasitas

**Files:**
- Create: `src/app/ketersediaan/koordinator/dasbor/TabJam.tsx`

- [ ] **Step 1: Implementasi**

Create `src/app/ketersediaan/koordinator/dasbor/TabJam.tsx`:

```tsx
import type { BarisJam, StatusJam } from '@/lib/ketersediaan-dasbor';

const fmt = (n: number) => n.toLocaleString('id-ID');

const STATUS: Record<StatusJam, { teks: string; kelas: string }> = {
  tanpa_pengajar: { teks: 'Tanpa pengajar', kelas: 'badge-merah' },
  kurang: { teks: 'Kurang pengajar', kelas: 'badge-kuning' },
  cukup: { teks: 'Cukup', kelas: 'badge-hijau' },
  kosong: { teks: 'Belum ada peminat', kelas: 'badge-neutral' },
};

export function BadgeStatus({ status }: { status: StatusJam }) {
  const s = STATUS[status];
  return (
    <span className={`badge ${s.kelas}`}>
      <span className="dot" />
      {s.teks}
    </span>
  );
}

export function SelJam({ b, tampilGender }: { b: BarisJam; tampilGender: boolean }) {
  return (
    <>
      <div className="nm">
        {b.hari} {b.jam}
        {tampilGender && (
          <span className="badge badge-neutral" style={{ marginLeft: 6 }}>
            {b.kelompok === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
          </span>
        )}
      </div>
      <div className="sub">{b.mode === 'offline' ? `Offline · ${b.lokasi ?? 'lokasi belum diisi'}` : 'Online'}</div>
    </>
  );
}

export function BatangJam({ b, maks }: { b: BarisJam; maks: number }) {
  const lebarAntre = maks > 0 ? (b.antre / maks) * 100 : 0;
  const lebarTampung = maks > 0 ? (b.tampung / maks) * 100 : 0;
  return (
    <>
      <div
        className={`ks-batang${b.pengajar === 0 ? ' nol' : ''}`}
        role="img"
        aria-label={`${b.antre} mengantre, ${b.tampung} bisa ditampung`}
      >
        <span className="antre" style={{ width: `${lebarAntre}%` }} />
        <span className="tampung" style={{ width: `${lebarTampung}%` }} />
      </div>
      <div className="ks-batang-ket">
        <b>{fmt(b.antre)}</b> antre · <b>{fmt(b.tampung)}</b> tertampung
        {b.sisa > 0 && (
          <>
            {' '}
            · <b style={{ color: 'var(--merah-ink)' }}>{fmt(b.sisa)}</b> belum
          </>
        )}
        {b.terpakaiLain > 0 && <> · {fmt(b.terpakaiLain)} sudah di periode lain</>}
      </div>
    </>
  );
}

export function TabJam({ baris, tampilGender }: { baris: BarisJam[]; tampilGender: boolean }) {
  const maks = Math.max(1, ...baris.map((b) => b.antre));
  return (
    <div className="ks-isi">
      <div className="ks-kartu">
        <div className="ks-kartu-kepala">
          <h2>Permintaan dan daya tampung per jam</h2>
          <div className="ks-legenda">
            <span>
              <i style={{ background: 'var(--accent)' }} />
              bisa ditampung
            </span>
            <span>
              <i style={{ background: 'var(--merah-line)' }} />
              belum tertampung
            </span>
            <span>
              <i style={{ background: 'color-mix(in oklch, var(--merah) 55%, white)' }} />
              tanpa pengajar
            </span>
          </div>
        </div>
        <div className="ks-kartu-isi">
          {baris.length === 0 ? (
            <p className="t-small" style={{ margin: 0 }}>
              Belum ada jam aktif. Impor ketersediaan pengajar di tab Pengaturan untuk mengisinya.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="k-table ks-jam">
                <thead>
                  <tr>
                    <th>Jam</th>
                    <th style={{ width: '38%' }}>Antre dan daya tampung</th>
                    <th className="r">Pengajar</th>
                    <th className="r">Halaqah bisa / butuh</th>
                    <th className="r">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {baris.map((b) => (
                    <tr key={b.slot_id}>
                      <td>
                        <SelJam b={b} tampilGender={tampilGender} />
                      </td>
                      <td>
                        <BatangJam b={b} maks={maks} />
                      </td>
                      <td className="r">{b.pengajar}</td>
                      <td className="r">
                        {b.bisa} <span className="t-small">/ {b.butuh}</span>
                      </td>
                      <td className="r">
                        <BadgeStatus status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck dan commit**

Run: `npm run typecheck`
Expected: tanpa galat

```bash
git add src/app/ketersediaan/koordinator/dasbor/TabJam.tsx
git commit -m "feat(ketersediaan): tab jam & kapasitas dengan batang antre vs daya tampung

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 20: Peta kekurangan dan tab ringkasan

**Files:**
- Create: `src/app/ketersediaan/koordinator/dasbor/PetaKekurangan.tsx`
- Create: `src/app/ketersediaan/koordinator/dasbor/TabRingkasan.tsx`

- [ ] **Step 1: Peta kekurangan**

Create `src/app/ketersediaan/koordinator/dasbor/PetaKekurangan.tsx`:

```tsx
import { kunciSel, tingkatPeta, type Peta } from '@/lib/ketersediaan-dasbor';

const fmt = (n: number) => n.toLocaleString('id-ID');

/** Warna tingkat 1–5 — sama dengan .ks-peta td.t1..t5 di globals.css. */
const SKALA = [
  { t: 1, label: '1–24', warna: '#cde2fb' },
  { t: 2, label: '25–49', warna: '#9ec5f4' },
  { t: 3, label: '50–99', warna: '#5598e7' },
  { t: 4, label: '100–199', warna: '#256abf' },
  { t: 5, label: '200+', warna: '#104281' },
];

/**
 * Heatmap pasangan hari × jam mulai. Tugasnya membandingkan besaran, jadi satu
 * hue bergradasi (tervalidasi, spec §7.6). Tabel lengkapnya ada di tab Jam.
 */
export function PetaKekurangan({ peta }: { peta: Peta }) {
  if (peta.jam.length === 0) {
    return (
      <p className="t-small" style={{ margin: 0, color: 'var(--muted)' }}>
        Belum ada jam di periode ini.
      </p>
    );
  }
  return (
    <figure style={{ margin: 0 }}>
      <div className="table-scroll">
        <table className="ks-peta">
          <caption className="sr-only">Pendaftar belum tertampung per pasangan hari dan jam mulai</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Hari</span>
              </th>
              {peta.jam.map((j) => (
                <th key={j} scope="col">
                  {j}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {peta.hari.map((h) => (
              <tr key={h.kunci}>
                <th scope="row">{h.label}</th>
                {peta.jam.map((j) => {
                  const s = peta.sel[kunciSel(h.kunci, j)];
                  if (!s) {
                    return <td key={j} className="kosong" aria-label={`${h.label} ${j}: tidak ditawarkan`} />;
                  }
                  return (
                    <td
                      key={j}
                      className={`t${tingkatPeta(s.sisa)}`}
                      tabIndex={0}
                      aria-label={`${h.label} ${j}: ${fmt(s.sisa)} belum tertampung dari ${fmt(s.antre)} antre, ${s.pengajar} pengajar`}
                    >
                      {fmt(s.sisa)}
                      <span className="tip" role="tooltip">
                        <b>
                          {h.label} · {j}
                        </b>
                        <br />
                        Antre {fmt(s.antre)} · pengajar {s.pengajar}
                        <br />
                        Belum tertampung {fmt(s.sisa)}
                        {s.jumlahJam > 1 && (
                          <>
                            <br />
                            online {fmt(s.sisaOnline)} · offline {fmt(s.sisaOffline)}
                          </>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="ks-peta-legenda">
        <span>Belum tertampung:</span>
        <span>
          <i style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} />0
        </span>
        {SKALA.map((s) => (
          <span key={s.t}>
            <i style={{ background: s.warna }} />
            {s.label}
          </span>
        ))}
        <span>
          <i style={{ background: 'repeating-linear-gradient(135deg, transparent 0 4px, var(--line) 4px 5px)' }} />
          jam tidak ditawarkan
        </span>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Tab ringkasan**

Create `src/app/ketersediaan/koordinator/dasbor/TabRingkasan.tsx`:

```tsx
import Link from 'next/link';
import type { AngkaJam, BarisJam, Peta } from '@/lib/ketersediaan-dasbor';
import { PetaKekurangan } from './PetaKekurangan';
import { BadgeStatus, BatangJam, SelJam } from './TabJam';

export interface ButirTugas {
  nada: 'merah' | 'kuning' | 'aksen';
  judul: string;
  desk: string;
  href: string;
  label: string;
}

export interface AngkaRingkasan extends AngkaJam {
  pengajar: number;
}

const fmt = (n: number) => n.toLocaleString('id-ID');
const WARNA_NADA = { merah: 'var(--merah)', kuning: 'var(--kuning)', aksen: 'var(--accent)' } as const;

export function TabRingkasan({
  angka,
  pecah,
  tugas,
  teratas,
  peta,
  hrefJam,
  tampilGender,
}: {
  angka: AngkaRingkasan;
  /** Pecahan per gender; null bila dashboard sudah disaring satu gender. */
  pecah: { ikhwan: AngkaRingkasan; akhwat: AngkaRingkasan } | null;
  tugas: ButirTugas[];
  teratas: BarisJam[];
  peta: Peta;
  hrefJam: string;
  tampilGender: boolean;
}) {
  const persen = angka.antre > 0 ? Math.round((angka.sisa / angka.antre) * 100) : 0;
  const pecahan = (k: keyof AngkaRingkasan) =>
    pecah ? (
      <span className="pecah">
        Ikhwan <b>{fmt(pecah.ikhwan[k])}</b> · Akhwat <b>{fmt(pecah.akhwat[k])}</b>
      </span>
    ) : null;
  const maks = Math.max(1, ...teratas.map((b) => b.antre));

  return (
    <div className="ks-isi">
      <div className="ks-angka">
        <div className="stat">
          <span className="l">Menunggu halaqah</span>
          <span className="v">{fmt(angka.antre)}</span>
          {pecahan('antre')}
          <span className="ket">Pendaftar sah yang belum masuk usulan. Kiriman ulang formulir dihitung sekali.</span>
        </div>
        <div className="stat">
          <span className="l">Pengajar tersedia</span>
          <span className="v">{fmt(angka.pengajar)}</span>
          {pecahan('pengajar')}
          <span className="ket">Orang, bukan jam. Satu pengajar bisa menyanggupi beberapa jam.</span>
        </div>
        <div className="stat">
          <span className="l">Bisa ditampung</span>
          <span className="v">{fmt(angka.tampung)}</span>
          {pecahan('tampung')}
          <span className="ket">Pengajar bebas di tiap jam × kapasitas, tidak lebih dari yang mengantre di jam itu.</span>
        </div>
        <div className={`stat${angka.sisa > 0 ? ' buruk' : ''}`}>
          <span className="l">Belum tertampung</span>
          <span className="v">{fmt(angka.sisa)}</span>
          {pecahan('sisa')}
          <span className="ket">
            {angka.sisa > 0
              ? `Sekitar ${persen}% dari yang menunggu. Batasnya jumlah pengajar di jam itu.`
              : 'Semua yang menunggu bisa ditampung.'}
          </span>
        </div>
      </div>

      <p className="ks-catatan-angka" style={{ margin: 0 }}>
        Sudah masuk usulan di periode ini: <b>{fmt(angka.dialokasikan)}</b> · sudah dapat halaqah di periode lain:{' '}
        <b>{fmt(angka.terpakaiLain)}</b> · ditahan saringan: <b>{fmt(angka.tertahan)}</b>
      </p>

      <div className="ks-dua">
        <div className="ks-kartu">
          <div className="ks-kartu-kepala">
            <h2>Perlu tindakan</h2>
            <p>Urut dari yang paling mendesak</p>
          </div>
          <div className="ks-kartu-isi">
            {tugas.length === 0 ? (
              <p className="t-small" style={{ margin: 0 }}>
                Tidak ada yang menunggu.
              </p>
            ) : (
              <ul className="ks-tugas">
                {tugas.map((t) => (
                  <li key={t.judul}>
                    <Link href={t.href}>
                      <span className="tanda" style={{ background: WARNA_NADA[t.nada] }} aria-hidden="true" />
                      <span>
                        <span className="judul" style={{ display: 'block' }}>
                          {t.judul}
                        </span>
                        <span className="desk" style={{ display: 'block' }}>
                          {t.desk}
                        </span>
                      </span>
                      <span className="ke">{t.label} →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="ks-kartu">
          <div className="ks-kartu-kepala">
            <h2>Jam paling kekurangan pengajar</h2>
            <Link href={hrefJam} className="t-small" style={{ color: 'var(--accent-2)', fontWeight: 600 }}>
              Lihat semua jam →
            </Link>
          </div>
          <div className="ks-kartu-isi">
            {teratas.length === 0 ? (
              <p className="t-small" style={{ margin: 0 }}>
                Tidak ada jam yang kekurangan pengajar.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="k-table ks-jam">
                  <tbody>
                    {teratas.map((b) => (
                      <tr key={b.slot_id}>
                        <td>
                          <SelJam b={b} tampilGender={tampilGender} />
                        </td>
                        <td style={{ width: '45%' }}>
                          <BatangJam b={b} maks={maks} />
                        </td>
                        <td className="r">
                          <BadgeStatus status={b.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ks-kartu">
        <div className="ks-kartu-kepala">
          <h2>Peta kekurangan pengajar</h2>
          <p>Makin gelap, makin banyak pendaftar yang belum tertampung</p>
        </div>
        <div className="ks-kartu-isi">
          <PetaKekurangan peta={peta} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck dan commit**

Run: `npm run typecheck`
Expected: tanpa galat

```bash
git add src/app/ketersediaan/koordinator/dasbor/PetaKekurangan.tsx src/app/ketersediaan/koordinator/dasbor/TabRingkasan.tsx
git commit -m "feat(ketersediaan): tab ringkasan — angka, perlu tindakan, jam terkurang, peta kekurangan

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 21: Daftar pengajar

**Files:**
- Create: `src/app/ketersediaan/koordinator/dasbor/DaftarPengajar.tsx`

- [ ] **Step 1: Implementasi**

Create `src/app/ketersediaan/koordinator/dasbor/DaftarPengajar.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { BarisPengajarDasbor } from '../data';

export function DaftarPengajar({ baris, tampilGender }: { baris: BarisPengajarDasbor[]; tampilGender: boolean }) {
  const [cari, setCari] = useState('');
  const q = cari.trim().toLowerCase();
  const tampil = q ? baris.filter((b) => b.nama.toLowerCase().includes(q)) : baris;
  const belum = baris.filter((b) => b.halaqah === 0).length;

  return (
    <div className="ks-isi">
      <div className="ks-kartu">
        <div className="ks-kartu-kepala">
          <h2>Pengajar dan jam yang disanggupi</h2>
          <input
            id="cari-pengajar"
            className="ks-cari"
            type="search"
            placeholder="Cari nama pengajar"
            aria-label="Cari nama pengajar"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>
        <div className="ks-kartu-isi">
          <p className="t-small" style={{ marginTop: 0 }}>
            {baris.length} pengajar · {belum} belum mendapat halaqah. Angka setelah jam adalah urutan prioritas di jam
            itu. Kuning: bertabrakan dengan halaqah yang masih berjalan — dicatat, tidak dikunci.
          </p>
          {tampil.length === 0 ? (
            <p className="t-small" style={{ margin: 0 }}>
              {baris.length === 0 ? 'Belum ada ketersediaan. Impor dari xlsx di tab Pengaturan.' : 'Tidak ada pengajar yang cocok.'}
            </p>
          ) : (
            <div className="table-scroll">
              <table className="k-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Jam yang disanggupi</th>
                    <th style={{ textAlign: 'right' }}>Halaqah</th>
                    <th style={{ textAlign: 'right' }}>Sumber</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="nm">{b.nama}</div>
                        <div className="sub">
                          {tampilGender ? `${b.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · ` : ''}
                          {b.jam.length} jam{b.status !== 'aktif' ? ` · ${b.status}` : ''}
                        </div>
                      </td>
                      <td>
                        <div className="ks-chip-daftar">
                          {b.jam.map((j, i) => (
                            <span key={i} className={`ks-chip${j.bentrok ? ' bentrok' : ''}`} title={j.bentrok ?? undefined}>
                              {j.label}
                              {j.mode === 'offline' ? ' · offline' : ''}
                              {j.prioritas !== null && <span className="pr">#{j.prioritas}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {b.halaqah > 0 ? b.halaqah : <span className="badge badge-neutral">belum</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="badge badge-neutral">{b.sumber === 'impor' ? 'impor xlsx' : 'isi sendiri'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck dan commit**

Run: `npm run typecheck`
Expected: tanpa galat

```bash
git add src/app/ketersediaan/koordinator/dasbor/DaftarPengajar.tsx
git commit -m "feat(ketersediaan): daftar pengajar dengan jam berprioritas dan pencarian

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 22: Chart arus pendaftar

**Files:**
- Create: `src/app/ketersediaan/koordinator/dasbor/ArusPendaftarChart.tsx`

Palet tervalidasi (spec §7.6): ikhwan `#2a78d6`, akhwat `#eb6834`. Satu sumbu Y. Legenda hanya bila dua garis; satu garis dinamai judul kartunya. Label nilai hanya di ujung garis.

- [ ] **Step 1: Implementasi**

Create `src/app/ketersediaan/koordinator/dasbor/ArusPendaftarChart.tsx`:

```tsx
'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TitikArus } from '@/lib/ketersediaan-dasbor';

const WARNA = { ikhwan: '#2a78d6', akhwat: '#eb6834' } as const;
const NAMA = { ikhwan: 'Ikhwan', akhwat: 'Akhwat' } as const;

const tanggalPendek = (t: string) =>
  new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const angka = (n: number) => n.toLocaleString('id-ID');

export function ArusPendaftarChart({
  data,
  tampil,
  batasAntrean,
}: {
  data: TitikArus[];
  tampil: ('ikhwan' | 'akhwat')[];
  /** Tanggal antrean tertua genap batas penggabungan kelompok umur. */
  batasAntrean: string | null;
}) {
  if (data.length === 0) {
    return (
      <p className="t-small" style={{ margin: 0, color: 'var(--muted)' }}>
        Belum ada pendaftar yang ditarik untuk periode ini.
      </p>
    );
  }
  const akhir = data[data.length - 1];
  const garisBatas = batasAntrean && batasAntrean >= data[0].tanggal && batasAntrean <= akhir.tanggal;

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 64, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="tanggal"
              tickFormatter={tanggalPendek}
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={48}
              allowDecimals={false}
              tickFormatter={(v: number) => angka(v)}
            />
            <Tooltip
              labelFormatter={(t) => tanggalPendek(String(t))}
              formatter={(v, n) => [angka(Number(v)), NAMA[n as keyof typeof NAMA] ?? String(n)]}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 8, fontSize: 12 }}
              cursor={{ stroke: 'var(--line-2)' }}
            />
            {tampil.length > 1 && (
              <Legend formatter={(v) => NAMA[v as keyof typeof NAMA] ?? v} wrapperStyle={{ fontSize: 12 }} />
            )}
            {garisBatas && (
              <ReferenceLine
                x={batasAntrean}
                stroke="var(--muted-2)"
                label={{ value: 'kelompok umur boleh digabung', position: 'insideTopRight', fontSize: 11, fill: 'var(--muted)' }}
              />
            )}
            {tampil.map((g) => (
              <Line
                key={g}
                type="monotone"
                dataKey={g}
                name={g}
                stroke={WARNA[g]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
                label={({ x, y, index }: { x: number; y: number; index: number }) =>
                  index === data.length - 1 ? (
                    <text x={x + 8} y={y + 4} fontSize={12} fill="var(--ink-2)">
                      {angka(akhir[g])}
                    </text>
                  ) : (
                    <g />
                  )
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="t-small" style={{ color: 'var(--muted)', marginTop: 6 }}>
        Jumlah pendaftar kumulatif per hari sejak kiriman pertama, termasuk yang tertahan saringan. Kiriman ulang
        formulir tidak dihitung dua kali.
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Typecheck dan commit**

Run: `npm run typecheck`
Expected: tanpa galat. Bila tipe `label` pada `Line` ditolak versi recharts ini, ubah tanda tangan fungsinya menjadi `(p: any)` dan baca `p.x`, `p.y`, `p.index` — perilakunya sama.

```bash
git add src/app/ketersediaan/koordinator/dasbor/ArusPendaftarChart.tsx
git commit -m "feat(ketersediaan): chart arus pendaftar kumulatif per gender

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 23: Rakit dashboard

**Files:**
- Modify: `src/app/ketersediaan/koordinator/PanelPeriode.tsx`
- Rewrite: `src/app/ketersediaan/koordinator/page.tsx`

- [ ] **Step 1: `PeriodeBaru` diekspor, `PanelPeriode` untuk periode yang ada**

Di `src/app/ketersediaan/koordinator/PanelPeriode.tsx`, ganti:

```tsx
interface Props {
  periode: KsPeriode | null;
  daftarPeriode: { id: string; nama: string; aktif: boolean }[];
  superadmin: boolean;
}

export function PanelPeriode({ periode, superadmin }: Props) {
  return periode ? (
    <>
      <AturanPeriode periode={periode} />
      <TujuanTilawah periode={periode} superadmin={superadmin} />
    </>
  ) : (
    <PeriodeBaru />
  );
}

function PeriodeBaru() {
```

menjadi:

```tsx
export function PanelPeriode({ periode, superadmin }: { periode: KsPeriode; superadmin: boolean }) {
  return (
    <>
      <AturanPeriode periode={periode} />
      <TujuanTilawah periode={periode} superadmin={superadmin} />
    </>
  );
}

export function PeriodeBaru() {
```

Ganti:

```tsx
  const [isiBawaan, setIsiBawaan] = useState(true);
```

menjadi:

```tsx
  // Master bawaan sudah tertinggal dari formulir nyata; jam diisi lewat impor xlsx.
  const [isiBawaan, setIsiBawaan] = useState(false);
```

Ganti:

```tsx
      keterangan="Periode lepas dari batch HITS — satu periode boleh melahirkan halaqah di beberapa batch."
```

menjadi:

```tsx
      keterangan="Satu periode = satu batch KBM, mis. Batch Oktober 2026. Tanggal mulai adalah hari pertama KBM: dipakai menentukan halaqah lama mana yang masih berjalan."
```

Ganti:

```tsx
            placeholder="September–Oktober 2026"
```

menjadi:

```tsx
            placeholder="Batch Oktober 2026"
```

Ganti label tanggal mulai (satu-satunya `>Mulai<` di berkas):

```tsx
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Mulai</span>
```

menjadi:

```tsx
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Mulai KBM</span>
```

- [ ] **Step 2: Tulis ulang halaman**

Replace seluruh isi `src/app/ketersediaan/koordinator/page.tsx` dengan:

```tsx
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { requireOneOfRoles } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';
import { FeatureNav } from '@/components/FeatureNav';
import { bolehLihatFiturTersembunyi, isSuperadmin } from '@/lib/admin-guard';
import { listPeriode, listSlot } from '@/lib/ketersediaan-periode';
import { ringkasSlot } from '@/lib/ketersediaan-permintaan';
import { listPreset } from '@/lib/ketersediaan-prioritas';
import { ringkasDitahan } from '@/lib/ketersediaan-ditahan';
import {
  jumlahkan,
  susunArus,
  susunBarisJam,
  susunPeta,
  tanggalBatasAntrean,
  type BarisJam,
} from '@/lib/ketersediaan-dasbor';
import type { Gender } from '@/types/db';
import { PanelPeriode, PeriodeBaru } from './PanelPeriode';
import { PanelSlot } from './PanelSlot';
import { PanelKerja } from './PanelKerja';
import { PanelPendaftar } from './PanelPendaftar';
import { PanelPengingat } from './PanelPengingat';
import { PanelGrupPool } from './PanelGrupPool';
import { PanelDitahan } from './PanelDitahan';
import { PanelImpor } from './PanelImpor';
import {
  hitungPengajarTersedia,
  muatAntrean,
  muatGrupPool,
  muatPendaftarRingkas,
  muatPengajarDasbor,
  muatSumber,
  muatTugas,
  muatUsulan,
  type TugasGender,
} from './data';
import { bacaGender, bacaTab, tautanDasbor, type TabDasbor } from './dasbor/navigasi';
import { KepalaDasbor } from './dasbor/KepalaDasbor';
import { TabRingkasan, type ButirTugas } from './dasbor/TabRingkasan';
import { TabJam } from './dasbor/TabJam';
import { DaftarPengajar } from './dasbor/DaftarPengajar';
import { ArusPendaftarChart } from './dasbor/ArusPendaftarChart';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('id-ID');

export default async function KetersediaanKoordinatorPage({
  searchParams,
}: {
  searchParams: { periode?: string; tab?: string; g?: string };
}) {
  const sesi = await requireOneOfRoles(['koordinator']);
  // Masih disembunyikan: hanya superadmin (dan sesi login-sebagai oleh superadmin).
  if (!(await bolehLihatFiturTersembunyi())) notFound();

  const superadmin = await isSuperadmin();
  const sekarang = new Date();
  const semuaPeriode = await listPeriode();
  const tab = bacaTab(searchParams.tab);
  const g = bacaGender(searchParams.g, superadmin ? 'semua' : sesi.gender);

  const periode =
    semuaPeriode.find((p) => p.id === searchParams.periode) ??
    semuaPeriode.find((p) => p.aktif) ??
    semuaPeriode[0] ??
    null;

  if (!periode) {
    return (
      <Bingkai>
        <Kop />
        <FeatureNav current="/ketersediaan/koordinator" />
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Kelola Ketersediaan Mengajar</h1>
        <p className="t-small" style={{ color: 'var(--muted)', marginBottom: 16 }}>
          Belum ada periode. Buat satu periode per batch KBM — misalnya Batch September 2026 dan Batch Oktober 2026 —
          lalu impor ketersediaan pengajar dari xlsx di tab Pengaturan.
        </p>
        <PeriodeBaru />
      </Bingkai>
    );
  }

  const slots = await listSlot(periode.id);
  const slotAktif = slots.filter((s) => s.aktif);
  const [ringkas, pengajarSemua, tugas, pendaftarSemua] = await Promise.all([
    ringkasSlot(periode, slotAktif, sekarang),
    muatPengajarDasbor(periode.id),
    muatTugas(periode.id, sekarang),
    muatPendaftarRingkas(periode.id),
  ]);

  const saring = <T,>(xs: readonly T[], genderDari: (x: T) => Gender | null): T[] =>
    g === 'semua' ? [...xs] : xs.filter((x) => genderDari(x) === g);

  const jamSemua = susunBarisJam(slotAktif, ringkas, periode.kapasitas_halaqah);
  const jam = saring(jamSemua, (b) => b.kelompok);
  const pengajar = saring(pengajarSemua, (p) => p.gender);
  const pendaftar = saring(pendaftarSemua, (p) => p.gender);

  // Pendaftar ditahan dihitung dari barisnya, bukan per jam: sebagian besar
  // tertahan justru karena jamnya tidak terbaca, jadi tak punya slot.
  const tertahanUntuk = (gender?: Gender) =>
    pendaftarSemua.filter((p) => p.status === 'ditahan' && (!gender || p.gender === gender)).length;
  const angkaUntuk = (baris: readonly BarisJam[], gender?: Gender) => ({
    ...jumlahkan(baris),
    tertahan: tertahanUntuk(gender),
    pengajar: hitungPengajarTersedia(pengajarSemua, gender),
  });
  const angka = angkaUntuk(jam, g === 'semua' ? undefined : g);
  const pecah =
    g === 'semua'
      ? {
          ikhwan: angkaUntuk(jamSemua.filter((b) => b.kelompok === 'ikhwan'), 'ikhwan'),
          akhwat: angkaUntuk(jamSemua.filter((b) => b.kelompok === 'akhwat'), 'akhwat'),
        }
      : null;

  const tugasG: TugasGender =
    g === 'semua'
      ? {
          usulanMenunggu: tugas.ikhwan.usulanMenunggu + tugas.akhwat.usulanMenunggu,
          tenggatLewat: tugas.ikhwan.tenggatLewat + tugas.akhwat.tenggatLewat,
          sanggahan: tugas.ikhwan.sanggahan + tugas.akhwat.sanggahan,
        }
      : tugas[g];

  const href = (t: TabDasbor) => tautanDasbor({ periode: periode.id, tab: t, g });
  const tanpaPengajar = jam.filter((b) => b.status === 'tanpa_pengajar');
  const kurangPengajar = jam.filter((b) => b.status === 'kurang');

  const butir: ButirTugas[] = [];
  if (slotAktif.length === 0) {
    butir.push({
      nada: 'aksen',
      judul: 'Periode ini belum punya jam',
      desk: 'Impor ketersediaan pengajar dari xlsx untuk mengisi master jam.',
      href: href('pengaturan'),
      label: 'Buka impor',
    });
  }
  if (tanpaPengajar.length > 0) {
    butir.push({
      nada: 'merah',
      judul: `${tanpaPengajar.length} jam tanpa pengajar sama sekali`,
      desk: `${fmt(tanpaPengajar.reduce((a, b) => a + b.antre, 0))} pendaftar menunggu di jam itu dan belum bisa dibentuk halaqahnya.`,
      href: href('jam'),
      label: 'Lihat jam',
    });
  }
  if (tugasG.tenggatLewat > 0) {
    butir.push({
      nada: 'merah',
      judul: `${tugasG.tenggatLewat} konfirmasi pengajar lewat tenggat`,
      desk: 'Belum digeser ke pengajar berikutnya. Jalankan "Sapu yang lewat tenggat".',
      href: href('usulan'),
      label: 'Buka usulan',
    });
  }
  if (tugasG.usulanMenunggu > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${tugasG.usulanMenunggu} usulan halaqah menunggu dilepas`,
      desk: 'Pengajar belum dihubungi sampai usulannya dilepas.',
      href: href('usulan'),
      label: 'Buka usulan',
    });
  }
  if (angka.tertahan > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${fmt(angka.tertahan)} pendaftar ditahan`,
      desk: 'Tidak ikut dihitung sampai diperiksa: jam tak terbaca, nomor tidak sah, atau umur di luar batas.',
      href: href('pendaftar'),
      label: 'Periksa',
    });
  }
  if (tugasG.sanggahan > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${tugasG.sanggahan} sanggahan jadwal menunggu`,
      desk: 'Pengajar menyatakan jadwal yang mengunci jamnya sudah selesai.',
      href: href('usulan'),
      label: 'Putuskan',
    });
  }
  if (kurangPengajar.length > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${kurangPengajar.length} jam kekurangan pengajar`,
      desk: `${fmt(kurangPengajar.reduce((a, b) => a + b.sisa, 0))} pendaftar belum tertampung walau jamnya punya pengajar.`,
      href: href('jam'),
      label: 'Lihat jam',
    });
  }

  let isi: ReactNode;
  if (tab === 'ringkasan') {
    isi = (
      <TabRingkasan
        angka={angka}
        pecah={pecah}
        tugas={butir}
        teratas={jam.filter((b) => b.sisa > 0).slice(0, 5)}
        peta={susunPeta(jam)}
        hrefJam={href('jam')}
        tampilGender={g === 'semua'}
      />
    );
  } else if (tab === 'jam') {
    isi = <TabJam baris={jam} tampilGender={g === 'semua'} />;
  } else if (tab === 'pengajar') {
    isi = <DaftarPengajar baris={pengajar} tampilGender={g === 'semua'} />;
  } else if (tab === 'pendaftar') {
    const [ditahan, sumber] = await Promise.all([ringkasDitahan(periode.id), muatSumber(periode.id)]);
    const arus = susunArus(pendaftar);
    isi = (
      <div className="ks-isi">
        <div className="ks-kartu">
          <div className="ks-kartu-kepala">
            <h2>Arus pendaftar</h2>
            <p>{fmt(pendaftar.length)} pendaftar di periode ini</p>
          </div>
          <div className="ks-kartu-isi">
            <ArusPendaftarChart
              data={arus}
              tampil={g === 'semua' ? ['ikhwan', 'akhwat'] : [g]}
              batasAntrean={tanggalBatasAntrean(arus[0]?.tanggal ?? null, periode.usia_antrean_maks_hari)}
            />
          </div>
        </div>
        <PanelDitahan periodeId={periode.id} ringkas={ditahan} />
        <PanelPendaftar periodeId={periode.id} sumber={sumber} />
      </div>
    );
  } else if (tab === 'usulan') {
    const [antrean, usulan, preset, grupPool] = await Promise.all([
      muatAntrean(periode.id),
      muatUsulan(periode.id),
      listPreset(),
      muatGrupPool(periode.id),
    ]);
    isi = (
      <div className="ks-isi">
        <PanelKerja
          periodeId={periode.id}
          antrean={antrean}
          usulan={usulan}
          preset={preset.map((p) => ({ id: p.id, nama: p.nama, gender: p.gender, tipe: p.tipe }))}
        />
        <PanelGrupPool periodeId={periode.id} baris={grupPool} />
        <PanelPengingat periodeId={periode.id} />
      </div>
    );
  } else {
    isi = (
      <div className="ks-isi">
        <PanelImpor />
        <PeriodeBaru />
        <PanelSlot periodeId={periode.id} slots={slots} />
        <PanelPeriode periode={periode} superadmin={superadmin} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-sm btn-ghost" href={`/api/ketersediaan/ekspor?periode=${periode.id}`}>
            Unduh xlsx periode ini
          </a>
          <a className="btn btn-sm btn-ghost" href="/ketersediaan/koordinator/tilawah">
            Pemetaan &amp; pengiriman CMS tilawah
          </a>
        </div>
      </div>
    );
  }

  return (
    <Bingkai>
      <Kop />
      <FeatureNav current="/ketersediaan/koordinator" />
      <h1 className="t-h1" style={{ margin: '8px 0 2px' }}>Kelola Ketersediaan Mengajar</h1>
      <p className="t-small" style={{ color: 'var(--muted)', margin: 0 }}>
        Masih tersembunyi — hanya terlihat oleh superadmin. Pengajar belum bisa membuka halamannya.
      </p>
      <KepalaDasbor
        periode={semuaPeriode}
        aktif={periode}
        tab={tab}
        g={g}
        hitungan={{
          jam: tanpaPengajar.length,
          pendaftar: angka.tertahan,
          usulan: tugasG.usulanMenunggu + tugasG.tenggatLewat + tugasG.sanggahan,
        }}
      />
      {isi}
    </Bingkai>
  );
}

function Kop() {
  return (
    <div className="topbar">
      <div className="wordmark">
        <span className="mark">H</span> Ketersediaan Mengajar
      </div>
      <LogoutButton />
    </div>
  );
}

function Bingkai({ children }: { children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>{children}</div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: tanpa galat. Bila ada galat "unused" untuk `PanelPeriode` props lama di berkas lain, cari pemakainya dengan `grep -rn "PanelPeriode" src` — hanya `page.tsx` yang memakainya.

- [ ] **Step 4: Commit**

```bash
git add src/app/ketersediaan/koordinator/page.tsx src/app/ketersediaan/koordinator/PanelPeriode.tsx
git commit -m "feat(ketersediaan): dashboard koordinator bertab — dua periode, saring gender, impor di pengaturan

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 24: Verifikasi akhir dan serah terima

**Files:** tidak ada perubahan kode.

- [ ] **Step 1: Semua gerbang**

Run: `npm run typecheck && npm run test-ketersediaan && npm run test-ketersediaan-impor`
Expected: typecheck tanpa galat · `SEMUA LULUS` · `N lulus, 0 gagal`

- [ ] **Step 2: Berkas nyata (dibaca saja, tidak di-commit)**

Run: `KS_XLSX="/data/Downloads/04_Dev-Projects/setoran-hafalan-skeleton/setoran-hafalan/docs/KETERSEDIAAN PENGAJAR HITS '26.xlsx" npm run test-ketersediaan-impor`
Expected: `berkas nyata: 179 baris`, `berkas nyata: 3 jam dua waktu`, `berkas nyata: tiga bagian` bertanda `✓`

- [ ] **Step 3: Simulasi ulang dengan fungsi yang sudah diubah**

Skrip simulasi 16 Sep ada di scratchpad sesi perencanaan dan memanggil `saring`, `kelompokkanPendaftar`, dan `alokasikan` asli. Sekarang aturan kiriman terakhir dan pita dua kelompok sudah ada di kode, jadi jalankan TANPA saklar pengganti:

Run:
```bash
S=/tmp/claude-1000/-data-Downloads-04-Dev-Projects-setoran-hafalan-skeleton-setoran-hafalan/09e976e1-b8ab-43b6-8b4e-d3a668bf7011/scratchpad/sim
test -f "$S/simulasi.ts" && env RINGKAS=1 BATCH="Oktober 2026" NODE_PATH=./scripts/node-shims npx tsx --tsconfig ./tsconfig.json "$S/simulasi.ts" "$S" | grep -E "pendaftar valid|dapat pengajar"
```

Expected (bila berkas scratchpad masih ada):
```
[ikhwan] 443 pendaftar valid
   dapat pengajar                        : 19 halaqah, 228 orang
[akhwat] 2819 pendaftar valid
   dapat pengajar                        : 54 halaqah, 648 orang
```

Bila scratchpad sudah tidak ada, lewati langkah ini dan catat di laporan.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build selesai tanpa galat; rute `/ketersediaan/koordinator` tercantum sebagai dinamis (ƒ).

- [ ] **Step 5: Cetak DDL produksi**

Run: `npm run emit-ketersediaan-sql 2>/dev/null | sed -n '/0077_ketersediaan_impor_aturan/,$p'`
Expected: sembilan statement `alter table …` dari `0077`, masing-masing satu baris, tanpa `begin;`/`commit;`.

- [ ] **Step 6: Serah terima — dikerjakan pemilik proses, BUKAN agen**

Laporkan daftar ini apa adanya; jangan menjalankan satu pun:

1. **DDL `0077` di produksi, satu statement per kiriman**, lewat `/admin/db` atau `npm run db -- --confirm "…"`, dari keluaran Step 5. Harus selesai **sebelum** kode sampai ke `main` — kode yang membaca `ks_pengisian.sumber` akan 500 tanpa kolomnya.
2. Verifikasi: `select column_name from information_schema.columns where table_name in ('ks_ketersediaan','ks_pengisian','ks_periode') and column_name in ('prioritas','sumber','jumlah_pertemuan_dasar','jumlah_pertemuan_lanjutan')` → 4 baris.
3. Isi `ENV_TILAWAH_BASE_URL`, `ENV_TILAWAH_EMAIL`, `ENV_TILAWAH_PASSWORD` di Azure Variable Group `Maahir-Prod`.
4. Gabungkan branch ke `main` dan dorong ke remote `maheer` (cek ancestry dulu — lihat memori deploy). Prod 502 sekitar 2 menit saat deploy adalah normal.
5. Di prod (superadmin): buat periode **Batch September 2026** dan **Batch Oktober 2026** dengan tanggal mulai KBM yang benar → tab Pengaturan → impor xlsx → periksa pratinjau → simpan.
6. Pasang sumber formulir pendaftar ikhwan dan akhwat di **kedua** periode (tab Pendaftar), lalu tarik.

**Tindak lanjut yang diketahui, di luar rencana ini:** halaman `/ketersediaan/koordinator/tilawah` masih memakai `getPeriodeAktif()` (satu periode). Dengan dua periode aktif, ia selalu memilih yang tanggal mulainya paling akhir — pengiriman batch September ke CMS butuh pemilih periode di halaman itu sebelum T−7 batch September.
