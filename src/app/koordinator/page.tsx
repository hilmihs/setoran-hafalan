import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logout } from '@/lib/auth';
import { Icon, Initials } from '@/components/icons';
import {
  currentWeekStart,
  formatWeekRange,
  previousWeeks,
} from '@/lib/week';
import {
  buildWaMeUrl,
  tplReminderPesertaBelumSetor,
  tplReminderMusyrifBelumCek,
} from '@/lib/whatsapp';
import type { Gender, NilaiRekaman, StatusSetoran } from '@/types/db';

export const dynamic = 'force-dynamic';

type SP = { week?: string; gender?: string; kelas?: string; status?: string; q?: string };

export default async function KoordinatorDashboard({
  searchParams,
}: {
  searchParams: SP;
}) {
  const s = await getSession();
  if (!s.session || s.session.role !== 'koordinator') {
    redirect('/koordinator/login');
  }

  const week = searchParams.week ?? currentWeekStart();
  const genderFilter = (searchParams.gender as Gender | undefined) ?? null;
  const kelasFilter = searchParams.kelas ?? null;
  const statusFilter = searchParams.status ?? null;
  const q = (searchParams.q ?? '').trim().toLowerCase();

  const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';

  // Fetch all kelas (for filter dropdowns) + filtered set for query
  const { data: allKelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender, musyrif:musyrif_id(id, name, whatsapp_number)')
    .order('gender')
    .order('name');

  const kelasList = (allKelas ?? []).filter((k) => {
    if (genderFilter && k.gender !== genderFilter) return false;
    if (kelasFilter && k.id !== kelasFilter) return false;
    return true;
  });
  const kelasIds = kelasList.map((k) => k.id);

  let pesertaQuery = supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas_id, whatsapp_number')
    .eq('active', true)
    .order('name');
  if (kelasIds.length > 0) {
    pesertaQuery = pesertaQuery.in('kelas_id', kelasIds);
  } else if (genderFilter || kelasFilter) {
    pesertaQuery = pesertaQuery.eq(
      'id',
      '00000000-0000-0000-0000-000000000000'
    );
  }
  const { data: allPesertaUnfiltered } = await pesertaQuery;
  const pesertaList = (allPesertaUnfiltered ?? []).filter((p) =>
    q ? p.name.toLowerCase().includes(q) : true
  );

  const pesertaIds = pesertaList.map((p) => p.id);
  const { data: setoranList } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, status, submitted_at, checked_at')
    .in(
      'peserta_id',
      pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000']
    )
    .eq('week_start', week);

  const setoranByPeserta = new Map(
    (setoranList ?? []).map((s) => [s.peserta_id, s])
  );

  const setoranIds = (setoranList ?? []).map((s) => s.id);
  const { data: rekamanList } = await supabaseAdmin
    .from('rekaman')
    .select('setoran_id, jenis, nilai')
    .in(
      'setoran_id',
      setoranIds.length ? setoranIds : ['00000000-0000-0000-0000-000000000000']
    );

  const rekamanBySetoran = new Map<string, NilaiRekaman[]>();
  for (const r of rekamanList ?? []) {
    const arr = rekamanBySetoran.get(r.setoran_id) ?? [];
    if (r.nilai) arr.push(r.nilai as NilaiRekaman);
    rekamanBySetoran.set(r.setoran_id, arr);
  }

  const kelasById = new Map(
    (allKelas ?? []).map((k) => [
      k.id,
      k as unknown as {
        id: string;
        name: string;
        gender: Gender;
        musyrif: { id: string; name: string; whatsapp_number: string };
      },
    ])
  );

  type Row = {
    peserta: { id: string; name: string; gender: Gender; kelas_id: string; whatsapp_number: string };
    setoran: { id: string; status: StatusSetoran; submitted_at: string | null; checked_at: string | null } | undefined;
    rekaman: NilaiRekaman[];
    statusKey: 'belum' | 'menunggu' | 'selesai';
  };

  const rowsAll: Row[] = pesertaList.map((p) => {
    const setoran = setoranByPeserta.get(p.id) as Row['setoran'];
    const rekaman = setoran ? rekamanBySetoran.get(setoran.id) ?? [] : [];
    let statusKey: Row['statusKey'] = 'belum';
    if (setoran?.status === 'submitted') statusKey = 'menunggu';
    else if (setoran?.status === 'checked') statusKey = 'selesai';
    return { peserta: p, setoran, rekaman, statusKey };
  });

  const rows = statusFilter
    ? rowsAll.filter((r) => r.statusKey === statusFilter)
    : rowsAll;

  // Counters across the un-filtered-by-status set
  const counters = {
    total: rowsAll.length,
    belum: rowsAll.filter((r) => r.statusKey === 'belum').length,
    menunggu: rowsAll.filter((r) => r.statusKey === 'menunggu').length,
    selesai: rowsAll.filter((r) => r.statusKey === 'selesai').length,
  };

  const weekOptions = [currentWeekStart(), ...previousWeeks(8)];

  return (
    <main style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 28px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" className="wordmark">
            <span className="mark">M</span>Maahir
          </Link>
          <span style={{ width: 1, height: 16, background: 'var(--line-2)' }} />
          <span className="t-small" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
            Koordinator
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="pekan-tag">
            <span className="dot" />
            Pekan {formatWeekRange(week)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              className="avatar"
              style={{
                width: 30,
                height: 30,
                fontSize: 12,
                background: 'var(--accent-tint)',
                color: 'var(--accent-2)',
              }}
            >
              <Initials name={s.session.name} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{s.session.name}</span>
          </div>
          <Link
            href="/akun"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Akun
          </Link>
          <form action={logout}>
            <button type="submit" className="btn btn-sm btn-ghost" style={{ height: 30 }}>
              {Icon.logout(12)} Keluar
            </button>
          </form>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="t-h1" style={{ fontSize: 24, marginBottom: 4 }}>
              Monitoring setoran
            </h1>
            <p className="t-small">
              {counters.total} peserta · diperbarui otomatis dari setoran masuk
            </p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div className="stat">
            <div className="v">{counters.total}</div>
            <div className="l">Total peserta</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: 'var(--merah-ink)' }}>{counters.belum}</div>
            <div className="l">
              <span className="accent-dot" style={{ background: 'var(--merah)' }} />
              Belum setor
            </div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: 'var(--kuning-ink)' }}>{counters.menunggu}</div>
            <div className="l">
              <span className="accent-dot" style={{ background: 'var(--kuning)' }} />
              Menunggu cek
            </div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: 'var(--hijau-ink)' }}>{counters.selesai}</div>
            <div className="l">
              <span className="accent-dot" style={{ background: 'var(--hijau)' }} />
              Selesai dicek
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <form method="get" className="filter-bar">
          <div className="search">
            {Icon.search(13)}
            <input
              name="q"
              defaultValue={q}
              placeholder="Cari peserta…"
            />
          </div>
          <select name="week" defaultValue={week} className="chip-select">
            {weekOptions.map((w) => (
              <option key={w} value={w}>
                {formatWeekRange(w)}
              </option>
            ))}
          </select>
          <select name="gender" defaultValue={genderFilter ?? ''} className="chip-select">
            <option value="">Semua gender</option>
            <option value="ikhwan">Ikhwan</option>
            <option value="akhwat">Akhwat</option>
          </select>
          <select name="kelas" defaultValue={kelasFilter ?? ''} className="chip-select">
            <option value="">Semua kelas</option>
            {(allKelas ?? []).map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} ({k.gender})
              </option>
            ))}
          </select>
          <select name="status" defaultValue={statusFilter ?? ''} className="chip-select">
            <option value="">Semua status</option>
            <option value="belum">Belum setor</option>
            <option value="menunggu">Menunggu cek</option>
            <option value="selesai">Selesai</option>
          </select>
          <span className="grow" />
          <button type="submit" className="act-btn">Terapkan</button>
          <Link href="/koordinator" className="act-btn">Reset</Link>
        </form>

        {/* Table */}
        <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="k-table">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>Peserta</th>
                  <th style={{ width: '12%' }}>Kelas</th>
                  <th style={{ width: '18%' }}>Musyrif</th>
                  <th style={{ width: '14%' }}>Status</th>
                  <th style={{ width: '12%' }}>Nilai</th>
                  <th style={{ width: '18%' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                      Tidak ada peserta sesuai filter.
                    </td>
                  </tr>
                )}
                {rows.map(({ peserta, setoran, rekaman, statusKey }) => {
                  const kelas = kelasById.get(peserta.kelas_id);
                  return (
                    <tr key={peserta.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                            <Initials name={peserta.name} />
                          </div>
                          <div>
                            <div className="nm">{peserta.name}</div>
                            <div className="sub">{peserta.gender}</div>
                          </div>
                        </div>
                      </td>
                      <td>Kelas {kelas?.name ?? '-'}</td>
                      <td style={{ color: 'var(--ink-2)' }}>
                        {kelas?.musyrif.name ?? '—'}
                      </td>
                      <td>
                        <StatusBadge status={statusKey} />
                        {setoran?.submitted_at && statusKey !== 'belum' && (
                          <div className="sub">{formatTime(setoran.submitted_at)}</div>
                        )}
                      </td>
                      <td>
                        {statusKey === 'selesai' && rekaman.length > 0 ? (
                          <span className="nilai-trio">
                            {rekaman.slice(0, 3).map((n, i) => (
                              <span key={i} className={`d ${n}`} />
                            ))}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted-2)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <ActionCell
                          statusKey={statusKey}
                          peserta={peserta}
                          setoranId={setoran?.id ?? null}
                          kelas={kelas}
                          appOrigin={appOrigin}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="t-small">
          Menampilkan {rows.length} dari {counters.total} peserta
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: 'belum' | 'menunggu' | 'selesai' }) {
  if (status === 'selesai') {
    return (
      <span className="badge badge-hijau">
        <span className="dot" />
        selesai
      </span>
    );
  }
  if (status === 'menunggu') {
    return (
      <span className="badge badge-kuning">
        <span className="dot" />
        menunggu cek
      </span>
    );
  }
  return (
    <span className="badge badge-merah">
      <span className="dot" />
      belum setor
    </span>
  );
}

function ActionCell({
  statusKey,
  peserta,
  setoranId,
  kelas,
  appOrigin,
}: {
  statusKey: 'belum' | 'menunggu' | 'selesai';
  peserta: { name: string; whatsapp_number: string; gender: Gender };
  setoranId: string | null;
  kelas:
    | {
        name: string;
        gender: Gender;
        musyrif: { name: string; whatsapp_number: string };
      }
    | undefined;
  appOrigin: string;
}) {
  if (statusKey === 'belum') {
    const setorUrl = `${appOrigin}/`;
    const waUrl = buildWaMeUrl(
      peserta.whatsapp_number,
      tplReminderPesertaBelumSetor({ pesertaName: peserta.name, setorUrl })
    );
    return (
      <a href={waUrl} target="_blank" rel="noopener" className="act-btn wa">
        {Icon.wa(11)} Ingatkan peserta
      </a>
    );
  }
  if (statusKey === 'menunggu' && setoranId && kelas) {
    const cekUrl = `${appOrigin}/musyrif/cek/${setoranId}`;
    const waUrl = buildWaMeUrl(
      kelas.musyrif.whatsapp_number,
      tplReminderMusyrifBelumCek({
        musyrifName: kelas.musyrif.name,
        pesertaName: peserta.name,
        kelasName: kelas.name,
        cekUrl,
      })
    );
    return (
      <a href={waUrl} target="_blank" rel="noopener" className="act-btn wa warn">
        {Icon.wa(11)} Ingatkan musyrif
      </a>
    );
  }
  return <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>—</span>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
