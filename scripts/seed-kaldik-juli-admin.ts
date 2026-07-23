/**
 * Seed hits_kaldik_hari batch Juli 2026 — via ADMIN API (/api/admin/db),
 * bukan supabaseAdmin. Dipakai karena env lokal tak punya DATABASE_URL prod;
 * satu-satunya jalur tulis prod adalah admin API (sama seperti `npm run db`).
 *
 *   npx tsx --env-file=.env.local scripts/seed-kaldik-juli-admin.ts            # DRY-RUN (read-only prod, preview)
 *   npx tsx --env-file=.env.local scripts/seed-kaldik-juli-admin.ts --confirm  # tulis ke prod (INSERT)
 *
 * Logika identik scripts/seed-hits-kaldik-juli.ts:
 *  - target = batch yang hits_kaldik_hari-nya kosong.
 *  - tanggal dari HITS_full.json (jadwal[].date), match ke hits_halaqah by NAMA
 *    → batch_id & level dari DB.
 *  - per (batch,level): union tanggal, pekan = index minggu dari Senin pekan-1.
 *  - INSERT ... ON CONFLICT (batch_id,level,tanggal) DO NOTHING.
 *
 * Prasyarat: constraint hits_kaldik_hari_pekan_check sudah dilonggarkan ke 40
 * (migration 0045) — ABK/Nurul Iman berjalan >13 pekan.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const CONFIRM = process.argv.includes('--confirm');
const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.ADMIN_API_TOKEN;
const BASE = (process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
if (!TOKEN) { console.error('✗ ADMIN_API_TOKEN belum di-set di .env.local'); process.exit(2); }
if (!BASE) { console.error('✗ ADMIN_API_URL / NEXT_PUBLIC_APP_URL belum di-set'); process.exit(2); }

type Level = 'qoidah_nuroniyyah' | 'perbaikan_bacaan';
const LEVEL_MAP: Record<string, Level> = {
  Nuroniyyah: 'qoidah_nuroniyyah',
  Dasar: 'qoidah_nuroniyyah',
  'Perbaikan Bacaan': 'perbaikan_bacaan',
  Lanjutan: 'perbaikan_bacaan',
};
const HARI_ID = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

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

async function api(sql: string, confirm = false): Promise<any> {
  const res = await fetch(`${BASE}/api/admin/db`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ sql, confirm }),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} non-JSON: ${text.slice(0, 300)}`); }
  if (!res.ok || data?.ok === false) throw new Error(`HTTP ${res.status}: ${data?.error ?? 'unknown'}`);
  return data;
}

type FullHalaqah = { halaqah: string; level: string; jadwal: { date?: string; tanggal?: string }[] };

async function main() {
  console.log(`\n📅 Seed kaldik Juli (admin API @ ${BASE}) — mode: ${CONFIRM ? 'CONFIRM (tulis)' : 'DRY-RUN'}\n`);

  // 1. batch kaldik-kosong.
  const emptyBatches: { id: string; name: string; slug: string }[] = (
    await api(
      `select b.id, b.name, b.slug from hits_batch b
       where not exists (select 1 from hits_kaldik_hari k where k.batch_id = b.id)`
    )
  ).rows ?? [];
  if (!emptyBatches.length) { console.log('Tidak ada batch dengan kaldik kosong. Selesai.'); return; }
  console.log(`Batch target (kaldik kosong): ${emptyBatches.map((b) => b.name).join(', ')}\n`);
  const batchById = new Map(emptyBatches.map((b) => [b.id, b]));
  const idList = emptyBatches.map((b) => `'${b.id}'`).join(',');

  // 2. halaqah name -> {batch_id, level}.
  const hal: { name: string; batch_id: string; level: Level | null }[] = (
    await api(`select name, batch_id, level from hits_halaqah where batch_id in (${idList})`)
  ).rows ?? [];
  const byName = new Map<string, { batch_id: string; level: Level | null }[]>();
  for (const h of hal) {
    const arr = byName.get(h.name) ?? [];
    arr.push({ batch_id: h.batch_id, level: h.level });
    byName.set(h.name, arr);
  }

  // 3. tanggal dari HITS_full.json, match by nama.
  const full: FullHalaqah[] = JSON.parse(readFileSync(join(__dirname, '..', 'HITS_full.json'), 'utf8'));
  const groups = new Map<string, { batch_id: string; level: Level; dates: Set<string> }>();
  const unmatched: string[] = [];
  for (const fh of full) {
    const matches = byName.get(fh.halaqah);
    if (!matches || matches.length === 0) continue; // bukan batch target
    if (matches.length > 1) { unmatched.push(`${fh.halaqah} (nama ambigu di ${matches.length} batch)`); continue; }
    const m = matches[0];
    const level = (m.level ?? LEVEL_MAP[fh.level]) as Level;
    if (!level) { unmatched.push(`${fh.halaqah} (level tak diketahui)`); continue; }
    const key = `${m.batch_id}|${level}`;
    const g = groups.get(key) ?? { batch_id: m.batch_id, level, dates: new Set<string>() };
    for (const j of fh.jadwal ?? []) {
      const t = (j.date ?? j.tanggal ?? '').slice(0, 10);
      if (t) g.dates.add(t);
    }
    groups.set(key, g);
  }

  // 4. rows + preview.
  const values: string[] = [];
  let totalRows = 0;
  for (const g of [...groups.values()].sort((a, b) => (a.batch_id + a.level).localeCompare(b.batch_id + b.level))) {
    const dates = [...g.dates].sort();
    const firstMonday = mondayUTC(dates[0]);
    let maxPekan = 0;
    for (const t of dates) {
      const pekan = weekIndex(t, firstMonday);
      maxPekan = Math.max(maxPekan, pekan);
      values.push(`('${g.batch_id}','${g.level}','${t}','${hariOf(t)}',${pekan},false,'manual')`);
    }
    totalRows += dates.length;
    const b = batchById.get(g.batch_id);
    const flag = maxPekan > 40 ? '  ❌ pekan>40' : maxPekan > 13 ? '  (perlu 0045)' : '';
    console.log(`  ${b?.name} · ${g.level}: ${dates.length} tanggal, ${maxPekan} pekan, ${dates[0]} → ${dates.at(-1)}${flag}`);
  }

  if (unmatched.length) {
    console.log(`\n⚠ ${unmatched.length} halaqah bermasalah:`);
    for (const u of unmatched.slice(0, 20)) console.log(`   - ${u}`);
  }
  console.log(`\nTotal baris kaldik: ${totalRows}`);

  if (!CONFIRM) { console.log('\n(DRY-RUN — tak menulis. Tambah --confirm untuk apply ke prod.)\n'); return; }
  if (unmatched.length) { console.error('\n❌ Ada halaqah bermasalah — batalkan write. Perbaiki dulu.'); process.exit(1); }
  if (!values.length) { console.log('Tak ada baris untuk ditulis.'); return; }

  const insert =
    `insert into hits_kaldik_hari (batch_id, level, tanggal, hari, pekan, is_libur, source) values ` +
    values.join(',') +
    ` on conflict (batch_id, level, tanggal) do nothing`;
  const res = await api(insert, true);
  if (res.committed) console.log(`\n✅ COMMITTED — ${res.rowCount} baris kaldik masuk.\n`);
  else console.log(`\n⚠ Belum ter-commit: ${JSON.stringify(res).slice(0, 300)}\n`);
}

main().catch((e) => { console.error('✗', e instanceof Error ? e.message : String(e)); process.exit(1); });
