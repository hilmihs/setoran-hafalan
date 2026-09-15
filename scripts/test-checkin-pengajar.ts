/**
 * test-checkin-pengajar.ts — uji check-in kehadiran pengajar Kelas Maahir
 * terhadap Postgres sungguhan (PGlite via wire-protocol), memakai lib aplikasi
 * apa adanya: periode 16–15, sesi terjadwal minus libur, check-in hari-H vs
 * susulan, penolakan (kelas bukan miliknya, bukan jadwal, periode tertutup,
 * tanggal depan), rekap pemantau.
 *
 * Jalankan: npm run test-checkin-pengajar
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
CREATE TABLE program_kelas_libur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_kelas_id uuid REFERENCES program_kelas(id) ON DELETE CASCADE,
  tanggal_mulai date NOT NULL,
  tanggal_selesai date NOT NULL,
  keterangan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE koordinator (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, gender text NOT NULL, whatsapp_number text NOT NULL,
  password_hash text NOT NULL DEFAULT 'x', active boolean NOT NULL DEFAULT true,
  kehadiran_only boolean NOT NULL DEFAULT false
);
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_role text, actor_id uuid, action text, target_table text, target_id text,
  detail jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
`;

const KELAS_6C = '11111111-1111-4111-8111-111111111111';
const KELAS_6D = '11111111-1111-4111-8111-222222222222';
const KELAS_LAIN = '11111111-1111-4111-8111-333333333333';
const PENGAJAR_ID = '22222222-2222-4222-8222-222222222222';
const WA = '628100000001';
const KOOR_ID = '33333333-3333-4333-8333-333333333333';

const SEED = `
INSERT INTO program_kelas (id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai) VALUES
  ('${KELAS_6C}', 'Maahir 6C', 'akhwat', ARRAY['Senin','Kamis'], '07:30', '09:00'),
  ('${KELAS_6D}', 'Maahir 6D', 'akhwat', ARRAY['Senin','Kamis'], '12:30', '14:00'),
  ('${KELAS_LAIN}', 'Maahir 6A', 'akhwat', ARRAY['Senin','Kamis'], '09:00', '10:30');
-- Kamis 24 Sep 2026 libur untuk 6C saja.
INSERT INTO program_kelas_libur (program_kelas_id, tanggal_mulai, tanggal_selesai, keterangan)
  VALUES ('${KELAS_6C}', '2026-09-24', '2026-09-24', 'libur uji');
INSERT INTO maahir_pengajar (id, name, gender, whatsapp_number)
  VALUES ('${PENGAJAR_ID}', 'Ustadzah Uji', 'akhwat', '${WA}');
INSERT INTO maahir_pengajar_kelas (pengajar_id, program_kelas_id) VALUES
  ('${PENGAJAR_ID}', '${KELAS_6C}'), ('${PENGAJAR_ID}', '${KELAS_6D}');
INSERT INTO koordinator (id, name, gender, whatsapp_number) VALUES ('${KOOR_ID}', 'Koor Uji', 'ikhwan', '628100000009');
`;

async function main() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  // Migrasi asli, tanpa begin/commit (PGlite exec sudah satu transaksi per exec).
  const fs = await import('node:fs');
  const mig = fs
    .readFileSync('supabase/migrations/0076_maahir_checkin_pengajar.sql', 'utf8')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
  await db.exec(mig);
  await db.exec(SEED);

  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.PG_POOL_MAX = '1';
  process.env.SESSION_SECRET ??= '0123456789abcdef0123456789abcdef0123';

  const periode = await import('../src/lib/periode-pengajar');
  const lib = await import('../src/lib/maahir-checkin-pengajar');
  const actor = { role: 'koordinator' as const, koordinator_id: KOOR_ID, name: 'Koor Uji', gender: 'ikhwan' as const };

  try {
    // 0. Periode 16–15 murni.
    {
      check('16 Sep masuk periode 2026-10', periode.periodePengajarOf('2026-09-16') === '2026-10');
      check('15 Sep masuk periode 2026-09', periode.periodePengajarOf('2026-09-15') === '2026-09');
      check('16 Des masuk periode tahun berikutnya', periode.periodePengajarOf('2026-12-16') === '2027-01');
      const r = periode.periodePengajarRange('2027-01');
      check('rentang 2027-01 = 16 Des 2026 – 15 Jan 2027', r.start === '2026-12-16' && r.end === '2027-01-15', JSON.stringify(r));
      check('periode berjalan pada 20 Sep = 2026-10', periode.periodePengajarBerjalan('2026-09-20') === '2026-10');
      check('tanggal periode lalu tertutup', periode.periodePengajarTerbuka('2026-10-10', '2026-10-20') === false);
      check('tanggal periode berjalan terbuka', periode.periodePengajarTerbuka('2026-10-14', '2026-10-15') === true);
      check('sebelum anchor: tampilan = periode pertama', periode.periodePengajarTampilan('2026-09-15') === '2026-10');
      check('sebelum anchor: opsi tetap 1 (periode pertama)', periode.periodePengajarOptions('2026-09-15').map((o) => o.value).join() === '2026-10');
      const opts = periode.periodePengajarOptions('2026-11-20');
      check('opsi periode: anchor s/d berjalan, terbaru dulu', opts.map((o) => o.value).join() === '2026-12,2026-11,2026-10', JSON.stringify(opts.map((o) => o.value)));
    }

    // 1. Akses lewat WA.
    const akses = await lib.findPengajarMaahir(WA);
    check('pengajar ketemu lewat WA', !!akses && akses.pengajar.name === 'Ustadzah Uji');
    check('2 kelas diampu, urut jam', akses?.kelas.map((k) => k.name).join() === 'Maahir 6C,Maahir 6D', JSON.stringify(akses?.kelas.map((k) => k.name)));
    check('WA asing → null', (await lib.findPengajarMaahir('628199999999')) === null);
    if (!akses) throw new Error('akses kosong');

    // 2. Sesi terjadwal periode 2026-10 (16 Sep – 15 Okt), "hari ini" = Senin 21 Sep.
    const HARI_INI = '2026-09-21';
    {
      const sesi = await lib.getSesiPengajar(akses, '2026-10', HARI_INI);
      const c6 = sesi.filter((s) => s.kelasName === 'Maahir 6C');
      const d6 = sesi.filter((s) => s.kelasName === 'Maahir 6D');
      // Senin/Kamis 16 Sep–15 Okt: 17,21,24,28 Sep; 1,5,8,12,15 Okt = 9 sesi; 6C libur 24 Sep → 8.
      check('6D punya 9 sesi Senin/Kamis', d6.length === 9, String(d6.length));
      check('6C 8 sesi (24 Sep libur dibuang)', c6.length === 8 && !c6.some((s) => s.tanggal === '2026-09-24'), String(c6.length));
      check('tak ada sesi At-Tibyan Sabtu', !sesi.some((s) => s.tanggal === '2026-09-19'));
      check('sesi pertama 17 Sep (16 Sep Rabu bukan jadwal)', sesi[0]?.tanggal === '2026-09-17');
      check('sesi 21 Sep lampau & boleh isi', sesi.find((s) => s.tanggal === '2026-09-21' && s.kelasName === 'Maahir 6C')?.bolehIsi === true);
      check('sesi 28 Sep belum lampau', sesi.find((s) => s.tanggal === '2026-09-28')?.lampau === false);
      const ring = lib.ringkasSesi(sesi);
      check('ringkasan awal: terjadwal 2 hari × 2 kelas − libur = 4, belum 4', ring.terjadwal === 4 && ring.belum === 4 && ring.persen === 0, JSON.stringify(ring));
    }

    // 3. Check-in hari-H.
    {
      const r = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6C, tanggal: HARI_INI, status: 'hadir', materi: 'Bab Idgham', catatan: '' }, actor, HARI_INI);
      check('check-in hari-H ok', r.ok, JSON.stringify(r));
      check('hari-H bukan susulan', r.ok && r.checkin.susulan === false);
      check('materi tersimpan', r.ok && r.checkin.materi === 'Bab Idgham');
    }
    // 4. Susulan untuk sesi lampau (17 Sep).
    {
      const r = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6D, tanggal: '2026-09-17', status: 'hadir', materi: '', catatan: '' }, actor, HARI_INI);
      check('susulan ok', r.ok, JSON.stringify(r));
      check('ditandai susulan', r.ok && r.checkin.susulan === true);
      // Sunting materi belakangan: susulan tak berubah.
      const r2 = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6D, tanggal: '2026-09-17', status: 'hadir', materi: 'Makharijul huruf', catatan: '' }, actor, HARI_INI);
      check('sunting materi ok & susulan tetap', r2.ok && r2.checkin.susulan === true && r2.checkin.materi === 'Makharijul huruf', JSON.stringify(r2));
    }
    // 5. Penolakan.
    {
      const lain = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_LAIN, tanggal: HARI_INI, status: 'hadir', materi: '', catatan: '' }, actor, HARI_INI);
      check('kelas bukan miliknya ditolak', !lain.ok);
      const bukanJadwal = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6C, tanggal: '2026-09-22', status: 'hadir', materi: '', catatan: '' }, actor, HARI_INI);
      check('Selasa bukan jadwal ditolak', !bukanJadwal.ok);
      const libur = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6C, tanggal: '2026-09-24', status: 'hadir', materi: '', catatan: '' }, actor, '2026-09-25');
      check('tanggal libur ditolak', !libur.ok);
      const depan = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6C, tanggal: '2026-09-28', status: 'hadir', materi: '', catatan: '' }, actor, HARI_INI);
      check('tanggal depan ditolak', !depan.ok);
      const tutup = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6C, tanggal: '2026-09-21', status: 'hadir', materi: '', catatan: '' }, actor, '2026-10-16');
      check('periode tertutup ditolak', !tutup.ok && /ditutup/.test(tutup.ok ? '' : tutup.error));
      const izinTanpaAlasan = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6D, tanggal: HARI_INI, status: 'izin', materi: '', catatan: '' }, actor, HARI_INI);
      check('izin tanpa alasan ditolak', !izinTanpaAlasan.ok);
      const izin = await lib.simpanCheckinPengajar(akses, { kelasId: KELAS_6D, tanggal: HARI_INI, status: 'izin', materi: '', catatan: 'ada undangan' }, actor, HARI_INI);
      check('izin dengan alasan ok', izin.ok);
    }
    // 6. Rekap pemantau.
    {
      const rekap = await lib.getRekapPengajarMaahir('2026-10', HARI_INI);
      check('rekap 1 pengajar', rekap.list.length === 1);
      const row = rekap.list[0];
      check('cutoff = hari ini (periode berjalan)', rekap.cutoff === HARI_INI);
      check('kelas terdaftar', row.kelasNames.join() === 'Maahir 6C,Maahir 6D');
      const g = row.ringkasan;
      // Lampau: 6C 17,21 (2) ; 6D 17,21 (2) = 4. Hadir: 6C 21, 6D 17 = 2. Izin: 6D 21. Belum: 6C 17.
      check('ringkasan: terjadwal 4, hadir 2, izin 1, belum 1', g.terjadwal === 4 && g.hadir === 2 && g.izin === 1 && g.belum === 1, JSON.stringify(g));
      check('persen 50', g.persen === 50, String(g.persen));
      check('materi kosong 0 (keduanya sudah diisi)', g.materiKosong === 0, String(g.materiKosong));
      check('audit tercatat', Number((await db.query<{ n: number }>('select count(*)::int as n from audit_log')).rows[0]?.n) >= 4);
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
