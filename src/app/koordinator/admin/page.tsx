import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { SeedCard } from '@/components/SeedCard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function KoordinatorAdminPage() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'koordinator') {
    redirect('/koordinator/login');
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="topbar">
          <Link href="/koordinator" className="back">
            {Icon.back(12)} dashboard
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px' }}
            >
              {Icon.logout(12)} Keluar
            </button>
          </form>
        </div>

        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 6 }}>
            Admin Seed
          </h1>
          <p className="t-body" style={{ marginBottom: 18 }}>
            Jalankan seed/reset langsung dari sini tanpa perlu SSH ke server.
            Setiap eksekusi minta password koordinator sebagai konfirmasi.
            Operasi <strong>destruktif</strong> tidak bisa di-undo — pastikan
            data benar sebelum klik konfirmasi.
          </p>

          <SeedCard
            seedKey="syaikh"
            title="Syaikh & Ustadzah"
            description="Wipe tabel syaikh, lalu insert ulang: Syaikh Ahmad Asy-Syahari (ikhwan) + Ustadzah Radiatam Mardhiyah (akhwat). Password default password123."
            destructive
          />

          <SeedCard
            seedKey="itsnain"
            title="Akhwat — Itsnain Fi Wahid"
            description="Wipe semua data akhwat (peserta + kelas + musyrifah + setoran + file audio storage), lalu re-seed 5 musyrifah + 5 kelas Maahir (Alif/Ba/Dal/Ha pagi/Ha siang) + ~50 peserta akhwat. Ikhwan tidak disentuh."
            destructive
          />

          <SeedCard
            seedKey="maahir"
            title="Ikhwan — Maahir"
            description="Wipe semua data ikhwan (peserta + kelas + musyrif + setoran), lalu re-seed 5 musyrif + 5 kelas (Alif/Ba/Jim/Dal/Ha) + 40 peserta ikhwan. Akhwat tidak disentuh."
            destructive
          />

          <SeedCard
            seedKey="reset-setoran"
            title="Reset semua setoran"
            description="Hapus SEMUA setoran + rekaman (peserta dan musyrif). Akun + kelas tidak dihapus. File audio di storage TIDAK dihapus (jalankan cleanup-audio dari CLI terpisah)."
            destructive
          />

          <SeedCard
            seedKey="peserta-password"
            title="Backfill password peserta"
            description="Set password 'maahir123' ke peserta yang password_hash NULL. Aditif — tidak menimpa password yang sudah ada. Aman dijalankan kapanpun."
            destructive={false}
          />

          <div className="card-flat" style={{ padding: 14, marginTop: 18 }}>
            <div className="t-tiny" style={{ marginBottom: 6 }}>Tips</div>
            <ul className="t-small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Setelah seed, peserta/musyrif baru bisa login dengan password default — minta mereka ganti via /akun.</li>
              <li>Eksekusi memakan waktu beberapa detik sampai ~30 detik untuk yang besar (seed-itsnain, seed-maahir).</li>
              <li>Kalau timeout, log tetap dilanjutkan di server — refresh setelah ~1 menit lalu cek hasilnya di dashboard.</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
