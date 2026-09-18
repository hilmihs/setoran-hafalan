# Halaqah Tahfizh Akhwat — takhassus & At-Tibyan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kolom `program_kelas.ikut_tibyan` supaya kelas halaqah per-hari tak lagi menagih At-Tibyan Sabtu, plus SQL rilis prod yang mencabut anggota takhassus dari halaqah, me-rename kelas, dan membuat satu kelas At-Tibyan gabungan (ketua Annidaul Jannah).

**Architecture:** Satu kolom boolean ber-default `true` (kelas lama tak berubah). Satu-satunya titik logika adalah `expectedDaysForKelas` di `src/lib/maahir-presensi.ts`; semua tagihan/rekap/laporan lewat fungsi itu. Sisanya memuat kolom baru ke `ProgramKelasRow` di tiga query kelas dan ke registry API publik. Perubahan data prod ditulis sebagai berkas SQL yang dijalankan pemilik lewat `npm run db`.

**Tech Stack:** Next.js 14 (App Router), TypeScript, node-postgres lewat shim `supabaseAdmin`, skrip uji `tsx` (PGlite untuk yang butuh DB). Spec: `docs/superpowers/specs/2026-09-18-halaqah-tahfizh-akhwat-presensi-design.md`.

**Worktree:** `.claude/worktrees/halaqah-tahfizh`, branch `feat/halaqah-tahfizh-akhwat` (dari `maheer/main`). Jalankan `npm install` sekali di worktree sebelum Task 1 (belum ada `node_modules`). Verifikasi hanya `npm run typecheck` + skrip `test-*`; `npm run lint` rusak (jangan dipakai).

---

### Task 1: Migrasi `0083_program_kelas_ikut_tibyan.sql`

**Files:**
- Create: `supabase/migrations/0083_program_kelas_ikut_tibyan.sql`

- [ ] **Step 1: Pastikan nomor 0083 masih bebas di semua cabang**

Run: `git log --all --name-only --format= -- supabase/migrations | grep -oE '^supabase/migrations/008[0-9]_[^ ]+' | sort -u`
Expected: hanya `0080`, `0081`, `0082_matrix_blok_akhwat.sql`. Bila `0083_*` sudah muncul, pakai nomor berikutnya yang bebas dan ganti semua sebutan `0083` di plan ini.

- [ ] **Step 2: Tulis berkas migrasi**

```sql
-- Kelas yang tidak ditagih sesi At-Tibyan Sabtu.
--
-- expectedDaysForKelas (src/lib/maahir-presensi.ts) menyisipkan satu sesi
-- at_tibyan tiap Sabtu untuk semua kelas ber-presensi_sifat 'harian'. Sejak
-- halaqah akhwat dipecah per hari (10 kelas, satu orang bisa di 5 kelas),
-- satu Sabtu tertagih 5x dan satu alpa terhitung 5x di SP. Kelas-kelas itu
-- diberi ikut_tibyan=false; At-Tibyan mereka dicatat lewat satu kelas gabungan
-- tanpa jadwal_hari. Default true = kelas lama tak berubah.
begin;

alter table program_kelas
  add column if not exists ikut_tibyan boolean not null default true;

comment on column program_kelas.ikut_tibyan is
  'Bila false, kelas ini tidak ditagih sesi At-Tibyan Sabtu (At-Tibyan-nya dicatat lewat kelas lain).';

commit;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0083_program_kelas_ikut_tibyan.sql
git commit -m "feat(presensi): kolom program_kelas.ikut_tibyan (migrasi 0083)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Muat `ikut_tibyan` ke `ProgramKelasRow`, query kelas, dan API publik

**Files:**
- Modify: `src/lib/program-kelas.ts` (tipe `ProgramKelasRow` ±baris 47–60, konstanta `PK_COLS` ±baris 62)
- Modify: `src/lib/maahir-rekap.ts` ±baris 112–114
- Modify: `src/lib/laporan-maahir.ts` ±baris 230–233
- Modify: `src/lib/api-public/registry.ts` ±baris 38–46

- [ ] **Step 1: Tambah field ke tipe dan `PK_COLS` di `src/lib/program-kelas.ts`**

Ubah tipe:

```ts
export type ProgramKelasRow = {
  id: string;
  name: string;
  gender: 'ikhwan' | 'akhwat';
  jadwal_hari: string[];
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  ketua_wa: string | null;
  wakil_wa: string | null;
  self_attendance: boolean;
  presensi_sifat: 'harian' | 'mingguan';
  /** Kelas mulai berjalan; presensi sebelum tanggal ini tak diminta. */
  mulai_tanggal: string | null;
  /**
   * false = kelas tidak ditagih sesi At-Tibyan Sabtu. Dipakai kelas halaqah
   * per-hari akhwat yang At-Tibyan-nya dicatat lewat satu kelas gabungan.
   */
  ikut_tibyan: boolean;
};

const PK_COLS = 'id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat, mulai_tanggal, ikut_tibyan';
```

- [ ] **Step 2: Tambah kolom di query kelas `src/lib/maahir-rekap.ts`**

Ganti baris `.select('id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat, mulai_tanggal')` menjadi:

```ts
    .select('id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat, mulai_tanggal, ikut_tibyan')
```

- [ ] **Step 3: Tambah kolom di query kelas `src/lib/laporan-maahir.ts`**

Ganti string di dalam `.select(` pada blok `// 1. Kelas` menjadi:

```ts
    .select(
      'id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat, mulai_tanggal, ikut_tibyan'
    )
```

- [ ] **Step 4: Tambah kolom + filter di registry API publik `src/lib/api-public/registry.ts`**

Entitas `program-kelas` menjadi:

```ts
    route: 'program-kelas', table: 'program_kelas', scope: 'maahir',
    columns: ['id', 'name', 'gender', 'jadwal_hari', 'waktu_mulai', 'waktu_selesai', 'self_attendance', 'presensi_sifat', 'ikut_tibyan', 'created_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'self_attendance', column: 'self_attendance', kind: 'bool' },
      { param: 'presensi_sifat', column: 'presensi_sifat', kind: 'eq' },
      { param: 'ikut_tibyan', column: 'ikut_tibyan', kind: 'bool' },
    ],
    order: { column: 'created_at', dir: 'desc' },
```

- [ ] **Step 5: Cari literal `ProgramKelasRow` lain yang kini kurang field**

Run: `npm run typecheck`
Expected: PASS. Bila ada galat "Property 'ikut_tibyan' is missing", tambahkan `ikut_tibyan: true` pada literal tersebut (skrip uji yang membangun schema PGlite tidak membuat literal TS, jadi seharusnya tidak ada).

- [ ] **Step 6: Tambah `ikut_tibyan` ke dokumentasi API publik**

Di `docs/API-PUBLIC.md`, pada daftar kolom entitas `program-kelas`, tambahkan baris `ikut_tibyan` (boolean; filter `?ikut_tibyan=true|false`). Cari dengan `grep -n "presensi_sifat" docs/API-PUBLIC.md` dan sisipkan di sebelahnya dengan format yang sama.

- [ ] **Step 7: Commit**

```bash
git add src/lib/program-kelas.ts src/lib/maahir-rekap.ts src/lib/laporan-maahir.ts src/lib/api-public/registry.ts docs/API-PUBLIC.md
git commit -m "feat(presensi): muat ikut_tibyan ke ProgramKelasRow, rekap, laporan, API publik

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `expectedDaysForKelas` menghormati `ikut_tibyan` (TDD, uji murni)

**Files:**
- Create: `scripts/test-presensi-tibyan.ts`
- Modify: `package.json` (blok `scripts`)
- Modify: `src/lib/maahir-presensi.ts` (fungsi `expectedDaysForKelas`, cabang harian ±baris 214–236)

- [ ] **Step 1: Tulis skrip uji murni (tanpa DB)**

`getPool()` di `pg-core.ts` malas (lazy), jadi mengimpor `@/lib/maahir-presensi` tanpa `DATABASE_URL` aman.

```ts
// Uji murni expectedDaysInRange terhadap kolom program_kelas.ikut_tibyan.
// Jalankan: npm run test-presensi-tibyan
import { expectedDaysInRange } from '@/lib/maahir-presensi';
import type { ProgramKelasRow } from '@/lib/program-kelas';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

function kelas(over: Partial<ProgramKelasRow>): ProgramKelasRow {
  return {
    id: 'k1',
    name: 'Uji',
    gender: 'akhwat',
    jadwal_hari: ['Senin'],
    waktu_mulai: '09:00:00',
    waktu_selesai: '11:30:00',
    ketua_wa: null,
    wakil_wa: null,
    self_attendance: false,
    presensi_sifat: 'harian',
    mulai_tanggal: null,
    ikut_tibyan: true,
    ...over,
  };
}

// Senin 14 Sep 2026 s/d Ahad 27 Sep 2026: 2 Senin, 2 Sabtu (19 & 26).
const DARI = '2026-09-14';
const SAMPAI = '2026-09-27';

console.log('kelas harian default (ikut_tibyan=true)');
{
  const d = expectedDaysInRange(kelas({}), DARI, SAMPAI);
  const maahir = d.filter((x) => x.program === 'kelas_maahir').map((x) => x.tanggal);
  const tibyan = d.filter((x) => x.program === 'at_tibyan').map((x) => x.tanggal);
  check('2 sesi kelas_maahir (Senin 14 & 21)', maahir.join(',') === '2026-09-14,2026-09-21', maahir.join(','));
  check('2 sesi at_tibyan (Sabtu 19 & 26)', tibyan.join(',') === '2026-09-19,2026-09-26', tibyan.join(','));
}

console.log('kelas harian ikut_tibyan=false');
{
  const d = expectedDaysInRange(kelas({ ikut_tibyan: false }), DARI, SAMPAI);
  const maahir = d.filter((x) => x.program === 'kelas_maahir').map((x) => x.tanggal);
  const tibyan = d.filter((x) => x.program === 'at_tibyan');
  check('sesi kelas_maahir tetap 2', maahir.join(',') === '2026-09-14,2026-09-21', maahir.join(','));
  check('tak ada sesi at_tibyan', tibyan.length === 0, `dapat ${tibyan.length}`);
}

console.log('kelas At-Tibyan gabungan (jadwal_hari kosong, ikut_tibyan=true)');
{
  const d = expectedDaysInRange(kelas({ jadwal_hari: [] }), DARI, SAMPAI);
  const maahir = d.filter((x) => x.program === 'kelas_maahir');
  const tibyan = d.filter((x) => x.program === 'at_tibyan');
  check('tak ada sesi kelas_maahir', maahir.length === 0, `dapat ${maahir.length}`);
  check('2 sesi at_tibyan', tibyan.length === 2, `dapat ${tibyan.length}`);
  check('jam At-Tibyan 08:30–10:30', tibyan.every((x) => x.waktu_mulai === '08:30' && x.waktu_selesai === '10:30'));
}

console.log('libur Sabtu 19 Sep tetap dihormati');
{
  const d = expectedDaysInRange(kelas({ jadwal_hari: [] }), DARI, SAMPAI, new Set(['2026-09-19']));
  const tibyan = d.filter((x) => x.program === 'at_tibyan').map((x) => x.tanggal);
  check('hanya Sabtu 26', tibyan.join(',') === '2026-09-26', tibyan.join(','));
}

console.log('mingguan tak tersentuh (tanpa At-Tibyan, apa pun ikut_tibyan)');
{
  const d = expectedDaysInRange(kelas({ presensi_sifat: 'mingguan', ikut_tibyan: true }), DARI, SAMPAI);
  check('2 slot pekan, semua kelas_maahir', d.length === 2 && d.every((x) => x.program === 'kelas_maahir' && x.mingguan));
}

console.log(`\n${passed} lulus, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Daftarkan di `package.json`**

Di blok `"scripts"`, tepat setelah baris `"test-target": "tsx scripts/test-setoran-target.ts",` tambahkan:

```json
    "test-presensi-tibyan": "tsx scripts/test-presensi-tibyan.ts",
```

- [ ] **Step 3: Jalankan, pastikan GAGAL di kasus `ikut_tibyan=false`**

Run: `npm run test-presensi-tibyan`
Expected: `✗ tak ada sesi at_tibyan dapat 2` (kolom belum dibaca), kasus lain lulus. Exit code 1.

- [ ] **Step 4: Implementasi di `src/lib/maahir-presensi.ts`**

Di `expectedDaysForKelas`, cabang harian, ganti blok `if (hari === TIBYAN_HARI) {` menjadi:

```ts
    // Kelas ber-ikut_tibyan=false (halaqah per-hari akhwat) tak menagih Sabtu;
    // At-Tibyan mereka dicatat lewat satu kelas gabungan supaya orang yang ada
    // di beberapa kelas tak tertagih dan terhitung berulang.
    if (hari === TIBYAN_HARI && k.ikut_tibyan !== false) {
```

Sisa isi blok tidak berubah. Perbarui juga komentar di atas loop harian:

```ts
  // Harian: tiap hari jadwal + At-Tibyan tiap Sabtu (bila ikut_tibyan), kecuali tanggal libur.
```

- [ ] **Step 5: Jalankan, pastikan LULUS**

Run: `npm run test-presensi-tibyan`
Expected: semua `✓`, baris akhir `9 lulus, 0 gagal`, exit 0.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS tanpa keluaran galat.

- [ ] **Step 7: Commit**

```bash
git add scripts/test-presensi-tibyan.ts package.json src/lib/maahir-presensi.ts
git commit -m "feat(presensi): kelas ikut_tibyan=false tak ditagih sesi At-Tibyan Sabtu

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Skema PGlite di skrip uji ikut kolom baru

Empat skrip uji membangun tabel `program_kelas` sendiri di PGlite; setelah Task 2, `laporan-maahir`/`maahir-rekap`/`PK_COLS` men-`select ikut_tibyan` dan akan gagal `column "ikut_tibyan" does not exist` bila skemanya tak diperbarui.

**Files:**
- Modify: `scripts/test-setoran-target.ts` ±baris 72–74
- Modify: `scripts/test-sp-pemutihan.ts` ±baris 31–33
- Modify: `scripts/test-bulk-pemutihan.ts` ±baris 30–32
- Modify: `scripts/test-checkin-pengajar.ts` ±baris 32–34

- [ ] **Step 1: Jalankan uji dulu untuk melihat kegagalan**

Run: `npm run test-target`
Expected: gagal dengan pesan yang memuat `ikut_tibyan` (kolom tak ada di PGlite). Bila justru lulus, periksa apakah Task 2 benar-benar mengubah query `laporan-maahir.ts`.

- [ ] **Step 2: Tambah kolom di keempat skema**

Di setiap berkas, pada `CREATE TABLE program_kelas (...)`, ganti dua baris:

```sql
  presensi_sifat text NOT NULL DEFAULT 'harian',
  mulai_tanggal date
```

menjadi:

```sql
  presensi_sifat text NOT NULL DEFAULT 'harian',
  mulai_tanggal date,
  ikut_tibyan boolean NOT NULL DEFAULT true
```

Lakukan di `scripts/test-setoran-target.ts`, `scripts/test-sp-pemutihan.ts`, `scripts/test-bulk-pemutihan.ts`, `scripts/test-checkin-pengajar.ts`. Cek tak ada yang terlewat: `grep -L "ikut_tibyan" scripts/test-setoran-target.ts scripts/test-sp-pemutihan.ts scripts/test-bulk-pemutihan.ts scripts/test-checkin-pengajar.ts` harus mencetak kosong.

- [ ] **Step 3: Jalankan keempat skrip**

Run:
```bash
npm run test-target && npm run test-sp && npm run test-bulk && npm run test-checkin-pengajar
```
Expected: masing-masing berakhir `N lulus, 0 gagal`. Khusus `test-target`, angka 21 sesi takhassus ikhwan harus tetap (penjaga At-Tibyan tak masuk penyebut target).

- [ ] **Step 4: Commit**

```bash
git add scripts/test-setoran-target.ts scripts/test-sp-pemutihan.ts scripts/test-bulk-pemutihan.ts scripts/test-checkin-pengajar.ts
git commit -m "test: skema PGlite program_kelas ikut kolom ikut_tibyan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Berkas SQL rilis prod

Perubahan data prod ditulis sebagai satu berkas berisi langkah bernomor. Setiap langkah dijalankan pemilik lewat `npm run db -- "<SQL>" -- --confirm` (asisten diblokir menjalankan `--confirm`). Endpoint admin membungkus tx sendiri, jadi **tanpa** `begin;`/`commit;`. Jangan pakai `WITH` di awal statement tulis (dipaksa READ ONLY).

**Files:**
- Create: `scripts/sql/0083-rilis-halaqah-tahfizh-akhwat.sql`

- [ ] **Step 1: Pastikan folder ada**

Run: `ls scripts/sql/ | head`
Expected: ada berkas `0076-rilis-*` (pola yang diikuti). Bila folder tak ada, buat: `mkdir -p scripts/sql`.

- [ ] **Step 2: Tulis berkas**

```sql
-- Rilis prod: Halaqah Tahfizh akhwat — cabut takhassus, rename, At-Tibyan gabungan.
-- Spec: docs/superpowers/specs/2026-09-18-halaqah-tahfizh-akhwat-presensi-design.md
--
-- Urutan WAJIB: [A] DDL 0083 → deploy kode → [B] cabut takhassus → [C] rename
-- → [D] ikut_tibyan=false → [E] kelas At-Tibyan → [F] anggota → [G] verifikasi.
-- Tiap langkah = satu pemanggilan:  npm run db -- "<SQL>" -- --confirm
-- (preview dulu tanpa --confirm; cocokkan wouldAffect dengan angka di komentar).

-- ============================================================
-- [A] DDL 0083 — SEBELUM deploy kode. wouldAffect: 0 (DDL).
-- ============================================================
alter table program_kelas add column if not exists ikut_tibyan boolean not null default true;

-- (opsional, pemanggilan terpisah)
comment on column program_kelas.ikut_tibyan is 'Bila false, kelas ini tidak ditagih sesi At-Tibyan Sabtu (At-Tibyan-nya dicatat lewat kelas lain).';

-- ============================================================
-- [B] Cabut anggota takhassus dari kelas halaqah. Harapan: 8 baris.
--     Salma 6282136573097: Pagi Selasa, Pagi Jum'at, Siang Selasa
--     Radiatam 6281261306563: Pagi Rabu, Pagi Jum'at
--     Annida 6285788064547: Siang Senin, Siang Rabu, Siang Jum'at
-- ============================================================
update program_kelas_anggota a
   set active = false
  from program_kelas k
 where k.id = a.program_kelas_id
   and k.gender = 'akhwat'
   and k.name like 'Maahir Halaqah %'
   and a.active
   and a.whatsapp_number in ('6282136573097', '6281261306563', '6285788064547');

-- ============================================================
-- [C] Rename 10 kelas. Harapan: 10 baris.
-- ============================================================
update program_kelas
   set name = replace(replace(name, 'Maahir Halaqah Pagi (', 'Maahir Halaqah Tahfizh Pagi ('),
                              'Maahir Halaqah Siang (', 'Maahir Halaqah Tahfizh Siang (')
 where gender = 'akhwat'
   and (name like 'Maahir Halaqah Pagi (%' or name like 'Maahir Halaqah Siang (%');

-- ============================================================
-- [D] ikut_tibyan=false: 10 halaqah + Takhassus Akhwat. Harapan: 11 baris.
-- ============================================================
update program_kelas
   set ikut_tibyan = false
 where gender = 'akhwat'
   and (name like 'Maahir Halaqah Tahfizh Pagi (%'
        or name like 'Maahir Halaqah Tahfizh Siang (%'
        or name = 'Maahir Takhassus Akhwat');

-- ============================================================
-- [E] Kelas At-Tibyan gabungan. Harapan: 1 baris.
--     ketua_wa = Annidaul Jannah. ikut_tibyan default true.
-- ============================================================
insert into program_kelas
  (name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa,
   self_attendance, presensi_sifat, mulai_tanggal)
values
  ('Maahir Halaqah Tahfizh (At-Tibyan)', 'akhwat', '{}', '08:30', '10:30',
   '6285788064547', null, false, 'harian', '2026-09-15');

-- ============================================================
-- [F] Anggota kelas At-Tibyan: 24 unik dari 10 halaqah (sesudah [B]) + 4
--     takhassus. Harapan: 28 baris. Kunci unik = WA, atau nama bila WA null
--     (Khoirun Nisa). Annida is_ketua.
-- ============================================================
insert into program_kelas_anggota
  (program_kelas_id, peserta_id, name, whatsapp_number, is_ketua, is_wakil, active, mulai_tanggal)
select
  (select id from program_kelas where name = 'Maahir Halaqah Tahfizh (At-Tibyan)'),
  s.peserta_id, s.name, s.whatsapp_number,
  coalesce(s.whatsapp_number = '6285788064547', false) as is_ketua,
  false, true, '2026-09-15'
from (
  select distinct on (coalesce(a.whatsapp_number, 'nama:' || a.name))
         a.peserta_id, a.name, a.whatsapp_number
    from program_kelas_anggota a
    join program_kelas k on k.id = a.program_kelas_id
   where k.gender = 'akhwat'
     and a.active
     and (k.name like 'Maahir Halaqah Tahfizh Pagi (%'
          or k.name like 'Maahir Halaqah Tahfizh Siang (%'
          or k.name = 'Maahir Takhassus Akhwat')
   order by coalesce(a.whatsapp_number, 'nama:' || a.name), a.created_at
) s;

-- ============================================================
-- [G] Verifikasi (READ, tanpa --confirm)
-- ============================================================
-- 11 baris ikut_tibyan=false, semuanya akhwat:
select name, ikut_tibyan from program_kelas where ikut_tibyan = false order by name;
-- 28 anggota, 1 ketua (Annidaul Jannah):
select count(*) n, count(*) filter (where is_ketua) ketua
  from program_kelas_anggota a join program_kelas k on k.id = a.program_kelas_id
 where k.name = 'Maahir Halaqah Tahfizh (At-Tibyan)' and a.active;
-- 0 baris: takhassus tak lagi aktif di halaqah per-hari:
select k.name, a.name from program_kelas_anggota a join program_kelas k on k.id = a.program_kelas_id
 where (k.name like 'Maahir Halaqah Tahfizh Pagi (%' or k.name like 'Maahir Halaqah Tahfizh Siang (%')
   and a.active and a.whatsapp_number in ('6282136573097','6281261306563','6285788064547');
-- 0 baris: tak ada nama halaqah lama tersisa:
select name from program_kelas where name like 'Maahir Halaqah Pagi (%' or name like 'Maahir Halaqah Siang (%';
```

- [ ] **Step 3: Uji berkas SQL di PGlite secara lokal (tanpa prod)**

Buat skrip sekali pakai di scratchpad (bukan di repo) yang: memuat PGlite, membuat tabel `program_kelas` + `program_kelas_anggota` dengan kolom seperti di `scripts/test-setoran-target.ts` (termasuk `ikut_tibyan`, `active boolean default true`, `mulai_tanggal`, `peserta_id uuid`), menyisipkan 3 kelas contoh (`Maahir Halaqah Pagi (Selasa)`, `Maahir Halaqah Siang (Senin)`, `Maahir Takhassus Akhwat`) dan beberapa anggota termasuk Salma (`6282136573097`) di Pagi Selasa & Takhassus, Annida di Siang Senin & Takhassus, dan satu anggota ber-WA null; lalu menjalankan langkah [B]–[F] berurutan dan mencetak hasil [G]. Harapan: [B] menonaktifkan 2 baris, [C] 2 baris, [D] 3 baris, [E] 1, [F] = jumlah orang unik; tak ada galat sintaks.

Simpan sebagai `/tmp/claude-1000/-data-Downloads-04-Dev-Projects-setoran-hafalan-skeleton-setoran-hafalan/04d1a9dc-fd50-4ab6-8ff3-67334cd0cd81/scratchpad/uji-0083.ts` (impor `@electric-sql/pglite` dari `node_modules` worktree; jalankan dari worktree agar resolusi modul jalan).

Run: `npx tsx <path skrip di atas>`
Expected: semua angka sesuai; skrip ini tidak di-commit.

- [ ] **Step 4: Commit**

```bash
git add scripts/sql/0083-rilis-halaqah-tahfizh-akhwat.sql
git commit -m "chore(sql): rilis prod Halaqah Tahfizh akhwat — takhassus, rename, At-Tibyan gabungan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Rilis (dijalankan pemilik; asisten menyiapkan & memverifikasi)

**Files:** tidak ada perubahan kode.

- [ ] **Step 1: DDL [A] di prod, sebelum deploy**

Pemilik menjalankan (prefiks `!` di prompt):

```bash
npm run db -- "alter table program_kelas add column if not exists ikut_tibyan boolean not null default true" -- --confirm
```

Verifikasi (asisten boleh): `npm run db -- "select column_name, column_default from information_schema.columns where table_name='program_kelas' and column_name='ikut_tibyan'"` → 1 baris, default `true`.

- [ ] **Step 2: Merge ke `main` dan push ke `maheer`**

Cek dulu `git log --oneline maheer/main -1` = leluhur branch ini (jangan deploy dari `main` lokal yang tertinggal). Lalu fast-forward `main` lokal ke branch ini dan `git push maheer main`. Pipeline mematikan service ±2 menit (502 normal). Tunggu `/api/health` 200.

- [ ] **Step 3: DML [B]–[F] di prod, berurutan**

Untuk tiap langkah: preview tanpa `--confirm`, cocokkan `wouldAffect` (8, 10, 11, 1, 28), lalu jalankan ulang dengan `-- --confirm`. Bila `fetch failed`, prod lambat — ulangi (atau `curl --max-time 60`).

- [ ] **Step 4: Verifikasi [G] + uji tampilan**

Jalankan empat SELECT di [G]. Lalu, sebagai superadmin, "login sebagai" Annidaul Jannah → `/2in1/ketua-kelas` menampilkan satu kelas `Maahir Halaqah Tahfizh (At-Tibyan)`; tagihan At-Tibyan pertama muncul Sabtu 19 Sep (sebelumnya "presensi lengkap"). "Login sebagai" Ruqayyah → tagihan hanya Senin–Jum'at, tak ada Sabtu. Salma → Takhassus tanpa Sabtu.

- [ ] **Step 5: Catat memori & beri tahu**

Perbarui memori proyek: kelas At-Tibyan gabungan akhwat (ketua Annida), kolom `ikut_tibyan`, dan aturan "takhassus tidak ada di halaqah". Beri tahu Annida, Salma, dan Ruqayyah lewat koordinator akhwat.
