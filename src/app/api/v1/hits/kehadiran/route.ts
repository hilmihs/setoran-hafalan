import type { NextRequest } from 'next/server';
import { withApiKey } from '@/lib/api-handler';
import { listTable } from '@/lib/api-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/hits/kehadiran?halaqah_id=&tanggal=&pertemuan_no=&kondisi=&page=&limit=
// Sumber: hits_keterangan_harian (kondisi kelas + status latihan per pertemuan).
export const GET = withApiKey('hits:read', (req: NextRequest) =>
  listTable(req, 'hits_keterangan_harian', {
    filters: [
      ['halaqah_id', 'halaqah_id'],
      ['tanggal', 'tanggal'],
      ['pertemuan_no', 'pertemuan_no'],
      ['kondisi', 'kondisi'],
    ],
    order: { col: 'tanggal', ascending: false },
    cache: 30,
  })
);
