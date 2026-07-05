# HITS F3 — Tabayyun Lifecycle & Ghosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pengajar yang diingatkan tapi tak merespons tabayyun dalam 72 jam otomatis dianggap ghosting (tanpa udzur syar'i) → teguran + notifikasi WA bertanggal, tanpa cron.

**Architecture:** Compute-on-action (koordinator-driven, bukan cron). Kolom baru `reminder_sent_at` menandai jam mulai; `deadline_at = reminder_sent_at + 72h`. State tabayyun diturunkan fungsi murni `tabayyunGhostingState`. Aksi `escalateTabayyunGhosting` set `status='decided'`+`is_udzur_syari=false`+teguran (jalur teguran di-refactor jadi helper bersama dengan `decideTabayyun`). Tombol koordinator berubah label per-state.

**Tech Stack:** Next.js (App Router, server actions), Supabase (`supabaseAdmin`), TypeScript, tsx untuk uji fungsi murni (repo tanpa framework test). Spec: `docs/superpowers/specs/2026-07-06-hits-f3-tabayyun-lifecycle-design.md`.

---

## File Structure

- **Create** `supabase/migrations/0038_hits_tabayyun_reminder_sent.sql` — kolom `reminder_sent_at`.
- **Create** `src/lib/hits-tabayyun.ts` — fungsi murni: `tabayyunGhostingState`, `tabayyunHoursLeft`, `deadlineFromReminder`, konstanta `TABAYYUN_DEADLINE_HOURS`, tipe `TabayyunGhostingState`.
- **Create** `scripts/test-tabayyun.ts` — uji tsx fungsi murni.
- **Modify** `src/types/db.ts` — tambah `reminder_sent_at` ke `HitsTabayyun`.
- **Modify** `src/app/observasi/koordinator/actions.ts` — refactor helper teguran, ubah `reminderTabayyunPengajar`, aksi baru `escalateTabayyunGhosting`.
- **Modify** `src/lib/whatsapp.ts` — template `tplTabayyunGhostingTeguran`.
- **Modify** `src/app/observasi/koordinator/page.tsx` — sertakan `reminder_sent_at` di query + prop.
- **Modify** `src/app/observasi/koordinator/TabayyunCard.tsx` — tombol state-driven + handler eskalasi.
- **Modify** `package.json` — script `test-tabayyun`.

---

## Task 1: Migration kolom `reminder_sent_at`

**Files:**
- Create: `supabase/migrations/0038_hits_tabayyun_reminder_sent.sql`
- Modify: `src/types/db.ts` (interface `HitsTabayyun`, sekitar baris 406-421)

- [ ] **Step 1: Tulis migration**

Create `supabase/migrations/0038_hits_tabayyun_reminder_sent.sql`:

```sql
-- F3: jam mulai countdown 72h tabayyun. Null = koordinator belum kirim reminder
-- (observasi tersimpan, jam belum jalan). deadline_at di-set = reminder_sent_at + 72h
-- oleh server action saat reminder pertama.
alter table hits_tabayyun add column if not exists reminder_sent_at timestamptz;
```

- [ ] **Step 2: Tambah field ke tipe**

Di `src/types/db.ts`, interface `HitsTabayyun`, tambah setelah `deadline_at: string;`:

```typescript
  reminder_sent_at: string | null;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0038_hits_tabayyun_reminder_sent.sql src/types/db.ts
git commit -m "feat(hits-f3): migration reminder_sent_at + tipe HitsTabayyun"
```

> **Catatan operasional:** migration WAJIB di-apply ke prod (`yvjbqrrczwvlsaqbjwrq`) sebelum deploy action Task 6/7. JANGAN apply otomatis tanpa izin user (pola F1/F2). `if not exists` bikin idempoten.

---

## Task 2: Fungsi murni state tabayyun + uji TDD

**Files:**
- Create: `src/lib/hits-tabayyun.ts`
- Create: `scripts/test-tabayyun.ts`
- Modify: `package.json` (blok `scripts`)

- [ ] **Step 1: Tambah script test ke package.json**

Di `package.json`, blok `"scripts"`, tambah setelah baris `"test-hutang": ...`:

```json
    "test-tabayyun": "tsx --env-file=.env.local scripts/test-tabayyun.ts",
```

- [ ] **Step 2: Tulis test yang gagal dulu**

Create `scripts/test-tabayyun.ts`:

```typescript
// Uji fungsi murni state tabayyun. Jalankan: npm run test-tabayyun
import {
  tabayyunGhostingState,
  tabayyunHoursLeft,
  deadlineFromReminder,
  TABAYYUN_DEADLINE_HOURS,
} from '@/lib/hits-tabayyun';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

const NOW = '2026-07-06T12:00:00.000Z';
const T = (over: Partial<{ status: string; reminder_sent_at: string | null; deadline_at: string | null }>) =>
  ({ status: 'pending', reminder_sent_at: null, deadline_at: null, ...over });

// --- tabayyunGhostingState ---
eq(tabayyunGhostingState(T({}), NOW), 'not_reminded', 'pending + belum reminder -> not_reminded');
eq(tabayyunGhostingState(T({ reminder_sent_at: '2026-07-06T10:00:00.000Z', deadline_at: '2026-07-09T10:00:00.000Z' }), NOW),
   'awaiting_within', 'diingatkan, now < deadline -> awaiting_within');
eq(tabayyunGhostingState(T({ reminder_sent_at: '2026-07-03T10:00:00.000Z', deadline_at: '2026-07-06T10:00:00.000Z' }), NOW),
   'ghosting', 'diingatkan, now > deadline -> ghosting');
eq(tabayyunGhostingState(T({ reminder_sent_at: '2026-07-03T12:00:00.000Z', deadline_at: '2026-07-06T12:00:00.000Z' }), NOW),
   'ghosting', 'now == deadline -> ghosting (>=)');
eq(tabayyunGhostingState(T({ status: 'awaiting_reason', reminder_sent_at: '2026-07-01T00:00:00.000Z', deadline_at: '2026-07-04T00:00:00.000Z' }), NOW),
   'has_reason', 'alasan masuk walau lewat deadline -> has_reason (BUKAN ghosting)');
eq(tabayyunGhostingState(T({ status: 'decided' }), NOW), 'decided', 'decided -> decided');

// --- tabayyunHoursLeft ---
eq(tabayyunHoursLeft(T({}), NOW), null, 'belum reminder -> hoursLeft null');
eq(tabayyunHoursLeft(T({ reminder_sent_at: '2026-07-06T00:00:00.000Z', deadline_at: '2026-07-06T18:00:00.000Z' }), NOW),
   6, 'deadline 6 jam lagi -> 6');
eq(tabayyunHoursLeft(T({ reminder_sent_at: '2026-07-03T00:00:00.000Z', deadline_at: '2026-07-06T06:00:00.000Z' }), NOW),
   -6, 'lewat 6 jam -> -6');

// --- deadlineFromReminder ---
eq(deadlineFromReminder('2026-07-06T12:00:00.000Z'), '2026-07-09T12:00:00.000Z', 'reminder + 72h');
eq(TABAYYUN_DEADLINE_HOURS, 72, 'konstanta 72 jam');

if (failed > 0) { console.error(`\n${failed} test GAGAL`); process.exit(1); }
console.log('\nSemua test tabayyun lulus.');
```

- [ ] **Step 3: Jalankan test — verifikasi GAGAL**

Run: `npm run test-tabayyun`
Expected: FAIL — modul `@/lib/hits-tabayyun` belum ada (error resolusi import).

- [ ] **Step 4: Tulis implementasi minimal**

Create `src/lib/hits-tabayyun.ts`:

```typescript
// Fungsi MURNI lifecycle tabayyun F3. Tanpa I/O — dipakai server action (guard)
// & UI (label tombol/badge). Diuji: npm run test-tabayyun.

export const TABAYYUN_DEADLINE_HOURS = 72;
const MS_PER_HOUR = 3_600_000;

export type TabayyunGhostingState =
  | 'not_reminded'    // pending, koordinator belum kirim reminder → jam belum jalan
  | 'awaiting_within' // pending, sudah diingatkan, now < deadline
  | 'ghosting'        // pending, sudah diingatkan, now >= deadline (tak respons 72h)
  | 'has_reason'      // pengajar sudah submit alasan (status awaiting_reason)
  | 'decided';        // sudah diputus koordinator

export interface TabayyunStateInput {
  status: string;
  reminder_sent_at: string | null;
  deadline_at: string | null;
}

export function tabayyunGhostingState(t: TabayyunStateInput, nowIso: string): TabayyunGhostingState {
  if (t.status === 'decided') return 'decided';
  if (t.status === 'awaiting_reason') return 'has_reason';
  // status 'pending' (belum ada alasan)
  if (!t.reminder_sent_at) return 'not_reminded';
  if (!t.deadline_at) return 'awaiting_within';
  const now = new Date(nowIso).getTime();
  const deadline = new Date(t.deadline_at).getTime();
  return now >= deadline ? 'ghosting' : 'awaiting_within';
}

/** Sisa jam menuju deadline (negatif = sudah lewat). Null bila belum diingatkan. */
export function tabayyunHoursLeft(t: TabayyunStateInput, nowIso: string): number | null {
  if (!t.reminder_sent_at || !t.deadline_at) return null;
  return (new Date(t.deadline_at).getTime() - new Date(nowIso).getTime()) / MS_PER_HOUR;
}

/** Deadline ISO = reminder_sent_at + 72 jam (kalibrasi jam, bukan hari kalender). */
export function deadlineFromReminder(reminderIso: string): string {
  return new Date(new Date(reminderIso).getTime() + TABAYYUN_DEADLINE_HOURS * MS_PER_HOUR).toISOString();
}
```

- [ ] **Step 5: Jalankan test — verifikasi LULUS**

Run: `npm run test-tabayyun`
Expected: PASS — "Semua test tabayyun lulus."

- [ ] **Step 6: Commit**

```bash
git add src/lib/hits-tabayyun.ts scripts/test-tabayyun.ts package.json
git commit -m "feat(hits-f3): fungsi murni state tabayyun (ghosting 72h) + uji tsx"
```

---

## Task 3: Refactor jalur teguran jadi helper bersama

Cabut blok insert teguran dari `decideTabayyun` jadi helper non-export `issueTeguranForTabayyun`, dipakai ulang oleh `escalateTabayyunGhosting` (Task 7). Perilaku `decideTabayyun` HARUS identik.

**Files:**
- Modify: `src/app/observasi/koordinator/actions.ts` (fungsi `decideTabayyun`, baris ~52-136)

- [ ] **Step 1: Tambah helper di atas `decideTabayyun`**

Di `src/app/observasi/koordinator/actions.ts`, tepat sebelum `export async function decideTabayyun`, sisipkan:

```typescript
/** Shape minimal tabayyun untuk terbitkan teguran. */
type TegTab = {
  id: string;
  kondisi: string;
  pengajar_id: string | null;
  halaqah?: { pengajar_id: string | null } | null;
  keterangan?: { tanggal: string } | null;
};

/**
 * Terbitkan teguran non-udzur untuk sebuah tabayyun (idempoten per tabayyun).
 * Dipakai decideTabayyun (keputusan manual) & escalateTabayyunGhosting (auto 72h).
 * Kategori: KMT→kedisiplinan_waktu, JKG/BADAL→komitmen_jadwal, lain→tanggung_jawab.
 */
async function issueTeguranForTabayyun(
  tab: TegTab,
  opts: { catatan: string | null; actorId: string; actorRole: string }
): Promise<void> {
  const pengajarId = tab.pengajar_id ?? tab.halaqah?.pengajar_id ?? null;
  if (!pengajarId) return;
  const ym = (tab.keterangan?.tanggal ?? jakartaToday()).slice(0, 7);
  const category =
    tab.kondisi === 'KMT'
      ? 'kedisiplinan_waktu'
      : tab.kondisi === 'JKG' || tab.kondisi === 'BADAL'
        ? 'komitmen_jadwal'
        : 'tanggung_jawab';
  // Idempotent: jangan gandakan teguran utk tabayyun yang sama.
  const { data: existing } = await supabaseAdmin
    .from('hits_teguran')
    .select('id')
    .eq('source_ref_type', 'hits_tabayyun')
    .eq('source_ref_id', tab.id)
    .maybeSingle();
  if (existing) return;
  const { count } = await supabaseAdmin
    .from('hits_teguran')
    .select('id', { count: 'exact', head: true })
    .eq('pengajar_id', pengajarId)
    .eq('year_month', ym)
    .eq('category', category);
  await supabaseAdmin.from('hits_teguran').insert({
    pengajar_id: pengajarId,
    year_month: ym,
    category,
    nomor_teguran: (count ?? 0) + 1,
    source_ref_type: 'hits_tabayyun',
    source_ref_id: tab.id,
    keterangan: opts.catatan || `Tabayyun ${tab.kondisi} tidak diterima sebagai udzur syar'i`,
    issued_by_role: opts.actorRole,
    issued_by_id: opts.actorId,
  });
}
```

- [ ] **Step 2: Ganti blok inline di `decideTabayyun` dengan pemanggilan helper**

Di `decideTabayyun`, ganti seluruh blok `if (!isUdzur && tab) { ... }` (baris ~86-125, dari komentar "Bukan udzur syar'i → terbitkan teguran" sampai `}` penutup blok itu) dengan:

```typescript
  // Bukan udzur syar'i → terbitkan teguran (feed komitmen_jadwal matrix + risk).
  if (!isUdzur && tab) {
    await issueTeguranForTabayyun(tab as TegTab, {
      catatan: catatan || null,
      actorId: session.koordinator_kk_id,
      actorRole: 'koordinator_ketua_kelas',
    });
  }
```

(Select di `decideTabayyun` sudah mengambil `id, kondisi, pengajar_id, halaqah:halaqah_id(pengajar_id), keterangan:keterangan_id(tanggal)` — cocok dengan `TegTab`. Jangan ubah select.)

- [ ] **Step 3: Verifikasi kompilasi**

Run: `npx tsc --noEmit`
Expected: tak ada error baru di `actions.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/observasi/koordinator/actions.ts
git commit -m "refactor(hits-f3): cabut issueTeguranForTabayyun jadi helper bersama"
```

---

## Task 4: Template WA teguran ghosting

**Files:**
- Modify: `src/lib/whatsapp.ts` (tambah fungsi, mis. setelah `tplTabayyunToPengajar`)

- [ ] **Step 1: Tambah template**

Di `src/lib/whatsapp.ts`, setelah fungsi `tplTabayyunToPengajar`, tambahkan:

```typescript
/**
 * Teguran ghosting: pengajar tak merespons tabayyun dalam 72 jam sejak diingatkan
 * → dianggap tanpa udzur syar'i. `diingatkanWib`/`deadlineWib` = string waktu WIB
 * yang sudah diformat oleh pemanggil.
 */
export function tplTabayyunGhostingTeguran(args: {
  pengajarName: string;
  pengajarGender: Gender;
  tanggalObservasi: string;
  diingatkanWib: string;
  deadlineWib: string;
  nomorTeguran: number;
  pelanggaran: string[];
  hutangSaldo?: number;
}): string {
  const sapaan = salutation(args.pengajarGender);
  const daftar = args.pelanggaran.length
    ? args.pelanggaran.map((p) => `• ${p}`)
    : ['• (rincian tidak tersedia)'];
  const hutangLines =
    args.hutangSaldo && args.hutangSaldo > 0
      ? ['', `Tercatat pula *sisa hutang menit ${args.hutangSaldo} menit* yang perlu diganti.`]
      : [];
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Terkait observasi kelas tanggal *${args.tanggalObservasi}*:`,
    ...daftar,
    ``,
    `Permintaan klarifikasi telah dikirim pada *${args.diingatkanWib}* dengan tenggat *${args.deadlineWib}* (72 jam). Hingga tenggat terlewati belum ada respons.`,
    ``,
    `Karena itu dicatat sebagai *tanpa udzur syar'i* dan diterbitkan *teguran ke-${args.nomorTeguran}*.`,
    ...hutangLines,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}
```

- [ ] **Step 2: Verifikasi kompilasi**

Run: `npx tsc --noEmit`
Expected: tak ada error baru.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp.ts
git commit -m "feat(hits-f3): template WA teguran ghosting bertanggal WIB"
```

---

## Task 5: Ubah `reminderTabayyunPengajar` — set jam & guard

Reminder pertama meng-set `reminder_sent_at` + `deadline_at`. Reminder ulang dalam window TAK reset jam. Bila sudah ghosting, tolak (UI arahkan ke tombol teguran).

**Files:**
- Modify: `src/app/observasi/koordinator/actions.ts` (fungsi `reminderTabayyunPengajar`, baris ~177-233)

- [ ] **Step 1: Tambah import fungsi murni**

Di blok import atas `actions.ts`, tambah baris:

```typescript
import { tabayyunGhostingState, deadlineFromReminder } from '@/lib/hits-tabayyun';
```

- [ ] **Step 2: Ubah select tab agar ambil field state**

Di `reminderTabayyunPengajar`, pada query `tab`, ganti select menjadi (tambah `status, reminder_sent_at, deadline_at`):

```typescript
    .select('id, keterangan_id, pengajar_id, halaqah_id, status, reminder_sent_at, deadline_at, halaqah:halaqah_id(name), keterangan:keterangan_id(tanggal)')
```

- [ ] **Step 3: Sisipkan logika state setelah `if (!tab) return ...`**

Tepat setelah baris `if (!tab) return { error: 'Tabayyun tidak ditemukan.' };`, sisipkan:

```typescript
  const nowIso = new Date().toISOString();
  const state = tabayyunGhostingState(
    { status: tab.status as string, reminder_sent_at: tab.reminder_sent_at as string | null, deadline_at: tab.deadline_at as string | null },
    nowIso
  );
  if (state === 'ghosting') {
    return { error: 'Sudah lewat 72 jam tanpa respons — gunakan tombol "Teguran ghosting".' };
  }
  // Reminder pertama → mulai jam 72h. Reminder ulang dalam window → jam TAK di-reset.
  if (!tab.reminder_sent_at) {
    await supabaseAdmin
      .from('hits_tabayyun')
      .update({ reminder_sent_at: nowIso, deadline_at: deadlineFromReminder(nowIso) })
      .eq('id', tab.id);
  }
```

(Sisa fungsi — bangun `msg` via `tplTabayyunToPengajar`, `buildWaMeUrl`, `logWaReminder`, `return { waUrl }` — tetap.)

- [ ] **Step 4: Verifikasi kompilasi**

Run: `npx tsc --noEmit`
Expected: tak ada error baru.

- [ ] **Step 5: Commit**

```bash
git add src/app/observasi/koordinator/actions.ts
git commit -m "feat(hits-f3): reminderTabayyun set jam 72h (resend tak reset, guard ghosting)"
```

---

## Task 6: Aksi `escalateTabayyunGhosting`

**Files:**
- Modify: `src/app/observasi/koordinator/actions.ts` (tambah export setelah `reminderTabayyunPengajar`)
- Modify: import whatsapp di `actions.ts`

- [ ] **Step 1: Tambah import template**

Di `actions.ts`, blok import dari `@/lib/whatsapp` (baris ~5-10), tambahkan `tplTabayyunGhostingTeguran` ke daftar named import.

- [ ] **Step 2: Tambah aksi**

Setelah fungsi `reminderTabayyunPengajar`, tambahkan:

```typescript
/**
 * Eskalasi ghosting: pengajar tak respons 72h sejak reminder → non-udzur otomatis
 * + teguran + WA bertanggal. Guard: hanya bila state 'ghosting'.
 */
export async function escalateTabayyunGhosting(
  tabayyunId: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select(
      'id, kondisi, keterangan_id, pengajar_id, halaqah_id, status, reminder_sent_at, deadline_at, ' +
        'halaqah:halaqah_id(name, pengajar_id), keterangan:keterangan_id(tanggal)'
    )
    .eq('id', tabayyunId)
    .maybeSingle();
  if (!tab) return { error: 'Tabayyun tidak ditemukan.' };

  const nowIso = new Date().toISOString();
  const state = tabayyunGhostingState(
    { status: tab.status as string, reminder_sent_at: tab.reminder_sent_at as string | null, deadline_at: tab.deadline_at as string | null },
    nowIso
  );
  if (state !== 'ghosting') {
    return { error: 'Tabayyun ini belum memenuhi syarat ghosting (72 jam tanpa respons).' };
  }

  const hal = tab.halaqah as unknown as { name: string; pengajar_id: string | null } | null;
  const ket = tab.keterangan as unknown as { tanggal: string } | null;

  const fmtWib = (iso: string) =>
    new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  const catatan = `Ghosting: tak respons 72 jam sejak diingatkan ${fmtWib(tab.reminder_sent_at as string)}`;

  // Putuskan non-udzur.
  const { error: updErr } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      is_udzur_syari: false,
      keputusan_catatan: catatan,
      decided_at: nowIso,
      status: 'decided',
      koordinator_kk_id: session.koordinator_kk_id,
    })
    .eq('id', tab.id);
  if (updErr) return { error: `Gagal simpan: ${updErr.message}` };

  // Teguran (idempoten).
  await issueTeguranForTabayyun(
    { id: tab.id as string, kondisi: tab.kondisi as string, pengajar_id: tab.pengajar_id as string | null, halaqah: hal, keterangan: ket },
    { catatan, actorId: session.koordinator_kk_id, actorRole: 'koordinator_ketua_kelas' }
  );

  // Nomor teguran untuk template WA (baca ulang teguran tabayyun ini).
  const { data: teg } = await supabaseAdmin
    .from('hits_teguran')
    .select('nomor_teguran')
    .eq('source_ref_type', 'hits_tabayyun')
    .eq('source_ref_id', tab.id)
    .maybeSingle();

  // WA teguran ghosting.
  let waUrl: string | undefined;
  if (tab.pengajar_id) {
    const { data: pengajar } = await supabaseAdmin
      .from('pengajar')
      .select('name, whatsapp_number, gender')
      .eq('id', tab.pengajar_id)
      .maybeSingle();
    if (pengajar?.whatsapp_number) {
      const { data: pelRows } = await supabaseAdmin
        .from('hits_pelanggaran')
        .select('jenis, menit, jkg_opsi, cicil_n, badal_nama, badal_mulai')
        .eq('keterangan_id', tab.keterangan_id as string);
      const pelanggaran = (pelRows ?? []).map(describePelanggaran);
      const hutang = tab.halaqah_id
        ? await computeHutangForHalaqah(tab.halaqah_id as string)
        : { saldo: 0 };
      const msg = tplTabayyunGhostingTeguran({
        pengajarName: pengajar.name,
        pengajarGender: pengajar.gender,
        tanggalObservasi: ket?.tanggal ?? '',
        diingatkanWib: fmtWib(tab.reminder_sent_at as string),
        deadlineWib: fmtWib(tab.deadline_at as string),
        nomorTeguran: teg?.nomor_teguran ?? 1,
        pelanggaran,
        hutangSaldo: hutang.saldo,
      });
      waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);
      await logWaReminder({
        sender: session,
        recipientTable: 'pengajar',
        recipientId: tab.pengajar_id as string,
        recipientWa: pengajar.whatsapp_number,
        templateKind: 'tabayyun_ghosting',
        targetTable: 'hits_keterangan_harian',
      });
    }
  }

  await logAudit({
    actor: session,
    action: 'hits.tabayyun.ghosting',
    targetTable: 'hits_tabayyun',
    targetId: tab.id as string,
    detail: { reminder_sent_at: tab.reminder_sent_at, deadline_at: tab.deadline_at },
  });

  return { waUrl };
}
```

- [ ] **Step 3: Verifikasi kompilasi**

Run: `npx tsc --noEmit`
Expected: tak ada error. (`describePelanggaran`, `computeHutangForHalaqah`, `buildWaMeUrl`, `logWaReminder`, `logAudit` sudah diimport di file ini — dipakai `reminderTabayyunPengajar`.)

- [ ] **Step 4: Commit**

```bash
git add src/app/observasi/koordinator/actions.ts
git commit -m "feat(hits-f3): aksi escalateTabayyunGhosting (non-udzur + teguran + WA)"
```

---

## Task 7: UI — tombol state-driven di TabayyunCard

**Files:**
- Modify: `src/app/observasi/koordinator/page.tsx` (query + TabRow + map, baris ~76-107)
- Modify: `src/app/observasi/koordinator/TabayyunCard.tsx`

- [ ] **Step 1: Sertakan `reminder_sent_at` di query & prop (page.tsx)**

Di `src/app/observasi/koordinator/page.tsx`:

(a) Query select (baris ~76) — tambah `reminder_sent_at`:

```typescript
      `id, kondisi, status, alasan_pengajar, deadline_at, reminder_sent_at, pengajar_id,
       pengajar:pengajar_id(name),
       halaqah:halaqah_id(name, gender),
       keterangan:keterangan_id(tanggal)`
```

(b) Tipe `TabRow` — tambah field setelah `deadline_at: string;`:

```typescript
    reminder_sent_at: string | null;
```

(c) `.map((t) => ({ ... }))` — tambah setelah `deadline_at: t.deadline_at,`:

```typescript
      reminder_sent_at: t.reminder_sent_at,
```

- [ ] **Step 2: Perbarui Props + logika TabayyunCard**

Ganti isi `src/app/observasi/koordinator/TabayyunCard.tsx` dengan:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { decideTabayyun, reminderTabayyunPengajar, escalateTabayyunGhosting } from './actions';
import { hitsHeadlineLabel } from '@/types/db';
import { tabayyunGhostingState, tabayyunHoursLeft } from '@/lib/hits-tabayyun';

interface Props {
  tabayyun: {
    id: string;
    pengajar_id: string;
    pengajar_name: string;
    kelas_name: string;
    tanggal: string;
    kondisi: string;
    alasan_pengajar: string | null;
    status: string;
    deadline_at: string;
    reminder_sent_at: string | null;
  };
}

export function TabayyunCard({ tabayyun: t }: Props) {
  const [decided, setDecided] = useState(t.status === 'decided');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reminderPending, startReminderTransition] = useTransition();

  if (decided) {
    return (
      <div className="card-flat" style={{ padding: '12px 16px', marginBottom: 8, opacity: 0.6 }}>
        <div className="t-small" style={{ fontWeight: 600 }}>
          {t.pengajar_name} — {t.kelas_name}
        </div>
        <div className="t-small" style={{ color: 'var(--muted-2)' }}>
          {t.tanggal} &bull; {t.kondisi} &bull; Sudah diputuskan
        </div>
      </div>
    );
  }

  const nowIso = new Date().toISOString();
  const state = tabayyunGhostingState(
    { status: t.status, reminder_sent_at: t.reminder_sent_at, deadline_at: t.deadline_at },
    nowIso
  );
  const hoursLeft = tabayyunHoursLeft(
    { status: t.status, reminder_sent_at: t.reminder_sent_at, deadline_at: t.deadline_at },
    nowIso
  );

  function handleDecide(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await decideTabayyun(undefined, fd);
      if (result?.error) { setError(result.error); return; }
      if (result?.ok) setDecided(true);
    });
  }

  function handleReminder() {
    setError(null);
    startReminderTransition(async () => {
      const result = await reminderTabayyunPengajar(t.id);
      if (result.error) { setError(result.error); return; }
      if (result.waUrl) window.open(result.waUrl, '_blank');
    });
  }

  function handleEscalate() {
    setError(null);
    startReminderTransition(async () => {
      const result = await escalateTabayyunGhosting(t.id);
      if (result.error) { setError(result.error); return; }
      if (result.waUrl) window.open(result.waUrl, '_blank');
      setDecided(true);
    });
  }

  return (
    <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 8 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.pengajar_name}</div>
          {state === 'ghosting' ? (
            <button
              onClick={handleEscalate}
              disabled={reminderPending}
              className="act-btn"
              style={{ fontSize: 11, flexShrink: 0, background: 'var(--merah-ink)', color: '#fff' }}
            >
              {reminderPending ? '...' : 'Teguran Ghosting'}
            </button>
          ) : (state === 'not_reminded' || state === 'awaiting_within') ? (
            <button
              onClick={handleReminder}
              disabled={reminderPending}
              className="act-btn wa"
              style={{ fontSize: 11, flexShrink: 0 }}
            >
              {reminderPending ? '...' : state === 'not_reminded' ? 'Reminder Tabayyun' : 'Ingatkan Lagi'}
            </button>
          ) : null}
        </div>
        <div className="t-small" style={{ color: 'var(--muted-2)' }}>
          {t.kelas_name} &bull; {t.tanggal} &bull;{' '}
          <span style={{ color: 'var(--kuning-ink)', fontWeight: 600 }}>
            {t.kondisi} — {hitsHeadlineLabel(t.kondisi)}
          </span>
        </div>
        {t.alasan_pengajar && (
          <div className="t-small" style={{ marginTop: 6, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
            <strong>Alasan pengajar:</strong> {t.alasan_pengajar}
          </div>
        )}
        {!t.alasan_pengajar && t.status === 'pending' && (
          <div className="t-small" style={{ marginTop: 6, color: 'var(--muted)' }}>
            Pengajar belum memberikan alasan.
          </div>
        )}
        {state === 'not_reminded' && (
          <div className="t-small" style={{ marginTop: 4, color: 'var(--muted-2)' }}>
            Jam 72 jam mulai setelah reminder dikirim.
          </div>
        )}
        {state === 'awaiting_within' && hoursLeft != null && (
          <div className="t-small" style={{ marginTop: 4, color: 'var(--muted-2)' }}>
            Deadline: {new Date(t.deadline_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} &bull; sisa ~{Math.max(0, Math.floor(hoursLeft))} jam
          </div>
        )}
        {state === 'ghosting' && hoursLeft != null && (
          <div className="t-small" style={{ marginTop: 4, color: 'var(--merah-ink)', fontWeight: 700 }}>
            ⚠ GHOSTING — tenggat lewat ~{Math.abs(Math.floor(hoursLeft))} jam. Terbitkan teguran.
          </div>
        )}
      </div>

      <form action={handleDecide}>
        <input type="hidden" name="tabayyun_id" value={t.id} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="is_udzur_syari" value="true" required />
            <span className="t-small" style={{ fontWeight: 500 }}>Udzur syar&apos;i (diterima)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="is_udzur_syari" value="false" />
            <span className="t-small" style={{ fontWeight: 500 }}>Tidak diterima</span>
          </label>
        </div>

        <input
          name="keputusan_catatan"
          className="input"
          placeholder="Catatan keputusan (opsional)"
          style={{ height: 36, fontSize: 13, marginBottom: 8 }}
        />

        {error && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 4 }}>{error}</p>}

        <button type="submit" className="btn btn-sm" disabled={pending} style={{ width: '100%' }}>
          {pending ? 'Menyimpan...' : 'Putuskan'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verifikasi kompilasi**

Run: `npx tsc --noEmit`
Expected: tak ada error.

- [ ] **Step 4: Commit**

```bash
git add src/app/observasi/koordinator/page.tsx src/app/observasi/koordinator/TabayyunCard.tsx
git commit -m "feat(hits-f3): tombol tabayyun state-driven (reminder/ingatkan/ghosting)"
```

---

## Task 8: Verifikasi manual (setelah migration di-apply prod)

> Prasyarat: migration 0038 sudah di-apply prod (minta izin user). `npm run test-tabayyun` hijau. `npx tsc --noEmit` bersih. `npm run build` sukses.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: sukses tanpa error type/lint.

- [ ] **Step 2: Skenario dashboard (staging/prod dgn izin)**

- [ ] Observasi pelanggaran baru → TabayyunCard tampil, tombol "Reminder Tabayyun", teks "Jam 72 jam mulai setelah reminder dikirim".
- [ ] Klik reminder → WA terbuka; DB `reminder_sent_at` terisi, `deadline_at ≈ +72h`; tombol jadi "Ingatkan Lagi" + "sisa ~72 jam".
- [ ] Klik "Ingatkan Lagi" → WA terbuka lagi; `deadline_at` TAK berubah (jam tak reset).
- [ ] Set manual `reminder_sent_at` ke >72h lalu (SQL di staging) → refresh → tombol jadi "Teguran Ghosting" + badge merah.
- [ ] Klik "Teguran Ghosting" → tabayyun `decided`+`is_udzur_syari=false`; 1 baris `hits_teguran` (klik ulang tak gandakan); WA ghosting bertanggal WIB terbuka; skor `komitmen_jadwal` pengajar turun di matrix.
- [ ] Skenario alasan: pengajar isi alasan sebelum deadline → `awaiting_reason`; walau lewat 72h TAK jadi ghosting; koordinator putuskan manual via form radio.

- [ ] **Step 3: Commit catatan verifikasi (opsional)** — bila ada temuan, catat & perbaiki dulu.

---

## Self-Review (sudah dijalankan penulis plan)

- **Spec coverage**: migration+kolom (T1) ✓ · state murni+uji (T2) ✓ · refactor teguran (T3) ✓ · template WA ghosting (T4) ✓ · reminder set jam/guard (T5) ✓ · aksi escalate (T6) ✓ · UI state-driven (T7) ✓ · verifikasi manual + efek matrix (T8) ✓. Out-of-scope (cron, auto-WA, report, kajian adab) tak diimplementasi — benar.
- **Type consistency**: `tabayyunGhostingState`/`tabayyunHoursLeft`/`deadlineFromReminder`/`TABAYYUN_DEADLINE_HOURS` konsisten antara lib (T2), actions (T5/T6), UI (T7). `issueTeguranForTabayyun(tab, {catatan, actorId, actorRole})` sama di T3/T6. `tplTabayyunGhostingTeguran` args sama di T4/T6. `reminder_sent_at` konsisten di migration/tipe/query/prop.
- **Placeholder scan**: tak ada TBD/TODO; semua step berisi kode/perintah nyata.
