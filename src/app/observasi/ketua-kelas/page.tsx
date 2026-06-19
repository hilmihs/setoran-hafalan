import { redirect } from 'next/navigation';
import { requireKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import { StatCard } from '@/components/ui/StatCard';
import { ObservasiForm } from './ObservasiForm';
import type { ObservasiKelas } from '@/types/db';

export const dynamic = 'force-dynamic';

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

export default async function KetuaKelasObservasiPage() {
  const session = await requireKetuaKelas();
  // Ketua kelas HITS (batch-native) pakai halaman /hits/ketua, bukan observasi lama.
  if (session.hits_halaqah_id) redirect('/hits/ketua');
  const today = jakartaToday();

  const { data: kelas } = await supabaseAdmin
    .from('kelas_hits')
    .select('id, name, pengajar_id')
    .eq('id', session.kelas_hits_id)
    .maybeSingle();

  let pengajarName = 'Pengajar';
  if (kelas?.pengajar_id) {
    const { data: pengajar } = await supabaseAdmin
      .from('pengajar')
      .select('name')
      .eq('id', kelas.pengajar_id)
      .maybeSingle();
    if (pengajar) pengajarName = pengajar.name;
  }

  const { data: observasiRows } = await supabaseAdmin
    .from('observasi_kelas')
    .select('*')
    .eq('kelas_hits_id', session.kelas_hits_id)
    .order('tanggal', { ascending: false })
    .limit(30);

  const history: ObservasiKelas[] = observasiRows ?? [];

  const todayExists = history.some((r) => r.tanggal === today);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Observasi Kelas
            </div>
            <LogoutButton />
          </div>

          <FeatureNav current="/observasi/ketua-kelas" />

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            {kelas?.name ?? 'Halaqah'}
          </h1>
          <p className="t-body" style={{ marginBottom: 4 }}>
            Pengajar: {pengajarName}
          </p>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            {session.name} (Ketua Kelas) — {today}
          </p>

          <div className="matrix-stat-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
            <StatCard value={history.length} label="Observasi tercatat" />
            <StatCard
              value={todayExists ? 'Terisi' : 'Belum'}
              label="Observasi hari ini"
              valueColor={todayExists ? 'var(--hijau-ink)' : 'var(--kuning-ink)'}
              dotColor={todayExists ? 'var(--hijau)' : 'var(--kuning)'}
            />
          </div>

          <ObservasiForm
            kelasName={kelas?.name ?? 'Halaqah'}
            pengajarName={pengajarName}
            todayDate={today}
            todayUnfilled={!todayExists}
            history={history}
          />
        </div>
      </div>
    </main>
  );
}
