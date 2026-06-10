import { requireKoordinatorHits } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import { ShakwaReviewCard } from './ShakwaReviewCard';
import { ShakwaFilterBar } from './ShakwaFilterBar';

export const dynamic = 'force-dynamic';

type SP = { status?: string; pelapor?: string };

export default async function ShakwaKoordinatorPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const session = await requireKoordinatorHits();

  const statusFilter = searchParams.status ?? null;
  const pelaporFilter = searchParams.pelapor ?? null;

  const genderScope = session.gender;

  let query = supabaseAdmin
    .from('shakwa')
    .select('*')
    .eq('gender', genderScope)
    .order('created_at', { ascending: false })
    .limit(100);

  if (statusFilter) query = query.eq('status', statusFilter);
  if (pelaporFilter) query = query.eq('pelapor_type', pelaporFilter);

  const { data: tickets } = await query;
  const allTickets = tickets ?? [];

  const [
    { count: totalCount },
    { count: submittedCount },
    { count: reviewCount },
    { count: resolvedCount },
  ] = await Promise.all([
    supabaseAdmin.from('shakwa').select('*', { count: 'exact', head: true }).eq('gender', genderScope),
    supabaseAdmin.from('shakwa').select('*', { count: 'exact', head: true }).eq('gender', genderScope).eq('status', 'submitted'),
    supabaseAdmin.from('shakwa').select('*', { count: 'exact', head: true }).eq('gender', genderScope).eq('status', 'in_review'),
    supabaseAdmin.from('shakwa').select('*', { count: 'exact', head: true }).eq('gender', genderScope).eq('status', 'resolved'),
  ]);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> SHAKWA
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="btn btn-sm btn-ghost"
                style={{ height: 30, padding: '0 10px' }}
              >
                {Icon.logout(12)} Keluar
              </button>
            </form>
          </div>

          <FeatureNav current="/shakwa/koordinator" />

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Review SHAKWA
          </h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            {session.name} — Koordinator HITS
          </p>

          {/* Stats */}
          <div
            className="card-flat"
            style={{
              padding: '16px 20px', marginBottom: 20,
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, textAlign: 'center',
            }}
          >
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Total</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{totalCount ?? 0}</div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Baru</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: (submittedCount ?? 0) > 0 ? 'var(--kuning-ink)' : 'inherit' }}>
                {submittedCount ?? 0}
              </div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Ditinjau</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{reviewCount ?? 0}</div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Selesai</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hijau-ink)' }}>{resolvedCount ?? 0}</div>
            </div>
          </div>

          <ShakwaFilterBar
            current={{ status: statusFilter, pelapor: pelaporFilter }}
          />

          {/* Ticket list */}
          <div style={{ marginTop: 16 }}>
            {allTickets.length === 0 ? (
              <div className="card-flat" style={{ padding: '24px 20px', textAlign: 'center' }}>
                <p className="t-body" style={{ color: 'var(--muted-2)' }}>
                  {statusFilter || pelaporFilter ? 'Tidak ada SHAKWA yang cocok dengan filter.' : 'Belum ada SHAKWA masuk.'}
                </p>
              </div>
            ) : (
              allTickets.map((t) => (
                <ShakwaReviewCard key={t.id} shakwa={t} />
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
