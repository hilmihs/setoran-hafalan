import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { ensureAudioBucket, uploadAudio } from '@/lib/storage';
import { currentCycleStart } from '@/lib/week';
import { buildWaMeUrl, tplPesertaSubmitToMusyrif } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { JENIS_REKAMAN, type JenisRekaman } from '@/types/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const pesertaSession = s.accesses?.find((a) => a.role === 'peserta') ?? (s.session?.role === 'peserta' ? s.session : null);
    if (!pesertaSession) {
      return NextResponse.json({ error: 'Anda harus login sebagai peserta.' }, { status: 401 });
    }
    const pesertaId = (pesertaSession as { peserta_id: string }).peserta_id;

    const form = await req.formData();
    const jenis = form.get('jenis') as string | null;
    const file = form.get('audio_file') as File | null;
    const durationSec = (() => {
      const v = form.get('duration_sec');
      if (!v) return null;
      const n = parseInt(String(v));
      return Number.isFinite(n) ? n : null;
    })();

    if (!jenis || !JENIS_REKAMAN.includes(jenis as JenisRekaman)) {
      return NextResponse.json({ error: 'Jenis rekaman tidak valid.' }, { status: 400 });
    }
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'File rekaman kosong.' }, { status: 400 });
    }

    const { data: peserta, error: pErr } = await supabaseAdmin
      .from('peserta')
      .select('id, name, gender, kelas:kelas_id(id, name, musyrif:musyrif_id(id, name, gender, whatsapp_number))')
      .eq('id', pesertaId)
      .eq('active', true)
      .single();
    if (pErr || !peserta) {
      return NextResponse.json({ error: 'Peserta tidak ditemukan' }, { status: 404 });
    }
    const kelas = peserta.kelas as unknown as {
      id: string;
      name: string;
      musyrif: { id: string; name: string; gender: 'ikhwan' | 'akhwat'; whatsapp_number: string };
    };
    const musyrif = kelas.musyrif;

    const weekStart = currentCycleStart();

    const { data: existing } = await supabaseAdmin
      .from('setoran')
      .select('id, status')
      .eq('peserta_id', pesertaId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (existing?.status === 'checked') {
      return NextResponse.json(
        { error: 'Setoran pekan ini sudah dicek musyrif, tidak bisa diubah.' },
        { status: 409 }
      );
    }

    let setoranId: string;
    const isFirstRekaman = !existing;
    if (existing) {
      setoranId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('setoran')
        .insert({ peserta_id: pesertaId, week_start: weekStart, status: 'draft' })
        .select('id')
        .single();
      if (insErr || !inserted) {
        return NextResponse.json(
          { error: `Gagal buat setoran: ${insErr?.message ?? 'unknown'}` },
          { status: 500 }
        );
      }
      setoranId = inserted.id;
    }

    await ensureAudioBucket();

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await uploadAudio({
      pesertaId,
      weekStart,
      jenis: jenis as JenisRekaman,
      blob: buffer,
      contentType: file.type || 'audio/webm',
    });

    const { error: rErr } = await supabaseAdmin
      .from('rekaman')
      .upsert(
        {
          setoran_id: setoranId,
          jenis: jenis as JenisRekaman,
          audio_url: path,
          duration_seconds: durationSec,
          recorded_at: new Date().toISOString(),
          nilai: null,
          masukan: null,
          checked_at: null,
        },
        { onConflict: 'setoran_id,jenis' }
      );
    if (rErr) {
      return NextResponse.json(
        { error: `Gagal simpan rekaman: ${rErr.message}` },
        { status: 500 }
      );
    }

    // Update setoran to submitted on first rekaman
    if (isFirstRekaman || existing?.status === 'draft') {
      await supabaseAdmin
        .from('setoran')
        .update({ status: 'submitted' })
        .eq('id', setoranId);
    }

    // Build WA URL only on first submission to avoid spamming musyrif
    let waUrl: string | null = null;
    if (isFirstRekaman) {
      const cekUrl = absUrl(`/2in1/musyrif/cek/${setoranId}`);
      const waText = tplPesertaSubmitToMusyrif({
        pesertaName: peserta.name,
        pesertaGender: peserta.gender as 'ikhwan' | 'akhwat',
        kelasName: kelas.name,
        musyrifGender: musyrif.gender,
        cekUrl,
      });
      waUrl = buildWaMeUrl(musyrif.whatsapp_number, waText);
    }

    return NextResponse.json({
      ok: true,
      setoran_id: setoranId,
      musyrif_name: musyrif.name,
      wa_url: waUrl,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
