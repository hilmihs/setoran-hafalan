# HITS F4 — Presensi Kajian Adab Ketua (Design)

**Tanggal:** 2026-07-06
**Fase:** F4 dari program HITS Observasi (F0/F1/F2/F3 selesai/di-prod).
**Scope disetujui:** Pendekatan C (ringan, sesi = tanggal Minggu) + Alpa lifecycle (tabayyun-lite) + migrasi data historis dari xlsx.

## Konteks program

- **F1** (prod): mesin observasi multi-pelanggaran (`hits_pelanggaran`), tabayyun.
- **F2** (prod): hutang menit + ledger (`hits_hutang_bayar`).
- **F3** (prod): tabayyun lifecycle & ghosting 72h (`reminder_sent_at`, teguran, WA).
- **F4** (ini): presensi Kajian Adab ketua kelas — **entitas terpisah** dari presensi guru (`program_kehadiran`/`checkin_pengajar`). Ketua kelas **bukan** pengajar; presensi ini **tidak** masuk Matrix Skill Guru. Tujuan: rekap terpisah agar Koordinator Ketua Kelas (Koor KK) melihat siapa ketua yang aktif ikut kegiatan.

## Tujuan

Kajian Adab = kegiatan rutin **setiap Minggu 16.00 WIB**, wajib dihadiri **semua ketua kelas**. F4:

1. Ketua **self check-in** presensi (Hadir/Izin/Sakit) pada hari-H.
2. Ketua yang tak check-in pada Minggu terlewat masuk **lifecycle penagihan**: muncul di dashboard Koor KK → di-reminder → countdown 3 hari → Alpa.
3. Dashboard Koor KK: rekap % kehadiran per ketua, tombol reminder WA, CRUD libur kajian.
4. **Migrasi** data historis presensi kajian adab dari file xlsx Akhwat ke DB.

## Keputusan desain (disetujui)

1. **Skema ringan (Pendekatan C):** sesi = tanggal Minggu, tak ada tabel sesi. Alpa/pending = derived.
2. **Identitas per-WA:** dedup by `whatsapp_number`. 1 orang ketua walau memegang banyak halaqah (konsisten dual-source ketua: `ketua_kelas.whatsapp_number`).
3. **Status:** `{Hadir, Terlambat, Izin, Sakit, Alpa}`. Terlambat dihitung dari `checkin_at` vs 16:00 WIB saat insert (bukan status yang dipilih user). Sakit/Izin dipilih user.
4. **Backfill hari-H only** — kecuali ketika Koor KK sudah kirim reminder (buka jendela susulan 3 hari).
5. **Alpa lifecycle** (bukan alpa instan): Minggu lewat tanpa check-in → "belum-isi" → reminder Koor KK → countdown 3 hari → Alpa.
6. **Bukan feed Matrix** — rekap berdiri sendiri untuk Koor KK.
7. **Migrasi historis via script tsx** (bukan migration SQL), idempotent.

## Skema DB (migration `0040_hits_kajian_adab.sql`)

```sql
create table hits_kajian_presensi (
  id uuid primary key default gen_random_uuid(),
  ketua_wa text not null,                 -- whatsapp_number ketua (dedup identitas)
  tanggal date not null,                  -- tanggal Minggu sesi kajian
  status text check (status in ('Hadir','Terlambat','Izin','Sakit','Alpa')),  -- null = direminder tapi belum respons
  checkin_at timestamptz,                 -- waktu check-in (untuk derive Terlambat); null utk historis/pending
  reminder_sent_at timestamptz,           -- kapan Koor KK kirim reminder (mulai countdown 3 hari)
  created_at timestamptz not null default now()
);
create unique index idx_kajian_presensi_wa_tgl on hits_kajian_presensi(ketua_wa, tanggal);
create index idx_kajian_presensi_tgl on hits_kajian_presensi(tanggal);

create table hits_kajian_libur (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null unique,
  keterangan text,
  created_at timestamptz not null default now()
);
```

**Catatan status null:** baris dengan `status = null` = ketua sudah di-reminder Koor KK tapi belum check-in susulan. Setelah `reminder_sent_at + 3 hari` masih null → derived **Alpa**. Baris check-in normal selalu punya status non-null. Minggu terlewat tanpa reminder **tak punya baris** → derived "belum-isi".

## Library `src/lib/hits-kajian.ts` (fungsi murni + konstanta)

**Konstanta:**
- `KAJIAN_HARI_INDEX = 0` (Minggu), `KAJIAN_MULAI = '16:00'`.
- `KAJIAN_ANCHOR` = Minggu paling awal yang dihitung untuk % = **Minggu pertama data historis** (tanggal kolom paling awal dari sheet yang diimpor, mis. `18/01/2026`). Konsisten pola `PRESENSI_ANCHOR`. Nilai final dikonfirmasi saat impor (ambil MIN(tanggal) hasil derive).
- `GHOSTING_HARI = 3` (countdown reminder → alpa).

**Fungsi murni (uji tsx):**
- `sundaysInRange(start, end): string[]` — semua tanggal Minggu (YYYY-MM-DD) dalam rentang inklusif.
- `deriveTerlambat(checkinAt): boolean` — waktu WIB check-in > 16:00 → Terlambat. (Reuse pola `attendance.deriveIsTerlambat` bila cocok.)
- `deriveKajianState(row | null, tanggal, today, nowTs): 'hadir'|'terlambat'|'izin'|'sakit'|'alpa'|'belum-isi'|'akan-datang'` — status efektif satu sel (ketua × Minggu):
  - `tanggal` di masa depan / hari-H belum lewat → `akan-datang`.
  - ada baris status non-null → status itu.
  - ada baris status null + `reminder_sent_at`:
    - `nowTs >= reminder_sent_at + 3 hari` → `alpa`.
    - else → `belum-isi` (dalam countdown).
  - tak ada baris & Minggu sudah lewat → `belum-isi`.
- `computeKajianRekap(rows, liburSet, ketuaWaList, today, nowTs)` → per-ketua `{ ketua_wa, hadir, terlambat, izin, sakit, alpa, belumIsi, totalSesi, persen }`. `totalSesi` = jumlah Minggu non-libur dari `KAJIAN_ANCHOR` s/d Minggu terakhir yang sudah lewat. **`persen` = `(hadir + terlambat) / totalSesi`** — Izin/Sakit tak masuk numerator, tapi tetap dihitung sudah-direspons (bukan alpa/belum-isi). Konversi ke skala **tidak** dilakukan (bukan feed matrix).

**Catatan paginasi:** query presensi lintas semua ketua & Minggu bisa >1000 baris → gunakan `fetchAllRows` (pola PostgREST 1000-limit yang sudah ada di repo).

## UI

### Ketua — kartu di landing `/hits/ketua`
- Komponen `KajianAdabCard`. Tampil status sesi Minggu ini + riwayat ringkas.
- **Hari Minggu, non-libur, dalam jendela hari-H:** tombol **Hadir / Izin / Sakit**. Setelah submit → tampil status (Terlambat bila > 16:00).
- **Ada reminder aktif (status null, dalam countdown 3 hari):** tampilkan banner "Kamu belum presensi kajian [tanggal] — segera isi" + tombol susulan Hadir/Izin/Sakit.
- **Hari lain:** tampil sesi Minggu berikutnya + status terakhir.
- Sumber identitas: `session` ketua → `whatsapp_number`.

### Koordinator KK — sub-halaman `/observasi/koordinator/kajian`
- **Tabel rekap per ketua:** nama, halaqah, hadir/terlambat/izin/sakit/alpa, % (filter bulan / all-time). Baca via `fetchAllRows`.
- **Panel "Perlu ditindak":** daftar (ketua × Minggu) berstatus `belum-isi` → tombol **Reminder** (set `reminder_sent_at`, buka wa.me). Item dalam countdown tampil sisa hari; lewat 3 hari tampil **Alpa**.
- **CRUD libur kajian:** tambah/hapus tanggal libur (`hits_kajian_libur`). Pola `libur_program`. Minggu libur dikecualikan dari `totalSesi` & panel tindak.

## Server actions

`src/app/hits/ketua/actions.ts` (atau modul kajian):
- `submitKajianCheckin(status: 'Hadir'|'Izin'|'Sakit')` — WA dari sesi. Guard: (a) hari Minggu & non-libur & belum lewat sesi (hari-H), **atau** (b) ada baris reminder aktif dalam countdown (susulan). Hitung Terlambat dari now WIB. Upsert unique `(ketua_wa, tanggal)`. Idempotent.

`src/app/observasi/koordinator/kajian/actions.ts`:
- `remindKajianKetua(ketuaWa, tanggal)` — guard Koor KK. Upsert baris `(ketua_wa, tanggal, status=null, reminder_sent_at=now)`. Resend **tak reset** `reminder_sent_at` bila sudah ada (pola F3). Return data untuk wa.me.
- `setKajianLibur(tanggal, keterangan)` / `hapusKajianLibur(tanggal)` — guard Koor KK.

## WhatsApp template

`src/lib/whatsapp.ts`:
- `tplReminderKajianAdab({ namaKetua, tanggalWib })` — pesan Koor KK → ketua menanyakan kenapa belum presensi kajian adab [tanggal], minta segera isi/beri keterangan. **Tanpa sapaan "Ustadz/Ustadzah"** (ketua kelas ≠ ustadz).

## Migrasi data historis

Script `scripts/import-kajian-adab.ts` (tsx, dijalankan manual sekali):

**Sumber:** sheet `"Presensi Kajian Adab"` di:
- `Observasi HITS Januari Akhwat .xlsx`
- `Observasi HITS April Akhwat .xlsx`
- `Observasi HITS JUNI 2025_AKHWAT.xlsx`

(File Ikhwan tak punya sheet ini → ketua ikhwan mulai kosong.)

**Struktur sheet:** baris 2 = header (`No.`, `Halaqah`, `Ketua Kelas`, lalu kolom tanggal Minggu). Baris ≥3 = data per halaqah. Sel = `H`/`T`/`I`/`S`/`A`/kosong.

**Algoritma:**
1. **Resolve tanggal kolom:** header campur teks `dd/mm` & Date cell (ambigu). Karena kolom = Minggu berurutan mingguan, ambil satu kolom dengan tanggal jelas sebagai anchor, lalu step +7 hari per kolom untuk seluruh sekuens. Validasi tiap tanggal jatuh pada hari Minggu.
2. **Resolve ketua:** map `Halaqah` (mis. `"HITS 3"`) → `hits_halaqah` → `ketua_kelas.whatsapp_number` (via DB). Fallback: cocokkan kolom `Ketua Kelas` (nama) bila halaqah tak ketemu. Baris tanpa ketua terpetakan → skip + log.
3. **Map status:** `H→Hadir`, `T→Terlambat`, `I→Izin`, `S→Sakit`, `A→Alpa`. Kosong → skip (tak buat baris; = belum tercatat, bukan alpa).
4. **Upsert** ke `hits_kajian_presensi` on conflict `(ketua_wa, tanggal)` do nothing/update. `checkin_at`/`reminder_sent_at` = null (historis). Idempotent.
5. Log ringkas: jumlah baris diimpor, ketua tak ter-resolve, tanggal ter-derive.

**Duplikasi antar-file:** rentang Minggu bisa overlap antar 3 file. Unique `(ketua_wa, tanggal)` mencegah dobel; urutan proses tak masalah (nilai sama).

## Testing (pola F2/F3)

Repo tanpa framework test → uji **fungsi murni** via tsx (`npm run test-kajian` atau serupa). Kasus:
- `sundaysInRange` batas & rentang kosong.
- `deriveTerlambat` sebelum/tepat/sesudah 16:00 WIB.
- `deriveKajianState`: hadir, terlambat, izin, sakit, alpa (lewat countdown), belum-isi (dalam countdown & tanpa reminder), akan-datang.
- `computeKajianRekap`: campuran status + libur dikecualikan + numerator hadir+terlambat.

## Out of scope (F4)

- Feed ke Matrix Skill Guru (ketua kelas bukan pengajar).
- Cron/auto-reminder terjadwal (reminder manual oleh Koor KK; countdown = derived, bukan job).
- Report bulanan/ranking kajian adab (→ F5).
- Migrasi kajian adab **Ikhwan** (data tak tersedia).
- Backfill umum di luar jendela reminder (hanya hari-H + susulan pasca-reminder).

## Catatan deploy

- Migration `0040` **wajib di-apply prod** sebelum deploy action/UI (pola F1/F2/F3).
- Script `import-kajian-adab.ts` dijalankan **setelah** 0040 + data ketua_kelas & hits_halaqah tersedia di target DB.
