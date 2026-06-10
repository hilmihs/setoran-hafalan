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
    href: '/kehadiran/pengajar',
    title: 'Kehadiran Program',
    navLabel: 'Kehadiran',
    description: 'Check-in kehadiran Kelas Maahir, Kajian At-Tibyan, Muallim Najih',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/kehadiran/ketua-kelompok',
    title: 'Ketua Kelompok Pengajar',
    navLabel: 'Ketua Kelompok',
    description: 'Kelola pengajuan alasan & monitoring kehadiran anggota kelompok Anda',
    match: (a) => a.role === 'pengajar' && a.is_ketua,
  },
  {
    href: '/kehadiran/koordinator',
    title: 'Koordinator Pengajar HITS',
    navLabel: 'Koordinator HITS',
    description: 'Check-in kehadiran pengajar, reminder, dan monitoring per kelompok',
    match: (a) => a.role === 'koordinator_hits',
  },
  {
    href: '/observasi/ketua-kelas',
    title: 'Observasi Kelas',
    navLabel: 'Observasi',
    description: 'Laporan kondisi kelas dan performa pengajar',
    match: (a) => a.role === 'ketua_kelas',
  },
  {
    href: '/observasi/koordinator',
    title: 'Koordinator Ketua Kelas',
    navLabel: 'Koord. Ketua Kelas',
    description: 'Tabayyun, reminder observasi, dan monitoring kondisi halaqah',
    match: (a) => a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/shakwa/pengajar',
    title: 'SHAKWA',
    navLabel: 'SHAKWA',
    description: 'Sampaikan laporan, saran, atau kendala terkait program HITS',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/shakwa/koordinator',
    title: 'Review SHAKWA',
    navLabel: 'Review SHAKWA',
    description: 'Tinjau laporan dan aduan dari pengajar & peserta',
    match: (a) => a.role === 'koordinator_hits',
  },
];

export function featureLinksFor(accesses: RoleAccess[]): FeatureLink[] {
  return FEATURE_LINKS.filter((f) => accesses.some((a) => f.match(a)));
}
