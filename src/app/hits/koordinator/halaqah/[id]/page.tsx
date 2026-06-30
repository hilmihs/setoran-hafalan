import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { HITS_LEVEL_SHORT } from '@/lib/hits-pertemuan';
import { todayJakarta, dayNameOf } from '@/lib/maahir-presensi';
import { HITS_KONDISI_LABEL, HITS_STATUS_LATIHAN_LABEL, HITS_LEVEL_LABEL } from '@/types/db';
import type { HitsKeteranganHarian, HitsKondisi } from '@/types/db';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

function kondisiStyle(k: HitsKondisi) {
  if (k === 'KBBS') return { bg: 'var(--hijau-tint)', bd: 'var(--hijau-line)', ink: 'var(--hijau-ink)' };
  if (k === 'LIBUR') return { bg: 'var(--surface-3)', bd: 'var(--line)', ink: 'var(--muted)' };
  return { bg: 'var(--kuning-tint)', bd: 'var(--kuning-line)', ink: 'var(--kuning-ink)' };
}

export default async function HalaqahDetailPage({ params }: { params: { id: string } }) {
  await requireKoordinatorKetuaKelas();

  // Detail read-only: koordinator KK boleh lihat halaqah gender mana pun
  // (rincian pertemuan + observasi). Gating gender hanya untuk aksi tulis.
  const { data: h } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, level, pengajar_id, pengajar_nama_sheet, jadwal_raw')
    .eq('id', params.id)
    .maybeSingle();
  if (!h) redirect('/hits/koordinator');

  const loaded = await loadHalaqahPertemuan(params.id);
  const derived = loaded?.derived ?? [];

  const [{ data: ketRows }, { data: pengajar }, { data: ketua }] = await Promise.all([
    supabaseAdmin.from('hits_keterangan_harian').select('*').eq('halaqah_id', params.id),
    h.pengajar_id ? supabaseAdmin.from('pengajar').select('name').eq('id', h.pengajar_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('ketua_kelas').select('name').eq('hits_halaqah_id', params.id).eq('active', true).maybeSingle(),
  ]);
  const ketByKey = new Map<string, HitsKeteranganHarian>((ketRows ?? []).map((r) => [`${r.level}-${r.pertemuan_no}`, r as HitsKeteranganHarian]));

  const today = todayJakarta();
  const rows = derived
    .slice()
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0))
    .map((d) => ({ ...d, k: ketByKey.get(`${d.level}-${d.pertemuan_no}`) ?? null, isToday: d.tanggal === today }));

  const terisi = rows.filter((r) => r.k && r.tanggal <= today).length;
  const expected = rows.filter((r) => r.tanggal <= today).length;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">H</span> Detail Halaqah</div>
            <Link href="/hits/koordinator" className="back">{Icon.shield(12)} Kembali</Link>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>{h.name}</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 4 }}>
            {h.level ? HITS_LEVEL_LABEL[h.level as keyof typeof HITS_LEVEL_LABEL] : '⚠ level belum ditag'} · {h.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
            {h.jadwal_raw ? ` · ${h.jadwal_raw}` : ''}
          </p>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Pengajar: {pengajar?.name ?? h.pengajar_nama_sheet ?? '—'} · Ketua: {ketua?.name ?? 'belum ditunjuk'} · Terisi {terisi}/{expected}
          </p>

          {rows.length === 0 ? (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center' }}>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                {h.level ? 'Belum ada pertemuan (kaldik kosong).' : 'Level belum ditag — pertemuan tak bisa diturunkan.'}
              </p>
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Pertemuan</th>
                      <th>Tanggal</th>
                      <th>Kehadiran Pengajar</th>
                      <th>Ujian / Latihan</th>
                      <th>Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const k = r.k;
                      const future = r.tanggal > today;
                      const st = k ? kondisiStyle(k.kondisi) : null;
                      return (
                        <tr key={`${r.level}-${r.pertemuan_no}`} style={{ background: r.isToday ? 'var(--accent-tint)' : undefined }}>
                          <td className="t-mono">
                            {r.pertemuan_no}{r.isToday && <span className="t-tiny" style={{ color: 'var(--accent-2)' }}> (hari ini)</span>}
                            {r.level && <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{HITS_LEVEL_SHORT[r.level]}</div>}
                          </td>
                          <td className="t-small">{dayNameOf(r.tanggal)} {r.tanggal}</td>
                          <td>
                            {k ? (
                              <span className="badge" style={{ background: st!.bg, borderColor: st!.bd, color: st!.ink }}>
                                {k.kondisi}
                              </span>
                            ) : (
                              <span className="t-small" style={{ color: future ? 'var(--muted)' : 'var(--kuning-ink)' }}>{future ? '—' : 'belum diisi'}</span>
                            )}
                            {k && k.kondisi !== 'LIBUR' && (
                              <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>{HITS_KONDISI_LABEL[k.kondisi]}</div>
                            )}
                          </td>
                          <td className="t-small">
                            {!k || k.kondisi === 'LIBUR' ? '—'
                              : k.latihan_diberikan
                                ? <>Diberikan{k.status_latihan ? ` · ${HITS_STATUS_LATIHAN_LABEL[k.status_latihan]}` : ''}{k.semua_selesai ? ' · semua selesai' : ''}</>
                                : 'Tidak ada latihan'}
                          </td>
                          <td className="t-small" style={{ color: 'var(--muted-2)' }}>{k?.catatan ?? ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
