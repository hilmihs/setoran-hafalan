// Mirror dari schema SQL. Update kalau migration berubah.

export type Gender = 'ikhwan' | 'akhwat';

export type StatusSetoran = 'draft' | 'submitted' | 'checked';

export type JenisRekaman = 'tuhfatul_athfal' | 'jazariyyah' | 'syawahid';

export type NilaiRekaman = 'hijau' | 'kuning' | 'merah';

export const JENIS_REKAMAN: JenisRekaman[] = [
  'tuhfatul_athfal',
  'jazariyyah',
  'syawahid',
];

export const JENIS_REKAMAN_LABEL: Record<JenisRekaman, string> = {
  tuhfatul_athfal: 'Tuhfatul Athfal',
  jazariyyah: 'Al-Jazariyyah',
  syawahid: 'Syawahid',
};

// Limit durasi maksimal rekaman per jenis (detik). Default 30 menit;
// Matan Al-Jazariyyah 45 menit. Dipakai client (AudioRecorder auto-stop).
export const JENIS_REKAMAN_MAX_DURASI_SEC: Record<JenisRekaman, number> = {
  tuhfatul_athfal: 30 * 60,
  jazariyyah: 45 * 60,
  syawahid: 30 * 60,
};

export const NILAI_LABEL: Record<NilaiRekaman, string> = {
  hijau: 'Hijau (Baik)',
  kuning: 'Kuning (Perlu Perbaikan)',
  merah: 'Merah (Belum Lulus)',
};

export interface Musyrif {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  last_login_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Koordinator {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  last_login_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Syaikh {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  last_login_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Kelas {
  id: string;
  name: string;
  gender: Gender;
  musyrif_id: string;
  created_at: string;
}

export interface Peserta {
  id: string;
  name: string;
  gender: Gender;
  kelas_id: string;
  whatsapp_number: string;
  password_hash: string | null;
  active: boolean;
  created_at: string;
}

export interface Setoran {
  id: string;
  peserta_id: string;
  week_start: string; // ISO date (YYYY-MM-DD), Senin awal cycle 2-pekan
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
  checked_by_musyrif_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rekaman {
  id: string;
  setoran_id: string;
  jenis: JenisRekaman;
  audio_url: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  nilai: NilaiRekaman | null;
  masukan: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetoranMusyrif {
  id: string;
  musyrif_id: string;
  week_start: string; // Senin awal cycle 2-pekan
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
  checked_by_syaikh_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RekamanMusyrif {
  id: string;
  setoran_musyrif_id: string;
  jenis: JenisRekaman;
  audio_url: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  nilai: NilaiRekaman | null;
  masukan: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

// Composite types untuk query dengan JOIN
export interface SetoranWithRekaman extends Setoran {
  rekaman: Rekaman[];
}

export interface PesertaWithKelas extends Peserta {
  kelas: Kelas;
}

// ========== HITS Matrix types ==========

export type KondisiKelas = 'KBBS' | 'KMT' | 'JKG' | 'KBLA' | 'LIBUR';
export type StatusLatihan = 'TAL' | 'PTML' | 'SML';
export type StatusCheckin = 'hadir' | 'izin' | 'sakit';
export type JenisAlasan = 'terlambat' | 'alpa';
export type StatusPengajuan = 'pending' | 'accepted' | 'rejected';
export type StatusTabayyun = 'pending' | 'awaiting_reason' | 'decided';

export const KONDISI_KELAS_LABEL: Record<KondisiKelas, string> = {
  KBBS: 'Kelas Berjalan Baik & Sesuai',
  KMT: 'Kelas Mulai Terlambat (>5 menit)',
  JKG: 'Jadwal Kelas Ganti',
  KBLA: 'Kelas Berakhir Lebih Awal',
  LIBUR: 'Libur / Tidak Ada Kelas',
};

export const STATUS_LATIHAN_LABEL: Record<StatusLatihan, string> = {
  TAL: 'Tidak Ada Latihan',
  PTML: 'Peserta Tidak Mengerjakan Latihan',
  SML: 'Semua Mengerjakan Latihan',
};

export const STATUS_CHECKIN_LABEL: Record<StatusCheckin, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
};

export interface KelompokPengajar {
  id: string;
  name: string;
  gender: Gender;
  created_at: string;
}

export interface Pengajar {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  kelompok_id: string;
  is_ketua: boolean;
  musyrif_id: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface KelasHits {
  id: string;
  name: string;
  gender: Gender;
  pengajar_id: string;
  jadwal_hari: string | null;
  jadwal_waktu_mulai: string | null;
  jadwal_waktu_selesai: string | null;
  created_at: string;
}

export interface KetuaKelas {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  password_hash: string | null;
  kelas_hits_id: string | null;
  batch_id: string | null;
  magic_token: string | null;
  hits_halaqah_id: string | null;
  hits_halaqah_peserta_id: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface KoordinatorKetuaKelas {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  link_grup_wa: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface BatchConfig {
  id: string;
  name: string;
  start_date: string;
  created_at: string;
}

// ---------- HITS soft-skill (batch-native, spreadsheet-driven) ----------

export type HitsLevel = 'qoidah_nuroniyyah' | 'perbaikan_bacaan';
export type HitsKondisi = 'KBBS' | 'KMT' | 'JKG' | 'KBLA' | 'LIBUR';
export type HitsStatusLatihan = 'TAL' | 'PTML' | 'SML';
export type HitsSource = 'sheet' | 'manual';
export type HitsStatusTabayyun = 'pending' | 'awaiting_reason' | 'decided';

export const HITS_LEVEL_LABEL: Record<HitsLevel, string> = {
  qoidah_nuroniyyah: 'Qoidah Nuroniyyah',
  perbaikan_bacaan: 'Perbaikan Bacaan',
};

export const HITS_KONDISI_LABEL: Record<HitsKondisi, string> = {
  KBBS: 'Kelas Berjalan Baik & Sesuai',
  KMT: 'Kelas Mulai Terlambat (>5 menit)',
  JKG: 'Jadwal Kelas Ganti',
  KBLA: 'Kelas Berakhir Lebih Awal',
  LIBUR: 'Libur / Tidak Ada Kelas',
};

export const HITS_STATUS_LATIHAN_LABEL: Record<HitsStatusLatihan, string> = {
  TAL: 'Tidak Ada Latihan',
  PTML: 'Peserta Tidak Mengerjakan Latihan',
  SML: 'Semua Mengerjakan Latihan',
};

export interface HitsBatch {
  id: string;
  name: string;
  slug: string;
  start_date: string;
  active: boolean;
  created_at: string;
}

export interface HitsKaldikHari {
  id: string;
  batch_id: string;
  level: HitsLevel;
  tanggal: string;
  hari: string;
  pekan: number | null;
  is_libur: boolean;
  libur_note: string | null;
  source: HitsSource;
  created_at: string;
}

export interface HitsKaldikPertemuan {
  id: string;
  halaqah_id: string;
  pertemuan_no: number;
  tanggal: string;
  pekan: number | null;
  is_skipped: boolean;
  note: string | null;
  set_by_role: string;
  set_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface HitsHalaqah {
  id: string;
  batch_id: string;
  level: HitsLevel | null;
  name: string;
  sheet_gid: string | null;
  jadwal_raw: string | null;
  jadwal_hari: string[];
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  gender: Gender | null;
  pengajar_nama_sheet: string | null;
  pengajar_id: string | null;
  pengajar_wa: string | null;
  source: HitsSource;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HitsHalaqahPeserta {
  id: string;
  halaqah_id: string;
  murid_id: string | null;
  nama: string;
  jenis_kelamin: string | null;
  status_peserta: string | null;
  is_ketua: boolean;
  ketua_wa: string | null;
  source: HitsSource;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HitsKeteranganHarian {
  id: string;
  halaqah_id: string;
  pertemuan_no: number;
  tanggal: string;
  kondisi: HitsKondisi;
  terlambat: boolean;
  latihan_diberikan: boolean | null;
  status_latihan: HitsStatusLatihan | null;
  semua_selesai: boolean | null;
  catatan: string | null;
  diisi_by_role: string;
  diisi_by_id: string;
  editable: boolean;
  created_at: string;
  updated_at: string;
}

export interface HitsTabayyun {
  id: string;
  keterangan_id: string;
  halaqah_id: string;
  pengajar_id: string | null;
  koordinator_kk_id: string | null;
  kondisi: HitsKondisi;
  alasan_pengajar: string | null;
  alasan_submitted_at: string | null;
  is_udzur_syari: boolean | null;
  keputusan_catatan: string | null;
  decided_at: string | null;
  status: HitsStatusTabayyun;
  deadline_at: string;
  created_at: string;
}

export interface HitsTeguran {
  id: string;
  pengajar_id: string;
  year_month: string;
  category: string;
  nomor_teguran: number;
  source_ref_type: string | null;
  source_ref_id: string | null;
  keterangan: string | null;
  issued_by_role: string;
  issued_by_id: string;
  created_at: string;
}

export interface HitsSheetSource {
  id: string;
  batch_id: string | null;
  kind: 'kaldik' | 'presensi';
  spreadsheet_id: string;
  gid: string | null;
  label: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  active: boolean;
  created_at: string;
}

export interface ProgramKehadiran {
  id: string;
  name: string;
  hari: string[];
  waktu_mulai: string;
  waktu_selesai: string;
  active: boolean;
  created_at: string;
}

export interface CheckinPengajar {
  id: string;
  pengajar_id: string;
  program_id: string | null;
  kelas_hits_id: string | null;
  tanggal: string;
  status: StatusCheckin;
  checked_in_at: string;
  is_terlambat: boolean;
  invalidated_by: string | null;
  invalidated_at: string | null;
  created_at: string;
}

export interface PengajuanAlasan {
  id: string;
  pengajar_id: string;
  program_id: string | null;
  kelas_hits_id: string | null;
  tanggal: string;
  jenis: JenisAlasan;
  alasan: string;
  status: StatusPengajuan;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface LiburProgram {
  id: string;
  program_id: string | null;
  kelas_hits_id: string | null;
  tanggal: string;
  gender: Gender | null;
  keterangan: string | null;
  created_by_id: string | null;
  created_at: string;
}

export interface ObservasiKelas {
  id: string;
  kelas_hits_id: string;
  ketua_kelas_id: string;
  tanggal: string;
  kondisi: KondisiKelas;
  pengajar_on_cam: boolean | null;
  latihan_mandiri_diberikan: boolean | null;
  status_latihan_val: StatusLatihan | null;
  semua_siswa_selesai_latihan: boolean | null;
  catatan: string | null;
  created_at: string;
}

export interface Tabayyun {
  id: string;
  observasi_id: string;
  pengajar_id: string;
  koordinator_kk_id: string;
  alasan_pengajar: string | null;
  alasan_submitted_at: string | null;
  is_udzur_syari: boolean | null;
  keputusan_catatan: string | null;
  decided_at: string | null;
  status: StatusTabayyun;
  deadline_at: string;
  created_at: string;
}

export interface Teguran {
  id: string;
  pengajar_id: string;
  year_month: string;
  category: string;
  nomor_teguran: number;
  source_ref_type: string | null;
  source_ref_id: string | null;
  keterangan: string | null;
  issued_by_role: string;
  issued_by_id: string;
  created_at: string;
}

export interface MatrixRekap {
  id: string;
  pengajar_id: string;
  year_month: string;
  skor_bacaan: number | null;
  skor_hafalan: number | null;
  skor_tajwid: number | null;
  skor_kehadiran_maahir: number | null;
  skor_kehadiran_tibyan: number | null;
  rata_rata_hard_skill: number | null;
  skor_metode_pengajaran: number | null;
  skor_kepatuhan_silabus: number | null;
  skor_manajemen_halaqah: number | null;
  skor_evaluasi_penguasaan: number | null;
  rata_rata_pedagogis: number | null;
  skor_kedisiplinan_waktu: number | null;
  skor_komitmen_jadwal: number | null;
  skor_tanggung_jawab: number | null;
  skor_kepatuhan_sop: number | null;
  rata_rata_soft_skill: number | null;
  rata_rata_keseluruhan: number | null;
  ranking: number | null;
  total_teguran_bulan: number;
  total_teguran_kumulatif: number;
  finalized_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface IndikatorStandar {
  kode: string;
  nama: string;
  kategori: string;
  standar: number;
}

export const INDIKATOR_STANDAR: Record<string, number> = {
  bacaan: 3,
  hafalan: 1,
  tajwid: 2,
  kehadiran_maahir: 4,
  kehadiran_tibyan: 4,
  metode_pengajaran: 4,
  kepatuhan_silabus: 4,
  manajemen_halaqah: 4,
  evaluasi_penguasaan: 4,
  kedisiplinan_waktu: 4,
  komitmen_jadwal: 4,
  tanggung_jawab: 4,
  kepatuhan_sop: 4,
};

// ========== Password reset request ==========

export type StatusResetRequest = 'pending' | 'accepted' | 'declined';

export interface PasswordResetRequest {
  id: string;
  whatsapp_number: string;
  requester_name: string | null;
  status: StatusResetRequest;
  decided_by_wa: string | null;
  decided_at: string | null;
  created_at: string;
}

// ========== Session types ==========

export interface PesertaSession {
  role: 'peserta';
  peserta_id: string;
  name: string;
  gender: Gender;
  kelas_id: string;
}

export interface MusyrifSession {
  role: 'musyrif';
  musyrif_id: string;
  name: string;
  gender: Gender;
}

export interface KoordinatorSession {
  role: 'koordinator';
  koordinator_id: string;
  name: string;
  gender: Gender;
}

export interface SyaikhSession {
  role: 'syaikh';
  syaikh_id: string;
  name: string;
  gender: Gender;
}

export interface PengajarSession {
  role: 'pengajar';
  pengajar_id: string;
  name: string;
  gender: Gender;
  kelompok_id: string;
  is_ketua: boolean;
}

export interface KetuaKelasSession {
  role: 'ketua_kelas';
  ketua_kelas_id: string;
  name: string;
  gender: Gender;
  kelas_hits_id: string | null;
  hits_halaqah_id?: string | null;
}

export interface KoordinatorKetuaKelasSession {
  role: 'koordinator_ketua_kelas';
  koordinator_kk_id: string;
  name: string;
  gender: Gender;
}

export type RoleAccess =
  | PesertaSession
  | MusyrifSession
  | KoordinatorSession
  | SyaikhSession
  | PengajarSession
  | KetuaKelasSession
  | KoordinatorKetuaKelasSession;

export type Session = RoleAccess;
export type Role = RoleAccess['role'];

export interface SessionData {
  active: RoleAccess;
  accesses: RoleAccess[];
}
