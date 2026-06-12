'use client';

import { useCallback, useRef, useState } from 'react';

type PenilaianRow = {
  skor_bacaan: number | null;
  ket_bacaan: string | null;
  skor_hafalan: number | null;
  ket_hafalan: string | null;
  assessor_role: string | null;
};

type PesertaItem = {
  id: string;
  name: string;
  gender: 'ikhwan' | 'akhwat';
  kelas_id: string;
  kelas: { id: string; name: string } | null;
  penilaian: PenilaianRow | null;
};

type RowState = {
  skor_bacaan: number | null;
  ket_bacaan: string;
  skor_hafalan: number | null;
  ket_hafalan: string;
  status: 'idle' | 'saving' | 'saved' | 'error';
  error?: string;
};

const SCORES = [0, 1, 2, 3, 4] as const;

export function PenilaianPesertaForm({
  pesertaList,
  yearMonth,
  assessorRole,
}: {
  pesertaList: PesertaItem[];
  yearMonth: string;
  assessorRole: 'koordinator' | 'syaikh';
}) {
  const initialRows = (): Record<string, RowState> => {
    const out: Record<string, RowState> = {};
    for (const p of pesertaList) {
      out[p.id] = {
        skor_bacaan: p.penilaian?.skor_bacaan ?? null,
        ket_bacaan: p.penilaian?.ket_bacaan ?? '',
        skor_hafalan: p.penilaian?.skor_hafalan ?? null,
        ket_hafalan: p.penilaian?.ket_hafalan ?? '',
        status: p.penilaian ? 'saved' : 'idle',
      };
    }
    return out;
  };

  const [rows, setRows] = useState<Record<string, RowState>>(initialRows);
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const save = useCallback(async (pesertaId: string, state: RowState) => {
    setRows((prev) => ({ ...prev, [pesertaId]: { ...prev[pesertaId], status: 'saving' } }));
    try {
      const res = await fetch('/api/2in1/penilaian/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peserta_id: pesertaId,
          year_month: yearMonth,
          skor_bacaan: state.skor_bacaan,
          ket_bacaan: state.ket_bacaan || null,
          skor_hafalan: state.skor_hafalan,
          ket_hafalan: state.ket_hafalan || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      setRows((prev) => ({ ...prev, [pesertaId]: { ...prev[pesertaId], status: 'saved', error: undefined } }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal simpan';
      setRows((prev) => ({ ...prev, [pesertaId]: { ...prev[pesertaId], status: 'error', error: msg } }));
    }
  }, [yearMonth]);

  function scheduleAutoSave(pesertaId: string, newState: RowState) {
    if (debounceRefs.current[pesertaId]) clearTimeout(debounceRefs.current[pesertaId]);
    debounceRefs.current[pesertaId] = setTimeout(() => {
      save(pesertaId, newState);
    }, 800);
  }

  function updateRow(pesertaId: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const next = { ...prev[pesertaId], ...patch, status: 'idle' as const };
      scheduleAutoSave(pesertaId, next);
      return { ...prev, [pesertaId]: next };
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 120px 28px',
        gap: 6,
        padding: '4px 8px',
        fontSize: 10,
        color: 'var(--muted-2)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        <div>Nama</div>
        <div>Bacaan (0–4)</div>
        <div>Hafalan (0–4)</div>
        <div></div>
      </div>

      {pesertaList.map((p) => {
        const row = rows[p.id];
        return (
          <div key={p.id} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 120px 120px 28px',
            gap: 6,
            padding: '8px',
            background: 'var(--bg-card)',
            borderRadius: 8,
            alignItems: 'start',
          }}>
            {/* Nama + kelas */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
              {p.kelas && (
                <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{p.kelas.name}</div>
              )}
            </div>

            {/* Skor bacaan */}
            <div>
              <ScoreSelector
                value={row.skor_bacaan}
                onChange={(v) => updateRow(p.id, { skor_bacaan: v })}
              />
              <input
                type="text"
                placeholder="catatan..."
                value={row.ket_bacaan}
                onChange={(e) => updateRow(p.id, { ket_bacaan: e.target.value })}
                style={{
                  marginTop: 4,
                  width: '100%',
                  fontSize: 11,
                  padding: '3px 6px',
                  background: 'var(--bg-input, #f5f5f5)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                }}
              />
            </div>

            {/* Skor hafalan */}
            <div>
              <ScoreSelector
                value={row.skor_hafalan}
                onChange={(v) => updateRow(p.id, { skor_hafalan: v })}
              />
              <input
                type="text"
                placeholder="catatan..."
                value={row.ket_hafalan}
                onChange={(e) => updateRow(p.id, { ket_hafalan: e.target.value })}
                style={{
                  marginTop: 4,
                  width: '100%',
                  fontSize: 11,
                  padding: '3px 6px',
                  background: 'var(--bg-input, #f5f5f5)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                }}
              />
            </div>

            {/* Status indicator */}
            <div style={{ paddingTop: 6, textAlign: 'center', fontSize: 13 }}>
              {row.status === 'saving' && <span style={{ color: 'var(--muted-2)' }}>⟳</span>}
              {row.status === 'saved' && <span style={{ color: 'var(--hijau-ink)' }}>✓</span>}
              {row.status === 'error' && (
                <span title={row.error} style={{ color: 'var(--merah-ink)', cursor: 'help' }}>✗</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {SCORES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(value === s ? null : s)}
          style={{
            flex: 1,
            padding: '3px 0',
            fontSize: 12,
            fontWeight: value === s ? 700 : 400,
            background: value === s ? scoreBg(s) : 'var(--bg-input, #f0f0f0)',
            color: value === s ? scoreColor(s) : 'var(--muted-2)',
            border: value === s ? `1.5px solid ${scoreBorder(s)}` : '1.5px solid transparent',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'all 0.1s',
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function scoreBg(s: number): string {
  if (s >= 4) return 'var(--hijau-bg, #e8f5e9)';
  if (s === 3) return 'var(--hijau-bg, #f1f8e9)';
  if (s === 2) return 'var(--kuning-bg, #fff9c4)';
  if (s === 1) return '#ffe8d6';
  return 'var(--merah-bg, #ffebee)';
}

function scoreColor(s: number): string {
  if (s >= 3) return 'var(--hijau-ink, #2e7d32)';
  if (s === 2) return 'var(--kuning-ink, #f57f17)';
  return 'var(--merah-ink, #c62828)';
}

function scoreBorder(s: number): string {
  if (s >= 3) return 'var(--hijau, #4caf50)';
  if (s === 2) return 'var(--kuning, #ffc107)';
  return 'var(--merah, #f44336)';
}
