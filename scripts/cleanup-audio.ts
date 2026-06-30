/**
 * Hapus audio dengan satu aturan retensi:
 *
 *   SUDAH DICEK : audio_url dihapus kalau checked_at > 2 pekan lalu
 *                 (sudah dinilai, audio tidak perlu disimpan lama-lama)
 *
 * Audio yang BELUM dicek TIDAK pernah dihapus — disimpan tanpa batas sampai
 * dinilai (lalu masuk aturan 2-pekan di atas). Ini mencegah audio lenyap sebelum
 * musyrif/syaikh sempat menilai, walau telat.
 *
 * Diterapkan untuk:
 *   - rekaman (peserta → musyrif)
 *   - rekaman_musyrif (musyrif → syaikh)
 *
 * Audit trail tetap di tabel rekaman (nilai + masukan), hanya file storage
 * yang dihapus + kolom audio_url di-null-kan.
 *
 * Dijalankan via cron, mis. tiap hari.
 */
import { supabaseAdmin, AUDIO_BUCKET } from '../src/lib/supabase-admin';

const RETENTION_CHECKED_WEEKS = 2;
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

async function deleteBatch(
  table: 'rekaman' | 'rekaman_musyrif',
  rows: Row[]
): Promise<{ deleted: number; failed: number }> {
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
    .from(table)
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
  table: 'rekaman' | 'rekaman_musyrif';
  query: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}): Promise<{ total: number; failed: number }> {
  let total = 0;
  let failed = 0;
  while (true) {
    const { data, error } = await args.query();
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;
    const r = await deleteBatch(args.table, rows);
    total += r.deleted;
    failed += r.failed;
    if (rows.length < BATCH_SIZE) break;
  }
  console.log(`  ${args.label}: ${total} file dihapus${failed ? ` (${failed} gagal)` : ''}`);
  return { total, failed };
}

async function main() {
  const checkedCutoff = weeksAgoIso(RETENTION_CHECKED_WEEKS);

  console.log('Cleanup audio dengan aturan:');
  console.log(`  • Sudah dicek + checked_at < ${checkedCutoff}`);
  console.log('  • Belum dicek: TIDAK dihapus');
  console.log();

  let totalAll = 0;
  let failedAll = 0;

  const accumulate = async (label: string, table: 'rekaman' | 'rekaman_musyrif', q: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const r = await sweep({ label, table, query: q });
    totalAll += r.total;
    failedAll += r.failed;
  };

  await accumulate('Peserta sudah dicek (>2 pekan)', 'rekaman', () =>
    supabaseAdmin
      .from('rekaman')
      .select('id, audio_url')
      .not('audio_url', 'is', null)
      .not('checked_at', 'is', null)
      .lt('checked_at', checkedCutoff)
      .limit(BATCH_SIZE)
  );
  await accumulate('Musyrif sudah dicek (>2 pekan)', 'rekaman_musyrif', () =>
    supabaseAdmin
      .from('rekaman_musyrif')
      .select('id, audio_url')
      .not('audio_url', 'is', null)
      .not('checked_at', 'is', null)
      .lt('checked_at', checkedCutoff)
      .limit(BATCH_SIZE)
  );

  console.log(`\n✓ Total: ${totalAll} file dihapus, ${failedAll} gagal.`);
}

main().catch((err) => {
  console.error('\n✗ Cleanup error:', err);
  process.exit(1);
});
