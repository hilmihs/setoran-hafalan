'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePengajar } from '@/lib/session';
import { KATEGORI_PENGAJAR, HALAQOH_LIST } from '@/lib/shakwa-constants';

const validKategori: string[] = KATEGORI_PENGAJAR.map((k) => k.value);
const validHalaqoh: string[] = [...HALAQOH_LIST];

export async function submitShakwaPengajar(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requirePengajar();

  const kategori = String(formData.get('kategori') ?? '').trim();
  const halaqoh = String(formData.get('halaqoh') ?? '').trim();
  const isi = String(formData.get('isi') ?? '').trim();

  if (!kategori || !halaqoh || !isi) {
    return { error: 'Semua field wajib diisi.' };
  }
  if (!validKategori.includes(kategori)) {
    return { error: 'Kategori tidak valid.' };
  }
  if (!validHalaqoh.includes(halaqoh)) {
    return { error: 'Halaqoh tidak valid.' };
  }

  const { error: insertErr } = await supabaseAdmin.from('shakwa').insert({
    pelapor_type: 'pengajar',
    pengajar_id: session.pengajar_id,
    nama: session.name,
    gender: session.gender,
    kategori,
    halaqoh,
    isi,
  });

  if (insertErr) {
    return { error: `Gagal menyimpan: ${insertErr.message}` };
  }

  return { ok: true };
}
