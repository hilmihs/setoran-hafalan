'use client';

import type { RapotPayload, RapotTrackSnap } from '@/lib/rapot';
import { buildTrackGeometry, tierOf } from '@/lib/evaluasi';

interface Props {
  payload: RapotPayload;
  onBack: () => void;
  onTerbitkan: () => void;
  terbitStatus?: 'idle' | 'saving' | 'done' | 'error';
}

const HIJAU = 'oklch(0.58 0.09 165)';
const HIJAU_TUA = 'oklch(0.40 0.10 150)';
const HIJAU_BG = 'oklch(0.96 0.035 150)';
const HIJAU_BORDER = 'oklch(0.85 0.06 150)';
const JALIY_C = 'oklch(0.46 0.14 25)';
const KHAFIY_C = 'oklch(0.48 0.10 75)';

const BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

function formatTgl(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const bi = Number(mo) - 1;
  const bl = bi >= 0 && bi < 12 ? BULAN[bi] : mo;
  return `${Number(d)} ${bl} ${y}`;
}

function tombolLabel(status: Props['terbitStatus']): string {
  switch (status) {
    case 'saving':
      return 'Menyimpan…';
    case 'done':
      return '✓ Tersimpan';
    case 'error':
      return 'Gagal — ulangi';
    default:
      return '⬇ Unduh PDF';
  }
}

function TrackCard({ track }: { track: RapotTrackSnap }) {
  const geo = buildTrackGeometry(track.history);
  const x2 = geo.chartW - geo.padX;
  return (
    <div style={{ background: '#faf8f4', border: '1px solid #e8e4dc', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1b1a17' }}>Progres {track.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: HIJAU_TUA }}>
          rata-rata {track.rata ?? '—'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${geo.chartW} ${geo.chartH}`}
        style={{ width: '100%', height: 88, display: 'block', margin: '4px 0 2px' }}
      >
        <line
          x1={geo.padX}
          y1={geo.ambangY}
          x2={x2}
          y2={geo.ambangY}
          stroke="#d8d3c8"
          strokeWidth={1.5}
          strokeDasharray="3,3"
        />
        {geo.points && (
          <polyline
            points={geo.points}
            fill="none"
            stroke={HIJAU}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {geo.sessions.map((s, i) => {
          if (!s.filled) return null;
          const anchor = i === 0 ? 'start' : i === geo.sessions.length - 1 ? 'end' : 'middle';
          return (
            <g key={s.no}>
              <text
                x={s.cx}
                y={s.cy - 8}
                fontSize={10.5}
                fontWeight={700}
                fill={HIJAU_TUA}
                textAnchor={anchor}
                fontFamily="'IBM Plex Mono',monospace"
              >
                {s.score}
              </text>
              <circle cx={s.cx} cy={s.cy} r={5} fill={HIJAU_TUA} stroke="#ffffff" strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', marginBottom: 10 }}>
        {geo.sessions.map((s) => (
          <span
            key={s.no}
            style={{ fontSize: 9, color: '#a8a39a', fontWeight: 600, width: 30, textAlign: 'center' }}
          >
            S{s.no}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RapotBerkala({ payload, onBack, onTerbitkan, terbitStatus = 'idle' }: Props) {
  const { identitas, penerbit } = payload;
  const b = payload.berkala;
  const saving = terbitStatus === 'saving';

  const identitasParts: string[] = [`Halaqah ${identitas.halaqah}`];
  if (identitas.level) identitasParts.push(identitas.level);
  if (identitas.mustawa != null) identitasParts.push(`Level ${identitas.mustawa}`);

  const predikat = b?.predikat ?? '—';
  const rata = b?.rataGabungan ?? null;
  const tinggi = b?.tertinggi ?? null;
  const predikatColor = rata != null ? tierOf(rata).color : HIJAU_TUA;
  const catatan = (b?.tracks ?? []).flatMap((t) => t.catatan);

  return (
    <div style={{ background: '#f4f2ed' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: '#ffffff',
          borderBottom: '1px solid #e8e4dc',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid #e8e4dc',
            background: '#ffffff',
            color: '#44423d',
            fontSize: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          ←
        </button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Rapot Berkala</div>
        <button
          type="button"
          onClick={onTerbitkan}
          disabled={saving}
          style={{
            marginLeft: 'auto',
            height: 36,
            padding: '0 14px',
            borderRadius: 8,
            border: 'none',
            background: HIJAU,
            fontSize: 12.5,
            fontWeight: 700,
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {tombolLabel(terbitStatus)}
        </button>
      </div>

      <div style={{ padding: 16 }}>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e8e4dc',
            borderRadius: 16,
            padding: '22px 18px',
            boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 6px 24px -8px rgba(20,18,14,0.10)',
          }}
        >
          {/* Identitas */}
          <div
            style={{
              textAlign: 'center',
              borderBottom: '1px solid #e8e4dc',
              paddingBottom: 14,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#7a766f',
              }}
            >
              Rapot Evaluasi Berkala
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{identitas.peserta}</div>
            <div style={{ fontSize: 12, color: '#7a766f', marginTop: 2 }}>{identitasParts.join(' · ')}</div>
            {identitas.batch && (
              <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 3 }}>Batch {identitas.batch}</div>
            )}
          </div>

          {/* Rata-rata & Tertinggi */}
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}
          >
            <div
              style={{
                background: HIJAU_BG,
                border: `1px solid ${HIJAU_BORDER}`,
                borderRadius: 12,
                padding: 12,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  lineHeight: 1,
                  color: HIJAU_TUA,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {rata ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: HIJAU_TUA, marginTop: 5, fontWeight: 600 }}>Rata-rata</div>
            </div>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e8e4dc',
                borderRadius: 12,
                padding: 12,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {tinggi ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: '#7a766f', marginTop: 5, fontWeight: 600 }}>Tertinggi</div>
            </div>
          </div>

          {/* Chip predikat */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 9,
              borderRadius: 10,
              background: HIJAU_BG,
              marginBottom: 18,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: predikatColor, letterSpacing: '0.04em' }}>
              PREDIKAT: {predikat.toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: predikatColor, opacity: 0.75 }}>
              {rata != null && rata >= payload.ambang
                ? `di atas ambang ${payload.ambang}`
                : `ambang ${payload.ambang}`}
            </span>
          </div>

          {/* Track cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
            {(b?.tracks ?? []).map((t) => (
              <TrackCard key={t.jenis} track={t} />
            ))}
          </div>

          {/* Akumulasi kesalahan */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#7a766f',
              marginBottom: 8,
            }}
          >
            Akumulasi kesalahan
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 18 }}>
            {(b?.akumulasi ?? []).map((row) => (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  padding: '5px 0',
                  borderBottom: '1px solid #f4f2ed',
                }}
              >
                <span style={{ flex: 1, color: '#44423d' }}>{row.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: row.group === 'jaliy' ? JALIY_C : KHAFIY_C,
                  }}
                >
                  {row.group === 'jaliy' ? 'Jaliy' : 'Khafiy'}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: '#1b1a17',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 16,
                    textAlign: 'right',
                  }}
                >
                  {row.count}
                </span>
              </div>
            ))}
          </div>

          {/* Catatan per sesi */}
          {catatan.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: '#7a766f',
                  marginBottom: 8,
                }}
              >
                Catatan pengajar tiap sesi
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {catatan.map((c, i) => (
                  <div
                    key={`${c.label}-${i}`}
                    style={{
                      background: '#faf8f4',
                      border: '1px solid #e8e4dc',
                      borderRadius: 8,
                      padding: '9px 11px',
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a39a', marginBottom: 2 }}>
                      {c.label}
                      {c.tgl ? ` · ${formatTgl(c.tgl)}` : ''}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.5, color: '#44423d' }}>{c.teks}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* TTD */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              paddingTop: 14,
              borderTop: '1px solid #e8e4dc',
            }}
          >
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ height: 36 }} />
              <div style={{ fontSize: 10, color: '#a8a39a', borderTop: '1px solid #d8d3c8', paddingTop: 4 }}>
                {penerbit}
                <br />
                Pengajar
              </div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ height: 36 }} />
              <div style={{ fontSize: 10, color: '#a8a39a', borderTop: '1px solid #d8d3c8', paddingTop: 4 }}>
                Koordinator
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
