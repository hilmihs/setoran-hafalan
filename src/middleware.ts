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
  // Sebarkan path ke server component (dipakai guard untuk redirect-after-login).
  const withPath = () => {
    const h = new Headers(req.headers);
    h.set('x-pathname', pathname + (search || ''));
    return NextResponse.next({ request: { headers: h } });
  };
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!isProtected) return withPath();
  if (req.cookies.has(SESSION_COOKIE)) return withPath();

  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  url.searchParams.set('next', pathname + (search || ''));
  // Di belakang reverse proxy, nextUrl bisa berisi host internal (0.0.0.0:xxxx).
  // Pakai host/proto yang diteruskan proxy agar redirect tetap ke domain publik.
  const fwdHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (fwdHost) {
    url.host = fwdHost;
    url.protocol = (req.headers.get('x-forwarded-proto') ?? 'https') + ':';
    url.port = '';
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
