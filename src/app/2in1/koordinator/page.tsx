import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logout } from '@/lib/auth';
import { Icon, Initials } from '@/components/icons';
import {
  currentCycleStart,
  formatCycleDeadline,
  formatCycleRange,
  previousCycles,
  cyclesOfMonth,
  currentYearMonth,
} from '@/lib/week';
import {
  buildWaMeUrl,
  salutation,
  tplReminderPesertaBelumSetor,
  tplReminderMusyrifBelumCek,
  tplReminderMusyrifBelumSetor,
} from '@/lib/whatsapp';
import { absUrl, appOrigin } from '@/lib/url';
import { KoordinatorFilterBar } from '@/components/KoordinatorFilterBar';
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
    redirect('/2in1/koordinator/login');
  }
  const koordinatorGender = s.session.gender;

  const week = searchParams.week ?? currentCycleStart();
  const { year: curYear, month: curMonth, label: monthLabel } = currentYearMonth();
  const [h1Week, h2Week] = cyclesOfMonth(curYear, curMonth);
  const deadlineLabel = formatCycleDeadline(week);
  // View cross-gender penuh: koordinator (ikhwan & akhwat) lihat semua data.
  // Aksi (kirim reminder) tetap di-gating same-gender di UI bawah.
  const genderFilter: Gender | null =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? (searchParams.gender as Gender)
      : null;
  const kelasFilter = searchParams.kelas ?? null;
  const statusFilter = searchParams.status ?? null;
  const q = (searchParams.q ?? '').trim().toLowerCase();

  const origin = appOrigin();

  // Fetch semua kelas (kedua gender). Dropdown filter ada opsi gender + kelas.
  const { data: allKelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender, musyrif:musyrif_id(id, name, gender, whatsapp_number)')
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
        musyrif: { id: string; name: string; gender: Gender; whatsapp_number: string };
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

  const weekOptions = [currentCycleStart(), ...previousCycles(8)];

  // Risky peserta: ≥2 dari 3 cycle terakhir tidak submit/draft.
  const riskCycles = [week, ...previousCycles(2)];
  const { data: riskSetoranList } = await supabaseAdmin
    .from('setoran')
    .select('peserta_id, week_start, status')
    .in('peserta_id', pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000'])
    .in('week_start', riskCycles);

  const setoranByPesertaCycle = new Map<string, Map<string, string>>();
  for (const s of riskSetoranList ?? []) {
    const inner = setoranByPesertaCycle.get(s.peserta_id) ?? new Map<string, string>();
    inner.set(s.week_start, s.status);
    setoranByPesertaCycle.set(s.peserta_id, inner);
  }

  const riskyPeserta = pesertaList
    .map((p) => {
      const cycles = setoranByPesertaCycle.get(p.id) ?? new Map<string, string>();
      let missing = 0;
      for (const c of riskCycles) {
        const st = cycles.get(c);
        if (!st || st === 'draft') missing++;
      }
      return { peserta: p, missing };
    })
    .filter((r) => r.missing >= 2)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 8);

  // Monthly H1/H2 progress (semua peserta dari filter kelas/gender aktif, lepas status/q)
  const allPesertaIds = (allPesertaUnfiltered ?? []).map((p) => p.id);
  const { data: monthlySetoranRaw } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, week_start, status, submitted_at, checked_at')
    .in('peserta_id', allPesertaIds.length ? allPesertaIds : ['00000000-0000-0000-0000-000000000000'])
    .in('week_start', [h1Week, h2Week]);

  type MonthlySt = { id: string; peserta_id: string; week_start: string; status: string; submitted_at: string | null; checked_at: string | null };
  const monthlyByPeserta = new Map<string, { h1?: MonthlySt; h2?: MonthlySt }>();
  for (const st of (monthlySetoranRaw ?? []) as MonthlySt[]) {
    const entry = monthlyByPeserta.get(st.peserta_id) ?? {};
    if (st.week_start === h1Week) entry.h1 = st;
    else if (st.week_start === h2Week) entry.h2 = st;
    monthlyByPeserta.set(st.peserta_id, entry);
  }

  const checkedMonthlyIds = (monthlySetoranRaw ?? [])
    .filter((st) => st.status === 'checked')
    .map((st) => st.id);
  const { data: monthlyRekamanRaw } = checkedMonthlyIds.length
    ? await supabaseAdmin
        .from('rekaman')
        .select('setoran_id, nilai')
        .in('setoran_id', checkedMonthlyIds)
    : { data: [] as Array<{ setoran_id: string; nilai: string | null }> };

  const monthlyRekamanBySetoran = new Map<string, NilaiRekaman[]>();
  for (const r of monthlyRekamanRaw ?? []) {
    const arr = monthlyRekamanBySetoran.get(r.setoran_id) ?? [];
    if (r.nilai) arr.push(r.nilai as NilaiRekaman);
    monthlyRekamanBySetoran.set(r.setoran_id, arr);
  }

  function nilaiToSkor(n: NilaiRekaman): number {
    if (n === 'hijau') return 4;
    if (n === 'kuning') return 2;
    return 0;
  }

  type MonthlyRow = {
    peserta: { id: string; name: string; gender: Gender; kelas_id: string };
    rank: number;
    h1Status: 'belum' | 'menunggu' | 'selesai';
    h2Status: 'belum' | 'menunggu' | 'selesai';
    h1SetoranId?: string;
    h2SetoranId?: string;
    h1Rekaman: NilaiRekaman[];
    h2Rekaman: NilaiRekaman[];
    rataRata: number | null;
  };

  const monthlyRowsUnsorted = (allPesertaUnfiltered ?? []).map((p) => {
    const entry = monthlyByPeserta.get(p.id) ?? {};
    const h1Rek = entry.h1 ? monthlyRekamanBySetoran.get(entry.h1.id) ?? [] : [];
    const h2Rek = entry.h2 ? monthlyRekamanBySetoran.get(entry.h2.id) ?? [] : [];
    const allNilai = [...h1Rek, ...h2Rek];
    const rataRata =
      allNilai.length > 0
        ? allNilai.reduce((acc, n) => acc + nilaiToSkor(n), 0) / allNilai.length
        : null;
    const statusOf = (st: MonthlySt | undefined): 'belum' | 'menunggu' | 'selesai' => {
      if (!st) return 'belum';
      if (st.status === 'checked') return 'selesai';
      if (st.status === 'submitted') return 'menunggu';
      return 'belum';
    };
    return {
      peserta: p,
      rank: 0,
      h1Status: statusOf(entry.h1),
      h2Status: statusOf(entry.h2),
      h1SetoranId: entry.h1?.id,
      h2SetoranId: entry.h2?.id,
      h1Rekaman: h1Rek,
      h2Rekaman: h2Rek,
      rataRata,
    };
  });

  const monthlyRows: MonthlyRow[] = monthlyRowsUnsorted
    .sort((a, b) => {
      if (a.rataRata === null && b.rataRata === null) return 0;
      if (a.rataRata === null) return 1;
      if (b.rataRata === null) return -1;
      return b.rataRata - a.rataRata;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // Status setoran musyrif → syaikh untuk cycle yang dipilih (read-only,
  // koordinator tidak meminder; itu tugas syaikh).
  const allMusyrifIds = Array.from(
    new Set(
      (allKelas ?? [])
        .map((k) => (k.musyrif as unknown as { id: string } | null)?.id)
        .filter((id): id is string => typeof id === 'string')
    )
  );
  const { data: musyrifSetoranList } = await supabaseAdmin
    .from('setoran_musyrif')
    .select('musyrif_id, status, submitted_at, checked_at')
    .in(
      'musyrif_id',
      allMusyrifIds.length ? allMusyrifIds : ['00000000-0000-0000-0000-000000000000']
    )
    .eq('week_start', week);
  const musyrifSetoranByMusyrif = new Map(
    (musyrifSetoranList ?? []).map((m) => [m.musyrif_id, m])
  );

  // Inactive musyrif: last_login_at > 14 hari atau null.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: inactiveMusyrif } = allMusyrifIds.length
    ? await supabaseAdmin
        .from('musyrif')
        .select('id, name, gender, whatsapp_number, last_login_at')
        .in('id', allMusyrifIds)
        .eq('active', true)
        .or(`last_login_at.is.null,last_login_at.lt.${fourteenDaysAgo}`)
        .order('last_login_at', { ascending: true, nullsFirst: true })
    : { data: [] as Array<{ id: string; name: string; gender: Gender; whatsapp_number: string; last_login_at: string | null }> };
  // Daftar musyrif unik dari kelasList (deduped by id)
  const musyrifMap = new Map<
    string,
    { id: string; name: string; gender: Gender; whatsapp_number: string }
  >();
  for (const k of allKelas ?? []) {
    const m = k.musyrif as unknown as
      | { id: string; name: string; gender: Gender; whatsapp_number: string }
      | null;
    if (m?.id && !musyrifMap.has(m.id)) {
      musyrifMap.set(m.id, m);
    }
  }
  const musyrifSummaryRows = Array.from(musyrifMap.values()).map((m) => {
    const st = musyrifSetoranByMusyrif.get(m.id);
    let statusKey: 'belum' | 'menunggu' | 'selesai' = 'belum';
    if (st?.status === 'checked') statusKey = 'selesai';
    else if (st?.status === 'submitted') statusKey = 'menunggu';
    return { musyrif: m, statusKey };
  });

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
            Koordinator {koordinatorGender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="pekan-tag">
            <span className="dot" />
            Pekan {formatCycleRange(week)}
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
            href="/2in1/laporan"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Laporan
          </Link>
          <Link
            href="/2in1/koordinator/admin"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Admin
          </Link>
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

        {/* Alerts: risky peserta + inactive musyrif */}
        {(riskyPeserta.length > 0 || (inactiveMusyrif ?? []).length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
            {riskyPeserta.length > 0 && (
              <div className="card-flat" style={{ padding: '14px 18px', borderLeft: '3px solid var(--merah)' }}>
                <div className="t-tiny" style={{ color: 'var(--merah-ink)', marginBottom: 6 }}>
                  PESERTA BERISIKO (≥2 cycle tidak setor dari 3 cycle terakhir)
                </div>
                {riskyPeserta.map((r) => {
                  const kelas = kelasById.get(r.peserta.kelas_id);
                  return (
                    <div key={r.peserta.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{r.peserta.name}</span>
                        <span className="t-small" style={{ color: 'var(--muted-2)', marginLeft: 6 }}>
                          {kelas?.name ?? ''}
                        </span>
                      </div>
                      <span className="badge badge-merah" style={{ fontSize: 10 }}>
                        {r.missing}/3 cycle
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {(inactiveMusyrif ?? []).length > 0 && (
              <div className="card-flat" style={{ padding: '14px 18px', borderLeft: '3px solid var(--kuning-ink)' }}>
                <div className="t-tiny" style={{ color: 'var(--kuning-ink)', marginBottom: 6 }}>
                  MUSYRIF/MUSYRIFAH TIDAK AKTIF ({'>'}14 hari tidak login)
                </div>
                {(inactiveMusyrif ?? []).slice(0, 8).map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>
                      <span className="t-small" style={{ color: 'var(--muted-2)', marginLeft: 6 }}>
                        {m.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                      </span>
                    </div>
                    <span className="t-small" style={{ color: 'var(--muted)' }}>
                      {m.last_login_at
                        ? new Date(m.last_login_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                        : 'belum pernah'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filter bar (auto-apply on change) */}
        <KoordinatorFilterBar
          kelasOptions={(allKelas ?? []).map((k) => ({
            id: k.id,
            name: k.name,
            gender: k.gender as Gender,
          }))}
          weekOptions={weekOptions.map((w) => ({
            value: w,
            label: formatCycleRange(w),
          }))}
          current={{
            q: searchParams.q ?? '',
            week,
            kelas: kelasFilter,
            status: statusFilter,
            gender: genderFilter,
          }}
        />

        {/* Table */}
        <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="k-table">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>Peserta</th>
                  <th style={{ width: '12%' }}>Kelas</th>
                  <th style={{ width: '18%' }}>Musyrif/Musyrifah</th>
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
                            <Link
                              href={`/peserta/${peserta.id}`}
                              className="nm"
                              style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed var(--line-2)' }}
                            >
                              {peserta.name}
                            </Link>
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
                          origin={origin}
                          deadlineLabel={deadlineLabel}
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

        {/* Progress Ranking Bulanan */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div className="t-tiny">RANKING PROGRESS BULAN INI — {monthLabel.toUpperCase()}</div>
              <div className="t-small" style={{ marginTop: 2 }}>{monthlyRows.length} peserta · sorted by rata-rata nilai</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Link
                href="/2in1/koordinator/penilaian"
                className="btn btn-sm btn-ghost"
                style={{ height: 28, padding: '0 10px', textDecoration: 'none', fontSize: 12 }}
              >
                Input Nilai
              </Link>
              <Link
                href="/2in1/koordinator/matrix"
                className="btn btn-sm btn-primary"
                style={{ height: 28, padding: '0 10px', textDecoration: 'none', fontSize: 12 }}
              >
                Matrix Guru
              </Link>
            </div>
          </div>
          <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="k-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th style={{ width: '28%' }}>Peserta</th>
                    <th style={{ width: '12%' }}>Kelas</th>
                    <th style={{ width: '18%', textAlign: 'center' }}>H1 ({h1Week.slice(5)})</th>
                    <th style={{ width: '18%', textAlign: 'center' }}>H2 ({h2Week.slice(5)})</th>
                    <th style={{ width: '12%', textAlign: 'center' }}>Rata²</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                        Belum ada data bulan ini.
                      </td>
                    </tr>
                  )}
                  {monthlyRows.map(({ peserta, rank, h1Status, h2Status, h1SetoranId, h2SetoranId, h1Rekaman, h2Rekaman, rataRata }) => {
                    const kelas = kelasById.get(peserta.kelas_id);
                    return (
                      <tr key={peserta.id}>
                        <td style={{ color: rank <= 3 ? 'var(--accent-2)' : 'var(--muted)', fontWeight: rank <= 3 ? 700 : 400 }}>
                          {rank}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                              <Initials name={peserta.name} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{peserta.name}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--ink-2)', fontSize: 12 }}>
                          {kelas?.name ?? '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <MonthlyStatusCell status={h1Status} setoranId={h1SetoranId} rekaman={h1Rekaman} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <MonthlyStatusCell status={h2Status} setoranId={h2SetoranId} rekaman={h2Rekaman} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {rataRata !== null ? (
                            <span style={{
                              fontWeight: 700,
                              fontSize: 14,
                              color: rataRata >= 3 ? 'var(--hijau-ink)' : rataRata >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)',
                            }}>
                              {rataRata.toFixed(1)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted-2)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Status setoran musyrif → syaikh */}
        <div style={{ marginTop: 12 }}>
          <div className="section-row">
            <div className="t-tiny">Setoran musyrif → Syaikh/Ustadzah</div>
            <div className="t-small">{musyrifSummaryRows.length} musyrif</div>
          </div>
          <div className="card-flat" style={{ overflow: 'hidden' }}>
            {musyrifSummaryRows.length === 0 ? (
              <div style={{ padding: 14 }}>
                <p className="t-small">Belum ada musyrif terdaftar.</p>
              </div>
            ) : (
              musyrifSummaryRows.map(({ musyrif, statusKey }) => {
                const sameGender = musyrif.gender === koordinatorGender;
                const setorUrl = absUrl('/2in1/musyrif/setor');
                const reminderWa =
                  sameGender && statusKey === 'belum'
                    ? buildWaMeUrl(
                        musyrif.whatsapp_number,
                        tplReminderMusyrifBelumSetor({
                          musyrifName: musyrif.name,
                          musyrifGender: musyrif.gender,
                          setorUrl,
                          deadlineLabel,
                        })
                      )
                    : null;
                return (
                  <div key={musyrif.id} className="row">
                    <div className="avatar">
                      <Initials name={musyrif.name} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{musyrif.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {salutation(musyrif.gender)}
                      </div>
                    </div>
                    {reminderWa && (
                      <a
                        href={reminderWa}
                        target="_blank"
                        rel="noopener"
                        className="act-btn wa"
                        style={{ textDecoration: 'none', marginRight: 8 }}
                      >
                        {Icon.wa(11)} Ingatkan
                      </a>
                    )}
                    <StatusBadge status={statusKey} />
                  </div>
                );
              })
            )}
          </div>
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
  origin,
  deadlineLabel,
}: {
  statusKey: 'belum' | 'menunggu' | 'selesai';
  peserta: { name: string; whatsapp_number: string; gender: Gender };
  setoranId: string | null;
  kelas:
    | {
        name: string;
        gender: Gender;
        musyrif: { name: string; gender: Gender; whatsapp_number: string };
      }
    | undefined;
  origin: string;
  deadlineLabel: string;
}) {
  if (statusKey === 'belum') {
    const setorUrl = `${origin}/2in1/peserta`;
    const waUrl = buildWaMeUrl(
      peserta.whatsapp_number,
      tplReminderPesertaBelumSetor({
        pesertaName: peserta.name,
        pesertaGender: peserta.gender,
        setorUrl,
        deadlineLabel,
      })
    );
    return (
      <a href={waUrl} target="_blank" rel="noopener" className="act-btn wa">
        {Icon.wa(11)} Ingatkan peserta
      </a>
    );
  }
  if (statusKey === 'menunggu' && setoranId && kelas) {
    const cekUrl = absUrl(`/2in1/musyrif/cek/${setoranId}`);
    const waUrl = buildWaMeUrl(
      kelas.musyrif.whatsapp_number,
      tplReminderMusyrifBelumCek({
        musyrifName: kelas.musyrif.name,
        musyrifGender: kelas.musyrif.gender,
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

function MonthlyStatusCell({
  status,
  setoranId,
  rekaman,
}: {
  status: 'belum' | 'menunggu' | 'selesai';
  setoranId?: string;
  rekaman: NilaiRekaman[];
}) {
  if (status === 'belum') {
    return <span className="badge badge-merah" style={{ fontSize: 10 }}><span className="dot" />belum</span>;
  }
  if (status === 'menunggu' && setoranId) {
    return (
      <Link href={`/2in1/musyrif/cek/${setoranId}`} className="badge badge-kuning" style={{ textDecoration: 'none', fontSize: 10 }}>
        <span className="dot" />Cek
      </Link>
    );
  }
  if (status === 'selesai' && rekaman.length > 0) {
    return (
      <span className="nilai-trio" style={{ justifyContent: 'center' }}>
        {rekaman.slice(0, 3).map((n, i) => <span key={i} className={`d ${n}`} />)}
        {Array.from({ length: Math.max(0, 3 - rekaman.length) }).map((_, i) => <span key={`e${i}`} className="d" />)}
      </span>
    );
  }
  return <span className="badge badge-hijau" style={{ fontSize: 10 }}><span className="dot" />selesai</span>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
