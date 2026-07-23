# Inbox Pengajuan Koordinator HITS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beri koordinator HITS satu halaman inbox yang mengumpulkan 4 jenis pengajuan (pindah/claim, hapus pertemuan, koreksi, dual-role), menandai yang mendesak/konflik, dan link ke halaman keputusan token yang sudah ada.

**Architecture:** Data layer tunggal (`getHitsPengajuan`) menormalkan 4 tabel request → `PengajuanRow[]` (enrich halaqah/batch, ringkas, deteksi konflik, umur). Halaman server-component render list + tab + filter; aksi keputusan tetap **link-out** ke halaman `[token]` yang ada (nol duplikasi logika keputusan). Dashboard koordinator dapat kartu + badge pending.

**Tech Stack:** Next.js App Router (server components), `supabaseAdmin` (PostgREST-style query builder atas Postgres self-host), TypeScript. Tak ada unit-test runner di repo — pola test = skrip `tsx` lawan DB nyata (`scripts/test-*.ts`) + `npm run typecheck`.

---

## File Structure

- **Create** `src/lib/hits-pengajuan.ts` — tipe `PengajuanRow`/`PengajuanJenis`, `getHitsPengajuan(which)`, `countByJenis`, konstanta label/href. Satu tanggung jawab: baca+normalkan pengajuan.
- **Create** `scripts/test-hits-pengajuan.ts` — test data-layer lawan DB (hitung per jenis cocok, invarian shape, sort).
- **Create** `src/app/hits/koordinator/pengajuan/page.tsx` — halaman inbox (server): tab, filter jenis+gender, list kartu.
- **Create** `src/app/hits/koordinator/pengajuan/ShareLinkButton.tsx` — komponen client kecil utk "Salin link" + WA share (fitur 6).
- **Modify** `src/app/hits/koordinator/page.tsx` — kartu "Pengajuan Masuk" + badge pending.
- **Modify** `package.json` — script `test-pengajuan`.

Catatan pola TDD: karena data layer memukul DB nyata dan UI = server component atas DB, tak ada red-green unit runner. Adaptasi (pola rumah): Task 1→2 tulis lib lalu skrip assert lawan DB; UI (Task 3–5) diverifikasi via `npm run typecheck` + walkthrough browser terdokumentasi (Task 6).

---

### Task 1: Data layer `src/lib/hits-pengajuan.ts`

**Files:**
- Create: `src/lib/hits-pengajuan.ts`

- [ ] **Step 1: Tulis file lengkap**

```ts
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayJakarta } from '@/lib/maahir-presensi';

export type PengajuanJenis = 'pindah' | 'hapus' | 'koreksi' | 'dual';

export const PENGAJUAN_LABEL: Record<PengajuanJenis, string> = {
  pindah: 'Pindah/Claim',
  hapus: 'Hapus Pertemuan',
  koreksi: 'Koreksi',
  dual: 'Dual-Role',
};

export const JENIS_ORDER: PengajuanJenis[] = ['pindah', 'hapus', 'koreksi', 'dual'];

const HREF: Record<PengajuanJenis, (token: string) => string> = {
  pindah: (t) => `/hits/pindah-halaqah/${t}`,
  hapus: (t) => `/hits/hapus-pertemuan/${t}`,
  koreksi: (t) => `/hits/koordinator/koreksi/${t}`,
  dual: (t) => `/hits/ketua-dual/${t}`,
};

export type KoreksiItemLite = {
  pertemuan_no: number | null;
  level: string | null;
  tanggal: string | null;
  jenis: string | null;
};

export type PengajuanRow = {
  jenis: PengajuanJenis;
  id: string;
  token: string | null;
  decideHref: string | null;
  halaqahId: string | null;
  halaqahName: string;
  batchName: string;
  gender: 'ikhwan' | 'akhwat' | null;
  requesterName: string;
  requesterWa: string | null;
  ringkas: string;
  items?: KoreksiItemLite[];
  ageDays: number;
  conflict: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decidedByRole: string | null;
};

type HalaqahLite = {
  id: string;
  name: string | null;
  batch_id: string | null;
  gender: 'ikhwan' | 'akhwat' | null;
  pengajar_id: string | null;
  active: boolean | null;
};

/** Selisih hari kalender (fromIso .. today), minimal 0. */
function daysBetween(fromIso: string, todayIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(todayIso + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

/**
 * Semua pengajuan HITS (4 jenis) ternormalkan.
 * which='pending' → status='pending'; which='decided' → status<>'pending'.
 * Best-effort per tabel: kegagalan 1 tabel tak menggagalkan lainnya.
 */
export async function getHitsPengajuan(which: 'pending' | 'decided'): Promise<PengajuanRow[]> {
  const today = todayJakarta();
  const isPending = which === 'pending';
  const withStatus = (q: any) => (isPending ? q.eq('status', 'pending') : q.neq('status', 'pending'));

  const [pindahRes, hapusRes, koreksiRes, dualRes] = await Promise.all([
    withStatus(
      supabaseAdmin
        .from('hits_halaqah_pindah_request')
        .select(
          'id, halaqah_id, requested_by_name, requested_by_wa, target_name, token, status, decided_by_role, decided_at, created_at'
        )
    ),
    withStatus(
      supabaseAdmin
        .from('hits_pertemuan_hapus_request')
        .select(
          'id, halaqah_id, pertemuan_no, tanggal, level, gender, alasan, requested_by_name, token, status, decided_by_role, decided_at, created_at'
        )
    ),
    withStatus(
      supabaseAdmin
        .from('hits_pertemuan_koreksi')
        .select(
          'id, halaqah_id, requested_by_name, requested_by_wa, token, status, decided_by_role, decided_at, created_at'
        )
    ),
    withStatus(
      supabaseAdmin
        .from('ketua_dualrole_request')
        .select(
          'id, new_halaqah_id, gender, requested_by_name, requested_by_wa, target_name, token, status, decided_by_role, decided_at, created_at'
        )
    ),
  ]);

  const pindah = (pindahRes.data ?? []) as any[];
  const hapus = (hapusRes.data ?? []) as any[];
  const koreksi = (koreksiRes.data ?? []) as any[];
  const dual = (dualRes.data ?? []) as any[];

  // Enrich halaqah + batch (sekali).
  const halaqahIds = [
    ...pindah.map((r) => r.halaqah_id),
    ...hapus.map((r) => r.halaqah_id),
    ...koreksi.map((r) => r.halaqah_id),
    ...dual.map((r) => r.new_halaqah_id),
  ].filter(Boolean) as string[];

  const halaqahById = new Map<string, HalaqahLite>();
  const batchNameById = new Map<string, string>();
  if (halaqahIds.length) {
    const { data: hls } = await supabaseAdmin
      .from('hits_halaqah')
      .select('id, name, batch_id, gender, pengajar_id, active')
      .in('id', [...new Set(halaqahIds)]);
    for (const h of (hls ?? []) as HalaqahLite[]) halaqahById.set(h.id, h);
    const batchIds = [...new Set((hls ?? []).map((h: any) => h.batch_id).filter(Boolean))] as string[];
    if (batchIds.length) {
      const { data: bs } = await supabaseAdmin.from('hits_batch').select('id, name').in('id', batchIds);
      for (const b of (bs ?? []) as any[]) batchNameById.set(b.id, b.name);
    }
  }

  // Item koreksi (fitur 7).
  const koreksiItems = new Map<string, KoreksiItemLite[]>();
  if (koreksi.length) {
    const { data: items } = await supabaseAdmin
      .from('hits_pertemuan_koreksi_item')
      .select('koreksi_id, pertemuan_no, level, tanggal, jenis')
      .in(
        'koreksi_id',
        koreksi.map((r) => r.id)
      );
    for (const it of (items ?? []) as any[]) {
      const arr = koreksiItems.get(it.koreksi_id) ?? [];
      arr.push({ pertemuan_no: it.pertemuan_no, level: it.level, tanggal: it.tanggal, jenis: it.jenis });
      koreksiItems.set(it.koreksi_id, arr);
    }
  }

  const enrich = (halaqahId: string | null) => {
    const h = halaqahId ? halaqahById.get(halaqahId) : undefined;
    return {
      h,
      halaqahName: h?.name ?? '(halaqah dihapus)',
      batchName: h?.batch_id ? batchNameById.get(h.batch_id) ?? '' : '',
    };
  };
  const conflictOf = (h: HalaqahLite | undefined, needPengajarFree: boolean): string | null => {
    if (!h) return 'Halaqah tak ditemukan';
    if (h.active === false) return 'Halaqah nonaktif';
    if (needPengajarFree && h.pengajar_id) return 'Halaqah sudah ada pengajar';
    return null;
  };

  const common = (jenis: PengajuanJenis, r: any, halaqahId: string | null, gender: any, h: HalaqahLite | undefined, halaqahName: string, batchName: string) => ({
    jenis,
    id: r.id,
    token: r.token ?? null,
    decideHref: r.token ? HREF[jenis](r.token) : null,
    halaqahId,
    halaqahName,
    batchName,
    gender: (gender ?? h?.gender ?? null) as 'ikhwan' | 'akhwat' | null,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? null,
    decidedByRole: r.decided_by_role ?? null,
    ageDays: daysBetween(r.created_at, today),
  });

  const rows: PengajuanRow[] = [];

  for (const r of pindah) {
    const { h, halaqahName, batchName } = enrich(r.halaqah_id);
    rows.push({
      ...common('pindah', r, r.halaqah_id, null, h, halaqahName, batchName),
      requesterName: r.requested_by_name ?? '—',
      requesterWa: r.requested_by_wa ?? null,
      ringkas: `${r.requested_by_name ?? '—'} → ${r.target_name ? 'ke ' + r.target_name : 'claim'} · ${halaqahName}`,
      conflict: conflictOf(h, true),
    });
  }
  for (const r of hapus) {
    const { h, halaqahName, batchName } = enrich(r.halaqah_id);
    const bits = [
      `Hapus #${r.pertemuan_no ?? '?'}`,
      r.tanggal ?? null,
      r.level ?? null,
    ].filter(Boolean);
    rows.push({
      ...common('hapus', r, r.halaqah_id, r.gender, h, halaqahName, batchName),
      requesterName: r.requested_by_name ?? '—',
      requesterWa: null,
      ringkas: bits.join(' · ') + (r.alasan ? ` — ${r.alasan}` : ''),
      conflict: conflictOf(h, false),
    });
  }
  for (const r of koreksi) {
    const { h, halaqahName, batchName } = enrich(r.halaqah_id);
    const items = koreksiItems.get(r.id) ?? [];
    const first = items[0];
    const firstStr = first
      ? `#${first.pertemuan_no ?? '?'}${first.level ? ' (' + first.level + ')' : ''}${first.tanggal ? ' → ' + first.tanggal : ''}`
      : '';
    rows.push({
      ...common('koreksi', r, r.halaqah_id, null, h, halaqahName, batchName),
      requesterName: r.requested_by_name ?? '—',
      requesterWa: r.requested_by_wa ?? null,
      items,
      ringkas: `Ubah ${items.length} pertemuan${firstStr ? ' · ' + firstStr : ''} · ${halaqahName}`,
      conflict: conflictOf(h, false),
    });
  }
  for (const r of dual) {
    const { h, halaqahName, batchName } = enrich(r.new_halaqah_id);
    rows.push({
      ...common('dual', r, r.new_halaqah_id, r.gender, h, halaqahName, batchName),
      requesterName: r.requested_by_name ?? '—',
      requesterWa: r.requested_by_wa ?? null,
      ringkas: `${r.requested_by_name ?? '—'}${r.target_name ? ' → ' + r.target_name : ''} · ${halaqahName}`,
      conflict: conflictOf(h, true),
    });
  }

  if (isPending) {
    rows.sort((a, b) => {
      const ca = a.conflict ? 0 : 1;
      const cb = b.conflict ? 0 : 1;
      if (ca !== cb) return ca - cb; // konflik dulu
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0; // terlama dulu
    });
  } else {
    rows.sort((a, b) => {
      const da = a.decidedAt ?? '';
      const db = b.decidedAt ?? '';
      return da > db ? -1 : da < db ? 1 : 0; // terbaru diputus dulu
    });
  }

  return rows;
}

export function countByJenis(rows: PengajuanRow[]): Record<PengajuanJenis, number> {
  const out: Record<PengajuanJenis, number> = { pindah: 0, hapus: 0, koreksi: 0, dual: 0 };
  for (const r of rows) out[r.jenis] += 1;
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (tak ada error di `hits-pengajuan.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/hits-pengajuan.ts
git commit -m "feat(hits): data layer inbox pengajuan koordinator (4 jenis ternormalkan)"
```

---

### Task 2: Test script data-layer

**Files:**
- Create: `scripts/test-hits-pengajuan.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Tulis skrip test**

```ts
/**
 * Test data-layer inbox pengajuan HITS (lawan DB nyata).
 *   npm run test-pengajuan
 *
 * Verifikasi: hitung per jenis cocok dgn count DB; invarian shape;
 * urutan pending (konflik dulu, lalu terlama).
 */
import { getHitsPengajuan, countByJenis, JENIS_ORDER } from '../src/lib/hits-pengajuan';
import { supabaseAdmin } from '../src/lib/supabase-admin';

async function dbCount(table: string, pending: boolean): Promise<number> {
  const q = supabaseAdmin.from(table).select('id');
  const { data } = await (pending ? q.eq('status', 'pending') : q.neq('status', 'pending'));
  return (data ?? []).length;
}

const TABLE: Record<string, string> = {
  pindah: 'hits_halaqah_pindah_request',
  hapus: 'hits_pertemuan_hapus_request',
  koreksi: 'hits_pertemuan_koreksi',
  dual: 'ketua_dualrole_request',
};

async function main() {
  let ok = true;

  const pend = await getHitsPengajuan('pending');
  const c = countByJenis(pend);
  for (const j of JENIS_ORDER) {
    const expect = await dbCount(TABLE[j], true);
    const pass = c[j] === expect;
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} pending ${j}: lib=${c[j]} db=${expect}`);
  }

  // Invarian shape.
  for (const r of pend) {
    if (r.token && !r.decideHref) {
      ok = false;
      console.log(`✗ ada token tapi tak ada decideHref: ${r.jenis} ${r.id}`);
    }
    if (r.ageDays < 0) {
      ok = false;
      console.log(`✗ umur negatif: ${r.jenis} ${r.id}`);
    }
  }

  // Urutan: semua baris konflik harus mendahului baris non-konflik.
  const firstNonConflict = pend.findIndex((r) => !r.conflict);
  const lastConflict = pend.map((r) => !!r.conflict).lastIndexOf(true);
  if (firstNonConflict !== -1 && lastConflict !== -1 && lastConflict > firstNonConflict) {
    ok = false;
    console.log('✗ urutan konflik salah (ada konflik setelah non-konflik)');
  }

  console.log(`konflik terdeteksi: ${pend.filter((r) => r.conflict).length}`);
  console.log(`total pending: ${pend.length}`);

  const dec = await getHitsPengajuan('decided');
  console.log(`total riwayat: ${dec.length}`);
  if (dec.some((r) => r.status === 'pending')) {
    ok = false;
    console.log('✗ riwayat memuat baris pending');
  }

  console.log(ok ? 'PASS' : 'FAIL');
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Tambah npm script**

Di `package.json` bagian `"scripts"`, setelah baris `"test-ranking"`, tambah:

```json
    "test-pengajuan": "tsx --env-file=.env.local scripts/test-hits-pengajuan.ts",
```

- [ ] **Step 3: Jalankan test**

Run: `npm run test-pengajuan`
Expected: baris `✓ pending pindah/hapus/koreksi/dual` cocok, cetak jumlah konflik, diakhiri `PASS`. (Saat plan ditulis: pending pindah=18, hapus=27, koreksi=14, dual=9.)

- [ ] **Step 4: Commit**

```bash
git add scripts/test-hits-pengajuan.ts package.json
git commit -m "test(hits): skrip verifikasi data-layer inbox pengajuan"
```

---

### Task 3: Halaman inbox `page.tsx`

**Files:**
- Create: `src/app/hits/koordinator/pengajuan/page.tsx`

Prasyarat classnames (sudah ada di `globals.css`): `topbar`, `wordmark`, `mark`, `back`, `page`, `section-row`, `card`, `card-flat`, `badge`, `badge-hijau|kuning|merah|neutral`, `dot`, `t-small`, `t-tiny`, `btn`, `btn-sm`, `btn-ghost`. Badge jenis dipetakan ke 4 warna yg ada.

- [ ] **Step 1: Tulis halaman (tanpa tombol Share dulu — ditambah Task 4)**

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { Icon } from '@/components/icons';
import { buildWaMeUrl } from '@/lib/whatsapp';
import {
  getHitsPengajuan,
  countByJenis,
  PENGAJUAN_LABEL,
  JENIS_ORDER,
  type PengajuanJenis,
  type PengajuanRow,
} from '@/lib/hits-pengajuan';

export const dynamic = 'force-dynamic';

const JENIS_BADGE: Record<PengajuanJenis, string> = {
  pindah: 'badge-neutral',
  hapus: 'badge-merah',
  koreksi: 'badge-kuning',
  dual: 'badge-hijau',
};

function ageBadgeClass(days: number): string {
  if (days > 7) return 'badge-merah';
  if (days > 3) return 'badge-kuning';
  return 'badge-neutral';
}

export default async function PengajuanInboxPage({
  searchParams,
}: {
  searchParams: { tab?: string; jenis?: string; gender?: string };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const tab = searchParams.tab === 'riwayat' ? 'riwayat' : 'menunggu';
  const jenisFilter = JENIS_ORDER.includes(searchParams.jenis as PengajuanJenis)
    ? (searchParams.jenis as PengajuanJenis)
    : undefined;
  const genderFilter =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat' ? searchParams.gender : undefined;

  const all = await getHitsPengajuan(tab === 'riwayat' ? 'decided' : 'pending');
  const counts = countByJenis(all);
  let rows = all;
  if (jenisFilter) rows = rows.filter((r) => r.jenis === jenisFilter);
  if (genderFilter) rows = rows.filter((r) => r.gender === genderFilter);

  const qs = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { tab, jenis: jenisFilter, gender: genderFilter, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Pengajuan Masuk
          </div>
          <Link href="/hits/koordinator" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          {/* Tab Menunggu / Riwayat */}
          <div className="section-row" style={{ gap: 8, marginBottom: 12 }}>
            <Link
              href={qs({ tab: undefined })}
              className={`btn btn-sm ${tab === 'menunggu' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Menunggu
            </Link>
            <Link
              href={qs({ tab: 'riwayat' })}
              className={`btn btn-sm ${tab === 'riwayat' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Riwayat
            </Link>
          </div>

          {/* Chip filter jenis + hitung per jenis */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <Link
              href={qs({ jenis: undefined })}
              className={`badge ${!jenisFilter ? 'badge-hijau' : 'badge-neutral'}`}
              style={{ textDecoration: 'none' }}
            >
              Semua {all.length}
            </Link>
            {JENIS_ORDER.map((j) => (
              <Link
                key={j}
                href={qs({ jenis: j })}
                className={`badge ${jenisFilter === j ? 'badge-hijau' : 'badge-neutral'}`}
                style={{ textDecoration: 'none' }}
              >
                {PENGAJUAN_LABEL[j]} {counts[j]}
              </Link>
            ))}
          </div>

          {/* Filter gender */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['ikhwan', 'akhwat'] as const).map((g) => (
              <Link
                key={g}
                href={qs({ gender: genderFilter === g ? undefined : g })}
                className={`badge ${genderFilter === g ? 'badge-kuning' : 'badge-neutral'}`}
                style={{ textDecoration: 'none' }}
              >
                {g === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
              </Link>
            ))}
          </div>

          {rows.length === 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              {tab === 'riwayat' ? 'Belum ada pengajuan yang diputuskan.' : 'Tak ada pengajuan menunggu. 🎉'}
            </p>
          )}

          {rows.map((r) => (
            <PengajuanCard key={`${r.jenis}-${r.id}`} r={r} tab={tab} />
          ))}
        </div>
      </div>
    </main>
  );
}

function PengajuanCard({ r, tab }: { r: PengajuanRow; tab: 'menunggu' | 'riwayat' }) {
  const waPengaju =
    r.requesterWa &&
    buildWaMeUrl(r.requesterWa, `Assalamualaikum ${r.requesterName}, terkait pengajuan ${PENGAJUAN_LABEL[r.jenis]} (${r.halaqahName}).`);

  return (
    <div
      className="card"
      style={{
        padding: '10px 14px',
        marginBottom: 8,
        borderLeft: r.conflict ? '3px solid var(--merah)' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge ${JENIS_BADGE[r.jenis]}`}>{PENGAJUAN_LABEL[r.jenis]}</span>
            {tab === 'menunggu' && (
              <span className={`badge ${ageBadgeClass(r.ageDays)}`}>
                <span className="dot" /> {r.ageDays} hari
              </span>
            )}
            {r.gender && <span className="t-tiny">{r.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>
            {r.halaqahName}
            {r.batchName ? ` · ${r.batchName}` : ''}
          </div>
          <div className="t-small" style={{ marginTop: 1 }}>
            {r.ringkas}
          </div>
          {r.items && r.items.length > 1 && (
            <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
              {r.items
                .slice(0, 3)
                .map((it) => `#${it.pertemuan_no ?? '?'}${it.tanggal ? '→' + it.tanggal : ''}`)
                .join(', ')}
              {r.items.length > 3 ? ` +${r.items.length - 3} lagi` : ''}
            </div>
          )}
          <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
            Pengaju: {r.requesterName}
          </div>
          {r.conflict && (
            <div className="t-tiny" style={{ color: 'var(--merah-ink)', marginTop: 2, fontWeight: 600 }}>
              ⚠ {r.conflict}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tab === 'menunggu' ? (
            <>
              {r.decideHref && (
                <Link href={r.decideHref} className="btn btn-sm btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  Tinjau →
                </Link>
              )}
              {waPengaju && (
                <a href={waPengaju} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                  WA pengaju
                </a>
              )}
              {/* Tombol Bagikan link ditambahkan di Task 4 */}
            </>
          ) : (
            <>
              <span
                className={`badge ${
                  r.status === 'rejected' ? 'badge-merah' : r.status === 'pending' ? 'badge-kuning' : 'badge-hijau'
                }`}
              >
                {r.status}
              </span>
              {r.decidedAt && (
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  {r.decidedAt.slice(0, 10)}
                  {r.decidedByRole ? ` · ${r.decidedByRole}` : ''}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Jika `btn-primary` tak ada, ganti ke class tombol utama yg dipakai `src/app/hits/koordinator/page.tsx` (cek: `grep -n "btn-primary" src/app` — dipakai di dashboard, jadi ada).

- [ ] **Step 3: Commit**

```bash
git add src/app/hits/koordinator/pengajuan/page.tsx
git commit -m "feat(hits): halaman inbox pengajuan koordinator (tab, filter, kartu, konflik)"
```

---

### Task 4: Tombol Bagikan link (fitur 6)

**Files:**
- Create: `src/app/hits/koordinator/pengajuan/ShareLinkButton.tsx`
- Modify: `src/app/hits/koordinator/pengajuan/page.tsx`

- [ ] **Step 1: Tulis komponen client**

```tsx
'use client';

import { useState } from 'react';

/**
 * Bagikan link keputusan bertoken: salin ke clipboard + buka WA share
 * (tanpa nomor → user pilih chat tujuan, mis. rekan koordinator).
 */
export function ShareLinkButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${label}\n${url}`)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button type="button" onClick={copy} className="btn btn-sm btn-ghost">
        {copied ? 'Tersalin ✓' : 'Salin link'}
      </button>
      <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
        WA
      </a>
    </span>
  );
}
```

- [ ] **Step 2: Wire ke kartu**

Di `src/app/hits/koordinator/pengajuan/page.tsx`:

Tambah import di atas:

```tsx
import { absUrl } from '@/lib/url';
import { ShareLinkButton } from './ShareLinkButton';
```

Ganti komentar placeholder di dalam blok `tab === 'menunggu'`:

```tsx
              {/* Tombol Bagikan link ditambahkan di Task 4 */}
```

dengan:

```tsx
              {r.decideHref && (
                <ShareLinkButton
                  url={absUrl(r.decideHref)}
                  label={`Pengajuan ${PENGAJUAN_LABEL[r.jenis]} — ${r.halaqahName}`}
                />
              )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/hits/koordinator/pengajuan/ShareLinkButton.tsx src/app/hits/koordinator/pengajuan/page.tsx
git commit -m "feat(hits): tombol bagikan link keputusan (salin + WA share)"
```

---

### Task 5: Integrasi dashboard koordinator

**Files:**
- Modify: `src/app/hits/koordinator/page.tsx`

- [ ] **Step 1: Import data layer**

Di bagian import atas `src/app/hits/koordinator/page.tsx`, tambah:

```tsx
import { getHitsPengajuan } from '@/lib/hits-pengajuan';
```

- [ ] **Step 2: Hitung pending + konflik**

Setelah guard `requireKoordinatorKetuaKelas` (dan sebelum `return`), tambah:

```tsx
  const pengajuanPending = await getHitsPengajuan('pending');
  const pengajuanCount = pengajuanPending.length;
  const pengajuanConflict = pengajuanPending.some((r) => r.conflict);
```

- [ ] **Step 3: Tambah kartu link**

Di JSX, di deret kartu navigasi (dekat link `/hits/koordinator/validasi` — cari `href="/hits/koordinator/validasi"`), sisipkan SEBELUM kartu validasi:

```tsx
          <Link
            href="/hits/koordinator/pengajuan"
            className="card-flat"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              marginBottom: 12,
              textDecoration: 'none',
              color: 'inherit',
              borderRadius: 10,
              borderLeft: pengajuanConflict ? '3px solid var(--merah)' : undefined,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Pengajuan Masuk</div>
              <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                Pindah/claim · hapus · koreksi · dual-role — tinjau &amp; putuskan
              </div>
            </div>
            {pengajuanCount > 0 ? (
              <span className="badge badge-merah">
                <span className="dot" /> {pengajuanCount}
              </span>
            ) : (
              <span style={{ color: 'var(--muted-2)' }}>→</span>
            )}
          </Link>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/hits/koordinator/page.tsx
git commit -m "feat(hits): kartu + badge Pengajuan Masuk di dashboard koordinator"
```

---

### Task 6: Verifikasi end-to-end

**Files:** (tak ada; verifikasi manual + skrip)

- [ ] **Step 1: Typecheck + lint penuh**

Run: `npm run typecheck && npm run lint`
Expected: keduanya bersih (atau hanya warning pre-existing yg tak terkait file baru).

- [ ] **Step 2: Data-layer test**

Run: `npm run test-pengajuan`
Expected: `PASS`, hitung per jenis cocok DB.

- [ ] **Step 3: Browser walkthrough**

Run: `npm run dev`, login sbg koordinator ketua kelas HITS, buka `/hits/koordinator`.
Cek:
1. Kartu "Pengajuan Masuk" tampil badge merah dgn angka = total pending.
2. Klik → `/hits/koordinator/pengajuan`. Tab **Menunggu** aktif, chip jenis tampil hitung (mis. Pindah 18, Hapus 27, Koreksi 14, Dual-Role 9).
3. Kartu terlama di atas; badge umur "N hari" masuk akal.
4. Cari kartu berstrip merah "⚠ Halaqah sudah ada pengajar" (skenario claim HITS 62). Bila tak ada di data saat ini, filter jenis=Pindah dan konfirmasi minimal urutan/label benar.
5. Klik **Tinjau →** pada 1 kartu tiap jenis → halaman keputusan token yg benar terbuka.
6. **WA pengaju** → URL `wa.me/<nomor>` benar. **Salin link** → clipboard berisi URL absolut halaman keputusan; **WA** share → `wa.me/?text=...` memuat link.
7. Filter gender ikhwan/akhwat mempersempit daftar.
8. Tab **Riwayat** → tampil pengajuan sudah diputus, badge status + tanggal + role; tak ada tombol Tinjau.

- [ ] **Step 4: (opsional) ACC 1 pengajuan → cek pindah tab**

Via halaman token, ACC/tolak 1 koreksi. Refresh inbox: baris hilang dari **Menunggu**, muncul di **Riwayat** dgn status benar. (Lewati bila tak mau mengubah data prod.)

- [ ] **Step 5: Commit (bila ada perbaikan dari walkthrough)**

```bash
git add -A
git commit -m "fix(hits): perbaikan pasca-verifikasi inbox pengajuan"
```

---

## Self-Review Notes

- **Spec coverage:** link-out (Task 3/4) ✓; pending+riwayat (Task 3) ✓; f1 umur+urut-terlama (lib sort + badge) ✓; f2 hitung per jenis (chip) ✓; f3 WA pengaju ✓; f4 filter jenis ✓; f5 konflik (`pengajar_id`/`active`/null) ✓; f6 bagikan link (Task 4) ✓; f7 ringkas koreksi kaya (items) ✓; dashboard badge (Task 5) ✓.
- **Non-goal dijaga:** tak ada decide-inline/bulk/digest/2in1.
- **Ketergantungan tipe:** `PengajuanRow`/`PengajuanJenis`/`countByJenis`/`JENIS_ORDER`/`PENGAJUAN_LABEL` didefinisikan Task 1, dipakai konsisten Task 2/3/4/5.
- **Risiko:** class `btn-primary`/`badge-ungu` — hanya 4 badge warna tersedia, sudah dipetakan ke neutral/merah/kuning/hijau (tak pakai ungu/biru). `btn-primary` dipakai di dashboard existing → aman.
