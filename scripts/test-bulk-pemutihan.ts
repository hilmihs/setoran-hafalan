/**
 * test-bulk-pemutihan.ts — uji pemutihan massal (batch), scope SP yang kini
 * mencakup At-Tibyan, dan tanggal penetapan SP. Berjalan di atas Postgres
 * sungguhan (PGlite via wire-protocol) memakai lib aplikasi apa adanya.
 *
 * Jalankan: npm run test-bulk
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PG_TEST_PORT ?? 54332);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

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
  mulai_tanggal date
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
CREATE TABLE maahir_pemutihan_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL,
  alasan text,
  kelas_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  jumlah_peserta int NOT NULL DEFAULT 0,
  dibuat_oleh text,
  created_at timestamptz NOT NULL DEFAULT now(),
  dibatalkan_pada timestamptz,
  dibatalkan_oleh text
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
  batch_id uuid REFERENCES maahir_pemutihan_batch(id)
);
CREATE UNIQUE INDEX maahir_pemutihan_aktif_uniq
  ON maahir_pemutihan (anggota_id, month, tanggal) NULLS NOT DISTINCT
  WHERE dibatalkan_pada IS NULL;
`;

// Dua kelas: satu diputihkan massal, satu sengaja dikecualikan — meniru kasus
// nyata "semua kelas kecuali Maahir 6A & 6B Ikhwan".
const KELAS_IKUT = '11111111-1111-4111-8111-111111111111';
const KELAS_KECUALI = '11111111-1111-4111-8111-111111111112';

const ANG_TIBYAN = '22222222-2222-4222-8222-222222222221'; // pelanggaran HANYA di At-Tibyan
const ANG_CAMPUR = '22222222-2222-4222-8222-222222222222'; // alpa kelas + izin tibyan
const ANG_SUDAH = '22222222-2222-4222-8222-222222222223'; // sudah punya pemutihan sebulan
const ANG_LUAR = '22222222-2222-4222-8222-222222222224'; // di kelas yang dikecualikan

// Periode laporan '2026-03' = 2026-02-28 s/d 2026-03-27.
const MONTH = '2026-03';
const T1 = '2026-03-03';
const T2 = '2026-03-05';
const T3 = '2026-03-10';
const T4 = '2026-03-12';

const SEED = `
INSERT INTO program_kelas (id, name, gender, jadwal_hari, presensi_sifat) VALUES
  ('${KELAS_IKUT}',    'Maahir Talaqqi Uji', 'ikhwan', ARRAY['Selasa','Kamis'], 'harian'),
  ('${KELAS_KECUALI}', 'Maahir 6A - Ikhwan', 'ikhwan', ARRAY['Selasa','Kamis'], 'harian');

INSERT INTO program_kelas_anggota (id, program_kelas_id, name, whatsapp_number) VALUES
  ('${ANG_TIBYAN}', '${KELAS_IKUT}',    'Peserta Tibyan', '628200000001'),
  ('${ANG_CAMPUR}', '${KELAS_IKUT}',    'Peserta Campur', '628200000002'),
  ('${ANG_SUDAH}',  '${KELAS_IKUT}',    'Peserta Sudah',  '628200000003'),
  ('${ANG_LUAR}',   '${KELAS_KECUALI}', 'Peserta Luar',   '628200000004');

INSERT INTO pertemuan_program (id, program_kelas_id, program, tanggal) VALUES
  ('aaaaaaa2-0000-4000-8000-000000000001', '${KELAS_IKUT}',    'kelas_maahir', '${T1}'),
  ('aaaaaaa2-0000-4000-8000-000000000002', '${KELAS_IKUT}',    'at_tibyan',    '${T2}'),
  ('aaaaaaa2-0000-4000-8000-000000000003', '${KELAS_IKUT}',    'at_tibyan',    '${T3}'),
  ('aaaaaaa2-0000-4000-8000-000000000004', '${KELAS_IKUT}',    'muallim_najih','${T4}'),
  ('aaaaaaa2-0000-4000-8000-000000000005', '${KELAS_KECUALI}', 'kelas_maahir', '${T1}'),
  ('aaaaaaa2-0000-4000-8000-000000000006', '${KELAS_KECUALI}', 'at_tibyan',    '${T2}');

INSERT INTO kehadiran_peserta (pertemuan_id, anggota_id, status, diisi_at) VALUES
  -- Tibyan: hadir di kelas, dua alpa di At-Tibyan → dulu tak terhitung sama sekali.
  ('aaaaaaa2-0000-4000-8000-000000000001', '${ANG_TIBYAN}', 'hadir', now()),
  ('aaaaaaa2-0000-4000-8000-000000000002', '${ANG_TIBYAN}', 'tidak_ada_keterangan', now()),
  ('aaaaaaa2-0000-4000-8000-000000000003', '${ANG_TIBYAN}', 'tidak_ada_keterangan', now()),
  -- muallim_najih harus tetap di luar scope SP.
  ('aaaaaaa2-0000-4000-8000-000000000004', '${ANG_TIBYAN}', 'tidak_ada_keterangan', now()),
  -- Campur: 1 alpa kelas (T1) lalu 1 izin tibyan (T2).
  ('aaaaaaa2-0000-4000-8000-000000000001', '${ANG_CAMPUR}', 'tidak_ada_keterangan', now()),
  ('aaaaaaa2-0000-4000-8000-000000000002', '${ANG_CAMPUR}', 'izin', now()),
  ('aaaaaaa2-0000-4000-8000-000000000003', '${ANG_CAMPUR}', 'hadir', now()),
  -- Sudah: 1 alpa kelas.
  ('aaaaaaa2-0000-4000-8000-000000000001', '${ANG_SUDAH}', 'tidak_ada_keterangan', now()),
  -- Luar: 2 alpa, di kelas yang dikecualikan.
  ('aaaaaaa2-0000-4000-8000-000000000005', '${ANG_LUAR}', 'tidak_ada_keterangan', now()),
  ('aaaaaaa2-0000-4000-8000-000000000006', '${ANG_LUAR}', 'tidak_ada_keterangan', now());
`;

async function main() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SEED);

  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.PG_POOL_MAX = '1';

  // Import SETELAH DATABASE_URL di-set — pool dibaca saat koneksi pertama.
  const { getMaahirSP, getSPDetail, hitungPenetapan } = await import('../src/lib/maahir-sp');
  const { buatBatch, batalkanBatch, getBatches, getKelasPilihan } = await import(
    '../src/lib/maahir-pemutihan-batch'
  );
  const { putihkanBulan, getRiwayatPemutihan } = await import('../src/lib/maahir-pemutihan');

  try {
    console.log('\n1. Scope SP kini mencakup At-Tibyan');
    {
      const { list } = await getMaahirSP();
      const t = list.find((p) => p.name === 'Peserta Tibyan');
      const c = list.find((p) => p.name === 'Peserta Campur');
      check('alpa At-Tibyan ikut dihitung', t?.alpa === 2, JSON.stringify(t));
      check('Peserta Tibyan kena SP2 (2 alpa)', t?.sp === 2, String(t?.sp));
      check('muallim_najih TIDAK ikut (alpa tetap 2, bukan 3)', t?.alpa === 2, String(t?.alpa));
      check('izin At-Tibyan ikut dihitung', c?.izin === 1, JSON.stringify(c));
      check('Peserta Campur SP1 (1 alpa)', c?.sp === 1, String(c?.sp));
    }

    console.log('\n2. Tanggal penetapan menunjuk sesi pemicu');
    {
      const { list } = await getMaahirSP();
      const t = list.find((p) => p.name === 'Peserta Tibyan');
      check('Tibyan punya 2 penetapan', t?.penetapan.length === 2, JSON.stringify(t?.penetapan));
      check('SP1 pada alpa pertama', t?.penetapan[0]?.tanggal === T2, String(t?.penetapan[0]?.tanggal));
      check('SP1 dipicu alpa', t?.penetapan[0]?.pemicu === 'alpa');
      check('SP2 pada alpa kedua', t?.penetapan[1]?.tanggal === T3, String(t?.penetapan[1]?.tanggal));
      check('level menaik', t?.penetapan.map((p) => p.level).join() === '1,2');

      // Ambang izin: 2×→SP1, 3×→SP2, 4×→SP3.
      const murni = hitungPenetapan([
        { tanggal: '2026-01-05', jenis: 'izin' },
        { tanggal: '2026-01-12', jenis: 'izin' },
        { tanggal: '2026-01-19', jenis: 'izin' },
      ]);
      check('izin ke-2 memicu SP1', murni[0]?.level === 1 && murni[0]?.tanggal === '2026-01-12');
      check('izin ke-3 memicu SP2', murni[1]?.level === 2 && murni[1]?.tanggal === '2026-01-19');
      check('tak ada penetapan tanpa pelanggaran', hitungPenetapan([]).length === 0);
    }

    console.log('\n3. Daftar kelas untuk layar pemilihan');
    {
      const kelas = await getKelasPilihan(MONTH);
      const ikut = kelas.find((k) => k.id === KELAS_IKUT);
      const kecuali = kelas.find((k) => k.id === KELAS_KECUALI);
      check('kelas ikut punya 3 anggota', ikut?.jumlahAnggota === 3, String(ikut?.jumlahAnggota));
      check('kelas dikecualikan punya 1 anggota', kecuali?.jumlahAnggota === 1);
    }

    console.log('\n4. Batch melewati yang sudah diputihkan, tak menyentuh kelas lain');
    let batchId = '';
    {
      await putihkanBulan(ANG_SUDAH, MONTH, 'sudah diurus manual', 'Ust Lama');
      const res = await buatBatch({
        month: MONTH,
        kelasIds: [KELAS_IKUT],
        alasan: 'libur pesantren',
        oleh: 'Ust Uji',
      });
      check('batch tidak error', !res.error, res.error ?? '');
      check('2 peserta diputihkan', res.dibuat === 2, String(res.dibuat));
      check('1 peserta dilewati', res.dilewati === 1, String(res.dilewati));
      batchId = res.batchId ?? '';
      check('batchId dikembalikan', !!batchId);

      const riwayat = await getRiwayatPemutihan(MONTH);
      const punyaSudah = riwayat.find((r) => r.anggotaId === ANG_SUDAH);
      check('alasan lama TIDAK ditimpa', punyaSudah?.alasan === 'sudah diurus manual', String(punyaSudah?.alasan));
      check('peserta kelas lain tak tersentuh', !riwayat.some((r) => r.anggotaId === ANG_LUAR));
    }

    console.log('\n5. SP luruh untuk kelas terpilih, tetap untuk yang dikecualikan');
    {
      const { list } = await getMaahirSP();
      const t = list.find((p) => p.name === 'Peserta Tibyan');
      const luar = list.find((p) => p.name === 'Peserta Luar');
      check('Tibyan sp efektif jadi 0', t?.sp === 0, String(t?.sp));
      check('Tibyan spKotor tetap 2 (bank data)', t?.spKotor === 2, String(t?.spKotor));
      check('Tibyan tak punya penetapan lagi', t?.penetapan.length === 0);
      check('Peserta Luar tetap SP2', luar?.sp === 2, String(luar?.sp));
    }

    console.log('\n6. Riwayat batch terbaca');
    {
      const batches = await getBatches(MONTH);
      const b = batches.find((x) => x.id === batchId);
      check('batch tercatat', !!b);
      check('jumlah_peserta = 2', b?.jumlahPeserta === 2, String(b?.jumlahPeserta));
      check('kelas_ids tersimpan', b?.kelasIds.join() === KELAS_IKUT, JSON.stringify(b?.kelasIds));
      check('pembuat tercatat', b?.dibuatOleh === 'Ust Uji');
      check('belum dibatalkan', b?.dibatalkanPada === null);
    }

    console.log('\n7. Batalkan batch mengembalikan SP, jejak tetap ada');
    {
      const res = await batalkanBatch(batchId, 'Ust Afwan');
      check('pembatalan tidak error', !res.error, res.error ?? '');

      const { list } = await getMaahirSP();
      const t = list.find((p) => p.name === 'Peserta Tibyan');
      check('Tibyan kembali SP2', t?.sp === 2, String(t?.sp));
      check('penetapan pulih', t?.penetapan.length === 2, JSON.stringify(t?.penetapan));

      const riwayat = await getRiwayatPemutihan(MONTH);
      const barisBatch = riwayat.filter((r) => r.dibatalkanPada !== null);
      check('2 baris ditandai dibatalkan', barisBatch.length === 2, String(barisBatch.length));
      check('pembatal tercatat', barisBatch.every((r) => r.dibatalkanOleh === 'Ust Afwan'));

      const punyaSudah = riwayat.find((r) => r.anggotaId === ANG_SUDAH);
      check('pemutihan manual TIDAK ikut dibatalkan', punyaSudah?.dibatalkanPada === null);

      const batches = await getBatches(MONTH);
      check('batch ditandai dibatalkan', batches.find((x) => x.id === batchId)?.dibatalkanPada !== null);
    }

    console.log('\n8. Penolakan masukan yang tak sah');
    {
      const kosong = await buatBatch({ month: MONTH, kelasIds: [], alasan: null, oleh: 'x' });
      check('kelas kosong ditolak', !!kosong.error, JSON.stringify(kosong));
      const bulanSalah = await buatBatch({ month: 'bukan-bulan', kelasIds: [KELAS_IKUT], alasan: null, oleh: 'x' });
      check('bulan tak sah ditolak', !!bulanSalah.error);
      const asing = await buatBatch({
        month: MONTH,
        kelasIds: ['99999999-9999-4999-8999-999999999999'],
        alasan: null,
        oleh: 'x',
      });
      check('kelas tak dikenal ditolak', !!asing.error, JSON.stringify(asing));
    }

    console.log('\n9. Rincian peserta ikut memakai scope baru');
    {
      const d = await getSPDetail(ANG_CAMPUR);
      check('detail ketemu', !!d);
      check('sesi mencakup alpa kelas + izin tibyan', d?.sesi.length === 2, String(d?.sesi.length));
      check('penetapan detail ada', (d?.penetapan.length ?? 0) === 1, JSON.stringify(d?.penetapan));
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
