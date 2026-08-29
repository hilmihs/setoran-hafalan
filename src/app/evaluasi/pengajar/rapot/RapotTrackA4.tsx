import type { ReactElement } from 'react';
import type { RapotPayloadTrack, RapotTrackSnap, RapotLahnRow } from '@/lib/rapot';
import RapotKop from './RapotKop';

// Rapot Evaluasi per-track (0062) — halaman cetak A4 SATU lembar (794×1123px),
// presentasional murni: tanpa 'use client', tanpa hooks, tanpa fetch.
//
// Satu dokumen = satu track (QN atau PB) dan memuat SELURUH isinya:
// seluruh sesi evaluasi berkala track itu + ujian akhir track itu.
// Nilai akhir = 30% rata sesi berkala track + 70% ujian track, ambang lulus 70.
//
// Komponen ini terparameterisasi track (bukan dua file kembar): semua yang
// berbeda antara QN dan PB datang dari `payload.trackRapot` —
// `track`/`label` (judul & penamaan) dan `peran` (kalimat status).
//
// Dua bentuk khusus yang wajib ditangani, keduanya datang dari data:
// - `ujianSaja` (batch `eval_batch.rapot_ujian_terpisah`): tidak ada sesi berkala
//   sama sekali, `berkalaAvg` null dan `akumulasi` kosong. Bagian A dan C diganti
//   keterangan — jangan cetak tabel 4 sesi kosong atau tabel bobot 30/70 kosong.
// - `nilaiAkhir` null (komponen belum lengkap): tampilkan em-dash, bukan angka 0.

interface Props {
  payload: RapotPayloadTrack;
  /** QR verifikasi. Kosong = rapot belum diterbitkan (pratinjau/cetak dari aplikasi). */
  qr?: string;
  logoSrc: string;
}

const GREEN_DARK = 'oklch(0.40 0.10 150)';
const RED = 'oklch(0.46 0.14 25)';
const MUTED = '#7a766f';
const INK = '#1b1a17';
const FAINT = '#a8a39a';
const BORDER = '#e8e4dc';
const BORDER_STRONG = '#d8d3c8';
const CARD_BG = '#faf8f4';
const HEAD_BG = '#efece5';

const ID_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const PAGE: React.CSSProperties = {
  width: 794,
  minHeight: 1123,
  background: '#ffffff',
  color: INK,
  padding: '32px 48px 14px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 7,
};

const HEAD: React.CSSProperties = {
  background: HEAD_BG,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#44423d',
};

function fmtTanggal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtTgl(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Angka nilai; null → em-dash (JANGAN jatuh ke 0). */
function num(v: number | null): string {
  return v == null ? '—' : String(v);
}

/** Satu desimal gaya id-ID — untuk kolom kontribusi bobot. */
function num1(n: number): string {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Tabel 4 sesi berkala. SALINAN visual `TrackTable` dari RapotBerkalaA4 — file itu
// beku (melayani rapot lama yang sudah beredar), jadi sengaja tidak diimpor
// maupun diekstrak agar perubahan di sini tak pernah menyentuh cetakan lama.
function TrackTable({ track }: { track: RapotTrackSnap }): ReactElement {
  const accent = track.jenis === 'qn' ? 'oklch(0.46 0.09 165)' : 'oklch(0.44 0.10 210)';
  const cols = '1fr 64px';
  return (
    <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          padding: '5px 10px',
          background: CARD_BG,
          borderBottom: `1px solid ${BORDER_STRONG}`,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: accent,
        }}
      >
        {track.label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          alignItems: 'center',
          background: HEAD_BG,
          borderBottom: `1px solid ${BORDER_STRONG}`,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          color: '#44423d',
        }}
      >
        <div style={{ padding: '6px 0 6px 10px' }}>Sesi</div>
        <div style={{ padding: '6px 10px 6px 0', textAlign: 'center' }}>Skor</div>
      </div>
      {track.history.map((skor, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: cols,
            alignItems: 'center',
            fontSize: 11.5,
            borderBottom: '1px solid #f4f2ed',
          }}
        >
          <div style={{ padding: '5px 0 5px 10px', fontWeight: 700 }}>S{i + 1}</div>
          <div
            style={{
              padding: '5px 10px 5px 0',
              textAlign: 'center',
              fontWeight: 800,
              color: skor == null ? FAINT : INK,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {num(skor)}
          </div>
        </div>
      ))}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          alignItems: 'center',
          fontSize: 11.5,
          background: HEAD_BG,
        }}
      >
        <div style={{ padding: '6px 0 6px 10px', fontWeight: 800 }}>Rata-rata</div>
        <div
          style={{
            padding: '6px 10px 6px 0',
            textAlign: 'center',
            fontWeight: 800,
            color: GREEN_DARK,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {num(track.rata)}
        </div>
      </div>
    </div>
  );
}

function IdentRow({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider: boolean;
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '5px 0',
        borderBottom: divider ? '1px solid #efece5' : undefined,
      }}
    >
      <span style={{ width: 96, fontSize: 11, color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

/** Kotak keterangan pengganti tabel (dipakai bagian A & C saat `ujianSaja`). */
function Keterangan({ teks }: { teks: string }): ReactElement {
  return (
    <div
      style={{
        border: `1px dashed ${BORDER_STRONG}`,
        borderRadius: 8,
        background: CARD_BG,
        padding: '11px 14px',
        fontSize: 12,
        color: '#44423d',
        textWrap: 'pretty',
      }}
    >
      {teks}
    </div>
  );
}

/**
 * Gabung akumulasi kesalahan sesi berkala dengan rincian kesalahan ujian jadi
 * satu daftar baris dua kolom. Urut menurun total supaya kesalahan terbanyak
 * naik ke atas; baris yang nol di kedua kolom tidak pernah muncul (kedua sumber
 * sudah difilter nonzero di builder).
 */
function gabungLahn(
  akumulasi: RapotLahnRow[],
  rincianUjian: RapotLahnRow[],
): { key: string; label: string; group: 'jaliy' | 'khafiy'; berkala: number; ujian: number }[] {
  const map = new Map<string, { key: string; label: string; group: 'jaliy' | 'khafiy'; berkala: number; ujian: number }>();
  const ambil = (r: RapotLahnRow) => {
    const cur = map.get(r.key);
    if (cur) return cur;
    const baru = { key: r.key, label: r.label, group: r.group, berkala: 0, ujian: 0 };
    map.set(r.key, baru);
    return baru;
  };
  for (const r of akumulasi) ambil(r).berkala += r.count;
  for (const r of rincianUjian) ambil(r).ujian += r.count;
  return [...map.values()].sort((a, b) => b.berkala + b.ujian - (a.berkala + a.ujian));
}

export default function RapotTrackA4({ payload, qr, logoSrc }: Props): ReactElement {
  const { identitas, trackRapot: t } = payload;

  const trackUp = t.track.toUpperCase(); // 'QN' | 'PB'
  const ujianLabel = `Ujian ${trackUp}`;

  // Varian kalimat peran: PB menentukan kelulusan level, QN sekadar prasyarat.
  const peranTeks =
    t.peran === 'prasyarat'
      ? `Rapot QN adalah prasyarat. Kelulusan level ditentukan Rapot PB.`
      : `Menentukan kelulusan level.`;

  // Keterangan pengganti bagian A & C untuk batch tanpa sesi evaluasi berkala.
  const ketUjianSaja = `Nilai akhir 100% dari ${ujianLabel} (batch tanpa sesi evaluasi berkala).`;

  const lulus = t.lulus;
  const statusColor = lulus === true ? GREEN_DARK : lulus === false ? RED : MUTED;
  const statusText = lulus === true ? 'LULUS' : lulus === false ? 'MENGULANG' : 'BELUM LENGKAP';
  const statusBg =
    lulus === true ? 'oklch(0.96 0.035 150)' : lulus === false ? 'oklch(0.96 0.03 25)' : CARD_BG;
  const statusKet =
    lulus === true
      ? `Memenuhi ambang kelulusan nilai akhir (${payload.ambang}). ${peranTeks}`
      : lulus === false
        ? `Belum memenuhi ambang kelulusan nilai akhir (${payload.ambang}). ${peranTeks}`
        : `Nilai akhir belum dapat ditetapkan karena komponen penilaian belum lengkap. ${peranTeks}`;

  const halaqahVal = [identitas.halaqah, identitas.gender].filter(Boolean).join(' · ');
  const levelVal = identitas.level ?? (identitas.mustawa != null ? String(identitas.mustawa) : '—');
  const batchVal = identitas.batch ?? '—';

  const idRows: { label: string; value: string }[] = [
    { label: 'Nama peserta', value: identitas.peserta },
    { label: 'Halaqah', value: halaqahVal || '—' },
    { label: 'Level', value: levelVal },
    { label: 'Batch', value: batchVal },
    { label: 'Penguji', value: payload.penerbit },
    { label: 'Jenis rapot', value: `${t.label} · ${t.peran === 'penentu' ? 'penentu kelulusan' : 'prasyarat'}` },
  ];

  // Komponen 30/70 — hanya relevan bila ada sesi berkala.
  const kontribBerkala = t.berkalaAvg == null ? null : 0.3 * t.berkalaAvg;
  const kontribUjian = t.ujianSkor == null ? null : 0.7 * t.ujianSkor;
  const rawAkhir =
    t.berkalaAvg == null || t.ujianSkor == null ? null : 0.3 * t.berkalaAvg + 0.7 * t.ujianSkor;

  const barisLahn = gabungLahn(t.akumulasi, t.rincianUjian);
  const totalBerkala = barisLahn.reduce((a, r) => a + r.berkala, 0);
  const totalUjian = barisLahn.reduce((a, r) => a + r.ujian, 0);
  const lahnGrid = '1fr 84px 118px 118px';

  const komponenGrid = '1fr 110px 100px 120px';
  const ujianGrid = '1fr 78px 78px 74px 130px';

  return (
    <div className="a4-sheet" style={PAGE}>
      <RapotKop
        identitas={identitas}
        logoSrc={logoSrc}
        sub={batchVal !== '—' ? `Halaqah ${identitas.halaqah} · Batch ${batchVal}` : undefined}
        pageLabel={`Rapot ${trackUp}`}
      />

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.06em' }}>
          RAPOT {t.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
          {t.ujianSaja
            ? `${ujianLabel} · ${peranTeks}`
            : `Sesi evaluasi berkala ${trackUp} & ${ujianLabel} · ${peranTeks}`}
        </div>
      </div>

      {/* Pita status: nilai akhir + kelulusan + predikat */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          border: `2px solid ${statusColor}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            flex: 1,
            background: statusBg,
            padding: '14px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: statusColor,
              opacity: 0.8,
            }}
          >
            Dinyatakan
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '0.05em',
              lineHeight: 1.05,
              color: statusColor,
              marginTop: 4,
            }}
          >
            {statusText}
          </div>
          <div style={{ fontSize: 11.5, color: statusColor, opacity: 0.85, marginTop: 6, textWrap: 'pretty' }}>
            {statusKet}
          </div>
        </div>
        <div
          style={{
            width: 200,
            background: '#ffffff',
            borderLeft: `2px solid ${statusColor}`,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            Nilai akhir {trackUp}
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 800,
              lineHeight: 1,
              color: statusColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {num(t.nilaiAkhir)}
          </div>
          <div style={{ fontSize: 11, color: FAINT, fontWeight: 600 }}>dari 100</div>
          <div
            style={{
              marginTop: 7,
              padding: '5px 12px',
              borderRadius: 999,
              background: statusBg,
              border: `1px solid ${statusColor}`,
              fontSize: 11,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              color: statusColor,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {t.nilaiAkhir == null ? '—' : `Predikat ${t.predikat}`}
          </div>
        </div>
      </div>

      {/* Identitas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0 32px',
          padding: '9px 16px',
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          marginBottom: 14,
        }}
      >
        {idRows.map((r, i) => (
          <IdentRow key={r.label} label={r.label} value={r.value} divider={i < 4} />
        ))}
      </div>

      {/* A. Nilai sesi berkala — diganti keterangan bila batch tanpa sesi berkala. */}
      <div style={SECTION_LABEL}>A. Nilai sesi evaluasi berkala {trackUp}</div>
      {t.ujianSaja ? (
        <div style={{ marginBottom: 14 }}>
          <Keterangan teks={ketUjianSaja} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14, marginBottom: 14 }}>
          <TrackTable track={t.berkala} />
          <div
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              background: CARD_BG,
              padding: '9px 12px',
              fontSize: 11,
              color: '#44423d',
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, marginBottom: 5 }}>
              Catatan sesi
            </div>
            {t.berkala.catatan.length === 0 ? (
              <div style={{ color: FAINT }}>Tidak ada catatan sesi.</div>
            ) : (
              t.berkala.catatan.map((c, i) => (
                <div key={i} style={{ marginBottom: 4, textWrap: 'pretty' }}>
                  <span style={{ fontWeight: 700 }}>{c.label}</span>
                  <span style={{ color: FAINT }}> · {fmtTgl(c.tgl)}</span>
                  <span> — {c.teks}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* B. Ujian track ini */}
      <div style={SECTION_LABEL}>B. {ujianLabel}</div>
      <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: ujianGrid, alignItems: 'center', ...HEAD }}>
          <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}` }}>Ujian</div>
          <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Jaliy</div>
          <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Khafiy</div>
          <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Skor</div>
          <div style={{ padding: '8px 14px' }}>Tanggal</div>
        </div>
        {t.ujian ? (
          <div style={{ display: 'grid', gridTemplateColumns: ujianGrid, alignItems: 'center', fontSize: 12 }}>
            <div style={{ padding: '9px 14px', borderRight: `1px solid ${BORDER}`, fontWeight: 700 }}>
              {t.ujian.label}
            </div>
            <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {t.ujian.jaliy}
            </div>
            <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {t.ujian.khafiy}
            </div>
            <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {num(t.ujian.skor)}
            </div>
            <div style={{ padding: '9px 14px', color: MUTED }}>{fmtTgl(t.ujian.tgl)}</div>
          </div>
        ) : (
          <div style={{ padding: '11px 14px', fontSize: 12, color: FAINT }}>
            {ujianLabel} belum dinilai.
          </div>
        )}
      </div>

      {/* C. Komponen nilai akhir 30/70 — diganti keterangan bila `ujianSaja`. */}
      <div style={SECTION_LABEL}>C. Komponen nilai akhir</div>
      {t.ujianSaja ? (
        <div style={{ marginBottom: 6 }}>
          <Keterangan teks={ketUjianSaja} />
        </div>
      ) : (
        <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: komponenGrid, alignItems: 'center', ...HEAD }}>
            <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}` }}>Komponen</div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Nilai</div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Bobot</div>
            <div style={{ padding: '8px', textAlign: 'center' }}>Kontribusi</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: komponenGrid, alignItems: 'center', fontSize: 12, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER}` }}>
              Sesi evaluasi berkala
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                Rata-rata sesi {trackUp} yang dinilai
              </div>
            </div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {num(t.berkalaAvg)}
            </div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>30%</div>
            <div style={{ padding: '8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {kontribBerkala == null ? '—' : num1(kontribBerkala)}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: komponenGrid, alignItems: 'center', fontSize: 12, borderBottom: `1px solid ${BORDER_STRONG}` }}>
            <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER}` }}>
              {ujianLabel}
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>Skor ujian akhir track ini</div>
            </div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {num(t.ujianSkor)}
            </div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>70%</div>
            <div style={{ padding: '8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {kontribUjian == null ? '—' : num1(kontribUjian)}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: komponenGrid, alignItems: 'center', fontSize: 12, background: HEAD_BG }}>
            <div style={{ padding: '9px 14px', borderRight: `1px solid ${BORDER_STRONG}`, fontWeight: 800 }}>
              Nilai akhir {trackUp}
            </div>
            <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER_STRONG}` }} />
            <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center', fontWeight: 700 }}>100%</div>
            <div style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
              {rawAkhir == null ? num(t.nilaiAkhir) : `${num1(rawAkhir)} → ${num(t.nilaiAkhir)}`}
            </div>
          </div>
        </div>
      )}
      <div style={{ fontSize: 9.5, color: FAINT, marginBottom: 14 }}>
        Skor = 100 − (Lahn Jaliy × 6) − (Lahn Khafiy × 2).{' '}
        {t.ujianSaja
          ? `Nilai akhir = skor ${ujianLabel} (ambang lulus ${payload.ambang}).`
          : `Nilai akhir = 30% rata-rata sesi berkala ${trackUp} + 70% ${ujianLabel} (ambang lulus ${payload.ambang}).`}{' '}
        {peranTeks}
      </div>

      {/* D. Akumulasi kesalahan: sesi berkala vs ujian */}
      <div style={SECTION_LABEL}>D. Akumulasi kesalahan</div>
      <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: lahnGrid, alignItems: 'center', ...HEAD }}>
          <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}` }}>Jenis kesalahan</div>
          <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}` }}>Kelompok</div>
          <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Sesi berkala</div>
          <div style={{ padding: '8px', textAlign: 'center' }}>{ujianLabel}</div>
        </div>
        {barisLahn.length === 0 ? (
          <div style={{ padding: '11px 14px', fontSize: 12, color: FAINT }}>Tidak ada kesalahan tercatat.</div>
        ) : (
          barisLahn.map((r) => {
            const isJaliy = r.group === 'jaliy';
            return (
              <div
                key={r.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: lahnGrid,
                  alignItems: 'center',
                  fontSize: 11.5,
                  borderBottom: '1px solid #f4f2ed',
                }}
              >
                <div style={{ padding: '6px 14px', borderRight: '1px solid #f4f2ed', color: '#44423d' }}>{r.label}</div>
                <div
                  style={{
                    padding: '6px 8px',
                    borderRight: '1px solid #f4f2ed',
                    fontSize: 10,
                    fontWeight: 700,
                    color: isJaliy ? RED : 'oklch(0.48 0.10 75)',
                  }}
                >
                  {isJaliy ? 'Jaliy' : 'Khafiy'}
                </div>
                {/* `ujianSaja` → tidak ada sesi berkala sama sekali: em-dash, bukan 0. */}
                <div style={{ padding: '6px 8px', borderRight: '1px solid #f4f2ed', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {t.ujianSaja ? '—' : r.berkala || '–'}
                </div>
                <div style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {t.ujian == null ? '—' : r.ujian || '–'}
                </div>
              </div>
            );
          })
        )}
        <div style={{ display: 'grid', gridTemplateColumns: lahnGrid, alignItems: 'center', fontSize: 12, background: HEAD_BG }}>
          <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}`, fontWeight: 800 }}>Total</div>
          <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}` }} />
          <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {t.ujianSaja ? '—' : totalBerkala}
          </div>
          <div style={{ padding: '8px', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {t.ujian == null ? '—' : totalUjian}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 9.5, color: FAINT, marginBottom: 14 }}>
        Lahn Jaliy dihitung −6 poin per kesalahan, Lahn Khafiy −2 poin per kesalahan. Kolom &ldquo;Sesi
        berkala&rdquo; menjumlahkan seluruh sesi {trackUp} yang dinilai.
      </div>

      {/* E. Catatan penguji */}
      <div style={SECTION_LABEL}>E. Catatan penguji</div>
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '11px 16px',
          background: CARD_BG,
          fontSize: 12,
          lineHeight: 1.6,
          color: '#44423d',
          textWrap: 'pretty',
        }}
      >
        {t.catatanPenguji.trim() || 'Tidak ada catatan penguji.'}
      </div>

      {/* QR + tanda tangan */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 20,
          paddingTop: 22,
        }}
      >
        {qr ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR verifikasi rapot" style={{ width: 62, height: 62, display: 'block' }} />
            <div style={{ fontSize: 8.5, color: FAINT }}>Cek keaslian rapot</div>
          </div>
        ) : (
          <div style={{ fontSize: 8.5, color: FAINT, maxWidth: 190, lineHeight: 1.5 }}>
            Cetakan pratinjau — rapot belum diterbitkan, jadi belum ada QR verifikasi.
          </div>
        )}
        <div style={{ display: 'flex', gap: 28, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>{fmtTanggal(payload.tanggal)}</div>
            <div style={{ fontSize: 11, color: MUTED }}>Penguji</div>
            <div style={{ height: 34 }} />
            <div style={{ fontSize: 12, fontWeight: 700, borderTop: `1px solid ${INK}`, paddingTop: 4, minWidth: 150 }}>
              {payload.penerbit}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>&nbsp;</div>
            <div style={{ fontSize: 11, color: MUTED }}>Koordinator</div>
            <div style={{ height: 34 }} />
            <div style={{ fontSize: 12, fontWeight: 700, borderTop: `1px solid ${INK}`, paddingTop: 4, minWidth: 150 }}>
              &nbsp;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
