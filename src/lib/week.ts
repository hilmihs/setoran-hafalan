// Cycle 2-pekan. Anchor: 2026-06-01 (Senin) — selaras dengan SQL fungsi
// `cycle_start_of()`. Semua perhitungan di timezone Asia/Jakarta.

const TZ = 'Asia/Jakarta';

export const CYCLE_LENGTH_DAYS = 14;
export const CYCLE_ANCHOR = '2026-06-01'; // Senin

function toJakartaDateString(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

function jakartaYMD(d: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  return {
    y: parseInt(parts.find((p) => p.type === 'year')!.value),
    m: parseInt(parts.find((p) => p.type === 'month')!.value),
    d: parseInt(parts.find((p) => p.type === 'day')!.value),
  };
}

/**
 * Awal cycle 2-pekan dari tanggal manapun (Senin).
 * Diturunkan dari anchor 2026-06-01 dengan floor 14 hari.
 */
export function cycleStartOf(d: Date = new Date()): string {
  const { y, m, d: day } = jakartaYMD(d);
  const dateUTC = new Date(Date.UTC(y, m - 1, day));
  const [ay, am, ad] = CYCLE_ANCHOR.split('-').map(Number);
  const anchorUTC = new Date(Date.UTC(ay, am - 1, ad));
  const diffDays = Math.floor((dateUTC.getTime() - anchorUTC.getTime()) / (1000 * 60 * 60 * 24));
  const cycleOffset = Math.floor(diffDays / CYCLE_LENGTH_DAYS) * CYCLE_LENGTH_DAYS;
  const result = new Date(anchorUTC);
  result.setUTCDate(result.getUTCDate() + cycleOffset);
  return toJakartaDateString(result);
}

/**
 * Awal cycle 2-pekan yang sedang berjalan.
 */
export function currentCycleStart(): string {
  return cycleStartOf(new Date());
}

/**
 * Tanggal terakhir cycle (cycle_start + 13 hari). Dipakai untuk menentukan
 * bulan rekap (cycle masuk ke bulan dimana cycle_end jatuh).
 */
export function cycleEndOf(cycleStartISO: string): string {
  const [y, m, d] = cycleStartISO.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d));
  end.setUTCDate(end.getUTCDate() + (CYCLE_LENGTH_DAYS - 1));
  return toJakartaDateString(end);
}

/**
 * Label cycle untuk UI, mis: "1 – 14 Juni 2026" atau lintas-bulan
 * "29 Juni – 12 Juli 2026".
 */
export function formatCycleRange(cycleStartISO: string): string {
  const [y, m, d] = cycleStartISO.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (CYCLE_LENGTH_DAYS - 1));

  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();

  const fmtDayMonth = (dt: Date) =>
    dt.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  const fmtDay = (dt: Date) =>
    dt.toLocaleDateString('id-ID', { day: 'numeric', timeZone: 'UTC' });
  const year = end.toLocaleDateString('id-ID', { year: 'numeric', timeZone: 'UTC' });

  if (sameMonth) {
    return `${fmtDay(start)} – ${fmtDayMonth(end)} ${year}`;
  }
  return `${fmtDayMonth(start)} – ${fmtDayMonth(end)} ${year}`;
}

/**
 * Label rentang cycle tanpa tahun, mis: "1 – 14 Juni" atau lintas-bulan
 * "29 Juni – 12 Juli". Dipakai untuk tag "Periode …" di header.
 */
export function formatCycleRangeShort(cycleStartISO: string): string {
  const [y, m, d] = cycleStartISO.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (CYCLE_LENGTH_DAYS - 1));
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();
  const fmtDayMonth = (dt: Date) =>
    dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fmtDay = (dt: Date) => dt.toLocaleDateString('id-ID', { day: 'numeric', timeZone: 'UTC' });
  if (sameMonth) return `${fmtDay(start)} – ${fmtDayMonth(end)}`;
  return `${fmtDayMonth(start)} – ${fmtDayMonth(end)}`;
}

/**
 * Label deadline cycle untuk pesan WA, mis: "Ahad, 14 Juni 2026".
 * Cycle berakhir selalu hari Ahad (start = Senin + 13 hari); prefiks
 * "Ahad," ditulis literal karena `weekday: 'long'` id-ID memunculkan
 * "Minggu", bukan diksi pesantren yang dipakai di template lama.
 */
export function formatCycleDeadline(cycleStartISO: string): string {
  const endISO = cycleEndOf(cycleStartISO);
  const [y, m, d] = endISO.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d));
  const tanggal = end.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Ahad, ${tanggal}`;
}

/**
 * Cycle-cycle sebelum cycle berjalan (untuk dropdown riwayat).
 */
export function previousCycles(count: number): string[] {
  const current = currentCycleStart();
  const [y, m, d] = current.split('-').map(Number);
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - CYCLE_LENGTH_DAYS * i);
    result.push(toJakartaDateString(dt));
  }
  return result;
}

/**
 * Semua cycle start dari anchor (2026-06-01) s/d cycle berjalan, inklusif.
 * Urut menaik (terlama → terbaru). Dipakai untuk riwayat & deteksi periode
 * terlewat di POV peserta.
 */
export function allCyclesSinceAnchor(): string[] {
  const current = currentCycleStart();
  const [ay, am, ad] = CYCLE_ANCHOR.split('-').map(Number);
  const anchorUTC = new Date(Date.UTC(ay, am - 1, ad));
  const result: string[] = [];
  for (let i = 0; ; i++) {
    const dt = new Date(anchorUTC);
    dt.setUTCDate(dt.getUTCDate() + CYCLE_LENGTH_DAYS * i);
    const iso = toJakartaDateString(dt);
    result.push(iso);
    if (iso >= current) break;
  }
  return result;
}

/**
 * Validasi cycle start untuk backfill: harus benar-benar awal cycle, tidak
 * sebelum anchor, dan tidak di masa depan (≤ cycle berjalan).
 */
export function isValidCycleStart(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (cycleStartOf(new Date(Date.UTC(y, m - 1, d))) !== s) return false;
  return s >= CYCLE_ANCHOR && s <= currentCycleStart();
}

/**
 * Dua cycle dalam bulan kalender tertentu.
 * H1 = cycle yang mengandung hari ke-1 bulan,
 * H2 = cycle berikutnya (+14 hari).
 */
export function cyclesOfMonth(year: number, month: number): [string, string] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const h1 = cycleStartOf(firstDay);
  const [hy, hm, hd] = h1.split('-').map(Number);
  const h2 = new Date(Date.UTC(hy, hm - 1, hd + CYCLE_LENGTH_DAYS));
  return [h1, toJakartaDateString(h2)];
}

/**
 * Tahun dan bulan berjalan di timezone Jakarta.
 */
export function currentYearMonth(): { year: number; month: number; label: string } {
  const now = new Date();
  const str = now.toLocaleDateString('id-ID', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
  });
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return {
    year: parseInt(parts.find((p) => p.type === 'year')!.value),
    month: parseInt(parts.find((p) => p.type === 'month')!.value),
    label: str,
  };
}

// ---------- Backward-compat aliases ----------
// Beberapa modul lama masih mungkin di-import sebelum semua callsite
// di-refactor; alias ini memetakan API lama → API cycle baru supaya
// build tidak break secara tiba-tiba.
export const weekStartOf = cycleStartOf;
export const currentWeekStart = currentCycleStart;
export const formatWeekRange = formatCycleRange;
export const previousWeeks = previousCycles;
