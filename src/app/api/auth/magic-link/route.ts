import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Token wajib diisi.' }, { status: 400 });
  }

  const { data: ketua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, gender, kelas_hits_id, active')
    .eq('magic_token', token)
    .maybeSingle();

  if (!ketua || !ketua.active) {
    return NextResponse.json(
      { error: 'Link tidak valid atau sudah kadaluarsa.' },
      { status: 401 },
    );
  }

  const s = await getSession();
  const access = {
    role: 'ketua_kelas' as const,
    ketua_kelas_id: ketua.id,
    name: ketua.name,
    gender: ketua.gender,
    kelas_hits_id: ketua.kelas_hits_id,
  };
  s.session = access;
  s.accesses = [access];
  await s.save();

  await supabaseAdmin
    .from('ketua_kelas')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', ketua.id);

  return NextResponse.redirect(new URL('/observasi/ketua-kelas', req.url));
}
