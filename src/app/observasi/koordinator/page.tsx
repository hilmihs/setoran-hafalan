import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logout } from '@/lib/auth';
import { Icon } from '@/components/icons';
import { TabayyunCard } from './TabayyunCard';
import { ReminderButton } from './ReminderButton';
import { ObservasiFilterBar } from './ObservasiFilterBar';
import type { KondisiKelas } from '@/types/db';

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
  const hariFilter = searchParams.hari ?? null;
  const statusObs = searchParams.statusObs ?? null;
  const statusTab = searchParams.statusTab ?? null;

  const { data: allKelas } = await supabaseAdmin
    .from('kelas_hits')
    .select('id, name, gender, pengajar_id, jadwal_hari')
    .eq('gender', session.gender)
    .order('name');

  const filteredKelas = (allKelas ?? []).filter((k) => {
    if (hariFilter && k.jadwal_hari) {
      const days = (k.jadwal_hari as string).split(',').map((d: string) => d.trim());
      if (!days.includes(hariFilter)) return false;
    }
    return true;
  });

  const kelasIds = filteredKelas.map((k) => k.id);
  const pengajarIds = [...new Set(filteredKelas.map((k) => k.pengajar_id))];

  const tabayyunStatuses = statusTab === 'decided'
    ? ['decided']
    : statusTab === 'pending'
      ? ['pending', 'awaiting_reason']
      : ['pending', 'awaiting_reason', 'decided'];

  const [
    { data: allKetuaKelas },
    { data: todayObservasi },
    { data: todayCheckins },
    { data: rawTabayyun },
    { data: pengajarList },
  ] = await Promise.all([
    supabaseAdmin
      .from('ketua_kelas')
      .select('id, name, kelas_hits_id, whatsapp_number')
      .in('kelas_hits_id', kelasIds.length > 0 ? kelasIds : ['__none__'])
      .eq('active', true),
    supabaseAdmin
      .from('observasi_kelas')
      .select('id, kelas_hits_id, kondisi, tanggal')
      .eq('tanggal', today)
      .in('kelas_hits_id', kelasIds.length > 0 ? kelasIds : ['__none__']),
    supabaseAdmin
      .from('checkin_pengajar')
      .select('id, pengajar_id, kelas_hits_id, status')
      .eq('tanggal', today)
      .in('kelas_hits_id', kelasIds.length > 0 ? kelasIds : ['__none__'])
      .is('invalidated_at', null),
    supabaseAdmin
      .from('tabayyun')
      .select(`
        id, observasi_id, pengajar_id, alasan_pengajar,
        status, deadline_at,
        observasi_kelas!inner(tanggal, kondisi, kelas_hits_id)
      `)
      .in('status', tabayyunStatuses)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('pengajar')
      .select('id, name, whatsapp_number')
      .in('id', pengajarIds.length > 0 ? pengajarIds : ['__none__']),
  ]);

  const pengajarMap = new Map((pengajarList ?? []).map((p) => [p.id, p]));
  const kelasMap = new Map(filteredKelas.map((k) => [k.id, k]));
  const ketuaMap = new Map((allKetuaKelas ?? []).map((k) => [k.kelas_hits_id, k]));
  const observasiSet = new Set((todayObservasi ?? []).map((o) => o.kelas_hits_id));
  const checkinSet = new Set((todayCheckins ?? []).map((c) => c.kelas_hits_id));

  function matchesSearch(kelasName: string, pengajarId: string): boolean {
    if (!q) return true;
    const pengajar = pengajarMap.get(pengajarId);
    return (
      kelasName.toLowerCase().includes(q) ||
      (pengajar?.name ?? '').toLowerCase().includes(q)
    );
  }

  const filledCount = (todayObservasi ?? []).filter((o) => kelasIds.includes(o.kelas_hits_id)).length;
  const totalKelas = filteredKelas.length;

  const unfilledKelas = filteredKelas
    .filter((k) => !observasiSet.has(k.id))
    .filter((k) => matchesSearch(k.name, k.pengajar_id));

  const uncheckedKelas = filteredKelas
    .filter((k) => !checkinSet.has(k.id))
    .filter((k) => matchesSearch(k.name, k.pengajar_id));

  const filledKelas = (todayObservasi ?? [])
    .filter((o) => kelasMap.has(o.kelas_hits_id))
    .filter((o) => {
      const kelas = kelasMap.get(o.kelas_hits_id);
      return kelas ? matchesSearch(kelas.name, kelas.pengajar_id) : false;
    });

  const tabayyunItems = (rawTabayyun ?? [])
    .filter((t) => {
      const obs = t.observasi_kelas as unknown as { kelas_hits_id: string; tanggal: string; kondisi: KondisiKelas };
      return kelasIds.includes(obs.kelas_hits_id);
    })
    .map((t) => {
      const obs = t.observasi_kelas as unknown as { kelas_hits_id: string; tanggal: string; kondisi: KondisiKelas };
      const kelas = kelasMap.get(obs.kelas_hits_id);
      const pengajar = pengajarMap.get(t.pengajar_id);
      return {
        id: t.id,
        pengajar_id: t.pengajar_id,
        pengajar_name: pengajar?.name ?? '?',
        kelas_name: kelas?.name ?? '?',
        tanggal: obs.tanggal,
        kondisi: obs.kondisi,
        alasan_pengajar: t.alasan_pengajar,
        status: t.status,
        deadline_at: t.deadline_at,
      };
    })
    .filter((t) => {
      if (!q) return true;
      return t.pengajar_name.toLowerCase().includes(q) || t.kelas_name.toLowerCase().includes(q);
    });

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
            Monitoring Observasi
          </h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
            {session.name} — {session.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} — {today}
          </p>

          <a
            href="/matrix/koordinator"
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
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Matrix HITS Pengajar</div>
            <div className="t-small" style={{ color: 'var(--muted-2)' }}>
              14 indikator + teguran + ranking bulanan
            </div>
          </a>

          <ObservasiFilterBar
            current={{
              q: searchParams.q ?? '',
              hari: hariFilter,
              statusObs,
              statusTab,
            }}
          />

          {/* Stats */}
          <div
            className="card-flat"
            style={{
              padding: '16px 20px', marginBottom: 20,
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center',
            }}
          >
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Total Halaqah</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{totalKelas}</div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Observasi Hari Ini</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: filledCount === totalKelas ? 'var(--hijau-ink)' : 'var(--kuning-ink)' }}>
                {filledCount}/{totalKelas}
              </div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Tabayyun Pending</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: tabayyunItems.length > 0 ? 'var(--merah-ink)' : 'inherit' }}>
                {tabayyunItems.length}
              </div>
            </div>
          </div>

          {/* Tabayyun */}
          {tabayyunItems.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                {statusTab === 'decided' ? 'Tabayyun Sudah Diputuskan' : 'Tabayyun Menunggu Keputusan'} ({tabayyunItems.length})
              </h2>
              {tabayyunItems.map((t) => (
                <TabayyunCard key={t.id} tabayyun={t} />
              ))}
            </div>
          )}

          {/* Unfilled observasi today */}
          {showUnfilled && unfilledKelas.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                Halaqah Belum Terisi Observasi ({unfilledKelas.length})
              </h2>
              {unfilledKelas.map((k) => {
                const ketua = ketuaMap.get(k.id);
                const pengajar = pengajarMap.get(k.pengajar_id);
                return (
                  <div
                    key={k.id}
                    className="card-flat"
                    style={{
                      padding: '10px 14px', marginBottom: 6,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{k.name}</div>
                      <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                        Pengajar: {pengajar?.name ?? '?'}
                        {ketua ? ` · Ketua: ${ketua.name}` : ' · Tanpa ketua kelas'}
                      </div>
                    </div>
                    {ketua && (
                      <ReminderButton
                        type="ketua_kelas"
                        targetId={ketua.id}
                        kelasName={k.name}
                        label="Reminder Observasi"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Unchecked pengajar (no checkin today) */}
          {showUnfilled && uncheckedKelas.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                Pengajar Belum Check-in ({uncheckedKelas.length})
              </h2>
              {uncheckedKelas.map((k) => {
                const pengajar = pengajarMap.get(k.pengajar_id);
                return (
                  <div
                    key={k.id}
                    className="card-flat"
                    style={{
                      padding: '10px 14px', marginBottom: 6,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{k.name}</div>
                      <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                        Pengajar: {pengajar?.name ?? '?'}
                      </div>
                    </div>
                    {pengajar && (
                      <ReminderButton
                        type="pengajar"
                        targetId={pengajar.id}
                        kelasName={k.name}
                        label="Reminder Check-in"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Today's observasi results */}
          {showFilled && filledKelas.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                Observasi Sudah Terisi Hari Ini ({filledKelas.length})
              </h2>
              {filledKelas.map((o) => {
                const kelas = kelasMap.get(o.kelas_hits_id);
                return (
                  <div
                    key={o.id}
                    className="card-flat"
                    style={{ padding: '10px 14px', marginBottom: 6 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{kelas?.name ?? '?'}</div>
                      <span
                        className="badge"
                        style={{
                          background: o.kondisi === 'KBBS' ? 'var(--hijau-tint)' : o.kondisi === 'LIBUR' ? 'var(--surface-3)' : 'var(--kuning-tint)',
                          borderColor: o.kondisi === 'KBBS' ? 'var(--hijau-line)' : o.kondisi === 'LIBUR' ? 'var(--line)' : 'var(--kuning-line)',
                          color: o.kondisi === 'KBBS' ? 'var(--hijau-ink)' : o.kondisi === 'LIBUR' ? 'var(--muted)' : 'var(--kuning-ink)',
                        }}
                      >
                        {o.kondisi}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {tabayyunItems.length === 0 && unfilledKelas.length === 0 && uncheckedKelas.length === 0 && filledKelas.length === 0 && (
            <div className="card-flat" style={{ padding: '24px 20px', textAlign: 'center' }}>
              <p className="t-body" style={{ color: 'var(--muted-2)' }}>
                {q || hariFilter ? 'Tidak ada data yang cocok dengan filter.' : 'Tidak ada data hari ini.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
