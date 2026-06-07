'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender } from '@/types/db';

export async function submitShakwaPeserta(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const nama = String(formData.get('nama') ?? '').trim();
  const gender = String(formData.get('gender') ?? '') as Gender;
  const alasanKeluar = String(formData.get('alasan_keluar') ?? '').trim();
  const saranKritik = String(formData.get('saran_kritik') ?? '').trim();

  if (!nama || !gender || !alasanKeluar) {
    return { error: 'Nama, gender, dan alasan keluar wajib diisi.' };
  }
  if (!['ikhwan', 'akhwat'].includes(gender)) {
    return { error: 'Gender tidak valid.' };
  }

  const { error: insertErr } = await supabaseAdmin.from('shakwa').insert({
    pelapor_type: 'peserta',
    nama,
    gender,
    kategori: 'keluar_program',
    isi: alasanKeluar,
    saran_kritik: saranKritik || null,
  });

  if (insertErr) {
    return { error: `Gagal menyimpan: ${insertErr.message}` };
  }

  return { ok: true };
}
