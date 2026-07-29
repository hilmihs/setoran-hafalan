// Pemutihan absensi: peserta tertentu pada bulan tertentu dianggap hadir penuh
// (mis. ustadzah/peserta dengan udzur yang disetujui koordinator). Baris presensi
// aslinya TIDAK diubah — hanya perhitungan laporan & SP yang mengabaikannya.

import { supabaseAdmin } from '@/lib/supabase-admin';

export type Pemutihan = {
  id: string;
  anggotaId: string;
  month: string; // 'YYYY-MM' — periode laporan (28 bulan lalu s/d 27)
  alasan: string | null;
  createdAt: string;
};

/**
 * Periode laporan Maahir memakai window 28–27, jadi tanggal 28 ke atas sudah
 * masuk bulan berikutnya. mis. 2026-06-29 → '2026-07'.
 */
export function periodeMonthOf(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  if (d < 28) return `${y}-${String(m).padStart(2, '0')}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Semua pemutihan (opsional difilter bulan). */
export async function getPemutihan(month?: string): Promise<Pemutihan[]> {
  let q = supabaseAdmin
    .from('maahir_pemutihan')
    .select('id, anggota_id, month, alasan, created_at');
  if (month) q = q.eq('month', month);
  const { data } = await q;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    anggotaId: r.anggota_id as string,
    month: r.month as string,
    alasan: (r.alasan as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** anggotaId → alasan, untuk satu bulan. */
export async function getPemutihanMap(month: string): Promise<Map<string, string | null>> {
  const rows = await getPemutihan(month);
  return new Map(rows.map((r) => [r.anggotaId, r.alasan]));
}

/** `${anggotaId}|${month}` → alasan, untuk semua bulan (dipakai SP kumulatif). */
export async function getPemutihanKeys(): Promise<Set<string>> {
  const rows = await getPemutihan();
  return new Set(rows.map((r) => `${r.anggotaId}|${r.month}`));
}

export async function addPemutihan(
  anggotaId: string,
  month: string,
  alasan: string | null,
  dibuatOleh: string | null
): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin
    .from('maahir_pemutihan')
    .upsert(
      { anggota_id: anggotaId, month, alasan, dibuat_oleh: dibuatOleh },
      { onConflict: 'anggota_id,month' }
    );
  return error ? { error: error.message } : {};
}

export async function removePemutihan(id: string): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin.from('maahir_pemutihan').delete().eq('id', id);
  return error ? { error: error.message } : {};
}
