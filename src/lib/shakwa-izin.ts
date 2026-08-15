// Jembatan izin pra-kelas (Shakwa) → tabayyun HITS.
//
// Kenapa ada: sebelumnya pengajar yang sudah lapor izin lewat formulir tetap
// ditagih klarifikasi saat ketua kelas mengisi observasi, lalu bisa kena teguran
// ghosting 72 jam padahal alasannya sudah disampaikan lebih dulu. Di sini alasan
// itu dipakai langsung sebagai alasan_pengajar pada tabayyun yang baru dibuat —
// putusan udzur syar'i tetap milik koordinator.

import { supabaseAdmin } from './supabase-admin';
import { IZIN_JENIS_LABEL, type ShakwaIzinJenis } from './shakwa';

export type IzinCocok = {
  id: string;
  shakwaId: string;
  nomorTiket: string;
  tanggal: string;
  jenis: ShakwaIzinJenis;
  menit: number | null;
  jadwalGanti: string | null;
  alasan: string;
  /** Kapan pengajar mengirim formulirnya — dipakai sebagai alasan_submitted_at. */
  dikirimAt: string;
};

/** Penanda di awal alasan_pengajar; dipakai UI untuk menandai asal alasannya. */
export const PENANDA_IZIN = '[Izin pra-kelas';

export function alasanDariIzin(izin: IzinCocok): string {
  const rincian: string[] = [IZIN_JENIS_LABEL[izin.jenis]];
  if (izin.menit != null) rincian.push(`${izin.menit} menit`);
  if (izin.jadwalGanti) rincian.push(`diganti ${izin.jadwalGanti}`);
  return [
    `${PENANDA_IZIN} ${izin.nomorTiket}] ${izin.alasan}`,
    `Rincian yang dilaporkan pengajar: ${rincian.join(' · ')}.`,
  ].join('\n');
}

/** Alasan ini berasal dari izin pra-kelas, bukan tabayyun biasa. */
export function berasalDariIzin(alasan: string | null | undefined): boolean {
  return !!alasan && alasan.startsWith(PENANDA_IZIN);
}

/**
 * Apakah satu izin cocok dipakai untuk tabayyun berkondisi tertentu.
 * Jenis sama → cocok. TIDAK_HADIR jadi jaring pengaman: menaungi semua bentuk
 * ketidakhadiran hari itu (mirror logika fallback di cariIzinCocok).
 */
export function izinCocokKondisi(izinJenis: ShakwaIzinJenis, tabKondisi: string): boolean {
  return izinJenis === 'TIDAK_HADIR' || tabKondisi === izinJenis;
}

/**
 * Cari izin yang cocok untuk satu pertemuan. Cocok bila pengajar & tanggalnya
 * sama, dan jenisnya termasuk pelanggaran yang tercatat — atau izinnya
 * TIDAK_HADIR, yang menaungi semua bentuk ketidakhadiran hari itu.
 *
 * `halaqahId` dipakai bila izinnya menyebut halaqah tertentu; izin tanpa halaqah
 * berlaku untuk semua halaqah pengajar pada tanggal tersebut.
 */
export async function cariIzinCocok(args: {
  pengajarId: string | null | undefined;
  halaqahId: string;
  tanggal: string;
  jenisList: string[];
}): Promise<IzinCocok | null> {
  if (!args.pengajarId) return null;

  const { data } = await supabaseAdmin
    .from('shakwa_izin')
    .select(
      'id, shakwa_id, tanggal, jenis, menit, jadwal_ganti, alasan, halaqah_id, dipakai_tabayyun_id, shakwa:shakwa_id(nomor_tiket, created_at)'
    )
    .eq('pengajar_id', args.pengajarId)
    .eq('tanggal', args.tanggal);

  const rows = (data ?? []) as Array<{
    id: string;
    shakwa_id: string;
    tanggal: string;
    jenis: ShakwaIzinJenis;
    menit: number | null;
    jadwal_ganti: string | null;
    alasan: string;
    halaqah_id: string | null;
    dipakai_tabayyun_id: string | null;
    shakwa: { nomor_tiket: string; created_at: string } | null;
  }>;

  const relevan = rows.filter(
    (r) => !r.halaqah_id || r.halaqah_id === args.halaqahId
  );
  if (!relevan.length) return null;

  // Jenis yang sama lebih dulu; TIDAK_HADIR jadi jaring pengaman.
  const cocok =
    relevan.find((r) => args.jenisList.includes(r.jenis)) ??
    relevan.find((r) => r.jenis === 'TIDAK_HADIR');
  if (!cocok) return null;

  const s = cocok.shakwa as unknown as { nomor_tiket: string; created_at: string } | null;
  return {
    id: cocok.id,
    shakwaId: cocok.shakwa_id,
    nomorTiket: s?.nomor_tiket ?? '—',
    tanggal: cocok.tanggal,
    jenis: cocok.jenis,
    menit: cocok.menit,
    jadwalGanti: cocok.jadwal_ganti,
    alasan: cocok.alasan,
    dikirimAt: s?.created_at ?? new Date().toISOString(),
  };
}

/** Tandai izin sudah terpakai oleh satu tabayyun (untuk jejak & audit). */
export async function tandaiIzinTerpakai(izinId: string, tabayyunId: string): Promise<void> {
  await supabaseAdmin
    .from('shakwa_izin')
    .update({ dipakai_tabayyun_id: tabayyunId })
    .eq('id', izinId);
}
