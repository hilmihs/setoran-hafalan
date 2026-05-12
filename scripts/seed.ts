/**
 * Seed data dummy untuk development.
 *
 * Cara pakai:
 *   pnpm seed
 *
 * Akan membuat:
 *   - 1 koordinator
 *   - 2 musyrif (1 ikhwan, 1 akhwat)
 *   - 2 kelas (A ikhwan, A akhwat)
 *   - 6 peserta (3 ikhwan, 3 akhwat)
 *
 * Password default semua user: "password123" (HARAP diganti setelah seed via set-password).
 *
 * Re-run aman — script ini akan delete data lama dulu via cascade.
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const DEFAULT_PASSWORD = 'password123';

async function main() {
  console.log('Hashing default password…');
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  console.log('Membersihkan data lama…');
  // Order penting karena ada FK constraint
  await supabaseAdmin.from('rekaman').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('setoran').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('peserta').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('kelas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('musyrif').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('koordinator').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('Insert koordinator…');
  const { data: koor, error: koorErr } = await supabaseAdmin
    .from('koordinator')
    .insert({
      name: 'Koordinator Hafalan',
      whatsapp_number: '6281200000001',
      password_hash: hash,
    })
    .select()
    .single();
  if (koorErr) throw koorErr;

  console.log('Insert musyrif…');
  const { data: musyrif, error: mErr } = await supabaseAdmin
    .from('musyrif')
    .insert([
      {
        name: 'Ustadz Ahmad',
        gender: 'ikhwan',
        whatsapp_number: '6281200000002',
        password_hash: hash,
      },
      {
        name: 'Ustadzah Fatimah',
        gender: 'akhwat',
        whatsapp_number: '6281200000003',
        password_hash: hash,
      },
    ])
    .select();
  if (mErr) throw mErr;
  const ustAhmad = musyrif!.find((m) => m.gender === 'ikhwan')!;
  const ustFatimah = musyrif!.find((m) => m.gender === 'akhwat')!;

  console.log('Insert kelas…');
  const { data: kelas, error: kErr } = await supabaseAdmin
    .from('kelas')
    .insert([
      { name: 'A', gender: 'ikhwan', musyrif_id: ustAhmad.id },
      { name: 'A', gender: 'akhwat', musyrif_id: ustFatimah.id },
    ])
    .select();
  if (kErr) throw kErr;
  const kelasIkhwanA = kelas!.find((k) => k.gender === 'ikhwan')!;
  const kelasAkhwatA = kelas!.find((k) => k.gender === 'akhwat')!;

  console.log('Insert peserta…');
  const { error: pErr } = await supabaseAdmin.from('peserta').insert([
    { name: 'Abdullah', gender: 'ikhwan', kelas_id: kelasIkhwanA.id, whatsapp_number: '6281200000010' },
    { name: 'Bilal',    gender: 'ikhwan', kelas_id: kelasIkhwanA.id, whatsapp_number: '6281200000011' },
    { name: 'Umar',     gender: 'ikhwan', kelas_id: kelasIkhwanA.id, whatsapp_number: '6281200000012' },
    { name: 'Aisyah',   gender: 'akhwat', kelas_id: kelasAkhwatA.id, whatsapp_number: '6281200000020' },
    { name: 'Khadijah', gender: 'akhwat', kelas_id: kelasAkhwatA.id, whatsapp_number: '6281200000021' },
    { name: 'Maryam',   gender: 'akhwat', kelas_id: kelasAkhwatA.id, whatsapp_number: '6281200000022' },
  ]);
  if (pErr) throw pErr;

  console.log('\n✓ Seed selesai.');
  console.log(`  Koordinator: ${koor!.name} (WA: ${koor!.whatsapp_number})`);
  console.log(`  Musyrif ikhwan: ${ustAhmad.name}`);
  console.log(`  Musyrif akhwat: ${ustFatimah.name}`);
  console.log(`  Default password semua user: "${DEFAULT_PASSWORD}"`);
  console.log(`  ⚠ Jalankan "pnpm set-password" untuk ganti password production.`);
}

main().catch((err) => {
  console.error('\n✗ Seed error:', err);
  process.exit(1);
});
