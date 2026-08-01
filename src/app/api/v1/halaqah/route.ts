import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { listTable } from '@/lib/api-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/halaqah?gender=&active=&batch_id=&level=&pengajar_id=&page=&limit=
export const GET = withApiKey('master:read', (req: NextRequest) =>
  listTable(req, 'hits_halaqah', {
    filters: [
      ['gender', 'gender'],
      ['active', 'active'],
      ['batch_id', 'batch_id'],
      ['level', 'level'],
      ['pengajar_id', 'pengajar_id'],
    ],
    order: { col: 'name', ascending: true },
  })
);
