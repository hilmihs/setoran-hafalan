import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskFactor {
  name: string;
  weight: number;
  points: number;
  detail: string;
}

export interface RiskResult {
  score: number; // 0-100
  level: RiskLevel;
  factors: RiskFactor[];
}

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

function previousYearMonth(offset: number): string {
  const now = new Date();
  now.setMonth(now.getMonth() - offset);
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

/**
 * On-demand risk computation untuk satu pengajar. Pakai React cache supaya
 * pengajar yang sama tidak ulang-query dalam satu request.
 *
 * Faktor & bobot:
 *   1. Teguran kumulatif (40pt). 0→0, 1→10, 2→25, 3→40, 4+→40.
 *   2. Trend kehadiran turun (20pt). Bulan ini < bulan lalu.
 *   3. Tabayyun bukan-udzur 3 bulan terakhir (20pt). 0→0, 1→10, 2+→20.
 *   4. Matrix rata-rata bulan terakhir < 3.0 (20pt).
 *
 * Level: <30 low, 30-60 medium, >60 high.
 */
export const computeRiskPengajar = cache(async (pengajarId: string): Promise<RiskResult> => {
  const ym = currentYearMonth();
  const ymPrev = previousYearMonth(1);
  const threeMonthsAgo = previousYearMonth(3);

  const [
    { data: matrixNow },
    { data: checkinsAll },
    { data: tabayyunRecent },
  ] = await Promise.all([
    supabaseAdmin
      .from('matrix_rekap')
      .select('total_teguran_kumulatif, rata_rata_keseluruhan, year_month')
      .eq('pengajar_id', pengajarId)
      .order('year_month', { ascending: false })
      .limit(1),
    supabaseAdmin
      .from('checkin_pengajar')
      .select('tanggal, status')
      .eq('pengajar_id', pengajarId)
      .is('invalidated_at', null)
      .gte('tanggal', `${ymPrev}-01`),
    supabaseAdmin
      .from('tabayyun')
      .select('is_udzur_syari, decided_at, status')
      .eq('pengajar_id', pengajarId)
      .eq('status', 'decided')
      .gte('decided_at', `${threeMonthsAgo}-01`),
  ]);

  const m = matrixNow?.[0];
  const teguranKum = m?.total_teguran_kumulatif ?? 0;
  const rataMatrix = m?.rata_rata_keseluruhan != null ? Number(m.rata_rata_keseluruhan) : null;

  // Factor 1: teguran
  const teguranPts = teguranKum === 0 ? 0 : teguranKum === 1 ? 10 : teguranKum === 2 ? 25 : 40;

  // Factor 2: kehadiran trend
  const ymHadirNow = (checkinsAll ?? []).filter((c) => c.tanggal.startsWith(ym) && c.status === 'hadir').length;
  const ymTotalNow = (checkinsAll ?? []).filter((c) => c.tanggal.startsWith(ym)).length;
  const ymHadirPrev = (checkinsAll ?? []).filter((c) => c.tanggal.startsWith(ymPrev) && c.status === 'hadir').length;
  const ymTotalPrev = (checkinsAll ?? []).filter((c) => c.tanggal.startsWith(ymPrev)).length;
  const pctNow = ymTotalNow > 0 ? ymHadirNow / ymTotalNow : null;
  const pctPrev = ymTotalPrev > 0 ? ymHadirPrev / ymTotalPrev : null;
  let kehadiranPts = 0;
  let kehadiranDetail = 'tidak ada data';
  if (pctNow != null && pctPrev != null) {
    const delta = pctNow - pctPrev;
    if (delta < -0.15) kehadiranPts = 20;
    else if (delta < -0.05) kehadiranPts = 10;
    kehadiranDetail = `bulan ini ${Math.round(pctNow * 100)}% vs bulan lalu ${Math.round(pctPrev * 100)}%`;
  }

  // Factor 3: tabayyun bukan udzur
  const bukanUdzur = (tabayyunRecent ?? []).filter((t) => t.is_udzur_syari === false).length;
  const tabPts = bukanUdzur === 0 ? 0 : bukanUdzur === 1 ? 10 : 20;

  // Factor 4: matrix di bawah standar
  let matrixPts = 0;
  if (rataMatrix != null && rataMatrix < 3.0) matrixPts = 20;
  else if (rataMatrix != null && rataMatrix < 3.5) matrixPts = 10;

  const factors: RiskFactor[] = [
    {
      name: 'Teguran kumulatif',
      weight: 40,
      points: teguranPts,
      detail: `${teguranKum} teguran (${teguranKum >= 3 ? 'kritis — sisa ' + (4 - teguranKum) + ' lagi → nonaktif' : 'aman'})`,
    },
    { name: 'Trend kehadiran', weight: 20, points: kehadiranPts, detail: kehadiranDetail },
    {
      name: 'Tabayyun bukan udzur',
      weight: 20,
      points: tabPts,
      detail: `${bukanUdzur} kejadian dalam 3 bulan terakhir`,
    },
    {
      name: 'Rata-rata matrix',
      weight: 20,
      points: matrixPts,
      detail: rataMatrix != null ? `${rataMatrix.toFixed(2)} / 4` : 'belum ada data',
    },
  ];

  const score = factors.reduce((s, f) => s + f.points, 0);
  const level: RiskLevel = score < 30 ? 'low' : score < 60 ? 'medium' : 'high';

  return { score, level, factors };
});

export function levelColor(level: RiskLevel): string {
  if (level === 'high') return 'var(--merah-ink)';
  if (level === 'medium') return 'var(--kuning-ink)';
  return 'var(--hijau-ink)';
}

export function levelLabel(level: RiskLevel): string {
  if (level === 'high') return 'Tinggi';
  if (level === 'medium') return 'Sedang';
  return 'Rendah';
}
