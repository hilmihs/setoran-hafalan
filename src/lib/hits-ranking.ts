// Leaderboard disiplin pengajar (F5): agregat %KBBS + hutang menit per pengajar,
// lalu ranking. Terpisah dari hits-rekap.ts (yang month-coupled).
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchInChunks } from '@/lib/hits-rekap';
import { computeHutangForHalaqahList } from '@/lib/hits-hutang';
import type { Gender } from '@/types/db';

export type DisiplinAgg = {
  pengajarId: string;
  pengajarNama: string;
  gender: Gender | null;
  halaqahCount: number;
  halaqahIds: string[]; // untuk aksi noData (WA ketua, isi manual)
  kbbs: number;
  nonLibur: number;
  // Hitungan pelanggaran per-jenis dalam periode [start,end) — dari hits_pelanggaran.
  kmt: number;
  kbla: number;
  jkg: number;
  tidakLatihan: number;
  hutangSaldo: number; // menit, kumulatif (bukan per-periode)
};

export type DisiplinRankRow = DisiplinAgg & {
  pctKbbs: number | null; // 0..100, null bila nonLibur=0
  rank: number | null;    // null bila pctKbbs null
};

/**
 * Urut: %KBBS turun (null di bawah) → hutang menit naik → nama. Rank 1..N
 * hanya untuk baris ber-data (pctKbbs != null). Fungsi murni — mudah diuji.
 */
export function rankFromAggregates(aggs: DisiplinAgg[]): DisiplinRankRow[] {
  const rows: DisiplinRankRow[] = aggs.map((a) => ({
    ...a,
    pctKbbs: a.nonLibur > 0 ? Math.round((a.kbbs / a.nonLibur) * 100) : null,
    rank: null,
  }));
  rows.sort((x, y) => {
    const rx = x.nonLibur > 0 ? x.kbbs / x.nonLibur : -1;
    const ry = y.nonLibur > 0 ? y.kbbs / y.nonLibur : -1;
    if (rx !== ry) return ry - rx; // pct desc, null(-1) terakhir
    if (x.hutangSaldo !== y.hutangSaldo) return x.hutangSaldo - y.hutangSaldo; // hutang asc
    return x.pengajarNama.localeCompare(y.pengajarNama);
  });
  let r = 0;
  for (const row of rows) {
    if (row.pctKbbs !== null) { r += 1; row.rank = r; }
  }
  return rows;
}

/**
 * Ranking disiplin semua pengajar aktif di [start,end). Halaqah tanpa
 * pengajar_id di-skip (tak bisa diagregat). Hutang = saldo kumulatif (F2),
 * dijumlah per pengajar dari semua halaqahnya (TAK di-scope periode).
 */
export async function getDisiplinRanking(opts: {
  start: string; // 'YYYY-MM-DD' inklusif
  end: string;   // 'YYYY-MM-DD' eksklusif
  gender?: Gender;
}): Promise<DisiplinRankRow[]> {
  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select('id, pengajar_id, pengajar_nama_sheet, gender')
    .eq('active', true)
    .not('pengajar_id', 'is', null);
  if (opts.gender) hq = hq.eq('gender', opts.gender);
  const { data: halaqahList } = await hq;
  const halaqah = halaqahList ?? [];
  if (!halaqah.length) return [];

  const halaqahIds = halaqah.map((h) => h.id as string);
  const halaqahToPengajar = new Map(halaqah.map((h) => [h.id as string, h.pengajar_id as string]));

  // meta per pengajar (nama, gender, daftar halaqah)
  const meta = new Map<string, { nama: string; gender: Gender | null; halaqahIds: string[] }>();
  for (const h of halaqah) {
    const pid = h.pengajar_id as string;
    const m = meta.get(pid) ?? {
      nama: (h.pengajar_nama_sheet as string) ?? '—',
      gender: (h.gender as Gender | null) ?? null,
      halaqahIds: [],
    };
    m.halaqahIds.push(h.id as string);
    meta.set(pid, m);
  }

  // keterangan harian di periode — chunked (anti-414 & cap-1000). Chunk 40
  // (bukan default 80): mode bulanan bisa ~13 pertemuan/halaqah → 80×13≈1040
  // > cap 1000 baris PostgREST → data terpotong (nonLibur/kbbs understated).
  // 40×13≈520 aman. Ambil `id` juga untuk join pelanggaran per-jenis.
  const ketList = await fetchInChunks(
    halaqahIds,
    (chunk) =>
      supabaseAdmin
        .from('hits_keterangan_harian')
        .select('id, halaqah_id, kondisi')
        .gte('tanggal', opts.start)
        .lt('tanggal', opts.end)
        .in('halaqah_id', chunk),
    40
  );
  const agg = new Map<
    string,
    { kbbs: number; nonLibur: number; kmt: number; kbla: number; jkg: number; tidakLatihan: number }
  >();
  const zero = () => ({ kbbs: 0, nonLibur: 0, kmt: 0, kbla: 0, jkg: 0, tidakLatihan: 0 });
  // keterangan_id → pengajar_id (untuk atribusi pelanggaran ke pengajar)
  const ketToPengajar = new Map<string, string>();
  for (const k of ketList) {
    const pid = halaqahToPengajar.get(k.halaqah_id as string);
    if (!pid) continue;
    ketToPengajar.set(k.id as string, pid);
    const a = agg.get(pid) ?? zero();
    if (k.kondisi !== 'LIBUR') a.nonLibur += 1;
    if (k.kondisi === 'KBBS') a.kbbs += 1;
    agg.set(pid, a);
  }

  // pelanggaran per-jenis dalam periode — chunk by keterangan_id (pola hits-hutang).
  // Satu pertemuan bisa >1 jenis; sumber kebenaran multi-pelanggaran = hits_pelanggaran.
  const ketIds = [...ketToPengajar.keys()];
  const pelList = await fetchInChunks(
    ketIds,
    (chunk) =>
      supabaseAdmin
        .from('hits_pelanggaran')
        .select('keterangan_id, jenis')
        .in('keterangan_id', chunk),
    100
  );
  for (const p of pelList) {
    const pid = ketToPengajar.get(p.keterangan_id as string);
    if (!pid) continue;
    const a = agg.get(pid) ?? zero();
    switch (p.jenis) {
      case 'KMT': a.kmt += 1; break;
      case 'KBLA': a.kbla += 1; break;
      case 'JKG': a.jkg += 1; break;
      case 'TIDAK_LATIHAN': a.tidakLatihan += 1; break;
    }
    agg.set(pid, a);
  }

  // hutang kumulatif per halaqah (F2, bulk) → jumlah per pengajar
  const hutangMap = await computeHutangForHalaqahList(halaqahIds);

  const aggs: DisiplinAgg[] = [...meta.entries()].map(([pid, m]) => {
    const a = agg.get(pid) ?? zero();
    const hutang = m.halaqahIds.reduce((s, hid) => s + (hutangMap.get(hid)?.saldo ?? 0), 0);
    return {
      pengajarId: pid,
      pengajarNama: m.nama,
      gender: m.gender,
      halaqahCount: m.halaqahIds.length,
      halaqahIds: m.halaqahIds,
      kbbs: a.kbbs,
      nonLibur: a.nonLibur,
      kmt: a.kmt,
      kbla: a.kbla,
      jkg: a.jkg,
      tidakLatihan: a.tidakLatihan,
      hutangSaldo: hutang,
    };
  });
  return rankFromAggregates(aggs);
}

// ── Rincian insiden indisipliner per pengajar (KMT/KBLA/JKG/BADAL/TL) ───────
// Dipakai dashboard ranking: baris angka KMT/KBLA/JKG/TL bisa dibuka untuk
// melihat alasannya — keterangan ketua kelas, hasil tabayyun (alasan pengajar),
// serta putusan koordinator ketua kelas (udzur syar'i diterima/ditolak).

export type InsidenTabayyunStatus =
  | 'belum_ditabayyun'
  | 'nunggu_alasan'
  | 'pending'
  | 'diputus';

export type PelanggaranItem = {
  jenis: string; // KMT | KBLA | JKG | BADAL | TIDAK_LATIHAN
  detail: string; // '12 menit', 'Ganti hari', 'Badal: Fulan', ''
};

export type InsidenDetail = {
  keteranganId: string;
  halaqahId: string;
  halaqahName: string;
  tanggal: string;
  pertemuanNo: number;
  pelanggaran: PelanggaranItem[];
  catatanKetua: string | null; // keterangan yang ditulis ketua kelas
  status: InsidenTabayyunStatus;
  alasanPengajar: string | null; // hasil tabayyun
  isUdzurSyari: boolean | null; // putusan koordinator KK
  keputusanCatatan: string | null;
  decidedAt: string | null;
};

function pelanggaranDetail(p: {
  jenis: string;
  menit: number | null;
  jkg_opsi: string | null;
  cicil_n: number | null;
  badal_nama: string | null;
}): string {
  if ((p.jenis === 'KMT' || p.jenis === 'KBLA') && p.menit != null) return `${p.menit} menit`;
  if (p.jenis === 'JKG' && p.jkg_opsi) {
    const base = p.jkg_opsi === 'cicil' ? 'dicicil' : 'ganti hari';
    return p.jkg_opsi === 'cicil' && p.cicil_n ? `${base} ${p.cicil_n}×` : base;
  }
  if (p.jenis === 'BADAL' && p.badal_nama) return `badal: ${p.badal_nama}`;
  return '';
}

function tabayyunStatusOf(status: string | undefined): InsidenTabayyunStatus {
  if (!status) return 'belum_ditabayyun';
  if (status === 'awaiting_reason') return 'nunggu_alasan';
  if (status === 'pending') return 'pending';
  return 'diputus';
}

/**
 * Rincian insiden per pengajar pada [start,end). Sumber sama dengan hitungan
 * kolom KMT/KBLA/JKG/TL di ranking (hits_pelanggaran), di-join ke keterangan
 * harian (catatan ketua) dan hits_tabayyun (alasan pengajar + putusan).
 */
export async function getInsidenDetailByPengajar(opts: {
  start: string;
  end: string;
  gender?: Gender;
}): Promise<Map<string, InsidenDetail[]>> {
  const result = new Map<string, InsidenDetail[]>();

  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, pengajar_id')
    .eq('active', true)
    .not('pengajar_id', 'is', null);
  if (opts.gender) hq = hq.eq('gender', opts.gender);
  const { data: halaqahList } = await hq;
  const halaqah = (halaqahList ?? []) as Array<{ id: string; name: string; pengajar_id: string }>;
  if (!halaqah.length) return result;

  const halaqahIds = halaqah.map((h) => h.id);
  const halaqahById = new Map(halaqah.map((h) => [h.id, h]));

  const ketList = await fetchInChunks<{
    id: string;
    halaqah_id: string;
    pertemuan_no: number;
    tanggal: string;
    catatan: string | null;
  }>(
    halaqahIds,
    (chunk) =>
      supabaseAdmin
        .from('hits_keterangan_harian')
        .select('id, halaqah_id, pertemuan_no, tanggal, catatan')
        .gte('tanggal', opts.start)
        .lt('tanggal', opts.end)
        .in('halaqah_id', chunk),
    40
  );
  if (!ketList.length) return result;

  const ketIds = ketList.map((k) => k.id);
  const [pelList, tabList] = await Promise.all([
    fetchInChunks<{
      keterangan_id: string;
      jenis: string;
      menit: number | null;
      jkg_opsi: string | null;
      cicil_n: number | null;
      badal_nama: string | null;
    }>(
      ketIds,
      (chunk) =>
        supabaseAdmin
          .from('hits_pelanggaran')
          .select('keterangan_id, jenis, menit, jkg_opsi, cicil_n, badal_nama')
          .in('keterangan_id', chunk),
      100
    ),
    fetchInChunks<{
      keterangan_id: string;
      status: string;
      alasan_pengajar: string | null;
      is_udzur_syari: boolean | null;
      keputusan_catatan: string | null;
      decided_at: string | null;
    }>(
      ketIds,
      (chunk) =>
        supabaseAdmin
          .from('hits_tabayyun')
          .select('keterangan_id, status, alasan_pengajar, is_udzur_syari, keputusan_catatan, decided_at')
          .in('keterangan_id', chunk),
      100
    ),
  ]);
  if (!pelList.length) return result;

  const pelByKet = new Map<string, PelanggaranItem[]>();
  for (const p of pelList) {
    const arr = pelByKet.get(p.keterangan_id) ?? [];
    arr.push({ jenis: p.jenis, detail: pelanggaranDetail(p) });
    pelByKet.set(p.keterangan_id, arr);
  }
  const tabByKet = new Map(tabList.map((t) => [t.keterangan_id, t]));

  for (const k of ketList) {
    const pelanggaran = pelByKet.get(k.id);
    if (!pelanggaran?.length) continue;
    const h = halaqahById.get(k.halaqah_id);
    if (!h) continue;
    const t = tabByKet.get(k.id);
    const item: InsidenDetail = {
      keteranganId: k.id,
      halaqahId: k.halaqah_id,
      halaqahName: h.name,
      tanggal: k.tanggal,
      pertemuanNo: k.pertemuan_no,
      pelanggaran,
      catatanKetua: k.catatan,
      status: tabayyunStatusOf(t?.status),
      alasanPengajar: t?.alasan_pengajar ?? null,
      isUdzurSyari: t?.is_udzur_syari ?? null,
      keputusanCatatan: t?.keputusan_catatan ?? null,
      decidedAt: t?.decided_at ?? null,
    };
    const arr = result.get(h.pengajar_id) ?? [];
    arr.push(item);
    result.set(h.pengajar_id, arr);
  }
  for (const arr of result.values()) {
    arr.sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0));
  }
  return result;
}

// ── Info aksi untuk baris "belum ada data" ──────────────────────────────────
export type HalaqahAksi = {
  halaqahId: string;
  halaqahName: string;
  ketuaNama: string | null;
  ketuaWa: string | null;
  ketuaGender: Gender | null;
  ketuaLoggedIn: boolean;
};
export type NoDataAksi = {
  pengajarId: string;
  pengajarWa: string | null;
  pengajarGender: Gender | null;
  halaqah: HalaqahAksi[];
};

/**
 * Untuk baris noData: WA pengajar + daftar halaqah beserta ketua kelasnya
 * (agar koordinator bisa ingatkan isi keterangan). Query dichunk (anti 414/cap).
 * Ketua = tabel ketua_kelas (sumber kebenaran); >1 ketua/halaqah → prioritas login.
 */
export async function getNoDataActionInfo(rows: DisiplinAgg[]): Promise<Map<string, NoDataAksi>> {
  const result = new Map<string, NoDataAksi>();
  if (!rows.length) return result;

  const pengajarIds = rows.map((r) => r.pengajarId);
  const halaqahIds = [...new Set(rows.flatMap((r) => r.halaqahIds))];

  const [pengajarRows, halaqahRows, ketuaRows] = await Promise.all([
    fetchInChunks<{ id: string; whatsapp_number: string | null; gender: Gender | null }>(
      pengajarIds,
      (ids) =>
        supabaseAdmin.from('pengajar').select('id, whatsapp_number, gender').in('id', ids)
    ),
    fetchInChunks<{ id: string; name: string }>(
      halaqahIds,
      (ids) => supabaseAdmin.from('hits_halaqah').select('id, name').in('id', ids)
    ),
    fetchInChunks<{
      id: string;
      name: string;
      whatsapp_number: string | null;
      gender: Gender | null;
      hits_halaqah_id: string | null;
      last_login_at: string | null;
    }>(
      halaqahIds,
      (ids) =>
        supabaseAdmin
          .from('ketua_kelas')
          .select('id, name, whatsapp_number, gender, hits_halaqah_id, last_login_at')
          .in('hits_halaqah_id', ids)
          .eq('active', true)
    ),
  ]);

  const pengajarById = new Map(pengajarRows.map((p) => [p.id, p]));
  const halaqahName = new Map(halaqahRows.map((h) => [h.id, h.name]));
  const ketuaByHalaqah = new Map<
    string,
    { nama: string; wa: string | null; gender: Gender | null; loggedIn: boolean }
  >();
  for (const k of ketuaRows) {
    if (!k.hits_halaqah_id) continue;
    const cur = ketuaByHalaqah.get(k.hits_halaqah_id);
    const loggedIn = !!k.last_login_at;
    if (!cur || (loggedIn && !cur.loggedIn)) {
      ketuaByHalaqah.set(k.hits_halaqah_id, {
        nama: k.name,
        wa: k.whatsapp_number,
        gender: k.gender,
        loggedIn,
      });
    }
  }

  for (const r of rows) {
    const p = pengajarById.get(r.pengajarId);
    result.set(r.pengajarId, {
      pengajarId: r.pengajarId,
      pengajarWa: p?.whatsapp_number ?? null,
      pengajarGender: p?.gender ?? null,
      halaqah: r.halaqahIds.map((hid) => {
        const k = ketuaByHalaqah.get(hid);
        return {
          halaqahId: hid,
          halaqahName: halaqahName.get(hid) ?? '—',
          ketuaNama: k?.nama ?? null,
          ketuaWa: k?.wa ?? null,
          ketuaGender: k?.gender ?? null,
          ketuaLoggedIn: k?.loggedIn ?? false,
        };
      }),
    });
  }
  return result;
}
