// hilmihs-emit-sql.ts — emit SQL upsert idempotent untuk mirror eval_* prod,
// DARI baris eval_sync_stage lokal (hasil runPull sebelumnya). Tak perlu network
// hilmihs. Dipakai saat sync via web tak bisa (token secret tak sampai runtime):
// apply file .sql ke prod via `npm run db --confirm "$(cat file)"`.
//
// Jalankan: npx tsx --env-file=.env.local scripts/hilmihs-emit-sql.ts <outDir>
import { writeFileSync } from 'node:fs';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const outDir = process.argv[2];
if (!outDir) { console.error('Usage: ... hilmihs-emit-sql.ts <outDir>'); process.exit(2); }

// ── SQL value helpers ──
const q = (v: unknown): string => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const b = (v: unknown): string => (v ? 'true' : 'false');
const num = (v: unknown): string => (v === null || v === undefined ? 'NULL' : String(Number(v)));

function emitUpsert(table: string, cols: string[], rows: string[][], chunkSize: number): string {
  if (!rows.length) return `-- ${table}: 0 baris\n`;
  const updateCols = cols.filter((c) => c !== 'id');
  const setClause = updateCols.map((c) => `${c} = excluded.${c}`).join(', ');
  const parts: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    parts.push(
      `insert into ${table} (${cols.join(', ')}, synced_at) values\n  ` +
        chunk.map((r) => `(${r.join(', ')}, now())`).join(',\n  ') +
        `\non conflict (id) do update set ${setClause}, synced_at = now();`
    );
  }
  return `-- ${table}: ${rows.length} baris\n${parts.join('\n')}\n`;
}

type Stage = { entity: string; op: string; after: Record<string, unknown> | null };

async function loadAfter(entity: string): Promise<Record<string, unknown>[]> {
  // Ambil baris create/update (after != null) untuk entity ini.
  const { data } = await supabaseAdmin
    .from('eval_sync_stage')
    .select('entity, op, after')
    .eq('entity', entity)
    .in('op', ['create', 'update']);
  return ((data ?? []) as Stage[]).map((s) => s.after).filter((a): a is Record<string, unknown> => !!a);
}

async function main() {
  const [batch, pengajar, halaqah, peserta] = await Promise.all([
    loadAfter('batch'), loadAfter('pengajar'), loadAfter('halaqah'), loadAfter('peserta'),
  ]);
  console.log(`stage after-rows: batch ${batch.length}, pengajar ${pengajar.length}, halaqah ${halaqah.length}, peserta ${peserta.length}`);
  if (!batch.length && !pengajar.length) {
    console.error('⚠ stage kosong — jalankan runPull dulu (butuh network hilmihs).');
    process.exit(1);
  }

  writeFileSync(`${outDir}/hilmihs-1-batch.sql`,
    emitUpsert('eval_batch', ['id', 'nama', 'aktif'],
      batch.map((x) => [q(x.id), q(x.nama), b(x.aktif)]), 500));

  writeFileSync(`${outDir}/hilmihs-2-pengajar.sql`,
    emitUpsert('eval_pengajar', ['id', 'nama', 'gender', 'whatsapp'],
      pengajar.map((x) => [q(x.id), q(x.nama), q(x.gender), q(x.whatsapp)]), 500));

  writeFileSync(`${outDir}/hilmihs-3-halaqah.sql`,
    emitUpsert('eval_halaqah',
      ['id', 'nama', 'gender', 'level', 'pengajar_id', 'batch_id', 'mustawa', 'ambang_ujian'],
      halaqah.map((x) => [q(x.id), q(x.nama), q(x.gender), q(x.level), q(x.pengajar_id), q(x.batch_id), num(x.mustawa), num(x.ambang_ujian)]), 500));

  // Buang peserta yang halaqah_id-nya tak ada di eval_halaqah (source /peserta
  // merujuk halaqah arsip/nonaktif yang tak muncul di /halaqah → FK violation).
  const halIds = new Set(halaqah.map((x) => String(x.id)));
  const pesValid = peserta.filter((x) => halIds.has(String(x.halaqah_id)));
  const dropped = peserta.length - pesValid.length;
  console.log(`peserta valid ${pesValid.length}, orphan dibuang ${dropped} (halaqah tak ada)`);

  // peserta banyak → pecah jadi beberapa file (hindari ARG_MAX shell). 900 baris/file.
  const pesRows = pesValid.map((x) => [q(x.id), q(x.nama), q(x.gender), q(x.halaqah_id), b(x.is_ketua), b(x.aktif), num(x.urutan)]);
  const pesCols = ['id', 'nama', 'gender', 'halaqah_id', 'is_ketua', 'aktif', 'urutan'];
  const FILE_ROWS = 900;
  let fileNo = 0;
  for (let i = 0; i < pesRows.length; i += FILE_ROWS) {
    fileNo++;
    const slice = pesRows.slice(i, i + FILE_ROWS);
    const nn = String(fileNo).padStart(2, '0');
    writeFileSync(`${outDir}/hilmihs-4-peserta-${nn}.sql`, emitUpsert('eval_peserta', pesCols, slice, 900));
  }

  console.log(`\n✓ SQL → ${outDir}. Apply URUT (FK): batch → pengajar → halaqah → peserta-01..${String(fileNo).padStart(2, '0')}`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
