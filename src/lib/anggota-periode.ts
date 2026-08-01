// Rentang keanggotaan seorang peserta di satu kelas program.
//
// `active = false` memotong seseorang dari SEMUA periode sekaligus — terlalu
// kasar untuk perpindahan kelas, karena riwayat bulan-bulan sebelumnya ikut
// hilang. Pasangan `mulai_tanggal`/`selesai_tanggal` memberi batas waktu:
// pertemuan sebelum ia masuk dan sesudah ia keluar tak dihitung, sisanya utuh.

export type AnggotaPeriode = {
  created_at?: string | null;
  mulai_tanggal?: string | null;
  selesai_tanggal?: string | null;
};

/** Tanggal (YYYY-MM-DD, WIB) dari timestamp ISO. */
function tanggalWib(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/**
 * Tanggal mulai efektif di dalam periode [start, end].
 * null = sudah jadi anggota sejak sebelum periode (denominator penuh).
 *
 * `mulai_tanggal` diutamakan; bila kosong dipakai `created_at` supaya baris
 * lama yang belum punya kolom itu tetap berperilaku seperti sebelumnya.
 */
export function mulaiEfektif(a: AnggotaPeriode, start: string, end: string): string | null {
  const d = a.mulai_tanggal ?? (a.created_at ? tanggalWib(a.created_at) : null);
  if (!d) return null;
  return d > start && d <= end ? d : null;
}

/**
 * Tanggal terakhir ia masih dihitung. null = masih anggota.
 * Pertemuan setelah tanggal ini diabaikan, termasuk bila tanggalnya jatuh
 * sebelum periode (berarti seluruh periode ini tak dihitung untuknya).
 */
export function selesaiEfektif(a: AnggotaPeriode): string | null {
  return a.selesai_tanggal ?? null;
}

/** true bila pertemuan pada `tanggal` masuk hitungan anggota ini. */
export function dalamPeriode(
  a: AnggotaPeriode,
  tanggal: string,
  start: string,
  end: string
): boolean {
  const mulai = mulaiEfektif(a, start, end);
  if (mulai && tanggal < mulai) return false;
  const selesai = selesaiEfektif(a);
  if (selesai && tanggal > selesai) return false;
  return true;
}
