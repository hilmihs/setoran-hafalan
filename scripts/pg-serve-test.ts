/**
 * pg-serve-test.ts — jalankan PGlite (data hasil restore) sbg server Postgres
 * wire-protocol di 127.0.0.1:54329, supaya node-postgres (pg.Pool) di aplikasi
 * bisa connect sungguhan. Untuk smoke-test runtime tanpa Postgres sistem.
 *
 * Jalankan (background): npx tsx scripts/pg-serve-test.ts
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadData } from '../db-migration/load-data';

const ROOT = process.cwd();
const PORT = Number(process.env.PG_TEST_PORT ?? 54329);

async function main() {
  const db = new PGlite();
  await db.exec(await readFile(join(ROOT, 'db-migration/00_roles.sql'), 'utf8'));
  await db.exec(await readFile(join(ROOT, 'db-migration/schema.sql'), 'utf8'));
  await loadData(
    (t, p) => db.query(t, p as any[]).then((r) => ({ rows: r.rows as any[] })),
    join(ROOT, '_backup_supabase/data'),
    { truncate: true }
  );
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  console.log(`PG_TEST_READY on 127.0.0.1:${PORT}`);
  // tetap hidup
  process.on('SIGTERM', async () => { await server.stop(); await db.close(); process.exit(0); });
  process.on('SIGINT', async () => { await server.stop(); await db.close(); process.exit(0); });
}

main().catch((e) => { console.error('SERVE GAGAL', e); process.exit(1); });
