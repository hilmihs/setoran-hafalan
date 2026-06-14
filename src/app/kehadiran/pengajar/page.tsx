import { requirePengajar } from '@/lib/session';
import { getProgramsForDate, getUnfilledDates } from '@/lib/attendance';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import { StatCard } from '@/components/ui/StatCard';
import { CheckinForm } from './CheckinForm';
import { getCurrentPekan } from '@/lib/batch';
import type { KetuaKelasInfo } from './CheckinForm';

export const dynamic = 'force-dynamic';

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

export default async function KehadiranPengajarPage() {
  const session = await requirePengajar();
  const today = jakartaToday();

  const todayPrograms = await getProgramsForDate(session.pengajar_id, today);
  const unfilled = await getUnfilledDates(session.pengajar_id, 5);

  const allDates = [...unfilled, ...todayPrograms];

  const checkedDates: string[] = [];
  if (todayPrograms.length > 0) {
    for (const prog of todayPrograms) {
      const query = prog.type === 'program'
        ? supabaseAdmin
            .from('checkin_pengajar')
            .select('id')
            .eq('pengajar_id', session.pengajar_id)
            .eq('program_id', prog.id)
            .eq('tanggal', today)
            .maybeSingle()
        : supabaseAdmin
            .from('checkin_pengajar')
            .select('id')
            .eq('pengajar_id', session.pengajar_id)
            .eq('kelas_hits_id', prog.id)
            .eq('tanggal', today)
            .maybeSingle();
      const { data } = await query;
      if (data) checkedDates.push(`${prog.type}:${prog.id}:${today}`);
    }
  }

  const pendingAlasan = await supabaseAdmin
    .from('pengajuan_alasan')
    .select('id, tanggal, jenis, alasan, status')
    .eq('pengajar_id', session.pengajar_id)
    .eq('status', 'pending')
    .order('tanggal', { ascending: false })
    .limit(5);

  let pekan: number | null = null;
  let kelasList: KetuaKelasInfo[] = [];

  const { data: batch } = await supabaseAdmin
    .from('batch_config')
    .select('id, start_date')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (batch) {
    const weekNum = getCurrentPekan(batch.start_date);
    if (weekNum >= 1 && weekNum <= 2) {
      pekan = weekNum;

      const { data: pengajarKelas } = await supabaseAdmin
        .from('kelas_hits')
        .select('id, name')
        .eq('pengajar_id', session.pengajar_id);

      if (pengajarKelas) {
        for (const k of pengajarKelas) {
          const { data: ketua } = await supabaseAdmin
            .from('ketua_kelas')
            .select('name')
            .eq('kelas_hits_id', k.id)
            .eq('batch_id', batch.id)
            .eq('active', true)
            .maybeSingle();
          kelasList.push({
            kelasHitsId: k.id,
            kelasName: k.name,
            hasKetuaThisBatch: !!ketua,
            currentKetuaName: ketua?.name ?? null,
          });
        }
      }
    }
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Kehadiran
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

          <FeatureNav current="/kehadiran/pengajar" />

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Check-in Kehadiran
          </h1>
          <p className="t-body" style={{ marginBottom: 20, color: 'var(--muted-2)' }}>
            {session.name} — {today}
          </p>

          {todayPrograms.length > 0 && (
            <div className="matrix-stat-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
              <StatCard
                value={`${checkedDates.length}/${todayPrograms.length}`}
                label="Sesi terisi hari ini"
                valueColor={checkedDates.length >= todayPrograms.length ? 'var(--hijau-ink)' : 'var(--kuning-ink)'}
              />
              <StatCard
                value={unfilled.length}
                label="Sesi lampau belum diisi"
                valueColor={unfilled.length > 0 ? 'var(--merah-ink)' : undefined}
              />
            </div>
          )}

          {session.is_ketua && (
            <a
              href="/kehadiran/ketua-kelompok"
              className="card-flat"
              style={{
                display: 'block',
                padding: '12px 16px',
                marginBottom: 16,
                textDecoration: 'none',
                color: 'inherit',
                borderLeft: '3px solid var(--accent)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                Dashboard Ketua Kelompok
              </div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                Lihat & kelola pengajuan alasan anggota kelompok Anda
              </div>
            </a>
          )}

          {allDates.length === 0 ? (
            <div
              className="card-flat"
              style={{ padding: '24px 20px', textAlign: 'center' }}
            >
              <p className="t-body">Tidak ada program hari ini.</p>
              <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
                Semua kehadiran sudah terisi.
              </p>
            </div>
          ) : (
            <>
              {unfilled.length > 0 && (
                <div
                  className="banner"
                  style={{
                    background: 'var(--kuning-tint)',
                    borderColor: 'var(--kuning-line)',
                    marginBottom: 16,
                  }}
                >
                  <span className="ic" style={{ background: 'var(--kuning)', color: '#fff' }}>!</span>
                  <div>
                    <div className="title">Ada {unfilled.length} sesi yang belum diisi</div>
                    <div className="desc">Isi kehadiran di bawah mulai dari yang paling lama.</div>
                  </div>
                </div>
              )}

              <CheckinForm
                programs={allDates}
                checkedKeys={checkedDates}
                pengajarId={session.pengajar_id}
                pengajarGender={session.gender}
                autoPopup={todayPrograms.some(
                  (p) => !checkedDates.includes(`${p.type}:${p.id}:${today}`)
                )}
                kelasList={kelasList}
                pekan={pekan}
              />
            </>
          )}

          {pendingAlasan.data && pendingAlasan.data.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                Pengajuan Alasan (Pending)
              </h2>
              {pendingAlasan.data.map((a) => (
                <div
                  key={a.id}
                  className="card-flat"
                  style={{ padding: '12px 16px', marginBottom: 8 }}
                >
                  <div className="t-small" style={{ fontWeight: 600 }}>
                    {a.tanggal} — {a.jenis}
                  </div>
                  <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                    {a.alasan}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
