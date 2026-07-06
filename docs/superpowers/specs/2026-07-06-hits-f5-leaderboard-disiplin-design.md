# HITS F5 — Leaderboard Disiplin Pengajar

**Tanggal**: 2026-07-06
**Fase**: F5 (report mingguan/bulanan ranking %KBBS + hutang menit) — penutup roadmap F0–F5.
**Status**: design disetujui, siap ke plan.

## Tujuan

Halaman ranking **view-only** yang mengurutkan pengajar berdasarkan disiplin
(%KBBS) dengan hutang menit sebagai pemecah seri, lintas-batch, dengan toggle
periode bulanan/mingguan. Menggantikan isi halaman `/hits/koordinator`.

Bukan pengganti Matrix Skill Guru (15 indikator, bulanan, `/matrix/koordinator`).
Ini report disiplin terfokus untuk koordinator ketua kelas: "siapa pengajar
paling/kurang disiplin periode ini, dan siapa yang masih punya hutang menit".

## Keputusan terkunci (hasil brainstorming)

1. **Bentuk**: leaderboard disiplin terfokus (bukan tabel per-halaqah, bukan
   matrix 15-indikator).
2. **Logika rank**: `%KBBS turun → hutang menit naik → nama`. %KBBS metrik
   utama, hutang pemecah seri (saldo lebih kecil di atas).
3. **Granularity**: **per-pengajar agregat** — gabung semua halaqah yang
   dipegang. `%KBBS = Σkbbs / ΣnonLibur` lintas halaqah.
4. **Cadence**: toggle **bulanan + mingguan**. Minggu = **7 hari kalender
   Senin–Minggu** (bukan siklus 14 hari sistem — keputusan eksplisit user).
5. **Hutang**: kolom = **saldo tertunggak kumulatif** (total belum terbayar
   ≥ `HUTANG_ANCHOR` 2026-07-06), TAK di-scope per-periode. Label jelas
   "Hutang tertunggak". Nilai tetap saat toggle periode (hanya %KBBS berubah).
6. **Aksi**: view-only. Klik nama pengajar → `/matrix/koordinator/pengajar/[id]`
   (profil existing: spider + histori teguran). Tak ada tombol/WA/state baru.
7. **Route**: **menggantikan** `/hits/koordinator`. Isi lama (stat grid, kartu
   "belum ketua"/"ketua belum login", tabel pola mangkir, tabel per-halaqah)
   **dibuang**. **Simpan 2 link topbar**: Override Pertemuan
   (`/hits/koordinator/pertemuan`) + Validasi & Sumber Data
   (`/hits/koordinator/validasi`) — sub-halaman masih dipakai, jangan diyatimkan.

## Sumber data & definisi

- **%KBBS**: dari `hits_keterangan_harian.kondisi`. `kbbs` = jumlah pertemuan
  `kondisi='KBBS'`; `nonLibur` = jumlah pertemuan `kondisi != 'LIBUR'`.
  `pctKbbs = kbbs / nonLibur`. Konsisten dengan `getHitsRekap` (dashboard lama)
  dan ekuivalen dengan disiplin Matrix (kondisi=KBBS ⟺ tanpa KMT/KBLA/JKG/BADAL).
- **Hutang**: `computeHutangForHalaqahList` (F2), dijumlahkan per pengajar dari
  semua halaqahnya. Saldo kumulatif, bukan per-periode.
- **Pengajar ↔ halaqah**: `hits_halaqah.pengajar_id` (halaqah yang belum
  ter-link `pengajar_id=null` di-skip dari leaderboard — tak bisa diagregat).
- **Gender**: `hits_halaqah.gender`, filter ikhwan/akhwat (pola existing).

Tanpa migration — semua data baca dari tabel existing.

## Arsitektur

### Lib baru: `src/lib/hits-ranking.ts`

Terpisah dari `hits-rekap.ts` (yang month-coupled: hitung `expected` dari kaldik,
`derived` pakai batas bulan). Menyalin logika ke lib baru menghindari refactor
berisiko pada dashboard lain yang memakai `getHitsRekap`.

```
export type DisiplinRankRow = {
  pengajarId: string;
  pengajarNama: string;
  gender: Gender | null;
  halaqahCount: number;   // jumlah halaqah dipegang (yang ter-link)
  kbbs: number;
  nonLibur: number;
  pctKbbs: number | null; // null bila nonLibur=0 (tak ada data periode)
  hutangSaldo: number;    // menit, kumulatif (tak per-periode)
  rank: number | null;    // null bila pctKbbs null
};

export async function getDisiplinRanking(opts: {
  start: string;          // 'YYYY-MM-DD' inklusif
  end: string;            // 'YYYY-MM-DD' eksklusif
  gender?: Gender;
}): Promise<DisiplinRankRow[]>;
```

Alur:
1. Load `hits_halaqah` aktif (filter gender bila ada), ambil
   `id, pengajar_id, pengajar_nama_sheet, gender`. Skip `pengajar_id=null`.
2. Load `hits_keterangan_harian` di `[start,end)` untuk halaqah tsb (chunked via
   `fetchInChunks` — anti-414 & anti cap-1000). Ambil `halaqah_id, kondisi`.
3. Agregat per `pengajar_id`: Σkbbs, ΣnonLibur, kumpulkan halaqahIds.
4. Hutang: `computeHutangForHalaqahList(semuaHalaqahIds)` sekali (bulk), jumlah
   per pengajar.
5. Sort: `pctKbbs` desc (null di bawah) → `hutangSaldo` asc → `pengajarNama`.
   Assign `rank` 1..N hanya untuk baris ber-`pctKbbs != null`.

### Helper periode: `src/lib/week.ts` (tambah)

Sistem punya siklus 14-hari, tapi F5 butuh minggu kalender 7-hari (Senin–Minggu).
Tambah helper murni (tak ganggu cycle existing):

```
export function weekStartMonday(d: Date = new Date()): string; // 'YYYY-MM-DD' Senin (WIB)
export function weekBounds(mondayISO: string): { start: string; end: string }; // end = Senin+7
export function formatWeekRangeShort(mondayISO: string): string; // '30 Jun–6 Jul'
export function recentMondays(count: number): string[]; // N Senin terakhir s/d minggu ini
```

Pakai util WIB yang sudah ada di `week.ts` (`toJakartaDateString`/`jakartaYMD`).

### Page: `src/app/hits/koordinator/page.tsx` (rewrite)

Guard tetap `requireKoordinatorKetuaKelas`. `searchParams`:
- `mode`: `'bulan'` (default) | `'minggu'`
- `month`: `'YYYY-MM'` (mode bulan; default bulan ini WIB)
- `week`: `'YYYY-MM-DD'` Senin (mode minggu; default Senin minggu ini)
- `gender`: `'ikhwan' | 'akhwat'` (opsional)

Resolusi periode → `{start,end}`:
- bulan: `[YYYY-MM-01, bulan+1-01)`
- minggu: `weekBounds(week)` → `[Senin, Senin+7)`

Panggil `getDisiplinRanking({start,end,gender})`.

Layout:
- Topbar: wordmark + 2 link **Override Pertemuan** & **Validasi & Sumber Data** (dipertahankan).
- Hero ringkas: judul "Ranking Disiplin Pengajar" + label periode & gender aktif.
- Kontrol: toggle mode (Bulanan/Mingguan) · selektor periode (MonthNavSelect atau
  selektor minggu baru) · GenderNavSelect.
- Tabel ranking: `# · Pengajar (link) · %KBBS · Hutang (mnt) · #halaqah`.
  - %KBBS diberi warna (hijau ≥90, kuning ≥75, merah <75) mengikuti token warna existing.
  - Baris `pctKbbs=null` (tak ada data periode) dikelompokkan di bawah tabel
    utama sebagai "Belum ada data periode ini" tanpa nomor rank.
  - Klik nama → `/matrix/koordinator/pengajar/[id]`.
- Empty state bila tak ada pengajar sama sekali.

Komponen tabel: buat `DisiplinRankTable` (client kecil atau server) — atau render
inline di page (server component, cukup `<table className="k-table">`).

### Selektor minggu

Komponen kecil `WeekNavSelect` (mirip `MonthNavSelect`): `<select>` isi
`recentMondays(12)`, value = Senin ISO, label = `formatWeekRangeShort`. Navigasi
set `?mode=minggu&week=...`. Toggle mode = 2 link/pill set `?mode=bulan|minggu`.

## Testing

Repo tak punya framework test → pakai pola tsx `npm run test-*` yang sudah ada
(lihat `test-hutang`, `test-tabayyun`). Uji **fungsi murni** (tanpa DB):
- Sort/rank: given rows → urutan benar (%KBBS desc, hutang tiebreak, nama), rank
  hanya untuk data ada, null di bawah tanpa rank.
- Agregasi: 2 halaqah 1 pengajar → %KBBS gabungan benar; hutang dijumlah.
- `weekStartMonday`/`weekBounds`/`formatWeekRangeShort`/`recentMondays`: boundary
  (Senin, Minggu, lintas bulan, WIB).

Ekstrak logika sort+agregat jadi fungsi murni yang bisa diuji tanpa Supabase
(mis. `rankFromAggregates(...)`), `getDisiplinRanking` tinggal query + panggil.

## Yang TIDAK dikerjakan (YAGNI)

- Tak ada tombol WA / aksi tindak di leaderboard (tetap di surface lama).
- Hutang tak di-scope per-periode.
- Tak sentuh `getHitsRekap` / dashboard/route lain.
- Tak ada export Excel (di luar scope F5).
- Tak ada migration.

## Risiko & catatan

- **Regresi navigasi**: isi lama dibuang; 2 link topbar dipertahankan agar
  sub-halaman `pertemuan`/`validasi` tetap terjangkau. Kartu "ketua belum login"
  & pola mangkir HILANG dari UI (keputusan user — bila dibutuhkan lagi, restore
  dari git history commit ini).
- **Lintas-batch berat**: ~400+ halaqah → wajib `fetchInChunks` untuk keterangan
  & hutang (sudah bulk-chunked di F2).
- **Halaqah tanpa pengajar_id**: di-skip (tak bisa diagregat per pengajar) —
  konsisten dengan makna leaderboard "ranking pengajar".
```
