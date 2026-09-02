# Ketersediaan Mengajar HITS — Rancangan

Tanggal: 30 Agustus 2026
Status: **terimplementasi** (fase 1–5). Lihat §16 untuk keadaan sebenarnya, dan
`docs/API-TILAWAH.md` untuk kontrak CMS yang sudah dikoreksi lewat verifikasi langsung.
Sumber: `docs/Konsep_Penarikan_Ketersediaan_Mengajar_HITS.docx`,
`docs/Template_Ketersediaan_Mengajar_HITS.xlsx`, `docs/Jadwal KBM - HITS Juni 2026.xlsx`,
`/data/Downloads/04_Dev-Projects/dashboard_medu/API_MAP.md`

---

## 1. Masalah

Penarikan ketersediaan mengajar HITS berjalan lewat Google Form + spreadsheet manual.
Empat masalah tercatat di dokumen konsep:

1. Pengajar yang terikat komitmen di luar kehilangan kesempatan sampai batch berikutnya,
   meskipun bebas di pertengahan periode.
2. Pengajar diminta mengosongkan waktu berbulan-bulan lalu berisiko tidak mendapat kelas
   karena kuota murid tidak terpenuhi.
3. Tim program tidak punya angka pasti berapa pengajar tersedia per slot, sehingga kuota
   pendaftaran murid ditetapkan tanpa dasar.
4. Penentuan pengisi slot dilakukan tanpa kriteria tertulis.

Ditambah dua masalah yang muncul dari percakapan perancangan:

5. Pengajar tidak melihat jadwal halaqah yang sedang dipegangnya saat mengisi form, sehingga
   memilih slot yang bertabrakan dengan kelasnya sendiri.
6. Pengajar memilih slot tanpa tahu ada peminat atau tidak, sehingga slot sepi tetap dipilih
   dan slot ramai kekurangan pengajar.

## 2. Prinsip yang dipertahankan dari dokumen konsep

- **Slot, bukan tanggal.** Ketersediaan dinyatakan sebagai hari + jam. Tanggal mulai kelas
  ditentukan belakangan.
- **Satu sumber kebenaran.** Semua slot resmi hanya ada di master slot. Nama pengajar dari
  daftar terkunci, bukan isian bebas.
- **Prioritas berbasis kriteria.** Urutan pengisi slot ditentukan aturan tertulis.
- **Perubahan tercatat.** Setiap perubahan setelah rilis masuk log perubahan.

## 3. Pergeseran mendasar: bergelombang → bergulir

Dokumen konsep merancang satu penarikan bergelombang dengan timeline 8–26 September.
Keputusan perancangan menggeser ini ke **mesin pencocokan bergulir**:

- Form ketersediaan pengajar **selalu terbuka**, dengan penyegaran berkala.
- Pendaftaran murid **tidak pernah ditutup per slot**.
- Halaqah lahir begitu satu slot mengumpulkan cukup murid **dan** ada pengajar tersedia.

Ini menjalankan kalimat yang sudah ada di dokumen konsep — *"Kelas dibentuk saat murid cukup
dan pengajar tersedia"* — yang sebelumnya mustahil karena semuanya terikat tanggal batch.

Konsekuensi: **tahap T1–T4 bukan lagi tanggal, melainkan status baris.** Verifikasi,
perankingan, dan rilis berjalan terus-menerus. Timeline di dokumen konsep menjadi jadwal
sosialisasi, bukan jadwal sistem.

## 4. Keputusan yang sudah diambil

| Topik | Keputusan |
|---|---|
| Sumber jadwal halaqah aktual | `hits_halaqah` (sudah punya `jadwal_hari[]`, `waktu_mulai`, `waktu_selesai`), sambil meminta upstream hilmihs menambah jadwal untuk rekonsiliasi di kemudian hari |
| Sumber data pendaftar | Google Sheet responses, ditarik sebagai published-to-web CSV (pola `hits-sheets.ts`) |
| Yang dilihat pengajar tentang peminat | Angka agregat saja — tanpa nama, tanpa WA |
| Definisi "belum terakomodasi" | (a) slot tanpa pengajar sama sekali, (b) pendaftar melebihi kapasitas slot |
| Kapasitas halaqah | 12 peserta |
| Jenis halaqah | HITS Dasar dan HITS Lanjutan (termasuk alumni HITS). Lanjutan perlu verifikasi rekaman bacaan — mekanismenya menyusul, lihat §12 |
| Granularitas ketersediaan | Slot saja; level ditentukan saat penempatan. Satu halaqah = satu level |
| Homogenitas umur | Pita tetap: ≤17, 18–25, 26–35, 36–45, 46+ |
| Minimal slot per pengajar | Diatur koordinator per periode |
| Batas halaqah per pengajar | Tanpa batas |
| Kaidah pemerataan | Alokasi berputar: tiap putaran menjatah 1 halaqah, dimulai dari prioritas tertinggi |
| Sumber prioritas | Ranking Matrix Skill Guru (bisa pilih bulan) **atau** preset urutan manual yang bisa disimpan |
| Level murid | Murid memilih sendiri di form pendaftaran |
| Jumlah slot yang dipilih murid | Satu slot saja |
| Jumlah halaqah per slot | `ceil(pendaftar ÷ 12)`, dibatasi jumlah pengajar tersedia |
| Pemicu pembentukan | Bergulir otomatis, koordinator menyetujui usulan |
| Perlakuan daftar tunggu | Tampilkan usia antrean · tandai slot "butuh pengajar" · siapkan tawaran slot lain · boleh bentuk di bawah ambang bila antrean terlalu tua |
| Jendela form pengajar | Selalu terbuka, penyegaran berkala; diam sampai tenggat → nonaktif otomatis, didahului pengingat |
| Ubah isian setelah kirim | Bebas sebelum periode ditutup; setelah rilis lewat koordinator dan masuk log |
| Hak akses panel | Koordinator + superadmin |
| Tenggat konfirmasi & jeda mulai | Angka default disetel per periode |
| Siklus | Periode sendiri, lepas dari batch |
| Bentrok jadwal | Slot yang bertabrakan tampil **terkunci**, disertai alasan dan tombol sanggah. Sumbernya tiga: `hits_halaqah` lintas batch, `kelas_hits` (kelas Maahir), dan halaqah hasil sistem ini |
| Otomasi grup WA | Pengajar membuat grup sendiri saat konfirmasi dan menempel invite link; kolam grup cadangan untuk yang tak sanggup |
| Undangan peserta | Lewat halaman `/undangan/<token>`, bukan menyebar `chat.whatsapp.com` mentah |
| Gagal konfirmasi | Lewat tenggat → otomatis geser ke prioritas berikutnya, tercatat di log |
| Auth ke tilawah | Akun layanan + cookie jar di server maahir |
| Pemetaan ID tilawah | Koordinator memasangkan sekali per batch lewat dropdown yang ditarik dari API tilawah |
| Murid di tilawah | Maahir membuat + meng-enrol, dengan saringan mutu data ketat |
| Sandi akun murid | Acak dan tidak dibagikan — tilawah hanya diakses pengajar, murid tidak memerlukannya |
| Mode kirim pertama | Kirim-percobaan (dry-run) dulu; pengiriman nyata dibuka per periode oleh superadmin |
| Ekspor | Replika penuh template xlsx, berisi angka jadi bukan formula (`exceljs` sudah jadi dependensi) |

## 5. Temuan teknis yang mengubah rancangan

**hilmihs tidak menyimpan jadwal.** Kontrak `/api/agent/{program}/halaqah` hanya mengeluarkan
`halaqahId, name, pengajar, guruPhone, level, gender, type` (`src/lib/hilmihs/types.ts`).
Mirror `eval_halaqah` juga tanpa kolom waktu. API-nya read-only. Jadwal justru sudah ada di
`hits_halaqah`, dan formatnya nyaris identik dengan master slot:

```
hits_halaqah.jadwal_raw = "Online Selasa & Jum'at 06:00 - 07:30 WIB"
MASTER_SLOT.Slot Waktu  =        "Selasa & Jum'at 06:00 - 07:30 WIB"
```

**Delapan batch HITS berjalan bersamaan** (Juni 138 halaqah, Januari 121, April 74, ditambah
Nurul Iman, Safar Januari, Safar Juli, ABK Juli). Satu pengajar bisa memegang halaqah di
beberapa batch, sehingga deteksi bentrok harus lintas batch.

**Maahir tidak punya kemampuan mengirim WA.** Seluruh repo memakai deep-link `wa.me`
(`src/lib/whatsapp.ts`) — manusia yang mengklik. Tidak ada gateway.

**WhatsApp Cloud API resmi tidak punya endpoint grup sama sekali** — tidak bisa membuat grup,
menambah anggota, atau mengambil invite link. Grup hanya bisa disentuh lewat pustaka tidak
resmi yang mengemudikan nomor pribadi (melanggar ToS, rawan blokir).

**Pola token sudah ada** di `/tabayyun/[token]`, `/hits/pindah-halaqah/[token]`,
`/hits/ketua-dual/[token]` — alur konfirmasi pengajar memakai pola yang sama.

**Mekanisme login tilawah** (dikoreksi dari `API_MAP.md` lewat probe langsung 30 Agu 2026):

```
GET  /sanctum/csrf-cookie          → set XSRF-TOKEN + hits-cms-session
POST /login  { email, password, remember }
     header: X-XSRF-TOKEN (urldecode cookie XSRF-TOKEN)
             X-Requested-With: XMLHttpRequest
cookie sesi: hits-cms-session      ← bukan laravel_session seperti tertulis di API_MAP.md
```

Laravel Sanctum + Inertia. Bundel `Login-C82Xb5cf.js` menyebut `/sanctum/csrf-cookie` dan
field `email`, `password`, `remember`.

**Migrasi berikutnya adalah 0063**, bukan 0053 seperti tertulis di CLAUDE.md — berkas terakhir
`0062_evaluasi_rapot_track.sql`.

## 6. Struktur

```
src/app/ketersediaan/
  pengajar/            form ketersediaan + kondisi halaqah saat ini
  koordinator/         slot, verifikasi, prioritas, alokasi, papan status, pemetaan tilawah
  konfirmasi/[token]/  halaman konfirmasi pengajar (publik via token)
  undangan/[token]/    halaman undangan peserta (publik via token)

src/lib/
  ketersediaan-slot.ts        master slot + normalisasi & parsing teks jadwal
  ketersediaan-bentrok.ts     deteksi tabrakan jam
  ketersediaan-pendaftar.ts   tarik CSV + saringan mutu data
  ketersediaan-prioritas.ts   sumber urutan (matrix bulan X | preset manual)
  ketersediaan-alokasi.ts     mesin bergulir + alokasi berputar
  ketersediaan-konfirmasi.ts  token, tenggat, pergeseran prioritas
  ketersediaan-grup.ts        nama grup, kolam cadangan, undangan
  ketersediaan-export.ts      xlsx replika template (exceljs)
  tilawah/                    client.ts · types.ts · map.ts · push.ts (cermin lib/hilmihs/)
```

Mutasi memakai Server Actions per direktori rute, sesuai konvensi repo. Route handler hanya
untuk tarikan CSV terjadwal dan pengiriman outbox.

## 7. Alur

```
PENGAJAR                          SISTEM                         KOORDINATOR
   │                                 │                                │
   │ buka /ketersediaan/pengajar     │                                │
   │◄── halaqah yang sedang dipegang ┤  (hits_halaqah lintas batch    │
   │    + jadwalnya                  │   + halaqah hasil sistem ini)   │
   │◄── daftar slot: terkunci bila   │                                │
   │    bentrok · peminat sekarang · │                                │
   │    peluang terbentuk (historis)·│                                │
   │    tanda "BUTUH PENGAJAR"       │                                │
   │ centang slot ──────────────────►│                                │
   │                                 │ 6 butir cek otomatis           │
   │                                 ├───────────────────────────────►│ tinjau yang
   │                                 │                                │ "perlu konfirmasi"
                                     │                                │
   GOOGLE FORM MURID ──CSV──────────►│ saringan mutu data             │
   (tak pernah ditutup)              │ → valid / ditahan              │
                                     │                                │
                                     │ MESIN BERGULIR (tiap sync):    │
                                     │ slot punya ≥12 valid           │
                                     │ + pengajar tersedia?           │
                                     │ → susun usulan halaqah ───────►│ setujui
                                     │   (1 level, 1 pita umur, ≤12)  │      │
                                     │◄───────────────────────────────┤      │
   │◄── wa.me + link token ──────────┤ buat token, tenggat            │
   │ buka /konfirmasi/<token>        │                                │
   │ SETUJU ────────────────────────►│                                │
   │◄── daftar peserta + nama grup   │                                │
   │ tempel invite link ────────────►│                                │
   │                                 │ outbox → tilawah:              │
   │                                 │ buat halaqah → cari/buat murid │
   │                                 │ → enrol (2 panggilan)          │
   │                                 │                                │
   │                                 │ /undangan/<token> per peserta ►│ daftar wa.me
   │                                 │                                │ siap kirim
   │  (diam sampai tenggat)          │ → kedaluwarsa, geser ke        │
   │                                 │   prioritas berikutnya,        │
   │                                 │   catat di log perubahan       │
```

## 8. Model data

15 tabel, awalan `ks_`. Migrasi mulai **0063**, dipecah beberapa berkas karena statement berat
membuat `/api/admin/db` 502 dan rollback — kolom dan indeks unik dipisah.

### Periode & slot

```sql
ks_periode      nama, mulai, selesai, form_buka, form_tutup(null = selalu buka),
                kapasitas_halaqah = 12, minimal_slot, ambang_bentuk = 12,
                ambang_bawah = 8, usia_antrean_maks_hari, jeda_mulai_hari,
                tenggat_konfirmasi_jam, penyegaran_hari, kirim_nyata bool = false, aktif

ks_slot         periode_id, kelompok (gender), mode (online|offline),
                label, hari text[], waktu_mulai time, waktu_selesai time,
                lokasi, aktif, urutan
```

`label` untuk tampilan dan ekspor; `hari[]` + jam untuk mesin. Slot dinonaktifkan, tidak
dihapus. Menyimpan slot terurai wajib karena perbandingan teks tidak dapat diandalkan — file
Jadwal KBM Juni 2026 sudah memuat `"Selasa & Jum'at 16.00 - 17.30 WIB"` (titik) bersanding
dengan `"Selasa & Kamis 16:00 - 17:30 WIB"` (titik dua).

### Isian pengajar

```sql
ks_pengisian    periode_id, pengajar_id, mode, lokasi, alasan_kurang_slot,
                komitmen bool, submitted_at, disegarkan_pada, terkunci bool
                UNIQUE(periode_id, pengajar_id)

ks_ketersediaan pengisian_id, slot_id,
                status (diajukan|terverifikasi|perlu_konfirmasi|ditolak),
                cek jsonb,                        -- hasil 6 butir verifikasi
                sanggahan text, sanggahan_status, -- pembukaan kunci bentrok
                catatan
                UNIQUE(pengisian_id, slot_id)
```

Header dan detail dipisah supaya alasan dan pernyataan komitmen tidak berulang di tiap baris
slot. `cek jsonb` menyimpan hasil enam butir verifikasi dokumen konsep apa adanya, sehingga
jejaknya terlihat, bukan hanya status akhirnya.

### Permintaan murid

```sql
ks_pendaftar_sumber periode_id, csv_url, gid, pemetaan_kolom jsonb,
                    terakhir_tarik, terakhir_status

ks_pendaftar        periode_id, sumber_row_key,   -- idempoten antar-tarikan
                    nama, wa, tanggal_lahir, umur, pita_umur, gender,
                    level_pilihan, slot_label_raw, slot_id,
                    status (valid|ditahan|dialokasikan|batal),
                    alasan_ditahan text[], ditarik_pada
                    UNIQUE(periode_id, sumber_row_key)
```

`sumber_row_key` adalah cetakan dari timestamp + WA. Tarikan berulang memperbarui baris, tidak
menggandakannya — pola yang sama dengan `syncBatch` HITS.

`pemetaan_kolom` membuat kolom sheet tidak di-hardcode: koordinator menarik CSV sekali, lalu
menunjuk kolom mana yang berisi nama, WA, tanggal lahir, slot, dan level. Bentuk Google Form
pendaftaran boleh berubah tanpa mengubah kode.

Saringan mutu, semuanya **menahan** bukan membuang:

| Butir | Ditahan bila |
|---|---|
| WA | kosong · bukan angka · < 9 digit · sudah dipakai baris pendaftar lain |
| Nama | kosong · ≤ 2 huruf · angka semua · sama persis dengan pendaftar lain di slot sama |
| Tanggal lahir | kosong · format tak terbaca · umur < 5 atau > 90 |

Baris ditahan tetap tampil di layar koordinator lengkap dengan alasannya, dan tidak ikut
dihitung sampai dibereskan.

### Prioritas

```sql
ks_prioritas_preset  nama, gender, tipe (matrix|manual), matrix_bulan, dibuat_oleh
ks_prioritas_urutan  preset_id, pengajar_id, urutan
```

Dua sumber, dipilih saat menjalankan alokasi: ranking Matrix Skill Guru pada bulan tertentu,
atau urutan manual tersimpan yang disusun koordinator.

### Pembentukan & hilir

```sql
ks_usulan         periode_id, slot_id, level, pita_umur, pengajar_id, putaran,
                  status (usulan|disetujui|menunggu|dikonfirmasi|ditolak|
                          kedaluwarsa|dikirim|gagal),
                  tanggal_mulai, akses_token, token_kedaluwarsa,
                  grup_wa_link, tilawah_halaqah_id

ks_usulan_peserta usulan_id, pendaftar_id, status, tilawah_user_id,
                  undangan_token, undangan_dibuka_pada

ks_grup_pool      periode_id, gender, invite_link, status (kosong|terpakai), usulan_id
ks_tilawah_map    tilawah_batch_id, jenis (slot|level), ref, day_id, session_id, level_id
ks_outbox         usulan_id, aksi, payload jsonb, status, percobaan, error_terakhir
ks_log            entitas, entitas_id, aksi, sebelum jsonb, sesudah jsonb, alasan, aktor_wa
ks_slot_riwayat   slot_label, gender, mode, periode_label,
                  halaqah_terbentuk, halaqah_batal, pendaftar, sumber (impor|sistem)
```

`ks_slot_riwayat` menampung data historis yang akan dikirim pemilik proses, dan diisi sendiri
oleh sistem tiap periode; sumbernya dibedakan lewat kolom `sumber`. Dari tabel ini angka
**"peluang slot terbentuk"** yang dilihat pengajar dihitung.

`akses_token` dan `undangan_token` wajib masuk `FORBIDDEN_COLUMNS` di
`src/lib/api-public/registry.ts` — pemegang token dapat bertindak atas nama orang lain.

`src/types/db.ts` diperbarui mengikuti seluruh tabel di atas.

## 9. Deteksi bentrok

Sumber jadwal pengajar saat ini adalah gabungan dua hal:

1. `hits_halaqah` aktif dengan `pengajar_id` yang bersangkutan, **lintas semua batch**;
2. halaqah hasil sistem ini yang sudah berstatus dikonfirmasi atau terkirim.

Sumber kedua wajib ada. Halaqah yang dibentuk sistem ini masuk ke tilawah, tetapi **tidak**
otomatis muncul di `hits_halaqah` — tabel itu diisi dari Google Sheet yang disync manual per
batch. Tanpa sumber kedua, pengajar yang baru mendapat halaqah lewat sistem ini akan terlihat
kosong dan dijatah lagi pada jam yang sama.

Dua jadwal dianggap bentrok bila hari beririsan **dan** rentang jam bertumpang tindih:

```
hari_a ∩ hari_b ≠ ∅  ∧  mulai_a < selesai_b  ∧  selesai_a > mulai_b
```

Slot yang bentrok ditampilkan **terkunci**:

```
┌──────────────────────────────────────────────────────┐
│ 🔒 Selasa & Jum'at 06:00 - 07:30 WIB                 │
│    Terisi — Anda mengajar HITS 28 AKHWAT APRIL       │
│    di jam ini                          [ Sanggah ]   │
└──────────────────────────────────────────────────────┘
```

Tombol sanggah diperlukan karena `hits_halaqah` bisa basi: sheet disync manual, dan `active`
dapat hidup lagi sendiri setelah sync bila barisnya masih ada di sheet. Sanggahan masuk
antrean koordinator; koordinator membuka kunci bila halaqah itu memang sudah selesai. Tanpa
jalan ini, satu baris sheet yang basi mengunci pengajar dari slot favoritnya tanpa siapa pun
mengetahuinya.

## 10. Mesin alokasi

```
ulangi tiap sinkronisasi pendaftar:

  untuk tiap slot, urut: antrean tertua dulu, lalu peminat terbanyak
    valid = pendaftar valid di slot yang belum dialokasikan
    butuh = ceil(valid / 12) − halaqah_hidup_di_slot
    jika butuh = 0 → lewati

  putaran = 1
  ulang:
    ditempatkan = 0
    untuk tiap slot yang masih butuh:
      kandidat = pengajar terverifikasi di slot itu
                 ∧ belum punya halaqah di slot itu
                 ∧ tidak bentrok jam dengan halaqah lain miliknya
                   (existing + yang baru dijatah pada alokasi ini)
                 ∧ jumlah halaqah yang dia dapat pada alokasi ini = putaran − 1
      ambil min(butuh, jumlah kandidat), urut prioritas
      ditempatkan += yang terambil
    jika ditempatkan = 0 → berhenti
    putaran += 1
```

Syarat `jumlah didapat = putaran − 1` menegakkan kaidah pemerataan: tidak seorang pun mendapat
halaqah kedua sebelum semua yang bersedia mendapat yang pertama. Karena tidak ada batas atas
per pengajar, putaran terus berjalan sampai slot atau pengajar habis.

Syarat "belum punya halaqah di slot itu" adalah batasan fisik — seorang pengajar tidak dapat
mengajar dua kelas pada jam yang sama.

Pengisian tiap halaqah, dalam satu slot:

```
pendaftar valid → pisah per level (Dasar | Lanjutan)
               → pisah per pita umur (≤17 · 18–25 · 26–35 · 36–45 · 46+)
               → urut waktu daftar (yang paling lama menunggu duluan)
               → potong 12
```

Sisa di bawah 12 pada satu pita menunggu, **kecuali** usianya melewati
`usia_antrean_maks_hari`. Lewat batas itu halaqah boleh dibentuk di atas `ambang_bawah` (8)
dengan pita digabung dan ditandai.

## 11. Integrasi tilawah

Urutan tulis, sesuai `API_MAP.md`:

```
1. POST /api/halaqah
   { batch_id, name, type(online|offline|hybrid), level_id, day_id, session_id,
     description, user_id (= guru), status: 1 }

2. untuk tiap peserta:
   a. cari user berdasarkan nomor HP
   b. bila tidak ada → POST /api/users
      { name, email: "<hp>@murid.hits", phone, user_code: "", gender(1|2),
        role: "murid", password: <acak>, password_confirmation: <acak>, batch_id, ... }
   c. POST /api/users/{id}  + _method: "PUT"  + halaqah_id + move_reason
```

Tiga jebakan yang ditangani eksplisit di `lib/tilawah/push.ts`:

- **`halaqah` dan `users` menolak `PUT`** (405). Update wajib `POST` ke `/{id}` dengan field
  `_method: "PUT"` (Laravel method spoofing).
- **`halaqah_id` pada payload CREATE tidak meng-enrol** murid. Enrolment adalah panggilan
  kedua, dan `move_reason` wajib diisi (422 bila kosong).
- **`end_session_date` harus lebih besar dari `start_session_date`**, jika dipakai.

**Sandi akun murid dibangkitkan acak dan tidak dibagikan.** Tilawah hanya diakses pengajar,
murid tidak memerlukan akun yang bisa dimasuki. Field `password` tetap diisi karena API
mewajibkannya. Pola lama `password = nomor HP` tidak dipakai: nomor HP bukan rahasia, dan
maahir akan menerbitkan ratusan akun sekaligus.

**Pemetaan ID.** Tilawah tidak menerima teks jadwal — hanya nomor baris dari tabel masternya
(`day_id`, `session_id`, `level_id`). Nomor itu tidak dapat ditebak: daftar `days`/`sessions`
di-scope per program, ada baris yang dipakai halaqah tetapi tidak muncul di daftar master
(halaqah Nurul Iman memakai `day_id 12` dan `session_id 14`), dan banyak halaqah memakai sesi
placeholder `00:00-00:00` dengan jam sebenarnya ditulis per pertemuan. Karena itu koordinator
memasangkan sekali per batch lewat dropdown yang ditarik langsung dari `/api/levels`,
`/api/days`, `/api/sessions`. **Slot yang belum dipetakan → halaqahnya ditahan**, tidak dikirim
dengan tebakan.

**Mode kirim.** Default `ks_periode.kirim_nyata = false`: outbox hanya mencatat payload lengkap
dan menampilkannya di layar koordinator tanpa memanggil tilawah. Pengiriman nyata dinyalakan
per periode oleh superadmin setelah satu halaqah uji berhasil.

**Lingkungan uji.** Tersedia CMS tilawah staging. `TILAWAH_BASE_URL` diarahkan ke staging
selama pengembangan; produksi hanya dipakai setelah alur lengkap terbukti di staging. Data
dummy di maahir (periode, slot, pengajar, pendaftar percobaan) diperbolehkan dan dibersihkan
setelah selesai — karena itu setiap tabel `ks_*` memakai `periode_id` sebagai akar, sehingga
menghapus satu periode percobaan cukup dengan menghapus akarnya secara berjenjang.

**Auth.** Akun layanan + cookie jar di server maahir, mekanisme login sesuai §5. Sesi dapat
kedaluwarsa kapan saja (`?reason=expired`), sehingga outbox bekerja per-langkah dan idempoten:
halaqah yang sudah terbuat tidak dibuat ulang, enrolment aman diulang.

## 12. Hal yang masih terbuka

1. **Verifikasi rekaman bacaan untuk HITS Lanjutan.** Pemilik proses akan menjelaskan
   mekanismenya. Rancangan menyediakan tempat: pendaftar Lanjutan berhenti pada status
   menunggu verifikasi sebelum boleh dialokasikan. Pendaftar Dasar dan alumni HITS langsung
   diproses.
2. **Pembuatan pertemuan di tilawah.** Pemilik proses condong ke "ya", tetapi meminta
   dipelajari lebih dulu. Yang perlu dipastikan: tidak ada endpoint bulk (satu panggilan per
   pertemuan; 26 pertemuan × ratusan halaqah berarti ribuan panggilan ke server produksi
   kecil), dan maahir belum punya sumber kalender akademik berisi tanggal tiap pertemuan.
   Diusulkan sebagai fase 6 tersendiri.
3. ~~Tautan Google Sheet responses pendaftaran murid~~ — **diterima 2 Sep 2026**.
   Responses (akhwat): `.../2PACX-1vSS59U324L1rNSO5xKtHt7vqVdaca7HsdelFIbQdH4VCxPSYfMYAjPvCl_91Y0WcBb-lNmxTY8bLYdg/pub?output=csv`
   Berkas kerja: `.../2PACX-1vR1MSjqq6TvZSt7ibdZz9R9my2uvmM0JOn6a36YRZx4n_MHXJVrVKrjqpqrPjjCnzNN6jvT9thmm4iv/pub?output=csv`
   Diuji lewat `npm run test-pendaftar-sheet`: 1.341 baris, 867 sah, 474 ditahan.
   Sheet ikhwan belum diterima — baris pada tab ini seluruhnya perempuan.
4. **Data historis peminat per slot** — akan dikirim pemilik proses, masuk `ks_slot_riwayat`
   lewat impor.
5. **Batch tujuan di tilawah** (`program_id` + `batch_id`) untuk periode berjalan. `API_MAP.md`
   tidak menemukan endpoint pembuat batch — hanya `/api/batch/set-active` — sehingga batch
   harus sudah ada, dibuat manual dari UI tilawah. Berlaku untuk staging maupun produksi.

Kredensial akun layanan tilawah sudah dipegang pemilik proses dan diisi langsung ke
`.env.local` (`TILAWAH_BASE_URL`, `TILAWAH_EMAIL`, `TILAWAH_PASSWORD`) — lihat `.env.example`.
Pengembangan diarahkan ke CMS staging.

## 13. Risiko

| Risiko | Sebab | Penanganan |
|---|---|---|
| Kredensial admin tilawah tersimpan di maahir | Tidak ada token API; auth hanya sesi Laravel | Akun layanan terpisah berhak minimum, bukan akun pribadi. Disimpan sebagai secret Azure. **Variabel rahasia Azure tidak muncul di `printenv` kecuali dipetakan eksplisit di `env:` task** — bila terlewat, aplikasi tetap boot dan integrasi gagal diam-diam |
| Halaqah/murid salah dibuat di produksi | Tidak ada endpoint `DELETE` yang ditemukan; pembersihan hanya manual dari dalam tilawah | Seluruh latihan dilakukan di CMS tilawah staging. Untuk produksi: mode kirim-percobaan sebagai default, pengiriman nyata dibuka per periode oleh superadmin setelah satu halaqah uji |
| Data percobaan tertinggal di maahir | Periode dummy dibuat lalu terlupakan | Semua tabel `ks_*` berakar pada `periode_id` dengan hapus berjenjang, sehingga satu periode percobaan dapat dibuang utuh |
| Sesi tilawah putus di tengah pengiriman | `?reason=expired` bisa datang kapan saja | Outbox per-langkah dan idempoten, bukan satu transaksi besar |
| Pemetaan `day_id`/`session_id` salah | Master di-scope per program, ada baris tak terlihat di master | Slot belum dipetakan → halaqah ditahan |
| Sheet HITS mengaktifkan lagi halaqah lama | `active` ditimpa sync bila baris masih ada di sheet | Slot terkunci disertai tombol sanggah; koordinator membuka kunci |
| Grup WA tidak dapat diotomasi | Cloud API resmi tidak punya endpoint grup; pustaka tidak resmi melanggar ToS dan rawan blokir nomor | Pengajar membuat grup dan menempel invite link; kolam cadangan; undangan lewat `/undangan/<token>` |
| Nomor WA ganda antar pendaftar | Nomor menjadi email palsu di tilawah | Ditahan sebelum diproses |
| Beban ke server tilawah | Server produksi kecil, tanpa header rate-limit | Pembatas laju pada outbox; tanpa polling agresif |
| Peran baru tidak terbaca | `accesses` disimpan di cookie saat login | Memakai role koordinator yang sudah ada, tanpa role baru |

## 14. Urutan bangun

| Fase | Isi | Dapat dipakai setelah fase ini |
|---|---|---|
| 1 | Periode, slot, form pengajar, deteksi bentrok terkunci + sanggah, verifikasi 6 butir, ekspor xlsx | Menggantikan Google Form ketersediaan dan template xlsx sepenuhnya |
| 2 | Tarik CSV pendaftar + pemetaan kolom + saringan mutu; papan pasokan–permintaan; peminat dan peluang terbentuk di form pengajar | Koordinator melihat angka nyata; pengajar memilih dengan sadar |
| 3 | Prioritas (matrix/preset), mesin alokasi berputar, usulan halaqah, konfirmasi token, pergeseran otomatis | Halaqah terbentuk dari sistem, bukan spreadsheet |
| 4 | Pemetaan tilawah, outbox, push halaqah/murid/enrol, mode kirim-percobaan | Data mengalir ke tilawah tanpa entri ulang |
| 5 | Grup WA, kolam cadangan, undangan peserta, daftar wa.me | Otomasi undangan |
| 6 | Pembuatan pertemuan di tilawah (bila diputuskan lanjut) | Kalender KBM terisi otomatis |

Fase 1–3 tidak bergantung apa pun di luar maahir. Fase 4 menunggu akun layanan tilawah, izin
menulis ke produksi, dan batch tujuan. Fase 5 menunggu keputusan operasional grup. Fase 6
menunggu keputusan pada §12 butir 2.

## 15. Layar koordinator

Empat blok wajib di layar utama:

1. **Pengajar: terpenuhi vs belum** — jumlah halaqah yang sudah didapat (termasuk yang sedang
   berjalan), siapa yang masih nol, dan di slot mana dia tersedia.
2. **Slot: pasokan vs permintaan** — pengajar tersedia, pendaftar berminat, kapasitas
   (pengajar × 12), berapa yang belum tertampung, dan tanda slot tanpa pengajar sama sekali.
3. **Papan status konfirmasi** — menunggu konfirmasi, sudah setuju, lewat tenggat, sudah
   digeser ke prioritas berikutnya.
4. **Status kirim ke tilawah dan grup WA** — sudah dibuat di tilawah atau belum, murid terenrol
   berapa dari berapa, link grup sudah ada atau belum, undangan sudah dibuka berapa peserta.

Ditambah antrean kerja: baris "perlu konfirmasi", pendaftar ditahan, sanggahan kunci bentrok,
dan slot yang belum dipetakan ke tilawah.


---

## 16. Status implementasi (31 Agustus 2026)

Fase 1–6 selesai dan terverifikasi.

### Yang dibangun

| Bagian | Berkas |
|---|---|
| Skema | `supabase/migrations/0063`–`0067` + `0070` (15 tabel `ks_*`) |
| Tipe | `src/types/db.ts` |
| Normalisasi slot & bentrok | `ketersediaan-slot.ts`, `ketersediaan-bentrok.ts` |
| Periode & master slot | `ketersediaan-periode.ts` |
| Permintaan per slot | `ketersediaan-permintaan.ts` |
| Pendaftar (CSV + saringan) | `ketersediaan-pendaftar.ts` |
| Prioritas | `ketersediaan-prioritas.ts` |
| Mesin alokasi | `ketersediaan-alokasi.ts` (murni), `ketersediaan-jalankan.ts` (I/O) |
| Konfirmasi & tenggat | `ketersediaan-konfirmasi.ts` |
| Pekerjaan berkala | `ketersediaan-berkala.ts` + `POST /api/ketersediaan/berkala` |
| Ekspor xlsx | `ketersediaan-export.ts` + `GET /api/ketersediaan/ekspor` |
| CMS tilawah | `src/lib/tilawah/{client,types,map,push}.ts` |
| Halaman | `ketersediaan/{pengajar,koordinator,koordinator/tilawah,konfirmasi/[token],undangan/[token]}` |

### Verifikasi

- `npm run test-ketersediaan` — 50 uji fungsi murni (penguraian ejaan campur,
  bentrok, pengelompokan, kaidah pemerataan, usulan pemetaan).
- `npm run test-ketersediaan-e2e` — alur penuh terhadap DB dev, termasuk
  pembuktian bahwa data percobaannya benar-benar terhapus.
- `npm run test-tilawah-staging` — terhadap CMS staging. Dengan `KIRIM_NYATA=1`
  telah membentuk halaqah nyata `#239` beserta dua murid terenrol.

### Yang berubah dari rancangan awal setelah berhadapan dengan sistem nyata

1. **Cascade periode tidak pernah bekerja.** Dua rujukan `ON DELETE RESTRICT`
   menahan penghapusan periode secara diam-diam. Diperbaiki di `0067`.
2. **Kontrak CMS tilawah berbeda dari dokumentasinya** dalam empat hal yang
   masing-masing mampu merusak data: ejaan kunci resource, mutasi yang membalas
   redirect alih-alih JSON, enrolmen yang menuntut seluruh field, dan penghapusan
   yang tidak dapat diandalkan. Seluruhnya tercatat di `docs/API-TILAWAH.md`.
3. **`DELETE /api/halaqah/{id}` sebenarnya ada** — menghapus, lalu membalas 500.
   `DELETE /api/users/{id}` membalas 302 dan tidak menghapus apa pun. Jadi akun
   murid tetap tidak dapat dibatalkan lewat API, dan mode kirim-percobaan tetap
   menjadi bawaan.
4. **Sumber bentrok bertambah `kelas_hits`**, sesuai butir verifikasi ketiga
   dokumen konsep yang menyebut kelas Maahir terpisah dari HITS.

### Sisa pekerjaan operasional

- ~~Kolam grup WA cadangan belum punya layar pengisian~~ — **selesai**, koordinator
  menempel banyak tautan sekaligus dan tautan kembar ditolak.
- Penjadwal untuk `POST /api/ketersediaan/berkala` belum dipasang di VPS.
- Halaqah uji di CMS staging sudah dihapus seluruhnya. Yang tersisa hanya tiga
  akun murid uji (`#2257`, `#2258`, `#2259`) — `DELETE /api/users/{id}` membalas
  302 tanpa menghapus, jadi harus dibereskan dari dalam CMS.
