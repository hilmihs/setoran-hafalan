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
  // Lampiran Shakwa lewat bucket lain, tapi penyaji + tanda tangannya sama.
  // Tanpa entri ini gambar terunduh sebagai octet-stream, bukan tampil di tab.
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  // Berkas Haqibatul Mu'allim: tanpa entri ini xlsx/docx terunduh sebagai
  // octet-stream dan sebagian OS bingung membukanya.
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

/**
 * Nama unduhan dari parameter `n` (di luar tanda tangan — hanya memengaruhi nama
 * berkas yang tersimpan di komputer pengguna, bukan berkas mana yang tersaji).
 * Kutip, garis miring, dan karakter kendali dibuang supaya header tak bisa
 * disisipi.
 */
function dispositionOf(nama: string | null): string | null {
  if (!nama) return null;
  // Karakter kendali, kutip, backslash, dan garis miring dibuang; spasi serta
  // tanda hubung dipertahankan supaya nama unduhan tetap terbaca.
  const aman = nama.replace(/[\u0000-\u001f"\\/]/g, '').trim().slice(0, 120);
  if (!aman) return null;
  return `inline; filename="${aman}"; filename*=UTF-8''${encodeURIComponent(aman)}`;
}

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
    const disposition = dispositionOf(url.searchParams.get('n'));
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': String(s.size),
        'Cache-Control': 'private, max-age=3600',
        ...(disposition ? { 'Content-Disposition': disposition } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
