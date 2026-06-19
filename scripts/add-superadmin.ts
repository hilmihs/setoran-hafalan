import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { normalizeWhatsApp } from '../src/lib/whatsapp';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const NAME = 'Hilmi';
const GENDER = 'ikhwan';
const WA_RAW = '081399741809';
const PASSWORD = 'permatakopo52';

async function main() {
  const wa = normalizeWhatsApp(WA_RAW);
  const hash = await bcrypt.hash(PASSWORD, 12);
  console.log(`Setting up superadmin: ${NAME} (${wa})\n`);

  // 1. Update pengajar password + jadikan ketua kelompok (already exists from seed)
  const { error: e1 } = await supabaseAdmin
    .from('pengajar')
    .update({ password_hash: hash, is_ketua: true })
    .eq('whatsapp_number', wa);
  console.log(e1 ? `✗ pengajar update: ${e1.message}` : '✓ pengajar password updated + is_ketua=true');

  // 2. Insert into koordinator (2in1)
  const { error: e2 } = await supabaseAdmin
    .from('koordinator')
    .upsert({ name: NAME, gender: GENDER, whatsapp_number: wa, password_hash: hash }, { onConflict: 'whatsapp_number', ignoreDuplicates: true });
  console.log(e2 ? `✗ koordinator: ${e2.message}` : '✓ koordinator inserted');

  // 3. Insert into musyrif (2in1)
  const { error: e3 } = await supabaseAdmin
    .from('musyrif')
    .insert({ name: NAME, gender: GENDER, whatsapp_number: wa, password_hash: hash });
  console.log(e3 ? `✗ musyrif: ${e3.message}` : '✓ musyrif inserted');

  // 4. Insert into syaikh (2in1)
  const { error: e4 } = await supabaseAdmin
    .from('syaikh')
    .insert({ name: NAME, gender: GENDER, whatsapp_number: wa, password_hash: hash });
  console.log(e4 ? `✗ syaikh: ${e4.message}` : '✓ syaikh inserted');

  // 5. Insert into koordinator_ketua_kelas
  const { error: e6 } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .insert({ name: NAME, gender: GENDER, whatsapp_number: wa, password_hash: hash });
  console.log(e6 ? `✗ koordinator_ketua_kelas: ${e6.message}` : '✓ koordinator_ketua_kelas inserted');

  console.log('\n✅ Superadmin setup complete!');
  console.log(`Login: ${WA_RAW} / ${PASSWORD}`);
  console.log('Roles: pengajar, koordinator, musyrif, syaikh, koordinator_ketua_kelas');
}

main().catch(console.error);
