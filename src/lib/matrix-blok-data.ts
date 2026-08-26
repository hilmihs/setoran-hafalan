// Query sisi server untuk blok ranking Matrix Skill Guru. Dipisah dari
// `matrix-blok.ts` supaya file itu tetap aman diimpor komponen client.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { anggotaAktifPada, todayJakarta } from '@/lib/anggota-periode';
import {
  blokDariJenis,
  jenisKelasMaahir,
  type JenisKelasMaahir,
  type MatrixBlok,
} from '@/lib/matrix-blok';

/**
 * Tanggal acuan keanggotaan untuk satu bulan matrix: akhir bulan itu, tapi tak
 * pernah melewati hari ini. Bulan berjalan memakai hari ini (kalau tidak,
 * seseorang yang keluar kelas pertengahan bulan tetap terhitung), bulan lampau
 * memakai akhir bulannya supaya bloknya tak berubah oleh mutasi setelahnya.
 */
export function acuanTanggalBlok(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const akhirBulan = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const kini = todayJakarta();
  return akhirBulan < kini ? akhirBulan : kini;
}

/**
 * Blok tiap pengajar, di-link ke `program_kelas_anggota` lewat nomor WA —
 * sama seperti sumber kehadiran di `matrix-compute.ts`. Pengajar tanpa WA
 * yang cocok masuk blok 'tanpa_kelas'.
 */
export async function getBlokPengajar(
  pengajar: ReadonlyArray<{ id: string; whatsapp_number: string | null }>,
  pada: string
): Promise<Map<string, MatrixBlok>> {
  const hasil = new Map<string, MatrixBlok>();
  if (!pengajar.length) return hasil;

  const { data: kelasList } = await supabaseAdmin.from('program_kelas').select('id, name');
  const jenisKelas = new Map<string, JenisKelasMaahir>(
    (kelasList ?? []).map((k) => [k.id as string, jenisKelasMaahir(k.name as string)])
  );

  const { data: anggotaList } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('program_kelas_id, whatsapp_number, mulai_tanggal, selesai_tanggal')
    .eq('active', true);

  const jenisByWa = new Map<string, Set<JenisKelasMaahir>>();
  for (const a of anggotaList ?? []) {
    const wa = a.whatsapp_number as string | null;
    if (!wa) continue;
    if (!anggotaAktifPada(a, pada)) continue;
    const jenis = jenisKelas.get(a.program_kelas_id as string);
    if (!jenis) continue;
    const set = jenisByWa.get(wa) ?? new Set<JenisKelasMaahir>();
    set.add(jenis);
    jenisByWa.set(wa, set);
  }

  const kosong = new Set<JenisKelasMaahir>();
  for (const pg of pengajar) {
    const set = pg.whatsapp_number ? jenisByWa.get(pg.whatsapp_number) : undefined;
    hasil.set(pg.id, blokDariJenis(set ?? kosong));
  }
  return hasil;
}
