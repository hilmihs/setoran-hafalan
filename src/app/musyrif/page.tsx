import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentWeekStart, formatWeekRange } from '@/lib/week';
import { logout } from '@/lib/auth';
import { Icon, Initials } from '@/components/icons';
import type { NilaiRekaman } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function MusyrifDashboard() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') redirect('/musyrif/login');
  const musyrifId = s.session.musyrif_id;

  const { data: kelasList } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender')
    .eq('musyrif_id', musyrifId);

  const kelasIds = (kelasList ?? []).map((k) => k.id);

  const { data: pesertaList } = await supabaseAdmin
    .from('peserta')
    .select('id, name, kelas_id')
    .in(
      'kelas_id',
      kelasIds.length ? kelasIds : ['00000000-0000-0000-0000-000000000000']
    );

  const pesertaIds = (pesertaList ?? []).map((p) => p.id);

  const week = currentWeekStart();
  const { data: setoranList } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, week_start, status, submitted_at, checked_at')
    .in(
      'peserta_id',
      pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000']
    )
    .gte('week_start', week)
    .order('submitted_at', { ascending: false });

  const checkedIds = (setoranList ?? [])
    .filter((s) => s.status === 'checked')
    .map((s) => s.id);
  const { data: rekamanList } = await supabaseAdmin
    .from('rekaman')
    .select('setoran_id, jenis, nilai')
    .in(
      'setoran_id',
      checkedIds.length ? checkedIds : ['00000000-0000-0000-0000-000000000000']
    );

  const rekamanBySetoran = new Map<string, NilaiRekaman[]>();
  for (const r of rekamanList ?? []) {
    const arr = rekamanBySetoran.get(r.setoran_id) ?? [];
    if (r.nilai) arr.push(r.nilai as NilaiRekaman);
    rekamanBySetoran.set(r.setoran_id, arr);
  }

  const pesertaById = new Map((pesertaList ?? []).map((p) => [p.id, p]));
  const kelasById = new Map((kelasList ?? []).map((k) => [k.id, k]));

  const pending = (setoranList ?? []).filter((s) => s.status === 'submitted');
  const done = (setoranList ?? []).filter((s) => s.status === 'checked');

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span>Maahir
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href="/akun"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              Akun
            </Link>
            <form action={logout}>
              <button type="submit" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
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
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ustadz</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{s.session.name}</div>
            </div>
            <span className="pekan-tag">
              <span className="dot" />
              Pekan {formatWeekRange(week)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div className="stat">
              <div className="v" style={{ color: 'var(--kuning-ink)' }}>{pending.length}</div>
              <div className="l">
                <span className="accent-dot" style={{ background: 'var(--kuning)' }} />
                Menunggu
              </div>
            </div>
            <div className="stat">
              <div className="v" style={{ color: 'var(--hijau-ink)' }}>{done.length}</div>
              <div className="l">
                <span className="accent-dot" style={{ background: 'var(--hijau)' }} />
                Selesai
              </div>
            </div>
          </div>

          <div className="section-row">
            <div className="t-tiny">Menunggu pemeriksaan</div>
            <div className="t-small">{pending.length} setoran</div>
          </div>

          {pending.length === 0 ? (
            <div className="card-flat" style={{ padding: 18 }}>
              <p className="t-small">Tidak ada setoran tertunda. 🎉</p>
            </div>
          ) : (
            <div className="card-flat" style={{ overflow: 'hidden' }}>
              {pending.map((st) => {
                const p = pesertaById.get(st.peserta_id);
                const k = p ? kelasById.get(p.kelas_id) : null;
                return (
                  <Link
                    key={st.id}
                    href={`/musyrif/cek/${st.id}`}
                    className="row"
                    style={{ textDecoration: 'none', color: 'var(--ink)' }}
                  >
                    <div className="avatar">
                      <Initials name={p?.name ?? '?'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p?.name ?? '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Kelas {k?.name ?? '-'} · {formatTime(st.submitted_at)}
                      </div>
                    </div>
                    <span className="badge badge-kuning">
                      <span className="dot" />
                      menunggu
                    </span>
                    <span style={{ color: 'var(--muted-2)', marginLeft: 4 }}>
                      {Icon.arrow(13)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {done.length > 0 && (
            <>
              <div className="section-row">
                <div className="t-tiny">Sudah diperiksa pekan ini</div>
                <div className="t-small">{done.length} setoran</div>
              </div>
              <div className="card-flat" style={{ overflow: 'hidden', opacity: 0.95 }}>
                {done.map((st) => {
                  const p = pesertaById.get(st.peserta_id);
                  const k = p ? kelasById.get(p.kelas_id) : null;
                  const nilai = rekamanBySetoran.get(st.id) ?? [];
                  return (
                    <Link
                      key={st.id}
                      href={`/musyrif/cek/${st.id}`}
                      className="row"
                      style={{ textDecoration: 'none', color: 'var(--ink)' }}
                    >
                      <div className="avatar">
                        <Initials name={p?.name ?? '?'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)' }}>
                          {p?.name ?? '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          Kelas {k?.name ?? '-'} · dicek {formatTime(st.checked_at)}
                        </div>
                      </div>
                      <span className="nilai-trio">
                        {nilai.slice(0, 3).map((n, i) => (
                          <span key={i} className={`d ${n}`} />
                        ))}
                        {Array.from({ length: Math.max(0, 3 - nilai.length) }).map((_, i) => (
                          <span key={`e${i}`} className="d" />
                        ))}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
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
