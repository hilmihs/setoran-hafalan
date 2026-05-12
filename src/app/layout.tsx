import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Setoran Hafalan — Maahir',
  description: 'Setoran pekanan, pemeriksaan, dan monitoring dalam satu alur.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${sans.variable} ${mono.variable}`}>
      <body
        className="antialiased"
        style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif', margin: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
