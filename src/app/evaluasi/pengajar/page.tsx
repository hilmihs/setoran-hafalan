import { requirePengajar } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { columnsToCounts, JENIS, type Jenis } from '@/lib/evaluasi';
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
}

function maxSessionsFor(jenis: Jenis, ujianAttempts: number): number {
  return jenis === 'ujian' ? ujianAttempts : 4;
}

function currentSessionFor(jenis: Jenis, sesiList: SesiRow[], maxSessions: number): number {
  const js = sesiList.filter((s) => s.jenis === jenis);
  const drafts = js.filter((s) => s.status === 'draft');
  if (drafts.length) return Math.max(...drafts.map((s) => s.nomor_sesi));
  const sent = js.filter((s) => s.status === 'terkirim');
  if (sent.length) return Math.min(Math.max(...sent.map((s) => s.nomor_sesi)) + 1, maxSessions);
  return 1;
}

export default async function EvaluasiPengajarPage() {
  const session = await requirePengajar();

  // Halaqah pengajar (ambil yang pertama / primer).
  const { data: halaqahRows } = await supabaseAdmin
    .from('eval_halaqah')
    .select('id, nama, gender, mustawa, ambang_ujian')
    .eq('pengajar_id', session.pengajar_id)
    .order('nama')
    .limit(1);

  const halaqah = halaqahRows?.[0] ?? null;

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
    .select('id, nama, is_ketua, urutan')
    .eq('halaqah_id', halaqah.id)
    .eq('aktif', true)
    .order('urutan', { ascending: true });

  const peserta = (pesertaRows ?? []).map((p) => ({
    id: p.id as string,
    nama: p.nama as string,
    is_ketua: !!p.is_ketua,
    urutan: (p.urutan as number) ?? 0,
  }));

  // Sesi halaqah.
  const { data: sesiRowsRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, jenis, nomor_sesi, tgl_jadwal, surat, ayat_mulai, ayat_selesai, ambang, status')
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

  // Config per gender.
  const { data: configRow } = await supabaseAdmin
    .from('eval_config')
    .select('nama_qn, nama_pb, ujian_attempts, jadwal')
    .eq('gender', halaqah.gender)
    .maybeSingle();

  const jadwalRaw = (configRow?.jadwal ?? {}) as Record<string, unknown>;
  const asDates = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  const config = {
    nama_qn: (configRow?.nama_qn as string) ?? 'Evaluasi QN',
    nama_pb: (configRow?.nama_pb as string) ?? 'Evaluasi PB',
    ujian_attempts: (configRow?.ujian_attempts as number) ?? 2,
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
    currentSession[j] = currentSessionFor(j, sesiRows, maxSessionsFor(j, config.ujian_attempts));
  }

  const initial: EvaluasiInitial = {
    pengajarName: session.name,
    halaqah: {
      id: halaqah.id as string,
      nama: halaqah.nama as string,
      gender: halaqah.gender,
      mustawa: (halaqah.mustawa as number | null) ?? null,
      ambang_ujian: (halaqah.ambang_ujian as number) ?? 65,
      pesertaCount: peserta.length,
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
    })),
    work,
    currentSession,
  };

  return <EvaluasiPengajarApp initial={initial} />;
}
