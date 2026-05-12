/**
 * Backfill password_hash untuk semua peserta yang belum punya.
 * Jalankan SETELAH migration `0002_peserta_password.sql` di Supabase.
 *
 *   npm run seed-peserta-password
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const DEFAULT_PASSWORD = 'maahir123';

async function main() {
  console.log(`Hashing default password peserta ("${DEFAULT_PASSWORD}")…`);
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  console.log('Backfill peserta tanpa password…');
  const { data, error } = await supabaseAdmin
    .from('peserta')
    .update({ password_hash: hash })
    .is('password_hash', null)
    .select('id, name');
  if (error) throw error;

  console.log(`\n✓ ${data?.length ?? 0} peserta di-backfill.`);
  if (data && data.length > 0) {
    console.log(`Default password peserta: "${DEFAULT_PASSWORD}"`);
    console.log(`Peserta bisa ganti via halaman /akun setelah login.`);
  } else {
    console.log('(Semua peserta sudah punya password.)');
  }
}

main().catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
