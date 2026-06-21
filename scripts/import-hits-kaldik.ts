/**
 * Import kaldik HITS (hits_kaldik_hari) supaya derivasi pertemuan & trigger
 * observasi harian jalan.
 *
 *   npm run import-hits-kaldik
 *
 * Sumber:
 *   - Januari & April: file "Kalender HITS 2025 - 2026 (2).xlsx" (2 blok/sheet:
 *     kiri QOIDAH NURONIYYAH=Dasar, kanan PERBAIKAN BACAAN=Lanjutan).
 *   - Juni: digenerate (tak ada di file) — pekan-1 Senin = 2026-06-22, pola
 *     mingguan sama (13 pekan Qoidah, 12 pekan Perbaikan), tanpa libur.
 *
 * Map level: QOIDAH → qoidah_nuroniyyah, PERBAIKAN → perbaikan_bacaan.
 * Upsert onConflict (batch_id, level, tanggal). Re-run aman.
 */
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { HitsLevel } from '../src/types/db';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const KALDIK_FILE = join(__dirname, '..', 'Kalender HITS 2025 - 2026 (2).xlsx');

const HARI_ID = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

type KaldikRow = { level: HitsLevel; tanggal: string; hari: string; pekan: number; is_libur: boolean };

function isoDate(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) {
    // exceljs membaca date sebagai UTC midnight — ambil bagian tanggalnya.
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}
function cellNum(v: ExcelJS.CellValue): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
}
function weekdayId(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return HARI_ID[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Parse satu blok (kiri/kanan) sebuah sheet kaldik. */
function parseBlock(ws: ExcelJS.Worksheet, level: HitsLevel, cTanggal: number, cPekan: number, cKet: number): KaldikRow[] {
  const rows: KaldikRow[] = [];
  let pekan: number | null = null;
  let liburActive = false;
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const tgl = isoDate(row.getCell(cTanggal).value);
    const pkRaw = row.getCell(cPekan).value;
    const pkNum = cellNum(pkRaw);
    const pkStr = cellStr(pkRaw);
    const ket = cellStr(row.getCell(cKet).value);

    if (pkNum != null) {
      pekan = pkNum;
      liburActive = false;
    } else if (/libur/i.test(pkStr) || /libur/i.test(ket)) {
      liburActive = true;
    }
    if (!tgl || pekan == null) continue;
    const liburRow = liburActive || /libur/i.test(ket);
    rows.push({ level, tanggal: tgl, hari: weekdayId(tgl), pekan, is_libur: liburRow });
  }
  return rows;
}

function generateJuni(level: HitsLevel, pekanCount: number): KaldikRow[] {
  // pekan-1 Senin = 2026-06-22, minggu berurutan tanpa libur.
  const start = Date.UTC(2026, 5, 22); // 2026-06-22
  const out: KaldikRow[] = [];
  for (let p = 1; p <= pekanCount; p++) {
    for (let dofs = 0; dofs < 7; dofs++) {
      const t = new Date(start + ((p - 1) * 7 + dofs) * 86400000);
      const iso = t.toISOString().slice(0, 10);
      out.push({ level, tanggal: iso, hari: weekdayId(iso), pekan: p, is_libur: false });
    }
  }
  return out;
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const dow = new Date(base).getUTCDay(); // Sun=0..Sat=6
  const off = (dow + 6) % 7; // jarak ke Senin
  return new Date(base - off * 86400000).toISOString().slice(0, 10);
}

/**
 * Generate kaldik Khusus mulai 2026-01-26, 13 pekan aktif, MELEWATI minggu yang
 * libur di kalender reguler Januari (pakai pola libur reguler, bukan Safar).
 * Minggu libur reguler = minggu (dlm rentang reguler) yg tak punya tanggal aktif.
 */
function generateKhusus(regulerQoidahDates: string[], level: HitsLevel, pekanCount: number): KaldikRow[] {
  const activeMon = new Set(regulerQoidahDates.map(mondayOf));
  const lastMon = [...activeMon].sort().at(-1) ?? '2026-06-07';
  const out: KaldikRow[] = [];
  let cursor = Date.UTC(2026, 0, 26); // Senin 2026-01-26
  let pekan = 0;
  let guard = 0;
  while (pekan < pekanCount && guard++ < 60) {
    const monIso = new Date(cursor).toISOString().slice(0, 10);
    const liburWeek = monIso <= lastMon && !activeMon.has(monIso);
    if (!liburWeek) {
      pekan++;
      for (let dofs = 0; dofs < 7; dofs++) {
        const iso = new Date(cursor + dofs * 86400000).toISOString().slice(0, 10);
        out.push({ level, tanggal: iso, hari: weekdayId(iso), pekan, is_libur: false });
      }
    }
    cursor += 7 * 86400000;
  }
  return out;
}

async function batchId(slug: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from('hits_batch').select('id').eq('slug', slug).single();
  if (error) throw new Error(`Batch ${slug}: ${error.message}`);
  return data.id;
}

async function upsertKaldik(batch: string, rows: KaldikRow[], label: string) {
  if (!rows.length) { console.log(`  – ${label}: kosong`); return; }
  const payload = rows.map((r) => ({
    batch_id: batch,
    level: r.level,
    tanggal: r.tanggal,
    hari: r.hari,
    pekan: r.pekan,
    is_libur: r.is_libur,
    source: 'manual' as const,
  }));
  const { error } = await supabaseAdmin.from('hits_kaldik_hari').upsert(payload, { onConflict: 'batch_id,level,tanggal' });
  if (error) throw error;
  const pekanMax = Math.max(...rows.map((r) => r.pekan));
  const libur = rows.filter((r) => r.is_libur).length;
  console.log(`  ✓ ${label}: ${rows.length} hari, ${pekanMax} pekan, ${libur} libur (${rows[0].tanggal} → ${rows[rows.length - 1].tanggal})`);
}

async function main() {
  console.log('\n📅 Import kaldik HITS\n');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(KALDIK_FILE);

  const sheetJan = wb.worksheets.find((w) => /Januari 2/i.test(w.name) && /Offline & Online/i.test(w.name));
  const sheetApr = wb.worksheets.find((w) => /OnlineOffline April 2026/i.test(w.name));
  if (!sheetJan || !sheetApr) throw new Error('Sheet Januari/April tidak ditemukan.');

  // ── Januari ──
  const jan = await batchId('hits-online-januari-2026');
  console.log('Batch Januari 2026:');
  await upsertKaldik(jan, parseBlock(sheetJan, 'qoidah_nuroniyyah', 4, 5, 7), 'qoidah_nuroniyyah (Dasar)');
  await upsertKaldik(jan, parseBlock(sheetJan, 'perbaikan_bacaan', 12, 13, 14), 'perbaikan_bacaan (Lanjutan)');

  // ── April ──
  const apr = await batchId('hits-online-april-2026');
  console.log('Batch April 2026:');
  await upsertKaldik(apr, parseBlock(sheetApr, 'qoidah_nuroniyyah', 4, 5, 7), 'qoidah_nuroniyyah (Dasar)');
  await upsertKaldik(apr, parseBlock(sheetApr, 'perbaikan_bacaan', 12, 13, 14), 'perbaikan_bacaan (Lanjutan)');

  // ── Juni (generate, pekan-1 = 2026-06-22) ──
  const jun = await batchId('hits-online-juni-2026');
  console.log('Batch Juni 2026 (generate, mulai 2026-06-22):');
  await upsertKaldik(jun, generateJuni('qoidah_nuroniyyah', 13), 'qoidah_nuroniyyah (Dasar)');
  await upsertKaldik(jun, generateJuni('perbaikan_bacaan', 12), 'perbaikan_bacaan (Lanjutan)');

  // ── Safar (dari sheet HITS Safar Januari 2026) ──
  const sheetSafar = wb.worksheets.find((w) => /Safar Januari 2026/i.test(w.name));
  if (!sheetSafar) throw new Error('Sheet Safar tidak ditemukan.');
  const safar = await batchId('hits-safar-januari-2026');
  console.log('Batch Safar Januari 2026:');
  await upsertKaldik(safar, parseBlock(sheetSafar, 'qoidah_nuroniyyah', 4, 5, 7), 'qoidah_nuroniyyah (Dasar)');
  await upsertKaldik(safar, parseBlock(sheetSafar, 'perbaikan_bacaan', 12, 13, 14), 'perbaikan_bacaan (Lanjutan)');

  // ── Khusus (generate 26 Jan, libur pola reguler Januari) ──
  const regulerQoidah = parseBlock(sheetJan, 'qoidah_nuroniyyah', 4, 5, 7).map((r) => r.tanggal);
  const khusus = await batchId('hits-reguler-januari-khusus-2026');
  console.log('Batch Reguler Januari Khusus 2026 (generate, mulai 2026-01-26, libur reguler):');
  await upsertKaldik(khusus, generateKhusus(regulerQoidah, 'qoidah_nuroniyyah', 13), 'qoidah_nuroniyyah (Dasar)');

  console.log('\n✅ Selesai.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
