// Pendataan SP (Surat Peringatan) — disiplin kehadiran PESERTA program Maahir.
// Aturan (Tata Tertib Program Maahir, poin 6), KUMULATIF selama program:
//   Alpa (tidak_ada_keterangan):  1×→SP1, 2×→SP2, ≥3×→SP3(diberhentikan)
//   Izin:                          2×→SP1, 3×→SP2, ≥4×→SP3(diberhentikan)
//   SP peserta = level tertinggi dari dua metrik.
// Scope hitung = pertemuan program='kelas_maahir' (exclude tanggal libur).

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import { fetchAllRows } from '@/lib/supabase-page';
import { getPemutihanKeys, periodeMonthOf } from '@/lib/maahir-pemutihan';
import type { Gender } from '@/types/db';

// Anchor rentang libur (program Maahir mulai ~awal 2026).
const PROGRAM_START = '2026-01-01';

export type SPLevel = 0 | 1 | 2 | 3;

/** Level SP dari jumlah alpa & izin kumulatif (ambil yang tertinggi). */
export function spLevel(alpa: number, izin: number): SPLevel {
  const a: SPLevel = alpa >= 3 ? 3 : alpa >= 2 ? 2 : alpa >= 1 ? 1 : 0;
  const i: SPLevel = izin >= 4 ? 3 : izin >= 3 ? 2 : izin >= 2 ? 1 : 0;
  return (a >= i ? a : i);
}

export type SPPeserta = {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: Gender;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  sp: SPLevel;
};

export type SPRekap = {
  list: SPPeserta[]; // sp >= 1, urut sp desc
  summary: { total: number; sp1: number; sp2: number; sp3: number };
};

function emptySP(): SPRekap {
  return { list: [], summary: { total: 0, sp1: 0, sp2: 0, sp3: 0 } };
}

export async function getMaahirSP(opts?: { gender?: Gender }): Promise<SPRekap> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  let kq = supabaseAdmin.from('program_kelas').select('id, name, gender');
  if (opts?.gender) kq = kq.eq('gender', opts.gender);
  const { data: kelasRows } = await kq;
  const kelasList = (kelasRows ?? []) as Array<{ id: string; name: string; gender: Gender }>;
  if (!kelasList.length) return emptySP();
  const kelasById = new Map(kelasList.map((k) => [k.id, k]));
  const kelasIds = kelasList.map((k) => k.id);

  const { data: pertRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('program', 'kelas_maahir');
  const pertById = new Map(
    (pertRows ?? []).map((p) => [
      p.id as string,
      { kelasId: p.program_kelas_id as string, tanggal: p.tanggal as string },
    ])
  );
  const pertIds = (pertRows ?? []).map((p) => p.id as string);
  if (!pertIds.length) return emptySP();

  const liburByKelas = await getLiburDatesForKelas(kelasIds, PROGRAM_START, today);

  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name')
    .in('program_kelas_id', kelasIds)
    .eq('active', true);
  const anggotaList = (anggotaRows ?? []) as Array<{ id: string; program_kelas_id: string; name: string }>;

  const kehadiranRows = await fetchAllRows<{
    pertemuan_id: string;
    anggota_id: string | null;
    status: string;
  }>((from, to) =>
    supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, anggota_id, status')
      .in('pertemuan_id', pertIds)
      .not('diisi_at', 'is', null)
      .order('id')
      .range(from, to)
  );

  // Bulan yang diputihkan koordinator tak dihitung sebagai alpa/izin.
  const pemutihanKeys = await getPemutihanKeys();

  type Tally = { H: number; T: number; I: number; S: number; A: number };
  const byAnggota = new Map<string, Tally>();
  for (const k of kehadiranRows) {
    if (!k.anggota_id) continue;
    const p = pertById.get(k.pertemuan_id);
    if (!p) continue;
    if (liburByKelas.get(p.kelasId)?.has(p.tanggal)) continue; // anulir libur
    if (pemutihanKeys.has(`${k.anggota_id}|${periodeMonthOf(p.tanggal)}`)) continue; // diputihkan
    let t = byAnggota.get(k.anggota_id);
    if (!t) {
      t = { H: 0, T: 0, I: 0, S: 0, A: 0 };
      byAnggota.set(k.anggota_id, t);
    }
    switch (k.status) {
      case 'hadir': t.H++; break;
      case 'terlambat': t.T++; break;
      case 'izin': t.I++; break;
      case 'sakit': t.S++; break;
      default: t.A++; break; // tidak_ada_keterangan → alpa
    }
  }

  const list: SPPeserta[] = [];
  for (const a of anggotaList) {
    const kelas = kelasById.get(a.program_kelas_id);
    if (!kelas) continue;
    const t = byAnggota.get(a.id) ?? { H: 0, T: 0, I: 0, S: 0, A: 0 };
    const sp = spLevel(t.A, t.I);
    if (sp === 0) continue;
    list.push({
      anggotaId: a.id,
      name: a.name,
      kelasName: kelas.name,
      gender: kelas.gender,
      hadir: t.H,
      terlambat: t.T,
      izin: t.I,
      sakit: t.S,
      alpa: t.A,
      sp,
    });
  }
  list.sort(
    (x, y) => y.sp - x.sp || y.alpa - x.alpa || y.izin - x.izin || x.name.localeCompare(y.name)
  );

  return {
    list,
    summary: {
      total: list.length,
      sp1: list.filter((p) => p.sp === 1).length,
      sp2: list.filter((p) => p.sp === 2).length,
      sp3: list.filter((p) => p.sp === 3).length,
    },
  };
}
