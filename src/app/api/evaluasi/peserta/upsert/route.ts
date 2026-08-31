import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import {
  bersihkanNamaPeserta,
  buatIdPesertaManual,
  isPesertaManual,
  namaPesertaTampil,
  URUTAN_MANUAL_DASAR,
} from '@/lib/evaluasi-peserta';

export const runtime = 'nodejs';

/**
 * Tambah peserta baru ke halaqah, atau betulkan nama peserta yang sudah ada.
 *
 * Dua jalur simpan, karena asal barisnya beda:
 * - baris `manual:` ditulis langsung ke `nama` — tak ada hulu yang memilikinya;
 * - baris hilmihs ditulis ke `nama_override`, sebab `nama` ikut dibandingkan
 *   sinkron dan suntingan langsung akan ditarik balik pull berikutnya
 *   (migrasi 0068). Nama yang sama persis dengan hulu disimpan sebagai NULL
 *   supaya pembetulan ejaan di hulu tetap mengalir.
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

    const body = (await req.json()) as { halaqah_id?: unknown; nama?: unknown; peserta_id?: unknown };
    const halaqahId = body.halaqah_id;
    if (typeof halaqahId !== 'string' || !halaqahId) {
      return NextResponse.json({ error: 'halaqah_id wajib diisi' }, { status: 400 });
    }
    const hasil = bersihkanNamaPeserta(body.nama);
    if ('error' in hasil) {
      return NextResponse.json({ error: hasil.error }, { status: 400 });
    }
    const { nama } = hasil;

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, gender, pengajar_id')
      .eq('id', halaqahId)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // Daftar sekarang dipakai dua kali: cek nama kembar dan hitung urutan.
    const { data: sudahAda } = await supabaseAdmin
      .from('eval_peserta')
      .select('id, nama, nama_override, urutan')
      .eq('halaqah_id', halaqahId)
      .eq('aktif', true);
    const daftar = sudahAda ?? [];

    const pesertaId = body.peserta_id;
    const mengubah = typeof pesertaId === 'string' && pesertaId !== '';

    // Nama kembar hampir selalu berarti pengajar menambah orang yang sama dua
    // kali (mis. sudah ada dari hilmihs dengan ejaan sedikit beda). Dibandingkan
    // terhadap nama TAMPIL, karena itulah yang dilihat pengajar di daftar.
    const bentrok = daftar.find(
      (p) =>
        namaPesertaTampil(p as { nama: string; nama_override?: string | null }).toLowerCase() ===
          nama.toLowerCase() &&
        (!mengubah || p.id !== pesertaId)
    );
    if (bentrok) {
      return NextResponse.json(
        { error: `"${nama}" sudah ada di daftar peserta halaqah ini.` },
        { status: 409 }
      );
    }

    if (mengubah) {
      const baris = daftar.find((p) => p.id === pesertaId);
      if (!baris) {
        return NextResponse.json({ error: 'Peserta tidak ada di halaqah ini' }, { status: 404 });
      }
      const patch = isPesertaManual(pesertaId)
        ? { nama }
        : { nama_override: nama === String(baris.nama) ? null : nama };
      const { error } = await supabaseAdmin
        .from('eval_peserta')
        .update(patch)
        .eq('id', pesertaId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, peserta_id: pesertaId, nama });
    }

    const urutanTerbesar = daftar.reduce(
      (max, p) => Math.max(max, Number(p.urutan) || 0),
      URUTAN_MANUAL_DASAR
    );
    const id = buatIdPesertaManual(nama);
    const { error } = await supabaseAdmin.from('eval_peserta').insert({
      id,
      nama,
      gender: halaqah.gender,
      halaqah_id: halaqahId,
      is_ketua: false,
      aktif: true,
      urutan: urutanTerbesar + 1,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, peserta_id: id, nama });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
