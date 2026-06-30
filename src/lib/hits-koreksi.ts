import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import type { HitsLevel } from '@/types/db';

export type KoreksiJenis = 'set_mulai' | 'tambah' | 'hapus' | 'ubah_tanggal';

export type KoreksiItemInput = {
  jenis: KoreksiJenis;
  level?: HitsLevel | null;
  pertemuan_no?: number | null;
  tanggal?: string | null; // YYYY-MM-DD
  catatan?: string | null;
};

/** Koordinator KK aktif yang cocok gender halaqah (fallback gender lain). */
export async function determineKoreksiApprover(
  gender: 'ikhwan' | 'akhwat'
): Promise<{ name: string; wa: string } | null> {
  const { data } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('name, gender, whatsapp_number')
    .eq('active', true);
  const pick =
    (data ?? []).find((k) => k.gender === gender && k.whatsapp_number) ??
    (data ?? []).find((k) => k.whatsapp_number);
  return pick ? { name: pick.name, wa: pick.whatsapp_number } : null;
}

/** Terapkan satu item koreksi yang DISETUJUI ke override/start_date. */
export async function applyKoreksiItem(
  halaqahId: string,
  item: { jenis: KoreksiJenis; level: string | null; pertemuan_no: number | null; tanggal: string | null },
  actor: { role: string; id: string }
): Promise<void> {
  if (item.jenis === 'set_mulai' && item.tanggal) {
    await supabaseAdmin.from('hits_halaqah').update({ start_date: item.tanggal }).eq('id', halaqahId);
    // Buang keterangan sesi yang kini terbuang (< start_date).
    await supabaseAdmin.from('hits_keterangan_harian').delete().eq('halaqah_id', halaqahId).lt('tanggal', item.tanggal);
    return;
  }
  if (item.jenis === 'hapus' && item.level && item.pertemuan_no != null) {
    await supabaseAdmin.from('hits_kaldik_pertemuan').upsert(
      { halaqah_id: halaqahId, level: item.level, pertemuan_no: item.pertemuan_no, tanggal: item.tanggal ?? '1970-01-01', is_skipped: true, set_by_role: actor.role, set_by_id: actor.id },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
    await supabaseAdmin.from('hits_keterangan_harian').delete().eq('halaqah_id', halaqahId).eq('level', item.level).eq('pertemuan_no', item.pertemuan_no);
    return;
  }
  if (item.jenis === 'ubah_tanggal' && item.level && item.pertemuan_no != null && item.tanggal) {
    await supabaseAdmin.from('hits_kaldik_pertemuan').upsert(
      { halaqah_id: halaqahId, level: item.level, pertemuan_no: item.pertemuan_no, tanggal: item.tanggal, is_skipped: false, set_by_role: actor.role, set_by_id: actor.id },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
    await supabaseAdmin.from('hits_keterangan_harian').update({ tanggal: item.tanggal }).eq('halaqah_id', halaqahId).eq('level', item.level).eq('pertemuan_no', item.pertemuan_no);
    return;
  }
  if (item.jenis === 'tambah' && item.level && item.tanggal) {
    // Append max+1 PER TAHAP. Max diambil dari pertemuan terderivasi (kaldik) +
    // override yang ada agar nomor di atas semua yang sekarang & tak bentrok.
    const loaded = await loadHalaqahPertemuan(halaqahId);
    const derivedMax = Math.max(
      0,
      ...(loaded?.derived ?? []).filter((d) => d.level === item.level).map((d) => d.pertemuan_no)
    );
    const { data: ov } = await supabaseAdmin
      .from('hits_kaldik_pertemuan')
      .select('pertemuan_no')
      .eq('halaqah_id', halaqahId)
      .eq('level', item.level);
    const ovMax = Math.max(0, ...(ov ?? []).map((r) => r.pertemuan_no));
    const used = new Set((ov ?? []).map((r) => r.pertemuan_no));
    let no = Math.max(derivedMax, ovMax) + 1;
    while (used.has(no)) no++; // jaga unik bila ada beberapa tambah beruntun
    await supabaseAdmin.from('hits_kaldik_pertemuan').insert({
      halaqah_id: halaqahId, level: item.level, pertemuan_no: no, tanggal: item.tanggal, is_skipped: false,
      set_by_role: actor.role, set_by_id: actor.id, note: 'tambahan via koreksi ketua',
    });
    return;
  }
}
