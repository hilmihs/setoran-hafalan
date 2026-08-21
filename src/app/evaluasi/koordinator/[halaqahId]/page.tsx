import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireKoordinator } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ALL_LAHN, AMBANG, columnsToCounts, initials, tierOf } from '@/lib/evaluasi';

export const dynamic = 'force-dynamic';

interface NilaiRow extends Record<string, unknown> {
  sesi_id: string;
  peserta_id: string;
  skor: number;
  done: boolean;
}

const TOP_N = 5;

export default async function KoordinatorHalaqahPage({
  params,
}: {
  params: { halaqahId: string };
}) {
  const session = await requireKoordinator();
  const gender = session.gender;

  const { data: halaqah } = await supabaseAdmin
    .from('eval_halaqah')
    .select('id, nama, gender, mustawa, pengajar_id')
    .eq('id', params.halaqahId)
    .maybeSingle();

  if (!halaqah || halaqah.gender !== gender) notFound();

  const noId = ['00000000-0000-0000-0000-000000000000'];

  // Pengajar.
  let pengajar = '—';
  if (halaqah.pengajar_id) {
    const { data: p } = await supabaseAdmin
      .from('eval_pengajar')
      .select('nama')
      .eq('id', halaqah.pengajar_id as string)
      .maybeSingle();
    pengajar = (p?.nama as string) ?? '—';
  }

  // Peserta aktif.
  const { data: pesertaRaw } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, nama, urutan')
    .eq('halaqah_id', halaqah.id as string)
    .eq('aktif', true)
    .order('urutan', { ascending: true });
  const pesertaList = pesertaRaw ?? [];

  // Sesi QN berjalan (nomor_sesi terbesar).
  const { data: sesiRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, nomor_sesi')
    .eq('halaqah_id', halaqah.id as string)
    .eq('jenis', 'qn');
  const sesiRows = (sesiRaw ?? []) as { id: string; nomor_sesi: number }[];
  const currentSesi = sesiRows.reduce<{ id: string; nomor_sesi: number } | null>(
    (best, s) => (!best || s.nomor_sesi > best.nomor_sesi ? s : best),
    null
  );

  // Nilai sesi berjalan.
  const { data: nilaiRaw } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select(
      'sesi_id, peserta_id, skor, done, ' +
        'jk_huruf, jk_harakat, jk_mad, jk_tasydid, kh_izhar, kh_idgham_bighunnah, kh_idgham_bilaghunnah, kh_idgham_mimi, kh_iqlab, kh_ikhfa_hakiki, kh_ikhfa_syafawi'
    )
    .in('sesi_id', currentSesi ? [currentSesi.id] : noId);
  const nilaiRows = (nilaiRaw ?? []) as NilaiRow[];
  const nilaiByPeserta = new Map(nilaiRows.map((n) => [n.peserta_id, n]));

  // Peserta list dengan tier & skor.
  const peserta = pesertaList.map((p) => {
    const n = nilaiByPeserta.get(p.id as string);
    const done = !!n?.done;
    const skor = done ? Number(n?.skor) || 0 : null;
    const tier = skor != null ? tierOf(skor) : null;
    return {
      id: p.id as string,
      nama: p.nama as string,
      initial: initials(p.nama as string),
      skor,
      skorColor: tier ? tier.color : 'var(--muted-2)',
      tierLabel: tier ? tier.label : 'Belum dinilai',
    };
  });

  // Distribusi jenis kesalahan (baris done).
  const lahnSum = new Array(ALL_LAHN.length).fill(0);
  let bermasalah = 0;
  for (const n of nilaiRows) {
    if (!n.done) continue;
    if ((Number(n.skor) || 0) < AMBANG) bermasalah += 1;
    const counts = columnsToCounts(n);
    ALL_LAHN.forEach((d, i) => {
      lahnSum[i] += counts[d.key] || 0;
    });
  }
  const totalErrors = lahnSum.reduce((a, b) => a + b, 0);

  const sorted = ALL_LAHN.map((d, i) => ({ label: d.label, count: lahnSum[i] }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const distribusi: { label: string; pct: number }[] = [];
  if (totalErrors > 0) {
    const top = sorted.slice(0, TOP_N);
    const rest = sorted.slice(TOP_N).reduce((a, x) => a + x.count, 0);
    for (const x of top) {
      distribusi.push({ label: x.label, pct: Math.round((x.count / totalErrors) * 100) });
    }
    if (rest > 0) distribusi.push({ label: 'Lainnya', pct: Math.round((rest / totalErrors) * 100) });
  }

  const topLahn = sorted.length > 0 ? sorted[0].label : '—';
  const catatanMasalah = `${bermasalah} peserta di bawah ambang standar (${AMBANG}). Kesalahan terbanyak: ${topLahn}. Pertimbangkan sesi remedial.`;

  const mustawa = halaqah.mustawa as number | null;
  const genderLabel = gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
  const sub = mustawa != null ? `${genderLabel} · Mustawa ${mustawa}` : genderLabel;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 40px' }}>
        <Link
          href="/evaluasi/koordinator"
          className="btn btn-ghost btn-sm"
          style={{ height: 34, padding: '0 12px', fontSize: 12, textDecoration: 'none', marginBottom: 14 }}
        >
          ← Semua halaqah
        </Link>

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
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {halaqah.nama as string}{' '}
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>· {sub}</span>
            </div>
            <div className="t-small" style={{ marginTop: 2 }}>
              Pengajar: {pengajar}
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {/* Placeholder — wiring laporan di fase berikutnya. */}
            <button type="button" className="btn btn-ghost btn-sm" style={{ height: 40, padding: '0 14px' }}>
              Unduh laporan halaqah
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Daftar peserta */}
          <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '12px 14px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink-2)',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--line)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Peserta
            </div>
            {peserta.length === 0 ? (
              <div className="t-small" style={{ padding: '14px' }}>
                Belum ada peserta aktif.
              </div>
            ) : (
              peserta.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <div
                    className="avatar"
                    style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}
                  >
                    {p.initial}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {p.nama}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{p.tierLabel}</span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: p.skorColor,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 26,
                      textAlign: 'right',
                    }}
                  >
                    {p.skor == null ? '—' : p.skor}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Distribusi + catatan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card-flat" style={{ padding: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--ink-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 12,
                }}
              >
                Distribusi jenis kesalahan
              </div>
              {distribusi.length === 0 ? (
                <div className="t-small" style={{ margin: 0 }}>
                  Belum ada data kesalahan tercatat.
                </div>
              ) : (
                distribusi.map((d) => (
                  <div key={d.label} style={{ marginBottom: 9 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{d.label}</span>
                      <span style={{ color: 'var(--muted)' }}>{d.pct}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: 'var(--line)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{ height: '100%', background: 'oklch(0.58 0.09 165)', width: `${d.pct}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
            <div
              style={{
                background: 'oklch(0.96 0.03 25)',
                border: '1px solid oklch(0.86 0.07 25)',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'oklch(0.46 0.14 25)',
                  marginBottom: 4,
                }}
              >
                Perlu perhatian
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'oklch(0.46 0.14 25)',
                  opacity: 0.85,
                  lineHeight: 1.5,
                }}
              >
                {catatanMasalah}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
