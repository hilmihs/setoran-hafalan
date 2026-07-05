# HITS F2 — Hutang Menit & Pelacakan Pembayaran (Design)

**Tanggal:** 2026-07-05
**Fase:** F2 dari program HITS Observasi (F0 selesai, F1 selesai/di-prod, F2 = ini).
**Scope disetujui:** Opsi 1 (ledger + prompt manual). Otomasi (auto-tabayyun, cron) DITUNDA ke F3 — desain ini menyisakan seam agar F3 tak perlu rombak.

## Tujuan

Lacak "hutang menit" pengajar yang timbul dari pelanggaran observasi, dan catat pelunasannya (menit tambahan) secara presisi, per halaqah. Sistem hanya **menampilkan & mencatat** — penagihan aktif (auto-tabayyun, reminder terjadwal) adalah F3.

## Keputusan terkunci (dari brainstorm)

1. **Sumber hutang = 3 jenis** (BADAL & TIDAK_LATIHAN = 0 hutang):
   - **KMT** (telat): `max(0, menit - 5)` — toleransi tetap 5 menit.
   - **KBLA** (tutup cepat): `menit` penuh — tanpa toleransi.
   - **JKG**: `90` menit tetap (1 pertemuan = 90 menit). Opsi `ganti_hari`/`cicil` hanya rencana bayar, tak mengubah besar hutang.
   - **BADAL**: 0 (sesi sudah dicover pengganti). Tetap dihitung JKG di matrix (tak berubah).
   - **TIDAK_LATIHAN**: 0 (isu latihan, ditangani tabayyun, bukan hutang menit).
2. **Model data = ledger credit (Approach B)**: debit **dihitung** dari `hits_pelanggaran` (sumber kebenaran, tak diduplikasi); credit (pembayaran) disimpan di tabel baru append-only.
3. **Presisi = menit (ledger)**. Status `belum|sebagian|lunas` = turunan dari saldo, bukan disimpan.
4. **Scope = per halaqah** (1 halaqah = 1 pengajar). Report per-pengajar lintas-halaqah = agregasi di F5.
5. **Otomasi** (auto-tabayyun saat tak bayar, cron ulang) = F3.

## Arsitektur

### 1. Data model — migration `0037_hits_hutang_bayar.sql`

Tabel credit murni (append-only; debit tidak disimpan di sini):

```sql
create table hits_hutang_bayar (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  pengajar_id uuid not null,                          -- denormal utk agregasi report
  keterangan_id uuid references hits_keterangan_harian(id) on delete set null,
                                                       -- pertemuan tempat bayar dilaporkan (audit + idempoten)
  menit integer not null check (menit > 0),
  tanggal date not null,                               -- tanggal pertemuan tempat bayar dilaporkan
  dilaporkan_oleh text,                                -- ketua_kelas id / nama
  catatan text,
  created_at timestamptz not null default now()
);
create index idx_hits_hutang_bayar_halaqah on hits_hutang_bayar (halaqah_id);
create index idx_hits_hutang_bayar_pengajar on hits_hutang_bayar (pengajar_id);
alter table hits_hutang_bayar enable row level security;   -- RLS on, NO policy (service-role bypass, konvensi repo)
```

Idempoten edit: saat ketua submit ulang sebuah pertemuan, hapus baris `hits_hutang_bayar` untuk `keterangan_id` itu lalu insert ulang (replace-all, sama pola dgn `hits_pelanggaran`).

### 2. Debit logic — `src/lib/hits-hutang.ts`

```ts
export const TOLERANSI_KMT = 5;
export const JKG_MENIT = 90;

// Debit menit per pelanggaran.
export function hutangMenit(p: HitsPelanggaran): number {
  switch (p.jenis) {
    case 'KMT':  return Math.max(0, (p.menit ?? 0) - TOLERANSI_KMT);
    case 'KBLA': return p.menit ?? 0;
    case 'JKG':  return JKG_MENIT;
    default:     return 0; // BADAL, TIDAK_LATIHAN
  }
}
```

Agregasi per halaqah dengan alokasi **FIFO** (pembayaran melunasi hutang terlama dulu, urut tanggal pertemuan):

```ts
export type HutangRincian = {
  keterangan_id: string;
  tanggal: string;          // tanggal pertemuan
  jenis: string;            // KMT | KBLA | JKG (jenis debit dominan pertemuan itu)
  debit: number;
  terbayar: number;
  sisa: number;
  status: 'belum' | 'sebagian' | 'lunas';
};

export type HutangHalaqah = {
  halaqah_id: string;
  pengajar_id: string;
  total_debit: number;
  total_bayar: number;
  saldo: number;            // max(0, total_debit - total_bayar)
  rincian: HutangRincian[];
};

export async function computeHutangForHalaqah(halaqahId: string): Promise<HutangHalaqah>;
```

- Debit di-agregasi per pertemuan (satu pertemuan bisa punya beberapa pelanggaran → jumlahkan debitnya; `jenis` di rincian = jenis debit paling berat pertemuan itu untuk label).
- `total_bayar` = Σ `hits_hutang_bayar.menit` untuk halaqah.
- Alokasi FIFO menyebar `total_bayar` ke rincian berurut tanggal → `terbayar`/`sisa`/`status` per pertemuan.
- `saldo = max(0, total_debit - total_bayar)`.

### 3. Form flow — ketua lapor pembayaran

`src/app/hits/ketua/HitsKetuaForm.tsx` (slot hari-ini) + `page.tsx` (prefill) + `actions.ts` (`submitKeteranganHarian`):

- `page.tsx` panggil `computeHutangForHalaqah(halaqahId)` → kirim `saldoSebelumHariIni` ke form (saldo dari pertemuan-pertemuan sebelum slot hari ini).
- Kalau `saldo > 0`: form tampilkan banner *"Sisa hutang N menit"* + input numerik **"menit ditambah hari ini"**, di-cap `≤ saldo`.
- Submit lewat `submitKeteranganHarian` (payload tambah field `bayar_menit?: number`):
  - `bayar_menit > 0` → replace-all `hits_hutang_bayar` untuk `keterangan_id` ini (delete lalu insert 1 baris: `halaqah_id`, `pengajar_id`, `keterangan_id`, `menit=bayar_menit`, `tanggal`, `dilaporkan_oleh`).
  - `bayar_menit == 0/null` → hapus baris `hits_hutang_bayar` untuk `keterangan_id` ini (idempoten saat edit koreksi).
- **Independen** dari pelanggaran pertemuan itu: 1 pertemuan bisa mencatat pelanggaran KBLA baru **dan** bayar hutang lama sekaligus.

### 4. Tampilan

- **Banner form** (ketua): saldo hutang pengajar sebelum hari ini.
- **Dashboard koordinator** (`hits-rekap.ts`): tambah kolom/section "saldo hutang" per halaqah → daftar hutang koordinator. `HitsRekapRow` dapat field `hutang_saldo`.
- **WA tabayyun** (`reminderTabayyunPengajar` di `hits-ketua.ts`/template): sisipkan daftar hutang menit pengajar (plan F2 minta).

### 5. Matrix, testing, seam F3

- **Matrix (`matrix-compute.ts`): TIDAK berubah.** Hutang = axis terpisah; matrix tetap baca `hits_pelanggaran` untuk disiplin/JKG.
- **Testing:**
  - `hutangMenit`: KMT 5→0, 6→1, 10→5; KBLA 8→8; JKG→90; BADAL→0; TIDAK_LATIHAN→0.
  - `computeHutangForHalaqah`: FIFO benar (bayar lunasi terlama dulu), status belum/sebagian/lunas, saldo tak negatif (overpay di-clamp), banyak pelanggaran/pertemuan.
  - Action `submitKeteranganHarian`: insert bayar, replace-all idempoten (submit ulang tak dobel), bayar=0 menghapus.
- **Seam F3:** `computeHutangForHalaqah` + `saldo` adalah API yang dikonsumsi F3 untuk auto-tabayyun (saldo tetap & tak ada bayar di pertemuan berikut → generate tabayyun) dan cron reminder. F2 tak membangunnya; hanya memastikan data & fungsi tersedia.

## Error handling

- Input `bayar_menit`: server validasi integer `≥ 0`; cap ke saldo saat ini (tolak/clamp bila > saldo untuk hindari overpay). Pesan error Indonesia konsisten dgn action lain.
- Insert `hits_hutang_bayar` gagal → kembalikan `{ error }`, jangan diamkan (pola sama dgn insert pelanggaran).

## Non-goals (F2)

- Auto-generate tabayyun saat tak bayar (F3).
- Cron/countdown reminder berulang (F3).
- Report bulanan/mingguan ranking (F5) — F2 hanya sediakan data hutang & fungsi agregasi.

## Verifikasi

- Migration applied; `hits_hutang_bayar` ada, RLS on tanpa policy.
- Unit test `hits-hutang.ts` hijau.
- Manual: buat pelanggaran KMT 10' + KBLA 8' + JKG di pertemuan 1 → saldo = 5+8+90 = 103. Di pertemuan 2 ketua isi "nambah 50 menit" → saldo 53, FIFO lunasi KMT+KBLA dulu lalu potong JKG. WA tabayyun tampilkan daftar hutang.
