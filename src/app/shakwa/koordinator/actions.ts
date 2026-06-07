'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorHits } from '@/lib/session';
import type { StatusShakwa } from '@/types/db';

export async function updateShakwaStatus(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireKoordinatorHits();

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
    })
    .eq('id', shakwaId);

  if (updateErr) {
    return { error: `Gagal update: ${updateErr.message}` };
  }

  return { ok: true };
}
