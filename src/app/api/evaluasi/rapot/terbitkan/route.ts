import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { columnsToCounts, type Jenis } from '@/lib/evaluasi';
import {
  buildBerkalaPayload,
  buildUjianPayload,
  type RapotIdentitas,
  type SesiNilaiInput,
} from '@/lib/rapot';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    const pengajar = accesses.find((a) => a.role === 'pengajar') as
      | { role: 'pengajar'; pengajar_id: string; name: string }
      | undefined;
    if (!pengajar) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      halaqah_id?: unknown;
      peserta_id?: unknown;
      jenis_rapot?: unknown;
    };
    const halaqah_id = body.halaqah_id;
    const peserta_id = body.peserta_id;
    const jenis_rapot = body.jenis_rapot;

    if (typeof halaqah_id !== 'string' || !halaqah_id) {
      return NextResponse.json({ error: 'halaqah_id wajib diisi' }, { status: 400 });
    }
    if (typeof peserta_id !== 'string' || !peserta_id) {
      return NextResponse.json({ error: 'peserta_id wajib diisi' }, { status: 400 });
    }
    if (jenis_rapot !== 'berkala' && jenis_rapot !== 'ujian') {
      return NextResponse.json({ error: 'jenis_rapot tidak valid' }, { status: 400 });
    }

    // --- Halaqah + verifikasi kepemilikan pengajar ---
    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id, nama, gender, mustawa, level, batch_id')
      .eq('id', halaqah_id)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // --- Peserta ---
    const { data: peserta } = await supabaseAdmin
      .from('eval_peserta')
      .select('id, nama')
      .eq('id', peserta_id)
      .maybeSingle();
    if (!peserta) {
      return NextResponse.json({ error: 'Peserta tidak ditemukan' }, { status: 404 });
    }

    // --- Batch (opsional) ---
    let batchNama: string | null = null;
    if (halaqah.batch_id) {
      const { data: batch } = await supabaseAdmin
        .from('eval_batch')
        .select('nama')
        .eq('id', halaqah.batch_id)
        .maybeSingle();
      batchNama = (batch?.nama as string | undefined) ?? null;
    }

    // --- Config by gender (nama_qn, nama_pb) ---
    const { data: config } = await supabaseAdmin
      .from('eval_config')
      .select('nama_qn, nama_pb')
      .eq('gender', halaqah.gender)
      .maybeSingle();
    const namaQn = (config?.nama_qn as string | undefined) ?? undefined;
    const namaPb = (config?.nama_pb as string | undefined) ?? undefined;

    // --- Semua sesi halaqah (tidak dihapus) ---
    const { data: sesiRows } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id, jenis, nomor_sesi, tgl_jadwal')
      .eq('halaqah_id', halaqah_id)
      .not('dihapus', 'is', true);

    const sesiList = sesiRows ?? [];
    const sesiIds = sesiList.map((r) => r.id as string);

    // --- Nilai peserta ini untuk sesi di atas ---
    const nilaiBySesi = new Map<string, Record<string, unknown>>();
    if (sesiIds.length > 0) {
      const { data: nilaiRows } = await supabaseAdmin
        .from('evaluasi_nilai')
        .select('*')
        .eq('peserta_id', peserta_id)
        .in('sesi_id', sesiIds);
      for (const n of nilaiRows ?? []) {
        nilaiBySesi.set(n.sesi_id as string, n as Record<string, unknown>);
      }
    }

    // --- Susun SesiNilaiInput[] ---
    const sesi: SesiNilaiInput[] = sesiList.map((row) => {
      const nilaiRow = nilaiBySesi.get(row.id as string);
      return {
        jenis: row.jenis as Jenis,
        nomor_sesi: row.nomor_sesi as number,
        counts: columnsToCounts(nilaiRow ?? {}),
        catatan: (nilaiRow?.catatan as string | undefined) ?? '',
        tgl: (row.tgl_jadwal as string | null) ?? null,
        done: !!nilaiRow?.done,
      };
    });

    // --- Identitas & meta terbit ---
    const identitas: RapotIdentitas = {
      peserta: peserta.nama as string,
      halaqah: halaqah.nama as string,
      level: (halaqah.level as string | null) ?? null,
      mustawa: (halaqah.mustawa as number | null) ?? null,
      gender: halaqah.gender as string,
      batch: batchNama,
    };
    const penerbit = pengajar.name;
    const tanggal = new Date().toISOString();

    // --- Build payload ---
    const payload =
      jenis_rapot === 'berkala'
        ? buildBerkalaPayload(identitas, penerbit, tanggal, sesi, namaQn, namaPb)
        : buildUjianPayload(identitas, penerbit, tanggal, sesi);

    // --- Kolom ringkas untuk query cepat ---
    let nilai_akhir: number | null = null;
    let berkala_avg: number | null = null;
    let ujian_pb_skor: number | null = null;
    let lulus: boolean | null = null;
    if (jenis_rapot === 'berkala') {
      berkala_avg = payload.berkala?.rataGabungan ?? null;
    } else {
      nilai_akhir = payload.ujian?.nilaiAkhir ?? null;
      berkala_avg = payload.ujian?.berkalaAvg ?? null;
      ujian_pb_skor = payload.ujian?.ujianPbSkor ?? null;
      lulus = payload.ujian?.lulus ?? null;
    }

    const token = crypto.randomBytes(16).toString('hex');

    const { error } = await supabaseAdmin.from('evaluasi_rapot').insert({
      token,
      halaqah_id,
      peserta_id,
      jenis_rapot,
      nilai_akhir,
      berkala_avg,
      ujian_pb_skor,
      lulus,
      ambang: 70,
      payload,
      diterbitkan_oleh: evalPengajarId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, token });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
