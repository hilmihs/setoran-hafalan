import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKetuaKelompok } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PenilaianPedagogisForm } from './PenilaianPedagogisForm';

export const dynamic = 'force-dynamic';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

export default async function PenilaianPedagogisPage() {
  let session;
  try {
    session = await requireKetuaKelompok();
  } catch {
    redirect('/');
  }

  const ym = currentYearMonth();
  const monthLabel = new Date().toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: 'long',
  });

  const { data: members } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, is_ketua')
    .eq('kelompok_id', session.kelompok_id)
    .eq('active', true)
    .order('name');

  const memberIds = (members ?? []).map((m) => m.id);
  const { data: existing } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select('pengajar_id, skor_metode_pengajaran, keterangan_metode, skor_kepatuhan_silabus, keterangan_silabus, skor_manajemen_halaqah, keterangan_halaqah, skor_evaluasi_penguasaan, keterangan_evaluasi, skor_kepatuhan_sop, keterangan_sop')
    .eq('year_month', ym)
    .in('pengajar_id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']);

  const existingMap = new Map((existing ?? []).map((e) => [e.pengajar_id, e]));

  const membersWithPenilaian = (members ?? [])
    .filter((m) => !m.is_ketua) // ketua tidak menilai diri sendiri
    .map((m) => ({
      id: m.id,
      name: m.name,
      penilaian: existingMap.get(m.id) ?? null,
    }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Link href="/kehadiran/ketua-kelompok" className="btn btn-sm btn-ghost" style={{ textDecoration: 'none' }}>←</Link>
            <div>
              <h1 className="t-h1" style={{ margin: 0 }}>Penilaian Pedagogis</h1>
              <p className="t-small" style={{ margin: 0, color: 'var(--muted-2)' }}>{monthLabel} · skala 0–4 · auto-simpan</p>
            </div>
          </div>

          {membersWithPenilaian.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada anggota kelompok.</p>
          ) : (
            <PenilaianPedagogisForm members={membersWithPenilaian} yearMonth={ym} />
          )}
        </div>
      </div>
    </main>
  );
}
