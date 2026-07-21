import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { listTable } from '@/lib/api-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/pengajar?gender=&active=&kelompok_id=&is_ketua=&page=&limit=
export const GET = withApiKey('master:read', (req: NextRequest) =>
  listTable(req, 'pengajar', {
    filters: [
      ['gender', 'gender'],
      ['active', 'active'],
      ['kelompok_id', 'kelompok_id'],
      ['is_ketua', 'is_ketua'],
    ],
    order: { col: 'name', ascending: true },
  })
);
