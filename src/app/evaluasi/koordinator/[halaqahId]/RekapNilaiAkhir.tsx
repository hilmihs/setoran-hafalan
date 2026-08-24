import { AMBANG_LULUS_AKHIR, initials } from '@/lib/evaluasi';

// Palet (selaras dgn modul Evaluasi Halaqah)
const HIJAU_TXT = 'oklch(0.40 0.10 150)';
const HIJAU_BG = 'oklch(0.96 0.035 150)';
const HIJAU_BORDER = 'oklch(0.85 0.06 150)';
const MERAH_TXT = 'oklch(0.46 0.14 25)';
const MERAH_BG = 'oklch(0.96 0.03 25)';
const MERAH_BORDER = 'oklch(0.86 0.07 25)';
const MERAH_ROW = 'oklch(0.985 0.012 25)';

export interface RekapNilaiAkhirRow {
  nama: string;
  berkalaAvg: number | null;
  ujianQn: number | null;
  ujianPb: number | null;
  nilaiAkhir: number | null;
  lulus: boolean | null;
}

export interface RekapNilaiAkhirProps {
  halaqahNama: string;
  rows: RekapNilaiAkhirRow[];
}

const GRID = '1fr 88px 88px 88px 96px 156px';

function fmt(n: number | null): string {
  return n === null || Number.isNaN(n) ? '–' : String(Math.round(n));
}

function StatusPill({ lulus }: { lulus: boolean | null }) {
  if (lulus === null) {
    return <span style={{ color: '#7a766f', fontVariantNumeric: 'tabular-nums' }}>—</span>;
  }
  const isLulus = lulus === true;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 999,
        background: isLulus ? HIJAU_BG : MERAH_BG,
        border: `1px solid ${isLulus ? HIJAU_BORDER : MERAH_BORDER}`,
        fontSize: 10.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        color: isLulus ? HIJAU_TXT : MERAH_TXT,
      }}
    >
      {isLulus ? 'LULUS' : 'MENGULANG'}
    </span>
  );
}

export default function RekapNilaiAkhir({ halaqahNama, rows }: RekapNilaiAkhirProps) {
  const total = rows.length;
  const jumlahLulus = rows.filter((r) => r.lulus === true).length;
  const jumlahMengulang = rows.filter((r) => r.lulus === false).length;

  return (
    <div style={{ background: '#f4f2ed', padding: '24px 26px 30px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1b1a17' }}>{halaqahNama}</div>
        <div style={{ fontSize: 12, color: '#7a766f', marginTop: 2 }}>
          Rekap nilai akhir · nilai akhir = 30% berkala + 70% Ujian PB · ambang lulus {AMBANG_LULUS_AKHIR}
        </div>
      </div>

      {/* Ringkasan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: '13px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#1b1a17' }}>{total}</div>
          <div style={{ fontSize: 10.5, color: '#7a766f', marginTop: 5, fontWeight: 600 }}>Peserta</div>
        </div>
        <div style={{ background: HIJAU_BG, border: `1px solid ${HIJAU_BORDER}`, borderRadius: 12, padding: '13px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: HIJAU_TXT, fontVariantNumeric: 'tabular-nums' }}>{jumlahLulus}</div>
          <div style={{ fontSize: 10.5, color: HIJAU_TXT, marginTop: 5, fontWeight: 600 }}>Lulus</div>
        </div>
        <div style={{ background: MERAH_BG, border: `1px solid ${MERAH_BORDER}`, borderRadius: 12, padding: '13px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: MERAH_TXT, fontVariantNumeric: 'tabular-nums' }}>{jumlahMengulang}</div>
          <div style={{ fontSize: 10.5, color: MERAH_TXT, marginTop: 5, fontWeight: 600 }}>Mengulang</div>
        </div>
      </div>

      {/* Tabel */}
      <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            background: '#faf8f4',
            borderBottom: '1px solid #e8e4dc',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            color: '#7a766f',
          }}
        >
          <div style={{ padding: '10px 14px' }}>Peserta</div>
          <div style={{ padding: '10px 0', textAlign: 'center' }}>Berkala</div>
          <div style={{ padding: '10px 0', textAlign: 'center' }}>Ujian QN</div>
          <div style={{ padding: '10px 0', textAlign: 'center' }}>Ujian PB</div>
          <div style={{ padding: '10px 0', textAlign: 'center' }}>Akhir</div>
          <div style={{ padding: '10px 12px' }}>Status</div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12, color: '#7a766f' }}>
            Belum ada data rekap.
          </div>
        ) : (
          rows.map((r, i) => {
            const isLast = i === rows.length - 1;
            const akhirColor = r.nilaiAkhir === null ? '#7a766f' : r.lulus === false ? MERAH_TXT : HIJAU_TXT;
            return (
              <div
                key={`${r.nama}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  alignItems: 'center',
                  borderBottom: isLast ? 'none' : '1px solid #f4f2ed',
                  fontSize: 12,
                  background: r.lulus === false ? MERAH_ROW : undefined,
                }}
              >
                <div style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: '#efece5',
                      color: '#44423d',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9.5,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {initials(r.nama)}
                  </span>
                  <span style={{ fontWeight: 600, color: '#1b1a17' }}>{r.nama}</span>
                </div>
                <div style={{ padding: '9px 0', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#1b1a17' }}>
                  {fmt(r.berkalaAvg)}
                </div>
                <div style={{ padding: '9px 0', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: '#44423d' }}>
                  {fmt(r.ujianQn)}
                </div>
                <div style={{ padding: '9px 0', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: '#44423d' }}>
                  {fmt(r.ujianPb)}
                </div>
                <div style={{ padding: '9px 0', textAlign: 'center', fontSize: 14, fontWeight: 800, color: akhirColor, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(r.nilaiAkhir)}
                </div>
                <div style={{ padding: '9px 12px' }}>
                  <StatusPill lulus={r.lulus} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer ringkas */}
      {total > 0 && (
        <div style={{ marginTop: 12, fontSize: 11.5, color: '#7a766f' }}>
          {jumlahLulus} dari {total} peserta lulus
          {jumlahMengulang > 0 ? ` · ${jumlahMengulang} mengulang` : ''}.
        </div>
      )}
    </div>
  );
}
