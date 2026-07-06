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
  kbbs: number;
  nonLibur: number;
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
  // 40×13≈520 aman.
  const ketList = await fetchInChunks(
    halaqahIds,
    (chunk) =>
      supabaseAdmin
        .from('hits_keterangan_harian')
        .select('halaqah_id, kondisi')
        .gte('tanggal', opts.start)
        .lt('tanggal', opts.end)
        .in('halaqah_id', chunk),
    40
  );
  const agg = new Map<string, { kbbs: number; nonLibur: number }>();
  for (const k of ketList) {
    const pid = halaqahToPengajar.get(k.halaqah_id as string);
    if (!pid) continue;
    const a = agg.get(pid) ?? { kbbs: 0, nonLibur: 0 };
    if (k.kondisi !== 'LIBUR') a.nonLibur += 1;
    if (k.kondisi === 'KBBS') a.kbbs += 1;
    agg.set(pid, a);
  }

  // hutang kumulatif per halaqah (F2, bulk) → jumlah per pengajar
  const hutangMap = await computeHutangForHalaqahList(halaqahIds);

  const aggs: DisiplinAgg[] = [...meta.entries()].map(([pid, m]) => {
    const a = agg.get(pid) ?? { kbbs: 0, nonLibur: 0 };
    const hutang = m.halaqahIds.reduce((s, hid) => s + (hutangMap.get(hid)?.saldo ?? 0), 0);
    return {
      pengajarId: pid,
      pengajarNama: m.nama,
      gender: m.gender,
      halaqahCount: m.halaqahIds.length,
      kbbs: a.kbbs,
      nonLibur: a.nonLibur,
      hutangSaldo: hutang,
    };
  });
  return rankFromAggregates(aggs);
}
