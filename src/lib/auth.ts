'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from './supabase-admin';
import { getSession } from './session';
import { normalizeWhatsApp } from './whatsapp';

const BCRYPT_COST = 12;

/**
 * Unified login: cari nomor WA berurutan di peserta → musyrif → koordinator.
 * Set session sesuai role yang ketemu, lalu redirect ke landing role tsb.
 */
export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string } | undefined> {
  const wa = normalizeWhatsApp(String(formData.get('whatsapp_number') ?? ''));
  const password = String(formData.get('password') ?? '');
  if (!wa || !password) {
    return { error: 'Nomor WA dan password wajib diisi.' };
  }

  // 1. Peserta
  const { data: peserta } = await supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas_id, password_hash, active')
    .eq('whatsapp_number', wa)
    .maybeSingle();
  if (peserta && peserta.active && peserta.password_hash) {
    const ok = await bcrypt.compare(password, peserta.password_hash);
    if (ok) {
      const s = await getSession();
      s.session = {
        role: 'peserta',
        peserta_id: peserta.id,
        name: peserta.name,
        gender: peserta.gender,
        kelas_id: peserta.kelas_id,
      };
      await s.save();
      redirect('/peserta');
    }
  }

  // 2. Musyrif
  const { data: musyrif } = await supabaseAdmin
    .from('musyrif')
    .select('id, name, gender, password_hash, active')
    .eq('whatsapp_number', wa)
    .maybeSingle();
  if (musyrif && musyrif.active) {
    const ok = await bcrypt.compare(password, musyrif.password_hash);
    if (ok) {
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
  }

  // 3. Koordinator
  const { data: koor } = await supabaseAdmin
    .from('koordinator')
    .select('id, name, password_hash, active')
    .eq('whatsapp_number', wa)
    .maybeSingle();
  if (koor && koor.active) {
    const ok = await bcrypt.compare(password, koor.password_hash);
    if (ok) {
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
  }

  return { error: 'Nomor WA atau password salah.' };
}

export async function logout() {
  const s = await getSession();
  s.destroy();
  redirect('/');
}

/**
 * Ganti password untuk role yang sedang login.
 */
export async function changePassword(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const current = String(formData.get('current_password') ?? '');
  const next = String(formData.get('new_password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');

  if (next.length < 6) {
    return { error: 'Password baru minimal 6 karakter.' };
  }
  if (next !== confirm) {
    return { error: 'Konfirmasi password tidak cocok.' };
  }

  const s = await getSession();
  if (!s.session) return { error: 'Anda belum login.' };

  const { table, id } =
    s.session.role === 'peserta'
      ? { table: 'peserta' as const, id: s.session.peserta_id }
      : s.session.role === 'musyrif'
        ? { table: 'musyrif' as const, id: s.session.musyrif_id }
        : { table: 'koordinator' as const, id: s.session.koordinator_id };

  const { data: row } = await supabaseAdmin
    .from(table)
    .select('password_hash')
    .eq('id', id)
    .maybeSingle();
  if (!row || !row.password_hash) {
    return { error: 'Akun tidak ditemukan.' };
  }

  const ok = await bcrypt.compare(current, row.password_hash);
  if (!ok) return { error: 'Password saat ini salah.' };

  const hash = await bcrypt.hash(next, BCRYPT_COST);
  const { error: upErr } = await supabaseAdmin
    .from(table)
    .update({ password_hash: hash })
    .eq('id', id);
  if (upErr) return { error: `Gagal simpan: ${upErr.message}` };

  return { ok: true };
}
