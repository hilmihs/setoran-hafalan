import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeMatrixForMonth } from '@/lib/matrix-compute';

export const dynamic = 'force-dynamic';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(1);
}

function skorColor(n: number | null): string {
  if (n === null || n === undefined) return 'var(--muted-2)';
  if (n >= 3) return 'var(--hijau-ink)';
  if (n >= 2) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}

export default async function Matrix2in1Page({
  searchParams,
}: {
  searchParams: { bulan?: string; gender?: string };
}) {
  const s = await getSession();
  const session = s.session;
  if (!session || (session.role !== 'koordinator' && session.role !== 'syaikh')) {
    redirect('/');
  }

  const ym = searchParams.bulan && /^\d{4}-\d{2}$/.test(searchParams.bulan)
    ? searchParams.bulan
    : currentYearMonth();
  const genderFilter = searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
    ? searchParams.gender
    : null;

  // Hitung ulang matrix bulan ini (idempotent)
  const rows = await computeMatrixForMonth(ym);

  const { data: pengajarList } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, kelompok:kelompok_id(name)')
    .eq('active', true);
  const pengajarMap = new Map(
    (pengajarList ?? []).map((p) => [p.id, {
      name: p.name,
      gender: p.gender as string,
      kelompok: (p.kelompok as unknown as { name: string } | null)?.name ?? '—',
    }])
  );

  const visible = rows.filter((r) => {
    const pg = pengajarMap.get(r.pengajar_id);
    if (!pg) return false;
    if (genderFilter && pg.gender !== genderFilter) return false;
    return true;
  });

  const monthLabel = new Date(ym + '-01T00:00:00').toLocaleDateString('id-ID', {
    year: 'numeric', month: 'long',
  });

  // Bulan-bulan pilihan: 6 terakhir
  const monthOptions: string[] = [];
  {
    const [y, m] = currentYearMonth().split('-').map(Number);
    for (let i = 0; i < 6; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      monthOptions.push(d.toISOString().slice(0, 7));
    }
  }

  const backHref = session.role === 'syaikh' ? '/2in1/syaikh' : '/2in1/koordinator';

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href={backHref} className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">Matrix Skill Guru</div>
          <div className="sub">{monthLabel} · {visible.length} pengajar</div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {monthOptions.map((m) => (
            <Link
              key={m}
              href={`?bulan=${m}${genderFilter ? `&gender=${genderFilter}` : ''}`}
              className={`btn btn-xs ${m === ym ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11, textDecoration: 'none' }}
            >
              {new Date(m + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })}
            </Link>
          ))}
          <span style={{ flex: 1 }} />
          {(['ikhwan', 'akhwat'] as const).map((g) => (
            <Link
              key={g}
              href={`?bulan=${ym}${genderFilter === g ? '' : `&gender=${g}`}`}
              className={`btn btn-xs ${genderFilter === g ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11, textDecoration: 'none' }}
            >
              {g}
            </Link>
          ))}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 70px 70px 70px 70px',
              gap: 4,
              padding: '6px 8px',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--muted-2)',
            }}>
              <div>#</div>
              <div>Pengajar</div>
              <div style={{ textAlign: 'center' }}>Hard</div>
              <div style={{ textAlign: 'center' }}>Pedagogis</div>
              <div style={{ textAlign: 'center' }}>Soft</div>
              <div style={{ textAlign: 'center' }}>Total</div>
            </div>

            {visible.map((r) => {
              const pg = pengajarMap.get(r.pengajar_id)!;
              return (
                <Link
                  key={r.pengajar_id}
                  href={`/2in1/koordinator/matrix/${r.pengajar_id}?bulan=${ym}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 70px 70px 70px 70px',
                    gap: 4,
                    padding: '10px 8px',
                    background: 'var(--bg-card)',
                    borderRadius: 8,
                    marginBottom: 4,
                    alignItems: 'center',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted-2)' }}>
                      {r.ranking ?? '—'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{pg.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted-2)' }}>{pg.kelompok} · {pg.gender}</div>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: skorColor(r.rata_rata_hard_skill) }}>
                      {fmt(r.rata_rata_hard_skill)}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: skorColor(r.rata_rata_pedagogis) }}>
                      {fmt(r.rata_rata_pedagogis)}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: skorColor(r.rata_rata_soft_skill) }}>
                      {fmt(r.rata_rata_soft_skill)}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: skorColor(r.rata_rata_keseluruhan) }}>
                      {fmt(r.rata_rata_keseluruhan)}
                    </div>
                  </div>
                </Link>
              );
            })}

            {visible.length === 0 && (
              <p className="t-small" style={{ color: 'var(--muted-2)', padding: 12 }}>
                Belum ada data pengajar.
              </p>
            )}
          </div>
        </div>

        <p className="t-tiny" style={{ marginTop: 14, color: 'var(--muted-2)' }}>
          Skor dihitung otomatis dari: penilaian bacaan/hafalan, nilai rekaman setoran (tajwid),
          kehadiran 3 program, penilaian pedagogis + SOP ketua kelompok, observasi kelas HITS,
          dan check-in pengajar. Tap baris untuk detail 15 indikator.
        </p>
      </div>
    </main>
  );
}
