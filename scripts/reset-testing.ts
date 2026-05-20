/**
 * One-off: hapus seluruh setoran + rekaman + file audio dari sesi testing ikhwan.
 * Akun (koordinator/musyrif/peserta) dan kelas TIDAK disentuh.
 */
import { supabaseAdmin, AUDIO_BUCKET } from '../src/lib/supabase-admin';

async function main() {
  const { data: rekaman, error: rErr } = await supabaseAdmin
    .from('rekaman')
    .select('id, audio_url');
  if (rErr) throw rErr;

  const paths = (rekaman ?? [])
    .map((r) => r.audio_url)
    .filter((p): p is string => !!p);

  console.log(`Rekaman: ${rekaman?.length ?? 0} row, ${paths.length} file audio`);

  if (paths.length > 0) {
    const { data: removed, error: sErr } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .remove(paths);
    if (sErr) throw sErr;
    console.log(`Storage: ${removed?.length ?? 0} file dihapus dari bucket "${AUDIO_BUCKET}"`);
  }

  const { error: delRekErr, count: delRek } = await supabaseAdmin
    .from('rekaman')
    .delete({ count: 'exact' })
    .not('id', 'is', null);
  if (delRekErr) throw delRekErr;
  console.log(`DB: ${delRek} row rekaman dihapus`);

  const { error: delSetErr, count: delSet } = await supabaseAdmin
    .from('setoran')
    .delete({ count: 'exact' })
    .not('id', 'is', null);
  if (delSetErr) throw delSetErr;
  console.log(`DB: ${delSet} row setoran dihapus`);

  console.log('\n✓ Selesai.');
}

main().catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
