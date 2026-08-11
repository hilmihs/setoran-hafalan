# API publik Maahir — desain

Dibrainstorm bersama user 2026-08-11. **Belum dikerjakan** — dokumen ini spesifikasi,
bukan laporan.

Tujuan user: route API keluar dari Maahir supaya seluruh data program bisa ditarik
dan diolah di website lain.

## Keputusan yang sudah dikunci user

| Aspek | Keputusan |
|---|---|
| Autentikasi | API key per konsumen, `Authorization: Bearer`, disimpan di env |
| Bentuk data | Dua lapis: entitas mentah (registry) + rekap turunan (bungkus lib yang sudah ada) |
| Data pribadi | Nama + UUID keluar; **nomor WA tidak** |
| Tempat key | Tabel `api_client` + halaman `/admin/api-keys` (revisi 2026-08-11 — awalnya env var, diubah supaya bikin/cabut key tidak perlu deploy) |
| Cara panggil | Server-to-server saja; tanpa CORS |
| Struktur kode | Campuran: catch-all + registry untuk entitas, file route eksplisit untuk rekap |
| Cache & mitigasi beban | Masuk sejak versi pertama, bukan ditunda |
| `kehadiran_peserta.catatan` | **Ikut keluar** (keputusan user 2026-08-11) |
| `rekaman.masukan`, tabel request/pengajuan | Tidak dibuka (keputusan user 2026-08-11) |

Satu tabel baru (`api_client`), di-apply sekali ke prod lewat `npm run db -- --confirm`
sebelum deploy — tanpa SSH, karena dari laptop memang tidak ada jalur SSH ke VPS
(`docs/HANDOVER-MAAHIR.md`). Sesudah itu pengelolaan key sepenuhnya lewat halaman admin,
tanpa deploy dan tanpa terminal.

---

## 1. Batas: apa yang tidak keluar, dan mengapa

Permintaan "semua data" ditafsirkan sebagai **semua data program yang berguna diolah**,
bukan semua kolom. Yang tidak pernah keluar dari `/api/v1/*`:

- `password_hash` (`peserta`, `musyrif`, `koordinator`, `syaikh`, `ketua_kelas`) — hash
  bcrypt tetap kredensial; bocor berarti bisa di-crack luring.
- `whatsapp_number`, `ketua_wa`, `wakil_wa` — nomor WA pribadi ratusan orang, dan
  sekaligus **identitas login** sistem ini (login = WA + password).
- `ketua_kelas.magic_token` — token login tanpa password.
- `password_reset_requests.new_password_plaintext` — password polos.
- Kolom `token` di semua tabel request (koreksi, hapus pertemuan, pindah halaqah,
  dualrole, libur) — token persetujuan magic-link.
- Komentar bebas penilai tentang orang: `ket_bacaan`, `ket_hafalan`, `catatan_umum`,
  `masukan`.
- `audio_url` — file audio dilayani lewat URL bertanda tangan HMAC berbatas waktu
  (`/api/audio/...?exp=&sig=`); membocorkannya berarti rekaman suara santri bisa
  diunduh siapa pun pemegang key. `nilai` (hijau/kuning/merah) tetap keluar, jadi
  statistik mutu bacaan tetap bisa dihitung tanpa audionya.

Penegakannya struktural, bukan konvensi — lihat §3.

### Yang ikut keluar meski sensitif: `kehadiran_peserta.catatan`

User memutuskan (2026-08-11) alasan tidak hadir **ikut keluar**. Perlu dicatat terbuka
apa artinya, karena ini membalik sebagian keputusan `a82a944` (Agustus 2026) yang menutup
`GET /api/2in1/kehadiran/[pertemuan_id]` justru karena kolom ini.

Bedanya dengan keadaan sebelum `a82a944`: dulu siapa pun yang menebak/memiliki satu UUID
pertemuan bisa membacanya tanpa kredensial apa pun. Sekarang aksesnya butuh API key
ber-scope yang bisa dikedaluwarsakan, hanya dari server ke server, dan tercatat di log
per konsumen. Jadi kolomnya terbuka bagi pemegang key, bukan terbuka bagi internet.

Konsekuensi yang menempel pada keputusan ini:

- Isinya sering berupa **informasi kesehatan dan urusan keluarga** ("demam", "ibu
  sakit"). Website penerima jadi ikut memegang data itu, dan pengamanan di sisi mereka
  di luar kendali aplikasi ini.
- Karena `catatan` keluar, `keterangan` di payload rekap (gabungan `catatan` — lihat §5)
  **tidak lagi dibersihkan**. Konsistensinya perlu, kalau tidak konsumen menerima kolom
  yang sama di satu route dan tidak di route lain.
- `docs/API-PUBLIC.md` wajib menyebut kolom ini sebagai data sensitif dengan permintaan
  eksplisit: jangan ditayangkan di halaman publik, jangan diindeks mesin pencari.
- Kalau nanti berubah pikiran, menutupnya kembali **memecah kontrak** konsumen yang sudah
  memakainya — beda arah dengan membuka kolom baru yang selalu aman dilakukan.

## 2. Sumber skema yang sah

Penting untuk implementasi: **`db-migration/schema.sql` parsial**. Tabel
`program_kelas`, `program_kelas_anggota`, `pertemuan_program`, `kehadiran_peserta`,
`penilaian_peserta` ada di prod tapi tidak ada di berkas itu, dan juga tidak punya tipe
di `src/types/db.ts` — dipakai langsung lewat `.from('...')`.

Urutan sumber yang dipercaya:

1. `db-migration/maahir_full_dump.sql` — memuat riwayat migrasi 0001–0043, termasuk
   kelima tabel di atas.
2. `scripts/sql/*.sql` — 2 migrasi manual pasca-dump (`mode`, `mulai_tanggal`,
   `maahir_pemutihan`, `laporan_maahir_note`).
3. `information_schema` di prod lewat `npm run db` — **penentu akhir**, karena
   sebagian kolom mungkin di-ALTER lewat admin API tanpa meninggalkan berkas.

Registry dikunci hanya setelah diverifikasi ke sumber 3 (lihat §9 penjaga registry).

---

## 3. Arsitektur & kontrak HTTP

### Letak kode

```
src/app/api/v1/[...path]/route.ts     catch-all entitas mentah
src/app/api/v1/rekap/<nama>/route.ts  6 route rekap eksplisit
src/lib/api-public/
  auth.ts      hash Bearer → cari api_client, cek active/expires/scope, cache 30s,
               flush last_used_at & request_count tiap 60s
  registry.ts  deklarasi entitas: tabel, kolom, filter, urutan, scope
  respond.ts   envelope sukses/error, ETag, kode status, penangkap error
  query.ts     terjemah query-string → panggilan pg-shim
  sanitize.ts  buang kunci terlarang rekursif, Map → objek
  cache.ts     cache respons di memori + pembatas request berjalan

src/app/admin/api-keys/           halaman kelola key (requireAdmin)
  page.tsx, actions.ts
scripts/sql/2026-08-11-api-client.sql   migrasi manual, apply lewat npm run db
```

Next.js mengutamakan segmen statis di atas catch-all, jadi `/api/v1/rekap/sp` tidak
tertangkap `[...path]`.

### Permintaan

```
GET /api/v1/<entitas>?<filter>
Authorization: Bearer k_live_xxxxx
```

`v1` di URL. Perubahan yang memecah konsumen → `v2`; `v1` tetap hidup.

### Envelope sukses

Entitas mentah — `data` array:

```json
{
  "data": [ { "id": "uuid", "name": "..." } ],
  "meta": { "page": 1, "limit": 100, "total": 412, "has_more": true,
            "dari_cache": false, "umur_detik": 0 }
}
```

Route rekap — `data` objek (satu laporan utuh, bukan daftar), `meta` berisi rentang
periode efektif.

### Envelope error

Selalu bentuk ini. Pesan Postgres mentah tidak pernah ikut — nama kolom dan struktur
tabel bukan informasi yang perlu diberikan ke pemegang key.

```json
{ "error": { "code": "forbidden_scope", "message": "Key tidak punya scope 'hits'." } }
```

| HTTP | `code` | Sebab |
|---|---|---|
| 400 | `bad_param` | filter tak dikenal, `limit` di luar 1–500, tanggal bukan `YYYY-MM-DD`, `minggu` bukan hari Senin |
| 401 | `unauthorized` | header hilang/salah format/key tidak cocok/key kedaluwarsa |
| 403 | `forbidden_scope` | key sah, scope tidak mencakup entitas itu |
| 404 | `unknown_entity` | entitas tidak ada di registry |
| 404 | `not_found` | `PUBLIC_API` tidak bernilai `"on"` (saklar induk mati) |
| 429 | `rate_limited` | lewat batas per key, atau antrean request berjalan penuh |
| 500 | `internal` | error tak terduga; detail hanya ke log server |

### Pagination

`page` (mulai 1) + `limit` (default 100, maksimum 500). `total` dari `count: 'exact'`.
Tidak ada mode "ambil semua tanpa batas" — satu request tidak boleh menarik puluhan
ribu baris. Route rekap **tidak** dipaginasi: memotong laporan membuat total dan
rata-rata salah.

### Tarik bertahap

- Tabel bertanggal: `tanggal_dari` / `tanggal_sampai`.
- Tabel dengan `updated_at`: `sejak` (`updated_at >=`).
- Tabel tanpa keduanya hanya bisa ditarik penuh — ditandai di dokumentasi konsumen.

### Keamanan yang dipaksa kode

1. `registry.ts` wajib menyebut `kolom` eksplisit. Tidak ada `select('*')` di seluruh
   jalur ini.
2. Daftar kolom terlarang global dicek **saat modul dimuat**. Kalau ada entitas
   menyebut kolom terlarang, aplikasi **gagal saat start**, bukan diam-diam
   membocorkan. Inilah yang membuat janji "tanpa WA" bersifat struktural.
3. Hanya `GET`. Tidak ada POST/PUT/DELETE di `/api/v1/*` — API ini keluar saja.
4. Nilai filter tidak pernah disisipkan sebagai string SQL; lewat pg-shim yang sudah
   memparameterkan.
5. Tanpa join dinamis (`?include=`). Entitas mengembalikan FK-nya; penggabungan di
   sisi konsumen lewat UUID. Alasan: join dinamis membuka jalan kolom terlarang
   terbawa dari tabel tetangga — persis lubang yang allowlist dipasang untuk menutup.
6. `maintenanceGate` sudah berlaku ke `/api/*` (matcher `src/middleware.ts` menangkap
   semua path), jadi saat maintenance API ikut terkunci. Tidak perlu kode tambahan;
   masuk dokumentasi supaya konsumen menyiapkan retry.

### Saklar induk

`PUBLIC_API` harus persis `"on"`; kalau tidak, seluruh `/api/v1/*` balas
`404 not_found` — pola yang sudah dipakai `ADMIN_DB_API`. Gagal-tertutup: salah pasang
env berarti API mati, bukan terbuka. Ini satu-satunya env yang wajib; sisanya opsional
(`PUBLIC_API_CACHE_TTL`, `PUBLIC_API_MAX_INFLIGHT`).

### Tabel `api_client`

Satu tabel baru. Di-apply sekali ke prod lewat `npm run db -- --confirm`, berkasnya
disimpan sebagai `scripts/sql/2026-08-11-api-client.sql` mengikuti kebiasaan repo.

```sql
create table api_client (
  id            uuid primary key default gen_random_uuid(),
  nama          text not null unique,        -- nama konsumen, mis. 'dashboard-yayasan'
  token_hash    text not null unique,        -- sha256 hex dari key mentah
  token_prefix  text not null,               -- 12 karakter awal, untuk dikenali di UI & log
  scopes        text[] not null,
  active        boolean not null default true,
  expires_at    date,                        -- null = tanpa batas
  keterangan    text,
  created_at    timestamptz not null default now(),
  created_by    text,                        -- WA superadmin pembuat
  revoked_at    timestamptz,
  revoked_by    text,
  last_used_at  timestamptz,
  request_count bigint not null default 0
);
create index api_client_token_hash_idx on api_client (token_hash);
```

Keputusan yang menempel pada tabel ini:

- **Hanya hash yang disimpan** (SHA-256 hex, bukan bcrypt — key ini acak 256-bit, bukan
  password yang bisa ditebak, jadi hash cepat justru yang benar: verifikasi terjadi di
  setiap request). Dump DB yang bocor tidak memberi key yang bisa dipakai.
- Konsekuensinya **key hanya bisa dilihat sekali** saat dibuat. Hilang = bikin baru,
  bukan dilihat ulang.
- Key mentah = `k_live_` + 32 byte acak base64url (`crypto.randomBytes`).
- Verifikasi = hash header lalu cari `token_hash`. Tidak ada perbandingan rahasia
  berbasis byte, jadi tidak butuh `timingSafeEqual` di jalur ini.
- `401` bila: tidak ada barisnya, `active=false`, atau `expires_at < hari ini`.

### Cache autentikasi & jejak pemakaian

Query DB tiap request untuk autentikasi itu mahal dan mudah dihindari, tapi caching
menunda pencabutan. Keseimbangannya:

- Hasil verifikasi (hash → `{id, nama, scopes}`) disimpan di memori **30 detik**. Artinya
  **pencabutan berlaku paling lambat 30 detik**, bukan seketika. Ini masih jauh lebih
  cepat dari pilihan env-var (yang butuh deploy), dan angkanya bisa diturunkan lewat env
  kalau ternyata terasa lama.
- `last_used_at` dan `request_count` **tidak** ditulis per request — dihitung di memori
  lalu di-flush satu `UPDATE` per key setiap 60 detik. Tanpa ini, satu request read
  berubah jadi satu write, dan API read-only justru membebani DB dengan tulisan.
- Konsekuensi yang harus diterima: hitungan yang belum ter-flush hilang kalau proses
  restart. Untuk keperluan "key ini masih dipakai atau tidak", itu tidak masalah.

### Halaman `/admin/api-keys`

Dijaga `requireAdmin()` (`src/lib/admin-guard.ts`, cocokkan WA ke
`ADMIN_WA`/`SUPERADMIN_WAS`) — pola yang sama dengan `/admin/db` dan `/admin/users`.

- Daftar key: nama, `token_prefix`, scope, status (aktif/dicabut/kedaluwarsa),
  `last_used_at`, `request_count`.
- Buat key: isi nama, pilih scope (centang `maahir`/`hits`/`penilaian`), tanggal
  kedaluwarsa opsional, keterangan. Key mentah ditampilkan **sekali** dengan peringatan
  jelas bahwa tidak bisa dilihat lagi.
- Cabut: satu tombol → `active=false` + `revoked_at`/`revoked_by`. Baris tidak dihapus,
  supaya jejaknya tetap ada.
- Setiap pembuatan dan pencabutan dicatat lewat `logAudit()` (`src/lib/audit.ts`, sudah
  ada) — `action: 'api_key_create' | 'api_key_revoke'`, tanpa memuat key atau hash-nya.
- Key mentah **tidak pernah** ditulis ke log, audit, atau pesan error.

Penyerahan key ke website penerima ada di luar aplikasi: salin dari halaman ini, kirim
lewat kanal yang berbeda dari kanal berisi URL API, jangan di grup, dan beri
`expires_at` supaya ada batas hidup walau lupa dicabut.

### Scope

Tiga: `maahir`, `hits`, `penilaian`. Route rekap mewarisi scope domainnya, tidak ada
scope `rekap` terpisah.

---

## 4. Entitas mentah — 36 entitas

### Scope `maahir` (13)

| Route `/api/v1/…` | Tabel | Kolom keluar | Ditahan |
|---|---|---|---|
| `program-kelas` | `program_kelas` | id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, self_attendance, presensi_sifat, created_at | ketua_wa, wakil_wa |
| `anggota` | `program_kelas_anggota` | id, program_kelas_id, peserta_id, name, is_ketua, is_wakil, mulai_tanggal, created_at | whatsapp_number |
| `pertemuan` | `pertemuan_program` | id, program_kelas_id, kelas_id, program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai, keterangan, created_at | — |
| `kehadiran` | `kehadiran_peserta` | id, pertemuan_id, anggota_id, peserta_id, status, mode, setoran_halaman, **catatan**, diisi_at, updated_at, created_at | — |
| `libur` | `program_kelas_libur` | id, program_kelas_id, tanggal_mulai, tanggal_selesai, keterangan, created_at | — |
| `pemutihan` | `maahir_pemutihan` | id, anggota_id, month, tanggal, alasan, dibuat_oleh, dibatalkan_pada, created_at | — |
| `laporan-note` | `laporan_maahir_note` | id, month, teks, urutan, created_at, updated_at | — |
| `peserta` | `peserta` | id, name, gender, kelas_id, active, created_at | whatsapp_number, password_hash |
| `kelas` | `kelas` | id, name, gender, musyrif_id, created_at | — |
| `setoran` | `setoran` | id, peserta_id, week_start, status, submitted_at, checked_at, checked_by_musyrif_id, created_at, updated_at | — |
| `rekaman` | `rekaman` | id, setoran_id, jenis, duration_seconds, recorded_at, nilai, checked_at, created_at | audio_url, masukan |
| `setoran-musyrif` | `setoran_musyrif` | id, musyrif_id, week_start, status, submitted_at, checked_at, checked_by_syaikh_id, created_at | — |
| `rekaman-musyrif` | `rekaman_musyrif` | id, setoran_musyrif_id, jenis, duration_seconds, nilai, checked_at, created_at | audio_url, masukan |

### Scope `hits` (14)

| Route `/api/v1/hits/…` | Tabel | Kolom keluar | Ditahan |
|---|---|---|---|
| `batch` | `hits_batch` | id, slug, name, start_date, active, created_at | — |
| `halaqah` | `hits_halaqah` | id, batch_id, name, gender, pengajar_id, level, program, start_date, jadwal_hari, created_at | — |
| `halaqah-peserta` | `hits_halaqah_peserta` | id, halaqah_id, murid_id, name, is_ketua, created_at | ketua_wa |
| `kaldik-hari` | `hits_kaldik_hari` | id, batch_id, level, tanggal, pekan, is_libur | — |
| `kaldik-pertemuan` | `hits_kaldik_pertemuan` | id, halaqah_id, level, pertemuan_no, tanggal, is_skipped, note | set_by_id |
| `keterangan-harian` | `hits_keterangan_harian` | id, halaqah_id, level, pertemuan_no, tanggal, kondisi, status_latihan, source, created_at | diisi_by_id |
| `pelanggaran` | `hits_pelanggaran` | id, keterangan_id, jenis, menit | — |
| `hutang-bayar` | `hits_hutang_bayar` | id, halaqah_id, pengajar_id, keterangan_id, menit, tanggal, created_at | — |
| `teguran` | `hits_teguran` | id, pengajar_id, category, year_month, nomor_teguran, created_at | source_ref_* |
| `tabayyun` | `hits_tabayyun` | id, keterangan_id, pengajar_id, status, kondisi, alasan, deadline_at, created_at | koordinator_kk_id |
| `kajian-presensi` | `hits_kajian_presensi` | id, **ketua_nama** (join), halaqah_id, tanggal, status, created_at | ketua_wa |
| `kajian-libur` | `hits_kajian_libur` | id, tanggal | — |
| `pengajar` | `pengajar` | id, name, gender, kelompok_id, is_ketua, matrix_exclude, active, created_at | whatsapp_number |
| `kelompok-pengajar` | `kelompok_pengajar` | id, name, gender, created_at | — |

`hits_kajian_presensi` satu-satunya tabel yang **kuncinya nomor WA** (`ketua_wa`), bukan
UUID. Kalau WA ditahan mentah, barisnya tak bisa dikenali. Registry me-resolve kolom itu
jadi `ketua_nama` + `halaqah_id` lewat pencocokan ke `hits_halaqah_peserta.ketua_wa`;
WA-nya sendiri tidak pernah masuk payload. Konsekuensi: ketua yang WA-nya tak lagi
terdaftar di halaqah mana pun keluar sebagai `ketua_nama: null` — barisnya **tetap ada**
supaya hitungan agregat tidak berubah. Pemetaan ini di-hardcode di registry, bukan dari
parameter.

### Scope `penilaian` (5)

| Route `/api/v1/…` | Tabel | Kolom keluar |
|---|---|---|
| `penilaian-peserta` | `penilaian_peserta` | id, peserta_id, year_month, skor_bacaan, skor_hafalan, assessor_role, updated_at |
| `penilaian-masyaikh` | `penilaian_masyaikh` | id, pengajar_id, year_month, skor_bacaan, skor_hafalan, assessor_role, updated_at |
| `penilaian-pedagogis` | `penilaian_pedagogis` | id, pengajar_id, year_month, semua `skor_*`, updated_at |
| `matrix-rekap` | `matrix_rekap` | id, pengajar_id, year_month, semua `skor_*` & `rata_rata_*`, ranking, total_teguran_*, updated_at |
| `indikator-standar` | `indikator_standar` | kode, kategori, nama, standar |

### Referensi orang (4, ikut scope pemanggil)

`musyrif`, `koordinator`, `syaikh`, `koordinator-ketua-kelas` — hanya
`id, name, gender, active`. Cukup untuk menerjemahkan `checked_by_musyrif_id` dsb jadi
nama. `ketua_kelas` **tidak dibuka sama sekali**: hampir seluruh isinya kredensial
(`password_hash`, `magic_token`), dan nama ketuanya sudah tersedia lewat
`hits/halaqah-peserta`.

### Sengaja tidak dibuka

- **Kredensial/token**: `password_reset_requests`; tabel request
  (`hits_pertemuan_koreksi`, `hits_pertemuan_koreksi_item`,
  `hits_pertemuan_hapus_request`, `hits_halaqah_pindah_request`,
  `ketua_dualrole_request`, `program_kelas_libur_request`). Bisa dibuka nanti tanpa
  kolom `token` kalau perlu — di luar v1 karena isinya alur kerja internal.
- **Internal/audit**: `audit_log`, `session_log`, `wa_reminder_log`,
  `koordinator_notes`, `shakwa`.
- **Legacy** (handover menandainya jangan dibangun di atasnya): `kelas_hits`,
  `observasi_kelas`, `tabayyun`, `teguran`, `jadwal_pindah`, `checkin_pengajar`,
  `program_kehadiran`, `pengajuan_alasan`, `libur_program`, `hits_sheet_source`.

---

## 5. Route rekap — 6 route

### Kenapa perlu lapisan pembersih

Tiga temuan dari lib yang dipakai ulang. Route rekap **tidak boleh**
`NextResponse.json(hasilLib)`:

1. `getMaahirRekap` mengembalikan `RekapAnggota.whatsappNumber`. Lib internal memang
   butuh; API tidak boleh mengeluarkannya. Menyerahkan hasil lib apa adanya membocorkan
   keputusan "tanpa WA" lewat pintu belakang.
2. `keterangan` di `RekapAnggota` dan `StudentAtt` adalah gabungan
   `kehadiran_peserta.catatan`. Karena `catatan` ikut keluar (§1), kolom ini **tidak**
   dibersihkan — dibiarkan lewat supaya konsisten dengan entitas `kehadiran`. Tetap
   dicatat di sini agar jelas bahwa itu keputusan, bukan kelalaian.
3. `HitsKoordinatorRekap.insidenByPengajar` dan `.cakupanByPengajar` bertipe `Map`.
   `JSON.stringify(new Map())` menghasilkan `{}` — bukan error, tapi **datanya hilang
   tanpa suara**. Harus dikonversi eksplisit jadi objek biasa.

`sanitize.ts`: satu fungsi rekursif yang membuang kunci terlarang dalam bentuk
snake_case **dan** camelCase (`whatsapp_number`/`whatsappNumber`, `ketua_wa`/`ketuaWa`,
`password_hash`, `magic_token`, `masukan`, `ket_bacaan`, `catatan_umum`, …) dan mengubah
`Map` jadi objek. Semua route rekap wajib melewatinya. `catatan`/`keterangan` **tidak**
masuk daftar ini — lihat §1.

### Daftar route

| Route | Parameter | Sumber | Scope |
|---|---|---|---|
| `GET /api/v1/rekap/laporan-maahir` | `bulan=YYYY-MM` (wajib) | `getLaporanMaahir(bulan)` | `maahir` |
| `GET /api/v1/rekap/sp` | `gender`, `sampai_bulan=YYYY-MM` | `getMaahirSP({gender, sampaiBulan})` | `maahir` |
| `GET /api/v1/rekap/kehadiran` | `bulan` (wajib), `gender`, `program`, `kelas_id` (boleh berulang) | `getMaahirRekap(bulan, opts)` | `maahir` |
| `GET /api/v1/rekap/tibyan` | `bulan` (wajib), `gender` | `getTibyanView(bulan, {gender})` | `maahir` |
| `GET /api/v1/rekap/hits-disiplin` | `mode=bulan\|minggu`, `bulan`, `minggu=YYYY-MM-DD` (Senin), `gender` | `getHitsKoordinatorRekap({...})` | `hits` |
| `GET /api/v1/rekap/matrix-guru` | `bulan` (wajib), `gender` | join `kelompok_pengajar`+`pengajar`+`matrix_rekap`, pola `/api/matrix/download` | `penilaian` |

Catatan per route:

- **`laporan-maahir`** memakai **periode 28–27**, bukan kalender bulan (`monthRange`).
  `bulan=2026-08` = 28 Juli–27 Agustus. Rentang aktual masuk `meta`
  (`{"bulan":"2026-08","mulai":"2026-07-28","sampai":"2026-08-27"}`) supaya konsumen
  tidak salah melabeli grafik.
- **`sp` kumulatif sejak `PROGRAM_START` (2026-01-01)**, bukan per bulan;
  `sampai_bulan` hanya memindahkan batas akhir, dan lib memotong ke hari ini kalau
  bulan yang diminta masih berjalan. `meta.cutoff` = tanggal efektif.
- **`hits-disiplin`** mengharuskan `mode`. `mode=bulan` → `bulan` wajib;
  `mode=minggu` → `minggu` wajib dan **harus hari Senin**; bukan Senin → 400, jangan
  dibetulkan diam-diam karena angkanya akan beda dari yang dilihat koordinator.
  Mode bulan memakai kalender penuh (`rentangBulan`), bukan window 28–27 — beda dari
  `laporan-maahir`, dan perbedaan ini ditulis di dokumentasi konsumen.
- **`matrix-guru`** membaca snapshot `matrix_rekap`, bukan hitung ulang. Bulan yang
  belum pernah di-recompute → hasil kosong, bukan nol. `meta.snapshot_terakhir` =
  `max(updated_at)`; `meta.basi = true` bila snapshot lebih tua dari akhir bulan yang
  diminta.

---

## 6. Kontrak filter entitas

Umum di semua entitas: `page`, `limit`, `urut` (`asc`/`desc` pada kolom urutan default).
Selain itu hanya filter yang terdaftar di registry. **Parameter tak dikenal → 400**,
tidak diabaikan diam-diam, supaya salah tulis (`gender=iwkhan`) tidak terbaca sebagai
"tanpa filter" lalu konsumen menyangka datanya memang segitu.

| Entitas | Filter |
|---|---|
| `peserta`, `pengajar` | `gender`, `active`, `kelas_id` / `kelompok_id` |
| `program-kelas` | `gender`, `self_attendance`, `presensi_sifat` |
| `anggota` | `program_kelas_id`, `is_ketua`, `is_wakil` |
| `pertemuan` | `program_kelas_id`, `program`, `tanggal_dari`, `tanggal_sampai` |
| `kehadiran` | `pertemuan_id`, `anggota_id`, `status`, `mode`, `sejak` |
| `libur` | `program_kelas_id`, `tanggal_dari`, `tanggal_sampai` |
| `hits/kajian-libur` | `tanggal_dari`, `tanggal_sampai` |
| `pemutihan` | `anggota_id`, `month`, `aktif` (`dibatalkan_pada is null`) |
| `laporan-note` | `month` |
| `setoran`, `setoran-musyrif` | `peserta_id` / `musyrif_id`, `status`, `week_start`, `tanggal_dari`, `tanggal_sampai` |
| `rekaman`, `rekaman-musyrif` | `setoran_id` / `setoran_musyrif_id`, `jenis`, `nilai` |
| `hits/batch` | `active` |
| `hits/halaqah` | `batch_id`, `gender`, `pengajar_id`, `level`, `program` |
| `hits/halaqah-peserta` | `halaqah_id`, `is_ketua` |
| `hits/kaldik-hari` | `batch_id`, `level`, `tanggal_dari`, `tanggal_sampai`, `pekan`, `is_libur` |
| `hits/kaldik-pertemuan` | `halaqah_id`, `level`, `pertemuan_no`, `is_skipped` |
| `hits/keterangan-harian` | `halaqah_id`, `level`, `pertemuan_no`, `kondisi`, `tanggal_dari`, `tanggal_sampai` |
| `hits/pelanggaran` | `keterangan_id`, `jenis` |
| `hits/hutang-bayar` | `halaqah_id`, `pengajar_id`, `tanggal_dari`, `tanggal_sampai` |
| `hits/teguran` | `pengajar_id`, `category`, `year_month` |
| `hits/tabayyun` | `pengajar_id`, `status`, `keterangan_id` |
| `hits/kajian-presensi` | `halaqah_id`, `status`, `tanggal_dari`, `tanggal_sampai` |
| `penilaian-*`, `matrix-rekap` | `peserta_id` / `pengajar_id`, `year_month`, `sejak` |
| `indikator-standar` | `kategori` |
| `kelas`, `kelompok-pengajar`, referensi orang | `gender`, `active` |

---

## 7. Cache & pembatas beban

Masuk sejak versi pertama atas permintaan user. Di memori proses — aplikasi jalan
sebagai satu proses systemd (`next-maahir`), jadi tidak perlu Redis.

| Aspek | Keputusan |
|---|---|
| Kunci cache | `route + query-string ternormalisasi + daftar scope pemanggil (terurut)` |
| Scope ikut kunci | kalau nanti ada scope yang mengubah isi payload, key berscope sempit tidak boleh terlayani dari entri milik key berscope luas |
| Key **tidak** ikut kunci | dua konsumen berscope sama menerima data identik; memasukkan key hanya menggandakan entri dan memboroskan RAM |
| TTL entitas mentah | 60 detik |
| TTL route rekap | 300 detik — jauh lebih mahal (memindai sebulan kehadiran), isinya nyaris tak berubah dalam hitungan menit |
| Batas memori | total 32 MB, buang entri terlama saat penuh; entri > 1 MB tidak di-cache supaya satu respons raksasa tidak menendang semua entri kecil |
| Override | `PUBLIC_API_CACHE_TTL` (detik, `0` = matikan) untuk investigasi tanpa deploy ulang kode |

Lapis kedua, menghemat bandwidth: setiap respons membawa `ETag` (hash isi) dan
`Cache-Control: private, max-age=60`. Request dengan `If-None-Match` yang cocok dibalas
**304 tanpa body**.

Konsekuensi yang wajib masuk dokumentasi konsumen: **data bisa tertinggal sampai 60
detik (rekap 5 menit)**. `meta.dari_cache` dan `meta.umur_detik` membuat kondisi itu
terlihat.

### Pembatas request berjalan

Rate limit 120/menit per key tidak melindungi dari 10 request berat serentak — sepuluh
pemindaian sebulan kehadiran bersamaan bisa membuat halaman koordinator merangkak.
Jadi: maksimum **4 request `/api/v1/*` diproses bersamaan** (`PUBLIC_API_MAX_INFLIGHT`),
sisanya menunggu paling lama 5 detik lalu `429` + `Retry-After: 2`.

Ini mitigasi terpenting di dokumen ini: mode kegagalan yang paling merugikan bukan API
lambat, tapi API yang membuat aplikasi kerja harian tidak bisa dipakai.

### Rate limit

120 request/menit per key, hitungan di memori, header `Retry-After` saat 429.

---

## 8. Error, jejak, dan kendali key

- Semua error tak terduga ditangkap di satu tempat (`respond.ts`) → `500
  {error:{code:'internal'}}`; detail asli ke `console.error` + `recordErrorDiag()`
  (`src/lib/error-diag.ts`, sudah ada).
- Setiap request satu baris log: nama konsumen dan `token_prefix` (**bukan key-nya**),
  route, jumlah baris, durasi, `dari_cache`. Cukup untuk menjawab "kenapa VPS berat jam
  3 pagi".
- Kegagalan `401` juga dicatat dengan `token_prefix` percobaan. Rentetan 401 dari prefix
  yang tak dikenal = ada yang menebak-nebak key; itu sinyal yang perlu terlihat.
- `last_used_at` + `request_count` per key tersimpan di tabel (di-flush tiap 60 detik),
  jadi "key ini masih dipakai atau sudah bisa dicabut" bisa dijawab dari halaman admin
  tanpa membaca log server.

**Pencabutan**: lewat `/admin/api-keys`, berlaku paling lambat 30 detik (cache
autentikasi). Tanpa deploy, tanpa terminal, tanpa SSH. Penghenti darurat yang lebih luas
tetap tersedia: `PUBLIC_API=off` (perlu deploy) atau `MAINTENANCE_MODE` untuk seluruh
aplikasi.

---

## 9. Penjaga registry vs skema prod

`scripts/check-api-registry.ts` (`npm run check-api`) — membaca `information_schema`
lewat admin API, memeriksa tiga hal:

1. Setiap kolom yang disebut registry benar-benar ada. Salah tulis nama kolom terdeteksi
   sebelum deploy, bukan jadi 500 di tangan konsumen.
2. Tidak ada kolom terlarang yang lolos masuk daftar `kolom`.
3. **Kolom baru di prod yang belum dikenal registry dilaporkan.** Penjaga ke depan:
   kalau nanti ada `ALTER TABLE ... ADD COLUMN whatsapp_cadangan`, ini menyebutnya, jadi
   kolom sensitif baru tidak diam-diam ikut keluar hanya karena registry tak ditinjau.

Butuh jaringan ke prod, jadi dijalankan manual sebelum deploy.

---

## 10. Tes

Mengikuti pola repo (`scripts/test-*.ts`, fungsi murni, `tsx`, tanpa framework). Satu
berkas `scripts/test-api-public.ts`, alias `npm run test-api`. Semuanya luring.

| Yang diuji | Kenapa |
|---|---|
| Pembuatan key: panjang & bentuk `k_live_…`, `token_prefix` konsisten dengan key, hash cocok, dua pembuatan tak pernah menghasilkan key sama | key lemah/kembar = seluruh pembatas ini tak berarti |
| Verifikasi key (baris palsu di memori, tanpa DB): benar, salah, header tanpa `Bearer`, header kosong, `active=false`, `expires_at` kemarin/hari ini/besok | jalur autentikasi satu-satunya pembatas data ini; batas tanggal harus jelas inklusif/eksklusifnya |
| Cache autentikasi: hit dalam 30 detik, miss sesudahnya, dan **baris yang dicabut berhenti berlaku setelah TTL habis** | menahan janji "pencabutan berlaku ≤30 detik" |
| Flush `last_used_at`/`request_count`: hitungan terkumpul benar, satu `UPDATE` per key per siklus, hitungan direset sesudah flush | mencegah API read-only berubah jadi satu write per request |
| Cek scope: key `maahir` menembak entitas `hits` → 403 | pemisahan scope harus nyata, bukan dokumentasi |
| Audit registry: setiap entitas vs daftar kolom terlarang | menjaga janji "tanpa WA" saat entitas baru ditambah orang lain nanti |
| `sanitize()`: objek bersarang, array, `Map`, kunci camelCase & snake_case di berbagai kedalaman | lubang paling mungkin, karena lib rekap internal memang membawa kolom itu |
| `sanitize()` **tidak** membuang `keterangan`/`catatan`, tapi tetap membuang `whatsappNumber` pada objek yang sama | mencegah "sekalian dibersihkan semua" saat kode disunting orang lain, dan sebaliknya |
| Parse filter: nama tak dikenal → 400; `limit` 0/501/`abc` → 400; tanggal `2026-8-1` → 400; `minggu` bukan Senin → 400 | filter yang diabaikan diam-diam menghasilkan data yang salah dipercaya |
| Rate limit di batas (120 lolos, 121 kena) | — |
| Cache: hit/miss, kadaluwarsa TTL, kunci beda karena scope beda, entri > 1 MB dilewati, pembuangan saat 32 MB penuh | cache yang salah kunci = data satu konsumen terlihat konsumen lain |
| Pembatas inflight: 4 lolos, ke-5 menunggu, timeout → 429 | — |
| `ETag`: isi sama → etag sama; `If-None-Match` cocok → 304 | — |

Verifikasi terhadap data nyata dilakukan setelah deploy: `curl` beberapa route dengan
key uji, lalu bandingkan dengan angka di halaman koordinator untuk bulan yang sama —
khususnya `rekap/laporan-maahir` dan `rekap/hits-disiplin`, dua yang paling banyak
aturan bisnisnya.

---

## 11. Dokumentasi konsumen

`docs/API-PUBLIC.md` — cukup untuk orang di website lain bekerja tanpa bertanya:

- Base URL, cara pakai header Bearer, contoh `fetch` server-side yang bisa disalin.
- Tabel 42 route: path, scope, filter sah, contoh respons ringkas.
- Daftar kolom yang **tidak akan pernah** keluar, supaya tidak ditunggu-tunggu.
- Peringatan khusus `catatan` / `keterangan`: berisi alasan tidak hadir, sering menyangkut
  kesehatan dan urusan keluarga. Jangan ditayangkan di halaman publik, jangan diindeks
  mesin pencari, batasi ke pengguna yang memang berhak di sisi mereka.
- Perilaku cache (60 detik / 5 menit), `ETag`/`If-None-Match`, arti 429 dan 503.
- Aturan bisnis yang gampang salah dihitung ulang di sisi konsumen, ditulis eksplisit:
  periode laporan 28–27; `hits-disiplin` mode bulan justru kalender penuh; sakit tidak
  menggerus persen kehadiran (sesinya keluar dari penyebut); pemutihan SP membuat persen
  dianggap 100; anggota yang bergabung tengah periode punya penyebut terpotong;
  `matrix_rekap` snapshot bukan hitungan langsung. **Ini alasan utama lapis rekap ada** —
  kalau konsumen menghitung sendiri dari entitas mentah tanpa aturan ini, angkanya beda
  dari yang dilihat koordinator, dan yang disalahkan nanti aplikasi Maahir.
- Pola sinkronisasi harian yang disarankan: `sejak=<updated_at terakhir>` untuk tabel
  yang punya kolom itu, tarik penuh untuk yang tidak.

`docs/HANDOVER-MAAHIR.md` §HTTP API Endpoints juga diperbarui — 4 route yang sudah ada
tapi belum terdaftar (`/api/2in1/setoran-kelas`, `/api/admin/recompute-matrix`,
`/api/hits/koordinator/download`, `/api/laporan/maahir/kehadiran/download`), blok
`/api/v1/*`, dan `Last updated` disegarkan. Tabel itu memang yang sedang ditambahi, jadi
sekalian dibetulkan.

---

## 12. Urutan kerja

1. **Skema** — `scripts/sql/2026-08-11-api-client.sql`, di-apply ke prod lewat
   `npm run db -- --confirm`. Didahulukan karena pipeline tidak menjalankan migrasi:
   kode yang bergantung tabel ini tidak boleh di-deploy sebelum tabelnya ada.
2. **Fondasi** — `auth.ts` (hash, cari baris, cache 30 detik, flush pemakaian),
   `respond.ts`, `query.ts`, `sanitize.ts`, `cache.ts`, `registry.ts` (kerangka + daftar
   kolom terlarang + audit saat modul dimuat), `scripts/test-api-public.ts`. Belum ada
   route; tes hijau dulu.
3. **Halaman `/admin/api-keys`** — daftar, buat (tampil sekali), cabut, `logAudit()`.
   Didahulukan sebelum route data supaya key uji bisa dibuat lewat jalur yang sebenarnya,
   bukan lewat SQL tangan yang nanti tak terpakai.
4. **Catch-all entitas + scope `maahir`** — `src/app/api/v1/[...path]/route.ts` + 13
   entitas. Sekaligus verifikasi kolom nyata di prod
   (`npm run db "select column_name from information_schema.columns where table_name='...'"`),
   karena `schema.sql` parsial (§2).
5. **Registry `hits` + `penilaian` + referensi orang** — 14 + 5 + 4 entitas, termasuk
   kasus khusus `hits/kajian-presensi`.
6. **Enam route rekap** — masing-masing membungkus lib yang sudah ada, semua lewat
   `sanitize()`.
7. **Penjaga registry** — `scripts/check-api-registry.ts`, jalankan terhadap prod.
8. **Dokumentasi** — `docs/API-PUBLIC.md` + perbaikan tabel `HANDOVER-MAAHIR.md`.
9. **Rilis** — pasang `ENV_PUBLIC_API=on` (dan opsional
   `ENV_PUBLIC_API_MAX_INFLIGHT`/`ENV_PUBLIC_API_CACHE_TTL`) di variable group
   `Maahir-Prod` (pipeline mengekspor `ENV_*`), deploy, buat key lewat
   `/admin/api-keys`, lalu uji `curl` dan bandingkan dengan angka di layar. Key
   berikutnya tidak perlu deploy lagi.

---

## 13. Risiko yang tersisa

| Risiko | Status |
|---|---|
| Beban VPS dari 42 route read di proses yang sama | dimitigasi: cache 60/300 detik, `ETag`→304, `limit` maks 500, rate limit 120/menit, maks 4 request berjalan, tanpa join dinamis |
| Key bocor | dimitigasi: hanya hash yang tersimpan, scope & `expires_at` per key, pencabutan lewat `/admin/api-keys` berlaku ≤30 detik tanpa deploy, `last_used_at`/`request_count` + log 401 per prefix untuk mendeteksi pemakaian asing |
| Halaman admin jadi permukaan serang baru (pembuat key = pemegang seluruh data) | dijaga `requireAdmin()` yang sama dengan `/admin/db`; setiap buat/cabut masuk `audit_log`. Tidak menambah kelemahan baru selama akun superadmin aman — tapi memang menaikkan nilai akun itu |
| Snapshot `matrix_rekap` basi | dimitigasi: `meta.snapshot_terakhir` + `meta.basi`; API tidak memicu recompute |
| Kolom prod tanpa berkas migrasi | dimitigasi: `npm run check-api` sebelum deploy, melaporkan juga kolom baru yang belum dikenal registry |
| Alasan tidak hadir (`catatan`) keluar ke sistem lain | diterima user secara sadar; dibatasi API key ber-scope + kedaluwarsa + server-to-server + log per konsumen. Pengamanan di sisi website penerima di luar kendali aplikasi ini |
| Data tertinggal ≤ 60 detik (rekap ≤ 5 menit) karena cache | diterima; terlihat lewat `meta.dari_cache`/`meta.umur_detik`, ditulis di dokumentasi konsumen |
| Konsumen menghitung ulang aturan bisnis dan hasilnya beda dari layar koordinator | dimitigasi: lapis rekap + aturan ditulis eksplisit di `docs/API-PUBLIC.md`. Tidak bisa dicegah teknis kalau mereka tetap memilih hitung sendiri |
