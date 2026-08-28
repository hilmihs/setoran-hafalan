# Tabayyun — Klaim Penunaian Hutang Menit: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pengajar yang ditabayyun bisa membuka link token tanpa login dan menyatakan berapa menit hutang yang sudah ditunaikan di pertemuan tersebut; koordinator menyetujui angka itu saat memutus, dan barulah saldo hutang berkurang.

**Architecture:** Klaim disimpan sebagai kolom baru di `hits_tabayyun` (bukan tabel baru, bukan baris `pending` di ledger). Ledger `hits_hutang_bayar` tetap berisi kredit terkonfirmasi saja, ditambah kolom `sumber` (`ketua` | `tabayyun`) supaya replace-all milik ketua kelas tidak menghapus kredit hasil tabayyun. Akses pengajar lewat token acak 32 byte di kolom `akses_token`, rute publik `/tabayyun/[token]` (middleware repo memakai daftar *protected*, jadi rute baru otomatis publik).

**Tech Stack:** Next.js App Router (Server Actions), PostgreSQL via `supabaseAdmin` shim (`src/lib/pg-shim.ts`), TypeScript. Tidak ada test runner — verifikasi lewat skrip `tsx` (`npm run test-tabayyun`), `npm run typecheck`, `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-08-28-tabayyun-klaim-hutang-design.md`

---

## Peta file

| File | Tanggung jawab | Pemilik |
|---|---|---|
| `supabase/migrations/0059_tabayyun_klaim_hutang.sql` | Kolom klaim + `sumber` | Agent 1 |
| `src/types/db.ts` | Tipe `HitsTabayyun`, `HitsHutangBayar` | Agent 1 |
| `src/app/hits/ketua/actions.ts` | Pagar replace-all `sumber='ketua'` | Agent 1 |
| `src/lib/hits-tabayyun.ts` | Fungsi murni validasi/cap klaim | Agent 2 |
| `src/lib/hits-tabayyun-token.ts` | Generator token (pakai `node:crypto`, bukan modul murni) | Agent 2 |
| `src/lib/whatsapp.ts` | Template WA membawa URL token | Agent 2 |
| `scripts/test-tabayyun.ts` | Uji fungsi murni baru | Agent 2 |
| `src/components/TabayyunKlarifikasiForm.tsx` | Form klarifikasi dipakai bersama dua jalur | Agent 3 |
| `src/app/tabayyun/[token]/page.tsx` | Halaman publik | Agent 3 |
| `src/app/tabayyun/[token]/actions.ts` | Server action submit publik | Agent 3 |
| `src/app/observasi/koordinator/actions.ts` | Generate token saat reminder; tulis kredit saat memutus | Agent 4 |
| `src/app/observasi/koordinator/TabayyunCard.tsx` | Tampilkan klaim + input `disetujui` | Agent 4 |
| `src/app/observasi/koordinator/page.tsx` | Ambil kolom klaim + kredit ketua | Agent 4 |
| `src/app/hits/pengajar/page.tsx`, `TabayyunAlasanForm.tsx`, `actions.ts` | Jalur login pakai form bersama | Agent 5 |
| `src/lib/api-public/registry.ts` | Ekspos `sumber`, jangan ekspos `bayar_catatan` | Agent 5 |

**Tidak ada dua agent yang menyentuh file yang sama.**

## Urutan & paralelisme

```
Gelombang 1 (paralel):  Agent 1 (DB)        Agent 2 (lib murni + WA + uji)
Gelombang 2 (paralel):  Agent 3 (halaman publik)   Agent 4 (koordinator)   ← butuh 1 & 2 selesai
Gelombang 3:            Agent 5 (jalur login + registry + verifikasi akhir)
```

Agent 3 dan 4 keduanya memakai `validateKlaimMenit` / `capBayarDisetujui` dari Agent 2 dan kolom dari Agent 1. Jangan mulai gelombang 2 sebelum keduanya commit.

---

## Agent 1 — Fondasi DB & pagar ledger

**Files:**
- Create: `supabase/migrations/0059_tabayyun_klaim_hutang.sql`
- Modify: `src/types/db.ts:310-320` (`HitsHutangBayar`), `src/types/db.ts:414-430` (`HitsTabayyun`)
- Modify: `src/app/hits/ketua/actions.ts:290`

- [ ] **Step 1: Pastikan nomor migrasi masih bebas**

Run: `ls supabase/migrations | tail -3`
Expected: baris terakhir `0058_eval_batch_rapot_ujian_terpisah.sql`. Kalau sudah ada `0059_*`, pakai nomor berikutnya yang bebas dan sesuaikan semua penyebutan nama file di bawah.

- [ ] **Step 2: Tulis migrasi**

Create `supabase/migrations/0059_tabayyun_klaim_hutang.sql`:

```sql
-- Klaim penunaian hutang menit oleh pengajar saat tabayyun (spec 2026-08-28).
-- Klaim TIDAK langsung jadi kredit: koordinator menyetujui saat memutus, baru
-- baris hits_hutang_bayar ditulis.

alter table hits_tabayyun
  add column if not exists akses_token text unique,
  add column if not exists bayar_menit_klaim integer check (bayar_menit_klaim >= 0),
  add column if not exists bayar_catatan text,
  add column if not exists bayar_menit_disetujui integer check (bayar_menit_disetujui >= 0);

comment on column hits_tabayyun.akses_token is
  'Token acak 32 byte base64url untuk /tabayyun/<token> (tanpa login). Digenerate saat reminder pertama; berlaku selama status <> decided.';
comment on column hits_tabayyun.bayar_menit_klaim is
  'Klaim pengajar: menit hutang yang sudah ditunaikan di pertemuan ini. 0 = belum menunaikan. NULL = belum menjawab.';
comment on column hits_tabayyun.bayar_menit_disetujui is
  'Menit yang disetujui koordinator; inilah yang ditulis ke hits_hutang_bayar (sumber=tabayyun).';

-- Pagar: hits/ketua melakukan replace-all per keterangan_id (delete lalu insert).
-- Tanpa kolom ini, kredit hasil tabayyun terhapus diam-diam saat ketua mengedit
-- pertemuan yang sama.
alter table hits_hutang_bayar
  add column if not exists sumber text not null default 'ketua'
    check (sumber in ('ketua', 'tabayyun'));

comment on column hits_hutang_bayar.sumber is
  'Asal kredit: ketua (laporan ketua kelas, replace-all per keterangan) | tabayyun (disetujui koordinator saat memutus).';
```

- [ ] **Step 3: Terapkan migrasi ke DB lokal**

Run: `npm run apply-migration -- supabase/migrations/0059_tabayyun_klaim_hutang.sql`
Expected: selesai tanpa error. (Butuh `DATABASE_URL` lokal di `.env.local`. **Jangan** pakai `npm run db` — itu menembak PRODUKSI.)

- [ ] **Step 4: Verifikasi kolom benar-benar ada**

Run:
```bash
psql "$DATABASE_URL" -c "\d hits_tabayyun" | grep -E "akses_token|bayar_"
psql "$DATABASE_URL" -c "\d hits_hutang_bayar" | grep sumber
```
Expected: empat baris `akses_token|bayar_menit_klaim|bayar_catatan|bayar_menit_disetujui`, lalu satu baris `sumber`.

- [ ] **Step 5: Perbarui `HitsHutangBayar` di `src/types/db.ts`**

Ganti interface di `src/types/db.ts:310-320` menjadi:

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
  /** 'ketua' = laporan ketua kelas (replace-all per keterangan). 'tabayyun' = disetujui koordinator. */
  sumber: 'ketua' | 'tabayyun';
  created_at: string;
}
```

- [ ] **Step 6: Perbarui `HitsTabayyun` di `src/types/db.ts`**

Ganti interface di `src/types/db.ts:414-430` menjadi:

```ts
export interface HitsTabayyun {
  id: string;
  keterangan_id: string;
  halaqah_id: string;
  pengajar_id: string | null;
  koordinator_kk_id: string | null;
  kondisi: string; // headline pelanggaran (KMT/KBLA/JKG/BADAL/TIDAK_LATIHAN), relaxed dari enum di 0036
  alasan_pengajar: string | null;
  alasan_submitted_at: string | null;
  is_udzur_syari: boolean | null;
  keputusan_catatan: string | null;
  decided_at: string | null;
  status: HitsStatusTabayyun;
  deadline_at: string;
  reminder_sent_at: string | null;
  /** Token akses publik /tabayyun/<token>. Null = reminder belum pernah dikirim. */
  akses_token: string | null;
  /** Klaim pengajar (menit). 0 = belum menunaikan, null = belum menjawab. */
  bayar_menit_klaim: number | null;
  bayar_catatan: string | null;
  /** Disetujui koordinator; sumber baris hits_hutang_bayar sumber='tabayyun'. */
  bayar_menit_disetujui: number | null;
  created_at: string;
}
```

- [ ] **Step 7: Pagari replace-all milik ketua kelas**

Di `src/app/hits/ketua/actions.ts:290`, ganti baris:

```ts
  await supabaseAdmin.from('hits_hutang_bayar').delete().eq('keterangan_id', saved.id);
```

menjadi:

```ts
  // Hanya sapu kredit yang dilaporkan ketua. Kredit sumber='tabayyun' (disetujui
  // koordinator) TIDAK boleh ikut terhapus saat ketua mengedit pertemuan ini.
  await supabaseAdmin
    .from('hits_hutang_bayar')
    .delete()
    .eq('keterangan_id', saved.id)
    .eq('sumber', 'ketua');
```

- [ ] **Step 8: Tandai insert ketua secara eksplisit**

Di blok insert tepat di bawahnya (`src/app/hits/ketua/actions.ts`, sekitar baris 300), tambahkan field `sumber` pada objek insert sehingga menjadi:

```ts
      const { error: bayarErr } = await supabaseAdmin.from('hits_hutang_bayar').insert({
        halaqah_id: halaqahId,
        pengajar_id: (hq?.pengajar_id as string | null) ?? null,
        keterangan_id: saved.id,
        menit,
        tanggal: match.tanggal,
        dilaporkan_oleh: session.ketua_kelas_id,
        sumber: 'ketua',
      });
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: keluar tanpa error.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0059_tabayyun_klaim_hutang.sql src/types/db.ts src/app/hits/ketua/actions.ts
git commit -m "feat(tabayyun): kolom klaim hutang + kolom sumber di ledger

Pagari replace-all milik ketua kelas dengan sumber='ketua' supaya kredit
hasil persetujuan tabayyun tidak terhapus saat ketua mengedit pertemuan."
```

---

## Agent 2 — Fungsi murni, token, template WA, uji

**Files:**
- Modify: `src/lib/hits-tabayyun.ts`
- Create: `src/lib/hits-tabayyun-token.ts`
- Modify: `src/lib/whatsapp.ts:316-346`
- Modify: `scripts/test-tabayyun.ts`

Agent ini tidak butuh DB — semua yang ditulis di sini murni atau hanya menyusun string, jadi bisa jalan paralel dengan Agent 1.

- [ ] **Step 1: Tulis uji yang gagal untuk `validateKlaimMenit`**

Tambahkan di akhir `scripts/test-tabayyun.ts`, sebelum blok ringkasan `failed` di bagian paling bawah file:

```ts
// --- validateKlaimMenit ---
eq(validateKlaimMenit('30', 90), { menit: 30 }, 'klaim 30 dari saldo 90 -> valid');
eq(validateKlaimMenit('0', 90), { menit: 0 }, 'klaim 0 valid (= belum menunaikan)');
eq(validateKlaimMenit('90', 90), { menit: 90 }, 'klaim == saldo -> valid');
eq(validateKlaimMenit('91', 90), { error: 'Menit yang ditunaikan tidak boleh melebihi sisa hutang (90 menit).' },
   'klaim > saldo -> ditolak');
eq(validateKlaimMenit('-1', 90), { error: 'Menit tidak boleh negatif.' }, 'klaim negatif -> ditolak');
eq(validateKlaimMenit('', 90), { error: 'Jumlah menit wajib diisi.' }, 'kosong padahal ada saldo -> ditolak');
eq(validateKlaimMenit('abc', 90), { error: 'Jumlah menit harus berupa angka.' }, 'bukan angka -> ditolak');
eq(validateKlaimMenit('12.5', 90), { error: 'Jumlah menit harus bilangan bulat.' }, 'pecahan -> ditolak');
eq(validateKlaimMenit('30', 0), { menit: 0 }, 'saldo 0 -> input diabaikan, hasil 0');

// --- capBayarDisetujui ---
eq(capBayarDisetujui(30, 90), 30, 'disetujui < saldo -> apa adanya');
eq(capBayarDisetujui(120, 90), 90, 'disetujui > saldo -> di-cap ke saldo');
eq(capBayarDisetujui(0, 90), 0, 'disetujui 0 -> 0');
eq(capBayarDisetujui(-5, 90), 0, 'disetujui negatif -> 0');
eq(capBayarDisetujui(30, 0), 0, 'saldo 0 -> 0');
```

Dan tambahkan importnya di baris import paling atas file, sehingga blok import menjadi:

```ts
import {
  tabayyunGhostingState,
  tabayyunHoursLeft,
  deadlineFromReminder,
  TABAYYUN_DEADLINE_HOURS,
  validateKlaimMenit,
  capBayarDisetujui,
} from '@/lib/hits-tabayyun';
```

- [ ] **Step 2: Jalankan uji, pastikan GAGAL**

Run: `npm run test-tabayyun`
Expected: gagal saat kompilasi/impor dengan pesan seperti `has no exported member 'validateKlaimMenit'`.

- [ ] **Step 3: Implementasi fungsi murni**

Tambahkan di akhir `src/lib/hits-tabayyun.ts`:

```ts
/**
 * Validasi input klaim menit dari pengajar. Murni.
 * `saldo` = sisa hutang halaqah saat ini. Bila saldo 0, form tidak menampilkan
 * field ini, jadi input apa pun diabaikan dan hasilnya 0.
 */
export function validateKlaimMenit(
  raw: string,
  saldo: number
): { menit: number } | { error: string } {
  if (saldo <= 0) return { menit: 0 };
  const s = raw.trim();
  if (!s) return { error: 'Jumlah menit wajib diisi.' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: 'Jumlah menit harus berupa angka.' };
  if (!Number.isInteger(n)) return { error: 'Jumlah menit harus bilangan bulat.' };
  if (n < 0) return { error: 'Menit tidak boleh negatif.' };
  if (n > saldo) {
    return { error: `Menit yang ditunaikan tidak boleh melebihi sisa hutang (${saldo} menit).` };
  }
  return { menit: n };
}

/**
 * Menit yang benar-benar ditulis ke ledger saat koordinator memutus. Murni.
 * Di-cap ke saldo agar tidak overpay (pola sama seperti laporan ketua kelas).
 */
export function capBayarDisetujui(disetujui: number, saldo: number): number {
  if (!Number.isFinite(disetujui) || disetujui <= 0) return 0;
  return Math.min(Math.floor(disetujui), Math.max(0, saldo));
}
```

- [ ] **Step 4: Jalankan uji, pastikan LULUS**

Run: `npm run test-tabayyun`
Expected: semua baris `ok`, tidak ada `FAIL`, exit code 0.

- [ ] **Step 5: Buat generator token**

Create `src/lib/hits-tabayyun-token.ts`:

```ts
// Token akses publik tabayyun. Dipisah dari hits-tabayyun.ts karena modul itu
// dijaga tetap murni (tanpa I/O) agar bisa diuji & dipakai komponen klien.
import { randomBytes } from 'node:crypto';

/** 32 byte acak base64url (~43 karakter). Cukup untuk tak bisa ditebak. */
export function generateTabayyunToken(): string {
  return randomBytes(32).toString('base64url');
}
```

- [ ] **Step 6: Perbarui template WA**

Di `src/lib/whatsapp.ts`, ganti seluruh fungsi `tplTabayyunToPengajar` (mulai baris 316) menjadi:

```ts
export function tplTabayyunToPengajar(args: {
  pengajarName: string;
  pengajarGender: Gender;
  tanggal: string;
  kelasName: string;
  /** URL klarifikasi — sekarang tautan token /tabayyun/<token>. */
  formUrl: string;
  /** Daftar pelanggaran pertemuan (sudah diformat), mis. "KMT — telat 10 menit". */
  pelanggaran: string[];
  hutangSaldo?: number;
}): string {
  const sapaan = salutation(args.pengajarGender);
  const daftar = args.pelanggaran.length
    ? args.pelanggaran.map((p) => `• ${p}`)
    : ['• (rincian tidak tersedia)'];
  const adaHutang = !!args.hutangSaldo && args.hutangSaldo > 0;
  const hutangLines = adaHutang
    ? ['', `Selain itu, tercatat *sisa hutang menit ${args.hutangSaldo} menit* yang perlu diganti.`]
    : [];
  const permintaan = adaHutang
    ? `Mohon sampaikan alasan/klarifikasi, sekaligus *berapa menit hutang yang sudah ditunaikan* pada pertemuan tersebut, melalui tautan berikut:`
    : `Mohon sampaikan alasan/klarifikasi melalui tautan berikut:`;
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Berdasarkan laporan observasi kelas *${args.kelasName}* tanggal *${args.tanggal}*, tercatat hal berikut:`,
    ...daftar,
    ...hutangLines,
    ``,
    permintaan,
    args.formUrl,
    ``,
    `Jazakumullahu khairan.`,
```

Sisa baris fungsi (penutup array dan `.join('\n')`) biarkan apa adanya — jangan diubah.

- [ ] **Step 7: Typecheck & lint**

Run: `npm run typecheck && npm run lint`
Expected: keduanya lolos tanpa error.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hits-tabayyun.ts src/lib/hits-tabayyun-token.ts src/lib/whatsapp.ts scripts/test-tabayyun.ts
git commit -m "feat(tabayyun): validasi klaim menit, token akses, teks WA

validateKlaimMenit & capBayarDisetujui murni + diuji lewat npm run test-tabayyun."
```

---

## Agent 3 — Halaman publik `/tabayyun/[token]`

**Prasyarat:** Agent 1 dan Agent 2 sudah commit.

**Files:**
- Create: `src/components/TabayyunKlarifikasiForm.tsx`
- Create: `src/app/tabayyun/[token]/page.tsx`
- Create: `src/app/tabayyun/[token]/actions.ts`

Rute ini publik tanpa mengubah apa pun: `src/middleware.ts` memakai daftar **protected** dan `/tabayyun` tidak ada di sana (sama seperti `/shakwa`). Jangan menambahkannya ke daftar itu.

- [ ] **Step 1: Buat komponen form bersama**

Create `src/components/TabayyunKlarifikasiForm.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';

export type KlarifikasiResult = { ok?: boolean; error?: string };

export interface TabayyunKlarifikasiFormProps {
  tabayyunId: string;
  /** Sisa hutang halaqah. > 0 → field menit muncul dan wajib. */
  saldoHutang: number;
  alasanAwal: string | null;
  menitAwal: number | null;
  catatanAwal: string | null;
  /** Server action pemanggil; jalur token & jalur login memberi action berbeda. */
  onSubmit: (fd: FormData) => Promise<KlarifikasiResult>;
}

export function TabayyunKlarifikasiForm({
  tabayyunId,
  saldoHutang,
  alasanAwal,
  menitAwal,
  catatanAwal,
  onSubmit,
}: TabayyunKlarifikasiFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(fd);
      if (res?.error) { setError(res.error); return; }
      if (res?.ok) setDone(true);
    });
  }

  if (done) {
    return (
      <div className="t-small" style={{ color: 'var(--hijau-ink)' }}>
        ✓ Klarifikasi terkirim · menunggu keputusan koordinator. Anda masih bisa
        memuat ulang halaman ini untuk merevisi selama belum diputuskan.
      </div>
    );
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="tabayyun_id" value={tabayyunId} />

      <label className="t-small" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
        Alasan / klarifikasi
      </label>
      <textarea
        name="alasan_pengajar"
        required
        rows={3}
        placeholder="Tulis alasan/klarifikasi…"
        defaultValue={alasanAwal ?? ''}
        className="input"
        style={{ width: '100%', marginBottom: 12 }}
      />

      {saldoHutang > 0 && (
        <>
          <div
            className="t-small"
            style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}
          >
            Sisa hutang menit kelas ini: <strong>{saldoHutang} menit</strong>.
          </div>

          <label className="t-small" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Menit hutang yang sudah ditunaikan di pertemuan ini
          </label>
          <input
            name="bayar_menit_klaim"
            type="number"
            required
            min={0}
            max={saldoHutang}
            step={1}
            inputMode="numeric"
            placeholder="0 jika belum menunaikan"
            defaultValue={menitAwal ?? ''}
            className="input"
            style={{ width: '100%', marginBottom: 8 }}
          />

          <input
            name="bayar_catatan"
            className="input"
            placeholder="Catatan cara menunaikan (opsional)"
            defaultValue={catatanAwal ?? ''}
            style={{ width: '100%', marginBottom: 12 }}
          />
        </>
      )}

      {error && (
        <div className="t-small" style={{ color: 'var(--merah-ink)', marginBottom: 8 }}>{error}</div>
      )}

      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Mengirim…' : 'Kirim Klarifikasi'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Buat server action publik**

Create `src/app/tabayyun/[token]/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
import { validateKlaimMenit } from '@/lib/hits-tabayyun';

export type Res = { ok?: boolean; error?: string };

// Rate limit sederhana per token, in-memory (cukup: satu instance systemd,
// tujuannya menahan spam form, bukan pertahanan DDoS).
const HITS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 10;

function rateLimited(token: string, nowMs: number): boolean {
  const prev = (HITS.get(token) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  prev.push(nowMs);
  HITS.set(token, prev);
  return prev.length > MAX_PER_WINDOW;
}

export async function submitKlarifikasiPublik(token: string, fd: FormData): Promise<Res> {
  if (!token) return { error: 'Tautan tidak valid.' };
  if (rateLimited(token, Date.now())) {
    return { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' };
  }

  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select('id, status, halaqah_id')
    .eq('akses_token', token)
    .maybeSingle();
  if (!tab) return { error: 'Tautan tidak valid.' };
  if (tab.status === 'decided') return { error: 'Tabayyun ini sudah diputuskan koordinator.' };

  const alasan = String(fd.get('alasan_pengajar') ?? '').trim();
  if (!alasan) return { error: 'Alasan wajib diisi.' };

  const { saldo } = await computeHutangForHalaqah(tab.halaqah_id as string);
  const klaim = validateKlaimMenit(String(fd.get('bayar_menit_klaim') ?? ''), saldo);
  if ('error' in klaim) return { error: klaim.error };

  const catatan = String(fd.get('bayar_catatan') ?? '').trim();

  const { error } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      alasan_pengajar: alasan,
      alasan_submitted_at: new Date().toISOString(),
      bayar_menit_klaim: saldo > 0 ? klaim.menit : null,
      bayar_catatan: saldo > 0 && catatan ? catatan : null,
      status: 'awaiting_reason',
    })
    .eq('id', tab.id);
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  revalidatePath(`/tabayyun/${token}`);
  return { ok: true };
}
```

Catatan: tidak ada `logAudit` di sini karena aktornya bukan sesi login. Jejaknya tetap ada lewat `alasan_submitted_at` + kolom klaim, dan keputusan koordinator diaudit di Agent 4.

- [ ] **Step 3: Buat halaman publik**

Create `src/app/tabayyun/[token]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
import { hitsHeadlineLabel } from '@/types/db';
import { TabayyunKlarifikasiForm } from '@/components/TabayyunKlarifikasiForm';
import { submitKlarifikasiPublik } from './actions';

export const dynamic = 'force-dynamic';

export default async function TabayyunTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select(
      `id, kondisi, status, alasan_pengajar, halaqah_id, keterangan_id,
       bayar_menit_klaim, bayar_catatan,
       pengajar:pengajar_id(name),
       halaqah:halaqah_id(name),
       keterangan:keterangan_id(tanggal, pertemuan_no)`
    )
    .eq('akses_token', token)
    .maybeSingle();

  // 404 netral: jangan bedakan "tidak pernah ada" vs "dicabut".
  if (!tab) notFound();

  const pengajar = tab.pengajar as unknown as { name: string } | null;
  const halaqah = tab.halaqah as unknown as { name: string } | null;
  const ket = tab.keterangan as unknown as { tanggal: string; pertemuan_no: number } | null;

  const { data: pelRows } = await supabaseAdmin
    .from('hits_pelanggaran')
    .select('jenis, menit')
    .eq('keterangan_id', tab.keterangan_id as string);

  const { saldo } = await computeHutangForHalaqah(tab.halaqah_id as string);
  const decided = tab.status === 'decided';

  async function handleSubmit(fd: FormData) {
    'use server';
    return submitKlarifikasiPublik(token, fd);
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
      <h1 className="t-h1" style={{ marginBottom: 4 }}>Tabayyun — Klarifikasi</h1>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        {pengajar?.name ?? 'Pengajar'} · {halaqah?.name ?? 'Kelas'} ·{' '}
        {ket ? `Pertemuan ${ket.pertemuan_no} · ${ket.tanggal}` : '—'}
      </p>

      <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>
          Tercatat: {tab.kondisi as string} — {hitsHeadlineLabel(tab.kondisi as string)}
        </div>
        <ul className="t-small" style={{ margin: 0, paddingLeft: 18, color: 'var(--muted-2)' }}>
          {(pelRows ?? []).length === 0 ? (
            <li>(rincian tidak tersedia)</li>
          ) : (
            (pelRows ?? []).map((p, i) => (
              <li key={i}>
                {p.jenis as string}
                {p.menit ? ` — ${p.menit} menit` : ''}
              </li>
            ))
          )}
        </ul>
      </div>

      {decided ? (
        <div className="card-flat" style={{ padding: '14px 16px' }}>
          <p className="t-small" style={{ marginBottom: 6 }}>
            Tabayyun ini <strong>sudah diputuskan</strong> koordinator. Tautan tidak lagi menerima kiriman.
          </p>
          {tab.alasan_pengajar && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Klarifikasi Anda: {tab.alasan_pengajar as string}
            </p>
          )}
        </div>
      ) : (
        <div className="card-flat" style={{ padding: '14px 16px' }}>
          <TabayyunKlarifikasiForm
            tabayyunId={tab.id as string}
            saldoHutang={saldo}
            alasanAwal={(tab.alasan_pengajar as string | null) ?? null}
            menitAwal={(tab.bayar_menit_klaim as number | null) ?? null}
            catatanAwal={(tab.bayar_catatan as string | null) ?? null}
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Typecheck & lint**

Run: `npm run typecheck && npm run lint`
Expected: lolos tanpa error.

- [ ] **Step 5: Uji manual halaman**

Siapkan token uji pada satu tabayyun yang masih `pending` di DB lokal:

```bash
psql "$DATABASE_URL" -c "update hits_tabayyun set akses_token='tokenujilokal123' where status <> 'decided' returning id, halaqah_id;" | head -5
```

Run: `npm run dev`, lalu buka `http://localhost:3000/tabayyun/tokenujilokal123`.
Expected: halaman tampil tanpa diminta login; bila halaqah punya saldo hutang > 0, field menit muncul dan wajib.

Buka juga `http://localhost:3000/tabayyun/tokensalah`.
Expected: halaman 404.

- [ ] **Step 6: Commit**

```bash
git add src/components/TabayyunKlarifikasiForm.tsx src/app/tabayyun
git commit -m "feat(tabayyun): halaman klarifikasi publik via token

Rute /tabayyun/<token> tanpa login (middleware repo memakai daftar protected).
Klaim menit wajib bila saldo hutang > 0; token mati saat status decided."
```

---

## Agent 4 — Sisi koordinator

**Prasyarat:** Agent 1 dan Agent 2 sudah commit.

**Files:**
- Modify: `src/app/observasi/koordinator/actions.ts` (`reminderTabayyunPengajar` ~baris 201-277, `decideTabayyun` ~baris 110-160)
- Modify: `src/app/observasi/koordinator/page.tsx:73-110`
- Modify: `src/app/observasi/koordinator/TabayyunCard.tsx`

- [ ] **Step 1: Generate token saat reminder**

Di `src/app/observasi/koordinator/actions.ts`, tambahkan import di bagian atas file:

```ts
import { generateTabayyunToken } from '@/lib/hits-tabayyun-token';
```

Lalu di `reminderTabayyunPengajar`, ubah `select` (baris 208) agar ikut mengambil token:

```ts
    .select('id, keterangan_id, pengajar_id, halaqah_id, status, reminder_sent_at, deadline_at, akses_token, halaqah:halaqah_id(name), keterangan:keterangan_id(tanggal)')
```

- [ ] **Step 2: Tulis token bersama jam 72 jam**

Masih di `reminderTabayyunPengajar`, ganti blok "Reminder pertama → mulai jam 72h" (baris 224-231) menjadi:

```ts
  // Reminder pertama → mulai jam 72h. Reminder ulang dalam window → jam TAK di-reset.
  // Token digenerate sekali lalu dipakai selamanya (sampai status decided).
  let token = (tab.akses_token as string | null) ?? null;
  const patch: Record<string, string> = {};
  if (!tab.reminder_sent_at) {
    patch.reminder_sent_at = nowIso;
    patch.deadline_at = deadlineFromReminder(nowIso);
  }
  if (!token) {
    token = generateTabayyunToken();
    patch.akses_token = token;
  }
  if (Object.keys(patch).length > 0) {
    const { error: clockErr } = await supabaseAdmin
      .from('hits_tabayyun')
      .update(patch)
      .eq('id', tab.id);
    if (clockErr) return { error: `Gagal mulai jam tabayyun: ${clockErr.message}` };
  }
```

- [ ] **Step 3: Arahkan WA ke tautan token**

Masih di fungsi yang sama, ganti baris `formUrl: absUrl('/hits/pengajar'),` (baris 260) menjadi:

```ts
    formUrl: absUrl(`/tabayyun/${token}`),
```

- [ ] **Step 4: Tulis kredit saat memutus**

Di `decideTabayyun` (baris 110), tambahkan import yang diperlukan di bagian atas file:

```ts
import { capBayarDisetujui } from '@/lib/hits-tabayyun';
```

(`computeHutangForHalaqah` sudah diimpor di file ini — pakai yang ada, jangan tambah impor ganda.)

Ganti query konteks (baris 123-127) menjadi:

```ts
  // Konteks utk auto-teguran (kondisi, pengajar, tanggal) + kredit hutang.
  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select('id, kondisi, pengajar_id, halaqah_id, keterangan_id, bayar_menit_klaim, halaqah:halaqah_id(pengajar_id), keterangan:keterangan_id(tanggal)')
    .eq('id', tabayyunId)
    .maybeSingle();
```

Lalu tepat **sesudah** blok `if (error) return { error: ... }` (baris 140) dan **sebelum** blok teguran, sisipkan:

```ts
  // Kredit hutang hasil persetujuan. Replace-all agar keputusan bisa diubah
  // tanpa menumpuk kredit; hanya menyapu baris sumber='tabayyun' milik sendiri.
  const disetujuiRaw = Number(formData.get('bayar_menit_disetujui') ?? 0);
  if (tab?.keterangan_id) {
    await supabaseAdmin
      .from('hits_hutang_bayar')
      .delete()
      .eq('keterangan_id', tab.keterangan_id as string)
      .eq('sumber', 'tabayyun');

    const { saldo } = await computeHutangForHalaqah(tab.halaqah_id as string);
    const menit = capBayarDisetujui(disetujuiRaw, saldo);
    if (menit > 0) {
      const ketTab = tab.keterangan as unknown as { tanggal: string } | null;
      const halTab = tab.halaqah as unknown as { pengajar_id: string | null } | null;
      const { error: bayarErr } = await supabaseAdmin.from('hits_hutang_bayar').insert({
        halaqah_id: tab.halaqah_id as string,
        pengajar_id: (tab.pengajar_id as string | null) ?? halTab?.pengajar_id ?? null,
        keterangan_id: tab.keterangan_id as string,
        menit,
        tanggal: ketTab?.tanggal ?? new Date().toISOString().slice(0, 10),
        dilaporkan_oleh: `koordinator_kk:${session.koordinator_kk_id}`,
        sumber: 'tabayyun',
      });
      if (bayarErr) return { error: `Gagal menyimpan pembayaran: ${bayarErr.message}` };
    }

    await supabaseAdmin
      .from('hits_tabayyun')
      .update({ bayar_menit_disetujui: menit })
      .eq('id', tabayyunId);

    await logAudit({
      actor: session,
      action: 'hits.tabayyun.bayar',
      targetTable: 'hits_hutang_bayar',
      targetId: tabayyunId,
      detail: { klaim: tab.bayar_menit_klaim ?? null, disetujui: menit, saldo_sebelum: saldo },
    });
  }
```

**Urutan penting:** `delete` dijalankan sebelum `computeHutangForHalaqah` supaya saldo yang dipakai untuk cap tidak menghitung kredit lama dari keputusan sebelumnya (pola sama seperti `hits/ketua/actions.ts`).

- [ ] **Step 5: Ambil kolom klaim + kredit ketua di halaman koordinator**

Di `src/app/observasi/koordinator/page.tsx`, ganti `select` tabayyun (baris 78-86) menjadi:

```ts
  const { data: tabRaw } = await supabaseAdmin
    .from('hits_tabayyun')
    .select(
      `id, kondisi, status, alasan_pengajar, deadline_at, reminder_sent_at, pengajar_id,
       keterangan_id, bayar_menit_klaim, bayar_catatan, bayar_menit_disetujui,
       pengajar:pengajar_id(name),
       halaqah:halaqah_id(name, gender),
       keterangan:keterangan_id(tanggal)`
    )
    .in('status', tabayyunStatuses)
    .order('created_at', { ascending: false });
```

Perluas `type TabRow` (baris 88-99) dengan field baru:

```ts
  type TabRow = {
    id: string;
    kondisi: string;
    status: string;
    alasan_pengajar: string | null;
    deadline_at: string;
    reminder_sent_at: string | null;
    pengajar_id: string | null;
    keterangan_id: string | null;
    bayar_menit_klaim: number | null;
    bayar_catatan: string | null;
    bayar_menit_disetujui: number | null;
    pengajar: { name: string } | null;
    halaqah: { name: string; gender: string } | null;
    keterangan: { tanggal: string } | null;
  };
```

- [ ] **Step 6: Hitung kredit yang sudah dilaporkan ketua per pertemuan**

Masih di `src/app/observasi/koordinator/page.tsx`, tepat **sesudah** deklarasi `type TabRow` dan **sebelum** `const tabayyunItems = ...`, sisipkan:

```ts
  // Kredit yang sudah tercatat dari laporan ketua kelas untuk pertemuan yang
  // sama — ditampilkan agar koordinator tidak menyetujui angka yang dobel.
  const ketIdsTab = ((tabRaw ?? []) as unknown as TabRow[])
    .map((t) => t.keterangan_id)
    .filter((v): v is string => !!v);
  const bayarKetuaByKet = new Map<string, number>();
  if (ketIdsTab.length > 0) {
    const { data: bayarRows } = await supabaseAdmin
      .from('hits_hutang_bayar')
      .select('keterangan_id, menit, sumber')
      .in('keterangan_id', ketIdsTab);
    for (const b of bayarRows ?? []) {
      if ((b.sumber as string) !== 'ketua') continue;
      const k = b.keterangan_id as string;
      bayarKetuaByKet.set(k, (bayarKetuaByKet.get(k) ?? 0) + (b.menit as number));
    }
  }
```

Lalu di objek `.map((t) => ({ ... }))` (mulai baris 102), tambahkan empat field ini di samping field yang sudah ada:

```ts
      bayar_menit_klaim: t.bayar_menit_klaim,
      bayar_catatan: t.bayar_catatan,
      bayar_menit_disetujui: t.bayar_menit_disetujui,
      bayar_menit_ketua: t.keterangan_id ? (bayarKetuaByKet.get(t.keterangan_id) ?? 0) : 0,
```

- [ ] **Step 7: Tampilkan klaim & input persetujuan di kartu**

Di `src/app/observasi/koordinator/TabayyunCard.tsx`, perluas `interface Props` menjadi:

```tsx
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
    bayar_menit_klaim: number | null;
    bayar_catatan: string | null;
    bayar_menit_disetujui: number | null;
    /** Kredit untuk pertemuan ini yang sudah dilaporkan ketua kelas. */
    bayar_menit_ketua: number;
  };
}
```

Lalu di dalam `<form action={handleDecide}>`, tepat **sesudah** `<input type="hidden" name="tabayyun_id" ... />` dan **sebelum** blok radio udzur, sisipkan:

```tsx
        {t.bayar_menit_klaim != null && (
          <div
            className="t-small"
            style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}
          >
            <div>
              <strong>Klaim pengajar:</strong> menunaikan {t.bayar_menit_klaim} menit di pertemuan ini.
            </div>
            {t.bayar_catatan && <div style={{ color: 'var(--muted-2)' }}>Catatan: {t.bayar_catatan}</div>}
            {t.bayar_menit_ketua > 0 && (
              <div style={{ color: 'var(--kuning-ink)', fontWeight: 600, marginTop: 4 }}>
                ⚠ Ketua kelas sudah melaporkan {t.bayar_menit_ketua} menit untuk pertemuan ini — jangan dihitung dua kali.
              </div>
            )}
          </div>
        )}

        {t.bayar_menit_klaim != null && (
          <label className="t-small" style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>Menit disetujui</span>
            <input
              name="bayar_menit_disetujui"
              type="number"
              min={0}
              step={1}
              defaultValue={t.bayar_menit_disetujui ?? t.bayar_menit_klaim ?? 0}
              className="input"
              style={{ height: 36, fontSize: 13, marginTop: 4 }}
            />
          </label>
        )}
```

- [ ] **Step 8: Typecheck & lint**

Run: `npm run typecheck && npm run lint`
Expected: lolos tanpa error.

- [ ] **Step 9: Uji manual alur koordinator**

Run: `npm run dev`, login sebagai koordinator ketua kelas, buka `/observasi/koordinator`.
Expected:
1. Klik "Reminder Tabayyun" → WA terbuka dan URL di pesan berbentuk `/tabayyun/<token>` (bukan `/hits/pengajar`).
2. Setelah pengajar submit lewat tautan itu, kartu menampilkan "Klaim pengajar: … menit" + input "Menit disetujui" terisi otomatis.
3. Setelah "Putuskan", verifikasi ledger:
   ```bash
   psql "$DATABASE_URL" -c "select menit, sumber, dilaporkan_oleh from hits_hutang_bayar where sumber='tabayyun' order by created_at desc limit 3;"
   ```
   Expected: satu baris dengan `sumber = tabayyun`.
4. Putuskan ulang tabayyun yang sama (ubah angka) → jumlah baris `sumber='tabayyun'` untuk `keterangan_id` itu tetap satu, bukan bertambah.

- [ ] **Step 10: Commit**

```bash
git add src/app/observasi/koordinator
git commit -m "feat(tabayyun): koordinator setujui klaim hutang jadi kredit

Reminder menggenerate akses_token dan mengirim /tabayyun/<token>. Saat memutus,
menit disetujui di-cap ke saldo lalu ditulis sebagai kredit sumber='tabayyun'
(replace-all agar keputusan bisa diubah). Kartu menampilkan kredit yang sudah
dilaporkan ketua untuk pertemuan yang sama sebagai pencegah dobel-hitung."
```

---

## Agent 5 — Jalur login, API publik, verifikasi akhir

**Prasyarat:** Agent 1-4 sudah commit.

**Files:**
- Modify: `src/app/hits/pengajar/TabayyunAlasanForm.tsx`
- Modify: `src/app/hits/pengajar/page.tsx:60-80`
- Modify: `src/app/hits/pengajar/actions.ts:18-59`
- Modify: `src/lib/api-public/registry.ts:247`

- [ ] **Step 1: Terima klaim menit di server action jalur login**

Di `src/app/hits/pengajar/actions.ts`, tambahkan impor:

```ts
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
import { validateKlaimMenit } from '@/lib/hits-tabayyun';
```

Lalu di `submitAlasanTabayyun`, ganti blok update (baris 39-47) menjadi:

```ts
  const { saldo } = await computeHutangForHalaqah(tab.halaqah_id as string);
  const klaim = validateKlaimMenit(String(fd.get('bayar_menit_klaim') ?? ''), saldo);
  if ('error' in klaim) return { error: klaim.error };
  const bayarCatatan = String(fd.get('bayar_catatan') ?? '').trim();

  const { error } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      alasan_pengajar: alasan,
      alasan_submitted_at: new Date().toISOString(),
      bayar_menit_klaim: saldo > 0 ? klaim.menit : null,
      bayar_catatan: saldo > 0 && bayarCatatan ? bayarCatatan : null,
      status: 'awaiting_reason',
    })
    .eq('id', tabayyunId);
  if (error) return { error: `Gagal menyimpan: ${error.message}` };
```

- [ ] **Step 2: Pakai form bersama di panel pengajar**

Ganti isi `src/app/hits/pengajar/TabayyunAlasanForm.tsx` menjadi:

```tsx
'use client';

import { submitAlasanTabayyun } from './actions';
import { hitsHeadlineLabel } from '@/types/db';
import { TabayyunKlarifikasiForm } from '@/components/TabayyunKlarifikasiForm';

export type TabayyunForPengajar = {
  id: string;
  halaqah_name: string;
  kondisi: string;
  tanggal: string;
  pertemuan_no: number;
  status: string;
  alasan_pengajar: string | null;
  saldo_hutang: number;
  bayar_menit_klaim: number | null;
  bayar_catatan: string | null;
};

function OneTabayyun({ t }: { t: TabayyunForPengajar }) {
  const sudahKirim = t.status === 'awaiting_reason' || t.status === 'decided';

  async function handleSubmit(fd: FormData) {
    return submitAlasanTabayyun(undefined, fd);
  }

  return (
    <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.halaqah_name}</div>
        <span className="badge" style={{ background: 'var(--kuning-tint)', borderColor: 'var(--kuning-line)', color: 'var(--kuning-ink)' }}>
          {t.kondisi}
        </span>
      </div>
      <div className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        Pertemuan {t.pertemuan_no} · {t.tanggal} · {hitsHeadlineLabel(t.kondisi)}
      </div>
      {t.status === 'decided' ? (
        <div className="t-small" style={{ color: 'var(--hijau-ink)' }}>
          ✓ Sudah diputuskan koordinator.
        </div>
      ) : (
        <>
          {sudahKirim && (
            <div className="t-small" style={{ color: 'var(--hijau-ink)', marginBottom: 8 }}>
              ✓ Klarifikasi sudah terkirim · masih bisa direvisi selama belum diputuskan.
            </div>
          )}
          <TabayyunKlarifikasiForm
            tabayyunId={t.id}
            saldoHutang={t.saldo_hutang}
            alasanAwal={t.alasan_pengajar}
            menitAwal={t.bayar_menit_klaim}
            catatanAwal={t.bayar_catatan}
            onSubmit={handleSubmit}
          />
        </>
      )}
    </div>
  );
}

export function TabayyunAlasanPanel({ items }: { items: TabayyunForPengajar[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 className="t-h2" style={{ marginBottom: 4 }}>Tabayyun — Klarifikasi Kondisi Kelas ({items.length})</h2>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
        Kondisi kelas tercatat tidak ideal. Mohon sampaikan alasan/klarifikasi.
      </p>
      {items.map((t) => <OneTabayyun key={t.id} t={t} />)}
    </div>
  );
}
```

- [ ] **Step 3: Suplai saldo & klaim dari halaman pengajar**

Di `src/app/hits/pengajar/page.tsx`, tambahkan impor:

```ts
import { computeHutangForHalaqahList } from '@/lib/hits-hutang';
```

Ganti `select` tabayyun (baris 64-68) menjadi:

```ts
      .from('hits_tabayyun')
      .select('id, halaqah_id, kondisi, status, alasan_pengajar, bayar_menit_klaim, bayar_catatan, hits_keterangan_harian:keterangan_id(tanggal, pertemuan_no)')
      .in('halaqah_id', halaqahIds)
      .in('status', ['pending', 'awaiting_reason'])
      .order('created_at', { ascending: false });
```

Tepat sebelum `tabayyunItems = (tabRows ?? []).map(...)` (baris 69), sisipkan:

```ts
    const hutangByHal = await computeHutangForHalaqahList(halaqahIds);
```

Lalu di dalam objek hasil `.map`, tambahkan tiga field di samping yang sudah ada:

```ts
        saldo_hutang: hutangByHal.get(t.halaqah_id)?.saldo ?? 0,
        bayar_menit_klaim: (t.bayar_menit_klaim as number | null) ?? null,
        bayar_catatan: (t.bayar_catatan as string | null) ?? null,
```

- [ ] **Step 4: Amankan API publik**

Buka `src/lib/api-public/registry.ts:247` (entitas `hits/hutang-bayar`). Tambahkan `'sumber'` ke daftar kolom yang diekspos. **Jangan** menambahkan entitas atau kolom untuk `bayar_catatan` / `bayar_menit_klaim` — itu teks bebas & data klarifikasi personal.

Run: `npm run typecheck`
Expected: lolos. Audit `FORBIDDEN_COLUMNS` berjalan saat modul dimuat dan akan melempar error kalau kolom terlarang ikut terekspos.

- [ ] **Step 5: Jalankan seluruh verifikasi**

```bash
npm run test-tabayyun
npm run typecheck
npm run lint
npm run build
```
Expected: keempatnya lolos. `npm run test-tabayyun` menampilkan semua `ok` tanpa `FAIL`.

- [ ] **Step 6: Uji manual dua jalur berujung sama**

Run: `npm run dev`.
1. Buka `/tabayyun/<token>` (tanpa login) untuk satu tabayyun, isi alasan + menit, submit.
2. Login sebagai pengajar pemilik halaqah itu, buka `/hits/pengajar`.
Expected: panel tabayyun menampilkan alasan & menit yang barusan dikirim (nilai awal form terisi), bukan form kosong.

- [ ] **Step 7: Commit**

```bash
git add src/app/hits/pengajar src/lib/api-public/registry.ts
git commit -m "feat(tabayyun): jalur login pakai form klarifikasi bersama

/hits/pengajar dan /tabayyun/<token> kini memakai komponen & validasi yang
sama, jadi klaim menit tersimpan lewat jalur mana pun. Kolom sumber diekspos
di API publik; bayar_catatan sengaja tidak."
```

---

## Catatan penerapan ke produksi

Migrasi harus dijalankan di produksi lewat `npm run db` dengan `--confirm`, **bukan** `npm run apply-migration` (yang menembak `DATABASE_URL` lokal). Buang `begin;`/`commit;` dari isi file sebelum dikirim — endpoint admin membungkus transaksinya sendiri. Deploy dilakukan dengan `git push maheer main`.

Migrasi ini aman untuk data lama: keempat kolom `hits_tabayyun` nullable, dan `sumber` punya `default 'ketua'` sehingga seluruh baris ledger yang sudah ada otomatis benar.
