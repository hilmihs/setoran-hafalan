import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { ensureAudioBucket, uploadAudioMusyrif } from '@/lib/storage';
import { currentCycleStart, isValidCycleStart } from '@/lib/week';
import { buildWaMeUrl, tplMusyrifSubmitToSyaikh } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { JENIS_REKAMAN, type JenisRekaman, type Gender } from '@/types/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    if (!s.session || s.session.role !== 'musyrif') {
      return NextResponse.json(
        { error: 'Anda harus login sebagai musyrif.' },
        { status: 401 }
      );
    }
    const musyrifId = s.session.musyrif_id;
    const musyrifGender = s.session.gender;
    const musyrifName = s.session.name;

    const form = await req.formData();
    const files: Record<JenisRekaman, File | null> = {
      tuhfatul_athfal: form.get('audio_tuhfatul_athfal') as File | null,
      jazariyyah: form.get('audio_jazariyyah') as File | null,
      syawahid: form.get('audio_syawahid') as File | null,
    };
    const durations: Record<JenisRekaman, number | null> = {
      tuhfatul_athfal: numOrNull(form.get('duration_tuhfatul_athfal')),
      jazariyyah: numOrNull(form.get('duration_jazariyyah')),
      syawahid: numOrNull(form.get('duration_syawahid')),
    };
    for (const j of JENIS_REKAMAN) {
      if (!files[j] || files[j]!.size === 0) {
        return NextResponse.json(
          { error: `Rekaman ${j} belum ada` },
          { status: 400 }
        );
      }
    }

    // Resolve syaikh aktif untuk gender ini
    const { data: syaikh, error: syaikhErr } = await supabaseAdmin
      .from('syaikh')
      .select('id, name, gender, whatsapp_number')
      .eq('gender', musyrifGender)
      .eq('active', true)
      .maybeSingle();
    if (syaikhErr || !syaikh) {
      return NextResponse.json(
        { error: 'Belum ada Syaikh/Ustadzah aktif untuk gender Anda.' },
        { status: 404 }
      );
    }

    // Cycle berjalan (default) ATAU periode lampau (backfill) bila client kirim
    // week_start valid (sejak anchor, bukan masa depan). Selain itu → cycle berjalan.
    const rawWeek = form.get('week_start');
    const weekStart =
      typeof rawWeek === 'string' && isValidCycleStart(rawWeek) ? rawWeek : currentCycleStart();

    const { data: existing } = await supabaseAdmin
      .from('setoran_musyrif')
      .select('id, status')
      .eq('musyrif_id', musyrifId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (existing && existing.status === 'checked') {
      return NextResponse.json(
        { error: 'Setoran cycle ini sudah dicek, tidak bisa diubah.' },
        { status: 409 }
      );
    }

    let setoranId: string;
    if (existing) {
      setoranId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('setoran_musyrif')
        .insert({ musyrif_id: musyrifId, week_start: weekStart, status: 'draft' })
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

    const recordedAt = new Date().toISOString();
    for (const jenis of JENIS_REKAMAN) {
      const file = files[jenis]!;
      const buffer = Buffer.from(await file.arrayBuffer());
      const path = await uploadAudioMusyrif({
        musyrifId,
        weekStart,
        jenis,
        blob: buffer,
        contentType: file.type || 'audio/webm',
      });
      const { error: rErr } = await supabaseAdmin
        .from('rekaman_musyrif')
        .upsert(
          {
            setoran_musyrif_id: setoranId,
            jenis,
            audio_url: path,
            duration_seconds: durations[jenis],
            recorded_at: recordedAt,
            nilai: null,
            masukan: null,
            checked_at: null,
          },
          { onConflict: 'setoran_musyrif_id,jenis' }
        );
      if (rErr) {
        return NextResponse.json(
          { error: `Gagal simpan rekaman ${jenis}: ${rErr.message}` },
          { status: 500 }
        );
      }
    }

    const { error: sErr } = await supabaseAdmin
      .from('setoran_musyrif')
      .update({ status: 'submitted' })
      .eq('id', setoranId);
    if (sErr) {
      return NextResponse.json(
        { error: `Gagal update status: ${sErr.message}` },
        { status: 500 }
      );
    }

    const cekUrl = absUrl(`/syaikh/cek/${setoranId}`);
    const waText = tplMusyrifSubmitToSyaikh({
      musyrifName,
      musyrifGender,
      syaikhGender: syaikh.gender as Gender,
      cekUrl,
    });
    const waUrl = buildWaMeUrl(syaikh.whatsapp_number, waText);

    return NextResponse.json({
      ok: true,
      setoran_id: setoranId,
      syaikh_name: syaikh.name,
      wa_url: waUrl,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const n = parseInt(String(v));
  return Number.isFinite(n) ? n : null;
}
