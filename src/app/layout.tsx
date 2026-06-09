import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { getActiveSession } from '@/lib/session';
import { ReportErrorButton } from '@/components/ReportErrorButton';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { RoleAccess } from '@/types/db';

const ROLE_LABELS: Record<string, string> = {
  peserta: 'Peserta',
  musyrif: 'Musyrif',
  koordinator: 'Koordinator',
  syaikh: 'Syaikh',
  pengajar: 'Pengajar',
  koordinator_hits: 'Koordinator HITS',
  ketua_kelas: 'Ketua Kelas',
  koordinator_ketua_kelas: 'Koordinator Ketua Kelas',
};

const ROLE_DASHBOARD: Record<string, string> = {
  peserta: '/2in1/peserta',
  musyrif: '/2in1/musyrif',
  koordinator: '/2in1/koordinator',
  syaikh: '/2in1/syaikh',
  pengajar: '/kehadiran/pengajar',
  koordinator_hits: '/kehadiran/koordinator',
  ketua_kelas: '/observasi/ketua-kelas',
  koordinator_ketua_kelas: '/observasi/koordinator',
};

const ROLE_TABLE: Record<string, { table: string; idField: string }> = {
  peserta: { table: 'peserta', idField: 'peserta_id' },
  musyrif: { table: 'musyrif', idField: 'musyrif_id' },
  koordinator: { table: 'koordinator', idField: 'koordinator_id' },
  syaikh: { table: 'syaikh', idField: 'syaikh_id' },
  pengajar: { table: 'pengajar', idField: 'pengajar_id' },
  koordinator_hits: { table: 'koordinator_hits', idField: 'koordinator_hits_id' },
  ketua_kelas: { table: 'ketua_kelas', idField: 'ketua_kelas_id' },
  koordinator_ketua_kelas: { table: 'koordinator_ketua_kelas', idField: 'koordinator_kk_id' },
};

async function getWaNumber(session: RoleAccess): Promise<string | null> {
  const entry = ROLE_TABLE[session.role];
  if (!entry) return null;
  const id = (session as unknown as Record<string, unknown>)[entry.idField] as string | undefined;
  if (!id) return null;
  const { data } = await supabaseAdmin
    .from(entry.table)
    .select('whatsapp_number')
    .eq('id', id)
    .maybeSingle();
  return data?.whatsapp_number ?? null;
}

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
  title: 'Muhajir Project Tilawah',
  description: 'Platform setoran hafalan, kehadiran pengajar, dan monitoring observasi.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getActiveSession();
  const waNumber = session ? await getWaNumber(session) : null;
  const user = session
    ? {
        name: session.name,
        role: session.role,
        roleLabel: ROLE_LABELS[session.role] ?? session.role,
        dashboardPath: ROLE_DASHBOARD[session.role] ?? '/',
        whatsappNumber: waNumber ?? undefined,
      }
    : null;

  return (
    <html lang="id" className={`${sans.variable} ${mono.variable}`}>
      <body
        className="antialiased"
        style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif', margin: 0 }}
      >
        {children}
        <ReportErrorButton user={user} />
      </body>
    </html>
  );
}
