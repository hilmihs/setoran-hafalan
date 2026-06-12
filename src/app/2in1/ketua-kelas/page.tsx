import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findKetuaProgramKelas } from '@/lib/program-kelas';

export const dynamic = 'force-dynamic';

const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  muallim_najih: 'Muallim Najih',
  at_tibyan: 'At-Tibyan',
};

export default async function KetuaKelasPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const myKelas = await findKetuaProgramKelas(wa);
  if (myKelas.length === 0) {
    return (
      <main style={{ padding: 24 }}>
        <p className="t-body" style={{ color: 'var(--muted-2)' }}>
          Halaman ini hanya untuk Ketua / Wakil Ketua Kelas program Maahir.
        </p>
        <Link href="/" className="btn btn-ghost" style={{ marginTop: 16 }}>
          ← Kembali
        </Link>
      </main>
    );
  }

  const kelasIds = myKelas.map((k) => k.id);

  // Pertemuan bulan ini untuk semua kelas yang dipimpin
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${year}-${month}-01`;
  const nextMonth = now.getMonth() === 11
    ? `${year + 1}-01-01`
    : `${year}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;

  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', monthStart)
    .lt('tanggal', nextMonth)
    .order('tanggal', { ascending: false });

  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id);
  const { data: kehadiranCounts } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('pertemuan_id, status')
    .in('pertemuan_id', pertemuanIds.length ? pertemuanIds : ['00000000-0000-0000-0000-000000000000']);

  const countByPertemuan = new Map<string, { hadir: number; total: number }>();
  for (const k of kehadiranCounts ?? []) {
    const prev = countByPertemuan.get(k.pertemuan_id) ?? { hadir: 0, total: 0 };
    prev.total += 1;
    if (k.status === 'hadir' || k.status === 'terlambat') prev.hadir += 1;
    countByPertemuan.set(k.pertemuan_id, prev);
  }

  const kelasById = new Map(myKelas.map((k) => [k.id, k]));
  const pertemuanWithMeta = (pertemuanList ?? []).map((p) => ({
    ...p,
    counts: countByPertemuan.get(p.id) ?? null,
    programLabel: PROGRAM_LABEL[p.program] ?? p.program,
    kelasName: kelasById.get(p.program_kelas_id)?.name ?? '',
  }));

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const pertemuanToday = pertemuanWithMeta.filter((p) => p.tanggal === todayStr);
  const pertemuanOther = pertemuanWithMeta.filter((p) => p.tanggal !== todayStr);

  const monthLabel = now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href="/" className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">Ketua Kelas</div>
          <div className="sub">{myKelas.map((k) => k.name).join(' · ')}</div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Jadwal info */}
        {myKelas.map((k) => (
          <div key={k.id} className="card" style={{ padding: '8px 12px', marginBottom: 8, background: 'var(--bg-soft, #fafafa)' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{k.name}</div>
            <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
              {(k.jadwal_hari ?? []).join(', ')}
              {k.waktu_mulai ? ` · ${k.waktu_mulai.slice(0, 5)}${k.waktu_selesai ? ' – ' + k.waktu_selesai.slice(0, 5) : ''}` : ''}
            </div>
          </div>
        ))}

        {pertemuanToday.length > 0 && (
          <div style={{ margin: '20px 0' }}>
            <div className="section-row" style={{ marginBottom: 8 }}>
              <div className="t-tiny">Hari ini</div>
            </div>
            {pertemuanToday.map((p) => (
              <PertemuanCard key={p.id} p={p} highlight />
            ))}
          </div>
        )}

        <div style={{ margin: '16px 0' }}>
          <div className="section-row">
            <div className="t-tiny">{monthLabel}</div>
            <Link
              href="/2in1/ketua-kelas/pertemuan/new"
              className="btn btn-sm btn-primary"
              style={{ padding: '3px 10px', fontSize: 12, textDecoration: 'none' }}
            >
              + Catat Pertemuan
            </Link>
          </div>
        </div>

        {pertemuanOther.length === 0 && pertemuanToday.length === 0 && (
          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
            Belum ada pertemuan bulan ini. Tap &quot;+ Catat Pertemuan&quot; untuk mulai.
          </p>
        )}

        {pertemuanOther.map((p) => (
          <PertemuanCard key={p.id} p={p} />
        ))}
      </div>
    </main>
  );
}

function PertemuanCard({ p, highlight }: {
  p: {
    id: string;
    programLabel: string;
    kelasName: string;
    tanggal: string;
    nama_kegiatan: string;
    waktu_mulai: string | null;
    waktu_selesai: string | null;
    counts: { hadir: number; total: number } | null;
  };
  highlight?: boolean;
}) {
  const tanggalLabel = new Date(p.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'short',
  });
  const timeRange = p.waktu_mulai
    ? `${p.waktu_mulai.slice(0, 5)}${p.waktu_selesai ? ' – ' + p.waktu_selesai.slice(0, 5) : ''}`
    : null;

  return (
    <Link href={`/2in1/ketua-kelas/pertemuan/${p.id}`} style={{ textDecoration: 'none' }}>
      <div className="card" style={{
        padding: '10px 14px',
        marginBottom: 8,
        border: highlight ? '1.5px solid var(--primary, #1a73e8)' : undefined,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.programLabel}</div>
            <div className="t-small">{p.nama_kegiatan} · {p.kelasName}</div>
            <div className="t-tiny" style={{ marginTop: 2 }}>
              {tanggalLabel}{timeRange ? ` · ${timeRange}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {p.counts ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--hijau-ink)' }}>
                {p.counts.hadir}/{p.counts.total}
              </span>
            ) : (
              <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>Isi →</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
