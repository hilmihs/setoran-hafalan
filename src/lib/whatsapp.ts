import type { Gender } from '@/types/db';

/**
 * Normalisasi nomor WhatsApp ke format internasional tanpa "+" / spasi.
 * Contoh: "0812-3456-7890" → "6281234567890"
 *         "+62 812 3456 7890" → "6281234567890"
 */
export function normalizeWhatsApp(input: string): string {
  let n = input.replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (!n.startsWith('62')) n = '62' + n;
  return n;
}

/**
 * Generate link wa.me dengan pesan pre-filled.
 * User tetap harus tap tombol "Kirim" di WhatsApp setelah link dibuka.
 */
export function buildWaMeUrl(phone: string, message: string): string {
  const normalized = normalizeWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

/**
 * Sapaan gender-aware. ikhwan → "Ustadz", akhwat → "Ustadzah".
 */
export function salutation(gender: Gender): 'Ustadz' | 'Ustadzah' {
  return gender === 'ikhwan' ? 'Ustadz' : 'Ustadzah';
}

/**
 * Titel role tertinggi: Syaikh (ikhwan) atau Ustadzah (akhwat).
 */
export function syaikhTitle(gender: Gender): 'Syaikh' | 'Ustadzah' {
  return gender === 'ikhwan' ? 'Syaikh' : 'Ustadzah';
}

/**
 * Titel role musyrif: Musyrif (ikhwan) atau Musyrifah (akhwat).
 */
export function musyrifTitle(gender: Gender): 'Musyrif' | 'Musyrifah' {
  return gender === 'ikhwan' ? 'Musyrif' : 'Musyrifah';
}

// ============================================================
// Template pesan untuk setiap skenario notifikasi
// ============================================================

// ---------- Peserta ↔ Musyrif ----------

export function tplPesertaSubmitToMusyrif(args: {
  pesertaName: string;
  pesertaGender: Gender;
  kelasName: string;
  musyrifGender: Gender;
  cekUrl: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  const ana = args.pesertaGender === 'ikhwan' ? 'Ana' : 'Ana (akhwat)';
  return [
    `Assalamu'alaikum ${sapaan},`,
    ``,
    `${ana} ${args.pesertaName} (kelas ${args.kelasName}) telah menyetorkan hafalan pekan ini.`,
    ``,
    `Mohon kesediaan ${sapaan.toLowerCase()} untuk memeriksa rekaman pada tautan berikut:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplMusyrifFeedbackToPeserta(args: {
  pesertaName: string;
  pesertaGender: Gender;
  nilaiSummary: string;
  masukanGabungan: string;
}): string {
  const sapaan = salutation(args.pesertaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pesertaName},`,
    ``,
    `Berikut hasil pemeriksaan setoran hafalan antum pekan ini:`,
    ``,
    args.nilaiSummary,
    ``,
    `Catatan & masukan:`,
    args.masukanGabungan,
    ``,
    `Semoga istiqamah, baarakallaahu fiik.`,
  ].join('\n');
}

export function tplReminderPesertaBelumSetor(args: {
  pesertaName: string;
  pesertaGender: Gender;
  setorUrl: string;
}): string {
  const sapaan = salutation(args.pesertaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pesertaName},`,
    ``,
    `Pengingat — antum belum menyetorkan hafalan pada cycle ini. Mohon segera setor melalui tautan berikut sebelum batas waktu (Ahad pekan ke-2):`,
    args.setorUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderMusyrifBelumCek(args: {
  musyrifName: string;
  musyrifGender: Gender;
  pesertaName: string;
  kelasName: string;
  cekUrl: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.musyrifName},`,
    ``,
    `Pengingat — setoran dari ${args.pesertaName} (kelas ${args.kelasName}) masih menunggu pemeriksaan.`,
    ``,
    `Tautan pemeriksaan:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

// ---------- Musyrif ↔ Syaikh ----------

export function tplMusyrifSubmitToSyaikh(args: {
  musyrifName: string;
  musyrifGender: Gender;
  syaikhGender: Gender;
  cekUrl: string;
}): string {
  const titel = syaikhTitle(args.syaikhGender);
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${titel},`,
    ``,
    `Ana ${sapaan} ${args.musyrifName} telah menyetorkan hafalan pada cycle ini.`,
    ``,
    `Mohon kesediaan ${titel.toLowerCase()} untuk memeriksa rekaman pada tautan berikut:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplSyaikhFeedbackToMusyrif(args: {
  musyrifName: string;
  musyrifGender: Gender;
  nilaiSummary: string;
  masukanGabungan: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.musyrifName},`,
    ``,
    `Berikut hasil pemeriksaan setoran hafalan antum cycle ini:`,
    ``,
    args.nilaiSummary,
    ``,
    `Catatan & masukan:`,
    args.masukanGabungan,
    ``,
    `Semoga istiqamah, baarakallaahu fiik.`,
  ].join('\n');
}

export function tplReminderMusyrifBelumSetor(args: {
  musyrifName: string;
  musyrifGender: Gender;
  setorUrl: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.musyrifName},`,
    ``,
    `Pengingat — antum belum menyetorkan hafalan pada cycle ini. Mohon segera setor melalui tautan berikut:`,
    args.setorUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderSyaikhBelumCek(args: {
  syaikhName: string;
  syaikhGender: Gender;
  musyrifName: string;
  cekUrl: string;
}): string {
  const titel = syaikhTitle(args.syaikhGender);
  return [
    `Assalamu'alaikum ${titel} ${args.syaikhName},`,
    ``,
    `Pengingat — setoran dari ${args.musyrifName} masih menunggu pemeriksaan.`,
    ``,
    `Tautan pemeriksaan:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}
