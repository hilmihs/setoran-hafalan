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

// ============================================================
// Template pesan untuk setiap skenario notifikasi
// ============================================================

export function tplPesertaSubmitToMusyrif(args: {
  pesertaName: string;
  kelasName: string;
  cekUrl: string;
}): string {
  return [
    `Assalamu'alaikum Ustadz,`,
    ``,
    `Ana ${args.pesertaName} (kelas ${args.kelasName}) telah menyetorkan hafalan pekan ini.`,
    ``,
    `Mohon kesediaan ustadz untuk memeriksa rekaman pada tautan berikut:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplMusyrifFeedbackToPeserta(args: {
  pesertaName: string;
  nilaiSummary: string; // mis: "Tuhfatul Athfal: Hijau, Jazariyyah: Kuning, Syawahid: Hijau"
  masukanGabungan: string;
}): string {
  return [
    `Assalamu'alaikum ${args.pesertaName},`,
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
  setorUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${args.pesertaName},`,
    ``,
    `Pengingat — antum belum menyetorkan hafalan pekan ini. Mohon segera setor melalui tautan berikut sebelum batas waktu (Ahad 23.59):`,
    args.setorUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderMusyrifBelumCek(args: {
  musyrifName: string;
  pesertaName: string;
  kelasName: string;
  cekUrl: string;
}): string {
  return [
    `Assalamu'alaikum Ustadz ${args.musyrifName},`,
    ``,
    `Pengingat — setoran dari ${args.pesertaName} (kelas ${args.kelasName}) masih menunggu pemeriksaan.`,
    ``,
    `Tautan pemeriksaan:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}
