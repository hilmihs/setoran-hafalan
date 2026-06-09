'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp, buildWaMeUrl } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { ADMIN_WA } from '@/lib/constants';

type State = { error?: string; waMeUrl?: string };

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

export async function requestPasswordReset(
  _prev: State | undefined,
  formData: FormData
): Promise<State> {
  const wa = normalizeWhatsApp(String(formData.get('whatsapp_number') ?? ''));
  if (!wa || wa.length < 10) {
    return { error: 'Nomor WhatsApp wajib diisi.' };
  }

  // Cari nama pemohon di salah satu tabel role (active).
  let requesterName: string | null = null;
  for (const t of ROLE_TABLES) {
    const { data } = await supabaseAdmin
      .from(t)
      .select('name, active')
      .eq('whatsapp_number', wa)
      .maybeSingle();
    if (data && data.active) {
      requesterName = data.name;
      break;
    }
  }

  if (!requesterName) {
    return { error: 'Nomor WhatsApp tidak terdaftar di sistem.' };
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('password_reset_requests')
    .insert({
      whatsapp_number: wa,
      requester_name: requesterName,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return { error: 'Gagal membuat permintaan. Coba lagi.' };
  }

  const processUrl = absUrl(`/admin/reset-password/${inserted.id}`);
  const template = [
    `Assalamu'alaikum, mohon bantuan reset password.`,
    ``,
    `Nama: ${requesterName}`,
    `WA: ${wa}`,
    ``,
    `Link proses:`,
    processUrl,
  ].join('\n');

  return { waMeUrl: buildWaMeUrl(ADMIN_WA, template) };
}
