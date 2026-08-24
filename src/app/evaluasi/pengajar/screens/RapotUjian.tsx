'use client';

import type { RapotPayload, RapotUjianSnap } from '@/lib/rapot';

interface RapotUjianProps {
  payload: RapotPayload;
  onBack: () => void;
  onTerbitkan: () => void;
  terbitStatus?: 'idle' | 'saving' | 'done' | 'error';
}

function cell(v: number | null): string {
  return v == null || v === 0 ? '–' : String(v);
}

const HIJAU = 'oklch(0.40 0.10 150)';
const HIJAU_BTN = 'oklch(0.58 0.09 165)';
const BANNER_BG = 'oklch(0.96 0.035 150)';
const BANNER_BORDER = 'oklch(0.85 0.06 150)';
const JALIY_COLOR = 'oklch(0.46 0.14 25)';
const KHAFIY_COLOR = 'oklch(0.48 0.10 75)';

function SnapCard({ snap }: { snap: RapotUjianSnap }) {
  return (
    <div
      style={{
        background: BANNER_BG,
        border: `1px solid ${BANNER_BORDER}`,
        borderRadius: 12,
        padding: '11px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1b1a17' }}>
          {snap.label} — {snap.lulus === false ? 'MENGULANG' : 'LULUS'}
        </div>
        <div style={{ fontSize: 11, color: '#7a766f', marginTop: 1 }}>
          {snap.jaliy} jaliy · {snap.khafiy} khafiy
        </div>
      </div>
      <span style={{ fontSize: 18, fontWeight: 800, color: snap.lulus === false ? 'oklch(0.46 0.14 25)' : HIJAU, fontVariantNumeric: 'tabular-nums' }}>
        {snap.skor ?? '–'}
      </span>
    </div>
  );
}

export function RapotUjian({ payload, onBack, onTerbitkan, terbitStatus = 'idle' }: RapotUjianProps) {
  const u = payload.ujian;
  const id = payload.identitas;

  if (!u) {
    return (
      <>
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc' }}>
          <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e8e4dc', background: '#ffffff', color: '#44423d', fontSize: 15, cursor: 'pointer' }}>←</button>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Rapot Ujian Akhir</div>
        </div>
        <div style={{ padding: 16, fontSize: 12.5, color: '#7a766f' }}>Belum ada data ujian.</div>
      </>
    );
  }

  const saving = terbitStatus === 'saving';
  const hasPb = !!u.pb;
  const ambang = payload.ambang;

  const metaParts: string[] = [`Halaqah ${id.halaqah}`];
  if (id.level) metaParts.push(id.level);
  if (id.mustawa != null) metaParts.push(`Level ${id.mustawa}`);
  const meta = metaParts.join(' · ');

  // Penyebab null bisa: PB belum ada, ATAU PB ada tapi berkala kosong. Bedakan.
  const nullReason = hasPb ? 'Belum ada nilai berkala' : 'Belum ada ujian PB';
  const status = u.lulus === true ? 'LULUS' : u.lulus === false ? 'MENGULANG' : nullReason;
  const showNilai = u.lulus != null && u.nilaiAkhir != null;
  // Warna banner ikut status — jangan hijau untuk MENGULANG.
  const stColor = u.lulus === true ? HIJAU : u.lulus === false ? 'oklch(0.46 0.14 25)' : '#7a766f';
  const stBg = u.lulus === true ? BANNER_BG : u.lulus === false ? 'oklch(0.96 0.04 25)' : '#f4f2ed';
  const stBorder = u.lulus === true ? BANNER_BORDER : u.lulus === false ? 'oklch(0.85 0.08 25)' : '#e8e4dc';

  const berkalaAvg = u.berkalaAvg ?? 0;
  const ujianPbSkor = u.ujianPbSkor ?? 0;
  const rawFormula = (berkalaAvg * 0.3 + ujianPbSkor * 0.7).toFixed(1).replace('.', ',');

  const totalQn = u.rincian.reduce((a, r) => a + (r.qn ?? 0), 0);
  const totalPb = u.rincian.reduce((a, r) => a + (r.pb ?? 0), 0);

  let btnLabel = '⬇ Unduh PDF';
  if (saving) btnLabel = 'Menyimpan…';
  else if (terbitStatus === 'done') btnLabel = '✓ Terbit';
  else if (terbitStatus === 'error') btnLabel = 'Gagal · ulangi';

  // Selaras dgn guard server: butuh PB DAN nilai akhir (berkala ada) sebelum terbit.
  const btnDisabled = saving || !hasPb || u.nilaiAkhir == null;

  const gridCols = '1fr 46px 40px 40px';

  return (
    <>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc' }}>
        <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e8e4dc', background: '#ffffff', color: '#44423d', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Rapot Ujian Akhir</div>
        <button
          onClick={onTerbitkan}
          disabled={btnDisabled}
          className="ev-dark"
          style={{
            marginLeft: 'auto',
            height: 36,
            padding: '0 14px',
            borderRadius: 8,
            border: 'none',
            background: btnDisabled ? '#c9c3b8' : HIJAU_BTN,
            font: 'inherit',
            fontSize: 12.5,
            fontWeight: 700,
            color: '#ffffff',
            cursor: btnDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {btnLabel}
        </button>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 16, padding: '0 0 22px', boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 6px 24px -8px rgba(20,18,14,0.10)', overflow: 'hidden' }}>

          {/* Banner */}
          <div style={{ background: stBg, borderBottom: `1px solid ${stBorder}`, padding: '20px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: stColor, opacity: 0.8 }}>
              Hasil Ujian Akhir{id.mustawa != null ? ` Level ${id.mustawa}` : ''}
            </div>
            <div style={{ fontSize: u.lulus == null ? 18 : 34, fontWeight: 800, letterSpacing: '0.06em', color: stColor, lineHeight: 1.15, marginTop: 6 }}>
              {status}
            </div>
            {showNilai && (
              <div style={{ fontSize: 12, color: stColor, opacity: 0.85, marginTop: 4 }}>
                Nilai akhir {u.nilaiAkhir} · ambang lulus {ambang}
              </div>
            )}
          </div>

          {/* Identitas */}
          <div style={{ padding: '20px 18px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{id.peserta}</div>
            <div style={{ fontSize: 12, color: '#7a766f', marginTop: 2 }}>{meta}</div>
          </div>

          {/* Donut + breakdown */}
          {showNilai && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 18px' }}>
              <div style={{ position: 'relative', width: 120, height: 120, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(${stColor} ${u.nilaiAkhir}%, #e8e4dc 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: stColor, fontVariantNumeric: 'tabular-nums' }}>{u.nilaiAkhir}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#a8a39a', marginTop: 2 }}>/ 100</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 8 }}>Nilai akhir</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                    <span style={{ color: '#44423d', fontWeight: 600 }}>Berkala · bobot 30%</span>
                    <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{u.berkalaAvg ?? '–'}</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: '#efece5', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${berkalaAvg}%`, background: 'oklch(0.72 0.07 210)' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                    <span style={{ color: '#44423d', fontWeight: 600 }}>Ujian PB · bobot 70%</span>
                    <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{u.ujianPbSkor ?? '–'}</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: '#efece5', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${ujianPbSkor}%`, background: HIJAU_BTN }} />
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: '#a8a39a', lineHeight: 1.4 }}>
                  ({u.berkalaAvg ?? '–'} × 0,3) + ({u.ujianPbSkor ?? '–'} × 0,7) = {rawFormula} → {u.nilaiAkhir}
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: showNilai ? '0 18px' : '20px 18px 0' }}>
            {/* Ujian QN & PB */}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 8 }}>Nilai ujian akhir</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {u.qn ? <SnapCard snap={u.qn} /> : (
                <div style={{ background: '#faf8f4', border: '1px solid #e8e4dc', borderRadius: 12, padding: '11px 12px', fontSize: 12, color: '#a8a39a' }}>Belum ada ujian QN</div>
              )}
              {u.pb ? <SnapCard snap={u.pb} /> : (
                <div style={{ background: '#faf8f4', border: '1px solid #e8e4dc', borderRadius: 12, padding: '11px 12px', fontSize: 12, color: '#a8a39a' }}>Belum ada ujian PB</div>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#a8a39a', marginBottom: 18, lineHeight: 1.45 }}>
              Nilai akhir memakai skor <b>Ujian PB</b>. Ujian QN sebagai catatan progres. Ambang lulus {ambang}.
            </div>

            {/* Rincian kesalahan */}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 8 }}>Rincian kesalahan</div>
            <div style={{ border: '1px solid #e8e4dc', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', background: '#faf8f4', borderBottom: '1px solid #e8e4dc', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#7a766f' }}>
                <div style={{ padding: '7px 12px' }}>Jenis kesalahan</div>
                <div style={{ padding: '7px 0' }} />
                <div style={{ padding: '7px 0', textAlign: 'center' }}>QN</div>
                <div style={{ padding: '7px 8px 7px 0', textAlign: 'center' }}>PB</div>
              </div>
              {u.rincian.map((r) => (
                <div key={r.key} style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', fontSize: 12, borderBottom: '1px solid #f4f2ed' }}>
                  <div style={{ padding: '7px 12px', color: '#44423d' }}>{r.label}</div>
                  <div style={{ padding: '7px 0', fontSize: 9.5, fontWeight: 700, color: r.group === 'jaliy' ? JALIY_COLOR : KHAFIY_COLOR }}>
                    {r.group === 'jaliy' ? 'Jaliy' : 'Khafiy'}
                  </div>
                  <div style={{ padding: '7px 0', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cell(r.qn)}</div>
                  <div style={{ padding: '7px 8px 7px 0', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cell(r.pb)}</div>
                </div>
              ))}
              {u.rincian.length === 0 && (
                <div style={{ padding: '10px 12px', fontSize: 12, color: '#a8a39a' }}>Tanpa kesalahan tercatat</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', fontSize: 12, background: '#faf8f4' }}>
                <div style={{ padding: '8px 12px', fontWeight: 800 }}>Total kesalahan</div>
                <div style={{ padding: '8px 0' }} />
                <div style={{ padding: '8px 0', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{cell(totalQn)}</div>
                <div style={{ padding: '8px 8px 8px 0', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{cell(totalPb)}</div>
              </div>
            </div>

            {/* Catatan penguji */}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 6 }}>Catatan penguji</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: '#44423d', background: '#faf8f4', border: '1px solid #e8e4dc', borderRadius: 8, padding: '10px 12px', marginBottom: 18, textWrap: 'pretty' }}>
              {u.catatanPenguji || '—'}
            </div>

            {!hasPb && (
              <div style={{ fontSize: 11.5, fontWeight: 700, color: JALIY_COLOR, background: 'oklch(0.96 0.03 25)', border: `1px solid ${JALIY_COLOR}`, borderRadius: 8, padding: '10px 12px', marginBottom: 18, textAlign: 'center' }}>
                Belum ada ujian PB
              </div>
            )}

            {/* TTD */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid #e8e4dc' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ height: 36 }} />
                <div style={{ fontSize: 10, color: '#a8a39a', borderTop: '1px solid #d8d3c8', paddingTop: 4 }}>
                  {payload.penerbit}<br />Penguji
                </div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ height: 36 }} />
                <div style={{ fontSize: 10, color: '#a8a39a', borderTop: '1px solid #d8d3c8', paddingTop: 4 }}>
                  <br />Koordinator
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: 16 }} />
    </>
  );
}
