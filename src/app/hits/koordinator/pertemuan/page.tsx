import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Icon } from '@/components/icons';
import { deriveHalaqahPertemuan } from '@/lib/hits-pertemuan';
import { dayNameOf } from '@/lib/maahir-presensi';
import { PertemuanOverrideClient, type HalaqahOverrideData, type OverrideRow } from './PertemuanOverrideClient';

export const dynamic = 'force-dynamic';

export default async function HitsPertemuanPage() {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const { data: halaqahRows } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, batch_id, level, name, gender, jadwal_raw, jadwal_hari')
    .eq('active', true)
    .order('name');
  const halaqah = halaqahRows ?? [];

  let data: HalaqahOverrideData[] = [];
  let batches: { id: string; name: string }[] = [];

  if (halaqah.length) {
    const batchIds = [...new Set(halaqah.map((h) => h.batch_id))];
    const halaqahIds = halaqah.map((h) => h.id);

    const [{ data: batchList }, { data: kaldikList }, { data: overrideList }] = await Promise.all([
      supabaseAdmin.from('hits_batch').select('id, name').in('id', batchIds),
      supabaseAdmin
        .from('hits_kaldik_hari')
        .select('batch_id, level, tanggal, pekan, is_libur')
        .in('batch_id', batchIds),
      supabaseAdmin
        .from('hits_kaldik_pertemuan')
        .select('halaqah_id, pertemuan_no, tanggal, is_skipped, note')
        .in('halaqah_id', halaqahIds),
    ]);

    batches = batchList ?? [];
    const batchName = new Map(batches.map((b) => [b.id, b.name]));

    const kaldikByBL = new Map<string, { tanggal: string; pekan: number | null; is_libur: boolean }[]>();
    for (const r of kaldikList ?? []) {
      const key = `${r.batch_id}|${r.level}`;
      const arr = kaldikByBL.get(key) ?? [];
      arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
      kaldikByBL.set(key, arr);
    }
    const overrideByHalaqah = new Map<string, Map<number, { tanggal: string; is_skipped: boolean; note: string | null }>>();
    for (const o of overrideList ?? []) {
      const m = overrideByHalaqah.get(o.halaqah_id) ?? new Map();
      m.set(o.pertemuan_no, { tanggal: o.tanggal, is_skipped: o.is_skipped, note: o.note });
      overrideByHalaqah.set(o.halaqah_id, m);
    }

    data = halaqah.map((h) => {
      const base = h.level
        ? deriveHalaqahPertemuan(h.jadwal_hari ?? [], kaldikByBL.get(`${h.batch_id}|${h.level}`) ?? [])
        : [];
      const ovMap = overrideByHalaqah.get(h.id) ?? new Map();
      const seen = new Set<number>();
      const rows: OverrideRow[] = base.map((d) => {
        seen.add(d.pertemuan_no);
        const ov = ovMap.get(d.pertemuan_no);
        return {
          pertemuanNo: d.pertemuan_no,
          baseDate: d.tanggal,
          baseHari: dayNameOf(d.tanggal),
          overrideDate: ov && !ov.is_skipped ? ov.tanggal : null,
          isSkipped: ov?.is_skipped ?? false,
          note: ov?.note ?? null,
        };
      });
      // Override manual tanpa basis derivasi.
      for (const [no, ov] of ovMap.entries()) {
        if (seen.has(no)) continue;
        rows.push({
          pertemuanNo: no,
          baseDate: null,
          baseHari: null,
          overrideDate: ov.is_skipped ? null : ov.tanggal,
          isSkipped: ov.is_skipped,
          note: ov.note,
        });
      }
      rows.sort((a, b) => a.pertemuanNo - b.pertemuanNo);
      return {
        halaqahId: h.id,
        name: h.name,
        batchId: h.batch_id,
        batchName: batchName.get(h.batch_id) ?? '—',
        levelTagged: !!h.level,
        jadwalRaw: h.jadwal_raw,
        rows,
      };
    });
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Override Pertemuan
          </div>
          <Link href="/hits/koordinator" className="back">
            {Icon.shield(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Pemetaan pertemuan → tanggal dihitung otomatis dari kaldik + jadwal halaqah. Gunakan
            override hanya bila ada anomali (libur dadakan, ganti hari, sesi tambahan). Override
            memengaruhi ekspektasi pengisian keterangan harian.
          </p>

          {data.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada halaqah. Tambahkan di{' '}
              <Link href="/hits/koordinator/validasi">Validasi &amp; Sumber Data</Link>.
            </p>
          ) : (
            <PertemuanOverrideClient data={data} batches={batches} />
          )}
        </div>
      </div>
    </main>
  );
}
