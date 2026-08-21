import Link from 'next/link';
import { requireKoordinator } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ALL_LAHN, AMBANG, columnsToCounts } from '@/lib/evaluasi';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

interface SesiRow {
  id: string;
  halaqah_id: string;
  nomor_sesi: number;
}
interface NilaiRow extends Record<string, unknown> {
  sesi_id: string;
  peserta_id: string;
  skor: number;
  done: boolean;
}

function monthLabel(): string {
  return new Date().toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

export default async function KoordinatorEvaluasiPage() {
  const session = await requireKoordinator();
  const gender = session.gender;

  // Halaqah binaan (per gender).
  const { data: halaqahRaw } = await supabaseAdmin
    .from('eval_halaqah')
    .select('id, nama, gender, mustawa, pengajar_id')
    .eq('gender', gender)
    .order('nama');
  const halaqahList = halaqahRaw ?? [];

  // Config gender (untuk nama track & label periode).
  const { data: configRow } = await supabaseAdmin
    .from('eval_config')
    .select('nama_qn')
    .eq('gender', gender)
    .maybeSingle();
  const namaQn = (configRow?.nama_qn as string) ?? 'Evaluasi QN';

  const noId = ['00000000-0000-0000-0000-000000000000'];
  const halaqahIds = halaqahList.map((h) => h.id as string);

  // Nama pengajar.
  const pengajarIds = Array.from(
    new Set(halaqahList.map((h) => h.pengajar_id as string | null).filter((x): x is string => !!x))
  );
  const { data: pengajarRaw } = await supabaseAdmin
    .from('eval_pengajar')
    .select('id, nama')
    .in('id', pengajarIds.length ? pengajarIds : noId);
  const pengajarName = new Map((pengajarRaw ?? []).map((p) => [p.id as string, p.nama as string]));

  // Peserta aktif per halaqah.
  const { data: pesertaRaw } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, halaqah_id')
    .in('halaqah_id', halaqahIds.length ? halaqahIds : noId)
    .eq('aktif', true);
  const pesertaCount = new Map<string, number>();
  for (const p of pesertaRaw ?? []) {
    const hid = p.halaqah_id as string;
    pesertaCount.set(hid, (pesertaCount.get(hid) ?? 0) + 1);
  }

  // Sesi QN — pilih per halaqah nomor_sesi terbesar (sesi berjalan).
  const { data: sesiRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, halaqah_id, nomor_sesi')
    .in('halaqah_id', halaqahIds.length ? halaqahIds : noId)
    .eq('jenis', 'qn');
  const sesiRows = (sesiRaw ?? []) as SesiRow[];
  const currentSesiByHalaqah = new Map<string, SesiRow>();
  for (const s of sesiRows) {
    const prev = currentSesiByHalaqah.get(s.halaqah_id);
    if (!prev || s.nomor_sesi > prev.nomor_sesi) currentSesiByHalaqah.set(s.halaqah_id, s);
  }
  const currentSesiIds = Array.from(currentSesiByHalaqah.values()).map((s) => s.id);
  const sesiToHalaqah = new Map(
    Array.from(currentSesiByHalaqah.entries()).map(([hid, s]) => [s.id, hid])
  );
  const maxSesiNo = sesiRows.reduce((a, s) => Math.max(a, s.nomor_sesi), 0);

  // Nilai untuk sesi berjalan.
  const { data: nilaiRaw } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select(
      'sesi_id, peserta_id, skor, done, ' +
        'jk_huruf, jk_harakat, jk_mad, jk_tasydid, kh_izhar, kh_idgham_bighunnah, kh_idgham_bilaghunnah, kh_idgham_mimi, kh_iqlab, kh_ikhfa_hakiki, kh_ikhfa_syafawi'
    )
    .in('sesi_id', currentSesiIds.length ? currentSesiIds : noId);
  const nilaiRows = (nilaiRaw ?? []) as NilaiRow[];

  // Agregasi per halaqah (hanya baris done).
  interface Agg {
    selesai: number;
    skorSum: number;
    bermasalah: number;
    lahn: number[]; // sum per ALL_LAHN index
  }
  const aggByHalaqah = new Map<string, Agg>();
  const ensureAgg = (hid: string): Agg => {
    let a = aggByHalaqah.get(hid);
    if (!a) {
      a = { selesai: 0, skorSum: 0, bermasalah: 0, lahn: new Array(ALL_LAHN.length).fill(0) };
      aggByHalaqah.set(hid, a);
    }
    return a;
  };
  for (const n of nilaiRows) {
    if (!n.done) continue;
    const hid = sesiToHalaqah.get(n.sesi_id);
    if (!hid) continue;
    const a = ensureAgg(hid);
    a.selesai += 1;
    a.skorSum += Number(n.skor) || 0;
    if ((Number(n.skor) || 0) < AMBANG) a.bermasalah += 1;
    const counts = columnsToCounts(n);
    ALL_LAHN.forEach((d, i) => {
      a.lahn[i] += counts[d.key] || 0;
    });
  }

  const topLahnLabel = (lahn: number[]): string => {
    let best = -1;
    let bestVal = 0;
    lahn.forEach((v, i) => {
      if (v > bestVal) {
        bestVal = v;
        best = i;
      }
    });
    return best >= 0 && bestVal > 0 ? ALL_LAHN[best].label : '—';
  };

  const rows = halaqahList.map((h) => {
    const hid = h.id as string;
    const total = pesertaCount.get(hid) ?? 0;
    const a = aggByHalaqah.get(hid);
    const selesai = a?.selesai ?? 0;
    const rata = a && a.selesai > 0 ? Math.round(a.skorSum / a.selesai) : null;
    const bermasalah = a?.bermasalah ?? 0;
    const lahnTop = a ? topLahnLabel(a.lahn) : '—';
    const mustawa = h.mustawa as number | null;
    const genderLabel = gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
    const sub = mustawa != null ? `${genderLabel} · Mustawa ${mustawa}` : genderLabel;
    return {
      id: hid,
      nama: h.nama as string,
      sub,
      pengajar: (h.pengajar_id && pengajarName.get(h.pengajar_id as string)) || '—',
      total,
      selesai,
      rata,
      bermasalah,
      lahnTop,
    };
  });

  // Kartu statistik.
  const totalPeserta = rows.reduce((a, r) => a + r.total, 0);
  const totalSelesai = rows.reduce((a, r) => a + r.selesai, 0);
  const totalBermasalah = rows.reduce((a, r) => a + r.bermasalah, 0);
  const allDoneSkor = nilaiRows.filter((n) => n.done).map((n) => Number(n.skor) || 0);
  const rataAll = allDoneSkor.length
    ? Math.round(allDoneSkor.reduce((a, b) => a + b, 0) / allDoneSkor.length)
    : null;

  const periode =
    maxSesiNo > 0
      ? `${namaQn} Sesi ${maxSesiNo} · ${monthLabel()}`
      : `${namaQn} · ${monthLabel()}`;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="eval-print-wrap" style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 40px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div className="t-h1" style={{ fontSize: 20 }}>
              Dashboard Koordinator
            </div>
            <div className="t-small" style={{ marginTop: 2 }}>
              {session.name} · {halaqahList.length} halaqah binaan · {periode}
            </div>
          </div>
          <div className="no-print" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Link
              href="/evaluasi/koordinator/pengaturan"
              className="btn btn-ghost btn-sm"
              style={{ height: 40, padding: '0 14px', textDecoration: 'none' }}
            >
              ⚙ Pengaturan
            </Link>
            <PrintButton label="Unduh rekap PDF" />
          </div>
        </div>

        {halaqahList.length === 0 ? (
          <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Belum ada halaqah binaan</div>
            <p className="t-small" style={{ margin: 0 }}>
              Belum ada halaqah {gender === 'ikhwan' ? 'ikhwan' : 'akhwat'} yang tersinkron ke sistem
              evaluasi.
            </p>
          </div>
        ) : (
          <>
            {/* Kartu statistik */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{halaqahList.length}</div>
                <div className="t-small" style={{ marginTop: 4 }}>
                  Halaqah binaan
                </div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
                  {totalSelesai}
                  <span style={{ fontSize: 15, color: 'var(--muted-2)' }}>/{totalPeserta}</span>
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>
                  Peserta sudah dinilai
                </div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: rataAll == null ? 'var(--muted-2)' : 'oklch(0.40 0.10 150)',
                  }}
                >
                  {rataAll == null ? '—' : rataAll}
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>
                  Rata-rata skor
                </div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: totalBermasalah > 0 ? 'oklch(0.46 0.14 25)' : 'var(--ink)',
                  }}
                >
                  {totalBermasalah}
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>
                  Peserta perlu perhatian
                </div>
              </div>
            </div>

            {/* Tabel halaqah */}
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-scroll">
                <table className="k-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Halaqah</th>
                      <th>Pengajar</th>
                      <th>Kelengkapan</th>
                      <th style={{ textAlign: 'center' }}>Rata-rata</th>
                      <th style={{ textAlign: 'center' }}>Bermasalah</th>
                      <th>Lahn tersering</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((h) => {
                      const progPct = h.total > 0 ? Math.round((h.selesai / h.total) * 100) : 0;
                      const progColor =
                        h.selesai === h.total && h.total > 0
                          ? 'oklch(0.58 0.09 165)'
                          : h.selesai === 0
                            ? 'var(--line-2)'
                            : 'oklch(0.78 0.10 80)';
                      const rataColor =
                        h.rata == null
                          ? 'var(--muted-2)'
                          : h.rata >= AMBANG
                            ? 'oklch(0.40 0.10 150)'
                            : 'oklch(0.46 0.14 25)';
                      const showIngatkan = h.selesai < h.total;
                      return (
                        <tr key={h.id}>
                          <td>
                            <div className="nm">{h.nama}</div>
                            <div className="sub">{h.sub}</div>
                          </td>
                          <td style={{ color: 'var(--ink-2)' }}>{h.pengajar}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 64,
                                  height: 6,
                                  borderRadius: 3,
                                  background: 'var(--line)',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{ height: '100%', background: progColor, width: `${progPct}%` }}
                                />
                              </div>
                              <span
                                className="t-small"
                                style={{ whiteSpace: 'nowrap' }}
                              >
                                {h.selesai}/{h.total}
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: rataColor }}>
                            {h.rata == null ? '—' : h.rata}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {h.bermasalah > 0 ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: 22,
                                  height: 22,
                                  borderRadius: 999,
                                  background: 'oklch(0.96 0.03 25)',
                                  color: 'oklch(0.46 0.14 25)',
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                {h.bermasalah}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--line-2)' }}>—</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--muted)' }}>{h.lahnTop}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {showIngatkan && (
                              <button
                                type="button"
                                className="no-print"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  height: 30,
                                  padding: '0 10px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  border: 'none',
                                  background: 'oklch(0.70 0.13 75)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  marginRight: 6,
                                }}
                              >
                                Ingatkan
                              </button>
                            )}
                            <Link
                              href={`/evaluasi/koordinator/${h.id}`}
                              className="btn btn-ghost btn-sm"
                              style={{
                                height: 30,
                                padding: '0 10px',
                                fontSize: 12,
                                textDecoration: 'none',
                              }}
                            >
                              Detail
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
