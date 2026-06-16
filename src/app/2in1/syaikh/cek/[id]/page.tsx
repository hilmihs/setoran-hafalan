import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signedAudioUrl } from '@/lib/storage';
import { CekForm, type RekamanView } from '@/components/CekForm';
import { Icon } from '@/components/icons';
import { formatCycleRange } from '@/lib/week';
import { formatCycleRangeShort } from '@/lib/week';
import { salutation } from '@/lib/whatsapp';
import { JENIS_REKAMAN, type JenisRekaman, type Gender } from '@/types/db';
import { submitCekSyaikh } from './actions';

export const dynamic = 'force-dynamic';

export default async function SyaikhCekPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s.session || s.session.role !== 'syaikh') {
    redirect('/');
  }
  const syaikhGender = s.session.gender;

  const { data: setoran } = await supabaseAdmin
    .from('setoran_musyrif')
    .select(
      'id, status, week_start, submitted_at, musyrif:musyrif_id(id, name, gender)'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!setoran) {
    return (
      <Wrap>
        <p className="t-body">Setoran tidak ditemukan.</p>
      </Wrap>
    );
  }
  const musyrif = setoran.musyrif as unknown as {
    id: string;
    name: string;
    gender: Gender;
  };
  if (musyrif.gender !== syaikhGender) {
    return (
      <Wrap>
        <div className="banner banner-error">
          <div>
            <div className="title">Tidak punya akses</div>
            <div className="desc">Setoran ini bukan untuk gender Anda.</div>
          </div>
        </div>
      </Wrap>
    );
  }

  const { data: rekaman } = await supabaseAdmin
    .from('rekaman_musyrif')
    .select('jenis, audio_url, duration_seconds, nilai, masukan')
    .eq('setoran_musyrif_id', params.id);

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
        durationSec: r?.duration_seconds ?? null,
        nilai: (r?.nilai ?? null) as RekamanView['nilai'],
        masukan: r?.masukan ?? null,
      };
    })
  );

  const sapaan = salutation(musyrif.gender);

  return (
    <Wrap>
      <div className="topbar">
        <Link href="/2in1/syaikh" className="back">
          {Icon.back(12)} dashboard
        </Link>
        <span className="pekan-tag">
          <span className="dot" />
          Periode {formatCycleRangeShort(setoran.week_start)}
        </span>
      </div>
      <div className="page">
        <h1 className="t-h1" style={{ marginBottom: 2 }}>
          Periksa setoran musyrif
        </h1>
        <p className="t-small" style={{ marginBottom: 16 }}>
          <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {sapaan} {musyrif.name}
          </strong>
          {setoran.submitted_at && (
            <> · disetor {formatTime(setoran.submitted_at)}</>
          )}
        </p>
        <CekForm
          setoranId={setoran.id}
          rekamanList={rekamanList}
          alreadyChecked={setoran.status === 'checked'}
          action={submitCekSyaikh}
          backHref="/2in1/syaikh"
          forwardLabel="Kirim hasil ke musyrif"
        />
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>{children}</div>
    </main>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
