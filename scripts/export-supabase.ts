/**
 * export-supabase.ts — Full data + storage export from the live Supabase project.
 *
 * WHY: grace period habis; kita harus menarik SEMUA data keluar sebelum project
 * dipause/dihapus. Script ini TIDAK butuh password Postgres — cukup service-role
 * key yang sudah ada di .env.local (bypass RLS). Aman dijalankan berkali-kali.
 *
 * Output (semua di ./_backup_supabase/, gitignored):
 *   data/<table>.json     — array baris per tabel (paginated, service role)
 *   storage/<path>        — semua objek audio dari bucket setoran-audio
 *   manifest.json         — timestamp, jumlah baris per tabel, jumlah file storage
 *
 * Jalankan: npm run export-supabase
 */
import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_AUDIO_BUCKET ?? 'setoran-audio';
if (!url || !serviceKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY di .env.local');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OUT = join(process.cwd(), '_backup_supabase');
const PAGE = 1000;

// Daftar tabel authoritative (dari pg_tables schema=public). Urutan alfabet;
// urutan tidak penting untuk export.
const TABLES = [
  '_bak_merge_basmah_20260709', 'audit_log', 'batch_config', 'checkin_pengajar',
  'hits_batch', 'hits_halaqah', 'hits_halaqah_peserta', 'hits_halaqah_pindah_request',
  'hits_hutang_bayar', 'hits_kajian_libur', 'hits_kajian_presensi', 'hits_kaldik_hari',
  'hits_kaldik_pertemuan', 'hits_keterangan_harian', 'hits_pelanggaran',
  'hits_pertemuan_hapus_request', 'hits_pertemuan_koreksi', 'hits_pertemuan_koreksi_item',
  'hits_sheet_source', 'hits_tabayyun', 'hits_teguran', 'indikator_standar',
  'jadwal_pindah', 'kehadiran_peserta', 'kelas', 'kelas_hits', 'kelompok_pengajar',
  'ketua_dualrole_request', 'ketua_kelas', 'koordinator', 'koordinator_ketua_kelas',
  'koordinator_notes', 'libur_program', 'matrix_rekap', 'musyrif', 'observasi_kelas',
  'password_reset_requests', 'pengajar', 'pengajuan_alasan', 'penilaian_masyaikh',
  'penilaian_pedagogis', 'penilaian_peserta', 'pertemuan_program', 'peserta',
  'program_kehadiran', 'program_kelas', 'program_kelas_anggota', 'program_kelas_libur',
  'program_kelas_libur_request', 'rekaman', 'rekaman_musyrif', 'session_log',
  'setoran', 'setoran_musyrif', 'shakwa', 'syaikh', 'tabayyun', 'teguran',
  'wa_reminder_log',
];

async function exportTable(table: string): Promise<number> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  const file = join(OUT, 'data', `${table}.json`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(rows, null, 0));
  return rows.length;
}

type StorageObj = { path: string; size: number };

async function listAll(prefix = ''): Promise<StorageObj[]> {
  const out: StorageObj[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`storage list ${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folder → id null. File → id ada.
      if (entry.id === null) {
        out.push(...(await listAll(full)));
      } else {
        out.push({ path: full, size: entry.metadata?.size ?? 0 });
      }
    }
    if (data.length < PAGE) break;
  }
  return out;
}

async function fileExists(p: string, minSize = 1): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.size >= minSize;
  } catch {
    return false;
  }
}

async function downloadOne(path: string, dest: string): Promise<number> {
  // Retry 4x dengan backoff — koneksi ke object storage bisa flaky.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw error;
      const buf = Buffer.from(await data.arrayBuffer());
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      return buf.length;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error(`download ${path} gagal setelah 4x: ${String(lastErr)}`);
}

async function downloadStorage(): Promise<{ files: number; bytes: number; skipped: number }> {
  const objs = await listAll();
  let bytes = 0;
  let done = 0;
  let skipped = 0;
  for (const o of objs) {
    const dest = join(OUT, 'storage', o.path);
    // Resume: lewati file yang sudah terunduh utuh.
    if (await fileExists(dest, Math.max(1, o.size))) {
      skipped++;
      continue;
    }
    const n = await downloadOne(o.path, dest);
    bytes += n;
    done++;
    if (done % 25 === 0) console.log(`    ... ${done} file terunduh`);
  }
  return { files: objs.length, bytes, skipped };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`Export mulai ${startedAt}\n  project=${url}\n  out=${OUT}\n`);

  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const n = await exportTable(t);
    counts[t] = n;
    console.log(`  ✓ ${t.padEnd(38)} ${n} baris`);
  }

  console.log('\nStorage (audio) ...');
  const storage = await downloadStorage();
  console.log(
    `  ✓ ${storage.files} objek total; ${(storage.bytes / 1e6).toFixed(1)} MB baru diunduh, ${storage.skipped} sudah ada (resume)`
  );

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  const manifest = {
    exported_at: startedAt,
    finished_at: new Date().toISOString(),
    source: url,
    postgres_version: '17.6',
    tables: counts,
    table_count: TABLES.length,
    total_rows: totalRows,
    storage: { bucket, ...storage },
  };
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nSelesai. ${TABLES.length} tabel, ${totalRows} baris, ${storage.files} file audio.`);
  console.log(`Manifest: ${join(OUT, 'manifest.json')}`);
}

main().catch((e) => {
  console.error('EXPORT GAGAL:', e);
  process.exit(1);
});
