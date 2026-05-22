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

// Session types
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

export type Session =
  | PesertaSession
  | MusyrifSession
  | KoordinatorSession
  | SyaikhSession;
export type Role = Session['role'];
