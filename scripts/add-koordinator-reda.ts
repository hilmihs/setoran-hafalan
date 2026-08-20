/**
 * Tambah koordinator baru (additive, tidak menghapus data lain).
 * Reda — akses sama seperti Ustadzah Salma (koordinator akhwat / Maahir).
 *
 * Default password: "password123" — ganti via `npm run set-password`.
 *   npx tsx --env-file=.env.local scripts/add-koordinator-reda.ts
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { normalizeWhatsApp } from '../src/lib/whatsapp';

const DEFAULT_PASSWORD = 'password123';

const REDA = {
  name: 'Reda',
  gender: 'akhwat' as const, // scope sama seperti Salma (Maahir akhwat)
  wa: '6281261306563',
};

async function main() {
  const wa = normalizeWhatsApp(REDA.wa);

  const { data: existing } = await supabaseAdmin
    .from('koordinator')
    .select('id, name, gender, whatsapp_number')
    .eq('whatsapp_number', wa)
    .maybeSingle();
  if (existing) {
    console.log(`⊘ Sudah ada koordinator dengan WA ${wa}: ${existing.name} (${existing.gender}) — tidak insert ulang.`);
    return;
  }

  console.log('Hashing password default…');
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const { data, error } = await supabaseAdmin
    .from('koordinator')
    .insert({
      name: REDA.name,
      gender: REDA.gender,
      whatsapp_number: wa,
      password_hash: hash,
    })
    .select('id, name, gender, whatsapp_number')
    .single();
  if (error) throw error;

  console.log(`\n✓ Koordinator dibuat:`);
  console.log(`  • ${data.name} — ${data.gender} (${data.whatsapp_number})`);
  console.log(`\nDefault password: "${DEFAULT_PASSWORD}" — ganti via "npm run set-password".`);
}

main().catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
