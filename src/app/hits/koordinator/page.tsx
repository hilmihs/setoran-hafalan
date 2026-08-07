import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { getNoDataActionInfo, type InsidenDetail } from '@/lib/hits-ranking';
import { getHitsKoordinatorRekap, type HitsMode } from '@/lib/hits-koordinator-rekap';
import { getHitsPengajuan } from '@/lib/hits-pengajuan';
import type { CakupanPengajar, PertemuanObservasi } from '@/lib/hits-observasi-cakupan';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { WeekNavSelect } from '@/components/WeekNavSelect';
import { NoteQuickAdd } from '@/components/NoteQuickAdd';
import { buildWaMeUrl, tplReminderIsiKeterangan, tplReminderPengajarIsiData } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { monthOptionsSince } from '@/lib/month';
import { weekStartMonday, formatWeekRangeShort, recentMondays } from '@/lib/week';
import type { Gender } from '@/types/db';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = '2026-01'; // batch HITS paling awal mulai Jan 2026

const JENIS_LABEL: Record<string, string> = {
  KMT: 'Kelas Mulai Terlambat',
  KBLA: 'Kelas Berakhir Lebih Awal',
  JKG: 'Jadwal Kelas Ganti',
  BADAL: 'Pengajar digantikan (badal)',
  TIDAK_LATIHAN: 'Tidak memberikan latihan',
};
const JENIS_SHORT: Record<string, string> = {
  KMT: 'KMT',
  KBLA: 'KBLA',
  JKG: 'JKG',
  BADAL: 'BADAL',
  TIDAK_LATIHAN: 'TL',
};
const STATUS_LABEL: Record<InsidenDetail['status'], string> = {
  belum_ditabayyun: 'Belum ditabayyun',
  nunggu_alasan: 'Nunggu alasan pengajar',
  pending: 'Nunggu putusan koordinator',
  diputus: 'Sudah diputus',
};

/** Putusan koordinator ketua kelas: udzur syar'i diterima / ditolak. */
function putusanText(i: InsidenDetail): string {
  if (i.status !== 'diputus' || i.isUdzurSyari === null) return STATUS_LABEL[i.status];
  return i.isUdzurSyari ? '✅ Udzur syar’i diterima' : '❌ Udzur ditolak';
}

const TGL_PENDEK = (t: string) => {
  const [, m, d] = t.split('-').map(Number);
  return `${d}/${m}`;
};

/**
 * Cakupan observasi ketua kelas: pertemuan mana pada periode ini yang sudah
 * diobservasi dan mana yang belum. "Belum" mencakup baris pra-generate impor —
 * baris itu ada di DB tapi bukan hasil observasi siapa pun.
 */
function CakupanObservasiRows({ c }: { c: CakupanPengajar }) {
  const perHalaqah = new Map<string, PertemuanObservasi[]>();
  for (const p of c.pertemuan) {
    const arr = perHalaqah.get(p.halaqahName) ?? [];
    arr.push(p);
    perHalaqah.set(p.halaqahName, arr);
  }
  return (
    <details style={{ background: 'var(--surface-2, var(--surface-3))' }}>
      <summary className="t-tiny" style={{ cursor: 'pointer', padding: '6px 12px', color: 'var(--muted-2)' }}>
        ▸ Observasi ketua kelas — <strong>{c.sudah}/{c.total}</strong> pertemuan terisi
        {c.belum > 0 && (
          <span style={{ color: 'var(--merah-ink)' }}> · {c.belum} belum diobservasi</span>
        )}
      </summary>
      <div style={{ padding: '8px 12px 12px' }}>
        {[...perHalaqah.entries()].map(([nama, list]) => (
          <div key={nama} style={{ marginBottom: 8 }}>
            <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 4 }}>{nama}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {list.map((p) => {
                const sudah = p.status === 'sudah';
                return (
                  <span
                    key={`${p.halaqahId}-${p.tanggal}`}
                    title={
                      sudah
                        ? `${p.tanggal} — sudah diobservasi${p.libur ? ' (libur)' : ''}`
                        : p.status === 'pragenerate'
                          ? `${p.tanggal} — baris pra-generate impor, ketua kelas belum mengisi`
                          : `${p.tanggal} — belum diisi ketua kelas`
                    }
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 5,
                      border: '1px solid',
                      borderColor: sudah ? 'var(--hijau-line)' : 'var(--merah-line)',
                      background: sudah ? 'var(--hijau-tint)' : 'var(--merah-tint)',
                      color: sudah ? 'var(--hijau-ink)' : 'var(--merah-ink)',
                      opacity: p.libur ? 0.65 : 1,
                    }}
                  >
                    {sudah ? '✓' : '○'} {TGL_PENDEK(p.tanggal)}
                    {p.pertemuanNo ? ` (${p.pertemuanNo})` : ''}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
          ✓ hijau = ketua kelas sudah mengisi keterangan · ○ merah = belum.
          Pelanggaran (TL/KMT/KBLA/JKG) hanya dihitung dari pertemuan yang sudah diobservasi
          dan tanggalnya sudah lewat.
        </p>
      </div>
    </details>
  );
}

/** Rincian insiden KMT/KBLA/JKG/TL satu pengajar — alasan & putusan. */
function InsidenDetailRows({ list }: { list: InsidenDetail[] }) {
  return (
    <details style={{ background: 'var(--surface-2, var(--surface-3))' }}>
      <summary
        className="t-tiny"
        style={{ cursor: 'pointer', padding: '6px 12px', color: 'var(--muted-2)' }}
      >
        Rincian {list.length} insiden — alasan ketua kelas, tabayyun &amp; putusan
      </summary>
      <div style={{ padding: '0 12px 12px' }}>
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 92 }}>Tanggal</th>
              <th style={{ width: 40 }}>Prt</th>
              <th>Halaqah</th>
              <th style={{ width: 150 }}>Pelanggaran</th>
              <th>Keterangan ketua</th>
              <th>Alasan pengajar (tabayyun)</th>
              <th style={{ width: 150 }}>Putusan koordinator</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.keteranganId}>
                <td className="t-tiny" style={{ whiteSpace: 'nowrap' }}>{i.tanggal}</td>
                <td className="t-mono t-tiny">{i.pertemuanNo}</td>
                <td className="t-tiny">{i.halaqahName}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {i.pelanggaran.map((p, idx) => (
                      <span
                        key={`${p.jenis}-${idx}`}
                        className="badge"
                        title={JENIS_LABEL[p.jenis] ?? p.jenis}
                        style={{
                          background: p.jenis === 'TIDAK_LATIHAN' ? 'var(--merah-tint)' : 'var(--kuning-tint)',
                          borderColor: p.jenis === 'TIDAK_LATIHAN' ? 'var(--merah-line)' : 'var(--kuning-line)',
                          color: p.jenis === 'TIDAK_LATIHAN' ? 'var(--merah-ink)' : 'var(--kuning-ink)',
                        }}
                      >
                        {JENIS_SHORT[p.jenis] ?? p.jenis}
                        {p.detail ? ` · ${p.detail}` : ''}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="t-tiny" style={{ color: 'var(--muted-2)', maxWidth: 220 }}>
                  {i.catatanKetua?.trim() || '—'}
                </td>
                <td className="t-tiny" style={{ color: 'var(--muted-2)', maxWidth: 220 }}>
                  {i.alasanPengajar?.trim() || '—'}
                </td>
                <td className="t-tiny" style={{ maxWidth: 180 }}>
                  <div>{putusanText(i)}</div>
                  {i.keputusanCatatan?.trim() ? (
                    <div style={{ color: 'var(--muted-2)' }}>{i.keputusanCatatan}</div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function HitsKoordinatorPage({
  searchParams,
}: {
  searchParams: { mode?: string; month?: string; week?: string; gender?: string; sort?: string; dir?: string };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const pengajuanPending = await getHitsPengajuan('pending');
  const pengajuanCount = pengajuanPending.length;
  const pengajuanConflict = pengajuanPending.some((r) => r.conflict);

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);

  const mode = searchParams.mode === 'minggu' ? 'minggu' : 'bulan';
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;
  const week =
    searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week)
      ? searchParams.week
      : weekStartMonday();

  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  // Satu loader dipakai bersama halaman ini, export XLSX, dan halaman cetak —
  // supaya angka di layar dan di file tak mungkin berbeda.
  const rekap = await getHitsKoordinatorRekap({ mode, month, week, gender: genderFilter });
  const periodeLabel = rekap.periodeLabel;
  const insidenByPengajar = rekap.insidenByPengajar;
  const cakupanByPengajar = rekap.cakupanByPengajar;
  const ranked = [...rekap.ranked];
  const noData = rekap.noData;
  const noDataAksi = await getNoDataActionInfo(noData);

  // Sortir kolom (tinggi→rendah default). Tanpa sort → urutan ranking asli (%KBBS).
  const SORT_KEYS = ['pctKbbs', 'kmt', 'kbla', 'jkg', 'tidakLatihan', 'hutangSaldo', 'halaqahCount', 'pengajarNama'] as const;
  type SortKey = (typeof SORT_KEYS)[number];
  const sortKey = (SORT_KEYS as readonly string[]).includes(searchParams.sort ?? '') ? (searchParams.sort as SortKey) : null;
  const dir: 'asc' | 'desc' = searchParams.dir === 'asc' ? 'asc' : 'desc';
  if (sortKey) {
    ranked.sort((a, b) => {
      if (sortKey === 'pengajarNama') {
        const c = a.pengajarNama.localeCompare(b.pengajarNama);
        return dir === 'asc' ? c : -c;
      }
      const av = (a[sortKey] as number) ?? 0;
      const bv = (b[sortKey] as number) ?? 0;
      return dir === 'asc' ? av - bv : bv - av;
    });
  }
  // Base query utk link sortir (pertahankan periode + gender).
  const sortBase =
    `?mode=${mode}` +
    (mode === 'minggu' ? `&week=${week}` : `&month=${month}`) +
    (genderFilter ? `&gender=${genderFilter}` : '');
  const sortHref = (key: SortKey) => {
    const nextDir = sortKey === key && dir === 'desc' ? 'asc' : 'desc';
    return `${sortBase}&sort=${key}&dir=${nextDir}`;
  };
  const arrow = (key: SortKey) => (sortKey === key ? (dir === 'desc' ? ' ↓' : ' ↑') : '');

  const genderLabel =
    genderFilter === 'ikhwan' ? 'Ikhwan' : genderFilter === 'akhwat' ? 'Akhwat' : 'Ikhwan & Akhwat';
  const weekOpts = recentMondays(12).map((mon) => ({ value: mon, label: formatWeekRangeShort(mon) }));
  const g = genderFilter ? `&gender=${genderFilter}` : '';
  const pctColor = (p: number) =>
    p >= 90 ? 'var(--hijau-ink)' : p >= 75 ? 'var(--kuning-ink)' : 'var(--merah-ink)';
  const detailHref = (r: { pengajarId: string; gender: Gender | null }) =>
    `/matrix/koordinator/pengajar/${r.pengajarId}${r.gender ? `?gender=${r.gender}` : ''}`;
  const cnt = (n: number) => ({
    text: n > 0 ? String(n) : '—',
    color: n > 0 ? 'var(--merah-ink)' : 'var(--muted)',
  });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Soft Skill HITS
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link
              href="/hits/koordinator/ketua-kelas"
              className="btn btn-sm btn-primary"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none' }}
            >
              {Icon.shield(13)} Ketua Kelas
            </Link>
            <Link
              href="/hits/koordinator/pertemuan"
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              {Icon.shield(13)} Override Pertemuan
            </Link>
            <Link
              href="/hits/koordinator/pengajuan"
              className="btn btn-sm btn-ghost"
              style={{
                height: 32,
                padding: '0 12px',
                gap: 6,
                textDecoration: 'none',
                border: pengajuanConflict ? '1px solid var(--merah)' : '1px solid var(--line)',
              }}
            >
              {Icon.shield(13)} Pengajuan
              {pengajuanCount > 0 && (
                <span className="badge badge-merah" style={{ marginLeft: 2 }}>
                  {pengajuanCount}
                </span>
              )}
            </Link>
            <Link
              href="/hits/koordinator/indisipliner"
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              {Icon.shield(13)} Indisipliner & Tabayyun
            </Link>
            <Link
              href="/hits/koordinator/validasi"
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              {Icon.shield(13)} Validasi & Sumber Data
            </Link>
            {/* Export mengikuti filter yang sedang aktif (sortBase = periode + gender). */}
            <a
              href={`/api/hits/koordinator/download${sortBase}`}
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              ⬇ Unduh XLSX
            </a>
            <Link
              href={`/hits/koordinator/cetak${sortBase}`}
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              🖨 Cetak / PDF
            </Link>
          </div>
        </div>

        <div className="page">
          {/* ── Hero ── */}
          <div
            style={{
              borderRadius: 'var(--r-xl)',
              padding: '22px 24px',
              marginBottom: 18,
              background: 'linear-gradient(135deg, var(--accent-tint), var(--surface))',
              border: '1px solid var(--accent-line)',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            <div className="section-row" style={{ alignItems: 'flex-start', marginBottom: 0, gap: 12 }}>
              <div>
                <h1 className="t-h1" style={{ marginBottom: 4 }}>
                  Ranking Disiplin Pengajar
                </h1>
                <p className="t-small" style={{ color: 'var(--ink-2)', maxWidth: 560 }}>
                  Urut <strong>%KBBS</strong> (disiplin periode) · pemecah seri{' '}
                  <strong>hutang menit</strong> (saldo tertunggak). Lintas-batch, per pengajar.
                </p>
                <p className="t-tiny" style={{ color: 'var(--muted)', marginTop: 8 }}>
                  {mode === 'minggu' ? 'Mingguan' : 'Bulanan'} · {periodeLabel} · {genderLabel} ·{' '}
                  {ranked.length} pengajar
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Link
                    href={`?mode=bulan${g}`}
                    className="chip-select"
                    style={{ fontWeight: mode === 'bulan' ? 700 : 400, opacity: mode === 'bulan' ? 1 : 0.6 }}
                  >
                    Bulanan
                  </Link>
                  <Link
                    href={`?mode=minggu${g}`}
                    className="chip-select"
                    style={{ fontWeight: mode === 'minggu' ? 700 : 400, opacity: mode === 'minggu' ? 1 : 0.6 }}
                  >
                    Mingguan
                  </Link>
                </div>
                {mode === 'minggu' ? (
                  <WeekNavSelect options={weekOpts} value={week} />
                ) : (
                  <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
                )}
                <GenderNavSelect value={genderFilter ?? ''} />
              </div>
            </div>
          </div>

          {ranked.length === 0 && noData.length === 0 ? (
            <div className="card-flat" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: 999, margin: '0 auto 12px',
                  background: 'var(--surface-3)', display: 'grid', placeItems: 'center',
                  color: 'var(--muted)',
                }}
              >
                {Icon.shield(22)}
              </div>
              <p className="t-h3" style={{ marginBottom: 4 }}>Belum ada data</p>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Tak ada pengajar/keterangan pada periode ini.
              </p>
            </div>
          ) : (
            <>
              <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="k-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44, textAlign: 'right' }}>#</th>
                        <th><a href={sortHref('pengajarNama')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Pengajar{arrow('pengajarNama')}</a></th>
                        <th style={{ textAlign: 'right' }}><a href={sortHref('pctKbbs')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>%KBBS{arrow('pctKbbs')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Kelas Mulai Terlambat"><a href={sortHref('kmt')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>KMT{arrow('kmt')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Kelas Berakhir Lebih Awal"><a href={sortHref('kbla')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>KBLA{arrow('kbla')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Jadwal Kelas Ganti"><a href={sortHref('jkg')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>JKG{arrow('jkg')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Tidak memberikan latihan"><a href={sortHref('tidakLatihan')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>TL{arrow('tidakLatihan')}</a></th>
                        <th style={{ textAlign: 'right' }}><a href={sortHref('hutangSaldo')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Hutang (mnt){arrow('hutangSaldo')}</a></th>
                        <th style={{ textAlign: 'right' }}><a href={sortHref('halaqahCount')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Halaqah{arrow('halaqahCount')}</a></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r) => {
                        const insiden = insidenByPengajar.get(r.pengajarId) ?? [];
                        const cakupan = cakupanByPengajar.get(r.pengajarId);
                        return (
                        <Fragment key={r.pengajarId}>
                        <tr>
                          <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {r.rank}
                          </td>
                          <td className="nm" style={{ fontWeight: 500 }}>
                            <a
                              href={detailHref(r)}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {r.pengajarNama}
                            </a>
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', fontWeight: 700, color: pctColor(r.pctKbbs!) }}
                          >
                            {r.pctKbbs}%
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: cnt(r.kmt).color }}>
                            {cnt(r.kmt).text}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: cnt(r.kbla).color }}>
                            {cnt(r.kbla).text}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: cnt(r.jkg).color }}>
                            {cnt(r.jkg).text}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: cnt(r.tidakLatihan).color }}>
                            {cnt(r.tidakLatihan).text}
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', color: r.hutangSaldo > 0 ? 'var(--merah-ink)' : 'var(--muted)' }}
                          >
                            {r.hutangSaldo || '—'}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {r.halaqahCount}
                          </td>
                        </tr>
                        {cakupan && cakupan.total > 0 && (
                          <tr>
                            <td colSpan={9} style={{ padding: 0, borderTop: 0 }}>
                              <CakupanObservasiRows c={cakupan} />
                            </td>
                          </tr>
                        )}
                        {insiden.length > 0 && (
                          <tr>
                            <td colSpan={9} style={{ padding: 0, borderTop: 0 }}>
                              <InsidenDetailRows list={insiden} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {noData.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div
                    className="t-tiny"
                    style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}
                  >
                    BELUM ADA DATA PERIODE INI ({noData.length}) · butuh tindak lanjut
                  </div>
                  <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="k-table">
                        <thead>
                          <tr>
                            <th>Pengajar</th>
                            <th>Halaqah &amp; Ketua</th>
                            <th style={{ width: 260 }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {noData.map((r) => {
                            const aksi = noDataAksi.get(r.pengajarId);
                            const waPengajar =
                              aksi?.pengajarWa && aksi.pengajarGender
                                ? buildWaMeUrl(
                                    aksi.pengajarWa,
                                    tplReminderPengajarIsiData({
                                      pengajarName: r.pengajarNama,
                                      pengajarGender: aksi.pengajarGender,
                                      periodeLabel,
                                    })
                                  )
                                : null;
                            return (
                              <tr key={r.pengajarId}>
                                <td className="nm" style={{ fontWeight: 500, verticalAlign: 'top' }}>
                                  <a href={detailHref(r)} style={{ color: 'inherit', textDecoration: 'none' }}>
                                    {r.pengajarNama}
                                  </a>
                                  {r.hutangSaldo > 0 ? (
                                    <div className="t-tiny" style={{ color: 'var(--merah-ink)' }}>
                                      hutang {r.hutangSaldo} mnt
                                    </div>
                                  ) : null}
                                </td>
                                <td style={{ verticalAlign: 'top' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {(aksi?.halaqah ?? []).map((h) => {
                                      const waKetua = h.ketuaWa
                                        ? buildWaMeUrl(
                                            h.ketuaWa,
                                            tplReminderIsiKeterangan({
                                              ketuaNama: h.ketuaNama,
                                              halaqahName: h.halaqahName,
                                              periodeLabel,
                                              isiUrl: absUrl(`/hits/koordinator/halaqah/${h.halaqahId}`),
                                            })
                                          )
                                        : null;
                                      return (
                                        <div key={h.halaqahId} className="t-small">
                                          <div style={{ fontWeight: 500 }}>{h.halaqahName}</div>
                                          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                                            Ketua: {h.ketuaNama ?? '— belum ada'}
                                            {h.ketuaNama && !h.ketuaLoggedIn ? ' (belum login)' : ''}
                                          </div>
                                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                                            {waKetua ? (
                                              <a
                                                href={waKetua}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="t-tiny"
                                                style={{ color: 'var(--hijau-ink)' }}
                                              >
                                                WA ketua
                                              </a>
                                            ) : (
                                              <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                                                WA ketua —
                                              </span>
                                            )}
                                            <a
                                              href={`/hits/koordinator/halaqah/${h.halaqahId}`}
                                              className="t-tiny"
                                              style={{ color: 'var(--accent)' }}
                                            >
                                              Isi manual
                                            </a>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {(aksi?.halaqah ?? []).length === 0 ? (
                                      <span className="t-tiny" style={{ color: 'var(--muted)' }}>—</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td style={{ verticalAlign: 'top' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                    {waPengajar ? (
                                      <a
                                        href={waPengajar}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-sm btn-ghost"
                                        style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                                      >
                                        WA pengajar
                                      </a>
                                    ) : (
                                      <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                                        WA pengajar —
                                      </span>
                                    )}
                                    <NoteQuickAdd pengajarId={r.pengajarId} />
                                  </div>
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
            </>
          )}
        </div>
      </div>
    </main>
  );
}
