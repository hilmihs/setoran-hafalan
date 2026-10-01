# Izin Shakwa Badal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pengajar yang izin bisa memilih jenis "badal" dengan pengganti wajib dari pengajar HITS segender; badal tampil & bisa diganti koordinator, dikabari via wa.me, dan mengisi awal observasi ketua kelas.

**Architecture:** Jenis izin baru `BADAL` + FK `shakwa_izin.badal_pengajar_id` (migrasi 0091). Aturan "siapa boleh jadi badal" dipusatkan di fungsi murni `cekBadal` (`src/lib/shakwa-badal.ts`) yang dipanggil dua server action (kirim izin, ubah badal koordinator). UI mengikuti pola array-sejajar rincian izin dan pola `IzinJadwalGantiForm`.

**Tech Stack:** Next 14 App Router, server actions, `supabaseAdmin` pg-shim, tsx test script (`npm run test-shakwa`).

Spec: `docs/superpowers/specs/2026-10-01-shakwa-izin-badal-design.md`.

---

### Task 1: Migrasi 0091 + tipe

**Files:** Create `supabase/migrations/0091_shakwa_izin_badal.sql`; Modify `src/types/db.ts` (interface ShakwaIzin, `jenis` union + `badal_pengajar_id`).

- [ ] Tulis migrasi: drop/recreate CHECK `shakwa_izin_jenis_check` dengan `'BADAL'`, kolom `badal_pengajar_id uuid references pengajar(id)`, CHECK `shakwa_izin_badal_check ((jenis = 'BADAL') = (badal_pengajar_id is not null))`, comment kolom.
- [ ] Update `db.ts`: `jenis: 'KMT' | 'KBLA' | 'JKG' | 'TIDAK_HADIR' | 'BADAL'; badal_pengajar_id: string | null;`
- [ ] Terapkan ke DB lokal: `npm run apply-migration -- supabase/migrations/0091_shakwa_izin_badal.sql` (DATABASE_URL lokal).
- [ ] Commit.

### Task 2: Aturan badal (murni) + jenis izin

**Files:** Create `src/lib/shakwa-badal.ts`; Modify `src/lib/shakwa.ts` (`ShakwaIzinJenis`, `IZIN_JENIS` + `butuhBadal`); Test `scripts/test-shakwa.ts`.

- [ ] Tes gagal dulu di `test-shakwa.ts`:

```ts
import { cekBadal } from '@/lib/shakwa-badal';
const P = { id: 'p1', gender: 'ikhwan' as const };
eq(cekBadal(null, P), 'pengajar badal tidak ditemukan.', 'badal kosong ditolak');
eq(cekBadal({ id: 'p2', name: 'B', gender: 'ikhwan', active: false }, P), 'pengajar badal sudah tidak aktif.', 'badal nonaktif ditolak');
eq(cekBadal({ id: 'p2', name: 'B', gender: 'akhwat', active: true }, P), 'pengajar badal harus sesama ikhwan.', 'badal beda gender ditolak');
eq(cekBadal({ id: 'p1', name: 'A', gender: 'ikhwan', active: true }, P), 'tidak bisa membadalkan diri sendiri.', 'badal diri sendiri ditolak');
eq(cekBadal({ id: 'p2', name: 'B', gender: 'ikhwan', active: true }, P), null, 'badal segender aktif diterima');
eq(IZIN_JENIS.find((j) => j.value === 'BADAL')?.butuhBadal, true, 'jenis BADAL butuh badal');
eq(izinCocokKondisi('BADAL', 'BADAL'), true, 'izin BADAL cocok observasi BADAL');
eq(izinCocokKondisi('BADAL', 'JKG'), false, 'izin BADAL tak menaungi JKG');
```

- [ ] `npm run test-shakwa` → FAIL (modul belum ada).
- [ ] Implementasi `shakwa-badal.ts`:

```ts
import { supabaseAdmin } from './supabase-admin';
import type { Gender } from '@/types/db';

export type CalonBadal = { id: string; name: string; gender: Gender; active: boolean };

/** null = boleh; string = alasan ditolak (tanpa awalan "Rincian ke-N"). */
export function cekBadal(calon: CalonBadal | null, pemilik: { id: string; gender: Gender }): string | null {
  if (!calon) return 'pengajar badal tidak ditemukan.';
  if (!calon.active) return 'pengajar badal sudah tidak aktif.';
  if (calon.gender !== pemilik.gender) return `pengajar badal harus sesama ${pemilik.gender}.`;
  if (calon.id === pemilik.id) return 'tidak bisa membadalkan diri sendiri.';
  return null;
}

export async function daftarCalonBadal(gender: Gender, kecualiId?: string): Promise<Array<{ id: string; name: string }>> { /* pengajar active+gender, order name, filter kecualiId */ }

export async function ambilCalonBadal(ids: string[]): Promise<Map<string, CalonBadal & { whatsapp_number: string }>> { /* select id,name,gender,active,whatsapp_number in ids */ }
```

- [ ] `IZIN_JENIS` tambah `{ value: 'BADAL', label: 'Digantikan pengajar lain (badal)', butuhMenit: false, butuhTanggalGanti: false, butuhBadal: true }` (yang lain `butuhBadal: false`).
- [ ] `npm run test-shakwa` → PASS. Commit.

### Task 3: Rantai tabayyun membawa nama badal

**Files:** Modify `src/lib/shakwa-izin.ts`; Test `scripts/test-shakwa.ts`.

- [ ] Tes: `alasanDariIzin({...izinContoh, jenis: 'BADAL', badalNama: 'Ust. B'})` memuat `badal: Ust. B`.
- [ ] `IzinCocok.badalNama: string | null`; `alasanDariIzin` push `badal: ${badalNama}`; `cariIzinCocok` select `badal:badal_pengajar_id(name)`; isi `badalNama` di semua pembentuk `IzinCocok` (cari + kirimShakwa). Tes lama yang membentuk `IzinCocok` ditambah `badalNama: null`.
- [ ] PASS + commit.

### Task 4: Server action kirim izin

**Files:** Modify `src/app/shakwa/actions.ts`, `src/lib/whatsapp.ts` (`tplKabariBadal`).

- [ ] `bacaRincianIzin` baca `izin_badal` sejajar; `IzinRincian.badalId` (hanya untuk jenis `butuhBadal`, wajib → error `Rincian ke-N: pilih pengajar badal.`).
- [ ] Setelah identitas pengajar terverifikasi: `ambilCalonBadal(ids)`, `cekBadal(...)` per baris → `Rincian ke-N: <alasan>`.
- [ ] Insert `badal_pengajar_id`; rincian WA koordinator memuat `badal <nama>`.
- [ ] `KirimShakwaResult.badalWa?: Array<{ nama: string; url: string }>` dari `tplKabariBadal({ namaBadal, namaPengajar, tanggal, halaqahNama, nomorTiket })`.
- [ ] typecheck + commit.

### Task 5: Form pengajar

**Files:** Modify `src/app/shakwa/page.tsx`, `src/app/shakwa/ShakwaForm.tsx`.

- [ ] page: `calonBadal = pengajar ? daftarCalonBadal(pengajar.gender, pengajar.pengajar_id) : []` → prop.
- [ ] `RincianRow.badalId`; kolom ke-4: select `izin_badal` required bila `butuhBadal`; hidden kosong `izin_badal` untuk jenis lain; hidden kosong `izin_menit`/`izin_jadwal_ganti` saat BADAL.
- [ ] Layar sukses: tombol "Kabari badal: <nama>" per `hasil.badalWa`.
- [ ] typecheck + commit.

### Task 6: Kartu koordinator

**Files:** Modify `src/lib/shakwa-rekap.ts` (item `badalPengajarId`, `badalNama`), `src/app/shakwa/koordinator/{ShakwaCard.tsx,page.tsx,actions.ts}`; Create `src/app/shakwa/koordinator/IzinBadalForm.tsx`.

- [ ] Rekap: select `badal_pengajar_id, badal:badal_pengajar_id(name)`.
- [ ] Card: tampil `· badal <nama>`; `IzinBadalForm` bila `jenis === 'BADAL'`, opsi dari prop `calonBadal` (page memuat `daftarCalonBadal(session.gender)`).
- [ ] Action `ubahBadalIzin`: role guard, izin + tiket gender koordinator, `ambilCalonBadal`, `cekBadal(calon, {id: izin.pengajar_id, gender: session.gender})`, update, audit `shakwa.izin.badal` {dari, ke}, revalidate.
- [ ] typecheck + commit.

### Task 7: Prefill observasi ketua kelas

**Files:** Modify `src/app/hits/ketua/page.tsx`, `src/app/hits/ketua/HitsKetuaForm.tsx`.

- [ ] page: bila `halaqah.pengajar_id`, ambil `shakwa_izin` jenis BADAL pengajar itu (tanggal ∈ slot kosong), halaqah null/sama → `slot.badalIzin = { nama, nomorTiket }`.
- [ ] Form: `PertemuanSlot.badalIzin`; `loadInto` → bila `!k && slot.badalIzin` centang BADAL + isi nama; catatan kecil "Diisi dari izin <tiket>".
- [ ] typecheck + commit.

### Task 8: Verifikasi

- [ ] `npm run typecheck`, `npm run test-shakwa`.
- [ ] Uji UI lokal (docker `maahir-postgres` + `npm run dev`): kirim izin BADAL, kartu koordinator ganti badal, observasi ketua terisi.
