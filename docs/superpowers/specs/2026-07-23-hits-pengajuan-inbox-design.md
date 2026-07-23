# Spec — Inbox Pengajuan Koordinator HITS

## Context

Koordinator HITS menerima beberapa jenis pengajuan (request) dari pengajar/ketua.
Tiap pengajuan tersimpan sbg baris di tabelnya masing-masing dgn kolom `token` +
`status` (`pending`/`approved`/`rejected`/`selesai`) + `decided_by_id/at/role`, dan
diputuskan lewat **halaman keputusan bertoken** yang link-nya dikirim via WhatsApp.

Masalah: **tak ada daftar pusat.** Link keputusan cuma ada di chat WA koordinator.
Kalau chat ketimbun/hilang → pengajuan nyangkut tanpa ada yang bisa lihat/putuskan.
Akibatnya pengajuan menumpuk (snapshot 2026-07-23):

| Jenis | Tabel | Halaman keputusan | Pending |
|---|---|---|---|
| Pindah / claim halaqah | `hits_halaqah_pindah_request` | `/hits/pindah-halaqah/[token]` | 18 |
| Hapus pertemuan | `hits_pertemuan_hapus_request` | `/hits/hapus-pertemuan/[token]` | 27 |
| Koreksi pertemuan | `hits_pertemuan_koreksi` | `/hits/koordinator/koreksi/[token]` | 14 |
| Ketua dual-role | `ketua_dualrole_request` | `/hits/ketua-dual/[token]` | 9 |

Gejala nyata (2026-07): pengajar hendak claim halaqah HITS 62, ditolak
"Halaqah ini sudah ada pengajuan yang menunggu keputusan" — tapi pengajuan pending itu
tak terlihat/terputuskan di mana pun. Deadlock.

Tujuan: satu **inbox pengajuan** buat koordinator HITS yang mengumpulkan keempat jenis,
menandai yang mendesak/konflik, dan mengarahkan ke halaman keputusan yang sudah ada.

## Keputusan (final)

| Hal | Keputusan |
|---|---|
| Cakupan | HITS saja, 4 jenis (pindah, hapus, koreksi, dual-role). 2in1 di luar scope. |
| Pendekatan aksi | **Link-out**: reuse halaman keputusan bertoken. Tak ada decide-inline. |
| Isi inbox | Pending (default) + Riwayat (sudah diputuskan) |
| Role | `requireKoordinatorKetuaKelas` (sama dgn dashboard koordinator HITS) |
| Fitur | urut-terlama+umur, hitung per jenis, WA pengaju, filter jenis, deteksi konflik, re-kirim link WA, ringkas koreksi kaya |

**Non-goal (YAGNI):** decide-inline / ACC di inbox, bulk approve, digest WA harian ke
koordinator, notifikasi, sisi-pengaju ("sedang diproses"), 2in1, pagination.

## Arsitektur

### 1. Data layer — `src/lib/hits-pengajuan.ts`

Tipe ternormalisasi lintas-jenis:

```ts
export type PengajuanJenis = 'pindah' | 'hapus' | 'koreksi' | 'dual';

export type KoreksiItemLite = { pertemuan_no: number; level: string | null; tanggal: string | null; jenis: string };

export type PengajuanRow = {
  jenis: PengajuanJenis;
  id: string;
  token: string;
  decideHref: string;            // /hits/.../[token]
  halaqahId: string | null;
  halaqahName: string;           // '(halaqah dihapus)' bila tak ketemu
  batchName: string;
  gender: 'ikhwan' | 'akhwat' | null;
  requesterName: string;
  requesterWa: string | null;    // untuk tombol WA (f3)
  ringkas: string;               // ringkasan 1 baris (f7)
  items?: KoreksiItemLite[];     // hanya koreksi (f7)
  ageDays: number;               // f1
  conflict: string | null;       // label konflik atau null (f5)
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decidedByRole: string | null;
};

export async function getHitsPengajuan(
  which: 'pending' | 'decided',
): Promise<PengajuanRow[]>;
```

Alur:
1. Query 4 tabel terfilter status:
   - `which==='pending'` → `status = 'pending'`.
   - `which==='decided'` → `status <> 'pending'` (approved/rejected/selesai).
2. Kumpulkan semua `halaqah_id` (dual pakai `new_halaqah_id`), fetch sekali
   `hits_halaqah (id, name, batch_id, gender, pengajar_id, active)` + `hits_batch (id, name)`.
   Map ke tiap baris. Halaqah tak ketemu → `halaqahName='(halaqah dihapus)'`, `conflict` diset.
3. **[f7]** Koreksi: fetch `hits_pertemuan_koreksi_item (koreksi_id, pertemuan_no, level, tanggal, jenis)`
   `in(koreksi_id)`, grup per koreksi → `items`. `ringkas` = `"Ubah N pertemuan"` +
   ringkas item pertama (mis. `#14 (perbaikan) → 2026-07-17`).
   Hapus: `ringkas = "Hapus #{pertemuan_no} · {tanggal} · {level}"` (kolom ada di tabelnya).
   Pindah/dual: `ringkas = "{requesterName} → halaqah {halaqahName}"`.
4. **[f5]** `conflict` (best-effort, non-blocking):
   - pindah & dual: `halaqah.pengajar_id != null` → `"Halaqah sudah ada pengajar"`.
   - semua jenis: `halaqah.active === false` → `"Halaqah nonaktif"`; halaqah null → `"Halaqah tak ditemukan"`.
   - (Cek "pertemuan target sudah hilang" utk hapus/koreksi: TIDAK di scope — pertemuan diturunkan runtime, mahal. Cukup flag halaqah-level.)
5. **[f1]** `ageDays = floor((today - createdAt)/hari)` (Asia/Jakarta, pakai util tanggal yg ada).
6. Urut:
   - pending → `createdAt` **menaik** (terlama dulu = paling mendesak), konflik didahulukan (conflict != null naik ke atas).
   - decided → `decidedAt` menurun (terbaru dulu).

`decideHref` per jenis:
```
pindah  → /hits/pindah-halaqah/${token}
hapus   → /hits/hapus-pertemuan/${token}
koreksi → /hits/koordinator/koreksi/${token}
dual    → /hits/ketua-dual/${token}
```

Helper kecil `countByJenis(rows): Record<PengajuanJenis, number>` utk badge tab [f2].

### 2. Halaman — `src/app/hits/koordinator/pengajuan/page.tsx`

- `export const dynamic = 'force-dynamic'`; guard `requireKoordinatorKetuaKelas` (redirect `/` bila gagal), pola sama spt page koordinator lain.
- Baca `searchParams`: `tab` (`menunggu`|`riwayat`, default `menunggu`), `jenis` (filter chip, default semua), `gender` (opsional, pola dashboard).
- Ambil `getHitsPengajuan(tab==='riwayat' ? 'decided' : 'pending')`, lalu filter `jenis`/`gender` di memori.
- Render server-side (data + link cukup; tak butuh client state kecuali tombol WA yg cuma anchor).

### 3. UI

**Tab** (link `?tab=`): `Menunggu` / `Riwayat`. Di label tab Menunggu, tampil total; di
baris chip jenis tampil hitung per jenis [f2]: `Semua N · Pindah 18 · Hapus 27 · Koreksi 14 · Dual 9`.
Chip = link `?jenis=` (pertahankan tab & gender).

**Kartu pengajuan**:
- Kiri: badge jenis (warna per jenis) · nama halaqah · batch · gender ·
  **badge umur** "N hari" [f1] (warna: >7 hari merah, >3 kuning) · `ringkas` [f7]
  (koreksi tampilkan sampai ~3 item lalu "+k lagi") · baris kecil pengaju.
- Bila `conflict` → strip/border merah kiri + label konflik [f5].
- Kanan (tab Menunggu):
  - **WA pengaju** [f3] — anchor `buildWaMeUrl(requesterWa, ...)` (disable bila `requesterWa` null).
  - **Tinjau →** — link `decideHref`.
  - **Bagikan link** [f6] — link keputusan sering nyangkut/hilang di chat WA. Sediakan (a) tombol **Salin link** (`absUrl(decideHref)` ke clipboard) + (b) anchor **WA** `buildWaMeUrl(undefined, teks+link)` (tanpa nomor → user pilih chat tujuan, mis. rekan koordinator). Butuh komponen client kecil utk clipboard; sisanya anchor biasa.
- Kanan (tab Riwayat): badge status (approved=hijau, rejected=merah, selesai=hijau) + `decidedAt` + `decidedByRole`. Tanpa tombol aksi.
- Empty state per tab/filter.

**Warna badge jenis** (pakai token warna yg ada): pindah=biru, hapus=merah-muda, koreksi=kuning, dual=ungu/aksen. Final diselaraskan saat implementasi dgn util warna yg ada.

### 4. Integrasi dashboard — `src/app/hits/koordinator/page.tsx`

- Tambah kartu link "Pengajuan Masuk" di deret kartu (dekat ketua-kelas/pertemuan/validasi),
  href `/hits/koordinator/pengajuan`.
- Badge angka = `getHitsPengajuan('pending').length` (merah bila >0). Bila ada baris
  `conflict` → tambahan penanda (mis. titik merah / label "perlu ditinjau").
- 1 query tambahan di page dashboard (ringan; sudah `force-dynamic`).

## Error handling

- Query gagal per-tabel → perlakukan sbg array kosong (jangan gagalkan seluruh halaman); jenis lain tetap tampil.
- `token` kosong/null di suatu baris → sembunyikan tombol Tinjau, tampilkan catatan "link tak tersedia" (seharusnya tak terjadi; defensif).
- Halaqah/batch tak ketemu → tetap tampil dgn label fallback + conflict flag (jangan drop).

## Testing / Verifikasi

- **Data nyata**: buka `/hits/koordinator/pengajuan` → jumlah per jenis cocok dgn hitung DB
  (18/27/14/9 pending saat spec ditulis).
- **Konflik [f5]**: temukan ≥1 `hits_halaqah_pindah_request` pending yg halaqah-nya
  `pengajar_id != null` → kartu tertandai merah "Halaqah sudah ada pengajar" (skenario HITS 62).
- **Link-out**: tiap jenis, tombol Tinjau membuka halaman keputusan token yg benar.
- **Riwayat**: ACC 1 koreksi via halaman token → baris hilang dari Menunggu, muncul di Riwayat
  dgn status/decidedBy benar.
- **Umur [f1]**: badge "N hari" sesuai selisih createdAt; urutan terlama di atas.
- **WA [f3] / Bagikan [f6]**: anchor WA pengaju → wa.me nomor pengaju benar; Salin link → clipboard berisi absUrl(decideHref); WA share → wa.me tanpa nomor + teks berisi link.
- **Dashboard**: badge pending = jumlah inbox; menandai konflik.

## File yang disentuh

- **baru** `src/lib/hits-pengajuan.ts` — data layer + tipe + `countByJenis`.
- **baru** `src/app/hits/koordinator/pengajuan/page.tsx` — halaman inbox (server) + subkomponen kartu.
- **ubah** `src/app/hits/koordinator/page.tsx` — kartu "Pengajuan Masuk" + badge pending.
- (opsional) kecil di `src/components` bila perlu komponen chip/tab reusable — hanya bila belum ada padananya.
