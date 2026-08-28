/**
 * seed-haqibah.ts — isi awal pustaka "Haqibatul Mu'allim" dari satu folder di disk.
 *
 * Jalankan (lokal):
 *   npx tsx --env-file=.env.local scripts/seed-haqibah.ts "Haqibatul Mu'allim" --dry-run
 *   npx tsx --env-file=.env.local scripts/seed-haqibah.ts "Haqibatul Mu'allim"
 * Di VPS (env sudah di-export dari env_vars.sh): lihat docs/HAQIBAH.md.
 *
 * Tiap subdirektori jadi satu baris `haqibah_folder` (parent mengikuti induknya,
 * maksimum 3 tingkat). Tiap berkas disalin ke `${STORAGE_DIR}/haqibah/<uuid>.<ext>`
 * lalu dicatat di `haqibah_file` dengan nama tampil = nama berkas TANPA ekstensi.
 * Berkas yang tergeletak langsung di folder sumber masuk ke akar (folder_id null).
 *
 * IDEMPOTEN: folder dicocokkan berdasarkan (parent, nama), berkas berdasarkan
 * (folder, nama) — keduanya tanpa memandang besar-kecil huruf. Yang sudah ada
 * DILEWATI, bukan digandakan, dan urutan/namanya tidak disentuh (koordinator
 * boleh merapikannya lewat UI tanpa takar tertimpa saat seed diulang).
 *
 * Urutan diambil dari prefiks angka pada nama ("1. ", "2) ", "03 - ") bila ada;
 * kalau tidak ada, dipakai nomor urut abjad di dalam folder itu. Prefiksnya
 * SENGAJA tidak dibuang dari nama tampil supaya sama persis dengan folder sumber
 * (koordinator boleh mengubah namanya lewat UI kalau mau lebih ringkas).
 *
 * Catatan: konstanta di bawah disalin dari src/lib/haqibah.ts &
 * src/lib/haqibah-storage.ts, BUKAN diimpor — haqibah.ts memakai
 * `import 'server-only'` yang hanya bisa di-resolve bundler Next, jadi tsx akan
 * gagal memuatnya. Kalau daftar ekstensi/MIME/batas di lib berubah, samakan di sini.
 *
 * ENV: DATABASE_URL, STORAGE_DIR.
 */
import { randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { storageDir } from '../src/lib/pg-storage';

const BUCKET = 'haqibah'; // = HAQIBAH_BUCKET
const MAX_DEPTH = 3; // = HAQIBAH_MAX_DEPTH
const MAKS_UKURAN = 50 * 1024 * 1024; // 50 MB
const MAKS_NAMA_FOLDER = 120;
const MAKS_NAMA_FILE = 200;
const DIUNGGAH_OLEH = 'seed-haqibah';

const EXT_DIIZINKAN = [
  'pdf', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'csv',
  'jpg', 'jpeg', 'png', 'webp',
];

const MIME_PER_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// ── Opsi & ringkasan ─────────────────────────────────────────────────────────
let SUMBER = '';
let DRY_RUN = false;

const lapor = {
  folderBaru: 0,
  folderDilewati: 0,
  fileBaru: 0,
  fileDilewati: 0,
  bytes: 0,
  ditolak: [] as string[],
  terlaluDalam: [] as string[],
};

// ── Helper nama ──────────────────────────────────────────────────────────────
/** Sama dengan rapikanNama() di src/lib/haqibah.ts: spasi ganda dibuang. */
function rapikanNama(nama: string): string {
  return nama.replace(/\s+/g, ' ').trim();
}

/** "1. Panduan" → 1, "02) SOP" → 2, "SOP" → null. */
function nomorPrefiks(nama: string): number | null {
  const m = nama.match(/^(\d{1,3})\s*[.)\-–]?\s+/);
  return m ? Number(m[1]) : null;
}

function pecahNama(namaFile: string): { dasar: string; ext: string } {
  const titik = namaFile.lastIndexOf('.');
  if (titik <= 0) return { dasar: namaFile, ext: '' };
  return {
    dasar: namaFile.slice(0, titik),
    ext: namaFile.slice(titik + 1).toLowerCase().replace(/[^a-z0-9]/g, ''),
  };
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function jalurRelatif(path: string): string {
  return relative(SUMBER, path) || '.';
}

function cetak(tingkat: number, teks: string): void {
  console.log(`${'  '.repeat(tingkat)}${teks}`);
}

function tolak(path: string, alasan: string, tingkat: number): false {
  const rel = jalurRelatif(path);
  lapor.ditolak.push(`${rel} — ${alasan}`);
  cetak(tingkat, `✗ ${rel} (${alasan})`);
  return false;
}

// ── Entri direktori ──────────────────────────────────────────────────────────
interface Entri {
  path: string;
  nama: string;
  nomor: number | null;
}

function bandingkan(a: Entri, b: Entri): number {
  const na = a.nomor ?? Number.MAX_SAFE_INTEGER;
  const nb = b.nomor ?? Number.MAX_SAFE_INTEGER;
  if (na !== nb) return na - nb;
  return a.nama.localeCompare(b.nama, 'id');
}

// ── Akses DB (langsung, tanpa src/lib/haqibah.ts — lihat catatan di kepala) ──
function pastikanSukses(error: { message: string } | null, pesan: string): void {
  if (error) throw new Error(`${pesan}: ${error.message}`);
}

/** Folder anak `nama` di dalam `indukId`, atau null bila belum ada. */
async function cariFolder(indukId: string | null, nama: string): Promise<string | null> {
  let q = supabaseAdmin.from('haqibah_folder').select('id, nama');
  q = indukId === null ? q.is('parent_id', null) : q.eq('parent_id', indukId);
  const { data, error } = await q;
  pastikanSukses(error, 'Gagal membaca daftar folder');
  const baris = (data ?? []) as { id: string; nama: string }[];
  const cocok = baris.find((f) => f.nama.toLowerCase() === nama.toLowerCase());
  return cocok ? cocok.id : null;
}

async function buatFolder(indukId: string | null, nama: string, urutan: number): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('haqibah_folder')
    .insert({ parent_id: indukId, nama, urutan })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Gagal membuat folder "${nama}"${error ? `: ${error.message}` : ''}`);
  }
  return (data as { id: string }).id;
}

/** Nama tampil berkas yang sudah dipakai di satu folder (huruf kecil semua). */
async function namaFileTerpakai(folderId: string | null): Promise<Set<string>> {
  let q = supabaseAdmin.from('haqibah_file').select('nama');
  q = folderId === null ? q.is('folder_id', null) : q.eq('folder_id', folderId);
  const { data, error } = await q;
  pastikanSukses(error, 'Gagal membaca daftar berkas');
  const baris = (data ?? []) as { nama: string }[];
  return new Set(baris.map((f) => f.nama.toLowerCase()));
}

// ── Proses satu berkas ───────────────────────────────────────────────────────
/** `false` = ditolak (tak dihitung sebagai isi folder, jadi nomor urut tak maju). */
async function prosesBerkas(
  entri: Entri,
  folderId: string | null,
  urutan: number,
  namaTerpakai: Set<string>,
  tingkat: number
): Promise<boolean> {
  const { dasar, ext } = pecahNama(entri.nama);
  if (!ext) return tolak(entri.path, 'tanpa ekstensi', tingkat);
  if (!EXT_DIIZINKAN.includes(ext)) return tolak(entri.path, `ekstensi ".${ext}" tak diizinkan`, tingkat);

  const nama = rapikanNama(dasar);
  if (!nama) return tolak(entri.path, 'nama kosong', tingkat);
  if (nama.length > MAKS_NAMA_FILE) {
    return tolak(entri.path, `nama lebih dari ${MAKS_NAMA_FILE} karakter`, tingkat);
  }

  const info = await stat(entri.path);
  if (info.size <= 0) return tolak(entri.path, 'kosong (0 byte)', tingkat);
  if (info.size > MAKS_UKURAN) {
    return tolak(entri.path, `${mb(info.size)} MB melebihi batas ${mb(MAKS_UKURAN)} MB`, tingkat);
  }

  const kunci = nama.toLowerCase();
  if (namaTerpakai.has(kunci)) {
    lapor.fileDilewati++;
    cetak(tingkat, `· ${nama}.${ext} (sudah ada, dilewati)`);
    return true;
  }
  namaTerpakai.add(kunci);

  if (DRY_RUN) {
    lapor.fileBaru++;
    lapor.bytes += info.size;
    cetak(tingkat, `+ ${nama}.${ext} (${mb(info.size)} MB) [dry-run]`);
    return true;
  }

  const mime = MIME_PER_EXT[ext] ?? 'application/octet-stream';
  const storagePath = `${randomUUID()}.${ext}`;
  const isi = await readFile(entri.path);
  const { error: errUnggah } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, isi, { upsert: false, contentType: mime });
  pastikanSukses(errUnggah, `Gagal menyalin berkas "${jalurRelatif(entri.path)}"`);

  const { error: errCatat } = await supabaseAdmin.from('haqibah_file').insert({
    folder_id: folderId,
    nama,
    storage_path: storagePath,
    ext,
    mime,
    ukuran: info.size,
    urutan,
    diunggah_oleh: DIUNGGAH_OLEH,
  });
  if (errCatat) {
    // Metadata gagal → jangan tinggalkan berkas yatim di bucket.
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`Gagal mencatat berkas "${nama}": ${errCatat.message}`);
  }

  lapor.fileBaru++;
  lapor.bytes += info.size;
  cetak(tingkat, `+ ${nama}.${ext} (${mb(info.size)} MB)`);
  return true;
}

// ── Telusuri direktori ───────────────────────────────────────────────────────
/**
 * `tingkat` = kedalaman folder induk (0 = akar pustaka). `indukBaru` menandai
 * folder yang baru "dibuat" saat dry-run — id-nya belum ada, jadi pencocokan ke
 * DB dilewati dan seluruh isinya dianggap baru.
 */
async function telusuri(
  dir: string,
  indukId: string | null,
  tingkat: number,
  indukBaru: boolean
): Promise<void> {
  const isi = await readdir(dir, { withFileTypes: true });
  const subdir: Entri[] = [];
  const berkas: Entri[] = [];
  for (const e of isi) {
    if (e.name.startsWith('.')) continue; // .DS_Store, .git, berkas sementara
    const entri: Entri = { path: join(dir, e.name), nama: e.name, nomor: nomorPrefiks(e.name) };
    if (e.isDirectory()) subdir.push(entri);
    else if (e.isFile()) berkas.push(entri);
  }
  subdir.sort(bandingkan);
  berkas.sort(bandingkan);

  // Berkas dulu, baru turun ke subfolder — cetakannya jadi mudah dibaca.
  const namaTerpakai = indukBaru ? new Set<string>() : await namaFileTerpakai(indukId);
  let nomorFile = 0; // posisi di antara berkas yang diterima, cadangan bila tanpa prefiks
  for (const f of berkas) {
    const diterima = await prosesBerkas(f, indukId, f.nomor ?? nomorFile + 1, namaTerpakai, tingkat);
    if (diterima) nomorFile++;
  }

  let nomorFolder = 0;
  for (const d of subdir) {
    if (tingkat + 1 > MAX_DEPTH) {
      const rel = jalurRelatif(d.path);
      lapor.terlaluDalam.push(rel);
      cetak(tingkat, `✗ ${d.nama}/ (lebih dari ${MAX_DEPTH} tingkat, folder & isinya dilewati)`);
      continue;
    }
    const nama = rapikanNama(d.nama);
    if (!nama || nama.length > MAKS_NAMA_FOLDER) {
      tolak(d.path, `nama folder kosong atau lebih dari ${MAKS_NAMA_FOLDER} karakter`, tingkat);
      continue;
    }

    const adaId = indukBaru ? null : await cariFolder(indukId, nama);
    if (adaId) {
      lapor.folderDilewati++;
      nomorFolder++;
      cetak(tingkat, `· ${nama}/ (sudah ada)`);
      await telusuri(d.path, adaId, tingkat + 1, false);
      continue;
    }

    const urutan = d.nomor ?? nomorFolder + 1;
    nomorFolder++;
    if (DRY_RUN) {
      lapor.folderBaru++;
      cetak(tingkat, `+ ${nama}/ [dry-run]`);
      await telusuri(d.path, null, tingkat + 1, true);
      continue;
    }
    const baruId = await buatFolder(indukId, nama, urutan);
    lapor.folderBaru++;
    cetak(tingkat, `+ ${nama}/`);
    await telusuri(d.path, baruId, tingkat + 1, false);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
function bacaArgumen(): void {
  const args = process.argv.slice(2);
  const sisa: string[] = [];
  for (const a of args) {
    if (a === '--dry-run' || a === '-n') DRY_RUN = true;
    else if (a.startsWith('-')) {
      console.error(`Opsi tak dikenal: ${a}`);
      process.exit(2);
    } else sisa.push(a);
  }
  if (sisa.length !== 1) {
    console.error(
      'Usage: npx tsx --env-file=.env.local scripts/seed-haqibah.ts <folder-sumber> [--dry-run]\n' +
        "Contoh: npx tsx --env-file=.env.local scripts/seed-haqibah.ts \"Haqibatul Mu'allim\" --dry-run"
    );
    process.exit(2);
  }
  SUMBER = sisa[0].replace(/\/+$/, '');
}

async function main(): Promise<void> {
  bacaArgumen();

  const info = await stat(SUMBER).catch(() => null);
  if (!info || !info.isDirectory()) {
    console.error(`✗ "${SUMBER}" bukan direktori yang bisa dibaca.`);
    process.exit(1);
  }

  console.log(`\n📚 Seed Haqibatul Mu'allim${DRY_RUN ? ' (DRY RUN — tak ada yang ditulis)' : ''}`);
  console.log(`   sumber : ${SUMBER}`);
  console.log(`   bucket : ${join(storageDir(), BUCKET)}\n`);

  if (!DRY_RUN) {
    const { data: bucket } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (!bucket) {
      const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
      pastikanSukses(error, `Gagal menyiapkan bucket "${BUCKET}"`);
      console.log(`   bucket "${BUCKET}" dibuat.\n`);
    }
  }

  await telusuri(SUMBER, null, 0, false);

  console.log('\n══════════ RINGKASAN ══════════');
  console.log(`  Folder : ${lapor.folderBaru} dibuat, ${lapor.folderDilewati} dilewati (sudah ada)`);
  console.log(`  Berkas : ${lapor.fileBaru} dibuat, ${lapor.fileDilewati} dilewati (sudah ada)`);
  console.log(`  Ukuran : ${mb(lapor.bytes)} MB disalin`);
  if (lapor.ditolak.length) {
    console.log(`\n  ⚠ ${lapor.ditolak.length} berkas/folder ditolak:`);
    for (const d of lapor.ditolak) console.log(`     - ${d}`);
    console.log(`     (ekstensi yang diizinkan: ${EXT_DIIZINKAN.join(', ')}; maksimum ${mb(MAKS_UKURAN)} MB)`);
  }
  if (lapor.terlaluDalam.length) {
    console.log(`\n  ⚠ ${lapor.terlaluDalam.length} folder lebih dari ${MAX_DEPTH} tingkat (dilewati):`);
    for (const d of lapor.terlaluDalam) console.log(`     - ${d}`);
    console.log('     Ratakan strukturnya di folder sumber, lalu jalankan ulang.');
  }
  console.log(
    DRY_RUN
      ? '\n✅ Dry run selesai. Jalankan ulang tanpa --dry-run untuk menulis.\n'
      : '\n✅ Selesai. Aman dijalankan ulang (idempoten).\n'
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n✗ Seed gagal:', e);
    process.exit(1);
  });
