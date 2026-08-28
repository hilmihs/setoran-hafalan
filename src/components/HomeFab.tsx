'use client';

import { usePathname } from 'next/navigation';

/**
 * Tombol "Beranda" mengambang — dirender dari root layout supaya SEMUA halaman
 * punya jalan pulang ke `/` tanpa perlu menambah link satu per satu di ~100 page.
 *
 * `/` sendiri disembunyikan (sudah di rumah). Halaman cetak juga (`.no-print`).
 * Bagi user satu-peran, `/` me-redirect balik ke landing perannya — jadi tombol
 * ini efektif berfungsi sebagai "kembali ke dashboard saya".
 */
export function HomeFab() {
  const pathname = usePathname();

  if (pathname === '/') return null;

  return (
    <a
      href="/"
      aria-label="Kembali ke beranda"
      title="Kembali ke beranda"
      className="no-print"
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        height: 44,
        padding: '0 16px 0 13px',
        borderRadius: 22,
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--line-2)',
        boxShadow: '0 2px 8px rgba(20,18,14,0.14)',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
        zIndex: 9998,
      }}
    >
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M3.5 8.6 10 3.2l6.5 5.4V16a1 1 0 0 1-1 1h-3v-4.6h-5V17h-3a1 1 0 0 1-1-1V8.6Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      Beranda
    </a>
  );
}
