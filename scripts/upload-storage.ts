/**
 * upload-storage.ts — unggah audio hasil export ke bucket Supabase TUJUAN.
 *
 * Sumber : _backup_supabase/storage/<path>   (hasil `npm run export-supabase`)
 * Tujuan : bucket SUPABASE_AUDIO_BUCKET di project yang ditunjuk env berikut,
 *          yang HARUS diarahkan ke host baru (bukan Supabase lama):
 *            NEXT_PUBLIC_SUPABASE_URL
 *            SUPABASE_SERVICE_ROLE_KEY
 *            SUPABASE_AUDIO_BUCKET (default setoran-audio)
 *
 * Path objek dipertahankan sama persis dgn di DB (tabel rekaman/rekaman_musyrif).
 * Idempotent: upsert=true, jadi aman diulang.
 *
 * Jalankan: tsx --env-file=.env.local scripts/upload-storage.ts
 *   (arahkan .env.local ke host BARU dulu.)
 */
import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_AUDIO_BUCKET ?? 'setoran-audio';
if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY (host TUJUAN)');

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SRC = join(process.cwd(), '_backup_supabase', 'storage');

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function contentType(path: string): string {
  if (path.endsWith('.webm')) return 'audio/webm';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.m4a')) return 'audio/mp4';
  return 'application/octet-stream';
}

async function main() {
  // Pastikan bucket ada (private).
  const { data: b } = await supabase.storage.getBucket(bucket);
  if (!b) {
    const { error } = await supabase.storage.createBucket(bucket, { public: false });
    if (error) throw error;
    console.log(`Bucket "${bucket}" dibuat (private).`);
  }

  const files = await walk(SRC).catch(() => []);
  if (files.length === 0) {
    console.log(`Tidak ada file di ${SRC}. Jalankan export-supabase dulu (audio).`);
    return;
  }
  let done = 0;
  for (const f of files) {
    const objPath = relative(SRC, f).split('\\').join('/');
    const buf = await readFile(f);
    const { error } = await supabase.storage
      .from(bucket)
      .upload(objPath, buf, { upsert: true, contentType: contentType(f) });
    if (error) throw new Error(`upload ${objPath}: ${error.message}`);
    done++;
    if (done % 25 === 0) console.log(`  ... ${done}/${files.length}`);
  }
  console.log(`Selesai: ${done} file diunggah ke bucket "${bucket}".`);
}

main().catch((e) => {
  console.error('UPLOAD GAGAL:', e);
  process.exit(1);
});
