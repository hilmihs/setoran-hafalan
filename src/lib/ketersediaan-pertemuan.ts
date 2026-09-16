import type { KsHariIdx, KsPeriode } from '@/types/db';

/**
 * Tanggal pertemuan sebuah halaqah.
 *
 * Halaqah yang dikirim ke CMS tilawah tanpa pertemuan tidak dapat dipakai —
 * presensi di sana bergantung pada baris pertemuan. Pembacaan produksi
 * 1 September 2026 menunjukkan tiap halaqah HITS Reguler punya 22 pertemuan
 * bernama `P1`..`P22`, jatuh persis pada hari slotnya, berturut-turut tanpa
 * melompati apa pun:
 *
 *   halaqah #947, slot Senin & Rabu 20:00–21:30
 *   2026-07-27 (Sen) · 07-29 (Rab) · 08-03 · 08-05 · … · 10-05 · 10-07
 *
 * Karena itu polanya cukup diturunkan dari tanggal mulai + hari slot + jumlah;
 * tidak dibutuhkan sumber kalender akademik terpisah. Libur nasional memang
 * tidak dilompati — sama seperti data yang sudah ada di sana — dan penyesuaian
 * semacam itu dilakukan koordinator langsung di CMS.
 */

/** JS `getUTCDay()` memakai 0 = Minggu; indeks kita 0 = Senin. */
function idxHari(d: Date): KsHariIdx {
  return (((d.getUTCDay() + 6) % 7) as KsHariIdx);
}

/**
 * Daftar tanggal `YYYY-MM-DD`, dimulai pada `mulai` (ikut dihitung bila harinya
 * cocok), sebanyak `jumlah` pertemuan.
 *
 * Mengembalikan larik kosong bila masukannya tidak masuk akal, bukan menebak:
 * hari kosong berarti tidak ada hari yang bisa dijadwalkan sama sekali.
 */
export function tanggalPertemuan(
  mulai: string,
  hariIdx: readonly KsHariIdx[],
  jumlah: number
): string[] {
  if (jumlah <= 0 || hariIdx.length === 0) return [];
  const awal = new Date(`${mulai.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(awal.getTime())) return [];

  const hari = new Set(hariIdx);
  const out: string[] = [];
  const kursor = new Date(awal);

  // Penjaga: 7 hari per pertemuan sudah jauh lebih dari cukup walau slotnya
  // hanya sekali sepekan. Mencegah perulangan tak berujung bila ada masukan aneh.
  const batasHari = jumlah * 7 + 14;
  for (let i = 0; i < batasHari && out.length < jumlah; i++) {
    if (hari.has(idxHari(kursor))) out.push(kursor.toISOString().slice(0, 10));
    kursor.setUTCDate(kursor.getUTCDate() + 1);
  }
  return out;
}

/** Nama pertemuan mengikuti kebiasaan yang sudah ada di CMS: P1, P2, … */
export function namaPertemuan(urutan: number): string {
  return `P${urutan}`;
}

/**
 * Susun `start_session_date` / `end_session_date` sesuai format CMS
 * (`YYYY-MM-DD HH:MM:SS`, waktu lokal tanpa zona).
 *
 * CMS menolak bila `end_session_date` tidak lebih besar dari `start_session_date`
 * — itulah 400 "The end session date field must be a date after start session
 * date." yang muncul bila jamnya kembar.
 */
export function rentangPertemuan(
  tanggal: string,
  waktuMulai: string,
  waktuSelesai: string
): { mulai: string; selesai: string } | null {
  const jam = (t: string) => t.slice(0, 8).padEnd(8, ':00').slice(0, 8);
  const m = `${tanggal} ${jam(waktuMulai)}`;
  const s = `${tanggal} ${jam(waktuSelesai)}`;
  if (s <= m) return null;
  return { mulai: m, selesai: s };
}

/**
 * Jumlah pertemuan yang dibuat di CMS tilawah untuk satu halaqah.
 * HITS Dasar dan Lanjutan berbeda panjangnya (50 dan 26 per keputusan 16 Sep
 * 2026), jadi angkanya dipilih dari jenjang usulan, bukan satu angka periode.
 * "Alumni HITS" sudah dilebur ke Lanjutan oleh `bacaLevel`.
 */
export function jumlahPertemuanUntuk(
  periode: Pick<KsPeriode, 'jumlah_pertemuan_dasar' | 'jumlah_pertemuan_lanjutan'>,
  level: string
): number {
  return /lanjut/i.test(level) ? periode.jumlah_pertemuan_lanjutan : periode.jumlah_pertemuan_dasar;
}
