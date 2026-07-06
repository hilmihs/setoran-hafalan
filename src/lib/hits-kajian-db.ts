import { supabaseAdmin } from './supabase-admin';
import { fetchAllRows } from './supabase-page';
import type { KajianRow } from './hits-kajian';
import type { HitsKajianLibur } from '@/types/db';

/** Semua baris presensi sejak anchor (untuk rekap & panel tindak). Paginasi (bisa >1000 baris). */
export async function loadKajianRows(anchor: string): Promise<KajianRow[]> {
  return fetchAllRows<KajianRow>((from, to) =>
    supabaseAdmin
      .from('hits_kajian_presensi')
      .select('ketua_wa, tanggal, status, checkin_at, reminder_sent_at')
      .gte('tanggal', anchor)
      .order('tanggal', { ascending: true })
      .order('ketua_wa', { ascending: true })
      .range(from, to)
  );
}

/** Baris presensi milik satu ketua (WA), untuk kartu check-in. */
export async function loadKajianRowsForKetua(ketuaWa: string): Promise<KajianRow[]> {
  const { data } = await supabaseAdmin
    .from('hits_kajian_presensi')
    .select('ketua_wa, tanggal, status, checkin_at, reminder_sent_at')
    .eq('ketua_wa', ketuaWa)
    .order('tanggal', { ascending: false });
  return (data ?? []) as KajianRow[];
}

/** Semua tanggal libur kajian. */
export async function loadKajianLibur(): Promise<HitsKajianLibur[]> {
  const { data } = await supabaseAdmin
    .from('hits_kajian_libur')
    .select('*')
    .order('tanggal', { ascending: false });
  return (data ?? []) as HitsKajianLibur[];
}

/** Daftar WA + nama ketua aktif (dedup per WA). Sumber kebenaran: ketua_kelas. */
export async function loadKetuaWaList(): Promise<{ ketua_wa: string; nama: string; halaqah: string[] }[]> {
  const { data } = await supabaseAdmin
    .from('ketua_kelas')
    .select('whatsapp_number, name, hits_halaqah:hits_halaqah_id(name)')
    .eq('active', true)
    .not('whatsapp_number', 'is', null);
  const map = new Map<string, { ketua_wa: string; nama: string; halaqah: string[] }>();
  for (const r of data ?? []) {
    const wa = (r as { whatsapp_number: string }).whatsapp_number;
    if (!wa) continue;
    const nama = (r as { name: string | null }).name ?? '(ketua)';
    const hq = (r as unknown as { hits_halaqah: { name: string } | null }).hits_halaqah?.name;
    const cur = map.get(wa) ?? { ketua_wa: wa, nama, halaqah: [] };
    if (hq && !cur.halaqah.includes(hq)) cur.halaqah.push(hq);
    map.set(wa, cur);
  }
  return [...map.values()].sort((a, b) => a.nama.localeCompare(b.nama));
}
