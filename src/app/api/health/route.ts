import { NextResponse } from 'next/server';

// Health/diagnostic endpoint. TIDAK meng-import session/supabase agar tetap
// jalan meski modul tsb crash karena env hilang. Hanya laporkan PRESENCE env
// (boolean), bukan nilainya. Aman dibuka publik.
export const dynamic = 'force-dynamic';

export function GET() {
  const ss = process.env.SESSION_SECRET ?? '';
  return NextResponse.json({
    ok: true,
    env: {
      SESSION_SECRET_set: ss.length > 0,
      SESSION_SECRET_len_ok: ss.length >= 32,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
      NODE_ENV: process.env.NODE_ENV ?? null,
    },
  });
}
