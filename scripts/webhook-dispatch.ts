/**
 * webhook-dispatch.ts — jalankan worker pengiriman webhook sekali (drain due).
 * Pakai DATABASE_URL dari .env.local. Cocok dijalankan cron:
 *   * * * * *  cd /app && npm run webhook:dispatch
 * (atau cron hit endpoint /api/webhooks/dispatch — lihat docs/WEBHOOKS.md).
 */
import { dispatchDue, webhooksEnabled } from '../src/lib/webhooks';

async function main() {
  if (!webhooksEnabled()) {
    console.log('WEBHOOKS!=on → skip (set WEBHOOKS=on untuk aktif).');
    return;
  }
  const batchRaw = parseInt(process.argv[2] ?? '', 10);
  const batch = Number.isFinite(batchRaw) && batchRaw > 0 ? batchRaw : 50;
  const res = await dispatchDue(batch);
  console.log(
    `dispatch: processed=${res.processed} delivered=${res.delivered} retried=${res.retried} failed=${res.failed}`
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
