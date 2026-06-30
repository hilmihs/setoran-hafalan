# HITS Koreksi Pertemuan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ketua kelas HITS bisa mengajukan koreksi pertemuan (set tanggal mulai, tambah, hapus, ubah tanggal) dalam 1 pengajuan multi-item; koordinator KK memutuskan per-item; perubahan diterapkan ke `hits_kaldik_pertemuan` / `hits_halaqah.start_date`.

**Architecture:** Tambah `start_date` per-halaqah yang dihormati derivasi. Pengajuan disimpan di `hits_pertemuan_koreksi` (+ `_item`), diputuskan koordinator KK via magic-link (`/hits/koordinator/koreksi/[token]`), lalu helper `hits-koreksi.ts` menerapkan tiap item approved ke override/start_date dan menghapus keterangan sesi yang terbuang.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (`supabaseAdmin`, service-role), bcryptjs (tak relevan di sini), magic-link wa.me pola `pindah-halaqah`.

**Catatan verifikasi:** repo TIDAK punya test runner (hanya `npm run typecheck` = `tsc --noEmit`, `lint`, `build`). Verifikasi tiap task = `npx tsc --noEmit` + cek data via Supabase MCP (`execute_sql`) + uji manual alur. Migrasi diterapkan ke Supabase produksi via MCP `apply_migration` (project `yvjbqrrczwvlsaqbjwrq`). Deploy = push ke remote `maheer` (Azure pipeline). Push ke `origin` juga.

**Fakta terverifikasi:**
- `hits_kaldik_pertemuan` punya kolom `level` + UNIQUE `(halaqah_id, level, pertemuan_no)` → onConflict upsert pakai ketiganya.
- `hits_halaqah.start_date` BELUM ada.
- Migrasi terakhir = `0030`.
- `koordinator_ketua_kelas` punya kolom `whatsapp_number, gender, active`.

---

## File Structure

- Create `supabase/migrations/0031_hits_pertemuan_koreksi.sql` — start_date + 2 tabel koreksi.
- Modify `src/lib/hits-pertemuan.ts` — param `startDate` di `deriveHalaqahProgram`.
- Modify `src/lib/hits-ketua.ts` — select & teruskan `start_date`.
- Modify `src/lib/hits-rekap.ts` — select & teruskan `start_date`.
- Create `src/lib/hits-koreksi.ts` — tipe + `determineApprover` + `applyKoreksiItem`.
- Modify `src/lib/whatsapp.ts` — `tplKoreksiPertemuanApproval`, `tplKoreksiPertemuanInfo`.
- Create `src/app/hits/ketua/koreksi/KoreksiPanel.tsx` (client) + `actions.ts` (server) — susun & submit pengajuan.
- Modify `src/app/hits/ketua/page.tsx` — entry "Ajukan koreksi pertemuan".
- Create `src/app/hits/koordinator/koreksi/[token]/page.tsx` + `DecideKoreksiPanel.tsx` + `actions.ts`.
- Modify `src/app/hits/hapus-pertemuan/[token]/page.tsx` — tetap; entry lama diarahkan ke koreksi (Task 8).

---

## Task 1: Migrasi 0031 (start_date + tabel koreksi)

**Files:**
- Create: `supabase/migrations/0031_hits_pertemuan_koreksi.sql`

- [ ] **Step 1: Tulis file migrasi**

```sql
-- start_date per-halaqah: derivasi membuang pertemuan ber-tanggal < start_date.
alter table hits_halaqah add column if not exists start_date date;

-- Pengajuan koreksi pertemuan oleh ketua, diputuskan koordinator KK per-item.
create table if not exists hits_pertemuan_koreksi (
  id                 uuid primary key default gen_random_uuid(),
  halaqah_id         uuid not null references hits_halaqah(id) on delete cascade,
  requested_by_ketua_id uuid references ketua_kelas(id) on delete set null,
  requested_by_name  text not null,
  requested_by_wa    text,
  token              text not null unique,
  status             text not null default 'pending' check (status in ('pending','selesai')),
  decided_by_role    text,
  decided_by_id      uuid,
  decided_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists idx_hits_koreksi_halaqah on hits_pertemuan_koreksi (halaqah_id);
create unique index if not exists idx_hits_koreksi_pending
  on hits_pertemuan_koreksi (halaqah_id) where status = 'pending';

create table if not exists hits_pertemuan_koreksi_item (
  id           uuid primary key default gen_random_uuid(),
  koreksi_id   uuid not null references hits_pertemuan_koreksi(id) on delete cascade,
  jenis        text not null check (jenis in ('set_mulai','tambah','hapus','ubah_tanggal')),
  level        text,                 -- HitsLevel; null utk set_mulai
  pertemuan_no smallint,             -- utk hapus / ubah_tanggal
  tanggal      date,                 -- utk set_mulai / tambah / ubah_tanggal
  catatan      text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_hits_koreksi_item_koreksi on hits_pertemuan_koreksi_item (koreksi_id);

alter table hits_pertemuan_koreksi enable row level security;
alter table hits_pertemuan_koreksi_item enable row level security;
```

- [ ] **Step 2: Apply migrasi via MCP**

Gunakan Supabase MCP `apply_migration` project `yvjbqrrczwvlsaqbjwrq`, name `hits_pertemuan_koreksi`, query = isi file di atas.
Expected: `{"success":true}`.

- [ ] **Step 3: Verifikasi kolom & tabel**

MCP `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name='hits_halaqah' AND column_name='start_date';
SELECT to_regclass('hits_pertemuan_koreksi') a, to_regclass('hits_pertemuan_koreksi_item') b;
```
Expected: start_date ada; kedua tabel non-null.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0031_hits_pertemuan_koreksi.sql
git commit -m "feat(hits): migrasi koreksi pertemuan + start_date per-halaqah"
```

---

## Task 2: Derivasi hormati `start_date`

**Files:**
- Modify: `src/lib/hits-pertemuan.ts` (fungsi `deriveHalaqahProgram`)
- Modify: `src/lib/hits-ketua.ts` (`loadHalaqahPertemuan`)
- Modify: `src/lib/hits-rekap.ts` (`getHitsRekap`)

- [ ] **Step 1: Tambah param `startDate` di `deriveHalaqahProgram`**

`src/lib/hits-pertemuan.ts` — ubah signature + filter akhir:
```ts
export function deriveHalaqahProgram(
  program: string,
  jadwalHari: string[],
  kaldikByLevel: Map<HitsLevel, KaldikHariLite[]>,
  overridesByLevel: Map<HitsLevel, PertemuanOverride[]>,
  startDate?: string | null
): DerivedPertemuan[] {
  const defs = PROGRAM_STAGE_DEFS[program] ?? PROGRAM_STAGE_DEFS.dasar;
  const out: DerivedPertemuan[] = [];
  let prevLast: string | null = null;
  for (const def of defs) {
    const kaldik = kaldikByLevel.get(def.kaldikLevel) ?? [];
    if (kaldik.length === 0) continue;
    let derived = deriveHalaqahPertemuanWithOverrides(jadwalHari, kaldik, overridesByLevel.get(def.level) ?? []);
    if (prevLast) derived = derived.filter((d) => d.tanggal > prevLast!);
    if (derived.length === 0) continue;
    for (const d of derived) out.push({ ...d, level: def.level });
    prevLast = derived.reduce((mx, d) => (d.tanggal > mx ? d.tanggal : mx), prevLast ?? '');
  }
  const sorted = out.sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0));
  return startDate ? sorted.filter((d) => d.tanggal >= startDate) : sorted;
}
```

- [ ] **Step 2: Teruskan `start_date` di `loadHalaqahPertemuan`**

`src/lib/hits-ketua.ts`:
- Tambah `start_date` ke select `hits_halaqah` (string: `'... , pengajar_nama_sheet, start_date'`).
- Tambah `start_date: string | null` ke tipe `HalaqahLite`.
- Panggil derive: `deriveHalaqahProgram(halaqah.program, halaqah.jadwal_hari ?? [], kaldikByLevel, overridesByLevel, halaqah.start_date)`.

- [ ] **Step 3: Teruskan `start_date` di `getHitsRekap`**

`src/lib/hits-rekap.ts`:
- Tambah `start_date` ke select `hits_halaqah` (baris `.select('id, batch_id, level, program, name, gender, jadwal_raw, jadwal_hari, pengajar_nama_sheet, pengajar_id, start_date')`).
- Di `halaqah.map((h) => ...)`, panggil `deriveHalaqahProgram(h.program, h.jadwal_hari ?? [], kaldikByLevel, ovByLevel, h.start_date)`.

- [ ] **Step 4: Verifikasi typecheck**

Run: `npx tsc --noEmit`
Expected: `EXIT 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hits-pertemuan.ts src/lib/hits-ketua.ts src/lib/hits-rekap.ts
git commit -m "feat(hits): derivasi hormati start_date per-halaqah"
```

---

## Task 3: Helper `hits-koreksi.ts` (tipe + approver + apply)

**Files:**
- Create: `src/lib/hits-koreksi.ts`

- [ ] **Step 1: Tulis helper**

```ts
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import type { HitsLevel } from '@/types/db';

export type KoreksiJenis = 'set_mulai' | 'tambah' | 'hapus' | 'ubah_tanggal';

export type KoreksiItemInput = {
  jenis: KoreksiJenis;
  level?: HitsLevel | null;
  pertemuan_no?: number | null;
  tanggal?: string | null; // YYYY-MM-DD
  catatan?: string | null;
};

/** Koordinator KK aktif yang cocok gender halaqah (fallback gender lain). */
export async function determineKoreksiApprover(
  gender: 'ikhwan' | 'akhwat'
): Promise<{ name: string; wa: string } | null> {
  const { data } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('name, gender, whatsapp_number')
    .eq('active', true);
  const pick =
    (data ?? []).find((k) => k.gender === gender && k.whatsapp_number) ??
    (data ?? []).find((k) => k.whatsapp_number);
  return pick ? { name: pick.name, wa: pick.whatsapp_number } : null;
}

/** Terapkan satu item koreksi yang DISETUJUI ke override/start_date. */
export async function applyKoreksiItem(
  halaqahId: string,
  item: { jenis: KoreksiJenis; level: string | null; pertemuan_no: number | null; tanggal: string | null },
  actor: { role: string; id: string }
): Promise<void> {
  if (item.jenis === 'set_mulai' && item.tanggal) {
    await supabaseAdmin.from('hits_halaqah').update({ start_date: item.tanggal }).eq('id', halaqahId);
    // Buang keterangan sesi yang kini terbuang (< start_date).
    await supabaseAdmin.from('hits_keterangan_harian').delete().eq('halaqah_id', halaqahId).lt('tanggal', item.tanggal);
    return;
  }
  if (item.jenis === 'hapus' && item.level && item.pertemuan_no != null) {
    await supabaseAdmin.from('hits_kaldik_pertemuan').upsert(
      { halaqah_id: halaqahId, level: item.level, pertemuan_no: item.pertemuan_no, tanggal: item.tanggal ?? '1970-01-01', is_skipped: true, set_by_role: actor.role, set_by_id: actor.id },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
    await supabaseAdmin.from('hits_keterangan_harian').delete().eq('halaqah_id', halaqahId).eq('level', item.level).eq('pertemuan_no', item.pertemuan_no);
    return;
  }
  if (item.jenis === 'ubah_tanggal' && item.level && item.pertemuan_no != null && item.tanggal) {
    await supabaseAdmin.from('hits_kaldik_pertemuan').upsert(
      { halaqah_id: halaqahId, level: item.level, pertemuan_no: item.pertemuan_no, tanggal: item.tanggal, is_skipped: false, set_by_role: actor.role, set_by_id: actor.id },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
    await supabaseAdmin.from('hits_keterangan_harian').update({ tanggal: item.tanggal }).eq('halaqah_id', halaqahId).eq('level', item.level).eq('pertemuan_no', item.pertemuan_no);
    return;
  }
  if (item.jenis === 'tambah' && item.level && item.tanggal) {
    // Append max+1 PER TAHAP. Max diambil dari pertemuan terderivasi (kaldik) +
    // override yang ada agar nomor di atas semua yang sekarang & tak bentrok.
    const loaded = await loadHalaqahPertemuan(halaqahId);
    const derivedMax = Math.max(
      0,
      ...(loaded?.derived ?? []).filter((d) => d.level === item.level).map((d) => d.pertemuan_no)
    );
    const { data: ov } = await supabaseAdmin
      .from('hits_kaldik_pertemuan')
      .select('pertemuan_no')
      .eq('halaqah_id', halaqahId)
      .eq('level', item.level);
    const ovMax = Math.max(0, ...(ov ?? []).map((r) => r.pertemuan_no));
    const used = new Set((ov ?? []).map((r) => r.pertemuan_no));
    let no = Math.max(derivedMax, ovMax) + 1;
    while (used.has(no)) no++; // jaga unik bila ada beberapa tambah beruntun
    await supabaseAdmin.from('hits_kaldik_pertemuan').insert({
      halaqah_id: halaqahId, level: item.level, pertemuan_no: no, tanggal: item.tanggal, is_skipped: false,
      set_by_role: actor.role, set_by_id: actor.id, note: 'tambahan via koreksi ketua',
    });
    return;
  }
}
```

> Catatan: import `loadHalaqahPertemuan` dari `@/lib/hits-ketua` di atas file. Sesi `tambah` = `max(pertemuan_no derived+override per tahap)+1` (sesuai keputusan "append max+1"). Nomor hanya identitas; tampilan tetap urut tanggal (`deriveHalaqahPertemuanWithOverrides` menambah override manual yang tak terderivasi).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `EXIT 0`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hits-koreksi.ts
git commit -m "feat(hits): helper koreksi pertemuan (approver + apply item)"
```

---

## Task 4: Template WA

**Files:**
- Modify: `src/lib/whatsapp.ts`

- [ ] **Step 1: Tambah 2 template** (setelah `tplKetuaDualRoleInfo`)

```ts
/** Ke koordinator KK: minta keputusan koreksi pertemuan. */
export function tplKoreksiPertemuanApproval(args: {
  approverName: string;
  approverGender: Gender;
  ketuaName: string;
  halaqahName: string;
  jumlahItem: number;
  approveUrl: string;
  loginUrl: string;
}): string {
  const sapaan = salutation(args.approverGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.approverName},`,
    ``,
    `${args.ketuaName} (ketua *${args.halaqahName}*) mengajukan *${args.jumlahItem} koreksi pertemuan*.`,
    ``,
    `*Cara memutuskan:*`,
    `1. Login dulu di:`,
    args.loginUrl,
    `2. Buka tautan & setujui/tolak per item:`,
    args.approveUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ke ketua: hasil keputusan koreksi. */
export function tplKoreksiPertemuanInfo(args: {
  ketuaName: string;
  halaqahName: string;
  disetujui: number;
  ditolak: number;
}): string {
  return [
    `Assalamu'alaikum ${args.ketuaName},`,
    ``,
    `Koreksi pertemuan *${args.halaqahName}* telah diputuskan: *${args.disetujui} disetujui*, ${args.ditolak} ditolak.`,
    ``,
    `Silakan cek kembali daftar pertemuan di dashboard ketua.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (Expected EXIT 0)
```bash
git add src/lib/whatsapp.ts
git commit -m "feat(hits): template WA koreksi pertemuan"
```

---

## Task 5: Submit pengajuan (ketua)

**Files:**
- Create: `src/app/hits/ketua/koreksi/actions.ts`
- Create: `src/app/hits/ketua/koreksi/KoreksiPanel.tsx`
- Create: `src/app/hits/ketua/koreksi/page.tsx`
- Modify: `src/app/hits/ketua/page.tsx` (link entry)

- [ ] **Step 1: Server action `submitKoreksi`**

`src/app/hits/ketua/koreksi/actions.ts`:
```ts
'use server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa } from '@/lib/program-kelas';
import { getSession } from '@/lib/session';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplKoreksiPertemuanApproval } from '@/lib/whatsapp';
import { determineKoreksiApprover, type KoreksiItemInput } from '@/lib/hits-koreksi';
import { logAudit } from '@/lib/audit';

export type SubmitKoreksiResult = { ok?: boolean; error?: string; waUrl?: string };

export async function submitKoreksi(halaqahId: string, items: KoreksiItemInput[]): Promise<SubmitKoreksiResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Login diperlukan.' };
  if (!halaqahId || items.length === 0) return { error: 'Tidak ada item koreksi.' };

  // Pastikan ketua memimpin halaqah ini.
  const { data: kk } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, hits_halaqah_id')
    .eq('whatsapp_number', wa).eq('active', true).eq('hits_halaqah_id', halaqahId)
    .limit(1).maybeSingle();
  if (!kk) return { error: 'Anda bukan ketua halaqah ini.' };

  const { data: h } = await supabaseAdmin.from('hits_halaqah').select('name, gender').eq('id', halaqahId).maybeSingle();
  if (!h) return { error: 'Halaqah tidak ditemukan.' };

  const approver = await determineKoreksiApprover((h.gender as 'ikhwan' | 'akhwat') ?? 'ikhwan');
  if (!approver) return { error: 'Tidak ada koordinator ketua kelas ber-WA untuk menyetujui.' };

  const token = crypto.randomUUID();
  const { data: header, error: hErr } = await supabaseAdmin.from('hits_pertemuan_koreksi').insert({
    halaqah_id: halaqahId, requested_by_ketua_id: kk.id, requested_by_name: kk.name, requested_by_wa: wa, token,
  }).select('id').single();
  if (hErr || !header) return { error: `Gagal membuat pengajuan: ${hErr?.message ?? 'unknown'}` };

  const rows = items.map((it) => ({
    koreksi_id: header.id, jenis: it.jenis, level: it.level ?? null,
    pertemuan_no: it.pertemuan_no ?? null, tanggal: it.tanggal ?? null, catatan: it.catatan ?? null,
  }));
  const { error: iErr } = await supabaseAdmin.from('hits_pertemuan_koreksi_item').insert(rows);
  if (iErr) return { error: `Gagal menyimpan item: ${iErr.message}` };

  const s = await getSession();
  if (s.session) await logAudit({ actor: s.session, action: 'hits.koreksi.request', targetTable: 'hits_pertemuan_koreksi', targetId: header.id, detail: { halaqah_id: halaqahId, items: items.length } });

  const msg = tplKoreksiPertemuanApproval({
    approverName: approver.name, approverGender: (h.gender as 'ikhwan' | 'akhwat') ?? 'ikhwan',
    ketuaName: kk.name, halaqahName: h.name, jumlahItem: items.length,
    approveUrl: absUrl(`/hits/koordinator/koreksi/${token}`), loginUrl: absUrl('/'),
  });
  return { ok: true, waUrl: buildWaMeUrl(approver.wa, msg) };
}
```

- [ ] **Step 2: Client `KoreksiPanel`**

`src/app/hits/ketua/koreksi/KoreksiPanel.tsx` — terima daftar slot `{ level, pertemuan_no, tanggal, label }[]` + `halaqahId`. State daftar item draft. Kontrol:
- per slot: tombol "Hapus" (push `{jenis:'hapus',level,pertemuan_no}`) & "Ubah tanggal" (input date → `{jenis:'ubah_tanggal',level,pertemuan_no,tanggal}`).
- "+ Tambah pertemuan": pilih level (select QN/PB) + date → `{jenis:'tambah',level,tanggal}`.
- "Set tanggal mulai": date → `{jenis:'set_mulai',tanggal}` (peringatkan: hapus observasi sebelum tanggal itu).
- Daftar draft item dengan tombol hapus-item. Tombol "Kirim pengajuan" → `await submitKoreksi(halaqahId, items)`; bila `waUrl` tampilkan tombol "Kirim WA ke koordinator".

```tsx
'use client';
import { useState, useTransition } from 'react';
import { submitKoreksi } from './actions';
import type { KoreksiItemInput } from '@/lib/hits-koreksi';

type Slot = { level: string; pertemuan_no: number; tanggal: string; label: string };

export function KoreksiPanel({ halaqahId, slots }: { halaqahId: string; slots: Slot[] }) {
  const [items, setItems] = useState<KoreksiItemInput[]>([]);
  const [pending, start] = useTransition();
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const add = (it: KoreksiItemInput) => setItems((p) => [...p, it]);
  const removeAt = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  function submit() {
    setErr(null);
    start(async () => {
      const res = await submitKoreksi(halaqahId, items);
      if (res?.error) { setErr(res.error); return; }
      if (res?.waUrl) setWaUrl(res.waUrl);
    });
  }

  if (waUrl) {
    return (
      <div className="card-flat" style={{ padding: 16, textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600, marginBottom: 12 }}>Pengajuan terkirim — minta persetujuan koordinator.</p>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block">Kirim WA ke koordinator</a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SetMulai onAdd={add} />
      <TambahPertemuan onAdd={add} />
      <div>
        <div className="t-tiny" style={{ marginBottom: 6, color: 'var(--muted-2)' }}>Pertemuan saat ini — pilih aksi:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slots.map((s) => <SlotRow key={`${s.level}-${s.pertemuan_no}`} slot={s} onAdd={add} />)}
        </div>
      </div>
      {items.length > 0 && (
        <div className="card-flat" style={{ padding: 12 }}>
          <div className="t-tiny" style={{ marginBottom: 6 }}>Draft koreksi ({items.length}):</div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
              <span>{describe(it)}</span>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => removeAt(i)}>hapus</button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="t-small" style={{ color: 'var(--danger)' }}>{err}</p>}
      <button type="button" className="btn btn-primary btn-block" disabled={pending || items.length === 0} onClick={submit}>
        {pending ? 'Mengirim…' : 'Kirim pengajuan'}
      </button>
    </div>
  );
}

function describe(it: KoreksiItemInput): string {
  if (it.jenis === 'set_mulai') return `Set mulai: ${it.tanggal}`;
  if (it.jenis === 'tambah') return `Tambah (${it.level}): ${it.tanggal}`;
  if (it.jenis === 'hapus') return `Hapus #${it.pertemuan_no} (${it.level})`;
  return `Ubah #${it.pertemuan_no} (${it.level}) → ${it.tanggal}`;
}

function SetMulai({ onAdd }: { onAdd: (it: KoreksiItemInput) => void }) {
  const [d, setD] = useState('');
  return (
    <div className="card-flat" style={{ padding: 12 }}>
      <div className="t-tiny" style={{ marginBottom: 4 }}>Set tanggal mulai kelas (observasi sebelum tanggal ini akan dihapus)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" disabled={!d} onClick={() => { onAdd({ jenis: 'set_mulai', tanggal: d }); setD(''); }}>+ set mulai</button>
      </div>
    </div>
  );
}

function TambahPertemuan({ onAdd }: { onAdd: (it: KoreksiItemInput) => void }) {
  const [lv, setLv] = useState('qoidah_nuroniyyah');
  const [d, setD] = useState('');
  return (
    <div className="card-flat" style={{ padding: 12 }}>
      <div className="t-tiny" style={{ marginBottom: 4 }}>Tambah pertemuan (yang terlewat)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={lv} onChange={(e) => setLv(e.target.value)} className="input">
          <option value="qoidah_nuroniyyah">Nuroniyyah</option>
          <option value="perbaikan_bacaan">Perbaikan</option>
        </select>
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" disabled={!d} onClick={() => { onAdd({ jenis: 'tambah', level: lv as KoreksiItemInput['level'], tanggal: d }); setD(''); }}>+ tambah</button>
      </div>
    </div>
  );
}

function SlotRow({ slot, onAdd }: { slot: Slot; onAdd: (it: KoreksiItemInput) => void }) {
  const [d, setD] = useState('');
  return (
    <div className="card" style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, flex: 1 }}>{slot.label}</span>
      <button type="button" className="btn btn-xs btn-ghost" onClick={() => onAdd({ jenis: 'hapus', level: slot.level as KoreksiItemInput['level'], pertemuan_no: slot.pertemuan_no })}>hapus</button>
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ width: 150 }} />
      <button type="button" className="btn btn-xs" disabled={!d} onClick={() => { onAdd({ jenis: 'ubah_tanggal', level: slot.level as KoreksiItemInput['level'], pertemuan_no: slot.pertemuan_no, tanggal: d }); setD(''); }}>ubah tgl</button>
    </div>
  );
}
```

- [ ] **Step 3: Page `koreksi`**

`src/app/hits/ketua/koreksi/page.tsx` — server: `requireKetuaKelas` → ambil WA via ketua_kelas_id → `findKetuaProgramKelas`? Tidak; ini HITS. Pakai `session.hits_halaqah_id` + dukungan multi-halaqah (Task referensi `/hits/ketua` switcher) via `?h=`. Load slot via `loadHalaqahPertemuan(selectedHalaqahId)` (sama pola `/hits/ketua/page.tsx`), bentuk `slots` `{level, pertemuan_no, tanggal, label}` (label: `Pertemuan {no} · {dayNameOf(tanggal)} {tanggal} · {HITS_LEVEL_SHORT[level]}`), render `<KoreksiPanel halaqahId={selectedHalaqahId} slots={slots} />`.

```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { HITS_LEVEL_SHORT } from '@/lib/hits-pertemuan';
import { dayNameOf } from '@/lib/maahir-presensi';
import { KoreksiPanel } from './KoreksiPanel';

export const dynamic = 'force-dynamic';

export default async function KoreksiPage({ searchParams }: { searchParams: { h?: string } }) {
  const session = await requireKetuaKelas();
  const halaqahId = searchParams.h && /^[0-9a-f-]{36}$/.test(searchParams.h) ? searchParams.h : session.hits_halaqah_id;
  if (!halaqahId) redirect('/hits/ketua');

  // Otorisasi: WA ketua login = ketua aktif halaqah ini.
  const { data: self } = await supabaseAdmin.from('ketua_kelas').select('whatsapp_number').eq('id', session.ketua_kelas_id).maybeSingle();
  if (self?.whatsapp_number) {
    const { data: ok } = await supabaseAdmin.from('ketua_kelas').select('id').eq('whatsapp_number', self.whatsapp_number).eq('active', true).eq('hits_halaqah_id', halaqahId).limit(1).maybeSingle();
    if (!ok) redirect('/hits/ketua');
  }

  const loaded = await loadHalaqahPertemuan(halaqahId);
  const slots = (loaded?.derived ?? []).map((d) => ({
    level: d.level as string, pertemuan_no: d.pertemuan_no, tanggal: d.tanggal,
    label: `Pertemuan ${d.pertemuan_no} · ${dayNameOf(d.tanggal)} ${d.tanggal}${d.level ? ' · ' + HITS_LEVEL_SHORT[d.level] : ''}`,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }} className="page">
        <div className="topbar">
          <div className="wordmark"><span className="mark">H</span> Koreksi Pertemuan</div>
          <Link href="/hits/ketua" className="back">← Dashboard</Link>
        </div>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>{loaded?.halaqah.name ?? ''}</p>
        <KoreksiPanel halaqahId={halaqahId} slots={slots} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Link entry di `/hits/ketua`**

`src/app/hits/ketua/page.tsx` — tambah tombol/link ke `/hits/ketua/koreksi?h=<selectedHalaqahId>` di dekat header (mis. di bawah switcher), teks "Ajukan koreksi pertemuan".

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (Expected EXIT 0)
```bash
git add src/app/hits/ketua/koreksi src/app/hits/ketua/page.tsx
git commit -m "feat(hits): ketua ajukan koreksi pertemuan (multi-item)"
```

---

## Task 6: Keputusan koordinator (per-item)

**Files:**
- Create: `src/app/hits/koordinator/koreksi/[token]/actions.ts`
- Create: `src/app/hits/koordinator/koreksi/[token]/DecideKoreksiPanel.tsx`
- Create: `src/app/hits/koordinator/koreksi/[token]/page.tsx`

- [ ] **Step 1: Server actions**

`actions.ts` — `decideKoreksi(token, decisions)` di mana `decisions: { itemId: string; approve: boolean }[]`:
```ts
'use server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { applyKoreksiItem } from '@/lib/hits-koreksi';
import { logAudit } from '@/lib/audit';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplKoreksiPertemuanInfo } from '@/lib/whatsapp';

export type DecideKoreksiResult = { ok?: boolean; error?: string; ketuaWaUrl?: string };

export async function decideKoreksi(token: string, decisions: { itemId: string; approve: boolean }[]): Promise<DecideKoreksiResult> {
  const koor = await requireKoordinatorKetuaKelas();
  const { data: header } = await supabaseAdmin
    .from('hits_pertemuan_koreksi')
    .select('id, halaqah_id, requested_by_name, requested_by_wa, status, hits_halaqah:halaqah_id(name, gender)')
    .eq('token', token).maybeSingle();
  if (!header) return { error: 'Pengajuan tidak ditemukan.' };
  if (header.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };
  const h = header.hits_halaqah as unknown as { name: string; gender: string | null } | null;
  if (h?.gender && h.gender !== koor.gender) return { error: 'Bukan gender Anda.' };

  const { data: items } = await supabaseAdmin
    .from('hits_pertemuan_koreksi_item')
    .select('id, jenis, level, pertemuan_no, tanggal, status')
    .eq('koreksi_id', header.id);

  const byId = new Map((items ?? []).map((it) => [it.id, it]));
  let disetujui = 0, ditolak = 0;
  for (const d of decisions) {
    const it = byId.get(d.itemId);
    if (!it || it.status !== 'pending') continue;
    if (d.approve) {
      await applyKoreksiItem(header.halaqah_id, { jenis: it.jenis, level: it.level, pertemuan_no: it.pertemuan_no, tanggal: it.tanggal }, { role: 'koordinator_ketua_kelas', id: koor.koordinator_kk_id });
      await supabaseAdmin.from('hits_pertemuan_koreksi_item').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', it.id);
      disetujui++;
    } else {
      await supabaseAdmin.from('hits_pertemuan_koreksi_item').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', it.id);
      ditolak++;
    }
  }

  await supabaseAdmin.from('hits_pertemuan_koreksi').update({ status: 'selesai', decided_by_role: 'koordinator_ketua_kelas', decided_by_id: koor.koordinator_kk_id, decided_at: new Date().toISOString() }).eq('id', header.id);
  await logAudit({ actor: koor, action: 'hits.koreksi.decide', targetTable: 'hits_pertemuan_koreksi', targetId: header.id, detail: { disetujui, ditolak } });

  let ketuaWaUrl: string | undefined;
  if (header.requested_by_wa) {
    ketuaWaUrl = buildWaMeUrl(header.requested_by_wa, tplKoreksiPertemuanInfo({ ketuaName: header.requested_by_name, halaqahName: h?.name ?? 'halaqah', disetujui, ditolak }));
  }
  return { ok: true, ketuaWaUrl };
}
```

- [ ] **Step 2: Client `DecideKoreksiPanel`**

Terima `token` + `items: {id, jenis, level, pertemuan_no, tanggal, catatan}[]`. State map approve per item (default true). Tombol "Simpan keputusan" → `decideKoreksi(token, decisions)`; bila `ketuaWaUrl` tampilkan tombol "Beri tahu ketua via WA". (Pola seperti `DecideDualRolePanel.tsx`.)

- [ ] **Step 3: Page**

`page.tsx` — `requireKoordinatorKetuaKelas`, load header+items by token, tampilkan detail tiap item (jenis, level, pertemuan_no, tanggal, catatan), render panel bila status pending (else "sudah diputuskan").

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` (Expected EXIT 0)
```bash
git add src/app/hits/koordinator/koreksi
git commit -m "feat(hits): koordinator putuskan koreksi pertemuan per-item"
```

---

## Task 7: Retire entry hapus lama

**Files:**
- Modify: `src/app/hits/ketua/HitsKetuaForm.tsx` (atau tempat tombol "ajukan hapus" muncul)

- [ ] **Step 1: Arahkan ke koreksi**

Cari tombol/aksi "ajukan hapus pertemuan" di UI ketua (HitsKetuaForm `hapusSlot`). Ganti agar mengarah ke `/hits/ketua/koreksi?h=<halaqahId>` (alur baru mencakup hapus). Biarkan route `/hits/hapus-pertemuan/[token]` + tabel lama untuk riwayat pengajuan yang sudah ada.

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (Expected EXIT 0)
```bash
git add src/app/hits/ketua/HitsKetuaForm.tsx
git commit -m "refactor(hits): entry hapus pertemuan diarahkan ke alur koreksi"
```

---

## Task 8: Verifikasi end-to-end + deploy

- [ ] **Step 1: Typecheck penuh**

Run: `npx tsc --noEmit` → Expected `EXIT 0`.

- [ ] **Step 2: Uji data via MCP (set_mulai)**

Pilih satu halaqah late-start (mis. batch Juni). Set `start_date` via koreksi (atau manual SQL utk uji): cek derivasi `loadHalaqahPertemuan` membuang pertemuan < start_date (bandingkan jumlah pertemuan sebelum/sesudah).

- [ ] **Step 3: Uji alur manual**

Setelah deploy: login ketua → `/hits/ketua/koreksi` → buat 1 pengajuan berisi set_mulai + tambah + hapus + ubah → kirim WA. Login koordinator KK → buka link → approve sebagian → cek:
- `hits_halaqah.start_date` ter-update,
- `hits_kaldik_pertemuan` baris is_skipped/tanggal/baru terbentuk (`SELECT * FROM hits_kaldik_pertemuan WHERE halaqah_id=...`),
- keterangan sesi terbuang terhapus,
- dashboard koordinator & detail halaqah menyesuaikan.

- [ ] **Step 4: Push deploy**

```bash
git push origin HEAD:main
git push maheer HEAD:main
```
Tunggu Azure build.

---

## Self-Review

- **Coverage spec:** start_date (Task 1,2) ✓; data model (Task 1) ✓; ketua submit multi-item (Task 5) ✓; koordinator per-item (Task 6) ✓; apply set_mulai/tambah/hapus/ubah + hapus keterangan orphan (Task 3) ✓; retire hapus lama (Task 7) ✓; otorisasi (Task 5 ketua, Task 6 koordinator gender) ✓; template WA (Task 4) ✓.
- **Penomoran tambah:** sesuai keputusan = `max(pertemuan_no derived+override per tahap)+1` (Task 3), bukan blok khusus.
- **Type consistency:** `KoreksiItemInput`/`KoreksiJenis` dipakai konsisten Task 3/5/6. `applyKoreksiItem(halaqahId, item, actor)` signature sama di Task 3 & dipanggil Task 6.
