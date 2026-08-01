import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { listTable } from '@/lib/api-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/kelas?gender=&page=&limit=
export const GET = withApiKey('master:read', (req: NextRequest) =>
  listTable(req, 'kelas', {
    filters: [
      ['gender', 'gender'],
      ['musyrif_id', 'musyrif_id'],
    ],
    order: { col: 'name', ascending: true },
  })
);
