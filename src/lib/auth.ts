'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from './supabase-admin';
import { getSession } from './session';
import { normalizeWhatsApp } from './whatsapp';

export async function loginMusyrif(_prev: unknown, formData: FormData) {
  const wa = normalizeWhatsApp(String(formData.get('whatsapp_number') ?? ''));
  const password = String(formData.get('password') ?? '');
  if (!wa || !password) {
    return { error: 'Nomor WA dan password wajib diisi.' };
  }
  const { data: musyrif } = await supabaseAdmin
    .from('musyrif')
    .select('id, name, gender, whatsapp_number, password_hash, active')
    .eq('whatsapp_number', wa)
    .maybeSingle();
  if (!musyrif || !musyrif.active) {
    return { error: 'Nomor WA tidak ditemukan atau akun nonaktif.' };
  }
  const ok = await bcrypt.compare(password, musyrif.password_hash);
  if (!ok) return { error: 'Password salah.' };

  await supabaseAdmin
    .from('musyrif')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', musyrif.id);

  const s = await getSession();
  s.session = {
    role: 'musyrif',
    musyrif_id: musyrif.id,
    name: musyrif.name,
    gender: musyrif.gender,
  };
  await s.save();
  redirect('/musyrif');
}

export async function loginKoordinator(_prev: unknown, formData: FormData) {
  const wa = normalizeWhatsApp(String(formData.get('whatsapp_number') ?? ''));
  const password = String(formData.get('password') ?? '');
  if (!wa || !password) {
    return { error: 'Nomor WA dan password wajib diisi.' };
  }
  const { data: koor } = await supabaseAdmin
    .from('koordinator')
    .select('id, name, whatsapp_number, password_hash, active')
    .eq('whatsapp_number', wa)
    .maybeSingle();
  if (!koor || !koor.active) {
    return { error: 'Nomor WA tidak ditemukan atau akun nonaktif.' };
  }
  const ok = await bcrypt.compare(password, koor.password_hash);
  if (!ok) return { error: 'Password salah.' };

  await supabaseAdmin
    .from('koordinator')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', koor.id);

  const s = await getSession();
  s.session = {
    role: 'koordinator',
    koordinator_id: koor.id,
    name: koor.name,
  };
  await s.save();
  redirect('/koordinator');
}

export async function logout() {
  const s = await getSession();
  s.destroy();
  redirect('/');
}
