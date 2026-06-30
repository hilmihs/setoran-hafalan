// WA Technical Support. Dipakai untuk:
// - tujuan tombol "Lapor Error" (ReportErrorButton)
// - tujuan pesan request reset password
export const ADMIN_WA = '6281399741809';

// Daftar WA superadmin (akses /admin/*: user management, log aktivitas,
// reset password). ADMIN_WA selalu termasuk. Tambah nomor untuk memberi
// hak superadmin.
export const SUPERADMIN_WAS: string[] = [
  ADMIN_WA,
  '628119915658', // Ryan Maulana
];
