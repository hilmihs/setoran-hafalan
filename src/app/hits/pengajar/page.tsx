import Link from 'next/link';
import { requirePengajar } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { FeatureNav } from '@/components/FeatureNav';
import { deriveHalaqahPertemuanWithOverrides, type PertemuanOverride } from '@/lib/hits-pertemuan';
import { todayJakarta } from '@/lib/maahir-presensi';
import { AssignKetuaPanel, type HalaqahForAssign } from './AssignKetuaStep';

export const dynamic = 'force-dynamic';

export default async function HitsPengajarPage() {
  const session = await requirePengajar();
  const wa = await getSessionWa();
  const today = todayJakarta();

  // Halaqah milik pengajar ini (via pengajar_id atau pengajar_wa).
  const orFilter = wa
    ? `pengajar_id.eq.${session.pengajar_id},pengajar_wa.eq.${wa}`
    : `pengajar_id.eq.${session.pengajar_id}`;
  const { data: halaqahRows } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, batch_id, level, name, jadwal_raw, jadwal_hari, gender')
    .eq('active', true)
    .or(orFilter);
  const halaqah = halaqahRows ?? [];

  let panelData: HalaqahForAssign[] = [];

  if (halaqah.length) {
    const halaqahIds = halaqah.map((h) => h.id);
    const batchIds = [...new Set(halaqah.map((h) => h.batch_id))];

    const [{ data: kaldikList }, { data: overrideList }, { data: pesertaList }] = await Promise.all([
      supabaseAdmin
        .from('hits_kaldik_hari')
        .select('batch_id, level, tanggal, pekan, is_libur')
        .in('batch_id', batchIds),
      supabaseAdmin
        .from('hits_kaldik_pertemuan')
        .select('halaqah_id, pertemuan_no, tanggal, pekan, is_skipped')
        .in('halaqah_id', halaqahIds),
      supabaseAdmin
        .from('hits_halaqah_peserta')
        .select('id, halaqah_id, nama, is_ketua, status_peserta')
        .in('halaqah_id', halaqahIds)
        .eq('active', true)
        .order('nama'),
    ]);

    const kaldikByBL = new Map<string, { tanggal: string; pekan: number | null; is_libur: boolean }[]>();
    for (const r of kaldikList ?? []) {
      const key = `${r.batch_id}|${r.level}`;
      const arr = kaldikByBL.get(key) ?? [];
      arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
      kaldikByBL.set(key, arr);
    }
    const overridesByHalaqah = new Map<string, PertemuanOverride[]>();
    for (const o of overrideList ?? []) {
      const arr = overridesByHalaqah.get(o.halaqah_id) ?? [];
      arr.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan, is_skipped: o.is_skipped });
      overridesByHalaqah.set(o.halaqah_id, arr);
    }
    const pesertaByHalaqah = new Map<string, { id: string; nama: string }[]>();
    const ketuaByHalaqah = new Map<string, string>();
    for (const p of pesertaList ?? []) {
      const arr = pesertaByHalaqah.get(p.halaqah_id) ?? [];
      arr.push({ id: p.id, nama: p.nama });
      pesertaByHalaqah.set(p.halaqah_id, arr);
      if (p.is_ketua) ketuaByHalaqah.set(p.halaqah_id, p.nama);
    }

    panelData = halaqah.map((h) => {
      let pertemuanCount = 0;
      if (h.level) {
        const kaldik = kaldikByBL.get(`${h.batch_id}|${h.level}`) ?? [];
        const derived = deriveHalaqahPertemuanWithOverrides(
          h.jadwal_hari ?? [],
          kaldik,
          overridesByHalaqah.get(h.id) ?? []
        );
        pertemuanCount = derived.filter((d) => d.tanggal <= today).length;
      }
      return {
        id: h.id,
        name: h.name,
        levelTagged: !!h.level,
        pertemuanCount,
        currentKetua: ketuaByHalaqah.get(h.id) ?? null,
        peserta: pesertaByHalaqah.get(h.id) ?? [],
      };
    });
  }

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

          <FeatureNav current="/hits/pengajar" />

          <h1 className="t-h1" style={{ marginBottom: 4 }}>Penunjukan Ketua Kelas</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Tunjuk satu peserta tiap halaqah menjadi ketua kelas. Ketua bertugas mengisi
            keterangan pengajar & latihan tiap pertemuan.
          </p>

          {panelData.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada halaqah HITS terhubung dengan akun Anda. Hubungi koordinator ketua kelas.
            </p>
          ) : (
            <AssignKetuaPanel halaqahList={panelData} />
          )}

          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 20 }}>
            <Link href="/kehadiran/pengajar">← Kembali ke Kehadiran Program</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
