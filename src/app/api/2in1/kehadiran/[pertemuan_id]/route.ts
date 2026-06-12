import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa } from '@/lib/program-kelas';

export const runtime = 'nodejs';

const VALID_STATUS = ['hadir', 'izin', 'terlambat', 'sakit', 'tidak_ada_keterangan'] as const;
type Status = typeof VALID_STATUS[number];

export async function GET(
  _req: NextRequest,
  { params }: { params: { pertemuan_id: string } }
) {
  const { data, error } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('anggota_id, status, catatan, diisi_at')
    .eq('pertemuan_id', params.pertemuan_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kehadiran: data ?? [] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { pertemuan_id: string } }
) {
  try {
    const wa = await getSessionWa();
    if (!wa) {
      return NextResponse.json({ error: 'Login diperlukan.' }, { status: 401 });
    }

    // Verify pertemuan + caller is ketua/wakil of the program_kelas
    const { data: pertemuan } = await supabaseAdmin
      .from('pertemuan_program')
      .select('id, program_kelas_id, program_kelas:program_kelas_id(ketua_wa, wakil_wa)')
      .eq('id', params.pertemuan_id)
      .single();
    if (!pertemuan || !pertemuan.program_kelas_id) {
      return NextResponse.json({ error: 'Pertemuan tidak ditemukan.' }, { status: 404 });
    }
    const pk = pertemuan.program_kelas as unknown as { ketua_wa: string | null; wakil_wa: string | null };
    if (pk.ketua_wa !== wa && pk.wakil_wa !== wa) {
      return NextResponse.json({ error: 'Hanya ketua/wakil kelas yang bisa mengisi kehadiran.' }, { status: 403 });
    }

    const body = await req.json();
    const rows = body.rows as Array<{
      anggota_id: string;
      status: Status;
      catatan?: string;
    }>;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows wajib diisi.' }, { status: 400 });
    }

    // Map anggota → peserta_id (nullable) untuk kolom legacy
    const anggotaIds = rows.map((r) => r.anggota_id);
    const { data: anggotaList } = await supabaseAdmin
      .from('program_kelas_anggota')
      .select('id, peserta_id')
      .in('id', anggotaIds);
    const pesertaByAnggota = new Map((anggotaList ?? []).map((a) => [a.id, a.peserta_id]));

    const now = new Date().toISOString();
    const upsertData = rows.map((r) => ({
      pertemuan_id: params.pertemuan_id,
      anggota_id: r.anggota_id,
      peserta_id: pesertaByAnggota.get(r.anggota_id) ?? null,
      status: VALID_STATUS.includes(r.status) ? r.status : 'tidak_ada_keterangan',
      catatan: r.catatan || null,
      diisi_at: now,
      updated_at: now,
    }));

    const { error } = await supabaseAdmin
      .from('kehadiran_peserta')
      .upsert(upsertData, { onConflict: 'pertemuan_id,anggota_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
