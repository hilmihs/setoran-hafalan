// Loader bersama untuk subsistem ketua kelas HITS: ambil halaqah + derivasi
// pertemuan (dengan override koordinator). Dipakai page /hits/ketua & action.

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  deriveHalaqahProgram,
  programKaldikLevels,
  type DerivedPertemuan,
  type KaldikHariLite,
  type PertemuanOverride,
} from '@/lib/hits-pertemuan';
import type { HitsLevel } from '@/types/db';

export type HalaqahLite = {
  id: string;
  batch_id: string;
  level: string | null;
  program: string;
  name: string;
  jadwal_raw: string | null;
  jadwal_hari: string[];
  pengajar_nama_sheet: string | null;
  start_date: string | null;
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
    .select('id, batch_id, level, program, name, jadwal_raw, jadwal_hari, pengajar_nama_sheet, start_date')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return null;

  const kaldikLevels = programKaldikLevels(halaqah.program);
  const [{ data: kaldikList }, { data: overrideList }] = await Promise.all([
    supabaseAdmin
      .from('hits_kaldik_hari')
      .select('level, tanggal, pekan, is_libur')
      .eq('batch_id', halaqah.batch_id)
      .in('level', kaldikLevels),
    supabaseAdmin
      .from('hits_kaldik_pertemuan')
      .select('level, pertemuan_no, tanggal, pekan, is_skipped')
      .eq('halaqah_id', halaqahId),
  ]);

  const kaldikByLevel = new Map<HitsLevel, KaldikHariLite[]>();
  for (const r of kaldikList ?? []) {
    const lv = r.level as HitsLevel;
    const arr = kaldikByLevel.get(lv) ?? [];
    arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
    kaldikByLevel.set(lv, arr);
  }
  const overridesByLevel = new Map<HitsLevel, PertemuanOverride[]>();
  for (const o of overrideList ?? []) {
    const lv = o.level as HitsLevel;
    const arr = overridesByLevel.get(lv) ?? [];
    arr.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan, is_skipped: o.is_skipped });
    overridesByLevel.set(lv, arr);
  }

  const derived: DerivedPertemuan[] = deriveHalaqahProgram(
    halaqah.program,
    halaqah.jadwal_hari ?? [],
    kaldikByLevel,
    overridesByLevel,
    halaqah.start_date
  );

  return { halaqah: halaqah as HalaqahLite, derived };
}
