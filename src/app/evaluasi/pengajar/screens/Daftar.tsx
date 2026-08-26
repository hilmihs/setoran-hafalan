'use client';

import { useState } from 'react';

interface DaftarItem {
  key: string;
  nama: string;
  ketua: string;
  initial: string;
  toggle: () => void;
  checkMark: string;
  checkBg: string;
  checkBorder: string;
  rowOpacity: number;
  buka: () => void;
  statusText: string;
  showSkor: boolean;
  skor: number;
  skorColor: string;
}

interface DaftarProps {
  judul: string;
  sub: string;
  items: DaftarItem[];
  selesai: number;
  total: number;
  progressPct: number;
  tombolLabel: string;
  back: () => void;
  mulai: () => void;
  onReset?: () => void;
}

export function Daftar(props: DaftarProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc' }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e8e4dc', background: '#ffffff', color: '#44423d', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{props.judul}</div>
          <div style={{ fontSize: 11, color: '#7a766f' }}>{props.sub}</div>
        </div>
        {props.onReset && !confirmReset && (
          <button
            onClick={() => setConfirmReset(true)}
            style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid oklch(0.85 0.08 25)', background: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 600, color: 'oklch(0.46 0.14 25)', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Reset
          </button>
        )}
        {props.onReset && confirmReset && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => { props.onReset?.(); setConfirmReset(false); }}
              style={{ height: 34, padding: '0 12px', borderRadius: 8, border: 'none', background: 'oklch(0.55 0.16 25)', font: 'inherit', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Ya, reset
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e8e4dc', background: '#fff', font: 'inherit', fontSize: 12, fontWeight: 600, color: '#44423d', cursor: 'pointer' }}
            >
              Batal
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ fontSize: 11, color: '#7a766f', lineHeight: 1.4 }}>Semua peserta dipilih otomatis. Ketuk untuk lepas centang bila tidak hadir hari ini.</div>
      </div>

      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {props.items.map((p) => (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: '10px 12px', opacity: p.rowOpacity }}>
            <button onClick={p.toggle} style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${p.checkBorder}`, background: p.checkBg, color: '#ffffff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>{p.checkMark}</button>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#efece5', color: '#44423d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{p.initial}</div>
            <button onClick={p.buka} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', padding: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1b1a17' }}>{p.nama}{p.ketua}</div>
              <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 1 }}>{p.statusText}</div>
            </button>
            {p.showSkor && (
              <span style={{ fontSize: 13, fontWeight: 800, color: p.skorColor, fontVariantNumeric: 'tabular-nums' }}>{p.skor}</span>
            )}
            <span style={{ fontSize: 15, color: '#d8d3c8' }}>›</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ position: 'sticky', bottom: 0, background: '#ffffff', borderTop: '1px solid #e8e4dc', padding: '12px 16px calc(18px + env(safe-area-inset-bottom))', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e8e4dc', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'oklch(0.58 0.09 165)', width: `${props.progressPct}%` }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#44423d', whiteSpace: 'nowrap' }}>{props.selesai}/{props.total} selesai</span>
        </div>
        <button onClick={props.mulai} style={{ width: '100%', height: 50, borderRadius: 8, border: 'none', background: '#1b1a17', color: '#ffffff', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{props.tombolLabel}</button>
      </div>
    </>
  );
}
