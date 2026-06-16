'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Dropdown periode (bulan) generik — push `?month=YYYY-MM` sambil mempertahankan
 * query lain. Dipakai untuk navigasi bulan di dashboard pedagogis.
 */
export function MonthNavSelect({
  options,
  value,
  hash,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  hash?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('month', e.target.value);
    router.push(`?${params.toString()}${hash ? `#${hash}` : ''}`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label="Pilih bulan">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Helper: opsi bulan dari `start` (YYYY-MM) s/d bulan berjalan (Asia/Jakarta), terbaru dulu. */
export function monthOptionsSince(start: string): Array<{ value: string; label: string }> {
  const now = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const [sy, sm] = start.split('-').map(Number);
  const [ny, nm] = now.split('-').map(Number);
  const out: Array<{ value: string; label: string }> = [];
  let y = sy, m = sm;
  while (y < ny || (y === ny && m <= nm)) {
    const value = `${y}-${String(m).padStart(2, '0')}`;
    out.push({
      value,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}
