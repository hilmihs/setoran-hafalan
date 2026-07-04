// Laporan Bulanan Maahir (keseluruhan) — agregat lintas-program untuk koordinator.
// Meniru template "Laporan Bulanan Maahir.xlsx": 3 blok (Takhassus, Maahir, At-Tibyan).
// Persen per peserta ikut konvensi maahir-rekap: (H+T)/pertemuan_terisi_dalam_scope.
// Cakupan "Kehadiran peserta" tabel Takhassus & Maahir = sesi kelas_maahir saja;
// At-Tibyan (sesi at_tibyan, lintas kelas) dilaporkan di bloknya sendiri. DPQ tidak ada.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayJakarta } from '@/lib/maahir-presensi';

export const TAKHASSUS_IKHWAN = 'Maahir Takhassus Ikhwan';
export const TAKHASSUS_AKHWAT = 'Maahir Takhassus Akhwat';
const TAKHASSUS_NAMES = new Set([TAKHASSUS_IKHWAN, TAKHASSUS_AKHWAT]);

type Code = 'H' | 'I' | 'S' | 'A' | 'T';
const STATUS_TO_CODE: Record<string, Code> = {
  hadir: 'H',
  izin: 'I',
  sakit: 'S',
  tidak_ada_keterangan: 'A',
  terlambat: 'T',
};

type Gender = 'ikhwan' | 'akhwat';
type Scope = 'kelas_maahir' | 'at_tibyan';

export type PctCounts = { H: number; I: number; S: number; A: number; T: number };

export type StudentAtt = {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: Gender;
  counts: PctCounts;
  persen: number | null; // (H+T)/pertemuan terisi * 100; null bila belum ada pertemuan
  keterangan: string; // catatan tergabung (bila ada)
};

export type LaporanMaahir = {
  month: string; // YYYY-MM
  takhassus: {
    setoran: {
      benchmark: number; // 80
      aktual: number | null; // kosong
      peserta: Array<{ name: string; gender: Gender; kelasName: string }>; // semua anggota 2 kelas
    };
    kehadiran: { avgIkhwan: number | null; avgAkhwat: number | null; aktual: number | null; benchmark: number };
    dibawahTarget: { jumlah: number; list: StudentAtt[] }; // < 80%
    kehadiranPengajar: number; // 100 default
    pengajarDibawahTarget: number; // 0 default
    catatan: string | null; // poin menarik — kosong
  };
  maahir: {
    kehadiran: { avgIkhwan: number | null; avgAkhwat: number | null; aktual: number | null; benchmark: number };
    dibawahTarget: { jumlah: number; list: StudentAtt[] }; // < 80%
    kehadiranPengajar: number; // 100 default
    pengajarDibawahTarget: number; // 0 default
  };
  atTibyan: {
    kehadiran: { avgIkhwan: number | null; avgAkhwat: number | null; aktual: number | null; benchmark: number };
    dibawahTarget: { ikhwan: number; akhwat: number; total: number; list: StudentAtt[] }; // < 100%
  };
};

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const today = todayJakarta();
  if (end > today) end = today; // cap di hari ini
  return { start, end };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** aktual = rata-rata dari avg gender yang ada (abaikan gender tanpa data). */
function avgOfGenders(a: number | null, b: number | null): number | null {
  const vals = [a, b].filter((v): v is number => v !== null);
  return mean(vals);
}

/** Rata-rata persen peserta suatu gender (abaikan yang belum ada data / persen null). */
function avgGender(students: StudentAtt[], gender: Gender): number | null {
  return mean(
    students.filter((s) => s.gender === gender && s.persen !== null).map((s) => s.persen as number)
  );
}

export async function getLaporanMaahir(month: string): Promise<LaporanMaahir> {
  const { start, end } = monthRange(month);

  const empty = (benchmark: number) => ({ avgIkhwan: null, avgAkhwat: null, aktual: null, benchmark });
  const emptyResult: LaporanMaahir = {
    month,
    takhassus: {
      setoran: { benchmark: 80, aktual: null, peserta: [] },
      kehadiran: empty(80),
      dibawahTarget: { jumlah: 0, list: [] },
      kehadiranPengajar: 100,
      pengajarDibawahTarget: 0,
      catatan: null,
    },
    maahir: {
      kehadiran: empty(80),
      dibawahTarget: { jumlah: 0, list: [] },
      kehadiranPengajar: 100,
      pengajarDibawahTarget: 0,
    },
    atTibyan: {
      kehadiran: empty(100),
      dibawahTarget: { ikhwan: 0, akhwat: 0, total: 0, list: [] },
    },
  };

  // Bulan di masa depan → tak ada data.
  if (start > todayJakarta()) return emptyResult;

  // 1. Kelas
  const { data: kelasRows } = await supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender')
    .order('gender')
    .order('name');
  const kelasList = (kelasRows ?? []) as Array<{ id: string; name: string; gender: Gender }>;
  if (kelasList.length === 0) return emptyResult;

  const kelasById = new Map(kelasList.map((k) => [k.id, k]));
  const kelasIds = kelasList.map((k) => k.id);

  // 2. Pertemuan dalam rentang bulan
  const { data: pertemuanRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', start)
    .lte('tanggal', end);
  const pertemuanById = new Map(
    (pertemuanRows ?? []).map((p) => [p.id, { kelasId: p.program_kelas_id as string, program: p.program as string }])
  );
  const pertemuanIds = (pertemuanRows ?? []).map((p) => p.id);

  // 3. Anggota
  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name')
    .in('program_kelas_id', kelasIds)
    .order('name');
  const anggotaList = (anggotaRows ?? []) as Array<{ id: string; program_kelas_id: string; name: string }>;

  // 4. Kehadiran terisi
  type Stat = { H: number; I: number; S: number; A: number; T: number; catatan: Set<string> };
  const statByAnggotaScope = new Map<string, Stat>(); // key: anggotaId|program
  const filledByKelasScope = new Map<string, Set<string>>(); // key: kelasId|program → set pertemuanId

  if (pertemuanIds.length > 0) {
    const { data: kehadiranRows } = await supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, anggota_id, status, catatan, diisi_at')
      .in('pertemuan_id', pertemuanIds)
      .not('diisi_at', 'is', null);

    for (const k of kehadiranRows ?? []) {
      if (!k.anggota_id) continue;
      const p = pertemuanById.get(k.pertemuan_id);
      if (!p) continue;
      const program = p.program; // 'kelas_maahir' | 'at_tibyan' | 'muallim_najih'

      // pertemuan terisi per kelas+scope (denominator persen)
      const fKey = `${p.kelasId}|${program}`;
      let fset = filledByKelasScope.get(fKey);
      if (!fset) { fset = new Set(); filledByKelasScope.set(fKey, fset); }
      fset.add(k.pertemuan_id);

      // tally per anggota+scope
      const sKey = `${k.anggota_id}|${program}`;
      let st = statByAnggotaScope.get(sKey);
      if (!st) { st = { H: 0, I: 0, S: 0, A: 0, T: 0, catatan: new Set() }; statByAnggotaScope.set(sKey, st); }
      const code = STATUS_TO_CODE[k.status] ?? 'A';
      st[code]++;
      if (k.catatan && typeof k.catatan === 'string' && k.catatan.trim()) st.catatan.add(k.catatan.trim());
    }
  }

  // Susun StudentAtt untuk kumpulan anggota tertentu pada scope tertentu.
  function studentsFor(
    filter: (kelasName: string) => boolean,
    scope: Scope
  ): StudentAtt[] {
    const out: StudentAtt[] = [];
    for (const a of anggotaList) {
      const kelas = kelasById.get(a.program_kelas_id);
      if (!kelas || !filter(kelas.name)) continue;
      const st = statByAnggotaScope.get(`${a.id}|${scope}`);
      const counts: PctCounts = st
        ? { H: st.H, I: st.I, S: st.S, A: st.A, T: st.T }
        : { H: 0, I: 0, S: 0, A: 0, T: 0 };
      const filled = filledByKelasScope.get(`${kelas.id}|${scope}`)?.size ?? 0;
      const persen = filled > 0 ? Math.round(((counts.H + counts.T) / filled) * 100) : null;
      out.push({
        anggotaId: a.id,
        name: a.name,
        kelasName: kelas.name,
        gender: kelas.gender,
        counts,
        persen,
        keterangan: st ? Array.from(st.catatan).join('; ') : '',
      });
    }
    return out;
  }

  const isTakhassus = (name: string) => TAKHASSUS_NAMES.has(name);
  const isMaahir = (name: string) => !TAKHASSUS_NAMES.has(name);

  // ---- Takhassus (scope kelas_maahir) ----
  const takhStudents = studentsFor(isTakhassus, 'kelas_maahir');
  const takhAvgI = avgGender(takhStudents, 'ikhwan');
  const takhAvgA = avgGender(takhStudents, 'akhwat');
  const takhBawah = takhStudents
    .filter((s) => s.persen !== null && s.persen < 80)
    .sort((a, b) => (a.persen ?? 0) - (b.persen ?? 0));
  // Setoran: list semua anggota 2 kelas takhassus (ikhwan dulu, lalu akhwat, lalu nama).
  const takhPeserta = anggotaList
    .map((a) => ({ a, kelas: kelasById.get(a.program_kelas_id) }))
    .filter((x) => x.kelas && isTakhassus(x.kelas.name))
    .sort((x, y) => {
      if (x.kelas!.gender !== y.kelas!.gender) return x.kelas!.gender === 'ikhwan' ? -1 : 1;
      return x.a.name.localeCompare(y.a.name);
    })
    .map((x) => ({ name: x.a.name, gender: x.kelas!.gender, kelasName: x.kelas!.name }));

  // ---- Maahir (non-takhassus, scope kelas_maahir) ----
  const maahirStudents = studentsFor(isMaahir, 'kelas_maahir');
  const maahirAvgI = avgGender(maahirStudents, 'ikhwan');
  const maahirAvgA = avgGender(maahirStudents, 'akhwat');
  const maahirBawah = maahirStudents
    .filter((s) => s.persen !== null && s.persen < 80)
    .sort((a, b) => (a.persen ?? 0) - (b.persen ?? 0));

  // ---- At-Tibyan (semua kelas, scope at_tibyan) ----
  const tibyanStudents = studentsFor(() => true, 'at_tibyan');
  const tibyanAvgI = avgGender(tibyanStudents, 'ikhwan');
  const tibyanAvgA = avgGender(tibyanStudents, 'akhwat');
  const tibyanBawah = tibyanStudents
    .filter((s) => s.persen !== null && s.persen < 100)
    .sort((a, b) => (a.persen ?? 0) - (b.persen ?? 0));
  const tibyanBawahI = tibyanBawah.filter((s) => s.gender === 'ikhwan').length;
  const tibyanBawahA = tibyanBawah.filter((s) => s.gender === 'akhwat').length;

  return {
    month,
    takhassus: {
      setoran: { benchmark: 80, aktual: null, peserta: takhPeserta },
      kehadiran: { avgIkhwan: takhAvgI, avgAkhwat: takhAvgA, aktual: avgOfGenders(takhAvgI, takhAvgA), benchmark: 80 },
      dibawahTarget: { jumlah: takhBawah.length, list: takhBawah },
      kehadiranPengajar: 100,
      pengajarDibawahTarget: 0,
      catatan: null,
    },
    maahir: {
      kehadiran: { avgIkhwan: maahirAvgI, avgAkhwat: maahirAvgA, aktual: avgOfGenders(maahirAvgI, maahirAvgA), benchmark: 80 },
      dibawahTarget: { jumlah: maahirBawah.length, list: maahirBawah },
      kehadiranPengajar: 100,
      pengajarDibawahTarget: 0,
    },
    atTibyan: {
      kehadiran: { avgIkhwan: tibyanAvgI, avgAkhwat: tibyanAvgA, aktual: avgOfGenders(tibyanAvgI, tibyanAvgA), benchmark: 100 },
      dibawahTarget: { ikhwan: tibyanBawahI, akhwat: tibyanBawahA, total: tibyanBawah.length, list: tibyanBawah },
    },
  };
}
