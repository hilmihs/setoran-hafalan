import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api-public/env';
import { jalankanBerkala } from '@/lib/ketersediaan-berkala';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Pemicu berkala Ketersediaan Mengajar HITS.
 *
 * Dipanggil penjadwal dari luar (systemd timer di VPS, pola yang sama dengan
 * /api/evaluasi/sync/pull). Isinya: tarik pendaftar terbaru, geser usulan yang
 * lewat tenggat konfirmasi, dan segarkan status ketersediaan yang mulai basi.
 *
 * Tidak menjalankan alokasi. Pembentukan halaqah tetap menunggu persetujuan
 * koordinator — halaqah yang terlanjur terkirim ke CMS tilawah tidak dapat
 * ditarik kembali (akun murid bahkan tidak dapat dihapus sama sekali).
 */
function authorized(req: NextRequest): boolean {
  const secret = apiEnv('CRON_SECRET');
  if (!secret || secret.length < 16) return false;
  const h = req.headers.get('authorization') ?? '';
  return h === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const hasil = await jalankanBerkala();
    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
