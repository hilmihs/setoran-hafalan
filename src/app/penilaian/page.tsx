import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { currentYearMonth } from '@/lib/week';
import { FeatureNav } from '@/components/FeatureNav';
import { PenilaianMasyaikhForm } from '@/components/PenilaianMasyaikhForm';

export const dynamic = 'force-dynamic';

export default async function PenilaianPage() {
  const s = await getSession();
  const session = s.session;
  if (!session || (session.role !== 'koordinator' && session.role !== 'syaikh')) {
    redirect('/');
  }

  const { year, month, label: monthLabel } = currentYearMonth();
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  const { data: allKelompok } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name')
    .order('name');

  const { data: allPengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, kelompok_id, is_ketua')
    .eq('active', true)
    .order('name');

  const pengajarIds = (allPengajar ?? []).map((p) => p.id);

  const { data: existingPenilaian } = await supabaseAdmin
    .from('penilaian_masyaikh')
    .select('id, pengajar_id, skor_bacaan, keterangan_bacaan, skor_hafalan, keterangan_hafalan, assessor_role')
    .eq('year_month', yearMonth)
    .in('pengajar_id', pengajarIds.length ? pengajarIds : ['00000000-0000-0000-0000-000000000000']);

  const penilaianByPengajar = new Map<string, {
    skor_bacaan: number | null;
    keterangan_bacaan: string | null;
    skor_hafalan: number | null;
    keterangan_hafalan: string | null;
    assessor_role: string | null;
  }>();
  for (const p of existingPenilaian ?? []) {
    penilaianByPengajar.set(p.pengajar_id, {
      skor_bacaan: p.skor_bacaan,
      keterangan_bacaan: p.keterangan_bacaan,
      skor_hafalan: p.skor_hafalan,
      keterangan_hafalan: p.keterangan_hafalan,
      assessor_role: p.assessor_role,
    });
  }

  const kelompokMap = new Map((allKelompok ?? []).map((k) => [k.id, k]));
  const pengajarWithPenilaian = (allPengajar ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    gender: p.gender as 'ikhwan' | 'akhwat',
    is_ketua: p.is_ketua,
    kelompokLabel: kelompokMap.get(p.kelompok_id)?.name ?? null,
    penilaian: penilaianByPengajar.get(p.id) ?? null,
  }));

  // Urut: kelompok → ketua dulu → nama
  const sortPengajar = <T extends { kelompokLabel: string | null; is_ketua: boolean; name: string }>(arr: T[]) =>
    [...arr].sort((a, b) =>
      (a.kelompokLabel ?? '').localeCompare(b.kelompokLabel ?? '', 'id', { numeric: true }) ||
      Number(b.is_ketua) - Number(a.is_ketua) ||
      a.name.localeCompare(b.name, 'id')
    );

  const ikhwanList = sortPengajar(pengajarWithPenilaian.filter((p) => p.gender === 'ikhwan'));
  const akhwatList = sortPengajar(pengajarWithPenilaian.filter((p) => p.gender === 'akhwat'));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="dash-header">
        <div className="grp">
          <Link href="/" className="wordmark">
            <span className="mark">M</span>Maahir
          </Link>
          <span style={{ width: 1, height: 16, background: 'var(--line-2)' }} />
          <span className="t-small" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
            Penilaian Pengajar
          </span>
        </div>
        <div className="grp">
          <Link href="/akun" className="btn btn-sm btn-ghost" style={{ height: 32, padding: '0 12px', textDecoration: 'none' }}>
            Akun
          </Link>
          <LogoutButton />
        </div>
      </div>

      <div className="dash-body" style={{ maxWidth: 800 }}>
        <FeatureNav current="/penilaian" />

        <div>
          <h1 className="t-h1" style={{ fontSize: 22, marginBottom: 4 }}>
            Penilaian Pengajar — {monthLabel}
          </h1>
          <p className="t-small">
            Kualitas Bacaan &amp; Hafalan pengajar (skala 0–4). Ketuk angka (atau tekan 0–4 saat
            baris fokus). Lihat “Panduan Standar Skala” untuk kriteria tiap nilai. Tersimpan otomatis.
          </p>
        </div>

        {ikhwanList.length === 0 && akhwatList.length === 0 && (
          <p className="t-body">Belum ada pengajar aktif.</p>
        )}

        <PenilaianMasyaikhForm pengajarList={ikhwanList} yearMonth={yearMonth} title="Ikhwan" />
        <PenilaianMasyaikhForm
          pengajarList={akhwatList}
          yearMonth={yearMonth}
          title="Akhwat"
          defaultCollapsed={ikhwanList.length > 0}
        />
      </div>
    </main>
  );
}
