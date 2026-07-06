# HITS F4 — Presensi Kajian Adab Ketua Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presensi Kajian Adab mingguan (Minggu 16.00) untuk ketua kelas — self check-in, Alpa lifecycle (reminder → countdown 3 hari → alpa) dikelola Koordinator KK, plus migrasi data historis dari xlsx.

**Architecture:** Skema ringan — sesi = tanggal Minggu (tanpa tabel sesi). Dua tabel: `hits_kajian_presensi` (1 baris/ketua/Minggu, dedup per `whatsapp_number`) + `hits_kajian_libur`. Logika lifecycle & rekap = fungsi murni di `src/lib/hits-kajian.ts` (diuji tsx, pola F3). UI: kartu check-in ketua di `/hits/ketua` + sub-dashboard Koor KK `/observasi/koordinator/kajian`. Tak feed Matrix.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (`supabaseAdmin`), TypeScript, exceljs (migrasi), tsx (uji fungsi murni).

**Spec:** `docs/superpowers/specs/2026-07-06-hits-f4-kajian-adab-presensi-design.md`

---

## File Structure

- **Create** `supabase/migrations/0040_hits_kajian_adab.sql` — 2 tabel.
- **Modify** `src/types/db.ts` — interface `HitsKajianPresensi`, `HitsKajianLibur`.
- **Create** `src/lib/hits-kajian.ts` — konstanta + fungsi murni (lifecycle, rekap, sundays).
- **Create** `scripts/test-kajian.ts` — uji fungsi murni. Tambah script `test-kajian` di `package.json`.
- **Modify** `src/lib/whatsapp.ts` — `tplReminderKajianAdab`.
- **Create** `src/lib/hits-kajian-db.ts` — helper baca/tulis DB (dipakai action & page; pisah dari fungsi murni agar tetap testable).
- **Create** `src/app/hits/ketua/KajianAdabCard.tsx` — komponen client kartu check-in.
- **Modify** `src/app/hits/ketua/actions.ts` — action `submitKajianCheckin`.
- **Modify** `src/app/hits/ketua/page.tsx` — render `KajianAdabCard` + muat data.
- **Create** `src/app/observasi/koordinator/kajian/page.tsx` — dashboard rekap.
- **Create** `src/app/observasi/koordinator/kajian/actions.ts` — `remindKajianKetua`, `setKajianLibur`, `hapusKajianLibur`.
- **Create** `src/app/observasi/koordinator/kajian/KajianTindakPanel.tsx` + `KajianLiburPanel.tsx` — komponen client.
- **Create** `scripts/import-kajian-adab.ts` — migrasi historis dari xlsx.

---

## Task 1: Migration + TypeScript types

**Files:**
- Create: `supabase/migrations/0040_hits_kajian_adab.sql`
- Modify: `src/types/db.ts`

- [ ] **Step 1: Tulis migration**

Create `supabase/migrations/0040_hits_kajian_adab.sql`:

```sql
-- HITS F4: Presensi Kajian Adab ketua kelas (Minggu 16.00).
-- Entitas terpisah dari presensi guru; tidak feed Matrix Skill Guru.

create table hits_kajian_presensi (
  id uuid primary key default gen_random_uuid(),
  ketua_wa text not null,
  tanggal date not null,
  status text check (status in ('Hadir','Terlambat','Izin','Sakit','Alpa')),
  checkin_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index idx_kajian_presensi_wa_tgl on hits_kajian_presensi(ketua_wa, tanggal);
create index idx_kajian_presensi_tgl on hits_kajian_presensi(tanggal);

comment on table hits_kajian_presensi is 'Presensi Kajian Adab ketua kelas (mingguan, Minggu 16.00). status null = sudah direminder Koor KK, belum check-in susulan.';
comment on column hits_kajian_presensi.ketua_wa is 'whatsapp_number ketua (dedup identitas; 1 orang walau banyak halaqah).';
comment on column hits_kajian_presensi.reminder_sent_at is 'Kapan Koor KK kirim reminder; countdown 3 hari menuju Alpa.';

create table hits_kajian_libur (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null unique,
  keterangan text,
  created_at timestamptz not null default now()
);
comment on table hits_kajian_libur is 'Tanggal Minggu Kajian Adab libur (dikecualikan dari total sesi & panel tindak).';
```

- [ ] **Step 2: Terapkan migration ke Supabase**

Terapkan via MCP `apply_migration` (name `0040_hits_kajian_adab`) atau dashboard SQL. **Jangan** auto-apply di mode non-interaktif (pola F1/F2/F3).
Verifikasi: `select to_regclass('public.hits_kajian_presensi'), to_regclass('public.hits_kajian_libur');` → keduanya non-null.

- [ ] **Step 3: Tambah TypeScript types**

Di `src/types/db.ts`, tambahkan (dekat interface HITS lain):

```ts
export type HitsKajianStatus = 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpa';

export interface HitsKajianPresensi {
  id: string;
  ketua_wa: string;
  tanggal: string;            // YYYY-MM-DD (Minggu)
  status: HitsKajianStatus | null;
  checkin_at: string | null;  // ISO
  reminder_sent_at: string | null; // ISO
  created_at: string;
}

export interface HitsKajianLibur {
  id: string;
  tanggal: string;            // YYYY-MM-DD
  keterangan: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0040_hits_kajian_adab.sql src/types/db.ts
git commit -m "feat(hits-f4): migration hits_kajian_adab + tipe presensi/libur"
```

---

## Task 2: Fungsi murni `hits-kajian.ts` (TDD)

**Files:**
- Create: `src/lib/hits-kajian.ts`
- Create: `scripts/test-kajian.ts`
- Modify: `package.json` (script `test-kajian`)

Reuse `datesInRange`, `dayIndexOf`, `todayJakarta` dari `src/lib/maahir-presensi.ts` (`dayIndexOf` = 0 Ahad/Minggu). Pola waktu WIB & getTime dari `hits-tabayyun.ts`/`attendance.ts`.

- [ ] **Step 1: Tulis skeleton fungsi murni (agar test bisa import)**

Create `src/lib/hits-kajian.ts`:

```ts
// Fungsi MURNI presensi Kajian Adab F4. Tanpa I/O — dipakai server action (guard),
// UI (badge/label), dan rekap. Diuji: npm run test-kajian.
import { datesInRange, dayIndexOf } from './maahir-presensi';

export const KAJIAN_MULAI = '16:00';              // WIB
export const KAJIAN_GHOSTING_DAYS = 3;            // reminder → alpa
const MS_PER_DAY = 86_400_000;
const SUNDAY = 0;                                 // dayIndexOf: 0 = Ahad/Minggu

export type KajianStatus = 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpa';

export interface KajianRow {
  ketua_wa: string;
  tanggal: string;                 // YYYY-MM-DD (Minggu)
  status: KajianStatus | null;
  checkin_at: string | null;       // ISO
  reminder_sent_at: string | null; // ISO
}

export type KajianState =
  | 'akan-datang' | 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa' | 'belum-isi';

/** Semua tanggal Minggu (YYYY-MM-DD) dalam [start, end] inklusif, urut menaik. */
export function sundaysInRange(start: string, end: string): string[] {
  return datesInRange(start, end).filter((d) => dayIndexOf(d) === SUNDAY);
}

/** true bila waktu check-in (ISO) melewati 16:00 WIB pada tanggal sesi. */
export function deriveTerlambat(checkinIso: string, tanggal: string): boolean {
  const [h, m] = KAJIAN_MULAI.split(':').map(Number);
  const start = new Date(
    `${tanggal}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`
  ).getTime();
  return new Date(checkinIso).getTime() > start;
}

/** Status pilihan user (Hadir/Izin/Sakit) → status tersimpan, hitung Terlambat dari waktu. */
export function statusOnCheckin(
  pilih: 'Hadir' | 'Izin' | 'Sakit',
  checkinIso: string,
  tanggal: string
): KajianStatus {
  if (pilih === 'Hadir' && deriveTerlambat(checkinIso, tanggal)) return 'Terlambat';
  return pilih;
}

/**
 * State efektif satu sel (ketua × Minggu).
 * @param row baris presensi bila ada, else null.
 * @param tanggal tanggal Minggu sesi (YYYY-MM-DD).
 * @param today tanggal hari ini WIB (YYYY-MM-DD).
 * @param nowIso waktu sekarang ISO (untuk countdown).
 */
export function deriveKajianState(
  row: KajianRow | null,
  tanggal: string,
  today: string,
  nowIso: string
): KajianState {
  if (tanggal > today) return 'akan-datang';
  if (row && row.status) {
    switch (row.status) {
      case 'Hadir': return 'hadir';
      case 'Terlambat': return 'terlambat';
      case 'Izin': return 'izin';
      case 'Sakit': return 'sakit';
      case 'Alpa': return 'alpa';
    }
  }
  // status null (atau tak ada baris)
  if (row && row.reminder_sent_at) {
    const deadline = new Date(row.reminder_sent_at).getTime() + KAJIAN_GHOSTING_DAYS * MS_PER_DAY;
    return new Date(nowIso).getTime() >= deadline ? 'alpa' : 'belum-isi';
  }
  return 'belum-isi';
}

export interface KajianRekap {
  ketua_wa: string;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  belumIsi: number;
  totalSesi: number;
  persen: number;   // (hadir + terlambat) / totalSesi * 100, dibulatkan
}

/**
 * Rekap per ketua atas semua Minggu non-libur dari anchor s/d Minggu terakhir yang lewat.
 * @param rows semua baris presensi (lintas ketua).
 * @param liburSet set tanggal Minggu libur (YYYY-MM-DD).
 * @param ketuaWaList daftar WA ketua yang direkap.
 * @param anchor Minggu pertama dihitung (YYYY-MM-DD).
 * @param today hari ini WIB.
 * @param nowIso waktu sekarang ISO.
 */
export function computeKajianRekap(
  rows: KajianRow[],
  liburSet: Set<string>,
  ketuaWaList: string[],
  anchor: string,
  today: string,
  nowIso: string
): KajianRekap[] {
  const sesi = sundaysInRange(anchor, today).filter((d) => d <= today && !liburSet.has(d));
  const byKey = new Map<string, KajianRow>();
  for (const r of rows) byKey.set(`${r.ketua_wa}|${r.tanggal}`, r);

  return ketuaWaList.map((wa) => {
    const acc: KajianRekap = {
      ketua_wa: wa, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0,
      belumIsi: 0, totalSesi: sesi.length, persen: 0,
    };
    for (const tgl of sesi) {
      const st = deriveKajianState(byKey.get(`${wa}|${tgl}`) ?? null, tgl, today, nowIso);
      if (st === 'hadir') acc.hadir++;
      else if (st === 'terlambat') acc.terlambat++;
      else if (st === 'izin') acc.izin++;
      else if (st === 'sakit') acc.sakit++;
      else if (st === 'alpa') acc.alpa++;
      else if (st === 'belum-isi') acc.belumIsi++;
    }
    acc.persen = acc.totalSesi === 0 ? 0
      : Math.round(((acc.hadir + acc.terlambat) / acc.totalSesi) * 100);
    return acc;
  });
}
```

- [ ] **Step 2: Tulis test yang gagal**

Create `scripts/test-kajian.ts`:

```ts
// Uji fungsi murni presensi Kajian Adab. Jalankan: npm run test-kajian
import {
  sundaysInRange, deriveTerlambat, statusOnCheckin, deriveKajianState,
  computeKajianRekap, type KajianRow, KAJIAN_GHOSTING_DAYS,
} from '@/lib/hits-kajian';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// --- sundaysInRange --- (2026-01-04 & -11 & -18 & -25 = Minggu)
eq(sundaysInRange('2026-01-01', '2026-01-31'),
   ['2026-01-04','2026-01-11','2026-01-18','2026-01-25'], 'sundays Jan 2026');
eq(sundaysInRange('2026-01-05', '2026-01-05'), [], 'range Senin saja -> []');
eq(sundaysInRange('2026-01-04', '2026-01-04'), ['2026-01-04'], 'range Minggu tunggal');

// --- deriveTerlambat --- (16:00 WIB batas)
eq(deriveTerlambat('2026-01-04T08:30:00.000Z', '2026-01-04'), false, '15:30 WIB -> tepat waktu');
eq(deriveTerlambat('2026-01-04T09:00:00.000Z', '2026-01-04'), false, '16:00 WIB pas -> tidak terlambat');
eq(deriveTerlambat('2026-01-04T09:30:00.000Z', '2026-01-04'), true, '16:30 WIB -> terlambat');

// --- statusOnCheckin ---
eq(statusOnCheckin('Hadir', '2026-01-04T08:00:00.000Z', '2026-01-04'), 'Hadir', 'hadir tepat -> Hadir');
eq(statusOnCheckin('Hadir', '2026-01-04T10:00:00.000Z', '2026-01-04'), 'Terlambat', 'hadir telat -> Terlambat');
eq(statusOnCheckin('Izin', '2026-01-04T10:00:00.000Z', '2026-01-04'), 'Izin', 'izin -> Izin (waktu diabaikan)');

// --- deriveKajianState ---
const NOW = '2026-01-08T12:00:00.000Z';   // Kamis
const R = (o: Partial<KajianRow>): KajianRow =>
  ({ ketua_wa: 'w', tanggal: '2026-01-04', status: null, checkin_at: null, reminder_sent_at: null, ...o });
eq(deriveKajianState(null, '2026-01-11', '2026-01-08', NOW), 'akan-datang', 'sesi masa depan -> akan-datang');
eq(deriveKajianState(R({ status: 'Hadir' }), '2026-01-04', '2026-01-08', NOW), 'hadir', 'status Hadir -> hadir');
eq(deriveKajianState(R({ status: 'Terlambat' }), '2026-01-04', '2026-01-08', NOW), 'terlambat', 'status Terlambat');
eq(deriveKajianState(R({ status: 'Izin' }), '2026-01-04', '2026-01-08', NOW), 'izin', 'status Izin');
eq(deriveKajianState(R({ status: 'Alpa' }), '2026-01-04', '2026-01-08', NOW), 'alpa', 'status Alpa (historis)');
eq(deriveKajianState(null, '2026-01-04', '2026-01-08', NOW), 'belum-isi', 'lewat, tanpa baris & reminder -> belum-isi');
eq(deriveKajianState(R({ reminder_sent_at: '2026-01-07T00:00:00.000Z' }), '2026-01-04', '2026-01-08', NOW),
   'belum-isi', 'direminder, countdown blm habis -> belum-isi');
eq(deriveKajianState(R({ reminder_sent_at: '2026-01-04T00:00:00.000Z' }), '2026-01-04', '2026-01-08', NOW),
   'alpa', 'direminder >3 hari lalu, tak respons -> alpa');

// --- computeKajianRekap ---
// sesi Minggu Jan (anchor 2026-01-04 s/d today 2026-01-25) = 4 Minggu, 11 libur.
const libur = new Set(['2026-01-11']);
const rows: KajianRow[] = [
  R({ tanggal: '2026-01-04', status: 'Hadir' }),
  R({ tanggal: '2026-01-18', status: 'Terlambat' }),
  R({ tanggal: '2026-01-25', status: 'Izin' }),
  // 2026-01-04..25 minus libur 11 → sesi: 04,18,25 (11 dikecualikan). belum-isi: none extra.
];
const rek = computeKajianRekap(rows, libur, ['w'], '2026-01-04', '2026-01-25', '2026-01-26T00:00:00.000Z');
eq(rek[0], { ketua_wa: 'w', hadir: 1, terlambat: 1, izin: 1, sakit: 0, alpa: 0, belumIsi: 0, totalSesi: 3, persen: 67 },
   'rekap: libur dikecualikan, persen=(1+1)/3=67');

eq(KAJIAN_GHOSTING_DAYS, 3, 'konstanta countdown 3 hari');

if (failed > 0) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test kajian lulus.');
```

- [ ] **Step 3: Tambah script + jalankan test (harus GAGAL dulu bila skeleton belum lengkap, lalu LULUS)**

Di `package.json` bagian `scripts`, tambah setelah `test-tabayyun`:

```json
"test-kajian": "tsx --env-file=.env.local scripts/test-kajian.ts",
```

Run: `npm run test-kajian`
Expected: `Semua test kajian lulus.` (exit 0). Bila ada FAIL, perbaiki `hits-kajian.ts` sampai lulus.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hits-kajian.ts scripts/test-kajian.ts package.json
git commit -m "feat(hits-f4): fungsi murni presensi kajian adab (state+rekap) + uji tsx"
```

---

## Task 3: Template WhatsApp reminder

**Files:**
- Modify: `src/lib/whatsapp.ts`

- [ ] **Step 1: Tambah template**

Di `src/lib/whatsapp.ts`, tambah fungsi (pola `tplReminderLiburToKetua` — **tanpa** sapaan Ustadz/Ustadzah karena ketua kelas bukan ustadz):

```ts
export function tplReminderKajianAdab(args: {
  namaKetua: string | null;
  tanggalWib: string;   // mis. "Ahad, 4 Jan 2026"
}): string {
  return [
    `Assalamu'alaikum${args.namaKetua ? ` ${args.namaKetua}` : ''},`,
    ``,
    `Kami mencatat antum/i belum mengisi presensi Kajian Adab pada ${args.tanggalWib}.`,
    `Mohon segera isi presensi (Hadir/Izin/Sakit) melalui menu Kajian Adab di aplikasi.`,
    ``,
    `Bila tidak ada respons dalam 3 hari, akan tercatat sebagai Alpa.`,
    `Jazakumullahu khairan.`,
  ].join('\n');
}
```

- [ ] **Step 2: Verifikasi kompilasi**

Run: `npx tsc --noEmit`
Expected: tanpa error baru pada `whatsapp.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp.ts
git commit -m "feat(hits-f4): template WA reminder kajian adab (tanpa sapaan ustadz)"
```

---

## Task 4: Helper DB `hits-kajian-db.ts`

**Files:**
- Create: `src/lib/hits-kajian-db.ts`

Pisahkan I/O DB dari fungsi murni. Dipakai action & page. Reuse `fetchAllRows` (`src/lib/supabase-page.ts`) untuk query lintas ketua (pola PostgREST 1000-limit).

- [ ] **Step 1: Tulis helper**

Create `src/lib/hits-kajian-db.ts`:

```ts
import { supabaseAdmin } from './supabase-admin';
import { fetchAllRows } from './supabase-page';
import type { KajianRow } from './hits-kajian';
import type { HitsKajianLibur } from '@/types/db';

/** Semua baris presensi sejak anchor (untuk rekap & panel tindak). */
export async function loadKajianRows(anchor: string): Promise<KajianRow[]> {
  const rows = await fetchAllRows<KajianRow>((from, to) =>
    supabaseAdmin
      .from('hits_kajian_presensi')
      .select('ketua_wa, tanggal, status, checkin_at, reminder_sent_at')
      .gte('tanggal', anchor)
      .order('tanggal', { ascending: true })
      .range(from, to)
  );
  return rows;
}

/** Baris presensi milik satu ketua (WA), untuk kartu check-in. */
export async function loadKajianRowsForKetua(ketuaWa: string): Promise<KajianRow[]> {
  const { data } = await supabaseAdmin
    .from('hits_kajian_presensi')
    .select('ketua_wa, tanggal, status, checkin_at, reminder_sent_at')
    .eq('ketua_wa', ketuaWa)
    .order('tanggal', { ascending: false });
  return (data ?? []) as KajianRow[];
}

/** Set tanggal libur kajian. */
export async function loadKajianLibur(): Promise<HitsKajianLibur[]> {
  const { data } = await supabaseAdmin
    .from('hits_kajian_libur')
    .select('*')
    .order('tanggal', { ascending: false });
  return (data ?? []) as HitsKajianLibur[];
}

/** Daftar WA + nama ketua aktif (dedup per WA). Sumber kebenaran: ketua_kelas. */
export async function loadKetuaWaList(): Promise<{ ketua_wa: string; nama: string; halaqah: string[] }[]> {
  const { data } = await supabaseAdmin
    .from('ketua_kelas')
    .select('whatsapp_number, name, hits_halaqah:hits_halaqah_id(name)')
    .eq('active', true)
    .not('whatsapp_number', 'is', null);
  const map = new Map<string, { ketua_wa: string; nama: string; halaqah: string[] }>();
  for (const r of data ?? []) {
    const wa = (r as { whatsapp_number: string }).whatsapp_number;
    if (!wa) continue;
    const nama = (r as { name: string | null }).name ?? '(ketua)';
    const hq = (r as { hits_halaqah: { name: string } | null }).hits_halaqah?.name;
    const cur = map.get(wa) ?? { ketua_wa: wa, nama, halaqah: [] };
    if (hq && !cur.halaqah.includes(hq)) cur.halaqah.push(hq);
    map.set(wa, cur);
  }
  return [...map.values()].sort((a, b) => a.nama.localeCompare(b.nama));
}
```

> **Catatan:** verifikasi kolom `ketua_kelas.name` & `active` benar-benar ada (cek `src/types/db.ts` interface `KetuaKelas`). Sesuaikan nama kolom bila beda (mis. `nama` vs `name`).

- [ ] **Step 2: Verifikasi kompilasi**

Run: `npx tsc --noEmit`
Expected: tanpa error pada `hits-kajian-db.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hits-kajian-db.ts
git commit -m "feat(hits-f4): helper DB presensi kajian adab (load rows/libur/ketua)"
```

---

## Task 5: Check-in ketua — action + kartu

**Files:**
- Modify: `src/app/hits/ketua/actions.ts`
- Create: `src/app/hits/ketua/KajianAdabCard.tsx`
- Modify: `src/app/hits/ketua/page.tsx`

- [ ] **Step 1: Tulis action `submitKajianCheckin`**

Di `src/app/hits/ketua/actions.ts` tambahkan (server action). Ambil WA dari sesi ketua; guard hari-H **atau** susulan pasca-reminder; hitung status via `statusOnCheckin`; upsert unique `(ketua_wa, tanggal)`.

```ts
'use server';
import { requireKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayJakarta, dayIndexOf } from '@/lib/maahir-presensi';
import { statusOnCheckin } from '@/lib/hits-kajian';
import { revalidatePath } from 'next/cache';

export async function submitKajianCheckin(pilih: 'Hadir' | 'Izin' | 'Sakit') {
  const session = await requireKetuaKelas();
  const { data: self } = await supabaseAdmin
    .from('ketua_kelas').select('whatsapp_number').eq('id', session.ketua_kelas_id).maybeSingle();
  const ketuaWa = self?.whatsapp_number;
  if (!ketuaWa) return { ok: false, error: 'WA ketua tak ditemukan' };

  const today = todayJakarta();
  const nowIso = new Date().toISOString();

  // Tentukan tanggal sesi: hari-H (hari ini Minggu) atau Minggu terakhir yang direminder (susulan).
  let tanggal: string | null = dayIndexOf(today) === 0 ? today : null;
  if (!tanggal) {
    // cari baris reminder aktif (status null, reminder_sent_at ada) milik ketua ini
    const { data: pend } = await supabaseAdmin
      .from('hits_kajian_presensi')
      .select('tanggal, reminder_sent_at')
      .eq('ketua_wa', ketuaWa).is('status', null).not('reminder_sent_at', 'is', null)
      .order('tanggal', { ascending: false }).limit(1);
    tanggal = pend?.[0]?.tanggal ?? null;
  }
  if (!tanggal) return { ok: false, error: 'Belum waktunya presensi (bukan hari Minggu / tak ada reminder aktif).' };

  // tolak bila tanggal ini libur
  const { data: libur } = await supabaseAdmin
    .from('hits_kajian_libur').select('id').eq('tanggal', tanggal).maybeSingle();
  if (libur) return { ok: false, error: 'Kajian Adab tanggal ini libur.' };

  const status = statusOnCheckin(pilih, nowIso, tanggal);
  const { error } = await supabaseAdmin
    .from('hits_kajian_presensi')
    .upsert(
      { ketua_wa: ketuaWa, tanggal, status, checkin_at: nowIso },
      { onConflict: 'ketua_wa,tanggal' }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath('/hits/ketua');
  return { ok: true, status };
}
```

- [ ] **Step 2: Tulis komponen kartu**

Create `src/app/hits/ketua/KajianAdabCard.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { submitKajianCheckin } from './actions';

type Props = {
  canCheckin: boolean;       // hari Minggu non-libur, atau ada reminder aktif
  sesiLabel: string;         // tanggal sesi (label WIB) atau "Minggu depan …"
  currentState: string;      // KajianState efektif sesi relevan
  reminderAktif: boolean;    // banner susulan
};

const LABEL: Record<string, string> = {
  hadir: 'Hadir', terlambat: 'Hadir (Terlambat)', izin: 'Izin', sakit: 'Sakit',
  alpa: 'Alpa', 'belum-isi': 'Belum presensi', 'akan-datang': 'Belum dibuka',
};

export function KajianAdabCard({ canCheckin, sesiLabel, currentState, reminderAktif }: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function kirim(pilih: 'Hadir' | 'Izin' | 'Sakit') {
    start(async () => {
      const r = await submitKajianCheckin(pilih);
      setMsg(r.ok ? `Tersimpan: ${r.status}` : (r.error ?? 'Gagal'));
    });
  }

  return (
    <div className="rounded-xl border p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Kajian Adab · Minggu 16.00</h3>
        <span className="text-sm text-gray-500">{sesiLabel}</span>
      </div>
      {reminderAktif && (
        <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded p-2">
          Kamu belum presensi. Segera isi sebelum tercatat Alpa (batas 3 hari sejak reminder).
        </p>
      )}
      <p className="mt-2 text-sm">Status: <b>{LABEL[currentState] ?? currentState}</b></p>
      {canCheckin && (
        <div className="mt-3 flex gap-2">
          <button disabled={pending} onClick={() => kirim('Hadir')} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">Hadir</button>
          <button disabled={pending} onClick={() => kirim('Izin')} className="px-3 py-1.5 rounded bg-amber-500 text-white text-sm disabled:opacity-50">Izin</button>
          <button disabled={pending} onClick={() => kirim('Sakit')} className="px-3 py-1.5 rounded bg-sky-600 text-white text-sm disabled:opacity-50">Sakit</button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Muat data & render kartu di `page.tsx`**

Di `src/app/hits/ketua/page.tsx`, setelah resolve `ketuaWa` (variabel sudah ada di file), tambahkan pemuatan state kajian dan render `<KajianAdabCard>` di dekat header dashboard:

```tsx
import { KajianAdabCard } from './KajianAdabCard';
import { loadKajianRowsForKetua } from '@/lib/hits-kajian-db';
import { deriveKajianState } from '@/lib/hits-kajian';
import { supabaseAdmin } from '@/lib/supabase-admin';
// (todayJakarta, dayIndexOf sudah diimpor dari maahir-presensi di file ini)

// --- di dalam komponen, setelah ketuaWa diketahui ---
let kajianCard: React.ReactNode = null;
if (ketuaWa) {
  const today = todayJakarta();
  const nowIso = new Date().toISOString();
  const isMinggu = dayIndexOf(today) === 0;
  const rows = await loadKajianRowsForKetua(ketuaWa);

  // libur hari ini?
  const { data: liburToday } = isMinggu
    ? await supabaseAdmin.from('hits_kajian_libur').select('id').eq('tanggal', today).maybeSingle()
    : { data: null };

  // reminder aktif (status null + reminder_sent_at)
  const pendingRow = rows.find((r) => r.status === null && r.reminder_sent_at);
  const reminderAktif = Boolean(
    pendingRow && deriveKajianState(pendingRow, pendingRow.tanggal, today, nowIso) === 'belum-isi'
  );

  const sesiTanggal = isMinggu ? today : (pendingRow?.tanggal ?? null);
  const sesiRow = sesiTanggal ? rows.find((r) => r.tanggal === sesiTanggal) ?? null : null;
  const currentState = sesiTanggal ? deriveKajianState(sesiRow, sesiTanggal, today, nowIso) : 'akan-datang';
  const canCheckin = (isMinggu && !liburToday) || reminderAktif;

  kajianCard = (
    <KajianAdabCard
      canCheckin={canCheckin}
      sesiLabel={sesiTanggal ?? 'Minggu berikutnya'}
      currentState={currentState}
      reminderAktif={reminderAktif}
    />
  );
}
```

Render `{kajianCard}` di dalam JSX halaman (mis. tepat di bawah header/StatCard). Sesuaikan tempat sesuai layout existing.

- [ ] **Step 4: Verifikasi manual**

Run: `npx tsc --noEmit` (tanpa error) lalu `npm run dev`.
- Login ketua. Kartu Kajian Adab muncul. Bila hari ini Minggu: tombol aktif → klik Hadir → status berubah (Terlambat bila > 16:00). Bila bukan Minggu & tanpa reminder: tombol tak muncul, status "Belum dibuka".

- [ ] **Step 5: Commit**

```bash
git add src/app/hits/ketua/actions.ts src/app/hits/ketua/KajianAdabCard.tsx src/app/hits/ketua/page.tsx
git commit -m "feat(hits-f4): kartu check-in kajian adab ketua + action submitKajianCheckin"
```

---

## Task 6: Dashboard Koordinator KK

**Files:**
- Create: `src/app/observasi/koordinator/kajian/actions.ts`
- Create: `src/app/observasi/koordinator/kajian/page.tsx`
- Create: `src/app/observasi/koordinator/kajian/KajianTindakPanel.tsx`
- Create: `src/app/observasi/koordinator/kajian/KajianLiburPanel.tsx`

- [ ] **Step 1: Tulis actions**

Create `src/app/observasi/koordinator/kajian/actions.ts`:

```ts
'use server';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildWaMeUrl, tplReminderKajianAdab } from '@/lib/whatsapp';
import { revalidatePath } from 'next/cache';

/** Set reminder untuk (ketua, tanggal). Resend TAK reset reminder_sent_at (pola F3). */
export async function remindKajianKetua(input: { ketuaWa: string; tanggal: string; namaKetua: string | null; tanggalWib: string }) {
  await requireKoordinatorKetuaKelas();
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('hits_kajian_presensi')
    .select('id, reminder_sent_at, status')
    .eq('ketua_wa', input.ketuaWa).eq('tanggal', input.tanggal).maybeSingle();

  if (existing?.status) return { ok: false, error: 'Sudah ada status; tak perlu reminder.' };

  if (!existing) {
    await supabaseAdmin.from('hits_kajian_presensi')
      .insert({ ketua_wa: input.ketuaWa, tanggal: input.tanggal, status: null, reminder_sent_at: nowIso });
  } else if (!existing.reminder_sent_at) {
    await supabaseAdmin.from('hits_kajian_presensi')
      .update({ reminder_sent_at: nowIso }).eq('id', existing.id);
  }
  // resend: reminder_sent_at sudah ada → biarkan (countdown tak reset)

  const link = buildWaMeUrl(input.ketuaWa, tplReminderKajianAdab({ namaKetua: input.namaKetua, tanggalWib: input.tanggalWib }));
  revalidatePath('/observasi/koordinator/kajian');
  return { ok: true, waLink: link };
}

export async function setKajianLibur(tanggal: string, keterangan: string) {
  await requireKoordinatorKetuaKelas();
  const { error } = await supabaseAdmin
    .from('hits_kajian_libur').upsert({ tanggal, keterangan }, { onConflict: 'tanggal' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/observasi/koordinator/kajian');
  return { ok: true };
}

export async function hapusKajianLibur(tanggal: string) {
  await requireKoordinatorKetuaKelas();
  const { error } = await supabaseAdmin.from('hits_kajian_libur').delete().eq('tanggal', tanggal);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/observasi/koordinator/kajian');
  return { ok: true };
}
```

> **Catatan:** helper wa.me di repo bernama `buildWaMeUrl(phone, message)` (bukan `waLink`).

- [ ] **Step 2: Tulis panel client**

Create `src/app/observasi/koordinator/kajian/KajianTindakPanel.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { remindKajianKetua } from './actions';

export type TindakItem = {
  ketuaWa: string; namaKetua: string; tanggal: string; tanggalWib: string;
  state: 'belum-isi' | 'alpa'; sisaHari: number | null;
};

export function KajianTindakPanel({ items }: { items: TindakItem[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function remind(it: TindakItem) {
    start(async () => {
      const r = await remindKajianKetua({ ketuaWa: it.ketuaWa, tanggal: it.tanggal, namaKetua: it.namaKetua, tanggalWib: it.tanggalWib });
      if (r.ok && r.waLink) { window.open(r.waLink, '_blank'); setMsg('Reminder dikirim.'); }
      else setMsg(r.error ?? 'Gagal');
    });
  }

  if (!items.length) return <p className="text-sm text-gray-500">Tak ada yang perlu ditindak.</p>;
  return (
    <div className="space-y-2">
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
          <div>
            <b>{it.namaKetua}</b> · {it.tanggalWib}
            {it.state === 'alpa'
              ? <span className="ml-2 text-red-600">Alpa</span>
              : <span className="ml-2 text-amber-600">Belum isi{it.sisaHari != null ? ` · sisa ${it.sisaHari} hari` : ''}</span>}
          </div>
          <button disabled={pending} onClick={() => remind(it)} className="px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50">Reminder</button>
        </div>
      ))}
    </div>
  );
}
```

Create `src/app/observasi/koordinator/kajian/KajianLiburPanel.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { setKajianLibur, hapusKajianLibur } from './actions';
import type { HitsKajianLibur } from '@/types/db';

export function KajianLiburPanel({ libur }: { libur: HitsKajianLibur[] }) {
  const [pending, start] = useTransition();
  const [tanggal, setTanggal] = useState('');
  const [ket, setKet] = useState('');

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end flex-wrap">
        <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Keterangan" value={ket} onChange={(e) => setKet(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <button disabled={pending || !tanggal} onClick={() => start(async () => { await setKajianLibur(tanggal, ket); setTanggal(''); setKet(''); })}
          className="px-3 py-1 rounded bg-sky-600 text-white text-sm disabled:opacity-50">Tambah Libur</button>
      </div>
      <ul className="text-sm">
        {libur.map((l) => (
          <li key={l.id} className="flex items-center justify-between border-b py-1">
            <span>{l.tanggal}{l.keterangan ? ` · ${l.keterangan}` : ''}</span>
            <button disabled={pending} onClick={() => start(async () => { await hapusKajianLibur(l.tanggal); })}
              className="text-red-600 text-xs">Hapus</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Tulis page (server component)**

Create `src/app/observasi/koordinator/kajian/page.tsx`:

```tsx
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { todayJakarta, dayIndexOf } from '@/lib/maahir-presensi';
import { loadKajianRows, loadKajianLibur, loadKetuaWaList } from '@/lib/hits-kajian-db';
import { computeKajianRekap, deriveKajianState, sundaysInRange, KAJIAN_GHOSTING_DAYS, type KajianRow } from '@/lib/hits-kajian';
import { KajianTindakPanel, type TindakItem } from './KajianTindakPanel';
import { KajianLiburPanel } from './KajianLiburPanel';

export const dynamic = 'force-dynamic';
const MS_PER_DAY = 86_400_000;

function tanggalWib(d: string): string {
  return new Date(`${d}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

export default async function KajianKoordinatorPage() {
  await requireKoordinatorKetuaKelas();
  const today = todayJakarta();
  const nowIso = new Date().toISOString();

  const ketua = await loadKetuaWaList();
  const waList = ketua.map((k) => k.ketua_wa);
  const namaByWa = new Map(ketua.map((k) => [k.ketua_wa, k.nama]));

  const liburRows = await loadKajianLibur();
  const liburSet = new Set(liburRows.map((l) => l.tanggal));

  // anchor = Minggu pertama data historis (atau default awal tahun). Ambil min tanggal presensi.
  const anchorRows = await loadKajianRows('2000-01-01');
  const anchor = anchorRows.length
    ? anchorRows.reduce((min, r) => (r.tanggal < min ? r.tanggal : min), anchorRows[0].tanggal)
    : today;

  const rows: KajianRow[] = anchorRows;
  const rekap = computeKajianRekap(rows, liburSet, waList, anchor, today, nowIso);

  // panel tindak: setiap (ketua × Minggu non-libur lewat) berstatus belum-isi / alpa
  const sesi = sundaysInRange(anchor, today).filter((d) => d <= today && !liburSet.has(d));
  const byKey = new Map(rows.map((r) => [`${r.ketua_wa}|${r.tanggal}`, r]));
  const tindak: TindakItem[] = [];
  for (const wa of waList) {
    for (const tgl of sesi) {
      const row = byKey.get(`${wa}|${tgl}`) ?? null;
      const st = deriveKajianState(row, tgl, today, nowIso);
      if (st === 'belum-isi' || st === 'alpa') {
        let sisaHari: number | null = null;
        if (st === 'belum-isi' && row?.reminder_sent_at) {
          const deadline = new Date(row.reminder_sent_at).getTime() + KAJIAN_GHOSTING_DAYS * MS_PER_DAY;
          sisaHari = Math.max(0, Math.ceil((deadline - new Date(nowIso).getTime()) / MS_PER_DAY));
        }
        tindak.push({ ketuaWa: wa, namaKetua: namaByWa.get(wa) ?? '(ketua)', tanggal: tgl, tanggalWib: tanggalWib(tgl), state: st, sisaHari });
      }
    }
  }
  tindak.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1)); // terbaru dulu

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold">Presensi Kajian Adab — Koordinator</h1>

      <section>
        <h2 className="font-semibold mb-2">Rekap per Ketua</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50"><tr>
              <th className="text-left p-2">Ketua</th><th className="p-2">Hadir</th><th className="p-2">Telat</th>
              <th className="p-2">Izin</th><th className="p-2">Sakit</th><th className="p-2">Alpa</th>
              <th className="p-2">Belum</th><th className="p-2">%</th>
            </tr></thead>
            <tbody>
              {rekap.map((r) => (
                <tr key={r.ketua_wa} className="border-t">
                  <td className="p-2 text-left">{namaByWa.get(r.ketua_wa)}</td>
                  <td className="p-2 text-center">{r.hadir}</td><td className="p-2 text-center">{r.terlambat}</td>
                  <td className="p-2 text-center">{r.izin}</td><td className="p-2 text-center">{r.sakit}</td>
                  <td className="p-2 text-center">{r.alpa}</td><td className="p-2 text-center">{r.belumIsi}</td>
                  <td className="p-2 text-center font-semibold">{r.persen}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Perlu Ditindak</h2>
        <KajianTindakPanel items={tindak} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">Libur Kajian</h2>
        <KajianLiburPanel libur={liburRows} />
      </section>
    </main>
  );
}
```

> Tambahkan link menu ke `/observasi/koordinator/kajian` dari dashboard koordinator KK existing (`src/app/observasi/koordinator/page.tsx`) — mis. tombol/tab "Kajian Adab".

- [ ] **Step 4: Verifikasi manual**

Run: `npx tsc --noEmit` lalu `npm run dev`.
- Login koordinator KK → buka `/observasi/koordinator/kajian`. Tabel rekap tampil semua ketua. Panel tindak menampilkan sesi belum-isi. Klik Reminder → buka wa.me + baris reminder tercatat. Tambah/hapus libur berfungsi & rekap menyesuaikan.

- [ ] **Step 5: Commit**

```bash
git add src/app/observasi/koordinator/kajian/
git commit -m "feat(hits-f4): dashboard koordinator kajian adab (rekap, tindak+reminder, libur CRUD)"
```

---

## Task 7: Migrasi data historis dari xlsx

**Files:**
- Create: `scripts/import-kajian-adab.ts`

- [ ] **Step 1: Tulis script inspeksi resolusi tanggal (verifikasi dulu)**

Sebelum impor, pastikan derivasi tanggal benar. Script akan: baca header (baris 2), ambil kolom dengan tanggal teks jelas (regex `dd/mm`) sebagai anchor, lalu tetapkan tiap kolom data = anchor + (offset kolom × 7 hari), validasi `dayIndexOf === 0` (Minggu).

- [ ] **Step 2: Tulis script impor**

Create `scripts/import-kajian-adab.ts`:

```ts
// Migrasi historis presensi Kajian Adab dari xlsx Akhwat → hits_kajian_presensi.
// Jalankan sekali: npx tsx --env-file=.env.local scripts/import-kajian-adab.ts
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { dayIndexOf } from '../src/lib/maahir-presensi';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const FILES = [
  'Observasi HITS Januari Akhwat .xlsx',
  'Observasi HITS April Akhwat .xlsx',
  'Observasi HITS JUNI 2025_AKHWAT.xlsx',
];
const SHEET = 'Presensi Kajian Adab';
const STATUS_MAP: Record<string, string> = { H: 'Hadir', T: 'Terlambat', I: 'Izin', S: 'Sakit', A: 'Alpa' };

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Derive tanggal Minggu per kolom via anchor teks dd/mm + step 7 hari. */
function resolveDates(headerRow: ExcelJS.Row, firstDataCol: number, lastCol: number, year: number): Map<number, string> {
  // cari anchor: kolom dgn teks "dd/mm" yg jatuh di Minggu
  let anchorCol = -1, anchorMs = 0;
  for (let c = firstDataCol; c <= lastCol; c++) {
    const v = headerRow.getCell(c).value;
    let ms = 0;
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d{1,2})[/-](\d{1,2})/);
      if (m) { const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]))); if (dayIndexOf(isoDate(d)) === 0) ms = d.getTime(); }
    } else if (v instanceof Date) {
      const d = new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
      if (dayIndexOf(isoDate(d)) === 0) ms = d.getTime();
    }
    if (ms) { anchorCol = c; anchorMs = ms; break; }
  }
  if (anchorCol < 0) throw new Error('anchor tanggal Minggu tak ditemukan di header');
  const out = new Map<number, string>();
  for (let c = firstDataCol; c <= lastCol; c++) {
    const ms = anchorMs + (c - anchorCol) * 7 * 86_400_000;
    const iso = isoDate(new Date(ms));
    if (dayIndexOf(iso) === 0) out.set(c, iso);
  }
  return out;
}

async function halaqahKetuaMap(): Promise<Map<string, string>> {
  // "HITS 3" (lower, no-space) → ketua_wa
  const { data } = await admin.from('ketua_kelas')
    .select('whatsapp_number, hits_halaqah:hits_halaqah_id(name)').eq('active', true).not('whatsapp_number', 'is', null);
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    const wa = (r as any).whatsapp_number; const name = (r as any).hits_halaqah?.name;
    if (wa && name) map.set(String(name).toLowerCase().replace(/\s+/g, ''), wa);
  }
  return map;
}

async function main() {
  const hkMap = await halaqahKetuaMap();
  let imported = 0, skippedNoKetua = 0;
  const upserts: { ketua_wa: string; tanggal: string; status: string }[] = [];

  for (const file of FILES) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet(SHEET);
    if (!ws) { console.log('SKIP (no sheet):', file); continue; }
    const year = /januari/i.test(file) || /april/i.test(file) ? 2026 : 2025;
    const header = ws.getRow(2);
    const dates = resolveDates(header, 4, ws.columnCount, year);

    for (let r = 3; r <= ws.rowCount; r++) {
      const halaqah = String(ws.getRow(r).getCell(2).value ?? '').toLowerCase().replace(/\s+/g, '');
      if (!halaqah) continue;
      const wa = hkMap.get(halaqah);
      if (!wa) { skippedNoKetua++; continue; }
      for (const [col, tgl] of dates) {
        const raw = String(ws.getRow(r).getCell(col).value ?? '').trim().toUpperCase();
        const status = STATUS_MAP[raw];
        if (!status) continue;
        upserts.push({ ketua_wa: wa, tanggal: tgl, status });
      }
    }
    console.log('parsed', file);
  }

  // upsert batch (unique ketua_wa,tanggal → dedup antar file)
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500);
    const { error } = await admin.from('hits_kajian_presensi').upsert(chunk, { onConflict: 'ketua_wa,tanggal' });
    if (error) { console.error('upsert error', error.message); process.exit(1); }
    imported += chunk.length;
  }
  console.log(`\nDONE. upsert=${imported}, baris tanpa ketua ter-resolve=${skippedNoKetua}`);
}
main();
```

> **Catatan tahun:** file `JUNI 2025` = 2025; `Januari`/`April Akhwat` = 2026 (data Jan–Jun 2026 per inspeksi header). Verifikasi tahun benar saat dry-run; sesuaikan bila header menunjukkan tahun lain. Env var repo: URL = `NEXT_PUBLIC_SUPABASE_URL`, key = `SUPABASE_SERVICE_ROLE_KEY` (lihat `src/lib/supabase-admin.ts`).

- [ ] **Step 3: Dry-run inspeksi (tanpa upsert) lalu impor**

Sementara komentari blok upsert, jalankan untuk cek jumlah & tanggal:
Run: `npx tsx --env-file=.env.local scripts/import-kajian-adab.ts`
Periksa: tanggal ter-derive semuanya Minggu, jumlah baris masuk akal, `skippedNoKetua` wajar (halaqah tanpa ketua). Bila oke, aktifkan upsert & jalankan lagi.

- [ ] **Step 4: Verifikasi di DB**

Query: `select count(*), min(tanggal), max(tanggal) from hits_kajian_presensi;` — jumlah & rentang sesuai. Cek beberapa ketua di dashboard koordinator.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-kajian-adab.ts
git commit -m "feat(hits-f4): script migrasi historis presensi kajian adab dari xlsx"
```

---

## Task 8: Dokumentasi + verifikasi akhir

**Files:**
- Modify: `docs/FITUR-HITS.md`

- [ ] **Step 1: Dokumentasikan F4 di FITUR-HITS.md**

Tambah sub-bagian ringkas "Presensi Kajian Adab Ketua (F4)": tujuan, alur check-in, lifecycle alpa (reminder→3 hari→alpa), dashboard koordinator, catatan tak feed matrix. Tambah template `tplReminderKajianAdab` ke tabel Template WhatsApp.

- [ ] **Step 2: Jalankan semua uji + typecheck**

Run: `npm run test-kajian && npm run test-tabayyun && npm run test-hutang && npx tsc --noEmit`
Expected: semua lulus, tanpa error TS.

- [ ] **Step 3: Verifikasi manual end-to-end**

- Ketua check-in hari Minggu (Hadir/Izin/Sakit; Terlambat bila >16:00).
- Koordinator lihat rekap, reminder ketua belum-isi, countdown 3 hari, alpa setelah lewat.
- Libur CRUD mengecualikan sesi dari rekap.
- Data historis tampil di rekap.

- [ ] **Step 4: Commit**

```bash
git add docs/FITUR-HITS.md
git commit -m "docs(hits-f4): dokumentasi presensi kajian adab ketua"
```

---

## Catatan integrasi & deploy

- Migration `0040` **wajib di-apply prod** sebelum deploy action/UI (pola F1/F2/F3: auto-mode tolak apply).
- Script `import-kajian-adab.ts` dijalankan **setelah** 0040 + data `ketua_kelas`/`hits_halaqah` tersedia di target DB. Idempotent (unique) — aman diulang.
- Menu ke `/observasi/koordinator/kajian` ditautkan dari dashboard koordinator KK existing.
- Kolom terverifikasi: `ketua_kelas.name`, `.active`, `.hits_halaqah_id` ada; helper wa.me = `buildWaMeUrl`; env admin = `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
