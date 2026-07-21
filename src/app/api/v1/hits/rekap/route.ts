import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { getHitsRekap } from '@/lib/hits-rekap';
import { apiOk, apiError } from '@/lib/api-response';
import type { Gender } from '@/types/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/hits/rekap?bulan=YYYY-MM&batch_id=&gender=&halaqah_id=
export const GET = withApiKey('hits:read', async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const bulan = sp.get('bulan') ?? '';
  if (!/^\d{4}-\d{2}$/.test(bulan)) {
    return apiError('bad_request', 'param `bulan` wajib format YYYY-MM', 400);
  }
  const genderRaw = sp.get('gender');
  const gender = genderRaw === 'ikhwan' || genderRaw === 'akhwat' ? (genderRaw as Gender) : undefined;

  const data = await getHitsRekap(bulan, {
    batchId: sp.get('batch_id') ?? undefined,
    gender,
    halaqahId: sp.get('halaqah_id') ?? undefined,
  });
  return apiOk(data, { bulan }, { cache: 60 });
});
