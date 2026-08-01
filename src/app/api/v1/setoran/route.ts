import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { listTable } from '@/lib/api-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/setoran?peserta_id=&week_start=&status=&page=&limit=
// Metadata setoran (tanpa rekaman). Untuk rekaman → /api/v1/setoran/:id
export const GET = withApiKey('setoran:read', (req: NextRequest) =>
  listTable(req, 'setoran', {
    filters: [
      ['peserta_id', 'peserta_id'],
      ['week_start', 'week_start'],
      ['status', 'status'],
    ],
    order: { col: 'week_start', ascending: false },
    cache: 30,
  })
);
