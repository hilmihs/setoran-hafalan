'use client';

import type { Tile, SaveStatus } from '../EvaluasiPengajarApp';

interface NilaiProps {
  nama: string;
  pos: number;
  totalPeserta: number;
  surat: string;
  ayat: number;
  ayatPct: number;
  prevAyat: () => void;
  nextAyat: () => void;
  ringGradient: string;
  skor: number;
  skorColor: string;
  tierLabel: string;
  hitungan: string;
  ambang: number;
  isUjian: boolean;
  lulusLabel: string;
  lulusBg: string;
  lulusBorder: string;
  lulusColor: string;
  confirmed: boolean;
  toggleConfirm: () => void;
  jaliy: Tile[];
  khafiy: Tile[];
  catatan: string;
  setCatatan: (v: string) => void;
  isFirst: boolean;
  prevPeserta: () => void;
  simpanDisabled: boolean;
  simpanLabel: string;
  simpanLanjut: () => void;
  status: SaveStatus;
  back: () => void;
}

function statusView(status: SaveStatus): { dot: string; text: string } {
  switch (status) {
    case 'saving':
      return { dot: 'oklch(0.78 0.10 80)', text: 'Menyimpan…' };
    case 'saved':
      return { dot: 'oklch(0.62 0.11 150)', text: 'Tersimpan' };
    case 'error':
      return { dot: 'oklch(0.62 0.16 25)', text: 'Gagal simpan' };
    default:
      return { dot: 'oklch(0.78 0.10 80)', text: 'Di HP' };
  }
}

export function Nilai(props: NilaiProps) {
  const sv = statusView(props.status);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc', position: 'sticky', top: 0, zIndex: 5 }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e8e4dc', background: '#ffffff', color: '#44423d', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{props.nama}</div>
          <div style={{ fontSize: 11, color: '#7a766f', marginTop: 1 }}>Peserta {props.pos} dari {props.totalPeserta}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'oklch(0.50 0.09 70)', background: 'oklch(0.96 0.035 85)', border: '1px solid oklch(0.88 0.07 82)', padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: sv.dot }} />{sv.text}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ borderRadius: 20, padding: 16, background: 'linear-gradient(150deg, oklch(0.97 0.02 165), oklch(0.945 0.03 165))', border: '1px solid oklch(0.88 0.045 165)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.46 0.09 165)' }}>Sedang di ayat</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, color: '#1b1a17' }}>{props.surat} <span style={{ fontVariantNumeric: 'tabular-nums' }}>{props.ayat}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={props.prevAyat} className="ev-step" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#ffffff', font: 'inherit', fontSize: 16, fontWeight: 700, color: '#44423d', cursor: 'pointer', boxShadow: '0 1px 2px rgba(20,18,14,0.08)' }}>−</button>
              <button onClick={props.nextAyat} className="ev-step" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#1b1a17', font: 'inherit', fontSize: 16, fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>+</button>
            </div>
          </div>
          <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'oklch(0.88 0.045 165)', marginBottom: 16 }}>
            <div style={{ position: 'absolute', top: -3, width: 10, height: 10, borderRadius: '50%', background: '#1b1a17', border: '2px solid #ffffff', left: `${props.ayatPct}%`, transform: 'translateX(-50%)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 84, height: 84, borderRadius: '50%', flexShrink: 0, background: props.ringGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#fbfaf7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 21, fontWeight: 800, lineHeight: 1, color: props.skorColor, fontVariantNumeric: 'tabular-nums' }}>{props.skor}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#a8a39a' }}>/ 100</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: props.skorColor }}>{props.tierLabel}</div>
              <div style={{ fontSize: 11, color: '#5c5950', marginTop: 2 }}>{props.hitungan}</div>
              <div style={{ fontSize: 10, color: '#7a766f', marginTop: 4 }}>Ambang lulus: {props.ambang} / 100</div>
            </div>
          </div>
        </div>
      </div>

      {props.isUjian && (
        <div style={{ margin: '14px 16px 0', padding: '12px 14px', borderRadius: 12, background: props.lulusBg, border: `1px solid ${props.lulusBorder}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: props.lulusColor }}>Rekomendasi: {props.lulusLabel}</span>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: props.lulusColor, cursor: 'pointer' }}>
            <input type="checkbox" checked={props.confirmed} onChange={props.toggleConfirm} />
            Konfirmasi
          </label>
        </div>
      )}

      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ fontSize: 11, color: '#a8a39a', marginBottom: 10 }}>Ketuk kartu setiap ada kesalahan · ketuk angka untuk mengoreksi manual</div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'oklch(0.46 0.14 25)', marginBottom: 8 }}>
          Lahn Jaliy <span style={{ fontWeight: 500, color: '#a8a39a', textTransform: 'none' }}>· −6 / kesalahan</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {props.jaliy.map((c) => (
            <div key={c.key} onClick={c.tap} className="ev-tile" style={{ position: 'relative', minHeight: 104, borderRadius: 16, padding: '14px 8px 10px', background: c.tileBg, border: `1.5px solid ${c.tileBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer' }}>
              {c.showMinus && (
                <button onClick={c.minus} className="ev-minus" style={{ position: 'absolute', top: -14, left: -14, width: 42, height: 42, borderRadius: '50%', background: '#ffffff', border: `2.5px solid ${c.tileBorder}`, color: c.textColor, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', boxShadow: '0 2px 6px rgba(20,18,14,0.18)', zIndex: 2 }}>−</button>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.25, color: c.textColor, textAlign: 'center' }}>{c.label}</span>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={c.count} onClick={c.stop} onChange={c.setCount} style={{ width: 52, height: 34, textAlign: 'center', fontSize: 20, fontWeight: 800, color: c.textColor, background: '#ffffff', border: `1.5px solid ${c.tileBorder}`, borderRadius: 8, outline: 'none', fontVariantNumeric: 'tabular-nums', cursor: 'text' }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'oklch(0.48 0.10 75)', marginBottom: 8 }}>
          Lahn Khafiy <span style={{ fontWeight: 500, color: '#a8a39a', textTransform: 'none' }}>· −2 / kesalahan</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {props.khafiy.map((c) => (
            <div key={c.key} onClick={c.tap} className="ev-tile-sm" style={{ position: 'relative', minHeight: 62, borderRadius: 14, padding: '8px 12px', background: c.tileBg, border: `1.5px solid ${c.tileBorder}`, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              {c.showMinus && (
                <button onClick={c.minus} className="ev-minus" style={{ position: 'absolute', top: -12, left: -12, width: 36, height: 36, borderRadius: '50%', background: '#ffffff', border: `2.5px solid ${c.tileBorder}`, color: c.textColor, fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', boxShadow: '0 2px 6px rgba(20,18,14,0.18)', zIndex: 2 }}>−</button>
              )}
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, lineHeight: 1.25, color: c.textColor }}>{c.label}</span>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={c.count} onClick={c.stop} onChange={c.setCount} style={{ width: 38, height: 30, textAlign: 'center', fontSize: 15, fontWeight: 800, color: c.textColor, background: '#ffffff', border: `1.5px solid ${c.tileBorder}`, borderRadius: 7, outline: 'none', fontVariantNumeric: 'tabular-nums', flexShrink: 0, cursor: 'text' }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 6 }}>Catatan untuk peserta</div>
        <textarea
          placeholder="Mad wajib di ayat 148 masih pendek. Latih lagi 5× sebelum pertemuan depan."
          value={props.catatan}
          onChange={(e) => props.setCatatan(e.target.value)}
          style={{ width: '100%', minHeight: 66, padding: '10px 12px', background: '#ffffff', border: '1px solid #d8d3c8', borderRadius: 8, font: 'inherit', fontSize: 13, lineHeight: 1.45, color: '#1b1a17', outline: 'none', resize: 'none' }}
        />
      </div>

      <div style={{ height: 110 }} />
      <div style={{ position: 'sticky', bottom: 0, background: '#ffffff', borderTop: '1px solid #e8e4dc', padding: '10px 16px 14px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={props.prevPeserta} disabled={props.isFirst} className="ev-ghost" style={{ width: 50, height: 48, borderRadius: 8, border: '1px solid #d8d3c8', background: '#ffffff', font: 'inherit', fontSize: 16, color: '#1b1a17', cursor: props.isFirst ? 'not-allowed' : 'pointer', opacity: props.isFirst ? 0.5 : 1 }}>←</button>
          <button onClick={props.simpanLanjut} disabled={props.simpanDisabled} className="ev-dark" style={{ flex: 1, height: 48, borderRadius: 8, border: 'none', background: '#1b1a17', color: '#ffffff', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: props.simpanDisabled ? 'not-allowed' : 'pointer', opacity: props.simpanDisabled ? 0.5 : 1 }}>{props.simpanLabel}</button>
        </div>
      </div>
    </>
  );
}
