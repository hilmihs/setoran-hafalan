// Helper kelas program Maahir (kehadiran). Ketua/wakil diidentifikasi
// nomor WA karena bisa peserta, musyrif, atau koordinator.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import type { RoleAccess } from '@/types/db';

const ROLE_TABLE: Record<string, { table: string; idField: string }> = {
  peserta: { table: 'peserta', idField: 'peserta_id' },
  musyrif: { table: 'musyrif', idField: 'musyrif_id' },
  koordinator: { table: 'koordinator', idField: 'koordinator_id' },
  syaikh: { table: 'syaikh', idField: 'syaikh_id' },
  pengajar: { table: 'pengajar', idField: 'pengajar_id' },
};

/** Nomor WA (normalized) dari sesi aktif — cek semua akses role. */
export async function getSessionWa(): Promise<string | null> {
  const s = await getSession();
  const accesses: RoleAccess[] = s.accesses ?? (s.session ? [s.session] : []);
  for (const a of accesses) {
    const cfg = ROLE_TABLE[a.role];
    if (!cfg) continue;
    const id = (a as unknown as Record<string, string>)[cfg.idField];
    if (!id) continue;
    const { data } = await supabaseAdmin
      .from(cfg.table)
      .select('whatsapp_number')
      .eq('id', id)
      .maybeSingle();
    if (data?.whatsapp_number) return data.whatsapp_number;
  }
  return null;
}

export type ProgramKelasRow = {
  id: string;
  name: string;
  gender: 'ikhwan' | 'akhwat';
  jadwal_hari: string[];
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  ketua_wa: string | null;
  wakil_wa: string | null;
  self_attendance: boolean;
  presensi_sifat: 'harian' | 'mingguan';
};

const PK_COLS = 'id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat';

/**
 * Kelas program di mana WA ini jadi ketua atau wakil.
 * Kelas self_attendance DIKECUALIKAN — seluruh presensinya (kelas_maahir &
 * At-Tibyan) diisi tiap peserta sendiri, jadi ketua tak mengisi apa pun.
 */
export async function findKetuaProgramKelas(wa: string): Promise<ProgramKelasRow[]> {
  const { data } = await supabaseAdmin
    .from('program_kelas')
    .select(PK_COLS)
    .eq('self_attendance', false)
    .or(`ketua_wa.eq.${wa},wakil_wa.eq.${wa}`);
  return (data ?? []) as ProgramKelasRow[];
}

/**
 * Semua kelas di mana WA ini ketua atau wakil — TERMASUK kelas self_attendance
 * (takhassus). Dipakai fitur pengajuan libur (ketua/wakil takhassus juga boleh).
 */
export async function findKetuaWakilKelas(wa: string): Promise<ProgramKelasRow[]> {
  const { data } = await supabaseAdmin
    .from('program_kelas')
    .select(PK_COLS)
    .or(`ketua_wa.eq.${wa},wakil_wa.eq.${wa}`);
  return (data ?? []) as ProgramKelasRow[];
}

/** Ambil satu kelas presensi-mandiri by id. null bila bukan self_attendance. */
export async function getSelfAttendanceKelas(id: string): Promise<ProgramKelasRow | null> {
  const { data } = await supabaseAdmin
    .from('program_kelas')
    .select(PK_COLS)
    .eq('id', id)
    .eq('self_attendance', true)
    .maybeSingle();
  return (data as ProgramKelasRow | null) ?? null;
}

/** Keanggotaan kelas presensi-mandiri untuk WA ini (akses lewat akun sendiri). */
export async function findSelfAttendanceMembership(
  wa: string
): Promise<{ kelas: ProgramKelasRow; anggotaId: string; anggotaName: string } | null> {
  const { data } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select(`id, name, program_kelas:program_kelas_id(${PK_COLS})`)
    .eq('whatsapp_number', wa);
  for (const a of data ?? []) {
    const k = a.program_kelas as unknown as ProgramKelasRow | null;
    if (k?.self_attendance) return { kelas: k, anggotaId: a.id as string, anggotaName: a.name as string };
  }
  return null;
}
