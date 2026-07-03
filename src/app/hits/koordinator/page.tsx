import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { getHitsRekap, getHitsBatches, fetchInChunks } from '@/lib/hits-rekap';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { HitsKoordinatorTable } from '@/components/HitsKoordinatorTable';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { BatchNavSelect } from '@/components/BatchNavSelect';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { StatCard } from '@/components/ui/StatCard';
import type { Gender } from '@/types/db';
import { monthOptionsSince } from '@/lib/month';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = '2026-01'; // batch HITS paling awal mulai Jan 2026

export default async function HitsKoordinatorPage({
  searchParams,
}: {
  searchParams: { month?: string; batch?: string; gender?: string };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : nowMonth;

  // Dashboard di-scope per batch (default batch terbaru) — hindari muat ratusan
  // halaqah lintas batch sekaligus (berat + kurang fokus).
  const batches = await getHitsBatches();
  const selectedBatch =
    (searchParams.batch && batches.find((b) => b.id === searchParams.batch)) || batches[0];
  const batchId = selectedBatch?.id;

  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  const rows = batchId ? await getHitsRekap(month, { batchId, gender: genderFilter }) : [];

  // ── Ringkasan ──
  const totalHalaqah = rows.length;
  const linked = rows.filter((r) => r.pengajarLinked).length;
  const ketua = rows.filter((r) => r.ketuaNama).length;
  const ketuaBelumLogin = rows.filter((r) => r.ketuaNama && !r.ketuaLoggedIn).length;
  const belumDiisi = rows.reduce((s, r) => s + r.belumDiisi, 0);
  const untagged = rows.filter((r) => !r.level).length;

  // ── Daftar aksi ──
  const belumKetua = rows.filter((r) => !r.ketuaNama);
  const belumLogin = rows.filter((r) => r.ketuaNama && !r.ketuaLoggedIn);
  const ikhwan = rows.filter((r) => r.gender === 'ikhwan').length;
  const akhwat = rows.filter((r) => r.gender === 'akhwat').length;
  const genderLabel =
    ikhwan && akhwat ? 'Ikhwan & Akhwat' : ikhwan ? 'Ikhwan' : akhwat ? 'Akhwat' : '—';

  // ── Pola mangkir per-pengajar (bulan ini, lintas batch, gender terpilih) ──
  const [my, mm] = month.split('-').map(Number);
  const mStart = `${month}-01`;
  const mEnd = mm === 12 ? `${my + 1}-01-01` : `${my}-${String(mm + 1).padStart(2, '0')}-01`;
  const { data: mangkirKet } = await supabaseAdmin
    .from('hits_keterangan_harian')
    .select('halaqah_id, kondisi')
    .gte('tanggal', mStart)
    .lt('tanggal', mEnd)
    .in('kondisi', ['KMT', 'JKG']);
  const mkIds = [...new Set((mangkirKet ?? []).map((r) => r.halaqah_id as string))];
  const mkHalaqah = mkIds.length
    ? await fetchInChunks(mkIds, (chunk) =>
        supabaseAdmin.from('hits_halaqah').select('id, pengajar_id, pengajar_nama_sheet, gender').in('id', chunk)
      )
    : [];
  const mkInfo = new Map(mkHalaqah.map((h) => [h.id as string, h]));
  const mangkirByPengajar = new Map<string, { name: string; kmt: number; jkg: number }>();
  for (const r of mangkirKet ?? []) {
    const h = mkInfo.get(r.halaqah_id as string);
    if (!h || !h.pengajar_id) continue;
    if (genderFilter && h.gender !== genderFilter) continue;
    const key = h.pengajar_id as string;
    const acc = mangkirByPengajar.get(key) ?? { name: (h.pengajar_nama_sheet as string) ?? '—', kmt: 0, jkg: 0 };
    if (r.kondisi === 'KMT') acc.kmt += 1;
    else if (r.kondisi === 'JKG') acc.jkg += 1;
    mangkirByPengajar.set(key, acc);
  }
  const mangkirList = [...mangkirByPengajar.values()]
    .map((m) => ({ ...m, total: m.kmt + m.jkg }))
    .sort((a, b) => b.total - a.total);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Soft Skill HITS
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/hits/koordinator/pertemuan" className="back">
              {Icon.shield(12)} Override Pertemuan
            </Link>
            <Link href="/hits/koordinator/validasi" className="back">
              {Icon.shield(12)} Validasi & Sumber Data
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
            <div
              className="section-row"
              style={{ alignItems: 'flex-start', marginBottom: 0, gap: 12 }}
            >
              <div>
                <h1 className="t-h1" style={{ marginBottom: 4 }}>
                  Kontribusi Soft Skill HITS
                </h1>
                <p className="t-small" style={{ color: 'var(--ink-2)', maxWidth: 560 }}>
                  Riwayat keterangan pengajar &amp; latihan mandiri seluruh halaqah.{' '}
                  <strong>%KBBS</strong> → kedisiplinan waktu, <strong>%Latihan</strong> → tanggung
                  jawab (Matrix Skill Guru).
                </p>
                <p className="t-tiny" style={{ color: 'var(--muted)', marginTop: 8 }}>
                  {selectedBatch?.name ?? '—'} · {totalHalaqah} halaqah · {genderLabel} · {month}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {batches.length > 1 && batchId && (
                  <BatchNavSelect options={batches} value={batchId} />
                )}
                <GenderNavSelect value={genderFilter ?? ''} />
                <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div
              className="card-flat"
              style={{ padding: '40px 24px', textAlign: 'center' }}
            >
              <div
                style={{
                  width: 48, height: 48, borderRadius: 999, margin: '0 auto 12px',
                  background: 'var(--surface-3)', display: 'grid', placeItems: 'center',
                  color: 'var(--muted)',
                }}
              >
                {Icon.shield(22)}
              </div>
              <p className="t-h3" style={{ marginBottom: 4 }}>Belum ada halaqah</p>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Tambahkan sumber spreadsheet di{' '}
                <Link href="/hits/koordinator/validasi" style={{ color: 'var(--accent-2)', fontWeight: 600 }}>
                  Validasi &amp; Sumber Data
                </Link>.
              </p>
            </div>
          ) : (
            <>
              {/* ── Stat grid ── */}
              <div className="matrix-stat-grid" style={{ marginBottom: 18 }}>
                <StatCard value={totalHalaqah} label="Halaqah" dotColor="var(--accent)" />
                <StatCard
                  value={`${linked}/${totalHalaqah}`}
                  label="Pengajar terhubung"
                  valueColor={linked < totalHalaqah ? 'var(--kuning-ink)' : 'var(--hijau-ink)'}
                  dotColor={linked < totalHalaqah ? 'var(--kuning)' : 'var(--hijau)'}
                  sub={untagged > 0 ? `${untagged} halaqah belum ditag level` : undefined}
                />
                <StatCard
                  value={`${ketua}/${totalHalaqah}`}
                  label="Ketua tertunjuk"
                  valueColor={ketua < totalHalaqah ? 'var(--kuning-ink)' : 'var(--hijau-ink)'}
                  dotColor={ketua < totalHalaqah ? 'var(--kuning)' : 'var(--hijau)'}
                  sub={ketuaBelumLogin > 0 ? `${ketuaBelumLogin} belum login` : undefined}
                />
                <StatCard
                  value={belumDiisi}
                  label="Pertemuan belum diisi"
                  valueColor={belumDiisi > 0 ? 'var(--merah-ink)' : 'var(--hijau-ink)'}
                  dotColor={belumDiisi > 0 ? 'var(--merah)' : 'var(--hijau)'}
                />
              </div>

              {(belumKetua.length > 0 || belumLogin.length > 0) && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 12,
                    marginBottom: 18,
                  }}
                >
                  {belumKetua.length > 0 && (
                    <div className="card-flat" style={{ padding: '14px 16px', borderLeft: '3px solid var(--kuning)' }}>
                      <div className="t-tiny" style={{ color: 'var(--kuning-ink)', marginBottom: 6, fontWeight: 600 }}>
                        BELUM ADA KETUA ({belumKetua.length})
                      </div>
                      <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {belumKetua.map((r) => (
                          <a key={r.halaqahId} href={`/hits/koordinator/halaqah/${r.halaqahId}`}
                            style={{ fontSize: 13, color: 'inherit', textDecoration: 'none', padding: '2px 0' }}>
                            {r.halaqahName} <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>· {r.pengajarNama ?? '—'}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {belumLogin.length > 0 && (
                    <div className="card-flat" style={{ padding: '14px 16px', borderLeft: '3px solid var(--merah)' }}>
                      <div className="t-tiny" style={{ color: 'var(--merah-ink)', marginBottom: 6, fontWeight: 600 }}>
                        KETUA BELUM LOGIN ({belumLogin.length})
                      </div>
                      <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {belumLogin.map((r) => (
                          <a key={r.halaqahId} href={`/hits/koordinator/halaqah/${r.halaqahId}`}
                            style={{ fontSize: 13, color: 'inherit', textDecoration: 'none', padding: '2px 0' }}>
                            {r.ketuaNama} <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>· {r.halaqahName}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mangkirList.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="t-tiny" style={{ color: 'var(--merah-ink)', marginBottom: 6, fontWeight: 600 }}>
                    POLA MANGKIR PENGAJAR — {month} (KMT = mulai telat, JKG = ganti jadwal)
                  </div>
                  <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="k-table">
                        <thead>
                          <tr>
                            <th>Pengajar</th>
                            <th style={{ textAlign: 'right' }}>KMT</th>
                            <th style={{ textAlign: 'right' }}>JKG</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mangkirList.slice(0, 15).map((m, i) => (
                            <tr key={i}>
                              <td className="nm" style={{ fontWeight: 500 }}>{m.name}</td>
                              <td className="t-mono" style={{ textAlign: 'right' }}>{m.kmt || '—'}</td>
                              <td className="t-mono" style={{ textAlign: 'right' }}>{m.jkg || '—'}</td>
                              <td className="t-mono" style={{ textAlign: 'right', fontWeight: 700, color: m.total >= 5 ? 'var(--merah-ink)' : 'var(--ink)' }}>{m.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
                    Kontribusi ke skor Komitmen &amp; Disiplin (Matrix). JKG diputihkan bila tabayyun disetujui udzur syar&apos;i.
                  </p>
                </div>
              )}

              <HitsKoordinatorTable rows={rows} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
