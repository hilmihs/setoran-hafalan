# Public Read API (`/api/v1`)

API baca **read-only** untuk konsumen eksternal (server-to-server). Data Maahir
(setoran + laporan), HITS (rekap + ranking + kehadiran), dan master data.

## Aktivasi

Mati secara default → semua `/api/v1/*` balas **404**. Untuk menyalakan, set env:

```
PUBLIC_API=on
API_RATE_LIMIT_PER_MIN=120   # opsional, default 120 req/menit/kunci
```

Lalu restart app.

## Autentikasi

Tiap request wajib menyertakan kunci API (per-konsumen). Dua cara header:

```
Authorization: Bearer mhr_live_ab12cd34_<secret>
# atau
x-api-key: mhr_live_ab12cd34_<secret>
```

Kunci dibuat lewat halaman **/admin/api-keys** (superadmin) atau CLI:

```bash
npm run apikey:create -- --name web-yayasan --scopes master:read,hits:read
npm run apikey:list
npm run apikey:revoke -- <id>
```

Kunci penuh **hanya tampil sekali** saat dibuat (disimpan sebagai SHA-256 hash).

### Scope

| Scope | Akses |
|---|---|
| `master:read` | peserta, kelas, musyrif, pengajar, kelompok, halaqah |
| `setoran:read` | setoran, rekaman (metadata), laporan bulanan |
| `hits:read` | HITS rekap, ranking, kehadiran |

Kunci tanpa scope yang diperlukan → **403**.

## Format respons

Sukses:
```json
{ "ok": true, "data": <...>, "meta": { "page": 1, "limit": 50, "count": 12, "total": 340 } }
```
Error:
```json
{ "ok": false, "error": { "code": "forbidden", "message": "..." } }
```

Kode HTTP: `200` ok · `400` bad_request · `401` unauthorized · `403` forbidden ·
`404` not_found (atau API mati) · `429` rate_limited (+`Retry-After`) · `500` internal_error.

## Paginasi

List resource mendukung `?page` (default 1) dan `?limit` (default 50, maks 200).

## Endpoint

Lihat daftar hidup + scope kunci Anda:
```
GET /api/v1/meta
```

### Master data — `master:read`
| Endpoint | Filter |
|---|---|
| `GET /api/v1/peserta` | `kelas_id`, `gender`, `active` |
| `GET /api/v1/peserta/:id` | — |
| `GET /api/v1/kelas` | `gender`, `musyrif_id` |
| `GET /api/v1/musyrif` | `gender`, `active` |
| `GET /api/v1/pengajar` | `gender`, `active`, `kelompok_id`, `is_ketua` |
| `GET /api/v1/kelompok` | `gender` |
| `GET /api/v1/halaqah` | `gender`, `active`, `batch_id`, `level`, `pengajar_id` |

### Setoran Maahir — `setoran:read`
| Endpoint | Keterangan |
|---|---|
| `GET /api/v1/setoran` | filter `peserta_id`, `week_start`, `status` |
| `GET /api/v1/setoran/:id` | setoran + rekaman **metadata** (jenis/durasi/nilai) — TANPA file audio |
| `GET /api/v1/laporan/bulanan?bulan=YYYY-MM&gender=ikhwan\|akhwat` | laporan bulanan |

### HITS — `hits:read`
| Endpoint | Keterangan |
|---|---|
| `GET /api/v1/hits/rekap?bulan=YYYY-MM` | filter `batch_id`, `gender`, `halaqah_id` |
| `GET /api/v1/hits/ranking?start=YYYY-MM-DD&end=YYYY-MM-DD` | `end` eksklusif; filter `gender` |
| `GET /api/v1/hits/kehadiran` | filter `halaqah_id`, `tanggal`, `pertemuan_no`, `kondisi` |

## Catatan keamanan

- `password_hash`, `magic_token`, dan field `*_token`/`*password*` **selalu dibuang** dari semua respons.
- `whatsapp_number` diteruskan penuh.
- Audio setoran **tidak** diekspos (metadata saja).
- Konsumen = server lain; jangan taruh kunci di kode frontend/browser.

## Contoh

```bash
KEY="mhr_live_ab12cd34_..."
BASE="https://maahir.muhajirproject.org"

# daftar peserta ikhwan aktif, halaman 1
curl -s -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/peserta?gender=ikhwan&active=true&limit=50"

# laporan bulanan
curl -s -H "x-api-key: $KEY" \
  "$BASE/api/v1/laporan/bulanan?bulan=2026-07&gender=ikhwan"

# ranking disiplin HITS
curl -s -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/hits/ranking?start=2026-07-01&end=2026-08-01"
```
