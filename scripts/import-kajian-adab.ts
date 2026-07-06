// Migrasi historis presensi Kajian Adab dari xlsx Akhwat → hits_kajian_presensi.
// Jalankan sekali: npx tsx --env-file=.env.local scripts/import-kajian-adab.ts
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { dayIndexOf } from '../src/lib/maahir-presensi';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const FILES = [
  'Observasi HITS Januari Akhwat .xlsx',
  'Observasi HITS April Akhwat .xlsx',
  'Observasi HITS JUNI 2025_AKHWAT.xlsx',
];
const SHEET = 'Presensi Kajian Adab';
const STATUS_MAP: Record<string, string> = { H: 'Hadir', T: 'Terlambat', I: 'Izin', S: 'Sakit', A: 'Alpa' };
const DRY_RUN = process.env.KAJIAN_DRY_RUN === '1';

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Derive tanggal Minggu per kolom via anchor teks dd/mm (atau Date cell) + step 7 hari. */
function resolveDates(headerRow: ExcelJS.Row, firstDataCol: number, lastCol: number, year: number): Map<number, string> {
  let anchorCol = -1, anchorMs = 0;
  for (let c = firstDataCol; c <= lastCol; c++) {
    const v = headerRow.getCell(c).value;
    let ms = 0;
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d{1,2})[/-](\d{1,2})/);
      if (m) { const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]))); if (dayIndexOf(isoDate(d)) === 0) ms = d.getTime(); }
    } else if (v instanceof Date) {
      const d = new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
      if (dayIndexOf(isoDate(d)) === 0) ms = d.getTime();
    }
    if (ms) { anchorCol = c; anchorMs = ms; break; }
  }
  if (anchorCol < 0) throw new Error('anchor tanggal Minggu tak ditemukan di header');
  const out = new Map<number, string>();
  for (let c = firstDataCol; c <= lastCol; c++) {
    const ms = anchorMs + (c - anchorCol) * 7 * 86_400_000;
    const iso = isoDate(new Date(ms));
    if (dayIndexOf(iso) === 0) out.set(c, iso);
  }
  return out;
}

async function halaqahKetuaMap(): Promise<Map<string, string>> {
  const { data } = await admin.from('ketua_kelas')
    .select('whatsapp_number, hits_halaqah:hits_halaqah_id(name)').eq('active', true).not('whatsapp_number', 'is', null);
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    const wa = (r as { whatsapp_number: string }).whatsapp_number;
    const name = (r as unknown as { hits_halaqah: { name: string } | null }).hits_halaqah?.name;
    if (wa && name) map.set(String(name).toLowerCase().replace(/\s+/g, ''), wa);
  }
  return map;
}

async function main() {
  const hkMap = await halaqahKetuaMap();
  console.log(`halaqah→ketua terpetakan: ${hkMap.size}`);
  let skippedNoKetua = 0;
  const upserts: { ketua_wa: string; tanggal: string; status: string }[] = [];

  for (const file of FILES) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet(SHEET);
    if (!ws) { console.log('SKIP (no sheet):', file); continue; }
    const year = /juni 2025/i.test(file) ? 2025 : 2026;
    const header = ws.getRow(2);
    const dates = resolveDates(header, 4, ws.columnCount, year);
    console.log(`${file}: ${dates.size} kolom Minggu (${[...dates.values()][0]} .. ${[...dates.values()].slice(-1)[0]})`);

    for (let r = 3; r <= ws.rowCount; r++) {
      const halaqah = String(ws.getRow(r).getCell(2).value ?? '').toLowerCase().replace(/\s+/g, '');
      if (!halaqah) continue;
      const wa = hkMap.get(halaqah);
      if (!wa) { skippedNoKetua++; continue; }
      for (const [col, tgl] of dates) {
        const raw = String(ws.getRow(r).getCell(col).value ?? '').trim().toUpperCase();
        const status = STATUS_MAP[raw];
        if (!status) continue;
        upserts.push({ ketua_wa: wa, tanggal: tgl, status });
      }
    }
  }

  console.log(`\nTotal baris presensi: ${upserts.length}, halaqah-baris tanpa ketua: ${skippedNoKetua}`);
  if (DRY_RUN) { console.log('DRY_RUN=1 → tidak upsert. Contoh 5:', upserts.slice(0, 5)); return; }

  let done = 0;
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500);
    const { error } = await admin.from('hits_kajian_presensi').upsert(chunk, { onConflict: 'ketua_wa,tanggal' });
    if (error) { console.error('upsert error', error.message); process.exit(1); }
    done += chunk.length;
  }
  console.log(`\nDONE. upsert=${done}`);
}
main();
