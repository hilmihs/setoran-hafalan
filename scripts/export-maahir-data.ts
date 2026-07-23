/**
 * Export SELURUH data maahir (semua tabel) via ADMIN API (/api/admin/db).
 * Untuk takeover: pihak lain bisa tarik data keluar sendiri, berkala.
 *
 *   npx tsx --env-file=.env.local scripts/export-maahir-data.ts
 *   npx tsx --env-file=.env.local scripts/export-maahir-data.ts --out=/path/dir --format=ndjson --only=peserta,setoran
 *
 * Opsi:
 *   --out=DIR       direktori output (default: ./maahir-export)
 *   --format=json   'json' (array per tabel, default) | 'ndjson' (1 baris/record)
 *   --only=a,b,c    hanya tabel ini (default: semua base table di schema public)
 *   --exclude=a,b   lewati tabel ini
 *
 * Cara kerja:
 *   - Baca daftar base table dari information_schema.
 *   - Per tabel: keyset-paginate pakai `ctid` (universal, tak butuh tahu PK),
 *     LIMIT 1000/page (cap admin API) sampai habis. `ctid` di-strip dari output.
 *   - Tulis <out>/<tabel>.(json|ndjson) + <out>/_manifest.json (rowCount/tabel,
 *     exportedAt, host).
 *
 * ⚠️ OUTPUT BERISI PII (nomor WA, password_hash, audio_url). Jangan commit ke git.
 *    Simpan/transfer aman. Password hash = bcrypt (bukan plaintext) tapi tetap sensitif.
 *
 * Read-only: hanya SELECT (jalur sama seperti `npm run db`). Tak mengubah prod.
 */
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';

function arg(name: string, def = ''): string {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : def;
}

const OUT = arg('out', join(process.cwd(), 'maahir-export'));
const FORMAT = arg('format', 'json') === 'ndjson' ? 'ndjson' : 'json';
const ONLY = arg('only').split(',').map((s) => s.trim()).filter(Boolean);
const EXCLUDE = new Set(arg('exclude').split(',').map((s) => s.trim()).filter(Boolean));

const TOKEN = process.env.ADMIN_API_TOKEN;
const BASE = (process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
if (!TOKEN) { console.error('✗ ADMIN_API_TOKEN belum di-set di .env.local'); process.exit(2); }
if (!BASE) { console.error('✗ ADMIN_API_URL / NEXT_PUBLIC_APP_URL belum di-set'); process.exit(2); }

const PAGE = 1000; // cap MAX_ROWS admin API

async function api(sql: string): Promise<{ rows: any[]; truncated?: boolean }> {
  const res = await fetch(`${BASE}/api/admin/db`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ sql }),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} non-JSON: ${text.slice(0, 300)}`); }
  if (!res.ok || data?.ok === false) throw new Error(`HTTP ${res.status}: ${data?.error ?? 'unknown'}`);
  return { rows: data.rows ?? [], truncated: data.truncated };
}

function sqlLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function listTables(): Promise<string[]> {
  const { rows } = await api(
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by table_name`
  );
  let names = rows.map((r) => r.table_name as string);
  if (ONLY.length) names = names.filter((n) => ONLY.includes(n));
  names = names.filter((n) => !EXCLUDE.has(n));
  return names;
}

/** Ambil semua baris 1 tabel via keyset pagination pakai ctid. */
async function fetchTable(table: string, onBatch: (rows: any[]) => void): Promise<number> {
  let last = '(0,0)';
  let total = 0;
  for (;;) {
    const { rows } = await api(
      `select *, ctid::text as __ctid from ${table}
       where ctid > ${sqlLit(last)}::tid order by ctid limit ${PAGE}`
    );
    if (!rows.length) break;
    last = rows[rows.length - 1].__ctid;
    for (const r of rows) delete r.__ctid;
    onBatch(rows);
    total += rows.length;
    if (rows.length < PAGE) break;
  }
  return total;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const tables = await listTables();
  console.log(`\n📤 Export maahir @ ${BASE} → ${OUT}  (format=${FORMAT}, ${tables.length} tabel)\n`);

  const manifest: Record<string, number> = {};
  for (const table of tables) {
    const file = join(OUT, `${table}.${FORMAT}`);
    let count = 0;
    if (FORMAT === 'ndjson') {
      const ws = createWriteStream(file, { encoding: 'utf8' });
      count = await fetchTable(table, (rows) => {
        for (const r of rows) ws.write(JSON.stringify(r) + '\n');
      });
      ws.end();
    } else {
      const all: any[] = [];
      count = await fetchTable(table, (rows) => all.push(...rows));
      writeFileSync(file, JSON.stringify(all, null, 0));
    }
    manifest[table] = count;
    console.log(`  ${table.padEnd(34)} ${String(count).padStart(7)} baris`);
  }

  const total = Object.values(manifest).reduce((a, b) => a + b, 0);
  const meta = {
    exportedAt: new Date().toISOString(),
    host: BASE,
    format: FORMAT,
    tableCount: tables.length,
    rowCount: total,
    tables: manifest,
  };
  writeFileSync(join(OUT, '_manifest.json'), JSON.stringify(meta, null, 2));
  console.log(`\n✅ Selesai — ${tables.length} tabel, ${total} baris total. Manifest: ${join(OUT, '_manifest.json')}`);
  console.log('⚠️  Output berisi PII (WA, password_hash). Jangan commit; transfer aman.\n');
}

main().catch((e) => { console.error('✗', e instanceof Error ? e.message : String(e)); process.exit(1); });
