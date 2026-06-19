/**
 * Seed halaqah + peserta HITS dari file presensi xlsx yang sudah diupload.
 *
 *   npm run seed-hits-presensi
 *
 * Membaca "Presensi-Penilaian HITS 202604_Ikhwan (1).xlsx" (1 tab = 1 halaqah),
 * pakai parser presensi yang sama dengan sync Google Sheets (parsePresensiTab),
 * lalu upsert 1 batch + ~24 halaqah + ~230 peserta (source='manual').
 *
 * level dibiarkan null (kaldik belum diupload) — koordinator tag via Validasi.
 * Re-run aman: semua upsert (onConflict).
 */
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parsePresensiTab } from '../src/lib/hits-presensi-parse';
import { batchSlug } from '../src/lib/hits';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const XLSX_FILE = join(__dirname, '..', 'Presensi-Penilaian HITS 202604_Ikhwan (1).xlsx');

const BATCH_NAME = 'HITS Online April 2026';
const BATCH_START = '2026-04-01';
const GENDER = 'ikhwan' as const;

const SKIP_TABS = new Set([
  'Raw', 'Kuota Tersedia', 'Ref', 'PVT', 'Keterangan Pengisian', 'Sheet40', 'grafik', 'z',
]);

// Ambil teks dari cell exceljs (string | number | richText | hyperlink | formula).
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join('');
    }
    if (typeof o.text === 'string') return o.text;
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

// Worksheet -> CSV (kolom 1..8 cukup: NO..STATUS PESERTA) untuk parsePresensiTab.
function sheetToCsv(ws: ExcelJS.Worksheet): string {
  const lines: string[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= 8; c++) cells.push(csvCell(cellText(row.getCell(c).value)));
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

function stripGelar(name: string): string {
  return name.replace(/^\s*(ustadz(ah)?|ust\.?)\s+/i, '').trim();
}

async function main() {
  console.log(`\n📖 Baca ${XLSX_FILE}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_FILE);

  // ── Batch ──
  const slug = batchSlug(BATCH_NAME);
  const { data: batch, error: bErr } = await supabaseAdmin
    .from('hits_batch')
    .upsert({ name: BATCH_NAME, slug, start_date: BATCH_START, active: true }, { onConflict: 'slug' })
    .select('id')
    .single();
  if (bErr) throw bErr;
  const batchId = batch.id;
  console.log(`✓ Batch "${BATCH_NAME}" (${batchId})`);

  // ── Peta nama pengajar -> id (scope gender) untuk best-effort link ──
  const { data: pengajarRows } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender')
    .eq('gender', GENDER);
  const pengajarByName = new Map<string, string>();
  for (const p of pengajarRows ?? []) {
    pengajarByName.set(p.name.toLowerCase().replace(/\s+/g, ' ').trim(), p.id);
  }

  let totalHalaqah = 0;
  let totalPeserta = 0;
  let linkedPengajar = 0;

  for (const ws of wb.worksheets) {
    if (SKIP_TABS.has(ws.name)) continue;
    const parsed = parsePresensiTab(sheetToCsv(ws));
    if (!parsed) {
      console.log(`  ⚠ Skip tab "${ws.name}" (tak ada NAMA HALAQAH/peserta)`);
      continue;
    }

    // Link pengajar via nama (tanpa gelar).
    let pengajarId: string | null = null;
    if (parsed.pengajar_nama_sheet) {
      const key = stripGelar(parsed.pengajar_nama_sheet).toLowerCase().replace(/\s+/g, ' ').trim();
      pengajarId = pengajarByName.get(key) ?? null;
      if (pengajarId) linkedPengajar++;
    }

    const { data: halaqah, error: hErr } = await supabaseAdmin
      .from('hits_halaqah')
      .upsert(
        {
          batch_id: batchId,
          name: parsed.name,
          jadwal_raw: parsed.jadwal_raw,
          jadwal_hari: parsed.jadwal_hari,
          waktu_mulai: parsed.waktu_mulai,
          waktu_selesai: parsed.waktu_selesai,
          gender: parsed.gender ?? GENDER,
          pengajar_nama_sheet: parsed.pengajar_nama_sheet,
          pengajar_id: pengajarId,
          source: 'manual',
          active: true,
        },
        { onConflict: 'batch_id,name' }
      )
      .select('id')
      .single();
    if (hErr) throw hErr;
    const halaqahId = halaqah.id;

    const pesertaRows = parsed.peserta
      .filter((p) => p.murid_id)
      .map((p) => ({
        halaqah_id: halaqahId,
        murid_id: p.murid_id,
        nama: p.nama,
        jenis_kelamin: p.jenis_kelamin,
        status_peserta: p.status_peserta,
        source: 'manual' as const,
        active: true,
      }));
    if (pesertaRows.length) {
      const { error: pErr } = await supabaseAdmin
        .from('hits_halaqah_peserta')
        .upsert(pesertaRows, { onConflict: 'halaqah_id,murid_id' });
      if (pErr) throw pErr;
    }

    totalHalaqah++;
    totalPeserta += pesertaRows.length;
    console.log(
      `  ✓ ${parsed.name.padEnd(28)} guru=${(parsed.pengajar_nama_sheet ?? '—').slice(0, 28).padEnd(28)} ${pesertaRows.length} peserta${pengajarId ? ' [linked]' : ''}`
    );
  }

  console.log('\n' + '='.repeat(52));
  console.log(`✅ Seed selesai: ${totalHalaqah} halaqah, ${totalPeserta} peserta, ${linkedPengajar} pengajar ter-link`);
  console.log('='.repeat(52));
  console.log('Buka /hits/koordinator untuk lihat. Tag level via /hits/koordinator/validasi.');
}

main().catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
