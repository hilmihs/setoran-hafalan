import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { qrSvgDataUri } from '@/lib/qr';
import type { RapotPayload } from '@/lib/rapot';
import RapotBerkalaA4 from '../RapotBerkalaA4';
import RapotUjianA4 from '../RapotUjianA4';
import PrintButton from '../PrintButton';
import CabutButton from '../CabutButton';

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

  // URL verifikasi absolut + QR. Pakai NEXT_PUBLIC_APP_URL sbg basis kanonik agar
  // QR selalu menunjuk domain publik walau dicetak dari host lain (LAN/preview).
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  let verifyUrl: string;
  if (base) {
    verifyUrl = `${base}/evaluasi/rapot/cek/${token}`;
  } else {
    const h = await headers();
    const host = h.get('host');
    const proto = host?.includes('localhost') ? 'http' : 'https';
    verifyUrl = `${proto}://${host}/evaluasi/rapot/cek/${token}`;
  }
  const qr = await qrSvgDataUri(verifyUrl);

  return (
    <div>
      <style>
        {'@page{size:A4;margin:0} @media print{.noprint{display:none}} body{background:#fff}'}
      </style>
      {(row.status as string | undefined) && row.status !== 'aktif' && (
        <div
          style={{
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
      {payload.jenis_rapot === 'berkala' ? (
        <RapotBerkalaA4 payload={payload} qr={qr} logoSrc="/logo-mpt.png" />
      ) : (
        <RapotUjianA4 payload={payload} qr={qr} logoSrc="/logo-mpt.png" />
      )}
      <PrintButton />
      <CabutButton token={token} status={(row.status as string | undefined) ?? 'aktif'} />
    </div>
  );
}
