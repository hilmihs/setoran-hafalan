/**
 * Seed hits_kaldik_hari untuk batch Juli 2026 dari HITS_full.json.
 *
 *   npm run seed-hits-kaldik-juli            # DRY-RUN (preview, tidak menulis)
 *   npm run seed-hits-kaldik-juli -- --confirm   # tulis ke DB (upsert)
 *
 * Cara kerja:
 *  - Target = batch yang kaldik_hari-nya MASIH KOSONG (mis. 3 batch Juli). Batch
 *    lama yang sudah punya kaldik tidak disentuh.
 *  - Tanggal diambil dari HITS_full.json (kolom `jadwal[].date` per halaqah),
 *    di-match ke hits_halaqah lewat NAMA (dalam batch kosong tsb) → dapat batch_id
 *    & level dari DB (otoritatif).
 *  - Per (batch, level): union tanggal, `pekan` = index minggu dari Senin pekan-1,
 *    `hari` dari tanggal, is_libur=false. Upsert onConflict (batch_id,level,tanggal).
 *  - ABORT saat --confirm bila ada halaqah HITS_full.json yang tak ter-match (biar
 *    tidak seed setengah-setengah).
 *
 * Prasyarat: migration 0045 (pekan CHECK 13->40) sudah diterapkan, karena ABK &
 * Nurul Iman berjalan >13 pekan (1x/pekan).
 */
// Pakai shim supabaseAdmin (Postgres langsung via DATABASE_URL), bukan Supabase hosted.
import { supabaseAdmin as sb } from '../src/lib/supabase-admin';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { HitsLevel } from '../src/types/db';

const CONFIRM = process.argv.includes('--confirm');
const __dirname = dirname(fileURLToPath(import.meta.url));

const HARI_ID = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const LEVEL_MAP: Record<string, HitsLevel> = {
  Nuroniyyah: 'qoidah_nuroniyyah',
  Dasar: 'qoidah_nuroniyyah',
  'Perbaikan Bacaan': 'perbaikan_bacaan',
  Lanjutan: 'perbaikan_bacaan',
};

type FullHalaqah = { bid: number; halaqah: string; level: string; jadwal: { date?: string; tanggal?: string }[] };

function hariOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return HARI_ID[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function mondayUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const off = (new Date(base).getUTCDay() + 6) % 7;
  return base - off * 86400000;
}
function weekIndex(iso: string, firstMonday: number): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - firstMonday) / (7 * 86400000)) + 1;
}

async function main() {
  console.log(`\n📅 Seed kaldik Juli — mode: ${CONFIRM ? 'CONFIRM (tulis)' : 'DRY-RUN (preview)'}\n`);

  // 1. batch yang kaldik-nya kosong = target
  const { data: batches, error: be } = await sb.from('hits_batch').select('id,name,slug,start_date');
  if (be) throw be;
  const emptyBatches: { id: string; name: string; slug: string }[] = [];
  for (const b of batches ?? []) {
    const { count } = await sb.from('hits_kaldik_hari').select('id', { count: 'exact', head: true }).eq('batch_id', b.id);
    if ((count ?? 0) === 0) emptyBatches.push(b);
  }
  if (!emptyBatches.length) { console.log('Tidak ada batch dengan kaldik kosong. Selesai.'); return; }
  console.log(`Batch kaldik-kosong (target): ${emptyBatches.map((b) => b.slug).join(', ')}\n`);
  const emptyIds = new Set(emptyBatches.map((b) => b.id));
  const batchById = new Map(emptyBatches.map((b) => [b.id, b]));

  // 2. halaqah di batch target: name -> {batch_id, level}
  const { data: hal, error: he } = await sb
    .from('hits_halaqah')
    .select('name,batch_id,level')
    .in('batch_id', emptyBatches.map((b) => b.id));
  if (he) throw he;
  const byName = new Map<string, { batch_id: string; level: HitsLevel | null }[]>();
  for (const h of hal ?? []) {
    if (!emptyIds.has(h.batch_id)) continue;
    const arr = byName.get(h.name) ?? [];
    arr.push({ batch_id: h.batch_id, level: h.level as HitsLevel | null });
    byName.set(h.name, arr);
  }

  // 3. tanggal dari HITS_full.json, di-match by nama
  const full: FullHalaqah[] = JSON.parse(readFileSync(join(__dirname, '..', 'HITS_full.json'), 'utf8'));
  const groups = new Map<string, { batch_id: string; level: HitsLevel; dates: Set<string> }>();
  const unmatched: string[] = [];
  for (const fh of full) {
    const matches = byName.get(fh.halaqah);
    if (!matches || matches.length === 0) { continue; } // halaqah bukan di batch target — lewati diam
    if (matches.length > 1) { unmatched.push(`${fh.halaqah} (nama ambigu di ${matches.length} batch)`); continue; }
    const m = matches[0];
    const level = (m.level ?? LEVEL_MAP[fh.level]) as HitsLevel;
    if (!level) { unmatched.push(`${fh.halaqah} (level tak diketahui)`); continue; }
    const key = `${m.batch_id}|${level}`;
    const g = groups.get(key) ?? { batch_id: m.batch_id, level, dates: new Set<string>() };
    for (const j of fh.jadwal ?? []) {
      const t = (j.date ?? j.tanggal ?? '').slice(0, 10);
      if (t) g.dates.add(t);
    }
    groups.set(key, g);
  }

  // 4. build rows per group + preview
  let totalRows = 0;
  const payloads: Record<string, unknown>[] = [];
  for (const g of [...groups.values()].sort((a, b) => (a.batch_id + a.level).localeCompare(b.batch_id + b.level))) {
    const dates = [...g.dates].sort();
    const firstMonday = mondayUTC(dates[0]);
    let maxPekan = 0;
    const rows = dates.map((t) => {
      const pekan = weekIndex(t, firstMonday);
      maxPekan = Math.max(maxPekan, pekan);
      return { batch_id: g.batch_id, level: g.level, tanggal: t, hari: hariOf(t), pekan, is_libur: false, source: 'manual' as const };
    });
    payloads.push(...rows);
    totalRows += rows.length;
    const b = batchById.get(g.batch_id);
    const flag = maxPekan > 40 ? '  ❌ pekan>40 (di atas batas 0045!)' : maxPekan > 13 ? '  (perlu 0045)' : '';
    console.log(`  ${b?.slug} · ${g.level}: ${rows.length} tanggal, ${maxPekan} pekan, ${dates[0]} → ${dates.at(-1)}${flag}`);
  }

  if (unmatched.length) {
    console.log(`\n⚠ ${unmatched.length} halaqah bermasalah:`);
    for (const u of unmatched.slice(0, 20)) console.log(`   - ${u}`);
  }
  console.log(`\nTotal baris kaldik: ${totalRows}`);

  if (!CONFIRM) { console.log('\n(DRY-RUN — tidak menulis. Tambahkan --confirm untuk apply.)\n'); return; }
  if (unmatched.length) { console.error('\n❌ Ada halaqah bermasalah — batalkan write. Perbaiki dulu.'); process.exit(1); }

  const { error: ue } = await sb.from('hits_kaldik_hari').upsert(payloads, { onConflict: 'batch_id,level,tanggal' });
  if (ue) throw ue;
  console.log(`\n✅ Upsert ${totalRows} baris kaldik selesai.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
