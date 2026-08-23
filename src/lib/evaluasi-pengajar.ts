import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp } from '@/lib/whatsapp';

/**
 * id eval_pengajar (mirror hilmihs) untuk pengajar maahir yang sedang login.
 *
 * Mirror hilmihs memakai id `wa:<nomor ternormalisasi>`, BUKAN id internal
 * pengajar maahir. Jadi pengajar maahir dicocokkan ke halaqah eval-nya lewat
 * nomor WhatsApp: ambil whatsapp_number pengajar → normalisasi → `wa:<nomor>`.
 * null bila pengajar tak punya nomor WA (tak bisa dicocokkan).
 */
export async function evalPengajarIdFor(maahirPengajarId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('pengajar')
    .select('whatsapp_number')
    .eq('id', maahirPengajarId)
    .maybeSingle();
  const wa = data?.whatsapp_number as string | null | undefined;
  if (!wa || !wa.trim()) return null;
  return `wa:${normalizeWhatsApp(wa)}`;
}
