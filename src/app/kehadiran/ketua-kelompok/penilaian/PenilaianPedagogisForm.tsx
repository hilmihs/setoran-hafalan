'use client';

import { useCallback, useRef, useState } from 'react';

const ASPECTS = [
  { key: 'metode', skorField: 'skor_metode_pengajaran', ketField: 'keterangan_metode', label: 'Metode Pengajaran' },
  { key: 'silabus', skorField: 'skor_kepatuhan_silabus', ketField: 'keterangan_silabus', label: 'Kepatuhan Silabus' },
  { key: 'halaqah', skorField: 'skor_manajemen_halaqah', ketField: 'keterangan_halaqah', label: 'Manajemen Halaqah' },
  { key: 'evaluasi', skorField: 'skor_evaluasi_penguasaan', ketField: 'keterangan_evaluasi', label: 'Evaluasi & Penguasaan' },
  { key: 'sop', skorField: 'skor_kepatuhan_sop', ketField: 'keterangan_sop', label: 'Kepatuhan SOP Teknis' },
] as const;

const SCORES = [0, 1, 2, 3, 4] as const;

type PenilaianData = {
  skor_metode_pengajaran: number | null;
  keterangan_metode: string | null;
  skor_kepatuhan_silabus: number | null;
  keterangan_silabus: string | null;
  skor_manajemen_halaqah: number | null;
  keterangan_halaqah: string | null;
  skor_evaluasi_penguasaan: number | null;
  keterangan_evaluasi: string | null;
  skor_kepatuhan_sop: number | null;
  keterangan_sop: string | null;
};

type Member = {
  id: string;
  name: string;
  penilaian: PenilaianData | null;
};

type RowState = PenilaianData & {
  status: 'idle' | 'saving' | 'saved' | 'error';
  error?: string;
};

const EMPTY: PenilaianData = {
  skor_metode_pengajaran: null,
  keterangan_metode: null,
  skor_kepatuhan_silabus: null,
  keterangan_silabus: null,
  skor_manajemen_halaqah: null,
  keterangan_halaqah: null,
  skor_evaluasi_penguasaan: null,
  keterangan_evaluasi: null,
  skor_kepatuhan_sop: null,
  keterangan_sop: null,
};

export function PenilaianPedagogisForm({
  members,
  yearMonth,
}: {
  members: Member[];
  yearMonth: string;
}) {
  const initialRows = (): Record<string, RowState> => {
    const out: Record<string, RowState> = {};
    for (const m of members) {
      out[m.id] = {
        ...(m.penilaian ?? EMPTY),
        status: m.penilaian ? 'saved' : 'idle',
      };
    }
    return out;
  };

  const [rows, setRows] = useState<Record<string, RowState>>(initialRows);
  const [expanded, setExpanded] = useState<string | null>(members[0]?.id ?? null);
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const save = useCallback(async (pengajarId: string, state: RowState) => {
    setRows((prev) => ({ ...prev, [pengajarId]: { ...prev[pengajarId], status: 'saving' } }));
    try {
      const res = await fetch('/api/penilaian-pedagogis/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pengajar_id: pengajarId,
          year_month: yearMonth,
          skor_metode_pengajaran: state.skor_metode_pengajaran,
          keterangan_metode: state.keterangan_metode,
          skor_kepatuhan_silabus: state.skor_kepatuhan_silabus,
          keterangan_silabus: state.keterangan_silabus,
          skor_manajemen_halaqah: state.skor_manajemen_halaqah,
          keterangan_halaqah: state.keterangan_halaqah,
          skor_evaluasi_penguasaan: state.skor_evaluasi_penguasaan,
          keterangan_evaluasi: state.keterangan_evaluasi,
          skor_kepatuhan_sop: state.skor_kepatuhan_sop,
          keterangan_sop: state.keterangan_sop,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      setRows((prev) => ({ ...prev, [pengajarId]: { ...prev[pengajarId], status: 'saved', error: undefined } }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal simpan';
      setRows((prev) => ({ ...prev, [pengajarId]: { ...prev[pengajarId], status: 'error', error: msg } }));
    }
  }, [yearMonth]);

  function updateRow(pengajarId: string, patch: Partial<PenilaianData>) {
    setRows((prev) => {
      const next: RowState = { ...prev[pengajarId], ...patch, status: 'idle' };
      if (debounceRefs.current[pengajarId]) clearTimeout(debounceRefs.current[pengajarId]);
      debounceRefs.current[pengajarId] = setTimeout(() => save(pengajarId, next), 800);
      return { ...prev, [pengajarId]: next };
    });
  }

  function avgOf(row: RowState): string {
    const scores = ASPECTS
      .map((a) => row[a.skorField as keyof PenilaianData] as number | null)
      .filter((s): s is number => s !== null);
    if (!scores.length) return '—';
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map((m) => {
        const row = rows[m.id];
        const isOpen = expanded === m.id;
        return (
          <div key={m.id} className="card-flat" style={{ overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : m.id)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--hijau-ink, #2e7d32)' }}>
                  {avgOf(row)}
                </span>
                {row.status === 'saving' && <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>⟳</span>}
                {row.status === 'saved' && <span style={{ fontSize: 12, color: 'var(--hijau-ink)' }}>✓</span>}
                {row.status === 'error' && <span title={row.error} style={{ fontSize: 12, color: 'var(--merah-ink, #c62828)' }}>✗</span>}
                <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ASPECTS.map((a) => {
                  const skor = row[a.skorField as keyof PenilaianData] as number | null;
                  const ket = (row[a.ketField as keyof PenilaianData] as string | null) ?? '';
                  return (
                    <div key={a.key}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{a.label}</div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {SCORES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => updateRow(m.id, { [a.skorField]: skor === s ? null : s } as Partial<PenilaianData>)}
                            style={{
                              flex: 1,
                              padding: '5px 0',
                              fontSize: 13,
                              fontWeight: skor === s ? 700 : 400,
                              background: skor === s ? scoreBg(s) : 'var(--bg-input, #f0f0f0)',
                              color: skor === s ? scoreColor(s) : 'var(--muted-2)',
                              border: skor === s ? `1.5px solid ${scoreBorder(s)}` : '1.5px solid transparent',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="catatan (opsional)..."
                        value={ket}
                        onChange={(e) => updateRow(m.id, { [a.ketField]: e.target.value || null } as Partial<PenilaianData>)}
                        style={{
                          marginTop: 4,
                          width: '100%',
                          fontSize: 11,
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-input, #fafafa)',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function scoreBg(s: number): string {
  if (s >= 3) return '#e8f5e9';
  if (s === 2) return '#fff9c4';
  return '#ffebee';
}
function scoreColor(s: number): string {
  if (s >= 3) return '#2e7d32';
  if (s === 2) return '#f57f17';
  return '#c62828';
}
function scoreBorder(s: number): string {
  if (s >= 3) return '#4caf50';
  if (s === 2) return '#ffc107';
  return '#f44336';
}
