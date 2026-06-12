import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa } from '@/lib/program-kelas';
import { KehadiranForm } from './KehadiranForm';

export const dynamic = 'force-dynamic';

const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  muallim_najih: 'Muallim Najih',
  at_tibyan: 'At-Tibyan',
};

export default async function PertemuanDetailPage({ params }: { params: { id: string } }) {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const { data: pertemuan } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai, program_kelas:program_kelas_id(id, name, ketua_wa, wakil_wa)')
    .eq('id', params.id)
    .single();

  if (!pertemuan || !pertemuan.program_kelas_id) redirect('/2in1/ketua-kelas');
  const kelas = pertemuan.program_kelas as unknown as {
    id: string; name: string; ketua_wa: string | null; wakil_wa: string | null;
  };
  if (kelas.ketua_wa !== wa && kelas.wakil_wa !== wa) redirect('/2in1/ketua-kelas');

  // Semua anggota kelas program ini
  const { data: anggotaList } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, name, is_ketua, is_wakil')
    .eq('program_kelas_id', kelas.id)
    .order('name');

  // Kehadiran existing
  const { data: existingKehadiran } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('anggota_id, status, catatan')
    .eq('pertemuan_id', params.id);

  const kehadiranMap = new Map<string, { status: string; catatan: string | null }>(
    (existingKehadiran ?? [])
      .filter((k) => k.anggota_id)
      .map((k) => [k.anggota_id as string, { status: k.status, catatan: k.catatan }])
  );

  type StatusType = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';
  const anggotaWithStatus = (anggotaList ?? []).map((a) => ({
    id: a.id,
    name: a.name + (a.is_ketua ? ' (Ketua)' : a.is_wakil ? ' (Wakil)' : ''),
    status: (kehadiranMap.get(a.id)?.status ?? 'tidak_ada_keterangan') as StatusType,
    catatan: kehadiranMap.get(a.id)?.catatan ?? '',
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
          pesertaList={anggotaWithStatus}
        />
      </div>
    </main>
  );
}
