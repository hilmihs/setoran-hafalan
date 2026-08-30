import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { KsPendaftarSumber, KsPeriode } from '@/types/db';
import { getPeriodeAktif, listSlot } from '@/lib/ketersediaan-periode';
import { tarikSumber } from '@/lib/ketersediaan-pendaftar';
import { geserYangKedaluwarsa } from '@/lib/ketersediaan-konfirmasi';
import { catatKs } from '@/lib/ketersediaan-log';

/**
 * Pekerjaan berkala yang membuat model bergulir benar-benar bergulir.
 *
 * Tanpa ini seluruh rancangan bergantung pada koordinator yang rajin menekan
 * tombol: pendaftar baru tidak masuk, tenggat konfirmasi tidak pernah lewat, dan
 * ketersediaan basi terus dihitung sebagai pasokan yang sebenarnya sudah tidak ada.
 *
 * Sengaja TIDAK menjalankan alokasi. Pembentukan halaqah tetap menunggu
 * koordinator — itu keputusan rancangan, bukan kelalaian: halaqah yang lahir dari
 * data yang belum sempat dibersihkan tidak dapat ditarik kembali dari CMS tilawah.
 */

export interface HasilBerkala {
  periode: string | null;
  pendaftar: string[];
  digeser: number;
  tanpaPengganti: number;
  ditandaiBasi: number;
  dinonaktifkan: number;
  perluDiingatkan: number;
}

export async function jalankanBerkala(sekarang = new Date()): Promise<HasilBerkala> {
  const hasil: HasilBerkala = {
    periode: null,
    pendaftar: [],
    digeser: 0,
    tanpaPengganti: 0,
    ditandaiBasi: 0,
    dinonaktifkan: 0,
    perluDiingatkan: 0,
  };

  const periode = await getPeriodeAktif();
  if (!periode) return hasil;
  hasil.periode = periode.nama;

  // 1. Tarik pendaftar terbaru.
  const { data: sumberRows } = await supabaseAdmin
    .from('ks_pendaftar_sumber')
    .select('*')
    .eq('periode_id', periode.id)
    .eq('aktif', true);
  const slots = await listSlot(periode.id);
  for (const s of (sumberRows ?? []) as KsPendaftarSumber[]) {
    try {
      const h = await tarikSumber(s, periode, slots, sekarang);
      hasil.pendaftar.push(`${s.nama}: ${h.baru} baru, ${h.diperbarui} diperbarui, ${h.ditahan} ditahan`);
    } catch (e) {
      const pesan = (e as Error).message;
      hasil.pendaftar.push(`${s.nama}: GAGAL — ${pesan}`);
      await supabaseAdmin
        .from('ks_pendaftar_sumber')
        .update({
          terakhir_tarik: sekarang.toISOString(),
          terakhir_status: 'gagal',
          terakhir_pesan: pesan,
        })
        .eq('id', s.id);
    }
  }

  // 2. Geser usulan yang lewat tenggat konfirmasi.
  const geser = await geserYangKedaluwarsa(periode, sekarang);
  hasil.digeser = geser.digeser;
  hasil.tanpaPengganti = geser.tanpaPengganti;

  // 3. Segarkan status ketersediaan.
  const segar = await segarkanKetersediaan(periode, sekarang);
  hasil.ditandaiBasi = segar.ditandaiBasi;
  hasil.dinonaktifkan = segar.dinonaktifkan;
  hasil.perluDiingatkan = segar.perluDiingatkan;

  await catatKs({
    periode_id: periode.id,
    entitas: 'ks_periode',
    entitas_id: periode.id,
    aksi: 'jalankan_berkala',
    sesudah: {
      pendaftar: hasil.pendaftar,
      digeser: hasil.digeser,
      basi: hasil.ditandaiBasi,
      nonaktif: hasil.dinonaktifkan,
    },
  });

  return hasil;
}

/**
 * Tiga tahap, bukan langsung mati:
 *   aktif  → basi     lewat `penyegaran_hari`. Masih ikut alokasi, hanya perlu
 *                     dikonfirmasi ulang; koordinator melihatnya di daftar.
 *   basi   → (diingatkan) `pengingat_penyegaran_hari` sebelum dinonaktifkan.
 *   basi   → nonaktif setelah tenggat pengingat lewat tanpa jawaban.
 *
 * Bertahap karena mematikan langsung membuat kolam pengajar mengempis diam-diam,
 * dan seorang pengajar bisa hilang dari pembagian tanpa pernah tahu kenapa.
 */
async function segarkanKetersediaan(
  periode: KsPeriode,
  sekarang: Date
): Promise<{ ditandaiBasi: number; dinonaktifkan: number; perluDiingatkan: number }> {
  const { data } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, status, disegarkan_pada, submitted_at, pengingat_penyegaran_pada')
    .eq('periode_id', periode.id)
    .in('status', ['aktif', 'basi']);

  const HARI = 86400000;
  let ditandaiBasi = 0;
  let dinonaktifkan = 0;
  let perluDiingatkan = 0;

  for (const p of (data ?? []) as {
    id: string;
    status: string;
    disegarkan_pada: string | null;
    submitted_at: string | null;
    pengingat_penyegaran_pada: string | null;
  }[]) {
    const acuan = p.disegarkan_pada ?? p.submitted_at;
    if (!acuan) continue;
    const umurHari = Math.floor((sekarang.getTime() - new Date(acuan).getTime()) / HARI);

    if (p.status === 'aktif' && umurHari >= periode.penyegaran_hari) {
      await supabaseAdmin
        .from('ks_pengisian')
        .update({ status: 'basi', updated_at: sekarang.toISOString() })
        .eq('id', p.id);
      ditandaiBasi++;
      perluDiingatkan++;
      continue;
    }

    if (p.status === 'basi') {
      // Nonaktif hanya setelah pengingat benar-benar dikirim koordinator —
      // ditandai lewat pengingat_penyegaran_pada. Bila belum pernah dikirim,
      // barisnya tetap basi dan terus muncul di daftar "perlu diingatkan".
      if (!p.pengingat_penyegaran_pada) {
        perluDiingatkan++;
        continue;
      }
      const sejakIngat = Math.floor(
        (sekarang.getTime() - new Date(p.pengingat_penyegaran_pada).getTime()) / HARI
      );
      if (sejakIngat >= periode.pengingat_penyegaran_hari) {
        await supabaseAdmin
          .from('ks_pengisian')
          .update({ status: 'nonaktif', updated_at: sekarang.toISOString() })
          .eq('id', p.id);
        dinonaktifkan++;
      }
    }
  }

  return { ditandaiBasi, dinonaktifkan, perluDiingatkan };
}
