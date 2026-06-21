import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Link pendek universal untuk ketua kelas: /isi → form pengisian keterangan.
// Middleware menangani login + redirect-after-login bila belum masuk.
export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/hits/ketua', req.url));
}
