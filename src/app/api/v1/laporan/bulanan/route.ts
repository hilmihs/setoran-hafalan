import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { generateMonthlyReport } from '@/lib/laporan';
import { apiOk, apiError } from '@/lib/api-response';
import type { Gender } from '@/types/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/laporan/bulanan?bulan=YYYY-MM&gender=ikhwan|akhwat
export const GET = withApiKey('setoran:read', async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const bulan = sp.get('bulan') ?? '';
  const gender = sp.get('gender') ?? '';

  const m = bulan.match(/^(\d{4})-(\d{2})$/);
  if (!m) return apiError('bad_request', 'param `bulan` wajib format YYYY-MM', 400);
  if (gender !== 'ikhwan' && gender !== 'akhwat') {
    return apiError('bad_request', 'param `gender` wajib ikhwan|akhwat', 400);
  }
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return apiError('bad_request', 'bulan tidak valid', 400);

  const report = await generateMonthlyReport(year, month, gender as Gender);
  return apiOk(report, { bulan, gender }, { cache: 60 });
});
