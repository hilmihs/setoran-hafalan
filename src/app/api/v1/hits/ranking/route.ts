import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { getDisiplinRanking } from '@/lib/hits-ranking';
import { apiOk, apiError } from '@/lib/api-response';
import type { Gender } from '@/types/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/hits/ranking?start=YYYY-MM-DD&end=YYYY-MM-DD&gender=
// end EKSKLUSIF (lihat getDisiplinRanking).
export const GET = withApiKey('hits:read', async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start') ?? '';
  const end = sp.get('end') ?? '';
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(start) || !dateRe.test(end)) {
    return apiError('bad_request', 'param `start` & `end` wajib format YYYY-MM-DD', 400);
  }
  const genderRaw = sp.get('gender');
  const gender = genderRaw === 'ikhwan' || genderRaw === 'akhwat' ? (genderRaw as Gender) : undefined;

  const rows = await getDisiplinRanking({ start, end, gender });
  return apiOk(rows, { start, end, count: rows.length }, { cache: 60 });
});
