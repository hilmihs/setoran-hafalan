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
};

/** Kelas program di mana WA ini jadi ketua atau wakil. */
export async function findKetuaProgramKelas(wa: string): Promise<ProgramKelasRow[]> {
  const { data } = await supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa')
    .or(`ketua_wa.eq.${wa},wakil_wa.eq.${wa}`);
  return (data ?? []) as ProgramKelasRow[];
}
