import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  PesertaSetoranForm,
  type ExistingSetoran,
} from '@/components/PesertaSetoranForm';
import { Icon } from '@/components/icons';
import { FeatureNav } from '@/components/FeatureNav';
import { logout } from '@/lib/auth';
import { currentCycleStart, formatCycleRange } from '@/lib/week';
import { buildWaMeUrl, musyrifTitle, tplPesertaSubmitToMusyrif } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import type { JenisRekaman, NilaiRekaman } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function PesertaPage() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'peserta') redirect('/');
  const session = s.session;

  const { data: kelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, musyrif:musyrif_id(id, name, gender, whatsapp_number)')
    .eq('id', session.kelas_id)
    .maybeSingle();

  // Ketua banner: cek apakah peserta ini ketua/wakil kelas program Maahir
  const { data: me } = await supabaseAdmin
    .from('peserta')
    .select('whatsapp_number')
    .eq('id', session.peserta_id)
    .maybeSingle();
  let isKetua = false;
  let pertemuanHariIni: { id: string; nama_kegiatan: string } | null = null;
  if (me?.whatsapp_number) {
    const { data: myProgramKelas } = await supabaseAdmin
      .from('program_kelas')
      .select('id')
      .or(`ketua_wa.eq.${me.whatsapp_number},wakil_wa.eq.${me.whatsapp_number}`);
    isKetua = (myProgramKelas ?? []).length > 0;
    if (isKetua) {
      const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
      const { data: todayPertemuan } = await supabaseAdmin
        .from('pertemuan_program')
        .select('id, nama_kegiatan')
        .in('program_kelas_id', (myProgramKelas ?? []).map((k) => k.id))
        .eq('tanggal', todayStr)
        .limit(1)
        .maybeSingle();
      pertemuanHariIni = todayPertemuan ?? null;
    }
  }

  const musyrif = kelas?.musyrif as
    | { id: string; name: string; gender: 'ikhwan' | 'akhwat'; whatsapp_number: string }
    | undefined;

  const week = currentCycleStart();

  const { data: setoran } = await supabaseAdmin
    .from('setoran')
    .select('id, status')
    .eq('peserta_id', session.peserta_id)
    .eq('week_start', week)
    .maybeSingle();

  let existing: ExistingSetoran | null = null;
  if (setoran && (setoran.status === 'submitted' || setoran.status === 'checked')) {
    const { data: rekaman } = await supabaseAdmin
      .from('rekaman')
      .select('jenis, nilai, masukan')
      .eq('setoran_id', setoran.id);

    let musyrifWaUrl: string | null = null;
    if (setoran.status === 'submitted' && musyrif) {
      const cekUrl = absUrl(`/2in1/musyrif/cek/${setoran.id}`);
      const waText = tplPesertaSubmitToMusyrif({
        pesertaName: session.name,
        pesertaGender: session.gender,
        kelasName: kelas?.name ?? '',
        musyrifGender: musyrif.gender,
        cekUrl,
      });
      musyrifWaUrl = buildWaMeUrl(musyrif.whatsapp_number, waText);
    }

    existing = {
      id: setoran.id,
      status: setoran.status,
      musyrifWaUrl,
      rekaman: (rekaman ?? []).map((r) => ({
        jenis: r.jenis as JenisRekaman,
        nilai: (r.nilai as NilaiRekaman | null) ?? null,
        masukan: r.masukan ?? null,
      })),
    };
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span>Maahir
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href="/akun"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px' }}
            >
              Akun
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="btn btn-sm btn-ghost"
                style={{ height: 30, padding: '0 10px' }}
              >
                {Icon.logout(12)} Keluar
              </button>
            </form>
          </div>
        </div>

        <div className="page">
          <FeatureNav current="/2in1" />
          <div className="row" style={{ padding: '4px 0 14px' }}>
            <div
              className="avatar"
              style={{ background: 'var(--accent-tint)', color: 'var(--accent-2)' }}
            >
              {initialsOf(session.name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Peserta</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{session.name}</div>
            </div>
            <span className="pekan-tag">
              <span className="dot" />
              Pekan {formatCycleRange(week)}
            </span>
          </div>

          {isKetua && (
            <Link
              href={pertemuanHariIni ? `/2in1/ketua-kelas/pertemuan/${pertemuanHariIni.id}` : '/2in1/ketua-kelas'}
              style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}
            >
              <div style={{
                background: pertemuanHariIni ? 'var(--primary-tint, #e8f0fe)' : 'var(--bg-card)',
                border: `1.5px solid ${pertemuanHariIni ? 'var(--primary, #1a73e8)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: pertemuanHariIni ? 'var(--primary, #1a73e8)' : 'var(--muted-2)' }}>
                    {pertemuanHariIni ? `Ada pertemuan hari ini: ${pertemuanHariIni.nama_kegiatan}` : 'Ketua Kelas 2in1'}
                  </div>
                  <div className="t-tiny">
                    {pertemuanHariIni ? 'Isi kehadiran →' : 'Catat pertemuan & kehadiran'}
                  </div>
                </div>
                <span style={{ fontSize: 18 }}>→</span>
              </div>
            </Link>
          )}

          <h1 className="t-h1" style={{ marginBottom: 2 }}>
            Setoran cycle ini
          </h1>
          <p className="t-small" style={{ marginBottom: 18 }}>
            Kelas {kelas?.name ?? '—'}
            {musyrif && <> · disampaikan ke {musyrif.name}</>}
          </p>

          {musyrif ? (
            <PesertaSetoranForm
              musyrifName={musyrif.name}
              musyrifInitials={initialsOf(musyrif.name)}
              existing={existing}
              targetRoleLabel={`${musyrifTitle(musyrif.gender)} kelas Anda`}
              endpoint="/api/2in1/setoran/submit"
              singleSubmitEndpoint="/api/2in1/rekaman/submit-single"
              cacheKey={week}
            />
          ) : (
            <p className="t-body">
              Belum ada musyrif untuk kelas Anda. Hubungi koordinator.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
