import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Prefix halaman terproteksi (butuh login). Bila belum login (cookie sesi
// tak ada) → arahkan ke home dengan ?next= supaya setelah login balik ke sini.
const PROTECTED = [
  '/hits', '/observasi', '/matrix', '/kehadiran',
  '/2in1', '/penilaian', '/laporan', '/audit', '/akun', '/peserta',
];

const SESSION_COOKIE = 'maahir-hits-session';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!isProtected) return NextResponse.next();
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  url.searchParams.set('next', pathname + (search || ''));
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
