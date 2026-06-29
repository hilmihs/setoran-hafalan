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
  deadlineLabel: string;
}): string {
  const sapaan = salutation(args.pesertaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pesertaName},`,
    ``,
    `Pengingat — antum belum menyetorkan hafalan pada cycle ini. Mohon segera setor melalui tautan berikut sebelum batas waktu (${args.deadlineLabel}):`,
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
  deadlineLabel: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.musyrifName},`,
    ``,
    `Pengingat — antum belum menyetorkan hafalan pada cycle ini. Mohon segera setor melalui tautan berikut sebelum batas waktu (${args.deadlineLabel}):`,
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

// ============================================================
// Template HITS — Kehadiran & Observasi
// ============================================================

export function tplReminderPengajarCheckin(args: {
  pengajarName: string;
  pengajarGender: Gender;
  programName: string;
  checkinUrl: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Pengingat — mohon segera check-in kehadiran untuk *${args.programName}* hari ini.`,
    ``,
    `Tautan check-in:`,
    args.checkinUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplPengajarAlasanToKetuaKelompok(args: {
  pengajarName: string;
  pengajarGender: Gender;
  ketuaGender: Gender;
  ketuaName: string;
  programName: string;
  tanggal: string;
  jenis: string;
  alasan: string;
  reviewUrl: string;
}): string {
  const sapaan = salutation(args.ketuaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.ketuaName},`,
    ``,
    `${salutation(args.pengajarGender)} ${args.pengajarName} mengajukan alasan *${args.jenis}* pada *${args.programName}* tanggal ${args.tanggal}:`,
    ``,
    `"${args.alasan}"`,
    ``,
    `Mohon ditinjau dan diputuskan melalui tautan:`,
    args.reviewUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplLiburProgram(args: {
  pengajarName: string;
  pengajarGender: Gender;
  programName: string;
  tanggal: string;
  keterangan: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Diberitahukan bahwa *${args.programName}* pada tanggal *${args.tanggal}* diliburkan.`,
    args.keterangan ? `Keterangan: ${args.keterangan}` : '',
    ``,
    `Jazakumullahu khairan.`,
  ].filter(Boolean).join('\n');
}

export function tplReminderKetuaKelompokTugas(args: {
  ketuaName: string;
  ketuaGender: Gender;
  tugasPending: string[];
  dashboardUrl: string;
}): string {
  const sapaan = salutation(args.ketuaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.ketuaName},`,
    ``,
    `Ada tugas yang perlu ditindaklanjuti:`,
    ...args.tugasPending.map((t) => `• ${t}`),
    ``,
    `Silakan cek dashboard:`,
    args.dashboardUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplTabayyunToPengajar(args: {
  pengajarName: string;
  pengajarGender: Gender;
  kondisi: string;
  tanggal: string;
  kelasName: string;
  formUrl: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Berdasarkan laporan observasi kelas *${args.kelasName}* tanggal *${args.tanggal}*, tercatat kondisi: *${args.kondisi}*.`,
    ``,
    `Mohon sampaikan alasan/klarifikasi melalui tautan berikut:`,
    args.formUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplTeguranToPengajar(args: {
  pengajarName: string;
  pengajarGender: Gender;
  nomorTeguran: number;
  kategori: string;
  keterangan: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Ini adalah *teguran ke-${args.nomorTeguran}* terkait: ${args.kategori}.`,
    args.keterangan ? `Keterangan: ${args.keterangan}` : '',
    ``,
    `Mohon agar tidak mengulangi hal ini di waktu mendatang karena berkaitan dengan amanah kepada umat.`,
    args.nomorTeguran >= 3 ? `\n⚠️ Peringatan: teguran ke-4 akan mengakibatkan penonaktifan pengajar.` : '',
    ``,
    `Jazakumullahu khairan.`,
  ].filter(Boolean).join('\n');
}

export function tplSuratNonaktif(args: {
  pengajarName: string;
  pengajarGender: Gender;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Dengan berat hati kami sampaikan bahwa berdasarkan akumulasi 4 kali teguran, antum untuk sementara *dinonaktifkan* dari tugas sebagai pengajar HITS.`,
    ``,
    `Mohon hubungi koordinator untuk langkah selanjutnya.`,
    ``,
    `Semoga Allah memudahkan urusan antum.`,
  ].join('\n');
}

export function tplAlasanDiterima(args: {
  pengajarName: string;
  pengajarGender: Gender;
  kondisi: string;
  tanggal: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Alasan antum terkait *${args.kondisi}* pada tanggal *${args.tanggal}* telah diterima sebagai udzur syar'i.`,
    ``,
    `Mohon agar ke depan bisa mengkondisikan sebaik mungkin agar kelas berjalan sesuai jadwal.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplJadwalPindahToKoorKK(args: {
  pengajarName: string;
  pengajarGender: Gender;
  kelasName: string;
  tanggalAsal: string;
  tanggalPengganti: string;
  waktuPengganti: string;
  alasan: string;
}): string {
  return [
    `Assalamu'alaikum,`,
    ``,
    `${salutation(args.pengajarGender)} ${args.pengajarName} memindahkan jadwal *${args.kelasName}*:`,
    `• Jadwal asal: ${args.tanggalAsal}`,
    `• Jadwal pengganti: ${args.tanggalPengganti}, ${args.waktuPengganti}`,
    `• Alasan: ${args.alasan}`,
    ``,
    `Mohon ditindaklanjuti.`,
  ].join('\n');
}

export function tplHapusPertemuanToKoorKK(args: {
  ketuaName: string;
  kelasName: string;
  pertemuanNo: number;
  tanggal: string | null;
  levelLabel: string;
  alasan: string;
  approveUrl: string;
}): string {
  return [
    `Assalamu'alaikum,`,
    ``,
    `Ketua kelas *${args.ketuaName}* mengajukan penghapusan pertemuan yang dianggap kelebihan/salah:`,
    `• Halaqah: ${args.kelasName}`,
    `• Pertemuan: ${args.pertemuanNo} (${args.levelLabel})${args.tanggal ? ` · ${args.tanggal}` : ''}`,
    `• Alasan: ${args.alasan || '-'}`,
    ``,
    `Setujui / tolak di sini:`,
    args.approveUrl,
  ].join('\n');
}

export function tplJadwalPindahToKetuaKelas(args: {
  ketuaKelasName: string;
  ketuaKelasGender: Gender;
  pengajarName: string;
  kelasName: string;
  tanggalAsal: string;
  tanggalPengganti: string;
  waktuPengganti: string;
}): string {
  const sapaan = salutation(args.ketuaKelasGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.ketuaKelasName},`,
    ``,
    `Diberitahukan bahwa jadwal *${args.kelasName}* bersama ${args.pengajarName} dipindahkan:`,
    `• Jadwal asal: ${args.tanggalAsal}`,
    `• Jadwal baru: ${args.tanggalPengganti}, ${args.waktuPengganti}`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderKetuaKelasObservasi(args: {
  ketuaKelasName: string;
  ketuaKelasGender: Gender;
  kelasName: string;
  observasiUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${args.ketuaKelasName},`,
    ``,
    `Pengingat — mohon isi laporan observasi kelas *${args.kelasName}* hari ini melalui tautan:`,
    args.observasiUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderPengajarTunjukKetua(args: {
  pengajarName: string;
  pengajarGender: Gender;
  kelasName: string;
  url: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Pengingat — halaqah *${args.kelasName}* belum memiliki ketua kelas. Mohon segera tunjuk salah satu peserta sebagai ketua melalui tautan:`,
    args.url,
    ``,
    `Ketua kelas bertugas mengisi keterangan pengajar & latihan tiap pertemuan.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplMagicLinkKetuaKelas(args: {
  ketuaKelasName: string;
  ketuaKelasGender: Gender;
  kelasName: string;
  magicUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${args.ketuaKelasName},`,
    ``,
    `Silakan isi observasi kelas *${args.kelasName}* hari ini:`,
    args.magicUrl,
    ``,
    `(Link ini hanya untuk Anda)`,
  ].join('\n');
}

export function tplPindahHalaqahToTarget(args: {
  targetName: string;
  targetGender: Gender;
  requesterName: string;
  halaqahName: string;
  approveUrl: string;
  loginUrl: string;
}): string {
  const sapaan = salutation(args.targetGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.targetName},`,
    ``,
    `${args.requesterName} mengajukan pemindahan halaqah *${args.halaqahName}* kepada antum sebagai pengajar.`,
    ``,
    `*Cara menyetujui:*`,
    `1. Login dulu (nomor WA + password) di:`,
    args.loginUrl,
    `2. Lalu buka tautan persetujuan berikut & pilih *Setujui* / *Tolak*:`,
    args.approveUrl,
    ``,
    `(Hanya antum sebagai pengajar tujuan yang bisa menyetujui.)`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplPindahDisetujuiToRequester(args: {
  requesterName: string;
  requesterGender: Gender;
  targetName: string;
  halaqahName: string;
  pengajarUrl: string;
}): string {
  const sapaan = salutation(args.requesterGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.requesterName},`,
    ``,
    `Pemindahan halaqah *${args.halaqahName}* telah *disetujui* oleh ${args.targetName}.`,
    ``,
    `Mohon cek kembali daftar halaqah untuk memastikan sudah benar, lalu tunjuk ketua kelas:`,
    args.pengajarUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplKetuaKelasTerpilih(args: {
  ketuaKelasName: string;
  ketuaKelasGender: Gender;
  kelasName: string;
  magicUrl: string;
  linkGrupWa: string | null;
  // HITS soft-skill: login WA + password.
  loginUrl?: string;
  loginWa?: string;
  initialPassword?: string;
}): string {
  const lines = [
    `Assalamu'alaikum ${args.ketuaKelasName},`,
    ``,
    `Anda telah dipilih sebagai *Ketua Kelas ${args.kelasName}*.`,
    ``,
    `Tugas Anda adalah mengisi keterangan pengajar & latihan tiap pertemuan.`,
  ];
  if (args.loginUrl && args.initialPassword) {
    lines.push(``);
    lines.push(`*Cara masuk:*`);
    lines.push(args.loginUrl);
    lines.push(`Nomor WA: ${args.loginWa ?? '(nomor ini)'}`);
    lines.push(`Password awal: ${args.initialPassword}`);
    lines.push(`(ketik ${args.initialPassword.length} angka itu saja — tanpa spasi/tanda bintang; mohon ganti setelah login)`);
    lines.push(``);
    lines.push(`Atau langsung lewat link khusus berikut:`);
    lines.push(args.magicUrl);
  } else {
    lines.push(``);
    lines.push(`Silakan masuk melalui link berikut:`);
    lines.push(args.magicUrl);
    lines.push(``);
    lines.push(`(Link ini khusus untuk Anda, jangan dibagikan)`);
  }
  if (args.linkGrupWa) {
    lines.push(``);
    lines.push(`Silakan bergabung ke grup koordinasi ketua kelas:`);
    lines.push(args.linkGrupWa);
  }
  lines.push(``);
  lines.push(`Jazakumullahu khairan.`);
  return lines.join('\n');
}
