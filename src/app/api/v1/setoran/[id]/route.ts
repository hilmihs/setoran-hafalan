import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sanitizeRow, serializeRekaman } from '@/lib/api-serialize';
import { apiOk, apiError } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/setoran/:id → setoran + rekaman METADATA (tanpa file audio).
export const GET = withApiKey('setoran:read', async (_req: NextRequest, { params }) => {
  const { data: setoran, error } = await supabaseAdmin
    .from('setoran')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!setoran) return apiError('not_found', 'setoran tidak ditemukan', 404);

  const { data: rekaman, error: rErr } = await supabaseAdmin
    .from('rekaman')
    .select('*')
    .eq('setoran_id', params.id)
    .order('jenis', { ascending: true });
  if (rErr) throw new Error(rErr.message);

  return apiOk(
    { ...sanitizeRow(setoran), rekaman: (rekaman ?? []).map(serializeRekaman) },
    undefined,
    { cache: 30 }
  );
});
