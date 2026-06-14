import { requireKoordinatorHits } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildWaMeUrl, tplReminderKetuaKelompokTugas } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import { StatCard } from '@/components/ui/StatCard';
import { MiniDistribution } from '@/components/ui/MiniDistribution';
import { LiburForm } from './LiburForm';

export const dynamic = 'force-dynamic';

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

export default async function KoordinatorKehadiranPage() {
  const session = await requireKoordinatorHits();
  const ym = currentYearMonth();

  const { data: kelompokList } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name, gender')
    .eq('gender', session.gender)
    .order('name');

  const { data: allPengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, kelompok_id, is_ketua, whatsapp_number')
    .eq('gender', session.gender)
    .eq('active', true)
    .order('name');

  const { data: checkins } = await supabaseAdmin
    .from('checkin_pengajar')
    .select('id, pengajar_id, tanggal, status, is_terlambat, invalidated_at')
    .in('pengajar_id', (allPengajar ?? []).map((p) => p.id))
    .gte('tanggal', `${ym}-01`)
    .is('invalidated_at', null);

  const { data: pendingAlasan } = await supabaseAdmin
    .from('pengajuan_alasan')
    .select('id, pengajar_id, tanggal, jenis, alasan, status')
    .in('pengajar_id', (allPengajar ?? []).map((p) => p.id))
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const { data: programs } = await supabaseAdmin
    .from('program_kehadiran')
    .select('id, name')
    .eq('active', true);

  const { data: libur } = await supabaseAdmin
    .from('libur_program')
    .select('id, program_id, kelas_hits_id, tanggal, gender, keterangan')
    .gte('tanggal', `${ym}-01`)
    .order('tanggal', { ascending: false });

  const pengajarMap = new Map((allPengajar ?? []).map((p) => [p.id, p]));

  // Peer view: aktivitas rekan koordinator_hits bulan ini
  const { data: rekanList } = await supabaseAdmin
    .from('koordinator_hits')
    .select('id, name, last_login_at')
    .eq('gender', session.gender)
    .eq('active', true)
    .order('name');

  const rekanIds = (rekanList ?? []).map((r) => r.id);

  const [{ data: teguranMonth }, { data: liburMonth }] = await Promise.all([
    rekanIds.length
      ? supabaseAdmin
          .from('teguran')
          .select('issued_by_id')
          .eq('issued_by_role', 'koordinator_hits')
          .gte('created_at', `${ym}-01`)
          .in('issued_by_id', rekanIds)
      : Promise.resolve({ data: [] as Array<{ issued_by_id: string }> }),
    rekanIds.length
      ? supabaseAdmin
          .from('libur_program')
          .select('created_by_id')
          .gte('created_at', `${ym}-01`)
          .in('created_by_id', rekanIds)
      : Promise.resolve({ data: [] as Array<{ created_by_id: string }> }),
  ]);

  const teguranByRekan = new Map<string, number>();
  for (const t of teguranMonth ?? []) {
    teguranByRekan.set(t.issued_by_id, (teguranByRekan.get(t.issued_by_id) ?? 0) + 1);
  }
  const liburByRekan = new Map<string, number>();
  for (const l of liburMonth ?? []) {
    if (l.created_by_id) {
      liburByRekan.set(l.created_by_id, (liburByRekan.get(l.created_by_id) ?? 0) + 1);
    }
  }

  const totalPengajar = allPengajar?.length ?? 0;
  const totalCheckins = checkins?.length ?? 0;
  const hadirCount = (checkins ?? []).filter((c) => c.status === 'hadir').length;
  const overallPercent = totalCheckins > 0 ? Math.round((hadirCount / totalCheckins) * 100) : 0;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Koordinator Pengajar
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

          <FeatureNav current="/kehadiran/koordinator" />

          <h1 className="t-h1" style={{ marginBottom: 16 }}>
            Kehadiran — {session.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
          </h1>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
            <a
              href="/matrix/koordinator"
              className="card-flat"
              style={{
                display: 'block',
                padding: '12px 16px',
                textDecoration: 'none',
                color: 'inherit',
                borderLeft: '3px solid var(--accent)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Matrix HITS</div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                14 indikator + ranking pengajar
              </div>
            </a>
            <a
              href="/shakwa/koordinator"
              className="card-flat"
              style={{
                display: 'block',
                padding: '12px 16px',
                textDecoration: 'none',
                color: 'inherit',
                borderLeft: '3px solid var(--kuning-ink)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Review SHAKWA</div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                Aduan pengajar &amp; peserta
              </div>
            </a>
            <a
              href="/audit/koordinator_hits"
              className="card-flat"
              style={{
                display: 'block',
                padding: '12px 16px',
                textDecoration: 'none',
                color: 'inherit',
                borderLeft: '3px solid var(--ink-2)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Audit Trail</div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                Aktivitas rekan koordinator
              </div>
            </a>
          </div>

          {/* Stats */}
          <div className="matrix-stat-grid" style={{ marginBottom: 12 }}>
            <StatCard value={totalPengajar} label="Pengajar" />
            <StatCard
              value={`${overallPercent}%`}
              label="Kehadiran"
              valueColor={overallPercent >= 70 ? 'var(--hijau-ink)' : overallPercent >= 50 ? 'var(--kuning-ink)' : 'var(--merah-ink)'}
            />
            <StatCard
              value={pendingAlasan?.length ?? 0}
              label="Alasan Pending"
              valueColor={(pendingAlasan?.length ?? 0) > 0 ? 'var(--merah-ink)' : undefined}
            />
            <StatCard value={kelompokList?.length ?? 0} label="Kelompok" />
          </div>

          {totalCheckins > 0 && (
            <div className="card-flat" style={{ padding: 14, marginBottom: 20 }}>
              <div className="t-tiny" style={{ marginBottom: 8 }}>Distribusi check-in bulan ini</div>
              <MiniDistribution
                segments={[
                  { value: hadirCount, color: 'var(--hijau)', label: 'Hadir' },
                  { value: totalCheckins - hadirCount, color: 'var(--kuning)', label: 'Izin/Sakit' },
                ]}
              />
            </div>
          )}

          {/* Pending alasan overview */}
          {pendingAlasan && pendingAlasan.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                Pengajuan Alasan Pending
              </h2>
              {pendingAlasan.slice(0, 10).map((a) => {
                const p = pengajarMap.get(a.pengajar_id);
                return (
                  <div
                    key={a.id}
                    className="card-flat"
                    style={{ padding: '10px 14px', marginBottom: 6 }}
                  >
                    <span style={{ fontWeight: 600 }}>{p?.name ?? '?'}</span>
                    <span className="t-small" style={{ color: 'var(--muted-2)', marginLeft: 8 }}>
                      {a.tanggal} — {a.jenis}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Peer view: aktivitas rekan koordinator */}
          {(rekanList ?? []).length > 1 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                Aktivitas Rekan Koordinator — {ym}
              </h2>
              <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                <table className="t-mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nama</th>
                      <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Teguran</th>
                      <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Libur</th>
                      <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rekanList ?? []).map((r) => {
                      const isMe = r.id === session.koordinator_hits_id;
                      return (
                        <tr key={r.id} style={{ borderTop: '1px solid var(--line)', background: isMe ? 'var(--accent-tint)' : 'transparent' }}>
                          <td style={{ padding: '8px 12px', fontWeight: isMe ? 700 : 500 }}>
                            {r.name} {isMe && <span className="t-tiny" style={{ color: 'var(--accent-2)' }}>(saya)</span>}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right' }}>{teguranByRekan.get(r.id) ?? 0}</td>
                          <td style={{ padding: '8px 8px', textAlign: 'right' }}>{liburByRekan.get(r.id) ?? 0}</td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--muted)' }}>
                            {r.last_login_at
                              ? new Date(r.last_login_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* Per-kelompok overview */}
          <h2 className="t-h2" style={{ marginBottom: 12 }}>
            Per Kelompok — {ym}
          </h2>
          {(kelompokList ?? []).map((kel) => {
            const kelMembers = (allPengajar ?? []).filter((p) => p.kelompok_id === kel.id);
            const ketua = kelMembers.find((m) => m.is_ketua);
            const kelCheckins = (checkins ?? []).filter((c) =>
              kelMembers.some((m) => m.id === c.pengajar_id)
            );
            const kelHadir = kelCheckins.filter((c) => c.status === 'hadir').length;
            const kelTotal = kelCheckins.length;
            const kelPct = kelTotal > 0 ? Math.round((kelHadir / kelTotal) * 100) : 0;

            const kelPending = (pendingAlasan ?? []).filter((a) =>
              kelMembers.some((m) => m.id === a.pengajar_id)
            ).length;

            let reminderUrl: string | undefined;
            if (ketua && kelPending > 0) {
              reminderUrl = buildWaMeUrl(
                ketua.whatsapp_number,
                tplReminderKetuaKelompokTugas({
                  ketuaName: ketua.name,
                  ketuaGender: ketua.gender,
                  tugasPending: [`${kelPending} pengajuan alasan menunggu keputusan`],
                  dashboardUrl: absUrl('/kehadiran/ketua-kelompok'),
                })
              );
            }

            return (
              <div
                key={kel.id}
                className="card-flat"
                style={{
                  padding: '12px 16px',
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{kel.name}</div>
                  <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                    {ketua ? `Ketua: ${ketua.name}` : 'Tanpa ketua'} &bull; {kelMembers.length} anggota &bull; {kelPct}% hadir
                    {kelPending > 0 && (
                      <span style={{ color: 'var(--merah-ink)', fontWeight: 600 }}>
                        {' '}&bull; {kelPending} pending
                      </span>
                    )}
                  </div>
                </div>
                {reminderUrl && (
                  <a
                    href={reminderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost"
                    style={{ fontSize: 12, padding: '6px 10px' }}
                  >
                    Reminder
                  </a>
                )}
              </div>
            );
          })}

          {/* Libur management */}
          <div style={{ marginTop: 24 }}>
            <h2 className="t-h2" style={{ marginBottom: 12 }}>
              Umumkan Libur Program
            </h2>
            <LiburForm programs={programs ?? []} />

            {libur && libur.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 className="t-small" style={{ fontWeight: 600, marginBottom: 8 }}>
                  Libur Bulan Ini
                </h3>
                {libur.map((l) => (
                  <div
                    key={l.id}
                    className="card-flat"
                    style={{ padding: '8px 14px', marginBottom: 4 }}
                  >
                    <span className="t-small">
                      {l.tanggal} — {l.keterangan ?? '(tanpa keterangan)'}
                      {l.gender && ` (${l.gender})`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
