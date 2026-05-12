import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signedAudioUrl } from '@/lib/storage';
import { CekForm, type RekamanView } from '@/components/CekForm';
import { formatWeekRange } from '@/lib/week';
import { JENIS_REKAMAN, type JenisRekaman } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function CekPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') {
    redirect(`/musyrif/login?next=/musyrif/cek/${params.id}`);
  }
  const musyrifId = s.session.musyrif_id;

  const { data: setoran } = await supabaseAdmin
    .from('setoran')
    .select(
      'id, status, week_start, submitted_at, peserta:peserta_id(id, name, kelas:kelas_id(id, name, musyrif_id))'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!setoran) {
    return <Wrap><p>Setoran tidak ditemukan.</p></Wrap>;
  }
  const peserta = setoran.peserta as unknown as {
    id: string;
    name: string;
    kelas: { id: string; name: string; musyrif_id: string };
  };
  if (peserta.kelas.musyrif_id !== musyrifId) {
    return (
      <Wrap>
        <p className="text-red-700">
          Setoran ini berasal dari kelas yang bukan Anda ampu.
        </p>
      </Wrap>
    );
  }

  const { data: rekaman } = await supabaseAdmin
    .from('rekaman')
    .select('jenis, audio_url, nilai, masukan')
    .eq('setoran_id', params.id);

  const rekamanByJenis = new Map(
    (rekaman ?? []).map((r) => [r.jenis as JenisRekaman, r])
  );

  const rekamanList: RekamanView[] = await Promise.all(
    JENIS_REKAMAN.map(async (j) => {
      const r = rekamanByJenis.get(j);
      let audioUrl: string | null = null;
      if (r?.audio_url) {
        try {
          audioUrl = await signedAudioUrl(r.audio_url, 3600);
        } catch {
          audioUrl = null;
        }
      }
      return {
        jenis: j,
        audioUrl,
        nilai: (r?.nilai ?? null) as RekamanView['nilai'],
        masukan: r?.masukan ?? null,
      };
    })
  );

  return (
    <Wrap>
      <header className="space-y-1">
        <Link href="/musyrif" className="text-xs text-stone-500 hover:text-stone-700">
          ← dashboard
        </Link>
        <h1 className="text-xl font-semibold text-stone-800">
          Pemeriksaan: {peserta.name}
        </h1>
        <p className="text-sm text-stone-600">
          Kelas {peserta.kelas.name} • pekan {formatWeekRange(setoran.week_start)}
        </p>
      </header>
      <CekForm
        setoranId={setoran.id}
        rekamanList={rekamanList}
        alreadyChecked={setoran.status === 'checked'}
      />
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen p-4 bg-stone-50">
      <div className="max-w-xl mx-auto space-y-6 py-6">{children}</div>
    </main>
  );
}
