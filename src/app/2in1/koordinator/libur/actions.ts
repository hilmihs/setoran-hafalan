'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function requireKoord() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'koordinator') return null;
  return s.session;
}

/** Tambah libur kelas Maahir. program_kelas_id 'all' → berlaku semua kelas (NULL). */
export async function createLibur(formData: FormData): Promise<void> {
  const sess = await requireKoord();
  if (!sess) return;

  const kelasRaw = String(formData.get('program_kelas_id') ?? '');
  const program_kelas_id = kelasRaw === 'all' || kelasRaw === '' ? null : kelasRaw;
  const tanggal_mulai = String(formData.get('tanggal_mulai') ?? '');
  const tanggal_selesai = String(formData.get('tanggal_selesai') ?? '') || tanggal_mulai;
  const keterangan = String(formData.get('keterangan') ?? '').trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal_mulai)) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal_selesai)) return;
  if (tanggal_selesai < tanggal_mulai) return;

  await supabaseAdmin.from('program_kelas_libur').insert({
    program_kelas_id,
    tanggal_mulai,
    tanggal_selesai,
    keterangan,
    created_by_id: sess.koordinator_id,
  });

  revalidatePath('/2in1/koordinator/libur');
}

/** Hapus satu baris libur. */
export async function deleteLibur(formData: FormData): Promise<void> {
  const sess = await requireKoord();
  if (!sess) return;

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  await supabaseAdmin.from('program_kelas_libur').delete().eq('id', id);
  revalidatePath('/2in1/koordinator/libur');
}
