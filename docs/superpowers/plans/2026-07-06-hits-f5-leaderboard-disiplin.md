# HITS F5 — Leaderboard Disiplin Pengajar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti isi `/hits/koordinator` dengan leaderboard disiplin: ranking pengajar per %KBBS (pemecah seri hutang menit), lintas-batch, toggle periode bulanan/mingguan.

**Architecture:** Lib murni baru `hits-ranking.ts` (agregat per-pengajar + sort/rank) terpisah dari `hits-rekap.ts` yang month-coupled. Helper minggu 7-hari (Senin) ditambah ke `week.ts`. Page `/hits/koordinator` di-rewrite jadi tabel ranking view-only; 2 link topbar dipertahankan. Tanpa migration.

**Tech Stack:** Next.js App Router (server components), TypeScript, Supabase (`supabaseAdmin`), tsx test scripts (repo tak punya framework test).

**Spec:** `docs/superpowers/specs/2026-07-06-hits-f5-leaderboard-disiplin-design.md`

---

## File Structure

- **Create** `src/lib/hits-ranking.ts` — `DisiplinAgg`, `DisiplinRankRow`, `rankFromAggregates` (murni), `getDisiplinRanking` (query DB).
- **Modify** `src/lib/week.ts` — tambah `weekStartMonday`, `weekBounds`, `formatWeekRangeShort`, `recentMondays` (7-hari Senin, tak ganggu cycle 14-hari).
- **Create** `src/components/WeekNavSelect.tsx` — dropdown pilih minggu (client), set `?mode=minggu&week=`.
- **Create** `scripts/test-ranking.ts` — uji murni week helpers + `rankFromAggregates`.
- **Modify** `package.json` — tambah script `test-ranking`.
- **Rewrite** `src/app/hits/koordinator/page.tsx` — leaderboard view-only.

---

## Task 1: Helper minggu 7-hari di `week.ts` + test harness

**Files:**
- Modify: `src/lib/week.ts`
- Create: `scripts/test-ranking.ts`
- Modify: `package.json`

- [ ] **Step 1: Tambah script test ke package.json**

Di `package.json` bagian `"scripts"`, setelah baris `"test-kajian": ...`, tambah:

```json
    "test-ranking": "tsx --env-file=.env.local scripts/test-ranking.ts",
```

- [ ] **Step 2: Tulis test gagal (week helpers)**

Buat `scripts/test-ranking.ts`:

```ts
// Uji fungsi murni week helpers + ranking disiplin. Jalankan: npm run test-ranking
import { weekStartMonday, weekBounds, formatWeekRangeShort, recentMondays } from '@/lib/week';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

// --- week helpers (anchor 2026-06-01 Senin; 2026-07-06 juga Senin) ---
const asDate = (iso: string) => new Date(`${iso}T05:00:00Z`); // ~12:00 WIB, aman dari batas hari
eq(weekStartMonday(asDate('2026-07-06')), '2026-07-06', 'Senin -> Senin itu sendiri');
eq(weekStartMonday(asDate('2026-07-08')), '2026-07-06', 'Rabu -> Senin minggu ini');
eq(weekStartMonday(asDate('2026-07-12')), '2026-07-06', 'Minggu -> Senin minggu ini');
eq(weekStartMonday(asDate('2026-07-13')), '2026-07-13', 'Senin berikut -> dirinya');
eq(weekBounds('2026-07-06'), { start: '2026-07-06', end: '2026-07-13' }, 'weekBounds end = Senin+7');
eq(formatWeekRangeShort('2026-07-06'), '6 Jul–12 Jul', 'range dalam bulan');
eq(formatWeekRangeShort('2026-06-29'), '29 Jun–5 Jul', 'range lintas bulan');
const rm = recentMondays(3);
eq(rm.length, 3, 'recentMondays panjang 3');
eq(rm[0], weekStartMonday(), 'recentMondays[0] = minggu ini');
{
  const [y, m, d] = rm[0].split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 7);
  const prev = base.toISOString().slice(0, 10);
  eq(rm[1], prev, 'recentMondays[1] = minggu lalu (−7 hari)');
}

if (failed) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test lolos');
```

- [ ] **Step 3: Jalankan test — pastikan GAGAL**

Run: `npm run test-ranking`
Expected: FAIL / error — `weekStartMonday` belum diekspor dari `week.ts` (import error).

- [ ] **Step 4: Implementasi helper di `week.ts`**

Di akhir `src/lib/week.ts` (sebelum alias `export const weekStartOf = ...` atau setelahnya, mana saja), tambah. Fungsi private `toJakartaDateString`/`jakartaYMD` sudah ada di file ini — pakai langsung:

```ts
// ── Minggu kalender 7-hari (Senin–Minggu) untuk report F5. Terpisah dari
//    cycle 14-hari di atas. Anchor 2026-06-01 kebetulan Senin juga. ──
const WEEK_ANCHOR = '2026-06-01'; // Senin
const BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Senin dari minggu yang memuat `d` (WIB), 'YYYY-MM-DD'. */
export function weekStartMonday(d: Date = new Date()): string {
  const { y, m, d: day } = jakartaYMD(d);
  const dateUTC = new Date(Date.UTC(y, m - 1, day));
  const [ay, am, ad] = WEEK_ANCHOR.split('-').map(Number);
  const anchorUTC = new Date(Date.UTC(ay, am - 1, ad));
  const diffDays = Math.floor((dateUTC.getTime() - anchorUTC.getTime()) / 86400000);
  const offset = Math.floor(diffDays / 7) * 7;
  const res = new Date(anchorUTC);
  res.setUTCDate(res.getUTCDate() + offset);
  return toJakartaDateString(res);
}

/** Batas minggu: {start: Senin, end: Senin+7 eksklusif}. */
export function weekBounds(mondayISO: string): { start: string; end: string } {
  const [y, m, d] = mondayISO.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d));
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: mondayISO, end: toJakartaDateString(end) };
}

/** Label ringkas 'D Mmm–D Mmm' (Senin..Minggu). */
export function formatWeekRangeShort(mondayISO: string): string {
  const [sy, sm, sd] = mondayISO.split('-').map(Number);
  const endDate = new Date(Date.UTC(sy, sm - 1, sd));
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const [, em, ed] = toJakartaDateString(endDate).split('-').map(Number);
  return `${sd} ${BULAN_SHORT[sm - 1]}–${ed} ${BULAN_SHORT[em - 1]}`;
}

/** N Senin terakhir (terbaru dulu), termasuk minggu ini. */
export function recentMondays(count: number): string[] {
  const thisMon = weekStartMonday();
  const [y, m, d] = thisMon.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(base);
    dt.setUTCDate(dt.getUTCDate() - i * 7);
    out.push(toJakartaDateString(dt));
  }
  return out;
}
```

- [ ] **Step 5: Jalankan test — pastikan LOLOS (bagian week)**

Run: `npm run test-ranking`
Expected: baris `ok week ...` lolos. (`rankFromAggregates` belum diuji — ditambah Task 2.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/week.ts scripts/test-ranking.ts package.json
git commit -m "feat(hits-f5): helper minggu 7-hari (Senin) + test harness ranking"
```

---

## Task 2: Fungsi murni `rankFromAggregates` di `hits-ranking.ts`

**Files:**
- Create: `src/lib/hits-ranking.ts`
- Modify: `scripts/test-ranking.ts`

- [ ] **Step 1: Tambah test gagal (rank) ke `scripts/test-ranking.ts`**

Di `scripts/test-ranking.ts`, ubah baris import teratas jadi:

```ts
import { weekStartMonday, weekBounds, formatWeekRangeShort, recentMondays } from '@/lib/week';
import { rankFromAggregates, type DisiplinAgg } from '@/lib/hits-ranking';
```

Lalu, tepat SEBELUM blok `if (failed) {...}` di akhir file, sisipkan:

```ts
// --- rankFromAggregates ---
const A = (id: string, nama: string, kbbs: number, nonLibur: number, hutang: number): DisiplinAgg =>
  ({ pengajarId: id, pengajarNama: nama, gender: null, halaqahCount: 1, kbbs, nonLibur, hutangSaldo: hutang });

// A 100%, B 95% h0, C 95% h30 (seri KBBS, hutang > B -> di bawah B), D no-data
const ranked = rankFromAggregates([
  A('c', 'C', 19, 20, 30),
  A('a', 'A', 10, 10, 0),
  A('d', 'D', 0, 0, 0),
  A('b', 'B', 19, 20, 0),
]);
eq(ranked.map((r) => [r.pengajarId, r.pctKbbs, r.rank]),
   [['a', 100, 1], ['b', 95, 2], ['c', 95, 3], ['d', null, null]],
   'rank: %KBBS desc, hutang tiebreak, no-data tanpa rank');

// tiebreak nama: dua identik (%+hutang) -> alfabet
const tie = rankFromAggregates([A('z', 'Zaid', 8, 10, 0), A('y', 'Amir', 8, 10, 0)]);
eq(tie.map((r) => r.pengajarNama), ['Amir', 'Zaid'], 'seri penuh -> urut nama');

// agregat: fungsi murni terima nilai sudah dijumlah (uji pembagian pct)
eq(rankFromAggregates([A('x', 'X', 17, 20, 0)])[0].pctKbbs, 85, 'pctKbbs 17/20 -> 85 (dibulatkan)');
```

- [ ] **Step 2: Jalankan test — pastikan GAGAL**

Run: `npm run test-ranking`
Expected: FAIL — `rankFromAggregates` belum ada (import error).

- [ ] **Step 3: Buat `src/lib/hits-ranking.ts` (tipe + fungsi murni)**

```ts
// Leaderboard disiplin pengajar (F5): agregat %KBBS + hutang menit per pengajar,
// lalu ranking. Terpisah dari hits-rekap.ts (yang month-coupled).
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchInChunks } from '@/lib/hits-rekap';
import { computeHutangForHalaqahList } from '@/lib/hits-hutang';
import type { Gender } from '@/types/db';

export type DisiplinAgg = {
  pengajarId: string;
  pengajarNama: string;
  gender: Gender | null;
  halaqahCount: number;
  kbbs: number;
  nonLibur: number;
  hutangSaldo: number; // menit, kumulatif (bukan per-periode)
};

export type DisiplinRankRow = DisiplinAgg & {
  pctKbbs: number | null; // 0..100, null bila nonLibur=0
  rank: number | null;    // null bila pctKbbs null
};

/**
 * Urut: %KBBS turun (null di bawah) → hutang menit naik → nama. Rank 1..N
 * hanya untuk baris ber-data (pctKbbs != null). Fungsi murni — mudah diuji.
 */
export function rankFromAggregates(aggs: DisiplinAgg[]): DisiplinRankRow[] {
  const rows: DisiplinRankRow[] = aggs.map((a) => ({
    ...a,
    pctKbbs: a.nonLibur > 0 ? Math.round((a.kbbs / a.nonLibur) * 100) : null,
    rank: null,
  }));
  rows.sort((x, y) => {
    const rx = x.nonLibur > 0 ? x.kbbs / x.nonLibur : -1;
    const ry = y.nonLibur > 0 ? y.kbbs / y.nonLibur : -1;
    if (rx !== ry) return ry - rx; // pct desc, null(-1) terakhir
    if (x.hutangSaldo !== y.hutangSaldo) return x.hutangSaldo - y.hutangSaldo; // hutang asc
    return x.pengajarNama.localeCompare(y.pengajarNama);
  });
  let r = 0;
  for (const row of rows) {
    if (row.pctKbbs !== null) { r += 1; row.rank = r; }
  }
  return rows;
}
```

- [ ] **Step 4: Jalankan test — pastikan LOLOS**

Run: `npm run test-ranking`
Expected: semua `ok`, `Semua test lolos`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hits-ranking.ts scripts/test-ranking.ts
git commit -m "feat(hits-f5): rankFromAggregates (sort %KBBS + hutang tiebreak) + uji"
```

---

## Task 3: Query DB `getDisiplinRanking` di `hits-ranking.ts`

**Files:**
- Modify: `src/lib/hits-ranking.ts`

Tak ada unit test (butuh DB) — verifikasi via typecheck di Task 5 & jalan di app.

- [ ] **Step 1: Tambah `getDisiplinRanking` di akhir `src/lib/hits-ranking.ts`**

```ts
/**
 * Ranking disiplin semua pengajar aktif di [start,end). Halaqah tanpa
 * pengajar_id di-skip (tak bisa diagregat). Hutang = saldo kumulatif (F2),
 * dijumlah per pengajar dari semua halaqahnya (TAK di-scope periode).
 */
export async function getDisiplinRanking(opts: {
  start: string; // 'YYYY-MM-DD' inklusif
  end: string;   // 'YYYY-MM-DD' eksklusif
  gender?: Gender;
}): Promise<DisiplinRankRow[]> {
  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select('id, pengajar_id, pengajar_nama_sheet, gender')
    .eq('active', true)
    .not('pengajar_id', 'is', null);
  if (opts.gender) hq = hq.eq('gender', opts.gender);
  const { data: halaqahList } = await hq;
  const halaqah = halaqahList ?? [];
  if (!halaqah.length) return [];

  const halaqahIds = halaqah.map((h) => h.id as string);
  const halaqahToPengajar = new Map(halaqah.map((h) => [h.id as string, h.pengajar_id as string]));

  // meta per pengajar (nama, gender, daftar halaqah)
  const meta = new Map<string, { nama: string; gender: Gender | null; halaqahIds: string[] }>();
  for (const h of halaqah) {
    const pid = h.pengajar_id as string;
    const m = meta.get(pid) ?? {
      nama: (h.pengajar_nama_sheet as string) ?? '—',
      gender: (h.gender as Gender | null) ?? null,
      halaqahIds: [],
    };
    m.halaqahIds.push(h.id as string);
    meta.set(pid, m);
  }

  // keterangan harian di periode — chunked (anti-414 & cap-1000)
  const ketList = await fetchInChunks(halaqahIds, (chunk) =>
    supabaseAdmin
      .from('hits_keterangan_harian')
      .select('halaqah_id, kondisi')
      .gte('tanggal', opts.start)
      .lt('tanggal', opts.end)
      .in('halaqah_id', chunk)
  );
  const agg = new Map<string, { kbbs: number; nonLibur: number }>();
  for (const k of ketList) {
    const pid = halaqahToPengajar.get(k.halaqah_id as string);
    if (!pid) continue;
    const a = agg.get(pid) ?? { kbbs: 0, nonLibur: 0 };
    if (k.kondisi !== 'LIBUR') a.nonLibur += 1;
    if (k.kondisi === 'KBBS') a.kbbs += 1;
    agg.set(pid, a);
  }

  // hutang kumulatif per halaqah (F2, bulk) → jumlah per pengajar
  const hutangMap = await computeHutangForHalaqahList(halaqahIds);

  const aggs: DisiplinAgg[] = [...meta.entries()].map(([pid, m]) => {
    const a = agg.get(pid) ?? { kbbs: 0, nonLibur: 0 };
    const hutang = m.halaqahIds.reduce((s, hid) => s + (hutangMap.get(hid)?.saldo ?? 0), 0);
    return {
      pengajarId: pid,
      pengajarNama: m.nama,
      gender: m.gender,
      halaqahCount: m.halaqahIds.length,
      kbbs: a.kbbs,
      nonLibur: a.nonLibur,
      hutangSaldo: hutang,
    };
  });
  return rankFromAggregates(aggs);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: tak ada error baru dari `hits-ranking.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hits-ranking.ts
git commit -m "feat(hits-f5): getDisiplinRanking (agregat per pengajar lintas-batch)"
```

---

## Task 4: Komponen `WeekNavSelect`

**Files:**
- Create: `src/components/WeekNavSelect.tsx`

- [ ] **Step 1: Buat komponen (mirror MonthNavSelect, tapi set mode=minggu)**

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/** Dropdown pilih minggu (Senin ISO) — push `?mode=minggu&week=YYYY-MM-DD`. */
export function WeekNavSelect({
  options,
  value,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('mode', 'minggu');
    params.set('week', e.target.value);
    router.push(`?${params.toString()}`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label="Pilih minggu">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: tak ada error.

- [ ] **Step 3: Commit**

```bash
git add src/components/WeekNavSelect.tsx
git commit -m "feat(hits-f5): WeekNavSelect dropdown minggu"
```

---

## Task 5: Rewrite page `/hits/koordinator` jadi leaderboard

**Files:**
- Rewrite: `src/app/hits/koordinator/page.tsx`

- [ ] **Step 1: Ganti seluruh isi `src/app/hits/koordinator/page.tsx`**

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { getDisiplinRanking } from '@/lib/hits-ranking';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { WeekNavSelect } from '@/components/WeekNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { weekStartMonday, weekBounds, formatWeekRangeShort, recentMondays } from '@/lib/week';
import type { Gender } from '@/types/db';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = '2026-01'; // batch HITS paling awal mulai Jan 2026

export default async function HitsKoordinatorPage({
  searchParams,
}: {
  searchParams: { mode?: string; month?: string; week?: string; gender?: string };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);

  const mode = searchParams.mode === 'minggu' ? 'minggu' : 'bulan';
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;
  const week =
    searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week)
      ? searchParams.week
      : weekStartMonday();

  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  let start: string;
  let end: string;
  let periodeLabel: string;
  if (mode === 'minggu') {
    ({ start, end } = weekBounds(week));
    periodeLabel = formatWeekRangeShort(week);
  } else {
    const [y, m] = month.split('-').map(Number);
    start = `${month}-01`;
    end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    periodeLabel = month;
  }

  const rows = await getDisiplinRanking({ start, end, gender: genderFilter });
  const ranked = rows.filter((r) => r.rank !== null);
  const noData = rows.filter((r) => r.rank === null);

  const genderLabel =
    genderFilter === 'ikhwan' ? 'Ikhwan' : genderFilter === 'akhwat' ? 'Akhwat' : 'Ikhwan & Akhwat';
  const weekOpts = recentMondays(12).map((mon) => ({ value: mon, label: formatWeekRangeShort(mon) }));
  const g = genderFilter ? `&gender=${genderFilter}` : '';
  const pctColor = (p: number) =>
    p >= 90 ? 'var(--hijau-ink)' : p >= 75 ? 'var(--kuning-ink)' : 'var(--merah-ink)';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Soft Skill HITS
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/hits/koordinator/pertemuan" className="back">
              {Icon.shield(12)} Override Pertemuan
            </Link>
            <Link href="/hits/koordinator/validasi" className="back">
              {Icon.shield(12)} Validasi & Sumber Data
            </Link>
          </div>
        </div>

        <div className="page">
          {/* ── Hero ── */}
          <div
            style={{
              borderRadius: 'var(--r-xl)',
              padding: '22px 24px',
              marginBottom: 18,
              background: 'linear-gradient(135deg, var(--accent-tint), var(--surface))',
              border: '1px solid var(--accent-line)',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            <div className="section-row" style={{ alignItems: 'flex-start', marginBottom: 0, gap: 12 }}>
              <div>
                <h1 className="t-h1" style={{ marginBottom: 4 }}>
                  Ranking Disiplin Pengajar
                </h1>
                <p className="t-small" style={{ color: 'var(--ink-2)', maxWidth: 560 }}>
                  Urut <strong>%KBBS</strong> (disiplin periode) · pemecah seri{' '}
                  <strong>hutang menit</strong> (saldo tertunggak). Lintas-batch, per pengajar.
                </p>
                <p className="t-tiny" style={{ color: 'var(--muted)', marginTop: 8 }}>
                  {mode === 'minggu' ? 'Mingguan' : 'Bulanan'} · {periodeLabel} · {genderLabel} ·{' '}
                  {ranked.length} pengajar
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Link
                    href={`?mode=bulan${g}`}
                    className="chip-select"
                    style={{ fontWeight: mode === 'bulan' ? 700 : 400, opacity: mode === 'bulan' ? 1 : 0.6 }}
                  >
                    Bulanan
                  </Link>
                  <Link
                    href={`?mode=minggu${g}`}
                    className="chip-select"
                    style={{ fontWeight: mode === 'minggu' ? 700 : 400, opacity: mode === 'minggu' ? 1 : 0.6 }}
                  >
                    Mingguan
                  </Link>
                </div>
                {mode === 'minggu' ? (
                  <WeekNavSelect options={weekOpts} value={week} />
                ) : (
                  <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
                )}
                <GenderNavSelect value={genderFilter ?? ''} />
              </div>
            </div>
          </div>

          {ranked.length === 0 && noData.length === 0 ? (
            <div className="card-flat" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: 999, margin: '0 auto 12px',
                  background: 'var(--surface-3)', display: 'grid', placeItems: 'center',
                  color: 'var(--muted)',
                }}
              >
                {Icon.shield(22)}
              </div>
              <p className="t-h3" style={{ marginBottom: 4 }}>Belum ada data</p>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Tak ada pengajar/keterangan pada periode ini.
              </p>
            </div>
          ) : (
            <>
              <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="k-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44, textAlign: 'right' }}>#</th>
                        <th>Pengajar</th>
                        <th style={{ textAlign: 'right' }}>%KBBS</th>
                        <th style={{ textAlign: 'right' }}>Hutang (mnt)</th>
                        <th style={{ textAlign: 'right' }}>Halaqah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r) => (
                        <tr key={r.pengajarId}>
                          <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {r.rank}
                          </td>
                          <td className="nm" style={{ fontWeight: 500 }}>
                            <a
                              href={`/matrix/koordinator/pengajar/${r.pengajarId}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {r.pengajarNama}
                            </a>
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', fontWeight: 700, color: pctColor(r.pctKbbs!) }}
                          >
                            {r.pctKbbs}%
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', color: r.hutangSaldo > 0 ? 'var(--merah-ink)' : 'var(--muted)' }}
                          >
                            {r.hutangSaldo || '—'}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {r.halaqahCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {noData.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div
                    className="t-tiny"
                    style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}
                  >
                    BELUM ADA DATA PERIODE INI ({noData.length})
                  </div>
                  <div
                    className="card-flat"
                    style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}
                  >
                    {noData.map((r) => (
                      <a
                        key={r.pengajarId}
                        href={`/matrix/koordinator/pengajar/${r.pengajarId}`}
                        style={{ fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}
                      >
                        {r.pengajarNama}
                        {r.hutangSaldo > 0 ? (
                          <span style={{ color: 'var(--merah-ink)' }}> · {r.hutangSaldo}mnt</span>
                        ) : null}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: tak ada error. (Verifikasi `monthOptionsSince` return `Array<{value,label}>` — sudah dipakai pola sama di versi lama.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sukses; route `/hits/koordinator` ter-compile tanpa error.

- [ ] **Step 4: Commit**

```bash
git add src/app/hits/koordinator/page.tsx
git commit -m "feat(hits-f5): /hits/koordinator jadi leaderboard disiplin (ganti dashboard lama)"
```

---

## Task 6: Verifikasi manual & dokumentasi

**Files:**
- Modify: `docs/FITUR-HITS.md`

- [ ] **Step 1: Jalankan dev, cek visual**

Run: `npm run dev` lalu buka `/hits/koordinator` (login koordinator KK).
Verifikasi:
- Default = Bulanan, bulan ini, Ikhwan & Akhwat. Tabel terurut %KBBS desc.
- Toggle **Mingguan** → dropdown minggu muncul, data berubah, hutang tetap.
- Filter gender ikhwan/akhwat → baris tersaring.
- Klik nama → `/matrix/koordinator/pengajar/[id]`.
- 2 link topbar (Override Pertemuan, Validasi) masih ada & jalan.

- [ ] **Step 2: Update status di `docs/FITUR-HITS.md`**

Di bagian "Belum Diimplementasi", jangan hapus item matrix lain. Tambah satu baris di "Sudah Diimplementasi":

```markdown
- [x] Leaderboard disiplin pengajar F5 (`/hits/koordinator`): ranking %KBBS + hutang menit, toggle bulanan/mingguan (7-hari)
```

- [ ] **Step 3: Commit**

```bash
git add docs/FITUR-HITS.md
git commit -m "docs(hits-f5): catat leaderboard disiplin selesai"
```

---

## Catatan implementasi

- **DRY/pola**: `WeekNavSelect` meniru `MonthNavSelect`; page meniru struktur hero/topbar versi lama agar konsisten visual.
- **Anti-414/cap-1000**: query keterangan & hutang lewat `fetchInChunks`/`computeHutangForHalaqahList` (sudah chunked).
- **Tanpa migration** — murni baca.
- **Regresi sengaja**: kartu "ketua belum login" & pola mangkir hilang (keputusan user). Bila perlu balik, restore dari git history commit Task 5.
- **`localeCompare`**: aman untuk nama Indonesia; deterministic di Node.
