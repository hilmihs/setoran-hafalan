# Haqibatul Mu'allim — pustaka berkas pembantu pengajar HITS

Tanggal: 2026-08-28. Status: disetujui untuk implementasi (pendekatan A).

## Tujuan

Pengajar HITS bisa membuka berkas pembantu (panduan ujian, tatib/SOP, modul,
kurikulum, panduan aplikasi) yang disusun koordinator. Koordinator ketua kelas
bisa membuat folder, mengunggah berkas, mengubah nama, dan menghapus.

## Keputusan yang sudah dikunci

| Hal | Keputusan |
|---|---|
| Penyimpanan | Metadata di Postgres, berkas fisik di `${STORAGE_DIR}/haqibah/<uuid>.<ext>` |
| Nama berkas di disk | UUID — nama tampil hanya ada di DB, jadi rename tak menyentuh disk dan URL lama tetap sah |
| Penyajian | Route `/api/audio/<bucket>/<path>` yang sudah ada (HMAC `SESSION_SECRET` + kedaluwarsa); sudah mengenal `application/pdf` |
| Struktur | Bertingkat: folder boleh punya subfolder, maksimum **3 tingkat** |
| Pembaca | Role `pengajar` (ikhwan & akhwat melihat isi yang sama) |
| Pengelola | Role `koordinator_ketua_kelas` **atau** superadmin (`isSuperadmin()`) |
| Isi awal | Script seed dijalankan sekali di VPS (25 berkas, 75 MB) |
| Hapus folder | Hanya bila kosong (FK `on delete restrict`), pesan galat menjelaskan isinya |
| Pindah berkas antar folder | Di luar cakupan |

## Skema (migrasi `supabase/migrations/0059_haqibah.sql`)

```sql
create table if not exists haqibah_folder (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references haqibah_folder(id) on delete restrict,
  nama       text not null check (length(trim(nama)) between 1 and 120),
  urutan     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NULL tak tertangkap unique biasa → dua indeks parsial.
create unique index if not exists uq_haqibah_folder_akar
  on haqibah_folder(lower(nama)) where parent_id is null;
create unique index if not exists uq_haqibah_folder_anak
  on haqibah_folder(parent_id, lower(nama)) where parent_id is not null;

create table if not exists haqibah_file (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid references haqibah_folder(id) on delete restrict, -- null = akar
  nama          text not null check (length(trim(nama)) between 1 and 200), -- nama tampil, TANPA ekstensi
  storage_path  text not null unique,   -- relatif bucket: '<uuid>.<ext>'
  ext           text not null,
  mime          text not null,
  ukuran        bigint not null check (ukuran > 0),
  urutan        integer not null default 0,
  diunggah_oleh text,                   -- nama/WA aktor, untuk jejak
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_haqibah_file_folder on haqibah_file(folder_id);
```

Trigger `set_updated_at` dipasang pada kedua tabel (fungsi sudah ada sejak
`0051_evaluasi_halaqah.sql`).

## Berkas & kepemilikan

Tiap berkas dimiliki satu agen; tak ada dua agen menyunting berkas yang sama.

| # | Berkas | Isi |
|---|---|---|
| 1 | `supabase/migrations/0059_haqibah.sql` | migrasi di atas |
| 2 | `src/types/db.ts` | `HaqibahFolder`, `HaqibahFile` |
| 3 | `src/lib/haqibah.ts` | lapisan data (baca/tulis metadata) |
| 4 | `src/lib/haqibah-storage.ts` | unggah/hapus berkas fisik + validasi |
| 5 | `src/app/haqibah/pengajar/page.tsx` | halaman baca pengajar |
| 6 | `src/app/haqibah/koordinator/page.tsx` | halaman kelola (server component) |
| 7 | `src/app/haqibah/koordinator/actions.ts` | server actions CRUD |
| 8 | `src/app/haqibah/koordinator/KelolaPanel.tsx` | komponen klien kelola |
| 9 | `src/lib/feature-links.ts` | entri menu untuk kedua role |
| 10 | `scripts/seed-haqibah.ts` + `docs/HAQIBAH.md` | seed isi awal + catatan operasional |

## Kontrak antar-modul

`src/lib/haqibah.ts` (server-only, pakai `supabaseAdmin`):

```ts
export const HAQIBAH_BUCKET = 'haqibah';
export const HAQIBAH_MAX_DEPTH = 3;

export interface FolderNode { id: string; parent_id: string | null; nama: string; urutan: number; }
export interface FileNode {
  id: string; folder_id: string | null; nama: string; storage_path: string;
  ext: string; mime: string; ukuran: number; urutan: number;
}

export async function daftarFolder(parentId: string | null): Promise<FolderNode[]>;
export async function daftarFile(folderId: string | null): Promise<FileNode[]>;
export async function ambilFolder(id: string): Promise<FolderNode | null>;
export async function ambilFile(id: string): Promise<FileNode | null>;
/** Rantai folder dari akar ke `id` untuk breadcrumb. */
export async function jalurFolder(id: string | null): Promise<FolderNode[]>;
/** Kedalaman folder (akar = 1). Dipakai untuk menolak folder lebih dari 3 tingkat. */
export async function kedalamanFolder(id: string | null): Promise<number>;
export async function buatFolder(parentId: string | null, nama: string): Promise<FolderNode>;
export async function ubahNamaFolder(id: string, nama: string): Promise<void>;
export async function hapusFolder(id: string): Promise<void>;   // lempar Error bila tak kosong
export async function catatFile(input: Omit<FileNode, 'id' | 'urutan'> & { diunggahOleh: string | null }): Promise<FileNode>;
export async function ubahNamaFile(id: string, nama: string): Promise<void>;
export async function hapusFileMeta(id: string): Promise<void>;
/** URL bertanda tangan siap pakai, berlaku 1 jam. */
export async function urlFile(f: Pick<FileNode, 'storage_path'>): Promise<string | null>;
```

`src/lib/haqibah-storage.ts` (server-only):

```ts
export const EXT_DIIZINKAN = ['pdf','xlsx','xls','docx','doc','pptx','ppt','txt','csv','jpg','jpeg','png','webp'];
export const MAKS_UKURAN = 50 * 1024 * 1024;  // 50 MB; batas server action 60 MB
export interface BerkasTersimpan { storage_path: string; ext: string; mime: string; ukuran: number; namaAsli: string; }
/** Validasi + tulis ke bucket. Lempar Error berbahasa Indonesia bila ditolak. */
export async function simpanBerkas(file: File): Promise<BerkasTersimpan>;
export async function hapusBerkas(storagePath: string): Promise<void>;  // best-effort
```

Penjaga akses (dipakai halaman & actions):

```ts
// pengajar: requirePengajar() dari '@/lib/session'
// pengelola: session punya akses role 'koordinator_ketua_kelas' ATAU isSuperadmin()
```

## Alur

**Pengajar** membuka `/haqibah/pengajar[?f=<folderId>]`. Halaman menampilkan
breadcrumb, daftar subfolder, lalu daftar berkas dengan ukuran dan tombol buka.
Tautan berkas adalah URL bertanda tangan (kedaluwarsa 1 jam) ke `/api/audio`.

**Koordinator** membuka `/haqibah/koordinator[?f=<folderId>]`: sama, plus form
buat folder, unggah berkas (multi-berkas), tombol ubah nama, dan tombol hapus.
Semua mutasi lewat server action, `revalidatePath` setelah sukses.

**Galat** dikembalikan sebagai pesan berbahasa Indonesia, bukan lemparan mentah:
ekstensi ditolak, berkas melebihi 50 MB, nama folder bentrok, folder tak kosong,
kedalaman melebihi 3 tingkat.

## Verifikasi

- `npm run typecheck` dan `npm run lint` bersih.
- Migrasi jalan di DB lokal/produksi tanpa galat.
- Manual: pengajar melihat isi; non-pengajar diarahkan (bukan 500).
- Seed idempoten: dijalankan dua kali tidak menggandakan folder/berkas.
