/**
 * generate-sql-dump.ts — buat SATU file SQL portabel untuk restore penuh.
 *
 * Output: db-migration/maahir_full_dump.sql
 *   berisi: 00_roles.sql + schema.sql + data (INSERT) semua tabel.
 * Restore di host tujuan cukup: psql "$DATABASE_URL" -f maahir_full_dump.sql
 * (tanpa Node, tanpa `pg`).
 *
 * Tipe kolom di-introspeksi dari PGlite (schema di-load dulu) supaya nilai
 * di-format benar: jsonb → string JSON, ARRAY → literal '{...}', sisanya scalar.
 * Setelah generate, file DIVALIDASI: di-load ke PGlite baru & jumlah baris
 * dicek vs manifest.
 *
 * Jalankan: npm run generate-dump
 */
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const MIG = join(ROOT, 'db-migration');
const DATA = join(ROOT, '_backup_supabase', 'data');
const OUT = join(MIG, 'maahir_full_dump.sql');

type Col = { name: string; dataType: string; udt: string };

function q(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function arrayLiteral(arr: unknown[]): string {
  // Literal array Postgres: '{a,b,"c d"}'. Quote elemen bila perlu.
  const parts = arr.map((el) => {
    if (el === null) return 'NULL';
    const s = String(el);
    if (/[,{}"\\\s]/.test(s) || s === '') return '"' + s.replace(/(["\\])/g, '\\$1') + '"';
    return s;
  });
  return q('{' + parts.join(',') + '}');
}

function fmt(val: unknown, col: Col): string {
  if (val === null || val === undefined) return 'NULL';
  if (col.dataType === 'ARRAY') return arrayLiteral(Array.isArray(val) ? val : [val]);
  if (col.dataType === 'json' || col.dataType === 'jsonb') return q(JSON.stringify(val));
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return q(JSON.stringify(val)); // defensif
  return q(String(val));
}

async function main() {
  const roles = await readFile(join(MIG, '00_roles.sql'), 'utf8');
  const schema = await readFile(join(MIG, 'schema.sql'), 'utf8');

  // PGlite untuk introspeksi tipe kolom.
  const db = new PGlite();
  await db.exec(roles);
  await db.exec(schema);

  const files = (await readdir(DATA)).filter((f) => f.endsWith('.json')).sort();

  const chunks: string[] = [];
  chunks.push(
    `-- maahir_full_dump.sql — AUTO-GENERATED. Restore penuh (roles + schema + data).\n` +
      `-- Pakai: psql "$DATABASE_URL" -f db-migration/maahir_full_dump.sql\n` +
      `-- Data per ${new Date().toISOString()} dari export _backup_supabase.\n\n` +
      `\\set ON_ERROR_STOP on\n\nBEGIN;\n\n`
  );
  chunks.push('-- ===== ROLES =====\n', roles, '\n\n-- ===== SCHEMA =====\n', schema, '\n\n');
  chunks.push('-- ===== DATA =====\n', `SET session_replication_role = replica;\n\n`);

  // Kumpulkan tiap statement data sbg elemen array → dipakai utk validasi
  // per-statement (PGlite honor FK-bypass via query, bukan via exec batch).
  // PENTING: SEMUA TRUNCATE dulu, BARU semua INSERT. Kalau di-interleave,
  // `TRUNCATE parent CASCADE` bakal menghapus child yg sudah keburu di-load.
  const truncStmts: string[] = [];
  const insertStmts: string[] = [];
  const counts: Record<string, number> = {};
  const schemaTables: string[] = [];

  for (const f of files) {
    const table = f.replace(/\.json$/, '');
    const { rows: exists } = await db.query(
      `SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1`,
      [table]
    );
    const rows: Record<string, unknown>[] = JSON.parse(await readFile(join(DATA, f), 'utf8'));
    if (exists.length === 0) {
      chunks.push(`-- (lewati ${table}: bukan tabel schema aplikasi, ${rows.length} baris ada di JSON export)\n`);
      continue;
    }
    counts[table] = rows.length;
    schemaTables.push(table);
    if (rows.length === 0) continue;

    const { rows: colRows } = await db.query(
      `SELECT column_name, data_type, udt_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [table]
    );
    const cols: Col[] = colRows.map((r: any) => ({
      name: r.column_name,
      dataType: r.data_type,
      udt: r.udt_name,
    }));
    const use = cols.filter((c) => Object.prototype.hasOwnProperty.call(rows[0], c.name));
    const colList = use.map((c) => `"${c.name}"`).join(', ');
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const values = slice
        .map((row) => '  (' + use.map((c) => fmt(row[c.name], c)).join(', ') + ')')
        .join(',\n');
      insertStmts.push(`INSERT INTO public."${table}" (${colList}) VALUES\n${values};`);
    }
  }

  // Satu TRUNCATE utk semua tabel schema (atomic, urutan tak masalah krn CASCADE).
  const truncateAll = `TRUNCATE TABLE ${schemaTables
    .map((t) => `public."${t}"`)
    .join(', ')} CASCADE;`;
  truncStmts.push(truncateAll);

  const dataStmts = [...truncStmts, ...insertStmts];
  chunks.push('-- kosongkan semua tabel dulu (buang baris seed migrasi)\n');
  chunks.push(truncateAll + '\n\n');
  chunks.push('-- isi data\n');
  for (const s of insertStmts) chunks.push(s + '\n');
  chunks.push(`\nSET session_replication_role = default;\n\nCOMMIT;\n`);
  const sql = chunks.join('');
  await writeFile(OUT, sql);
  await db.close();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Dump ditulis: ${OUT}`);
  console.log(`  ${Object.keys(counts).length} tabel, ${total} baris, ${(sql.length / 1e6).toFixed(1)} MB SQL`);

  // ── VALIDASI: restore ulang di PGlite baru, cek jumlah baris ──
  // Catatan: PGlite `exec` (multi-statement) TIDAK menghormati
  // session_replication_role utk bypass FK; `query` (per-statement) YA. Maka
  // schema di-exec, lalu tiap statement data dijalankan via query. File dump
  // tetap valid utk `psql -f` asli (superuser menghormati SET replica).
  console.log('\nValidasi dump (restore ulang di Postgres bersih)...');
  const db2 = new PGlite();
  await db2.exec(roles);
  await db2.exec(schema);
  await db2.query('SET session_replication_role = replica');
  for (const stmt of dataStmts) await db2.query(stmt);
  await db2.query('SET session_replication_role = default');
  const manifest = JSON.parse(await readFile(join(ROOT, '_backup_supabase', 'manifest.json'), 'utf8'));
  let bad = 0;
  for (const [t, exp] of Object.entries<number>(manifest.tables)) {
    const { rows: ex } = await db2.query(
      `SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1`,
      [t]
    );
    if (ex.length === 0) continue; // tabel non-schema
    const { rows } = await db2.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public."${t}"`
    );
    if (rows[0].n !== exp) {
      bad++;
      console.error(`  ✗ ${t}: harap ${exp}, dapat ${rows[0].n}`);
    }
  }
  await db2.close();
  if (bad > 0) throw new Error(`${bad} tabel tidak cocok setelah restore dump`);
  console.log('✅ Dump VALID — restore ulang cocok dgn manifest.');
}

main().catch((e) => {
  console.error('GENERATE DUMP GAGAL:', e);
  process.exit(1);
});
