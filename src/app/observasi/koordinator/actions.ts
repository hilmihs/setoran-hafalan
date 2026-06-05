'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { buildWaMeUrl } from '@/lib/whatsapp';

export async function decideTabayyun(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireKoordinatorKetuaKelas();

  const tabayyunId = String(formData.get('tabayyun_id') ?? '');
  const isUdzur = formData.get('is_udzur_syari') === 'true';
  const catatan = String(formData.get('keputusan_catatan') ?? '').trim();

  if (!tabayyunId) return { error: 'ID tabayyun tidak ditemukan.' };

  const { error } = await supabaseAdmin
    .from('tabayyun')
    .update({
      is_udzur_syari: isUdzur,
      keputusan_catatan: catatan || null,
      decided_at: new Date().toISOString(),
      status: 'decided',
    })
    .eq('id', tabayyunId);

  if (error) return { error: `Gagal simpan: ${error.message}` };
  return { ok: true };
}

export async function reminderKetuaKelas(
  ketuaKelasId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  await requireKoordinatorKetuaKelas();

  const { data: ketua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('name, whatsapp_number, gender')
    .eq('id', ketuaKelasId)
    .maybeSingle();

  if (!ketua) return { error: 'Ketua kelas tidak ditemukan.' };

  const sapaan = ketua.gender === 'ikhwan' ? 'Akhi' : 'Ukhti';
  const msg = `Assalamu'alaikum ${sapaan} ${ketua.name},\n\nMohon segera mengisi observasi kelas *${kelasName}* hari ini.\n\nJazakumullahu khairan.`;

  return { waUrl: buildWaMeUrl(ketua.whatsapp_number, msg) };
}

export async function reminderPengajarCheckin(
  pengajarId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  await requireKoordinatorKetuaKelas();

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('name, whatsapp_number, gender')
    .eq('id', pengajarId)
    .maybeSingle();

  if (!pengajar) return { error: 'Pengajar tidak ditemukan.' };

  const sapaan = pengajar.gender === 'ikhwan' ? 'Akhi' : 'Ukhti';
  const msg = `Assalamu'alaikum ${sapaan} ${pengajar.name},\n\nMohon segera melakukan check-in kehadiran untuk kelas *${kelasName}* hari ini.\n\nJazakumullahu khairan.`;

  return { waUrl: buildWaMeUrl(pengajar.whatsapp_number, msg) };
}
