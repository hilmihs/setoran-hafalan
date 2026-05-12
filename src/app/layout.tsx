import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Setoran Hafalan',
  description: 'Sistem setoran hafalan pekanan',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
