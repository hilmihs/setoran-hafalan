# Sinkron Izin→Observasi & Gating Attestation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutup dua bocor jembatan izin(Shakwa)→observasi (urutan input & izin yatim) dan paksa attestation dengan menghapus opsi "Belum" di dua field form.

**Architecture:** Link izin↔tabayyun dibuat dua arah — forward-match yang sudah ada saat ketua isi observasi, plus reverse-link baru saat pengajar kirim izin. Logika kecocokan jenis diekstrak jadi fungsi murni agar bisa dites; wrapper DB tipis diverifikasi manual (repo ini tak punya harness mock DB — tes = skrip `tsx` fungsi murni). Izin yang tak ke-match ditampilkan di dashboard koordinator observasi. Perubahan form murni config terpusat.

**Tech Stack:** Next.js App Router (server actions), Supabase (`supabaseAdmin`), TypeScript, tes via `tsx` script (`npm run test-shakwa`).

Spec: `docs/superpowers/specs/2026-08-15-sinkron-izin-observasi-design.md`

---

## File Structure

- `src/lib/shakwa.ts` — config kategori (Task 1). Hapus opsi "Belum".
- `src/lib/shakwa-izin.ts` — fungsi murni `izinCocokKondisi` (Task 2), tipe `IzinCocok` diperluas + wrapper `backfillTabayyunDariIzin` (Task 3), `getIzinYatim` + helper jendela (Task 5).
- `src/app/shakwa/actions.ts` — panggil reverse-link sesudah insert izin (Task 4).
- `src/app/observasi/koordinator/page.tsx` — panel "Izin belum ke-match" (Task 6).
- `scripts/test-shakwa.ts` — tambahan assertion untuk Task 1, 2, 5.

Urutan: Task 1 (config, mandiri) → Task 2 (predikat murni) → Task 3 (wrapper pakai predikat) → Task 4 (wiring) → Task 5 (yatim query) → Task 6 (UI panel).

---

## Task 1: Hapus opsi "Belum" (Bagian 3)

**Files:**
- Modify: `src/lib/shakwa.ts:159` (tali_kasih `sudah_presensi`), `src/lib/shakwa.ts:142` (izin `sudah_info_koordinator`)
- Test: `scripts/test-shakwa.ts`

- [ ] **Step 1: Tulis assertion yang gagal**

Tambahkan di `scripts/test-shakwa.ts`, sebelum blok penutup `if (failed > 0)`:

```ts
// --- Attestation: opsi "Belum" dihapus (feedback pengajar) ---
const opsiField = (kategori: string, field: string) =>
  kategoriDef(kategori)?.fieldTambahan.find((f) => f.name === field)?.opsi;
eq(opsiField('tali_kasih', 'sudah_presensi'), ['Sudah'], 'talikasih sudah_presensi hanya "Sudah"');
eq(opsiField('izin', 'sudah_info_koordinator'), ['Sudah'], 'izin sudah_info_koordinator hanya "Sudah"');
eq(opsiField('tali_kasih', 'punya_rekening_cimb'), ['Sudah', 'Belum'], 'rekening CIMB tetap Sudah/Belum');
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test-shakwa`
Expected: FAIL `talikasih sudah_presensi hanya "Sudah"` (got `["Sudah","Belum"]`).

- [ ] **Step 3: Ubah config**

`src/lib/shakwa.ts` — field `sudah_presensi` (tali_kasih):

```ts
      {
        name: 'sudah_presensi',
        label: 'Apakah Anda sudah menyelesaikan presensi peserta dan absensi pengajar?',
        opsi: ['Sudah'],
      },
```

`src/lib/shakwa.ts` — field `sudah_info_koordinator` (izin):

```ts
      {
        name: 'sudah_info_koordinator',
        label: 'Apakah sudah menginfokan ke Koordinator / Ketua kelompok pengajar?',
        opsi: ['Sudah'],
      },
```

Biarkan `punya_rekening_cimb` tetap `['Sudah', 'Belum']`.

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test-shakwa`
Expected: PASS semua, termasuk tiga assertion baru.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shakwa.ts scripts/test-shakwa.ts
git commit -m "feat(shakwa): hapus opsi 'Belum' di attestation presensi & info koordinator"
```

---

## Task 2: Predikat murni kecocokan izin↔kondisi (Bagian 1)

**Files:**
- Modify: `src/lib/shakwa-izin.ts`
- Test: `scripts/test-shakwa.ts`

- [ ] **Step 1: Tulis assertion yang gagal**

Tambah import di `scripts/test-shakwa.ts` (baris import shakwa-izin):

```ts
import { alasanDariIzin, berasalDariIzin, PENANDA_IZIN, izinCocokKondisi } from '@/lib/shakwa-izin';
```

Tambah assertion sebelum blok penutup:

```ts
// --- Predikat kecocokan izin ↔ kondisi tabayyun ---
eq(izinCocokKondisi('KMT', 'KMT'), true, 'jenis sama → cocok');
eq(izinCocokKondisi('KBLA', 'KMT'), false, 'jenis beda → tak cocok');
eq(izinCocokKondisi('TIDAK_HADIR', 'BADAL'), true, 'TIDAK_HADIR net → cocok kondisi apa pun');
eq(izinCocokKondisi('TIDAK_HADIR', 'TIDAK_LATIHAN'), true, 'TIDAK_HADIR net → cocok TIDAK_LATIHAN');
eq(izinCocokKondisi('JKG', 'BADAL'), false, 'JKG vs BADAL → tak cocok');
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test-shakwa`
Expected: FAIL kompilasi — `izinCocokKondisi` belum diekspor.

- [ ] **Step 3: Tambah fungsi murni**

`src/lib/shakwa-izin.ts`, setelah `berasalDariIzin`:

```ts
/**
 * Apakah satu izin cocok dipakai untuk tabayyun berkondisi tertentu.
 * Jenis sama → cocok. TIDAK_HADIR jadi jaring pengaman: menaungi semua bentuk
 * ketidakhadiran hari itu (mirror logika fallback di cariIzinCocok).
 */
export function izinCocokKondisi(izinJenis: ShakwaIzinJenis, tabKondisi: string): boolean {
  return izinJenis === 'TIDAK_HADIR' || tabKondisi === izinJenis;
}
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test-shakwa`
Expected: PASS semua.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shakwa-izin.ts scripts/test-shakwa.ts
git commit -m "feat(shakwa-izin): predikat murni izinCocokKondisi untuk reverse-link"
```

---

## Task 3: Reverse-link `backfillTabayyunDariIzin` (Bagian 1)

**Files:**
- Modify: `src/lib/shakwa-izin.ts` (perluas tipe `IzinCocok`, isi field di `cariIzinCocok`, tambah `backfillTabayyunDariIzin`)

Tak ada unit test (wrapper DB murni; repo tak punya harness mock). Verifikasi = `npm run typecheck`.

- [ ] **Step 1: Perluas tipe `IzinCocok`**

`src/lib/shakwa-izin.ts` — tambah dua field ke type `IzinCocok`:

```ts
export type IzinCocok = {
  id: string;
  shakwaId: string;
  nomorTiket: string;
  tanggal: string;
  jenis: ShakwaIzinJenis;
  menit: number | null;
  jadwalGanti: string | null;
  alasan: string;
  /** Kapan pengajar mengirim formulirnya — dipakai sebagai alasan_submitted_at. */
  dikirimAt: string;
  /** Pengajar pemilik izin — dipakai reverse-link mencocokkan tabayyun. */
  pengajarId: string;
  /** Halaqah yang disebut izin; null = berlaku semua halaqah pengajar hari itu. */
  halaqahId: string | null;
};
```

- [ ] **Step 2: Isi field baru di `cariIzinCocok`**

`src/lib/shakwa-izin.ts` — pada objek `return` di dalam `cariIzinCocok`, tambah dua field:

```ts
  return {
    id: cocok.id,
    shakwaId: cocok.shakwa_id,
    nomorTiket: s?.nomor_tiket ?? '—',
    tanggal: cocok.tanggal,
    jenis: cocok.jenis,
    menit: cocok.menit,
    jadwalGanti: cocok.jadwal_ganti,
    alasan: cocok.alasan,
    dikirimAt: s?.created_at ?? new Date().toISOString(),
    pengajarId: args.pengajarId,
    halaqahId: cocok.halaqah_id,
  };
```

(`args.pengajarId` di titik ini sudah dipastikan non-null oleh guard `if (!args.pengajarId) return null;` di awal fungsi. Bila TypeScript menganggapnya `string | null`, ganti jadi `args.pengajarId!`.)

- [ ] **Step 3: Tambah `backfillTabayyunDariIzin`**

`src/lib/shakwa-izin.ts`, di akhir file:

```ts
/**
 * Reverse-link: pengajar mengirim izin SETELAH ketua kelas terlanjur mengisi
 * observasi (tabayyun sudah 'pending' tanpa alasan). Cari tabayyun cocok lalu
 * isi alasannya dari izin, supaya pengajar tak ditagih klarifikasi & tak kena
 * ghosting. Menaungi urutan input kebalikan dari forward-match di hits/ketua.
 *
 * Hanya menyentuh tabayyun 'pending' tanpa alasan_pengajar — tak menimpa yang
 * sudah 'awaiting_reason'/'decided' atau sudah punya alasan. Return id tabayyun
 * yang ter-backfill, atau null bila tak ada yang cocok.
 */
export async function backfillTabayyunDariIzin(izin: IzinCocok): Promise<string | null> {
  let q = supabaseAdmin
    .from('hits_tabayyun')
    .select('id, kondisi, keterangan:keterangan_id(tanggal)')
    .eq('pengajar_id', izin.pengajarId)
    .eq('status', 'pending')
    .is('alasan_pengajar', null);
  if (izin.halaqahId) q = q.eq('halaqah_id', izin.halaqahId);

  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    kondisi: string;
    keterangan: { tanggal: string } | null;
  }>;

  const cocok = rows.find(
    (r) => r.keterangan?.tanggal === izin.tanggal && izinCocokKondisi(izin.jenis, r.kondisi)
  );
  if (!cocok) return null;

  const { error } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      status: 'awaiting_reason',
      alasan_pengajar: alasanDariIzin(izin),
      alasan_submitted_at: izin.dikirimAt,
    })
    .eq('id', cocok.id);
  if (error) {
    console.error('backfillTabayyunDariIzin: gagal update tabayyun', error);
    return null;
  }
  await tandaiIzinTerpakai(izin.id, cocok.id);
  return cocok.id;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: tanpa error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shakwa-izin.ts
git commit -m "feat(shakwa-izin): backfillTabayyunDariIzin (reverse-link urutan)"
```

---

## Task 4: Panggil reverse-link saat izin dikirim (Bagian 1)

**Files:**
- Modify: `src/app/shakwa/actions.ts:223-237`

Verifikasi = `npm run typecheck` + `npm run lint`.

- [ ] **Step 1: Tambah import**

`src/app/shakwa/actions.ts` — pada baris import shakwa-izin (dekat atas file), pastikan mengimpor:

```ts
import { backfillTabayyunDariIzin, type IzinCocok } from '@/lib/shakwa-izin';
```

(Bila belum ada import dari `@/lib/shakwa-izin`, tambahkan baris ini. Bila sudah ada import lain dari modul itu, gabungkan.)

- [ ] **Step 2: Ganti blok insert izin agar mengembalikan id lalu reverse-link**

`src/app/shakwa/actions.ts` — ganti blok:

```ts
  if (rincianIzin.length && pengajar) {
    const { error: izinErr } = await supabaseAdmin.from('shakwa_izin').insert(
      rincianIzin.map((r) => ({
        shakwa_id: simpan.id,
        pengajar_id: pengajar!.pengajar_id,
        halaqah_id: r.halaqahId,
        tanggal: r.tanggal,
        jenis: r.jenis,
        menit: r.menit,
        jadwal_ganti: r.jadwalGanti,
        alasan: isi,
      }))
    );
    if (izinErr) console.error('shakwa: gagal simpan rincian izin', izinErr);
  }
```

menjadi:

```ts
  if (rincianIzin.length && pengajar) {
    const { data: izinRows, error: izinErr } = await supabaseAdmin
      .from('shakwa_izin')
      .insert(
        rincianIzin.map((r) => ({
          shakwa_id: simpan.id,
          pengajar_id: pengajar!.pengajar_id,
          halaqah_id: r.halaqahId,
          tanggal: r.tanggal,
          jenis: r.jenis,
          menit: r.menit,
          jadwal_ganti: r.jadwalGanti,
          alasan: isi,
        }))
      )
      .select('id');
    if (izinErr) console.error('shakwa: gagal simpan rincian izin', izinErr);

    // Reverse-link: bila ketua kelas sudah terlanjur mengisi observasi hari itu,
    // tabayyun 'pending' yang cocok langsung diisi alasannya dari izin ini.
    const ids = (izinRows ?? []) as Array<{ id: string }>;
    const dikirimAt = new Date().toISOString();
    for (let i = 0; i < rincianIzin.length; i++) {
      const idRow = ids[i];
      if (!idRow) continue;
      const r = rincianIzin[i];
      const izin: IzinCocok = {
        id: idRow.id,
        shakwaId: simpan.id,
        nomorTiket: simpan.nomorTiket,
        tanggal: r.tanggal,
        jenis: r.jenis,
        menit: r.menit,
        jadwalGanti: r.jadwalGanti,
        alasan: isi,
        dikirimAt,
        pengajarId: pengajar!.pengajar_id,
        halaqahId: r.halaqahId,
      };
      try {
        await backfillTabayyunDariIzin(izin);
      } catch (e) {
        console.error('shakwa: gagal reverse-link izin', e);
      }
    }
  }
```

Catatan: `IzinRincian` (hasil `bacaRincianIzin`) memuat `tanggal`, `jenis`, `menit`, `jadwalGanti`, `halaqahId` — periksa nama field-nya di `src/app/shakwa/actions.ts` (fungsi `bacaRincianIzin`) dan sesuaikan bila berbeda. `simpan.nomorTiket` tersedia dari `simpanDenganTiket`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: tanpa error. Bila error "property ... does not exist on IzinRincian", buka `bacaRincianIzin` dan samakan nama field.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: tanpa error baru.

- [ ] **Step 5: Commit**

```bash
git add src/app/shakwa/actions.ts
git commit -m "feat(shakwa): reverse-link izin ke tabayyun saat pengajar kirim izin"
```

---

## Task 5: Query izin yatim `getIzinYatim` (Bagian 2)

**Files:**
- Modify: `src/lib/shakwa-izin.ts` (helper murni `dalamJendelaYatim` + `getIzinYatim`)
- Test: `scripts/test-shakwa.ts` (untuk helper murni)

- [ ] **Step 1: Tulis assertion helper jendela yang gagal**

`scripts/test-shakwa.ts` — tambah `dalamJendelaYatim` ke import shakwa-izin:

```ts
import {
  alasanDariIzin,
  berasalDariIzin,
  PENANDA_IZIN,
  izinCocokKondisi,
  dalamJendelaYatim,
} from '@/lib/shakwa-izin';
```

Assertion:

```ts
// --- Jendela izin yatim (default 14 hari) ---
eq(dalamJendelaYatim('2026-08-15', '2026-08-15', 14), true, 'hari ini masuk jendela');
eq(dalamJendelaYatim('2026-08-02', '2026-08-15', 14), true, 'tepat 13 hari lalu masuk');
eq(dalamJendelaYatim('2026-08-01', '2026-08-15', 14), false, '14 hari lalu di luar jendela');
eq(dalamJendelaYatim('2026-08-16', '2026-08-15', 14), false, 'masa depan di luar jendela');
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `npm run test-shakwa`
Expected: FAIL kompilasi — `dalamJendelaYatim` belum ada.

- [ ] **Step 3: Tambah helper murni**

`src/lib/shakwa-izin.ts`:

```ts
/**
 * Apakah tanggal izin masih dalam jendela pantau yatim: antara (today - hari)
 * eksklusif dan today inklusif. Membatasi daftar agar izin lama tak menumpuk.
 * Semua argumen ISO date "YYYY-MM-DD" (perbandingan leksikografis aman).
 */
export function dalamJendelaYatim(tanggal: string, today: string, hari: number): boolean {
  if (tanggal > today) return false;
  const batas = new Date(`${today}T00:00:00Z`);
  batas.setUTCDate(batas.getUTCDate() - hari);
  const batasISO = batas.toISOString().slice(0, 10);
  return tanggal > batasISO;
}
```

- [ ] **Step 4: Jalankan tes, pastikan lulus**

Run: `npm run test-shakwa`
Expected: PASS semua.

- [ ] **Step 5: Tambah `getIzinYatim` (wrapper DB)**

`src/lib/shakwa-izin.ts`:

```ts
export type IzinYatimRow = {
  id: string;
  nomorTiket: string;
  pengajarNama: string;
  tanggal: string;
  jenis: ShakwaIzinJenis;
  menit: number | null;
  jadwalGanti: string | null;
  halaqahNama: string | null;
};

/**
 * Izin yang belum ke-match tabayyun apa pun (dipakai_tabayyun_id null) dalam
 * jendela pantau. Menandakan pengajar melapor tapi ketua tak mencatat
 * pelanggaran cocok — discrepancy yang perlu dilihat koordinator observasi.
 * Scope gender via pengajar.gender.
 */
export async function getIzinYatim(
  viewGender: 'ikhwan' | 'akhwat',
  today: string,
  hari = 14
): Promise<IzinYatimRow[]> {
  const { data, error } = await supabaseAdmin
    .from('shakwa_izin')
    .select(
      `id, tanggal, jenis, menit, jadwal_ganti,
       shakwa:shakwa_id(nomor_tiket),
       pengajar:pengajar_id(name, gender),
       halaqah:halaqah_id(name)`
    )
    .is('dipakai_tabayyun_id', null)
    .lte('tanggal', today)
    .order('tanggal', { ascending: false });
  if (error) {
    console.error('getIzinYatim: gagal query', error);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    tanggal: string;
    jenis: ShakwaIzinJenis;
    menit: number | null;
    jadwal_ganti: string | null;
    shakwa: { nomor_tiket: string } | null;
    pengajar: { name: string; gender: string } | null;
    halaqah: { name: string } | null;
  }>;

  return rows
    .filter((r) => r.pengajar?.gender === viewGender && dalamJendelaYatim(r.tanggal, today, hari))
    .map((r) => ({
      id: r.id,
      nomorTiket: r.shakwa?.nomor_tiket ?? '—',
      pengajarNama: r.pengajar?.name ?? '—',
      tanggal: r.tanggal,
      jenis: r.jenis,
      menit: r.menit,
      jadwalGanti: r.jadwal_ganti,
      halaqahNama: r.halaqah?.name ?? null,
    }));
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: tanpa error.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shakwa-izin.ts scripts/test-shakwa.ts
git commit -m "feat(shakwa-izin): getIzinYatim + helper jendela untuk panel discrepancy"
```

---

## Task 6: Panel "Izin belum ke-match" di dashboard koordinator (Bagian 2)

**Files:**
- Modify: `src/app/observasi/koordinator/page.tsx`

Verifikasi = `npm run typecheck` + `npm run lint`.

- [ ] **Step 1: Import + ambil data**

`src/app/observasi/koordinator/page.tsx` — tambah import:

```ts
import { getIzinYatim } from '@/lib/shakwa-izin';
import { IZIN_JENIS_LABEL } from '@/lib/shakwa';
```

Di dalam komponen, setelah `viewGender` dan `today` ditetapkan (lihat `page.tsx:37,54`), ambil data:

```ts
  const izinYatim = await getIzinYatim(viewGender, today);
```

(`today` sudah dihitung sebagai `jakartaToday()` di `page.tsx:37`; pakai variabel itu.)

- [ ] **Step 2: Render panel**

Tambah blok JSX di dekat panel tabayyun (setelah bagian tabayyun, sebelum penutup). Ikuti kelas/utility yang dipakai kartu lain di file ini:

```tsx
      {izinYatim.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-amber-900">
            Izin belum ke-match ({izinYatim.length})
          </h2>
          <p className="mb-3 text-xs text-amber-700">
            Pengajar melapor izin lewat Shakwa, tapi belum tertaut ke tabayyun mana pun.
            Cek apakah observasi hari itu sudah/perlu dicatat.
          </p>
          <ul className="divide-y divide-amber-200 text-sm">
            {izinYatim.map((iz) => (
              <li key={iz.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-medium">{iz.pengajarNama}</span>
                <span className="text-gray-600">{iz.tanggal}</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  {IZIN_JENIS_LABEL[iz.jenis]}
                  {iz.menit != null ? ` · ${iz.menit} mnt` : ''}
                  {iz.jadwalGanti ? ` · ganti ${iz.jadwalGanti}` : ''}
                </span>
                {iz.halaqahNama && <span className="text-gray-500">{iz.halaqahNama}</span>}
                <span className="ml-auto text-xs text-gray-400">{iz.nomorTiket}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
```

Sesuaikan className bila konvensi file berbeda (mis. komponen kartu khusus). Panel disembunyikan saat kosong.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: tanpa error.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: tanpa error baru.

- [ ] **Step 5: Commit**

```bash
git add src/app/observasi/koordinator/page.tsx
git commit -m "feat(observasi): panel izin belum ke-match di dashboard koordinator"
```

---

## Verifikasi akhir (manual, DB nyata)

Jalankan setelah semua task. Butuh `.env.local` + data uji.

- [ ] `npm run typecheck` bersih.
- [ ] `npm run lint` bersih.
- [ ] `npm run test-shakwa` lulus semua.
- [ ] Skenario reverse-link: ketua isi observasi KMT tgl X (tabayyun `pending`) → pengajar kirim izin KMT tgl X → cek `hits_tabayyun` jadi `awaiting_reason`, `alasan_pengajar` berpenanda `[Izin pra-kelas ...]`, `shakwa_izin.dipakai_tabayyun_id` terisi.
- [ ] Skenario forward (regresi): pengajar kirim izin dulu → ketua isi observasi → tetap `awaiting_reason` (perilaku lama).
- [ ] Skenario "tak menimpa": tabayyun sudah `awaiting_reason`/`decided` → izin baru tak mengubahnya.
- [ ] Skenario yatim: izin tgl X, ketua catat bersih (tak ada tabayyun) → muncul di panel dashboard, gender benar, di luar 14 hari tak muncul.
- [ ] Form: talikasih `sudah_presensi` & izin `sudah_info_koordinator` hanya menampilkan "Sudah"; submit tanpa memilih ditolak; `punya_rekening_cimb` masih ada "Belum".
