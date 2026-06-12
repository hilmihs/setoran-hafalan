// Komputasi Matrix Skill Guru: 15 indikator per pengajar per bulan.
// Idempotent — aman dipanggil berulang, hasil di-upsert ke matrix_rekap.
//
// Sumber data (pengajar ↔ peserta di-link via nomor WA):
//   Hard skill : penilaian_peserta (bacaan, hafalan), rekaman setoran (tajwid),
//                kehadiran_peserta via program_kelas_anggota (3 program)
//   Pedagogis  : penilaian_pedagogis (4 aspek, oleh ketua kelompok)
//   Soft skill : observasi_kelas (kedisiplinan), checkin_pengajar (komitmen),
//                penilaian_pedagogis.skor_kepatuhan_sop (SOP)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { cyclesOfMonth } from '@/lib/week';

function pctTo4(pct: number): number {
  if (pct >= 0.9) return 4;
  if (pct >= 0.75) return 3;
  if (pct >= 0.5) return 2;
  if (pct >= 0.25) return 1;
  return 0;
}

function nilaiToSkor(n: string): number {
  if (n === 'hijau') return 4;
  if (n === 'kuning') return 2;
  return 0;
}

function avg(nums: Array<number | null>): number | null {
  const v = nums.filter((n): n is number => n !== null && n !== undefined);
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
}

export type MatrixRow = {
  pengajar_id: string;
  year_month: string;
  skor_bacaan: number | null;
  skor_hafalan: number | null;
  skor_tajwid: number | null;
  skor_kehadiran_maahir: number | null;
  skor_kehadiran_tibyan: number | null;
  skor_kehadiran_muallim: number | null;
  rata_rata_hard_skill: number | null;
  skor_metode_pengajaran: number | null;
  skor_kepatuhan_silabus: number | null;
  skor_manajemen_halaqah: number | null;
  skor_evaluasi_penguasaan: number | null;
  rata_rata_pedagogis: number | null;
  skor_kedisiplinan_waktu: number | null;
  skor_komitmen_jadwal: number | null;
  skor_tanggung_jawab: number | null;
  skor_kepatuhan_sop: number | null;
  rata_rata_soft_skill: number | null;
  rata_rata_keseluruhan: number | null;
  ranking: number | null;
};

/**
 * Hitung dan simpan matrix untuk semua pengajar aktif di bulan tertentu.
 * yearMonth format 'YYYY-MM'. Return rows sorted by ranking.
 */
export async function computeMatrixForMonth(yearMonth: string): Promise<MatrixRow[]> {
  const [yStr, mStr] = yearMonth.split('-');
  const year = parseInt(yStr);
  const month = parseInt(mStr);
  const monthStart = `${yearMonth}-01`;
  const nextMonth = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // 1. Semua pengajar aktif
  const { data: pengajarList } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, whatsapp_number')
    .eq('active', true);
  const pengajars = pengajarList ?? [];
  if (!pengajars.length) return [];

  // 2. Link pengajar → peserta via WA
  const { data: pesertaList } = await supabaseAdmin
    .from('peserta')
    .select('id, whatsapp_number')
    .eq('active', true);
  const pesertaByWa = new Map((pesertaList ?? []).map((p) => [p.whatsapp_number, p.id]));
  const pesertaIdOf = new Map<string, string>(); // pengajar_id → peserta_id
  for (const pg of pengajars) {
    const pid = pesertaByWa.get(pg.whatsapp_number);
    if (pid) pesertaIdOf.set(pg.id, pid);
  }
  const linkedPesertaIds = [...pesertaIdOf.values()];

  // 3. Penilaian bacaan + hafalan
  const { data: penilaianList } = await supabaseAdmin
    .from('penilaian_peserta')
    .select('peserta_id, skor_bacaan, skor_hafalan')
    .eq('year_month', yearMonth)
    .in('peserta_id', linkedPesertaIds.length ? linkedPesertaIds : ['00000000-0000-0000-0000-000000000000']);
  const penilaianByPeserta = new Map((penilaianList ?? []).map((p) => [p.peserta_id, p]));

  // 4. Tajwid: rata-rata nilai rekaman setoran checked di 2 cycle bulan ini
  const [h1, h2] = cyclesOfMonth(year, month);
  const { data: setoranList } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id')
    .eq('status', 'checked')
    .in('week_start', [h1, h2])
    .in('peserta_id', linkedPesertaIds.length ? linkedPesertaIds : ['00000000-0000-0000-0000-000000000000']);
  const setoranIds = (setoranList ?? []).map((s) => s.id);
  const setoranPeserta = new Map((setoranList ?? []).map((s) => [s.id, s.peserta_id]));
  const { data: rekamanList } = setoranIds.length
    ? await supabaseAdmin
        .from('rekaman')
        .select('setoran_id, nilai')
        .in('setoran_id', setoranIds)
        .not('nilai', 'is', null)
    : { data: [] };
  const tajwidScores = new Map<string, number[]>(); // peserta_id → skor[]
  for (const r of rekamanList ?? []) {
    const pid = setoranPeserta.get(r.setoran_id);
    if (!pid || !r.nilai) continue;
    const arr = tajwidScores.get(pid) ?? [];
    arr.push(nilaiToSkor(r.nilai));
    tajwidScores.set(pid, arr);
  }

  // 5. Kehadiran 3 program (via program_kelas_anggota match WA)
  const { data: anggotaList } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, whatsapp_number');
  const anggotaByWa = new Map<string, string[]>(); // wa → anggota_id[]
  for (const a of anggotaList ?? []) {
    if (!a.whatsapp_number) continue;
    const arr = anggotaByWa.get(a.whatsapp_number) ?? [];
    arr.push(a.id);
    anggotaByWa.set(a.whatsapp_number, arr);
  }
  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program')
    .gte('tanggal', monthStart)
    .lt('tanggal', nextMonth);
  const programOfPertemuan = new Map((pertemuanList ?? []).map((p) => [p.id, p.program]));
  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id);
  const { data: kehadiranList } = pertemuanIds.length
    ? await supabaseAdmin
        .from('kehadiran_peserta')
        .select('pertemuan_id, anggota_id, status')
        .in('pertemuan_id', pertemuanIds)
        .not('anggota_id', 'is', null)
    : { data: [] };
  // anggota_id → program → {hadir, total}
  const kehadiranByAnggota = new Map<string, Map<string, { hadir: number; total: number }>>();
  for (const k of kehadiranList ?? []) {
    const program = programOfPertemuan.get(k.pertemuan_id);
    if (!program || !k.anggota_id) continue;
    const perProgram = kehadiranByAnggota.get(k.anggota_id) ?? new Map();
    const c = perProgram.get(program) ?? { hadir: 0, total: 0 };
    c.total += 1;
    if (k.status === 'hadir' || k.status === 'terlambat') c.hadir += 1;
    perProgram.set(program, c);
    kehadiranByAnggota.set(k.anggota_id, perProgram);
  }

  // 6. Pedagogis + SOP
  const pengajarIds = pengajars.map((p) => p.id);
  const { data: pedagogisList } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select('pengajar_id, skor_metode_pengajaran, skor_kepatuhan_silabus, skor_manajemen_halaqah, skor_evaluasi_penguasaan, skor_kepatuhan_sop')
    .eq('year_month', yearMonth)
    .in('pengajar_id', pengajarIds);
  const pedagogisByPengajar = new Map((pedagogisList ?? []).map((p) => [p.pengajar_id, p]));

  // 7. Kedisiplinan waktu: % observasi KBBS pada kelas HITS pengajar
  const { data: kelasHitsList } = await supabaseAdmin
    .from('kelas_hits')
    .select('id, pengajar_id');
  const pengajarOfKelasHits = new Map((kelasHitsList ?? []).map((k) => [k.id, k.pengajar_id]));
  const kelasHitsIds = (kelasHitsList ?? []).map((k) => k.id);
  const { data: observasiList } = kelasHitsIds.length
    ? await supabaseAdmin
        .from('observasi_kelas')
        .select('kelas_hits_id, kondisi')
        .gte('tanggal', monthStart)
        .lt('tanggal', nextMonth)
        .in('kelas_hits_id', kelasHitsIds)
        .neq('kondisi', 'LIBUR')
    : { data: [] };
  const observasiByPengajar = new Map<string, { baik: number; total: number }>();
  for (const o of observasiList ?? []) {
    const pgId = pengajarOfKelasHits.get(o.kelas_hits_id);
    if (!pgId) continue;
    const c = observasiByPengajar.get(pgId) ?? { baik: 0, total: 0 };
    c.total += 1;
    if (o.kondisi === 'KBBS') c.baik += 1;
    observasiByPengajar.set(pgId, c);
  }

  // 8. Komitmen jadwal: % checkin hadir
  const { data: checkinList } = await supabaseAdmin
    .from('checkin_pengajar')
    .select('pengajar_id, status')
    .gte('tanggal', monthStart)
    .lt('tanggal', nextMonth)
    .is('invalidated_at', null)
    .in('pengajar_id', pengajarIds);
  const checkinByPengajar = new Map<string, { hadir: number; total: number }>();
  for (const c of checkinList ?? []) {
    const cc = checkinByPengajar.get(c.pengajar_id) ?? { hadir: 0, total: 0 };
    cc.total += 1;
    if (c.status === 'hadir') cc.hadir += 1;
    checkinByPengajar.set(c.pengajar_id, cc);
  }

  // 9. Compose rows
  const rows: MatrixRow[] = pengajars.map((pg) => {
    const pesertaId = pesertaIdOf.get(pg.id);
    const penilaian = pesertaId ? penilaianByPeserta.get(pesertaId) : undefined;

    const tajwidArr = pesertaId ? tajwidScores.get(pesertaId) : undefined;
    const skorTajwid = tajwidArr?.length
      ? Math.round(tajwidArr.reduce((a, b) => a + b, 0) / tajwidArr.length)
      : null;

    // Kehadiran: gabung semua anggota_id dengan WA sama
    const anggotaIds = anggotaByWa.get(pg.whatsapp_number) ?? [];
    const programCounts = new Map<string, { hadir: number; total: number }>();
    for (const aid of anggotaIds) {
      const per = kehadiranByAnggota.get(aid);
      if (!per) continue;
      for (const [prog, c] of per) {
        const acc = programCounts.get(prog) ?? { hadir: 0, total: 0 };
        acc.hadir += c.hadir;
        acc.total += c.total;
        programCounts.set(prog, acc);
      }
    }
    const kehadiranSkor = (prog: string): number | null => {
      const c = programCounts.get(prog);
      if (!c || c.total === 0) return null;
      return pctTo4(c.hadir / c.total);
    };

    const ped = pedagogisByPengajar.get(pg.id);

    const obs = observasiByPengajar.get(pg.id);
    const skorKedisiplinan = obs && obs.total > 0 ? pctTo4(obs.baik / obs.total) : null;

    const ci = checkinByPengajar.get(pg.id);
    const skorKomitmen = ci && ci.total > 0 ? pctTo4(ci.hadir / ci.total) : null;

    const hard = {
      skor_bacaan: penilaian?.skor_bacaan ?? null,
      skor_hafalan: penilaian?.skor_hafalan ?? null,
      skor_tajwid: skorTajwid,
      skor_kehadiran_maahir: kehadiranSkor('kelas_maahir'),
      skor_kehadiran_tibyan: kehadiranSkor('at_tibyan'),
      skor_kehadiran_muallim: kehadiranSkor('muallim_najih'),
    };
    const pedagogis = {
      skor_metode_pengajaran: ped?.skor_metode_pengajaran ?? null,
      skor_kepatuhan_silabus: ped?.skor_kepatuhan_silabus ?? null,
      skor_manajemen_halaqah: ped?.skor_manajemen_halaqah ?? null,
      skor_evaluasi_penguasaan: ped?.skor_evaluasi_penguasaan ?? null,
    };
    const soft = {
      skor_kedisiplinan_waktu: skorKedisiplinan,
      skor_komitmen_jadwal: skorKomitmen,
      skor_tanggung_jawab: null as number | null, // sumber data belum tersedia
      skor_kepatuhan_sop: ped?.skor_kepatuhan_sop ?? null,
    };

    const rataHard = avg(Object.values(hard));
    const rataPedagogis = avg(Object.values(pedagogis));
    const rataSoft = avg(Object.values(soft));
    const rataAll = avg([rataHard, rataPedagogis, rataSoft]);

    return {
      pengajar_id: pg.id,
      year_month: yearMonth,
      ...hard,
      rata_rata_hard_skill: rataHard,
      ...pedagogis,
      rata_rata_pedagogis: rataPedagogis,
      ...soft,
      rata_rata_soft_skill: rataSoft,
      rata_rata_keseluruhan: rataAll,
      ranking: null,
    };
  });

  // 10. Ranking (per keseluruhan desc, null di bawah)
  const ranked = [...rows].sort((a, b) => {
    if (a.rata_rata_keseluruhan === null && b.rata_rata_keseluruhan === null) return 0;
    if (a.rata_rata_keseluruhan === null) return 1;
    if (b.rata_rata_keseluruhan === null) return -1;
    return b.rata_rata_keseluruhan - a.rata_rata_keseluruhan;
  });
  let rank = 0;
  for (const r of ranked) {
    if (r.rata_rata_keseluruhan !== null) {
      rank += 1;
      r.ranking = rank;
    }
  }

  // 11. Upsert ke matrix_rekap
  const { error } = await supabaseAdmin
    .from('matrix_rekap')
    .upsert(
      ranked.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: 'pengajar_id,year_month' }
    );
  if (error) throw new Error(`matrix_rekap upsert: ${error.message}`);

  return ranked;
}
