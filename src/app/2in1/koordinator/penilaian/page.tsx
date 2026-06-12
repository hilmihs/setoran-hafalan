import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentYearMonth } from '@/lib/week';
import { PenilaianPesertaForm } from '@/components/PenilaianPesertaForm';

export const dynamic = 'force-dynamic';

export default async function KoordinatorPenilaianPage() {
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
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href="/2in1/koordinator" className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">Penilaian Peserta</div>
          <div className="sub">{monthLabel}</div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        <p className="t-small" style={{ marginBottom: 16, color: 'var(--muted-2)' }}>
          Skor bacaan dan hafalan 0–4 per peserta bulan ini. Auto-simpan saat nilai berubah.
        </p>

        {ikhwanList.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div className="section-row" style={{ marginBottom: 8 }}>
              <div className="t-tiny">Ikhwan</div>
            </div>
            <PenilaianPesertaForm
              pesertaList={ikhwanList}
              yearMonth={yearMonth}
              assessorRole={session.role as 'koordinator' | 'syaikh'}
            />
          </div>
        )}

        {akhwatList.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div className="section-row" style={{ marginBottom: 8 }}>
              <div className="t-tiny">Akhwat</div>
            </div>
            <PenilaianPesertaForm
              pesertaList={akhwatList}
              yearMonth={yearMonth}
              assessorRole={session.role as 'koordinator' | 'syaikh'}
            />
          </div>
        )}
      </div>
    </main>
  );
}
