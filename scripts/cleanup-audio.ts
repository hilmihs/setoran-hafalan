/**
 * Hapus audio yang sudah 12 pekan sejak status 'checked'.
 *
 * - Cari rekaman dengan checked_at < 12 pekan lalu dan audio_url IS NOT NULL
 * - Hapus file di Supabase Storage
 * - Set audio_url = null (audit trail tetap)
 *
 * Dijalankan via cron mingguan, mis. di Supabase Edge Function atau cron eksternal.
 */
import { supabaseAdmin, AUDIO_BUCKET } from '../src/lib/supabase-admin';

const RETENTION_WEEKS = 12;
const BATCH_SIZE = 100;

async function main() {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_WEEKS * 7);
  const cutoffIso = cutoff.toISOString();

  console.log(`Cutoff: hapus audio dengan checked_at < ${cutoffIso}`);

  let totalDeleted = 0;
  let totalFailed = 0;

  // Loop until no more rows match
  // (we update audio_url → null after delete, so they won't be re-fetched)
  while (true) {
    const { data: rows, error } = await supabaseAdmin
      .from('rekaman')
      .select('id, audio_url, checked_at')
      .not('audio_url', 'is', null)
      .not('checked_at', 'is', null)
      .lt('checked_at', cutoffIso)
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!rows || rows.length === 0) break;

    const paths = rows.map((r) => r.audio_url!).filter(Boolean);
    if (paths.length > 0) {
      const { error: rmErr } = await supabaseAdmin.storage
        .from(AUDIO_BUCKET)
        .remove(paths);
      if (rmErr) {
        console.error('Storage remove error:', rmErr.message);
        totalFailed += paths.length;
      } else {
        totalDeleted += paths.length;
      }
    }

    const ids = rows.map((r) => r.id);
    const { error: upErr } = await supabaseAdmin
      .from('rekaman')
      .update({ audio_url: null })
      .in('id', ids);
    if (upErr) {
      console.error('DB update error:', upErr.message);
      totalFailed += ids.length;
      break;
    }
  }

  console.log(`\nSelesai. Dihapus: ${totalDeleted} file. Gagal: ${totalFailed}.`);
}

main().catch((err) => {
  console.error('\n✗ Cleanup error:', err);
  process.exit(1);
});
