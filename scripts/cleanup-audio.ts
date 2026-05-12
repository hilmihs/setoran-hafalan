/**
 * Hapus audio dengan dua aturan retensi:
 *
 *   1. BELUM DICEK : audio_url dihapus kalau recorded_at > 3 pekan lalu
 *      (musyrif terlalu lama tidak cek; setoran ditinggalkan)
 *   2. SUDAH DICEK : audio_url dihapus kalau checked_at > 1 pekan lalu
 *      (sudah dinilai, audio tidak perlu disimpan lama-lama)
 *
 * Audit trail tetap di tabel rekaman (nilai + masukan), hanya file storage
 * yang dihapus + kolom audio_url di-null-kan.
 *
 * Dijalankan via cron, mis. tiap hari.
 */
import { supabaseAdmin, AUDIO_BUCKET } from '../src/lib/supabase-admin';

const RETENTION_UNCHECKED_WEEKS = 3;
const RETENTION_CHECKED_WEEKS = 1;
const BATCH_SIZE = 100;

function weeksAgoIso(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString();
}

interface Row {
  id: string;
  audio_url: string | null;
}

async function deleteBatch(rows: Row[]): Promise<{ deleted: number; failed: number }> {
  if (rows.length === 0) return { deleted: 0, failed: 0 };

  let failed = 0;
  const paths = rows.map((r) => r.audio_url!).filter(Boolean);
  if (paths.length > 0) {
    const { error } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .remove(paths);
    if (error) {
      console.error('  Storage remove error:', error.message);
      failed += paths.length;
    }
  }

  const ids = rows.map((r) => r.id);
  const { error: upErr } = await supabaseAdmin
    .from('rekaman')
    .update({ audio_url: null })
    .in('id', ids);
  if (upErr) {
    console.error('  DB update error:', upErr.message);
    failed += ids.length;
  }

  return { deleted: paths.length - failed, failed };
}

async function sweep(args: {
  label: string;
  query: () => Promise<{ data: Row[] | null; error: Error | null }>;
}): Promise<{ total: number; failed: number }> {
  let total = 0;
  let failed = 0;
  while (true) {
    const { data: rows, error } = await args.query();
    if (error) throw error;
    if (!rows || rows.length === 0) break;
    const r = await deleteBatch(rows);
    total += r.deleted;
    failed += r.failed;
    if (rows.length < BATCH_SIZE) break;
  }
  console.log(`  ${args.label}: ${total} file dihapus${failed ? ` (${failed} gagal)` : ''}`);
  return { total, failed };
}

async function main() {
  const uncheckedCutoff = weeksAgoIso(RETENTION_UNCHECKED_WEEKS);
  const checkedCutoff = weeksAgoIso(RETENTION_CHECKED_WEEKS);

  console.log('Cleanup audio dengan aturan:');
  console.log(`  • Belum dicek + recorded_at < ${uncheckedCutoff}`);
  console.log(`  • Sudah dicek + checked_at  < ${checkedCutoff}`);
  console.log();

  const r1 = await sweep({
    label: 'Belum dicek (>3 pekan)',
    query: async () =>
      supabaseAdmin
        .from('rekaman')
        .select('id, audio_url')
        .not('audio_url', 'is', null)
        .is('checked_at', null)
        .lt('recorded_at', uncheckedCutoff)
        .limit(BATCH_SIZE),
  });

  const r2 = await sweep({
    label: 'Sudah dicek (>1 pekan)',
    query: async () =>
      supabaseAdmin
        .from('rekaman')
        .select('id, audio_url')
        .not('audio_url', 'is', null)
        .not('checked_at', 'is', null)
        .lt('checked_at', checkedCutoff)
        .limit(BATCH_SIZE),
  });

  console.log(`\n✓ Total: ${r1.total + r2.total} file dihapus, ${r1.failed + r2.failed} gagal.`);
}

main().catch((err) => {
  console.error('\n✗ Cleanup error:', err);
  process.exit(1);
});
