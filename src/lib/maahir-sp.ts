// Pendataan SP (Surat Peringatan) — disiplin kehadiran PESERTA program Maahir.
// Aturan (Tata Tertib Program Maahir, poin 6), KUMULATIF selama program:
//   Alpa (tidak_ada_keterangan):  1×→SP1, 2×→SP2, ≥3×→SP3(diberhentikan)
//   Izin:                          2×→SP1, 3×→SP2, ≥4×→SP3(diberhentikan)
//   SP peserta = level tertinggi dari dua metrik.
// Scope hitung = pertemuan program='kelas_maahir' (exclude tanggal libur).

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import { fetchAllRows } from '@/lib/supabase-page';
import {
  diputihkanPada,
  getPemutihan,
  pemutihanKeysDari,
  periodeMonthOf,
  type Pemutihan,
} from '@/lib/maahir-pemutihan';
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

/** Satu tindakan pemutihan sebagaimana ditampilkan di daftar SP. */
export type PemutihanRingkas = {
  id: string;
  /** Baris keanggotaan yang diputihkan (seorang bisa punya beberapa). */
  anggotaId: string;
  /** null = seluruh bulan. */
  tanggal: string | null;
  month: string;
  alasan: string | null;
  oleh: string | null;
  pada: string;
};

export type SPPeserta = {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: Gender;
  /** Angka EFEKTIF — sesudah pemutihan. */
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  /** SP efektif (sesudah pemutihan). */
  sp: SPLevel;
  /** SP sebelum pemutihan — sama dengan `sp` bila tak ada pemutihan. */
  spKotor: SPLevel;
  /** Pemutihan aktif milik orang ini; kosong = tak pernah diputihkan. */
  diputihkan: PemutihanRingkas[];
};

export type SPRekap = {
  /** sp >= 1, ATAU pernah kena SP tapi diputihkan (tetap disimpan sbg bank data). */
  list: SPPeserta[];
  summary: { total: number; sp1: number; sp2: number; sp3: number; diputihkan: number };
  /** Tanggal terakhir yang ikut dihitung (YYYY-MM-DD). */
  cutoff: string;
};

function emptySP(cutoff: string): SPRekap {
  return { list: [], summary: { total: 0, sp1: 0, sp2: 0, sp3: 0, diputihkan: 0 }, cutoff };
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

  // Pemutihan koordinator (tanggal tertentu atau sebulan penuh).
  const pemutihanRows = await getPemutihan();
  const pemutihanKeys = pemutihanKeysDari(pemutihanRows);
  const pemutihanByAnggota = new Map<string, Pemutihan[]>();
  for (const r of pemutihanRows) {
    const arr = pemutihanByAnggota.get(r.anggotaId) ?? [];
    arr.push(r);
    pemutihanByAnggota.set(r.anggotaId, arr);
  }

  // Dua tally sekaligus: `kotor` = apa adanya, `bersih` = sesudah pemutihan.
  // Keduanya perlu karena orang yang SP-nya diputihkan tetap harus tampil di
  // daftar — dengan SP aslinya masih terbaca sebagai bank data.
  type Tally = { H: number; T: number; I: number; S: number; A: number };
  const kosong = (): Tally => ({ H: 0, T: 0, I: 0, S: 0, A: 0 });
  const kotorByAnggota = new Map<string, Tally>();
  const bersihByAnggota = new Map<string, Tally>();
  for (const k of kehadiranRows) {
    if (!k.anggota_id) continue;
    const p = pertById.get(k.pertemuan_id);
    if (!p) continue;
    if (liburByKelas.get(p.kelasId)?.has(p.tanggal)) continue; // anulir libur

    const tambah = (m: Map<string, Tally>) => {
      let t = m.get(k.anggota_id as string);
      if (!t) {
        t = kosong();
        m.set(k.anggota_id as string, t);
      }
      switch (k.status) {
        case 'hadir': t.H++; break;
        case 'terlambat': t.T++; break;
        case 'izin': t.I++; break;
        case 'sakit': t.S++; break;
        default: t.A++; break; // tidak_ada_keterangan → alpa
      }
    };

    tambah(kotorByAnggota);
    if (!diputihkanPada(pemutihanKeys, k.anggota_id, p.tanggal)) tambah(bersihByAnggota);
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
    kotor: Tally;
    bersih: Tally;
    diputihkan: PemutihanRingkas[];
    aktifSekarang: boolean;
  };
  const tambahTally = (dst: Tally, src: Tally) => {
    dst.H += src.H; dst.T += src.T; dst.I += src.I; dst.S += src.S; dst.A += src.A;
  };
  const ringkas = (r: Pemutihan): PemutihanRingkas => ({
    id: r.id,
    anggotaId: r.anggotaId,
    tanggal: r.tanggal,
    month: r.month,
    alasan: r.alasan,
    oleh: r.dibuatOleh,
    pada: r.createdAt,
  });

  const byOrang = new Map<string, Gabung>();
  for (const a of anggotaList) {
    const kelas = kelasById.get(a.program_kelas_id);
    if (!kelas) continue;
    const kotor = kotorByAnggota.get(a.id) ?? kosong();
    const bersih = bersihByAnggota.get(a.id) ?? kosong();
    // Pemutihan menempel pada baris keanggotaan, SP menempel pada orang — jadi
    // pemutihan dari kelas lama ikut terbawa saat baris digabung.
    const putih = (pemutihanByAnggota.get(a.id) ?? []).map(ringkas);
    const key = a.whatsapp_number ?? `id:${a.id}`;
    const masihBerjalan = !a.selesai_tanggal || a.selesai_tanggal >= today;
    const g = byOrang.get(key);
    if (!g) {
      byOrang.set(key, {
        anggotaId: a.id,
        name: a.name,
        kelasName: kelas.name,
        gender: kelas.gender,
        kotor: { ...kotor },
        bersih: { ...bersih },
        diputihkan: putih,
        aktifSekarang: masihBerjalan,
      });
      continue;
    }
    tambahTally(g.kotor, kotor);
    tambahTally(g.bersih, bersih);
    g.diputihkan.push(...putih);
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
    const sp = spLevel(g.bersih.A, g.bersih.I);
    const spKotor = spLevel(g.kotor.A, g.kotor.I);
    // Yang SP-nya luruh gara-gara pemutihan tetap disimpan sebagai bank data;
    // yang memang tak pernah menyentuh ambang tetap dibuang.
    if (sp === 0 && !(spKotor >= 1 && g.diputihkan.length > 0)) continue;
    list.push({
      anggotaId: g.anggotaId,
      name: g.name,
      kelasName: g.kelasName,
      gender: g.gender,
      hadir: g.bersih.H,
      terlambat: g.bersih.T,
      izin: g.bersih.I,
      sakit: g.bersih.S,
      alpa: g.bersih.A,
      sp,
      spKotor,
      diputihkan: g.diputihkan.sort((a, b) =>
        (a.tanggal ?? a.month).localeCompare(b.tanggal ?? b.month)
      ),
    });
  }
  list.sort(
    (x, y) =>
      y.sp - x.sp ||
      y.spKotor - x.spKotor ||
      y.alpa - x.alpa ||
      y.izin - x.izin ||
      x.name.localeCompare(y.name)
  );

  return {
    list,
    cutoff: today,
    summary: {
      // Ringkasan menghitung SP EFEKTIF saja — baris bank data tak ikut.
      total: list.filter((p) => p.sp >= 1).length,
      sp1: list.filter((p) => p.sp === 1).length,
      sp2: list.filter((p) => p.sp === 2).length,
      sp3: list.filter((p) => p.sp === 3).length,
      diputihkan: list.filter((p) => p.diputihkan.length > 0).length,
    },
  };
}

// ============================================================
// Rincian satu peserta — dipakai halaman pemutihan per-tanggal
// ============================================================

/** Satu sesi yang menyumbang SP (izin / alpa). */
export type SesiPelanggaran = {
  /** Baris keanggotaan pemilik kehadiran ini — pemutihan menempel ke sini. */
  anggotaId: string;
  tanggal: string;
  kelasName: string;
  status: 'izin' | 'alpa';
  /** Pemutihan aktif yang menganulir sesi ini, bila ada. */
  pemutihan: PemutihanRingkas | null;
};

export type SPDetail = {
  /** Baris keanggotaan yang dipakai sebagai identitas tampilan. */
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: Gender;
  sp: SPLevel;
  spKotor: SPLevel;
  alpa: number;
  izin: number;
  /** Sesi izin/alpa, terbaru dulu. */
  sesi: SesiPelanggaran[];
  /** Seluruh riwayat pemutihan orang ini, TERMASUK yang sudah dibatalkan. */
  riwayat: Array<PemutihanRingkas & { dibatalkanPada: string | null; dibatalkanOleh: string | null }>;
};

/**
 * Rincian pelanggaran satu ORANG (bukan satu baris keanggotaan): baris kelas
 * lama ikut ditarik lewat nomor WA, sejalan dengan penggabungan di
 * `getMaahirSP`. Tanggal libur tetap dianulir seperti perhitungan SP.
 */
export async function getSPDetail(anggotaId: string): Promise<SPDetail | null> {
  const { data: aku } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name, whatsapp_number, selesai_tanggal')
    .eq('id', anggotaId)
    .maybeSingle();
  if (!aku) return null;

  const wa = (aku.whatsapp_number as string | null) ?? null;
  let saudara: Array<Record<string, unknown>> = [aku as Record<string, unknown>];
  if (wa) {
    const { data } = await supabaseAdmin
      .from('program_kelas_anggota')
      .select('id, program_kelas_id, name, whatsapp_number, selesai_tanggal')
      .eq('whatsapp_number', wa)
      .eq('active', true);
    if ((data ?? []).length) saudara = data as Array<Record<string, unknown>>;
  }
  const anggotaIds = saudara.map((s) => s.id as string);
  const kelasIds = [...new Set(saudara.map((s) => s.program_kelas_id as string))];

  const { data: kelasRows } = await supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender')
    .in('id', kelasIds);
  const kelasById = new Map(
    ((kelasRows ?? []) as Array<{ id: string; name: string; gender: Gender }>).map((k) => [k.id, k])
  );

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const { data: pertRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('program', 'kelas_maahir')
    .lte('tanggal', today);
  const pertById = new Map(
    ((pertRows ?? []) as Array<{ id: string; program_kelas_id: string; tanggal: string }>).map((p) => [
      p.id,
      p,
    ])
  );

  const liburByKelas = await getLiburDatesForKelas(kelasIds, PROGRAM_START, today);

  const kehadiran = await fetchAllRows<{
    pertemuan_id: string;
    anggota_id: string | null;
    status: string;
  }>((from, to) =>
    supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, anggota_id, status')
      .in('anggota_id', anggotaIds)
      .not('diisi_at', 'is', null)
      .order('id')
      .range(from, to)
  );

  const semuaPemutihan = await getRiwayatPemutihanAnggota(anggotaIds);
  const aktif = semuaPemutihan.filter((r) => r.dibatalkanPada === null);
  const keys = pemutihanKeysDari(
    aktif.map((r) => ({
      id: r.id,
      anggotaId: r.anggotaId,
      month: r.month,
      tanggal: r.tanggal,
      alasan: r.alasan,
      dibuatOleh: r.oleh,
      createdAt: r.pada,
      dibatalkanPada: null,
      dibatalkanOleh: null,
    }))
  );

  let alpa = 0;
  let izin = 0;
  let alpaKotor = 0;
  let izinKotor = 0;
  const sesi: SesiPelanggaran[] = [];
  for (const k of kehadiran) {
    if (!k.anggota_id) continue;
    const p = pertById.get(k.pertemuan_id);
    if (!p) continue;
    if (liburByKelas.get(p.program_kelas_id)?.has(p.tanggal)) continue;
    const status: 'izin' | 'alpa' | null =
      k.status === 'izin' ? 'izin' : k.status === 'hadir' || k.status === 'terlambat' || k.status === 'sakit' ? null : 'alpa';
    if (!status) continue;

    const putih = diputihkanPada(keys, k.anggota_id, p.tanggal);
    if (status === 'alpa') { alpaKotor++; if (!putih) alpa++; } else { izinKotor++; if (!putih) izin++; }
    sesi.push({
      anggotaId: k.anggota_id,
      tanggal: p.tanggal,
      kelasName: kelasById.get(p.program_kelas_id)?.name ?? '—',
      status,
      pemutihan:
        aktif.find(
          (r) =>
            r.anggotaId === k.anggota_id &&
            (r.tanggal === p.tanggal || (r.tanggal === null && r.month === periodeMonthOf(p.tanggal)))
        ) ?? null,
    });
  }
  sesi.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

  const berjalan =
    saudara.find((s) => {
      const sel = s.selesai_tanggal as string | null;
      return !sel || sel >= today;
    }) ?? saudara[0];
  const kelasTampil = kelasById.get(berjalan.program_kelas_id as string);

  return {
    anggotaId: berjalan.id as string,
    name: (berjalan.name as string) ?? (aku.name as string),
    kelasName: kelasTampil?.name ?? '—',
    gender: kelasTampil?.gender ?? 'ikhwan',
    sp: spLevel(alpa, izin),
    spKotor: spLevel(alpaKotor, izinKotor),
    alpa,
    izin,
    sesi,
    riwayat: semuaPemutihan,
  };
}

/** Riwayat pemutihan (aktif + dibatalkan) untuk sekumpulan baris keanggotaan. */
async function getRiwayatPemutihanAnggota(
  anggotaIds: string[]
): Promise<SPDetail['riwayat']> {
  if (anggotaIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('maahir_pemutihan')
    .select('id, anggota_id, month, tanggal, alasan, dibuat_oleh, created_at, dibatalkan_pada, dibatalkan_oleh')
    .in('anggota_id', anggotaIds);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      id: r.id as string,
      anggotaId: r.anggota_id as string,
      month: r.month as string,
      tanggal: (r.tanggal as string | null) ?? null,
      alasan: (r.alasan as string | null) ?? null,
      oleh: (r.dibuat_oleh as string | null) ?? null,
      pada: r.created_at as string,
      dibatalkanPada: (r.dibatalkan_pada as string | null) ?? null,
      dibatalkanOleh: (r.dibatalkan_oleh as string | null) ?? null,
    }))
    .sort((a, b) => (a.pada < b.pada ? 1 : -1));
}
