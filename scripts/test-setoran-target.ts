/**
 * test-setoran-target.ts — uji target setoran hafalan harian Takhassus terhadap
 * Postgres sungguhan (PGlite via wire-protocol), memakai lib aplikasi apa
 * adanya: getLaporanMaahir, simpanTarget, hapusTarget, targetResolver.
 *
 * Angka harapan tidak diambil dari kode aplikasi. Skrip ini punya penghitung
 * hari jadwalnya sendiri (`hariJadwal`) sebagai pembanding merdeka — kalau
 * laporan diam-diam ikut menghitung sesi At-Tibyan tiap Sabtu, angkanya langsung
 * meleset.
 *
 * Jalankan: npm run test-target
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PG_TEST_PORT ?? 54333);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${extra}`); }
}

// ── Pembanding merdeka ──────────────────────────────────────────────────────
const NAMA_HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const IKHWAN_JADWAL = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at"];
const AKHWAT_JADWAL = ['Selasa', 'Rabu', 'Kamis', "Jum'at"];

/** Tanggal hari-jadwal dalam [dari, sampai], di luar `libur`. */
function hariJadwal(jadwal: string[], dari: string, sampai: string, libur: string[] = []): string[] {
  const set = new Set(jadwal);
  const skip = new Set(libur);
  const out: string[] = [];
  const d = new Date(`${dari}T00:00:00Z`);
  const akhir = new Date(`${sampai}T00:00:00Z`);
  while (d <= akhir) {
    const iso = d.toISOString().slice(0, 10);
    if (set.has(NAMA_HARI[d.getUTCDay()]) && !skip.has(iso)) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Periode laporan '2026-07' = 28 Jun – 27 Jul 2026. Seluruhnya sesudah
// PRESENSI_ANCHOR (2026-06-01) dan seluruhnya di masa lalu, jadi tak terpotong
// cutoff "hari ini".
const MONTH = '2026-07';
const AWAL = '2026-06-28';
const AKHIR = '2026-07-27';
const ANCHOR = '2026-06-01';

const SESI_IKHWAN = hariJadwal(IKHWAN_JADWAL, AWAL, AKHIR).length; // 21
const SESI_AKHWAT = hariJadwal(AKHWAT_JADWAL, AWAL, AKHIR).length; // 16

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
  halaman_per_hari numeric(4,2) NOT NULL CHECK (halaman_per_hari > 0),
  berlaku_mulai date NOT NULL,
  catatan text,
  dibuat_oleh text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX maahir_setoran_target_versi_uniq
  ON maahir_setoran_target (program_kelas_id, anggota_id, berlaku_mulai) NULLS NOT DISTINCT;
`;

const K_IKH = '31111111-1111-4111-8111-111111111111';
const K_AKH = '31111111-1111-4111-8111-111111111112';
// Kelas ketiga, bukan Takhassus — penjaga bahwa target tak bocor ke sana.
const K_LAIN = '31111111-1111-4111-8111-111111111113';

const A_DEFAULT = '32222222-2222-4222-8222-222222222221';
const A_KOREKSI = '32222222-2222-4222-8222-222222222222';
const A_SAKIT = '32222222-2222-4222-8222-222222222223';
const A_PUTIH = '32222222-2222-4222-8222-222222222224';
const A_GABUNG = '32222222-2222-4222-8222-222222222225'; // masuk di tengah periode
const A_AKHWAT = '32222222-2222-4222-8222-222222222226';
const A_LAIN = '32222222-2222-4222-8222-222222222227';

const GABUNG_TANGGAL = '2026-07-13';

const SEED = `
INSERT INTO program_kelas (id, name, gender, jadwal_hari, presensi_sifat) VALUES
  ('${K_IKH}', 'Maahir Takhassus Ikhwan', 'ikhwan', ARRAY['Senin','Selasa','Rabu','Kamis','Jum''at'], 'harian'),
  ('${K_AKH}', 'Maahir Takhassus Akhwat', 'akhwat', ARRAY['Selasa','Rabu','Kamis','Jum''at'], 'harian'),
  ('${K_LAIN}', 'Maahir 6A - Ikhwan', 'ikhwan', ARRAY['Senin','Rabu'], 'harian');

INSERT INTO program_kelas_anggota (id, program_kelas_id, name, whatsapp_number, mulai_tanggal) VALUES
  ('${A_DEFAULT}', '${K_IKH}', 'Peserta Default', '628300000001', NULL),
  ('${A_KOREKSI}', '${K_IKH}', 'Peserta Koreksi', '628300000002', NULL),
  ('${A_SAKIT}',   '${K_IKH}', 'Peserta Sakit',   '628300000003', NULL),
  ('${A_PUTIH}',   '${K_IKH}', 'Peserta Putih',   '628300000004', NULL),
  ('${A_GABUNG}',  '${K_IKH}', 'Peserta Gabung',  '628300000005', '${GABUNG_TANGGAL}'),
  ('${A_AKHWAT}',  '${K_AKH}', 'Peserta Akhwat',  '628300000006', NULL),
  ('${A_LAIN}',    '${K_LAIN}','Peserta Lain',    '628300000007', NULL);
`;

async function main() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SEED);

  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.PG_POOL_MAX = '1';
  // laporan-maahir menarik program-kelas, yang menarik lib/session dan menolak
  // dimuat tanpa secret. Uji ini tak pernah menyentuh sesi — cukup nilai boneka
  // supaya modulnya bisa di-import.
  process.env.SESSION_SECRET ??= 'x'.repeat(48);

  // Import SETELAH DATABASE_URL di-set — pool dibaca saat koneksi pertama.
  const { getLaporanMaahir } = await import('../src/lib/laporan-maahir');
  const { simpanTarget, hapusTarget, getSetoranTargets, targetResolver } = await import(
    '../src/lib/setoran-target'
  );

  const lap = async () => (await getLaporanMaahir(MONTH)).takhassus.setoran;
  const cari = (list: Awaited<ReturnType<typeof lap>>['peserta'], nama: string) =>
    list.find((p) => p.name === nama);

  /** Satu pertemuan + satu baris kehadiran, dibuat langsung lewat SQL. */
  async function hadir(kelasId: string, anggotaId: string, tanggal: string, opts?: {
    status?: string;
    halaman?: number;
    program?: string;
  }) {
    const program = opts?.program ?? 'kelas_maahir';
    const status = opts?.status ?? 'hadir';
    const hal = opts?.halaman ?? null;
    await db.exec(`
      INSERT INTO pertemuan_program (program_kelas_id, program, tanggal)
      SELECT '${kelasId}', '${program}', '${tanggal}'
       WHERE NOT EXISTS (SELECT 1 FROM pertemuan_program
                          WHERE program_kelas_id='${kelasId}' AND program='${program}'
                            AND tanggal='${tanggal}');
      INSERT INTO kehadiran_peserta (pertemuan_id, anggota_id, status, diisi_at, setoran_halaman)
      SELECT id, '${anggotaId}', '${status}', now(), ${hal === null ? 'NULL' : hal}
        FROM pertemuan_program
       WHERE program_kelas_id='${kelasId}' AND program='${program}' AND tanggal='${tanggal}';
    `);
  }

  try {
    console.log('\n1. Belum ada target sama sekali');
    {
      // Setoran tetap dicatat walau target belum diatur.
      await hadir(K_IKH, A_DEFAULT, '2026-06-29', { halaman: 10 });
      const s = await lap();
      const d = cari(s.peserta, 'Peserta Default');
      check('target null', d?.target === null, JSON.stringify(d?.target));
      check('persen null', d?.persen === null);
      check('halaman tetap dilaporkan', d?.halaman === 10, String(d?.halaman));
      check('agregat adaTarget false', s.adaTarget === false);
      check('agregat persen null', s.persen === null);
      check('benchmark null (bukan 80)', s.benchmark === null, String(s.benchmark));
    }

    console.log('\n2. Default kelas — asimetri jadwal & At-Tibyan tak ikut');
    {
      await simpanTarget({
        programKelasId: K_IKH, anggotaId: null, halamanPerHari: 4,
        berlakuMulai: ANCHOR, catatan: null, dibuatOleh: 'Ust Uji',
      });
      await simpanTarget({
        programKelasId: K_AKH, anggotaId: null, halamanPerHari: 4,
        berlakuMulai: ANCHOR, catatan: null, dibuatOleh: 'Ust Uji',
      });
      const s = await lap();
      const i = cari(s.peserta, 'Peserta Default');
      const a = cari(s.peserta, 'Peserta Akhwat');
      check(`sesi ikhwan = ${SESI_IKHWAN}`, i?.sesiTarget === SESI_IKHWAN, String(i?.sesiTarget));
      check(`sesi akhwat = ${SESI_AKHWAT}`, a?.sesiTarget === SESI_AKHWAT, String(a?.sesiTarget));
      check('4 Sabtu At-Tibyan tak ikut dihitung', i?.sesiTarget === SESI_IKHWAN);
      check(`target ikhwan = ${SESI_IKHWAN * 4}`, i?.target === SESI_IKHWAN * 4, String(i?.target));
      check(`target akhwat = ${SESI_AKHWAT * 4}`, a?.target === SESI_AKHWAT * 4, String(a?.target));
      check('tarif harian sama, target beda', i!.target! > a!.target!);
      check('targetHarian terbaca', i?.targetHarian === 4);
      check('persen dari halaman/target', i?.persen === Math.round((10 / (SESI_IKHWAN * 4)) * 100), String(i?.persen));
      check('agregat adaTarget true', s.adaTarget === true);
    }

    console.log('\n3. Target tak bocor ke kelas non-Takhassus');
    {
      const s = await lap();
      check('peserta kelas lain tak masuk daftar setoran', !cari(s.peserta, 'Peserta Lain'));
    }

    console.log('\n4. Koreksi peserta menang atas default kelas');
    {
      await simpanTarget({
        programKelasId: K_IKH, anggotaId: A_KOREKSI, halamanPerHari: 6,
        berlakuMulai: ANCHOR, catatan: 'senior', dibuatOleh: 'Ust Uji',
      });
      const s = await lap();
      const k = cari(s.peserta, 'Peserta Koreksi');
      const d = cari(s.peserta, 'Peserta Default');
      check(`koreksi target = ${SESI_IKHWAN * 6}`, k?.target === SESI_IKHWAN * 6, String(k?.target));
      check('peserta lain tetap ikut default', d?.target === SESI_IKHWAN * 4, String(d?.target));
    }

    console.log('\n5. Versi baru di tengah periode dihitung per hari');
    {
      const potong = '2026-07-13';
      await simpanTarget({
        programKelasId: K_IKH, anggotaId: null, halamanPerHari: 8,
        berlakuMulai: potong, catatan: null, dibuatOleh: 'Ust Uji',
      });
      const sebelum = hariJadwal(IKHWAN_JADWAL, AWAL, '2026-07-12').length;
      const sesudah = hariJadwal(IKHWAN_JADWAL, potong, AKHIR).length;
      const harap = sebelum * 4 + sesudah * 8;
      const d = cari((await lap()).peserta, 'Peserta Default');
      check(`campuran ${sebelum}×4 + ${sesudah}×8 = ${harap}`, d?.target === harap, String(d?.target));
      check('sesi tetap utuh', d?.sesiTarget === SESI_IKHWAN, String(d?.sesiTarget));
      check('targetHarian = tarif terakhir', d?.targetHarian === 8, String(d?.targetHarian));

      // Kembalikan supaya fase berikutnya memakai tarif tunggal.
      const versi = await getSetoranTargets([K_IKH]);
      const baru = versi.find((v) => v.anggotaId === null && v.berlakuMulai === potong);
      await hapusTarget(baru!.id);
      const pulih = cari((await lap()).peserta, 'Peserta Default');
      check('hapus versi mengembalikan target', pulih?.target === SESI_IKHWAN * 4, String(pulih?.target));
    }

    console.log('\n6. Libur memotong sesi');
    {
      const liburDari = '2026-07-06';
      const liburSampai = '2026-07-10';
      await db.exec(`INSERT INTO program_kelas_libur (program_kelas_id, tanggal_mulai, tanggal_selesai, keterangan)
                     VALUES ('${K_IKH}', '${liburDari}', '${liburSampai}', 'uji libur');`);
      const liburTanggal = hariJadwal(IKHWAN_JADWAL, liburDari, liburSampai);
      const harapSesi = SESI_IKHWAN - liburTanggal.length;
      const d = cari((await lap()).peserta, 'Peserta Default');
      check(`libur ${liburTanggal.length} hari → sesi ${harapSesi}`, d?.sesiTarget === harapSesi, String(d?.sesiTarget));
      check('target ikut turun', d?.target === harapSesi * 4, String(d?.target));

      const a = cari((await lap()).peserta, 'Peserta Akhwat');
      check('libur kelas lain tak mengenai Akhwat', a?.sesiTarget === SESI_AKHWAT, String(a?.sesiTarget));

      await db.exec(`DELETE FROM program_kelas_libur WHERE program_kelas_id='${K_IKH}';`);
      check('sesi pulih sesudah libur dihapus',
        (cari((await lap()).peserta, 'Peserta Default'))?.sesiTarget === SESI_IKHWAN);
    }

    console.log('\n7. Sakit dikeluarkan dari penyebut');
    {
      await hadir(K_IKH, A_SAKIT, '2026-06-29', { status: 'sakit' });
      await hadir(K_IKH, A_SAKIT, '2026-06-30', { status: 'sakit' });
      const s = cari((await lap()).peserta, 'Peserta Sakit');
      check(`2 sakit → sesi ${SESI_IKHWAN - 2}`, s?.sesiTarget === SESI_IKHWAN - 2, String(s?.sesiTarget));
      check('target ikut turun', s?.target === (SESI_IKHWAN - 2) * 4, String(s?.target));
    }

    console.log('\n8. Rentang keanggotaan memotong sesi');
    {
      const harap = hariJadwal(IKHWAN_JADWAL, GABUNG_TANGGAL, AKHIR).length;
      const g = cari((await lap()).peserta, 'Peserta Gabung');
      check(`gabung ${GABUNG_TANGGAL} → sesi ${harap}`, g?.sesiTarget === harap, String(g?.sesiTarget));
      check('lebih kecil dari sesi penuh', (g?.sesiTarget ?? 0) < SESI_IKHWAN);
    }

    console.log('\n9. Pemutihan');
    {
      // Per-tanggal: satu hari jadwal keluar dari penyebut.
      const satu = '2026-07-01';
      await db.exec(`INSERT INTO maahir_pemutihan (anggota_id, month, tanggal, alasan)
                     VALUES ('${A_DEFAULT}', '${MONTH}', '${satu}', 'uji per-tanggal');`);
      const d = cari((await lap()).peserta, 'Peserta Default');
      check('pemutihan per-tanggal memotong 1 sesi', d?.sesiTarget === SESI_IKHWAN - 1, String(d?.sesiTarget));

      // Sebulan penuh: target null, BUKAN 100%.
      await db.exec(`INSERT INTO maahir_pemutihan (anggota_id, month, tanggal, alasan)
                     VALUES ('${A_PUTIH}', '${MONTH}', NULL, 'uji sebulan');`);
      const p = cari((await lap()).peserta, 'Peserta Putih');
      check('pemutihan sebulan → target null', p?.target === null, String(p?.target));
      check('pemutihan sebulan → persen null, bukan 100', p?.persen === null, String(p?.persen));

      await db.exec(`DELETE FROM maahir_pemutihan;`);
      check('pulih sesudah pemutihan dihapus',
        (cari((await lap()).peserta, 'Peserta Default'))?.sesiTarget === SESI_IKHWAN);
    }

    console.log('\n10. Agregat: aktual vs persen dua semantik berbeda');
    {
      const s = await lap();
      const bertarget = s.peserta.filter((p) => p.target !== null && p.target > 0);
      const totalTarget = bertarget.reduce((x, p) => x + (p.target as number), 0);
      const totalHal = bertarget.reduce((x, p) => x + (p.halaman ?? 0), 0);
      check('persen agregat tertimbang', s.persen === Math.round((totalHal / totalTarget) * 100), String(s.persen));
      check('aktual hanya merata-rata penyetor', s.aktual === 10, String(s.aktual));
      check('non-penyetor menekan persen tapi tidak aktual', (s.persen ?? 0) < 100 && s.aktual === 10);
      check('benchmark = rata-rata target periode', s.benchmark !== null && s.benchmark > 0, String(s.benchmark));
    }

    console.log('\n11. Resolver murni');
    {
      const rows = await getSetoranTargets([K_IKH, K_AKH]);
      const r = targetResolver(rows);
      check('koreksi menang', r(K_IKH, A_KOREKSI, '2026-07-01') === 6);
      check('default kelas dipakai', r(K_IKH, A_DEFAULT, '2026-07-01') === 4);
      check('sebelum berlaku → null', r(K_IKH, A_DEFAULT, '2026-05-31') === null);
      check('kelas tanpa baris → null', r('kelas-hantu', A_DEFAULT, '2026-07-01') === null);
    }

    console.log('\n12. Validasi masukan');
    {
      const nol = await simpanTarget({ programKelasId: K_IKH, anggotaId: null, halamanPerHari: 0, berlakuMulai: ANCHOR, catatan: null, dibuatOleh: 'x' });
      check('0 hal/hari ditolak', !!nol.error, JSON.stringify(nol));
      const minus = await simpanTarget({ programKelasId: K_IKH, anggotaId: null, halamanPerHari: -2, berlakuMulai: ANCHOR, catatan: null, dibuatOleh: 'x' });
      check('negatif ditolak', !!minus.error);
      const besar = await simpanTarget({ programKelasId: K_IKH, anggotaId: null, halamanPerHari: 400, berlakuMulai: ANCHOR, catatan: null, dibuatOleh: 'x' });
      check('400 hal/hari ditolak (salah ketik)', !!besar.error);
      const tglSalah = await simpanTarget({ programKelasId: K_IKH, anggotaId: null, halamanPerHari: 4, berlakuMulai: '13-08-2026', catatan: null, dibuatOleh: 'x' });
      check('tanggal cacat ditolak', !!tglSalah.error);
      const kelasHantu = await simpanTarget({ programKelasId: '39999999-9999-4999-8999-999999999999', anggotaId: null, halamanPerHari: 4, berlakuMulai: ANCHOR, catatan: null, dibuatOleh: 'x' });
      check('kelas tak dikenal ditolak', !!kelasHantu.error);
      const salahKelas = await simpanTarget({ programKelasId: K_IKH, anggotaId: A_AKHWAT, halamanPerHari: 4, berlakuMulai: ANCHOR, catatan: null, dibuatOleh: 'x' });
      check('peserta kelas lain ditolak', !!salahKelas.error, JSON.stringify(salahKelas));
    }

    console.log('\n13. Desimal 0,5 hal/hari');
    {
      await simpanTarget({
        programKelasId: K_AKH, anggotaId: A_AKHWAT, halamanPerHari: 0.5,
        berlakuMulai: ANCHOR, catatan: 'pemula', dibuatOleh: 'Ust Uji',
      });
      const rows = await getSetoranTargets([K_AKH]);
      const v = rows.find((x) => x.anggotaId === A_AKHWAT);
      check('tersimpan sebagai number 0.5', v?.halamanPerHari === 0.5, JSON.stringify(v?.halamanPerHari));
      check('tipenya number, bukan string', typeof v?.halamanPerHari === 'number');
      const a = cari((await lap()).peserta, 'Peserta Akhwat');
      check(`0.5 dikalikan, bukan disambung → ${SESI_AKHWAT * 0.5}`,
        a?.target === SESI_AKHWAT * 0.5, String(a?.target));
    }

    console.log('\n14. Simpan ulang tanggal sama = perbarui versi, bukan duplikat');
    {
      await simpanTarget({
        programKelasId: K_AKH, anggotaId: A_AKHWAT, halamanPerHari: 2,
        berlakuMulai: ANCHOR, catatan: 'naik', dibuatOleh: 'Ust Uji',
      });
      const rows = (await getSetoranTargets([K_AKH])).filter((x) => x.anggotaId === A_AKHWAT);
      check('tetap 1 versi', rows.length === 1, String(rows.length));
      check('nilainya diperbarui', rows[0]?.halamanPerHari === 2, String(rows[0]?.halamanPerHari));
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
