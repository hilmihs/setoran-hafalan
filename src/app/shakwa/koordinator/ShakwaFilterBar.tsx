'use client';

import { useRouter, usePathname } from 'next/navigation';

interface Props {
  current: {
    status: string | null;
    pelapor: string | null;
  };
}

export function ShakwaFilterBar({ current }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function buildHref(overrides: Partial<{ status: string; pelapor: string }>) {
    const params = new URLSearchParams();
    const s = overrides.status !== undefined ? overrides.status : current.status ?? '';
    const p = overrides.pelapor !== undefined ? overrides.pelapor : current.pelapor ?? '';
    if (s) params.set('status', s);
    if (p) params.set('pelapor', p);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="filter-bar">
      <select
        value={current.status ?? ''}
        onChange={(e) => router.push(buildHref({ status: e.target.value }))}
        className="chip-select"
      >
        <option value="">Semua status</option>
        <option value="submitted">Baru</option>
        <option value="in_review">Ditinjau</option>
        <option value="resolved">Selesai</option>
        <option value="closed">Ditutup</option>
      </select>
      <select
        value={current.pelapor ?? ''}
        onChange={(e) => router.push(buildHref({ pelapor: e.target.value }))}
        className="chip-select"
      >
        <option value="">Semua pelapor</option>
        <option value="pengajar">Pengajar</option>
        <option value="peserta">Peserta</option>
      </select>
      <span className="grow" />
      <button
        type="button"
        className="act-btn"
        onClick={() => router.push(pathname)}
      >
        Reset
      </button>
    </div>
  );
}
