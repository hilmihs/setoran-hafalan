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
