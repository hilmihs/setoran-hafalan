import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPool } from '@/lib/pg-core';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { columnsToCounts, UJIAN_QN_SESI, UJIAN_PB_SESI, type Jenis } from '@/lib/evaluasi';
import {
  buildBerkalaPayload,
  buildUjianPayload,
  buildUjianTunggalPayload,
  fokusUjian,
  type JenisRapot,
  type RapotIdentitas,
  type SesiNilaiInput,
} from '@/lib/rapot';

const JENIS_RAPOT: JenisRapot[] = ['berkala', 'ujian', 'ujian_qn', 'ujian_pb'];

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
    if (typeof jenis_rapot !== 'string' || !JENIS_RAPOT.includes(jenis_rapot as JenisRapot)) {
      return NextResponse.json({ error: 'jenis_rapot tidak valid' }, { status: 400 });
    }
    const jenisRapot = jenis_rapot as JenisRapot;
    const fokus = fokusUjian(jenisRapot);

    // --- Halaqah + verifikasi kepemilikan pengajar ---
    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id, nama, gender, mustawa, level, batch_id, ambang_ujian')
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
      .select('id, nama, halaqah_id')
      .eq('id', peserta_id)
      .maybeSingle();
    if (!peserta) {
      return NextResponse.json({ error: 'Peserta tidak ditemukan' }, { status: 404 });
    }
    // Peserta wajib milik halaqah ini — cegah snapshot lintas-halaqah.
    if (peserta.halaqah_id !== halaqah_id) {
      return NextResponse.json({ error: 'Peserta bukan anggota halaqah ini' }, { status: 403 });
    }

    // --- Batch (opsional) + skema rapot ujian batch tsb (0058) ---
    let batchNama: string | null = null;
    let terpisah = false;
    if (halaqah.batch_id) {
      const { data: batch } = await supabaseAdmin
        .from('eval_batch')
        .select('nama, rapot_ujian_terpisah')
        .eq('id', halaqah.batch_id)
        .maybeSingle();
      batchNama = (batch?.nama as string | undefined) ?? null;
      terpisah = !!batch?.rapot_ujian_terpisah;
    }

    // Jenis rapot harus cocok dgn skema batch — jangan biarkan client menerbitkan
    // rapot gabungan untuk batch terpisah (atau sebaliknya) lewat request rakitan.
    if (terpisah && jenisRapot === 'ujian') {
      return NextResponse.json(
        { error: 'Batch ini menilai Ujian QN & PB terpisah — pakai jenis_rapot ujian_qn / ujian_pb' },
        { status: 400 }
      );
    }
    if (!terpisah && fokus) {
      return NextResponse.json(
        { error: 'Batch ini memakai rapot ujian gabungan — pakai jenis_rapot ujian' },
        { status: 400 }
      );
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
        hadir: nilaiRow ? (nilaiRow.hadir as boolean | undefined) !== false : true,
      };
    });

    // --- Guard kelengkapan sebelum terbit (server-side, jangan andalkan client) ---
    const adaBerkala = sesi.some(
      (x) => (x.jenis === 'qn' || x.jenis === 'pb') && x.done && x.hadir !== false
    );
    if (fokus) {
      // Rapot per-ujian: satu-satunya syarat adalah ujian itu sendiri sudah dinilai.
      // Berkala tidak dipakai, jadi tak boleh jadi penghalang terbit.
      const nomor = fokus === 'qn' ? UJIAN_QN_SESI : UJIAN_PB_SESI;
      const ada = sesi.some(
        (x) => x.jenis === 'ujian' && x.nomor_sesi === nomor && x.done && x.hadir !== false
      );
      if (!ada) {
        const label = fokus === 'qn' ? 'Ujian QN' : 'Ujian PB';
        return NextResponse.json(
          { error: `${label} belum dinilai — rapot belum bisa diterbitkan` },
          { status: 400 }
        );
      }
    } else if (jenisRapot === 'ujian') {
      const adaPb = sesi.some(
        (x) => x.jenis === 'ujian' && x.nomor_sesi === UJIAN_PB_SESI && x.done && x.hadir !== false
      );
      if (!adaPb) {
        return NextResponse.json(
          { error: 'Ujian PB belum dinilai — rapot ujian belum bisa diterbitkan' },
          { status: 400 }
        );
      }
      // Nilai akhir = 30% berkala + 70% PB — tanpa berkala, nilai akhir tak sah.
      if (!adaBerkala) {
        return NextResponse.json(
          { error: 'Belum ada nilai berkala — nilai akhir belum bisa dihitung' },
          { status: 400 }
        );
      }
    } else if (!adaBerkala) {
      return NextResponse.json(
        { error: 'Belum ada sesi berkala yang dinilai — rapot belum bisa diterbitkan' },
        { status: 400 }
      );
    }

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
    const payload = fokus
      ? buildUjianTunggalPayload(identitas, penerbit, tanggal, sesi, fokus, halaqah.ambang_ujian as number)
      : jenisRapot === 'berkala'
      ? buildBerkalaPayload(identitas, penerbit, tanggal, sesi, namaQn, namaPb)
      : buildUjianPayload(identitas, penerbit, tanggal, sesi, halaqah.ambang_ujian as number);

    // --- Kolom ringkas untuk query cepat ---
    let nilai_akhir: number | null = null;
    let berkala_avg: number | null = null;
    let ujian_pb_skor: number | null = null;
    let lulus: boolean | null = null;
    if (jenisRapot === 'berkala') {
      berkala_avg = payload.berkala?.rataGabungan ?? null;
    } else {
      nilai_akhir = payload.ujian?.nilaiAkhir ?? null;
      berkala_avg = payload.ujian?.berkalaAvg ?? null;
      ujian_pb_skor = payload.ujian?.ujianPbSkor ?? null;
      lulus = payload.ujian?.lulus ?? null;
    }

    const token = crypto.randomBytes(16).toString('hex');

    // --- Terbitkan ulang = supersede, ATOMIK dalam 1 transaksi ---
    // demote rapot aktif lama → insert baru (aktif) → tautkan superseded_by.
    // Dijalankan via client pg langsung (shim tak punya tx) supaya dua terbit
    // paralel ter-serialisasi oleh row-lock, bukan bergantung index sbg jaring.
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const demoted = await client.query(
        `update evaluasi_rapot set status = 'digantikan'
           where peserta_id = $1 and halaqah_id = $2 and jenis_rapot = $3 and status = 'aktif'
         returning id`,
        [peserta_id, halaqah_id, jenis_rapot]
      );
      const oldId = (demoted.rows[0]?.id as string | undefined) ?? null;

      const ins = await client.query(
        `insert into evaluasi_rapot
           (token, halaqah_id, peserta_id, jenis_rapot, nilai_akhir, berkala_avg,
            ujian_pb_skor, lulus, ambang, payload, diterbitkan_oleh)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
         returning id`,
        [
          token, halaqah_id, peserta_id, jenis_rapot, nilai_akhir, berkala_avg,
          ujian_pb_skor, lulus, payload.ambang, JSON.stringify(payload), evalPengajarId,
        ]
      );
      const newId = ins.rows[0].id as string;

      if (oldId) {
        await client.query(`update evaluasi_rapot set superseded_by = $1 where id = $2`, [newId, oldId]);
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[terbitkan] tx gagal:', txErr instanceof Error ? txErr.message : txErr);
      return NextResponse.json({ error: 'Gagal menerbitkan rapot' }, { status: 500 });
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true, token });
  } catch (e: unknown) {
    console.error('[terbitkan] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal menerbitkan rapot' }, { status: 500 });
  }
}
