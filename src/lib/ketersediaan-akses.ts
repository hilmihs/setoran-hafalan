import 'server-only';
import { bolehLihatFiturTersembunyi } from '@/lib/admin-guard';

/**
 * Gerbang fitur Ketersediaan Mengajar selama masih disembunyikan.
 *
 * Halaman sudah dijaga, tetapi server action adalah endpoint POST publik: id
 * action ikut terkirim di bundel JS halaman mana pun yang memakainya. Tanpa
 * gerbang di setiap action, koordinator biasa (atau pengajar) bisa memanggilnya
 * langsung walau halamannya 404. Dipanggil SETELAH cek peran.
 */
export async function jagaFiturKetersediaan(): Promise<void> {
  if (!(await bolehLihatFiturTersembunyi())) {
    throw new Error('Fitur Ketersediaan Mengajar belum dibuka untuk akun ini.');
  }
}
