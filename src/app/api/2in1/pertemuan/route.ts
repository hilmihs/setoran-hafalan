import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const session = s.accesses?.find((a) => a.role === 'peserta') ?? (s.session?.role === 'peserta' ? s.session : null);
    if (!session) {
      return NextResponse.json({ error: 'Login sebagai peserta diperlukan.' }, { status: 401 });
    }
    const pesertaId = (session as { peserta_id: string }).peserta_id;
    const kelasId = (session as { kelas_id: string }).kelas_id;

    // Verify peserta is ketua of this kelas
    const { data: kelas } = await supabaseAdmin
      .from('kelas')
      .select('id, name, ketua_peserta_id')
      .eq('id', kelasId)
      .single();
    if (!kelas || kelas.ketua_peserta_id !== pesertaId) {
      return NextResponse.json({ error: 'Hanya ketua kelas yang bisa membuat pertemuan.' }, { status: 403 });
    }

    const body = await req.json();
    const { program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai, keterangan } = body as {
      program: string;
      tanggal: string;
      nama_kegiatan: string;
      waktu_mulai?: string;
      waktu_selesai?: string;
      keterangan?: string;
    };

    const valid = ['kelas_maahir', 'muallim_najih', 'at_tibyan'];
    if (!valid.includes(program)) {
      return NextResponse.json({ error: 'Program tidak valid.' }, { status: 400 });
    }
    if (!tanggal || !nama_kegiatan) {
      return NextResponse.json({ error: 'Tanggal dan nama kegiatan wajib diisi.' }, { status: 400 });
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('pertemuan_program')
      .upsert(
        {
          kelas_id: kelasId,
          program,
          tanggal,
          nama_kegiatan,
          waktu_mulai: waktu_mulai || null,
          waktu_selesai: waktu_selesai || null,
          keterangan: keterangan || null,
          created_by: pesertaId,
        },
        { onConflict: 'kelas_id,program,tanggal', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
