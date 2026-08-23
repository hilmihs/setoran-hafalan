'use client';

interface SetupProps {
  judul: string;
  sesiLabel: string;
  halaqahLine: string;
  pesertaCount: number;
  isUjian: boolean;
  ambangUjian: number;
  mustawa: number | null;
  /** Nomor sesi yang aktif (bisa dipilih). Untuk ujian, yang di-soft-delete tak masuk sini. */
  sesiOptions: number[];
  activeSession: number;
  /** Label per sesi (index 0-based). Bila kosong → "Sesi N". Dipakai ujian akhir: "Ujian QN"/"Ujian PB". */
  sesiOptionLabels?: string[];
  pickSession: (n: number) => void;
  /** Ujian only: nomor sesi yang sudah dihapus (untuk dipulihkan). */
  deletedOptions?: number[];
  /** Ujian only: hapus/pulihkan sesi. */
  onToggleSesi?: (n: number, dihapus: boolean) => void;
  back: () => void;
  lanjut: () => void;
}

export function Setup(props: SetupProps) {
  const canDelete = !!props.onToggleSesi && props.sesiOptions.length > 1;
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
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 10 }}>{props.isUjian ? 'Ujian yang mana?' : 'Evaluasi ke berapa?'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            {props.sesiOptions.map((n) => {
              const on = n === props.activeSession;
              return (
                <div key={n} style={{ position: 'relative' }}>
                  <button
                    onClick={() => props.pickSession(n)}
                    style={{ width: '100%', height: 44, borderRadius: 8, border: `1.5px solid ${on ? '#1b1a17' : '#ffffff'}`, background: on ? '#1b1a17' : '#ffffff', color: on ? '#ffffff' : '#44423d', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {props.sesiOptionLabels?.[n - 1] ?? `Sesi ${n}`}
                  </button>
                  {canDelete && (
                    <button
                      aria-label="Hapus sesi ini"
                      title="Hapus sesi ini"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onToggleSesi?.(n, true);
                      }}
                      style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 10, border: '1px solid #e8e4dc', background: '#ffffff', color: 'oklch(0.55 0.14 25)', fontSize: 12, lineHeight: '18px', cursor: 'pointer', padding: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {props.isUjian && !!props.deletedOptions?.length && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {props.deletedOptions.map((n) => (
                <button
                  key={n}
                  onClick={() => props.onToggleSesi?.(n, false)}
                  style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px dashed #d8d3c8', background: '#faf8f4', color: '#7a766f', font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  ↩ Pulihkan {props.sesiOptionLabels?.[n - 1] ?? `Sesi ${n}`}
                </button>
              ))}
            </div>
          )}
          {props.isUjian && (
            <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 10 }}>
              Halaqah yang cukup satu ujian akhir bisa menghapus sesi yang tak dipakai. Minimal satu sesi harus tetap ada.
            </div>
          )}
        </div>

        {props.isUjian && (
          <div style={{ background: 'oklch(0.96 0.035 85)', border: '1px solid oklch(0.88 0.07 82)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.50 0.09 70)' }}>Ambang kelulusan: {props.ambangUjian} / 100</div>
            <div style={{ fontSize: 11, color: 'oklch(0.50 0.09 70)', opacity: 0.85, marginTop: 3 }}>
              Ditetapkan koordinator untuk Mustawa {props.mustawa ?? '—'}. Skor di bawah ambang direkomendasikan mengulang.
            </div>
          </div>
        )}

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
