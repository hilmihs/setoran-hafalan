import { requirePengajar } from '@/lib/session';
import { getAntrianCheckin } from '@/lib/attendance';
import { getKelompokDinilaiIds } from '@/lib/penilai-ketua';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import { CheckinForm } from './CheckinForm';
import { getCurrentPekan } from '@/lib/batch';
import { tanggalPanjang, tanggalSedang } from '@/lib/tanggal-id';
import type { KetuaKelasInfo } from './CheckinForm';

export const dynamic = 'force-dynamic';

const JENIS_ALASAN: Record<string, string> = { alpa: 'Izin/sakit', terlambat: 'Terlambat' };

export default async function KehadiranPengajarPage() {
  const session = await requirePengajar();

  const [antrian, jatahPenilaian, pendingAlasan] = await Promise.all([
    getAntrianCheckin(session.pengajar_id),
    // Penilai ketua kelompok — jumlah ketua yang jadi jatah penilaiannya.
    getKelompokDinilaiIds(session.pengajar_id).then((ids) => ids.length),
    supabaseAdmin
      .from('pengajuan_alasan')
      .select('id, tanggal, jenis, alasan, status')
      .eq('pengajar_id', session.pengajar_id)
      .eq('status', 'pending')
      .order('tanggal', { ascending: false })
      .limit(5)
      .then((r) => r.data ?? []),
  ]);
  const { today } = antrian;

  let pekan: number | null = null;
  let kelasList: KetuaKelasInfo[] = [];

  const { data: batch } = await supabaseAdmin
    .from('batch_config')
    .select('id, start_date')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (batch) {
    const weekNum = getCurrentPekan(batch.start_date);
    if (weekNum >= 1 && weekNum <= 2) {
      pekan = weekNum;

      const { data: pengajarKelas } = await supabaseAdmin
        .from('kelas_hits')
        .select('id, name')
        .eq('pengajar_id', session.pengajar_id);

      if (pengajarKelas) {
        for (const k of pengajarKelas) {
          const { data: ketua } = await supabaseAdmin
            .from('ketua_kelas')
            .select('name')
            .eq('kelas_hits_id', k.id)
            .eq('batch_id', batch.id)
            .eq('active', true)
            .maybeSingle();
          kelasList.push({
            kelasHitsId: k.id,
            kelasName: k.name,
            hasKetuaThisBatch: !!ketua,
            currentKetuaName: ketua?.name ?? null,
          });
        }
      }
    }
  }

  const terkait: { href: string; title: string }[] = [
    { href: '/kehadiran/pengajar/matrix', title: 'Matrix Saya' },
    ...(session.is_ketua
      ? [{ href: '/kehadiran/ketua-kelompok/penilaian', title: 'Penilaian Pedagogis Kelompok' }]
      : []),
    ...(jatahPenilaian > 0
      ? [{ href: '/kehadiran/ketua-kelompok/penilaian-ketua', title: `Penilaian Ketua Kelompok (${jatahPenilaian})` }]
      : []),
  ];

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          {/* Satu jalan pulang: tautan Beranda di sini; FAB Beranda disembunyikan di rute ini. */}
          <div className="topbar" style={{ padding: '12px 0 8px' }}>
            <a href="/" className="back">
              {Icon.back(14)} Beranda
            </a>
            <LogoutButton />
          </div>

          <h1 className="t-h1" style={{ margin: '10px 0 4px' }}>Kehadiran</h1>
          <p className="t-body" style={{ marginBottom: 16, color: 'var(--muted)' }}>
            {tanggalPanjang(today)}
          </p>

          <CheckinForm
            programs={[...antrian.lampau, ...antrian.hariIni]}
            checkedKeys={antrian.terisiHariIni}
            today={today}
            kelasList={kelasList}
            pekan={pekan}
          />

          <div className="t-tiny" style={{ margin: '22px 2px 8px' }}>Terkait</div>
          <div className="card-flat" style={{ overflow: 'hidden' }}>
            {pendingAlasan.length > 0 && (
              <details className="list-details">
                <summary className="list-row" style={{ cursor: 'pointer' }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Pengajuan alasan saya</div>
                  <span className="badge badge-kuning">{pendingAlasan.length} menunggu</span>
                  <span className="arrow chev">{Icon.arrow(14)}</span>
                </summary>
                {pendingAlasan.map((a) => (
                  <div key={a.id} className="list-row" style={{ display: 'block', background: 'var(--surface-2)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {tanggalSedang(a.tanggal)} · {JENIS_ALASAN[a.jenis] ?? a.jenis}
                    </div>
                    <div className="t-small" style={{ fontSize: 12 }}>{a.alasan}</div>
                  </div>
                ))}
              </details>
            )}
            {terkait.map((t) => (
              <a key={t.href} href={t.href} className="list-row">
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{t.title}</div>
                <span className="arrow">{Icon.arrow(14)}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
