'use client';
import { usePathname, useRouter } from 'next/navigation';

export interface BulanOption {
  value: string;   // 'YYYY-MM'
  label: string;   // 'Agustus 2026'
}

interface Props {
  bulan: string | null;                 // null = semua periode
  bulanOptions: BulanOption[];
  gender: 'ikhwan' | 'akhwat';
  /** Superadmin boleh lintas-gender; koordinator biasa terkunci ke gendernya. */
  showGender: boolean;
}

export function KajianFilterBar({ bulan, bulanOptions, gender, showGender }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function href(overrides: Partial<{ bulan: string; gender: string }>) {
    const params = new URLSearchParams();
    const nextBulan = overrides.bulan !== undefined ? overrides.bulan : bulan ?? '';
    const nextGender = overrides.gender !== undefined ? overrides.gender : showGender ? gender : '';
    if (nextBulan) params.set('bulan', nextBulan);
    if (nextGender) params.set('gender', nextGender);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showGender && (
        <div className="flex gap-1">
          <a
            href={href({ gender: 'ikhwan' })}
            className={`px-3 py-1 rounded border text-sm no-underline ${gender === 'ikhwan' ? 'bg-emerald-600 text-white border-emerald-600' : 'text-gray-700'}`}
          >
            Ikhwan
          </a>
          <a
            href={href({ gender: 'akhwat' })}
            className={`px-3 py-1 rounded border text-sm no-underline ${gender === 'akhwat' ? 'bg-emerald-600 text-white border-emerald-600' : 'text-gray-700'}`}
          >
            Akhwat
          </a>
        </div>
      )}
      <label className="text-sm text-gray-600">
        Bulan{' '}
        <select
          value={bulan ?? ''}
          onChange={(e) => router.push(href({ bulan: e.target.value }))}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">Semua periode</option>
          {bulanOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
