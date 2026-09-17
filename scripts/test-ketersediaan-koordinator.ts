/**
 * test-ketersediaan-koordinator.ts — uji mesin alokasi, papan koordinator, dan
 * penulisan usulan.
 *
 * Bagian murni tanpa basis data; bagian integrasi memakai PGlite lewat
 * wire-protocol dengan migrasi ks_* yang ASLI (tanpa 0079, supaya terbukti kode
 * tetap benar walau indeks unik belum dipasang di produksi).
 *
 * Jalankan: NODE_PATH=./scripts/node-shims npx tsx scripts/test-ketersediaan-koordinator.ts
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { alokasikan, type GrupUsulan, type SlotAlokasi } from '../src/lib/ketersediaan-alokasi';
import { susunRincianLevel, terapkanSimulasi, type BarisJam, type PendaftarLevel } from '../src/lib/ketersediaan-dasbor';
import type { KsHariIdx, KsPeriode } from '../src/types/db';

const PORT = Number(process.env.PG_TEST_PORT ?? 54335);

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

function slot(id: string, hari: KsHariIdx[], mulai: string, selesai: string): SlotAlokasi['slot'] {
  return { id, label: `${id} ${mulai}-${selesai}`, hari_idx: hari, waktu_mulai: mulai, waktu_selesai: selesai };
}
function grup(slotId: string, n: number): GrupUsulan {
  return {
    slot_id: slotId,
    level: 'HITS Dasar',
    pita_umur: '<=45',
    pita_digabung: false,
    pendaftar_ids: Array.from({ length: 3 }, (_, i) => `${slotId}-g${n}-${i}`),
    usia_tertua_hari: 0,
  };
}

function uraiMurni() {
  console.log('\n# pemerataan lintas jalan (sudahDapat)');
  {
    const s = slot('A', [0, 2], '20:00', '21:30');
    const masukan = {
      slots: [{ slot: s, grup: [grup('A', 1)], antre: 3, usia_tertua_hari: 0 }],
      tersedia: new Map([['A', ['lama', 'baru']]]),
      sudahDiSlot: new Map<string, Set<string>>(),
      jadwalPengajar: new Map(),
      // "lama" lebih didahulukan peringkatnya.
      peringkat: (id: string) => (id === 'lama' ? 1 : 2),
    };
    const tanpaBenih = alokasikan(masukan);
    check('tanpa benih: peringkat menang', tanpaBenih.penempatan[0]?.pengajar_id === 'lama');
    const denganBenih = alokasikan({ ...masukan, sudahDapat: new Map([['lama', 1]]) });
    check(
      'dengan benih: yang belum pernah dapat didahulukan',
      denganBenih.penempatan[0]?.pengajar_id === 'baru',
      JSON.stringify(denganBenih.penempatan)
    );
    check('putaranTerpakai = putaran terakhir yang menempatkan', denganBenih.putaranTerpakai === 1, String(denganBenih.putaranTerpakai));

    const semuaSudah = alokasikan({ ...masukan, sudahDapat: new Map([['lama', 2], ['baru', 1]]) });
    check('semua sudah dapat: alokasi tetap jalan', semuaSudah.penempatan[0]?.pengajar_id === 'baru', JSON.stringify(semuaSudah));
    check('putaran dimulai dari hitungan lama', semuaSudah.penempatan[0]?.putaran === 2 && semuaSudah.putaranTerpakai === 2);

    const hanyaYangBanyak = alokasikan({
      ...masukan,
      tersedia: new Map([['A', ['lama']]]),
      sudahDapat: new Map([['lama', 3]]),
    });
    check('satu-satunya pengajar tetap dapat walau sudah punya tiga', hanyaYangBanyak.penempatan.length === 1);
  }

  console.log('\n# putaranTerpakai');
  {
    const kosong = alokasikan({
      slots: [],
      tersedia: new Map(),
      sudahDiSlot: new Map(),
      jadwalPengajar: new Map(),
      peringkat: () => 1,
    });
    check('tanpa penempatan = 0', kosong.putaranTerpakai === 0, String(kosong.putaranTerpakai));
    const s = slot('B', [1, 3], '06:00', '07:30');
    const dua = alokasikan({
      slots: [{ slot: s, grup: [grup('B', 1), grup('B', 2)], antre: 6, usia_tertua_hari: 0 }],
      tersedia: new Map([['B', ['p1']]]),
      sudahDiSlot: new Map(),
      jadwalPengajar: new Map(),
      peringkat: () => 1,
    });
    check('satu pengajar satu slot: sekali tempat, putaran 1', dua.penempatan.length === 1 && dua.putaranTerpakai === 1, JSON.stringify(dua));
  }

  console.log('\n# rincian jam offline per level & umur');
  {
    const buat = (n: number, level: string, pita: '<=45' | '46+', awal: string): PendaftarLevel[] =>
      Array.from({ length: n }, (_, i) => ({ id: `${awal}-${level}-${pita}-${i}`, slot_id: 'S1', level_pilihan: level, pita_umur: pita, didaftar_pada: '2026-09-09T03:00:00Z' }));
    const pendaftar = [
      ...buat(16, 'HITS Dasar', '<=45', 'a'),
      ...buat(7, 'HITS Dasar', '46+', 'b'),
      ...buat(7, 'HITS Lanjutan', '<=45', 'c'),
    ];
    const aturan = { kapasitas_halaqah: 12, ambang_bawah: 8, usia_antrean_maks_hari: 21 };
    const slots = [
      { id: 'S1', kelompok: 'akhwat' as const, lokasi: 'Masjid Al-Kautsar Matraman', label: 'Selasa & Jumat 07:30 - 09:00 WIB' },
      { id: 'S2', kelompok: 'ikhwan' as const, lokasi: 'Masjid Al-Kautsar Matraman', label: 'Sabtu 06:00 - 07:30 & Ahad 18:00 - 19:30 WIB' },
      { id: 'S3', kelompok: 'akhwat' as const, lokasi: 'Masjid Al-Kautsar Matraman', label: 'Selasa & Rabu 09:30 - 11:00 WIB' },
    ];
    const s3 = buat(19, 'HITS Dasar', '<=45', 'd').map((p) => ({ ...p, slot_id: 'S3' }));
    const [r1, r2, r3] = susunRincianLevel(slots, [...pendaftar, ...s3], new Map([['S1', 1], ['S2', 1]]), aturan, new Date('2026-09-17T05:00:00Z'));
    check('pecahan level × umur', r1.dasar.muda === 16 && r1.dasar.tua === 7 && r1.lanjutan.muda === 7 && r1.lanjutan.tua === 0, JSON.stringify(r1));
    check('sekarang: hanya kelompok penuh', r1.kelompokSekarang === 1, String(r1.kelompokSekarang));
    check('tanggal gabung = antrean tertua + 21 hari', r1.tanggalGabung === '2026-09-30', String(r1.tanggalGabung));
    check('setelah gabung: sisa Dasar 11 jadi kelompok kedua', r1.kelompokSetelahGabung === 2 && r1.sisaMenunggu === 7, JSON.stringify(r1));
    check('kekurangan pengajar ditandai merah', r1.nada === 'merah' && r1.kendala.includes('butuh 1 pengajar lagi'), r1.kendala);
    check('jam tanpa pendaftar tapi ada pengajar', r2.total === 0 && r2.nada === 'kuning', r2.kendala);
    check('jam tanpa pengajar', r3.pengajar === 0 && r3.nada === 'merah' && r3.kendala.startsWith('Belum ada pengajar'), r3.kendala);
    // Pendaftar tertua di jam adalah Lanjutan; sisa Dasar baru mendaftar 12 Sep → gabung 3 Okt, bukan 30 Sep.
    const campur = [
      { id: 'L1', slot_id: 'S4', level_pilihan: 'HITS Lanjutan', pita_umur: '<=45' as const, didaftar_pada: '2026-09-09T03:00:00Z' },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `D${i}`, slot_id: 'S4', level_pilihan: 'HITS Dasar', pita_umur: (i < 6 ? '<=45' : '46+') as '<=45' | '46+', didaftar_pada: '2026-09-12T03:00:00Z' })),
    ];
    const [r4] = susunRincianLevel([{ id: 'S4', kelompok: 'akhwat', lokasi: 'Pejaten', label: 'Senin & Rabu 16:30 - 18:00 WIB' }], campur, new Map([['S4', 1]]), aturan, new Date('2026-09-17T05:00:00Z'));
    check('tanggal gabung dari sisa level, bukan pendaftar tertua di jam', r4.kelompokSetelahGabung === 1 && r4.tanggalGabung === '2026-10-03', JSON.stringify(r4));
    const lewat = susunRincianLevel(slots.slice(0, 1), pendaftar, new Map([['S1', 2]]), aturan, new Date('2026-10-01T00:00:00Z'));
    check('setelah tanggal gabung: tidak ada tanggal lagi, cukup pengajar', lewat[0].tanggalGabung === null && lewat[0].kelompokSekarang === 2 && lewat[0].nada === 'hijau', JSON.stringify(lewat[0]));
  }

  console.log('\n# daya tampung dari simulasi');
  {
    const b = (slot_id: string, antre: number, pengajar: number): BarisJam => ({
      slot_id,
      kelompok: 'ikhwan',
      mode: 'online',
      lokasi: null,
      label: slot_id,
      hari: 'Senin & Rabu',
      hariIdx: [0, 2],
      jam: '20:00',
      antre,
      pengajar,
      tampung: antre,
      sisa: 0,
      butuh: 1,
      bisa: 1,
      dialokasikan: 0,
      tertahan: 0,
      terpakaiLain: 0,
      status: 'cukup',
    });
    const hasil = terapkanSimulasi([b('x', 30, 5), b('y', 10, 0), b('z', 0, 1)], new Map([['x', 12]]), 12);
    const x = hasil.find((r) => r.slot_id === 'x')!;
    check('tampung dari simulasi, bukan pengajar × kapasitas', x.tampung === 12 && x.sisa === 18 && x.bisa === 1 && x.status === 'kurang', JSON.stringify(x));
    check('jam tanpa pengajar', hasil.find((r) => r.slot_id === 'y')?.status === 'tanpa_pengajar');
    check('jam kosong', hasil.find((r) => r.slot_id === 'z')?.status === 'kosong');
    check('urut dari sisa terbesar', hasil[0].slot_id === 'x');
    const lebih = terapkanSimulasi([b('x', 5, 1)], new Map([['x', 12]]), 12);
    check('tampung tak melebihi antre', lebih[0].tampung === 5 && lebih[0].sisa === 0);
  }
}

// ── Integrasi ────────────────────────────────────────────────────────────────

const PRASYARAT = `
CREATE TYPE gender AS ENUM ('ikhwan', 'akhwat');
CREATE TABLE pengajar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, gender gender NOT NULL, whatsapp_number text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE hits_batch (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, start_date date);
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
  '0079_ketersediaan_integritas',
];

const ID = {
  ahmad: 'a1000000-0000-4000-8000-000000000001',
  bilal: 'a1000000-0000-4000-8000-000000000002',
  tahap1: 'd1000000-0000-4000-8000-000000000001',
  tahap2: 'd1000000-0000-4000-8000-000000000002',
  januari: 'd1000000-0000-4000-8000-000000000003',
  slot1: 'e1000000-0000-4000-8000-000000000001',
  slot2: 'e1000000-0000-4000-8000-000000000002',
  slotJan: 'e1000000-0000-4000-8000-000000000003',
};

function pendaftarSql(periode: string, slotId: string, awalan: string, n: number, wa0: number): string {
  return Array.from({ length: n }, (_, i) => {
    const wa = String(wa0 + i);
    return `('${periode}', '${awalan}-${i}', '${awalan} ${i}', '62${wa}', '${wa}', '${slotId}', 'valid', '<=45', 'HITS Dasar', '2026-09-01T00:00:00Z')`;
  }).join(',\n  ');
}

const SEED = `
INSERT INTO pengajar (id, name, gender, whatsapp_number) VALUES
  ('${ID.ahmad}', 'Ahmad Fauzan', 'ikhwan', '6281111111111'),
  ('${ID.bilal}', 'Bilal Hakim', 'ikhwan', '6281222222222');

INSERT INTO ks_periode (id, nama, mulai, selesai, kapasitas_halaqah, ambang_bentuk, ambang_bawah) VALUES
  ('${ID.tahap1}', 'Batch Oktober 2026', '2026-10-05', '2027-03-31', 3, 3, 2),
  ('${ID.tahap2}', 'Tahap 2', '2026-10-21', '2027-04-30', 3, 3, 2),
  ('${ID.januari}', 'Batch Januari 2026', '2026-01-10', '2026-06-30', 3, 3, 2);
INSERT INTO ks_slot (id, periode_id, kelompok, mode, label, hari, hari_idx, waktu_mulai, waktu_selesai) VALUES
  ('${ID.slot1}', '${ID.tahap1}', 'ikhwan', 'online', 'Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], ARRAY[0,2]::smallint[], '20:00', '21:30'),
  ('${ID.slot2}', '${ID.tahap2}', 'ikhwan', 'online', 'Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], ARRAY[0,2]::smallint[], '20:00', '21:30'),
  ('${ID.slotJan}', '${ID.januari}', 'ikhwan', 'online', 'Senin & Rabu 20:00 - 21:30 WIB', ARRAY['Senin','Rabu'], ARRAY[0,2]::smallint[], '20:00', '21:30');

INSERT INTO ks_pendaftar (periode_id, sumber_row_key, nama, wa, wa_normal, slot_id, status, pita_umur, level_pilihan, didaftar_pada) VALUES
  ${pendaftarSql(ID.tahap1, ID.slot1, 'Satu', 3, 85100000000)},
  ${pendaftarSql(ID.tahap2, ID.slot2, 'Dua', 3, 85200000000)};

-- Alumni Januari yang dialokasikan dulu, kini mendaftar lagi di tahap 1.
INSERT INTO ks_pendaftar (periode_id, sumber_row_key, nama, wa, wa_normal, slot_id, status, pita_umur) VALUES
  ('${ID.januari}', 'alumni', 'Umar Alumni', '6285900000001', '85900000001', '${ID.slotJan}', 'dialokasikan', '<=45');

-- Ahmad bersedia di jam yang sama pada kedua tahap (impor xlsx, prioritas 1).
INSERT INTO ks_pengisian (id, periode_id, pengajar_id, sumber, komitmen, submitted_at) VALUES
  ('f1000000-0000-4000-8000-000000000001', '${ID.tahap1}', '${ID.ahmad}', 'impor', true, '2026-09-01T00:00:00Z'),
  ('f1000000-0000-4000-8000-000000000002', '${ID.tahap2}', '${ID.ahmad}', 'impor', true, '2026-09-01T00:00:00Z');
INSERT INTO ks_ketersediaan (pengisian_id, slot_id, status, prioritas) VALUES
  ('f1000000-0000-4000-8000-000000000001', '${ID.slot1}', 'terverifikasi', 1),
  ('f1000000-0000-4000-8000-000000000002', '${ID.slot2}', 'terverifikasi', 1);
`;

async function uraiIntegrasi() {
  const db = new PGlite();
  await db.exec(PRASYARAT);
  for (const m of MIGRASI) {
    const sql = readFileSync(`supabase/migrations/${m}.sql`, 'utf8').replace(/^\s*(begin|commit)\s*;\s*$/gim, '');
    await db.exec(sql);
  }
  await db.exec(SEED);

  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.PG_POOL_MAX = '1';
  process.env.SESSION_SECRET ??= '0123456789abcdef0123456789abcdef0123';

  try {
    const { getPool } = await import('../src/lib/pg-core');
    const q = async <T,>(sql: string, p: unknown[] = []) => (await getPool().query(sql, p)).rows as T[];
    const lintas = await import('../src/lib/ketersediaan-lintas-periode');
    const bentrok = await import('../src/lib/ketersediaan-bentrok');
    const periodeLib = await import('../src/lib/ketersediaan-periode');
    const { jalankanAlokasi, peringkatGabungan } = await import('../src/lib/ketersediaan-jalankan');
    const sekarang = new Date('2026-09-17T05:00:00Z');

    console.log('\n# peringkat gabungan');
    check('xlsx prioritas 5 mendahului preset #1', peringkatGabungan(5, 1) < peringkatGabungan(undefined, 1));
    check('sesama preset tetap berurutan', peringkatGabungan(undefined, 1) < peringkatGabungan(undefined, 2));

    console.log('\n# lintas periode hanya yang beririsan');
    check('rentang beririsan', lintas.periodeBeririsan({ mulai: '2026-10-05', selesai: '2027-03-31' }, { mulai: '2026-10-21', selesai: '2027-04-30' }));
    check('rentang terpisah', !lintas.periodeBeririsan({ mulai: '2026-01-10', selesai: '2026-06-30' }, { mulai: '2026-10-05', selesai: '2027-03-31' }));
    const terpakaiTahap1 = await lintas.identitasTerpakaiLintasPeriode(ID.tahap1);
    check('alumni Januari tidak tersaring di Oktober', !terpakaiTahap1.has('85900000001|umar alumni'), JSON.stringify([...terpakaiTahap1]));
    const terpakaiJan = await lintas.identitasTerpakaiLintasPeriode(ID.januari);
    check('periode tanpa irisan: kosong', terpakaiJan.size === 0);

    console.log('\n# alokasi tahap 1');
    const tahap1 = (await periodeLib.getPeriode(ID.tahap1)) as KsPeriode;
    const tahap2 = (await periodeLib.getPeriode(ID.tahap2)) as KsPeriode;
    const h1 = await jalankanAlokasi(tahap1, { sekarang });
    check('satu usulan terbentuk', h1.usulanBaru === 1 && h1.pesertaTerpakai === 3, JSON.stringify(h1));
    check('putaran dilaporkan 1', h1.putaran === 1, String(h1.putaran));
    const dialokasikan = await q<{ n: number }>(`select count(*)::int n from ks_pendaftar where periode_id = $1 and status = 'dialokasikan'`, [ID.tahap1]);
    check('pendaftar diklaim', dialokasikan[0].n === 3);
    const peserta = await q<{ n: number }>(`select count(*)::int n from ks_usulan_peserta`);
    check('peserta tertulis', peserta[0].n === 3);

    const h1b = await jalankanAlokasi(tahap1, { sekarang });
    check('jalan ulang tidak menggandakan', h1b.usulanBaru === 0, JSON.stringify(h1b));

    console.log('\n# usulan yang belum disetujui mengunci jam lintas tahap');
    const terpakai = await bentrok.jadwalTerpakaiPengajar(ID.ahmad, { acuan: tahap2.mulai });
    check(
      "status 'usulan' ikut terhitung",
      terpakai.some((t) => t.sumber === 'usulan' && t.status_usulan === 'usulan' && t.slot_id === ID.slot1),
      JSON.stringify(terpakai)
    );
    const slot2 = await periodeLib.listSlot(ID.tahap2);
    check('slot tahap 2 di jam yang sama terkunci', bentrok.kunciSlot(slot2, terpakai).has(ID.slot2));
    const slot1 = await periodeLib.listSlot(ID.tahap1);
    check('slot usulannya sendiri tidak terkunci', !bentrok.kunciSlot(slot1, terpakai).has(ID.slot1));
    const sesudahPeriode = await bentrok.jadwalTerpakaiPengajar(ID.ahmad, { acuan: '2027-05-01' });
    check('usulan periode yang sudah berakhir tidak mengunci', !sesudahPeriode.some((t) => t.sumber === 'usulan'));

    console.log('\n# lama jam terkunci mengikuti level halaqah');
    // Tahap 1 mulai Senin 5 Okt 2026, Senin & Rabu, tanpa libur: Dasar P50 = Rabu 24 Mar 2027, Lanjutan P26 = Rabu 30 Des 2026.
    const pertemuanLib = await import('../src/lib/ketersediaan-pertemuan');
    check('Dasar P50 tanpa libur', pertemuanLib.perkiraanSelesaiHalaqah({ mulai: null, hari_idx: [0, 2], level: 'HITS Dasar', periode: tahap1 }) === '2027-03-24');
    check('Lanjutan P26 tanpa libur', pertemuanLib.perkiraanSelesaiHalaqah({ mulai: null, hari_idx: [0, 2], level: 'HITS Lanjutan', periode: tahap1 }) === '2026-12-30');
    check(
      'libur memundurkan tanggal selesai',
      pertemuanLib.perkiraanSelesaiHalaqah({
        mulai: null,
        hari_idx: [0, 2],
        level: 'HITS Lanjutan',
        periode: { ...tahap1, libur: [{ mulai: '2026-12-21', selesai: '2027-01-03', keterangan: 'libur akhir tahun' }] },
      }) === '2027-01-13'
    );
    check('jumlah pertemuan 0 → akhir periode', pertemuanLib.perkiraanSelesaiHalaqah({ mulai: null, hari_idx: [0, 2], level: 'HITS Dasar', periode: { ...tahap1, jumlah_pertemuan_dasar: 0 } }) === tahap1.selesai);

    const jamPadaFeb = async () => (await bentrok.jadwalTerpakaiPengajar(ID.ahmad, { acuan: '2027-02-01' })).filter((t) => t.sumber === 'usulan');
    let feb = await jamPadaFeb();
    check('halaqah Dasar masih mengunci jam pada Februari', feb.length > 0 && feb[0].selesai === '2027-03-24', JSON.stringify(feb));
    await q(`update ks_usulan set level = 'HITS Lanjutan' where periode_id = $1`, [ID.tahap1]);
    feb = await jamPadaFeb();
    check('halaqah Lanjutan sudah membebaskan jam pada Februari', feb.length === 0, JSON.stringify(feb));
    const desember = (await bentrok.jadwalTerpakaiPengajar(ID.ahmad, { acuan: '2026-12-01' })).filter((t) => t.sumber === 'usulan');
    check('halaqah Lanjutan tetap mengunci sebelum selesai', desember.length > 0 && desember[0].selesai === '2026-12-30' && desember[0].level === 'HITS Lanjutan', JSON.stringify(desember));
    await q(`update ks_usulan set level = 'HITS Dasar' where periode_id = $1`, [ID.tahap1]);

    const h2 = await jalankanAlokasi(tahap2, { sekarang });
    check('tahap 2: Ahmad tidak dijatah dua kali di jam yang sama', h2.usulanBaru === 0, JSON.stringify(h2));
    check('tahap 2: kelompoknya tercatat butuh pengajar', h2.tanpaPengajar === 1);
    const antreTahap2 = await q<{ n: number }>(`select count(*)::int n from ks_pendaftar where periode_id = $1 and status = 'valid'`, [ID.tahap2]);
    check('tahap 2: pendaftar tetap antre', antreTahap2[0].n === 3);

    console.log('\n# penulisan berkunci: klaim pendaftar');
    {
      // Bilal bersedia di tahap 2; satu pendaftar tahap 2 dibatalkan sehingga
      // kelompoknya tak lagi genap.
      await q(`insert into ks_pengisian (id, periode_id, pengajar_id, sumber, komitmen, submitted_at)
               values ('f1000000-0000-4000-8000-000000000003', $1, $2, 'impor', true, now())`, [ID.tahap2, ID.bilal]);
      await q(`insert into ks_ketersediaan (pengisian_id, slot_id, status, prioritas)
               values ('f1000000-0000-4000-8000-000000000003', $1, 'terverifikasi', 1)`, [ID.slot2]);
      await q(`update ks_pendaftar set status = 'batal' where periode_id = $1 and sumber_row_key = 'Dua-0'`, [ID.tahap2]);
      const [a, b] = await Promise.all([jalankanAlokasi(tahap2, { sekarang }), jalankanAlokasi(tahap2, { sekarang })]);
      const usulanTahap2 = await q<{ n: number }>(`select count(*)::int n from ks_usulan where periode_id = $1 and status = 'usulan'`, [ID.tahap2]);
      check('kelompok tak genap tidak dibentuk', a.usulanBaru + b.usulanBaru === 0 && usulanTahap2[0].n === 0, JSON.stringify({ a, b }));

      await q(`update ks_pendaftar set status = 'valid' where periode_id = $1 and sumber_row_key = 'Dua-0'`, [ID.tahap2]);
      const [c, d] = await Promise.all([jalankanAlokasi(tahap2, { sekarang }), jalankanAlokasi(tahap2, { sekarang })]);
      const hidup = await q<{ n: number }>(`select count(*)::int n from ks_usulan where periode_id = $1 and status = 'usulan'`, [ID.tahap2]);
      const klaim = await q<{ n: number }>(`select count(*)::int n from ks_pendaftar where periode_id = $1 and status = 'dialokasikan'`, [ID.tahap2]);
      check(
        'dua jalan bersamaan: tepat satu usulan, tiga klaim',
        c.usulanBaru + d.usulanBaru === 1 && hidup[0].n === 1 && klaim[0].n === 3,
        JSON.stringify({ c, d, hidup, klaim })
      );
      const usulanBilal = await q<{ pengajar_id: string }>(`select pengajar_id from ks_usulan where periode_id = $1 and status = 'usulan'`, [ID.tahap2]);
      check('yang dapat Bilal, bukan Ahmad', usulanBilal[0]?.pengajar_id === ID.bilal);
    }

    console.log('\n# klaim gagal membatalkan usulan utuh');
    {
      const { tulisPenempatan } = await import('../src/lib/ketersediaan-jalankan');
      const slotTahap1 = (await periodeLib.listSlot(ID.tahap1))[0];
      await q(`insert into ks_pendaftar (periode_id, sumber_row_key, nama, slot_id, status, pita_umur)
               values ($1, 'klaim-a', 'A', $2, 'valid', '<=45'), ($1, 'klaim-b', 'B', $2, 'batal', '<=45')`, [ID.tahap1, ID.slot1]);
      const ids = await q<{ id: string }>(`select id from ks_pendaftar where sumber_row_key in ('klaim-a', 'klaim-b') order by sumber_row_key`);
      const hasil = await tulisPenempatan(tahap1, [
        {
          slot_id: ID.slot1,
          pengajar_id: ID.bilal,
          putaran: 1,
          urutan_prioritas: 1,
          grup: { slot_id: ID.slot1, level: 'HITS Dasar', pita_umur: '<=45', pita_digabung: false, pendaftar_ids: ids.map((r) => r.id), usia_tertua_hari: 0 },
        },
      ], new Map([[slotTahap1.id, slotTahap1]]), sekarang);
      const a = await q<{ status: string }>(`select status from ks_pendaftar where sumber_row_key = 'klaim-a'`);
      check('usulan dilewati', hasil.tertulis.length === 0 && hasil.dilewati === 1, JSON.stringify(hasil));
      check('klaim sebagian digulung balik', a[0].status === 'valid', a[0].status);
    }
  } finally {
    await server.stop();
    await db.close();
  }
}

async function main() {
  uraiMurni();
  await uraiIntegrasi();
  console.log(`\n${passed} lulus, ${failed} gagal`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('UJI GAGAL DIJALANKAN', e);
  process.exit(1);
});
