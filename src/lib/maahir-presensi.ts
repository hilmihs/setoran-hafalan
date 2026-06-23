// Deteksi hari presensi Maahir yang belum diisi oleh ketua/wakil kelas.
// Strict: semua hari program sejak PRESENSI_ANCHOR wajib terisi.
// 2 program: Kelas Maahir (jadwal per-kelas), Kajian At-Tibyan (Sabtu).
// (Muallim Najih dihapus dari penilaian.)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { findKetuaProgramKelas, type ProgramKelasRow } from '@/lib/program-kelas';

export const PRESENSI_ANCHOR = '2026-06-01'; // strict mulai Juni 2026
export const TIBYAN_HARI = 'Sabtu'; // at_tibyan 08:30–10:00

export const TIBYAN_WAKTU = { mulai: '08:30', selesai: '10:00' };

export const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  at_tibyan: 'At-Tibyan',
};

// Urutan program kalau jatuh di tanggal yang sama (kelas dulu, lalu tibyan).
const PROGRAM_ORDER: Record<string, number> = {
  kelas_maahir: 0,
  at_tibyan: 1,
};

export type MaahirProgram = 'kelas_maahir' | 'at_tibyan';

export type UnfilledDay = {
  program_kelas_id: string;
  kelasName: string;
  gender: 'ikhwan' | 'akhwat';
  program: MaahirProgram;
  tanggal: string; // YYYY-MM-DD
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  namaKegiatan: string;
  totalRemaining: number;
};

// Index getUTCDay() → nama hari sesuai format jadwal_hari di seed.
const DAY_NAME: Record<number, string> = {
  0: 'Ahad',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: "Jum'at",
  6: 'Sabtu',
};

/** Nama hari (format seed) untuk tanggal kalender 'YYYY-MM-DD'. */
export function dayNameOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const idx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return DAY_NAME[idx];
}

/** Hari ini (Asia/Jakarta) sebagai 'YYYY-MM-DD'. */
export function todayJakarta(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** Semua tanggal dalam rentang [start, end] (inklusif), urut menaik. 'YYYY-MM-DD'. */
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const [ay, am, ad] = start.split('-').map(Number);
  const [ty, tm, td] = end.split('-').map(Number);
  let cur = Date.UTC(ay, am - 1, ad);
  const last = Date.UTC(ty, tm - 1, td);
  const DAY = 86400000;
  while (cur <= last) {
    const dt = new Date(cur);
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
        dt.getUTCDate()
      ).padStart(2, '0')}`
    );
    cur += DAY;
  }
  return out;
}

export type ExpectedDay = Omit<UnfilledDay, 'totalRemaining'>;

/** Hari program yang diharapkan untuk satu kelas dalam rentang [start, end]. */
export function expectedDaysInRange(
  k: ProgramKelasRow,
  start: string,
  end: string
): ExpectedDay[] {
  return expectedDaysForKelas(k, datesInRange(start, end));
}

/** Hari program yang diharapkan untuk satu kelas, untuk daftar tanggal yang diberikan. */
function expectedDaysForKelas(k: ProgramKelasRow, dates: string[]): ExpectedDay[] {
  const out: ExpectedDay[] = [];
  const jadwal = new Set(k.jadwal_hari ?? []);
  for (const tanggal of dates) {
    const hari = dayNameOf(tanggal);

    if (jadwal.has(hari)) {
      out.push({
        program_kelas_id: k.id,
        kelasName: k.name,
        gender: k.gender,
        program: 'kelas_maahir',
        tanggal,
        waktu_mulai: k.waktu_mulai,
        waktu_selesai: k.waktu_selesai,
        namaKegiatan: PROGRAM_LABEL.kelas_maahir,
      });
    }
    if (hari === TIBYAN_HARI) {
      out.push({
        program_kelas_id: k.id,
        kelasName: k.name,
        gender: k.gender,
        program: 'at_tibyan',
        tanggal,
        waktu_mulai: TIBYAN_WAKTU.mulai,
        waktu_selesai: TIBYAN_WAKTU.selesai,
        namaKegiatan: PROGRAM_LABEL.at_tibyan,
      });
    }
  }
  return out;
}

/**
 * Daftar hari presensi yang BELUM diisi oleh ketua/wakil (urut paling lama dulu).
 * "Terisi" = ada pertemuan_program untuk (kelas, program, tanggal) yang punya
 * minimal satu baris kehadiran_peserta dengan diisi_at not null.
 */
export async function getUnfilledMaahirDays(wa: string): Promise<UnfilledDay[]> {
  const myKelas = await findKetuaProgramKelas(wa);
  if (myKelas.length === 0) return [];

  const today = todayJakarta();

  // Hari yang diharapkan untuk semua kelas yang dipimpin (anchor s/d hari ini).
  const expected: ExpectedDay[] = [];
  for (const k of myKelas) expected.push(...expectedDaysInRange(k, PRESENSI_ANCHOR, today));
  if (expected.length === 0) return [];

  const kelasIds = myKelas.map((k) => k.id);

  // Pertemuan sejak anchor untuk kelas-kelas ini.
  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', PRESENSI_ANCHOR);

  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id);

  // Pertemuan mana yang sudah punya kehadiran tersubmit (diisi_at not null).
  const filledPertemuanIds = new Set<string>();
  if (pertemuanIds.length > 0) {
    const { data: kehadiran } = await supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, diisi_at')
      .in('pertemuan_id', pertemuanIds)
      .not('diisi_at', 'is', null);
    for (const k of kehadiran ?? []) filledPertemuanIds.add(k.pertemuan_id);
  }

  // Key (kelas|program|tanggal) → terisi?
  const filledKeys = new Set<string>();
  for (const p of pertemuanList ?? []) {
    if (filledPertemuanIds.has(p.id)) {
      filledKeys.add(`${p.program_kelas_id}|${p.program}|${p.tanggal}`);
    }
  }

  const unfilled = expected.filter(
    (e) => !filledKeys.has(`${e.program_kelas_id}|${e.program}|${e.tanggal}`)
  );

  unfilled.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    return PROGRAM_ORDER[a.program] - PROGRAM_ORDER[b.program];
  });

  return unfilled.map((u) => ({ ...u, totalRemaining: unfilled.length }));
}
