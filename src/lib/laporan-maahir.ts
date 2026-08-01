// Laporan Bulanan Maahir (keseluruhan) — agregat lintas-program untuk koordinator.
// Meniru template "Laporan Bulanan Maahir.xlsx": 3 blok (Takhassus, Maahir, At-Tibyan).
// Persen per peserta ikut konvensi maahir-rekap: (H+T)/pertemuan_terisi_dalam_scope.
// Cakupan "Kehadiran peserta" tabel Takhassus & Maahir = sesi kelas_maahir saja;
// At-Tibyan (sesi at_tibyan, lintas kelas) dilaporkan di bloknya sendiri. DPQ tidak ada.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-page';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import { todayJakarta } from '@/lib/maahir-presensi';
import { getMaahirSP, type SPRekap } from '@/lib/maahir-sp';
import { getPemutihanMap } from '@/lib/maahir-pemutihan';
import { getLaporanNotes, type LaporanNote } from '@/lib/laporan-note';
import { isTakhassusKelas } from '@/lib/program-kelas';

export { TAKHASSUS_IKHWAN, TAKHASSUS_AKHWAT } from '@/lib/program-kelas';

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
  filled: number; // jumlah pertemuan terisi (denominator) di scope, sejak bergabung
  tidakHadir: number; // filled - (H+T): sesi tak hadir termasuk yg tak tercatat
  persen: number | null; // (H+T)/pertemuan terisi * 100; null bila belum ada pertemuan
  keterangan: string; // catatan tergabung (bila ada)
  mulaiTanggal: string | null; // tgl gabung kelas bila di tengah periode (denominator dipotong)
  online: number; // sesi yang dihadiri secara online
  diputihkan: string | null; // alasan pemutihan (persen dianggap 100%) bila ada
};

/** Rincian setoran hafalan peserta Takhassus dalam periode laporan. */
export type SetoranPeserta = {
  anggotaId: string;
  name: string;
  gender: Gender;
  kelasName: string;
  halaman: number | null; // total halaman sebulan; null bila belum pernah isi
  pertemuanSetor: number; // jumlah pertemuan yang diisi setorannya
  rincian: string; // 'DD/MM: N hal · …' per pertemuan
};

export type LaporanMaahir = {
  month: string; // YYYY-MM
  takhassus: {
    setoran: {
      benchmark: number; // 80 halaman/bulan
      aktual: number | null; // rata-rata halaman per peserta yang sudah setor
      peserta: SetoranPeserta[]; // semua anggota 2 kelas takhassus
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
  /** Pendataan SP disiplin kehadiran (kumulatif sejak program berjalan). */
  sp: SPRekap;
  /** Catatan bebas koordinator untuk bulan ini. */
  notes: LaporanNote[];
};

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  // Periode Maahir bukan kalender penuh: tgl 28 bulan LALU s/d tgl 27 bulan ini.
  // mis. month=2026-06 → 2026-05-28 .. 2026-06-27.
  const startD = new Date(Date.UTC(y, m - 2, 28)); // m 1-based → bulan sebelumnya = m-2
  const start = `${startD.getUTCFullYear()}-${String(startD.getUTCMonth() + 1).padStart(2, '0')}-28`;
  let end = `${y}-${String(m).padStart(2, '0')}-27`;
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
    sp: { list: [], summary: { total: 0, sp1: 0, sp2: 0, sp3: 0 } },
    notes: [],
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
    (pertemuanRows ?? []).map((p) => [
      p.id,
      { kelasId: p.program_kelas_id as string, program: p.program as string, tanggal: p.tanggal as string },
    ])
  );
  const pertemuanIds = (pertemuanRows ?? []).map((p) => p.id);

  // Tanggal libur per kelas (dianulir dari perhitungan % — pertemuan yang
  // sudah terisi pun tak dihitung bila tanggalnya diliburkan).
  const liburByKelas = await getLiburDatesForKelas(kelasIds, start, end);

  // 3. Anggota
  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name, created_at')
    .in('program_kelas_id', kelasIds)
    .eq('active', true)
    .order('name');
  const anggotaList = (anggotaRows ?? []) as Array<{
    id: string;
    program_kelas_id: string;
    name: string;
    created_at: string | null;
  }>;

  // Tanggal gabung (WIB) — peserta yang masuk di tengah periode tak boleh
  // dihukum oleh pertemuan sebelum ia terdaftar. Hanya berlaku bila tanggal
  // gabung ada DI DALAM periode; sebelum periode → denominator penuh.
  const joinDateOf = (a: { created_at: string | null }): string | null => {
    if (!a.created_at) return null;
    const d = new Date(a.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    return d > start && d <= end ? d : null;
  };
  const joinByAnggota = new Map<string, string | null>(
    anggotaList.map((a) => [a.id, joinDateOf(a)])
  );

  // Pemutihan bulan ini: peserta dianggap hadir penuh (baris presensi tak diubah).
  const pemutihan = await getPemutihanMap(month);

  // 4. Kehadiran terisi
  type Stat = { H: number; I: number; S: number; A: number; T: number; online: number; catatan: Set<string> };
  const statByAnggotaScope = new Map<string, Stat>(); // key: anggotaId|program
  const filledByKelasScope = new Map<string, Set<string>>(); // key: kelasId|program → set pertemuanId
  // Setoran hafalan per anggota (khusus scope kelas_maahir): tanggal → halaman.
  const setoranByAnggota = new Map<string, Array<{ tanggal: string; halaman: number }>>();

  if (pertemuanIds.length > 0) {
    // Paginasi: kehadiran sebulan lintas-kelas bisa >1000 baris (limit PostgREST).
    const kehadiranRows = await fetchAllRows<{
      pertemuan_id: string;
      anggota_id: string | null;
      status: string;
      catatan: string | null;
      diisi_at: string | null;
      setoran_halaman: number | null;
      mode: string | null;
    }>((from, to) =>
      supabaseAdmin
        .from('kehadiran_peserta')
        .select('pertemuan_id, anggota_id, status, catatan, diisi_at, setoran_halaman, mode')
        .in('pertemuan_id', pertemuanIds)
        .not('diisi_at', 'is', null)
        .order('id')
        .range(from, to)
    );

    for (const k of kehadiranRows) {
      if (!k.anggota_id) continue;
      const p = pertemuanById.get(k.pertemuan_id);
      if (!p) continue;
      // Anulir: lewati pertemuan yang tanggalnya diliburkan (kelas ini).
      if (liburByKelas.get(p.kelasId)?.has(p.tanggal)) continue;
      const program = p.program; // 'kelas_maahir' | 'at_tibyan' | 'muallim_najih'

      // pertemuan terisi per kelas+scope (denominator persen)
      const fKey = `${p.kelasId}|${program}`;
      let fset = filledByKelasScope.get(fKey);
      if (!fset) { fset = new Set(); filledByKelasScope.set(fKey, fset); }
      fset.add(k.pertemuan_id);

      // Sesi sebelum peserta bergabung tak dihitung (denominator juga dipotong
      // di studentsFor) — mencegah persen >100% atau tergerus sesi pra-gabung.
      const joined = joinByAnggota.get(k.anggota_id);
      if (joined && p.tanggal < joined) continue;

      // tally per anggota+scope
      const sKey = `${k.anggota_id}|${program}`;
      let st = statByAnggotaScope.get(sKey);
      if (!st) { st = { H: 0, I: 0, S: 0, A: 0, T: 0, online: 0, catatan: new Set() }; statByAnggotaScope.set(sKey, st); }
      const code = STATUS_TO_CODE[k.status] ?? 'A';
      st[code]++;
      if (k.mode === 'online' && (code === 'H' || code === 'T')) st.online++;
      if (k.catatan && typeof k.catatan === 'string' && k.catatan.trim()) st.catatan.add(k.catatan.trim());

      // setoran halaman (diisi peserta saat presensi mandiri)
      if (program === 'kelas_maahir' && typeof k.setoran_halaman === 'number') {
        const arr = setoranByAnggota.get(k.anggota_id) ?? [];
        arr.push({ tanggal: p.tanggal, halaman: k.setoran_halaman });
        setoranByAnggota.set(k.anggota_id, arr);
      }
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
      // Denominator: pertemuan terisi kelas ini — dipotong sejak tanggal gabung
      // bila peserta baru masuk di tengah periode (pertemuan sebelum ia
      // terdaftar tak boleh menggerus persentasenya).
      const mulaiTanggal = joinDateOf(a);
      const fset = filledByKelasScope.get(`${kelas.id}|${scope}`);
      const filled = !fset
        ? 0
        : mulaiTanggal
          ? [...fset].filter((pid) => (pertemuanById.get(pid)?.tanggal ?? '') >= mulaiTanggal).length
          : fset.size;
      const persenAsli = filled > 0 ? Math.round(((counts.H + counts.T) / filled) * 100) : null;
      // Tidak hadir = pertemuan terisi − (hadir+terlambat). Termasuk sesi yang
      // peserta tak punya catatan sama sekali (bukan hanya izin/sakit/alpa),
      // supaya tak muncul "0x" padahal di bawah target.
      const tidakHadirAsli = Math.max(0, filled - (counts.H + counts.T));
      // Diputihkan → dianggap hadir penuh untuk periode ini.
      const diputihkan = pemutihan.has(a.id) ? (pemutihan.get(a.id) ?? '') : null;
      const persen = diputihkan !== null && filled > 0 ? 100 : persenAsli;
      const tidakHadir = diputihkan !== null ? 0 : tidakHadirAsli;
      out.push({
        anggotaId: a.id,
        name: a.name,
        kelasName: kelas.name,
        gender: kelas.gender,
        counts,
        filled,
        tidakHadir,
        persen,
        keterangan: st ? Array.from(st.catatan).join('; ') : '',
        mulaiTanggal,
        online: st?.online ?? 0,
        diputihkan,
      });
    }
    return out;
  }

  const isTakhassus = (name: string) => isTakhassusKelas(name);
  const isMaahir = (name: string) => !isTakhassusKelas(name);

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
    .map((x): SetoranPeserta => {
      const rows = (setoranByAnggota.get(x.a.id) ?? []).sort((p, q) =>
        p.tanggal < q.tanggal ? -1 : p.tanggal > q.tanggal ? 1 : 0
      );
      const halaman = rows.reduce((s, rw) => s + rw.halaman, 0);
      return {
        anggotaId: x.a.id,
        name: x.a.name,
        gender: x.kelas!.gender,
        kelasName: x.kelas!.name,
        halaman: rows.length ? halaman : null,
        pertemuanSetor: rows.length,
        rincian: rows
          .map((rw) => `${rw.tanggal.slice(8, 10)}/${rw.tanggal.slice(5, 7)}: ${rw.halaman} hal`)
          .join(' · '),
      };
    });
  const takhSetoranAktual = mean(
    takhPeserta.filter((p) => p.halaman !== null).map((p) => p.halaman as number)
  );

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

  // Pendataan SP (kumulatif, sumber sama dengan halaman SP koordinator) +
  // catatan bebas koordinator untuk bulan ini.
  const [sp, notes] = await Promise.all([getMaahirSP(), getLaporanNotes(month)]);

  return {
    month,
    takhassus: {
      setoran: { benchmark: 80, aktual: takhSetoranAktual, peserta: takhPeserta },
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
    sp,
    notes,
  };
}
