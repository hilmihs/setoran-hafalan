# HITS F3 — Tabayyun Lifecycle & Ghosting (Design)

**Tanggal**: 2026-07-06
**Fase**: F3 (dari program HITS observasi; F0/F1/F2 selesai)
**Status**: disetujui user, siap tahap plan

## Konteks

Program multi-fase HITS observasi (ketua kelas amati pengajar → tabayyun → koordinator
ketua kelas → nilai). Fase sebelumnya:

- **F1** (selesai, prod): mesin observasi multi-pelanggaran (`hits_pelanggaran`), 1 tabayyun
  per pertemuan me-list semua pelanggaran.
- **F2** (selesai, prod): hutang menit + ledger (`hits_hutang_bayar`), prompt bayar manual.
  Otomasi auto-tabayyun/cron **sengaja ditunda ke F3**.

**F3** menutup lifecycle tabayyun sisi eskalasi: pengajar yang diingatkan tapi tak merespons
dalam **72 jam** dianggap **ghosting** = tak ada udzur syar'i → teguran otomatis + notifikasi WA
bertanggal real.

### Sistem tabayyun saat ini

Tabel `hits_tabayyun` (relevan):
`id, keterangan_id, halaqah_id, pengajar_id, koordinator_kk_id, kondisi (text),
alasan_pengajar, alasan_submitted_at, is_udzur_syari, keputusan_catatan, decided_at,
status, deadline_at, created_at`.

Status: `pending` (dibuat, pengajar belum kasih alasan) → `awaiting_reason` (pengajar submit
alasan, tunggu keputusan koordinator) → `decided` (koordinator putuskan udzur/non).

- Dibuat di `submitKeteranganHarian` (`src/app/hits/ketua/actions.ts`) saat ada pelanggaran;
  insert **tak** set `deadline_at` (mengandalkan default DB lama +48h).
- Pengajar isi alasan (`src/app/hits/pengajar/actions.ts`) → set `alasan_submitted_at`,
  `status='awaiting_reason'`.
- Koordinator `decideTabayyun` (`src/app/observasi/koordinator/actions.ts`) → set
  `is_udzur_syari`, `status='decided'`, `decided_at`; bila non-udzur → insert `hits_teguran`
  (idempoten per tabayyun).
- Reminder WA `reminderTabayyunPengajar` (koordinator) hanya bangun link `wa.me` + `logWaReminder`;
  **tak** ubah status/deadline.

**Aging saat ini UI-only, tak ada cron/auto-teguran ghosting.**

### Efek ke nilai matrix (kenapa cukup set field)

`matrix-compute.ts`:
- **Anti-Mangkir → `komitmen_jadwal`** membaca `hits_tabayyun WHERE status='decided' AND
  is_udzur_syari=false` (bulan berjalan) → makin banyak → `tegTo4()` turunkan skor. Query tak
  filter kondisi (semua non-udzur masuk).
- `hits_teguran` feed tally teguran (4-teguran → nonaktif) + kolom risk (`risk.ts`), terpisah
  dari angka skor.

Eskalasi ghosting set persis `status='decided'`, `is_udzur_syari=false`, `decided_at=now` +
insert `hits_teguran` → **dua efek otomatis, tanpa ubah matrix-compute**.

## Keputusan terkunci (dari brainstorm)

1. **Runner = compute-on-action**, bukan cron, bukan on-dashboard-open. Eskalasi dievaluasi saat
   koordinator klik tombol tabayyun. Alasan: app tak punya cron infra; koordinator = detak jantung;
   kadang koordinator bisa lihat dashboard tapi belum bisa action. Tanpa klik koordinator, tak ada
   auto — sesuai prinsip "hasil observasi tak hilang sebelum koordinator kirim reminder WA".
2. **Satu timer 72 jam** = 3 hari, kalibrasi **jam** (bukan hari kalender), dihitung sejak
   `reminder_sent_at`. `72h no-respons` dan `ghosting 3 hari` di plan = **hal yang sama** (jalur
   no-alasan), bukan dua ambang.
3. **Tombol berubah state**: `<72h` no-alasan = "Ingatkan lagi"; `≥72h` no-alasan = "Teguran
   ghosting" (klik = commit teguran + template).
4. **Model data A**: kolom baru `reminder_sent_at timestamptz null`. `deadline_at` di-set = 
   `reminder_sent_at + 72h` saat reminder pertama.
5. **Reminder ulang dalam window TAK reset** jam 72h (deadline asli tetap).
6. Ghosting hanya jalur **no-alasan** (`status='pending'`). Bila pengajar sudah submit alasan
   (`status='awaiting_reason'`), tetap jalur manual `decideTabayyun` (udzur/non) — **tak** kena ghosting.

## Arsitektur

### 1. Migration `0038_hits_tabayyun_reminder_sent.sql`

```sql
alter table hits_tabayyun add column reminder_sent_at timestamptz;
```

Nullable. Null = koordinator belum kirim reminder tabayyun → jam belum jalan. Tambah
`reminder_sent_at: string | null` ke `HitsTabayyun` di `src/types/db.ts`.

### 2. State machine (jam = `reminder_sent_at`)

```
pending, reminder_sent_at=null      → observasi tersimpan, JAM BELUM JALAN
   (koordinator klik "Kirim reminder tabayyun")
pending, sent, now < deadline_at    → menunggu alasan; tombol "Ingatkan lagi" (resend, jam tetap)
pending, sent, now >= deadline_at   → GHOSTING; tombol "Teguran ghosting"
awaiting_reason (alasan masuk)      → jalur manual decideTabayyun (udzur/non); TAK kena ghosting
decided                             → selesai
```

### 3. Helper murni `tabayyunGhostingState(tab, nowIso)` (`src/lib/hits-tabayyun.ts`, baru)

Return salah satu: `'not_reminded' | 'awaiting_within' | 'ghosting' | 'has_reason' | 'decided'`.
Murni (input tab + now, tanpa I/O) → mudah diuji tsx. Dipakai server action (guard) + UI (label
tombol/badge). Sertakan helper turunan: sisa/lewat jam untuk badge countdown.

### 4. Refactor `issueTeguranForTabayyun(tab, { isUdzur, catatan, actor })`

Cabut blok insert teguran dari `decideTabayyun` (actions.ts:86-125) jadi helper bersama.
Pertahankan: pemetaan kategori (KMT→`kedisiplinan_waktu`, JKG/BADAL→`komitmen_jadwal`, lain→
`tanggung_jawab`), idempotensi per `source_ref_id=tabayyunId`, `nomor_teguran` inkremental per
(pengajar, year_month, category). Dipakai `decideTabayyun` **dan** `escalateTabayyunGhosting`.

### 5. Aksi baru `escalateTabayyunGhosting(tabayyunId)` (koordinator actions.ts)

- Auth `requireKoordinatorKetuaKelas`.
- Ambil tab; guard via `tabayyunGhostingState` **harus** `'ghosting'` (status `pending`,
  `reminder_sent_at` terisi, `now >= deadline_at`). Selain itu → return error (cegah eskalasi
  prematur/dobel).
- Update: `is_udzur_syari=false`, `status='decided'`, `decided_at=now`,
  `koordinator_kk_id=session`, `keputusan_catatan='Ghosting: tak respons 72 jam sejak diingatkan
  <tgl jam WIB>'`.
- `issueTeguranForTabayyun(tab, { isUdzur:false, catatan, actor })`.
- Bangun WA `tplTabayyunGhostingTeguran` → return `{ waUrl }`.
- `logAudit` action `hits.tabayyun.ghosting`.

### 6. Ubah `reminderTabayyunPengajar` (koordinator actions.ts)

- Bila `reminder_sent_at` null → set `reminder_sent_at=now`, `deadline_at=now+72h`; kembalikan
  template reminder normal (existing `tplTabayyunToPengajar`).
- Bila terisi & `now < deadline_at` → resend template normal; **jam tak di-reset**.
- Bila `now >= deadline_at` → tak seharusnya dipanggil (UI arahkan ke `escalateTabayyunGhosting`);
  guard: tolak dengan pesan arahkan ke tombol teguran ghosting.

### 7. WA template `tplTabayyunGhostingTeguran` (`src/lib/whatsapp.ts`)

Sebut, dengan jam real Asia/Jakarta: tanggal observasi, tgl+jam diingatkan, deadline terlewati,
daftar pelanggaran (`describePelanggaran`, reuse F1), nada teguran non-udzur (pengajar tak respons
72 jam → dianggap tanpa udzur syar'i, tercatat sebagai teguran). Sisip saldo hutang menit bila ada
(reuse `computeHutangForHalaqah`, seam F2).

### 8. UI koordinator (`TabayyunCard.tsx` + `observasi/koordinator/page.tsx`)

Per tabayyun, hitung `tabayyunGhostingState`:
- `not_reminded` / `awaiting_within` → tombol "Kirim reminder tabayyun" / "Ingatkan lagi" +
  badge countdown ("sisa 18 jam"). Panggil `reminderTabayyunPengajar`.
- `ghosting` → tombol "Teguran ghosting" (warna teguran) + badge "GHOSTING — lewat 6 jam". Panggil
  `escalateTabayyunGhosting`.
- `has_reason` → jalur existing keputusan udzur/non (`decideTabayyun`).
- `decided` → tampil hasil.

## Testing

Repo tanpa framework test (pola F2: `npm run test-hutang` via tsx). Uji **logika murni**
`tabayyunGhostingState`:

- `not_reminded`: `reminder_sent_at=null`.
- `awaiting_within`: reminded, `now < deadline`.
- `ghosting`: reminded, `now >= deadline`, status `pending`.
- `has_reason`: status `awaiting_reason` (walau lewat deadline → **bukan** ghosting).
- `decided`: status `decided`.
- Batas pas: `now == deadline_at` → ghosting (>=).

Tambah script `test-tabayyun` (tsx) di `package.json`.

## Verifikasi manual

1. Buat observasi pelanggaran → tabayyun `pending`, `reminder_sent_at=null`, tombol "Kirim reminder".
2. Klik reminder → `reminder_sent_at` terisi, `deadline_at=+72h`, WA normal. Klik lagi → resend,
   deadline **tak** berubah.
3. Majukan `reminder_sent_at` manual (SQL) ke >72h lalu → tombol jadi "Teguran ghosting".
4. Klik teguran ghosting → tabayyun `decided`+non-udzur, 1 `hits_teguran` (idempoten, klik ulang
   tak gandakan), WA ghosting bertanggal. Cek matrix `komitmen_jadwal` pengajar turun.
5. Skenario alasan: pengajar isi alasan sebelum deadline → `awaiting_reason` → walau lewat 72h
   **tak** jadi ghosting; koordinator putuskan manual.

## Out of scope (F3)

- Cron/scheduled job otomatis (tetap koordinator-driven, sesuai keputusan runner).
- Auto-kirim WA tanpa koordinator.
- Report mingguan/bulanan ghosting (→ F5).
- Presensi kajian adab ketua (→ F4).

## File tersentuh

- **Baru**: `supabase/migrations/0038_hits_tabayyun_reminder_sent.sql`, `src/lib/hits-tabayyun.ts`,
  `scripts/test-tabayyun.ts` (atau lokasi test tsx existing).
- **Ubah**: `src/types/db.ts` (kolom), `src/app/observasi/koordinator/actions.ts`
  (refactor teguran + reminder + escalate), `src/lib/whatsapp.ts` (template),
  `src/app/observasi/koordinator/TabayyunCard.tsx` + `page.tsx` (UI state), `package.json` (script test).

## Ganjalan / operasional

- Migration 0038 **wajib di-apply prod** sebelum deploy action (pola F1/F2: auto-mode tolak apply
  prod tanpa izin user eksplisit). Project ref `yvjbqrrczwvlsaqbjwrq`.
- Backfill: tabayyun `pending` lama punya `reminder_sent_at=null` → jam belum jalan sampai
  koordinator kirim reminder. Aman (tak ada ghosting retroaktif tak sengaja).
