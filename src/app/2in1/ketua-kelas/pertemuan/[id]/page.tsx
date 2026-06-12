import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { KehadiranForm } from './KehadiranForm';

export const dynamic = 'force-dynamic';

const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  muallim_najih: 'Muallim Najih',
  at_tibyan: 'At-Tibyan',
};

export default async function PertemuanDetailPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  const session = s.accesses?.find((a) => a.role === 'peserta') ?? (s.session?.role === 'peserta' ? s.session : null);
  if (!session) redirect('/');
  const pesertaId = (session as { peserta_id: string }).peserta_id;

  const { data: pertemuan } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, kelas_id, program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai, kelas:kelas_id(id, name, ketua_peserta_id)')
    .eq('id', params.id)
    .single();

  if (!pertemuan) redirect('/2in1/ketua-kelas');
  const kelas = pertemuan.kelas as unknown as { id: string; name: string; ketua_peserta_id: string | null };
  if (kelas.ketua_peserta_id !== pesertaId) redirect('/2in1/ketua-kelas');

  // Fetch all peserta in this kelas
  const { data: pesertaList } = await supabaseAdmin
    .from('peserta')
    .select('id, name')
    .eq('kelas_id', pertemuan.kelas_id)
    .eq('active', true)
    .order('name');

  // Existing kehadiran
  const pesertaIds = (pesertaList ?? []).map((p) => p.id);
  const { data: existingKehadiran } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('peserta_id, status, catatan')
    .eq('pertemuan_id', params.id)
    .in('peserta_id', pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000']);

  const kehadiranMap = new Map<string, { status: string; catatan: string | null }>(
    (existingKehadiran ?? []).map((k) => [k.peserta_id, { status: k.status, catatan: k.catatan }])
  );

  type StatusType = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';
  const pesertaWithStatus = (pesertaList ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    status: (kehadiranMap.get(p.id)?.status ?? 'tidak_ada_keterangan') as StatusType,
    catatan: kehadiranMap.get(p.id)?.catatan ?? '',
  }));

  const tanggalLabel = new Date(pertemuan.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href="/2in1/ketua-kelas" className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">{PROGRAM_LABEL[pertemuan.program] ?? pertemuan.program}</div>
          <div className="sub">{kelas.name} · {tanggalLabel}</div>
        </div>
      </div>
      <div style={{ padding: '0 16px' }}>
        <KehadiranForm
          pertemuanId={params.id}
          pesertaList={pesertaWithStatus}
        />
      </div>
    </main>
  );
}
