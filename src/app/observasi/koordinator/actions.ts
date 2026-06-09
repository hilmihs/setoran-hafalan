'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import {
  buildWaMeUrl,
  tplReminderKetuaKelasObservasi,
  tplReminderPengajarCheckin,
  tplTabayyunToPengajar,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { logAudit } from '@/lib/audit';
import { logWaReminder } from '@/lib/wa-log';

export async function decideTabayyun(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireKoordinatorKetuaKelas();

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
      koordinator_kk_id: session.koordinator_kk_id,
    })
    .eq('id', tabayyunId);

  if (error) return { error: `Gagal simpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'tabayyun.decide',
    targetTable: 'tabayyun',
    targetId: tabayyunId,
    detail: { is_udzur_syari: isUdzur, keputusan_catatan: catatan || null },
  });

  return { ok: true };
}

export async function reminderKetuaKelas(
  ketuaKelasId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: ketua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('name, whatsapp_number, gender')
    .eq('id', ketuaKelasId)
    .maybeSingle();

  if (!ketua) return { error: 'Ketua kelas tidak ditemukan.' };

  const msg = tplReminderKetuaKelasObservasi({
    ketuaKelasName: ketua.name,
    ketuaKelasGender: ketua.gender,
    kelasName,
    observasiUrl: absUrl('/observasi/ketua-kelas'),
  });

  const waUrl = buildWaMeUrl(ketua.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'ketua_kelas',
    recipientId: ketuaKelasId,
    recipientWa: ketua.whatsapp_number,
    templateKind: 'observasi_reminder',
  });

  return { waUrl };
}

export async function reminderPengajarCheckin(
  pengajarId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('name, whatsapp_number, gender')
    .eq('id', pengajarId)
    .maybeSingle();

  if (!pengajar) return { error: 'Pengajar tidak ditemukan.' };

  const msg = tplReminderPengajarCheckin({
    pengajarName: pengajar.name,
    pengajarGender: pengajar.gender,
    programName: kelasName,
    checkinUrl: absUrl('/kehadiran/pengajar'),
  });

  const waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'pengajar',
    recipientId: pengajarId,
    recipientWa: pengajar.whatsapp_number,
    templateKind: 'checkin_reminder',
  });

  return { waUrl };
}

export async function reminderTabayyunPengajar(
  pengajarId: string,
  kondisi: string,
  tanggal: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('name, whatsapp_number, gender')
    .eq('id', pengajarId)
    .maybeSingle();

  if (!pengajar) return { error: 'Pengajar tidak ditemukan.' };

  const msg = tplTabayyunToPengajar({
    pengajarName: pengajar.name,
    pengajarGender: pengajar.gender,
    kondisi,
    tanggal,
    kelasName,
    formUrl: absUrl('/kehadiran/pengajar'),
  });

  const waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'pengajar',
    recipientId: pengajarId,
    recipientWa: pengajar.whatsapp_number,
    templateKind: 'tabayyun_notify',
    targetTable: 'observasi_kelas',
  });

  return { waUrl };
}
