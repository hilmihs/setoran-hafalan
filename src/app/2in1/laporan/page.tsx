import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { LaporanFilterBar } from '@/components/LaporanFilterBar';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: { bulan?: string; gender?: string };
}) {
  const s = await getSession();
  if (
    !s.session ||
    (s.session.role !== 'koordinator' && s.session.role !== 'syaikh')
  ) {
    redirect('/');
  }
  const genderParam =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? (searchParams.gender as Gender)
      : s.session.gender;
  const gender: Gender = genderParam;
  const dashboardHref = s.session.role === 'syaikh' ? '/2in1/syaikh' : '/2in1/koordinator';

  // Daftar opsi bulan: 12 bulan ke belakang dari sekarang
  const now = new Date();
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    monthOptions.push({
      value: `${y}-${String(m).padStart(2, '0')}`,
      label: `${BULAN_ID[m - 1]} ${y}`,
    });
  }
  const defaultMonth =
    searchParams.bulan && /^\d{4}-\d{2}$/.test(searchParams.bulan)
      ? searchParams.bulan
      : monthOptions[0].value;

  const downloadUrl = `/api/laporan/download?bulan=${defaultMonth}&gender=${gender}`;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="topbar">
          <Link href={dashboardHref} className="back">
            {Icon.back(12)} dashboard
          </Link>
          <form action={logout}>
            <button type="submit" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
              {Icon.logout(12)} Keluar
            </button>
          </form>
        </div>
        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 6 }}>
            Laporan Bulanan
          </h1>
          <p className="t-body" style={{ marginBottom: 18 }}>
            Rekap setoran + matrix skill tajwid untuk peserta{' '}
            <strong>{gender === 'ikhwan' ? 'ikhwan' : 'akhwat'}</strong>. File XLSX
            berisi 2 sheet: <em>Rekap</em> dan <em>Matrix Skill Tajwid</em>.
          </p>

          <LaporanFilterBar
            monthOptions={monthOptions}
            current={{ bulan: defaultMonth, gender }}
          />

          <a
            href={downloadUrl}
            className="btn btn-block btn-primary"
            download
          >
            Download XLSX — {monthOptions.find((o) => o.value === defaultMonth)?.label} ({gender})
          </a>

          <div className="card-flat" style={{ padding: 14, marginTop: 18 }}>
            <div className="t-tiny" style={{ marginBottom: 6 }}>Catatan</div>
            <p className="t-small" style={{ margin: 0 }}>
              Cutoff bulan: sebuah cycle (2 pekan) masuk ke bulan X jika tanggal akhir
              cycle (= awal + 13 hari) jatuh di bulan X. Cycle yang dimulai akhir
              bulan dan berakhir di bulan berikutnya akan dimasukkan ke bulan berikutnya.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
