# Webhooks (Push) + Usage Analytics

## Usage analytics (Public Read API)

Tiap request `/api/v1/*` yang tereksekusi dicatat per kunci per hari
(`api_key_usage`). Increment di-buffer in-memory lalu flush berkala (10 dtk /
50 hit). Lihat total & pemakaian harian di **/admin/api-keys** (kolom "Total req").

---

## Webhooks

Push event ke URL konsumen saat data berubah. Kebalikan dari Public Read API
(pull). Durable: tiap kiriman masuk outbox (`webhook_deliveries`) → worker
kirim dengan retry + backoff.

### Aktivasi

```
WEBHOOKS=on
```

Mati default → event tak di-enqueue; worker dispatch balas 404.

### Event tersedia

| Event | Kapan |
|---|---|
| `setoran.submitted` | Peserta submit setoran (3 rekaman lengkap) |
| `setoran.checked` | Musyrif memberi nilai → setoran terkunci |

### Kelola endpoint

Halaman **/admin/webhooks** atau CLI:

```bash
npm run webhook:create -- --url https://situs-lain.com/hook --events setoran.submitted,setoran.checked
npm run webhook:list
npm run webhook:disable -- <id>
npm run webhook:enable  -- <id>
npm run webhook:delete  -- <id>
```

`--events` kosong = langganan **semua** event. Saat dibuat, **secret HMAC**
ditampilkan sekali — simpan; dipakai konsumen memverifikasi tanda tangan.

### Bentuk request yang dikirim

`POST <url>` dengan body JSON:
```json
{ "event": "setoran.submitted", "data": { ... }, "emitted_at": "2026-07-21T..." }
```
Header:
```
content-type: application/json
x-maahir-event: setoran.submitted
x-maahir-delivery: <uuid delivery>
x-maahir-signature: sha256=<hex>
```
Konsumen dianggap sukses bila balas HTTP **2xx**. Selain itu → retry.

### Verifikasi tanda tangan (sisi konsumen)

```js
const crypto = require('crypto');
const expected = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
const got = req.headers['x-maahir-signature'].replace(/^sha256=/, '');
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))) reject();
```
Gunakan **raw body** (bukan hasil JSON.parse lalu stringify ulang).

### Retry & backoff

Gagal (non-2xx / timeout 10 dtk) → dicoba ulang: 30s, 60s, 120s, … maks 1 jam,
sampai `max_attempts` (default 6) → status `failed`.

### Worker dispatch (wajib dijadwalkan cron)

Enqueue saja tak cukup — worker harus dijalankan berkala. Dua cara:

**a) HTTP** (cron di server mana pun):
```bash
curl -X POST https://maahir.muhajirproject.org/api/webhooks/dispatch \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```
**b) CLI** (cron di VPS app):
```bash
* * * * *  cd /var/www/html/maahir && npm run webhook:dispatch
```

Respons dispatch: `{ ok, processed, delivered, retried, failed }`.
