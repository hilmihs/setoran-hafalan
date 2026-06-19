import { redirect } from 'next/navigation';
import { requireKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { FeatureNav } from '@/components/FeatureNav';
import { StatCard } from '@/components/ui/StatCard';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { getHitsRekapForHalaqah } from '@/lib/hits-rekap';
import { todayJakarta, dayNameOf } from '@/lib/maahir-presensi';
import { HitsKetuaForm, type PertemuanSlot } from './HitsKetuaForm';
import type { HitsKeteranganHarian } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function HitsKetuaPage() {
  const session = await requireKetuaKelas();
  if (!session.hits_halaqah_id) redirect('/observasi/ketua-kelas');

  const loaded = await loadHalaqahPertemuan(session.hits_halaqah_id);
  if (!loaded) {
    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }} className="page">
          <p className="t-small">Halaqah tidak ditemukan.</p>
        </div>
      </main>
    );
  }

  const { halaqah, derived } = loaded;
  const today = todayJakarta();
  const month = today.slice(0, 7);

  const { data: ketRows } = await supabaseAdmin
    .from('hits_keterangan_harian')
    .select('*')
    .eq('halaqah_id', halaqah.id);
  const ketByNo = new Map<number, HitsKeteranganHarian>(
    (ketRows ?? []).map((r) => [r.pertemuan_no, r as HitsKeteranganHarian])
  );

  // Slot pertemuan s/d hari ini (paling baru di atas).
  const slots: PertemuanSlot[] = derived
    .filter((d) => d.tanggal <= today)
    .sort((a, b) => b.pertemuan_no - a.pertemuan_no)
    .map((d) => {
      const k = ketByNo.get(d.pertemuan_no) ?? null;
      return {
        pertemuanNo: d.pertemuan_no,
        tanggal: d.tanggal,
        hari: dayNameOf(d.tanggal),
        isToday: d.tanggal === today,
        keterangan: k
          ? {
              kondisi: k.kondisi,
              terlambat: k.terlambat,
              latihan_diberikan: k.latihan_diberikan,
              status_latihan: k.status_latihan,
              semua_selesai: k.semua_selesai,
              catatan: k.catatan,
              editable: k.editable,
            }
          : null,
      };
    });

  const todaySlot = slots.find((s) => s.isToday) ?? null;
  const rekap = await getHitsRekapForHalaqah(halaqah.id, month);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">H</span> Ketua Kelas HITS
            </div>
            <LogoutButton />
          </div>

          <FeatureNav current="/hits/ketua" />

          <h1 className="t-h1" style={{ marginBottom: 4 }}>{halaqah.name}</h1>
          <p className="t-body" style={{ marginBottom: 4 }}>
            Pengajar: {halaqah.pengajar_nama_sheet ?? '—'}
          </p>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            {session.name} (Ketua Kelas) — {today}
          </p>

          {!halaqah.level && (
            <div className="card-flat" style={{ padding: '12px 16px', marginBottom: 16 }}>
              <p className="t-small" style={{ color: 'var(--kuning-ink)' }}>
                Halaqah belum ditag level oleh koordinator, jadwal pertemuan belum bisa dihitung.
                Hubungi koordinator ketua kelas.
              </p>
            </div>
          )}

          <div className="matrix-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', marginBottom: 20 }}>
            <StatCard
              value={rekap?.pctKbbs != null ? `${rekap.pctKbbs}%` : '—'}
              label="KBBS (disiplin)"
            />
            <StatCard
              value={rekap?.pctLatihan != null ? `${rekap.pctLatihan}%` : '—'}
              label="Latihan (t. jawab)"
            />
            <StatCard value={rekap?.terlambat ?? 0} label="Terlambat" />
            <StatCard
              value={`${rekap?.terisi ?? 0}/${rekap?.expected ?? 0}`}
              label="Terisi bln ini"
            />
          </div>

          <HitsKetuaForm
            halaqahName={halaqah.name}
            pengajarName={halaqah.pengajar_nama_sheet ?? '—'}
            slots={slots}
            todayUnfilled={!!todaySlot && !todaySlot.keterangan}
          />
        </div>
      </div>
    </main>
  );
}
