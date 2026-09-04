import { supabaseAdmin } from '@/lib/supabase-admin';
import { absUrl } from '@/lib/url';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { qrSvgDataUri } from '@/lib/qr';
import type { RapotPayload } from '@/lib/rapot';
import { isRapotTrack } from '@/lib/rapot';
import RapotBerkalaA4 from '../RapotBerkalaA4';
import RapotUjianA4 from '../RapotUjianA4';
import RapotTrackA4 from '../RapotTrackA4';
import PrintButton from '../PrintButton';
import CabutButton from '../CabutButton';
import RapotPrintStyle from '../RapotPrintStyle';
import AutoPrint from '../AutoPrint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function Kartu({ judul, teks }: { judul: string; teks: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f4f2ed',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #e8e4dc',
          borderRadius: 14,
          padding: '28px 32px',
          maxWidth: 420,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1b1a17' }}>{judul}</div>
        <div style={{ marginTop: 8, fontSize: 13, color: '#7a766f' }}>{teks}</div>
      </div>
    </div>
  );
}

/**
 * Pilih komponen cetak sesuai bentuk payload.
 *
 * `row.payload` di-cast ke `RapotPayload` tanpa validasi apa pun, jadi baris yang
 * rusak / setengah migrasi bisa sampai ke sini tanpa `jenis_rapot`. Tanpa penjaga
 * pertama, `isRapotTrack` langsung mendereferensikan `undefined` dan halaman 500.
 */
function RapotDokumen({ payload, qr }: { payload: RapotPayload; qr: string }) {
  const takDikenali = (
    <Kartu
      judul="Format rapot tidak dikenali"
      teks="Format rapot tidak dikenali — hubungi koordinator."
    />
  );

  const jenis = (payload as { jenis_rapot?: unknown } | null | undefined)?.jenis_rapot;
  if (typeof jenis !== 'string') return takDikenali;

  if (isRapotTrack(payload)) {
    return <RapotTrackA4 payload={payload} qr={qr} logoSrc="/logo-mpt.png" />;
  }
  if (payload.jenis_rapot === 'berkala') {
    return <RapotBerkalaA4 payload={payload} qr={qr} logoSrc="/logo-mpt.png" />;
  }
  if (
    payload.jenis_rapot === 'ujian' ||
    payload.jenis_rapot === 'ujian_qn' ||
    payload.jenis_rapot === 'ujian_pb'
  ) {
    return <RapotUjianA4 payload={payload} qr={qr} logoSrc="/logo-mpt.png" />;
  }
  return takDikenali;
}

export default async function RapotPengajarPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  // Auth pengajar.
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const pengajar = accesses.find((a) => a.role === 'pengajar') as
    | { role: 'pengajar'; pengajar_id: string }
    | undefined;
  if (!pengajar) {
    return <Kartu judul="Tidak diizinkan" teks="Silakan login sebagai pengajar." />;
  }

  const { data: row } = await supabaseAdmin
    .from('evaluasi_rapot')
    .select('token, halaqah_id, payload, status')
    .eq('token', token)
    .maybeSingle();

  if (!row) {
    return <Kartu judul="Rapot tidak ditemukan" teks="Token tidak valid atau sudah dihapus." />;
  }

  // Verifikasi kepemilikan halaqah.
  const { data: halaqah } = await supabaseAdmin
    .from('eval_halaqah')
    .select('id, pengajar_id')
    .eq('id', row.halaqah_id)
    .maybeSingle();
  const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
  if (!halaqah || !evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
    return <Kartu judul="Bukan halaqah Anda" teks="Rapot ini bukan milik halaqah Anda." />;
  }

  const payload = row.payload as RapotPayload;

  // URL verifikasi absolut + QR. Wajib lewat absUrl(): QR ini tercetak di kertas
  // dan tidak bisa ditarik kembali, jadi ia tidak boleh pernah memuat host
  // internal. Header `Host` di balik reverse proxy VPS bisa berisi 0.0.0.0:3000
  // (lihat catatan yang sama di src/middleware.ts), dan NEXT_PUBLIC_APP_URL bisa
  // saja kosong di prod — variabel rahasia Azure tidak otomatis masuk printenv.
  // absUrl() menutup dua-duanya dengan fallback ke domain produksi.
  const verifyUrl = absUrl(`/evaluasi/rapot/cek/${token}`);
  const qr = await qrSvgDataUri(verifyUrl);

  return (
    <div className="a4-print-wrap">
      <RapotPrintStyle />
      <AutoPrint token={token} />
      {(row.status as string | undefined) && row.status !== 'aktif' && (
        <div
          className="a4-banner"
          style={{
            maxWidth: 794,
            margin: '0 auto 12px',
            background: 'oklch(0.96 0.04 25)',
            border: '1px solid oklch(0.85 0.08 25)',
            color: 'oklch(0.46 0.14 25)',
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 13,
            padding: '10px 14px',
          }}
        >
          {row.status === 'dicabut'
            ? 'RAPOT DICABUT — TIDAK BERLAKU'
            : 'RAPOT DIGANTIKAN — ADA VERSI TERBARU'}
        </div>
      )}
      {/*
        Bungkus `.a4-stack` wajib: rapot track terdiri dari dua `.a4-sheet`, dan
        aturan cetak mematikan pemisah halaman lewat `.a4-sheet:last-child`.
        Tanpa pembungkus ini, `:last-child` di dalam `.a4-print-wrap` adalah
        tombol Cetak/Cabut — jadi lembar terakhir tetap memaksa page-break dan
        setiap cetakan berakhir dengan satu halaman kosong.
      */}
      <div className="a4-stack">
        <RapotDokumen payload={payload} qr={qr} />
      </div>
      <PrintButton />
      <CabutButton token={token} status={(row.status as string | undefined) ?? 'aktif'} />
    </div>
  );
}
