'use client';

interface RingkasanItem {
  key: string;
  nama: string;
  initial: string;
  skor: number;
  skorColor: string;
  tierLabel: string;
  lihat: () => void;
}

interface RingkasanProps {
  rata: number;
  standarCount: number;
  bawahCount: number;
  items: RingkasanItem[];
  waOpen: boolean;
  openWa: () => void;
  closeWa: () => void;
  waText: string;
  kirim: () => void;
  kirimDisabled: boolean;
  kirimLabel: string;
  offlineNote: string;
  back: () => void;
}

export function Ringkasan(props: RingkasanProps) {
  return (
    <>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc' }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e8e4dc', background: '#ffffff', color: '#44423d', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Ringkasan Sesi</div>
      </div>

      <div style={{ padding: '14px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{props.rata}</div>
          <div style={{ fontSize: 10, color: '#7a766f', marginTop: 4, fontWeight: 600 }}>Rata-rata</div>
        </div>
        <div style={{ background: 'oklch(0.96 0.035 150)', border: '1px solid oklch(0.85 0.06 150)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: 'oklch(0.40 0.10 150)' }}>{props.standarCount}</div>
          <div style={{ fontSize: 10, color: 'oklch(0.40 0.10 150)', marginTop: 4, fontWeight: 600 }}>≥ Standar</div>
        </div>
        <div style={{ background: 'oklch(0.96 0.03 25)', border: '1px solid oklch(0.86 0.07 25)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: 'oklch(0.46 0.14 25)' }}>{props.bawahCount}</div>
          <div style={{ fontSize: 10, color: 'oklch(0.46 0.14 25)', marginTop: 4, fontWeight: 600 }}>Di bawah</div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {props.items.map((p) => (
          <button key={p.key} onClick={p.lihat} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: '10px 12px', width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#efece5', color: '#44423d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{p.initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1b1a17' }}>{p.nama}</div>
              <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 1 }}>{p.tierLabel}</div>
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: p.skorColor, fontVariantNumeric: 'tabular-nums' }}>{p.skor}</span>
          </button>
        ))}
      </div>

      <div className="no-print" style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={props.openWa} style={{ width: '100%', height: 46, borderRadius: 8, border: 'none', background: 'oklch(0.58 0.12 155)', color: '#ffffff', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>Rekap teks untuk WhatsApp</button>
        <button onClick={() => window.print()} className="ev-ghost" style={{ width: '100%', height: 46, borderRadius: 8, border: '1px solid #d8d3c8', background: '#ffffff', font: 'inherit', fontSize: 14, fontWeight: 600, color: '#1b1a17', cursor: 'pointer' }}>Unduh PDF rekap sesi</button>
      </div>

      <div style={{ flex: 1 }} />
      <div className="no-print" style={{ position: 'sticky', bottom: 0, background: '#ffffff', borderTop: '1px solid #e8e4dc', padding: '12px 16px 18px', marginTop: 18 }}>
        <button onClick={props.kirim} disabled={props.kirimDisabled} style={{ width: '100%', height: 50, borderRadius: 8, border: 'none', background: '#1b1a17', color: '#ffffff', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: props.kirimDisabled ? 'not-allowed' : 'pointer', opacity: props.kirimDisabled ? 0.55 : 1 }}>{props.kirimLabel}</button>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#a8a39a', marginTop: 8 }}>{props.offlineNote}</div>
      </div>

      {props.waOpen && (
        <>
          <div onClick={props.closeWa} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,14,0.42)', zIndex: 20 }} />
          <div style={{ position: 'fixed', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: '100%', maxWidth: 460, zIndex: 21, background: '#ffffff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, boxShadow: '0 -12px 40px -12px rgba(20,18,14,0.3)' }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: '#d8d3c8', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Rekap untuk WhatsApp</div>
            <div style={{ background: '#faf8f4', border: '1px solid #e8e4dc', borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.7, color: '#44423d', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{props.waText}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={props.closeWa} style={{ height: 46, padding: '0 16px', borderRadius: 8, border: '1px solid #d8d3c8', background: '#ffffff', font: 'inherit', fontSize: 13, fontWeight: 600, color: '#1b1a17', cursor: 'pointer' }}>Tutup</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(props.waText)}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, height: 46, borderRadius: 8, border: 'none', background: 'oklch(0.58 0.12 155)', color: '#ffffff', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Buka WhatsApp</a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
