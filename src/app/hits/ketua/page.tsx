import { redirect } from 'next/navigation';
import { requireKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { FeatureNav } from '@/components/FeatureNav';
import { StatCard } from '@/components/ui/StatCard';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { getHitsRekapForHalaqah } from '@/lib/hits-rekap';
import { todayJakarta, dayNameOf } from '@/lib/maahir-presensi';
import { HITS_LEVEL_SHORT } from '@/lib/hits-pertemuan';
import { HitsKetuaForm, type PertemuanSlot } from './HitsKetuaForm';
import type { HitsKeteranganHarian, HitsLevel } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function HitsKetuaPage({
  searchParams,
}: {
  searchParams: { h?: string };
}) {
  const session = await requireKetuaKelas();
  if (!session.hits_halaqah_id) redirect('/');

  // Peran ganda: cari semua halaqah di mana WA ketua ini aktif sebagai ketua.
  const { data: selfRow } = await supabaseAdmin
    .from('ketua_kelas')
    .select('whatsapp_number')
    .eq('id', session.ketua_kelas_id)
    .maybeSingle();
  const ketuaWa = selfRow?.whatsapp_number ?? null;

  const myHalaqah: { hits_halaqah_id: string; name: string }[] = [];
  if (ketuaWa) {
    const { data: rows } = await supabaseAdmin
      .from('ketua_kelas')
      .select('hits_halaqah_id, hits_halaqah:hits_halaqah_id(name)')
      .eq('whatsapp_number', ketuaWa)
      .eq('active', true)
      .not('hits_halaqah_id', 'is', null);
    const seen = new Set<string>();
    for (const r of rows ?? []) {
      const hid = r.hits_halaqah_id as string | null;
      if (!hid || seen.has(hid)) continue;
      seen.add(hid);
      const hq = r.hits_halaqah as unknown as { name: string } | null;
      myHalaqah.push({ hits_halaqah_id: hid, name: hq?.name ?? '(halaqah)' });
    }
    myHalaqah.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Halaqah aktif yang dipilih (switcher), default = halaqah sesi.
  const selectedHalaqahId =
    searchParams.h && myHalaqah.some((h) => h.hits_halaqah_id === searchParams.h)
      ? searchParams.h
      : session.hits_halaqah_id;

  const loaded = await loadHalaqahPertemuan(selectedHalaqahId);
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
  const ketByKey = new Map<string, HitsKeteranganHarian>(
    (ketRows ?? []).map((r) => [`${r.level}-${r.pertemuan_no}`, r as HitsKeteranganHarian])
  );

  // Slot pertemuan s/d hari ini (paling baru di atas).
  const slots: PertemuanSlot[] = derived
    .filter((d) => d.tanggal <= today)
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0))
    .map((d) => {
      const lv = d.level as HitsLevel;
      const k = ketByKey.get(`${lv}-${d.pertemuan_no}`) ?? null;
      return {
        pertemuanNo: d.pertemuan_no,
        level: lv,
        levelLabel: HITS_LEVEL_SHORT[lv],
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

          {myHalaqah.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 6 }}>
                Anda ketua di {myHalaqah.length} halaqah — pilih untuk berpindah:
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {myHalaqah.map((h) => {
                  const active = h.hits_halaqah_id === selectedHalaqahId;
                  return (
                    <a
                      key={h.hits_halaqah_id}
                      href={`/hits/ketua?h=${h.hits_halaqah_id}`}
                      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ textDecoration: 'none', fontSize: 12 }}
                    >
                      {h.name}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

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
