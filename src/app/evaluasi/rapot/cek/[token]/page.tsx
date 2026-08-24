// Halaman verifikasi keaslian rapot — PUBLIK (tanpa auth).
// Diakses via QR pada rapot cetak: /evaluasi/rapot/cek/<token>.
// Server component: baca row dari evaluasi_rapot lalu render ringkas dari payload.
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { RapotPayload } from '@/lib/rapot';
import { tierOf } from '@/lib/evaluasi';

export const dynamic = 'force-dynamic';

const HIJAU = 'oklch(0.58 0.09 165)';
const HIJAU_TUA = 'oklch(0.40 0.10 150)';
const BG = '#f4f2ed';
const KARTU = '#fff';
const BORDER = '#e8e4dc';
const MUTED = '#7a766f';
const TEKS = '#1b1a17';

function fmtTanggal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        color: TEKS,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        boxSizing: 'border-box',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

export default async function CekRapotPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  const { data: row } = await supabaseAdmin
    .from('evaluasi_rapot')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!row) {
    return (
      <Shell>
        <div
          style={{
            width: '100%',
            maxWidth: 460,
            background: KARTU,
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: '32px 24px',
            textAlign: 'center',
            boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 6px 24px -8px rgba(20,18,14,0.10)',
          }}
        >
          <img src="/logo-mpt.png" alt="Logo" width={44} height={44} style={{ display: 'block', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 17, fontWeight: 800 }}>Rapot tidak ditemukan</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>
            Kode verifikasi tidak dikenali. Pastikan QR dipindai dari rapot resmi.
          </div>
        </div>
      </Shell>
    );
  }

  const payload = row.payload as RapotPayload;
  const isUjian = payload.jenis_rapot === 'ujian';
  const lulus = isUjian ? payload.ujian?.lulus ?? null : null;
  const MERAH = 'oklch(0.55 0.16 25)';
  const MERAH_TUA = 'oklch(0.46 0.14 25)';

  const angka = isUjian
    ? payload.ujian?.nilaiAkhir ?? null
    : payload.berkala?.rataGabungan ?? null;

  // Warna angka besar ikut status. Ujian: lulus hijau / mengulang merah / null netral.
  // Berkala: ikut tier predikat (jangan paksa hijau utk "Cukup"/"Perlu pengulangan").
  const angkaColor = isUjian
    ? lulus === true ? HIJAU : lulus === false ? MERAH : MUTED
    : angka != null ? tierOf(angka).color : MUTED;
  const berkalaPredikatColor = angka != null ? tierOf(angka).color : MUTED;

  // Status lifecycle rapot (0054): dicabut / digantikan menandai dokumen tak berlaku.
  const status = (row.status as string | undefined) ?? 'aktif';
  let banner: { warna: string; bg: string; border: string; teks: string; linkToken?: string } | null = null;
  if (status === 'dicabut') {
    banner = {
      warna: MERAH_TUA,
      bg: 'oklch(0.96 0.04 25)',
      border: 'oklch(0.85 0.08 25)',
      teks: 'Rapot ini telah DICABUT oleh penerbit dan tidak berlaku.',
    };
  } else if (status === 'digantikan') {
    const { data: aktif } = await supabaseAdmin
      .from('evaluasi_rapot')
      .select('token')
      .eq('peserta_id', row.peserta_id as string)
      .eq('halaqah_id', row.halaqah_id as string)
      .eq('jenis_rapot', row.jenis_rapot as string)
      .eq('status', 'aktif')
      .maybeSingle();
    banner = {
      warna: 'oklch(0.45 0.10 75)',
      bg: 'oklch(0.96 0.05 85)',
      border: 'oklch(0.85 0.09 85)',
      teks: 'Rapot ini telah DIPERBARUI. Versi ini bukan lagi yang berlaku.',
      linkToken: (aktif?.token as string | undefined) ?? undefined,
    };
  }

  const identitas = payload.identitas;
  const barisMeta = [identitas.halaqah, identitas.level, identitas.batch]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(' · ');

  return (
    <Shell>
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: KARTU,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: '26px 22px',
          boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 6px 24px -8px rgba(20,18,14,0.10)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: `1px solid ${BORDER}`, paddingBottom: 16, marginBottom: 18 }}>
          <img src="/logo-mpt.png" alt="Logo" width={44} height={44} style={{ display: 'block', margin: '0 auto 10px' }} />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            Cek Keaslian Rapot
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 6 }}>{identitas.peserta}</div>
          {barisMeta && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{barisMeta}</div>}
          <div style={{ marginTop: 12 }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: HIJAU_TUA,
                background: 'oklch(0.96 0.035 150)',
                border: '1px solid oklch(0.85 0.06 150)',
                borderRadius: 999,
                padding: '4px 12px',
              }}
            >
              {isUjian ? 'Ujian Akhir' : 'Berkala'}
            </span>
          </div>
        </div>

        {/* Banner status (dicabut / diperbarui) */}
        {banner && (
          <div
            style={{
              background: banner.bg,
              border: `1px solid ${banner.border}`,
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 800, color: banner.warna }}>{banner.teks}</div>
            {banner.linkToken && (
              <a
                href={`/evaluasi/rapot/cek/${banner.linkToken}`}
                style={{ fontSize: 12, fontWeight: 700, color: HIJAU_TUA, textDecoration: 'underline', marginTop: 6, display: 'inline-block' }}
              >
                Lihat rapot terbaru →
              </a>
            )}
          </div>
        )}

        {/* Angka besar — diredupkan bila rapot tak berlaku (dicabut/digantikan). */}
        <div style={{ textAlign: 'center', marginBottom: 6, opacity: banner ? 0.4 : 1, filter: banner ? 'grayscale(1)' : undefined }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              lineHeight: 1,
              color: angkaColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {angka ?? '—'}
          </div>

          {isUjian ? (
            <>
              <div style={{ marginTop: 14 }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    borderRadius: 999,
                    padding: '6px 16px',
                    color: lulus === true ? HIJAU_TUA : lulus === false ? MERAH_TUA : MUTED,
                    background:
                      lulus === true ? 'oklch(0.96 0.035 150)' : lulus === false ? 'oklch(0.96 0.04 25)' : '#f0eee9',
                    border: `1px solid ${lulus === true ? 'oklch(0.85 0.06 150)' : lulus === false ? 'oklch(0.85 0.08 25)' : BORDER}`,
                  }}
                >
                  {lulus === true ? 'LULUS' : lulus === false ? 'MENGULANG' : 'Belum ada nilai ujian'}
                </span>
              </div>
              {lulus != null && (
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8 }}>ambang {row.ambang}</div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 700, color: berkalaPredikatColor, marginTop: 8 }}>
              {payload.berkala?.predikat ?? '—'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${BORDER}`,
            marginTop: 20,
            paddingTop: 14,
            textAlign: 'center',
            fontSize: 11.5,
            color: MUTED,
            lineHeight: 1.5,
          }}
        >
          Diterbitkan {fmtTanggal(payload.tanggal)} oleh {payload.penerbit}
        </div>
      </div>
    </Shell>
  );
}
