import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionWa, findKetuaProgramKelas } from '@/lib/program-kelas';
import { NewPertemuanForm } from './NewPertemuanForm';

export const dynamic = 'force-dynamic';

export default async function NewPertemuanPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const myKelas = await findKetuaProgramKelas(wa);
  if (myKelas.length === 0) redirect('/2in1/ketua-kelas');

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href="/2in1/ketua-kelas" className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">Catat Pertemuan</div>
          <div className="sub">{myKelas.map((k) => k.name).join(' · ')}</div>
        </div>
      </div>
      <div style={{ padding: '0 16px' }}>
        <NewPertemuanForm
          kelasList={myKelas.map((k) => ({
            id: k.id,
            name: k.name,
            waktu_mulai: k.waktu_mulai,
            waktu_selesai: k.waktu_selesai,
          }))}
        />
      </div>
    </main>
  );
}
