import type { RoleAccess } from '@/types/db';

export interface FeatureLink {
  href: string;
  title: string;
  navLabel: string;
  description: string;
  match: (a: RoleAccess) => boolean;
  /**
   * Sembunyikan dari semua orang kecuali superadmin (termasuk saat superadmin
   * memakai "login sebagai"). Dipakai untuk fitur yang sudah ter-deploy tetapi
   * belum diumumkan — halamannya sendiri juga menjaga diri, ini hanya menutup
   * pintunya dari menu.
   */
  superadminOnly?: boolean;
  /**
   * Akses yang tak bisa dibaca dari role sesi — diturunkan dari DB per-request
   * (pengajar kelas Maahir lewat nomor WA; pemantau rekapnya lewat flag
   * koordinator). Link hanya tampil bila opsi bersangkutan true.
   */
  requires?: 'pengajarMaahir' | 'rekapPengajarMaahir';
}

/**
 * Single source of truth: fitur yang bisa diakses per role/akses.
 * Dipakai oleh home picker (src/app/page.tsx) dan FeatureNav.
 */
export const FEATURE_LINKS: FeatureLink[] = [
  {
    href: '/2in1',
    title: 'Barnamij 2in1',
    navLabel: '2in1',
    description: 'Setoran Hafalan — Tuhfatul Athfal, Al-Jazariyyah, Syawahid',
    match: (a) =>
      a.role === 'peserta' ||
      a.role === 'musyrif' ||
      a.role === 'koordinator' ||
      a.role === 'syaikh',
  },
  {
    href: '/penilaian',
    title: 'Penilaian Pengajar',
    navLabel: 'Penilaian',
    description: 'Input skor Kualitas Bacaan & Hafalan pengajar (0–4) tiap bulan',
    match: (a) => a.role === 'koordinator' || a.role === 'syaikh',
  },
  {
    href: '/laporan',
    title: 'Laporan 2in1',
    navLabel: 'Laporan',
    description: 'Rekap & unduh laporan setoran hafalan per bulan',
    match: (a) => a.role === 'koordinator' || a.role === 'syaikh',
  },
  {
    href: '/2in1/koordinator/kehadiran',
    title: 'Kehadiran Maahir',
    navLabel: 'Kehadiran Maahir',
    description: 'Rekap kehadiran semua kelas Maahir per bulan',
    match: (a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran',
  },
  {
    href: '/kehadiran/pengajar',
    title: 'Kehadiran Program',
    navLabel: 'Kehadiran',
    description: 'Check-in kehadiran Kelas Maahir, Kajian At-Tibyan',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/kehadiran/pengajar-maahir',
    title: 'Check-in Kelas Maahir',
    navLabel: 'Check-in Maahir',
    description: 'Check-in kehadiran & materi tiap sesi kelas Maahir yang Anda ampu',
    match: () => true,
    requires: 'pengajarMaahir',
  },
  {
    href: '/2in1/koordinator/kehadiran/pengajar',
    title: 'Kehadiran Pengajar Maahir',
    navLabel: 'Kehadiran Pengajar',
    description: 'Rekap check-in & capaian materi pengajar kelas Maahir per periode 16–15',
    match: () => true,
    requires: 'rekapPengajarMaahir',
  },
  {
    href: '/kehadiran/pengajar/matrix',
    title: 'Matrix Saya',
    navLabel: 'Matrix Saya',
    description: 'Lihat nilai kompetensi (matrix) Anda bulan ini & rinciannya',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/kehadiran/ketua-kelompok/penilaian',
    title: 'Penilaian Pedagogis',
    navLabel: 'Penilaian Pedagogis',
    description: 'Nilai kompetensi pedagogis & SOP pengajar di kelompok Anda tiap bulan',
    match: (a) => a.role === 'pengajar' && a.is_ketua,
  },
  {
    href: '/2in1/koordinator/nonaktif',
    title: 'Nonaktifkan Orang',
    navLabel: 'Nonaktifkan Orang',
    description: 'Keluarkan seseorang dari daftar setoran, presensi Maahir, rekap, dan laporan',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/matrix/koordinator',
    title: 'Matrix Skill Guru',
    navLabel: 'Matrix Guru',
    description: 'Dashboard matrix penilaian pengajar HITS — Hard/Pedagogis/Soft Skill',
    // Syaikh ikut: halaman ini mendaratkannya di tampilan blok (peringkat per
    // jenis kelas), sementara koordinator mendarat di tabel 14 indikator.
    match: (a) => a.role === 'koordinator' || a.role === 'syaikh',
  },
  {
    href: '/2in1/koordinator/pedagogis',
    title: 'Pemantauan Pedagogis',
    navLabel: 'Pemantauan Pedagogis',
    description: 'Pantau skor pedagogis & SOP semua pengajar (read-only)',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/kehadiran/ketua-kelompok/penilaian',
    title: 'Penilaian Pedagogis (Kelompok)',
    navLabel: 'Penilaian Pedagogis Kelompok',
    description: 'Lihat detail rubrik pedagogis per anggota tiap kelompok (baca-saja)',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/2in1/koordinator/penilaian-ketua',
    title: 'Penilaian Ketua Kelompok',
    navLabel: 'Nilai Ketua Kelompok',
    description: 'Koordinator menilai pedagogis para ketua kelompok (yang tak dinilai di flow kelompok)',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/observasi/koordinator',
    title: 'Koordinator Ketua Kelas',
    navLabel: 'Koord. Ketua Kelas',
    description: 'Tabayyun, reminder observasi, dan monitoring kondisi halaqah',
    match: (a) => a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/hits/koordinator',
    title: 'Soft Skill HITS',
    navLabel: 'Soft Skill HITS',
    description: 'Riwayat keterangan pengajar & latihan per halaqah — kontribusi soft skill matrix',
    match: (a) => a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/haqibah/koordinator',
    title: 'Kelola Haqibah',
    navLabel: 'Kelola Haqibah',
    description: 'Kelola folder & berkas pembantu pengajar — unggah, ubah nama, hapus',
    match: (a) => a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/hits/ketua',
    title: 'Ketua Kelas HITS',
    navLabel: 'Ketua Kelas HITS',
    description: 'Isi keterangan pengajar & latihan mandiri tiap pertemuan',
    match: (a) => a.role === 'ketua_kelas',
  },
  {
    href: '/hits/pengajar',
    title: 'Ketua Kelas HITS',
    navLabel: 'Tunjuk Ketua HITS',
    description: 'Tunjuk peserta sebagai ketua kelas halaqah HITS Anda',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/ketersediaan/pengajar',
    title: 'Ketersediaan Mengajar',
    navLabel: 'Ketersediaan',
    description: 'Nyatakan slot waktu yang Anda sanggupi — lihat jadwal Anda & peminat tiap slot',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/ketersediaan/koordinator',
    title: 'Kelola Ketersediaan',
    navLabel: 'Kelola Ketersediaan',
    description: 'Periode & master slot, verifikasi isian, pasokan vs permintaan per slot',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/evaluasi/pengajar',
    title: 'Evaluasi Halaqah',
    navLabel: 'Evaluasi Halaqah',
    description: 'Nilai bacaan Qur’an peserta per sesi — hitung Lahn (tajwid) & skor',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/haqibah/pengajar',
    title: 'Haqibatul Mu’allim',
    navLabel: 'Haqibah',
    description: 'Berkas pembantu pengajar — panduan ujian, tatib/SOP, modul, kurikulum',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/evaluasi/koordinator',
    title: 'Rekap Evaluasi Halaqah',
    navLabel: 'Rekap Evaluasi',
    description: 'Dashboard evaluasi bacaan Qur’an — rekap skor & Lahn lintas halaqah',
    match: (a) => a.role === 'koordinator' || a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/shakwa/koordinator',
    title: 'Rekap Shakwa',
    navLabel: 'Shakwa',
    description: 'Aduan & permintaan yang masuk lewat formulir Shakwa — rekap harian & tindak lanjut',
    match: (a) => a.role === 'koordinator' || a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/shakwa',
    title: 'Shakwa',
    navLabel: 'Shakwa',
    description: 'Sampaikan aduan, izin, masukan, atau cerita menarik ke koordinator',
    match: () => true,
  },
  {
    href: '/akun',
    title: 'Akun',
    navLabel: 'Akun',
    description: 'Ganti password & informasi akun Anda',
    match: () => true,
  },
];

export type FeatureLinkOpts = {
  superadmin?: boolean;
  pengajarMaahir?: boolean;
  rekapPengajarMaahir?: boolean;
};

export function featureLinksFor(
  accesses: RoleAccess[],
  opts: FeatureLinkOpts = {}
): FeatureLink[] {
  return FEATURE_LINKS.filter((f) => {
    if (f.superadminOnly && !opts.superadmin) return false;
    if (f.requires && !opts[f.requires]) return false;
    return accesses.some((a) => f.match(a));
  });
}
