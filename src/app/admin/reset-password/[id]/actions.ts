'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildWaMeUrl } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { generateReadablePassword } from '@/lib/random-password';
import { requireAdmin } from '@/lib/admin-guard';

const BCRYPT_COST = 12;

const ROLE_TABLES = [
  'peserta',
  'musyrif',
  'koordinator',
  'syaikh',
  'pengajar',
  'koordinator_hits',
  'ketua_kelas',
  'koordinator_ketua_kelas',
] as const;

type AcceptState = {
  error?: string;
  password?: string;
  waMeUrl?: string;
};

type DeclineState = {
  error?: string;
  ok?: boolean;
};

export async function acceptResetRequest(
  _prev: AcceptState | undefined,
  formData: FormData
): Promise<AcceptState> {
  const { wa: adminWa } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ID permintaan tidak valid.' };

  const { data: req, error: fetchErr } = await supabaseAdmin
    .from('password_reset_requests')
    .select('id, whatsapp_number, requester_name, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !req) return { error: 'Permintaan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Permintaan sudah diproses.' };

  const newPassword = generateReadablePassword(10);
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);

  // Sync hash ke semua 8 tabel WHERE whatsapp_number = pemohon.
  await Promise.all(
    ROLE_TABLES.map((t) =>
      supabaseAdmin.from(t).update({ password_hash: hash }).eq('whatsapp_number', req.whatsapp_number)
    )
  );

  const { error: updErr } = await supabaseAdmin
    .from('password_reset_requests')
    .update({
      status: 'accepted',
      decided_at: new Date().toISOString(),
      decided_by_wa: adminWa,
    })
    .eq('id', id);

  if (updErr) return { error: 'Gagal update status permintaan.' };

  const template = [
    `Assalamu'alaikum ${req.requester_name ?? ''}`.trim() + `,`,
    ``,
    `Password sementara Anda: *${newPassword}*`,
    ``,
    `Login di: ${absUrl('/')}`,
    ``,
    `Setelah berhasil masuk, mohon segera ganti password via menu Akun (foto profil → Akun → Ganti Password).`,
  ].join('\n');

  revalidatePath(`/admin/reset-password/${id}`);

  return {
    password: newPassword,
    waMeUrl: buildWaMeUrl(req.whatsapp_number, template),
  };
}

export async function declineResetRequest(
  _prev: DeclineState | undefined,
  formData: FormData
): Promise<DeclineState> {
  const { wa: adminWa } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ID permintaan tidak valid.' };

  const { data: req } = await supabaseAdmin
    .from('password_reset_requests')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (!req) return { error: 'Permintaan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Permintaan sudah diproses.' };

  const { error: updErr } = await supabaseAdmin
    .from('password_reset_requests')
    .update({
      status: 'declined',
      decided_at: new Date().toISOString(),
      decided_by_wa: adminWa,
    })
    .eq('id', id);

  if (updErr) return { error: 'Gagal update status.' };

  revalidatePath(`/admin/reset-password/${id}`);
  return { ok: true };
}
