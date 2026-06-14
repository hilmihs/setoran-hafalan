import Link from 'next/link';

export default function ShakwaLandingPage() {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> SHAKWA
            </div>
            <a href="/" className="btn-ghost" style={{ fontSize: 14 }}>
              Menu
            </a>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            SHAKWA
          </h1>
          <p className="t-body" style={{ color: 'var(--muted-2)', marginBottom: 24 }}>
            Sampaikan laporan, saran, atau kendala terkait program HITS.
          </p>

          <p className="t-small" style={{ fontWeight: 600, marginBottom: 12 }}>
            Anda ingin menyampaikan sebagai:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link
              href="/shakwa/peserta"
              className="card-flat"
              style={{
                display: 'block',
                padding: '16px 20px',
                textDecoration: 'none',
                color: 'inherit',
                borderLeft: '3px solid var(--accent)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Peserta</div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                Pengunduran diri, saran & kritik untuk program HITS
              </div>
            </Link>

            <Link
              href="/shakwa/pengajar"
              className="card-flat"
              style={{
                display: 'block',
                padding: '16px 20px',
                textDecoration: 'none',
                color: 'inherit',
                borderLeft: '3px solid var(--accent)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Pengajar</div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                Evaluasi, presensi, izin, grup halaqoh, modul, dan lainnya
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
