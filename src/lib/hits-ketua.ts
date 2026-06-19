// Loader bersama untuk subsistem ketua kelas HITS: ambil halaqah + derivasi
// pertemuan (dengan override koordinator). Dipakai page /hits/ketua & action.

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  deriveHalaqahPertemuanWithOverrides,
  type DerivedPertemuan,
  type PertemuanOverride,
} from '@/lib/hits-pertemuan';

export type HalaqahLite = {
  id: string;
  batch_id: string;
  level: string | null;
  name: string;
  jadwal_raw: string | null;
  jadwal_hari: string[];
  pengajar_nama_sheet: string | null;
};

export type HalaqahPertemuan = {
  halaqah: HalaqahLite;
  derived: DerivedPertemuan[];
};

/** Ambil halaqah + daftar pertemuan terderivasi (override-aware). */
export async function loadHalaqahPertemuan(
  halaqahId: string
): Promise<HalaqahPertemuan | null> {
  const { data: halaqah } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, batch_id, level, name, jadwal_raw, jadwal_hari, pengajar_nama_sheet')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return null;

  let derived: DerivedPertemuan[] = [];
  if (halaqah.level) {
    const [{ data: kaldikList }, { data: overrideList }] = await Promise.all([
      supabaseAdmin
        .from('hits_kaldik_hari')
        .select('tanggal, pekan, is_libur')
        .eq('batch_id', halaqah.batch_id)
        .eq('level', halaqah.level),
      supabaseAdmin
        .from('hits_kaldik_pertemuan')
        .select('pertemuan_no, tanggal, pekan, is_skipped')
        .eq('halaqah_id', halaqahId),
    ]);
    const overrides: PertemuanOverride[] = (overrideList ?? []).map((o) => ({
      pertemuan_no: o.pertemuan_no,
      tanggal: o.tanggal,
      pekan: o.pekan,
      is_skipped: o.is_skipped,
    }));
    derived = deriveHalaqahPertemuanWithOverrides(
      halaqah.jadwal_hari ?? [],
      (kaldikList ?? []).map((r) => ({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur })),
      overrides
    );
  }

  return { halaqah: halaqah as HalaqahLite, derived };
}
