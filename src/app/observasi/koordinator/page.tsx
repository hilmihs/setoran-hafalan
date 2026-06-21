import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getHitsHarian } from '@/lib/hits-harian';
import { LogoutButton } from '@/components/LogoutButton';
import { FeatureNav } from '@/components/FeatureNav';
import { StatCard } from '@/components/ui/StatCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MiniDistribution } from '@/components/ui/MiniDistribution';
import { TabayyunCard } from './TabayyunCard';
import { ReminderButton } from './ReminderButton';
import { ReminderMassalPanel } from './ReminderMassalPanel';
import { ObservasiFilterBar } from './ObservasiFilterBar';
import { OBSERVASI_EFEKTIF } from '@/lib/hits-harian';
import type { HitsKondisi } from '@/types/db';

export const dynamic = 'force-dynamic';

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

type SP = { q?: string; hari?: string; statusObs?: string; statusTab?: string };

export default async function KoordinatorKetuaKelasPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const session = await requireKoordinatorKetuaKelas();
  const today = jakartaToday();

  const q = (searchParams.q ?? '').trim().toLowerCase();
  const statusObs = searchParams.statusObs ?? null;
  const statusTab = searchParams.statusTab ?? null;

  const { rows: harianRows, kaldikMissing } = await getHitsHarian(today, session.gender);

  const matchesSearch = (kelasName: string, pengajarName: string | null) =>
    !q || kelasName.toLowerCase().includes(q) || (pengajarName ?? '').toLowerCase().includes(q);

  const inScope = harianRows.filter((r) => matchesSearch(r.halaqah_name, r.pengajar_name));

  const totalKelas = harianRows.length;
  const filled = harianRows.filter((r) => r.keterangan);
  const filledCount = filled.length;

  // Distribusi kondisi hari ini
  const kondisiKbbs = filled.filter((r) => r.keterangan!.kondisi === 'KBBS').length;
  const kondisiLibur = filled.filter((r) => r.keterangan!.kondisi === 'LIBUR').length;
  const kondisiCatatan = filledCount - kondisiKbbs - kondisiLibur;

  const terlambatRows = inScope.filter((r) => r.keterangan?.terlambat);

  const unfilled = inScope.filter((r) => !r.keterangan);
  const filledInScope = inScope.filter((r) => r.keterangan);

  // ── Tabayyun (sumber hits_tabayyun) ──
  const tabayyunStatuses =
    statusTab === 'decided' ? ['decided'] : statusTab === 'pending' ? ['pending', 'awaiting_reason'] : ['pending', 'awaiting_reason', 'decided'];

  const { data: tabRaw } = await supabaseAdmin
    .from('hits_tabayyun')
    .select(
      `id, kondisi, status, alasan_pengajar, deadline_at, pengajar_id,
       pengajar:pengajar_id(name),
       halaqah:halaqah_id(name, gender),
       keterangan:keterangan_id(tanggal)`
    )
    .in('status', tabayyunStatuses)
    .order('created_at', { ascending: false });

  type TabRow = {
    id: string;
    kondisi: HitsKondisi;
    status: string;
    alasan_pengajar: string | null;
    deadline_at: string;
    pengajar_id: string | null;
    pengajar: { name: string } | null;
    halaqah: { name: string; gender: string } | null;
    keterangan: { tanggal: string } | null;
  };
  const tabayyunItems = ((tabRaw ?? []) as unknown as TabRow[])
    .filter((t) => t.halaqah?.gender === session.gender)
    .map((t) => ({
      id: t.id,
      pengajar_id: t.pengajar_id ?? '',
      pengajar_name: t.pengajar?.name ?? '?',
      kelas_name: t.halaqah?.name ?? '?',
      tanggal: t.keterangan?.tanggal ?? '—',
      kondisi: t.kondisi,
      alasan_pengajar: t.alasan_pengajar,
      status: t.status,
      deadline_at: t.deadline_at,
    }))
    .filter((t) => !q || t.pengajar_name.toLowerCase().includes(q) || t.kelas_name.toLowerCase().includes(q));

  // ── Analitik tabayyun bulan ini ──
  const ymStart = today.slice(0, 7) + '-01';
  const { data: monthlyRaw } = await supabaseAdmin
    .from('hits_tabayyun')
    .select(`id, status, is_udzur_syari, decided_at, created_at, halaqah:halaqah_id(gender), koordinator_kk_id`)
    .gte('created_at', ymStart);
  type MonthRow = {
    id: string;
    status: string;
    is_udzur_syari: boolean | null;
    decided_at: string | null;
    created_at: string;
    halaqah: { gender: string } | null;
    koordinator_kk_id: string | null;
  };
  const tabAnalytics = ((monthlyRaw ?? []) as unknown as MonthRow[]).filter((t) => t.halaqah?.gender === session.gender);
  const tabTotalBulan = tabAnalytics.length;
  const tabDecidedBulan = tabAnalytics.filter((t) => t.status === 'decided');
  const tabUdzurDiterima = tabDecidedBulan.filter((t) => t.is_udzur_syari === true).length;
  const tabUdzurRate = tabDecidedBulan.length > 0 ? Math.round((tabUdzurDiterima / tabDecidedBulan.length) * 100) : 0;
  const tabAvgHours =
    tabDecidedBulan.length > 0
      ? Math.round(
          tabDecidedBulan.reduce((sum, t) => {
            if (!t.decided_at) return sum;
            return sum + (new Date(t.decided_at).getTime() - new Date(t.created_at).getTime()) / 3600_000;
          }, 0) / tabDecidedBulan.length
        )
      : 0;

  // ── Peer view: rekan koordinator KK ──
  const { data: rekanKK } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('id, name, last_login_at')
    .eq('gender', session.gender)
    .eq('active', true)
    .order('name');
  const tabDecisionsByRekan = new Map<string, number>();
  for (const t of tabDecidedBulan) {
    if (t.koordinator_kk_id) tabDecisionsByRekan.set(t.koordinator_kk_id, (tabDecisionsByRekan.get(t.koordinator_kk_id) ?? 0) + 1);
  }

  const showFilled = !statusObs || statusObs === 'sudah';
  const showUnfilled = !statusObs || statusObs === 'belum';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Koordinator KK
            </div>
            <LogoutButton />
          </div>

          <FeatureNav current="/observasi/koordinator" />

          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Monitoring Observasi HITS
          </h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 14 }}>
            {session.name} — {session.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} — {today}
          </p>

          {/* ── Hero: Status Hari Ini ── */}
          {(() => {
            const pct = totalKelas > 0 ? Math.round((filledCount / totalKelas) * 100) : 0;
            const R = 34, C = 2 * Math.PI * R;
            const ringInk = pct === 100 ? 'var(--hijau-ink)' : pct >= 50 ? 'var(--kuning-ink)' : 'var(--muted)';
            const ringCol = pct === 100 ? 'var(--hijau)' : pct >= 50 ? 'var(--kuning)' : 'var(--muted-2)';
            const pendingTab = tabayyunItems.filter((t) => t.status !== 'decided').length;
            return (
              <div
                style={{
                  borderRadius: 'var(--r-xl)', padding: '18px 20px', marginBottom: 18,
                  background: 'linear-gradient(135deg, var(--accent-tint), var(--surface))',
                  border: '1px solid var(--accent-line)', boxShadow: 'var(--shadow-raised)',
                  display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                }}
              >
                <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
                  <svg width="84" height="84" viewBox="0 0 84 84">
                    <circle cx="42" cy="42" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
                    <circle
                      cx="42" cy="42" r={R} fill="none" stroke={ringCol} strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100}
                      transform="rotate(-90 42 42)"
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                    <div style={{ textAlign: 'center', lineHeight: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: ringInk }}>{pct}%</div>
                      <div className="t-tiny" style={{ color: 'var(--muted)' }}>terisi</div>
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Status Pengisian Hari Ini</div>
                  <div className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
                    {filledCount} dari {totalKelas} halaqah terjadwal sudah diisi keterangannya.
                  </div>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{totalKelas}</div>
                      <div className="t-tiny" style={{ color: 'var(--muted)' }}>Halaqah hari ini</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: pendingTab > 0 ? 'var(--merah-ink)' : 'var(--ink)' }}>{pendingTab}</div>
                      <div className="t-tiny" style={{ color: 'var(--muted)' }}>Tabayyun pending</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: terlambatRows.length > 0 ? 'var(--kuning-ink)' : 'var(--ink)' }}>{terlambatRows.length}</div>
                      <div className="t-tiny" style={{ color: 'var(--muted)' }}>Pengajar telat</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {kaldikMissing && (
            <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 12, borderLeft: '3px solid var(--kuning)' }}>
              <div className="t-small" style={{ color: 'var(--kuning-ink)' }}>
                Kaldik belum diupload — pertemuan tidak bisa diturunkan, sehingga belum ada halaqah terjadwal hari ini. Upload kaldik per batch di{' '}
                <a href="/hits/koordinator/validasi" style={{ color: 'var(--accent-2)', fontWeight: 600 }}>Validasi &amp; Sumber Data</a>.
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
            <a href="/hits/koordinator" className="card-flat" style={{ display: 'block', padding: '12px 16px', textDecoration: 'none', color: 'inherit', borderLeft: '3px solid var(--accent)' }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Rekap Soft Skill HITS</div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>%KBBS &amp; %Latihan per halaqah</div>
            </a>
            <a href="/audit/koordinator_ketua_kelas" className="card-flat" style={{ display: 'block', padding: '12px 16px', textDecoration: 'none', color: 'inherit', borderLeft: '3px solid var(--ink-2)' }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Audit Trail</div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Aktivitas rekan koordinator KK</div>
            </a>
          </div>

          <ObservasiFilterBar current={{ q: searchParams.q ?? '', hari: searchParams.hari ?? null, statusObs, statusTab }} />

          <ReminderMassalPanel enabled={today >= OBSERVASI_EFEKTIF} efektif={OBSERVASI_EFEKTIF} />

          {filledCount > 0 && (
            <div className="card-flat" style={{ padding: 14, marginBottom: 12 }}>
              <div className="t-tiny" style={{ marginBottom: 8 }}>Kondisi keterangan hari ini</div>
              <MiniDistribution
                segments={[
                  { value: kondisiKbbs, color: 'var(--hijau)', label: 'KBBS' },
                  { value: kondisiCatatan, color: 'var(--kuning)', label: 'Catatan' },
                  { value: kondisiLibur, color: 'var(--muted-2)', label: 'Libur' },
                ]}
              />
            </div>
          )}

          {/* Analitik Tabayyun */}
          <SectionHeader title="Analitik Tabayyun bulan ini" />
          <div className="matrix-stat-grid" style={{ marginBottom: 20 }}>
            <StatCard value={tabTotalBulan} label="Total" />
            <StatCard value={tabDecidedBulan.length} label="Diputuskan" />
            <StatCard value={`${tabUdzurRate}%`} label="Udzur diterima" valueColor="var(--hijau-ink)" />
            <StatCard value={`${tabAvgHours}j`} label="Avg waktu putusan" />
          </div>

          {/* Peer view */}
          {(rekanKK ?? []).length > 1 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>Aktivitas Rekan Koordinator KK — {today.slice(0, 7)}</h2>
              <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="k-table">
                    <thead>
                      <tr>
                        <th>Nama</th>
                        <th style={{ textAlign: 'right' }}>Tabayyun Diputuskan</th>
                        <th style={{ textAlign: 'right' }}>Login Terakhir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rekanKK ?? []).map((r) => {
                        const isMe = r.id === session.koordinator_kk_id;
                        return (
                          <tr key={r.id} style={{ background: isMe ? 'var(--accent-tint)' : 'transparent' }}>
                            <td className="nm" style={{ fontWeight: isMe ? 700 : 500 }}>
                              {r.name} {isMe && <span className="t-tiny" style={{ color: 'var(--accent-2)' }}>(saya)</span>}
                            </td>
                            <td className="t-mono" style={{ textAlign: 'right' }}>{tabDecisionsByRekan.get(r.id) ?? 0}</td>
                            <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                              {r.last_login_at ? new Date(r.last_login_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—'}
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

          {/* Tabayyun cards */}
          {tabayyunItems.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                {statusTab === 'decided' ? 'Tabayyun Sudah Diputuskan' : 'Tabayyun'} ({tabayyunItems.length})
              </h2>
              {tabayyunItems.map((t) => (
                <TabayyunCard key={t.id} tabayyun={t} />
              ))}
            </div>
          )}

          {/* Pengajar terlambat hari ini */}
          {terlambatRows.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>Pengajar Terlambat Hari Ini ({terlambatRows.length})</h2>
              {terlambatRows.map((r) => (
                <div key={r.halaqah_id} className="card-flat" style={{ padding: '10px 14px', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.halaqah_name}</div>
                  <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                    Pengajar: {r.pengajar_name ?? '?'} · Pertemuan {r.pertemuan_no}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Belum diisi */}
          {showUnfilled && unfilled.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>Halaqah Belum Terisi Keterangan ({unfilled.length})</h2>
              {unfilled.map((r) => (
                <div key={r.halaqah_id} className="card-flat" style={{ padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.halaqah_name}</div>
                    <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                      Pengajar: {r.pengajar_name ?? '?'} · Pertemuan {r.pertemuan_no}
                      {r.ketua ? ` · Ketua: ${r.ketua.name}` : ' · Tanpa ketua kelas'}
                    </div>
                  </div>
                  {r.ketua && <ReminderButton targetId={r.ketua.id} kelasName={r.halaqah_name} label="Reminder Keterangan" />}
                </div>
              ))}
            </div>
          )}

          {/* Sudah diisi */}
          {showFilled && filledInScope.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>Keterangan Sudah Terisi Hari Ini ({filledInScope.length})</h2>
              {filledInScope.map((r) => {
                const k = r.keterangan!;
                return (
                  <div key={r.halaqah_id} className="card-flat" style={{ padding: '10px 14px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.halaqah_name}</div>
                      <span
                        className="badge"
                        style={{
                          background: k.kondisi === 'KBBS' ? 'var(--hijau-tint)' : k.kondisi === 'LIBUR' ? 'var(--surface-3)' : 'var(--kuning-tint)',
                          borderColor: k.kondisi === 'KBBS' ? 'var(--hijau-line)' : k.kondisi === 'LIBUR' ? 'var(--line)' : 'var(--kuning-line)',
                          color: k.kondisi === 'KBBS' ? 'var(--hijau-ink)' : k.kondisi === 'LIBUR' ? 'var(--muted)' : 'var(--kuning-ink)',
                        }}
                      >
                        {k.kondisi}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!kaldikMissing && tabayyunItems.length === 0 && unfilled.length === 0 && filledInScope.length === 0 && terlambatRows.length === 0 && (
            <div className="card-flat" style={{ padding: '24px 20px', textAlign: 'center' }}>
              <p className="t-body" style={{ color: 'var(--muted-2)' }}>
                {q ? 'Tidak ada data yang cocok dengan filter.' : 'Tidak ada halaqah terjadwal hari ini.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
