import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reset (hapus) nilai satu sesi — seluruh peserta, atau satu peserta bila
// peserta_id diberikan. Draft-only: sesi 'terkirim' ditolak. Beraudit.
export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    const pengajar = accesses.find((a) => a.role === 'pengajar') as
      | { role: 'pengajar'; pengajar_id: string }
      | undefined;
    if (!pengajar) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as { sesi_id?: unknown; peserta_id?: unknown };
    const sesi_id = body.sesi_id;
    const peserta_id = body.peserta_id;
    if (typeof sesi_id !== 'string' || !UUID_RE.test(sesi_id)) {
      return NextResponse.json({ error: 'sesi_id tidak valid' }, { status: 400 });
    }
    if (peserta_id !== undefined && (typeof peserta_id !== 'string' || !peserta_id)) {
      return NextResponse.json({ error: 'peserta_id tidak valid' }, { status: 400 });
    }

    const { data: sesi } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id, halaqah_id, status')
      .eq('id', sesi_id)
      .maybeSingle();
    if (!sesi) {
      return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 });
    }
    if (sesi.status === 'terkirim') {
      return NextResponse.json({ error: 'Sesi sudah dikirim — tak bisa direset' }, { status: 409 });
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', sesi.halaqah_id)
      .maybeSingle();
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!halaqah || !evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    let del = supabaseAdmin.from('evaluasi_nilai').delete().eq('sesi_id', sesi_id);
    if (typeof peserta_id === 'string') del = del.eq('peserta_id', peserta_id);
    const { error } = await del;
    if (error) {
      console.error('[nilai/reset] gagal:', error.message);
      return NextResponse.json({ error: 'Gagal mereset nilai' }, { status: 500 });
    }

    void logAudit({
      actor: pengajar as never,
      action: 'evaluasi.nilai.reset',
      targetTable: 'evaluasi_nilai',
      targetId: sesi_id,
      detail: { peserta_id: peserta_id ?? null, scope: peserta_id ? 'peserta' : 'sesi' },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[nilai/reset] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal mereset nilai' }, { status: 500 });
  }
}
