# HITS F2 — Hutang Menit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lacak hutang menit pengajar (KMT/KBLA/JKG) per halaqah dan catat pelunasan (menit tambahan) presisi, tampil di form ketua + dashboard koordinator + WA tabayyun.

**Architecture:** Ledger credit (Approach B). Debit **dihitung** dari `hits_pelanggaran` (sumber kebenaran, tak diduplikasi); credit disimpan append-only di tabel baru `hits_hutang_bayar`, replace-all per `keterangan_id`. Logika inti (debit per pelanggaran + alokasi FIFO) adalah fungsi murni yang diuji terpisah dari DB. Otomasi (auto-tabayyun/cron) ditunda F3 — plan hanya menyediakan `computeHutangForHalaqah` sebagai seam.

**Tech Stack:** Next.js App Router (server actions), Supabase (service-role, RLS-on-no-policy), TypeScript, `tsx` untuk skrip uji fungsi murni. Tak ada framework test di repo — pakai skrip assert `tsx` (idiom repo).

Spec: `docs/superpowers/specs/2026-07-05-hits-f2-hutang-menit-design.md`

## File Structure

- **Create** `supabase/migrations/0037_hits_hutang_bayar.sql` — tabel credit.
- **Create** `src/lib/hits-hutang.ts` — konstanta + `hutangMenit` (murni) + `allocateHutang` (murni) + `computeHutangForHalaqah` (DB).
- **Create** `scripts/test-hutang.ts` — assert fungsi murni via `tsx`.
- **Modify** `src/types/db.ts` — tambah `interface HitsHutangBayar`.
- **Modify** `src/app/hits/ketua/actions.ts` — `submitKeteranganHarian` terima `bayar_menit`, replace-all tulis credit.
- **Modify** `src/app/hits/ketua/page.tsx` — hitung saldo, kirim ke form.
- **Modify** `src/app/hits/ketua/HitsKetuaForm.tsx` — banner saldo + input "menit ditambah" + kirim `bayar_menit`.
- **Modify** `src/lib/hits-rekap.ts` — tambah `hutangSaldo` ke `HitsRekapRow`.
- **Modify** `src/components/HitsKoordinatorTable.tsx` — kolom saldo hutang.
- **Modify** `src/lib/whatsapp.ts` + `src/app/observasi/koordinator/actions.ts` — sisipkan daftar hutang di WA tabayyun.

---

## Task 1: Migration `hits_hutang_bayar`

**Files:**
- Create: `supabase/migrations/0037_hits_hutang_bayar.sql`

- [ ] **Step 1: Tulis migration**

```sql
-- Ledger pembayaran hutang menit (F2). Credit-only: debit TIDAK disimpan di sini,
-- dihitung dari hits_pelanggaran (KMT max(0,menit-5) / KBLA menit / JKG 90).
-- Append-only; saat ketua edit sebuah pertemuan, baris untuk keterangan_id itu
-- di-replace-all (hapus lalu insert). Scope per halaqah (1 halaqah = 1 pengajar).
create table hits_hutang_bayar (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  pengajar_id uuid,                                    -- denormal utk agregasi report (F5)
  keterangan_id uuid references hits_keterangan_harian(id) on delete set null,
                                                       -- pertemuan tempat bayar dilaporkan (audit + idempoten)
  menit integer not null check (menit > 0),
  tanggal date not null,                               -- tanggal pertemuan tempat bayar dilaporkan
  dilaporkan_oleh text,                                -- ketua_kelas id / nama
  catatan text,
  created_at timestamptz not null default now()
);
create index idx_hits_hutang_bayar_halaqah on hits_hutang_bayar (halaqah_id);
create index idx_hits_hutang_bayar_pengajar on hits_hutang_bayar (pengajar_id);

alter table hits_hutang_bayar enable row level security; -- RLS on, NO policy (service-role bypass, konvensi repo)

comment on table hits_hutang_bayar is
  'Pembayaran hutang menit HITS (credit-only, per halaqah). Debit dihitung dari hits_pelanggaran.';
```

- [ ] **Step 2: Apply migration ke prod**

Gunakan Supabase MCP `apply_migration` (project ref `yvjbqrrczwvlsaqbjwrq`, name `0037_hits_hutang_bayar`) dengan isi di atas. Auto-mode: minta izin user eksplisit sebelum apply ke prod.

Verifikasi:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'hits_hutang_bayar' order by ordinal_position;
```
Expected: 8 kolom (id, halaqah_id, pengajar_id, keterangan_id, menit, tanggal, dilaporkan_oleh, catatan, created_at).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0037_hits_hutang_bayar.sql
git commit -m "feat(hits-f2): migration hits_hutang_bayar (ledger credit hutang menit)"
```

---

## Task 2: Tipe `HitsHutangBayar`

**Files:**
- Modify: `src/types/db.ts` (setelah `interface HitsPelanggaran`, sekitar baris 303)

- [ ] **Step 1: Tambah interface**

Sisipkan tepat setelah blok `HitsPelanggaran` (setelah baris `}` yang menutup interface itu):

```ts
export interface HitsHutangBayar {
  id: string;
  halaqah_id: string;
  pengajar_id: string | null;
  keterangan_id: string | null;
  menit: number;
  tanggal: string;
  dilaporkan_oleh: string | null;
  catatan: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (tak ada error baru).

- [ ] **Step 3: Commit**

```bash
git add src/types/db.ts
git commit -m "feat(hits-f2): tipe HitsHutangBayar"
```

---

## Task 3: Logika murni `hits-hutang.ts` + uji

**Files:**
- Create: `src/lib/hits-hutang.ts`
- Create: `scripts/test-hutang.ts`
- Modify: `package.json` (tambah script `test-hutang`)

- [ ] **Step 1: Tulis skrip uji dulu (gagal, fungsi belum ada)**

Create `scripts/test-hutang.ts`:

```ts
// Uji fungsi murni hutang menit. Jalankan: npm run test-hutang
import { hutangMenit, allocateHutang } from '@/lib/hits-hutang';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// --- hutangMenit ---
const P = (jenis: string, menit: number | null = null) =>
  ({ jenis, menit } as Parameters<typeof hutangMenit>[0]);
eq(hutangMenit(P('KMT', 5)), 0, 'KMT 5 menit -> 0 (dalam toleransi)');
eq(hutangMenit(P('KMT', 6)), 1, 'KMT 6 menit -> 1');
eq(hutangMenit(P('KMT', 10)), 5, 'KMT 10 menit -> 5');
eq(hutangMenit(P('KMT', null)), 0, 'KMT null -> 0');
eq(hutangMenit(P('KBLA', 8)), 8, 'KBLA 8 menit -> 8');
eq(hutangMenit(P('KBLA', 0)), 0, 'KBLA 0 -> 0');
eq(hutangMenit(P('JKG')), 90, 'JKG -> 90');
eq(hutangMenit(P('BADAL')), 0, 'BADAL -> 0');
eq(hutangMenit(P('TIDAK_LATIHAN')), 0, 'TIDAK_LATIHAN -> 0');

// --- allocateHutang (FIFO oldest-first) ---
const items = [
  { keterangan_id: 'a', tanggal: '2026-01-01', jenis: 'KMT', debit: 5 },
  { keterangan_id: 'b', tanggal: '2026-01-03', jenis: 'KBLA', debit: 8 },
  { keterangan_id: 'c', tanggal: '2026-01-05', jenis: 'JKG', debit: 90 },
];
// bayar 0
eq(allocateHutang(items, 0).map((r) => r.status), ['belum', 'belum', 'belum'], 'bayar 0 -> semua belum');
// bayar 5 -> lunasi a
eq(allocateHutang(items, 5).map((r) => [r.status, r.sisa]),
   [['lunas', 0], ['belum', 8], ['belum', 90]], 'bayar 5 -> a lunas');
// bayar 10 -> a lunas, b sebagian (terbayar 5, sisa 3)
eq(allocateHutang(items, 10).map((r) => [r.status, r.terbayar, r.sisa]),
   [['lunas', 5, 0], ['sebagian', 5, 3], ['belum', 0, 90]], 'bayar 10 -> b sebagian');
// overpay 200 -> semua lunas, tak negatif
eq(allocateHutang(items, 200).map((r) => [r.status, r.sisa]),
   [['lunas', 0], ['lunas', 0], ['lunas', 0]], 'overpay -> semua lunas, sisa 0');

if (failed > 0) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test hutang lulus.');
```

- [ ] **Step 2: Tambah npm script**

Di `package.json` scripts, tambah baris (setelah `"typecheck"`):
```json
    "test-hutang": "tsx scripts/test-hutang.ts",
```

- [ ] **Step 3: Jalankan → gagal (modul belum ada)**

Run: `npm run test-hutang`
Expected: FAIL — error resolve `@/lib/hits-hutang` (modul belum dibuat). *(Jika `@/` alias tak resolve di tsx tanpa Next, lihat catatan di bawah.)*

> Catatan alias: bila `tsx` gagal resolve `@/`, jalankan dengan tsconfig-paths: ubah script jadi `"test-hutang": "tsx --tsconfig tsconfig.json scripts/test-hutang.ts"`. Bila masih gagal, ganti import di `scripts/test-hutang.ts` jadi path relatif `../src/lib/hits-hutang`. Pilih yang jalan; jangan blokir progres.

- [ ] **Step 4: Tulis implementasi**

Create `src/lib/hits-hutang.ts`:

```ts
// Hutang menit HITS (F2). Debit dihitung dari hits_pelanggaran (sumber kebenaran):
//   KMT  -> max(0, menit - 5)   (toleransi tetap 5 menit)
//   KBLA -> menit               (tanpa toleransi)
//   JKG  -> 90                  (1 pertemuan = 90 menit; cicil hanya rencana bayar)
//   BADAL, TIDAK_LATIHAN -> 0
// Credit (pembayaran) disimpan di hits_hutang_bayar; saldo = debit - bayar.
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { HitsPelanggaran } from '@/types/db';

export const TOLERANSI_KMT = 5;
export const JKG_MENIT = 90;

/** Debit menit satu pelanggaran. Murni. */
export function hutangMenit(p: Pick<HitsPelanggaran, 'jenis' | 'menit'>): number {
  switch (p.jenis) {
    case 'KMT':
      return Math.max(0, (p.menit ?? 0) - TOLERANSI_KMT);
    case 'KBLA':
      return p.menit ?? 0;
    case 'JKG':
      return JKG_MENIT;
    default:
      return 0; // BADAL, TIDAK_LATIHAN
  }
}

export type HutangItem = {
  keterangan_id: string;
  tanggal: string;
  jenis: string; // jenis debit dominan pertemuan
  debit: number;
};

export type HutangRincian = HutangItem & {
  terbayar: number;
  sisa: number;
  status: 'belum' | 'sebagian' | 'lunas';
};

export type HutangHalaqah = {
  halaqah_id: string;
  pengajar_id: string | null;
  total_debit: number;
  total_bayar: number;
  saldo: number;
  rincian: HutangRincian[];
};

/**
 * Alokasi pembayaran ke daftar hutang secara FIFO (lunasi pertemuan terlama
 * dulu, urut tanggal). Murni — tanpa DB. `items` sudah harus per-pertemuan.
 */
export function allocateHutang(items: HutangItem[], totalBayar: number): HutangRincian[] {
  const sorted = [...items].sort((a, b) =>
    a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0
  );
  let remaining = Math.max(0, totalBayar);
  return sorted.map((i) => {
    const terbayar = Math.min(i.debit, remaining);
    remaining -= terbayar;
    const sisa = i.debit - terbayar;
    const status: HutangRincian['status'] = sisa <= 0 ? 'lunas' : terbayar > 0 ? 'sebagian' : 'belum';
    return { ...i, terbayar, sisa, status };
  });
}

// Severity utk pilih jenis debit dominan pertemuan (hanya jenis pembawa debit).
const SEV_RANK: Record<string, number> = { JKG: 0, KBLA: 1, KMT: 2 };

type KetLite = { id: string; tanggal: string };
type PelLite = { keterangan_id: string; jenis: string; menit: number | null };
type BayarLite = { menit: number };

/** Rakit hutang satu halaqah dari baris yang sudah diambil. Inti (dipakai single & bulk). */
export function buildHutang(
  halaqahId: string,
  pengajarId: string | null,
  kets: KetLite[],
  pels: PelLite[],
  bayars: BayarLite[]
): HutangHalaqah {
  const tanggalByKet = new Map(kets.map((k) => [k.id, k.tanggal]));
  // Agregasi debit per keterangan (satu pertemuan bisa >1 pelanggaran).
  const byKet = new Map<string, { debit: number; jenis: string; sev: number }>();
  for (const p of pels) {
    const d = hutangMenit(p as Pick<HitsPelanggaran, 'jenis' | 'menit'>);
    if (d <= 0) continue;
    const sev = SEV_RANK[p.jenis] ?? 99;
    const cur = byKet.get(p.keterangan_id) ?? { debit: 0, jenis: p.jenis, sev };
    cur.debit += d;
    if (sev < cur.sev) { cur.sev = sev; cur.jenis = p.jenis; }
    byKet.set(p.keterangan_id, cur);
  }
  const items: HutangItem[] = [...byKet.entries()].map(([kid, a]) => ({
    keterangan_id: kid,
    tanggal: tanggalByKet.get(kid) ?? '',
    jenis: a.jenis,
    debit: a.debit,
  }));
  const total_debit = items.reduce((s, i) => s + i.debit, 0);
  const total_bayar = bayars.reduce((s, b) => s + (b.menit ?? 0), 0);
  const rincian = allocateHutang(items, total_bayar);
  const saldo = Math.max(0, total_debit - total_bayar);
  return { halaqah_id: halaqahId, pengajar_id: pengajarId, total_debit, total_bayar, saldo, rincian };
}

/** Ambil daftar id dalam potongan (hindari URL 414 & cap 1000 baris PostgREST). */
async function chunked<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const SIZE = 100;
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += SIZE) {
    const { data } = await run(ids.slice(i, i + SIZE));
    if (data) out.push(...data);
  }
  return out;
}

/** Hitung hutang satu halaqah dari sumber (pelanggaran + pembayaran). */
export async function computeHutangForHalaqah(halaqahId: string): Promise<HutangHalaqah> {
  const { data: hal } = await supabaseAdmin
    .from('hits_halaqah').select('pengajar_id').eq('id', halaqahId).maybeSingle();
  const pengajarId = (hal?.pengajar_id as string | null) ?? null;

  const { data: kets } = await supabaseAdmin
    .from('hits_keterangan_harian').select('id, tanggal').eq('halaqah_id', halaqahId);
  const ketList = (kets ?? []) as KetLite[];
  const ketIds = ketList.map((k) => k.id);

  const pels = ketIds.length
    ? ((await supabaseAdmin.from('hits_pelanggaran').select('keterangan_id, jenis, menit').in('keterangan_id', ketIds)).data ?? [])
    : [];
  const { data: bayars } = await supabaseAdmin
    .from('hits_hutang_bayar').select('menit').eq('halaqah_id', halaqahId);

  return buildHutang(halaqahId, pengajarId, ketList, pels as PelLite[], (bayars ?? []) as BayarLite[]);
}

/**
 * Hutang untuk banyak halaqah sekaligus (dashboard koordinator). Query dichunk
 * (~4 set query total, bukan N×3), lalu hitung per-halaqah in-memory. Debit
 * kumulatif lintas-waktu (bukan hanya bulan berjalan).
 */
export async function computeHutangForHalaqahList(halaqahIds: string[]): Promise<Map<string, HutangHalaqah>> {
  const result = new Map<string, HutangHalaqah>();
  if (!halaqahIds.length) return result;

  const halRows = await chunked<{ id: string; pengajar_id: string | null }>(halaqahIds, (ids) =>
    supabaseAdmin.from('hits_halaqah').select('id, pengajar_id').in('id', ids));
  const pengajarByHal = new Map(halRows.map((h) => [h.id, h.pengajar_id ?? null]));

  const kets = await chunked<{ id: string; halaqah_id: string; tanggal: string }>(halaqahIds, (ids) =>
    supabaseAdmin.from('hits_keterangan_harian').select('id, halaqah_id, tanggal').in('halaqah_id', ids));
  const ketByHal = new Map<string, KetLite[]>();
  const halByKet = new Map<string, string>();
  for (const k of kets) {
    halByKet.set(k.id, k.halaqah_id);
    const arr = ketByHal.get(k.halaqah_id) ?? [];
    arr.push({ id: k.id, tanggal: k.tanggal });
    ketByHal.set(k.halaqah_id, arr);
  }

  const ketIds = kets.map((k) => k.id);
  const pels = await chunked<PelLite>(ketIds, (ids) =>
    supabaseAdmin.from('hits_pelanggaran').select('keterangan_id, jenis, menit').in('keterangan_id', ids));
  const pelByHal = new Map<string, PelLite[]>();
  for (const p of pels) {
    const hid = halByKet.get(p.keterangan_id);
    if (!hid) continue;
    const arr = pelByHal.get(hid) ?? [];
    arr.push(p);
    pelByHal.set(hid, arr);
  }

  const bayars = await chunked<{ halaqah_id: string; menit: number }>(halaqahIds, (ids) =>
    supabaseAdmin.from('hits_hutang_bayar').select('halaqah_id, menit').in('halaqah_id', ids));
  const bayarByHal = new Map<string, BayarLite[]>();
  for (const b of bayars) {
    const arr = bayarByHal.get(b.halaqah_id) ?? [];
    arr.push({ menit: b.menit });
    bayarByHal.set(b.halaqah_id, arr);
  }

  for (const hid of halaqahIds) {
    result.set(hid, buildHutang(
      hid, pengajarByHal.get(hid) ?? null,
      ketByHal.get(hid) ?? [], pelByHal.get(hid) ?? [], bayarByHal.get(hid) ?? []
    ));
  }
  return result;
}
```

- [ ] **Step 5: Jalankan uji → lulus**

Run: `npm run test-hutang`
Expected: PASS — "Semua test hutang lulus."

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hits-hutang.ts scripts/test-hutang.ts package.json
git commit -m "feat(hits-f2): lib hutang menit (hutangMenit, allocateHutang FIFO, computeHutangForHalaqah) + uji"
```

---

## Task 4: Server action tulis pembayaran

**Files:**
- Modify: `src/app/hits/ketua/actions.ts`

- [ ] **Step 1: Import compute**

Tambah import di bawah import `loadHalaqahPertemuan` (baris ~6):
```ts
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
```

- [ ] **Step 2: Baca & validasi `bayar_menit`**

Di `submitKeteranganHarian`, setelah baris `const catatan = ...` (sekitar baris 160), tambah:
```ts
  const bayarMenitRaw = Number(fd.get('bayar_menit') ?? 0);
  const bayarMenit = Number.isFinite(bayarMenitRaw) && bayarMenitRaw > 0 ? Math.trunc(bayarMenitRaw) : 0;
```

- [ ] **Step 3: Tulis credit setelah pelanggaran tersimpan**

Sisipkan blok berikut TEPAT SETELAH blok sinkron `hits_pelanggaran` (setelah baris 261 `}` yang menutup `if (pelRows.length > 0)`), SEBELUM komentar lifecycle tabayyun (baris 263):

```ts
  // Pembayaran hutang menit (F2): replace-all per keterangan (idempoten saat edit).
  // Cap ke saldo terkini agar tak overpay (saldo dihitung setelah credit lama ket ini dihapus).
  await supabaseAdmin.from('hits_hutang_bayar').delete().eq('keterangan_id', saved.id);
  if (bayarMenit > 0) {
    const { saldo } = await computeHutangForHalaqah(halaqahId);
    const menit = Math.min(bayarMenit, saldo);
    if (menit > 0) {
      const { data: hq } = await supabaseAdmin
        .from('hits_halaqah')
        .select('pengajar_id')
        .eq('id', halaqahId)
        .maybeSingle();
      const { error: bayarErr } = await supabaseAdmin.from('hits_hutang_bayar').insert({
        halaqah_id: halaqahId,
        pengajar_id: (hq?.pengajar_id as string | null) ?? null,
        keterangan_id: saved.id,
        menit,
        tanggal: match.tanggal,
        dilaporkan_oleh: session.ketua_kelas_id,
      });
      if (bayarErr) return { error: `Gagal menyimpan pembayaran: ${bayarErr.message}` };
    }
  }
```

> Catatan: `computeHutangForHalaqah` dipanggil setelah `hits_pelanggaran` untuk keterangan ini di-update, jadi debit hari ini sudah ikut dihitung. Credit lama untuk keterangan ini sudah dihapus di baris atas, jadi cap saldo benar (tak double-count pembayaran yang sedang diedit).

- [ ] **Step 4: Sertakan bayar di audit detail**

Ubah `detail` pada `logAudit` (sekitar baris 305) menjadi:
```ts
    detail: { halaqah_id: halaqahId, pertemuan_no: pertemuanNo, kondisi, jenis: jenisList, bayar_menit: bayarMenit },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/hits/ketua/actions.ts
git commit -m "feat(hits-f2): submitKeteranganHarian catat pembayaran hutang (cap saldo, idempoten)"
```

---

## Task 5: Kirim saldo ke form (page.tsx)

**Files:**
- Modify: `src/app/hits/ketua/page.tsx`

- [ ] **Step 1: Import compute**

Tambah setelah import `getHitsRekapForHalaqah` (baris 8):
```ts
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
```

- [ ] **Step 2: Hitung saldo**

Setelah baris `const rekap = await getHitsRekapForHalaqah(halaqah.id, month);` (baris 129), tambah:
```ts
  const hutang = await computeHutangForHalaqah(halaqah.id);
```

- [ ] **Step 3: Teruskan ke form**

Ubah pemanggilan `<HitsKetuaForm ... />` (baris 210-215), tambah prop `hutangSaldo`:
```tsx
          <HitsKetuaForm
            halaqahName={halaqah.name}
            pengajarName={halaqah.pengajar_nama_sheet ?? '—'}
            slots={slots}
            todayUnfilled={!!todaySlot && !todaySlot.keterangan}
            hutangSaldo={hutang.saldo}
          />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: FAIL — `HitsKetuaForm` belum punya prop `hutangSaldo` (dibetulkan Task 6). Lanjut.

- [ ] **Step 5: (tanpa commit — gabung dengan Task 6)**

---

## Task 6: Banner + input pembayaran (HitsKetuaForm)

**Files:**
- Modify: `src/app/hits/ketua/HitsKetuaForm.tsx`

- [ ] **Step 1: Tambah prop ke interface**

Ubah `interface Props` (baris 75-80):
```ts
interface Props {
  halaqahName: string;
  pengajarName: string;
  slots: PertemuanSlot[];
  todayUnfilled: boolean;
  hutangSaldo: number;
}
```
Dan destructure di komponen (baris 82):
```ts
export function HitsKetuaForm({ halaqahName, pengajarName, slots: initialSlots, todayUnfilled, hutangSaldo }: Props) {
```

- [ ] **Step 2: State input bayar**

Setelah `const [catatan, setCatatan] = useState('');` (baris 137), tambah:
```ts
  const [bayarMenit, setBayarMenit] = useState('');
```
Dan reset di `loadInto`, setelah `setCatatan(k?.catatan ?? '');` (baris 162):
```ts
    setBayarMenit('');
```

- [ ] **Step 3: Kirim bayar di payload**

Di `buildPayload`, sebelum `return { ok: true, fd };` (baris 228), tambah:
```ts
    const bayar = Number(bayarMenit);
    fd.set('bayar_menit', String(Number.isFinite(bayar) && bayar > 0 ? Math.trunc(bayar) : 0));
```

- [ ] **Step 4: Banner + input di form**

Sisipkan blok berikut di dalam `formUI`, tepat SEBELUM blok Catatan (`<div style={{ marginBottom: 14 }}>` yang berisi `field-label` "Catatan (opsional)", baris 475):

```tsx
      {hutangSaldo > 0 && (
        <div
          className="card-flat"
          style={{ padding: '12px 14px', marginBottom: 14, background: 'var(--kuning-tint)', borderColor: 'var(--kuning-line)' }}
        >
          <p className="t-small" style={{ fontWeight: 600, color: 'var(--kuning-ink)', marginBottom: 6 }}>
            Sisa hutang menit pengajar: {hutangSaldo} menit
          </p>
          <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>
            Pengajar menambah berapa menit pada pertemuan ini? (opsional)
          </label>
          <input
            type="number" min={0} max={hutangSaldo} className="input" style={{ maxWidth: 160 }}
            value={bayarMenit}
            onChange={(e) => setBayarMenit(e.target.value)}
            placeholder="menit ditambah"
          />
        </div>
      )}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (memperbaiki juga error Task 5).

- [ ] **Step 6: Commit**

```bash
git add src/app/hits/ketua/page.tsx src/app/hits/ketua/HitsKetuaForm.tsx
git commit -m "feat(hits-f2): banner sisa hutang + input menit ditambah di form ketua"
```

---

## Task 7: Kolom saldo hutang di dashboard koordinator

**Files:**
- Modify: `src/lib/hits-rekap.ts`
- Modify: `src/components/HitsKoordinatorTable.tsx`

- [ ] **Step 1: Tambah field ke `HitsRekapRow`**

Di `src/lib/hits-rekap.ts`, tambah field ke type `HitsRekapRow` (setelah `kondisiCount: ...`, baris 32):
```ts
  hutangSaldo: number; // total menit hutang belum terbayar (F2)
```

- [ ] **Step 2: Hitung saldo bulk di `getHitsRekap`**

Di `src/lib/hits-rekap.ts`, tambah import di dekat import lain (atas file):
```ts
import { computeHutangForHalaqahList } from '@/lib/hits-hutang';
```

`getHitsRekap` saat ini mengakhiri dengan `return halaqah.map((h) => { ... });` (baris 178-227). Ubah jadi array lalu isi saldo bulk:

1. Ganti pembuka map (baris 178) dari:
```ts
  return halaqah.map((h) => {
```
menjadi:
```ts
  const rows: HitsRekapRow[] = halaqah.map((h) => {
```

2. Di objek literal yang dikembalikan tiap iterasi, setelah baris `kondisiCount,` (baris 225), tambah:
```ts
      hutangSaldo: 0,
```

3. Setelah penutup map `});` (baris 227), sebelum penutup fungsi, tambah:
```ts
  // F2: saldo hutang menit kumulatif per halaqah (bulk, query dichunk).
  const hutangMap = await computeHutangForHalaqahList(halaqahIds);
  for (const r of rows) r.hutangSaldo = hutangMap.get(r.halaqahId)?.saldo ?? 0;
  return rows;
```
(`halaqahIds` sudah didefinisikan di baris 93.)

- [ ] **Step 3: Tampilkan kolom di tabel**

Di `src/components/HitsKoordinatorTable.tsx`, tambah header kolom "Hutang (mnt)" dan sel nilai `row.hutangSaldo` (tampilkan `—` bila 0). Ikuti pola kolom angka yang sudah ada di file (mis. kolom terlambat/KBBS): tambahkan `<th>Hutang</th>` di `<thead>` dan `<td data-label="Hutang">{row.hutangSaldo > 0 ? row.hutangSaldo : '—'}</td>` di baris tubuh, pada posisi setelah kolom terakhir yang relevan (mis. setelah kolom terlambat). Sertakan atribut `data-label` agar konsisten pola `.tbl-cards` mobile.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hits-rekap.ts src/components/HitsKoordinatorTable.tsx
git commit -m "feat(hits-f2): kolom saldo hutang menit di dashboard koordinator KK"
```

---

## Task 8: Daftar hutang di WA tabayyun

**Files:**
- Modify: `src/lib/whatsapp.ts` (`tplTabayyunToPengajar`, baris ~297)
- Modify: `src/app/observasi/koordinator/actions.ts` (`reminderTabayyunPengajar`, baris ~176)

- [ ] **Step 1: Tambah param `hutangSaldo` ke template**

Di `src/lib/whatsapp.ts`, `tplTabayyunToPengajar`. Tambah field opsional ke args (setelah `pelanggaran: string[];`, baris 304):
```ts
  hutangSaldo?: number;
```
Sisipkan baris hutang ke array pesan. Ubah blok `return [ ... ].join('\n');` (baris 310-320) menjadi (tambah 2 baris hutang setelah `...daftar,`):
```ts
  const hutangLines =
    args.hutangSaldo && args.hutangSaldo > 0
      ? ['', `Selain itu, tercatat *sisa hutang menit ${args.hutangSaldo} menit* yang perlu diganti.`]
      : [];
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Berdasarkan laporan observasi kelas *${args.kelasName}* tanggal *${args.tanggal}*, tercatat hal berikut:`,
    ...daftar,
    ...hutangLines,
    ``,
    `Mohon sampaikan alasan/klarifikasi melalui tautan berikut:`,
    args.formUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
```

- [ ] **Step 2: Hitung & teruskan saldo di action**

Di `src/app/observasi/koordinator/actions.ts`, import di atas:
```ts
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
```
Di `reminderTabayyunPengajar`, `tab` sudah punya `halaqah_id`? Cek: query select memakai `halaqah:halaqah_id(name)`. Tambahkan `halaqah_id` ke select (baris ~183):
```ts
    .select('id, keterangan_id, pengajar_id, halaqah_id, halaqah:halaqah_id(name), keterangan:keterangan_id(tanggal)')
```
Sebelum `const msg = tplTabayyunToPengajar({...})` (baris ~206), hitung saldo:
```ts
  const hutang = tab.halaqah_id
    ? await computeHutangForHalaqah(tab.halaqah_id as string)
    : { saldo: 0 };
```
Lalu tambahkan ke argumen template:
```ts
    hutangSaldo: hutang.saldo,
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp.ts src/app/observasi/koordinator/actions.ts
git commit -m "feat(hits-f2): sisipkan sisa hutang menit di WA reminder tabayyun"
```

---

## Task 9: Verifikasi end-to-end + build

**Files:** (tak ada — verifikasi)

- [ ] **Step 1: Uji fungsi murni**

Run: `npm run test-hutang`
Expected: PASS.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: semua PASS.

- [ ] **Step 3: Verifikasi manual (skenario spec)**

Di DB dev/prod (hati-hati), atau via UI ketua:
1. Isi pertemuan-1 sebuah halaqah dengan KMT 10' + KBLA 8' + JKG (ganti_hari).
   Cek `computeHutangForHalaqah` (via query atau log): `total_debit = 5 + 8 + 90 = 103`, `saldo = 103`.
2. Buka form pertemuan-2 → banner "Sisa hutang menit pengajar: 103 menit". Isi "menit ditambah" = 50, simpan.
   Cek: 1 baris `hits_hutang_bayar` menit=50; `saldo = 53`; rincian FIFO — KMT lunas (5), KBLA lunas (8), JKG terbayar 37 sisa 53.
3. Edit pertemuan-2, ubah bayar jadi 0 → baris credit terhapus, saldo kembali 103 (idempoten).
4. Dashboard koordinator: kolom Hutang halaqah itu = 103.
5. Reminder WA tabayyun pengajar halaqah itu memuat baris "Sisa hutang menit ... 103 menit".

SQL bantu:
```sql
select jenis, menit from hits_pelanggaran p
  join hits_keterangan_harian k on k.id = p.keterangan_id
  where k.halaqah_id = '<HALAQAH_ID>';
select menit, tanggal, keterangan_id from hits_hutang_bayar where halaqah_id = '<HALAQAH_ID>';
```

- [ ] **Step 4: Commit final (bila ada perbaikan)**

```bash
git add -A
git commit -m "chore(hits-f2): perbaikan pasca-verifikasi hutang menit"
```

---

## Catatan seam F3 (jangan dibangun sekarang)

`computeHutangForHalaqah(halaqahId).saldo` adalah API yang akan dikonsumsi F3:
- Auto-tabayyun bila saldo tetap > 0 dan tak ada pembayaran di pertemuan berikutnya.
- Cron reminder berkala sampai saldo 0.
F2 hanya memastikan data (`hits_hutang_bayar`) + fungsi tersedia; tak menambah cron/otomasi.
