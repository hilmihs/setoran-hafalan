import { requireKoordinatorHits } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import { StatCard } from '@/components/ui/StatCard';
import { MiniDistribution } from '@/components/ui/MiniDistribution';
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
            <LogoutButton />
          </div>

          <FeatureNav current="/shakwa/koordinator" />

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Review SHAKWA
          </h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            {session.name} — Koordinator HITS
          </p>

          {/* Stats */}
          <div className="matrix-stat-grid" style={{ marginBottom: 12 }}>
            <StatCard value={totalCount ?? 0} label="Total" />
            <StatCard
              value={submittedCount ?? 0}
              label="Baru"
              dotColor="var(--kuning)"
              valueColor={(submittedCount ?? 0) > 0 ? 'var(--kuning-ink)' : undefined}
            />
            <StatCard value={reviewCount ?? 0} label="Ditinjau" dotColor="var(--accent)" />
            <StatCard value={resolvedCount ?? 0} label="Selesai" dotColor="var(--hijau)" valueColor="var(--hijau-ink)" />
          </div>

          {(totalCount ?? 0) > 0 && (
            <div className="card-flat" style={{ padding: 14, marginBottom: 20 }}>
              <div className="t-tiny" style={{ marginBottom: 8 }}>Distribusi status</div>
              <MiniDistribution
                segments={[
                  { value: submittedCount ?? 0, color: 'var(--kuning)', label: 'Baru' },
                  { value: reviewCount ?? 0, color: 'var(--accent)', label: 'Ditinjau' },
                  { value: resolvedCount ?? 0, color: 'var(--hijau)', label: 'Selesai' },
                ]}
              />
            </div>
          )}

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
