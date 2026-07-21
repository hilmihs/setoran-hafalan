import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sanitizeRow } from '@/lib/api-serialize';
import { apiOk, apiError } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/peserta/:id
export const GET = withApiKey('master:read', async (_req: NextRequest, { params }) => {
  const { data, error } = await supabaseAdmin
    .from('peserta')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return apiError('not_found', 'peserta tidak ditemukan', 404);
  return apiOk(sanitizeRow(data), undefined, { cache: 60 });
});
