import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { currentYearMonth } from '@/lib/week';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import { PenilaianPesertaForm } from '@/components/PenilaianPesertaForm';

export const dynamic = 'force-dynamic';

export default async function PenilaianPage() {
  const s = await getSession();
  const session = s.session;
  if (!session || (session.role !== 'koordinator' && session.role !== 'syaikh')) {
    redirect('/');
  }

  const { year, month, label: monthLabel } = currentYearMonth();
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  const { data: allKelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender')
    .order('name');

  const { data: allPeserta } = await supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas_id')
    .eq('active', true)
    .order('name');

  const pesertaIds = (allPeserta ?? []).map((p) => p.id);

  const { data: existingPenilaian } = await supabaseAdmin
    .from('penilaian_peserta')
    .select('id, peserta_id, skor_bacaan, ket_bacaan, skor_hafalan, ket_hafalan, assessor_role')
    .eq('year_month', yearMonth)
    .in('peserta_id', pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000']);

  const penilaianByPeserta = new Map<string, {
    skor_bacaan: number | null;
    ket_bacaan: string | null;
    skor_hafalan: number | null;
    ket_hafalan: string | null;
    assessor_role: string | null;
  }>();
  for (const p of existingPenilaian ?? []) {
    penilaianByPeserta.set(p.peserta_id, {
      skor_bacaan: p.skor_bacaan,
      ket_bacaan: p.ket_bacaan,
      skor_hafalan: p.skor_hafalan,
      ket_hafalan: p.ket_hafalan,
      assessor_role: p.assessor_role,
    });
  }

  const kelasMap = new Map((allKelas ?? []).map((k) => [k.id, k]));
  const pesertaWithPenilaian = (allPeserta ?? []).map((p) => ({
    ...p,
    kelas: kelasMap.get(p.kelas_id) ?? null,
    penilaian: penilaianByPeserta.get(p.id) ?? null,
  }));

  const ikhwanList = pesertaWithPenilaian.filter((p) => p.gender === 'ikhwan');
  const akhwatList = pesertaWithPenilaian.filter((p) => p.gender === 'akhwat');

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="dash-header">
        <div className="grp">
          <Link href="/" className="wordmark">
            <span className="mark">M</span>Maahir
          </Link>
          <span style={{ width: 1, height: 16, background: 'var(--line-2)' }} />
          <span className="t-small" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
            Penilaian Peserta
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
            Penilaian Peserta — {monthLabel}
          </h1>
          <p className="t-small">
            Skor bacaan &amp; hafalan 0–4. Ketuk angka (atau tekan 0–4 saat baris fokus).
            Tersimpan otomatis.
          </p>
        </div>

        {ikhwanList.length === 0 && akhwatList.length === 0 && (
          <p className="t-body">Belum ada peserta aktif.</p>
        )}

        <PenilaianPesertaForm pesertaList={ikhwanList} yearMonth={yearMonth} title="Ikhwan" />
        <PenilaianPesertaForm
          pesertaList={akhwatList}
          yearMonth={yearMonth}
          title="Akhwat"
          defaultCollapsed={ikhwanList.length > 0}
        />
      </div>
    </main>
  );
}
