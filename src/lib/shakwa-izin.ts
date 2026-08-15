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
  /** Pengajar pemilik izin — dipakai reverse-link mencocokkan tabayyun. */
  pengajarId: string;
  /** Halaqah yang disebut izin; null = berlaku semua halaqah pengajar hari itu. */
  halaqahId: string | null;
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

/**
 * Apakah tanggal izin masih dalam jendela pantau yatim: antara (today - hari)
 * eksklusif dan today inklusif. Membatasi daftar agar izin lama tak menumpuk.
 * Semua argumen ISO date "YYYY-MM-DD" (perbandingan leksikografis aman).
 */
export function dalamJendelaYatim(tanggal: string, today: string, hari: number): boolean {
  if (tanggal > today) return false;
  const batas = new Date(`${today}T00:00:00Z`);
  batas.setUTCDate(batas.getUTCDate() - hari);
  const batasISO = batas.toISOString().slice(0, 10);
  return tanggal > batasISO;
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
    pengajarId: args.pengajarId,
    halaqahId: cocok.halaqah_id,
  };
}

/** Tandai izin sudah terpakai oleh satu tabayyun (untuk jejak & audit). */
export async function tandaiIzinTerpakai(izinId: string, tabayyunId: string): Promise<void> {
  await supabaseAdmin
    .from('shakwa_izin')
    .update({ dipakai_tabayyun_id: tabayyunId })
    .eq('id', izinId);
}

/**
 * Reverse-link: pengajar mengirim izin SETELAH ketua kelas terlanjur mengisi
 * observasi (tabayyun sudah 'pending' tanpa alasan). Cari tabayyun cocok lalu
 * isi alasannya dari izin, supaya pengajar tak ditagih klarifikasi & tak kena
 * ghosting. Menaungi urutan input kebalikan dari forward-match di hits/ketua.
 *
 * Hanya menyentuh tabayyun 'pending' tanpa alasan_pengajar — tak menimpa yang
 * sudah 'awaiting_reason'/'decided' atau sudah punya alasan. Return id tabayyun
 * yang ter-backfill, atau null bila tak ada yang cocok.
 */
export async function backfillTabayyunDariIzin(izin: IzinCocok): Promise<string | null> {
  let q = supabaseAdmin
    .from('hits_tabayyun')
    .select('id, kondisi, keterangan:keterangan_id(tanggal)')
    .eq('pengajar_id', izin.pengajarId)
    .eq('status', 'pending')
    .is('alasan_pengajar', null);
  if (izin.halaqahId) q = q.eq('halaqah_id', izin.halaqahId);

  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    kondisi: string;
    keterangan: { tanggal: string } | null;
  }>;

  const cocok = rows.find(
    (r) => r.keterangan?.tanggal === izin.tanggal && izinCocokKondisi(izin.jenis, r.kondisi)
  );
  if (!cocok) return null;

  const { error } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      status: 'awaiting_reason',
      alasan_pengajar: alasanDariIzin(izin),
      alasan_submitted_at: izin.dikirimAt,
    })
    .eq('id', cocok.id);
  if (error) {
    console.error('backfillTabayyunDariIzin: gagal update tabayyun', error);
    return null;
  }
  await tandaiIzinTerpakai(izin.id, cocok.id);
  return cocok.id;
}

export type IzinYatimRow = {
  id: string;
  nomorTiket: string;
  pengajarNama: string;
  tanggal: string;
  jenis: ShakwaIzinJenis;
  menit: number | null;
  jadwalGanti: string | null;
  halaqahNama: string | null;
};

/**
 * Izin yang belum ke-match tabayyun apa pun (dipakai_tabayyun_id null) dalam
 * jendela pantau. Menandakan pengajar melapor tapi ketua tak mencatat
 * pelanggaran cocok — discrepancy yang perlu dilihat koordinator observasi.
 * Scope gender via pengajar.gender.
 */
export async function getIzinYatim(
  viewGender: 'ikhwan' | 'akhwat',
  today: string,
  hari = 14
): Promise<IzinYatimRow[]> {
  const { data, error } = await supabaseAdmin
    .from('shakwa_izin')
    .select(
      `id, tanggal, jenis, menit, jadwal_ganti,
       shakwa:shakwa_id(nomor_tiket),
       pengajar:pengajar_id(name, gender),
       halaqah:halaqah_id(name)`
    )
    .is('dipakai_tabayyun_id', null)
    .lte('tanggal', today)
    .order('tanggal', { ascending: false });
  if (error) {
    console.error('getIzinYatim: gagal query', error);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    tanggal: string;
    jenis: ShakwaIzinJenis;
    menit: number | null;
    jadwal_ganti: string | null;
    shakwa: { nomor_tiket: string } | null;
    pengajar: { name: string; gender: string } | null;
    halaqah: { name: string } | null;
  }>;

  return rows
    .filter((r) => r.pengajar?.gender === viewGender && dalamJendelaYatim(r.tanggal, today, hari))
    .map((r) => ({
      id: r.id,
      nomorTiket: r.shakwa?.nomor_tiket ?? '—',
      pengajarNama: r.pengajar?.name ?? '—',
      tanggal: r.tanggal,
      jenis: r.jenis,
      menit: r.menit,
      jadwalGanti: r.jadwal_ganti,
      halaqahNama: r.halaqah?.name ?? null,
    }));
}
