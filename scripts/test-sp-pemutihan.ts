/**
 * test-sp-pemutihan.ts — uji Pendataan SP + pemutihan bertanggal terhadap
 * Postgres sungguhan (PGlite via wire-protocol), memakai lib aplikasi apa
 * adanya: getMaahirSP, getSPDetail, putihkanTanggal, batalkanPemutihan.
 *
 * Skema yang dibuat di sini sengaja minimal — hanya tabel yang disentuh alur SP.
 * Jalankan: npm run test-sp
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PG_TEST_PORT ?? 54331);

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
CREATE TABLE maahir_pemutihan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anggota_id uuid NOT NULL REFERENCES program_kelas_anggota(id) ON DELETE CASCADE,
  month text NOT NULL,
  alasan text,
  dibuat_oleh text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tanggal date,
  dibatalkan_pada timestamptz,
  dibatalkan_oleh text
);
CREATE UNIQUE INDEX maahir_pemutihan_aktif_uniq
  ON maahir_pemutihan (anggota_id, month, tanggal) NULLS NOT DISTINCT
  WHERE dibatalkan_pada IS NULL;
`;

// Sengaja jauh di masa lalu supaya tak pernah tersentuh cutoff "hari ini".
const KELAS_ID = '11111111-1111-4111-8111-111111111111';
const ANG_A = '22222222-2222-4222-8222-222222222222'; // 3 alpa → SP3
const ANG_B = '33333333-3333-4333-8333-333333333333'; // 1 alpa → SP1, akan diputihkan
const TGL = ['2026-03-03', '2026-03-05', '2026-03-10', '2026-03-12'];

const SEED = `
INSERT INTO program_kelas (id, name, gender, jadwal_hari, presensi_sifat)
  VALUES ('${KELAS_ID}', 'Kelas Uji', 'ikhwan', ARRAY['Selasa','Kamis'], 'harian');
INSERT INTO program_kelas_anggota (id, program_kelas_id, name, whatsapp_number)
  VALUES ('${ANG_A}', '${KELAS_ID}', 'Peserta A', '628100000001'),
         ('${ANG_B}', '${KELAS_ID}', 'Peserta B', '628100000002');
INSERT INTO pertemuan_program (id, program_kelas_id, program, tanggal) VALUES
  ('aaaaaaa1-0000-4000-8000-000000000001', '${KELAS_ID}', 'kelas_maahir', '${TGL[0]}'),
  ('aaaaaaa1-0000-4000-8000-000000000002', '${KELAS_ID}', 'kelas_maahir', '${TGL[1]}'),
  ('aaaaaaa1-0000-4000-8000-000000000003', '${KELAS_ID}', 'kelas_maahir', '${TGL[2]}'),
  ('aaaaaaa1-0000-4000-8000-000000000004', '${KELAS_ID}', 'kelas_maahir', '${TGL[3]}');
INSERT INTO kehadiran_peserta (pertemuan_id, anggota_id, status, diisi_at) VALUES
  ('aaaaaaa1-0000-4000-8000-000000000001', '${ANG_A}', 'tidak_ada_keterangan', now()),
  ('aaaaaaa1-0000-4000-8000-000000000002', '${ANG_A}', 'tidak_ada_keterangan', now()),
  ('aaaaaaa1-0000-4000-8000-000000000003', '${ANG_A}', 'tidak_ada_keterangan', now()),
  ('aaaaaaa1-0000-4000-8000-000000000004', '${ANG_A}', 'hadir', now()),
  ('aaaaaaa1-0000-4000-8000-000000000001', '${ANG_B}', 'tidak_ada_keterangan', now()),
  ('aaaaaaa1-0000-4000-8000-000000000002', '${ANG_B}', 'hadir', now()),
  ('aaaaaaa1-0000-4000-8000-000000000003', '${ANG_B}', 'hadir', now()),
  ('aaaaaaa1-0000-4000-8000-000000000004', '${ANG_B}', 'hadir', now());
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
  const { getMaahirSP, getSPDetail } = await import('../src/lib/maahir-sp');
  const { putihkanTanggal, batalkanPemutihan, getRiwayatPemutihan } = await import(
    '../src/lib/maahir-pemutihan'
  );

  try {
    // 1. Baseline — belum ada pemutihan.
    {
      const { list, summary } = await getMaahirSP();
      const a = list.find((p) => p.name === 'Peserta A');
      const b = list.find((p) => p.name === 'Peserta B');
      check('A kena SP3 (3 alpa)', a?.sp === 3, JSON.stringify(a));
      check('B kena SP1 (1 alpa)', b?.sp === 1, JSON.stringify(b));
      check('spKotor = sp saat belum diputihkan', a?.spKotor === 3 && b?.spKotor === 1);
      check('summary.total = 2', summary.total === 2, String(summary.total));
      check('summary.diputihkan = 0', summary.diputihkan === 0);
    }

    // 2. Putihkan satu tanggal alpa milik B → SP-nya luruh, TAPI tetap terdaftar.
    await putihkanTanggal(ANG_B, [TGL[0]], 'sakit, ada surat dokter', 'Ustadzah Uji');
    {
      const { list, summary } = await getMaahirSP();
      const b = list.find((p) => p.name === 'Peserta B');
      check('B tetap ada di daftar (bank data)', !!b);
      check('B sp efektif jadi 0', b?.sp === 0, String(b?.sp));
      check('B spKotor tetap 1', b?.spKotor === 1, String(b?.spKotor));
      check('B alpa efektif jadi 0', b?.alpa === 0, String(b?.alpa));
      check('B punya 1 catatan pemutihan', b?.diputihkan.length === 1);
      check('alasan terbawa', b?.diputihkan[0]?.alasan === 'sakit, ada surat dokter');
      check('oleh terbawa', b?.diputihkan[0]?.oleh === 'Ustadzah Uji');
      check('summary.total kembali 1 (hanya SP efektif)', summary.total === 1, String(summary.total));
      check('summary.diputihkan = 1', summary.diputihkan === 1, String(summary.diputihkan));
    }

    // 3. Pemutihan satu tanggal TIDAK boleh menyeret tanggal lain.
    await putihkanTanggal(ANG_A, [TGL[0]], 'izin keluarga', 'Ustadzah Uji');
    {
      const { list } = await getMaahirSP();
      const a = list.find((p) => p.name === 'Peserta A');
      check('A tinggal 2 alpa (bukan 0)', a?.alpa === 2, String(a?.alpa));
      check('A turun ke SP2', a?.sp === 2, String(a?.sp));
      check('A spKotor tetap 3', a?.spKotor === 3, String(a?.spKotor));
    }

    // 4. Rincian per peserta.
    {
      const d = await getSPDetail(ANG_A);
      check('detail A ketemu', !!d);
      check('detail A: 3 sesi izin/alpa', d?.sesi.length === 3, String(d?.sesi.length));
      const diputihkan = d?.sesi.filter((s) => s.pemutihan !== null) ?? [];
      check('detail A: 1 sesi bertanda diputihkan', diputihkan.length === 1);
      check('detail A: sesi urut terbaru dulu', (d?.sesi[0]?.tanggal ?? '') > (d?.sesi[2]?.tanggal ?? ''));
      check('detail A: riwayat berisi 1 baris', d?.riwayat.length === 1);
    }

    // 5. Pembatalan meninggalkan jejak & mengembalikan SP.
    {
      const riwayat = await getRiwayatPemutihan();
      const punyaB = riwayat.find((r) => r.anggotaId === ANG_B);
      await batalkanPemutihan(punyaB!.id, 'Ust Afwan');

      const sesudah = await getRiwayatPemutihan();
      const barisB = sesudah.find((r) => r.id === punyaB!.id);
      check('baris pemutihan TIDAK dihapus', !!barisB);
      check('ditandai dibatalkan', barisB?.dibatalkanPada !== null);
      check('pembatal tercatat', barisB?.dibatalkanOleh === 'Ust Afwan');

      const { list } = await getMaahirSP();
      const b = list.find((p) => p.name === 'Peserta B');
      check('B kembali SP1 sesudah dibatalkan', b?.sp === 1, String(b?.sp));
      check('B tak lagi punya pemutihan aktif', b?.diputihkan.length === 0);
    }

    // 6. Boleh diputihkan lagi di tanggal yang sama (indeks unik parsial).
    {
      const res = await putihkanTanggal(ANG_B, [TGL[0]], 'putihkan ulang', 'Ustadzah Uji');
      check('pemutihan ulang tidak error', !res.error, res.error ?? '');
      const { list } = await getMaahirSP();
      const b = list.find((p) => p.name === 'Peserta B');
      check('B luruh lagi ke SP0', b?.sp === 0, String(b?.sp));
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
