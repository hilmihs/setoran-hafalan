/**
 * Import roster halaqah + peserta HITS dari file docs/ (xlsx presensi + pdf daftar peserta baru).
 *
 *   npm run import-hits-docs
 *
 * Sumber & derivasi (lihat SOURCES di bawah):
 *   - xlsx Januari 2026 (Dasar)  → batch Jan,  level qoidah_nuroniyyah, sheet "Raw".
 *   - xlsx April  2026 (202604)  → batch Apr,  Raw #REF! → agregasi tab per-pengajar + dedup MURID_ID,
 *                                   level per-halaqah (prefix "Lanjutan_" → perbaikan_bacaan, else qoidah_nuroniyyah).
 *   - pdf  Juni   2026 Dasar/Lanjutan × Ikhwan/Akhwat → batch Jun, level per file, parse via `pdftotext -layout`.
 *
 * Level mapping: Dasar → qoidah_nuroniyyah, Lanjutan → perbaikan_bacaan (tanpa migration/relabel).
 * Scope: roster saja (batch + halaqah + peserta). Presensi/penilaian TIDAK diimport.
 * Pengajar: link by WA (pdf) → fallback nama tanpa gelar; provision akun baru dari nama+WA (pdf) bila belum ada.
 * Re-run aman: semua upsert (onConflict). Halaqah existing yang tak ada di file tidak disentuh.
 */
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseJadwal } from '../src/lib/hits-presensi-parse';
import { batchSlug } from '../src/lib/hits';
import { normalizeWhatsApp } from '../src/lib/whatsapp';
import type { Gender, HitsLevel } from '../src/types/db';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, '..', 'docs');

// ── Definisi batch ──────────────────────────────────────────────
const BATCHES = {
  jan: { name: 'HITS Online Januari 2026', start: '2026-01-01' },
  apr: { name: 'HITS Online April 2026', start: '2026-04-01' },
  jun: { name: 'HITS Online Juni 2026', start: '2026-06-01' },
  safar: { name: 'HITS Safar Januari 2026', start: '2026-01-26' },
  khusus: { name: 'HITS Reguler Januari Khusus 2026', start: '2026-01-26' },
} as const;

type BatchKey = keyof typeof BATCHES;
type LevelMode = HitsLevel | 'per-halaqah';

type XlsxSource = {
  kind: 'xlsx';
  file: string;
  batch: BatchKey;
  gender: Gender;
  level: LevelMode;
};
type PdfSource = {
  kind: 'pdf';
  file: string;
  batch: BatchKey;
  gender: Gender;
  level: HitsLevel;
};
type Source = XlsxSource | PdfSource;

const SOURCES: Source[] = [
  { kind: 'xlsx', file: 'Presensi-Penilaian HITS Dasar_202601_Ikhwan.xlsx', batch: 'jan', gender: 'ikhwan', level: 'qoidah_nuroniyyah' },
  { kind: 'xlsx', file: 'Presensi-Penilaian HITS Dasar_202601_Akhwat (1).xlsx', batch: 'jan', gender: 'akhwat', level: 'qoidah_nuroniyyah' },
  { kind: 'xlsx', file: 'Presensi-Penilaian HITS 202604_Akhwat (3).xlsx', batch: 'apr', gender: 'akhwat', level: 'per-halaqah' },
  { kind: 'pdf', file: 'DAFTAR PESERTA BARU HITS DASAR JUNI 2026_18062026 - PENGAJAR IKHWAN.pdf', batch: 'jun', gender: 'ikhwan', level: 'qoidah_nuroniyyah' },
  { kind: 'pdf', file: 'DAFTAR PESERTA BARU HITS LANJUTAN JUNI 2026_18062026 - PENGAJAR IKHWAN.pdf', batch: 'jun', gender: 'ikhwan', level: 'perbaikan_bacaan' },
  { kind: 'pdf', file: 'DAFTAR PESERTA BARU HITS DASAR JUNI 2026_18062026 - PENGAJAR AKHWAT.pdf', batch: 'jun', gender: 'akhwat', level: 'qoidah_nuroniyyah' },
  { kind: 'pdf', file: 'DAFTAR PESERTA BARU HITS LANJUTAN JUNI 2026_18062026 - PENGAJAR AKHWAT.pdf', batch: 'jun', gender: 'akhwat', level: 'perbaikan_bacaan' },
  { kind: 'xlsx', file: 'Presensi-Penilaian SAFAR 202602_Ikhwan_Dasar.xlsx', batch: 'safar', gender: 'ikhwan', level: 'qoidah_nuroniyyah' },
  { kind: 'xlsx', file: 'Presensi-Penilaian SAFAR 202602_Akhwat_Dasar.xlsx', batch: 'safar', gender: 'akhwat', level: 'qoidah_nuroniyyah' },
  { kind: 'xlsx', file: 'Presensi-Penilaian HITS_202601_Khusus_Ikhwan_QN.xlsx', batch: 'khusus', gender: 'ikhwan', level: 'qoidah_nuroniyyah' },
  { kind: 'xlsx', file: 'Presensi-Penilaian HITS_202601_Khusus_Akhwat_QN.xlsx', batch: 'khusus', gender: 'akhwat', level: 'qoidah_nuroniyyah' },
];

// Nama halaqah invalid (artefak spreadsheet).
function isBadHalaqah(name: string): boolean {
  return !name || name.startsWith('#') || /^(N\/A|REF!?)$/i.test(name);
}

// Tab xlsx yang bukan data peserta.
const SKIP_TABS = new Set(
  ['raw', 'copy of raw', 'ref', 'cond', 'kuota tersedia', 'keterangan pengisian', 'grafik', 'pvt', 'sheet40', 'z']
);

// ── Tipe baris hasil parse (umum xlsx & pdf) ────────────────────
type ParsedHalaqah = {
  name: string;
  jadwal_raw: string | null;
  pengajar_nama: string | null;
  pengajar_wa: string | null; // hanya pdf
  level: HitsLevel;
  peserta: { murid_id: string; nama: string; jenis_kelamin: string | null; status_peserta: string | null }[];
};

// ── Helpers ─────────────────────────────────────────────────────
function stripGelar(name: string): string {
  return name.replace(/^\s*(ustadz(ah)?|ust\.?)\s+/i, '').trim();
}
function nameKey(name: string): string {
  return stripGelar(name).toLowerCase().replace(/\s+/g, ' ').trim();
}
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if (typeof o.text === 'string') return o.text;
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
}
function levelForHalaqah(src: Source, halaqahName: string): HitsLevel {
  if (src.level === 'per-halaqah') {
    return /^lanjutan[_\s]/i.test(halaqahName.trim()) ? 'perbaikan_bacaan' : 'qoidah_nuroniyyah';
  }
  return src.level as HitsLevel;
}

// ── Parse xlsx → halaqah[] ──────────────────────────────────────
const XLSX_HEADERS = {
  jk: 'JENIS KELAMIN', hal: 'NAMA HALAQAH', jadwal: 'JADWAL BELAJAR',
  guru: 'NAMA GURU', mid: 'MURID_ID', nama: 'NAMA LENGKAP', status: 'STATUS PESERTA',
};

async function parseXlsx(src: XlsxSource): Promise<ParsedHalaqah[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(DOCS, src.file));

  // Kumpulkan baris peserta: coba sheet "Raw" dulu; kalau kosong/#REF!, agregasi tab non-meta.
  type Row = { jk: string; hal: string; jadwal: string; guru: string; mid: string; nama: string; status: string };
  const collect = (ws: ExcelJS.Worksheet, into: Row[]) => {
    let idx: Record<string, number> | null = null;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= 12; c++) cells.push(cellText(row.getCell(c).value).trim());
      if (!idx) {
        if (cells.includes(XLSX_HEADERS.hal) && cells.includes(XLSX_HEADERS.mid)) {
          idx = {
            jk: cells.indexOf(XLSX_HEADERS.jk), hal: cells.indexOf(XLSX_HEADERS.hal),
            jadwal: cells.indexOf(XLSX_HEADERS.jadwal), guru: cells.indexOf(XLSX_HEADERS.guru),
            mid: cells.indexOf(XLSX_HEADERS.mid), nama: cells.indexOf(XLSX_HEADERS.nama),
            status: cells.indexOf(XLSX_HEADERS.status),
          };
        }
        continue;
      }
      const ix = idx as Record<string, number>;
      const at = (k: string) => (ix[k] >= 0 && ix[k] < cells.length ? cells[ix[k]] : '');
      const mid = at('mid');
      const hal = at('hal');
      if (!mid || mid === '#REF!' || !hal || isBadHalaqah(hal)) continue;
      into.push({ jk: at('jk'), hal, jadwal: at('jadwal'), guru: at('guru'), mid, nama: at('nama'), status: at('status') });
    }
  };

  let rows: Row[] = [];
  const rawSheet = wb.worksheets.find((w) => w.name.toLowerCase() === 'raw');
  if (rawSheet) collect(rawSheet, rows);
  if (rows.length === 0) {
    for (const ws of wb.worksheets) {
      if (SKIP_TABS.has(ws.name.toLowerCase())) continue;
      collect(ws, rows);
    }
  }

  // Group by NAMA HALAQAH; dedup peserta by MURID_ID (penting untuk agregasi 202604).
  const byHalaqah = new Map<string, ParsedHalaqah>();
  const seenMid = new Map<string, Set<string>>(); // halaqahName -> mid set
  for (const row of rows) {
    let h = byHalaqah.get(row.hal);
    if (!h) {
      h = {
        name: row.hal,
        jadwal_raw: row.jadwal || null,
        pengajar_nama: row.guru ? stripGelar(row.guru) : null,
        pengajar_wa: null,
        level: levelForHalaqah(src, row.hal),
        peserta: [],
      };
      byHalaqah.set(row.hal, h);
      seenMid.set(row.hal, new Set());
    }
    const seen = seenMid.get(row.hal)!;
    if (seen.has(row.mid)) continue;
    seen.add(row.mid);
    h.peserta.push({
      murid_id: row.mid,
      nama: row.nama,
      jenis_kelamin: row.jk || null,
      status_peserta: row.status || null,
    });
  }
  return [...byHalaqah.values()];
}

// ── Parse pdf via pdftotext -layout → halaqah[] ─────────────────
async function parsePdf(src: PdfSource): Promise<ParsedHalaqah[]> {
  const txt = execFileSync('pdftotext', ['-layout', join(DOCS, src.file), '-'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const genderTok = src.gender === 'ikhwan' ? 'IKHWAN' : 'AKHWAT';
  // Anchor baris pada token halaqah "HITS <no> <GENDER> JUNI".
  const halaqahRe = new RegExp(`HITS\\s+\\d+\\s+${genderTok}\\s+JUNI`, 'i');
  const midRe = /\b([IA]2606\d{4})\b/;
  const waMeRe = /https?:\/\/wa\.me\/\S+/i;

  const byHalaqah = new Map<string, ParsedHalaqah>();
  const seenMid = new Map<string, Set<string>>();

  for (const rawLine of txt.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    const midM = line.match(midRe);
    const halM = line.match(halaqahRe);
    if (!midM || !halM) continue;
    const murid_id = midM[1];
    // Nama halaqah; level Lanjutan diprefix agar tak bentrok dengan Dasar yang
    // kadang pakai nomor halaqah sama (mis. "HITS 037 IKHWAN JUNI" ada di Dasar & Lanjutan,
    // guru sama tapi peserta beda). Unique key DB = (batch_id, name).
    const baseName = halM[0].toUpperCase().replace(/\s+/g, ' ');
    const halaqahName = src.level === 'perbaikan_bacaan' ? `Lanjutan ${baseName}` : baseName;

    // Segmen: [NO MURID_ID NAMA] [WA] [wa.me link] [PENGAJAR] [HALAQAH] [JADWAL]
    const beforeMid = line.slice(0, midM.index!);
    const afterMid = line.slice(midM.index! + murid_id.length);

    // Nama = teks setelah murid_id sampai token WA (deret digit panjang) atau wa.me.
    const waNumM = afterMid.match(/\b\d{8,}\b/);
    const nama = afterMid.slice(0, waNumM ? waNumM.index! : afterMid.search(waMeRe))
      .replace(/\s+/g, ' ').trim();

    // Pengajar = antara wa.me link dan token halaqah.
    const waMeM = line.match(waMeRe);
    const halIdx = halM.index!;
    let pengajar_nama: string | null = null;
    if (waMeM) {
      const linkEnd = waMeM.index! + waMeM[0].length;
      pengajar_nama = line.slice(linkEnd, halIdx).replace(/\s+/g, ' ').trim() || null;
    }
    // Jadwal = setelah token halaqah.
    const jadwal_raw = line.slice(halIdx + halM[0].length).replace(/\s+/g, ' ').trim() || null;
    // WA peserta (kolom NO WHATSAPP) — bukan dipakai untuk pengajar; abaikan (roster scope).
    void beforeMid; void waNumM;

    let h = byHalaqah.get(halaqahName);
    if (!h) {
      h = {
        name: halaqahName,
        jadwal_raw,
        pengajar_nama: pengajar_nama ? stripGelar(pengajar_nama) : null,
        pengajar_wa: null,
        level: src.level,
        peserta: [],
      };
      byHalaqah.set(halaqahName, h);
      seenMid.set(halaqahName, new Set());
    }
    const seen = seenMid.get(halaqahName)!;
    if (!seen.has(murid_id)) {
      seen.add(murid_id);
      h.peserta.push({
        murid_id,
        nama,
        jenis_kelamin: src.gender === 'ikhwan' ? 'Laki-Laki' : 'Perempuan',
        status_peserta: 'Aktif',
      });
    }
  }
  return [...byHalaqah.values()];
}

// ── Pengajar WA dari pdf (nama pengajar -> wa) ──────────────────
// Dibangun terpisah karena baris pdf berisi WA peserta, bukan WA pengajar.
// Sumber WA pengajar tidak ada di docs → provision tetap butuh WA; bila tak ada,
// pengajar dibiarkan null (dilaporkan). Lihat catatan plan.

async function main() {
  console.log('\n📦 Import HITS docs → DB (roster only)\n');

  // 1) Upsert batch
  const batchId: Record<BatchKey, string> = {} as Record<BatchKey, string>;
  for (const key of Object.keys(BATCHES) as BatchKey[]) {
    const b = BATCHES[key];
    const slug = batchSlug(b.name);
    const { data, error } = await supabaseAdmin
      .from('hits_batch')
      .upsert({ name: b.name, slug, start_date: b.start, active: true }, { onConflict: 'slug' })
      .select('id')
      .single();
    if (error) throw error;
    batchId[key] = data.id;
    console.log(`✓ Batch ${b.name} (${slug})`);
  }

  // 2) Peta pengajar existing per gender: byWa + byName
  const pengajarByWa = new Map<string, string>();
  const pengajarByName: Record<Gender, Map<string, string>> = { ikhwan: new Map(), akhwat: new Map() };
  {
    const { data: rows, error } = await supabaseAdmin
      .from('pengajar')
      .select('id, name, gender, whatsapp_number, active');
    if (error) throw error;
    for (const p of rows ?? []) {
      if (p.whatsapp_number) pengajarByWa.set(normalizeWhatsApp(p.whatsapp_number), p.id);
      const g = (p.gender as Gender) ?? 'ikhwan';
      pengajarByName[g]?.set(nameKey(p.name), p.id);
    }
  }
  // placeholder kelompok_pengajar per gender (untuk provision)
  const kelompokId: Partial<Record<Gender, string>> = {};
  async function ensureKelompok(gender: Gender): Promise<string> {
    if (kelompokId[gender]) return kelompokId[gender]!;
    const { data: k } = await supabaseAdmin
      .from('kelompok_pengajar').select('id').eq('gender', gender).limit(1).maybeSingle();
    if (k) { kelompokId[gender] = k.id; return k.id; }
    const { data: ins, error } = await supabaseAdmin
      .from('kelompok_pengajar').insert({ name: `Pengajar HITS ${gender}`, gender }).select('id').single();
    if (error) throw error;
    kelompokId[gender] = ins.id;
    return ins.id;
  }

  const report = {
    perBatch: {} as Record<BatchKey, { halaqah: number; peserta: number }>,
    linkedByName: 0,
    provisioned: [] as { name: string; wa: string; gender: Gender }[],
    unmatched: [] as { halaqah: string; guru: string; gender: Gender }[],
  };
  for (const key of Object.keys(BATCHES) as BatchKey[]) report.perBatch[key] = { halaqah: 0, peserta: 0 };

  // 3) Proses tiap source
  for (const src of SOURCES) {
    console.log(`\n── ${src.kind.toUpperCase()} ${src.file}`);
    const halaqahList = src.kind === 'xlsx' ? await parseXlsx(src) : await parsePdf(src);
    console.log(`   ${halaqahList.length} halaqah ditemukan`);

    for (const h of halaqahList) {
      // resolusi pengajar
      let pengajar_id: string | null = null;
      let pengajar_wa: string | null = h.pengajar_wa ? normalizeWhatsApp(h.pengajar_wa) : null;
      if (pengajar_wa && pengajarByWa.has(pengajar_wa)) {
        pengajar_id = pengajarByWa.get(pengajar_wa)!;
      } else if (h.pengajar_nama) {
        const byName = pengajarByName[src.gender]?.get(nameKey(h.pengajar_nama));
        if (byName) { pengajar_id = byName; report.linkedByName++; }
      }
      // provision bila punya WA tapi belum ada akun
      if (!pengajar_id && pengajar_wa && h.pengajar_nama) {
        const kelompok = await ensureKelompok(src.gender);
        const { data: p, error } = await supabaseAdmin
          .from('pengajar')
          .upsert(
            { name: h.pengajar_nama, gender: src.gender, whatsapp_number: pengajar_wa, password_hash: '', kelompok_id: kelompok, active: true },
            { onConflict: 'whatsapp_number' }
          )
          .select('id').single();
        if (error) throw error;
        pengajar_id = p.id;
        pengajarByWa.set(pengajar_wa, p.id);
        pengajarByName[src.gender]?.set(nameKey(h.pengajar_nama), p.id);
        report.provisioned.push({ name: h.pengajar_nama, wa: pengajar_wa, gender: src.gender });
      }
      if (!pengajar_id && h.pengajar_nama) {
        report.unmatched.push({ halaqah: h.name, guru: h.pengajar_nama, gender: src.gender });
      }

      const jadwal = parseJadwal(h.jadwal_raw ?? '');
      const { data: halaqah, error: hErr } = await supabaseAdmin
        .from('hits_halaqah')
        .upsert(
          {
            batch_id: batchId[src.batch],
            name: h.name,
            jadwal_raw: h.jadwal_raw,
            jadwal_hari: jadwal.hari,
            waktu_mulai: jadwal.mulai,
            waktu_selesai: jadwal.selesai,
            gender: src.gender,
            level: h.level,
            program: h.level === 'perbaikan_bacaan' ? 'lanjutan' : 'dasar',
            pengajar_nama_sheet: h.pengajar_nama,
            pengajar_wa,
            pengajar_id,
            source: 'manual',
            active: true,
          },
          { onConflict: 'batch_id,name' }
        )
        .select('id').single();
      if (hErr) throw hErr;

      const pesertaRows = h.peserta.filter((p) => p.murid_id).map((p) => ({
        halaqah_id: halaqah.id,
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
      report.perBatch[src.batch].halaqah++;
      report.perBatch[src.batch].peserta += pesertaRows.length;
    }
  }

  // 4) Laporan
  console.log('\n══════════ RINGKASAN ══════════');
  for (const key of Object.keys(BATCHES) as BatchKey[]) {
    const r = report.perBatch[key];
    console.log(`  ${BATCHES[key].name.padEnd(26)} ${String(r.halaqah).padStart(3)} halaqah, ${String(r.peserta).padStart(4)} peserta`);
  }
  console.log(`\n  Pengajar linked by-name : ${report.linkedByName}`);
  console.log(`  Pengajar provisioned    : ${report.provisioned.length}`);
  for (const p of report.provisioned) console.log(`     + [${p.gender}] ${p.name} (${p.wa})`);
  console.log(`\n  ⚠ Pengajar TAK ter-link (butuh WA manual via /hits/koordinator/validasi): ${report.unmatched.length}`);
  const uniqUnmatched = new Map<string, { guru: string; gender: Gender; halaqah: string[] }>();
  for (const u of report.unmatched) {
    const k = `${u.gender}|${u.guru}`;
    if (!uniqUnmatched.has(k)) uniqUnmatched.set(k, { guru: u.guru, gender: u.gender, halaqah: [] });
    uniqUnmatched.get(k)!.halaqah.push(u.halaqah);
  }
  for (const u of uniqUnmatched.values()) {
    console.log(`     - [${u.gender}] ${u.guru}  (${u.halaqah.length} halaqah: ${u.halaqah.slice(0, 4).join(', ')}${u.halaqah.length > 4 ? '…' : ''})`);
  }
  console.log('\n✅ Selesai.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
