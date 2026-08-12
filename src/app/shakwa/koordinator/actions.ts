'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinator } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export type UbahShakwaResult = { ok?: boolean; error?: string };

const STATUS = new Set(['submitted', 'in_review', 'resolved', 'closed']);

/** Koordinator menandai tindak lanjut sebuah aduan. */
export async function ubahStatusShakwa(
  _prev: UbahShakwaResult | undefined,
  fd: FormData
): Promise<UbahShakwaResult> {
  const session = await requireKoordinator();

  const id = String(fd.get('id') ?? '');
  const status = String(fd.get('status') ?? '');
  const catatan = String(fd.get('catatan') ?? '').trim();
  if (!id) return { error: 'Aduan tidak ditemukan.' };
  if (!STATUS.has(status)) return { error: 'Status tidak dikenal.' };

  const { error } = await supabaseAdmin
    .from('shakwa')
    .update({
      status,
      catatan_reviewer: catatan || null,
      reviewed_by_id: session.koordinator_id,
      reviewed_by_role: 'koordinator',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'shakwa.status',
    targetTable: 'shakwa',
    targetId: id,
    detail: { status },
  });

  revalidatePath('/shakwa/koordinator');
  return { ok: true };
}
