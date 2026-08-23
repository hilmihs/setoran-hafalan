// Terapkan baris eval_sync_stage ter-approve ke mirror eval_*. Urutan penting
// (batch/pengajar dulu, lalu halaqah, lalu peserta) supaya FK terpenuhi.
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EvalSyncStage } from '@/types/db';

const TABLE: Record<string, string> = {
  batch: 'eval_batch', pengajar: 'eval_pengajar', halaqah: 'eval_halaqah', peserta: 'eval_peserta',
};
const ORDER = ['batch', 'pengajar', 'halaqah', 'peserta'];

/** Apply baris stage id tertentu. Reject → hanya ditandai, tak sentuh mirror. */
export async function applyStages(stageIds: string[], actor: string): Promise<{ applied: number }> {
  const { data } = await supabaseAdmin
    .from('eval_sync_stage')
    .select('id, entity, op, entity_id, after')
    .in('id', stageIds)
    .is('applied_at', null)
    .eq('rejected', false);
  const rows = (data ?? []) as Pick<EvalSyncStage, 'id' | 'entity' | 'op' | 'entity_id' | 'after'>[];

  const now = new Date().toISOString();
  let applied = 0;

  for (const entity of ORDER) {
    for (const r of rows.filter((x) => x.entity === entity)) {
      const table = TABLE[entity];
      if (r.op === 'deactivate') {
        await supabaseAdmin.from(table).update({ aktif: false, synced_at: now }).eq('id', r.entity_id);
      } else {
        // create / update: upsert baris mirror dari `after` (+ synced_at).
        await supabaseAdmin.from(table).upsert({ ...(r.after as object), synced_at: now }, { onConflict: 'id' });
      }
      await supabaseAdmin.from('eval_sync_stage')
        .update({ applied_at: now, applied_by: actor }).eq('id', r.id);
      applied++;
    }
  }
  return { applied };
}

export async function rejectStages(stageIds: string[], actor: string): Promise<{ rejected: number }> {
  const { error } = await supabaseAdmin.from('eval_sync_stage')
    .update({ rejected: true, rejected_by: actor })
    .in('id', stageIds).is('applied_at', null);
  if (error) throw new Error(error.message);
  return { rejected: stageIds.length };
}
