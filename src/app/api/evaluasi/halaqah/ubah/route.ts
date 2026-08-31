import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { bersihkanNamaHalaqah, bersihkanLevelHalaqah } from '@/lib/evaluasi-halaqah';

export const runtime = 'nodejs';

/**
 * Betulkan identitas halaqah sendiri: nama (termasuk nomornya) dan level.
 *
 * Ditulis ke kolom `*_override`, bukan ke `nama`/`level` — keduanya ikut
 * dibandingkan sinkron hilmihs, jadi suntingan langsung akan diusulkan balik
 * jadi `update` pada pull berikutnya. Lihat src/lib/evaluasi-halaqah.ts.
 *
 * Nilai yang sama persis dengan data pusat disimpan sebagai NULL, bukan sebagai
 * salinan: dengan begitu pembetulan di hulu tetap mengalir ke halaqah yang tak
 * pernah benar-benar disunting pengajar.
 */
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

    const body = (await req.json()) as { halaqah_id?: unknown; nama?: unknown; level?: unknown };
    const halaqahId = body.halaqah_id;
    if (typeof halaqahId !== 'string' || !halaqahId) {
      return NextResponse.json({ error: 'halaqah_id wajib diisi' }, { status: 400 });
    }
    const hasilNama = bersihkanNamaHalaqah(body.nama);
    if ('error' in hasilNama) {
      return NextResponse.json({ error: hasilNama.error }, { status: 400 });
    }
    const hasilLevel = bersihkanLevelHalaqah(body.level);
    if ('error' in hasilLevel) {
      return NextResponse.json({ error: hasilLevel.error }, { status: 400 });
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, nama, level, pengajar_id')
      .eq('id', halaqahId)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    const namaOverride = hasilNama.nama === (halaqah.nama as string) ? null : hasilNama.nama;
    const levelOverride =
      hasilLevel.level === ((halaqah.level as string | null) ?? null) ? null : hasilLevel.level;

    const { error } = await supabaseAdmin
      .from('eval_halaqah')
      .update({ nama_override: namaOverride, level_override: levelOverride })
      .eq('id', halaqahId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      nama: namaOverride ?? (halaqah.nama as string),
      level: levelOverride ?? ((halaqah.level as string | null) ?? null),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
