'use server';

import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePengajar } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { buildWaMeUrl, normalizeWhatsApp, tplKetuaKelasTerpilih } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { logAudit } from '@/lib/audit';

const BCRYPT_COST = 12;

type Res = { error?: string; ok?: boolean; waUrl?: string };

export async function electKetua(_prev: Res | undefined, fd: FormData): Promise<Res> {
  const session = await requirePengajar();
  const wa = await getSessionWa();

  const halaqahId = String(fd.get('halaqah_id') ?? '');
  const pesertaId = String(fd.get('peserta_id') ?? '');
  const ketuaWa = String(fd.get('ketua_wa') ?? '').trim();
  if (!halaqahId || !pesertaId || !ketuaWa) {
    return { error: 'Pilih peserta dan isi nomor WA ketua kelas.' };
  }

  const { data: halaqah } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, pengajar_id, pengajar_wa')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return { error: 'Halaqah tidak ditemukan.' };
  const owned = halaqah.pengajar_id === session.pengajar_id || (wa && halaqah.pengajar_wa === wa);
  if (!owned) return { error: 'Halaqah ini bukan milik Anda.' };

  const { data: chosen } = await supabaseAdmin
    .from('hits_halaqah_peserta')
    .select('id, nama')
    .eq('id', pesertaId)
    .eq('halaqah_id', halaqahId)
    .maybeSingle();
  if (!chosen) return { error: 'Peserta tidak ditemukan di halaqah ini.' };

  const normWa = normalizeWhatsApp(ketuaWa);
  const gender = halaqah.gender ?? session.gender;

  // Reset ketua lama di halaqah, set yang baru.
  await supabaseAdmin
    .from('hits_halaqah_peserta')
    .update({ is_ketua: false, ketua_wa: null })
    .eq('halaqah_id', halaqahId)
    .eq('is_ketua', true);
  await supabaseAdmin
    .from('hits_halaqah_peserta')
    .update({ is_ketua: true, ketua_wa: normWa })
    .eq('id', pesertaId);

  // Nonaktifkan ketua_kelas lama utk halaqah ini, buat baru (magic-link).
  await supabaseAdmin
    .from('ketua_kelas')
    .update({ active: false })
    .eq('hits_halaqah_id', halaqahId)
    .eq('active', true);

  const magicToken = crypto.randomUUID();
  // Password awal = 6 digit akhir nomor WA ketua. Deterministik supaya bisa
  // diinfokan & dipakai login WA+password; ketua diimbau ganti setelah login.
  const initialPassword = normWa.slice(-6);
  const passwordHash = await bcrypt.hash(initialPassword, BCRYPT_COST);
  const { data: inserted, error } = await supabaseAdmin
    .from('ketua_kelas')
    .insert({
      name: chosen.nama,
      gender,
      whatsapp_number: normWa,
      hits_halaqah_id: halaqahId,
      hits_halaqah_peserta_id: pesertaId,
      magic_token: magicToken,
      password_hash: passwordHash,
      active: true,
    })
    .select('id')
    .single();
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'hits.ketua.elect',
    targetTable: 'ketua_kelas',
    targetId: inserted?.id ?? null,
    detail: { halaqah_id: halaqahId, peserta_id: pesertaId },
  });

  const magicUrl = absUrl(`/api/auth/magic-link?token=${magicToken}`);
  const msg = tplKetuaKelasTerpilih({
    ketuaKelasName: chosen.nama,
    ketuaKelasGender: gender,
    kelasName: halaqah.name,
    magicUrl,
    linkGrupWa: null,
    loginUrl: absUrl('/'),
    loginWa: normWa,
    initialPassword,
  });
  return { ok: true, waUrl: buildWaMeUrl(normWa, msg) };
}
