import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  PesertaSetoranForm,
  type ExistingSetoran,
} from '@/components/PesertaSetoranForm';
import { Icon } from '@/components/icons';
import { logout } from '@/lib/auth';
import { currentCycleStart, formatCycleRange } from '@/lib/week';
import {
  buildWaMeUrl,
  salutation,
  syaikhTitle,
  tplMusyrifSubmitToSyaikh,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import type { JenisRekaman, NilaiRekaman, Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function MusyrifSetorPage() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') redirect('/musyrif/login');
  const musyrifId = s.session.musyrif_id;
  const musyrifGender = s.session.gender;

  // Resolve syaikh untuk gender ini
  const { data: syaikhRaw } = await supabaseAdmin
    .from('syaikh')
    .select('id, name, gender, whatsapp_number')
    .eq('gender', musyrifGender)
    .eq('active', true)
    .maybeSingle();
  const syaikh = syaikhRaw as
    | { id: string; name: string; gender: Gender; whatsapp_number: string }
    | null;

  const cycle = currentCycleStart();

  const { data: setoran } = await supabaseAdmin
    .from('setoran_musyrif')
    .select('id, status')
    .eq('musyrif_id', musyrifId)
    .eq('week_start', cycle)
    .maybeSingle();

  let existing: ExistingSetoran | null = null;
  if (setoran && (setoran.status === 'submitted' || setoran.status === 'checked')) {
    const { data: rekaman } = await supabaseAdmin
      .from('rekaman_musyrif')
      .select('jenis, nilai, masukan')
      .eq('setoran_musyrif_id', setoran.id);

    let syaikhWaUrl: string | null = null;
    if (setoran.status === 'submitted' && syaikh) {
      const cekUrl = absUrl(`/syaikh/cek/${setoran.id}`);
      const waText = tplMusyrifSubmitToSyaikh({
        musyrifName: s.session.name,
        musyrifGender,
        syaikhGender: syaikh.gender,
        cekUrl,
      });
      syaikhWaUrl = buildWaMeUrl(syaikh.whatsapp_number, waText);
    }

    existing = {
      id: setoran.id,
      status: setoran.status,
      musyrifWaUrl: syaikhWaUrl,
      rekaman: (rekaman ?? []).map((r) => ({
        jenis: r.jenis as JenisRekaman,
        nilai: (r.nilai as NilaiRekaman | null) ?? null,
        masukan: r.masukan ?? null,
      })),
    };
  }

  const sapaan = salutation(musyrifGender);
  const titel = syaikh ? syaikhTitle(syaikh.gender) : musyrifGender === 'ikhwan' ? 'Syaikh' : 'Ustadzah';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span>Maahir
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href="/musyrif"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              {Icon.back(12)} Dashboard
            </Link>
            <form action={logout}>
              <button type="submit" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
                {Icon.logout(12)} Keluar
              </button>
            </form>
          </div>
        </div>

        <div className="page">
          <div className="row" style={{ padding: '4px 0 14px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sapaan}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{s.session.name}</div>
            </div>
            <span className="pekan-tag">
              <span className="dot" />
              Pekan {formatCycleRange(cycle)}
            </span>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 2 }}>
            Setoran ke {titel}
          </h1>
          <p className="t-small" style={{ marginBottom: 18 }}>
            {syaikh ? <>disampaikan ke {titel} {syaikh.name}</> : 'belum ada Syaikh/Ustadzah aktif'}
          </p>

          {syaikh ? (
            <PesertaSetoranForm
              musyrifName={`${titel} ${syaikh.name}`}
              musyrifInitials={initialsOf(syaikh.name)}
              existing={existing}
              endpoint="/api/setoran-musyrif/submit"
              targetRoleLabel={`${titel} Anda`}
            />
          ) : (
            <p className="t-body">
              Tidak ada {titel.toLowerCase()} aktif untuk gender ini. Hubungi koordinator.
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
