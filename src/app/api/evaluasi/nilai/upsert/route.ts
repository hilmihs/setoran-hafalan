import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { scoreOf, countsToColumns, type LahnCounts } from '@/lib/evaluasi';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const body = await req.json();
    const { sesi_id, peserta_id, hadir, ayat_terakhir, counts, catatan, confirmed, done } =
      body as {
        sesi_id: string;
        peserta_id: string;
        hadir?: boolean;
        ayat_terakhir?: number | null;
        counts: LahnCounts;
        catatan?: string | null;
        confirmed?: boolean;
        done?: boolean;
      };

    if (typeof sesi_id !== 'string' || !UUID_RE.test(sesi_id)) {
      return NextResponse.json({ error: 'sesi_id tidak valid' }, { status: 400 });
    }
    if (typeof peserta_id !== 'string' || !peserta_id) {
      return NextResponse.json({ error: 'peserta_id wajib diisi' }, { status: 400 });
    }
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
      return NextResponse.json({ error: 'counts harus objek' }, { status: 400 });
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
      return NextResponse.json({ error: 'Sesi sudah dikirim' }, { status: 409 });
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', sesi.halaqah_id)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    if (halaqah.pengajar_id !== pengajar.pengajar_id) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // Skor selalu dihitung di server dari counts — jangan percaya skor dari klien.
    const skor = scoreOf(counts).skor;
    const cols = countsToColumns(counts);

    const { error } = await supabaseAdmin.from('evaluasi_nilai').upsert(
      {
        sesi_id,
        peserta_id,
        hadir: hadir ?? true,
        ayat_terakhir: ayat_terakhir ?? null,
        ...cols,
        skor,
        catatan: catatan ?? null,
        confirmed: !!confirmed,
        done: !!done,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sesi_id,peserta_id' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, skor });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
