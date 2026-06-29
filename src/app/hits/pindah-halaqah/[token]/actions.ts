'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePengajar } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { logAudit } from '@/lib/audit';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplPindahDisetujuiToRequester } from '@/lib/whatsapp';

export type DecidePindahResult = {
  ok?: boolean;
  error?: string;
  decided?: 'approved' | 'rejected';
  requesterWaUrl?: string;
};

async function loadByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  return data;
}

/**
 * Verifikasi pengajar yang login adalah pengajar TUJUAN pengajuan ini.
 * Match via target_pengajar_id (dari daftar) atau target_wa (manual).
 */
function isTargetPengajar(
  req: { target_pengajar_id: string | null; target_wa: string | null },
  session: { pengajar_id: string },
  wa: string | null
): boolean {
  if (req.target_pengajar_id && req.target_pengajar_id === session.pengajar_id) return true;
  if (req.target_wa && wa && wa === req.target_wa) return true;
  return false;
}

/** Pengajar tujuan menyetujui: halaqah pindah ke dirinya. */
export async function approvePindah(token: string, catatan: string): Promise<DecidePindahResult> {
  const session = await requirePengajar();
  const wa = await getSessionWa();

  const req = await loadByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };
  if (!isTargetPengajar(req, session, wa)) {
    return { error: 'Hanya pengajar tujuan yang bisa menyetujui pemindahan ini. Pastikan Anda login dengan akun yang benar.' };
  }

  // Approver yang login = pengajar baru halaqah ini.
  const { error: upErr } = await supabaseAdmin
    .from('hits_halaqah')
    .update({
      pengajar_id: session.pengajar_id,
      pengajar_wa: wa ?? req.target_wa,
      pengajar_nama_sheet: session.name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.halaqah_id);
  if (upErr) return { error: `Gagal memindahkan halaqah: ${upErr.message}` };

  await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .update({
      status: 'approved',
      decided_by_role: 'pengajar',
      decided_by_id: session.pengajar_id,
      decided_at: new Date().toISOString(),
      catatan: catatan || null,
    })
    .eq('id', req.id);

  await logAudit({
    actor: session,
    action: 'hits.halaqah.pindah.approve',
    targetTable: 'hits_halaqah_pindah_request',
    targetId: req.id,
    detail: { halaqah_id: req.halaqah_id, target_pengajar_id: session.pengajar_id },
  });

  revalidatePath('/hits/pengajar');

  // wa.me balik ke pengaju supaya cek list & tunjuk ketua.
  let requesterWaUrl: string | undefined;
  if (req.requested_by_wa) {
    let requesterGender: 'ikhwan' | 'akhwat' = 'ikhwan';
    if (req.requested_by_pengajar_id) {
      const { data: rp } = await supabaseAdmin
        .from('pengajar')
        .select('gender')
        .eq('id', req.requested_by_pengajar_id)
        .maybeSingle();
      if (rp?.gender === 'akhwat') requesterGender = 'akhwat';
    }
    const { data: hq } = await supabaseAdmin
      .from('hits_halaqah')
      .select('name')
      .eq('id', req.halaqah_id)
      .maybeSingle();
    const msg = tplPindahDisetujuiToRequester({
      requesterName: req.requested_by_name,
      requesterGender,
      targetName: session.name,
      halaqahName: hq?.name ?? 'halaqah',
      pengajarUrl: absUrl('/hits/pengajar'),
    });
    requesterWaUrl = buildWaMeUrl(req.requested_by_wa, msg);
  }

  return { ok: true, decided: 'approved', requesterWaUrl };
}

/** Pengajar tujuan menolak pengajuan. */
export async function rejectPindah(token: string, catatan: string): Promise<DecidePindahResult> {
  const session = await requirePengajar();
  const wa = await getSessionWa();

  const req = await loadByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };
  if (!isTargetPengajar(req, session, wa)) {
    return { error: 'Hanya pengajar tujuan yang bisa menolak pemindahan ini.' };
  }

  await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .update({
      status: 'rejected',
      decided_by_role: 'pengajar',
      decided_by_id: session.pengajar_id,
      decided_at: new Date().toISOString(),
      catatan: catatan || null,
    })
    .eq('id', req.id);

  await logAudit({
    actor: session,
    action: 'hits.halaqah.pindah.reject',
    targetTable: 'hits_halaqah_pindah_request',
    targetId: req.id,
    detail: { halaqah_id: req.halaqah_id },
  });

  return { ok: true, decided: 'rejected' };
}
