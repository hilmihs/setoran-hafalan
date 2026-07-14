/**
 * db.ts — CLI tipis untuk endpoint SQL admin (/api/admin/db).
 *
 * Memanggil API HTTP (bukan DB langsung) supaya jalur identik dgn yang dipakai
 * di prod: browser/script → app → Postgres. Tak butuh SSH.
 *
 * Env (dari .env.local):
 *   ADMIN_API_TOKEN   token bearer (harus sama dgn env prod)
 *   ADMIN_API_URL     base URL app (fallback: NEXT_PUBLIC_APP_URL)
 *
 * Cara pakai:
 *   npm run db "SELECT count(*) FROM peserta"          # read
 *   npm run db "UPDATE peserta SET active=false WHERE id='...'"   # preview (wouldAffect)
 *   npm run db --confirm "UPDATE peserta SET active=false WHERE id='...'"  # commit
 *   npm run db --confirm --allow-nontx "VACUUM peserta"           # non-transaksional
 *
 * (npm meneruskan argumen apa adanya; flag boleh sebelum/sesudah SQL.)
 */

function parseArgs(argv: string[]): { sql: string; confirm: boolean; allowNonTx: boolean } {
  let confirm = false;
  let allowNonTx = false;
  const rest: string[] = [];
  for (const a of argv) {
    if (a === '--confirm' || a === '-y') confirm = true;
    else if (a === '--allow-nontx') allowNonTx = true;
    else rest.push(a);
  }
  return { sql: rest.join(' ').trim(), confirm, allowNonTx };
}

async function main() {
  const { sql, confirm, allowNonTx } = parseArgs(process.argv.slice(2));
  if (!sql) {
    console.error('Usage: npm run db [--confirm] [--allow-nontx] "<SQL>"');
    process.exit(2);
  }

  const token = process.env.ADMIN_API_TOKEN;
  if (!token) {
    console.error('✗ ADMIN_API_TOKEN belum di-set di .env.local');
    process.exit(2);
  }
  const base = (process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) {
    console.error('✗ ADMIN_API_URL / NEXT_PUBLIC_APP_URL belum di-set di .env.local');
    process.exit(2);
  }

  const res = await fetch(`${base}/api/admin/db`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ sql, confirm, allowNonTx }),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`✗ HTTP ${res.status} — respons bukan JSON:\n${text.slice(0, 500)}`);
    process.exit(1);
  }

  if (!res.ok || data?.ok === false) {
    console.error(`✗ HTTP ${res.status}: ${data?.error ?? 'unknown'}`);
    process.exit(1);
  }

  // Ringkasan status.
  if (data.kind === 'write') {
    if (data.committed) {
      console.log(`✓ COMMITTED — ${data.rowCount} baris terdampak.`);
    } else if (data.requiresConfirm) {
      console.log(`⚠ PREVIEW (belum di-commit).${data.notice ? ' ' + data.notice : ''}`);
      if (typeof data.wouldAffect === 'number') console.log(`  wouldAffect: ${data.wouldAffect} baris`);
      console.log('  → jalankan ulang dgn --confirm untuk commit.');
    }
    if (data.rows?.length) console.table(data.rows);
    return;
  }

  // Read.
  if (data.rows?.length) {
    console.table(data.rows);
  } else {
    console.log('(0 baris)');
  }
  console.log(`\n${data.rowCount} baris${data.truncated ? ` (dipangkas ke ${data.rows.length})` : ''}.`);
}

main().catch((err) => {
  console.error('✗ Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
