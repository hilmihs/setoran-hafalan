'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorHits } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function createLibur(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireKoordinatorHits();

  const programId = formData.get('program_id') as string | null;
  const kelasHitsId = formData.get('kelas_hits_id') as string | null;
  const tanggal = String(formData.get('tanggal') ?? '');
  const gender = formData.get('gender') as string | null;
  const keterangan = String(formData.get('keterangan') ?? '').trim();

  if (!tanggal) return { error: 'Tanggal wajib diisi.' };
  if (!programId && !kelasHitsId) return { error: 'Pilih program.' };

  const insertData: Record<string, unknown> = {
    tanggal,
    keterangan: keterangan || null,
    created_by_id: session.koordinator_hits_id,
    created_by_role: 'koordinator_hits',
  };
  if (programId) insertData.program_id = programId;
  if (kelasHitsId) insertData.kelas_hits_id = kelasHitsId;
  if (gender && gender !== 'all') insertData.gender = gender;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('libur_program')
    .insert(insertData)
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return { error: 'Libur untuk tanggal ini sudah ada.' };
    }
    return { error: `Gagal simpan: ${insertErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'libur.create',
    targetTable: 'libur_program',
    targetId: inserted?.id ?? null,
    detail: { tanggal, program_id: programId, kelas_hits_id: kelasHitsId, gender, keterangan: keterangan || null },
  });

  return { ok: true };
}
