import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PenilaianPedagogisForm } from '@/app/kehadiran/ketua-kelompok/penilaian/PenilaianPedagogisForm';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { Icon } from '@/components/icons';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = '2026-01';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}
function monthLabelOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const PED_FIELDS = [
  'skor_metode_pengajaran',
  'keterangan_metode',
  'skor_kepatuhan_silabus',
  'keterangan_silabus',
  'skor_manajemen_halaqah',
  'keterangan_halaqah',
  'skor_evaluasi_penguasaan',
  'keterangan_evaluasi',
  'skor_kepatuhan_sop',
  'keterangan_sop',
  'catatan_umum',
] as const;

const GENDER_TABS: Array<{ key: string; label: string }> = [
  { key: 'akhwat', label: 'Akhwat' },
  { key: 'ikhwan', label: 'Ikhwan' },
];

export default async function PenilaianKetuaKelompokPage({
  searchParams,
}: {
  searchParams: { month?: string; gender?: string };
}) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const koordinator = accesses.find((a) => a.role === 'koordinator') as
    | { role: 'koordinator'; gender: Gender }
    | undefined;
  if (!koordinator) redirect('/2in1/koordinator/login');

  const cur = currentYearMonth();
  const ym = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : cur;
  const gender: Gender =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : koordinator.gender;

  // Semua ketua kelompok segender.
  const { data: ketuaRaw } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, kelompok_id')
    .eq('is_ketua', true)
    .eq('active', true)
    .eq('gender', gender)
    .neq('matrix_exclude', true)
    .order('name');
  const ketuas = (ketuaRaw ?? []) as Array<{ id: string; name: string; kelompok_id: string | null }>;

  const { data: kelompokRaw } = await supabaseAdmin.from('kelompok_pengajar').select('id, name');
  const kelompokName = new Map((kelompokRaw ?? []).map((k: any) => [k.id, k.name as string]));

  const ketuaIds = ketuas.map((k) => k.id);
  const noId = ['00000000-0000-0000-0000-000000000000'];
  const { data: existing } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select(PED_FIELDS.join(', ') + ', pengajar_id')
    .eq('year_month', ym)
    .in('pengajar_id', ketuaIds.length ? ketuaIds : noId);
  const existingMap = new Map((existing ?? []).map((e: any) => [e.pengajar_id, e]));

  const members = ketuas.map((k) => ({
    id: k.id,
    name: `${k.name}${k.kelompok_id ? ` — ${kelompokName.get(k.kelompok_id) ?? ''}` : ''}`,
    penilaian: existingMap.get(k.id) ?? null,
  }));

  const belum = members.filter((m) => !m.penilaian).length;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Penilaian Ketua Kelompok
          </div>
          <Link href="/2in1/koordinator" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page" style={{ paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <h1 className="t-h1" style={{ margin: 0 }}>Penilaian Pedagogis — Ketua Kelompok</h1>
              <p className="t-small" style={{ margin: 0, color: 'var(--muted-2)' }}>
                Skala 0–4 · auto-simpan · dinilai oleh koordinator ·{' '}
                <strong style={{ color: belum ? 'var(--merah-ink)' : 'var(--hijau-ink)' }}>
                  {belum} belum dinilai
                </strong>
              </p>
            </div>
            <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={ym} />
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {GENDER_TABS.map((t) => {
              const active = t.key === gender;
              const params = new URLSearchParams();
              params.set('month', ym);
              params.set('gender', t.key);
              return (
                <Link
                  key={t.key}
                  href={`?${params.toString()}`}
                  className={active ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          {members.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada ketua kelompok untuk gender ini.</p>
          ) : (
            <>
              <div className="t-tiny" style={{ marginBottom: 8 }}>EDIT {monthLabelOf(ym).toUpperCase()}</div>
              <PenilaianPedagogisForm key={`${ym}:${gender}`} members={members} yearMonth={ym} readOnly={false} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
