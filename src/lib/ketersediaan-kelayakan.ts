import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsKelayakan } from '@/types/db';
import { daftarDipakai, layakMenurutDaftar } from '@/lib/ketersediaan-kelayakan-aturan';

/**
 * Daftar pengajar yang boleh mengisi ketersediaan pada satu periode.
 *
 * Daftar resminya dulu hidup di dropdown form Google ("Nama Lengkap Pengajar")
 * dan jauh lebih pendek daripada seluruh akun ber-role `pengajar`. Tabel
 * `ks_kelayakan` memindahkannya ke dalam aplikasi agar koordinator bisa
 * menambah/mengurangi sendiri per batch.
 */

export { daftarDipakai, layakMenurutDaftar } from '@/lib/ketersediaan-kelayakan-aturan';
export type { BarisKelayakan } from '@/lib/ketersediaan-kelayakan-aturan';

export async function listKelayakan(periodeId: string): Promise<KsKelayakan[]> {
  const { data } = await supabaseAdmin
    .from('ks_kelayakan')
    .select('*')
    .eq('periode_id', periodeId);
  return (data ?? []) as KsKelayakan[];
}

/** Penilaian untuk satu pengajar — dipakai halaman & server action pengajar. */
export async function apakahLayak(periodeId: string, pengajarId: string): Promise<boolean> {
  const daftar = await listKelayakan(periodeId);
  return layakMenurutDaftar(daftar, pengajarId);
}

export interface BarisKelayakanPengajar {
  pengajar_id: string;
  nama: string;
  gender: Gender;
  boleh: boolean;
  /** Belum pernah tercatat di daftar periode ini. */
  belumDisetel: boolean;
  /** Tidak memegang halaqah HITS maupun kelas Maahir yang aktif. */
  belumMengajar: boolean;
  /** Sudah terlanjur mengisi ketersediaan periode ini. */
  punyaIsian: boolean;
  alasan: string | null;
}

/**
 * Ringkasan untuk panel koordinator: seluruh pengajar aktif satu gender, beserta
 * status kelayakan, penanda "belum mengajar", dan apakah isiannya sudah masuk.
 *
 * "Belum mengajar" dihitung dari `hits_halaqah` aktif dan `kelas_hits` — dua
 * sumber yang sama dipakai deteksi bentrok jadwal. Mereka justru kandidat yang
 * paling perlu dimunculkan koordinator, jadi panel menaruhnya di urutan atas.
 */
export async function ringkasKelayakan(
  periodeId: string,
  gender: Gender
): Promise<BarisKelayakanPengajar[]> {
  const [{ data: pengajar }, daftar, { data: pengisian }, { data: halaqah }, { data: kelas }] =
    await Promise.all([
      supabaseAdmin
        .from('pengajar')
        .select('id, name, gender')
        .eq('active', true)
        .eq('gender', gender)
        .order('name'),
      listKelayakan(periodeId),
      supabaseAdmin.from('ks_pengisian').select('pengajar_id').eq('periode_id', periodeId),
      supabaseAdmin.from('hits_halaqah').select('pengajar_id').eq('active', true),
      supabaseAdmin.from('kelas_hits').select('pengajar_id'),
    ]);

  const status = new Map(daftar.map((d) => [d.pengajar_id, d]));
  const sudahIsi = new Set(
    ((pengisian ?? []) as { pengajar_id: string }[]).map((p) => p.pengajar_id)
  );
  const mengajar = new Set<string>();
  for (const h of (halaqah ?? []) as { pengajar_id: string | null }[]) {
    if (h.pengajar_id) mengajar.add(h.pengajar_id);
  }
  for (const k of (kelas ?? []) as { pengajar_id: string | null }[]) {
    if (k.pengajar_id) mengajar.add(k.pengajar_id);
  }

  const pakaiDaftar = daftarDipakai(daftar);

  return ((pengajar ?? []) as { id: string; name: string; gender: Gender }[]).map((p) => {
    const baris = status.get(p.id);
    return {
      pengajar_id: p.id,
      nama: p.name,
      gender: p.gender,
      boleh: baris ? baris.boleh : !pakaiDaftar,
      belumDisetel: !baris,
      belumMengajar: !mengajar.has(p.id),
      punyaIsian: sudahIsi.has(p.id),
      alasan: baris?.alasan ?? null,
    };
  });
}

/** Urutan tampilan: yang belum mengajar dulu, lalu abjad. */
export function urutkanKelayakan(baris: BarisKelayakanPengajar[]): BarisKelayakanPengajar[] {
  return [...baris].sort((a, b) => {
    if (a.belumMengajar !== b.belumMengajar) return a.belumMengajar ? -1 : 1;
    return a.nama.localeCompare(b.nama, 'id');
  });
}
