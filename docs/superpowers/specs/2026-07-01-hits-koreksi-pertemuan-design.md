# Spec — Koreksi Pertemuan HITS (ketua → koordinator KK)

## Context

Pertemuan HITS diturunkan otomatis dari kaldik (`hits_kaldik_hari` per `batch+level`,
2 pertemuan/pekan, skip `is_libur`) + override koordinator (`hits_kaldik_pertemuan`).
Program `dasar` = 2 tahap (Nuroniyyah → Perbaikan), sekuensial; `lanjutan` = 1 tahap.

Masalah: halaqah dalam satu batch **mulai di pekan berbeda** (ada yang duluan, ada
yang belakangan), tapi kaldik dibagi rata per batch → halaqah yang mulai belakangan
dapat pertemuan-pertemuan awal "hantu" (kelebihan di depan). Selain itu ada anomali
ad-hoc: sesi terlewat (kurang), sesi tambahan, tanggal salah, libur dadakan.

Saat ini hanya **koordinator** bisa override, dan **ketua** hanya bisa *ajukan hapus*
satu pertemuan (`hits_pertemuan_hapus_request` → `/hits/hapus-pertemuan/[token]`).
Tujuan: ketua bisa mengajukan koreksi penuh (tambah/hapus/ubah tanggal + set mulai),
diputuskan koordinator KK per-item, lalu diterapkan ke override/derivasi.

## Keputusan (final)

| Hal | Keputusan |
|---|---|
| Cakupan koreksi | tambah + hapus + ubah tanggal (+ set tanggal mulai) |
| Bentuk pengajuan | 1 pengajuan multi-item |
| Keputusan koordinator | per-item (acc/tolak satuan) |
| Alur hapus lama | digabung ke alur baru (di-retire) |
| Offset mulai | field `hits_halaqah.start_date` (tanggal) + ketua bisa ajukan |
| Penomoran sesi tambah | append `max(pertemuan_no per tahap)+1` |
| Pertemuan dibuang yg sudah ada keterangan | keterangan ikut dihapus (matrix akurat) |
| Approver | koordinator ketua kelas (gender-scoped), via magic-link |

## Arsitektur

### 1. Start per-halaqah (offset mulai)
- Migrasi: `alter table hits_halaqah add column start_date date` (nullable; null = perilaku lama).
- `deriveHalaqahProgram(...)` terima `startDate?: string`; setelah derivasi & sort,
  `if (startDate) out = out.filter(d => d.tanggal >= startDate)`.
- Pemanggil yang teruskan `start_date`: `loadHalaqahPertemuan` (`hits-ketua.ts`) &
  `getHitsRekap` (`hits-rekap.ts`) — keduanya tambah `start_date` ke select `hits_halaqah`.

### 2. Data model (migrasi baru)
`hits_pertemuan_koreksi` (header):
- id uuid pk, halaqah_id (fk hits_halaqah cascade), requested_by_ketua_id (fk ketua_kelas null),
  requested_by_name text, requested_by_wa text, token text unique,
  status text default 'pending' check in ('pending','selesai'),
  created_at, decided_at, decided_by_role, decided_by_id.
- unique partial index (halaqah_id) where status='pending' → cegah dobel pending.

`hits_pertemuan_koreksi_item`:
- id uuid pk, koreksi_id (fk cascade), jenis text check in ('set_mulai','tambah','hapus','ubah_tanggal'),
  level text null (HitsLevel; null utk set_mulai), pertemuan_no smallint null (utk hapus/ubah_tanggal),
  tanggal date null (utk set_mulai/tambah/ubah_tanggal), catatan text,
  status text default 'pending' check in ('pending','approved','rejected'), decided_at.
- RLS on (akses via service role).

### 3. Alur ketua (submit)
Entry: `/hits/ketua` (atau sub `/hits/ketua/koreksi`). Dari daftar slot pertemuan
(HitsKetuaForm) ketua menyusun draft item:
- per slot: **hapus** (jenis=hapus, level+pertemuan_no) / **ubah tanggal** (jenis=ubah_tanggal, level+pertemuan_no+tanggal baru)
- global: **+ tambah pertemuan** (jenis=tambah, pilih tahap/level + tanggal)
- **set tanggal mulai kelas** (jenis=set_mulai, tanggal)
Submit (server action) → insert 1 `hits_pertemuan_koreksi` + N item (token uuid) →
tentukan approver = koordinator_ketua_kelas aktif gender-sama (fallback gender lain) →
balikan `buildWaMeUrl(koordinator_wa, tpl...)` berisi magic-link `/hits/koordinator/koreksi/<token>`.
Audit `logAudit('hits.koreksi.request')`.

### 4. Alur koordinator KK (decide)
`/hits/koordinator/koreksi/[token]` (gate `requireKoordinatorKetuaKelas`; cek halaqah gender = koordinator gender).
List item + checkbox approve/reject per item + simpan. Saat **approve** per item:
- `set_mulai`: `update hits_halaqah set start_date=item.tanggal`; lalu
  `delete from hits_keterangan_harian where halaqah_id=H and tanggal < item.tanggal` (buang keterangan sesi yg kini terbuang).
- `hapus`: upsert `hits_kaldik_pertemuan(halaqah_id, level, pertemuan_no, is_skipped=true)`;
  `delete from hits_keterangan_harian where halaqah_id=H and level=L and pertemuan_no=N`.
- `ubah_tanggal`: upsert `hits_kaldik_pertemuan(halaqah_id, level, pertemuan_no, tanggal=baru, is_skipped=false)`;
  `update hits_keterangan_harian set tanggal=baru where halaqah_id=H and level=L and pertemuan_no=N` (jaga konsistensi).
- `tambah`: hitung `no = max(pertemuan_no derived+override pada level L)+1`;
  insert `hits_kaldik_pertemuan(halaqah_id, level=L, pertemuan_no=no, tanggal=baru, is_skipped=false)`
  (jadi override manual yang ditambahkan `deriveHalaqahPertemuanWithOverrides`).
Item → status approved/rejected + decided_at. Setelah semua item diputuskan → header status='selesai',
balikan wa.me info ke ketua (`requested_by_wa`). Audit per keputusan.

> Catatan: `hits_kaldik_pertemuan` saat ini di-query dengan kolom `level` (lihat hits-rekap.ts).
> Verifikasi unique key = `(halaqah_id, level, pertemuan_no)` saat implementasi; jika masih
> `(halaqah_id, pertemuan_no)` (migrasi 0024), tambahkan migrasi penyesuaian.

### 5. Retire alur hapus lama
- `/hits/hapus-pertemuan/[token]` + `hits_pertemuan_hapus_request` disimpan utk riwayat,
  tapi entry-point "ajukan hapus" di UI ketua diarahkan ke alur koreksi baru (hapus = jenis item).

### 6. Otorisasi
- Ketua: hanya halaqah yang dia pimpin (cek `ketua_kelas.hits_halaqah_id` = WA login).
- Koordinator KK: gender-scoped (halaqah.gender = session.gender), magic-link digate login.

## Komponen & file (ringkas)
- Migrasi: `0031_hits_pertemuan_koreksi.sql` (+ `start_date` di hits_halaqah; + penyesuaian unique hits_kaldik_pertemuan bila perlu). Migrasi terakhir saat ini = 0030.
- `src/lib/hits-pertemuan.ts`: param `startDate` di `deriveHalaqahProgram`.
- `src/lib/hits-ketua.ts`, `src/lib/hits-rekap.ts`: select + teruskan `start_date`.
- `src/lib/hits-koreksi.ts` (baru): helper buat/terapkan koreksi + tentukan approver.
- `src/app/hits/ketua/` : UI draft koreksi + server action submit.
- `src/app/hits/koordinator/koreksi/[token]/` : page + DecidePanel + actions.
- `src/lib/whatsapp.ts`: template `tplKoreksiPertemuanApproval` + `tplKoreksiPertemuanInfo`.

## Edge cases
- `set_mulai` menghapus keterangan → konfirmasi destruktif di UI ketua + koordinator.
- Dobel pengajuan pending utk halaqah sama dicegah unique partial index.
- `tambah` no = max+1 per tahap → identitas unik; tampilan tetap urut tanggal.
- Item ditolak tak mengubah apa pun; ketua bisa ajukan ulang.

## Verifikasi
- Migrasi apply; `start_date` set pada satu halaqah late-start → pertemuan awal hilang dari derivasi (ketua & dashboard).
- Ketua ajukan 1 koreksi multi-item (set_mulai + tambah + hapus + ubah) → wa.me ke koordinator.
- Koordinator approve sebagian → cek: start_date ter-set, override is_skipped/tanggal/baris baru terbentuk, keterangan sesi terbuang terhapus, matrix %KBBS/%latihan menyesuaikan.
- Tolak item → tak ada perubahan utk item itu.
