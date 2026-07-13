import { NextResponse } from 'next/server';

// Health/diagnostic endpoint. TIDAK meng-import session/supabase agar tetap
// jalan meski modul tsb crash karena env hilang. Hanya laporkan PRESENCE env
// (boolean), bukan nilainya. Aman dibuka publik.
//
// Dibungkus try/catch + runtime nodejs eksplisit supaya TIDAK PERNAH 500 —
// kalau ada error, kembalikan detailnya sebagai JSON untuk diagnosa.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const ss = process.env.SESSION_SECRET ?? '';
    return NextResponse.json({
      ok: true,
      time: new Date().toISOString(),
      env: {
        SESSION_SECRET_set: ss.length > 0,
        SESSION_SECRET_len_ok: ss.length >= 32,
        DATABASE_URL_set: !!process.env.DATABASE_URL,
        STORAGE_DIR: process.env.STORAGE_DIR ?? null,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
        NODE_ENV: process.env.NODE_ENV ?? null,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 }
    );
  }
}
