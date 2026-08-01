import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { listTable } from '@/lib/api-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/musyrif?gender=&active=&page=&limit=
export const GET = withApiKey('master:read', (req: NextRequest) =>
  listTable(req, 'musyrif', {
    filters: [
      ['gender', 'gender'],
      ['active', 'active'],
    ],
    order: { col: 'name', ascending: true },
  })
);
