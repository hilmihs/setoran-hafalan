# CMS tilawah — catatan integrasi

Acuan operasional untuk `src/lib/tilawah/`. Melengkapi **dan mengoreksi**
`dashboard_medu/API_MAP.md`, yang disusun dari pembacaan lalu lintas peramban.
Diverifikasi langsung terhadap **staging** (30 Agu 2026, termasuk satu pembentukan
halaqah nyata beserta enrolmennya) dan terhadap **produksi** secara baca-saja (1 Sep 2026).

> Ini bukan API publik. Tidak ada token, tidak ada dokumentasi resmi, tidak ada
> jaminan kestabilan. Perlakukan sebagai kontrak rapuh: setiap perubahan di CMS
> dapat mematahkannya tanpa pemberitahuan.

---

## 1. Autentikasi

Laravel **Sanctum** + Inertia. Tidak ada token API sama sekali.

```
GET  /sanctum/csrf-cookie          → set XSRF-TOKEN + cookie sesi
POST /login  { email, password, remember }
     header: X-XSRF-TOKEN        (nilai cookie XSRF-TOKEN yang sudah di-urldecode)
             X-Requested-With: XMLHttpRequest
             Accept: application/json
→ 200 { "status": "success", "message": "Login successful" }
```

**Akun staging tidak berlaku di produksi.** Probe 31 Agu 2026: kredensial yang sah di
staging ditolak produksi dengan `422 {"message":"Invalid Muhajir Account credentials"}`.
Penyebutan "Muhajir Account" menyiratkan produksi bersandar pada penyedia identitas
tersendiri, bukan tabel user CMS. Konsekuensinya untuk Fase 4: **akun layanan produksi
harus dibuat terpisah**, dan alur loginnya perlu diverifikasi ulang — belum tentu sama
dengan borang `email`+`password` di staging.

**Nama cookie sesi berbeda antar lingkungan** — `hits-cms-session` di produksi,
`hits-cms-qa-session` di staging. Jangan pernah menuliskannya di kode; simpan
seluruh `Set-Cookie` apa adanya. (`API_MAP.md` menyebut `laravel_session`; itu
tidak benar untuk kedua lingkungan.)

Sesi dapat mati kapan saja. Yang menandakannya bukan hanya 401/419: CMS juga
membalas 302 ke `/login?reason=expired`, dan permintaan XHR bisa menerima HTML
halaman login alih-alih JSON.

## 2. Bentuk respons tidak seragam

CMS ini campuran dua gaya, dan perbedaannya menentukan benar-tidaknya integrasi:

| Gaya | Perilaku | Contoh |
|---|---|---|
| API | membalas JSON `{status, code, message, data, spent}` | `GET /api/*`, `POST /api/halaqah` |
| Inertia | membalas **302 redirect** setelah mutasi berhasil | `POST /api/users` |

**`POST /api/users` membalas `302` ke akar sambil tetap membuat akunnya.**
Memperlakukan itu sebagai kegagalan bukan sekadar salah — percobaan ulang akan
membuat akun ganda, dan penghapusan murid tidak berfungsi (§5). Karena itu
`client.ts` mengembalikan penanda `{ __redirect }` dan `push.ts` memastikan
hasilnya lewat pembacaan ulang berdasarkan nomor telepon.

## 3. Ejaan kunci berubah-ubah

Satu entitas, tiga ejaan, tergantung route:

| Route | Kunci |
|---|---|
| `GET /api/halaqah?...` (daftar) | `data.halaqohs` |
| `GET /api/halaqah/{id}` (detail) | `data.halaqoh` |
| `API_MAP.md` (dokumentasi) | `halaqah` |

Menebak satu nama membuat pembuatan yang **berhasil** terbaca sebagai gagal.
`ambilIdBaru()` karena itu mencari id, bukan mengasumsikan kuncinya.

## 4. Menulis: urutan dan jebakannya

```
1. POST /api/halaqah
   { batch_id, name, type(online|offline|hybrid), level_id, day_id,
     session_id, description, user_id (= guru), status: 1 }
   → JSON; id ada di data.halaqoh.id

2. cari murid: GET /api/users?filters[role]=murid&filters[batch_id]=N&keyword=<nomor>

3. bila belum ada → POST /api/users
   { name, email, phone, user_code, gender(1|2), role:'murid', bio, wag,
     halaqah_id: null, old_halaqah_id: null, move_reason: '',
     password, password_confirmation, batch_id, meta }
   → 302 (BUKAN JSON), akun tetap terbuat

4. enrol: POST /api/users/{id}  + _method: "PUT"
   → 302 bila berhasil
```

Empat jebakan yang sudah terbukti:

- **`halaqah` dan `users` menolak HTTP `PUT`** (405). Pembaruan wajib `POST` ke
  `/{id}` dengan field `_method: "PUT"`.
- **`halaqah_id` pada payload CREATE user tidak meng-enrol.** Enrolment adalah
  panggilan kedua.
- **Enrolment bukan pembaruan sebagian.** Mengirim hanya `halaqah_id` +
  `move_reason` menghasilkan `422 "The name field is required."` Seluruh field
  user wajib disertakan ulang — sama seperti `pertemuans`.
- **`move_reason` wajib** (422 bila kosong).

Verifikasi 30 Agu 2026: halaqah `#239` terbentuk dengan `day_id 1`,
`session_id 2`, `level_id 1`, guru `#41`, dan dua murid terenrol.

## 5. Menghapus tidak dapat diandalkan

| Aksi | Perilaku sebenarnya |
|---|---|
| `DELETE /api/halaqah/{id}` | **Menghapus, lalu balas 500** `"Undefined variable $request"` di `HalaqohController.php:257`. Baris benar-benar hilang (GET berikutnya 404), tetapi responsnya galat. |
| `DELETE /api/users/{id}` | Balas 302 dan **tidak menghapus apa pun**. |

Konsekuensi rancangan: akun murid yang salah dibuat **tidak dapat dibatalkan
lewat API sama sekali**. Itulah alasan saringan mutu data pendaftar menahan
baris bermasalah sebelum diproses, dan alasan `ks_periode.kirim_nyata` mati
secara bawaan.

## 6. Master data tidak dapat dipercaya begitu saja

`GET /api/days` mengembalikan `int_days` (0 = Senin … 6 = Ahad), tetapi
**sebagian baris tidak sesuai namanya**. Pada staging:

| id | nama | int_days |
|---|---|---|
| 8 | Senin - Jumat | `[]` |
| 6 | Rabu, Jum'at | `[2]` |
| 4 | Sabtu, Ahad | `[5]` |
| 3 | Selasa, Jum'at | `[1]` |

Mencocokkan lewat nama akan memilih baris rusak; mencocokkan lewat `int_days`
akan melewatkannya. Dua-duanya salah tanpa terlihat. Karena itu `map.ts` hanya
**mengusulkan** dan menyertakan tingkat keyakinan, dan pengesahannya di tangan
koordinator.

Baris pincang yang sama ada di **produksi**, dan di sana jebakannya lebih tajam
karena ada dua kandidat untuk hari yang sama:

| id | nama | int_days | |
|---|---|---|---|
| 3 | Selasa, Jumat | `[1,4]` | benar |
| 11 | **Selasa & Jum'at** | `[1]` | pincang — **namanya persis sama dengan label MASTER_SLOT** |
| 8 | Senin - Jumat | `[]` | pincang |

Slot `"Selasa & Jum'at 06:00 - 07:30 WIB"` akan cocok **sempurna lewat nama** ke baris
`11` yang rusak, dan cocok lewat `int_days` ke baris `3` yang benar. Inilah alasan
pencocokan dilakukan lewat `int_days`, bukan teks.

### Placeholder sesi: kebiasaan per-program, bukan per-CMS

Diperiksa langsung di produksi 1 Sep 2026:

| Program | Halaqah | day_id / session_id |
|---|---|---|
| HITS Reguler (3), batch April_2026 | 64 | **sesi nyata** — `20:00-21:30` ×19, `06:00-07:30` ×15, dst. Nol placeholder |
| HITS Masjid Nurul Iman (8), batch Juli 2026 | 10 | `day 12` "Sabtu" + `session 14` `00:00-00:45` — seluruhnya placeholder |

`API_MAP.md` mengamati Nurul Iman, sehingga menyimpulkan "semua halaqah pakai
placeholder". Untuk **HITS Reguler** — sasaran modul ketersediaan — itu tidak berlaku:
di sana jadwal disimpan pada `session_id` yang jamnya sungguhan. Memetakan slot ke sesi
nyata karena itu justru mengikuti kebiasaan yang berlaku, dan jadwal halaqah baru sudah
benar tanpa perlu membuat pertemuan lebih dulu.

### Nomor master BERBEDA antar lingkungan

Bukan hanya berbeda — sebagian **tertukar**, sehingga memakai pemetaan staging di
produksi akan menaruh kelas pada jam yang salah tanpa galat apa pun:

| | staging | produksi |
|---|---|---|
| program HITS Reguler | 1 | **3** |
| sesi `20:00 - 21:30` | 11 | **10** |
| sesi `11:00 - 12:30` | 10 | **11** |
| sesi id 14 | `00:00 - 00:00` | `00:00 - 00:45` |
| hari `Sabtu, Ahad` | id 4 = `[5]` (pincang), id 10 = `[5,6]` | id 4 = `[5,6]` |

Karena itu `ks_tilawah_slot_map` di-key per `tilawah_batch_id`: pemetaan satu lingkungan
tidak pernah terpakai di lingkungan lain, dan slot yang belum dipetakan membuat
halaqahnya ditahan.

## 6b. Jebakan jaringan: IPv6 NAT64

`tilawah.muhajirproject.org` menyelesaikan ke alamat NAT64 (`64:ff9b::…`) **dan** IPv4
(`103.181.142.223`). Pada jaringan yang jalur NAT64-nya tidak tembus, Node mencoba IPv6
lebih dulu lalu menggantung sampai batas connect undici (10 detik) dan gagal dengan
`UND_ERR_CONNECT_TIMEOUT` — padahal IPv4 menjawab dalam ~30 ms.

Gejalanya identik dengan "server lambat", jadi mudah salah didiagnosis. Bila ini muncul
di VPS produksi, tambahkan `dns.setDefaultResultOrder('ipv4first')` **pada proses**, bukan
di dalam `lib/tilawah/` — mengubah urutan resolusi diam-diam dari dalam satu modul akan
memengaruhi seluruh permintaan keluar aplikasi (hilmihs, Google Sheets, dan lainnya).

## 7. Env

```
TILAWAH_BASE_URL=https://staging.cms.tilawah.muhajirproject.com   # staging saat latihan
TILAWAH_EMAIL=<akun layanan>
TILAWAH_PASSWORD=<sandi>
```

Akun **layanan terpisah** berhak minimum, bukan akun pribadi: pemegang server
maahir efektif memegang hak itu, dan sandinya harus dapat dicabut tanpa
mengganggu login siapa pun.

Di produksi diset lewat Azure Variable Group (`ENV_TILAWAH_*`). **Variabel
rahasia Azure tidak muncul di `printenv` kecuali dipetakan eksplisit di `env:`
task pipeline** — bila terlewat, aplikasi tetap boot dan pengiriman gagal
diam-diam.

## 8. Menguji

Satu skrip, sadar lingkungan. **Bawaannya tidak menulis apa pun** — ia menyusun
payload lengkap memakai master data sungguhan dari lingkungan yang sedang
diarahkan, lalu menampilkannya.

```bash
npm run test-tilawah                # kirim-percobaan (staging maupun produksi)
KIRIM_NYATA=1 npm run test-tilawah  # menulis — HANYA bila URL mengandung "staging"
```

**Skrip uji tidak pernah menulis ke produksi**, apa pun bendera yang diberikan.
Percobaan menulis dilakukan di staging; produksi hanya dibaca. Alasannya di §5:
akun murid yang salah masuk tidak dapat dibatalkan lewat API.

Menulis ke produksi adalah keputusan operasional, dan jalannya lewat aplikasi —
koordinator menyetujui usulan, superadmin menyalakan `ks_periode.kirim_nyata` —
bukan lewat skrip uji.

`DATABASE_URL` tetap wajib host lokal karena skrip membuat data dummy di maahir
dan menghapusnya di akhir.

Hasil dry-run terhadap produksi, 1 Sep 2026 — **ke-27 slot MASTER_SLOT terpetakan
"pasti", nol ragu, nol tanpa padanan**:

```
Sabtu & Ahad   06:00-07:30 → day 4  sesi 2      Selasa & Jum'at 06:00-07:30 → day 3  sesi 2
Selasa & Kamis 06:00-07:30 → day 2  sesi 2      Senin & Rabu    20:00-21:30 → day 1  sesi 10
Senin & Rabu   06:00-07:30 → day 1  sesi 2      Sabtu & Ahad    11:00-12:30 → day 4  sesi 11
level: HITS Dasar → 1 · HITS Lanjutan → 2
```

Perhatikan `day 3` untuk Selasa & Jum'at: itu baris `int_days [1,4]` yang benar,
**bukan** `#11` yang namanya persis sama tetapi berisi `[1]` saja.
