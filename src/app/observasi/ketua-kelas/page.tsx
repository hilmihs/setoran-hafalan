import { requireKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { ObservasiForm } from './ObservasiForm';
import type { ObservasiKelas } from '@/types/db';

export const dynamic = 'force-dynamic';

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

export default async function KetuaKelasObservasiPage() {
  const session = await requireKetuaKelas();
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

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            {kelas?.name ?? 'Halaqah'}
          </h1>
          <p className="t-body" style={{ marginBottom: 4 }}>
            Pengajar: {pengajarName}
          </p>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            {session.name} (Ketua Kelas) — {today}
          </p>

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
