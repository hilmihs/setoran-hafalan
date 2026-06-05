'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from './supabase-admin';
import { getSession } from './session';
import { normalizeWhatsApp } from './whatsapp';
import type { RoleAccess } from '@/types/db';
import { ROLE_LANDING } from './roles';

const BCRYPT_COST = 12;

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string } | undefined> {
  const wa = normalizeWhatsApp(String(formData.get('whatsapp_number') ?? ''));
  const password = String(formData.get('password') ?? '');
  if (!wa || !password) {
    return { error: 'Nomor WA dan password wajib diisi.' };
  }

  const [
    { data: peserta },
    { data: musyrif },
    { data: koor },
    { data: syaikh },
    { data: pengajar },
    { data: koorHits },
    { data: ketuaKelas },
    { data: koorKK },
  ] = await Promise.all([
    supabaseAdmin
      .from('peserta')
      .select('id, name, gender, kelas_id, password_hash, active')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
    supabaseAdmin
      .from('musyrif')
      .select('id, name, gender, password_hash, active')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
    supabaseAdmin
      .from('koordinator')
      .select('id, name, gender, password_hash, active')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
    supabaseAdmin
      .from('syaikh')
      .select('id, name, gender, password_hash, active')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
    supabaseAdmin
      .from('pengajar')
      .select('id, name, gender, password_hash, active, kelompok_id, is_ketua')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
    supabaseAdmin
      .from('koordinator_hits')
      .select('id, name, gender, password_hash, active')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
    supabaseAdmin
      .from('ketua_kelas')
      .select('id, name, gender, password_hash, active, kelas_hits_id')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
    supabaseAdmin
      .from('koordinator_ketua_kelas')
      .select('id, name, gender, password_hash, active')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
  ]);

  const accesses: RoleAccess[] = [];

  async function tryRole(
    row: { active: boolean; password_hash: string } | null,
    buildAccess: () => RoleAccess,
    table?: string,
    id?: string
  ): Promise<void> {
    if (!row || !row.active || !row.password_hash) return;
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return;
    accesses.push(buildAccess());
    if (table && id) {
      await supabaseAdmin
        .from(table)
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', id);
    }
  }

  await Promise.all([
    tryRole(peserta, () => ({
      role: 'peserta' as const,
      peserta_id: peserta!.id,
      name: peserta!.name,
      gender: peserta!.gender,
      kelas_id: peserta!.kelas_id,
    })),
    tryRole(
      musyrif,
      () => ({
        role: 'musyrif' as const,
        musyrif_id: musyrif!.id,
        name: musyrif!.name,
        gender: musyrif!.gender,
      }),
      'musyrif',
      musyrif?.id
    ),
    tryRole(
      koor,
      () => ({
        role: 'koordinator' as const,
        koordinator_id: koor!.id,
        name: koor!.name,
        gender: koor!.gender,
      }),
      'koordinator',
      koor?.id
    ),
    tryRole(
      syaikh,
      () => ({
        role: 'syaikh' as const,
        syaikh_id: syaikh!.id,
        name: syaikh!.name,
        gender: syaikh!.gender,
      }),
      'syaikh',
      syaikh?.id
    ),
    tryRole(
      pengajar,
      () => ({
        role: 'pengajar' as const,
        pengajar_id: pengajar!.id,
        name: pengajar!.name,
        gender: pengajar!.gender,
        kelompok_id: pengajar!.kelompok_id,
        is_ketua: pengajar!.is_ketua,
      }),
      'pengajar',
      pengajar?.id
    ),
    tryRole(
      koorHits,
      () => ({
        role: 'koordinator_hits' as const,
        koordinator_hits_id: koorHits!.id,
        name: koorHits!.name,
        gender: koorHits!.gender,
      }),
      'koordinator_hits',
      koorHits?.id
    ),
    tryRole(
      ketuaKelas,
      () => ({
        role: 'ketua_kelas' as const,
        ketua_kelas_id: ketuaKelas!.id,
        name: ketuaKelas!.name,
        gender: ketuaKelas!.gender,
        kelas_hits_id: ketuaKelas!.kelas_hits_id,
      }),
      'ketua_kelas',
      ketuaKelas?.id
    ),
    tryRole(
      koorKK,
      () => ({
        role: 'koordinator_ketua_kelas' as const,
        koordinator_kk_id: koorKK!.id,
        name: koorKK!.name,
        gender: koorKK!.gender,
      }),
      'koordinator_ketua_kelas',
      koorKK?.id
    ),
  ]);

  if (accesses.length === 0) {
    return { error: 'Nomor WA atau password salah.' };
  }

  const s = await getSession();
  s.session = accesses[0];
  s.accesses = accesses;
  await s.save();

  if (accesses.length === 1) {
    redirect(ROLE_LANDING[accesses[0].role]);
  }
  redirect('/');
}

export async function switchRole(role: RoleAccess['role']) {
  const s = await getSession();
  if (!s.accesses) throw new Error('UNAUTHORIZED');
  const match = s.accesses.find((a) => a.role === role);
  if (!match) throw new Error('UNAUTHORIZED');
  s.session = match;
  await s.save();
  redirect(ROLE_LANDING[role]);
}

export async function logout() {
  const s = await getSession();
  s.destroy();
  redirect('/');
}

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

  const session = s.session;
  const roleTable = getRoleTable(session);
  if (!roleTable) return { error: 'Role tidak dikenali.' };

  const { data: row } = await supabaseAdmin
    .from(roleTable.table)
    .select('password_hash')
    .eq('id', roleTable.id)
    .maybeSingle();
  if (!row || !row.password_hash) {
    return { error: 'Akun tidak ditemukan.' };
  }

  const ok = await bcrypt.compare(current, row.password_hash);
  if (!ok) return { error: 'Password saat ini salah.' };

  const hash = await bcrypt.hash(next, BCRYPT_COST);

  // Update password di semua tabel yang cocok WA-nya
  const { data: waRow } = await supabaseAdmin
    .from(roleTable.table)
    .select('whatsapp_number')
    .eq('id', roleTable.id)
    .maybeSingle();
  if (!waRow) return { error: 'Akun tidak ditemukan.' };
  const waNum = waRow.whatsapp_number;

  const tables = [
    'peserta', 'musyrif', 'koordinator', 'syaikh',
    'pengajar', 'koordinator_hits', 'ketua_kelas', 'koordinator_ketua_kelas',
  ] as const;

  await Promise.all(
    tables.map((t) =>
      supabaseAdmin
        .from(t)
        .update({ password_hash: hash })
        .eq('whatsapp_number', waNum)
    )
  );

  return { ok: true };
}

function getRoleTable(
  session: RoleAccess
): { table: string; id: string } | null {
  switch (session.role) {
    case 'peserta':
      return { table: 'peserta', id: session.peserta_id };
    case 'musyrif':
      return { table: 'musyrif', id: session.musyrif_id };
    case 'koordinator':
      return { table: 'koordinator', id: session.koordinator_id };
    case 'syaikh':
      return { table: 'syaikh', id: session.syaikh_id };
    case 'pengajar':
      return { table: 'pengajar', id: session.pengajar_id };
    case 'koordinator_hits':
      return { table: 'koordinator_hits', id: session.koordinator_hits_id };
    case 'ketua_kelas':
      return { table: 'ketua_kelas', id: session.ketua_kelas_id };
    case 'koordinator_ketua_kelas':
      return { table: 'koordinator_ketua_kelas', id: session.koordinator_kk_id };
    default:
      return null;
  }
}

