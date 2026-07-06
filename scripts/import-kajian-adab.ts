// Migrasi historis presensi Kajian Adab dari xlsx Akhwat → hits_kajian_presensi.
// Jalankan sekali: npx tsx --env-file=.env.local scripts/import-kajian-adab.ts
// Dry-run (tanpa tulis): KAJIAN_DRY_RUN=1 npx tsx --env-file=.env.local scripts/import-kajian-adab.ts
//
// Pencocokan ketua: via NAMA (kolom "Ketua Kelas") → ketua_kelas.name → whatsapp_number.
// (Nomor halaqah "HITS N" di sheet tak dipakai: penamaan halaqah DB tak konsisten &
//  multi-cohort, sedang nomor sheet reset per-cohort — nama jauh lebih andal.)
// Resolusi tanggal: tiap kolom dibaca sendiri (header teks dd/mm ATAU Date cell).
// Date cell rawan tertukar m/d (mis. 2026-07-06 = Senin → maksudnya 2026-06-07 = Ahad),
// maka: pilih kandidat (apa-adanya / m-d ditukar) yang jatuh di Minggu; bila keduanya
// Minggu, pilih yang monotonik (terkecil > tanggal kolom sebelumnya) mengikuti urutan kolom.
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// yearOf: fungsi bulan→tahun (file Juni membentang 2025 akhir → 2026 awal).
const FILES: { file: string; yearOf: (month: number) => number }[] = [
  { file: 'Observasi HITS Januari Akhwat .xlsx', yearOf: () => 2026 },
  { file: 'Observasi HITS April Akhwat .xlsx', yearOf: () => 2026 },
  { file: 'Observasi HITS JUNI 2025_AKHWAT.xlsx', yearOf: (m) => (m >= 7 ? 2025 : 2026) },
];
const SHEET = 'Presensi Kajian Adab';
const STATUS_MAP: Record<string, string> = { H: 'Hadir', T: 'Terlambat', I: 'Izin', S: 'Sakit', A: 'Alpa' };
const DRY_RUN = process.env.KAJIAN_DRY_RUN === '1';

const norm = (s: unknown) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const isoOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const isSunday = (ms: number) => new Date(ms).getUTCDay() === 0;

/** Kandidat tanggal (ms) Minggu dari sebuah header cell. Bisa 0/1/2 kandidat, urut menaik. */
function sundayCandidates(v: ExcelJS.CellValue, yearOf: (m: number) => number): number[] {
  const out: number[] = [];
  const push = (y: number, mo: number, d: number) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return;
    const ms = Date.UTC(y, mo - 1, d);
    if (new Date(ms).getUTCMonth() === mo - 1 && isSunday(ms) && !out.includes(ms)) out.push(ms);
  };
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})[/\-](\d{1,2})/);
    if (m) push(yearOf(Number(m[2])), Number(m[2]), Number(m[1])); // teks = dd/mm (d/m, andal)
  } else if (v instanceof Date) {
    const Y = v.getUTCFullYear(), M = v.getUTCMonth() + 1, D = v.getUTCDate();
    push(Y, M, D);       // apa adanya
    push(Y, D, M);       // m/d ditukar
  }
  return out.sort((a, b) => a - b);
}

/** Peta kolom→tanggal (YYYY-MM-DD), resolusi per-kolom + disambiguasi monotonik. */
function resolveDates(ws: ExcelJS.Worksheet, yearOf: (m: number) => number): Map<number, string> {
  const header = ws.getRow(2);
  const out = new Map<number, string>();
  let last = 0;
  for (let c = 4; c <= ws.columnCount; c++) {
    const cands = sundayCandidates(header.getCell(c).value, yearOf);
    if (!cands.length) continue;
    // pilih kandidat monotonik: terkecil yang > last; else kandidat terkecil.
    const pick = cands.find((ms) => ms > last) ?? cands[0];
    out.set(c, isoOf(pick));
    last = pick;
  }
  return out;
}

/** Peta nama-ketua ternormalisasi → WA (hanya bila unik; nama ganda dilewati). */
async function ketuaNameMap(): Promise<{ map: Map<string, string>; ambiguous: Set<string> }> {
  const { data } = await admin
    .from('ketua_kelas')
    .select('name, whatsapp_number')
    .eq('active', true)
    .not('whatsapp_number', 'is', null);
  const byName = new Map<string, Set<string>>();
  for (const r of data ?? []) {
    const wa = (r as { whatsapp_number: string }).whatsapp_number;
    const k = norm((r as { name: string }).name);
    if (!k || !wa) continue;
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k)!.add(wa);
  }
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const [k, was] of byName) {
    if (was.size === 1) map.set(k, [...was][0]);
    else ambiguous.add(k);
  }
  return { map, ambiguous };
}

async function main() {
  const { map: nameMap, ambiguous } = await ketuaNameMap();
  console.log(`ketua aktif (nama unik→WA): ${nameMap.size}, nama ganda(ambigu): ${ambiguous.size}`);

  const upserts: { ketua_wa: string; tanggal: string; status: string }[] = [];
  let missName = 0, ambigName = 0, emptyName = 0;
  const missSample = new Set<string>();

  for (const { file, yearOf } of FILES) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet(SHEET);
    if (!ws) { console.log('SKIP (no sheet):', file); continue; }
    const dates = resolveDates(ws, yearOf);
    const ds = [...dates.values()];
    console.log(`${file}: ${dates.size} kolom Minggu (${ds[0]} .. ${ds[ds.length - 1]})`);

    for (let r = 3; r <= ws.rowCount; r++) {
      const nameRaw = ws.getRow(r).getCell(3).value;
      const nameKey = norm(nameRaw ?? '');
      if (!nameKey) { emptyName++; continue; }
      if (ambiguous.has(nameKey)) { ambigName++; continue; }
      const wa = nameMap.get(nameKey);
      if (!wa) { missName++; if (missSample.size < 15) missSample.add(String(nameRaw).trim()); continue; }
      for (const [col, tgl] of dates) {
        const raw = String(ws.getRow(r).getCell(col).value ?? '').trim().toUpperCase();
        const status = STATUS_MAP[raw];
        if (!status) continue;
        upserts.push({ ketua_wa: wa, tanggal: tgl, status });
      }
    }
  }

  // dedup lokal (ketua_wa|tanggal) — overlap antar-file; entri terakhir menang.
  const dedup = new Map<string, { ketua_wa: string; tanggal: string; status: string }>();
  for (const u of upserts) dedup.set(`${u.ketua_wa}|${u.tanggal}`, u);
  const rows = [...dedup.values()];

  console.log(
    `\nbaris presensi (pra-dedup): ${upserts.length}, unik (ketua×tgl): ${rows.length}` +
    `\nnama tak cocok: ${missName}, nama ambigu: ${ambigName}, baris tanpa nama: ${emptyName}`
  );
  if (missSample.size) console.log('contoh nama tak cocok (ex-ketua/rotasi):', [...missSample].join(' | '));

  if (DRY_RUN) {
    const byDate = new Map<string, number>();
    for (const r of rows) byDate.set(r.tanggal, (byDate.get(r.tanggal) ?? 0) + 1);
    console.log('\nDRY_RUN=1 → tidak upsert. Sebaran per tanggal:');
    console.log([...byDate.entries()].sort().map(([d, n]) => `  ${d}: ${n}`).join('\n'));
    return;
  }

  let done = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from('hits_kajian_presensi').upsert(chunk, { onConflict: 'ketua_wa,tanggal' });
    if (error) { console.error('upsert error', error.message); process.exit(1); }
    done += chunk.length;
  }
  console.log(`\nDONE. upsert=${done}`);
}

void main();
