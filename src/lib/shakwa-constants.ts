export const KATEGORI_PENGAJAR = [
  { value: 'evaluasi', label: 'Evaluasi' },
  { value: 'pembagian_waktu', label: 'Pembagian Waktu / Halaqah / Penempatan Level' },
  { value: 'presensi_absensi', label: 'Presensi Dan Absensi' },
  { value: 'cerita_menarik', label: 'Cerita Menarik' },
  { value: 'izin_sakit', label: 'Izin Atau Sakit', note: 'Untuk izin harian, gunakan fitur Check-in Kehadiran' },
  { value: 'grup_halaqoh', label: 'Grup Halaqoh (Admin grup, salah grup, dll)' },
  { value: 'modul_kurikulum', label: 'Modul dan Kurikulum' },
] as const;

export const HALAQOH_LIST = [
  'HITS Januari',
  'HITS April',
  'HITS Juni',
  'HITS Intensif',
  'HITS Safar',
  'Tahsin Nurim',
  'Tahfidz Nurim',
  'Tahsin Al-Fatihah',
] as const;

export const FORMAT_HINTS: Record<string, string> = {
  presensi_absensi: 'Nama Lengkap Pengajar:\nHITS Batch .... dasar/lanjutan;\nPermintaan:',
  pembagian_waktu: 'Nama Lengkap Pengajar:\nNama Lengkap Peserta;\nHITS Batch .... dasar/lanjutan;\nPermintaan;',
};

export const KATEGORI_LABELS: Record<string, string> = Object.fromEntries(
  KATEGORI_PENGAJAR.map((k) => [k.value, k.label])
);
