import Link from 'next/link';
import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { syncMatrixIfStale, type MatrixRow } from '@/lib/matrix-compute';
import { MatrixDashboard, type MatrixListItem } from '@/components/matrix/MatrixDashboard';
import { Initials } from '@/components/icons';

export const dynamic = 'force-dynamic';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1)); // m-1 = current, m-2 = prev
  return d.toISOString().slice(0, 7);
}

export default async function Matrix2in1Page({
  searchParams,
}: {
  searchParams: { bulan?: string };
}) {
  const session = await requireOneOfRoles(['koordinator', 'syaikh']);

  const ym = searchParams.bulan && /^\d{4}-\d{2}$/.test(searchParams.bulan)
    ? searchParams.bulan
    : currentYearMonth();
  const prevMonth = prevYm(ym);

  // Sinkron hemat (skip bila segar / historis), lalu baca snapshot dari matrix_rekap.
  await syncMatrixIfStale(ym);
  const { data: matrixRows } = await supabaseAdmin.from('matrix_rekap').select('*').eq('year_month', ym);
  const rows = (matrixRows ?? []) as MatrixRow[];

  // Fetch pengajar metadata
  const { data: pengajarList } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, kelompok:kelompok_id(name)')
    .eq('active', true);
  const pengajarMap = new Map(
    (pengajarList ?? []).map((p) => [p.id, {
      name: p.name as string,
      gender: p.gender as 'ikhwan' | 'akhwat',
      kelompok: (p.kelompok as unknown as { name: string } | null)?.name ?? '—',
    }])
  );

  // Query snapshot bulan lalu — read-only, JANGAN recompute
  const { data: prevRows } = await supabaseAdmin
    .from('matrix_rekap')
    .select('pengajar_id, rata_rata_keseluruhan, ranking')
    .eq('year_month', prevMonth);
  const prevMap = new Map(
    (prevRows ?? []).map((r) => [
      r.pengajar_id as string,
      {
        total: r.rata_rata_keseluruhan != null ? Number(r.rata_rata_keseluruhan) : null,
        ranking: r.ranking != null ? Number(r.ranking) : null,
      },
    ])
  );

  // Build DTO
  const items: MatrixListItem[] = rows
    .map((r) => {
      const pg = pengajarMap.get(r.pengajar_id);
      if (!pg) return null;
      const prev = prevMap.get(r.pengajar_id);
      const total = r.rata_rata_keseluruhan != null ? Number(r.rata_rata_keseluruhan) : null;
      const ranking = r.ranking != null ? Number(r.ranking) : null;
      const deltaTotal =
        total !== null && prev?.total != null
          ? Math.round((total - prev.total) * 10) / 10
          : null;
      const deltaRank =
        ranking !== null && prev?.ranking != null
          ? prev.ranking - ranking // positive = improved
          : null;
      return {
        id: r.pengajar_id,
        name: pg.name,
        gender: pg.gender,
        kelompok: pg.kelompok,
        hard: r.rata_rata_hard_skill != null ? Number(r.rata_rata_hard_skill) : null,
        ped: r.rata_rata_pedagogis != null ? Number(r.rata_rata_pedagogis) : null,
        soft: r.rata_rata_soft_skill != null ? Number(r.rata_rata_soft_skill) : null,
        total,
        ranking,
        deltaTotal,
        deltaRank,
      } satisfies MatrixListItem;
    })
    .filter((it): it is MatrixListItem => it !== null);

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
    <main style={{ minHeight: '100vh' }}>
      {/* Topbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={backHref} className="topbar back" style={{ marginRight: 4 }}>
            ← Kembali
          </Link>
          <span style={{ width: 1, height: 14, background: 'var(--line-2)' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              Matrix Skill Guru
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {monthLabel} · {items.length} pengajar
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            className="avatar"
            style={{
              width: 28,
              height: 28,
              fontSize: 11,
              background: 'var(--accent-tint)',
              color: 'var(--accent-2)',
            }}
          >
            <Initials name={session.name} />
          </div>
          <a
            href={`/api/matrix/download?bulan=${ym}`}
            className="btn btn-sm btn-ghost"
            style={{ height: 32, padding: '0 10px', textDecoration: 'none', fontSize: 12 }}
          >
            Unduh CSV
          </a>
        </div>
      </div>

      {/* Client dashboard */}
      <div style={{ paddingTop: 16 }}>
        <MatrixDashboard
          items={items}
          ym={ym}
          monthLabel={monthLabel}
          monthOptions={monthOptions}
        />
      </div>
    </main>
  );
}
