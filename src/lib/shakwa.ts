// Konfigurasi formulir Shakwa — satu sumber kebenaran untuk halaman publik,
// dashboard koordinator, rekap harian, dan API publik.
//
// Kenapa terpusat: teks panduan, daftar kategori, dan nomor tujuan WA dipakai di
// empat tempat. Kalau masing-masing menyalin sendiri, satu perubahan kategori
// akan menghasilkan formulir dan rekap yang tak sepakat soal kategori apa saja
// yang ada.

export type ShakwaKategori =
  | 'evaluasi'
  | 'pengajar'
  | 'peserta'
  | 'cerita_menarik'
  | 'modul_kurikulum'
  | 'ketidaksesuaian_aplikasi'
  | 'izin'
  | 'tali_kasih';

/**
 * Kosakata status mengikuti tabel `shakwa` yang sudah ada sejak migrasi 0008 —
 * label Indonesianya di STATUS_LABEL. Mengganti nilai kolomnya berarti mengubah
 * check constraint tabel lama tanpa keuntungan nyata.
 */
export type ShakwaStatus = 'submitted' | 'in_review' | 'resolved' | 'closed';

/** Status yang bisa dipilih koordinator; 'closed' hanya dibaca bila sudah ada. */
export const STATUS_PILIHAN: ShakwaStatus[] = ['submitted', 'in_review', 'resolved'];

export type ShakwaPelaporType = 'peserta' | 'pengajar';

/** Kunci tujuan WA; nomornya di TUJUAN_WA (bisa ditimpa ENV). */
export type ShakwaTujuan = 'koordinator_pengajar' | 'koordinator_peserta' | 'tali_kasih';

export type ShakwaFieldPilihan = {
  name: string;
  label: string;
  opsi: string[];
};

export type ShakwaKategoriDef = {
  value: ShakwaKategori;
  /** Label di dropdown "Laporan Terkait". */
  label: string;
  /** Judul blok pertanyaan, mengikuti gaya formulir asal. */
  judulBlok: string;
  /** Petunjuk format yang muncul di atas kotak isian. */
  hintFormat: string;
  /** Label kotak isian utama. */
  labelIsi: string;
  butuhLogin: boolean;
  pakaiLampiran: boolean;
  waTujuan: ShakwaTujuan | null;
  /** Pertanyaan tambahan sebelum kotak isian utama. */
  fieldTambahan: ShakwaFieldPilihan[];
};

export const KATEGORI: ShakwaKategoriDef[] = [
  {
    value: 'evaluasi',
    label: 'Evaluasi',
    judulBlok: 'E V A L U A S I',
    hintFormat:
      'Nama; (jika tidak ingin dicantumkan silakan dikosongkan)\nHITS Batch .... dasar/lanjutan;\n\nEvaluasi;',
    labelIsi: 'Silakan tuliskan evaluasinya',
    butuhLogin: false,
    pakaiLampiran: false,
    waTujuan: null,
    fieldTambahan: [],
  },
  {
    value: 'pengajar',
    label: 'Pengajar',
    judulBlok: 'P E N G A J A R',
    hintFormat: 'Nama Lengkap Pengajar:\nHITS Batch .... dasar/lanjutan;\n\nPermintaan:',
    labelIsi: 'Permintaan / kendala terkait pengajar',
    butuhLogin: false,
    pakaiLampiran: false,
    waTujuan: 'koordinator_pengajar',
    fieldTambahan: [],
  },
  {
    value: 'peserta',
    label: 'Peserta',
    judulBlok: 'P E S E R T A',
    hintFormat: 'HITS Batch .... dasar/lanjutan\nHal;\n\nPermintaan:',
    labelIsi: 'Permintaan / kendala terkait peserta',
    butuhLogin: false,
    pakaiLampiran: false,
    waTujuan: 'koordinator_peserta',
    fieldTambahan: [],
  },
  {
    value: 'cerita_menarik',
    label: 'Cerita Menarik',
    judulBlok: 'C E R I T A   M E N A R I K',
    hintFormat:
      'Nama Lengkap Pengajar:\nNama Lengkap Peserta;\nHITS Batch .... dasar/lanjutan;\n\nCerita Menarik:',
    labelIsi: 'Ceritakan momennya',
    butuhLogin: false,
    pakaiLampiran: true,
    waTujuan: null,
    fieldTambahan: [],
  },
  {
    value: 'modul_kurikulum',
    label: 'Modul dan Kurikulum',
    judulBlok: 'M O D U L   D A N   K U R I K U L U M',
    hintFormat:
      'Apabila menemukan kesalahan atau kejanggalan dalam modul, panduan, dan lain-lain, silakan tuliskan saran atau koreksinya. Lampirkan foto bila perlu.',
    labelIsi: 'Saran / koreksi modul & kurikulum',
    butuhLogin: false,
    pakaiLampiran: true,
    waTujuan: null,
    fieldTambahan: [],
  },
  {
    value: 'ketidaksesuaian_aplikasi',
    label: 'Ketidaksesuaian Halaqah dengan Aplikasi',
    judulBlok: 'L A P O R A N   A P L I K A S I   H I T S',
    hintFormat:
      'Jadwal/hari/jam halaqah, anggota halaqah, atau nama & level di aplikasi berbeda dengan kondisi riil. Silakan ceritakan kondisinya, lampirkan tangkapan layar bila ada.',
    labelIsi: 'Ceritakan kondisinya',
    butuhLogin: false,
    pakaiLampiran: true,
    waTujuan: 'koordinator_peserta',
    fieldTambahan: [],
  },
  {
    value: 'izin',
    label: 'Izin',
    judulBlok: 'I Z I N',
    hintFormat:
      'Sebutkan alasan tidak mengajar, lalu isi rincian di bawah agar tak perlu tabayyun lagi saat ketua kelas mengisi observasi.',
    labelIsi: 'Alasan tidak mengajar',
    butuhLogin: true,
    pakaiLampiran: false,
    waTujuan: 'koordinator_pengajar',
    fieldTambahan: [
      {
        name: 'sudah_info_koordinator',
        label: 'Apakah sudah menginfokan ke Koordinator / Ketua kelompok pengajar?',
        opsi: ['Sudah', 'Belum'],
      },
    ],
  },
  {
    value: 'tali_kasih',
    label: 'Tali Kasih',
    judulBlok: 'T A L I   K A S I H',
    hintFormat: 'Kondisinya;\nMasa belum turun:\nJenis pertanyaan;',
    labelIsi: 'Kondisi tali kasih',
    butuhLogin: true,
    pakaiLampiran: true,
    waTujuan: 'tali_kasih',
    fieldTambahan: [
      {
        name: 'sudah_presensi',
        label: 'Apakah Anda sudah menyelesaikan presensi peserta dan absensi pengajar?',
        opsi: ['Sudah', 'Belum'],
      },
      {
        name: 'punya_rekening_cimb',
        label: 'Apakah sudah memasukkan rekening CIMB penampung?',
        opsi: ['Sudah', 'Belum'],
      },
    ],
  },
];

export const KATEGORI_BY_VALUE: Record<ShakwaKategori, ShakwaKategoriDef> = Object.fromEntries(
  KATEGORI.map((k) => [k.value, k])
) as Record<ShakwaKategori, ShakwaKategoriDef>;

export function kategoriDef(v: string): ShakwaKategoriDef | null {
  return KATEGORI_BY_VALUE[v as ShakwaKategori] ?? null;
}

export const KATEGORI_LABEL: Record<ShakwaKategori, string> = Object.fromEntries(
  KATEGORI.map((k) => [k.value, k.label])
) as Record<ShakwaKategori, string>;

export const STATUS_LABEL: Record<ShakwaStatus, string> = {
  submitted: 'Baru',
  in_review: 'Diproses',
  resolved: 'Selesai',
  closed: 'Ditutup',
};

/**
 * Daftar tetap — sengaja bukan dari hits_batch: sebagian program di formulir
 * (Tahsin/Tahfidz Nurim, Tahsin Alfatihah) memang tak punya baris batch HITS.
 */
export const HALAQAH_OPTIONS = [
  'HITS JANUARI',
  'HITS APRIL',
  'HITS JUNI',
  'HITS INTENSIF',
  'HITS SAFAR',
  'TAHSIN NURIM',
  'TAHFIDZ NURIM',
  'TAHSIN ALFATIHAH',
] as const;

export type ShakwaIzinJenis = 'KMT' | 'KBLA' | 'JKG' | 'TIDAK_HADIR';

export const IZIN_JENIS: Array<{ value: ShakwaIzinJenis; label: string; butuhMenit: boolean; butuhTanggalGanti: boolean }> = [
  { value: 'KMT', label: 'Kelas mulai terlambat', butuhMenit: true, butuhTanggalGanti: false },
  { value: 'KBLA', label: 'Kelas berakhir lebih awal', butuhMenit: true, butuhTanggalGanti: false },
  { value: 'JKG', label: 'Jadwal kelas ganti', butuhMenit: false, butuhTanggalGanti: true },
  { value: 'TIDAK_HADIR', label: 'Tidak mengajar sama sekali', butuhMenit: false, butuhTanggalGanti: false },
];

export const IZIN_JENIS_LABEL: Record<ShakwaIzinJenis, string> = Object.fromEntries(
  IZIN_JENIS.map((j) => [j.value, j.label])
) as Record<ShakwaIzinJenis, string>;

/**
 * Nomor tujuan WA per kategori. Konstanta supaya perubahannya terekam di git;
 * ENV disediakan untuk ganti cepat tanpa deploy saat pemegang nomor berganti.
 */
export const TUJUAN_WA: Record<ShakwaTujuan, { nama: string; nomor: string }> = {
  koordinator_pengajar: {
    nama: process.env.SHAKWA_NAMA_KOORDINATOR_PENGAJAR || 'Koordinator Pengajar',
    nomor: process.env.SHAKWA_WA_KOORDINATOR_PENGAJAR || '081280683665',
  },
  koordinator_peserta: {
    nama: process.env.SHAKWA_NAMA_KOORDINATOR_PESERTA || 'Koordinator Peserta',
    nomor: process.env.SHAKWA_WA_KOORDINATOR_PESERTA || '081994771197',
  },
  tali_kasih: {
    nama: process.env.SHAKWA_NAMA_TALI_KASIH || 'Tim Tali Kasih',
    nomor: process.env.SHAKWA_WA_TALI_KASIH || '089673092288',
  },
};

/** Teks panduan kategori di kepala formulir — sama dengan formulir asal. */
export const PANDUAN_KATEGORI: Array<{ judul: string; poin: string[] }> = [
  {
    judul: '1. Evaluasi',
    poin: [
      'Kendala teknis saat mengisi atau mengakses form evaluasi.',
      'Masukan, kritik, atau saran terkait pelaksanaan program secara umum.',
    ],
  },
  {
    judul: '2. Pengajar',
    poin: [
      'Absensi Pengajar: kendala teknis atau masalah pencatatan kehadiran pengajar.',
      'Grup Halaqoh: kendala operasional atau komunikasi di dalam grup halaqoh.',
      'Akses Admin: pengajar belum dijadikan admin pada grup halaqoh.',
      'Lainnya: permintaan atau kendala lain yang berkaitan dengan pengajar.',
    ],
  },
  {
    judul: '3. Peserta',
    poin: [
      'Peserta Belum Terdaftar: nama peserta belum tercantum di aplikasi.',
      'Aduan Peserta: keluhan atau masalah khusus terkait peserta.',
      'Mutasi / Perpindahan Peserta: kendala terkait proses perpindahan peserta.',
      'Perubahan data pribadi peserta (nomor WhatsApp, email, dll.).',
    ],
  },
  {
    judul: '4. Cerita Menarik',
    poin: [
      'Kisah inspiratif, perkembangan signifikan peserta, atau momen berkesan selama halaqah.',
    ],
  },
  {
    judul: '5. Modul dan Kurikulum',
    poin: [
      'Akses modul/materi pembelajaran tidak bisa dibuka atau hilang.',
      'Masukan atau laporan ketidaksesuaian isi materi/kurikulum.',
      'Kesulitan menerapkan metode pengajaran yang ada di modul.',
    ],
  },
  {
    judul: '6. Ketidaksesuaian Halaqah dengan Aplikasi',
    poin: [
      'Data jadwal, hari, atau jam halaqah di aplikasi berbeda dengan kondisi riil.',
      'Anggota halaqah di aplikasi tidak sesuai dengan daftar di grup sebenarnya.',
      'Nama halaqah atau level pembelajaran di aplikasi tidak sinkron.',
    ],
  },
  {
    judul: '7. Izin',
    poin: [
      'Pengajuan izin tidak hadir pengajar (sakit, acara keluarga, atau tugas lain).',
      'Permohonan izin cuti sementara dari kegiatan pengajaran.',
    ],
  },
  {
    judul: '8. Tali Kasih',
    poin: [
      'Belum Memiliki Rekening CIMB: pengajar belum memasukkan atau belum punya rekening penampung.',
      'Laporan lainnya.',
    ],
  },
];

export const MAX_LAMPIRAN = 3;
export const MAX_LAMPIRAN_BYTES = 5 * 1024 * 1024;
export const LAMPIRAN_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/** SKW-YYYYMMDD-NNN. `urut` = nomor urut kiriman pada tanggal itu (mulai 1). */
export function nomorTiket(tanggalISO: string, urut: number): string {
  return `SKW-${tanggalISO.replace(/-/g, '')}-${String(urut).padStart(3, '0')}`;
}
