// Uji fungsi murni Evaluasi Halaqah: taksonomi Lahn, skor, tier, ambang.
// Jalankan: npm run test-evaluasi
import {
  JALIY, KHAFIY, ALL_LAHN, LAHN_BY_KEY, emptyCounts,
  scoreOf, tierOf, AMBANG, columnFor,
  buildTrackGeometry, nilaiAkhirOf, nilaiAkhirTrackOf,
  type LahnCounts,
} from '@/lib/evaluasi';
import { buildTrackRapotPayload, type RapotIdentitas, type SesiNilaiInput } from '@/lib/rapot';
import { isPesertaManual, buatIdPesertaManual, bersihkanNamaPeserta } from '@/lib/evaluasi-peserta';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`); failed++; }
  else console.log(`ok   ${label}`);
}

eq(JALIY.length, 4, 'jaliy count');
eq(KHAFIY.length, 7, 'khafiy count');
eq(ALL_LAHN.length, 11, 'all lahn count');
eq(LAHN_BY_KEY.mad.group, 'jaliy', 'lookup group');
eq(columnFor('idghammimi'), 'kh_idgham_mimi', 'column mapping');

const c = { ...emptyCounts(), huruf: 1, idghambighunnah: 3, ikhfahakiki: 2, iqlab: 1, ikhfasyafawi: 2 };
eq(scoreOf(c), { skor: 78, jaliyCount: 1, khafiyCount: 8 }, 'scoreOf sample');
eq(scoreOf(emptyCounts()), { skor: 100, jaliyCount: 0, khafiyCount: 0 }, 'perfect');
eq(scoreOf({ ...emptyCounts(), huruf: 17 }).skor, 0, 'floor at zero');

eq(tierOf(95).label, 'Mumtaz', 'tier mumtaz');
eq(tierOf(70).label, 'Standar', 'tier standar boundary');
eq(tierOf(69).label, 'Cukup — di bawah standar', 'tier cukup');
eq(tierOf(10).label, 'Perlu pengulangan', 'tier ulang');
eq(AMBANG, 70, 'ambang const');

// --- Rapor trend-chart geometry ---
const empty = buildTrackGeometry([null, null, null, null]);
eq(empty.avg, null, 'geometry kosong: avg null');
eq(empty.points, '', 'geometry kosong: points kosong');
eq(empty.trend, 0, 'geometry kosong: trend 0');
eq(empty.sessions.map((x) => x.filled), [false, false, false, false], 'geometry kosong: semua unfilled');

const g = buildTrackGeometry([74, 79, 86, null]);
eq(g.sessions.filter((x) => x.filled).length, 3, 'geometry 3 filled');
eq(g.avg, 80, 'geometry avg 80 (round 79.667)');
eq(g.trend, 7, 'geometry trend 7');
eq(g.sessions[3].filled, false, 'geometry sesi ke-4 unfilled');
eq(g.points, '16,29.7 92,26.3 168,21.5', 'geometry points 3 titik');

// ── peserta yang ditambahkan pengajar sendiri ──
eq(isPesertaManual('manual:budi-ab12cd'), true, 'kenali id peserta manual');
eq(isPesertaManual('hits-regular-jan:769'), false, 'id remote bukan manual');
eq(buatIdPesertaManual('Ahmad  Zaki').startsWith('manual:ahmad-zaki-'), true, 'id manual pakai slug nama');
// Nama non-latin tetap harus menghasilkan id yang sah, bukan `manual:-abc123`.
eq(buatIdPesertaManual('عبد الله').startsWith('manual:peserta-'), true, 'nama non-latin tetap dapat id sah');
eq(buatIdPesertaManual('Budi') === buatIdPesertaManual('Budi'), false, 'nama sama tetap dapat id berbeda');

eq(bersihkanNamaPeserta('  Ahmad   Zaki  '), { nama: 'Ahmad Zaki' }, 'nama dirapikan');
eq('error' in bersihkanNamaPeserta('A'), true, 'tolak nama terlalu pendek');
eq('error' in bersihkanNamaPeserta('   '), true, 'tolak nama kosong');
eq('error' in bersihkanNamaPeserta(42), true, 'tolak nama bukan string');
eq('error' in bersihkanNamaPeserta('x'.repeat(81)), true, 'tolak nama terlalu panjang');
eq('error' in bersihkanNamaPeserta('x'.repeat(80)), false, 'terima nama tepat 80 huruf');

// ── Nilai akhir per-track (rotasi sumbu rapot, migrasi 0062) ──
// Bobot: 30% rata sesi berkala track itu + 70% ujian track itu; ambang lulus 70.
{
  const pb = nilaiAkhirTrackOf('pb', [80, 80, 80, 80], 60);
  eq(pb.nilai, 66, 'track pb: 0.3*80 + 0.7*60 = 66');
  eq(pb.lulus, false, 'track pb: 66 di bawah ambang 70 → tidak lulus');
  eq(pb.berkalaAvg, 80, 'track pb: berkalaAvg 80');
  eq(pb.ujianSkor, 60, 'track pb: ujianSkor 60');
  eq(pb.lengkap, true, 'track pb: kedua komponen ada → lengkap');
  eq(pb.track, 'pb', 'track pb: track ikut dikembalikan');

  // Berkala kosong TIDAK BOLEH dianggap 0 — kalau jadi 0, nilai maksimum diam-diam
  // terpotong ke 70 (0.3*0 + 0.7*100) dan peserta sempurna pun tampak pas-pasan.
  const qnTanpaBerkala = nilaiAkhirTrackOf('qn', [], 90);
  eq(qnTanpaBerkala.nilai, null, 'track qn: berkala kosong → nilai null, bukan 63');
  eq(qnTanpaBerkala.lengkap, false, 'track qn: berkala kosong → tidak lengkap');
  eq(qnTanpaBerkala.lulus, null, 'track qn: berkala kosong → lulus null');
  eq(qnTanpaBerkala.berkalaAvg, null, 'track qn: berkala kosong → berkalaAvg null');
  eq(qnTanpaBerkala.ujianSkor, 90, 'track qn: skor ujian tetap dilaporkan');

  // Ujian belum ada → nilai ditahan, walau berkala sudah lengkap 4 sesi.
  const pbTanpaUjian = nilaiAkhirTrackOf('pb', [70, 70, 70, 70], null);
  eq(pbTanpaUjian.nilai, null, 'track pb: ujian belum ada → nilai null');
  eq(pbTanpaUjian.lengkap, false, 'track pb: ujian belum ada → tidak lengkap');
  eq(pbTanpaUjian.lulus, null, 'track pb: ujian belum ada → lulus null');
  eq(pbTanpaUjian.berkalaAvg, 70, 'track pb: berkalaAvg tetap dihitung tanpa ujian');
}

// Mode ujianSaja (eval_batch.rapot_ujian_terpisah) berlaku untuk KEDUA track:
// nilai akhir murni skor ujian track itu, ketiadaan berkala bukan penahan.
{
  const pb = nilaiAkhirTrackOf('pb', [], 78, { ujianSaja: true });
  eq(pb.nilai, 78, 'ujianSaja pb: nilai = skor ujian PB');
  eq(pb.lulus, true, 'ujianSaja pb: 78 ≥ 70 → lulus');
  eq(pb.lengkap, true, 'ujianSaja pb: tanpa berkala pun lengkap');
  eq(pb.berkalaAvg, null, 'ujianSaja pb: berkalaAvg sengaja null');
  eq(pb.ujianSaja, true, 'ujianSaja pb: flag ikut dibawa ke hasil');

  const qn = nilaiAkhirTrackOf('qn', [], 78, { ujianSaja: true });
  eq(qn.nilai, 78, 'ujianSaja qn: nilai = skor ujian QN');
  eq(qn.lulus, true, 'ujianSaja qn: 78 ≥ 70 → lulus');
  eq(qn.lengkap, true, 'ujianSaja qn: tanpa berkala pun lengkap');
  eq(qn.berkalaAvg, null, 'ujianSaja qn: berkalaAvg sengaja null');
  eq(qn.ujianSaja, true, 'ujianSaja qn: flag ikut dibawa ke hasil');

  // Tanpa skor ujian, mode ujianSaja tetap tidak punya nilai apa pun.
  eq(nilaiAkhirTrackOf('qn', [], null, { ujianSaja: true }).nilai, null,
    'ujianSaja: tanpa skor ujian tetap null');
}

// Pembulatan nilai akhir: setengah selalu ke ATAS (Math.round).
eq(nilaiAkhirTrackOf('pb', [79], 78).nilai, 78, 'bulat: 0.3*79 + 0.7*78 = 78.3 → 78');
eq(nilaiAkhirTrackOf('qn', [75], 70).nilai, 72, 'bulat: 0.3*75 + 0.7*70 = 71.5 → 72');
eq(nilaiAkhirTrackOf('qn', [75], 70).lulus, true, 'bulat: 71.5 → 72 lulus (bukan 71)');
// berkalaAvg dibulatkan LEBIH DULU, baru dibobot.
eq(nilaiAkhirTrackOf('pb', [80, 81], 78).berkalaAvg, 81, 'bulat: rata 80.5 → 81');

// ── Isolasi track pada buildTrackRapotPayload (regresi rotasi 0062) ──
// Sebelum 0062 rata-rata berkala menggabung QN+PB. Fixture ini sengaja timpang:
// sesi QN penuh kesalahan JK Huruf, sesi PB nyaris bersih (JK Mad 1x). Kalau ada
// baris track lain yang bocor, angkanya langsung meleset.
{
  const cnt = (over: Record<string, number>): LahnCounts => ({ ...emptyCounts(), ...over });
  const sesi = (
    jenis: 'qn' | 'pb' | 'ujian',
    nomor_sesi: number,
    counts: LahnCounts,
    catatan = '',
  ): SesiNilaiInput => ({ jenis, nomor_sesi, counts, catatan, tgl: null, done: true });

  const fixture: SesiNilaiInput[] = [
    // QN kotor: skor 70, 76, 82, 88 → rata 79; akumulasi JK Huruf 5+4+3+2 = 14.
    sesi('qn', 1, cnt({ huruf: 5 }), 'qn s1 banyak lahn jaliy'),
    sesi('qn', 2, cnt({ huruf: 4 })),
    sesi('qn', 3, cnt({ huruf: 3 })),
    sesi('qn', 4, cnt({ huruf: 2 })),
    // PB bersih: skor 94 x4 → rata 94; akumulasi JK Mad 1+1+1+1 = 4.
    sesi('pb', 1, cnt({ mad: 1 })),
    sesi('pb', 2, cnt({ mad: 1 })),
    sesi('pb', 3, cnt({ mad: 1 })),
    sesi('pb', 4, cnt({ mad: 1 })),
    // Ujian QN = sesi 1 (skor 88), Ujian PB = sesi 2 (skor 98).
    sesi('ujian', 1, cnt({ huruf: 2 }), 'catatan penguji qn'),
    sesi('ujian', 2, cnt({ izhar: 1 }), 'catatan penguji pb'),
  ];

  const identitas: RapotIdentitas = {
    peserta: 'Ahmad Zaki', halaqah: 'Halaqah A', level: 'Mustawa 1',
    mustawa: 1, gender: 'ikhwan', batch: 'hits-regular-jan',
  };
  const args = { identitas, penerbit: 'Ust. Fulan', tanggal: '2026-08-29T00:00:00.000Z', sesi: fixture };

  const rapotPb = buildTrackRapotPayload({ track: 'pb', ...args }).trackRapot;
  eq(rapotPb.berkalaAvg, 94, 'isolasi pb: berkalaAvg 94 (murni sesi PB, bukan 86.5 gabungan)');
  eq(rapotPb.berkala.history, [94, 94, 94, 94], 'isolasi pb: history hanya sesi PB');
  eq(rapotPb.akumulasi, [{ key: 'mad', label: 'JK. Mad', group: 'jaliy', count: 4 }],
    'isolasi pb: akumulasi tanpa satu pun JK Huruf dari sesi QN');
  eq(rapotPb.ujianSkor, 98, 'isolasi pb: skor ujian dari sesi ujian nomor 2');
  eq(rapotPb.nilaiAkhir, 97, 'isolasi pb: 0.3*94 + 0.7*98 = 96.8 → 97');
  eq(rapotPb.catatanPenguji, 'catatan penguji pb', 'isolasi pb: catatan penguji dari Ujian PB');
  eq(rapotPb.berkala.catatan, [], 'isolasi pb: tak menyerap catatan sesi QN');
  eq(rapotPb.peran, 'penentu', 'isolasi pb: PB menentukan kelulusan level');

  const rapotQn = buildTrackRapotPayload({ track: 'qn', ...args }).trackRapot;
  eq(rapotQn.berkalaAvg, 79, 'isolasi qn: berkalaAvg 79 (murni sesi QN)');
  eq(rapotQn.berkala.history, [70, 76, 82, 88], 'isolasi qn: history hanya sesi QN');
  eq(rapotQn.akumulasi, [{ key: 'huruf', label: 'JK. Huruf', group: 'jaliy', count: 14 }],
    'isolasi qn: akumulasi tanpa satu pun JK Mad dari sesi PB');
  eq(rapotQn.ujianSkor, 88, 'isolasi qn: skor ujian dari sesi ujian nomor 1');
  eq(rapotQn.nilaiAkhir, 85, 'isolasi qn: 0.3*79 + 0.7*88 = 85.3 → 85');
  eq(rapotQn.catatanPenguji, 'catatan penguji qn', 'isolasi qn: catatan penguji dari Ujian QN');
  eq(rapotQn.berkala.catatan.map((x) => x.label), ['QN S1'], 'isolasi qn: catatan hanya dari sesi QN');
  eq(rapotQn.peran, 'prasyarat', 'isolasi qn: QN prasyarat, bukan penentu');

  // Rincian ujian juga tidak boleh tertukar antar track.
  eq(rapotPb.rincianUjian.map((r) => r.key), ['izhar'], 'isolasi pb: rincian dari Ujian PB saja');
  eq(rapotQn.rincianUjian.map((r) => r.key), ['huruf'], 'isolasi qn: rincian dari Ujian QN saja');

  // Payload track: diskriminan + ambang nilai akhir fix 70 untuk kedua track.
  const payloadPb = buildTrackRapotPayload({ track: 'pb', ...args });
  eq(payloadPb.v, 1, 'payload track: penanda versi 1');
  eq(payloadPb.jenis_rapot, 'pb', 'payload track: jenis_rapot = track');
  eq(payloadPb.ambang, 70, 'payload track: ambang nilai akhir fix 70');

  // ujianSaja lewat builder: komponen berkala dibuang untuk KEDUA track.
  const saja = buildTrackRapotPayload({ track: 'qn', ...args, ujianSaja: true }).trackRapot;
  eq(saja.nilaiAkhir, 88, 'ujianSaja builder qn: nilai murni skor Ujian QN');
  eq(saja.berkalaAvg, null, 'ujianSaja builder qn: berkalaAvg null');
  eq(saja.akumulasi, [], 'ujianSaja builder qn: akumulasi berkala dikosongkan');
}

// ── Kunci aritmetika rapot ERA LAMA (nilaiAkhirOf, @deprecated) ──
// Dokumen ber-QR yang sudah beredar harus tetap terverifikasi apa adanya:
// kolam rata-ratanya QN+PB DIGABUNG dan ujiannya hanya Ujian PB.
{
  eq(nilaiAkhirOf([80, 80, 80, 80], 60),
    { nilai: 66, berkalaAvg: 80, ujianPbSkor: 60, lengkap: true, lulus: false },
    'legacy nilaiAkhirOf: 0.3*80 + 0.7*60 = 66, tidak lulus');
  // Kolam gabungan: fixture isolasi di atas (rata QN 79, rata PB 94) kalau dirata
  // sebagai satu kolam jadi 86.5 → 87 — persis angka yang dihapus rotasi 0062.
  eq(nilaiAkhirOf([70, 76, 82, 88, 94, 94, 94, 94], 98).berkalaAvg, 87,
    'legacy nilaiAkhirOf: rata QN+PB digabung (perilaku pra-0062 dipertahankan)');
  eq(nilaiAkhirOf([], 90),
    { nilai: null, berkalaAvg: null, ujianPbSkor: 90, lengkap: false, lulus: null },
    'legacy nilaiAkhirOf: berkala kosong → null, bukan 63');
  eq(nilaiAkhirOf([70, 70, 70, 70], null),
    { nilai: null, berkalaAvg: 70, ujianPbSkor: null, lengkap: false, lulus: null },
    'legacy nilaiAkhirOf: tanpa Ujian PB → null');
  eq(nilaiAkhirOf([79], 78).nilai, 78, 'legacy nilaiAkhirOf: 78.3 → 78');
  eq(nilaiAkhirOf([75], 70).nilai, 72, 'legacy nilaiAkhirOf: 71.5 → 72');
  eq(nilaiAkhirOf([70], 70).lulus, true, 'legacy nilaiAkhirOf: tepat 70 → lulus');
  eq(nilaiAkhirOf([69], 69).lulus, false, 'legacy nilaiAkhirOf: 69 → tidak lulus');
}

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll evaluasi tests passed.');
