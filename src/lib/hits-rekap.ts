// Data dashboard koordinator ketua kelas HITS: agregasi keterangan harian
// per halaqah dalam satu bulan + ekspektasi pertemuan dari kaldik.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { deriveHalaqahProgram, PROGRAM_STAGES, programKaldikLevels, type KaldikHariLite, type PertemuanOverride } from '@/lib/hits-pertemuan';
import { todayJakarta } from '@/lib/maahir-presensi';
import type { Gender, HitsKondisi, HitsLevel } from '@/types/db';

export type HitsRekapRow = {
  halaqahId: string;
  batchId: string;
  batchName: string;
  level: HitsLevel | null;
  halaqahName: string;
  gender: Gender | null;
  jadwalRaw: string | null;
  pengajarNama: string | null;
  pengajarLinked: boolean; // pengajar_id ter-resolve (masuk matrix)
  ketuaNama: string | null;
  ketuaKelasId: string | null;
  ketuaWa: string | null;
  ketuaLoggedIn: boolean; // ketua sudah pernah login (last_login_at terisi)
  terisi: number; // pertemuan yang sudah diisi bulan ini
  expected: number; // pertemuan yang diharapkan s/d hari ini (dari kaldik)
  belumDiisi: number;
  kbbs: number;
  nonLibur: number;
  pctKbbs: number | null; // kedisiplinan
  latihanDone: number;
  pctLatihan: number | null; // tanggung jawab
  terlambat: number;
  kondisiCount: Record<HitsKondisi, number>;
};

export type HitsBatchOption = { id: string; name: string };

/**
 * Jalankan query ber-`.in(col, ids)` dalam potongan kecil lalu gabung hasilnya.
 * Hindari (a) URL "414 Too Long" saat ids banyak (mis. 434 halaqah → ~16KB URL
 * gagal di gateway → data null → dashboard kosong) dan (b) cap default 1000 baris
 * PostgREST (potongan kecil → baris per-request jauh di bawah 1000).
 */
export async function fetchInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>,
  size = 80
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data } = await run(ids.slice(i, i + size));
    if (data) out.push(...data);
  }
  return out;
}

function monthBounds(month: string): { start: string; nextMonth: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const nextMonth =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, nextMonth };
}

export async function getHitsBatches(): Promise<HitsBatchOption[]> {
  const { data } = await supabaseAdmin
    .from('hits_batch')
    .select('id, name')
    .eq('active', true)
    .order('start_date', { ascending: false });
  return data ?? [];
}

export async function getHitsRekap(
  month: string,
  opts?: { batchId?: string; gender?: Gender; halaqahId?: string }
): Promise<HitsRekapRow[]> {
  const { start, nextMonth } = monthBounds(month);
  const today = todayJakarta();

  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select(
      'id, batch_id, level, program, name, gender, jadwal_raw, jadwal_hari, pengajar_nama_sheet, pengajar_id, start_date'
    )
    .eq('active', true);
  if (opts?.halaqahId) hq = hq.eq('id', opts.halaqahId);
  if (opts?.batchId) hq = hq.eq('batch_id', opts.batchId);
  if (opts?.gender) hq = hq.eq('gender', opts.gender);
  const { data: halaqahList } = await hq;
  const halaqah = halaqahList ?? [];
  if (!halaqah.length) return [];

  const halaqahIds = halaqah.map((h) => h.id);
  const batchIds = [...new Set(halaqah.map((h) => h.batch_id))];

  // Query anak ber-.in(halaqahIds) DICHUNK — daftar ratusan id bisa bikin URL
  // gateway 414 (→ data null → ketua/keterangan kosong semua) atau kena cap 1000 baris.
  const [{ data: batchList }, { data: kaldikList }, ketList, ketuaList, overrideList] =
    await Promise.all([
      supabaseAdmin.from('hits_batch').select('id, name').in('id', batchIds),
      supabaseAdmin
        .from('hits_kaldik_hari')
        .select('batch_id, level, tanggal, pekan, is_libur')
        .in('batch_id', batchIds),
      fetchInChunks(halaqahIds, (ids) =>
        supabaseAdmin
          .from('hits_keterangan_harian')
          .select('halaqah_id, pertemuan_no, tanggal, kondisi, terlambat, latihan_diberikan, semua_selesai, status_latihan')
          .in('halaqah_id', ids)
          .gte('tanggal', start)
          .lt('tanggal', nextMonth)
      ),
      // Sumber tunggal ketua = tabel ketua_kelas (dipakai login/auth). Mencakup
      // ketua jalur manual yang tak ter-flag di hits_halaqah_peserta.
      fetchInChunks(halaqahIds, (ids) =>
        supabaseAdmin
          .from('ketua_kelas')
          .select('id, name, whatsapp_number, hits_halaqah_id, last_login_at')
          .in('hits_halaqah_id', ids)
          .eq('active', true)
      ),
      fetchInChunks(halaqahIds, (ids) =>
        supabaseAdmin
          .from('hits_kaldik_pertemuan')
          .select('halaqah_id, level, pertemuan_no, tanggal, pekan, is_skipped')
          .in('halaqah_id', ids)
      ),
    ]);

  const batchName = new Map((batchList ?? []).map((b) => [b.id, b.name]));
  // Bila satu halaqah punya >1 ketua aktif, prioritaskan yang sudah login.
  const ketuaByHalaqah = new Map<
    string,
    { id: string; nama: string; wa: string | null; loggedIn: boolean }
  >();
  for (const k of ketuaList ?? []) {
    if (!k.hits_halaqah_id) continue;
    const cur = ketuaByHalaqah.get(k.hits_halaqah_id);
    const loggedIn = !!k.last_login_at;
    if (!cur || (loggedIn && !cur.loggedIn)) {
      ketuaByHalaqah.set(k.hits_halaqah_id, {
        id: k.id,
        nama: k.name,
        wa: k.whatsapp_number,
        loggedIn,
      });
    }
  }

  const overridesByHL = new Map<string, PertemuanOverride[]>();
  for (const o of overrideList ?? []) {
    const key = `${o.halaqah_id}|${o.level}`;
    const arr = overridesByHL.get(key) ?? [];
    arr.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan, is_skipped: o.is_skipped });
    overridesByHL.set(key, arr);
  }

  // kaldik per (batch|level)
  const kaldikByBL = new Map<string, KaldikHariLite[]>();
  for (const r of kaldikList ?? []) {
    const key = `${r.batch_id}|${r.level}`;
    const arr = kaldikByBL.get(key) ?? [];
    arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
    kaldikByBL.set(key, arr);
  }

  const ketByHalaqah = new Map<string, typeof ketList>();
  for (const k of ketList ?? []) {
    const arr = ketByHalaqah.get(k.halaqah_id) ?? [];
    arr.push(k);
    ketByHalaqah.set(k.halaqah_id, arr);
  }

  const emptyKondisi = (): Record<HitsKondisi, number> => ({
    KBBS: 0, KMT: 0, JKG: 0, KBLA: 0, LIBUR: 0,
  });

  return halaqah.map((h) => {
    const kets = ketByHalaqah.get(h.id) ?? [];
    const kondisiCount = emptyKondisi();
    let kbbs = 0;
    let nonLibur = 0;
    let latihanDone = 0;
    let terlambat = 0;
    for (const k of kets) {
      kondisiCount[k.kondisi as HitsKondisi] += 1;
      if (k.kondisi !== 'LIBUR') nonLibur += 1;
      if (k.kondisi === 'KBBS') kbbs += 1;
      if (k.terlambat) terlambat += 1;
      if (k.latihan_diberikan && (k.semua_selesai || k.status_latihan === 'SML')) latihanDone += 1;
    }

    // Ekspektasi pertemuan s/d hari ini (lintas tahap, dari kaldik + jadwal).
    const kaldikByLevel = new Map<HitsLevel, KaldikHariLite[]>();
    for (const lv of programKaldikLevels(h.program)) kaldikByLevel.set(lv, kaldikByBL.get(`${h.batch_id}|${lv}`) ?? []);
    const ovByLevel = new Map<HitsLevel, PertemuanOverride[]>();
    for (const lv of PROGRAM_STAGES[h.program] ?? PROGRAM_STAGES.dasar) ovByLevel.set(lv, overridesByHL.get(`${h.id}|${lv}`) ?? []);
    const derived = deriveHalaqahProgram(h.program, h.jadwal_hari ?? [], kaldikByLevel, ovByLevel, h.start_date);
    const expected = derived.filter((d) => d.tanggal >= start && d.tanggal < nextMonth && d.tanggal <= today).length;
    const terisi = kets.length;

    return {
      halaqahId: h.id,
      batchId: h.batch_id,
      batchName: batchName.get(h.batch_id) ?? '—',
      level: (h.level as HitsLevel) ?? null,
      halaqahName: h.name,
      gender: (h.gender as Gender) ?? null,
      jadwalRaw: h.jadwal_raw,
      pengajarNama: h.pengajar_nama_sheet,
      pengajarLinked: !!h.pengajar_id,
      ketuaNama: ketuaByHalaqah.get(h.id)?.nama ?? null,
      ketuaKelasId: ketuaByHalaqah.get(h.id)?.id ?? null,
      ketuaWa: ketuaByHalaqah.get(h.id)?.wa ?? null,
      ketuaLoggedIn: ketuaByHalaqah.get(h.id)?.loggedIn ?? false,
      terisi,
      expected,
      belumDiisi: Math.max(0, expected - terisi),
      kbbs,
      nonLibur,
      pctKbbs: nonLibur > 0 ? Math.round((kbbs / nonLibur) * 100) : null,
      latihanDone,
      pctLatihan: nonLibur > 0 ? Math.round((latihanDone / nonLibur) * 100) : null,
      terlambat,
      kondisiCount,
    };
  });
}

/** Rekap satu halaqah (untuk dashboard ketua kelas). */
export async function getHitsRekapForHalaqah(
  halaqahId: string,
  month: string
): Promise<HitsRekapRow | null> {
  const rows = await getHitsRekap(month, { halaqahId });
  return rows[0] ?? null;
}
