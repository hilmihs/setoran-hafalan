import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import type { RoleAccess } from '@/types/db';

/**
 * Muat semua akses role (aktif) untuk satu nomor WA. Sumber kebenaran sama
 * dengan login(): 1 WA membuka semua role-nya. PURE READ — tidak sync hash,
 * tidak stamp last_login. Dipakai impersonation & tampilan "per orang".
 *
 * Bukan di auth.ts ('use server') agar tidak terekspos sebagai server action.
 */
export async function loadAccessesForWa(wa: string): Promise<RoleAccess[]> {
  if (!wa) return [];
  const [
    { data: peserta },
    { data: musyrif },
    { data: koor },
    { data: syaikh },
    { data: pengajar },
    { data: ketuaKelas },
    { data: koorKK },
  ] = await Promise.all([
    supabaseAdmin.from('peserta').select('id, name, gender, kelas_id, active').eq('whatsapp_number', wa).maybeSingle(),
    supabaseAdmin.from('musyrif').select('id, name, gender, active').eq('whatsapp_number', wa).maybeSingle(),
    supabaseAdmin.from('koordinator').select('id, name, gender, active').eq('whatsapp_number', wa).maybeSingle(),
    supabaseAdmin.from('syaikh').select('id, name, gender, active').eq('whatsapp_number', wa).maybeSingle(),
    supabaseAdmin.from('pengajar').select('id, name, gender, kelompok_id, is_ketua, active').eq('whatsapp_number', wa).maybeSingle(),
    supabaseAdmin.from('ketua_kelas').select('id, name, gender, kelas_hits_id, hits_halaqah_id, active').eq('whatsapp_number', wa).maybeSingle(),
    supabaseAdmin.from('koordinator_ketua_kelas').select('id, name, gender, active').eq('whatsapp_number', wa).maybeSingle(),
  ]);

  const out: RoleAccess[] = [];
  if (peserta?.active) out.push({ role: 'peserta', peserta_id: peserta.id, name: peserta.name, gender: peserta.gender, kelas_id: peserta.kelas_id });
  if (musyrif?.active) out.push({ role: 'musyrif', musyrif_id: musyrif.id, name: musyrif.name, gender: musyrif.gender });
  if (koor?.active) out.push({ role: 'koordinator', koordinator_id: koor.id, name: koor.name, gender: koor.gender });
  if (syaikh?.active) out.push({ role: 'syaikh', syaikh_id: syaikh.id, name: syaikh.name, gender: syaikh.gender });
  if (pengajar?.active) out.push({ role: 'pengajar', pengajar_id: pengajar.id, name: pengajar.name, gender: pengajar.gender, kelompok_id: pengajar.kelompok_id, is_ketua: pengajar.is_ketua });
  if (ketuaKelas?.active) out.push({ role: 'ketua_kelas', ketua_kelas_id: ketuaKelas.id, name: ketuaKelas.name, gender: ketuaKelas.gender, kelas_hits_id: ketuaKelas.kelas_hits_id, hits_halaqah_id: ketuaKelas.hits_halaqah_id ?? null });
  if (koorKK?.active) out.push({ role: 'koordinator_ketua_kelas', koordinator_kk_id: koorKK.id, name: koorKK.name, gender: koorKK.gender });
  return out;
}
