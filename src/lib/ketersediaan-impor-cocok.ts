import 'server-only';
import type { Gender } from '@/types/db';
import { normalWa } from '@/lib/ketersediaan-pendaftar';

/**
 * Cocokkan satu baris xlsx ke akun `pengajar`.
 *
 * Nomor WA dipakai bila ada — itu identitas login aplikasi ini. Nomor yang tidak
 * punya akun TIDAK jatuh ke pencocokan nama: nama mirip bukan bukti orang yang
 * sama, dan memasangkannya diam-diam lebih berbahaya daripada melewatinya.
 *
 * Sheet offline tidak punya kolom WA, jadi dicocokkan lewat nama pada pengajar
 * aktif segender: persis setelah gelar dibuang, lalu sekurangnya dua kata sama.
 * Diuji 16 Sep 2026 terhadap 20 pengajar offline: 16 cocok tunggal, 5 tidak
 * ditemukan, 0 ganda. Yang tidak tunggal dipilihkan koordinator.
 */

export interface PengajarRingkas {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  active: boolean;
}

export type StatusCocok = 'cocok' | 'tanpa_akun' | 'gender_beda' | 'nama_tak_ketemu' | 'nama_ganda' | 'dilewati';

export interface HasilCocok {
  pengajar_id: string | null;
  status: StatusCocok;
  cara: 'wa' | 'nama' | 'manual' | null;
  /** Nama akun yang dipasangkan — ditampilkan supaya koordinator bisa memeriksa. */
  nama_akun: string | null;
  kandidat: { id: string; name: string }[];
}

const GELAR = new Set(['ustadz', 'ustadzah', 'ust', 'ustz', 'al', 'bin', 'binti']);

export function namaPengajarNormal(nama: string): string {
  return nama
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .split(' ')
    .filter((t) => t && !GELAR.has(t))
    .join(' ');
}

function kata(nama: string): Set<string> {
  return new Set(namaPengajarNormal(nama).split(' ').filter((t) => t.length > 2));
}

const hasil = (h: Partial<HasilCocok> & Pick<HasilCocok, 'status'>): HasilCocok => ({
  pengajar_id: null,
  cara: null,
  nama_akun: null,
  kandidat: [],
  ...h,
});

export function cocokkanPengajar(
  baris: { nama: string; wa: string | null; gender: Gender },
  daftar: readonly PengajarRingkas[],
  /** id pengajar pilihan koordinator, atau 'lewati'. */
  pilihan?: string
): HasilCocok {
  const aktif = daftar.filter((p) => p.active);

  if (pilihan === 'lewati') return hasil({ status: 'dilewati', cara: 'manual' });
  if (pilihan) {
    const p = aktif.find((x) => x.id === pilihan && x.gender === baris.gender);
    return p
      ? hasil({ status: 'cocok', cara: 'manual', pengajar_id: p.id, nama_akun: p.name })
      : hasil({ status: 'nama_tak_ketemu', cara: 'manual' });
  }

  if (baris.wa) {
    const p = aktif.find((x) => normalWa(x.whatsapp_number) === baris.wa);
    if (!p) return hasil({ status: 'tanpa_akun', cara: 'wa' });
    if (p.gender !== baris.gender) return hasil({ status: 'gender_beda', cara: 'wa', nama_akun: p.name });
    return hasil({ status: 'cocok', cara: 'wa', pengajar_id: p.id, nama_akun: p.name });
  }

  const segender = aktif.filter((p) => p.gender === baris.gender);
  const sasaran = namaPengajarNormal(baris.nama);
  let cocok = segender.filter((p) => namaPengajarNormal(p.name) === sasaran);
  if (cocok.length === 0) {
    const k = kata(baris.nama);
    const syarat = Math.min(2, k.size);
    cocok =
      syarat === 0
        ? []
        : segender.filter((p) => {
            const milik = kata(p.name);
            let sama = 0;
            for (const x of k) if (milik.has(x)) sama++;
            return sama >= syarat;
          });
  }

  if (cocok.length === 1) {
    return hasil({ status: 'cocok', cara: 'nama', pengajar_id: cocok[0].id, nama_akun: cocok[0].name });
  }
  if (cocok.length > 1) {
    return hasil({ status: 'nama_ganda', cara: 'nama', kandidat: cocok.map(({ id, name }) => ({ id, name })) });
  }
  return hasil({ status: 'nama_tak_ketemu', cara: 'nama' });
}
