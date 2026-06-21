'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from './supabase-admin';
import { getSession } from './session';
import { normalizeWhatsApp } from './whatsapp';
import type { RoleAccess } from '@/types/db';
import { ROLE_LANDING } from './roles';
import { logLogins, logLogout } from './session-log';

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
      .from('ketua_kelas')
      .select('id, name, gender, password_hash, active, kelas_hits_id, hits_halaqah_id')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
    supabaseAdmin
      .from('koordinator_ketua_kelas')
      .select('id, name, gender, password_hash, active')
      .eq('whatsapp_number', wa)
      .maybeSingle(),
  ]);

  type Candidate = {
    row: { active: boolean; password_hash: string; id: string } | null;
    build: () => RoleAccess;
    table: 'peserta' | 'musyrif' | 'koordinator' | 'syaikh' | 'pengajar' | 'ketua_kelas' | 'koordinator_ketua_kelas';
    trackLastLogin: boolean;
  };

  const candidates: Candidate[] = [
    {
      row: peserta,
      build: () => ({
        role: 'peserta' as const,
        peserta_id: peserta!.id,
        name: peserta!.name,
        gender: peserta!.gender,
        kelas_id: peserta!.kelas_id,
      }),
      table: 'peserta',
      trackLastLogin: false,
    },
    {
      row: musyrif,
      build: () => ({
        role: 'musyrif' as const,
        musyrif_id: musyrif!.id,
        name: musyrif!.name,
        gender: musyrif!.gender,
      }),
      table: 'musyrif',
      trackLastLogin: true,
    },
    {
      row: koor,
      build: () => ({
        role: 'koordinator' as const,
        koordinator_id: koor!.id,
        name: koor!.name,
        gender: koor!.gender,
      }),
      table: 'koordinator',
      trackLastLogin: true,
    },
    {
      row: syaikh,
      build: () => ({
        role: 'syaikh' as const,
        syaikh_id: syaikh!.id,
        name: syaikh!.name,
        gender: syaikh!.gender,
      }),
      table: 'syaikh',
      trackLastLogin: true,
    },
    {
      row: pengajar,
      build: () => ({
        role: 'pengajar' as const,
        pengajar_id: pengajar!.id,
        name: pengajar!.name,
        gender: pengajar!.gender,
        kelompok_id: pengajar!.kelompok_id,
        is_ketua: pengajar!.is_ketua,
      }),
      table: 'pengajar',
      trackLastLogin: true,
    },
    {
      row: ketuaKelas,
      build: () => ({
        role: 'ketua_kelas' as const,
        ketua_kelas_id: ketuaKelas!.id,
        name: ketuaKelas!.name,
        gender: ketuaKelas!.gender,
        kelas_hits_id: ketuaKelas!.kelas_hits_id,
        hits_halaqah_id: ketuaKelas!.hits_halaqah_id ?? null,
      }),
      table: 'ketua_kelas',
      trackLastLogin: true,
    },
    {
      row: koorKK,
      build: () => ({
        role: 'koordinator_ketua_kelas' as const,
        koordinator_kk_id: koorKK!.id,
        name: koorKK!.name,
        gender: koorKK!.gender,
      }),
      table: 'koordinator_ketua_kelas',
      trackLastLogin: true,
    },
  ];

  // Step 1: gate. Minimal satu row aktif yang hash-nya match password.
  const matchFlags = await Promise.all(
    candidates.map(async (c) => {
      if (!c.row || !c.row.active || !c.row.password_hash) return false;
      return bcrypt.compare(password, c.row.password_hash);
    })
  );

  if (!matchFlags.some(Boolean)) {
    return { error: 'Nomor WA atau password salah.' };
  }

  // Step 2: unlock semua row aktif untuk WA ini. Hash bakal disinkron di Step 3 jadi
  // semantically valid password untuk WA = akses ke semua role.
  const accesses: RoleAccess[] = candidates
    .filter((c) => c.row && c.row.active && c.row.password_hash)
    .map((c) => c.build());

  // Step 3: sync hash + stamp last_login_at untuk role yang match.
  const correctHash = await bcrypt.hash(password, BCRYPT_COST);
  const tables = [
    'peserta', 'musyrif', 'koordinator', 'syaikh',
    'pengajar', 'ketua_kelas', 'koordinator_ketua_kelas',
  ] as const;
  const nowIso = new Date().toISOString();
  await Promise.all([
    ...tables.map((t) =>
      supabaseAdmin
        .from(t)
        .update({ password_hash: correctHash })
        .eq('whatsapp_number', wa)
    ),
    ...candidates
      .map((c, i) => ({ c, matched: matchFlags[i] }))
      .filter(({ c, matched }) => matched && c.trackLastLogin && c.row)
      .map(({ c }) =>
        supabaseAdmin
          .from(c.table)
          .update({ last_login_at: nowIso })
          .eq('id', c.row!.id)
      ),
  ]);

  const s = await getSession();
  s.session = accesses[0];
  s.accesses = accesses;
  await s.save();

  void logLogins({ accesses });

  // Redirect ke halaman tujuan (returnTo) bila valid & relatif, else landing role.
  const nextRaw = String(formData.get('next') ?? '');
  const safeNext = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null;
  redirect(safeNext ?? ROLE_LANDING[accesses[0].role] ?? '/');
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
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (accesses.length) await logLogout(accesses);
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
    .select('password_hash, whatsapp_number')
    .eq('id', roleTable.id)
    .maybeSingle();
  if (!row || !row.password_hash) {
    return { error: 'Akun tidak ditemukan.' };
  }

  const ok = await bcrypt.compare(current, row.password_hash);
  if (!ok) return { error: 'Password saat ini salah.' };

  const hash = await bcrypt.hash(next, BCRYPT_COST);
  const waNum = row.whatsapp_number;

  const tables = [
    'peserta', 'musyrif', 'koordinator', 'syaikh',
    'pengajar', 'ketua_kelas', 'koordinator_ketua_kelas',
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
    case 'ketua_kelas':
      return { table: 'ketua_kelas', id: session.ketua_kelas_id };
    case 'koordinator_ketua_kelas':
      return { table: 'koordinator_ketua_kelas', id: session.koordinator_kk_id };
    default:
      return null;
  }
}

