/**
 * test-rekap-pertemuan.ts — tes murni Rekap Pertemuan Pengajar: matematika
 * periode 16–15, keputusan sinkron (segar/basi/backoff/beku), ringkasan &
 * status pertemuan, pencocokan guru (kunci WA ter-hash, override nama, nama
 * cadangan), penggabungan per program, dan normalisasi laporan hilmihs (nomor
 * WA & alasan teks TIDAK boleh ikut tersimpan).
 *
 * Tanpa DB, tanpa env. Semua nama & nomor di sini sintetis.
 *
 * Jalankan: npm run test-rekap-pertemuan
 */
import assert from 'node:assert/strict';
import {
  periodePengajarOf,
  periodePengajarRange,
} from '@/lib/periode-pengajar';
import {
  BACKOFF_GAGAL_MS,
  JUMLAH_PERIODE_MUNDUR,
  MIN_JARAK_CRON_MS,
  gabungProgram,
  geserPeriode,
  hariIniWib,
  hashKunci,
  hitungRingkasan,
  labelAlasan,
  nadaRingkasan,
  normalisasiNama,
  periodeBeku,
  periodePertemuanOptions,
  periodeValid,
  periodeYangDisinkron,
  perluSinkron,
  pilihHalaqahGuru,
  ringkasTotal,
  statusData,
  statusItem,
  type GuruSnapshot,
  type HalaqahPertemuan,
  type PertemuanItem,
  type SnapshotPertemuan,
} from '@/lib/rekap-pertemuan';
import { normalizeWhatsApp } from '@/lib/whatsapp';

let lulus = 0;
let gagal = 0;
async function uji(nama: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    lulus++;
    console.log(`ok   ${nama}`);
  } catch (e) {
    gagal++;
    console.error(`FAIL ${nama}\n  ${e instanceof Error ? e.message.split('\n').join('\n  ') : String(e)}`);
  }
}

const SECRET = 'rahasia-uji-sintetis-0123456789';
const MENIT = 60_000;
const JAM = 60 * MENIT;

function item(p: Partial<PertemuanItem> & { id: string; tanggal: string }): PertemuanItem {
  return { urutan: null, selesai: false, konfirmasi: null, alasan: null, ...p };
}

function snap(p: Partial<SnapshotPertemuan>): SnapshotPertemuan {
  return {
    versi: 1, periode: '2026-10', start: '2026-09-16', end: '2026-10-15',
    sidikKunci: 'abcd1234', syncedAt: null, sumberGeneratedAt: null,
    lastAttemptAt: null, lastError: null, guru: [], ...p,
  };
}

async function main() {
  // ── Periode ─────────────────────────────────────────────────────────────
  console.log('# periode 16–15');
  await uji('periodePengajarOf tgl 15 tetap bulan itu', () => assert.equal(periodePengajarOf('2026-09-15'), '2026-09'));
  await uji('periodePengajarOf tgl 16 masuk bulan depan', () => assert.equal(periodePengajarOf('2026-09-16'), '2026-10'));
  await uji('periodePengajarOf 31 Des → Januari tahun depan', () => assert.equal(periodePengajarOf('2026-12-31'), '2027-01'));
  await uji('periodePengajarOf 1 Jan → Januari', () => assert.equal(periodePengajarOf('2027-01-01'), '2027-01'));
  await uji('periodePengajarRange Januari menyeberang tahun', () =>
    assert.deepEqual(periodePengajarRange('2026-01'), { start: '2025-12-16', end: '2026-01-15' }));
  await uji('geserPeriode menyeberang tahun', () => {
    assert.equal(geserPeriode('2026-01', -1), '2025-12');
    assert.equal(geserPeriode('2025-12', 1), '2026-01');
    assert.equal(geserPeriode('2026-03', -15), '2024-12');
    assert.equal(geserPeriode('2026-03', 0), '2026-03');
  });
  await uji('periodePertemuanOptions: berjalan + 5 mundur, terbaru dulu', () => {
    const o = periodePertemuanOptions('2026-09-29');
    assert.equal(o.length, JUMLAH_PERIODE_MUNDUR + 1);
    assert.deepEqual(o.map((x) => x.value), ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
    assert.match(o[0].label, /16 Sep.*15 Okt 2026/);
  });
  await uji('periodePertemuanOptions menyeberang tahun', () => {
    const o = periodePertemuanOptions('2027-01-20');
    assert.deepEqual(o.map((x) => x.value), ['2027-02', '2027-01', '2026-12', '2026-11', '2026-10', '2026-09']);
  });
  await uji('periodeValid: fallback ke periode berjalan', () => {
    assert.equal(periodeValid('2026-08', '2026-09-29'), '2026-08');
    assert.equal(periodeValid('2026-05', '2026-09-29'), '2026-05');
    assert.equal(periodeValid('2026-04', '2026-09-29'), '2026-10', 'terlalu lama');
    assert.equal(periodeValid('2026-11', '2026-09-29'), '2026-10', 'masa depan');
    assert.equal(periodeValid('2026-13', '2026-09-29'), '2026-10');
    assert.equal(periodeValid('ngawur', '2026-09-29'), '2026-10');
    assert.equal(periodeValid("2026-10'; drop", '2026-09-29'), '2026-10');
    assert.equal(periodeValid(null, '2026-09-29'), '2026-10');
    assert.equal(periodeValid(undefined, '2026-09-29'), '2026-10');
  });
  await uji('hariIniWib: 17.30 UTC tgl 15 = tgl 16 WIB', () => {
    assert.equal(hariIniWib(new Date('2026-09-15T17:30:00Z')), '2026-09-16');
    assert.equal(hariIniWib(new Date('2026-09-15T16:59:00Z')), '2026-09-15');
  });
  await uji('periodeYangDisinkron: periode lalu ikut s/d tgl 18', () => {
    assert.deepEqual(periodeYangDisinkron('2026-09-15'), ['2026-09']);
    assert.deepEqual(periodeYangDisinkron('2026-09-16'), ['2026-10', '2026-09']);
    assert.deepEqual(periodeYangDisinkron('2026-09-18'), ['2026-10', '2026-09']);
    assert.deepEqual(periodeYangDisinkron('2026-09-19'), ['2026-10']);
    assert.deepEqual(periodeYangDisinkron('2026-12-17'), ['2027-01', '2026-12']);
    assert.deepEqual(periodeYangDisinkron('2026-10-01'), ['2026-10']);
  });
  await uji('periodeBeku: setelah end + 3 hari', () => {
    assert.equal(periodeBeku('2026-09', '2026-09-18'), false);
    assert.equal(periodeBeku('2026-09', '2026-09-19'), true);
    assert.equal(periodeBeku('2026-10', '2026-09-29'), false);
    assert.equal(periodeBeku('2026-12', '2026-12-19'), true);
  });

  // ── Keputusan sinkron ───────────────────────────────────────────────────
  console.log('\n# perluSinkron & statusData');
  const now = new Date('2026-09-29T05:00:00Z');
  const lalu = (msLalu: number) => new Date(now.getTime() - msLalu).toISOString();
  await uji('tanpa snapshot → ya', () => assert.equal(perluSinkron(null, '2026-10', now), 'ya'));
  await uji('belum pernah sukses, gagal 5 menit lalu → backoff', () =>
    assert.equal(perluSinkron(snap({ lastAttemptAt: lalu(5 * MENIT) }), '2026-10', now), 'backoff'));
  await uji('belum pernah sukses, gagal 20 menit lalu → ya', () =>
    assert.equal(perluSinkron(snap({ lastAttemptAt: lalu(20 * MENIT) }), '2026-10', now), 'ya'));
  await uji('sidik kunci beda → ya', () =>
    assert.equal(perluSinkron(snap({ syncedAt: lalu(10 * MENIT), lastAttemptAt: lalu(BACKOFF_GAGAL_MS + MENIT) }), '2026-10', now, { sidikKunci: 'ffff0000' }), 'ya'));
  await uji('sidik kunci beda, percobaan baru → backoff', () =>
    assert.equal(perluSinkron(snap({ syncedAt: lalu(JAM), lastAttemptAt: lalu(2 * MENIT) }), '2026-10', now, { sidikKunci: 'ffff0000' }), 'backoff'));
  await uji('sidik kunci sama & segar → tidak', () =>
    assert.equal(perluSinkron(snap({ syncedAt: lalu(JAM), lastAttemptAt: lalu(JAM) }), '2026-10', now, { sidikKunci: 'abcd1234' }), 'tidak'));
  await uji('periode snapshot beda → ya', () =>
    assert.equal(perluSinkron(snap({ periode: '2026-09', syncedAt: lalu(JAM) }), '2026-10', now), 'ya'));
  await uji('disinkron 1 jam lalu → tidak', () =>
    assert.equal(perluSinkron(snap({ syncedAt: lalu(JAM), lastAttemptAt: lalu(JAM) }), '2026-10', now), 'tidak'));
  await uji('disinkron 4 jam lalu → ya', () =>
    assert.equal(perluSinkron(snap({ syncedAt: lalu(4 * JAM), lastAttemptAt: lalu(4 * JAM) }), '2026-10', now), 'ya'));
  await uji('basi + gagal 5 menit lalu → backoff', () =>
    assert.equal(perluSinkron(snap({ syncedAt: lalu(4 * JAM), lastAttemptAt: lalu(5 * MENIT) }), '2026-10', now), 'backoff'));
  await uji('basi + gagal 20 menit lalu → ya', () =>
    assert.equal(perluSinkron(snap({ syncedAt: lalu(4 * JAM), lastAttemptAt: lalu(20 * MENIT) }), '2026-10', now), 'ya'));
  await uji('maxAgeMs cron: 45 menit → ya, 20 menit → tidak', () => {
    const o = { maxAgeMs: MIN_JARAK_CRON_MS };
    assert.equal(perluSinkron(snap({ syncedAt: lalu(45 * MENIT), lastAttemptAt: lalu(45 * MENIT) }), '2026-10', now, o), 'ya');
    assert.equal(perluSinkron(snap({ syncedAt: lalu(20 * MENIT), lastAttemptAt: lalu(20 * MENIT) }), '2026-10', now, o), 'tidak');
  });
  await uji('periode beku, sinkron terakhir sesudah batas → beku', () =>
    assert.equal(perluSinkron(snap({ periode: '2026-09', syncedAt: '2026-09-19T01:00:00Z' }), '2026-09', now), 'beku'));
  await uji('periode beku, 01.00 WIB tgl 19 (18.00 UTC tgl 18) → beku', () =>
    assert.equal(perluSinkron(snap({ periode: '2026-09', syncedAt: '2026-09-18T18:00:00Z' }), '2026-09', now), 'beku'));
  await uji('periode beku, sinkron terakhir sebelum batas → ya (sekali lagi)', () =>
    assert.equal(perluSinkron(snap({ periode: '2026-09', syncedAt: '2026-09-18T10:00:00Z' }), '2026-09', now), 'ya'));
  await uji('statusData kosong/segar/basi', () => {
    assert.equal(statusData(null, now), 'kosong');
    assert.equal(statusData(snap({ lastAttemptAt: lalu(MENIT), lastError: 'x' }), now), 'kosong');
    assert.equal(statusData(snap({ syncedAt: lalu(JAM) }), now), 'segar');
    assert.equal(statusData(snap({ syncedAt: lalu(9 * JAM) }), now), 'basi');
  });

  // ── Ringkasan ───────────────────────────────────────────────────────────
  console.log('\n# ringkasan & status');
  const HARI = '2026-09-29';
  const items: PertemuanItem[] = [
    item({ id: 'j:1', tanggal: '2026-09-20', urutan: 1, selesai: true }),
    item({ id: 'j:2', tanggal: '2026-09-22', urutan: 2 }),
    item({ id: 'j:3', tanggal: '2026-09-24', urutan: 3, konfirmasi: 'tidak_mengajar', alasan: 'izin' }),
    item({ id: 'j:4', tanggal: '2026-09-26', urutan: 4, konfirmasi: 'mengajar' }),
    item({ id: 'j:5', tanggal: '2026-09-29', urutan: 5 }),
    item({ id: 'j:6', tanggal: '2026-10-02', urutan: 6, selesai: true }),
    item({ id: 'j:7', tanggal: '2026-10-05', urutan: 7 }),
  ];
  await uji('statusItem', () => {
    assert.deepEqual(items.map((i) => statusItem(i, HARI)),
      ['selesai', 'terlewat', 'berhalangan', 'dikonfirmasi', 'akan_datang', 'selesai', 'akan_datang']);
  });
  await uji('statusItem: tidak mengajar tetap berhalangan walau CMS menandai selesai (diajar badal)', () => {
    assert.equal(statusItem(item({ id: 'j:b', tanggal: '2026-09-20', selesai: true, konfirmasi: 'tidak_mengajar', alasan: 'badal' }), HARI), 'berhalangan');
  });
  await uji('hitungRingkasan: hari ini = akan datang, done di masa depan = selesai', () => {
    assert.deepEqual(hitungRingkasan(items, HARI), {
      terjadwal: 7, selesai: 2, dikonfirmasiMengajar: 1, berhalangan: 1,
      terlewat: 1, akanDatang: 2, jatuhTempo: 5,
    });
  });
  await uji('hitungRingkasan kosong', () =>
    assert.deepEqual(hitungRingkasan([], HARI), {
      terjadwal: 0, selesai: 0, dikonfirmasiMengajar: 0, berhalangan: 0, terlewat: 0, akanDatang: 0, jatuhTempo: 0,
    }));
  await uji('nadaRingkasan ambang', () => {
    const r = hitungRingkasan(items, HARI);
    assert.equal(nadaRingkasan(r), 'kuning');
    assert.equal(nadaRingkasan({ ...r, terlewat: 0 }), 'hijau');
    assert.equal(nadaRingkasan({ ...r, terlewat: 2 }), 'merah');
    assert.equal(nadaRingkasan(hitungRingkasan([], HARI)), 'netral');
  });
  await uji('labelAlasan', () => {
    assert.equal(labelAlasan('sakit'), 'Sakit');
    assert.equal(labelAlasan('izin'), 'Izin');
    assert.equal(labelAlasan('badal'), 'Digantikan badal');
    assert.equal(labelAlasan('lain'), 'Berhalangan');
    assert.equal(labelAlasan(null), 'Berhalangan');
  });

  // ── Kunci & nama ────────────────────────────────────────────────────────
  console.log('\n# kunci & nama');
  await uji('hashKunci deterministik, 32 hex, beda per secret', () => {
    const a = hashKunci('wa:6281200000001', SECRET);
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.equal(hashKunci('wa:6281200000001', SECRET), a);
    assert.notEqual(hashKunci('wa:6281200000001', SECRET + 'x'), a);
    assert.notEqual(hashKunci('wa:6281200000002', SECRET), a);
  });
  await uji('normalisasiNama membuang gelar & diakritik', () => {
    assert.equal(normalisasiNama("Ustadzah Siti Nur'aini, S.Pd.I"), 'siti nur aini');
    assert.equal(normalisasiNama('Al-Ustadz Ahmad Lc., M.A.'), 'ahmad');
    assert.equal(normalisasiNama('Dr. H. Muhammad Fáthir S.Ag'), 'muhammad fathir');
    assert.equal(normalisasiNama('Ust. Budi  S. Pd'), 'budi');
    assert.equal(normalisasiNama('  Syaikh   Umar  '), 'umar');
    assert.equal(normalisasiNama('M. Ahmad'), 'm ahmad');
  });

  // ── Pencocokan guru ─────────────────────────────────────────────────────
  console.log('\n# pencocokan guru');
  const K1 = hashKunci('wa:6281200000001', SECRET);
  const K5 = hashKunci('wa:6281200000005', SECRET);
  const hs = (programNama: string, programSlug: string | null, halaqahNama: string, kunci: string | null, extra: Partial<GuruSnapshot['halaqah'][number]> = {}) => ({
    programNama, programSlug, halaqahNama, sebagaiBadal: false, guruUtama: null, kunci,
    pertemuan: [item({ id: `j:${halaqahNama}`, tanggal: '2026-09-20' })], ...extra,
  });
  const GURU: GuruSnapshot[] = [
    { nama: 'Ustadz Ahmad Fauzi', namaNorm: 'ahmad fauzi', kunci: [K1], halaqah: [
      hs('HITS', 'hits', 'Halaqah A', K1),
      hs('Mabni', null, 'Mabni B', null),
      hs('HITS', 'hits', 'Halaqah C', K1, { sebagaiBadal: true, guruUtama: 'Umar Sintetis' }),
    ] },
    { nama: 'Budi Santoso', namaNorm: 'budi santoso', kunci: [], halaqah: [hs('Mabni', null, 'Mabni D', null)] },
    { nama: 'Citra', namaNorm: 'citra', kunci: [], halaqah: [hs('Mabni', null, 'Mabni E', null)] },
    { nama: 'Citra', namaNorm: 'citra', kunci: [], halaqah: [hs('Mabni', null, 'Mabni F', null)] },
    { nama: 'Dedi', namaNorm: 'dedi', kunci: [K5], halaqah: [hs('Tahsin', 'tahsin', 'Tahsin G', K5)] },
  ];
  const kosong = new Set<string>();
  await uji('cocok lewat hash WA → SEMUA halaqah guru itu (termasuk Mabni tanpa nomor)', () => {
    const r = pilihHalaqahGuru(GURU, new Set([K1]), kosong, kosong);
    assert.equal(r.dicocokkan, true);
    assert.deepEqual(r.halaqah.map((h) => h.halaqahNama), ['Halaqah A', 'Mabni B', 'Halaqah C']);
    assert.ok(r.halaqah.every((h) => h.cocokLewat === 'wa' && h.sumber === 'dashboard-edu'));
    assert.deepEqual(r.halaqah.map((h) => h.programKey), ['hits', 'nama:Mabni', 'hits']);
    const c = r.halaqah.find((h) => h.halaqahNama === 'Halaqah C')!;
    assert.equal(c.sebagaiBadal, true);
    assert.equal(c.guruUtama, 'Umar Sintetis');
  });
  await uji('guru bernama sama di hulu: halaqah bernomor LAIN tidak ikut', () => {
    const K9 = hashKunci('wa:6281200000009', SECRET);
    const gabung: GuruSnapshot[] = [{ nama: 'Ahmad', namaNorm: 'ahmad', kunci: [K1, K9], halaqah: [
      hs('HITS', 'hits', 'Milik saya', K1),
      hs('HITS', 'hits', 'Milik Ahmad lain', K9),
      hs('Mabni', null, 'Tanpa nomor', null),
    ] }];
    const r = pilihHalaqahGuru(gabung, new Set([K1]), kosong, kosong);
    assert.deepEqual(r.halaqah.map((h) => h.halaqahNama), ['Milik saya', 'Tanpa nomor']);
  });
  await uji('cocok lewat nama eksplisit (override nm:)', () => {
    const r = pilihHalaqahGuru(GURU, kosong, new Set(['budi santoso']), kosong);
    assert.equal(r.dicocokkan, true);
    assert.deepEqual(r.halaqah.map((h) => [h.halaqahNama, h.cocokLewat]), [['Mabni D', 'nama']]);
  });
  await uji('hash + nama eksplisit digabung', () => {
    const r = pilihHalaqahGuru(GURU, new Set([K5]), new Set(['budi santoso']), kosong);
    assert.deepEqual(r.halaqah.map((h) => [h.halaqahNama, h.cocokLewat]).sort(), [['Mabni D', 'nama'], ['Tahsin G', 'wa']]);
  });
  await uji('nama cadangan: unik & tanpa kunci → cocok', () => {
    const r = pilihHalaqahGuru(GURU, kosong, kosong, new Set(['budi santoso']));
    assert.equal(r.dicocokkan, true);
    assert.deepEqual(r.halaqah.map((h) => [h.halaqahNama, h.cocokLewat]), [['Mabni D', 'nama']]);
  });
  await uji('nama cadangan: nama kembar → tidak cocok', () => {
    const r = pilihHalaqahGuru(GURU, kosong, kosong, new Set(['citra']));
    assert.equal(r.dicocokkan, false);
    assert.deepEqual(r.halaqah, []);
  });
  await uji('nama cadangan: guru berkunci WA → tidak cocok lewat nama', () => {
    const r = pilihHalaqahGuru(GURU, kosong, kosong, new Set(['dedi']));
    assert.equal(r.dicocokkan, false);
  });
  await uji('nama cadangan tetap dipakai walau hash sudah cocok (program tanpa nomor, ejaan beda)', () => {
    const r = pilihHalaqahGuru(GURU, new Set([K5]), kosong, new Set(['budi santoso']));
    assert.deepEqual(r.halaqah.map((h) => [h.halaqahNama, h.cocokLewat]), [['Tahsin G', 'wa'], ['Mabni D', 'nama']]);
  });
  await uji('nama dibandingkan tanpa spasi: "nur layla" = "nurlayla"', () => {
    const g: GuruSnapshot[] = [{ nama: 'Nurlayla', namaNorm: 'nurlayla', kunci: [], halaqah: [hs('HKM', null, 'HKM 8', null)] }];
    assert.equal(pilihHalaqahGuru(g, kosong, kosong, new Set(['nur layla'])).dicocokkan, true);
    assert.equal(pilihHalaqahGuru(g, kosong, new Set(['nur layla']), kosong).dicocokkan, true);
  });
  await uji('tak ada yang cocok → dicocokkan=false', () => {
    const r = pilihHalaqahGuru(GURU, new Set([hashKunci('wa:6289999999999', SECRET)]), new Set(['tak ada']), new Set(['tak ada']));
    assert.equal(r.dicocokkan, false);
    assert.deepEqual(r.halaqah, []);
  });

  // ── Penggabungan program ────────────────────────────────────────────────
  console.log('\n# gabungProgram');
  const hp = (p: Partial<HalaqahPertemuan> & { programKey: string; programNama: string; halaqahNama: string }): HalaqahPertemuan => ({
    sumber: 'dashboard-edu', sebagaiBadal: false, guruUtama: null, cocokLewat: 'wa', pertemuan: [], ...p,
  });
  const masukan: HalaqahPertemuan[] = [
    hp({ sumber: 'maahir', programKey: 'maahir', programNama: 'Kelas Maahir', halaqahNama: 'Kelas 6C', cocokLewat: 'akun-maahir', tautan: '/kehadiran/pengajar-maahir',
      pertemuan: [item({ id: 'm:k6c:2026-09-21', tanggal: '2026-09-21', urutan: 1, selesai: true })] }),
    hp({ programKey: 'tahsin', programNama: 'Tahsin', halaqahNama: 'T1', cocokLewat: 'nama',
      pertemuan: [item({ id: 'j:1', tanggal: '2026-09-20', urutan: 3 }), item({ id: 'j:2', tanggal: '2026-09-18', urutan: 1, selesai: true })] }),
    hp({ programKey: 'tahsin', programNama: 'Tahsin', halaqahNama: 'T1',
      pertemuan: [item({ id: 'j:2', tanggal: '2026-09-18', urutan: 1, selesai: true }), item({ id: 'j:3', tanggal: '2026-09-19', urutan: 2 })] }),
    hp({ programKey: 'nama:Mabni', programNama: 'Mabni', halaqahNama: 'Mabni B', pertemuan: [item({ id: 'j:9', tanggal: '2026-09-25' })] }),
    hp({ programKey: 'hits', programNama: 'HITS', halaqahNama: 'A (badal)', sebagaiBadal: true, guruUtama: 'Umar Sintetis', pertemuan: [item({ id: 'j:10', tanggal: '2026-09-22' })] }),
    hp({ programKey: 'hits', programNama: 'HITS', halaqahNama: 'Z Reguler', pertemuan: [item({ id: 'j:11', tanggal: '2026-09-23' })] }),
    hp({ programKey: 'hits', programNama: 'HITS', halaqahNama: 'B Reguler', pertemuan: [item({ id: 'j:12', tanggal: '2026-09-24' })] }),
  ];
  const programs = gabungProgram(masukan);
  await uji('urutan program: nama, Kelas Maahir terakhir', () =>
    assert.deepEqual(programs.map((p) => p.programNama), ['HITS', 'Mabni', 'Tahsin', 'Kelas Maahir']));
  await uji('halaqah kembar digabung, pertemuan didedup & diurut tanggal', () => {
    const t = programs.find((p) => p.programKey === 'tahsin')!;
    assert.equal(t.halaqah.length, 1);
    assert.deepEqual(t.halaqah[0].pertemuan.map((i) => i.id), ['j:2', 'j:3', 'j:1']);
    assert.equal(t.halaqah[0].cocokLewat, 'wa', 'cocokLewat terkuat menang');
  });
  await uji('halaqah: non-badal dulu, lalu nama', () => {
    const h = programs.find((p) => p.programKey === 'hits')!;
    assert.deepEqual(h.halaqah.map((x) => x.halaqahNama), ['B Reguler', 'Z Reguler', 'A (badal)']);
  });
  await uji('maahir tetap sumber maahir & membawa tautan', () => {
    const m = programs[programs.length - 1];
    assert.equal(m.sumber, 'maahir');
    assert.equal(m.halaqah[0].tautan, '/kehadiran/pengajar-maahir');
  });
  await uji('gabungProgram tidak mengubah masukan', () =>
    assert.equal(masukan[1].pertemuan.length, 2));
  await uji('ringkasTotal atas pertemuan unik', () => {
    const r = ringkasTotal(programs, HARI);
    assert.equal(r.terjadwal, 8);
    assert.equal(r.selesai, 2);
    assert.equal(r.terlewat, 6);
  });

  // ── Normalisasi laporan hilmihs ─────────────────────────────────────────
  console.log('\n# normalisasiLaporan (hilmihs/report)');
  let report: typeof import('@/lib/hilmihs/report') | null = null;
  try {
    report = await import('@/lib/hilmihs/report');
  } catch (e) {
    await uji('impor @/lib/hilmihs/report', () => { throw e; });
  }
  if (report) {
    const { normalisasiLaporan } = report;
    const teachers = [{
      pengajar: 'Ustadz Fulan Sintetis',
      guruIds: [9],
      totalReal: 1,
      totalIdeal: 4,
      halaqah: [
        {
          program: 'HITS Reguler', halaqah: 'Halaqah Uji 1', real: 1, ideal: 3, asBadal: false, mainTeacher: null,
          gender: 1, guruPhone: '0812-3456-7890',
          meetings: [
            { jadwalId: 101, programId: 'p1', order: 1, date: '2026-09-20', done: true, confStatus: null, reasonCode: null, reasonText: null },
            { jadwalId: 102, programId: 'p1', order: 2, date: '2026-09-27', done: false, confStatus: 'tidak_mengajar', reasonCode: 'izin', reasonText: 'rahasia' },
            { jadwalId: 104, programId: 'p1', order: 3, date: '2026-09-28', done: false, confStatus: 'Tidak Mengajar', reasonCode: 'lainnya', reasonText: 'rahasia juga' },
            { jadwalId: 105, programId: 'p1', order: 4, date: '2026-09-29', done: false, confStatus: 'data_tidak_sesuai', reasonCode: null, reasonText: null },
            { jadwalId: 106, programId: 'p1', order: 5, date: '2026-09-30', done: false, confStatus: 'diisi_koordinator', reasonCode: null, reasonText: null },
          ],
        },
        {
          program: 'Mabni', halaqah: 'Mabni Uji', real: 0, ideal: 1, asBadal: true, mainTeacher: 'Guru Utama Sintetis',
          gender: null, guruPhone: null,
          meetings: [
            { jadwalId: 103, order: 1, date: '2026-09-21', done: false, confStatus: 'mengajar', reasonCode: null },
          ],
        },
      ],
    }];
    const slug = new Map([['HITS Reguler', 'hits-reguler']]);
    const out = normalisasiLaporan(teachers, slug, SECRET);
    const kunciWa = hashKunci('wa:' + normalizeWhatsApp('0812-3456-7890'), SECRET);
    const json = JSON.stringify(out);

    await uji('nomor WA & alasan teks tidak ikut tersimpan', () => {
      assert.ok(!json.includes('81234567890'), 'nomor WA bocor');
      assert.ok(!json.includes('rahasia'), 'reasonText bocor');
      assert.ok(!json.includes('guruPhone') && !json.includes('reasonText'), 'kolom sensitif ikut');
    });
    await uji('kunci = hashKunci(wa:+normalisasi)', () => {
      assert.equal(out.length, 1);
      const g = out[0];
      assert.equal(g.namaNorm, 'fulan sintetis');
      assert.deepEqual(g.kunci, [kunciWa]);
      const [h1, h2] = g.halaqah;
      assert.equal(h1.kunci, kunciWa);
      assert.equal(h2.kunci, null);
      assert.equal(h1.programSlug, 'hits-reguler');
      assert.equal(h2.programSlug, null);
      assert.equal(h2.sebagaiBadal, true);
      assert.equal(h2.guruUtama, 'Guru Utama Sintetis');
    });
    await uji('confStatus & reasonCode → konfirmasi/alasan', () => {
      const semua = out[0].halaqah.flatMap((h) => h.pertemuan);
      const byId = new Map(semua.map((i) => [i.id, i]));
      assert.deepEqual(byId.get('j:101'), { id: 'j:101', tanggal: '2026-09-20', urutan: 1, selesai: true, konfirmasi: null, alasan: null });
      assert.equal(byId.get('j:102')?.konfirmasi, 'tidak_mengajar');
      assert.equal(byId.get('j:102')?.alasan, 'izin');
      assert.equal(byId.get('j:104')?.konfirmasi, 'tidak_mengajar');
      assert.equal(byId.get('j:104')?.alasan, 'lain');
      assert.equal(byId.get('j:103')?.konfirmasi, 'mengajar');
      assert.equal(byId.get('j:103')?.alasan, null);
      // `data_tidak_sesuai` bukan berhalangan (dulu salah kena pola /tidak/).
      assert.equal(byId.get('j:105')?.konfirmasi, null);
      assert.equal(byId.get('j:106')?.konfirmasi, 'mengajar');
    });
    await uji('ujung-ke-ujung: WA akun (format lain) cocok ke semua halaqah guru', () => {
      const r = pilihHalaqahGuru(out, new Set([hashKunci('wa:' + normalizeWhatsApp('+62 812 3456 7890'), SECRET)]), kosong, kosong);
      assert.equal(r.dicocokkan, true);
      assert.deepEqual(r.halaqah.map((h) => h.halaqahNama), ['Halaqah Uji 1', 'Mabni Uji']);
      assert.deepEqual(r.halaqah.map((h) => h.programKey), ['hits-reguler', 'nama:Mabni']);
    });
  }

  console.log(gagal === 0 ? `\nSEMUA LULUS (${lulus})` : `\n${lulus} lulus, ${gagal} GAGAL`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
