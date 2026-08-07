// Data Ranking Disiplin Pengajar untuk koordinator ketua kelas.
//
// Diangkat dari halaman /hits/koordinator supaya halaman itu, export XLSX, dan
// halaman cetak menarik dari SATU tempat — kalau resolusi periodenya berbeda
// sedikit saja, angka di layar dan di file tak akan cocok dan koordinator tak
// punya cara menebak mana yang benar.

import { getDisiplinRanking, getInsidenDetailByPengajar, type DisiplinRankRow, type InsidenDetail } from '@/lib/hits-ranking';
import { getCakupanObservasi, type CakupanPengajar } from '@/lib/hits-observasi-cakupan';
import { weekBounds, formatWeekRangeShort } from '@/lib/week';
import type { Gender } from '@/types/db';

export type HitsMode = 'bulan' | 'minggu';

export type HitsKoordinatorRekap = {
  mode: HitsMode;
  start: string; // inklusif
  end: string; // eksklusif
  periodeLabel: string;
  genderLabel: string;
  gender?: Gender;
  /** Pengajar yang punya %KBBS (rank terisi), urut ranking. */
  ranked: DisiplinRankRow[];
  /** Pengajar tanpa data pertemuan pada periode ini. */
  noData: DisiplinRankRow[];
  insidenByPengajar: Map<string, InsidenDetail[]>;
  cakupanByPengajar: Map<string, CakupanPengajar>;
};

/** Rentang [start, end) untuk mode bulan: kalender penuh, bukan window 28–27. */
export function rentangBulan(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  return {
    start: `${month}-01`,
    end: m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`,
  };
}

export async function getHitsKoordinatorRekap(opts: {
  mode: HitsMode;
  month: string; // 'YYYY-MM' (dipakai bila mode=bulan)
  week: string; // 'YYYY-MM-DD' Senin (dipakai bila mode=minggu)
  gender?: Gender;
}): Promise<HitsKoordinatorRekap> {
  const { mode, month, week, gender } = opts;
  const { start, end } =
    mode === 'minggu' ? weekBounds(week) : rentangBulan(month);
  const periodeLabel = mode === 'minggu' ? formatWeekRangeShort(week) : month;

  const rows = await getDisiplinRanking({ start, end, gender });
  const insidenByPengajar = await getInsidenDetailByPengajar({ start, end, gender });
  const cakupanByPengajar = await getCakupanObservasi({ start, end, gender });

  return {
    mode,
    start,
    end,
    periodeLabel,
    genderLabel: gender === 'ikhwan' ? 'Ikhwan' : gender === 'akhwat' ? 'Akhwat' : 'Ikhwan & Akhwat',
    gender,
    ranked: rows.filter((r) => r.rank !== null),
    noData: rows.filter((r) => r.rank === null),
    insidenByPengajar,
    cakupanByPengajar,
  };
}
