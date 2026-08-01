import type { NextRequest } from 'next/server';
import { authenticateApiKey, publicApiEnabled } from '@/lib/api-auth';
import { apiOk, apiError } from '@/lib/api-response';
import { API_SCOPE_LABEL } from '@/lib/api-scopes';
import { recordUsage } from '@/lib/api-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/meta — dokumentasi hidup: daftar resource + scope milik key ini.
// Butuh key valid, tapi tanpa scope khusus.
export async function GET(req: NextRequest) {
  if (!publicApiEnabled()) return apiError('not_found', 'not found', 404);
  const key = await authenticateApiKey(req);
  if (!key) return apiError('unauthorized', 'API key tidak valid atau tidak ada', 401);
  recordUsage(key.id);

  return apiOk({
    version: 'v1',
    key: { name: key.name, scopes: key.scopes },
    scopes: API_SCOPE_LABEL,
    resources: [
      { path: '/api/v1/meta', scope: null, desc: 'info API + scope key ini' },
      { path: '/api/v1/peserta', scope: 'master:read', filters: ['kelas_id', 'gender', 'active'] },
      { path: '/api/v1/peserta/:id', scope: 'master:read' },
      { path: '/api/v1/kelas', scope: 'master:read', filters: ['gender', 'musyrif_id'] },
      { path: '/api/v1/musyrif', scope: 'master:read', filters: ['gender', 'active'] },
      { path: '/api/v1/pengajar', scope: 'master:read', filters: ['gender', 'active', 'kelompok_id', 'is_ketua'] },
      { path: '/api/v1/kelompok', scope: 'master:read', filters: ['gender'] },
      { path: '/api/v1/halaqah', scope: 'master:read', filters: ['gender', 'active', 'batch_id', 'level', 'pengajar_id'] },
      { path: '/api/v1/setoran', scope: 'setoran:read', filters: ['peserta_id', 'week_start', 'status'] },
      { path: '/api/v1/setoran/:id', scope: 'setoran:read', desc: 'setoran + rekaman metadata (tanpa audio)' },
      { path: '/api/v1/laporan/bulanan', scope: 'setoran:read', filters: ['bulan (YYYY-MM)', 'gender'] },
      { path: '/api/v1/hits/rekap', scope: 'hits:read', filters: ['bulan (YYYY-MM)', 'batch_id', 'gender', 'halaqah_id'] },
      { path: '/api/v1/hits/ranking', scope: 'hits:read', filters: ['start (YYYY-MM-DD)', 'end (YYYY-MM-DD, eksklusif)', 'gender'] },
      { path: '/api/v1/hits/kehadiran', scope: 'hits:read', filters: ['halaqah_id', 'tanggal', 'pertemuan_no', 'kondisi'] },
    ],
    paging: { params: ['page (default 1)', 'limit (default 50, max 200)'] },
    auth: 'Authorization: Bearer <api_key>  atau  x-api-key: <api_key>',
  });
}
