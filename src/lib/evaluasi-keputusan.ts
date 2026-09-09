// Keputusan koordinator: peserta yang tidak lulus mengulang di track mana (0075).
//
// Kelulusan level ditentukan Rapot PB saja; Rapot QN prasyarat yang nilainya
// tidak menggugurkan. Karena itu KANDIDAT keputusan adalah peserta ber-nilai
// akhir PB di bawah ambang — bukan siapa pun yang QN-nya rendah. Penjaga itu
// hidup di `bolehDiputuskan` supaya halaman, server action, dan uji memakai
// definisi yang sama; menaruhnya di UI saja berarti tombol yang tak tampil masih
// bisa ditembak lewat request langsung.
//
// Modul ini sengaja TIDAK 'server-only': `bolehDiputuskan` dan label dipakai
// komponen klien juga. Pemuat DB ada di bawah dan hanya dipanggil server.
import { supabaseAdmin } from '@/lib/supabase-admin';
import { AMBANG_LULUS_AKHIR } from '@/lib/evaluasi';
import type { Track } from '@/lib/evaluasi';

/** Track tempat peserta mengulang. Tidak ada nilai "belum diputuskan" — itu
 *  diwakili ketiadaan baris, supaya "belum ditinjau" tak bisa tersimpan sebagai
 *  sebuah keputusan. */
export type Keputusan = Track;
export const KEPUTUSAN: readonly Keputusan[] = ['qn', 'pb'] as const;

export function isKeputusan(v: unknown): v is Keputusan {
  return v === 'qn' || v === 'pb';
}

/**
 * Bentuk minimal baris peserta yang cukup untuk memutuskan kelayakan. Sengaja
 * bukan `BarisPeserta` penuh: server action hanya punya nilai akhir PB hasil
 * hitung ulang, bukan seluruh baris tabel.
 */
export interface KelayakanKeputusan {
  /** Nilai akhir Rapot PB. null = komponen belum lengkap. */
  nilaiPb: number | null;
}

/**
 * Boleh diberi keputusan mengulang? Hanya peserta yang nilai akhir PB-nya sudah
 * sah DAN di bawah ambang. Nilai PB yang belum lengkap bukan "tidak lulus" —
 * memutuskan pengulangan atas dasar komponen yang belum utuh berarti memvonis
 * peserta yang penilaiannya memang belum selesai.
 */
export function bolehDiputuskan(k: KelayakanKeputusan): boolean {
  return k.nilaiPb != null && k.nilaiPb < AMBANG_LULUS_AKHIR;
}

/** Label keputusan untuk layar dan lembar rapot. `namaTrack` datang dari
 *  eval_config supaya penamaan akhwat/ikhwan tidak dipalsukan di sini. */
export function labelKeputusan(k: Keputusan, namaQn: string, namaPb: string): string {
  return k === 'qn' ? namaQn : namaPb;
}

// ── Pemuat ──

const NO_ID = ['00000000-0000-0000-0000-000000000000'];

/** Keputusan untuk sekumpulan peserta, dipetakan per peserta_id. */
export async function muatKeputusan(pesertaIds: string[]): Promise<Map<string, Keputusan>> {
  const { data } = await supabaseAdmin
    .from('eval_keputusan_mengulang')
    .select('peserta_id, keputusan')
    .in('peserta_id', pesertaIds.length ? pesertaIds : NO_ID);
  const out = new Map<string, Keputusan>();
  for (const r of (data ?? []) as Array<{ peserta_id: string; keputusan: string }>) {
    if (isKeputusan(r.keputusan)) out.set(r.peserta_id, r.keputusan);
  }
  return out;
}

/** Keputusan satu peserta; null bila belum diputuskan. Dipakai lembar rapot. */
export async function keputusanPeserta(pesertaId: string): Promise<Keputusan | null> {
  const { data } = await supabaseAdmin
    .from('eval_keputusan_mengulang')
    .select('keputusan')
    .eq('peserta_id', pesertaId)
    .maybeSingle();
  const k = (data as { keputusan?: unknown } | null)?.keputusan;
  return isKeputusan(k) ? k : null;
}

/**
 * Kalimat keputusan untuk lembar rapot — null bila tak ada yang perlu ditulis.
 *
 * Hanya dicetak di Rapot PB. Rapot PB-lah yang memuat vonis LULUS/MENGULANG,
 * jadi di situlah pembaca mencari "lalu bagaimana"; menempelkannya juga di
 * Rapot QN akan menghasilkan lembar bertulis "LULUS" yang di bawahnya berbunyi
 * "Mengulang di ...", dan itu membuat dokumen tampak bertentangan dengan
 * dirinya sendiri.
 *
 * Nama track diambil dari eval_config per gender, bukan ditulis tetap:
 * penamaan akhwat dan ikhwan berbeda dan koordinator boleh mengubahnya.
 */
export async function keteranganKeputusanRapot(
  pesertaId: string,
  jenisRapot: string,
  gender: string
): Promise<string | null> {
  if (jenisRapot !== 'pb') return null;

  const k = await keputusanPeserta(pesertaId);
  if (!k) return null;

  const { data: cfg } = await supabaseAdmin
    .from('eval_config')
    .select('gender, nama_qn, nama_pb')
    .eq('gender', gender)
    .maybeSingle();
  const namaQn = (cfg?.nama_qn as string | undefined)?.trim() || 'Evaluasi QN';
  const namaPb = (cfg?.nama_pb as string | undefined)?.trim() || 'Evaluasi PB';

  return `Keputusan koordinator: mengulang di ${labelKeputusan(k, namaQn, namaPb)}`;
}
