/**
 * Seed dua koordinator (ikhwan + akhwat).
 *
 *   - Ahmad Abdus Syukur (ikhwan, 6285822950406)
 *   - Salma             (akhwat, 6282136573097)
 *
 * Wipes existing koordinator dummy, then inserts the real two.
 * Default password: "password123" — ganti via `npm run set-password`.
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { normalizeWhatsApp } from '../src/lib/whatsapp';

const DEFAULT_PASSWORD = 'password123';

const KOORDINATOR = [
  { name: 'Ahmad Abdus Syukur', gender: 'ikhwan' as const, wa: '6285822950406' },
  { name: 'Salma', gender: 'akhwat' as const, wa: '6282136573097' },
];

async function main() {
  console.log('Hashing password default…');
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  console.log('Membersihkan koordinator lama…');
  await supabaseAdmin
    .from('koordinator')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('Insert koordinator…');
  const rows = KOORDINATOR.map((k) => ({
    name: k.name,
    gender: k.gender,
    whatsapp_number: normalizeWhatsApp(k.wa),
    password_hash: hash,
  }));
  const { data, error } = await supabaseAdmin
    .from('koordinator')
    .insert(rows)
    .select('id, name, gender, whatsapp_number');
  if (error) throw error;

  console.log(`\n✓ Selesai. ${data!.length} koordinator:`);
  for (const k of data!) {
    console.log(`  • ${k.name} — ${k.gender} (${k.whatsapp_number})`);
  }
  console.log(`\nDefault password: "${DEFAULT_PASSWORD}" — ganti via "npm run set-password".`);
}

main().catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
