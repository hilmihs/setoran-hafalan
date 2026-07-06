'use client';

import { useState } from 'react';
import {
  INDIKATOR_BY_KATEGORI,
  KATEGORI_LABEL,
  KATEGORI_STANDAR,
  type Kategori,
} from '@/lib/matrix-indicators';
import type { MatrixTableRow } from '@/components/MatrixTable';

const KAT_ORDER: Kategori[] = ['hard', 'pedagogis', 'soft'];
const KAT_ACCENT: Record<Kategori, string> = {
  hard: 'var(--accent)',
  pedagogis: 'oklch(0.58 0.12 280)',
  soft: 'oklch(0.62 0.11 25)',
};
const KAT_AVG_KEY: Record<Kategori, 'hard' | 'pedagogis' | 'soft'> = {
  hard: 'hard',
  pedagogis: 'pedagogis',
  soft: 'soft',
};

type Count = { terpenuhi: number; belum: number; tanpaData: number };

function tally(values: (number | null | undefined)[], standar: number): Count {
  const c: Count = { terpenuhi: 0, belum: 0, tanpaData: 0 };
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) c.tanpaData++;
    else if (v >= standar) c.terpenuhi++;
    else c.belum++;
  }
  return c;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Bar tri-warna: hijau (terpenuhi) · merah (belum) · abu (tanpa data). */
function Bar({ c }: { c: Count }) {
  const total = c.terpenuhi + c.belum + c.tanpaData;
  const seg = (n: number, color: string) =>
    n > 0 ? <span style={{ width: `${(n / total) * 100}%`, background: color, display: 'block' }} /> : null;
  return (
    <div
      style={{
        display: 'flex',
        height: 8,
        borderRadius: 999,
        overflow: 'hidden',
        background: 'var(--surface-3)',
      }}
    >
      {seg(c.terpenuhi, 'var(--hijau-ink)')}
      {seg(c.belum, 'var(--merah-ink)')}
      {seg(c.tanpaData, 'var(--muted-2)')}
    </div>
  );
}

export function MatrixRekapAspek({ rows }: { rows: MatrixTableRow[] }) {
  const [open, setOpen] = useState(true);
  const total = rows.length;

  return (
    <div className="card-flat" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 className="t-h3" style={{ marginBottom: 2 }}>Rekap Pemenuhan Aspek</h2>
          <p className="t-tiny" style={{ color: 'var(--muted)' }}>
            {total} pengajar dinilai · terpenuhi = skor ≥ standar
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ height: 32 }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Sembunyikan indikator' : 'Rincian indikator'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {KAT_ORDER.map((kat) => {
          const standar = KATEGORI_STANDAR[kat];
          const avgKey = KAT_AVG_KEY[kat];
          const aspekCount = tally(rows.map((r) => r[avgKey]), standar);
          const indikator = INDIKATOR_BY_KATEGORI[kat];

          return (
            <div key={kat} style={{ borderLeft: `3px solid ${KAT_ACCENT[kat]}`, paddingLeft: 12 }}>
              {/* Header aspek */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span className="t-small" style={{ fontWeight: 600 }}>{KATEGORI_LABEL[kat]}</span>
                <span className="t-tiny t-mono" style={{ color: 'var(--muted)' }}>
                  <span style={{ color: 'var(--hijau-ink)', fontWeight: 700 }}>{aspekCount.terpenuhi}</span>
                  /{total} terpenuhi · {pct(aspekCount.terpenuhi, total)}%
                </span>
              </div>
              <Bar c={aspekCount} />
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                {aspekCount.belum} belum · {aspekCount.tanpaData} tanpa data · standar rata-rata ≥ {standar}
              </p>

              {/* Rincian indikator */}
              {open && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10, paddingLeft: 4 }}>
                  {indikator.map((ind) => {
                    const c = tally(rows.map((r) => r.scores[ind.key]), ind.standar);
                    return (
                      <div key={ind.key} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                            <span className="t-tiny">{ind.label} <span style={{ color: 'var(--muted-2)' }}>(≥{ind.standar})</span></span>
                            <span className="t-tiny t-mono" style={{ color: 'var(--muted)' }}>
                              <span style={{ color: 'var(--hijau-ink)', fontWeight: 700 }}>{c.terpenuhi}</span>
                              {c.belum > 0 && <span style={{ color: 'var(--merah-ink)' }}> · {c.belum}✕</span>}
                              {c.tanpaData > 0 && <span style={{ color: 'var(--muted-2)' }}> · {c.tanpaData}–</span>}
                            </span>
                          </div>
                          <div style={{ marginTop: 3 }}><Bar c={c} /></div>
                        </div>
                        <div className="t-tiny t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                          {pct(c.terpenuhi, total)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
