// Apply satu file migration ke DB yang ditunjuk DATABASE_URL (poolExec langsung).
// JANGAN pakai `npm run db` untuk migration — itu menembak PRODUKSI (HTTP admin).
// Jalankan: npm run apply-migration -- supabase/migrations/0052_evaluasi_sync.sql
import { readFileSync } from 'node:fs';
import { poolExec } from '../src/lib/pg-core';

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: npm run apply-migration -- <path.sql>'); process.exit(2); }
  const sql = readFileSync(file, 'utf8');
  console.log(`▶ apply ${file} ke DATABASE_URL dev …`);
  await poolExec(sql);
  console.log('✓ selesai');
}
main().catch((e) => { console.error('✗', e); process.exit(1); });
