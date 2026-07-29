import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPemutihan } from '@/lib/maahir-pemutihan';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { Icon } from '@/components/icons';
import { PemutihanClient, type AnggotaOpt } from './PemutihanClient';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

export default async function PemutihanPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (!accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const nowMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;

  const { data: kelasRows } = await supabaseAdmin.from('program_kelas').select('id, name');
  const kelasById = new Map((kelasRows ?? []).map((k) => [k.id as string, k.name as string]));

  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, name, program_kelas_id')
    .order('name');
  const anggota: AnggotaOpt[] = (anggotaRows ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    kelasName: kelasById.get(a.program_kelas_id as string) ?? '—',
  }));

  const rows = (await getPemutihan(month)).map((r) => ({
    id: r.id,
    anggotaId: r.anggotaId,
    alasan: r.alasan,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark"><span className="mark">M</span> Pemutihan Absensi</div>
          <Link href="/2in1/koordinator/kehadiran" className="back">{Icon.back(12)} Kehadiran</Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <h1 className="t-h2" style={{ marginBottom: 2 }}>Pemutihan absensi</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Peserta yang diputihkan dianggap hadir penuh pada periode ini: kehadirannya
                dihitung 100%, tak masuk daftar di bawah target, dan alpa/izin bulan ini tak
                dihitung untuk SP. Data presensi aslinya tetap tersimpan.
              </p>
            </div>
            <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
          </div>

          <PemutihanClient month={month} anggota={anggota} rows={rows} />
        </div>
      </div>
    </main>
  );
}
