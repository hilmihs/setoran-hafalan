// Single source of truth untuk 14 indikator Matrix Skill Guru.
// Label, kategori, standar, dan deskripsi diambil dari templat penilaian
// (Matrix Guru xlsx baris 1-4). Dipakai oleh tabel koordinator, halaman detail
// pengajar, radar chart, dan export Excel — supaya konsisten satu tempat.

import type { MatrixRow } from '@/lib/matrix-compute';

export type Kategori = 'hard' | 'pedagogis' | 'soft';

// key = nama kolom skor_* di matrix_rekap / MatrixRow.
export type IndikatorKey =
  | 'skor_bacaan'
  | 'skor_hafalan'
  | 'skor_tajwid'
  | 'skor_kehadiran_maahir'
  | 'skor_kehadiran_tibyan'
  | 'skor_metode_pengajaran'
  | 'skor_kepatuhan_silabus'
  | 'skor_manajemen_halaqah'
  | 'skor_evaluasi_penguasaan'
  | 'skor_kedisiplinan_waktu'
  | 'skor_komitmen_jadwal'
  | 'skor_tanggung_jawab'
  | 'skor_kepatuhan_sop';

export interface Indikator {
  key: IndikatorKey;
  label: string;
  short: string; // label ringkas untuk header tabel / sumbu radar
  kategori: Kategori;
  standar: number; // skala 0-4
  deskripsi: string; // kriteria standar (dari templat)
  /** Keterangan teks per-indikator tersimpan di kolom ini (jika ada). */
  keteranganKey?: string;
  sumber: string;
}

export const KATEGORI_LABEL: Record<Kategori, string> = {
  hard: 'Kompetensi Al-Qur’an (Hard Skill)',
  pedagogis: 'Kompetensi Pedagogis (Metodologi)',
  soft: 'Kompetensi Profesionalisme (Soft Skill)',
};

export const KATEGORI_RATA_KEY: Record<Kategori, keyof MatrixRow> = {
  hard: 'rata_rata_hard_skill',
  pedagogis: 'rata_rata_pedagogis',
  soft: 'rata_rata_soft_skill',
};

// Standar rata-rata per kategori (untuk pewarnaan agregat).
export const KATEGORI_STANDAR: Record<Kategori, number> = {
  hard: 3,
  pedagogis: 4,
  soft: 4,
};

export const STANDAR_KESELURUHAN = 3.67;

// Bobot hard skill — total 9 porsi. Null di-skip beserta bobotnya saat hitung
// rata_rata_hard_skill (lihat weightedAvg di matrix-compute.ts).
export const HARD_BOBOT: Partial<Record<IndikatorKey, number>> = {
  skor_kehadiran_maahir: 3,
  skor_kehadiran_tibyan: 3,
  skor_bacaan: 1,
  skor_hafalan: 1,
  skor_tajwid: 1,
};

export const INDIKATOR: Indikator[] = [
  // A. Hard Skill
  {
    key: 'skor_bacaan',
    label: 'Kualitas Bacaan',
    short: 'Bacaan',
    kategori: 'hard',
    standar: 3,
    deskripsi: 'Nilai Ujian 70–85 — kualitas bacaan Al-Qur’an pengajar.',
    keteranganKey: 'keterangan_bacaan',
    sumber: 'Penilaian Masyaikh',
  },
  {
    key: 'skor_hafalan',
    label: 'Hafalan (Tahfidz)',
    short: 'Hafalan',
    kategori: 'hard',
    standar: 1,
    deskripsi: 'Hafal 5–10 juz.',
    keteranganKey: 'keterangan_hafalan',
    sumber: 'Penilaian Masyaikh',
  },
  {
    key: 'skor_tajwid',
    label: 'Tajwid',
    short: 'Tajwid',
    kategori: 'hard',
    standar: 2,
    deskripsi: 'Penguasaan Nuraniyyah dan Tuhfatul Athfal (dari rekaman setoran 2in1).',
    sumber: 'Setoran 2in1',
  },
  {
    key: 'skor_kehadiran_maahir',
    label: 'Kehadiran Kelas Maahir',
    short: 'Hadir Maahir',
    kategori: 'hard',
    standar: 4,
    deskripsi: 'Kehadiran di Program Maahir / Halaqah Alumni 80–100%.',
    sumber: 'Kehadiran Pengembangan',
  },
  {
    key: 'skor_kehadiran_tibyan',
    label: 'Kehadiran Kajian At-Tibyan',
    short: 'Hadir At-Tibyan',
    kategori: 'hard',
    standar: 4,
    deskripsi: 'Kehadiran di Kajian At-Tibyan 80–100%.',
    sumber: 'Kehadiran Pengembangan',
  },
  // B. Pedagogis (Metodologi)
  {
    key: 'skor_metode_pengajaran',
    label: 'Metode Pengajaran Modul',
    short: 'Metode',
    kategori: 'pedagogis',
    standar: 4,
    deskripsi: 'Hasil inspeksi menunjukkan pengajar mengikuti panduan modul.',
    keteranganKey: 'keterangan_metode',
    sumber: 'Penilaian Pedagogis',
  },
  {
    key: 'skor_kepatuhan_silabus',
    label: 'Kepatuhan Silabus',
    short: 'Silabus',
    kategori: 'pedagogis',
    standar: 4,
    deskripsi: 'Hasil inspeksi menunjukkan pengajar mengikuti silabus.',
    keteranganKey: 'keterangan_silabus',
    sumber: 'Penilaian Pedagogis',
  },
  {
    key: 'skor_manajemen_halaqah',
    label: 'Manajemen Halaqah',
    short: 'Manajemen',
    kategori: 'pedagogis',
    standar: 4,
    deskripsi: 'Pengajar memberikan koreksi langsung dan halaqah berjalan interaktif.',
    keteranganKey: 'keterangan_halaqah',
    sumber: 'Penilaian Pedagogis',
  },
  {
    key: 'skor_kepatuhan_sop',
    label: 'Kepatuhan SOP Teknis',
    short: 'SOP Teknis',
    kategori: 'pedagogis',
    standar: 4,
    deskripsi: 'Hasil inspeksi menunjukkan pengajar on-cam ketika KBM berlangsung.',
    keteranganKey: 'keterangan_sop',
    sumber: 'Penilaian Pedagogis',
  },
  // C. Soft Skill (Profesionalisme)
  {
    key: 'skor_kedisiplinan_waktu',
    label: 'Kedisiplinan Waktu (On-Time)',
    short: 'Disiplin',
    kategori: 'soft',
    standar: 4,
    deskripsi: 'Laporan observasi ketua kelas menunjukkan pengajar memulai kelas tepat waktu.',
    sumber: 'Laporan Ketua Kelas',
  },
  {
    key: 'skor_komitmen_jadwal',
    label: 'Komitmen Jadwal & Kehadiran',
    short: 'Komitmen',
    kategori: 'soft',
    standar: 4,
    deskripsi: 'Rata-rata stabilitas jadwal (sedikit pergantian JKG) & anti-mangkir (JKG bukan udzur syar\'i setelah tabayyun).',
    sumber: 'HITS Keterangan Harian & Tabayyun',
  },
  {
    key: 'skor_tanggung_jawab',
    label: 'Tanggung Jawab & Keadilan',
    short: 'Tanggung Jawab',
    kategori: 'soft',
    standar: 4,
    deskripsi: 'Pengajar mengganti jadwal dan memastikan semua murid hadir atau mendapat sesi privat.',
    sumber: 'Laporan Ketua Kelas',
  },
  {
    key: 'skor_evaluasi_penguasaan',
    label: 'Evaluasi & Penguasaan',
    short: 'Evaluasi',
    kategori: 'soft',
    standar: 4,
    deskripsi: 'Laporan observasi ketua kelas menunjukkan pengajar memberikan tugas latihan.',
    keteranganKey: 'keterangan_evaluasi',
    sumber: 'Penilaian Pedagogis',
  },
];

export const INDIKATOR_BY_KATEGORI: Record<Kategori, Indikator[]> = {
  hard: INDIKATOR.filter((i) => i.kategori === 'hard'),
  pedagogis: INDIKATOR.filter((i) => i.kategori === 'pedagogis'),
  soft: INDIKATOR.filter((i) => i.kategori === 'soft'),
};

/** Warna skor relatif terhadap standar (pakai CSS token). */
export function scoreColor(value: number | null | undefined, standar: number): string {
  if (value === null || value === undefined) return 'var(--muted-2)';
  if (value >= standar) return 'var(--hijau-ink)';
  if (value >= standar - 1) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}
