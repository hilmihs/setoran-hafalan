import 'server-only';
import { redirect } from 'next/navigation';
import { getSession } from './session';
import { supabaseAdmin } from './supabase-admin';
import { ADMIN_WA } from './constants';
import type { RoleAccess } from '@/types/db';

const ROLE_TABLE_MAP: Record<RoleAccess['role'], { table: string; idField: keyof RoleAccess | string }> = {
  peserta: { table: 'peserta', idField: 'peserta_id' },
  musyrif: { table: 'musyrif', idField: 'musyrif_id' },
  koordinator: { table: 'koordinator', idField: 'koordinator_id' },
  syaikh: { table: 'syaikh', idField: 'syaikh_id' },
  pengajar: { table: 'pengajar', idField: 'pengajar_id' },
  koordinator_hits: { table: 'koordinator_hits', idField: 'koordinator_hits_id' },
  ketua_kelas: { table: 'ketua_kelas', idField: 'ketua_kelas_id' },
  koordinator_ketua_kelas: { table: 'koordinator_ketua_kelas', idField: 'koordinator_kk_id' },
};

async function getSessionWaNumber(session: RoleAccess): Promise<string | null> {
  const entry = ROLE_TABLE_MAP[session.role];
  if (!entry) return null;
  const id = (session as unknown as Record<string, unknown>)[entry.idField as string] as string | undefined;
  if (!id) return null;
  const { data } = await supabaseAdmin
    .from(entry.table)
    .select('whatsapp_number')
    .eq('id', id)
    .maybeSingle();
  return data?.whatsapp_number ?? null;
}

// Pastikan user yang sedang login adalah admin (WA = ADMIN_WA).
// Cek lewat accesses dulu (kalau ada role yang WA-nya ADMIN_WA), fallback ke active session.
export async function requireAdmin(): Promise<{ wa: string }> {
  const s = await getSession();
  if (!s.session) redirect('/');

  // Cek semua role yang dimiliki — kalau salah satu WA-nya match ADMIN_WA, allow.
  const candidates: RoleAccess[] = s.accesses && s.accesses.length > 0 ? s.accesses : [s.session];
  for (const acc of candidates) {
    const wa = await getSessionWaNumber(acc);
    if (wa === ADMIN_WA) return { wa };
  }

  redirect('/');
}
