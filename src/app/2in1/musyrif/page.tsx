import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  currentCycleStart,
  formatCycleDeadline,
  formatCycleRange,
  cyclesOfMonth,
  currentYearMonth,
} from '@/lib/week';
import { logout } from '@/lib/auth';
import { Icon, Initials } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import {
  buildWaMeUrl,
  salutation,
  syaikhTitle,
  tplReminderPesertaBelumSetor,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import type { Gender, NilaiRekaman, StatusSetoran } from '@/types/db';

export const dynamic = 'force-dynamic';

type PesertaRow = {
  id: string;
  name: string;
  gender: Gender;
  kelas_id: string;
  whatsapp_number: string;
};

type SetoranRow = {
  id: string;
  peserta_id: string;
  week_start: string;
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
};

function nilaiToSkor(n: NilaiRekaman): number {
  if (n === 'hijau') return 4;
  if (n === 'kuning') return 2;
  return 0;
}

export default async function MusyrifDashboard() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') redirect('/2in1/musyrif/login');
  const musyrifId = s.session.musyrif_id;
  const musyrifGender = s.session.gender;
  const sapaan = salutation(musyrifGender);

  const cycle = currentCycleStart();
  const deadlineLabel = formatCycleDeadline(cycle);
  const { year, month, label: monthLabel } = currentYearMonth();
  const [h1Week, h2Week] = cyclesOfMonth(year, month);

  const { data: kelasList } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender')
    .eq('musyrif_id', musyrifId);

  const kelasIds = (kelasList ?? []).map((k) => k.id);

  const { data: pesertaListRaw } = await supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas_id, whatsapp_number')
    .eq('active', true)
    .in(
      'kelas_id',
      kelasIds.length ? kelasIds : ['00000000-0000-0000-0000-000000000000']
    )
    .order('name');
  const pesertaList = (pesertaListRaw ?? []) as PesertaRow[];
  const pesertaIds = pesertaList.map((p) => p.id);

  // Current cycle data
  const { data: setoranListRaw } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, week_start, status, submitted_at, checked_at')
    .in(
      'peserta_id',
      pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000']
    )
    .eq('week_start', cycle);
  const setoranList = (setoranListRaw ?? []) as SetoranRow[];
  const setoranByPeserta = new Map(setoranList.map((st) => [st.peserta_id, st]));

  const checkedIds = setoranList.filter((st) => st.status === 'checked').map((st) => st.id);
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

  const kelasById = new Map((kelasList ?? []).map((k) => [k.id, k]));

  type StatusKey = 'belum' | 'menunggu' | 'selesai';
  type Row = {
    peserta: PesertaRow;
    setoran: SetoranRow | undefined;
    rekaman: NilaiRekaman[];
    statusKey: StatusKey;
  };
  const rows: Row[] = pesertaList.map((p) => {
    const setoran = setoranByPeserta.get(p.id);
    const rekaman = setoran ? rekamanBySetoran.get(setoran.id) ?? [] : [];
    let statusKey: StatusKey = 'belum';
    if (setoran?.status === 'submitted') statusKey = 'menunggu';
    else if (setoran?.status === 'checked') statusKey = 'selesai';
    return { peserta: p, setoran, rekaman, statusKey };
  });

  const counters = {
    total: rows.length,
    belum: rows.filter((r) => r.statusKey === 'belum').length,
    menunggu: rows.filter((r) => r.statusKey === 'menunggu').length,
    selesai: rows.filter((r) => r.statusKey === 'selesai').length,
  };

  // Setoran musyrif → syaikh
  const { data: selfSetoranRaw } = await supabaseAdmin
    .from('setoran_musyrif')
    .select('id, status')
    .eq('musyrif_id', musyrifId)
    .eq('week_start', cycle)
    .maybeSingle();
  const selfSetoran = selfSetoranRaw as { id: string; status: StatusSetoran } | null;

  // Monthly H1/H2 data
  const { data: monthlySetoranRaw } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, week_start, status, submitted_at, checked_at')
    .in(
      'peserta_id',
      pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000']
    )
    .in('week_start', [h1Week, h2Week]);
  const monthlySetoran = (monthlySetoranRaw ?? []) as SetoranRow[];

  // Map: peserta_id → { h1: SetoranRow, h2: SetoranRow }
  const monthlyByPeserta = new Map<string, { h1?: SetoranRow; h2?: SetoranRow }>();
  for (const st of monthlySetoran) {
    const entry = monthlyByPeserta.get(st.peserta_id) ?? {};
    if (st.week_start === h1Week) entry.h1 = st;
    else if (st.week_start === h2Week) entry.h2 = st;
    monthlyByPeserta.set(st.peserta_id, entry);
  }

  const checkedMonthlyIds = monthlySetoran
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

  type MonthlyRow = {
    peserta: PesertaRow;
    h1: { setoran?: SetoranRow; rekaman: NilaiRekaman[] };
    h2: { setoran?: SetoranRow; rekaman: NilaiRekaman[] };
    rataRata: number | null;
  };

  const monthlyRows: MonthlyRow[] = pesertaList.map((p) => {
    const entry = monthlyByPeserta.get(p.id) ?? {};
    const h1Rek = entry.h1 ? monthlyRekamanBySetoran.get(entry.h1.id) ?? [] : [];
    const h2Rek = entry.h2 ? monthlyRekamanBySetoran.get(entry.h2.id) ?? [] : [];
    const allNilai = [...h1Rek, ...h2Rek];
    const rataRata =
      allNilai.length > 0
        ? allNilai.reduce((acc, n) => acc + nilaiToSkor(n), 0) / allNilai.length
        : null;
    return {
      peserta: p,
      h1: { setoran: entry.h1, rekaman: h1Rek },
      h2: { setoran: entry.h2, rekaman: h2Rek },
      rataRata,
    };
  });

  const monthlyRowsSorted = [...monthlyRows].sort((a, b) => {
    if (a.rataRata === null && b.rataRata === null) return 0;
    if (a.rataRata === null) return 1;
    if (b.rataRata === null) return -1;
    return b.rataRata - a.rataRata;
  });

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
          <FeatureNav current="/2in1" />
          <div className="row" style={{ padding: '4px 0 16px' }}>
            <div
              className="avatar"
              style={{ background: 'var(--accent-tint)', color: 'var(--accent-2)' }}
            >
              <Initials name={s.session.name} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sapaan}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{s.session.name}</div>
            </div>
            <span className="pekan-tag">
              <span className="dot" />
              Pekan {formatCycleRange(cycle)}
            </span>
          </div>

          {/* Setoran musyrif → syaikh */}
          <div className="section-row">
            <div className="t-tiny">Setoran saya ke {syaikhTitle(musyrifGender)}</div>
            <SelfSetoranBadge status={selfSetoran?.status} />
          </div>
          <div className="card-flat" style={{ padding: 14, marginBottom: 16 }}>
            <SelfSetoranAction
              status={selfSetoran?.status ?? null}
              setoranId={selfSetoran?.id ?? null}
              musyrifGender={musyrifGender}
            />
          </div>

          {/* Stats peserta cycle berjalan */}
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

          {/* Cycle berjalan: list peserta */}
          <div className="section-row">
            <div className="t-tiny">Cycle berjalan — peserta saya</div>
            <div className="t-small">{counters.total} orang</div>
          </div>

          {rows.length === 0 ? (
            <div className="card-flat" style={{ padding: 18 }}>
              <p className="t-small">Belum ada peserta di kelas Anda.</p>
            </div>
          ) : (
            <div className="card-flat" style={{ overflow: 'hidden' }}>
              {rows.map(({ peserta, setoran, rekaman, statusKey }) => {
                const k = kelasById.get(peserta.kelas_id);
                const setorUrl = absUrl('/2in1/peserta');
                const reminderWa = buildWaMeUrl(
                  peserta.whatsapp_number,
                  tplReminderPesertaBelumSetor({
                    pesertaName: peserta.name,
                    pesertaGender: peserta.gender,
                    setorUrl,
                    deadlineLabel,
                  })
                );
                return (
                  <div key={peserta.id} className="row" style={{ color: 'var(--ink)' }}>
                    <div className="avatar">
                      <Initials name={peserta.name} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{peserta.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Kelas {k?.name ?? '-'}
                        {setoran?.submitted_at && statusKey !== 'belum' && (
                          <> · {formatTime(setoran.submitted_at)}</>
                        )}
                      </div>
                    </div>
                    {statusKey === 'belum' && (
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
                    {statusKey === 'menunggu' && setoran && (
                      <Link
                        href={`/2in1/musyrif/cek/${setoran.id}`}
                        className="badge badge-kuning"
                        style={{ textDecoration: 'none' }}
                      >
                        <span className="dot" />
                        Cek
                      </Link>
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

          {/* Progress bulanan H1/H2 */}
          <div className="section-row" style={{ marginTop: 24 }}>
            <div className="t-tiny">Progress bulan ini — {monthLabel}</div>
            <div className="t-small">{counters.total} peserta</div>
          </div>
          <div
            className="card-flat"
            style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}
          >
            {/* Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 60px',
                gap: 8,
                padding: '8px 14px',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--line)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <div>Peserta</div>
              <div style={{ textAlign: 'center' }}>H1</div>
              <div style={{ textAlign: 'center' }}>H2</div>
              <div style={{ textAlign: 'center' }}>Rata²</div>
            </div>
            {monthlyRowsSorted.length === 0 ? (
              <div style={{ padding: 18 }}>
                <p className="t-small">Belum ada data bulan ini.</p>
              </div>
            ) : (
              monthlyRowsSorted.map(({ peserta, h1, h2, rataRata }, idx) => {
                const setorUrl = absUrl('/2in1/peserta');
                const reminderWa = buildWaMeUrl(
                  peserta.whatsapp_number,
                  tplReminderPesertaBelumSetor({
                    pesertaName: peserta.name,
                    pesertaGender: peserta.gender,
                    setorUrl,
                    deadlineLabel,
                  })
                );
                return (
                  <div
                    key={peserta.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px 60px',
                      gap: 8,
                      padding: '10px 14px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--line)',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {peserta.name}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <MonthlyCell
                        setoran={h1.setoran}
                        rekaman={h1.rekaman}
                        reminderWa={reminderWa}
                      />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <MonthlyCell
                        setoran={h2.setoran}
                        rekaman={h2.rekaman}
                        reminderWa={reminderWa}
                      />
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 13 }}>
                      {rataRata !== null ? (
                        <span style={{ fontWeight: 600, color: rataRata >= 3 ? 'var(--hijau-ink)' : rataRata >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)' }}>
                          {rataRata.toFixed(1)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted-2)' }}>—</span>
                      )}
                    </div>
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

function MonthlyCell({
  setoran,
  rekaman,
  reminderWa,
}: {
  setoran: SetoranRow | undefined;
  rekaman: NilaiRekaman[];
  reminderWa: string;
}) {
  if (!setoran) {
    return (
      <a
        href={reminderWa}
        target="_blank"
        rel="noopener"
        className="act-btn wa"
        style={{ textDecoration: 'none', fontSize: 10, padding: '3px 6px' }}
      >
        {Icon.wa(10)}
      </a>
    );
  }
  if (setoran.status === 'submitted') {
    return (
      <Link
        href={`/2in1/musyrif/cek/${setoran.id}`}
        className="badge badge-kuning"
        style={{ textDecoration: 'none', fontSize: 10 }}
      >
        <span className="dot" />
        Cek
      </Link>
    );
  }
  if (setoran.status === 'checked' && rekaman.length > 0) {
    return (
      <span className="nilai-trio" style={{ justifyContent: 'center' }}>
        {rekaman.slice(0, 3).map((n, i) => (
          <span key={i} className={`d ${n}`} />
        ))}
        {Array.from({ length: Math.max(0, 3 - rekaman.length) }).map((_, i) => (
          <span key={`e${i}`} className="d" />
        ))}
      </span>
    );
  }
  return <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>—</span>;
}

function SelfSetoranBadge({ status }: { status: StatusSetoran | undefined }) {
  if (status === 'checked') {
    return (
      <span className="badge badge-hijau">
        <span className="dot" />
        sudah dinilai
      </span>
    );
  }
  if (status === 'submitted') {
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

function SelfSetoranAction({
  status,
  setoranId: _setoranId,
  musyrifGender,
}: {
  status: StatusSetoran | null;
  setoranId: string | null;
  musyrifGender: Gender;
}) {
  if (status === 'checked') {
    return <div className="t-small">Antum sudah dinilai cycle ini. Barakallahu fiik.</div>;
  }
  if (status === 'submitted') {
    return (
      <Link href="/2in1/musyrif/setor" className="btn btn-block btn-ghost" style={{ textDecoration: 'none' }}>
        Lihat / rekam ulang setoran saya
      </Link>
    );
  }
  return (
    <Link href="/2in1/musyrif/setor" className="btn btn-block btn-primary" style={{ textDecoration: 'none' }}>
      {Icon.mic(14)} Setor ke {syaikhTitle(musyrifGender)} sekarang
    </Link>
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
