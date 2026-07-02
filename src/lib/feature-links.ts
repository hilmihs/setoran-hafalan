import type { RoleAccess } from '@/types/db';

export interface FeatureLink {
  href: string;
  title: string;
  navLabel: string;
  description: string;
  match: (a: RoleAccess) => boolean;
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
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/kehadiran/pengajar',
    title: 'Kehadiran Program',
    navLabel: 'Kehadiran',
    description: 'Check-in kehadiran Kelas Maahir, Kajian At-Tibyan',
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
    href: '/matrix/koordinator',
    title: 'Matrix Skill Guru',
    navLabel: 'Matrix Guru',
    description: 'Dashboard matrix penilaian pengajar HITS — Hard/Pedagogis/Soft Skill',
    match: (a) => a.role === 'koordinator',
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
    href: '/akun',
    title: 'Akun',
    navLabel: 'Akun',
    description: 'Ganti password & informasi akun Anda',
    match: () => true,
  },
];

export function featureLinksFor(accesses: RoleAccess[]): FeatureLink[] {
  return FEATURE_LINKS.filter((f) => accesses.some((a) => f.match(a)));
}
