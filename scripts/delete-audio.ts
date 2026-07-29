/**
 * delete-audio.ts — HAPUS PERMANEN semua objek audio di bucket Supabase.
 *
 * TUJUAN: mengosongkan storage (~4.8 GB) supaya project Supabase turun di bawah
 * kuota free tier (1 GB) dan restriction (exceed_storage_size_quota) terangkat.
 *
 * ⚠️ IRREVERSIBLE. TIDAK ADA BACKUP. 608 rekaman akan HILANG selamanya.
 *
 * Dijalankan MANUAL oleh pemilik project (bukan otomatis). Wajib konfirmasi:
 *   CONFIRM_DELETE=HAPUS-SEMUA-AUDIO npm run delete-audio
 *
 * Pakai service-role key di .env.local. Catatan: kalau project sedang restricted,
 * Storage API BISA menolak (blokir). Kalau gagal, hapus lewat Dashboard:
 *   Supabase → project → Storage → bucket setoran-audio → pilih semua → Delete
 *   (atau hapus bucket-nya).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_AUDIO_BUCKET ?? 'setoran-audio';
const CONFIRM = 'HAPUS-SEMUA-AUDIO';

if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY di .env.local');
if (process.env.CONFIRM_DELETE !== CONFIRM) {
  console.error(
    `TOLAK: konfirmasi wajib. Ini menghapus SEMUA audio PERMANEN, tanpa backup.\n` +
      `Jalankan ulang persis:\n  CONFIRM_DELETE=${CONFIRM} npm run delete-audio`
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PAGE = 1000;

type Obj = { path: string };
async function listAll(prefix = ''): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...(await listAll(full)));
      else out.push({ path: full });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  console.log(`Mendata objek di bucket "${bucket}" ...`);
  const objs = await listAll();
  console.log(`Ditemukan ${objs.length} objek. Menghapus (batch 100) ...`);
  let deleted = 0;
  for (let i = 0; i < objs.length; i += 100) {
    const batch = objs.slice(i, i + 100).map((o) => o.path);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw new Error(`remove batch @${i}: ${error.message}`);
    deleted += batch.length;
    console.log(`  ... ${deleted}/${objs.length}`);
  }
  console.log(`Selesai: ${deleted} objek dihapus. Cek Dashboard — usage harus turun.`);
  console.log(`Restriction bisa perlu beberapa menit untuk terangkat setelah usage < kuota.`);
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  console.error('Kalau ini karena project restricted (Storage API diblokir), hapus via Dashboard Supabase.');
  process.exit(1);
});
