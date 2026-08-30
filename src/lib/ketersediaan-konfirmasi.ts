import 'server-only';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { KsPeriode } from '@/types/db';
import { catatKs } from '@/lib/ketersediaan-log';

/**
 * Konfirmasi pengajar atas halaqah yang sudah dinyatakan penuh.
 *
 * Alurnya: koordinator menyetujui usulan → sistem menerbitkan token → koordinator
 * mengirim tautan lewat wa.me → pengajar membuka, menyetujui atau menolak →
 * daftar peserta baru terbuka setelah setuju.
 *
 * Pola tokennya sama dengan /tabayyun/[token] dan /hits/pindah-halaqah/[token]
 * yang sudah berjalan. Konsekuensinya juga sama: pemegang token bertindak atas
 * nama pengajar, jadi kolomnya wajib berada di FORBIDDEN_COLUMNS api-public.
 */

/** 32 byte acak base64url (~43 karakter). */
export function terbitkanToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tanggal mulai bawaan: hari ini + jeda periode, dalam zona Jakarta. */
export function tanggalMulaiBawaan(periode: KsPeriode, sekarang: Date): string {
  const t = new Date(sekarang.getTime() + periode.jeda_mulai_hari * 86400000);
  return t.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

export function tenggatDari(periode: KsPeriode, sekarang: Date): string {
  return new Date(sekarang.getTime() + periode.tenggat_konfirmasi_jam * 3600000).toISOString();
}

/**
 * Geser usulan yang lewat tenggat ke prioritas berikutnya.
 *
 * Yang terjadi: usulan lama ditandai kedaluwarsa, lalu usulan baru dibuat untuk
 * slot dan kelompok peserta yang sama dengan pengajar berikutnya menurut
 * prioritas. Pesertanya ikut pindah utuh — mereka tidak boleh kembali ke antrean
 * dan kehilangan giliran hanya karena pengajarnya diam.
 *
 * Dijalankan berkala (mis. dari penjadwal yang sama dengan sync pendaftar) dan
 * juga saat koordinator membuka papan status, supaya tidak bergantung pada satu
 * mekanisme saja.
 */
export async function geserYangKedaluwarsa(
  periode: KsPeriode,
  sekarang: Date
): Promise<{ digeser: number; tanpaPengganti: number }> {
  const { data: lewat } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, slot_id, pengajar_id, level, pita_umur, putaran, urutan_prioritas')
    .eq('periode_id', periode.id)
    .eq('status', 'menunggu')
    .lte('token_kedaluwarsa', sekarang.toISOString());

  const baris = (lewat ?? []) as {
    id: string;
    slot_id: string;
    pengajar_id: string | null;
    level: string;
    pita_umur: string | null;
    putaran: number;
    urutan_prioritas: number | null;
  }[];

  let digeser = 0;
  let tanpaPengganti = 0;

  for (const u of baris) {
    await supabaseAdmin
      .from('ks_usulan')
      .update({
        status: 'kedaluwarsa',
        akses_token: null,
        alasan_tolak: 'Lewat tenggat konfirmasi',
        updated_at: sekarang.toISOString(),
      })
      .eq('id', u.id);

    const pengganti = await cariPengganti(periode.id, u.slot_id, u.pengajar_id);
    if (!pengganti) {
      tanpaPengganti++;
      await catatKs({
        periode_id: periode.id,
        entitas: 'ks_usulan',
        entitas_id: u.id,
        aksi: 'kedaluwarsa_tanpa_pengganti',
        alasan: 'Tidak ada pengajar lain yang tersedia di slot ini',
      });
      continue;
    }

    const { data: baru } = await supabaseAdmin
      .from('ks_usulan')
      .insert({
        periode_id: periode.id,
        slot_id: u.slot_id,
        pengajar_id: pengganti,
        level: u.level,
        pita_umur: u.pita_umur,
        putaran: u.putaran,
        urutan_prioritas: (u.urutan_prioritas ?? 0) + 1,
        status: 'usulan',
      })
      .select('id')
      .single();

    if (baru) {
      // Peserta ikut pindah utuh: mereka sudah menunggu, tidak boleh dikembalikan
      // ke belakang antrean karena pengajarnya yang diam.
      await supabaseAdmin
        .from('ks_usulan_peserta')
        .update({ usulan_id: baru.id, updated_at: sekarang.toISOString() })
        .eq('usulan_id', u.id);
      digeser++;
      await catatKs({
        periode_id: periode.id,
        entitas: 'ks_usulan',
        entitas_id: u.id,
        aksi: 'geser_prioritas',
        sebelum: { pengajar_id: u.pengajar_id },
        sesudah: { usulan_id: baru.id, pengajar_id: pengganti },
        alasan: 'Lewat tenggat konfirmasi',
      });
    }
  }

  return { digeser, tanpaPengganti };
}

/**
 * Pengajar berikutnya di slot yang sama: terverifikasi, belum memegang halaqah
 * di slot itu, dan bukan orang yang baru saja melewatkan tenggat.
 */
async function cariPengganti(
  periodeId: string,
  slotId: string,
  kecuali: string | null
): Promise<string | null> {
  const { data: ket } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('slot_id, pengisian:pengisian_id(pengajar_id, periode_id, status, submitted_at)')
    .eq('slot_id', slotId)
    .in('status', ['terverifikasi', 'diajukan']);

  const { data: hidup } = await supabaseAdmin
    .from('ks_usulan')
    .select('pengajar_id')
    .eq('periode_id', periodeId)
    .eq('slot_id', slotId)
    .in('status', ['usulan', 'disetujui', 'menunggu', 'dikonfirmasi', 'dikirim']);
  const dipakai = new Set(
    ((hidup ?? []) as { pengajar_id: string | null }[]).map((h) => h.pengajar_id).filter(Boolean)
  );

  const kandidat = ((ket ?? []) as {
    pengisian?: { pengajar_id: string; periode_id: string; status: string; submitted_at: string | null } | null;
  }[])
    .map((k) => k.pengisian)
    .filter(
      (p): p is NonNullable<typeof p> =>
        Boolean(p) && p!.periode_id === periodeId && p!.status !== 'nonaktif'
    )
    .filter((p) => p.pengajar_id !== kecuali && !dipakai.has(p.pengajar_id))
    // Pemutus seri dokumen konsep: pengisi form lebih awal didahulukan.
    .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''));

  return kandidat[0]?.pengajar_id ?? null;
}
