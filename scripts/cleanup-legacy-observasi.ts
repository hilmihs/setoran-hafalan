/**
 * Retire data observasi LEGACY (demo) setelah unify ke sistem HITS.
 *
 *   npm run cleanup-legacy-observasi
 *
 * Menghapus baris demo (urut FK), TIDAK men-drop tabel (skema tetap;
 * checkin_pengajar / /kehadiran masih melayani program_kehadiran):
 *   tabayyun → observasi_kelas → checkin_pengajar(kelas_hits) → ketua_kelas(legacy) → kelas_hits
 * Idempotent.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

async function delStep(label: string, builder: Promise<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await builder;
  if (error) {
    console.error(`  ✗ ${label}: ${error.message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${label}: ${count ?? 0} dihapus`);
}

async function run() {
  console.log('\n🧹 Cleanup legacy observasi (demo)\n');

  await delStep('tabayyun (legacy)', db.from('tabayyun').delete({ count: 'exact' }).not('id', 'is', null));
  await delStep('observasi_kelas', db.from('observasi_kelas').delete({ count: 'exact' }).not('id', 'is', null));
  await delStep('checkin_pengajar (kelas_hits)', db.from('checkin_pengajar').delete({ count: 'exact' }).not('kelas_hits_id', 'is', null));
  await delStep('ketua_kelas (legacy, hits_halaqah_id null)', db.from('ketua_kelas').delete({ count: 'exact' }).is('hits_halaqah_id', null));
  await delStep('kelas_hits', db.from('kelas_hits').delete({ count: 'exact' }).not('id', 'is', null));

  console.log('\n✅ Selesai.\n');
}

run().catch((e) => { console.error(e); process.exit(1); });
