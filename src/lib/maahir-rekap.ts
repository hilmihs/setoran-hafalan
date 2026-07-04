// Rekap kehadiran anggota Maahir per bulan kalender.
// Dipakai dashboard ketua kelas & koordinator (read-only).

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-page';
import {
  PROGRAM_LABEL,
  expectedDaysInRange,
  filledKeyOf,
  todayJakarta,
  type MaahirProgram,
} from '@/lib/maahir-presensi';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import type { ProgramKelasRow } from '@/lib/program-kelas';

export type StatusCode = 'H' | 'I' | 'S' | 'A' | 'T' | '-';

const STATUS_TO_CODE: Record<string, StatusCode> = {
  hadir: 'H',
  izin: 'I',
  sakit: 'S',
  tidak_ada_keterangan: 'A',
  terlambat: 'T',
};

export type RekapPertemuan = {
  id: string;
  program: MaahirProgram;
  programLabel: string;
  tanggal: string; // YYYY-MM-DD
};

export type RekapAnggota = {
  anggotaId: string;
  name: string;
  isKetua: boolean;
  isWakil: boolean;
  perPertemuan: Record<string, StatusCode>; // pertemuanId → code ('-' jika tak ada data)
  totals: { H: number; I: number; S: number; A: number; T: number };
  persenHadir: number | null; // (H+T)/jumlah pertemuan terisi; null jika belum ada pertemuan
};

export type RekapSession = {
  tanggal: string; // YYYY-MM-DD (mingguan: Senin kanonik)
  program: MaahirProgram;
  programLabel: string;
  mingguan: boolean;
  filled: boolean; // sudah ada kehadiran tersubmit?
};

export type RekapKelas = {
  kelasId: string;
  kelasName: string;
  gender: 'ikhwan' | 'akhwat';
  jadwalHari: string[];
  pertemuan: RekapPertemuan[];
  anggota: RekapAnggota[];
  sessions: RekapSession[]; // SEMUA pertemuan diharapkan (terisi & belum) + tanggal
  belumDiisi: number; // hari program diharapkan (s/d hari ini) yang belum terisi
};

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // hari terakhir bulan
  let end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  // Cap di hari ini (hanya program yang sudah berjalan).
  const today = todayJakarta();
  if (end > today) end = today;
  return { start, end };
}

/**
 * Rekap kehadiran per kelas untuk bulan tertentu.
 * @param month 'YYYY-MM'
 * @param opts.kelasIds batasi ke kelas tertentu (ketua); kosong = semua.
 * @param opts.gender filter gender (koordinator).
 */
export async function getMaahirRekap(
  month: string,
  opts?: { kelasIds?: string[]; gender?: 'ikhwan' | 'akhwat' }
): Promise<RekapKelas[]> {
  const { start, end } = monthRange(month);
  // Bulan di masa depan (start > today) → tak ada data.
  if (start > todayJakarta()) return [];

  // 1. Kelas
  let q = supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat')
    .order('gender')
    .order('name');
  if (opts?.kelasIds && opts.kelasIds.length > 0) q = q.in('id', opts.kelasIds);
  if (opts?.gender) q = q.eq('gender', opts.gender);
  const { data: kelasRows } = await q;
  const kelasList = (kelasRows ?? []) as ProgramKelasRow[];
  if (kelasList.length === 0) return [];

  const kelasIds = kelasList.map((k) => k.id);

  // Libur per kelas dalam rentang bulan (dikecualikan dari hari diharapkan).
  const liburByKelas = await getLiburDatesForKelas(kelasIds, start, end);

  // 2. Pertemuan dalam rentang bulan
  const { data: pertemuanRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', start)
    .lte('tanggal', end)
    .order('tanggal');

  const pertemuanIds = (pertemuanRows ?? []).map((p) => p.id);

  // 3. Anggota
  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name, is_ketua, is_wakil')
    .in('program_kelas_id', kelasIds)
    .order('name');

  // 4. Kehadiran (hanya yang sudah disubmit)
  const kehadiranByPertemuan = new Map<string, Map<string, StatusCode>>();
  const filledPertemuan = new Set<string>();
  if (pertemuanIds.length > 0) {
    // Paginasi: rekap semua-kelas sebulan bisa >1000 baris (limit PostgREST).
    const kehadiranRows = await fetchAllRows<{
      pertemuan_id: string;
      anggota_id: string | null;
      status: string;
      diisi_at: string | null;
    }>((from, to) =>
      supabaseAdmin
        .from('kehadiran_peserta')
        .select('pertemuan_id, anggota_id, status, diisi_at')
        .in('pertemuan_id', pertemuanIds)
        .not('diisi_at', 'is', null)
        .order('id')
        .range(from, to)
    );
    for (const k of kehadiranRows) {
      if (!k.anggota_id) continue;
      filledPertemuan.add(k.pertemuan_id);
      let m = kehadiranByPertemuan.get(k.pertemuan_id);
      if (!m) {
        m = new Map();
        kehadiranByPertemuan.set(k.pertemuan_id, m);
      }
      m.set(k.anggota_id, STATUS_TO_CODE[k.status] ?? 'A');
    }
  }

  // Hanya tampilkan pertemuan yang sudah terisi (program yang sudah berjalan & dicatat).
  const pertemuanByKelas = new Map<string, RekapPertemuan[]>();
  for (const p of pertemuanRows ?? []) {
    if (!filledPertemuan.has(p.id)) continue;
    // Anulir: pertemuan pada tanggal libur tak dihitung (kolom & denominator %).
    if (liburByKelas.get(p.program_kelas_id)?.has(p.tanggal)) continue;
    const list = pertemuanByKelas.get(p.program_kelas_id) ?? [];
    list.push({
      id: p.id,
      program: p.program as MaahirProgram,
      programLabel: PROGRAM_LABEL[p.program] ?? p.program,
      tanggal: p.tanggal,
    });
    pertemuanByKelas.set(p.program_kelas_id, list);
  }

  const anggotaByKelas = new Map<string, typeof anggotaRows>();
  for (const a of anggotaRows ?? []) {
    const list = anggotaByKelas.get(a.program_kelas_id) ?? [];
    list.push(a);
    anggotaByKelas.set(a.program_kelas_id, list);
  }

  // 5. Susun per kelas
  const result: RekapKelas[] = [];
  for (const k of kelasList) {
    const pertemuan = (pertemuanByKelas.get(k.id) ?? []).sort((a, b) =>
      a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0
    );
    const anggota: RekapAnggota[] = (anggotaByKelas.get(k.id) ?? []).map((a) => {
      const perPertemuan: Record<string, StatusCode> = {};
      const totals = { H: 0, I: 0, S: 0, A: 0, T: 0 };
      for (const p of pertemuan) {
        const code = kehadiranByPertemuan.get(p.id)?.get(a.id) ?? '-';
        perPertemuan[p.id] = code;
        if (code !== '-') totals[code]++;
      }
      const persenHadir =
        pertemuan.length > 0
          ? Math.round(((totals.H + totals.T) / pertemuan.length) * 100)
          : null;
      return {
        anggotaId: a.id,
        name: a.name,
        isKetua: a.is_ketua,
        isWakil: a.is_wakil,
        perPertemuan,
        totals,
        persenHadir,
      };
    });

    // belumDiisi: hari diharapkan (anchor bulan s/d min(akhir bulan, today)) − pertemuan terisi.
    // matchKey: harian per (program,tanggal); mingguan per pekan.
    const expected = expectedDaysInRange(k, start, end, liburByKelas.get(k.id));
    const filledKeys = new Set(
      (pertemuanRows ?? [])
        .filter((p) => p.program_kelas_id === k.id && filledPertemuan.has(p.id))
        .map((p) => filledKeyOf(k, p.program, p.tanggal))
    );
    const belumDiisi = expected.filter(
      (e) => !filledKeys.has(filledKeyOf(k, e.program, e.tanggal))
    ).length;

    const sessions: RekapSession[] = expected
      .map((e) => ({
        tanggal: e.tanggal,
        program: e.program,
        programLabel: PROGRAM_LABEL[e.program] ?? e.program,
        mingguan: e.mingguan,
        filled: filledKeys.has(filledKeyOf(k, e.program, e.tanggal)),
      }))
      .sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0));

    result.push({
      kelasId: k.id,
      kelasName: k.name,
      gender: k.gender,
      jadwalHari: k.jadwal_hari ?? [],
      pertemuan,
      anggota,
      sessions,
      belumDiisi,
    });
  }

  return result;
}
