import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NewPertemuanForm } from './NewPertemuanForm';

export const dynamic = 'force-dynamic';

export default async function NewPertemuanPage() {
  const s = await getSession();
  const session = s.accesses?.find((a) => a.role === 'peserta') ?? (s.session?.role === 'peserta' ? s.session : null);
  if (!session) redirect('/');
  const pesertaId = (session as { peserta_id: string }).peserta_id;
  const kelasId = (session as { kelas_id: string }).kelas_id;

  const { data: kelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, ketua_peserta_id')
    .eq('id', kelasId)
    .single();

  if (!kelas || kelas.ketua_peserta_id !== pesertaId) redirect('/2in1/peserta');

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href="/2in1/ketua-kelas" className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">Catat Pertemuan</div>
          <div className="sub">{kelas.name}</div>
        </div>
      </div>
      <div style={{ padding: '0 16px' }}>
        <NewPertemuanForm kelasName={kelas.name} />
      </div>
    </main>
  );
}
