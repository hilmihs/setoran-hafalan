/**
 * Diagnostik READ-ONLY: cadence jadwal per batch + status kaldik.
 *   npm run diag-hits-cadence
 *
 * Tujuan:
 *  - Lihat batch mana yang kaldik_hari-nya masih kosong (target seed).
 *  - Cek risiko generalisasi derivasi: adakah batch LAMA (sudah punya kaldik)
 *    yang halaqahnya jadwal 1 hari/pekan (atau >2) — kalau ada, numbering-nya
 *    bakal geser. Kalau semua batch berkaldik hanya 2 hari/pekan → aman total.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  const { data: batches, error } = await sb
    .from('hits_batch')
    .select('id,name,slug,start_date,active')
    .order('start_date', { ascending: true });
  if (error) throw error;

  const risky: string[] = [];
  for (const b of batches ?? []) {
    const { data: hal } = await sb
      .from('hits_halaqah')
      .select('name,level,jadwal_hari,active')
      .eq('batch_id', b.id);
    const { count: kaldik } = await sb
      .from('hits_kaldik_hari')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', b.id);

    const lenDist: Record<number, number> = {};
    const nonTwo: string[] = [];
    for (const h of hal ?? []) {
      const L = (h.jadwal_hari ?? []).length;
      lenDist[L] = (lenDist[L] ?? 0) + 1;
      if (L !== 2) nonTwo.push(`${h.name}(${L}d)`);
    }
    console.log(`\n[${b.slug}] ${b.name}`);
    console.log(`  start=${b.start_date} active=${b.active} halaqah=${hal?.length ?? 0} kaldik_rows=${kaldik ?? 0} jadwalLen=${JSON.stringify(lenDist)}`);
    if (nonTwo.length) console.log(`  ⚠ non-2-hari: ${nonTwo.slice(0, 10).join(', ')}${nonTwo.length > 10 ? ' …' : ''}`);
    if ((kaldik ?? 0) > 0 && nonTwo.length) risky.push(`${b.slug} (${nonTwo.length} halaqah)`);
  }

  console.log('\n──────── RINGKASAN ────────');
  const empty = (batches ?? []).length; // recount below via second pass omitted for brevity
  console.log(`Batch total: ${batches?.length ?? 0}`);
  if (risky.length) {
    console.log(`❌ RISIKO numbering geser (batch berkaldik + halaqah non-2-hari):`);
    for (const r of risky) console.log(`   - ${r}`);
  } else {
    console.log(`✅ Aman: tidak ada batch berkaldik dengan halaqah 1-hari/>2-hari. Generalisasi tidak mengubah numbering data lama.`);
  }
  void empty;
}

main().catch((e) => { console.error(e); process.exit(1); });
