/**
 * Import data observasi HITS yang sudah terisi (backfill historis) ke
 * hits_keterangan_harian (multi-tahap), + import ketua kelas.
 *
 *   npm run import-hits-observasi
 *
 * Sumber: docs/"Observasi HITS Januari Akhwat .xlsx" (batch Jan) +
 *         docs/"Observasi HITS April Akhwat .xlsx" (batch April). Gender akhwat.
 *
 * Sheet "Observasi (...)": kolom 0..5 = No, Halaqah, Level, Pengajar, Jadwal,
 * WA Ketua; lalu pasangan kolom [Kondisi, Status Latihan] per pertemuan (pert-1
 * mulai kolom 6). Level per baris (QN/Qoidah → qoidah_nuroniyyah; PB/Perbaikan/
 * Lanjutan → perbaikan_bacaan).
 *
 * Match baris → hits_halaqah via (batch, gender akhwat, nameKey pengajar) +
 * pilih program sesuai level. Laporkan yang tak match. Re-run aman (upsert).
 */
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeWhatsApp } from '../src/lib/whatsapp';
import { deriveHalaqahProgram, PROGRAM_STAGES, type KaldikHariLite } from '../src/lib/hits-pertemuan';
import type { HitsKondisi, HitsLevel, HitsStatusLatihan } from '../src/types/db';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, '..', 'docs');

const FILES: { file: string; slug: string }[] = [
  { file: 'Observasi HITS Januari Akhwat .xlsx', slug: 'hits-online-januari-2026' },
  { file: 'Observasi HITS April Akhwat .xlsx', slug: 'hits-online-april-2026' },
];

const KONDISI = new Set<HitsKondisi>(['KBBS', 'KMT', 'JKG', 'KBLA', 'LIBUR']);
const STATUS = new Set<HitsStatusLatihan>(['TAL', 'PTML', 'SML']);

function stripGelar(s: string): string {
  return s.replace(/^\s*(ustadz(ah)?|ust\.?|ustad)\s+/i, '').trim();
}
function nameKey(s: string): string {
  return stripGelar(s).toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function cell(ws: ExcelJS.Worksheet, r: number, c: number): string {
  const v = ws.getRow(r).getCell(c).value;
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (o.result != null) return String(o.result);
    if (Array.isArray((o as { richText?: unknown }).richText)) {
      return ((o as { richText: { text: string }[] }).richText).map((t) => t.text).join('');
    }
    return '';
  }
  return String(v);
}
function rowLevel(text: string): HitsLevel {
  const t = text.toLowerCase();
  if (t.includes('perbaikan') || t.includes('lanjutan') || t.trim() === 'pb') return 'perbaikan_bacaan';
  return 'qoidah_nuroniyyah';
}
function statusToFlags(s: string): { latihan: boolean | null; status: HitsStatusLatihan | null; semua: boolean | null } {
  const v = s.trim().toUpperCase();
  if (v === 'TAL') return { latihan: false, status: 'TAL', semua: null };
  if (v === 'PTML') return { latihan: true, status: 'PTML', semua: false };
  if (v === 'SML') return { latihan: true, status: 'SML', semua: true };
  return { latihan: null, status: null, semua: null };
}

type HalaqahLite = { id: string; program: string; jadwalHari: string[]; pengajarKey: string };

async function main() {
  console.log('\n📥 Import observasi HITS (backfill)\n');

  const report = { keterangan: 0, ketua: 0, unmatchedRows: [] as string[], unmatchedKetua: [] as string[] };

  for (const { file, slug } of FILES) {
    console.log(`\n── ${file} (${slug})`);
    const { data: batch } = await supabaseAdmin.from('hits_batch').select('id').eq('slug', slug).single();
    if (!batch) { console.log('  ✗ batch tak ada'); continue; }

    // Peta pengajar → halaqah (akhwat) untuk batch ini.
    const { data: halaqahRows } = await supabaseAdmin
      .from('hits_halaqah')
      .select('id, program, jadwal_hari, pengajar_nama_sheet, pengajar_id, pengajar:pengajar_id(name)')
      .eq('batch_id', batch.id)
      .eq('gender', 'akhwat')
      .eq('active', true);
    const byPengajar = new Map<string, HalaqahLite[]>();
    for (const h of halaqahRows ?? []) {
      const lite: HalaqahLite = { id: h.id, program: h.program, jadwalHari: (h.jadwal_hari as string[]) ?? [], pengajarKey: '' };
      const names = [h.pengajar_nama_sheet, (h.pengajar as unknown as { name?: string } | null)?.name].filter(Boolean) as string[];
      for (const nm of names) {
        const k = nameKey(nm);
        if (!k) continue;
        const arr = byPengajar.get(k) ?? [];
        if (!arr.find((x) => x.id === h.id)) arr.push({ ...lite, pengajarKey: k });
        byPengajar.set(k, arr);
      }
    }

    // kaldik batch (semua tahap) → derivasi tanggal per halaqah (cache).
    const { data: kaldikList } = await supabaseAdmin
      .from('hits_kaldik_hari')
      .select('level, tanggal, pekan, is_libur')
      .eq('batch_id', batch.id);
    const kaldikByLevel = new Map<HitsLevel, KaldikHariLite[]>();
    for (const r of kaldikList ?? []) {
      const lv = r.level as HitsLevel;
      const arr = kaldikByLevel.get(lv) ?? [];
      arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
      kaldikByLevel.set(lv, arr);
    }
    const dateCache = new Map<string, Map<string, string>>(); // halaqahId → (level-no → tanggal)
    const dateOf = (h: HalaqahLite, level: HitsLevel, no: number): string | null => {
      let m = dateCache.get(h.id);
      if (!m) {
        m = new Map();
        const stages = PROGRAM_STAGES[h.program] ?? PROGRAM_STAGES.dasar;
        const kl = new Map<HitsLevel, KaldikHariLite[]>();
        for (const lv of stages) kl.set(lv, kaldikByLevel.get(lv) ?? []);
        for (const d of deriveHalaqahProgram(h.program, h.jadwalHari, kl, new Map())) {
          m.set(`${d.level}-${d.pertemuan_no}`, d.tanggal);
        }
        dateCache.set(h.id, m);
      }
      return m.get(`${level}-${no}`) ?? null;
    };

    const pickHalaqah = (pengajar: string, level: HitsLevel): HalaqahLite | null => {
      const key = nameKey(pengajar);
      let cands = byPengajar.get(key);
      if (!cands) {
        // fallback: cocokkan bila salah satu nama mengandung yang lain (nama terpotong).
        for (const [k, v] of byPengajar) {
          if (k.includes(key) || key.includes(k)) { cands = v; break; }
        }
      }
      if (!cands || cands.length === 0) return null;
      if (cands.length === 1) return cands[0];
      // disambiguasi by program: perbaikan→lanjutan dulu, qoidah→dasar dulu.
      const want = level === 'perbaikan_bacaan' ? 'lanjutan' : 'dasar';
      return cands.find((c) => c.program === want) ?? cands[0];
    };

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(DOCS, file));

    // ── Observasi sheets ──
    const obsSheets = wb.worksheets.filter((w) => /observasi/i.test(w.name));
    for (const ws of obsSheets) {
      // header di baris 2 (1-based), data dari baris 3. Kolom pertemuan mulai 7 (1-based).
      const headerRow = 2;
      const isHeader = cell(ws, headerRow, 2).toLowerCase().includes('halaqah');
      if (!isHeader) continue;
      // jumlah pertemuan = (kolom terisi - 6) / 2
      const maxCol = ws.columnCount;
      const maxPert = Math.floor((maxCol - 6) / 2);
      for (let r = 3; r <= ws.rowCount; r++) {
        const halaqahName = cell(ws, r, 2).trim();
        const pengajar = cell(ws, r, 4).trim();
        if (!pengajar || !halaqahName || /^#/.test(halaqahName)) continue;
        const levelText = cell(ws, r, 3);
        const level = rowLevel(levelText);
        const h = pickHalaqah(pengajar, level);
        if (!h) { report.unmatchedRows.push(`[${slug}] ${ws.name}: ${halaqahName} / ${pengajar}`); continue; }

        const rows: Record<string, unknown>[] = [];
        for (let p = 1; p <= maxPert; p++) {
          const kondCol = 6 + 2 * (p - 1) + 1; // 1-based: pert1 kondisi di kolom 7
          const kondRaw = cell(ws, r, kondCol).trim().toUpperCase();
          if (!kondRaw || !KONDISI.has(kondRaw as HitsKondisi)) continue;
          const kondisi = kondRaw as HitsKondisi;
          const statRaw = cell(ws, r, kondCol + 1);
          const isLibur = kondisi === 'LIBUR';
          const f = isLibur ? { latihan: null, status: null, semua: null } : statusToFlags(statRaw);
          rows.push({
            halaqah_id: h.id,
            level,
            pertemuan_no: p,
            tanggal: dateOf(h, level, p) ?? '1970-01-01', // tanggal kanonik dari kaldik
            kondisi,
            terlambat: false,
            latihan_diberikan: f.latihan,
            status_latihan: f.status && STATUS.has(f.status) ? f.status : null,
            semua_selesai: f.semua,
            catatan: null,
            diisi_by_role: 'koordinator_ketua_kelas',
            diisi_by_id: '00000000-0000-0000-0000-000000000000',
            editable: false,
          });
        }
        if (rows.length) {
          const { error } = await supabaseAdmin.from('hits_keterangan_harian').upsert(rows, { onConflict: 'halaqah_id,level,pertemuan_no' });
          if (error) { console.log(`  ⚠ ${halaqahName}: ${error.message}`); continue; }
          report.keterangan += rows.length;
        }
      }
    }

    // ── Data Ketua Kelas → ketua_kelas + is_ketua ──
    const ketuaSheet = wb.worksheets.find((w) => /data ketua/i.test(w.name));
    if (ketuaSheet) {
      for (let r = 4; r <= ketuaSheet.rowCount; r++) {
        const pengajar = cell(ketuaSheet, r, 3).trim();
        const ketuaNama = cell(ketuaSheet, r, 8).trim();
        const telp = cell(ketuaSheet, r, 9).trim();
        if (!pengajar || !ketuaNama || !telp) continue;
        const h = pickHalaqah(pengajar, 'qoidah_nuroniyyah');
        if (!h) { report.unmatchedKetua.push(`[${slug}] ${pengajar} / ${ketuaNama}`); continue; }
        const wa = normalizeWhatsApp(telp.replace(/\.0$/, ''));
        if (wa.length < 10) continue;

        // sudah ada ketua aktif utk halaqah? skip (jangan timpa).
        const { data: existing } = await supabaseAdmin
          .from('ketua_kelas').select('id').eq('hits_halaqah_id', h.id).eq('active', true).maybeSingle();
        if (existing) continue;

        const magicToken = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(wa.slice(-6), 12);
        const { error } = await supabaseAdmin.from('ketua_kelas').insert({
          name: ketuaNama, gender: 'akhwat', whatsapp_number: wa,
          hits_halaqah_id: h.id, magic_token: magicToken, password_hash: passwordHash, active: true,
        });
        if (!error) report.ketua += 1;
      }
    }
  }

  console.log('\n══════════ RINGKASAN ══════════');
  console.log(`  Keterangan ter-upsert : ${report.keterangan}`);
  console.log(`  Ketua kelas dibuat    : ${report.ketua}`);
  console.log(`  Baris observasi unmatched : ${report.unmatchedRows.length}`);
  for (const u of report.unmatchedRows.slice(0, 25)) console.log(`     - ${u}`);
  if (report.unmatchedRows.length > 25) console.log(`     … +${report.unmatchedRows.length - 25} lagi`);
  console.log(`  Ketua unmatched : ${report.unmatchedKetua.length}`);
  for (const u of report.unmatchedKetua.slice(0, 15)) console.log(`     - ${u}`);

  console.log('\n✅ Selesai.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
