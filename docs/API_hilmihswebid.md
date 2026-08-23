# API Agent hilmihs.web.id — Dokumentasi Konsumen

Dokumen ini cukup untuk mengonsumsi data dashboard hilmihs (Mabni/HITS/HKM/Tilawah)
dari sistem lain tanpa perlu bertanya. Kalau ada yang tidak tercakup di sini, memang
belum dibuka.

- **Base URL**: `https://hilmihs.web.id/api/agent`
- **Read-only.** Semua route `GET`. Tidak ada `POST`/`PUT`/`DELETE` di API ini.
- **Satu kredensial**: `Authorization: Bearer <AGENT_TOKEN>`. Bukan cookie sesi,
  bukan `OPS_SECRET`, bukan `CRON_SECRET`.

> Ini **beda API** dari `maahir.muhajirproject.org` (lihat `API-PUBLIC.md`). Envelope,
> bentuk error, dan aturan auth berbeda. Jangan campur.

---

## 1. Autentikasi

Setiap request wajib membawa header Bearer:

```
Authorization: Bearer <AGENT_TOKEN>
```

- Token dibuat admin (env `AGENT_TOKEN` di server), diserahkan sekali. Simpan sebagai
  environment variable di backend Anda — **jangan** taruh di kode klien / browser.
- **Server-to-server.** Panggil dari backend Anda (Node/PHP/Python), simpan hasilnya,
  tampilkan dari sana.
- Fail-closed: token < 24 karakter, kosong, atau placeholder → **semua** route 401.
  Menghapus env `AGENT_TOKEN` di server = kill switch (agent buta tanpa deploy kode).
- Header hilang / salah / tidak cocok → `401`.

### Contoh `fetch` (Node.js, sisi server)

```js
// Jalankan di backend Anda, bukan di browser.
const BASE = 'https://hilmihs.web.id/api/agent';
const KEY = process.env.AGENT_TOKEN;

async function ambil(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`${res.status}: ${err.error}`);
  }
  return res.json();
}

// Direktori program dulu (jangan hardcode slug):
const { programs, families } = await ambil('programs');

// Dashboard kehadiran satu program:
const dash = await ambil(`${programs[0].slug}/dashboard`, { limit: '100' });
```

---

## 2. Bentuk respons (envelope)

Semua respons JSON. Payload isi + objek `meta`.

### Sukses

```json
{
  "programs": [ "…isi tergantung route…" ],
  "meta": {
    "program": "hits-regular",
    "generatedAt": "2026-08-23T04:00:00.000Z",
    "caps": { "students": 50 },
    "truncated": { "students": 214 }
  }
}
```

- `meta.generatedAt` — waktu server membentuk respons (ISO, UTC). **Tidak ada cache**;
  angka selalu segar (`Cache-Control: no-store`).
- `meta.program` — hanya di route per-program.
- `meta.caps` — limit yang **diterapkan** per daftar (mis. `students: 50`).
- `meta.truncated` — **total sebenarnya** per daftar yang dipotong, selalu ada bila ada
  `caps`. Jadi "3 di bawah ambang" tak pernah dibaca dari daftar yang diam-diam
  dipangkas: baca angka nyata dari `truncated`, bukan dari `data.length`.

### Error

Bentuk datar (**bukan** `{error:{code,message}}` seperti maahir):

```json
{ "error": "parameter \"foo\" tidak dikenal. Yang sah: limit, offset, fields" }
```

Beberapa error membawa field tambahan (mis. `valid: [...]`, atau `hint`, `limit`,
`bytes` pada 413).

### Status & sebab

| HTTP | Sebab |
|---|---|
| 400 | parameter tak dikenal, nilai param tak sah, slug program tak valid, `type`/`status` di luar enum, `start`/`end` wajib tapi kosong |
| 401 | header hilang / salah format / token tak cocok / `AGENT_TOKEN` server belum diset |
| 404 | program tidak ditemukan, atau fitur (`piket`/`perubahan`) tidak dipakai program itu |
| 413 | respons > 512 KB — kecilkan `limit` / pakai `offset` / `fields` |

**Parameter tak dikenal → `400`** (tidak diabaikan diam-diam), supaya salah tulis
seperti `staus=pending` tidak terbaca sebagai "tanpa filter".

---

## 3. Header respons

| Header | Nilai |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` |
| `Cache-Control` | `no-store` |
| `X-Robots-Tag` | `noindex` |

Tidak ada `ETag` / `If-None-Match` / `Retry-After` di API ini.

---

## 4. Parameter & validasi

Tiap route punya **allowlist** param sendiri. Kunci di luar allowlist → `400`. Aturan
nilai (berlaku di mana pun kunci itu diterima):

| Param | Aturan |
|---|---|
| `limit` | integer, maksimum **1000** (tiap route punya ceiling lebih rendah, lihat §6) |
| `offset` | integer ≥ 0 |
| `start`, `end` | `YYYY-MM-DD` |
| `month` | `YYYY-MM` |
| `fields` | daftar huruf dipisah koma (`name,rate`) |
| `batch` | hanya `all` |
| `mode` | `kumulatif` atau `bulanan` |
| `status` | huruf kecil + `_`, ≤20 char (enum per-route, §6) |
| `type` | huruf kecil + `-`, ≤30 char (enum per-route, §6) |
| `programs` | daftar slug dipisah koma (`hits-regular,dpq`) |
| `raw`,`grid`,`rows`,`quality`,`summary` | flag boolean, satu-satunya nilai sah `1` |
| `expand` | huruf saja (mis. `halaqah`) |

Batas ukuran: satu respons **maks 512 KB** → di atas itu `413`. Iterasikan `offset`
atau kecilkan `limit`.

---

## 5. Daftar route — lintas program (tanpa slug)

| Path `/api/agent/…` | Param | Isi |
|---|---|---|
| `programs` | — | Direktori: `programs[]` (slug, name, dataSourceType, syncPaused, features, batch) + `families{}` (grup batch sibling). **Panggil ini dulu.** |
| `overview` | `programs` | Kesehatan agregat per program (hitungan + persen, **nol PII**). Termurah untuk "gimana keadaannya". |
| `digest` | `programs` | "Apa yang butuh perhatian" lintas program. Semua daftar `top.*` dipotong; `truncated` bawa total nyata. **Tanpa nomor telepon.** Tidak menjumlah antar-batch. |
| `sync-status` | — | Kesegaran data per program. Aturan "data > 2 jam = alert & tahan reminder" dihitung **di server** (boolean jadi, bukan timestamp mentah). Program yang sync-nya dipause tidak dianggap basi. |
| `konfirmasi-rekap` | `start`,`end`,`limit`,`offset` | Blast rekap bulanan: satu baris per guru — nomor WA, hitungan, magic link `/rekap/<token>`, teks WA jadi. Lintas program (satu guru dua program → **satu** pesan). Guru tanpa nomor tak masuk `teachers`, tapi masuk `skipped` + alasan (bukan error, bagian kontrak). |
| `rekap-mabni` | `start`,`end` | Rekap Madrasah Rabbaniyah ke **satu** penerima (koordinator). Upstream Mabni tak ekspos nomor guru → tak ada token/link, satu baris satu pesan. |

`konfirmasi-rekap` & `rekap-mabni` mengeluarkan **nomor WA dan magic link** — perlakukan
sebagai kredensial (§7).

---

## 6. Daftar route — per-program (`/{program}/…`)

`{program}` = slug dari `/programs`. Slug tak valid → `400`; program tak ada → `404`.

| Path | Param | Isi |
|---|---|---|
| `{program}/dashboard` | `limit` (def 50, maks 500) | Halaman monitoring kehadiran: ringkasan segmen (uncapped) + baris murid (urut kehadiran terburuk dulu, dipotong `limit`). |
| `{program}/insights` | `limit`, `raw` | Action Items (sama dengan `getInsights()` yang dipakai UI inbox). `presensiGaps` = `teacherGaps`+`partialPresensi` sudah dilipat per-halaqah; `?raw=1` memisah lagi. |
| `{program}/halaqah` | — | Agregat per-halaqah: jumlah peserta, rata-rata kehadiran, jumlah pertemuan, backlog presensi. |
| `{program}/halaqah/{halaqahId}` | `grid` | Detail satu halaqah. **`matrix`** (murid × pertemuan, termasuk catatan izin bebas dari WA) **dihilangkan** kecuali `?grid=1` — payload terbesar & paling personal. |
| `{program}/peserta` | `limit` (def 50, maks 500), `offset`, `fields` | Direktori peserta. **`phone` TIDAK default** — ambil eksplisit `?fields=…,phone` (permintaan sengaja & teraudit). |
| `{program}/pengajar` | `expand` | Direktori pengajar. Nested `halaqah[]` **dibuang** default (ulang isi `/halaqah`, ~3× payload); minta `?expand=halaqah` bila butuh. |
| `{program}/hkm` | `mode`, `month`, `limit` (def 30, maks 500), `quality` | Progres tilawah HKM — diukur **HALAMAN vs target**, bukan persen kehadiran (`avgKehadiran` memang tak ada). `reconciliation` (diagnostik mutu data) hanya muncul dengan `?quality=1`. |
| `{program}/hkm/{participantId}` | — | Riwayat baca satu peserta HKM + posisi vs target. |
| `{program}/silabus` | — | Silabus + posisi tiap halaqah. `derivable:false` = judul pertemuan CMS generik ("Pertemuan 1") tanpa materi — itu jawaban sah, bukan kosong. |
| `{program}/guru-requests` | `status`, `limit` (def 50, maks 200) | Permintaan reschedule/badal guru. `status` ∈ `pending`,`approved`,`rejected`,`applied`,`failed`. Ini satu-satunya hal yang belum ada di dashboard UI — baris `pending` tak terlihat di UI, di sini terlihat. |
| `{program}/piket` | `limit` (def 30, maks 200) | Insiden keterlambatan + **`needsSp`** (berapa surat peringatan menunggu, dihitung server: `sp_required && !sp_generated_at`). **Feature-gated** — program tanpa fitur piket → `404` berpesan. |
| `{program}/perubahan` | `start`, `end`, `batch` | Rekap perubahan guru/badal. Window default = bounds rekap itu sendiri. **Feature-gated** `perubahan` → `404` bila tak dipakai. |
| `{program}/report` | `type`, `start`, `end`, `batch`, `rows` | Laporan bulanan sebagai JSON (angka sama dengan XLSX). `start`+`end` **wajib**. Blok agregat default; `?rows=1` tambah baris per-murid/per-guru. |

### `report` — nilai `type`

`type` ∈ `participant` (default), `hits-bulanan`, `teacher`.

- `type=teacher`: scope = **semua program** (setara super_coordinator). Bearer tak punya
  sesi, jadi scope-nya penuh, bukan kosong.
- `batch=all` hanya valid untuk program yang punya batch gabungan; kalau tidak → `404`.

---

## 7. Data sensitif — wajib dijaga konsumen

API ini mengeluarkan PII bila diminta eksplisit. Tanggung jawab pengamanan pindah ke Anda:

- **Nomor WhatsApp** — keluar di `konfirmasi-rekap` (`teachers[].phone`) dan
  `{program}/peserta?fields=…,phone`. Nomor WA = identitas login sistem hulu.
- **Magic link `/rekap/<token>`** — di `konfirmasi-rekap`. Token = **kredensial**
  (memberi akses tulis ke rekap guru itu). Jangan log, jangan tayang publik, kirim hanya
  ke pemilik nomor yang benar.
- **Catatan izin bebas** — `halaqah/{id}?grid=1` (`matrix`) berisi alasan absen
  (kesehatan/keluarga) yang di-paste dari WA. Jangan indeks, batasi akses.

Kewajiban: **jangan** tayang publik, **jangan** diindeks mesin pencari (`noindex` sudah
di header, jaga di sisi Anda juga), **batasi** ke pengguna yang berhak.

`digest`, `overview`, `sync-status` sengaja **tanpa** nomor — pakai itu untuk pantauan
umum, endpoint ber-PII hanya saat memang perlu.

---

## 8. Pola pemakaian

1. **`/programs` dulu.** Jangan hardcode slug; baca `families` untuk tahu batch sibling
   (mis. `hits-regular*` = batch berbeda dari program sama, **bukan** program terpisah).
   Server menolak pra-agregat antar-batch; pengelompokan tugas Anda.
2. **Cek `/sync-status`** sebelum percaya angka: bila `stale` (dan tidak dipause), data
   mungkin tertinggal — tahan tindakan otomatis.
3. **Pantauan murah → mahal**: `overview` (nol PII) → `digest` → endpoint per-program.
4. **Selalu baca `meta.truncated`**, bukan panjang array, untuk hitungan.
5. **Paginasi** daftar besar via `limit`+`offset`; kena `413` = kecilkan `limit`.
6. Angka **selalu segar** (no-store) — tak perlu ETag, tapi hormati beban server:
   jangan tembak banyak `report`/`digest` berat serentak.

---

## 9. Ringkasan cepat

- Base `https://hilmihs.web.id/api/agent`, header `Authorization: Bearer <AGENT_TOKEN>`,
  **server-to-server**, **GET** saja.
- Envelope: payload + `meta{generatedAt, caps, truncated}`. Error datar `{error, …}`.
- `/programs` dulu → `/sync-status` → endpoint. Param tak dikenal → `400`. Fitur tak ada
  → `404`. Respons > 512 KB → `413`.
- PII (WA, magic link, catatan izin) hanya saat diminta eksplisit, **wajib** dijaga (§7).
- Tak ada cache/ETag/rate-limit di API ini; angka selalu segar.
