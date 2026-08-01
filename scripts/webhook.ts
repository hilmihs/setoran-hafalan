/**
 * webhook.ts — CLI kelola endpoint webhook (push).
 *
 * Pakai DATABASE_URL dari .env.local (bukan HTTP). Untuk admin/ops lokal.
 *
 *   npm run webhook:create -- --url https://x.com/hook --events setoran.submitted,setoran.checked [--note "..."]
 *   npm run webhook:list
 *   npm run webhook:disable -- <id>
 *   npm run webhook:enable -- <id>
 *   npm run webhook:delete -- <id>
 */
import {
  createEndpoint,
  listEndpoints,
  setEndpointActive,
  deleteEndpoint,
} from '../src/lib/webhooks';

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === 'create') {
    const url = flag(argv, 'url');
    const eventsRaw = flag(argv, 'events');
    const note = flag(argv, 'note');
    if (!url || !eventsRaw) {
      console.error('Usage: webhook create --url <https://…> --events a,b [--note "..."]');
      process.exit(1);
    }
    const events = eventsRaw.split(',').map((s) => s.trim());
    const { endpoint, secret } = await createEndpoint({ url, events, note: note ?? null, createdByWa: 'cli' });
    console.log('✅ Endpoint dibuat. Secret HMAC (SALIN SEKARANG, tak ditampilkan lagi):\n');
    console.log('  ' + secret + '\n');
    console.log('  id     :', endpoint.id);
    console.log('  url    :', endpoint.url);
    console.log('  events :', endpoint.events.length ? endpoint.events.join(', ') : '(semua)');
  } else if (cmd === 'list') {
    const eps = await listEndpoints();
    if (!eps.length) {
      console.log('(belum ada endpoint)');
    } else {
      for (const e of eps) {
        console.log(
          [
            e.active ? 'ON ' : 'OFF',
            e.url.padEnd(40),
            '[' + (e.events.length ? e.events.join(',') : 'ALL') + ']',
            'fail=' + e.failure_count,
            'last=' + (e.last_delivery_at ?? '—'),
            'id=' + e.id,
          ].join('  ')
        );
      }
    }
  } else if (cmd === 'disable' || cmd === 'enable') {
    const id = argv[1];
    if (!id) { console.error(`Usage: webhook ${cmd} <id>`); process.exit(1); }
    await setEndpointActive(id, cmd === 'enable');
    console.log(`✅ Endpoint ${cmd === 'enable' ? 'diaktifkan' : 'dinonaktifkan'}:`, id);
  } else if (cmd === 'delete') {
    const id = argv[1];
    if (!id) { console.error('Usage: webhook delete <id>'); process.exit(1); }
    await deleteEndpoint(id);
    console.log('✅ Endpoint dihapus:', id);
  } else {
    console.error('Perintah tak dikenal. Pakai: create | list | enable | disable | delete');
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
