import type { KsHariIdx, KsMode, KsPitaUmur } from '@/types/db';

/**
 * Normalisasi slot waktu HITS.
 *
 * Alasan modul ini ada: teks slot TIDAK dapat diperbandingkan apa adanya.
 * Pada berkas nyata yang beredar sudah bercampur —
 *   "Selasa & Jum'at 16.00 - 17.30 WIB"   (titik, apostrof lurus)
 *   "Selasa & Jumat 16:00 - 17:30 WIB"    (titik dua, tanpa apostrof)
 *   "Selasa & Kamis 10.00 -11.30 WIB"     (spasi pincang)
 * dan `hits_halaqah.jadwal_raw` masih membawa awalan mode: "Online Sabtu & Ahad …".
 *
 * Karena itu semua perbandingan dilakukan pada bentuk kanonik: indeks hari
 * (0 = Senin … 6 = Ahad) + jam sebagai menit sejak tengah malam. Indeks hari
 * sengaja sejajar dengan `int_days` milik /api/days CMS tilawah, sehingga usulan
 * pemetaan day_id bisa dihitung alih-alih ditebak dari teks.
 */

/** 0 = Senin … 6 = Ahad. Sama dengan `int_days` CMS tilawah. */
export const HARI_URUT = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu', 'Ahad'] as const;

const HARI_ALIAS: Record<string, KsHariIdx> = {
  senin: 0,
  selasa: 1,
  rabu: 2,
  kamis: 3,
  jumat: 4,
  juma: 4, // "Jum'a" setelah apostrof dibuang oleh penulisan yang aneh
  jum: 4,
  sabtu: 5,
  ahad: 6,
  minggu: 6,
};

/** Buang apostrof/titik/tanda baca, rapatkan spasi, huruf kecil. */
function bersih(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[''`´]/g, '')
    .replace(/[^a-zA-Z]+/g, '')
    .toLowerCase();
}

/** "Jum'at" | "JUMAT" | "jum at" → 4. null bila bukan nama hari. */
export function hariKeIdx(nama: string): KsHariIdx | null {
  const k = bersih(nama);
  if (!k) return null;
  if (k in HARI_ALIAS) return HARI_ALIAS[k];
  // Toleransi ejaan panjang: "jumaat", "jummat".
  if (k.startsWith('jum')) return 4;
  if (k.startsWith('ahad') || k.startsWith('minggu')) return 6;
  return null;
}

export function idxKeHari(i: KsHariIdx): string {
  return HARI_URUT[i];
}

/**
 * Ambil daftar indeks hari dari sekumpulan nama, terurut & unik.
 * Nama yang tak dikenali diabaikan diam-diam — pemanggil membandingkan panjang
 * masukan dan keluaran bila perlu tahu ada yang gagal.
 */
export function hariKeIdxSet(nama: readonly string[]): KsHariIdx[] {
  const out = new Set<KsHariIdx>();
  for (const n of nama) {
    const i = hariKeIdx(n);
    if (i !== null) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** "06:00" | "6.00" | "0600" → menit sejak tengah malam. null bila tak terbaca. */
export function jamKeMenit(teks: string): number | null {
  const t = teks.trim();
  const m = t.match(/^(\d{1,2})\s*[.:]\s*(\d{2})/) ?? t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const jam = Number(m[1]);
  const menit = Number(m[2]);
  if (!Number.isFinite(jam) || !Number.isFinite(menit)) return null;
  if (jam > 23 || menit > 59) return null;
  return jam * 60 + menit;
}

export function menitKeJam(menit: number): string {
  const h = Math.floor(menit / 60);
  const m = menit % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "06:00:00" (time Postgres) atau "06:00" → menit. */
export function timeKeMenit(t: string | null | undefined): number | null {
  if (!t) return null;
  return jamKeMenit(t);
}

export interface SlotTerurai {
  hari: string[];
  hari_idx: KsHariIdx[];
  waktu_mulai: string;
  waktu_selesai: string;
  mode: KsMode | null;
  /** Teks lokasi yang menempel pada pilihan offline, bila ada. */
  lokasi: string | null;
  /** Label yang sudah dirapikan, siap disimpan & ditampilkan. */
  label: string;
}

/** Pola satu rentang jam, mis. "06:00 - 07:30" atau "10.00 -11.30". */
const POLA_RENTANG = /(\d{1,2}\s*[.:]\s*\d{2})\s*[-–—]\s*(\d{1,2}\s*[.:]\s*\d{2})/g;

/**
 * Nama hari di mana pun dalam sepotong teks, berurut kemunculan.
 *
 * Memindai nama, bukan memotong pemisah, karena pilihan offline di Google Form
 * menyelipkan lokasi sebelum harinya:
 *   "Offline di Masjid Al Kautsar Matraman Jakarta Timur Selasa & Kamis 16.00 - 17.30 WIB"
 * Memotong pada "&" akan menjadikan "…Jakarta Timur Selasa" satu potongan yang
 * tak dikenali, sehingga Selasa hilang dan slotnya terbaca Kamis saja.
 */
function pindaiHari(teks: string): { idx: KsHariIdx[]; posisiAwal: number } {
  const pola = /\b(senin|selasa|rabu|kamis|jum[''`´]?\s?at|jumat|sabtu|ahad|minggu)\b/gi;
  const out: KsHariIdx[] = [];
  let posisiAwal = -1;
  for (const m of teks.matchAll(pola)) {
    const i = hariKeIdx(m[1]);
    if (i === null) continue;
    if (posisiAwal < 0) posisiAwal = m.index ?? 0;
    if (!out.includes(i)) out.push(i);
  }
  return { idx: out.sort((a, b) => a - b), posisiAwal };
}

/**
 * Urai satu teks jadwal menjadi bentuk kanonik.
 *
 * Menerima bentuk yang beredar, termasuk pilihan Google Form yang menempelkan
 * lokasi:
 *   "Senin & Rabu 06:00 - 07:30 WIB"
 *   "Online Selasa & Jum'at 06:00 - 07:30 WIB"          ← hits_halaqah.jadwal_raw
 *   "Offline di Pejaten Senin & Rabu 16:30 - 18:00 WIB" ← pilihan form pendaftaran
 *
 * Mengembalikan null bila hari atau jam tidak dapat dibaca, DAN bila teksnya
 * memuat lebih dari satu rentang jam — mis. "Senin 07.30 - 09.00 WIB & Selasa
 * 13.00 - 14.30 WIB", yang berarti dua jadwal berbeda dan tidak dapat diwakili
 * satu slot. Menebaknya akan menaruh kelas pada jam yang salah, jadi baris
 * seperti itu ditahan untuk diperiksa manusia.
 */
export function uraikanSlot(teks: string): SlotTerurai | null {
  if (!teks) return null;
  let sisa = teks.trim();

  let mode: KsMode | null = null;
  const modeMatch = sisa.match(/^\s*(online|offline|hybrid)\b/i);
  if (modeMatch) {
    const m = modeMatch[1].toLowerCase();
    mode = m === 'offline' ? 'offline' : 'online';
    sisa = sisa.slice(modeMatch[0].length).trim();
  }

  const rentang = [...sisa.matchAll(POLA_RENTANG)];
  if (rentang.length === 0) return null;
  if (rentang.length > 1) return null; // dua jadwal berbeda — bukan satu slot

  const { idx: hari_idx, posisiAwal } = pindaiHari(sisa.slice(0, rentang[0].index ?? sisa.length));
  if (hari_idx.length === 0) return null;

  const mulai = jamKeMenit(rentang[0][1]);
  const selesai = jamKeMenit(rentang[0][2]);
  if (mulai === null || selesai === null || selesai <= mulai) return null;

  // Teks sebelum nama hari pertama adalah lokasi, bila ada. "di Pejaten" → "Pejaten".
  const depan = posisiAwal > 0 ? sisa.slice(0, posisiAwal).trim() : '';
  const lokasi = depan.replace(/^di\s+/i, '').trim() || null;

  const hari = hari_idx.map(idxKeHari);
  return {
    hari,
    hari_idx,
    waktu_mulai: menitKeJam(mulai),
    waktu_selesai: menitKeJam(selesai),
    mode,
    lokasi,
    label: `${hari.join(' & ')} ${menitKeJam(mulai)} - ${menitKeJam(selesai)} WIB`,
  };
}

/**
 * Susun label baku dari bentuk kanonik. Dipakai saat koordinator membuat slot
 * lewat borang, supaya label di master tidak pernah lahir dengan ejaan liar.
 */
export function susunLabel(hari_idx: readonly KsHariIdx[], mulai: string, selesai: string): string {
  const urut = [...new Set(hari_idx)].sort((a, b) => a - b);
  const m = jamKeMenit(mulai);
  const s = jamKeMenit(selesai);
  const jamTeks = m !== null && s !== null ? `${menitKeJam(m)} - ${menitKeJam(s)}` : `${mulai} - ${selesai}`;
  return `${urut.map(idxKeHari).join(' & ')} ${jamTeks} WIB`;
}

// ── Bentrok ────────────────────────────────────────────────────────────────

export interface RentangJadwal {
  hari_idx: readonly KsHariIdx[];
  /** Menit sejak tengah malam. */
  mulai: number;
  selesai: number;
}

/**
 * Dua jadwal bentrok bila harinya beririsan DAN jamnya bertumpang tindih.
 * Sentuhan ujung tidak dihitung bentrok: kelas 06:00–07:30 dan 07:30–09:00
 * boleh dipegang orang yang sama.
 */
export function bentrok(a: RentangJadwal, b: RentangJadwal): boolean {
  const irisan = a.hari_idx.some((h) => b.hari_idx.includes(h));
  if (!irisan) return false;
  return a.mulai < b.selesai && a.selesai > b.mulai;
}

/** Bentuk RentangJadwal dari baris ks_slot. */
export function rentangDariSlot(slot: {
  hari_idx: KsHariIdx[];
  waktu_mulai: string;
  waktu_selesai: string;
}): RentangJadwal | null {
  const mulai = timeKeMenit(slot.waktu_mulai);
  const selesai = timeKeMenit(slot.waktu_selesai);
  if (mulai === null || selesai === null) return null;
  return { hari_idx: slot.hari_idx, mulai, selesai };
}

/**
 * Bentuk RentangJadwal dari baris hits_halaqah.
 *
 * Kolomnya sering tidak lengkap: sebagian halaqah lama hanya punya `jadwal_raw`
 * berisi "Selasa & Jum'at" tanpa jam sama sekali (baris observasi). Urutan
 * usaha: kolom terurai dulu, lalu jatuh ke penguraian `jadwal_raw`.
 * Mengembalikan null bila jam tetap tak diketahui — halaqah tanpa jam tidak
 * boleh mengunci slot mana pun, karena tak ada dasar menyatakan bentrok.
 */
export function rentangDariHalaqah(h: {
  jadwal_hari: string[] | null;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  jadwal_raw: string | null;
}): RentangJadwal | null {
  const mulai = timeKeMenit(h.waktu_mulai);
  const selesai = timeKeMenit(h.waktu_selesai);
  const idx = hariKeIdxSet(h.jadwal_hari ?? []);
  if (idx.length > 0 && mulai !== null && selesai !== null && selesai > mulai) {
    return { hari_idx: idx, mulai, selesai };
  }
  const urai = h.jadwal_raw ? uraikanSlot(h.jadwal_raw) : null;
  if (!urai) return null;
  const m = jamKeMenit(urai.waktu_mulai);
  const s = jamKeMenit(urai.waktu_selesai);
  if (m === null || s === null) return null;
  return { hari_idx: urai.hari_idx, mulai: m, selesai: s };
}

// ── Pita umur ──────────────────────────────────────────────────────────────

/**
 * Umur dalam tahun penuh pada tanggal acuan. Acuan diberikan pemanggil
 * (bukan Date.now di dalam) supaya hasil rekap dapat diulang dan diuji.
 */
export function hitungUmur(tanggalLahir: string, acuan: Date): number | null {
  const lahir = new Date(`${tanggalLahir.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(lahir.getTime())) return null;
  let umur = acuan.getUTCFullYear() - lahir.getUTCFullYear();
  const bulan = acuan.getUTCMonth() - lahir.getUTCMonth();
  if (bulan < 0 || (bulan === 0 && acuan.getUTCDate() < lahir.getUTCDate())) umur -= 1;
  return umur;
}

export function pitaUmur(umur: number): KsPitaUmur {
  if (umur <= 17) return '<=17';
  if (umur <= 25) return '18-25';
  if (umur <= 35) return '26-35';
  if (umur <= 45) return '36-45';
  return '46+';
}
