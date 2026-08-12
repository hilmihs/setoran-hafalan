// registry.ts — deklarasi entitas + daftar kolom terlarang + audit saat modul dimuat.
import type { EntityDef } from './types';

export const FORBIDDEN_COLUMNS: string[] = [
  'password_hash',
  'whatsapp_number', 'ketua_wa', 'wakil_wa',
  'magic_token',
  'new_password_plaintext',
  'token',
  'audio_url',
  'masukan', 'ket_bacaan', 'ket_hafalan', 'catatan_umum',
];

/** Lempar bila ada entitas menyebut kolom terlarang. Dipanggil saat modul dimuat. */
export function auditEntities(entities: Record<string, EntityDef>): void {
  for (const [key, def] of Object.entries(entities)) {
    for (const col of def.columns) {
      if (FORBIDDEN_COLUMNS.includes(col)) {
        throw new Error(`[api registry] entitas '${key}' menyebut kolom terlarang '${col}'`);
      }
    }
  }
}

export const ENTITIES: Record<string, EntityDef> = {
  'program-kelas': {
    route: 'program-kelas', table: 'program_kelas', scope: 'maahir',
    columns: ['id', 'name', 'gender', 'jadwal_hari', 'waktu_mulai', 'waktu_selesai', 'self_attendance', 'presensi_sifat', 'created_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'self_attendance', column: 'self_attendance', kind: 'bool' },
      { param: 'presensi_sifat', column: 'presensi_sifat', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  anggota: {
    route: 'anggota', table: 'program_kelas_anggota', scope: 'maahir',
    columns: ['id', 'program_kelas_id', 'peserta_id', 'name', 'is_ketua', 'is_wakil', 'mulai_tanggal', 'created_at'],
    filters: [
      { param: 'program_kelas_id', column: 'program_kelas_id', kind: 'eq' },
      { param: 'is_ketua', column: 'is_ketua', kind: 'bool' },
      { param: 'is_wakil', column: 'is_wakil', kind: 'bool' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  pertemuan: {
    route: 'pertemuan', table: 'pertemuan_program', scope: 'maahir',
    columns: ['id', 'program_kelas_id', 'kelas_id', 'program', 'tanggal', 'nama_kegiatan', 'waktu_mulai', 'waktu_selesai', 'keterangan', 'created_at'],
    filters: [
      { param: 'program_kelas_id', column: 'program_kelas_id', kind: 'eq' },
      { param: 'program', column: 'program', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  kehadiran: {
    route: 'kehadiran', table: 'kehadiran_peserta', scope: 'maahir',
    columns: ['id', 'pertemuan_id', 'anggota_id', 'peserta_id', 'status', 'mode', 'setoran_halaman', 'catatan', 'diisi_at', 'updated_at', 'created_at'],
    filters: [
      { param: 'pertemuan_id', column: 'pertemuan_id', kind: 'eq' },
      { param: 'anggota_id', column: 'anggota_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'mode', column: 'mode', kind: 'eq' },
      { param: 'sejak', column: 'updated_at', kind: 'since' },
    ],
    order: { column: 'updated_at', dir: 'desc' },
  },
  libur: {
    route: 'libur', table: 'program_kelas_libur', scope: 'maahir',
    columns: ['id', 'program_kelas_id', 'tanggal_mulai', 'tanggal_selesai', 'keterangan', 'created_at'],
    filters: [
      { param: 'program_kelas_id', column: 'program_kelas_id', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal_mulai', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal_selesai', kind: 'date_to' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  pemutihan: {
    route: 'pemutihan', table: 'maahir_pemutihan', scope: 'maahir',
    columns: ['id', 'anggota_id', 'month', 'tanggal', 'alasan', 'dibuat_oleh', 'dibatalkan_pada', 'created_at'],
    filters: [
      { param: 'anggota_id', column: 'anggota_id', kind: 'eq' },
      { param: 'month', column: 'month', kind: 'eq' },
      { param: 'aktif', column: 'dibatalkan_pada', kind: 'is_null' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'laporan-note': {
    route: 'laporan-note', table: 'laporan_maahir_note', scope: 'maahir',
    columns: ['id', 'month', 'teks', 'urutan', 'created_at', 'updated_at'],
    filters: [{ param: 'month', column: 'month', kind: 'eq' }],
    order: { column: 'urutan', dir: 'asc' },
  },
  peserta: {
    route: 'peserta', table: 'peserta', scope: 'maahir',
    columns: ['id', 'name', 'gender', 'kelas_id', 'active', 'created_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'active', column: 'active', kind: 'bool' },
      { param: 'kelas_id', column: 'kelas_id', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  kelas: {
    route: 'kelas', table: 'kelas', scope: 'maahir',
    columns: ['id', 'name', 'gender', 'musyrif_id', 'created_at'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }],
    order: { column: 'name', dir: 'asc' },
  },
  setoran: {
    route: 'setoran', table: 'setoran', scope: 'maahir',
    columns: ['id', 'peserta_id', 'week_start', 'status', 'submitted_at', 'checked_at', 'checked_by_musyrif_id', 'created_at', 'updated_at'],
    filters: [
      { param: 'peserta_id', column: 'peserta_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'week_start', column: 'week_start', kind: 'eq' },
      { param: 'tanggal_dari', column: 'week_start', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'week_start', kind: 'date_to' },
    ],
    order: { column: 'week_start', dir: 'desc' },
  },
  rekaman: {
    route: 'rekaman', table: 'rekaman', scope: 'maahir',
    columns: ['id', 'setoran_id', 'jenis', 'duration_seconds', 'recorded_at', 'nilai', 'checked_at', 'created_at'],
    filters: [
      { param: 'setoran_id', column: 'setoran_id', kind: 'eq' },
      { param: 'jenis', column: 'jenis', kind: 'eq' },
      { param: 'nilai', column: 'nilai', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'setoran-musyrif': {
    route: 'setoran-musyrif', table: 'setoran_musyrif', scope: 'maahir',
    columns: ['id', 'musyrif_id', 'week_start', 'status', 'submitted_at', 'checked_at', 'checked_by_syaikh_id', 'created_at'],
    filters: [
      { param: 'musyrif_id', column: 'musyrif_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'week_start', column: 'week_start', kind: 'eq' },
      { param: 'tanggal_dari', column: 'week_start', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'week_start', kind: 'date_to' },
    ],
    order: { column: 'week_start', dir: 'desc' },
  },
  'rekaman-musyrif': {
    route: 'rekaman-musyrif', table: 'rekaman_musyrif', scope: 'maahir',
    columns: ['id', 'setoran_musyrif_id', 'jenis', 'duration_seconds', 'nilai', 'checked_at', 'created_at'],
    filters: [
      { param: 'setoran_musyrif_id', column: 'setoran_musyrif_id', kind: 'eq' },
      { param: 'jenis', column: 'jenis', kind: 'eq' },
      { param: 'nilai', column: 'nilai', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/batch': {
    route: 'hits/batch', table: 'hits_batch', scope: 'hits',
    columns: ['id', 'slug', 'name', 'start_date', 'active', 'created_at'],
    filters: [{ param: 'active', column: 'active', kind: 'bool' }],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/halaqah': {
    route: 'hits/halaqah', table: 'hits_halaqah', scope: 'hits',
    columns: ['id', 'batch_id', 'name', 'gender', 'pengajar_id', 'level', 'program', 'start_date', 'jadwal_hari', 'created_at'],
    filters: [
      { param: 'batch_id', column: 'batch_id', kind: 'eq' },
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
      { param: 'program', column: 'program', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/halaqah-peserta': {
    route: 'hits/halaqah-peserta', table: 'hits_halaqah_peserta', scope: 'hits',
    columns: ['id', 'halaqah_id', 'murid_id', 'nama', 'is_ketua', 'created_at'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'is_ketua', column: 'is_ketua', kind: 'bool' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/kaldik-hari': {
    route: 'hits/kaldik-hari', table: 'hits_kaldik_hari', scope: 'hits',
    columns: ['id', 'batch_id', 'level', 'tanggal', 'pekan', 'is_libur'],
    filters: [
      { param: 'batch_id', column: 'batch_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
      { param: 'pekan', column: 'pekan', kind: 'eq' },
      { param: 'is_libur', column: 'is_libur', kind: 'bool' },
    ],
    order: { column: 'tanggal', dir: 'asc' },
  },
  'hits/kaldik-pertemuan': {
    route: 'hits/kaldik-pertemuan', table: 'hits_kaldik_pertemuan', scope: 'hits',
    columns: ['id', 'halaqah_id', 'level', 'pertemuan_no', 'tanggal', 'is_skipped', 'note'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
      { param: 'pertemuan_no', column: 'pertemuan_no', kind: 'eq' },
      { param: 'is_skipped', column: 'is_skipped', kind: 'bool' },
    ],
    order: { column: 'pertemuan_no', dir: 'asc' },
  },
  'hits/keterangan-harian': {
    route: 'hits/keterangan-harian', table: 'hits_keterangan_harian', scope: 'hits',
    columns: ['id', 'halaqah_id', 'level', 'pertemuan_no', 'tanggal', 'kondisi', 'status_latihan', 'source', 'created_at'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
      { param: 'pertemuan_no', column: 'pertemuan_no', kind: 'eq' },
      { param: 'kondisi', column: 'kondisi', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  'hits/pelanggaran': {
    route: 'hits/pelanggaran', table: 'hits_pelanggaran', scope: 'hits',
    columns: ['id', 'keterangan_id', 'jenis', 'menit'],
    filters: [
      { param: 'keterangan_id', column: 'keterangan_id', kind: 'eq' },
      { param: 'jenis', column: 'jenis', kind: 'eq' },
    ],
    order: { column: 'id', dir: 'asc' },
  },
  'hits/hutang-bayar': {
    route: 'hits/hutang-bayar', table: 'hits_hutang_bayar', scope: 'hits',
    columns: ['id', 'halaqah_id', 'pengajar_id', 'keterangan_id', 'menit', 'tanggal', 'created_at'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  'hits/teguran': {
    route: 'hits/teguran', table: 'hits_teguran', scope: 'hits',
    columns: ['id', 'pengajar_id', 'category', 'year_month', 'nomor_teguran', 'created_at'],
    filters: [
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'category', column: 'category', kind: 'eq' },
      { param: 'year_month', column: 'year_month', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/tabayyun': {
    route: 'hits/tabayyun', table: 'hits_tabayyun', scope: 'hits',
    columns: ['id', 'keterangan_id', 'pengajar_id', 'status', 'kondisi', 'alasan', 'deadline_at', 'created_at'],
    filters: [
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'keterangan_id', column: 'keterangan_id', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/kajian-presensi': {
    route: 'hits/kajian-presensi', table: 'hits_kajian_presensi', scope: 'hits',
    columns: ['id', 'halaqah_id', 'tanggal', 'status', 'created_at'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  'hits/kajian-libur': {
    route: 'hits/kajian-libur', table: 'hits_kajian_libur', scope: 'hits',
    columns: ['id', 'tanggal'],
    filters: [
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  'hits/pengajar': {
    route: 'hits/pengajar', table: 'pengajar', scope: 'hits',
    columns: ['id', 'name', 'gender', 'kelompok_id', 'is_ketua', 'matrix_exclude', 'active', 'created_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'active', column: 'active', kind: 'bool' },
      { param: 'kelompok_id', column: 'kelompok_id', kind: 'eq' },
    ],
    order: { column: 'name', dir: 'asc' },
  },
  'hits/kelompok-pengajar': {
    route: 'hits/kelompok-pengajar', table: 'kelompok_pengajar', scope: 'hits',
    columns: ['id', 'name', 'gender', 'created_at'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }],
    order: { column: 'name', dir: 'asc' },
  },
};

auditEntities(ENTITIES);

export function getEntity(route: string): EntityDef | null {
  return ENTITIES[route] ?? null;
}
