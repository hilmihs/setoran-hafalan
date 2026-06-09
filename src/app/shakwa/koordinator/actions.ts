'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorHits } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import type { StatusShakwa } from '@/types/db';

export async function updateShakwaStatus(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireKoordinatorHits();

  const shakwaId = String(formData.get('shakwa_id') ?? '');
  const status = String(formData.get('status') ?? '') as StatusShakwa;
  const catatan = String(formData.get('catatan_reviewer') ?? '').trim();

  if (!shakwaId || !status) {
    return { error: 'Data tidak lengkap.' };
  }
  if (!['submitted', 'in_review', 'resolved', 'closed'].includes(status)) {
    return { error: 'Status tidak valid.' };
  }

  const { error: updateErr } = await supabaseAdmin
    .from('shakwa')
    .update({
      status,
      catatan_reviewer: catatan || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by_id: session.koordinator_hits_id,
      reviewed_by_role: 'koordinator_hits',
    })
    .eq('id', shakwaId);

  if (updateErr) {
    return { error: `Gagal update: ${updateErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'shakwa.status_update',
    targetTable: 'shakwa',
    targetId: shakwaId,
    detail: { status, catatan_reviewer: catatan || null },
  });

  return { ok: true };
}
