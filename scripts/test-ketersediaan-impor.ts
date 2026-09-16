/**
 * test-ketersediaan-impor.ts — uji integrasi Ketersediaan terhadap Postgres
 * sungguhan (PGlite lewat wire-protocol), memakai migrasi ks_* yang ASLI dan lib
 * aplikasi apa adanya. Tidak menyentuh produksi maupun berkas xlsx asli.
 *
 * Jalankan: npm run test-ketersediaan-impor
 * Opsional: KS_XLSX=/jalur/berkas.xlsx untuk ikut memeriksa berkas nyata.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PG_TEST_PORT ?? 54333);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

/**
 * Berkas tiruan dengan susunan yang sama persis dengan berkas nyata 16 Sep 2026:
 * sheet online bertumpuk dua batch, sheet offline tanpa WA, Matraman bertumpuk
 * ikhwan lalu akhwat, dan satu kelas dengan dua waktu berbeda.
 */
async function xlsxTiruan(opsi: { tanpaBaris?: 'bilal-sabtu' } = {}): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  const on = wb.addWorksheet('Online - Ikhwan');
  on.addRow(['KETERSEDIAAN PENGAJAR HITS ONLINE — IKHWAN']);
  on.addRow([]);
  on.addRow(['Batch September 2026 (mulai 3 September 2026)']);
  on.addRow(['No', 'Nama', 'WA', 'Online/Offline', 'Waktu', 'Prioritas']);
  on.addRow([1, 'Ahmad Fauzan', '081111111111', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 1]);
  on.addRow([2, 'Bilal Hakim', '081222222222', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 2]);
  if (opsi.tanpaBaris !== 'bilal-sabtu') {
    on.addRow([3, 'Bilal Hakim', '081222222222', 'Online', 'Sabtu & Ahad 13:00 - 14:30 WIB', 1]);
  }
  on.addRow([4, 'Tanpa Akun', '089999999999', 'Online', 'Sabtu & Ahad 13:00 - 14:30 WIB', 2]);
  on.addRow([]);
  on.addRow(['Batch Oktober 2026 (mulai 19 Oktober 2026)']);
  on.addRow(['No', 'Nama', 'WA', 'Online/Offline', 'Waktu', 'Prioritas']);
  on.addRow([1, 'Bilal Hakim', '081222222222', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 1]);
  on.addRow([2, 'Ahmad Fauzan', '081111111111', 'Online', 'Senin & Rabu 20:00 - 21:30 WIB', 2]);

  const pj = wb.addWorksheet('Offline - Pejaten Akhwat');
  pj.addRow(['JADWAL KBM HITS OFFLINE — Lokasi Pejaten AKHWAT (Batch September 2026)']);
  pj.addRow([]);
  pj.addRow(['Akhwat']);
  pj.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  pj.addRow([1, 'Ustadzah Khadijah Maryam', 'Offline', "Selasa & Jum'at, 09.00 - 10.30", 'Kelas A']);
  pj.addRow([2, 'Nama Asing', 'Offline', 'Senin & Kamis, 09.00 - 10.30', 'Kelas B']);

  const mt = wb.addWorksheet('Offline - Al-Kautsar Matraman');
  mt.addRow(['JADWAL KBM HITS OFFLINE — Lokasi Masjid Al-Kautsar Matraman (Batch September 2026)']);
  mt.addRow([]);
  mt.addRow(['Ikhwan']);
  mt.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  mt.addRow([1, 'Bilal Hakim', 'Offline', 'Selasa dan Kamis 20.00 - 21.30']);
  mt.addRow([]);
  mt.addRow(['Akhwat']);
  mt.addRow(['No', 'Nama', 'Online/Offline', 'Waktu', 'Kelas']);
  mt.addRow([1, 'Aisyah Rahma', 'Offline', 'Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30']);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// Tabel luar yang dirujuk migrasi ks_* dan cek bentrok — bentuk minimum.
const PRASYARAT = `
CREATE TYPE gender AS ENUM ('ikhwan', 'akhwat');
CREATE TABLE pengajar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, gender gender NOT NULL, whatsapp_number text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE hits_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, start_date date
);
CREATE TABLE hits_halaqah (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES hits_batch(id), name text NOT NULL,
  jadwal_raw text, jadwal_hari text[] NOT NULL DEFAULT '{}',
  waktu_mulai time, waktu_selesai time,
  pengajar_id uuid REFERENCES pengajar(id), active boolean NOT NULL DEFAULT true
);
CREATE TABLE hits_kaldik_hari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES hits_batch(id), level text,
  tanggal date NOT NULL, is_libur boolean NOT NULL DEFAULT false
);
CREATE TABLE hits_kaldik_pertemuan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqah_id uuid NOT NULL REFERENCES hits_halaqah(id),
  pertemuan_no int NOT NULL, tanggal date NOT NULL
);
CREATE TABLE kelas_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  pengajar_id uuid REFERENCES pengajar(id),
  jadwal_hari text, jadwal_waktu_mulai time, jadwal_waktu_selesai time
);
`;

const MIGRASI = [
  '0063_ketersediaan_inti',
  '0064_ketersediaan_pendaftar',
  '0065_ketersediaan_alokasi',
  '0066_ketersediaan_hilir',
  '0067_ketersediaan_cascade',
  '0071_ketersediaan_rekaman',
  '0072_ketersediaan_pertemuan',
  '0077_ketersediaan_impor_aturan',
  '0078_ketersediaan_libur_periode',
];

const ID = {
  ahmad: 'a0000000-0000-4000-8000-000000000001',
  bilal: 'a0000000-0000-4000-8000-000000000002',
  khadijah: 'a0000000-0000-4000-8000-000000000003',
  aisyah: 'a0000000-0000-4000-8000-000000000004',
  batchLama: 'b0000000-0000-4000-8000-000000000001',
  batchBaru: 'b0000000-0000-4000-8000-000000000002',
  h1: 'c0000000-0000-4000-8000-000000000001',
  h2: 'c0000000-0000-4000-8000-000000000002',
  h3: 'c0000000-0000-4000-8000-000000000003',
  sep: 'd0000000-0000-4000-8000-000000000001',
  okt: 'd0000000-0000-4000-8000-000000000002',
  slotSep: 'e0000000-0000-4000-8000-000000000001',
  slotOkt: 'e0000000-0000-4000-8000-000000000002',
};

const SEED = `
INSERT INTO pengajar (id, name, gender, whatsapp_number) VALUES
  ('${ID.ahmad}', 'Ahmad Fauzan', 'ikhwan', '6281111111111'),
  ('${ID.bilal}', 'Bilal Hakim', 'ikhwan', '6281222222222'),
  ('${ID.khadijah}', 'Khadijah Maryam', 'akhwat', '6281333333333'),
  ('${ID.aisyah}', 'Aisyah Rahma', 'akhwat', '6281444444444');

-- Batch lama selesai 30 Agustus; batch baru berjalan sampai Januari 2027.
INSERT INTO hits_batch (id, name, start_date) VALUES
  ('${ID.batchLama}', 'HITS Online Januari 2026', '2026-01-01'),
  ('${ID.batchBaru}', 'HITS untuk Orangtua ABK Juli 2026', '2026-07-03');
INSERT INTO hits_kaldik_hari (batch_id, level, tanggal) VALUES
  ('${ID.batchLama}', 'qoidah_nuroniyyah', '2026-01-12'),
  ('${ID.batchLama}', 'perbaikan_bacaan', '2026-08-30'),
  ('${ID.batchBaru}', 'qoidah_nuroniyyah', '2026-07-03'),
  ('${ID.batchBaru}', 'qoidah_nuroniyyah', '2027-01-08');

INSERT INTO hits_halaqah (id, batch_id, name, jadwal_raw, jadwal_hari, waktu_mulai, waktu_selesai, pengajar_id) VALUES
  ('${ID.h1}', '${ID.batchLama}', 'HITS 031', 'Online Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], '20:00', '21:30', '${ID.ahmad}'),
  ('${ID.h2}', '${ID.batchBaru}', 'HITS ABK 2', 'Online Selasa & Kamis 06:00 - 07:30 WIB', ARRAY['Selasa','Kamis'], '06:00', '07:30', '${ID.ahmad}'),
  ('${ID.h3}', '${ID.batchLama}', 'HITS 044', 'Online Sabtu & Ahad 13:00 - 14:30 WIB', ARRAY['Sabtu','Ahad'], '13:00', '14:30', '${ID.bilal}');
-- H3 dikoreksi: pertemuan terakhirnya mundur ke 1 November.
INSERT INTO hits_kaldik_pertemuan (halaqah_id, pertemuan_no, tanggal) VALUES ('${ID.h3}', 50, '2026-11-01');

INSERT INTO ks_periode (id, nama, mulai, selesai) VALUES
  ('${ID.sep}', 'Batch September 2026', '2026-09-21', '2026-12-31'),
  ('${ID.okt}', 'Batch Oktober 2026', '2026-10-21', '2027-01-31');
INSERT INTO ks_slot (id, periode_id, kelompok, mode, label, hari, hari_idx, waktu_mulai, waktu_selesai) VALUES
  ('${ID.slotSep}', '${ID.sep}', 'akhwat', 'online', 'Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], ARRAY[0,2]::smallint[], '20:00', '21:30'),
  ('${ID.slotOkt}', '${ID.okt}', 'akhwat', 'online', 'Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], ARRAY[0,2]::smallint[], '20:00', '21:30');

-- Siti ada di formulir kedua periode dan sudah dialokasikan di September.
INSERT INTO ks_pendaftar (periode_id, sumber_row_key, nama, wa, wa_normal, slot_id, status, pita_umur) VALUES
  ('${ID.sep}', 'k-siti', 'Siti Aminah', '6285000000001', '85000000001', '${ID.slotSep}', 'dialokasikan', '<=45'),
  ('${ID.okt}', 'k-siti', 'Siti Aminah', '6285000000001', '85000000001', '${ID.slotOkt}', 'valid', '<=45'),
  ('${ID.okt}', 'k-rahma', 'Rahma', '6285000000002', '85000000002', '${ID.slotOkt}', 'valid', '46+');
`;

async function gagalInsert(db: PGlite, sql: string): Promise<boolean> {
  try {
    await db.query(sql);
    return false;
  } catch {
    return true;
  }
}

async function main() {
  console.log('\n# pembaca xlsx');
  {
    const { bacaKetersediaanXlsx } = await import('../src/lib/ketersediaan-impor-xlsx');
    const hasil = await bacaKetersediaanXlsx(await xlsxTiruan());
    const ringkas = hasil.bagian.map((b) => `${b.kunci}:${b.baris.length}`).join();
    check(
      'tiga bagian dengan jumlah baris benar',
      ringkas === 'online|September 2026:4,online|Oktober 2026:2,offline|September 2026:4',
      ringkas
    );
    const semua = hasil.bagian.flatMap((b) => b.baris);
    const ahmad = semua.find((b) => b.nama === 'Ahmad Fauzan' && b.bagian === 'online|September 2026');
    check('WA dinormalkan', ahmad?.wa === '81111111111', String(ahmad?.wa));
    check('prioritas terbaca', ahmad?.prioritas === 1, String(ahmad?.prioritas));
    check('jam terurai', ahmad?.slot?.label === 'Senin & Rabu 20:00 - 21:30 WIB', String(ahmad?.slot?.label));
    const pejaten = semua.find((b) => b.sheet === 'Offline - Pejaten Akhwat');
    check('lokasi Pejaten dari judul', pejaten?.lokasi === 'Pejaten', String(pejaten?.lokasi));
    check('offline tanpa kolom WA → wa null', pejaten?.wa === null);
    const matIkhwan = semua.find((b) => b.sheet === 'Offline - Al-Kautsar Matraman' && b.gender === 'ikhwan');
    check('lokasi Matraman utuh', matIkhwan?.lokasi === 'Masjid Al-Kautsar Matraman', String(matIkhwan?.lokasi));
    const aisyah = semua.find((b) => b.nama === 'Aisyah Rahma');
    check('bagian kedua Matraman bergender akhwat', aisyah?.gender === 'akhwat');
    check('jam dua waktu terurai', aisyah?.masalah.length === 0 && aisyah?.slot?.label === 'Rabu 16:00 - 17:30 & Sabtu 13:00 - 14:30 WIB', JSON.stringify([aisyah?.masalah, aisyah?.slot?.label]));
    check('tidak ada baris terlewat', hasil.terlewat.length === 0, JSON.stringify(hasil.terlewat));

    if (process.env.KS_XLSX) {
      const buf = readFileSync(process.env.KS_XLSX);
      const nyata = await bacaKetersediaanXlsx(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      );
      const baris = nyata.bagian.flatMap((b) => b.baris);
      check('berkas nyata: 179 baris', baris.length === 179, String(baris.length));
      check('berkas nyata: 3 jam dua waktu terurai', baris.filter((b) => b.slot?.duaWaktu).length === 3);
      check('berkas nyata: tiga bagian', nyata.bagian.length === 3, nyata.bagian.map((b) => b.kunci).join());
    }
  }

  console.log('\n# pencocokan akun pengajar');
  {
    const { cocokkanPengajar, namaPengajarNormal } = await import('../src/lib/ketersediaan-impor-cocok');
    const daftar = [
      { id: 'p-adam', name: 'Adam Malik', gender: 'ikhwan' as const, whatsapp_number: '6281500000001', active: true },
      { id: 'p-khad', name: 'Khadijah Maryam', gender: 'akhwat' as const, whatsapp_number: '6281500000002', active: true },
      { id: 'p-mf1', name: 'Muhammad Fauzi', gender: 'ikhwan' as const, whatsapp_number: '6281500000003', active: true },
      { id: 'p-mf2', name: 'Fauzi Muhammad Ali', gender: 'ikhwan' as const, whatsapp_number: '6281500000004', active: true },
      { id: 'p-mati', name: 'Umar Said', gender: 'ikhwan' as const, whatsapp_number: '6281500000005', active: false },
    ];
    check('gelar dibuang', namaPengajarNormal('Ustadzah  Khadijah Maryam') === 'khadijah maryam');
    check('cocok lewat WA', cocokkanPengajar({ nama: 'siapa saja', wa: '81500000001', gender: 'ikhwan' }, daftar).pengajar_id === 'p-adam');
    check('WA tanpa akun tidak jatuh ke nama', cocokkanPengajar({ nama: 'Adam Malik', wa: '89999999999', gender: 'ikhwan' }, daftar).status === 'tanpa_akun');
    check('WA milik akun bergender lain', cocokkanPengajar({ nama: 'x', wa: '81500000002', gender: 'ikhwan' }, daftar).status === 'gender_beda');
    check('nama persis setelah gelar dibuang', cocokkanPengajar({ nama: 'Ustadzah Khadijah Maryam', wa: null, gender: 'akhwat' }, daftar).pengajar_id === 'p-khad');
    const panjang = cocokkanPengajar({ nama: 'Adam Malik Nurzuhdi Al Suyudi', wa: null, gender: 'ikhwan' }, daftar);
    check('nama panjang cocok lewat dua kata', panjang.pengajar_id === 'p-adam' && panjang.cara === 'nama', JSON.stringify(panjang));
    check('dua kandidat → nama_ganda', cocokkanPengajar({ nama: 'Fauzi Muhammad', wa: null, gender: 'ikhwan' }, daftar).status === 'nama_ganda');
    check('akun nonaktif tidak dipakai', cocokkanPengajar({ nama: 'Umar Said', wa: null, gender: 'ikhwan' }, daftar).status === 'nama_tak_ketemu');
    {
      const nyata = [
        { id: 'a1', name: 'Salma Khoiriyah', gender: 'akhwat', whatsapp_number: '6281', active: true },
        { id: 'a2', name: 'Durrotusyifa', gender: 'akhwat', whatsapp_number: '6282', active: true },
        { id: 'a3', name: 'Rinny Chandrawatty', gender: 'akhwat', whatsapp_number: '6283', active: true },
        { id: 'a4', name: 'Sri Wulan Aprilia', gender: 'akhwat', whatsapp_number: '6284', active: true },
        { id: 'a5', name: 'Nur Latifah Anshoriah', gender: 'akhwat', whatsapp_number: '6285', active: true },
        { id: 'a6', name: 'Salma Suhailah Nizzati', gender: 'akhwat', whatsapp_number: '6286', active: true },
      ] as const;
      const c = (nama: string, wa: string | null = null) => cocokkanPengajar({ nama, wa, gender: 'akhwat' }, nyata as never);
      check('ejaan huruf ganda: Salma Khoiriyyah', c('Salma Khoiriyyah').pengajar_id === 'a1', JSON.stringify(c('Salma Khoiriyyah')));
      check('ejaan huruf ganda: Durrotussyifa', c('Durrotussyifa').pengajar_id === 'a2');
      check('awalan kata: Rinnie Chandra', c('Rinnie Chandra').pengajar_id === 'a3', JSON.stringify(c('Rinnie Chandra')));
      const wulan = c('Sri Wulan', '89999999999');
      check('WA beda: tetap tanpa_akun, akun senama ditawarkan', wulan.status === 'tanpa_akun' && wulan.kandidat[0]?.id === 'a4', JSON.stringify(wulan));
      const asing = c('Fauzia Rahmani');
      check('nama tak ketemu: tanpa kandidat palsu', asing.status === 'nama_tak_ketemu' && asing.kandidat.length === 0, JSON.stringify(asing));
    }
    check('pilihan manual dipakai', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'akhwat' }, daftar, 'p-khad').cara === 'manual');
    check('pilihan manual beda gender ditolak', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'ikhwan' }, daftar, 'p-khad').pengajar_id === null);
    check('pilihan lewati', cocokkanPengajar({ nama: 'Nama Asing', wa: null, gender: 'akhwat' }, daftar, 'lewati').status === 'dilewati');
  }

  const db = new PGlite();
  await db.exec(PRASYARAT);
  for (const m of MIGRASI) {
    const sql = readFileSync(`supabase/migrations/${m}.sql`, 'utf8').replace(/^\s*(begin|commit)\s*;\s*$/gim, '');
    await db.exec(sql);
  }
  await db.exec(SEED);

  console.log('\n# migrasi 0077');
  check(
    'pita lama ditolak',
    await gagalInsert(db, `INSERT INTO ks_pendaftar (periode_id, sumber_row_key, pita_umur) VALUES ('${ID.okt}', 'x1', '18-25')`)
  );
  check(
    'status diganti diterima',
    !(await gagalInsert(db, `INSERT INTO ks_pendaftar (periode_id, sumber_row_key, status) VALUES ('${ID.okt}', 'x2', 'diganti')`))
  );
  // PGlite `query` hanya menerima satu statement; siapkan pengisiannya dulu.
  await db.exec(`INSERT INTO ks_pengisian (periode_id, pengajar_id) VALUES ('${ID.okt}', '${ID.khadijah}')`);
  check(
    'prioritas 0 ditolak',
    await gagalInsert(
      db,
      `INSERT INTO ks_ketersediaan (pengisian_id, slot_id, prioritas)
         SELECT id, '${ID.slotOkt}', 0 FROM ks_pengisian WHERE pengajar_id = '${ID.khadijah}'`
    )
  );
  check(
    'sumber pengisian bawaan = form',
    (await db.query<{ sumber: string }>(`SELECT sumber FROM ks_pengisian WHERE pengajar_id = '${ID.khadijah}'`)).rows[0]?.sumber === 'form'
  );
  const pertemuan = await db.query<{ d: number; l: number }>(
    `SELECT jumlah_pertemuan_dasar d, jumlah_pertemuan_lanjutan l FROM ks_periode WHERE id = '${ID.okt}'`
  );
  check('bawaan pertemuan 50/26', pertemuan.rows[0].d === 50 && pertemuan.rows[0].l === 26, JSON.stringify(pertemuan.rows[0]));
  await db.exec(`DELETE FROM ks_pendaftar WHERE sumber_row_key IN ('x1','x2'); DELETE FROM ks_pengisian;`);

  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.PG_POOL_MAX = '1';
  process.env.SESSION_SECRET ??= '0123456789abcdef0123456789abcdef0123';

  try {
    const bentrok = await import('../src/lib/ketersediaan-bentrok');
    const lintas = await import('../src/lib/ketersediaan-lintas-periode');
    const permintaan = await import('../src/lib/ketersediaan-permintaan');
    const periodeLib = await import('../src/lib/ketersediaan-periode');

    console.log('\n# halaqah selesai tidak mengunci');
    {
      const tanpaAcuan = await bentrok.jadwalTerpakaiPengajar(ID.ahmad);
      check('tanpa acuan: dua halaqah mengunci (perilaku lama)', tanpaAcuan.length === 2, JSON.stringify(tanpaAcuan.map((t) => t.nama)));
      const okt = await bentrok.jadwalTerpakaiPengajar(ID.ahmad, { acuan: '2026-10-21' });
      check('acuan 21 Okt: HITS 031 (selesai 30 Agu) tidak mengunci', okt.map((t) => t.nama).join() === 'HITS ABK 2', JSON.stringify(okt.map((t) => t.nama)));
      check('tanggal selesai terbawa', okt[0]?.selesai === '2027-01-08', String(okt[0]?.selesai));
      const bilal = await bentrok.jadwalTerpakaiPengajar(ID.bilal, { acuan: '2026-10-21' });
      check('koreksi pertemuan memperpanjang: HITS 044 masih mengunci', bilal.map((t) => t.nama).join() === 'HITS 044', JSON.stringify(bilal));
    }

    console.log('\n# satu formulir dua periode');
    {
      const terpakai = await lintas.identitasTerpakaiLintasPeriode(ID.okt);
      check('Siti terdeteksi sudah dapat di September', terpakai.get('85000000001|siti aminah') === 'Batch September 2026', JSON.stringify([...terpakai]));
      check('periode September sendiri tidak mengecualikan Siti', (await lintas.identitasTerpakaiLintasPeriode(ID.sep)).size === 0);

      const periode = await periodeLib.getPeriode(ID.okt);
      const slots = await periodeLib.listSlot(ID.okt);
      const ringkas = await permintaan.ringkasSlot(periode!, slots, new Date('2026-09-16T05:00:00Z'));
      const r = ringkas.get(ID.slotOkt)!;
      check('Oktober: antre hanya Rahma', r.antre === 1, JSON.stringify(r));
      check('Oktober: Siti dihitung terpakai_lain', r.terpakai_lain === 1, JSON.stringify(r));
    }

    console.log('\n# impor xlsx ke basis data');
    {
      const impor = await import('../src/lib/ketersediaan-impor');
      const { supabaseAdmin } = await import('../src/lib/supabase-admin');
      const { getPool } = await import('../src/lib/pg-core');
      const q = async <T,>(sql: string, p: unknown[] = []) => (await getPool().query(sql, p)).rows as T[];
      const aktor = { wa: '628100000009', nama: 'Koor Uji' };

      // Ahmad dan Khadijah sudah mengisi sendiri di Oktober — impor tidak boleh menyentuhnya.
      await supabaseAdmin.from('ks_pengisian').insert({ periode_id: ID.okt, pengajar_id: ID.ahmad, sumber: 'form', komitmen: true });
      await supabaseAdmin.from('ks_pengisian').insert({ periode_id: ID.okt, pengajar_id: ID.khadijah, sumber: 'form', komitmen: true });

      const berkas = await xlsxTiruan();
      const pilihan = { tujuan: {} as Record<string, string>, manual: {} as Record<string, string> };
      const pratinjau = await impor.susunPratinjau(berkas, pilihan);
      const tebak = Object.fromEntries(pratinjau.bagian.map((b) => [b.kunci, b.tujuan]));
      check(
        'tujuan ditebak dari nama bulan',
        tebak['online|September 2026'] === ID.sep && tebak['offline|September 2026'] === ID.sep && tebak['online|Oktober 2026'] === ID.okt,
        JSON.stringify(tebak)
      );
      const asing = pratinjau.baris.find((b) => b.nama === 'Nama Asing')!;
      check('nama asing perlu dipilih', asing.cocok.status === 'nama_tak_ketemu' && !asing.siap);
      check('tanpa akun terdeteksi', pratinjau.baris.find((b) => b.nama === 'Tanpa Akun')?.cocok.status === 'tanpa_akun');
      check(
        'Khadijah offline cocok lewat nama',
        pratinjau.baris.find((b) => b.sheet === 'Offline - Pejaten Akhwat' && b.cocok.pengajar_id === ID.khadijah)?.cocok.cara === 'nama'
      );

      pilihan.manual[asing.kunci] = 'lewati';
      const h1 = await impor.simpanImpor(berkas, pilihan, aktor, 'uji.xlsx');
      const sep1 = h1.periode.find((p) => p.id === ID.sep)!;
      const okt1 = h1.periode.find((p) => p.id === ID.okt)!;
      check('September: 4 pengajar, 6 jam, 5 jam baru (termasuk kelas dua waktu Aisyah)', sep1.pengajar === 4 && sep1.jam === 6 && sep1.slotBaru === 5, JSON.stringify(sep1));
      const duaWaktu = await q<{ label: string; waktu_mulai: string }>(`select label, waktu_mulai::text from ks_slot where periode_id = $1 and label like 'Rabu 16:00 - 17:30 & %'`, [ID.sep]);
      check('jam dua waktu tersimpan dengan label baku', duaWaktu.length === 1 && duaWaktu[0].label === 'Rabu 16:00 - 17:30 & Sabtu 13:00 - 14:30 WIB', JSON.stringify(duaWaktu));
      check('Oktober: Bilal masuk, Ahmad dilindungi', okt1.pengajar === 1 && okt1.jam === 1 && okt1.dilindungi === 1 && okt1.slotBaru === 1, JSON.stringify(okt1));

      const ket = await q<{ nama: string; label: string; prioritas: number | null; bentrok_alasan: string | null; lokasi: string | null; sumber: string; pmode: string }>(
        `select p.name nama, s.label, k.prioritas, k.bentrok_alasan, s.lokasi, i.sumber, i.mode pmode
           from ks_ketersediaan k
           join ks_pengisian i on i.id = k.pengisian_id
           join pengajar p on p.id = i.pengajar_id
           join ks_slot s on s.id = k.slot_id
          where i.periode_id = $1
          order by p.name, s.label`,
        [ID.sep]
      );
      const bilalSabtu = ket.find((k) => k.nama === 'Bilal Hakim' && k.label.startsWith('Sabtu'));
      check('bentrok dicatat, tidak mengunci', Boolean(bilalSabtu?.bentrok_alasan?.includes('HITS 044')), JSON.stringify(bilalSabtu));
      check('halaqah yang sudah selesai tidak tercatat bentrok', ket.find((k) => k.nama === 'Ahmad Fauzan')?.bentrok_alasan === null);
      check('prioritas per jam tersimpan', ket.find((k) => k.nama === 'Bilal Hakim' && k.label.startsWith('Senin'))?.prioritas === 2);
      check('lokasi offline dari judul sheet', ket.find((k) => k.nama === 'Khadijah Maryam')?.lokasi === 'Pejaten');
      check('pengisian Bilal = keduanya', ket.find((k) => k.nama === 'Bilal Hakim')?.pmode === 'keduanya');
      check('semua pengisian September bersumber impor', ket.every((k) => k.sumber === 'impor'));
      const formOkt = await q<{ nama: string }>(
        `select p.name nama from ks_pengisian i join pengajar p on p.id = i.pengajar_id
          where i.periode_id = $1 and i.sumber = 'form' order by 1`,
        [ID.okt]
      );
      check('isian sendiri di Oktober utuh', formOkt.map((r) => r.nama).join() === 'Ahmad Fauzan,Khadijah Maryam', JSON.stringify(formOkt));

      const h2 = await impor.simpanImpor(berkas, pilihan, aktor, 'uji.xlsx');
      const sep2 = h2.periode.find((p) => p.id === ID.sep)!;
      check('impor ulang idempoten', sep2.jam === 6 && sep2.slotBaru === 0 && sep2.dihapus === 0, JSON.stringify(sep2));
      const slotSep = await q<{ n: string }>(`select count(*)::text n from ks_slot where periode_id = $1`, [ID.sep]);
      check('master September: 1 lama + 5 dari impor', slotSep[0].n === '6', slotSep[0].n);

      const h3 = await impor.simpanImpor(await xlsxTiruan({ tanpaBaris: 'bilal-sabtu' }), pilihan, aktor, 'uji.xlsx');
      check('jam yang hilang dari berkas dihapus', h3.periode.find((p) => p.id === ID.sep)?.dihapus === 1, JSON.stringify(h3.periode));

      const log = await q<{ n: string }>(`select count(*)::text n from ks_log where aksi = 'impor_ketersediaan'`);
      check('setiap impor tercatat per periode', log[0].n === '6', log[0].n);
    }

    console.log('\n# banyak CSV pendaftar dalam satu periode');
    {
      const pendaftarLib = await import('../src/lib/ketersediaan-pendaftar');
      const { supabaseAdmin } = await import('../src/lib/supabase-admin');
      const { getPool } = await import('../src/lib/pg-core');
      const q = async <T,>(sql: string, p: unknown[] = []) => (await getPool().query(sql, p)).rows as T[];

      const idPeriode = 'd0000000-0000-4000-8000-0000000000c5';
      await q(`INSERT INTO ks_periode (id, nama, mulai, selesai) VALUES ($1, 'Uji CSV', '2026-09-21', '2026-12-31')`, [idPeriode]);
      await q(
        `INSERT INTO ks_slot (periode_id, kelompok, mode, label, hari, hari_idx, waktu_mulai, waktu_selesai, urutan)
         VALUES ($1, 'akhwat', 'online', 'Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], ARRAY[0,2]::smallint[], '20:00', '21:30', 1)`,
        [idPeriode]
      );
      const pemetaan = { nama: 'Nama', wa: 'WA', gender: 'Jenis Kelamin', umur: 'Usia', level: 'Program', slot: 'Jadwal', timestamp: 'Timestamp' };
      const buatSumber = async (nama: string) => {
        const { data } = await supabaseAdmin
          .from('ks_pendaftar_sumber')
          .insert({ periode_id: idPeriode, nama, csv_url: `https://contoh.test/${nama}.csv`, pemetaan_kolom: pemetaan })
          .select('*')
          .single();
        return data as import('../src/types/db').KsPendaftarSumber;
      };
      const kepala = 'Timestamp,Nama,WA,Jenis Kelamin,Usia,Program,Jadwal';
      const csvLama = [
        kepala,
        '13/09/2026 10.00.00,Fatimah Zahra,081299990001,Perempuan,30,HITS Dasar,Online Senin & Rabu 20:00 - 21:30 WIB',
        '13/09/2026 11.00.00,Maryam Ulfa,081299990002,Perempuan,50,HITS Dasar,"Offline di Pejaten Selasa & Kamis, 16.00 - 17.30"',
      ].join('\n');
      const csvBaru = [
        kepala,
        '15/09/2026 09.00.00,Fatimah Zahra,081299990001,Perempuan,30,HITS Lanjutan,Online Senin & Rabu 20:00 - 21:30 WIB',
      ].join('\n');

      const periode = (await (await import('../src/lib/ketersediaan-periode')).getPeriode(idPeriode))!;
      const sumberA = await buatSumber('formulir-lama');
      const sumberB = await buatSumber('formulir-baru');
      const sekarang = new Date('2026-09-16T05:00:00Z');

      const h1 = await pendaftarLib.terapkanCsvSumber(sumberA, periode, csvLama, sekarang);
      check('CSV pertama: jam Pejaten masuk master', h1.jamBaru === 1, JSON.stringify(h1));
      const maryam = await q<{ status: string; slot_id: string | null }>(
        `SELECT status, slot_id FROM ks_pendaftar WHERE periode_id = $1 AND nama = 'Maryam Ulfa'`, [idPeriode]
      );
      check('pendaftar jam baru langsung valid dengan slot', maryam[0]?.status === 'valid' && Boolean(maryam[0]?.slot_id), JSON.stringify(maryam));

      const h2 = await pendaftarLib.terapkanCsvSumber(sumberB, periode, csvBaru, sekarang);
      check('CSV kedua tidak menambah jam', h2.jamBaru === 0, JSON.stringify(h2));
      const fatimah = async () =>
        q<{ sumber_id: string; status: string }>(
          `SELECT sumber_id, status FROM ks_pendaftar WHERE periode_id = $1 AND nama = 'Fatimah Zahra' ORDER BY didaftar_pada`, [idPeriode]
        );
      let f = await fatimah();
      check(
        'Fatimah di dua CSV: kiriman lama diganti, yang baru valid',
        f.length === 2 && f[0].sumber_id === sumberA.id && f[0].status === 'diganti' && f[1].status === 'valid',
        JSON.stringify(f)
      );

      const h3 = await pendaftarLib.terapkanCsvSumber(sumberA, periode, csvLama, sekarang);
      f = await fatimah();
      check('tarik ulang CSV lama: tetap satu antrean, tanpa jam baru', h3.jamBaru === 0 && f[0].status === 'diganti' && f[1].status === 'valid', JSON.stringify({ h3, f }));
      const valid = await q<{ n: string }>(`SELECT count(*)::text n FROM ks_pendaftar WHERE periode_id = $1 AND status = 'valid'`, [idPeriode]);
      check('antrean periode: 2 orang, bukan 3 baris', valid[0].n === '2', valid[0].n);
    }

    console.log('\n# gabungan dua tahap');
    {
      const { susunGabungan } = await import('../src/lib/ketersediaan-gabungan');
      const periodeLib = await import('../src/lib/ketersediaan-periode');
      const { getPool } = await import('../src/lib/pg-core');
      const q = async <T,>(sql: string, p: unknown[] = []) => (await getPool().query(sql, p)).rows as T[];
      const sep = (await periodeLib.getPeriode(ID.sep))!;
      const okt = (await periodeLib.getPeriode(ID.okt))!;
      // Rahma juga ada di CSV September (orang yang sama, kiriman sama) — tetap satu orang.
      await q(
        `INSERT INTO ks_pendaftar (periode_id, sumber_row_key, nama, wa, wa_normal, slot_id, status, pita_umur)
         VALUES ($1, 'k-rahma', 'Rahma', '6285000000002', '85000000002', $2, 'valid', '46+')`,
        [ID.sep, ID.slotSep]
      );
      const h = await susunGabungan([okt, sep], new Date('2026-09-16T05:00:00Z'));
      const wakil = h.slots.find((s) => s.label === 'Senin & Rabu 20:00 - 21:30 WIB' && s.kelompok === 'akhwat');
      check('jam sama dua tahap jadi satu baris', h.slots.filter((s) => s.label === 'Senin & Rabu 20:00 - 21:30 WIB' && s.kelompok === 'akhwat').length === 1);
      const r = wakil ? h.ringkas.get(wakil.id) : undefined;
      check('Rahma di dua CSV dihitung sekali', r?.antre === 1, JSON.stringify(r));
      check('Siti sudah dialokasikan di September tidak ikut antre', r?.dialokasikan === 1, JSON.stringify(r));
      check('urutan tahap menurut tanggal mulai', h.periode[0].id === ID.sep, JSON.stringify(h.periode));
      const tot = h.pengajar.ikhwan.total + h.pengajar.akhwat.total;
      const perTahap = [...h.pengajar.ikhwan.perTahap, ...h.pengajar.akhwat.perTahap].reduce((n, t) => n + t.n, 0);
      check('pengajar gabungan tidak lebih dari jumlah per tahap', tot > 0 && tot <= perTahap, JSON.stringify(h.pengajar));
      check('simulasi tidak menulis usulan', (await q<{ n: string }>('select count(*)::text n from ks_usulan'))[0].n === '0');
    }
  } finally {
    await server.stop();
    await db.close();
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('UJI GAGAL DIJALANKAN', e);
  process.exit(1);
});
