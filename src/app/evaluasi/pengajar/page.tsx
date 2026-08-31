import { requirePengajar } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { columnsToCounts, JENIS, type Jenis } from '@/lib/evaluasi';
import { namaHalaqahTampil, levelHalaqahTampil, type HalaqahTampil } from '@/lib/evaluasi-halaqah';
import { namaPesertaTampil } from '@/lib/evaluasi-peserta';
import { EvaluasiPengajarApp, type EvaluasiInitial, type EvWork } from './EvaluasiPengajarApp';

export const dynamic = 'force-dynamic';

interface SesiRow {
  id: string;
  jenis: string;
  nomor_sesi: number;
  tgl_jadwal: string | null;
  surat: string;
  ayat_mulai: number;
  ayat_selesai: number;
  ambang: number;
  status: string;
  dihapus: boolean;
}

// Sumbu rapot = track. Tiap track punya ujian akhirnya sendiri dan keduanya
// wajib ada: nomor_sesi 1 = Ujian QN, nomor_sesi 2 = Ujian PB (masing-masing
// menyumbang 70% nilai akhir rapot track-nya). Jadi jumlah sesi ujian dibekukan
// di 2 — TIDAK lagi mengikuti eval_config.ujian_attempts.
const UJIAN_SESSIONS = 2;

function maxSessionsFor(jenis: Jenis): number {
  return jenis === 'ujian' ? UJIAN_SESSIONS : 4;
}

function currentSessionFor(jenis: Jenis, sesiList: SesiRow[], maxSessions: number): number {
  const js = sesiList.filter((s) => s.jenis === jenis && !s.dihapus);
  const drafts = js.filter((s) => s.status === 'draft');
  if (drafts.length) return Math.max(...drafts.map((s) => s.nomor_sesi));
  const sent = js.filter((s) => s.status === 'terkirim');
  if (sent.length) return Math.min(Math.max(...sent.map((s) => s.nomor_sesi)) + 1, maxSessions);
  return 1;
}

export default async function EvaluasiPengajarPage({
  searchParams,
}: {
  searchParams: { halaqah?: string };
}) {
  const session = await requirePengajar();

  // Mirror hilmihs mengidentifikasi pengajar lewat `wa:<nomor>`, bukan id maahir.
  const evalPengajarId = await evalPengajarIdFor(session.pengajar_id);

  // SEMUA halaqah pengajar (bisa >1 lintas program). Tanpa WA cocok → tak ada.
  const { data: halaqahRows } = evalPengajarId
    ? await supabaseAdmin
        .from('eval_halaqah')
        .select('id, nama, nama_override, gender, mustawa, level, level_override, ambang_ujian, batch_id')
        .eq('pengajar_id', evalPengajarId)
        .order('nama')
    : { data: null };

  const allHalaqah = halaqahRows ?? [];
  // Pilih halaqah aktif via ?halaqah=<id>; fallback ke yang pertama.
  const halaqah =
    allHalaqah.find((h) => h.id === searchParams.halaqah) ?? allHalaqah[0] ?? null;
  const halaqahOptions = allHalaqah.map((h) => ({
    id: h.id as string,
    nama: namaHalaqahTampil(h as HalaqahTampil),
  }));

  if (!halaqah) {
    return (
      <main style={{ minHeight: '100vh', background: '#f4f2ed' }}>
        <div style={{ maxWidth: 460, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📖</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: '#1b1a17' }}>Belum ada halaqah</h1>
          <p style={{ fontSize: 13, color: '#7a766f', lineHeight: 1.5, margin: 0 }}>
            Halaqah binaan Anda belum tersinkron ke sistem evaluasi. Hubungi koordinator bila ini keliru.
          </p>
        </div>
      </main>
    );
  }

  // Peserta aktif, urut.
  const { data: pesertaRows } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, nama, nama_override, is_ketua, urutan')
    .eq('halaqah_id', halaqah.id)
    .eq('aktif', true)
    .order('urutan', { ascending: true });

  const peserta = (pesertaRows ?? []).map((p) => ({
    id: p.id as string,
    nama: namaPesertaTampil(p as { nama: string; nama_override?: string | null }),
    is_ketua: !!p.is_ketua,
    urutan: (p.urutan as number) ?? 0,
  }));

  // Sesi halaqah.
  const { data: sesiRowsRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, jenis, nomor_sesi, tgl_jadwal, surat, ayat_mulai, ayat_selesai, ambang, status, dihapus')
    .eq('halaqah_id', halaqah.id);
  const sesiRows = (sesiRowsRaw ?? []) as SesiRow[];

  // Nilai untuk sesi tsb.
  const sesiIds = sesiRows.map((s) => s.id);
  const noId = ['00000000-0000-0000-0000-000000000000'];
  const { data: nilaiRows } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select(
      'sesi_id, peserta_id, hadir, ayat_terakhir, catatan, confirmed, done, ' +
        'jk_huruf, jk_harakat, jk_mad, jk_tasydid, kh_izhar, kh_idgham_bighunnah, kh_idgham_bilaghunnah, kh_idgham_mimi, kh_iqlab, kh_ikhfa_hakiki, kh_ikhfa_syafawi'
    )
    .in('sesi_id', sesiIds.length ? sesiIds : noId);

  // Batch: menentukan skema rapot ujian (0058). Batch HITS Januari menilai ujian
  // QN & PB terpisah, nilai akhir murni skor ujian tanpa bobot evaluasi berkala.
  let rapotUjianTerpisah = false;
  let batchNama: string | null = null;
  if (halaqah.batch_id) {
    const { data: batchRow } = await supabaseAdmin
      .from('eval_batch')
      .select('nama, rapot_ujian_terpisah')
      .eq('id', halaqah.batch_id as string)
      .maybeSingle();
    rapotUjianTerpisah = !!batchRow?.rapot_ujian_terpisah;
    batchNama = (batchRow?.nama as string | undefined) ?? null;
  }

  // Config per gender.
  const { data: configRow } = await supabaseAdmin
    .from('eval_config')
    .select('nama_qn, nama_pb, jadwal')
    .eq('gender', halaqah.gender)
    .maybeSingle();

  const jadwalRaw = (configRow?.jadwal ?? {}) as Record<string, unknown>;
  const asDates = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  const config = {
    nama_qn: (configRow?.nama_qn as string) ?? 'Evaluasi QN',
    nama_pb: (configRow?.nama_pb as string) ?? 'Evaluasi PB',
    // Dibekukan di 2 (Ujian QN + Ujian PB); kolom DB tak lagi jadi acuan supaya
    // baris lama yang bernilai 1 tidak menyembunyikan Ujian PB di UI pengajar.
    ujian_attempts: UJIAN_SESSIONS,
    jadwal: {
      qn: asDates(jadwalRaw.qn),
      pb: asDates(jadwalRaw.pb),
      ujian: asDates(jadwalRaw.ujian),
    },
  };

  // Reconstruct work state keyed "<pesertaId>|<jenis>|<nomor_sesi>".
  const sesiById = new Map(sesiRows.map((s) => [s.id, s]));
  const work: Record<string, EvWork> = {};
  for (const n of nilaiRows ?? []) {
    const sesi = sesiById.get(n.sesi_id as string);
    if (!sesi) continue;
    const key = `${n.peserta_id}|${sesi.jenis}|${sesi.nomor_sesi}`;
    work[key] = {
      counts: columnsToCounts(n as Record<string, unknown>),
      catatan: (n.catatan as string | null) ?? '',
      ayat: (n.ayat_terakhir as number | null) ?? sesi.ayat_mulai,
      done: !!n.done,
      confirmed: !!n.confirmed,
      hadir: n.hadir !== false,
    };
  }

  const currentSession = {} as Record<Jenis, number>;
  for (const j of JENIS) {
    currentSession[j] = currentSessionFor(j, sesiRows, maxSessionsFor(j));
  }

  const initial: EvaluasiInitial = {
    pengajarName: session.name,
    halaqahOptions,
    halaqah: {
      id: halaqah.id as string,
      nama: namaHalaqahTampil(halaqah as HalaqahTampil),
      gender: halaqah.gender,
      mustawa: (halaqah.mustawa as number | null) ?? null,
      level: levelHalaqahTampil(halaqah as HalaqahTampil),
      // Nilai hulu + override mentah: layar edit perlu membedakan "ikut data
      // pusat" dari "disunting kebetulan sama".
      namaPusat: halaqah.nama as string,
      levelPusat: (halaqah.level as string | null) ?? null,
      levelOverride: (halaqah.level_override as string | null) ?? null,
      ambang_ujian: (halaqah.ambang_ujian as number) ?? 70,
      pesertaCount: peserta.length,
      batch: batchNama,
      rapotUjianTerpisah,
    },
    config,
    peserta,
    sesiList: sesiRows.map((s) => ({
      id: s.id,
      jenis: s.jenis as Jenis,
      nomor_sesi: s.nomor_sesi,
      tgl_jadwal: s.tgl_jadwal,
      surat: s.surat,
      ayat_mulai: s.ayat_mulai,
      ayat_selesai: s.ayat_selesai,
      ambang: s.ambang,
      status: s.status as 'draft' | 'terkirim',
      dihapus: !!s.dihapus,
    })),
    work,
    currentSession,
  };

  return <EvaluasiPengajarApp initial={initial} />;
}
