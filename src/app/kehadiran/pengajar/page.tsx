import { redirect } from 'next/navigation';
import { requirePengajar } from '@/lib/session';
import { getProgramsForDate, getUnfilledDates } from '@/lib/attendance';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CheckinForm } from './CheckinForm';
import type { ProgramToday } from '@/lib/attendance';

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

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Kehadiran
            </div>
            <a href="/" className="btn-ghost" style={{ fontSize: 14 }}>
              Menu
            </a>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Check-in Kehadiran
          </h1>
          <p className="t-body" style={{ marginBottom: 20, color: 'var(--muted-2)' }}>
            {session.name} — {today}
          </p>

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
                borderLeft: '3px solid var(--primary)',
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
                  style={{
                    background: 'var(--warning-bg, #fff8e1)',
                    border: '1px solid var(--warning-border, #ffe082)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 16,
                  }}
                >
                  <p className="t-small" style={{ fontWeight: 600 }}>
                    Ada {unfilled.length} sesi yang belum diisi
                  </p>
                  <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                    Isi kehadiran di bawah mulai dari yang paling lama.
                  </p>
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
