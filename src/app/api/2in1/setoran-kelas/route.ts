import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa } from '@/lib/program-kelas';

export const runtime = 'nodejs';

type Item = { pertemuan_id: string; anggota_id: string; halaman: number | null };

/**
 * Ketua/wakil mengisi setoran hafalan (halaman) untuk pertemuan yang SUDAH
 * berlalu — hanya kolom setoran_halaman yang disentuh, status kehadiran tak
 * diubah. Baris kehadiran harus sudah ada (presensi diisi lebih dulu).
 */
export async function POST(req: NextRequest) {
  try {
    const wa = await getSessionWa();
    if (!wa) return NextResponse.json({ error: 'Login diperlukan.' }, { status: 401 });

    const body = await req.json();
    const items = body.items as Item[];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items wajib diisi.' }, { status: 400 });
    }
    if (items.length > 500) {
      return NextResponse.json({ error: 'Terlalu banyak perubahan sekaligus.' }, { status: 400 });
    }

    // Validasi nilai + kumpulkan pertemuan yang disentuh.
    const clean: Item[] = [];
    for (const it of items) {
      if (!it?.pertemuan_id || !it?.anggota_id) {
        return NextResponse.json({ error: 'Data tidak lengkap.' }, { status: 400 });
      }
      let halaman: number | null = null;
      if (it.halaman !== null && it.halaman !== undefined && String(it.halaman) !== '') {
        const n = Number(it.halaman);
        if (!Number.isInteger(n) || n < 0 || n > 999) {
          return NextResponse.json({ error: 'Jumlah halaman tidak valid.' }, { status: 400 });
        }
        halaman = n;
      }
      clean.push({ ...it, halaman });
    }

    // Otorisasi: semua pertemuan harus milik kelas yang diketuai WA ini.
    const pertemuanIds = [...new Set(clean.map((i) => i.pertemuan_id))];
    const { data: pertemuanRows } = await supabaseAdmin
      .from('pertemuan_program')
      .select('id, program, program_kelas_id')
      .in('id', pertemuanIds);
    const kelasIds = [...new Set((pertemuanRows ?? []).map((p) => p.program_kelas_id as string))];
    const { data: kelasRows } = await supabaseAdmin
      .from('program_kelas')
      .select('id, ketua_wa, wakil_wa')
      .in('id', kelasIds);
    const bolehKelas = new Set(
      (kelasRows ?? [])
        .filter((k) => k.ketua_wa === wa || k.wakil_wa === wa)
        .map((k) => k.id as string)
    );
    const pertemuanOk = new Map(
      (pertemuanRows ?? [])
        .filter((p) => bolehKelas.has(p.program_kelas_id as string) && p.program === 'kelas_maahir')
        .map((p) => [p.id as string, true])
    );
    if (pertemuanOk.size !== pertemuanIds.length) {
      return NextResponse.json(
        { error: 'Hanya ketua/wakil kelas yang bisa mengisi setoran sesi Kelas Maahir.' },
        { status: 403 }
      );
    }

    // Update kolom setoran saja; baris kehadiran yang belum ada dilewati.
    const now = new Date().toISOString();
    let updated = 0;
    const lewat: string[] = [];
    for (const it of clean) {
      const { data, error } = await supabaseAdmin
        .from('kehadiran_peserta')
        .update({ setoran_halaman: it.halaman, updated_at: now })
        .eq('pertemuan_id', it.pertemuan_id)
        .eq('anggota_id', it.anggota_id)
        .select('id');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if ((data ?? []).length === 0) lewat.push(`${it.pertemuan_id}|${it.anggota_id}`);
      else updated += 1;
    }

    return NextResponse.json({ ok: true, updated, lewat });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
