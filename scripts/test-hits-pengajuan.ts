/**
 * Test data-layer inbox pengajuan HITS (lawan DB nyata).
 *   npm run test-pengajuan
 *
 * Verifikasi: hitung per jenis cocok dgn count DB; invarian shape;
 * urutan pending (konflik dulu, lalu terlama).
 */
import { getHitsPengajuan, countByJenis, JENIS_ORDER } from '../src/lib/hits-pengajuan';
import { supabaseAdmin } from '../src/lib/supabase-admin';

async function dbCount(table: string, pending: boolean): Promise<number> {
  const q = supabaseAdmin.from(table).select('id');
  const { data } = await (pending ? q.eq('status', 'pending') : q.neq('status', 'pending'));
  return (data ?? []).length;
}

const TABLE: Record<string, string> = {
  pindah: 'hits_halaqah_pindah_request',
  hapus: 'hits_pertemuan_hapus_request',
  koreksi: 'hits_pertemuan_koreksi',
  dual: 'ketua_dualrole_request',
};

async function main() {
  let ok = true;

  const pend = await getHitsPengajuan('pending');
  const c = countByJenis(pend);
  for (const j of JENIS_ORDER) {
    const expect = await dbCount(TABLE[j], true);
    const pass = c[j] === expect;
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} pending ${j}: lib=${c[j]} db=${expect}`);
  }

  for (const r of pend) {
    if (r.token && !r.decideHref) {
      ok = false;
      console.log(`✗ ada token tapi tak ada decideHref: ${r.jenis} ${r.id}`);
    }
    if (r.ageDays < 0) {
      ok = false;
      console.log(`✗ umur negatif: ${r.jenis} ${r.id}`);
    }
  }

  const firstNonConflict = pend.findIndex((r) => !r.conflict);
  const lastConflict = pend.map((r) => !!r.conflict).lastIndexOf(true);
  if (firstNonConflict !== -1 && lastConflict !== -1 && lastConflict > firstNonConflict) {
    ok = false;
    console.log('✗ urutan konflik salah (ada konflik setelah non-konflik)');
  }

  console.log(`konflik terdeteksi: ${pend.filter((r) => r.conflict).length}`);
  console.log(`total pending: ${pend.length}`);

  const dec = await getHitsPengajuan('decided');
  console.log(`total riwayat: ${dec.length}`);
  if (dec.some((r) => r.status === 'pending')) {
    ok = false;
    console.log('✗ riwayat memuat baris pending');
  }

  console.log(ok ? 'PASS' : 'FAIL');
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
