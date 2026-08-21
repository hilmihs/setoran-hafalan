'use client';

interface SetupProps {
  judul: string;
  sesiLabel: string;
  halaqahLine: string;
  pesertaCount: number;
  isUjian: boolean;
  ambangUjian: number;
  mustawa: number | null;
  maxSessions: number;
  activeSession: number;
  pickSession: (n: number) => void;
  surat: string;
  setSurat: (v: string) => void;
  ayatMulai: number;
  setAyatMulai: (v: number) => void;
  ayatSelesai: number;
  setAyatSelesai: (v: number) => void;
  back: () => void;
  lanjut: () => void;
}

const SURAT_OPTIONS = ['Al-Baqarah', "Ali 'Imran", 'An-Nisa'];

export function Setup(props: SetupProps) {
  const sesiOptions = Array.from({ length: props.maxSessions }, (_, i) => i + 1);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc' }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e8e4dc', background: '#ffffff', color: '#44423d', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{props.judul}</div>
          <div style={{ fontSize: 11, color: '#7a766f' }}>{props.sesiLabel}</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 6 }}>Halaqah</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{props.halaqahLine}</div>
          <div style={{ fontSize: 12, color: '#7a766f', marginTop: 2 }}>{props.pesertaCount} peserta terdaftar</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 10 }}>Evaluasi ke berapa?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            {sesiOptions.map((n) => {
              const on = n === props.activeSession;
              return (
                <button
                  key={n}
                  onClick={() => props.pickSession(n)}
                  style={{ height: 44, borderRadius: 8, border: `1.5px solid ${on ? '#1b1a17' : '#ffffff'}`, background: on ? '#1b1a17' : '#ffffff', color: on ? '#ffffff' : '#44423d', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  Sesi {n}
                </button>
              );
            })}
          </div>
        </div>

        {props.isUjian && (
          <div style={{ background: 'oklch(0.96 0.035 85)', border: '1px solid oklch(0.88 0.07 82)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.50 0.09 70)' }}>Ambang kelulusan: {props.ambangUjian} / 100</div>
            <div style={{ fontSize: 11, color: 'oklch(0.50 0.09 70)', opacity: 0.85, marginTop: 3 }}>
              Ditetapkan koordinator untuk Mustawa {props.mustawa ?? '—'}. Skor di bawah ambang direkomendasikan mengulang.
            </div>
          </div>
        )}

        <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 10 }}>Materi · surat &amp; ayat</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#44423d', marginBottom: 5 }}>Surat</div>
            <select
              value={props.surat}
              onChange={(e) => props.setSurat(e.target.value)}
              style={{ width: '100%', height: 44, padding: '0 14px', background: '#ffffff', border: '1px solid #d8d3c8', borderRadius: 8, font: 'inherit', fontSize: 14, color: '#1b1a17' }}
            >
              {SURAT_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#44423d', marginBottom: 5 }}>Ayat mulai</div>
              <input
                type="number"
                value={props.ayatMulai}
                onChange={(e) => props.setAyatMulai(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="ev-num"
                style={{ width: '100%', height: 44, padding: '0 14px', background: '#ffffff', border: '1px solid #d8d3c8', borderRadius: 8, font: 'inherit', fontSize: 14, color: '#1b1a17', fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#44423d', marginBottom: 5 }}>Ayat selesai</div>
              <input
                type="number"
                value={props.ayatSelesai}
                onChange={(e) => props.setAyatSelesai(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="ev-num"
                style={{ width: '100%', height: 44, padding: '0 14px', background: '#ffffff', border: '1px solid #d8d3c8', borderRadius: 8, font: 'inherit', fontSize: 14, color: '#1b1a17', fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 8 }}>Default mengikuti silabus pertemuan bulan ini — ubah bila perlu.</div>
        </div>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ padding: '10px 16px 20px' }}>
        <button
          onClick={props.lanjut}
          className="ev-dark"
          style={{ width: '100%', height: 50, borderRadius: 8, border: 'none', background: '#1b1a17', color: '#ffffff', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Lanjut ke daftar peserta →
        </button>
      </div>
    </>
  );
}
