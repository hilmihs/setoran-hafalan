'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import {
  buildWaMeUrl,
  tplReminderKetuaKelasObservasi,
  tplReminderPengajarTunjukKetua,
  tplTabayyunToPengajar,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { logAudit } from '@/lib/audit';
import { logWaReminder } from '@/lib/wa-log';
import { getHitsHarian, OBSERVASI_EFEKTIF } from '@/lib/hits-harian';

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** URL isi keterangan untuk ketua: magic-link (auto-login) bila ada token. */
function ketuaFillUrl(magicToken: string | null): string {
  return magicToken ? absUrl(`/api/auth/magic-link?token=${magicToken}`) : absUrl('/hits/ketua');
}

/** Koordinator KK memutuskan tabayyun HITS (udzur syar'i atau tidak). */
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
    .from('hits_tabayyun')
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
    action: 'hits.tabayyun.decide',
    targetTable: 'hits_tabayyun',
    targetId: tabayyunId,
    detail: { is_udzur_syari: isUdzur, keputusan_catatan: catatan || null },
  });

  return { ok: true };
}

/** Reminder WA ke ketua kelas agar mengisi keterangan harian (HITS). */
export async function reminderKetuaKelas(
  ketuaKelasId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: ketua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('name, whatsapp_number, gender, magic_token')
    .eq('id', ketuaKelasId)
    .maybeSingle();

  if (!ketua) return { error: 'Ketua kelas tidak ditemukan.' };

  const msg = tplReminderKetuaKelasObservasi({
    ketuaKelasName: ketua.name,
    ketuaKelasGender: ketua.gender,
    kelasName,
    observasiUrl: ketuaFillUrl(ketua.magic_token),
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

/** Reminder WA ke pengajar agar mengirim alasan tabayyun (HITS). */
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
    formUrl: absUrl('/hits/pengajar'),
  });

  const waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'pengajar',
    recipientId: pengajarId,
    recipientWa: pengajar.whatsapp_number,
    templateKind: 'tabayyun_notify',
    targetTable: 'hits_keterangan_harian',
  });

  return { waUrl };
}

/** Reminder WA ke pengajar agar menunjuk ketua kelas (halaqah tanpa ketua). */
export async function reminderTunjukKetua(
  pengajarId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('name, whatsapp_number, gender')
    .eq('id', pengajarId)
    .maybeSingle();
  if (!pengajar || !pengajar.whatsapp_number) return { error: 'Pengajar / WA tidak ditemukan.' };

  const msg = tplReminderPengajarTunjukKetua({
    pengajarName: pengajar.name,
    pengajarGender: pengajar.gender,
    kelasName,
    url: absUrl('/hits/pengajar'),
  });
  const waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'pengajar',
    recipientId: pengajarId,
    recipientWa: pengajar.whatsapp_number,
    templateKind: 'tunjuk_ketua',
  });

  return { waUrl };
}

export type ReminderItem = { ketuaName: string; kelasName: string; waUrl: string };

/**
 * Reminder massal: semua ketua kelas yang halaqahnya ada pertemuan hari ini &
 * keterangan belum diisi. Tiap item berisi link wa.me + magic-link auto-login
 * ke form pengisian. Efektif mulai OBSERVASI_EFEKTIF (2026-06-22).
 */
export async function reminderMassalHariIni(): Promise<{ items?: ReminderItem[]; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();
  const today = jakartaToday();
  if (today < OBSERVASI_EFEKTIF) {
    return { error: `Sistem observasi mulai efektif ${OBSERVASI_EFEKTIF}.` };
  }

  const { rows } = await getHitsHarian(today, session.gender);
  const targets = rows.filter((r) => !r.keterangan && r.ketua);
  if (targets.length === 0) return { items: [] };

  const ketuaIds = targets.map((r) => r.ketua!.id);
  const { data: ketuaRows } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, whatsapp_number, gender, magic_token')
    .in('id', ketuaIds);
  const ketuaById = new Map((ketuaRows ?? []).map((k) => [k.id, k]));

  const items: ReminderItem[] = [];
  for (const r of targets) {
    const k = ketuaById.get(r.ketua!.id);
    if (!k) continue;
    const msg = tplReminderKetuaKelasObservasi({
      ketuaKelasName: k.name,
      ketuaKelasGender: k.gender,
      kelasName: r.halaqah_name,
      observasiUrl: ketuaFillUrl(k.magic_token),
    });
    items.push({ ketuaName: k.name, kelasName: r.halaqah_name, waUrl: buildWaMeUrl(k.whatsapp_number, msg) });
    await logWaReminder({
      sender: session,
      recipientTable: 'ketua_kelas',
      recipientId: k.id,
      recipientWa: k.whatsapp_number,
      templateKind: 'observasi_reminder',
    });
  }
  return { items };
}
