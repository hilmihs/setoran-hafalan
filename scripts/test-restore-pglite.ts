/**
 * test-restore-pglite.ts — verifikasi restore END-TO-END tanpa Postgres sistem.
 *
 * Pakai PGlite (Postgres asli, WASM, in-process — tidak butuh sudo/docker).
 * Alur:
 *   1. CREATE ROLE anon/authenticated/service_role   (00_roles.sql)
 *   2. Replay SEMUA migrasi supabase/migrations/*.sql secara berurutan
 *   3. Muat _backup_supabase/data/*.json (pakai loader yg SAMA dgn produksi)
 *   4. Verifikasi jumlah baris tiap tabel == manifest export
 *   5. Cek integritas FK (set constraints immediate / validate)
 *
 * Jalankan: npm run test-restore
 */
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadData, type QueryFn } from '../db-migration/load-data';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const DATA = join(ROOT, '_backup_supabase', 'data');
const MANIFEST = join(ROOT, '_backup_supabase', 'manifest.json');

async function main() {
  console.log('PGlite restore test — mulai\n');
  const db = new PGlite();
  const q: QueryFn = async (text, params) =>
    (await db.query(text, params as any[])) as { rows: any[] };

  // 1. Roles
  const roles = await readFile(join(ROOT, 'db-migration', '00_roles.sql'), 'utf8');
  await db.exec(roles);
  console.log('✓ roles dibuat (anon, authenticated, service_role, authenticator)');

  // 2. Migrasi berurutan
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  let ok = 0;
  for (const f of files) {
    const sql = await readFile(join(MIGRATIONS, f), 'utf8');
    try {
      await db.exec(sql);
      ok++;
    } catch (e) {
      console.error(`\n✗ GAGAL di migrasi ${f}:\n  ${String(e).split('\n')[0]}`);
      throw e;
    }
  }
  console.log(`✓ ${ok}/${files.length} migrasi ter-apply`);

  // 3. Load data (loader produksi yang sama)
  console.log('\nMemuat data:');
  // truncate: bersihkan baris yg diseed migrasi (mis. indikator_standar) supaya
  // data export (authoritative) yg dipakai.
  const { counts, total } = await loadData(q, DATA, { truncate: true, log: () => {} });
  console.log(`✓ ${Object.keys(counts).filter((k) => counts[k] > 0).length} tabel berisi, ${total} baris total`);

  // 4. Verifikasi jumlah baris vs manifest
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const expected: Record<string, number> = manifest.tables;
  let mismatch = 0;
  let verified = 0;
  const notInSchema: string[] = [];
  for (const [t, exp] of Object.entries(expected)) {
    const { rows: exists } = await q(
      `SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1`,
      [t]
    );
    if (exists.length === 0) {
      // Tabel ad-hoc (dibuat manual di dashboard, bukan lewat migrasi).
      // Datanya tetap ada di JSON export; bukan bagian schema aplikasi.
      notInSchema.push(t);
      continue;
    }
    const { rows } = await q(`SELECT count(*)::int AS n FROM public."${t}"`);
    const got = rows[0].n;
    if (got !== exp) {
      mismatch++;
      console.error(`  ✗ ${t}: harap ${exp}, dapat ${got}`);
    } else verified++;
  }
  if (notInSchema.length) {
    console.log(
      `ℹ tabel di luar schema aplikasi (diabaikan, data tetap di JSON export): ${notInSchema.join(', ')}`
    );
  }
  if (mismatch === 0) {
    console.log(`✓ jumlah baris ${verified} tabel schema COCOK dgn manifest`);
  } else {
    throw new Error(`${mismatch} tabel jumlah baris TIDAK cocok`);
  }

  // 5. Integritas FK — validasi semua constraint fk sekarang triggernya on lagi.
  const { rows: fkRows } = await q(`
    SELECT conrelid::regclass::text AS tbl, conname
      FROM pg_constraint WHERE contype='f'`);
  let fkBad = 0;
  for (const fk of fkRows) {
    try {
      await q(`ALTER TABLE ${fk.tbl} VALIDATE CONSTRAINT "${fk.conname}"`);
    } catch (e) {
      fkBad++;
      console.error(`  ✗ FK ${fk.tbl}.${fk.conname}: ${String(e).split('\n')[0]}`);
    }
  }
  if (fkBad === 0) console.log(`✓ ${fkRows.length} foreign key valid (tak ada baris yatim)`);
  else throw new Error(`${fkBad} foreign key gagal validasi`);

  // Ringkas objek schema
  const { rows: obj } = await q(`
    SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname='public') AS tables,
      (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e') AS enums,
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions,
      (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies`);
  console.log(
    `\nSchema tujuan: ${obj[0].tables} tabel, ${obj[0].enums} enum, ${obj[0].functions} fungsi, ${obj[0].policies} RLS policy`
  );

  await db.close();
  console.log('\n✅ RESTORE TEST LULUS — schema + data + FK terverifikasi di Postgres bersih.');
}

main().catch((e) => {
  console.error('\n❌ RESTORE TEST GAGAL:', e);
  process.exit(1);
});
