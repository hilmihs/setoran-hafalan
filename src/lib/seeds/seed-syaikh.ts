/**
 * Seed Syaikh + Ustadzah. Wipe + re-insert (idempotent).
 *
 * Default password: "password123" — ganti via /akun.
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp } from '@/lib/whatsapp';

const DEFAULT_PASSWORD = 'password123';

const SYAIKH = [
  { name: 'Ahmad Asy-Syahari', gender: 'ikhwan' as const, wa: '6282260747373' },
  { name: 'Radiatam Mardhiyah', gender: 'akhwat' as const, wa: '6281261306563' },
];

export async function runSeedSyaikh(log: (s: string) => void): Promise<void> {
  log('Hashing password default…');
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  log('Membersihkan data syaikh lama…');
  const { error: delErr } = await supabaseAdmin
    .from('syaikh')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw delErr;

  log('Insert syaikh…');
  const rows = SYAIKH.map((s) => ({
    name: s.name,
    gender: s.gender,
    whatsapp_number: normalizeWhatsApp(s.wa),
    password_hash: hash,
  }));
  const { data, error } = await supabaseAdmin
    .from('syaikh')
    .insert(rows)
    .select('id, name, gender, whatsapp_number');
  if (error) throw error;

  log(`✓ Selesai. ${data!.length} akun:`);
  for (const s of data!) {
    const titel = s.gender === 'ikhwan' ? 'Syaikh' : 'Ustadzah';
    log(`  • ${titel} ${s.name} (${s.whatsapp_number})`);
  }
  log(`Default password: "${DEFAULT_PASSWORD}" — ganti via /akun.`);
}
