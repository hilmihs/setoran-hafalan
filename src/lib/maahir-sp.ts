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
export const PROGRAM_START = '2026-01-01';

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
  /** Tanggal terakhir yang ikut dihitung (YYYY-MM-DD). */
  cutoff: string;
};

function emptySP(cutoff: string): SPRekap {
  return { list: [], summary: { total: 0, sp1: 0, sp2: 0, sp3: 0 }, cutoff };
}

/**
 * Batas akhir periode laporan sebuah bulan 'YYYY-MM' — window 28–27, jadi
 * periode '2026-07' berakhir 2026-07-27 (kebalikan dari `periodeMonthOf`).
 */
export function periodeEndDate(month: string): string {
  return `${month}-27`;
}

/**
 * Periode (YYYY-MM) yang benar-benar punya pertemuan Maahir, terbaru dulu —
 * dipakai untuk mengisi dropdown filter bulan supaya tak ada bulan kosong.
 */
export async function getMaahirPeriodeMonths(): Promise<string[]> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const { data } = await supabaseAdmin
    .from('pertemuan_program')
    .select('tanggal')
    .eq('program', 'kelas_maahir')
    .lte('tanggal', today);
  const set = new Set((data ?? []).map((r) => periodeMonthOf(r.tanggal as string)));
  return [...set].sort().reverse();
}

/**
 * SP kumulatif sejak program mulai. `sampaiBulan` ('YYYY-MM') memotong
 * perhitungan di akhir periode bulan tsb — dipakai untuk melihat "per akhir
 * bulan ini, siapa sudah kena SP berapa". Tanpa opsi itu = s/d hari ini.
 */
export async function getMaahirSP(opts?: { gender?: Gender; sampaiBulan?: string }): Promise<SPRekap> {
  const hariIni = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const batas = opts?.sampaiBulan ? periodeEndDate(opts.sampaiBulan) : hariIni;
  // Bulan berjalan belum selesai — jangan mengklaim data s/d tanggal 27 kalau
  // hari ini masih tanggal 10.
  const today = batas < hariIni ? batas : hariIni;

  let kq = supabaseAdmin.from('program_kelas').select('id, name, gender');
  if (opts?.gender) kq = kq.eq('gender', opts.gender);
  const { data: kelasRows } = await kq;
  const kelasList = (kelasRows ?? []) as Array<{ id: string; name: string; gender: Gender }>;
  if (!kelasList.length) return emptySP(today);
  const kelasById = new Map(kelasList.map((k) => [k.id, k]));
  const kelasIds = kelasList.map((k) => k.id);

  const { data: pertRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('program', 'kelas_maahir')
    .lte('tanggal', today);
  const pertById = new Map(
    (pertRows ?? []).map((p) => [
      p.id as string,
      { kelasId: p.program_kelas_id as string, tanggal: p.tanggal as string },
    ])
  );
  const pertIds = (pertRows ?? []).map((p) => p.id as string);
  if (!pertIds.length) return emptySP(today);

  const liburByKelas = await getLiburDatesForKelas(kelasIds, PROGRAM_START, today);

  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name, whatsapp_number, selesai_tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('active', true);
  const anggotaList = (anggotaRows ?? []) as Array<{
    id: string;
    program_kelas_id: string;
    name: string;
    whatsapp_number: string | null;
    selesai_tanggal: string | null;
  }>;

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

  // SP melekat pada ORANG, bukan baris keanggotaan. Peserta yang pindah kelas
  // punya beberapa baris (kelas lama + kelas baru) — tallinya digabung lewat
  // nomor WA supaya pelanggaran tak terpecah dan lolos ambang SP. Kelas yang
  // ditampilkan = keanggotaan yang masih berjalan.
  type Gabung = {
    anggotaId: string;
    name: string;
    kelasName: string;
    gender: 'ikhwan' | 'akhwat';
    tally: Tally;
    aktifSekarang: boolean;
  };
  const byOrang = new Map<string, Gabung>();
  for (const a of anggotaList) {
    const kelas = kelasById.get(a.program_kelas_id);
    if (!kelas) continue;
    const t = byAnggota.get(a.id) ?? { H: 0, T: 0, I: 0, S: 0, A: 0 };
    const key = a.whatsapp_number ?? `id:${a.id}`;
    const masihBerjalan = !a.selesai_tanggal || a.selesai_tanggal >= today;
    const g = byOrang.get(key);
    if (!g) {
      byOrang.set(key, {
        anggotaId: a.id,
        name: a.name,
        kelasName: kelas.name,
        gender: kelas.gender,
        tally: { ...t },
        aktifSekarang: masihBerjalan,
      });
      continue;
    }
    g.tally.H += t.H; g.tally.T += t.T; g.tally.I += t.I; g.tally.S += t.S; g.tally.A += t.A;
    // Kelas yang ditampilkan diambil dari keanggotaan yang masih berjalan.
    if (masihBerjalan && !g.aktifSekarang) {
      g.anggotaId = a.id;
      g.kelasName = kelas.name;
      g.gender = kelas.gender;
      g.aktifSekarang = true;
    }
  }

  const list: SPPeserta[] = [];
  for (const g of byOrang.values()) {
    const sp = spLevel(g.tally.A, g.tally.I);
    if (sp === 0) continue;
    list.push({
      anggotaId: g.anggotaId,
      name: g.name,
      kelasName: g.kelasName,
      gender: g.gender,
      hadir: g.tally.H,
      terlambat: g.tally.T,
      izin: g.tally.I,
      sakit: g.tally.S,
      alpa: g.tally.A,
      sp,
    });
  }
  list.sort(
    (x, y) => y.sp - x.sp || y.alpa - x.alpa || y.izin - x.izin || x.name.localeCompare(y.name)
  );

  return {
    list,
    cutoff: today,
    summary: {
      total: list.length,
      sp1: list.filter((p) => p.sp === 1).length,
      sp2: list.filter((p) => p.sp === 2).length,
      sp3: list.filter((p) => p.sp === 3).length,
    },
  };
}
