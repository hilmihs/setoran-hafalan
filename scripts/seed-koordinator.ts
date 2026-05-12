/**
 * Set koordinator real: Ahmad Abdus Syukur.
 *
 * Wipes existing koordinator dummy, then inserts the real one.
 * Default password: "password123" — ganti via `npm run set-password`.
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { normalizeWhatsApp } from '../src/lib/whatsapp';

const DEFAULT_PASSWORD = 'password123';

const KOORDINATOR = {
  name: 'Ahmad Abdus Syukur',
  wa: '6285822950406',
};

async function main() {
  console.log('Hashing password default…');
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  console.log('Membersihkan koordinator lama…');
  await supabaseAdmin
    .from('koordinator')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('Insert koordinator…');
  const { data, error } = await supabaseAdmin
    .from('koordinator')
    .insert({
      name: KOORDINATOR.name,
      whatsapp_number: normalizeWhatsApp(KOORDINATOR.wa),
      password_hash: hash,
    })
    .select('id, name, whatsapp_number')
    .single();
  if (error) throw error;

  console.log(`\n✓ Selesai.`);
  console.log(`  Nama: ${data.name}`);
  console.log(`  WA:   ${data.whatsapp_number}`);
  console.log(`  Password default: "${DEFAULT_PASSWORD}" — ganti via "npm run set-password"`);
}

main().catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
