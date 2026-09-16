import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { identitasPendaftar } from '@/lib/ketersediaan-pendaftar';

/**
 * Satu formulir pendaftaran melayani lebih dari satu periode: pendaftar yang sama
 * boleh mulai September atau Oktober. Tiap periode menyimpan salinan barisnya
 * sendiri, jadi yang mencegah satu orang mendapat dua halaqah adalah identitasnya
 * (nomor + nama), bukan id baris.
 *
 * Dihitung saat dibaca, tidak ditulis ke periode lain: membatalkan usulan di satu
 * periode otomatis mengembalikan orangnya ke antrean periode lain.
 *
 * @returns identitas → nama periode tempat ia sudah dialokasikan
 */
export async function identitasTerpakaiLintasPeriode(periodeId: string): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('wa_normal, nama, periode:periode_id(nama)')
    .neq('periode_id', periodeId)
    .eq('status', 'dialokasikan');

  const out = new Map<string, string>();
  for (const r of (data ?? []) as {
    wa_normal: string | null;
    nama: string;
    periode?: { nama: string } | null;
  }[]) {
    const id = identitasPendaftar(r.wa_normal, r.nama);
    if (id && !out.has(id)) out.set(id, r.periode?.nama ?? 'periode lain');
  }
  return out;
}
