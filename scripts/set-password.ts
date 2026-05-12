/**
 * CLI untuk set password musyrif/koordinator.
 *
 * Cara pakai:
 *   pnpm set-password
 *
 * Akan tampil prompt interaktif:
 *   - Pilih role (musyrif / koordinator)
 *   - Pilih orang dari daftar
 *   - Input password baru
 *   - Konfirmasi password
 *
 * Password di-hash dengan bcrypt (cost 12) sebelum disimpan.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const BCRYPT_COST = 12;

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const role = (await rl.question('Role (musyrif/koordinator): ')).trim();
    if (role !== 'musyrif' && role !== 'koordinator') {
      throw new Error('Role harus "musyrif" atau "koordinator"');
    }

    const table = role;
    const query =
      role === 'musyrif'
        ? supabaseAdmin
            .from('musyrif')
            .select('id, name, whatsapp_number, gender')
            .eq('active', true)
            .order('name')
        : supabaseAdmin
            .from('koordinator')
            .select('id, name, whatsapp_number')
            .eq('active', true)
            .order('name');
    const { data: rows, error } = await query;

    if (error) throw error;
    if (!rows || rows.length === 0) {
      throw new Error(`Tidak ada ${role} aktif di database`);
    }

    console.log(`\nDaftar ${role}:`);
    rows.forEach((r: any, i: number) => {
      const g = r.gender ? ` [${r.gender}]` : '';
      console.log(`  ${i + 1}. ${r.name}${g} — ${r.whatsapp_number}`);
    });

    const idxStr = await rl.question('\nPilih nomor: ');
    const idx = parseInt(idxStr) - 1;
    if (isNaN(idx) || idx < 0 || idx >= rows.length) {
      throw new Error('Pilihan tidak valid');
    }
    const target = rows[idx];

    const password = await rl.question(
      `Password baru untuk ${target.name} (min 8 karakter): `
    );
    if (password.length < 8) {
      throw new Error('Password minimal 8 karakter');
    }

    const confirm = await rl.question('Konfirmasi password: ');
    if (password !== confirm) {
      throw new Error('Password tidak cocok');
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update({ password_hash: hash })
      .eq('id', target.id);

    if (updateError) throw updateError;

    console.log(`\n✓ Password untuk ${target.name} berhasil di-set.`);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('\n✗ Error:', err.message);
  process.exit(1);
});
