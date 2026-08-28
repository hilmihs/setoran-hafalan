# Tabayyun: klaim penunaian hutang menit oleh pengajar

Tanggal: 2026-08-28

## Masalah

Saat koordinator ketua kelas melakukan tabayyun ke pengajar yang punya hutang menit,
pengajar hanya bisa menjawab dengan alasan teks bebas. Tidak ada tempat untuk
menyatakan "di pertemuan itu saya sudah menunaikan sekian menit". Akibatnya
penunaian hutang hanya tercatat kalau ketua kelas kebetulan melaporkannya, dan
koordinator memutuskan tabayyun tanpa melihat klaim pengajar.

## Keadaan sekarang

- `hits_tabayyun` — satu baris per `keterangan_id` (unik). Pengajar mengisi
  `alasan_pengajar` lewat `/hits/pengajar` (butuh login). Koordinator memutus
  (`is_udzur_syari`, `keputusan_catatan`) lewat `TabayyunCard`.
- `hits_hutang_bayar` — ledger credit-only per halaqah. **Hanya ketua kelas**
  yang mengisi, lewat `src/app/hits/ketua/actions.ts`, dengan pola
  *replace-all per `keterangan_id`* (`delete().eq('keterangan_id', …)` lalu insert).
- Saldo hutang = debit (dihitung dari `hits_pelanggaran`) − total kredit; alokasi
  ke pertemuan lama FIFO (`allocateHutang`).
- WA reminder tabayyun (`tplTabayyunToPengajar`) sudah menyebut saldo hutang dan
  mengirim tautan ke `/hits/pengajar`.
- `src/middleware.ts` memakai daftar **protected**; rute yang tidak terdaftar
  bersifat publik (contoh: `/shakwa`).

### Cacat yang ditemukan saat menelaah alur

Izin pra-kelas (Shakwa) menutup tabayyun secara otomatis **tanpa pernah
membandingkan menit**:

- Jalur maju — `src/app/hits/ketua/actions.ts:334-353`: `cariIzinCocok` mencocokkan
  pengajar + tanggal + jenis saja, lalu tabayyun dibuat langsung dengan
  `status='awaiting_reason'` dan `alasan_pengajar` dari izin.
- Jalur balik — `backfillTabayyunDariIzin` (`src/lib/shakwa-izin.ts:151-186`):
  `izinCocokKondisi` juga hanya membandingkan jenis.

Akibatnya, pengajar yang melapor izin "terlambat 10 menit" sementara observasi
ketua kelas mencatat 15 menit dianggap sudah selesai berklarifikasi. Selisih 5
menit tak pernah ditanyakan, dan pertanyaan hutang tak pernah muncul sama sekali
untuk kasus berizin — padahal debit hutang tetap terbentuk (`max(0, 15-5)` = 10
menit, `src/lib/hits-hutang.ts:25`) karena debit dihitung murni dari
`hits_pelanggaran`, tidak peduli ada izin atau tidak.

## Keputusan

1. **Klaim, bukan kredit langsung.** Angka yang diisi pengajar disimpan sebagai
   klaim di `hits_tabayyun`. Saldo hutang baru berkurang setelah koordinator
   menyetujui saat memutus tabayyun.
2. **Link token per-tabayyun, tanpa login.** Banyak pengajar belum punya akun
   maahir. Token hanya membuka satu tabayyun, bukan dashboard.
3. **Field menit wajib bila saldo > 0.** Memaksa jawaban eksplisit; `0` berarti
   "belum menunaikan". Bila saldo 0, field tidak ditampilkan.
4. **Klaim menempel di pertemuan tabayyun itu sendiri** (`keterangan_id`).
   Alokasi ke hutang lama tetap FIFO otomatis, tidak berubah.
5. **Penyimpanan: kolom di `hits_tabayyun`**, bukan tabel klaim baru dan bukan
   kolom `status` di `hits_hutang_bayar`. Alasan: `hits_tabayyun` sudah
   `unique(keterangan_id)` sehingga 1 pertemuan = 1 klaim; dan menaruh baris
   `pending` di ledger akan memaksa setiap pembaca (`hits-hutang.ts`, registry API
   publik `hits/hutang-bayar`, rekap, XLSX disiplin) mengingat filter — satu yang
   lupa berarti saldo salah.
6. **Izin tetap dipakai sebagai konteks, tapi tidak lagi menutup tabayyun
   sendirian.** Teks izin tetap mengisi `alasan_pengajar`, namun status hanya
   menjadi `awaiting_reason` bila izin benar-benar menutupi menit observasi
   **dan** tidak ada saldo hutang. Selain itu status tetap `pending` sehingga
   reminder + tautan token tetap berjalan.
7. **Pertanyaan hutang berlaku untuk semua tabayyun bersaldo > 0**, termasuk yang
   izinnya menutupi menit dengan pas. Izin menjelaskan *kenapa* terlambat, bukan
   *apakah* hutangnya sudah ditunaikan — dua hal berbeda.
8. **Jaring pengaman `TIDAK_HADIR` diperketat.** Izin `TIDAK_HADIR` berhenti
   menaungi `KMT` dan `KBLA`. Kedua jenis itu berarti kelas **tetap berjalan**
   (mulai terlambat / berakhir lebih awal), jadi izin "tidak hadir" tidak
   menjelaskannya — justru bertabrakan dengan laporan ketua kelas. `JKG`,
   `BADAL`, dan `TIDAK_LATIHAN` tetap dinaungi karena merupakan konsekuensi wajar
   ketidakhadiran.

## Skema

Migrasi `supabase/migrations/0059_tabayyun_klaim_hutang.sql`
(nomor berikutnya setelah `0058`; verifikasi ulang dengan
`ls supabase/migrations | tail -1` sebelum menulis).

```sql
alter table hits_tabayyun
  add column akses_token text unique,
  add column bayar_menit_klaim integer check (bayar_menit_klaim >= 0),
  add column bayar_catatan text,
  add column bayar_menit_disetujui integer check (bayar_menit_disetujui >= 0),
  add column izin_selisih_menit integer check (izin_selisih_menit >= 0);

alter table hits_hutang_bayar
  add column sumber text not null default 'ketua'
    check (sumber in ('ketua', 'tabayyun'));
```

`src/types/db.ts` diperbarui untuk kedua tabel.

### Kenapa kolom `sumber` wajib ada

`hits/ketua/actions.ts` menghapus **semua** baris `hits_hutang_bayar` dengan
`keterangan_id` tertentu sebelum menyisipkan ulang. Tanpa `sumber`, kredit hasil
persetujuan tabayyun akan terhapus diam-diam saat ketua mengedit pertemuan yang
sama. Karena itu:

- Replace-all milik ketua diberi filter `.eq('sumber', 'ketua')`.
- Baris hasil tabayyun ditulis dengan `sumber = 'tabayyun'`.
- `computeHutang*` tidak berubah — tetap menjumlah semua baris.

## Aturan izin → status tabayyun

Fungsi murni baru di `src/lib/shakwa-izin.ts`, dipakai kedua jalur (maju di
`hits/ketua/actions.ts` dan balik di `backfillTabayyunDariIzin`) supaya tidak ada
dua sumber kebenaran:

```
selisihMenit = (menitIzin == null || menitObservasi == null)
                 ? 0
                 : max(0, menitObservasi - menitIzin)

perluAlasanTambahan = selisihMenit > 0
perluKlaimHutang    = saldoHutang > 0

status = (perluAlasanTambahan || perluKlaimHutang) ? 'pending' : 'awaiting_reason'
```

- `menitIzin` null (mis. izin `TIDAK_HADIR`, atau jenis tanpa menit seperti JKG)
  → tidak ada yang bisa dibandingkan, `selisihMenit` = 0.
- Aturan ini hanya berjalan bila izinnya memang **cocok**. Pengetatan
  `izinCocokKondisi` (keputusan 8) menyaring lebih dulu: izin `TIDAK_HADIR` vs
  observasi `KMT`/`KBLA` tidak lagi dianggap cocok, jadi tabayyun berjalan penuh
  tanpa alasan prasetel dan izinnya tercatat sebagai izin yatim.
- Izin melebihi observasi (lapor 15, tercatat 10) → `selisihMenit` = 0. Pengajar
  tidak dihukum karena melapor lebih longgar.
- `selisihMenit` disimpan di kolom `izin_selisih_menit` supaya kartu koordinator
  dan halaman token bisa menampilkannya tanpa menghitung ulang.
- `alasan_pengajar` tetap diisi teks izin apa pun hasilnya; yang berubah hanya
  status. Jadi koordinator tidak kehilangan konteks, dan penanda `PENANDA_IZIN`
  tetap bekerja.
- Saat status tetap `pending`, jam ghosting 72 jam **tetap baru mulai setelah
  koordinator mengirim reminder** — perilaku ini tidak berubah, jadi pengajar
  yang sudah beritikad melapor izin tidak tiba-tiba dianggap ghosting.

## Token

- 32 byte acak (`randomBytes(32).toString('base64url')`), disimpan di kolom
  `akses_token`, unik. Bukan HMAC stateless: kolom DB bisa dicabut, dan `null`
  berarti belum pernah dikirimi reminder.
- Digenerate saat `reminderTabayyunPengajar` dipanggil pertama kali (kalau
  `akses_token` masih null), pada transaksi yang sama dengan penetapan
  `reminder_sent_at` / `deadline_at`.
- **Berlaku selama `status <> 'decided'`.** Sengaja tidak mati di deadline 72 jam:
  pengajar yang telat tetap boleh berklarifikasi; konsekuensi ghosting/teguran
  ditangani koordinator secara terpisah.
- Token tidak ditemukan → 404 netral. Jangan bedakan "tidak pernah ada" vs
  "sudah dicabut".

## Halaman publik

`src/app/tabayyun/[token]/page.tsx` + `actions.ts`. Tidak perlu mengubah
`middleware.ts` (rute tak terdaftar = publik).

Isi halaman:

- Nama pengajar, kelas, tanggal, rincian pelanggaran (pakai ulang
  `describePelanggaran`), saldo hutang terkini halaqah.
- Bila `izin_selisih_menit > 0`: blok peringatan yang menyebutkan menit yang
  dilaporkan lewat izin vs menit hasil observasi, dan meminta penjelasan
  selisihnya. Kotak alasan sudah terisi teks izin — pengajar menambahkan.
- `status = 'decided'` → tampilan read-only "sudah diputuskan".
- Form:
  - `alasan` — textarea, wajib.
  - `bayar_menit_klaim` — number, **hanya muncul dan wajib bila saldo > 0**,
    min 0, divalidasi `<= saldo`.
  - `bayar_catatan` — opsional, teks bebas.
- Submit → server action `submitKlarifikasiPublik`: set `alasan_pengajar`,
  `alasan_submitted_at`, `bayar_menit_klaim`, `bayar_catatan`,
  `status = 'awaiting_reason'`. Boleh submit ulang (revisi) selama belum
  `decided`.
- Rate limit sederhana per token pada server action.
- Komponen form dipakai bersama oleh `/hits/pengajar` agar jalur login dan jalur
  token menampilkan hal yang sama.

## WA

`tplTabayyunToPengajar`: `formUrl` menjadi `absUrl('/tabayyun/' + token)`. Bila
saldo > 0, tambahkan kalimat yang meminta pengajar mencantumkan berapa menit yang
sudah ditunaikan pada pertemuan tersebut.

## Sisi koordinator

`TabayyunCard` + `decideTabayyun` (`src/app/observasi/koordinator/`):

- Tampilkan blok klaim: "Pengajar mengaku menunaikan **X menit**" + catatan.
- Bila `izin_selisih_menit > 0`, tampilkan badge selisih izin vs observasi.
- Tampilkan **kredit yang sudah dilaporkan ketua untuk pertemuan ini** (baris
  `hits_hutang_bayar` dengan `keterangan_id` sama) agar koordinator tidak
  menyetujui angka yang sudah tercatat — pencegah dobel-hitung.
- Input `bayar_menit_disetujui`, prefill dari klaim, boleh diedit atau 0.
- Saat memutus: `menit = min(disetujui, saldo saat itu)` (pola cap sama seperti
  ketua). Sebelum insert, hapus baris `keterangan_id = X and sumber = 'tabayyun'`
  supaya keputusan bisa diubah tanpa menumpuk kredit.
- Insert `hits_hutang_bayar` dengan `sumber='tabayyun'`,
  `dilaporkan_oleh = 'koordinator_kk:<id>'`, `tanggal` = tanggal pertemuan.
- Audit `hits.tabayyun.bayar`.

## Penanganan galat

| Kondisi | Perilaku |
|---|---|
| Token tidak ada / salah | 404 netral |
| Tabayyun sudah `decided` | Halaman read-only; submit ditolak |
| `bayar_menit_klaim > saldo` | Ditolak dengan pesan, form tidak tersimpan |
| Saldo 0 | Field menit tidak ditampilkan; nilai yang dikirim diabaikan |
| `disetujui > saldo` saat memutus | Di-cap ke saldo (tidak menggagalkan keputusan) |
| Keputusan diulang | Kredit `sumber='tabayyun'` di-replace, bukan ditambah |
| Izin menit < observasi | `izin_selisih_menit` terisi, status tetap `pending` |
| Izin menit ≥ observasi, saldo 0 | `awaiting_reason` (perilaku lama dipertahankan) |
| Izin menit ≥ observasi, saldo > 0 | Status tetap `pending` demi pertanyaan hutang |
| Izin tanpa menit (`TIDAK_HADIR`, JKG) | Selisih 0; status ditentukan saldo saja |
| Izin `TIDAK_HADIR`, observasi `KMT`/`KBLA` | Tak cocok — tabayyun penuh, izin jadi yatim |
| Izin `TIDAK_HADIR`, observasi `JKG`/`BADAL`/`TIDAK_LATIHAN` | Tetap dinaungi seperti sebelumnya |

## Uji

Tidak ada test runner; `scripts/test-tabayyun.ts` adalah skrip `tsx`. Tambahkan
kasus untuk fungsi murni yang baru:

- klaim > saldo ditolak;
- `min(disetujui, saldo)` melakukan cap dengan benar;
- klaim 0 tersimpan sebagai 0 (bukan null);

Aturan izin diuji lewat `scripts/test-shakwa.ts` (sudah mengimpor fungsi murni
`shakwa-izin`):

- izin 10 vs observasi 15 → selisih 5, status `pending`;
- izin 15 vs observasi 10 → selisih 0 (tak dihukum karena lapor longgar);
- izin menit null → selisih 0;
- izin pas + saldo > 0 → tetap `pending`;
- izin pas + saldo 0 → `awaiting_reason`;
- `izinCocokKondisi('TIDAK_HADIR', 'KMT')` dan `('TIDAK_HADIR', 'KBLA')` → false;
- `izinCocokKondisi('TIDAK_HADIR', ...)` untuk `JKG`/`BADAL`/`TIDAK_LATIHAN` →
  tetap true (uji lama dipertahankan, hanya labelnya disesuaikan).

Yang tak bisa diuji fungsi murni — submit setelah `decided` ditolak, dan
keputusan diulang tidak menggandakan kredit — diverifikasi manual (langkah uji
manual di rencana implementasi).

Lalu `npm run typecheck` dan `npm run lint`.

## API publik

Kolom `sumber` aman diekspos di entitas `hits/hutang-bayar`. `bayar_catatan`
adalah teks bebas — **jangan** diekspos; hormati audit `FORBIDDEN_COLUMNS`.

## Di luar lingkup

- Verifikasi klaim oleh ketua kelas (rantai tiga pihak).
- Riwayat revisi klaim (tabel klaim terpisah).
- Notifikasi otomatis ke pengajar tanpa aksi koordinator.
