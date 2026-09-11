// Uji fungsi murni Evaluasi Halaqah: taksonomi Lahn, skor, tier, ambang.
// Jalankan: npm run test-evaluasi
import {
  JALIY, KHAFIY, ALL_LAHN, LAHN_BY_KEY, emptyCounts,
  scoreOf, tierOf, AMBANG, columnFor,
  buildTrackGeometry, nilaiAkhirOf, nilaiAkhirTrackOf, lantaiNilai, lantaiNilaiOpt, jenisRapotDariSesi,
  namaProgram, peranTrack, vonisTrack,
  type LahnCounts,
} from '@/lib/evaluasi';
import {
  alasanBelumTerbit,
  buildTrackRapotPayload,
  type RapotIdentitas,
  type SesiNilaiInput,
} from '@/lib/rapot';
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
eq(tierOf(69).label, 'Di bawah standar', 'tier di bawah standar');
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

  // ── Syarat terbit (dipakai bersama layar pengajar & guard server) ──
  // Fixture di atas lengkap, jadi dua-duanya boleh terbit.
  eq(alasanBelumTerbit(rapotQn), [], 'syarat terbit: QN lengkap → boleh');
  eq(alasanBelumTerbit(rapotPb), [], 'syarat terbit: PB lengkap → boleh');

  // Tanpa sesi ujian track itu, rapotnya tak punya komponen 70% sama sekali.
  const tanpaUjianPb = buildTrackRapotPayload({
    track: 'pb',
    ...args,
    sesi: fixture.filter((s) => !(s.jenis === 'ujian' && s.nomor_sesi === 2)),
  }).trackRapot;
  eq(alasanBelumTerbit(tanpaUjianPb), ['Belum ada Ujian PB'], 'syarat terbit: tanpa Ujian PB');

  // Berkala kurang dari 4 → ditolak; angkanya disebut supaya pengajar tahu
  // berapa lagi yang kurang.
  const berkalaKurang = buildTrackRapotPayload({
    track: 'pb',
    ...args,
    sesi: fixture.filter((s) => !(s.jenis === 'pb' && s.nomor_sesi >= 3)),
  }).trackRapot;
  eq(alasanBelumTerbit(berkalaKurang), ['Sesi PB baru 2 dari 4'], 'syarat terbit: berkala kurang');

  // Batch ujianSaja tak menjalankan sesi berkala sama sekali — kelengkapannya
  // tak boleh jadi syarat di sana.
  const ujianSajaPb = buildTrackRapotPayload({
    track: 'pb',
    ...args,
    sesi: fixture.filter((s) => s.jenis === 'ujian'),
    ujianSaja: true,
  }).trackRapot;
  eq(alasanBelumTerbit(ujianSajaPb), [], 'syarat terbit: ujianSaja tak menuntut sesi berkala');

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

// ── Lantai nilai 55 (kebijakan Majelis, Sept 2026) ──
// Lantai memagari ANGKA yang dicetak, bukan ambang kelulusan: 55 tetap MENGULANG.
// Jumlah kesalahan di tabel rincian tak pernah ikut dilantai.
{
  eq(lantaiNilai(0), 55, 'lantai: skor 0 → 55');
  eq(lantaiNilai(54), 55, 'lantai: 54 → 55');
  eq(lantaiNilai(55), 55, 'lantai: 55 tetap 55');
  eq(lantaiNilai(88), 88, 'lantai: nilai di atas lantai tak diutak-atik');
  eq(lantaiNilaiOpt(null), null, 'lantai: null tetap null, bukan 55');

  // scoreOf TIDAK dilantai — rapot butuh skor mentah untuk aritmetika & audit.
  eq(scoreOf({ ...emptyCounts(), huruf: 17 }).skor, 0, 'lantai: scoreOf tetap mentah (0)');

  const bawah = nilaiAkhirTrackOf('pb', [], 20, { ujianSaja: true });
  eq(bawah.ujianSkor, 55, 'lantai ujianSaja: skor ujian 20 → 55');
  eq(bawah.nilai, 55, 'lantai ujianSaja: nilai akhir 55');
  eq(bawah.lulus, false, 'lantai ujianSaja: 55 di bawah ambang 70 → MENGULANG');

  // Mode 30/70: lantai dipasang di skor ujian dulu, lalu sekali lagi di hasil.
  eq(nilaiAkhirTrackOf('pb', [60, 60, 60, 60], 30).ujianSkor, 55, 'lantai 30/70: skor ujian 30 → 55');
  eq(nilaiAkhirTrackOf('pb', [60, 60, 60, 60], 30).nilai, 57, 'lantai 30/70: 0.3*60 + 0.7*55 = 56.5 → 57');
  eq(nilaiAkhirTrackOf('pb', [0, 0, 0, 0], 0).nilai, 55, 'lantai 30/70: hasil 38.5 tetap tak turun di bawah 55');
  eq(nilaiAkhirTrackOf('pb', [], null, { ujianSaja: true }).nilai, null,
    'lantai: tanpa ujian tetap null, jangan jadi 55');

  // Lewat builder rapot: snap ujian yang dicetak ikut terlantai.
  const idn: RapotIdentitas = { peserta: 'Uji Lantai', halaqah: 'H1', level: null, mustawa: null, gender: 'ikhwan', batch: null };
  const sesiLantai: SesiNilaiInput[] = [
    { jenis: 'ujian', nomor_sesi: 2, counts: { ...emptyCounts(), huruf: 10 }, catatan: '', tgl: '2026-01-20', done: true, hadir: true },
  ];
  const rapotLantai = buildTrackRapotPayload({
    track: 'pb', identitas: idn, penerbit: 'Penguji', tanggal: '2026-01-21T00:00:00.000Z',
    sesi: sesiLantai, ujianSaja: true,
  }).trackRapot;
  eq(rapotLantai.ujian?.skor, 55, 'lantai builder: skor Ujian PB 40 → 55');
  eq(rapotLantai.nilaiAkhir, 55, 'lantai builder: nilai akhir 55');
  eq(rapotLantai.lulus, false, 'lantai builder: tetap MENGULANG');
  eq(rapotLantai.rincianUjian.map((r) => r.count), [10], 'lantai builder: jumlah kesalahan tetap apa adanya');
}

// ── Penjaga buka-kunci: jenis rapot yang bersumber dari sebuah sesi ──
// Salah petakan = sesi bisa dibuka padahal rapot ber-QR-nya masih beredar.
{
  eq(jenisRapotDariSesi('qn', 3), ['qn', 'berkala', 'ujian'], 'buka-kunci: sesi berkala QN');
  eq(jenisRapotDariSesi('pb', 1), ['pb', 'berkala', 'ujian'], 'buka-kunci: sesi berkala PB');
  eq(jenisRapotDariSesi('ujian', 1), ['qn', 'ujian', 'ujian_qn'], 'buka-kunci: Ujian QN = sesi 1');
  eq(jenisRapotDariSesi('ujian', 2), ['pb', 'ujian', 'ujian_pb'], 'buka-kunci: Ujian PB = sesi 2');
  eq(jenisRapotDariSesi('ujian', 3), ['ujian'], 'buka-kunci: nomor ujian di luar 1/2 → rapot era lama saja');
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

// ── nama program untuk dropdown penyaring ──
eq(namaProgram('HITS Reguler (Batch April 2026)'), 'HITS Reguler', 'buang suffix batch');
eq(namaProgram('HITS Reguler (Batch Juni 2026)'), 'HITS Reguler', 'suffix batch bulan lain');
// Kurung yang bukan angkatan harus lolos utuh — kalau tidak, dua program berbeda
// bisa bertabrakan jadi satu label.
eq(namaProgram('Tahsin Al-Fatihah Mustahik (LAZ)'), 'Tahsin Al-Fatihah Mustahik (LAZ)', 'kurung non-batch dibiarkan');
eq(namaProgram('HKM — Presensi (Halaqah Keluarga Muhajir)'), 'HKM — Presensi (Halaqah Keluarga Muhajir)', 'kurung penjelas dibiarkan');
eq(namaProgram('DPQ'), 'DPQ', 'nama tanpa kurung');
eq(namaProgram('  HITS Safar  '), 'HITS Safar', 'spasi tepi dirapikan');
// Suffix hanya dibuang di ujung, bukan di tengah.
eq(namaProgram('Kelas (Batch A) Lanjutan'), 'Kelas (Batch A) Lanjutan', 'suffix di tengah dibiarkan');
// Nama berapostrof harus lewat utuh (regex tak menyentuhnya).
eq(namaProgram("HKM (Halaqah Al-Qur'an)"), "HKM (Halaqah Al-Qur'an)", 'nama berapostrof dibiarkan');
// Dua anggota family hits-safar: yang polos dan yang bersuffix harus menghasilkan
// label yang SAMA, karena sumber memang menaruh keduanya di family 'hits-safar'.
// Kalau ini pecah, dropdown menampilkan HITS Safar dua kali.
eq(
  namaProgram('HITS Safar (Batch Januari 2026)'),
  namaProgram('HITS Safar'),
  'dua angkatan HITS Safar → satu label'
);

// Vonis pita status rapot per track. Kelulusan level ditentukan Rapot PB;
// Rapot QN prasyarat yang nilainya tidak menggugurkan — peserta ber-QN < 70
// tetap lanjut ke Kelas PB. Pernah salah: Rapot QN mencetak "MENGULANG" dan
// dibaca peserta sebagai tidak naik level.
eq(vonisTrack('penentu', true), { nada: 'lulus', teks: 'LULUS' }, 'vonis PB lulus');
eq(vonisTrack('penentu', false), { nada: 'mengulang', teks: 'MENGULANG' }, 'vonis PB gagal = MENGULANG');
eq(vonisTrack('prasyarat', true), { nada: 'lulus', teks: 'LULUS' }, 'vonis QN lulus');
eq(vonisTrack('prasyarat', false), { nada: 'bawah_standar', teks: 'DI BAWAH STANDAR' }, 'vonis QN gagal = DI BAWAH STANDAR, bukan MENGULANG');
eq(vonisTrack('prasyarat', null), { nada: 'kosong', teks: 'BELUM LENGKAP' }, 'vonis tanpa nilai → teks kosong bawaan');
eq(vonisTrack('penentu', null, 'Belum ada nilai').teks, 'Belum ada nilai', 'vonis tanpa nilai → teks kosong pemanggil');
eq(vonisTrack(peranTrack('qn'), false).nada, 'bawah_standar', 'peranTrack(qn) → prasyarat → bawah standar');
eq(vonisTrack(peranTrack('pb'), false).nada, 'mengulang', 'peranTrack(pb) → penentu → mengulang');

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll evaluasi tests passed.');
