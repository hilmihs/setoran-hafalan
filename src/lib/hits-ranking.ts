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
