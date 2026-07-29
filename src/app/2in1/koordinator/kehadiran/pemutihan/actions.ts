'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { addPemutihan, removePemutihan } from '@/lib/maahir-pemutihan';

export type PemutihanResult = { ok?: boolean; error?: string };

async function requireKoordinator(): Promise<string | null> {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const ok = accesses.some(
    (a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran' || a.role === 'syaikh'
  );
  if (!ok) throw new Error('Akses ditolak.');
  return s.session?.name ?? null;
}

export async function putihkan(_prev: PemutihanResult | undefined, fd: FormData): Promise<PemutihanResult> {
  let oleh: string | null = null;
  try {
    oleh = await requireKoordinator();
  } catch {
    return { error: 'Akses ditolak.' };
  }
  const anggotaId = String(fd.get('anggota_id') ?? '');
  const month = String(fd.get('month') ?? '');
  const alasan = String(fd.get('alasan') ?? '').trim() || null;
  if (!anggotaId || !/^\d{4}-\d{2}$/.test(month)) return { error: 'Data tidak lengkap.' };
  const res = await addPemutihan(anggotaId, month, alasan, oleh);
  if (res.error) return { error: res.error };
  revalidatePath('/2in1/koordinator/kehadiran/pemutihan');
  revalidatePath('/2in1/laporan/maahir');
  return { ok: true };
}

export async function batalkanPemutihan(
  _prev: PemutihanResult | undefined,
  fd: FormData
): Promise<PemutihanResult> {
  try {
    await requireKoordinator();
  } catch {
    return { error: 'Akses ditolak.' };
  }
  const id = String(fd.get('id') ?? '');
  if (!id) return { error: 'Data tidak ditemukan.' };
  const res = await removePemutihan(id);
  if (res.error) return { error: res.error };
  revalidatePath('/2in1/koordinator/kehadiran/pemutihan');
  revalidatePath('/2in1/laporan/maahir');
  return { ok: true };
}
