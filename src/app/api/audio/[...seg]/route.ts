import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { storageDir, verifyAudio } from '@/lib/pg-storage';

// Penyaji audio lokal. Menggantikan Supabase Storage signed URL.
// URL: /api/audio/<bucket>/<path...>?exp=<unix>&sig=<hmac>
// Tanda tangan diverifikasi (HMAC SESSION_SECRET) + cek kedaluwarsa.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  webm: 'audio/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

export async function GET(req: NextRequest, ctx: { params: { seg: string[] } }) {
  const seg = (ctx.params.seg ?? []).map((s) => decodeURIComponent(s));
  const full = seg.join('/'); // bucket/path...
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';

  if (!verifyAudio(full, exp, sig)) {
    return NextResponse.json({ error: 'invalid or expired signature' }, { status: 403 });
  }

  // Cegah path traversal: normalisasi & pastikan tetap di dalam storageDir.
  const baseDir = storageDir();
  const target = normalize(join(baseDir, full));
  if (!target.startsWith(normalize(baseDir))) {
    return NextResponse.json({ error: 'bad path' }, { status: 400 });
  }

  try {
    const s = await stat(target);
    const buf = await readFile(target);
    const ext = full.split('.').pop()?.toLowerCase() ?? '';
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': String(s.size),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
