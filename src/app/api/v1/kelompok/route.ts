import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { listTable } from '@/lib/api-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/kelompok?gender=&page=&limit=  (kelompok_pengajar)
export const GET = withApiKey('master:read', (req: NextRequest) =>
  listTable(req, 'kelompok_pengajar', {
    filters: [['gender', 'gender']],
    order: { col: 'name', ascending: true },
  })
);
