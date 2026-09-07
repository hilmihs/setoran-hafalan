'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOneOfRoles } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export type UbahShakwaResult = { ok?: boolean; error?: string };

const STATUS = new Set(['submitted', 'in_review', 'resolved', 'closed']);

/** Koordinator menandai tindak lanjut sebuah aduan. */
export async function ubahStatusShakwa(
  _prev: UbahShakwaResult | undefined,
  fd: FormData
): Promise<UbahShakwaResult> {
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);
  const reviewerId =
    session.role === 'koordinator' ? session.koordinator_id : session.koordinator_kk_id;

  const id = String(fd.get('id') ?? '');
  const status = String(fd.get('status') ?? '');
  const catatan = String(fd.get('catatan') ?? '').trim();
  if (!id) return { error: 'Aduan tidak ditemukan.' };
  if (!STATUS.has(status)) return { error: 'Status tidak dikenal.' };

  // Gender ikut jadi syarat UPDATE, bukan cuma penyaring tampilan. Daftar di
  // halaman memang sudah dikunci ke gender koordinator, tapi action ini menerima
  // id apa pun dari form — tanpa syarat ini, tiket gender lain masih bisa
  // ditindak oleh siapa saja yang tahu id-nya. RLS tak menolong: aplikasi
  // menyambung sebagai superuser pg, jadi kendalinya harus di sini.
  const { data: terubah, error } = await supabaseAdmin
    .from('shakwa')
    .update({
      status,
      catatan_reviewer: catatan || null,
      reviewed_by_id: reviewerId,
      reviewed_by_role: session.role,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('gender', session.gender)
    .select('id');
  if (error) return { error: `Gagal menyimpan: ${error.message}` };
  // Nol baris = id tak ada, atau ada tapi milik gender lain. Keduanya dijawab
  // sama supaya balasan galat tak jadi alat menebak keberadaan tiket.
  if (!terubah || terubah.length === 0) return { error: 'Aduan tidak ditemukan.' };

  await logAudit({
    actor: session,
    action: 'shakwa.status',
    targetTable: 'shakwa',
    targetId: id,
    detail: { status },
  });

  revalidatePath('/shakwa/koordinator');
  return { ok: true };
}
