'use client';

const SCORES = [0, 1, 2, 3, 4] as const;

/**
 * Pemilih skor 0–4 segmented pill (target sentuh ≥40px, color-scale merah→hijau,
 * keyboard 0–4 / panah saat fokus). Dipakai di Penilaian Peserta & Pedagogis.
 * Klik nilai yang sama → batal (null).
 */
export function ScoreSelector({
  value,
  onChange,
  label,
  titles,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  /** Tooltip per skala (index 0–4), mis. panduan standar. */
  titles?: string[];
}) {
  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const k = e.key;
    if (k >= '0' && k <= '4') {
      e.preventDefault();
      const n = Number(k);
      onChange(value === n ? null : n);
    } else if (k === 'ArrowRight' || k === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(4, (value ?? -1) + 1));
    } else if (k === 'ArrowLeft' || k === 'ArrowDown') {
      e.preventDefault();
      const next = (value ?? 5) - 1;
      onChange(next < 0 ? null : next);
    } else if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      onChange(null);
    }
  }
  return (
    <div className="score-seg" role="radiogroup" aria-label={label} tabIndex={0} onKeyDown={handleKey}>
      {SCORES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          tabIndex={-1}
          data-v={s}
          title={titles?.[s]}
          className={`score-pill${value === s ? ' on' : ''}`}
          onClick={() => onChange(value === s ? null : s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
