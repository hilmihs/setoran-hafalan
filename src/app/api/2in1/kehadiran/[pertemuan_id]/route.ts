import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

const VALID_STATUS = ['hadir', 'izin', 'terlambat', 'sakit', 'tidak_ada_keterangan'] as const;
type Status = typeof VALID_STATUS[number];

export async function GET(
  _req: NextRequest,
  { params }: { params: { pertemuan_id: string } }
) {
  const { data, error } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('peserta_id, status, catatan, diisi_at')
    .eq('pertemuan_id', params.pertemuan_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kehadiran: data ?? [] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { pertemuan_id: string } }
) {
  try {
    const s = await getSession();
    const session = s.accesses?.find((a) => a.role === 'peserta') ?? (s.session?.role === 'peserta' ? s.session : null);
    if (!session) {
      return NextResponse.json({ error: 'Login sebagai peserta diperlukan.' }, { status: 401 });
    }
    const pesertaId = (session as { peserta_id: string }).peserta_id;

    // Verify pertemuan exists + peserta is ketua of that kelas
    const { data: pertemuan } = await supabaseAdmin
      .from('pertemuan_program')
      .select('id, kelas_id, kelas:kelas_id(ketua_peserta_id)')
      .eq('id', params.pertemuan_id)
      .single();
    if (!pertemuan) {
      return NextResponse.json({ error: 'Pertemuan tidak ditemukan.' }, { status: 404 });
    }
    const kelas = pertemuan.kelas as unknown as { ketua_peserta_id: string | null };
    if (kelas.ketua_peserta_id !== pesertaId) {
      return NextResponse.json({ error: 'Hanya ketua kelas yang bisa mengisi kehadiran.' }, { status: 403 });
    }

    const body = await req.json();
    const rows = body.rows as Array<{
      peserta_id: string;
      status: Status;
      catatan?: string;
    }>;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows wajib diisi.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const upsertData = rows.map((r) => ({
      pertemuan_id: params.pertemuan_id,
      peserta_id: r.peserta_id,
      status: VALID_STATUS.includes(r.status) ? r.status : 'tidak_ada_keterangan',
      catatan: r.catatan || null,
      diisi_oleh: pesertaId,
      diisi_at: now,
      updated_at: now,
    }));

    const { error } = await supabaseAdmin
      .from('kehadiran_peserta')
      .upsert(upsertData, { onConflict: 'pertemuan_id,peserta_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
