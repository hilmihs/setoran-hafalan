/**
 * apikey.ts — CLI kelola Public Read API keys (tabel api_keys).
 *
 * Memanggil fungsi lib langsung ke Postgres (pakai DATABASE_URL dari .env.local),
 * bukan via HTTP. Untuk admin lokal / ops.
 *
 * Cara pakai:
 *   npm run apikey:create -- --name web-x --scopes master:read,hits:read [--expires 2027-01-01] [--note "..."]
 *   npm run apikey:list
 *   npm run apikey:revoke -- <id>
 *
 * (npm meneruskan argumen setelah `--` apa adanya.)
 */
import { createApiKey, listApiKeys, revokeApiKey } from '../src/lib/api-keys';

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === 'create') {
    const name = flag(argv, 'name');
    const scopesRaw = flag(argv, 'scopes');
    const expires = flag(argv, 'expires');
    const note = flag(argv, 'note');
    if (!name || !scopesRaw) {
      console.error('Usage: apikey create --name <nama> --scopes a,b[,c] [--expires YYYY-MM-DD] [--note "..."]');
      process.exit(1);
    }
    const scopes = scopesRaw.split(',').map((s) => s.trim());
    const { row, fullKey } = await createApiKey({
      name,
      scopes,
      expiresAt: expires ? new Date(expires).toISOString() : null,
      note: note ?? null,
      createdByWa: 'cli',
    });
    console.log('✅ Kunci dibuat. SALIN SEKARANG (tak ditampilkan lagi):\n');
    console.log('  ' + fullKey + '\n');
    console.log('  id     :', row.id);
    console.log('  prefix :', row.key_prefix);
    console.log('  scopes :', row.scopes.join(', '));
    console.log('  expires:', row.expires_at ?? '—');
  } else if (cmd === 'list') {
    const keys = await listApiKeys();
    if (!keys.length) {
      console.log('(belum ada kunci)');
    } else {
      for (const k of keys) {
        console.log(
          [
            k.active ? 'AKTIF ' : 'CABUT ',
            k.key_prefix.padEnd(24),
            (k.name ?? '').padEnd(20),
            '[' + k.scopes.join(',') + ']',
            'used=' + (k.last_used_at ?? '—'),
            'exp=' + (k.expires_at ?? '—'),
            'id=' + k.id,
          ].join('  ')
        );
      }
    }
  } else if (cmd === 'revoke') {
    const id = argv[1];
    if (!id) {
      console.error('Usage: apikey revoke <id>');
      process.exit(1);
    }
    await revokeApiKey(id);
    console.log('✅ Kunci dicabut:', id);
  } else {
    console.error('Perintah tak dikenal. Pakai: create | list | revoke');
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
