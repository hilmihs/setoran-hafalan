// Single source of truth untuk Evaluasi Halaqah: taksonomi Lahn, skor, tier.
// Aman diimpor dari client & server (tanpa dependensi Node).

export type LahnGroup = 'jaliy' | 'khafiy';
export interface LahnDef {
  key: string;      // key runtime (mis. 'idghammimi')
  label: string;    // label UI (mis. 'JK. Idgham Mimi & Ghunnah')
  group: LahnGroup;
  column: string;   // kolom DB (mis. 'kh_idgham_mimi')
}

export const JALIY: LahnDef[] = [
  { key: 'huruf',   label: 'JK. Huruf',   group: 'jaliy', column: 'jk_huruf' },
  { key: 'harakat', label: 'JK. Harakat', group: 'jaliy', column: 'jk_harakat' },
  { key: 'mad',     label: 'JK. Mad',     group: 'jaliy', column: 'jk_mad' },
  { key: 'tasydid', label: 'JK. Tasydid', group: 'jaliy', column: 'jk_tasydid' },
];

export const KHAFIY: LahnDef[] = [
  { key: 'izhar',             label: 'JK. Izhar',                  group: 'khafiy', column: 'kh_izhar' },
  { key: 'idghambighunnah',   label: 'JK. Idgham Bighunnah',       group: 'khafiy', column: 'kh_idgham_bighunnah' },
  { key: 'idghambilaghunnah', label: 'JK. Idgham Bilaghunnah',     group: 'khafiy', column: 'kh_idgham_bilaghunnah' },
  { key: 'idghammimi',        label: 'JK. Idgham Mimi & Ghunnah',  group: 'khafiy', column: 'kh_idgham_mimi' },
  { key: 'iqlab',             label: 'JK. Iqlab',                  group: 'khafiy', column: 'kh_iqlab' },
  { key: 'ikhfahakiki',       label: 'JK. Ikhfa Hakiki',           group: 'khafiy', column: 'kh_ikhfa_hakiki' },
  { key: 'ikhfasyafawi',      label: 'JK. Ikhfa Syafawi',          group: 'khafiy', column: 'kh_ikhfa_syafawi' },
];

export const ALL_LAHN: LahnDef[] = [...JALIY, ...KHAFIY];
export const LAHN_BY_KEY: Record<string, LahnDef> =
  Object.fromEntries(ALL_LAHN.map((d) => [d.key, d]));
export const LAHN_BY_COLUMN: Record<string, LahnDef> =
  Object.fromEntries(ALL_LAHN.map((d) => [d.column, d]));

export const AMBANG = 70;                // ambang standar global
export const AMBANG_UJIAN_DEFAULT = 65;  // default lulus Ujian Akhir (mockup)
export const JENIS = ['qn', 'pb', 'ujian'] as const;
export type Jenis = (typeof JENIS)[number];

export type LahnCounts = Record<string, number>;
export function emptyCounts(): LahnCounts {
  const c: LahnCounts = {};
  for (const d of ALL_LAHN) c[d.key] = 0;
  return c;
}
export function columnFor(key: string): string {
  const d = LAHN_BY_KEY[key];
  if (!d) throw new Error(`unknown lahn key: ${key}`);
  return d.column;
}

export interface Score { skor: number; jaliyCount: number; khafiyCount: number; }
export function scoreOf(counts: LahnCounts): Score {
  const j = JALIY.reduce((a, d) => a + (counts[d.key] || 0), 0);
  const kf = KHAFIY.reduce((a, d) => a + (counts[d.key] || 0), 0);
  return { skor: Math.max(0, 100 - j * 6 - kf * 2), jaliyCount: j, khafiyCount: kf };
}

export interface Tier { label: string; color: string; }
export function tierOf(skor: number): Tier {
  if (skor >= 90) return { label: 'Mumtaz', color: 'oklch(0.40 0.10 150)' };
  if (skor >= 70) return { label: 'Standar', color: 'oklch(0.40 0.10 150)' };
  if (skor >= 50) return { label: 'Cukup — di bawah standar', color: 'oklch(0.48 0.10 75)' };
  return { label: 'Perlu pengulangan', color: 'oklch(0.46 0.14 25)' };
}

export function initials(nama: string): string {
  return nama.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

// Konversi antara counts (keyed) dan kolom DB (kh_/jk_).
export function countsToColumns(counts: LahnCounts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of ALL_LAHN) out[d.column] = Math.max(0, counts[d.key] || 0);
  return out;
}
export function columnsToCounts(row: Record<string, unknown>): LahnCounts {
  const c = emptyCounts();
  for (const d of ALL_LAHN) c[d.key] = Number(row[d.column] || 0);
  return c;
}

// --- Geometri grafik tren rapor (port murni dari mockup buildTrack) ---
export interface TrackPoint { no: number; score: number | null; filled: boolean; cx: number; cy: number; }
export interface TrackGeometry {
  points: string;          // polyline points for filled sessions, '' if none
  sessions: TrackPoint[];  // one per history entry
  avg: number | null;      // rounded mean of filled, null if none
  trend: number;           // last filled − prev filled, 0 if <2 filled
  ambangY: number;         // y of the ambang(70) dashed line
  chartW: number; chartH: number; padX: number;
}

export function buildTrackGeometry(history: (number | null)[]): TrackGeometry {
  const W = 260, H = 92, padX = 16, padY = 12;
  const n = history.length;
  const denom = n > 1 ? n - 1 : 1;
  const xFor = (i: number) => padX + i * ((W - 2 * padX) / denom);
  const yFor = (score: number) => padY + (1 - score / 100) * (H - 2 * padY);

  const sessions: TrackPoint[] = history.map((v, i) => {
    const filled = v != null;
    return {
      no: i + 1,
      score: filled ? v : null,
      filled,
      cx: xFor(i),
      cy: filled ? yFor(v as number) : H - padY,
    };
  });

  const nums = sessions.filter((x) => x.filled).map((x) => x.score as number);
  const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  const trend = nums.length >= 2 ? nums[nums.length - 1] - nums[nums.length - 2] : 0;
  const points = sessions
    .filter((x) => x.filled)
    .map((x) => x.cx + ',' + x.cy.toFixed(1))
    .join(' ');

  return { points, sessions, avg, trend, ambangY: yFor(AMBANG), chartW: W, chartH: H, padX };
}
