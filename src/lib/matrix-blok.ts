// Pemecahan ranking Matrix Skill Guru jadi blok menurut kelas Maahir yang
// DIIKUTI pengajar (bukan halaqah yang ia ajar). Rata-rata hard skill sebagian
// besar berasal dari kehadiran + setoran di kelas itu, jadi mengadu pengajar
// Takhassus (hadir tiap hari, ada nilai tajwid) dengan pengajar Talaqqi (1x
// sepekan, tak menyetor) menghasilkan peringkat yang tak sebanding.
//
// Sengaja BEBAS import server (supabaseAdmin) supaya bisa dipakai komponen
// client. Query-nya ada di `matrix-blok-data.ts`.

export type MatrixBlok = 'takhassus' | 'tahfizh' | 'talaqqi' | 'lintas' | 'tanpa_kelas';

/** Urutan tampil blok, atas ke bawah. */
export const MATRIX_BLOK_ORDER: readonly MatrixBlok[] = [
  'takhassus',
  'tahfizh',
  'talaqqi',
  'lintas',
  'tanpa_kelas',
];

export const MATRIX_BLOK_LABEL: Record<MatrixBlok, string> = {
  takhassus: 'Peserta Takhassus',
  tahfizh: "Peserta Tahfidzul Qur'an",
  talaqqi: 'Peserta Talaqqi / Alumni / lainnya',
  lintas: 'Lintas jenis (anggota ≥2 blok)',
  tanpa_kelas: 'Tanpa kelas Maahir',
};

export const MATRIX_BLOK_KETERANGAN: Record<MatrixBlok, string> = {
  takhassus: 'Anggota kelas Maahir Takhassus.',
  tahfizh: "Anggota kelas Maahir Tahfidzul Qur'an 1 & 2.",
  talaqqi:
    'Anggota kelas Maahir selain Takhassus & Tahfidz (Talaqqi, Alumni, Maahir 6A/6B, Intensif, dll).',
  lintas: 'Terdaftar di lebih dari satu jenis kelas — tak bisa dimasukkan satu blok.',
  tanpa_kelas: 'Tak punya keanggotaan kelas Maahir yang aktif pada bulan ini.',
};

/** Jenis kelas yang bisa jadi blok tunggal. */
export type JenisKelasMaahir = 'takhassus' | 'tahfizh' | 'talaqqi';

function normal(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

/**
 * Jenis kelas dari NAMANYA — tak ada kolom penanda di `program_kelas`.
 * Urutan cek penting: 'Takhassus' diperiksa lebih dulu, sisanya yang bukan
 * Takhassus/Tahfizh jatuh ke 'talaqqi' (termasuk Alumni, Maahir 6A/6B,
 * Intensif, & kelas lain-lain).
 *
 * Ejaannya beragam: kelas asli di DB tertulis "Maahir Tahfidzul Qur'an 1/2"
 * (d-z), sementara orang juga menulis 'Tahfizul'/'Tahfizhul'/'Tahfizh'. Karena
 * itu pencocokan berhenti di prefiks 'tahfi' saja — semua variannya berawal
 * begitu, dan tak ada kata lain di nama kelas yang mengandungnya.
 */
export function jenisKelasMaahir(name: string): JenisKelasMaahir {
  const n = normal(name);
  if (n.includes('takhassus') || n.includes('takhasus')) return 'takhassus';
  if (n.includes('tahfi')) return 'tahfizh';
  return 'talaqqi';
}

/** Blok final dari kumpulan jenis kelas yang diikuti satu orang. */
export function blokDariJenis(jenis: ReadonlySet<JenisKelasMaahir>): MatrixBlok {
  if (jenis.size === 0) return 'tanpa_kelas';
  if (jenis.size > 1) return 'lintas';
  return [...jenis][0];
}
