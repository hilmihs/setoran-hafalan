import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Icon, Initials } from '@/components/icons';
import { LogoutButton } from '@/components/LogoutButton';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { buildWaMeUrl, tplReminderKetuaKelompokTugas } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

const PEDAGOGIS_START = '2026-06';
const PED_FIELDS = ['skor_metode_pengajaran', 'skor_kepatuhan_silabus', 'skor_manajemen_halaqah', 'skor_evaluasi_penguasaan'] as const;

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}
function monthLabelOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function monthOptions(): Array<{ value: string; label: string }> {
  const cur = currentYearMonth();
  const [sy, sm] = PEDAGOGIS_START.split('-').map(Number);
  const [ny, nm] = cur.split('-').map(Number);
  const out: Array<{ value: string; label: string }> = [];
  let y = sy, m = sm;
  while (y < ny || (y === ny && m <= nm)) {
    const value = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ value, label: monthLabelOf(value) });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}

type PengajarRow = { id: string; name: string; gender: Gender; kelompok_id: string; is_ketua: boolean; whatsapp_number: string };

export default async function KoordinatorPedagogisPage({ searchParams }: { searchParams: { month?: string } }) {
  const s = await getSession();
  if (!s.session || s.session.role !== 'koordinator') redirect('/2in1/koordinator/login');

  const cur = currentYearMonth();
  const ym = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : cur;

  const { data: kelompokList } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name, gender')
    .order('name');

  const { data: pengajarRaw } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, kelompok_id, is_ketua, whatsapp_number')
    .eq('active', true)
    .order('name');
  const pengajarList = (pengajarRaw ?? []) as PengajarRow[];
  const pengajarIds = pengajarList.map((p) => p.id);

  const { data: penilaianRaw } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select('pengajar_id, skor_metode_pengajaran, skor_kepatuhan_silabus, skor_manajemen_halaqah, skor_evaluasi_penguasaan')
    .eq('year_month', ym)
    .in('pengajar_id', pengajarIds.length ? pengajarIds : ['00000000-0000-0000-0000-000000000000']);
  const avgByPengajar = new Map<string, number | null>();
  for (const p of penilaianRaw ?? []) {
    const scores = PED_FIELDS.map((f) => (p as Record<string, number | null>)[f]).filter((x): x is number => x !== null && x !== undefined);
    avgByPengajar.set(p.pengajar_id, scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null);
  }

  // Per kelompok
  const groups = (kelompokList ?? []).map((kel) => {
    const anggota = pengajarList.filter((p) => p.kelompok_id === kel.id);
    const ketua = anggota.find((p) => p.is_ketua) ?? null;
    const dinilai = anggota.filter((p) => !p.is_ketua && avgByPengajar.has(p.id));
    const totalAnggota = anggota.filter((p) => !p.is_ketua).length;
    const belum = totalAnggota - dinilai.length;
    let reminderUrl: string | null = null;
    if (ketua && belum > 0) {
      reminderUrl = buildWaMeUrl(
        ketua.whatsapp_number,
        tplReminderKetuaKelompokTugas({
          ketuaName: ketua.name,
          ketuaGender: ketua.gender,
          tugasPending: [`Penilaian pedagogis ${monthLabelOf(ym)}: ${belum} anggota belum dinilai`],
          dashboardUrl: absUrl('/kehadiran/ketua-kelompok/penilaian'),
        })
      );
    }
    return { kel, ketua, anggota, totalAnggota, dinilaiCount: dinilai.length, belum, reminderUrl };
  });

  const totalAnggotaAll = groups.reduce((a, g) => a + g.totalAnggota, 0);
  const totalDinilai = groups.reduce((a, g) => a + g.dinilaiCount, 0);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="dash-header">
        <div className="grp">
          <Link href="/2in1/koordinator" className="wordmark"><span className="mark">M</span>Maahir</Link>
          <span style={{ width: 1, height: 16, background: 'var(--line-2)' }} />
          <span className="t-small" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Pedagogis Guru</span>
        </div>
        <div className="grp">
          <Link href="/2in1/koordinator" className="btn btn-sm btn-ghost" style={{ height: 32, padding: '0 12px', textDecoration: 'none' }}>← Dashboard</Link>
          <LogoutButton />
        </div>
      </div>

      <div className="dash-body" style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="t-h1" style={{ fontSize: 22, marginBottom: 4 }}>Kompetensi Pedagogis — {monthLabelOf(ym)}</h1>
            <p className="t-small">Pantau pengisian penilaian oleh ketua kelompok · {totalDinilai}/{totalAnggotaAll} pengajar dinilai</p>
          </div>
          <MonthNavSelect options={monthOptions()} value={ym} />
        </div>

        {/* Per kelompok */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.length === 0 && <p className="t-small">Belum ada kelompok pengajar.</p>}
          {groups.map((g) => {
            const lengkap = g.totalAnggota > 0 && g.belum === 0;
            return (
              <div key={g.kel.id} className="card-flat" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {g.kel.name}
                      <span className="t-small" style={{ color: 'var(--muted-2)', marginLeft: 8 }}>{g.kel.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}</span>
                    </div>
                    <div className="t-small" style={{ color: 'var(--muted)' }}>
                      Ketua: {g.ketua?.name ?? '— belum ada ketua'}
                    </div>
                  </div>
                  <span className={`badge ${lengkap ? 'badge-hijau' : 'badge-merah'}`} style={{ fontSize: 11 }}>
                    <span className="dot" />{g.dinilaiCount}/{g.totalAnggota} dinilai
                  </span>
                  {g.reminderUrl && (
                    <a href={g.reminderUrl} target="_blank" rel="noopener" className="act-btn wa" style={{ textDecoration: 'none' }}>
                      {Icon.wa(11)} Ingatkan ketua
                    </a>
                  )}
                </div>

                {/* anggota */}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.anggota.filter((p) => !p.is_ketua).map((p) => {
                    const avg = avgByPengajar.get(p.id);
                    const dinilai = avgByPengajar.has(p.id);
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
                        <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}><Initials name={p.name} /></div>
                        <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
                        {dinilai ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: (avg ?? 0) >= 3 ? 'var(--hijau-ink)' : (avg ?? 0) >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)' }}>
                            {avg != null ? avg.toFixed(1) : '0.0'}
                          </span>
                        ) : (
                          <span className="badge badge-merah" style={{ fontSize: 10 }}><span className="dot" />belum</span>
                        )}
                      </div>
                    );
                  })}
                  {g.totalAnggota === 0 && <div className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada anggota.</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
