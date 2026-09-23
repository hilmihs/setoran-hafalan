/**
 * test-takhassus-via.ts — uji presensi & setoran Takhassus akhwat LEWAT kelas
 * halaqah (`program_kelas.presensi_via_halaqah_mulai`, spec 2026-09-23) terhadap
 * Postgres sungguhan (PGlite), memakai getLaporanMaahir & getTakhassusVia apa
 * adanya.
 *
 * Tanggal pengalihan diletakkan DI TENGAH periode '2026-08' (28 Jul–27 Agu),
 * supaya satu laporan memuat kedua sisi: sesi kelas Takhassus sebelum 11 Agu
 * dan sesi halaqah sesudahnya. (Rilis sebenarnya jatuh tepat di awal periode,
 * 28 Sep — kasus yang lebih sederhana.)
 *
 * Jalankan: npm run test-takhassus-via
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PG_TEST_PORT ?? 54334);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

const MONTH = '2026-08'; // 28 Jul – 27 Agu 2026
const VIA = '2026-08-11'; // Selasa

const SCHEMA = `
CREATE TABLE program_kelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gender text NOT NULL,
  jadwal_hari text[] DEFAULT '{}',
  waktu_mulai time, waktu_selesai time,
  ketua_wa text, wakil_wa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  self_attendance boolean NOT NULL DEFAULT false,
  presensi_sifat text NOT NULL DEFAULT 'harian',
  mulai_tanggal date,
  ikut_tibyan boolean NOT NULL DEFAULT true,
  presensi_via_halaqah_mulai date
);
CREATE TABLE program_kelas_anggota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_kelas_id uuid NOT NULL REFERENCES program_kelas(id) ON DELETE CASCADE,
  peserta_id uuid,
  name text NOT NULL,
  whatsapp_number text,
  is_ketua boolean NOT NULL DEFAULT false,
  is_wakil boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  mulai_tanggal date,
  active boolean NOT NULL DEFAULT true,
  selesai_tanggal date
);
CREATE TABLE pertemuan_program (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_kelas_id uuid NOT NULL REFERENCES program_kelas(id) ON DELETE CASCADE,
  program text NOT NULL,
  tanggal date NOT NULL,
  nama_kegiatan text NOT NULL DEFAULT 'Kelas Maahir',
  waktu_mulai time, waktu_selesai time
);
CREATE TABLE kehadiran_peserta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pertemuan_id uuid NOT NULL REFERENCES pertemuan_program(id) ON DELETE CASCADE,
  anggota_id uuid REFERENCES program_kelas_anggota(id) ON DELETE CASCADE,
  status text NOT NULL,
  catatan text,
  diisi_at timestamptz,
  setoran_halaman integer,
  mode text
);
CREATE TABLE program_kelas_libur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_kelas_id uuid REFERENCES program_kelas(id) ON DELETE CASCADE,
  tanggal_mulai date NOT NULL,
  tanggal_selesai date NOT NULL,
  keterangan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE maahir_pemutihan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anggota_id uuid NOT NULL REFERENCES program_kelas_anggota(id) ON DELETE CASCADE,
  month text NOT NULL,
  alasan text,
  dibuat_oleh text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tanggal date,
  dibatalkan_pada timestamptz,
  dibatalkan_oleh text,
  batch_id uuid
);
CREATE TABLE laporan_maahir_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL,
  teks text NOT NULL,
  urutan int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE TABLE maahir_setoran_target (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_kelas_id uuid NOT NULL REFERENCES program_kelas(id) ON DELETE CASCADE,
  anggota_id uuid REFERENCES program_kelas_anggota(id) ON DELETE CASCADE,
  halaman_per_bulan numeric NOT NULL CHECK (halaman_per_bulan > 0),
  berlaku_mulai date NOT NULL,
  catatan text,
  dibuat_oleh text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX maahir_setoran_target_versi_uniq
  ON maahir_setoran_target (program_kelas_id, anggota_id, berlaku_mulai) NULLS NOT DISTINCT;
`;

const K_TAKH = '41111111-1111-4111-8111-111111111111';
const K_SEL = '41111111-1111-4111-8111-111111111112';
const K_RAB = '41111111-1111-4111-8111-111111111113';
const K_TIBYAN = '41111111-1111-4111-8111-111111111114';

const T_SALMA = '42222222-2222-4222-8222-222222222221';
const T_RADI = '42222222-2222-4222-8222-222222222222';
const T_CUTI = '42222222-2222-4222-8222-222222222223';
const H_SALMA = '42222222-2222-4222-8222-222222222224';
const H_RADI = '42222222-2222-4222-8222-222222222225';
const H_BIASA = '42222222-2222-4222-8222-222222222226';
const G_SALMA = '42222222-2222-4222-8222-222222222227';

const SEED = `
INSERT INTO program_kelas (id, name, gender, jadwal_hari, ikut_tibyan, presensi_via_halaqah_mulai) VALUES
  ('${K_TAKH}', 'Maahir Takhassus Akhwat', 'akhwat', ARRAY['Selasa','Rabu','Jum''at'], false, '${VIA}'),
  ('${K_SEL}', 'Maahir Halaqah Tahfizh Pagi (Selasa)', 'akhwat', ARRAY['Selasa'], false, NULL),
  ('${K_RAB}', 'Maahir Halaqah Tahfizh Pagi (Rabu)', 'akhwat', ARRAY['Rabu'], false, NULL),
  ('${K_TIBYAN}', 'Maahir Halaqah Tahfizh (At-Tibyan)', 'akhwat', '{}', true, NULL);

INSERT INTO program_kelas_anggota (id, program_kelas_id, name, whatsapp_number, mulai_tanggal) VALUES
  ('${T_SALMA}', '${K_TAKH}', 'Salma', '628400000001', NULL),
  ('${T_RADI}',  '${K_TAKH}', 'Radiatam', '628400000002', NULL),
  ('${T_CUTI}',  '${K_TAKH}', 'Cuti', '628400000003', NULL),
  ('${H_SALMA}', '${K_SEL}',  'Salma', '628400000001', '${VIA}'),
  ('${H_RADI}',  '${K_RAB}',  'Radiatam', '628400000002', '${VIA}'),
  ('${H_BIASA}', '${K_SEL}',  'Biasa', '628400000004', NULL),
  ('${G_SALMA}', '${K_TIBYAN}', 'Salma', '628400000001', NULL);
`;

// Sesi kelas Takhassus sebelum VIA (Sel/Rab/Jum 28 Jul – 10 Agu).
const TAKH_PRA = ['2026-07-28', '2026-07-29', '2026-07-31', '2026-08-04', '2026-08-05', '2026-08-07'];

async function main() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SEED);

  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.PG_POOL_MAX = '1';
  process.env.SESSION_SECRET ??= 'x'.repeat(48);

  const { getLaporanMaahir } = await import('../src/lib/laporan-maahir');
  const { simpanTarget } = await import('../src/lib/setoran-target');
  const { getTakhassusVia, setorViaHalaqah } = await import('../src/lib/takhassus-via-halaqah');

  async function isi(kelasId: string, anggotaId: string, tanggal: string, opts?: {
    status?: string; halaman?: number; program?: string;
  }) {
    const program = opts?.program ?? 'kelas_maahir';
    const hal = opts?.halaman ?? null;
    await db.exec(`
      INSERT INTO pertemuan_program (program_kelas_id, program, tanggal)
      SELECT '${kelasId}', '${program}', '${tanggal}'
       WHERE NOT EXISTS (SELECT 1 FROM pertemuan_program
                          WHERE program_kelas_id='${kelasId}' AND program='${program}'
                            AND tanggal='${tanggal}');
      INSERT INTO kehadiran_peserta (pertemuan_id, anggota_id, status, catatan, diisi_at, setoran_halaman)
      SELECT id, '${anggotaId}', '${opts?.status ?? 'hadir'}', 'uji', now(), ${hal === null ? 'NULL' : hal}
        FROM pertemuan_program
       WHERE program_kelas_id='${kelasId}' AND program='${program}' AND tanggal='${tanggal}';
    `);
  }

  try {
    console.log('\n1. getTakhassusVia & setorViaHalaqah');
    {
      const via = await getTakhassusVia();
      check('3 WA takhassus terdaftar', via.size === 3, String(via.size));
      check('mulai = VIA', via.get('628400000001')?.mulai === VIA);
      const salmaHalaqah = { program_kelas_id: K_SEL, whatsapp_number: '628400000001' };
      check('baris halaqah Salma setor sejak VIA', setorViaHalaqah(via, salmaHalaqah, VIA));
      check('… tidak sebelum VIA', !setorViaHalaqah(via, salmaHalaqah, '2026-08-10'));
      check('baris Takhassus-nya sendiri bukan "via"',
        !setorViaHalaqah(via, { program_kelas_id: K_TAKH, whatsapp_number: '628400000001' }, VIA));
      check('peserta halaqah biasa tak setor',
        !setorViaHalaqah(via, { program_kelas_id: K_SEL, whatsapp_number: '628400000004' }, VIA));
    }

    // Target: 32 sejak Juni (lama), 80 sejak VIA.
    await simpanTarget({ programKelasId: K_TAKH, anggotaId: null, halamanPerBulan: 32,
      berlakuMulai: '2026-06-01', catatan: null, dibuatOleh: 'Uji' });
    await simpanTarget({ programKelasId: K_TAKH, anggotaId: null, halamanPerBulan: 80,
      berlakuMulai: VIA, catatan: null, dibuatOleh: 'Uji' });

    // Sebelum VIA: ketua Takhassus mengisi kelas Takhassus.
    for (const [i, t] of TAKH_PRA.entries()) {
      await isi(K_TAKH, T_SALMA, t, i === 5 ? { status: 'tidak_ada_keterangan' } : { halaman: 2 });
      await isi(K_TAKH, T_RADI, t);
    }
    // Sesudah VIA: ketua halaqah mengisi.
    await isi(K_SEL, H_SALMA, '2026-08-11', { halaman: 5 });
    await isi(K_SEL, H_SALMA, '2026-08-18', { status: 'izin' });
    await isi(K_SEL, H_SALMA, '2026-08-25', { halaman: 4 });
    for (const t of ['2026-08-11', '2026-08-18', '2026-08-25']) await isi(K_SEL, H_BIASA, t);
    await isi(K_RAB, H_RADI, '2026-08-12', { halaman: 3 });
    await isi(K_RAB, H_RADI, '2026-08-19', { halaman: 3 });
    await isi(K_RAB, H_RADI, '2026-08-26', { status: 'tidak_ada_keterangan' });
    // At-Tibyan Salma tetap di kelas gabungan.
    await isi(K_TIBYAN, G_SALMA, '2026-08-01', { program: 'at_tibyan' });

    const lap = await getLaporanMaahir(MONTH);
    const takhHadir = [...lap.takhassus.dibawahTarget.list];
    const setoran = lap.takhassus.setoran.peserta;
    const s = (n: string) => setoran.find((p) => p.name === n);

    console.log('\n2. Setoran & target digabung di blok Takhassus');
    {
      const salma = s('Salma');
      check('Salma satu baris saja', setoran.filter((p) => p.name === 'Salma').length === 1);
      check('halaman = 10 (Takhassus) + 9 (halaqah) = 19', salma?.halaman === 19, String(salma?.halaman));
      check('sesiTarget = 6 + 3 = 9', salma?.sesiTarget === 9, String(salma?.sesiTarget));
      check('target 80 (versi pada sesi terakhir)', salma?.target === 80, String(salma?.target));
      check('persen = 24', salma?.persen === 24, String(salma?.persen));
      check('kelas tetap Takhassus', salma?.kelasName === 'Maahir Takhassus Akhwat', salma?.kelasName);
      const radi = s('Radiatam');
      check('Radiatam halaman 6', radi?.halaman === 6, String(radi?.halaman));
      check('Radiatam sesiTarget 9', radi?.sesiTarget === 9, String(radi?.sesiTarget));
      const cuti = s('Cuti');
      check('peserta cuti (tanpa halaqah) hanya sesi pra-VIA = 6', cuti?.sesiTarget === 6, String(cuti?.sesiTarget));
      check('baris halaqah tak jadi peserta setoran tersendiri', setoran.length === 3, String(setoran.length));
    }

    console.log('\n3. Kehadiran digabung di blok Takhassus');
    {
      const salma = takhHadir.find((x) => x.name === 'Salma');
      // 6 Takhassus (5 H, 1 A) + 3 halaqah (2 H, 1 I) → 7/9 = 78%
      check('Salma di bawah target, 78%', salma?.persen === 78, String(salma?.persen));
      check('terisi 9', salma?.terisi === 9, String(salma?.terisi));
      check('riwayat: 1 alpa + 1 izin', salma?.riwayat.length === 2, JSON.stringify(salma?.riwayat));
      check('riwayat urut tanggal', salma?.riwayat[0]?.tanggal === '2026-08-07' && salma?.riwayat[1]?.tanggal === '2026-08-18');
      // Radiatam: 6 H + 2 H + 1 A = 8/9 = 89% (≥ 80, tak di daftar bawah).
      check('Radiatam tak di bawah target', !takhHadir.some((x) => x.name === 'Radiatam'));
      // Cuti: 6 sesi Takhassus pra-VIA tanpa baris → 0%; sesudah VIA tak ditagih.
      const cuti = takhHadir.find((x) => x.name === 'Cuti');
      check('Cuti terisi 6 (bukan ikut sesi pasca-VIA)', cuti?.terisi === 6, String(cuti?.terisi));
      // Rata-rata akhwat Takhassus = (78 + 89 + 0) / 3 ≈ 56.
      check('rata-rata akhwat Takhassus 56', lap.takhassus.kehadiran.avgAkhwat === 56,
        String(lap.takhassus.kehadiran.avgAkhwat));
    }

    console.log('\n4. Tak dobel di blok Halaqah');
    {
      const maahir = lap.maahir.dibawahTarget.list;
      check('Salma/Radiatam tak ada di blok Halaqah',
        !maahir.some((x) => x.name === 'Salma' || x.name === 'Radiatam'), JSON.stringify(maahir.map((x) => x.name)));
      // Biasa hadir 3/3 sejak VIA, tapi 28 Jul & 4 Agu tak terisi → tak menagih.
      check('rata-rata akhwat Halaqah = Biasa 100', lap.maahir.kehadiran.avgAkhwat === 100, String(lap.maahir.kehadiran.avgAkhwat));
    }

    console.log('\n5. At-Tibyan tetap di kelas gabungan');
    {
      check('rata-rata At-Tibyan akhwat 100 (Salma dari kelas gabungan)', lap.atTibyan.kehadiran.avgAkhwat === 100,
        String(lap.atTibyan.kehadiran.avgAkhwat));
    }

    console.log('\n6. Kelas Takhassus tak tercatat lalai sesudah VIA');
    {
      const takh = lap.presensiTakTerisi.find((x) => x.kelasName === 'Maahir Takhassus Akhwat');
      check('tak ada sesi Takhassus hilang', !takh, JSON.stringify(takh));
      const sel = lap.presensiTakTerisi.find((x) => x.kelasName.includes('(Selasa)'));
      check('halaqah Selasa: 28 Jul & 4 Agu memang tak terisi', sel?.jumlah === 2, JSON.stringify(sel));
    }

    console.log('\n7. Laporan Juli (sebelum VIA) tak tersentuh');
    {
      await isi(K_TAKH, T_SALMA, '2026-07-21', { halaman: 7 });
      const jul = await getLaporanMaahir('2026-07');
      const salma = jul.takhassus.setoran.peserta.find((p) => p.name === 'Salma');
      check('halaman Juli = 7', salma?.halaman === 7, String(salma?.halaman));
      check('target Juli = 32', salma?.target === 32, String(salma?.target));
    }
  } finally {
    await server.stop();
    await db.close();
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
