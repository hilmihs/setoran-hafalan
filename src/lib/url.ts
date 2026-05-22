/**
 * Helper origin & absolute URL untuk app.
 *
 * Mengandalkan NEXT_PUBLIC_APP_URL. Kalau env miss-config, fallback ke
 * domain produksi supaya link WA tidak pernah berisi `localhost`/kosong.
 */
const PROD_FALLBACK = 'https://maahir.muhajirproject.org';

export function appOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '').trim();
  if (!fromEnv) return PROD_FALLBACK;
  // Hindari fallback ke localhost untuk link yang dikirim via WhatsApp
  // (peserta/musyrif buka di HP, bukan di mesin developer).
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(fromEnv)) {
    return PROD_FALLBACK;
  }
  return fromEnv;
}

export function absUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${appOrigin()}${p}`;
}
