'use client';

import type { Jenis } from '@/lib/evaluasi';
import { RaporTrackChart } from '@/components/evaluasi/RaporTrackChart';

interface Track {
  jenis: Jenis;
  label: string;
  history: (number | null)[];
}
interface Rincian {
  key: string;
  label: string;
  count: number;
  tag: string;
  tagColor: string;
}

interface RaporProps {
  nama: string;
  meta: string;
  isUjian: boolean;
  lulusLabel: string;
  lulusBg: string;
  lulusColor: string;
  skor: number;
  skorColor: string;
  tierLabel: string;
  tracks: Track[];
  rincian: Rincian[];
  catatan: string;
  back: () => void;
}

export function Rapor(props: RaporProps) {
  const rincian = props.rincian.length
    ? props.rincian
    : [{ key: 'none', label: 'Tanpa kesalahan tercatat', count: 0, tag: '', tagColor: '#a8a39a' }];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc' }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e8e4dc', background: '#ffffff', color: '#44423d', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Rapor Peserta</div>
        <button className="ev-dark" style={{ marginLeft: 'auto', height: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: 'oklch(0.58 0.09 165)', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>⬇ Unduh PDF</button>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 16, padding: '22px 18px', boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 6px 24px -8px rgba(20,18,14,0.10)' }}>
          <div style={{ textAlign: 'center', borderBottom: '1px solid #e8e4dc', paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a766f' }}>Rapor Evaluasi</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{props.nama}</div>
            <div style={{ fontSize: 12, color: '#7a766f', marginTop: 2 }}>{props.meta}</div>
          </div>

          {props.isUjian && (
            <div style={{ textAlign: 'center', padding: 10, borderRadius: 10, background: props.lulusBg, marginBottom: 14 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: props.lulusColor, letterSpacing: '0.04em' }}>{props.lulusLabel}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: props.skorColor, lineHeight: 1 }}>{props.skor}</div>
              <div style={{ fontSize: 11, color: '#a8a39a', fontWeight: 600, marginTop: 2 }}>dari 100 · {props.tierLabel}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
            {props.tracks.map((t) => (
              <RaporTrackChart key={t.jenis} label={t.label} history={t.history} jenis={t.jenis} />
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 8 }}>Rincian kesalahan sesi ini</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
            {rincian.map((r) => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 0', borderBottom: '1px solid #f4f2ed' }}>
                <span style={{ flex: 1, color: '#44423d' }}>{r.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: r.tagColor }}>{r.tag}</span>
                <span style={{ fontWeight: 700, color: '#1b1a17', fontVariantNumeric: 'tabular-nums', minWidth: 16, textAlign: 'right' }}>{r.count || ''}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 6 }}>Catatan pengajar</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: '#44423d', background: '#faf8f4', border: '1px solid #e8e4dc', borderRadius: 8, padding: '10px 12px', marginBottom: 18 }}>{props.catatan}</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid #e8e4dc' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ height: 36 }} />
              <div style={{ fontSize: 10, color: '#a8a39a', borderTop: '1px solid #d8d3c8', paddingTop: 4 }}>Pengajar</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ height: 36 }} />
              <div style={{ fontSize: 10, color: '#a8a39a', borderTop: '1px solid #d8d3c8', paddingTop: 4 }}>Koordinator</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: 16 }} />
    </>
  );
}
