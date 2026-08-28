// Rapot Evaluasi — tipe snapshot + builder murni.
// Dipakai bersama oleh: API terbitkan (snapshot ke DB), preview HP (client),
// halaman cetak A4, dan halaman verifikasi publik. Satu sumber kebenaran agar
// preview, snapshot, dan cetak selalu identik.

import {
  ALL_LAHN,
  JALIY,
  KHAFIY,
  scoreOf,
  tierOf,
  sumCounts,
  nilaiAkhirOf,
  AMBANG_LULUS_AKHIR,
  AMBANG_UJIAN_DEFAULT,
  UJIAN_QN_SESI,
  UJIAN_PB_SESI,
  type Jenis,
  type LahnCounts,
} from './evaluasi';

// Satu sesi peserta yang sudah dinormalisasi (dari DB atau dari state client).
export interface SesiNilaiInput {
  jenis: Jenis;
  nomor_sesi: number;
  counts: LahnCounts;
  catatan: string;
  tgl: string | null; // tgl_jadwal ISO (yyyy-mm-dd) atau null
  done: boolean;
  hadir?: boolean; // default true; sesi dgn hadir===false tak dihitung ke rapot
}

export interface RapotIdentitas {
  peserta: string;
  halaqah: string;
  level: string | null;
  mustawa: number | null;
  gender: string;
  batch: string | null;
}

export interface RapotTrackSnap {
  jenis: 'qn' | 'pb';
  label: string;
  rata: number | null;
  history: (number | null)[]; // 4 slot
  catatan: { label: string; tgl: string | null; teks: string }[];
}

export interface RapotLahnRow {
  key: string;
  label: string;
  group: 'jaliy' | 'khafiy';
  count: number;
}

export interface RapotUjianSnap {
  sesi: number;
  label: string; // 'Ujian QN' | 'Ujian PB'
  skor: number | null;
  jaliy: number;
  khafiy: number;
  counts: LahnCounts;
  tgl: string | null;
  catatan: string;
  lulus: boolean | null; // vs ambang
}

export interface RapotBerkala {
  rataGabungan: number | null;
  tertinggi: number | null;
  predikat: string;
  tracks: RapotTrackSnap[];
  akumulasi: RapotLahnRow[]; // nonzero, desc
}

export interface RapotUjian {
  nilaiAkhir: number | null;
  berkalaAvg: number | null;
  ujianPbSkor: number | null;
  lulus: boolean | null;
  qn: RapotUjianSnap | null;
  pb: RapotUjianSnap | null;
  rincian: { key: string; label: string; group: 'jaliy' | 'khafiy'; qn: number | null; pb: number | null }[];
  catatanPenguji: string;
}

/**
 * Jenis dokumen rapot.
 * - `berkala`   — rekap 4 sesi QN + 4 sesi PB.
 * - `ujian`     — rapot ujian akhir gabungan; nilai akhir = 30% berkala + 70% Ujian PB.
 * - `ujian_qn` / `ujian_pb` — batch dgn `eval_batch.rapot_ujian_terpisah` (0058):
 *   satu dokumen per ujian, nilai akhir MURNI skor ujian itu, dan sengaja tidak
 *   menyinggung ujian yang lain sama sekali.
 */
export type JenisRapot = 'berkala' | 'ujian' | 'ujian_qn' | 'ujian_pb';

/** Rapot ujian yang berdiri sendiri (bukan gabungan QN+PB). */
export function isUjianTunggal(j: JenisRapot): j is 'ujian_qn' | 'ujian_pb' {
  return j === 'ujian_qn' || j === 'ujian_pb';
}

/** Ujian mana yang jadi fokus dokumen; null untuk rapot gabungan/berkala. */
export function fokusUjian(j: JenisRapot): 'qn' | 'pb' | null {
  return j === 'ujian_qn' ? 'qn' : j === 'ujian_pb' ? 'pb' : null;
}

export interface RapotPayload {
  jenis_rapot: JenisRapot;
  identitas: RapotIdentitas;
  ambang: number;
  tanggal: string; // ISO terbit
  penerbit: string; // nama pengajar
  berkala?: RapotBerkala;
  ujian?: RapotUjian;
}

const TRACK_LABEL: Record<'qn' | 'pb', string> = { qn: 'Evaluasi QN', pb: 'Evaluasi PB' };

function trackShort(j: Jenis): string {
  return j === 'qn' ? 'QN' : j === 'pb' ? 'PB' : 'Ujian';
}

// Skor semua sesi berkala (qn+pb) yang done — dasar rata-rata 30%.
function berkalaScores(sesi: SesiNilaiInput[]): number[] {
  return sesi
    .filter((s) => (s.jenis === 'qn' || s.jenis === 'pb') && s.done && s.hadir !== false)
    .map((s) => scoreOf(s.counts).skor);
}

function buildTrack(sesi: SesiNilaiInput[], jenis: 'qn' | 'pb', namaTrack?: string): RapotTrackSnap {
  const rows = sesi.filter((s) => s.jenis === jenis);
  const history: (number | null)[] = [1, 2, 3, 4].map((n) => {
    const r = rows.find((s) => s.nomor_sesi === n && s.done && s.hadir !== false);
    return r ? scoreOf(r.counts).skor : null;
  });
  const filled = history.filter((v): v is number => v != null);
  const rata = filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length) : null;
  const catatan = rows
    .filter((s) => s.done && s.hadir !== false && s.catatan.trim())
    .sort((a, b) => a.nomor_sesi - b.nomor_sesi)
    .map((s) => ({ label: `${trackShort(jenis)} S${s.nomor_sesi}`, tgl: s.tgl, teks: s.catatan.trim() }));
  return { jenis, label: namaTrack ?? TRACK_LABEL[jenis], rata, history, catatan };
}

function akumulasiLahn(sesi: SesiNilaiInput[]): RapotLahnRow[] {
  const done = sesi
    .filter((s) => (s.jenis === 'qn' || s.jenis === 'pb') && s.done && s.hadir !== false)
    .map((s) => s.counts);
  const total = sumCounts(done);
  return ALL_LAHN.map((d) => ({ key: d.key, label: d.label, group: d.group, count: total[d.key] || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function buildBerkalaPayload(
  identitas: RapotIdentitas,
  penerbit: string,
  tanggal: string,
  sesi: SesiNilaiInput[],
  namaQn?: string,
  namaPb?: string,
  ambang = AMBANG_LULUS_AKHIR,
): RapotPayload {
  const scores = berkalaScores(sesi);
  const rataGabungan = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const tertinggi = scores.length ? Math.max(...scores) : null;
  const predikat = rataGabungan == null ? '—' : tierOf(rataGabungan).label;
  return {
    jenis_rapot: 'berkala',
    identitas,
    ambang,
    tanggal,
    penerbit,
    berkala: {
      rataGabungan,
      tertinggi,
      predikat,
      tracks: [buildTrack(sesi, 'qn', namaQn), buildTrack(sesi, 'pb', namaPb)],
      akumulasi: akumulasiLahn(sesi),
    },
  };
}

function ujianSnap(sesi: SesiNilaiInput[], nomor: number, label: string, ambang: number): RapotUjianSnap | null {
  const r = sesi.find((s) => s.jenis === 'ujian' && s.nomor_sesi === nomor && s.done && s.hadir !== false);
  if (!r) return null;
  const sc = scoreOf(r.counts);
  return {
    sesi: nomor,
    label,
    skor: sc.skor,
    jaliy: sc.jaliyCount,
    khafiy: sc.khafiyCount,
    counts: r.counts,
    tgl: r.tgl,
    catatan: r.catatan.trim(),
    lulus: sc.skor >= ambang,
  };
}

export function buildUjianPayload(
  identitas: RapotIdentitas,
  penerbit: string,
  tanggal: string,
  sesi: SesiNilaiInput[],
  // Ambang lulus PER-SESI ujian (QN/PB) = halaqah.ambang_ujian; harus sama dgn
  // layar Nilai pengajar. Ambang NILAI AKHIR tetap fix AMBANG_LULUS_AKHIR (70).
  ambangSesi = AMBANG_UJIAN_DEFAULT,
): RapotPayload {
  const qn = ujianSnap(sesi, UJIAN_QN_SESI, 'Ujian QN', ambangSesi);
  const pb = ujianSnap(sesi, UJIAN_PB_SESI, 'Ujian PB', ambangSesi);
  const na = nilaiAkhirOf(berkalaScores(sesi), pb?.skor ?? null);
  const rincian = ALL_LAHN.map((d) => ({
    key: d.key,
    label: d.label,
    group: d.group,
    qn: qn ? qn.counts[d.key] || 0 : null,
    pb: pb ? pb.counts[d.key] || 0 : null,
  })).filter((r) => (r.qn ?? 0) > 0 || (r.pb ?? 0) > 0);
  return {
    jenis_rapot: 'ujian',
    identitas,
    ambang: AMBANG_LULUS_AKHIR, // ambang nilai akhir (fix 70), ditampilkan di halaman verifikasi
    tanggal,
    penerbit,
    ujian: {
      nilaiAkhir: na.nilai,
      berkalaAvg: na.berkalaAvg,
      ujianPbSkor: na.ujianPbSkor,
      lulus: na.lulus,
      qn,
      pb,
      rincian,
      catatanPenguji: (pb?.catatan || qn?.catatan || '').trim(),
    },
  };
}

/**
 * Rapot untuk SATU ujian akhir saja (batch `rapot_ujian_terpisah`, 0058).
 *
 * Bedanya dgn `buildUjianPayload`:
 * - nilai akhir = skor ujian itu sendiri, tanpa bobot evaluasi berkala
 *   (`berkalaAvg` sengaja null supaya perender tahu komponen itu tak ada);
 * - ujian yang tidak difokuskan tidak muncul di mana pun — snap-nya null dan
 *   kolomnya di `rincian` diisi null, jadi rapot PB betul-betul tak menyebut QN.
 *
 * Ambang LULUS tetap `AMBANG_LULUS_AKHIR` (70), sama dengan batch lain.
 * `ambangSesi` hanya menentukan flag `lulus` di dalam snap (dipakai layar Nilai).
 */
export function buildUjianTunggalPayload(
  identitas: RapotIdentitas,
  penerbit: string,
  tanggal: string,
  sesi: SesiNilaiInput[],
  fokus: 'qn' | 'pb',
  ambangSesi = AMBANG_UJIAN_DEFAULT,
): RapotPayload {
  const nomor = fokus === 'qn' ? UJIAN_QN_SESI : UJIAN_PB_SESI;
  const label = fokus === 'qn' ? 'Ujian QN' : 'Ujian PB';
  const snap = ujianSnap(sesi, nomor, label, ambangSesi);
  const nilaiAkhir = snap?.skor ?? null;
  const rincian = ALL_LAHN.map((d) => ({
    key: d.key,
    label: d.label,
    group: d.group,
    qn: fokus === 'qn' && snap ? snap.counts[d.key] || 0 : null,
    pb: fokus === 'pb' && snap ? snap.counts[d.key] || 0 : null,
  })).filter((r) => ((fokus === 'qn' ? r.qn : r.pb) ?? 0) > 0);
  return {
    jenis_rapot: fokus === 'qn' ? 'ujian_qn' : 'ujian_pb',
    identitas,
    ambang: AMBANG_LULUS_AKHIR,
    tanggal,
    penerbit,
    ujian: {
      nilaiAkhir,
      berkalaAvg: null,
      ujianPbSkor: fokus === 'pb' ? nilaiAkhir : null,
      lulus: nilaiAkhir == null ? null : nilaiAkhir >= AMBANG_LULUS_AKHIR,
      qn: fokus === 'qn' ? snap : null,
      pb: fokus === 'pb' ? snap : null,
      rincian,
      catatanPenguji: (snap?.catatan ?? '').trim(),
    },
  };
}

// Re-export supaya konsumen cukup impor dari satu modul.
export { JALIY, KHAFIY, AMBANG_LULUS_AKHIR };
