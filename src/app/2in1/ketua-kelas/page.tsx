import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  muallim_najih: 'Muallim Najih',
  at_tibyan: 'At-Tibyan',
};

export default async function KetuaKelasPage() {
  const s = await getSession();
  const session = s.accesses?.find((a) => a.role === 'peserta') ?? (s.session?.role === 'peserta' ? s.session : null);
  if (!session) redirect('/');
  const pesertaId = (session as { peserta_id: string }).peserta_id;
  const kelasId = (session as { kelas_id: string }).kelas_id;

  const { data: kelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender, ketua_peserta_id, jadwal_hari, jadwal_waktu_mulai, jadwal_waktu_selesai')
    .eq('id', kelasId)
    .single();

  if (!kelas || kelas.ketua_peserta_id !== pesertaId) {
    return (
      <main style={{ padding: 24 }}>
        <p className="t-body" style={{ color: 'var(--muted-2)' }}>
          Halaman ini hanya untuk Ketua Kelas 2in1.
        </p>
        <Link href="/2in1/peserta" className="btn btn-ghost" style={{ marginTop: 16 }}>
          ← Kembali
        </Link>
      </main>
    );
  }

  // Fetch pertemuan bulan ini
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${year}-${month}-01`;
  const nextMonth = now.getMonth() === 11
    ? `${year + 1}-01-01`
    : `${year}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;

  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai, keterangan')
    .eq('kelas_id', kelasId)
    .gte('tanggal', monthStart)
    .lt('tanggal', nextMonth)
    .order('tanggal', { ascending: false });

  // Count kehadiran per pertemuan
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

  const pertemuanWithCount = (pertemuanList ?? []).map((p) => ({
    ...p,
    counts: countByPertemuan.get(p.id) ?? null,
    programLabel: PROGRAM_LABEL[p.program] ?? p.program,
  }));

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const pertemuanToday = pertemuanWithCount.filter((p) => p.tanggal === todayStr);
  const pertemuanOther = pertemuanWithCount.filter((p) => p.tanggal !== todayStr);

  const monthLabel = now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href="/2in1/peserta" className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">Ketua Kelas</div>
          <div className="sub">{kelas.name}</div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {pertemuanToday.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="section-row" style={{ marginBottom: 8 }}>
              <div className="t-tiny">Hari ini</div>
            </div>
            {pertemuanToday.map((p) => (
              <PertemuanCard key={p.id} p={p} highlight />
            ))}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
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
            <div className="t-small">{p.nama_kegiatan}</div>
            <div className="t-tiny" style={{ marginTop: 2 }}>
              {tanggalLabel}{timeRange ? ` · ${timeRange}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {p.counts ? (
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--hijau-ink)',
              }}>
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
