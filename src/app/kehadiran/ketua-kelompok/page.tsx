import { requireKetuaKelompok } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildWaMeUrl, tplReminderPengajarCheckin } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { DecisionButtons } from './DecisionButtons';

export const dynamic = 'force-dynamic';

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

function currentYearMonth(): string {
  const d = new Date();
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

export default async function KetuaKelompokPage() {
  const session = await requireKetuaKelompok();
  const today = jakartaToday();
  const ym = currentYearMonth();

  const { data: members } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, whatsapp_number, is_ketua')
    .eq('kelompok_id', session.kelompok_id)
    .eq('active', true)
    .order('name');

  const { data: checkins } = await supabaseAdmin
    .from('checkin_pengajar')
    .select('id, pengajar_id, tanggal, status, is_terlambat, checked_in_at, invalidated_at, program_id, kelas_hits_id')
    .in('pengajar_id', (members ?? []).map((m) => m.id))
    .gte('tanggal', `${ym}-01`)
    .is('invalidated_at', null)
    .order('tanggal', { ascending: false });

  const { data: pendingAlasan } = await supabaseAdmin
    .from('pengajuan_alasan')
    .select('id, pengajar_id, tanggal, jenis, alasan, status')
    .in('pengajar_id', (members ?? []).map((m) => m.id))
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const memberMap = new Map((members ?? []).map((m) => [m.id, m]));

  const hadirCount = (checkins ?? []).filter((c) => c.status === 'hadir').length;
  const totalCheckins = (checkins ?? []).length;
  const attendancePercent = totalCheckins > 0 ? Math.round((hadirCount / totalCheckins) * 100) : 0;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Ketua Kelompok
            </div>
            <a href="/" className="btn-ghost" style={{ fontSize: 14 }}>
              Menu
            </a>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 16 }}>
            Dashboard Kelompok
          </h1>

          {/* Summary card */}
          <div
            className="card-flat"
            style={{
              padding: '16px 20px',
              marginBottom: 20,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Anggota</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{members?.length ?? 0}</div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Kehadiran</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{attendancePercent}%</div>
            </div>
            <div>
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>Pending</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: (pendingAlasan?.length ?? 0) > 0 ? 'var(--danger)' : 'inherit' }}>
                {pendingAlasan?.length ?? 0}
              </div>
            </div>
          </div>

          {/* Pending excuses */}
          {pendingAlasan && pendingAlasan.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 className="t-h2" style={{ marginBottom: 12 }}>
                Pengajuan Alasan Pending
              </h2>
              {pendingAlasan.map((a) => {
                const member = memberMap.get(a.pengajar_id);
                return (
                  <div
                    key={a.id}
                    className="card-flat"
                    style={{ padding: '12px 16px', marginBottom: 8 }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {member?.name ?? 'Unknown'} — {a.tanggal}
                    </div>
                    <div className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                      {a.jenis}: {a.alasan}
                    </div>
                    <DecisionButtons pengajuanId={a.id} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Member attendance list */}
          <h2 className="t-h2" style={{ marginBottom: 12 }}>
            Kehadiran Anggota — {ym}
          </h2>
          {(members ?? []).map((m) => {
            const memberCheckins = (checkins ?? []).filter((c) => c.pengajar_id === m.id);
            const hadirN = memberCheckins.filter((c) => c.status === 'hadir').length;
            const totalN = memberCheckins.length;
            const pct = totalN > 0 ? Math.round((hadirN / totalN) * 100) : 0;

            const reminderUrl = buildWaMeUrl(
              m.whatsapp_number,
              tplReminderPengajarCheckin({
                pengajarName: m.name,
                pengajarGender: m.gender,
                programName: 'Program Pengembangan',
                checkinUrl: absUrl('/kehadiran/pengajar'),
              })
            );

            return (
              <div
                key={m.id}
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
                  <div style={{ fontWeight: m.is_ketua ? 700 : 500 }}>
                    {m.is_ketua ? '⭐ ' : ''}{m.name}
                  </div>
                  <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                    {hadirN}/{totalN} hadir ({pct}%)
                  </div>
                </div>
                <a
                  href={reminderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                >
                  Reminder
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
