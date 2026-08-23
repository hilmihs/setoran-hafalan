import { JALIY, KHAFIY } from '@/lib/evaluasi';
import PrintButton from '../pengajar/rapot/PrintButton';

export const dynamic = 'force-static';

// Lembar sosialisasi (A4, cetak → PDF) sistem penilaian untuk pengajar.
const CARD: React.CSSProperties = {
  border: '1px solid #e8e4dc',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 12,
  background: '#fff',
  breakInside: 'avoid',
};
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#7a766f',
  marginBottom: 8,
};
const CHIP_J: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'oklch(0.46 0.14 25)',
  marginLeft: 8,
};
const CHIP_K: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'oklch(0.48 0.10 75)',
  marginLeft: 8,
};

export default function SosialisasiPenilaianPage() {
  return (
    <div style={{ background: '#eae7e0', minHeight: '100vh', padding: '24px 0' }}>
      <style>{'@page{size:A4;margin:14mm} @media print{.noprint{display:none} body{background:#fff}}'}</style>

      <div
        style={{
          width: 794,
          maxWidth: '100%',
          margin: '0 auto',
          background: '#fff',
          padding: '32px 40px 40px',
          boxSizing: 'border-box',
          color: '#1b1a17',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          boxShadow: '0 18px 40px -24px rgba(20,18,14,.4)',
        }}
      >
        {/* Kop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2px solid #1b1a17', paddingBottom: 14, marginBottom: 18 }}>
          <img src="/logo-mpt.png" alt="MPT" width={54} height={54} style={{ borderRadius: 8, objectFit: 'cover' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>MuhajirProject #Tilawah</div>
            <div style={{ fontSize: 11, color: '#7a766f', marginTop: 2 }}>Evaluasi Halaqah</div>
          </div>
        </div>

        {/* Judul — to the point, tanpa deskripsi */}
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.01em', margin: '0 0 20px', textWrap: 'balance' }}>
          Sosialisasi Sistem Penilaian: Evaluasi Berkala &amp; Ujian Akhir
        </h1>

        {/* 1. Skor per sesi */}
        <div style={CARD}>
          <div style={SECTION_LABEL}>1 · Skor tiap sesi</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            Skor = 100 − (Lahn Jaliy × 6) − (Lahn Khafiy × 2)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.46 0.14 25)', marginBottom: 4 }}>Lahn Jaliy · −6 / kesalahan</div>
              {JALIY.map((d) => (
                <div key={d.key} style={{ fontSize: 12, color: '#44423d', padding: '2px 0' }}>{d.label}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.48 0.10 75)', marginBottom: 4 }}>Lahn Khafiy · −2 / kesalahan</div>
              {KHAFIY.map((d) => (
                <div key={d.key} style={{ fontSize: 12, color: '#44423d', padding: '2px 0' }}>{d.label}</div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#44423d', marginTop: 10 }}>
            Predikat: <b>Mumtaz</b> ≥ 90 · <b>Standar</b> ≥ 70 · <b>Cukup</b> ≥ 50 · <b>Perlu pengulangan</b> &lt; 50.
          </div>
        </div>

        {/* 2. Evaluasi Berkala */}
        <div style={CARD}>
          <div style={SECTION_LABEL}>2 · Evaluasi Berkala</div>
          <div style={{ fontSize: 13, color: '#44423d', lineHeight: 1.55 }}>
            Terdiri dari dua track — <b>QN</b> dan <b>PB</b>, masing-masing 4 sesi. Rata-rata seluruh sesi QN &amp; PB
            (digabung) menjadi <b>nilai Evaluasi Berkala</b>.
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.40 0.10 150)', marginTop: 8 }}>
            Menyumbang <b>30%</b> nilai akhir.
          </div>
        </div>

        {/* 3. Ujian Akhir */}
        <div style={CARD}>
          <div style={SECTION_LABEL}>3 · Ujian Akhir</div>
          <div style={{ fontSize: 13, color: '#44423d', lineHeight: 1.55 }}>
            Ada dua ujian: <b>Ujian QN</b> dan <b>Ujian PB</b>. Keduanya diuji &amp; dinilai, tetapi untuk nilai akhir
            <b> hanya skor Ujian PB yang dihitung</b>. Ujian QN dipakai sebagai catatan progres, <b>tidak</b> masuk nilai akhir.
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.40 0.10 150)', marginTop: 8 }}>
            Skor Ujian PB menyumbang <b>70%</b> nilai akhir.
          </div>
        </div>

        {/* 4. Nilai akhir */}
        <div style={{ ...CARD, background: 'oklch(0.96 0.035 150)', border: '1px solid oklch(0.85 0.06 150)' }}>
          <div style={SECTION_LABEL}>4 · Nilai akhir</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
            Nilai akhir = (Evaluasi Berkala × 30%) + (Ujian PB × 70%)
          </div>
          <div style={{ fontSize: 13, color: '#44423d', lineHeight: 1.55 }}>
            Ambang lulus <b>70</b>. Nilai akhir ≥ 70 → <b>LULUS</b>; di bawah 70 → <b>MENGULANG</b>.
          </div>
          <div style={{ fontSize: 12, color: '#44423d', marginTop: 10, background: '#fff', border: '1px solid #d8d3c8', borderRadius: 8, padding: '8px 12px' }}>
            Contoh: Berkala 79, Ujian PB 78 → (79 × 0,3) + (78 × 0,7) = 78,3 → <b>78</b> · LULUS.
          </div>
        </div>
      </div>

      <div className="noprint" style={{ position: 'fixed', bottom: 20, right: 20 }}>
        <PrintButton />
      </div>
    </div>
  );
}
