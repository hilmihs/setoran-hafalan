// Semua perhitungan pekan pakai timezone Asia/Jakarta untuk konsistensi
// dengan helper SQL `week_start_of()` di database.

const TZ = 'Asia/Jakarta';

/**
 * Konversi Date ke ISO date string (YYYY-MM-DD) di timezone Jakarta.
 */
function toJakartaDateString(d: Date): string {
  // sv-SE locale memberikan format YYYY-MM-DD
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

/**
 * Hitung Senin dari tanggal apa pun (di timezone Jakarta).
 * Senin = awal pekan (ISO 8601).
 */
export function weekStartOf(d: Date = new Date()): string {
  // Ambil komponen tanggal di TZ Jakarta
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);

  const year = parseInt(parts.find((p) => p.type === 'year')!.value);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value);
  const day = parseInt(parts.find((p) => p.type === 'day')!.value);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;

  // Map: Mon=0, Tue=1, ..., Sun=6
  const dayOffset: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const offset = dayOffset[weekday] ?? 0;

  // Bikin UTC date dari komponen Jakarta, lalu kurangi offset hari
  const dateUTC = new Date(Date.UTC(year, month - 1, day));
  dateUTC.setUTCDate(dateUTC.getUTCDate() - offset);

  return toJakartaDateString(dateUTC);
}

/**
 * Pekan berjalan saat ini.
 */
export function currentWeekStart(): string {
  return weekStartOf(new Date());
}

/**
 * Generate label pekan untuk tampilan UI, mis: "5–11 Mei 2026"
 */
export function formatWeekRange(weekStartISO: string): string {
  const [y, m, d] = weekStartISO.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const fmt = (dt: Date) =>
    dt.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  const year = end.toLocaleDateString('id-ID', {
    year: 'numeric',
    timeZone: 'UTC',
  });

  return `${fmt(start)} – ${fmt(end)} ${year}`;
}

/**
 * Pekan-pekan sebelum pekan berjalan (untuk riwayat di dashboard).
 */
export function previousWeeks(count: number): string[] {
  const current = currentWeekStart();
  const [y, m, d] = current.split('-').map(Number);
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 7 * i);
    result.push(toJakartaDateString(dt));
  }
  return result;
}
