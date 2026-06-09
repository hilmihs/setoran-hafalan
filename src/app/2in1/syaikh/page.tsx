import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentCycleStart, formatCycleDeadline, formatCycleRange } from '@/lib/week';
import { logout } from '@/lib/auth';
import { Icon, Initials } from '@/components/icons';
import {
  buildWaMeUrl,
  syaikhTitle,
  tplReminderMusyrifBelumSetor,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import type { Gender, NilaiRekaman, StatusSetoran } from '@/types/db';

export const dynamic = 'force-dynamic';

type MusyrifRow = {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
};

type SetoranMusyrifRow = {
  id: string;
  musyrif_id: string;
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
};

export default async function SyaikhDashboard() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'syaikh') redirect('/');
  const syaikhId = s.session.syaikh_id;
  const syaikhGender = s.session.gender;
  const titel = syaikhTitle(syaikhGender);

  const cycle = currentCycleStart();
  const deadlineLabel = formatCycleDeadline(cycle);

  // View cross-gender: tarik semua musyrif aktif. Aksi (cek/ingatkan)
  // tetap di-gating same-gender di UI di bawah.
  const { data: musyrifListRaw } = await supabaseAdmin
    .from('musyrif')
    .select('id, name, gender, whatsapp_number')
    .eq('active', true)
    .order('name');
  const musyrifList = (musyrifListRaw ?? []) as MusyrifRow[];

  const musyrifIds = musyrifList.map((m) => m.id);
  const { data: setoranListRaw } = await supabaseAdmin
    .from('setoran_musyrif')
    .select('id, musyrif_id, status, submitted_at, checked_at')
    .in(
      'musyrif_id',
      musyrifIds.length ? musyrifIds : ['00000000-0000-0000-0000-000000000000']
    )
    .eq('week_start', cycle);
  const setoranList = (setoranListRaw ?? []) as SetoranMusyrifRow[];
  const setoranByMusyrif = new Map(setoranList.map((st) => [st.musyrif_id, st]));

  const checkedIds = setoranList
    .filter((st) => st.status === 'checked')
    .map((st) => st.id);
  const { data: rekamanList } = await supabaseAdmin
    .from('rekaman_musyrif')
    .select('setoran_musyrif_id, nilai')
    .in(
      'setoran_musyrif_id',
      checkedIds.length ? checkedIds : ['00000000-0000-0000-0000-000000000000']
    );

  const rekamanBySetoran = new Map<string, NilaiRekaman[]>();
  for (const r of rekamanList ?? []) {
    const arr = rekamanBySetoran.get(r.setoran_musyrif_id) ?? [];
    if (r.nilai) arr.push(r.nilai as NilaiRekaman);
    rekamanBySetoran.set(r.setoran_musyrif_id, arr);
  }
  // suppress unused warning for syaikhId — kept for future audit logging
  void syaikhId;

  type StatusKey = 'belum' | 'menunggu' | 'selesai';
  type Row = {
    musyrif: MusyrifRow;
    setoran: SetoranMusyrifRow | undefined;
    rekaman: NilaiRekaman[];
    statusKey: StatusKey;
  };
  const rows: Row[] = musyrifList.map((m) => {
    const setoran = setoranByMusyrif.get(m.id);
    const rekaman = setoran ? rekamanBySetoran.get(setoran.id) ?? [] : [];
    let statusKey: StatusKey = 'belum';
    if (setoran?.status === 'submitted') statusKey = 'menunggu';
    else if (setoran?.status === 'checked') statusKey = 'selesai';
    return { musyrif: m, setoran, rekaman, statusKey };
  });

  const counters = {
    total: rows.length,
    belum: rows.filter((r) => r.statusKey === 'belum').length,
    menunggu: rows.filter((r) => r.statusKey === 'menunggu').length,
    selesai: rows.filter((r) => r.statusKey === 'selesai').length,
  };

  // Peer view: aktivitas rekan syaikh bulan ini
  const ym = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const { data: rekanSyaikh } = await supabaseAdmin
    .from('syaikh')
    .select('id, name, gender, last_login_at')
    .eq('active', true)
    .order('name');
  const rekanSyaikhIds = (rekanSyaikh ?? []).map((r) => r.id);
  const checkedByRekan = new Map<string, number>();
  if (rekanSyaikhIds.length) {
    const { data: checkedSetorans } = await supabaseAdmin
      .from('setoran_musyrif')
      .select('checked_by_syaikh_id, checked_at')
      .in('checked_by_syaikh_id', rekanSyaikhIds)
      .gte('checked_at', `${ym}-01`);
    for (const t of checkedSetorans ?? []) {
      if (t.checked_by_syaikh_id) {
        checkedByRekan.set(t.checked_by_syaikh_id, (checkedByRekan.get(t.checked_by_syaikh_id) ?? 0) + 1);
      }
    }
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span>Maahir
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href="/2in1/laporan"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              Laporan
            </Link>
            <Link
              href="/akun"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              Akun
            </Link>
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
        </div>

        <div className="page">
          <div className="row" style={{ padding: '4px 0 16px' }}>
            <div
              className="avatar"
              style={{ background: 'var(--accent-tint)', color: 'var(--accent-2)' }}
            >
              <Initials name={s.session.name} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{titel}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{s.session.name}</div>
            </div>
            <span className="pekan-tag">
              <span className="dot" />
              Pekan {formatCycleRange(cycle)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            <div className="stat">
              <div className="v" style={{ color: 'var(--merah-ink)' }}>{counters.belum}</div>
              <div className="l">
                <span className="accent-dot" style={{ background: 'var(--merah)' }} />
                Belum
              </div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: 'var(--kuning-ink)' }}>{counters.menunggu}</div>
              <div className="l">
                <span className="accent-dot" style={{ background: 'var(--kuning)' }} />
                Menunggu
              </div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: 'var(--hijau-ink)' }}>{counters.selesai}</div>
              <div className="l">
                <span className="accent-dot" style={{ background: 'var(--hijau)' }} />
                Selesai
              </div>
            </div>
          </div>

          {(rekanSyaikh ?? []).length > 1 && (
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden', marginTop: 14, marginBottom: 14 }}>
              <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                <div className="t-tiny">Aktivitas Rekan Masyaikh — {ym}</div>
              </div>
              <table className="t-mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={{ padding: '8px 16px', fontWeight: 600 }}>Nama</th>
                    <th style={{ padding: '8px 8px', fontWeight: 600 }}>Gender</th>
                    <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Setoran dicek</th>
                    <th style={{ padding: '8px 16px', fontWeight: 600, textAlign: 'right' }}>Login</th>
                  </tr>
                </thead>
                <tbody>
                  {(rekanSyaikh ?? []).map((r) => {
                    const isMe = r.id === syaikhId;
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--line)', background: isMe ? 'var(--accent-tint)' : 'transparent' }}>
                        <td style={{ padding: '8px 16px', fontWeight: isMe ? 700 : 500 }}>
                          {r.name} {isMe && <span className="t-tiny" style={{ color: 'var(--accent-2)' }}>(saya)</span>}
                        </td>
                        <td style={{ padding: '8px 8px', color: 'var(--muted)' }}>{r.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right' }}>{checkedByRekan.get(r.id) ?? 0}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--muted)' }}>
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
          )}

          <div className="section-row">
            <div className="t-tiny">Musyrif &amp; Musyrifah</div>
            <div className="t-small">{counters.total} orang</div>
          </div>

          {rows.length === 0 ? (
            <div className="card-flat" style={{ padding: 18 }}>
              <p className="t-small">Belum ada musyrif/musyrifah terdaftar.</p>
            </div>
          ) : (
            <div className="card-flat" style={{ overflow: 'hidden' }}>
              {rows.map(({ musyrif, setoran, rekaman, statusKey }) => {
                const setorUrl = absUrl('/2in1/musyrif/setor');
                const reminderWa = buildWaMeUrl(
                  musyrif.whatsapp_number,
                  tplReminderMusyrifBelumSetor({
                    musyrifName: musyrif.name,
                    musyrifGender: musyrif.gender,
                    setorUrl,
                    deadlineLabel,
                  })
                );
                return (
                  <div
                    key={musyrif.id}
                    className="row"
                    style={{ color: 'var(--ink)' }}
                  >
                    <div className="avatar">
                      <Initials name={musyrif.name} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{musyrif.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        <StatusLabel statusKey={statusKey} />
                        {setoran?.submitted_at && statusKey !== 'belum' && (
                          <> · {formatTime(setoran.submitted_at)}</>
                        )}
                      </div>
                    </div>
                    {statusKey === 'belum' && musyrif.gender === syaikhGender && (
                      <a
                        href={reminderWa}
                        target="_blank"
                        rel="noopener"
                        className="act-btn wa"
                        style={{ textDecoration: 'none' }}
                      >
                        {Icon.wa(11)} Ingatkan
                      </a>
                    )}
                    {statusKey === 'menunggu' && setoran && musyrif.gender === syaikhGender && (
                      <Link
                        href={`/2in1/syaikh/cek/${setoran.id}`}
                        className="badge badge-kuning"
                        style={{ textDecoration: 'none' }}
                      >
                        <span className="dot" />
                        Cek
                      </Link>
                    )}
                    {musyrif.gender !== syaikhGender && (
                      <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                        {musyrif.gender === 'ikhwan' ? 'ikhwan' : 'akhwat'}
                      </span>
                    )}
                    {statusKey === 'selesai' && (
                      <span className="nilai-trio">
                        {rekaman.slice(0, 3).map((n, i) => (
                          <span key={i} className={`d ${n}`} />
                        ))}
                        {Array.from({ length: Math.max(0, 3 - rekaman.length) }).map((_, i) => (
                          <span key={`e${i}`} className="d" />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatusLabel({ statusKey }: { statusKey: 'belum' | 'menunggu' | 'selesai' }) {
  if (statusKey === 'belum') return <span style={{ color: 'var(--merah-ink)' }}>belum setor</span>;
  if (statusKey === 'menunggu') return <span style={{ color: 'var(--kuning-ink)' }}>menunggu cek</span>;
  return <span style={{ color: 'var(--hijau-ink)' }}>selesai</span>;
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
