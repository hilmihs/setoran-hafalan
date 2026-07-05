// Komputasi Matrix Skill Guru: 15 indikator per pengajar per bulan.
// Idempotent — aman dipanggil berulang, hasil di-upsert ke matrix_rekap.
//
// Sumber data (pengajar ↔ peserta di-link via nomor WA):
//   Hard skill : penilaian_masyaikh (bacaan, hafalan), rekaman setoran (tajwid),
//                kehadiran_peserta via program_kelas_anggota (2 program: maahir, tibyan)
//   Bobot hard skill: 9 porsi (maahir 3, tibyan 3, bacaan 1, hafalan 1, tajwid 1).
//   Pedagogis  : penilaian_pedagogis (4 aspek, oleh ketua kelompok)
//   Soft skill : hits_keterangan_harian via hits_halaqah (kedisiplinan = %KBBS,
//                tanggung jawab = %latihan beres), penilaian_pedagogis.skor_kepatuhan_sop (SOP).
//                komitmen_jadwal = rata-rata(Stabilitas Jadwal [jumlah JKG],
//                Anti-Mangkir [JKG di-tabayyun & bukan udzur syar'i = teguran]).

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchInChunks } from '@/lib/hits-rekap';
import { cyclesOfMonth } from '@/lib/week';
import { JENIS_REKAMAN } from '@/types/db';

// Bulan ≥ anchor ini dihitung live dari sumber data. Bulan < anchor (mis. 2026-05)
// adalah data historis yang di-seed manual ke matrix_rekap — JANGAN di-recompute,
// karena sumber live-nya kosong dan akan menimpa seed jadi null.
export const MATRIX_LIVE_ANCHOR = '2026-06';

/** True bila bulan ini dihitung live (≥ anchor), bukan data seed historis. */
export function isLiveMatrixMonth(yearMonth: string): boolean {
  return yearMonth >= MATRIX_LIVE_ANCHOR;
}

const RECOMPUTE_TTL_MS = 5 * 60 * 1000; // 5 menit

/**
 * Recompute matrix bulan ini HANYA bila perlu: bulan historis tak pernah dihitung
 * (lindungi seed), dan bulan live di-skip bila data masih segar (<5 menit) kecuali
 * `force` (tombol Sinkronkan). Hindari recompute berat tiap page-load.
 */
export async function syncMatrixIfStale(yearMonth: string, force = false): Promise<void> {
  if (!isLiveMatrixMonth(yearMonth)) return;
  if (!force) {
    const { data } = await supabaseAdmin
      .from('matrix_rekap')
      .select('updated_at')
      .eq('year_month', yearMonth)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.updated_at) {
      const age = Date.now() - new Date(data.updated_at).getTime();
      if (age < RECOMPUTE_TTL_MS) return; // masih segar
    }
  }
  await computeMatrixForMonth(yearMonth);
}

function pctTo4(pct: number): number {
  if (pct >= 0.9) return 4;
  if (pct >= 0.75) return 3;
  if (pct >= 0.5) return 2;
  if (pct >= 0.25) return 1;
  return 0;
}

// Komitmen — Stabilitas Jadwal: skor turun makin banyak pergantian jadwal (JKG).
function jkgTo4(n: number): number {
  if (n <= 4) return 4;
  if (n <= 6) return 3;
  if (n <= 8) return 2;
  if (n <= 10) return 1;
  return 0;
}

// Komitmen — Anti-Mangkir: skor turun per pelanggaran (JKG di-tabayyun & BUKAN
// udzur syar'i, dihitung sebagai teguran). 0 pelanggaran = standar (4).
function tegTo4(n: number): number {
  if (n <= 0) return 4;
  if (n === 1) return 3;
  if (n === 2) return 2;
  if (n === 3) return 1;
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

/**
 * Rata-rata berbobot, null di-skip beserta bobotnya (re-normalisasi atas bobot
 * yang terisi). Dipakai hard skill: 9 porsi → maahir 3, tibyan 3, bacaan 1,
 * hafalan 1, tajwid 1.
 */
function weightedAvg(parts: Array<{ v: number | null; w: number }>): number | null {
  let sum = 0;
  let wsum = 0;
  for (const { v, w } of parts) {
    if (v === null || v === undefined) continue;
    sum += v * w;
    wsum += w;
  }
  if (wsum === 0) return null;
  return Math.round((sum / wsum) * 100) / 100;
}

export type MatrixRow = {
  pengajar_id: string;
  year_month: string;
  skor_bacaan: number | null;
  skor_hafalan: number | null;
  skor_tajwid: number | null;
  skor_kehadiran_maahir: number | null;
  skor_kehadiran_tibyan: number | null;
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

  // 3. Penilaian bacaan + hafalan dari penilaian_masyaikh (diisi syaikh/koordinator
  //    via /penilaian), di-key langsung per pengajar_id.
  const pengajarIds = pengajars.map((p) => p.id);
  const { data: masyaikhList } = await supabaseAdmin
    .from('penilaian_masyaikh')
    .select('pengajar_id, skor_bacaan, skor_hafalan')
    .eq('year_month', yearMonth)
    .in('pengajar_id', pengajarIds);
  const masyaikhByPengajar = new Map((masyaikhList ?? []).map((p) => [p.pengajar_id, p]));

  // 4. Tajwid: rata-rata nilai rekaman setoran checked di 2 cycle bulan ini
  const [h1, h2] = cyclesOfMonth(year, month);
  const setoranList = linkedPesertaIds.length
    ? await fetchInChunks(linkedPesertaIds, (chunk) =>
        supabaseAdmin
          .from('setoran')
          .select('id, peserta_id')
          .eq('status', 'checked')
          .in('week_start', [h1, h2])
          .in('peserta_id', chunk)
      )
    : [];
  const setoranIds = setoranList.map((s) => s.id as string);
  const setoranPeserta = new Map(setoranList.map((s) => [s.id, s.peserta_id]));
  const rekamanList = await fetchInChunks(setoranIds, (chunk) =>
    supabaseAdmin
      .from('rekaman')
      .select('setoran_id, jenis, nilai')
      .in('setoran_id', chunk)
  );
  // nilai per (setoran, jenis); jenis yang hilang/ungraded di setoran checked
  // dihitung 0 (penalty) — peserta yang setor <3 rekaman menurunkan rata-rata.
  const nilaiBySetoranJenis = new Map<string, string | null>();
  for (const r of rekamanList ?? []) {
    nilaiBySetoranJenis.set(`${r.setoran_id}|${r.jenis}`, r.nilai ?? null);
  }
  const tajwidScores = new Map<string, number[]>(); // peserta_id → skor[]
  for (const s of setoranList ?? []) {
    const pid = setoranPeserta.get(s.id);
    if (!pid) continue;
    const arr = tajwidScores.get(pid) ?? [];
    for (const jenis of JENIS_REKAMAN) {
      const nilai = nilaiBySetoranJenis.get(`${s.id}|${jenis}`);
      arr.push(nilai ? nilaiToSkor(nilai) : 0);
    }
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
  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id as string);
  const kehadiranList = await fetchInChunks(pertemuanIds, (chunk) =>
    supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, anggota_id, status')
      .in('pertemuan_id', chunk)
      .not('anggota_id', 'is', null)
  );
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
  const { data: pedagogisList } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select('pengajar_id, skor_metode_pengajaran, skor_kepatuhan_silabus, skor_manajemen_halaqah, skor_evaluasi_penguasaan, skor_kepatuhan_sop')
    .eq('year_month', yearMonth)
    .in('pengajar_id', pengajarIds);
  const pedagogisByPengajar = new Map((pedagogisList ?? []).map((p) => [p.pengajar_id, p]));

  // 7. Soft skill dari keterangan harian HITS (batch-native):
  //    kedisiplinan = %KBBS, tanggung jawab = %latihan beres.
  const { data: halaqahList } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, pengajar_id')
    .not('pengajar_id', 'is', null);
  const pengajarOfHalaqah = new Map(
    (halaqahList ?? []).map((h) => [h.id as string, h.pengajar_id as string])
  );
  const halaqahIds = (halaqahList ?? []).map((h) => h.id as string);
  // Chunked: 421 halaqah dalam satu .in() → URL ~16KB → gagal gateway (414) →
  // data null → soft skill kosong. Lihat fetchInChunks (hits-rekap.ts).
  const keteranganList = await fetchInChunks(halaqahIds, (chunk) =>
    supabaseAdmin
      .from('hits_keterangan_harian')
      .select('id, halaqah_id, kondisi, latihan_diberikan, semua_selesai, status_latihan')
      .gte('tanggal', monthStart)
      .lt('tanggal', nextMonth)
      .in('halaqah_id', chunk)
      .neq('kondisi', 'LIBUR')
  );

  // Pelanggaran multi (sumber kebenaran F1): kedisiplinan & stabilitas jadwal
  // dihitung dari hits_pelanggaran, bukan lagi kolom kondisi tunggal.
  //   - disiplin (KBBS) = pertemuan TANPA KMT/KBLA/JKG/BADAL (TIDAK_LATIHAN tak
  //     memengaruhi disiplin — masuk ke tanggung jawab via latihan_diberikan).
  //   - Stabilitas Jadwal (JKG-count) = pertemuan dgn JKG atau BADAL (guru asli
  //     dihitung JKG saat digantikan → nambah beban anti-mangkir).
  const ketIds = (keteranganList ?? []).map((k) => k.id as string);
  const pelList = await fetchInChunks(ketIds, (chunk) =>
    supabaseAdmin
      .from('hits_pelanggaran')
      .select('keterangan_id, jenis')
      .in('keterangan_id', chunk)
  );
  const jenisByKet = new Map<string, Set<string>>();
  for (const p of pelList ?? []) {
    const set = jenisByKet.get(p.keterangan_id) ?? new Set<string>();
    set.add(p.jenis as string);
    jenisByKet.set(p.keterangan_id, set);
  }
  const DISIPLIN_PEL = ['KMT', 'KBLA', 'JKG', 'BADAL'];

  const disiplinByPengajar = new Map<string, { baik: number; total: number }>();
  const latihanByPengajar = new Map<string, { done: number; total: number }>();
  const jkgByPengajar = new Map<string, number>(); // pengajar_id → jumlah pertemuan JKG/BADAL
  for (const k of keteranganList ?? []) {
    const pgId = pengajarOfHalaqah.get(k.halaqah_id);
    if (!pgId) continue;
    const jenis = jenisByKet.get(k.id as string) ?? new Set<string>();

    const d = disiplinByPengajar.get(pgId) ?? { baik: 0, total: 0 };
    d.total += 1;
    if (!DISIPLIN_PEL.some((j) => jenis.has(j))) d.baik += 1;
    disiplinByPengajar.set(pgId, d);

    const l = latihanByPengajar.get(pgId) ?? { done: 0, total: 0 };
    l.total += 1;
    if (k.latihan_diberikan && (k.semua_selesai || k.status_latihan === 'SML')) l.done += 1;
    latihanByPengajar.set(pgId, l);

    // Stabilitas Jadwal: pertemuan dgn pergantian jadwal (JKG) atau badal.
    if (jenis.has('JKG') || jenis.has('BADAL')) jkgByPengajar.set(pgId, (jkgByPengajar.get(pgId) ?? 0) + 1);
  }

  // 8. Komitmen — Anti-Mangkir: JKG yang di-tabayyun & diputus BUKAN udzur syar'i
  //    oleh koordinator ketua kelas = pelanggaran (dihitung seperti teguran).
  const tabayyunList = await fetchInChunks(pengajarIds, (chunk) =>
    supabaseAdmin
      .from('hits_tabayyun')
      .select('pengajar_id')
      .eq('status', 'decided')
      .eq('is_udzur_syari', false)
      .gte('decided_at', monthStart)
      .lt('decided_at', nextMonth)
      .in('pengajar_id', chunk)
  );
  const mangkirByPengajar = new Map<string, number>();
  for (const t of tabayyunList) {
    const pgId = t.pengajar_id as string | null;
    if (!pgId) continue;
    mangkirByPengajar.set(pgId, (mangkirByPengajar.get(pgId) ?? 0) + 1);
  }

  // 9. Compose rows
  const rows: MatrixRow[] = pengajars.map((pg) => {
    const pesertaId = pesertaIdOf.get(pg.id);
    const masyaikh = masyaikhByPengajar.get(pg.id);

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

    const disp = disiplinByPengajar.get(pg.id);
    const skorKedisiplinan = disp && disp.total > 0 ? pctTo4(disp.baik / disp.total) : null;

    const lat = latihanByPengajar.get(pg.id);
    const skorTanggungJawab = lat && lat.total > 0 ? pctTo4(lat.done / lat.total) : null;

    // Komitmen Jadwal = rata-rata(Stabilitas Jadwal, Anti-Mangkir). Hanya dinilai
    // bila pengajar punya data HITS (≥1 keterangan non-libur), selain itu null.
    const skorKomitmen =
      disp && disp.total > 0
        ? avg([jkgTo4(jkgByPengajar.get(pg.id) ?? 0), tegTo4(mangkirByPengajar.get(pg.id) ?? 0)])
        : null;

    const hard = {
      skor_bacaan: masyaikh?.skor_bacaan ?? null,
      skor_hafalan: masyaikh?.skor_hafalan ?? null,
      skor_tajwid: skorTajwid,
      skor_kehadiran_maahir: kehadiranSkor('kelas_maahir'),
      skor_kehadiran_tibyan: kehadiranSkor('at_tibyan'),
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
      skor_tanggung_jawab: skorTanggungJawab,
      skor_kepatuhan_sop: ped?.skor_kepatuhan_sop ?? null,
    };

    // Hard skill berbobot 9 porsi: kehadiran maahir 3, kehadiran tibyan 3,
    // bacaan 1, hafalan 1, tajwid 1. (Muallim Najih dihapus dari penilaian.)
    const rataHard = weightedAvg([
      { v: hard.skor_kehadiran_maahir, w: 3 },
      { v: hard.skor_kehadiran_tibyan, w: 3 },
      { v: hard.skor_bacaan, w: 1 },
      { v: hard.skor_hafalan, w: 1 },
      { v: hard.skor_tajwid, w: 1 },
    ]);
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

  // 10. Ranking: utamakan kelengkapan aspek (Hard/Pedagogis/Soft terisi) lalu
  //     rata-rata keseluruhan. Pengajar yang dinilai penuh 3 aspek di atas yang
  //     baru terisi 1-2 aspek, walau rata-ratanya lebih rendah.
  const aspekLengkap = (r: MatrixRow): number =>
    (r.rata_rata_hard_skill !== null ? 1 : 0) +
    (r.rata_rata_pedagogis !== null ? 1 : 0) +
    (r.rata_rata_soft_skill !== null ? 1 : 0);
  const ranked = [...rows].sort((a, b) => {
    if (a.rata_rata_keseluruhan === null && b.rata_rata_keseluruhan === null) return 0;
    if (a.rata_rata_keseluruhan === null) return 1;
    if (b.rata_rata_keseluruhan === null) return -1;
    const da = aspekLengkap(a);
    const db = aspekLengkap(b);
    if (da !== db) return db - da; // lebih lengkap dulu
    return b.rata_rata_keseluruhan - a.rata_rata_keseluruhan;
  });
  let rank = 0;
  for (const r of ranked) {
    if (r.rata_rata_keseluruhan !== null) {
      rank += 1;
      r.ranking = rank;
    }
  }

  // 11. Kosongkan ranking basi milik pengajar non-aktif di bulan ini. Compute
  //     hanya iterasi pengajar aktif, jadi baris pengajar yang kini non-aktif
  //     menyimpan ranking lama dan bisa bentrok (rank duplikat) dgn ranking baru.
  await supabaseAdmin
    .from('matrix_rekap')
    .update({ ranking: null })
    .eq('year_month', yearMonth)
    .not('ranking', 'is', null);

  // 12. Upsert ke matrix_rekap (ranking pengajar aktif ditulis ulang di sini)
  const { error } = await supabaseAdmin
    .from('matrix_rekap')
    .upsert(
      ranked.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: 'pengajar_id,year_month' }
    );
  if (error) throw new Error(`matrix_rekap upsert: ${error.message}`);

  return ranked;
}
