// Uji fungsi murni Ketersediaan Mengajar HITS. Jalankan: npm run test-ketersediaan
//
// Yang diuji: penguraian teks slot yang ejaannya bercampur, deteksi bentrok,
// pengelompokan pendaftar (level + pita umur + antrean tua), dan kaidah
// pemerataan pada alokasi berputar.
import {
  bentrok,
  lokasiBaku,
  rentangDariSlot,
  sesiDariSlot,
  hariKeIdx,
  hariKeIdxSet,
  hitungUmur,
  jamKeMenit,
  masihBerjalanPada,
  pitaUmur,
  rentangDariHalaqah,
  susunLabel,
  uraikanSlot,
} from '@/lib/ketersediaan-slot';
import {
  alokasikan,
  kelompokkanPendaftar,
  type MasukanAlokasi,
  type PendaftarAlokasi,
  type SlotAlokasi,
} from '@/lib/ketersediaan-alokasi';
import { usulkanHari, usulkanSesi, hariTidakKonsisten } from '@/lib/tilawah/map';
import {
  bacaTanggal,
  deteksiFormatTanggal,
  identitasPendaftar,
  jamBaruDariFormulir,
  lebihBaru,
  saring,
  type BarisMentah,
  normalWa,
} from '@/lib/ketersediaan-pendaftar';
import {
  jumlahPertemuanUntuk,
  namaPertemuan,
  rentangPertemuan,
  tanggalPertemuan,
  jamPadaTanggal,
  teksLibur,
  uraiLibur,
} from '@/lib/ketersediaan-pertemuan';
import {
  jumlahkan,
  susunArus,
  susunBarisJam,
  susunPeta,
  tanggalBatasAntrean,
  tingkatPeta,
} from '@/lib/ketersediaan-dasbor';
import type { RingkasSlot } from '@/lib/ketersediaan-permintaan';
import type { KsHariIdx, KsSlot } from '@/types/db';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${e}`);
    failed++;
  } else console.log(`ok   ${label}`);
}

// ── Penguraian slot ────────────────────────────────────────────────────────
console.log('\n# penguraian teks slot');

eq(hariKeIdx('Senin'), 0, 'Senin = 0');
eq(hariKeIdx("Jum'at"), 4, "Jum'at (apostrof) = 4");
eq(hariKeIdx('Jumat'), 4, 'Jumat (tanpa apostrof) = 4');
eq(hariKeIdx('JUMAT'), 4, 'JUMAT (huruf besar) = 4');
eq(hariKeIdx('Ahad'), 6, 'Ahad = 6');
eq(hariKeIdx('Minggu'), 6, 'Minggu = 6 (alias Ahad)');
eq(hariKeIdx('Sabtuu'), null, 'ejaan tak dikenal = null');

eq(jamKeMenit('06:00'), 360, 'jam titik dua');
eq(jamKeMenit('06.00'), 360, 'jam titik');
eq(jamKeMenit('6.00'), 360, 'jam satu digit');
eq(jamKeMenit('25:00'), null, 'jam mustahil ditolak');

// Kasus nyata dari berkas Jadwal KBM Juni 2026 dan hits_halaqah.jadwal_raw.
eq(uraikanSlot('Senin & Rabu 06:00 - 07:30 WIB')?.hari_idx, [0, 2], 'Senin & Rabu');
eq(
  uraikanSlot("Selasa & Jum'at 16.00 - 17.30 WIB")?.hari_idx,
  [1, 4],
  "Selasa & Jum'at dengan titik"
);
eq(
  uraikanSlot('Online Selasa & Kamis 10.00 -11.30 WIB')?.hari_idx,
  [1, 3],
  'awalan Online + spasi pincang'
);
eq(uraikanSlot('Offline Senin & Rabu 20:10 - 21:40 WIB')?.mode, 'offline', 'awalan Offline terbaca');
eq(uraikanSlot('Sabtu, Ahad 13:00-14:30')?.hari_idx, [5, 6], 'pemisah koma tanpa spasi');
eq(uraikanSlot('Selasa & Jumat')?.hari_idx, undefined, 'tanpa jam = tak terurai');

// Dua ejaan berbeda harus menghasilkan label yang identik.
eq(
  uraikanSlot("Selasa & Jum'at 16.00 - 17.30 WIB")?.label,
  uraikanSlot('Selasa & Jumat 16:00 - 17:30 WIB')?.label,
  'ejaan berbeda → label sama'
);
eq(susunLabel([0, 2], '06:00', '07:30'), 'Senin & Rabu 06:00 - 07:30 WIB', 'susunLabel baku');
eq(hariKeIdxSet(['Selasa', "Jum'at", 'Selasa']), [1, 4], 'hariKeIdxSet unik & terurut');

// Nilai sungguhan dari pilihan Google Form pendaftaran murid.
console.log('\n# pilihan slot dari form pendaftaran');
eq(
  uraikanSlot('Offline di Pejaten Senin & Rabu 16:30 - 18:00 WIB')?.hari_idx,
  [0, 2],
  'lokasi sebelum nama hari tidak menelan harinya'
);
eq(
  uraikanSlot('Offline di Pejaten Senin & Rabu 16:30 - 18:00 WIB')?.lokasi,
  'Pejaten',
  'lokasi terambil, awalan "di" dibuang'
);
eq(
  uraikanSlot('Offline di Masjid Al Kautsar Matraman Jakarta Timur Selasa & Kamis 16.00 - 17.30 WIB')?.hari_idx,
  [1, 3],
  'lokasi panjang berisi banyak kata tetap tidak merusak pembacaan hari'
);
eq(
  uraikanSlot("Offline Al Kautsar Selasa & Jum'at 07.30 - 09.00 WIB")?.lokasi,
  'Al Kautsar',
  'lokasi tanpa kata "di"'
);
{
  const dua = uraikanSlot('Offline Masjid Al-Kautsar Matraman Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30');
  eq(dua?.label, 'Rabu 16:00 - 17:30 & Sabtu 13:00 - 14:30 WIB', 'kelas dua waktu: label baku');
  eq(dua?.lokasi, 'Masjid Al-Kautsar Matraman', 'kelas dua waktu: lokasi');
  eq(dua?.duaWaktu, true, 'kelas dua waktu ditandai');
  eq(uraikanSlot(dua!.label)?.sesi, dua?.sesi, 'label baku terurai ulang ke jam yang sama');
  eq(
    uraikanSlot('Offline Al Kautsar Senin 07.30 - 09.00 WIB & Selasa 13.00 - 14.30 WIB')?.sesi,
    [{ hari_idx: 0, mulai: '07:30', selesai: '09:00' }, { hari_idx: 1, mulai: '13:00', selesai: '14:30' }],
    'jam per hari'
  );
  eq(uraikanSlot('Senin 06.00 - 07.30 / 16.00 - 17.30'), null, 'rentang tanpa hari sendiri ditolak');
  eq(uraikanSlot('Senin 06.00 - 07.30 dan Senin 16.00 - 17.30'), null, 'hari sama dua jam ditolak');
  eq(uraikanSlot('Senin 06.00 - 07.30 dan Rabu 06.00 - 07.30')?.label, 'Senin & Rabu 06:00 - 07:30 WIB', 'jam sama dilebur jadi kelas biasa');
  const slotDua = { label: dua!.label, hari_idx: dua!.hari_idx, waktu_mulai: '16:00:00', waktu_selesai: '17:30:00' };
  eq(rentangDariSlot(slotDua).length, 2, 'slot dua waktu → dua rentang bentrok');
  eq(
    rentangDariSlot(slotDua).some((x) => bentrok(x, { hari_idx: [5], mulai: 13 * 60 + 30, selesai: 15 * 60 })),
    true,
    'Sabtu 13:30 bentrok dengan sesi Sabtu 13:00'
  );
  eq(
    rentangDariSlot(slotDua).some((x) => bentrok(x, { hari_idx: [5], mulai: 16 * 60, selesai: 17 * 60 + 30 })),
    false,
    'Sabtu 16:00 tidak bentrok (jam 16:00 hanya hari Rabu)'
  );
  eq(jamPadaTanggal('2026-10-03', sesiDariSlot(slotDua)), { mulai: '13:00', selesai: '14:30' }, 'pertemuan Sabtu memakai jam Sabtu');
  eq(jamPadaTanggal('2026-09-30', sesiDariSlot(slotDua)), { mulai: '16:00', selesai: '17:30' }, 'pertemuan Rabu memakai jam Rabu');
  eq(
    rentangDariHalaqah({ jadwal_hari: ['Rabu', 'Sabtu'], waktu_mulai: '16:00', waktu_selesai: '17:30', jadwal_raw: 'Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30' }).length,
    2,
    'halaqah lama dua waktu dibaca dari jadwal_raw'
  );
}
eq(
  uraikanSlot('Online Selasa & Kamis 10.00 -11.30 WIB')?.waktu_selesai,
  '11:30',
  'spasi pincang sebelum jam selesai tetap terbaca'
);
eq(uraikanSlot('Online Sabtu & Ahad 06:00 - 07:30 WIB')?.lokasi, null, 'slot online tanpa lokasi');

// ── Bentrok ────────────────────────────────────────────────────────────────
console.log('\n# deteksi bentrok');

const r = (h: KsHariIdx[], m: number, s: number) => ({ hari_idx: h, mulai: m, selesai: s });
eq(bentrok(r([0, 2], 360, 450), r([0, 2], 360, 450)), true, 'sama persis = bentrok');
eq(bentrok(r([0, 2], 360, 450), r([1, 3], 360, 450)), false, 'hari beda = aman');
eq(bentrok(r([0, 2], 360, 450), r([2, 4], 400, 500)), true, 'satu hari beririsan + jam tumpang');
eq(bentrok(r([0, 2], 360, 450), r([0, 2], 450, 540)), false, 'sentuhan ujung bukan bentrok');
eq(bentrok(r([0, 2], 360, 450), r([0, 2], 449, 540)), true, 'lewat semenit = bentrok');

eq(
  rentangDariHalaqah({
    jadwal_hari: ['Selasa', "Jum'at"],
    waktu_mulai: '06:00:00',
    waktu_selesai: '07:30:00',
    jadwal_raw: null,
  }),
  [{ hari_idx: [1, 4], mulai: 360, selesai: 450 }],
  'halaqah dari kolom terurai'
);
eq(
  rentangDariHalaqah({
    jadwal_hari: null,
    waktu_mulai: null,
    waktu_selesai: null,
    jadwal_raw: 'Online Sabtu & Ahad 13:00 - 14:30 WIB',
  }),
  [{ hari_idx: [5, 6], mulai: 780, selesai: 870 }],
  'halaqah jatuh ke jadwal_raw'
);
eq(
  rentangDariHalaqah({
    jadwal_hari: ['Selasa', "Jum'at"],
    waktu_mulai: null,
    waktu_selesai: null,
    jadwal_raw: "Selasa & Jum'at",
  }),
  [],
  'halaqah tanpa jam tidak mengunci apa pun'
);

// ── Format tanggal per kolom ───────────────────────────────────────────────
console.log('\n# format tanggal ditentukan dari seluruh kolom');
eq(deteksiFormatTanggal(['12/23/1999', '5/26/2003', '10/6/1989']), 'mdy', 'bagian kedua >12 → M/D/YYYY');
eq(deteksiFormatTanggal(['23/12/1999', '26/5/2003']), 'dmy', 'bagian pertama >12 → D/M/YYYY');
eq(deteksiFormatTanggal(['5/6/2003', '1/2/2000']), 'dmy', 'ambigu → jatuh ke kebiasaan setempat');
eq(deteksiFormatTanggal([]), 'dmy', 'kolom kosong → D/M/YYYY');
eq(bacaTanggal('12/23/1999', 'mdy'), '1999-12-23', 'tanggal M/D/YYYY terbaca benar');
eq(bacaTanggal('23/12/1999', 'dmy'), '1999-12-23', 'tanggal D/M/YYYY terbaca benar');
eq(bacaTanggal('12/23/1999', 'dmy'), null, 'format salah ditolak, bukan dibaca terbalik');
eq(bacaTanggal('1999-12-23'), '1999-12-23', 'ISO tetap terbaca apa pun formatnya');

// ── Umur & pita ────────────────────────────────────────────────────────────
console.log('\n# umur & pita');
const acuan = new Date('2026-08-30T00:00:00Z');
eq(hitungUmur('2000-08-30', acuan), 26, 'ulang tahun tepat hari ini');
eq(hitungUmur('2000-08-31', acuan), 25, 'ulang tahun besok belum dihitung');
eq(pitaUmur(15), '<=45', 'pita 15 ikut kelompok pertama');
eq(pitaUmur(45), '<=45', 'pita 45 masih kelompok pertama');
eq(pitaUmur(46), '46+', 'pita 46');

// ── Pengelompokan pendaftar ────────────────────────────────────────────────
console.log('\n# pengelompokan pendaftar');

const periode = { kapasitas_halaqah: 12, ambang_bawah: 8, usia_antrean_maks_hari: 21 };
const hariLalu = (n: number) => new Date(acuan.getTime() - n * 86400000).toISOString();

function buatPendaftar(
  n: number,
  level: string,
  pita: PendaftarAlokasi['pita_umur'],
  umurAntreanHari: number,
  awalan: string
): PendaftarAlokasi[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${awalan}-${i}`,
    slot_id: 'S1',
    level,
    pita_umur: pita,
    didaftar_pada: hariLalu(umurAntreanHari),
  }));
}

const g1 = kelompokkanPendaftar(
  'S1',
  buatPendaftar(25, 'HITS Dasar', '<=45', 3, 'a'),
  periode,
  acuan
);
eq(g1.length, 2, '25 pendaftar satu pita → 2 halaqah penuh');
eq(g1.every((g) => g.pendaftar_ids.length === 12), true, 'tiap halaqah tepat 12');
eq(g1.every((g) => !g.pita_digabung), true, 'tidak ada penggabungan pita');

const campur = [
  ...buatPendaftar(12, 'HITS Dasar', '<=45', 3, 'b'),
  ...buatPendaftar(12, 'HITS Lanjutan', '<=45', 3, 'c'),
];
const g2 = kelompokkanPendaftar('S1', campur, periode, acuan);
eq(g2.length, 2, 'dua level → dua halaqah terpisah');
eq(new Set(g2.map((g) => g.level)).size, 2, 'level tidak tercampur dalam satu halaqah');

// Sisa muda menunggu; sisa tua boleh dibentuk di atas ambang bawah.
const sisaMuda = [
  ...buatPendaftar(5, 'HITS Dasar', '<=45', 2, 'd'),
  ...buatPendaftar(5, 'HITS Dasar', '46+', 2, 'e'),
];
eq(kelompokkanPendaftar('S1', sisaMuda, periode, acuan).length, 0, 'sisa muda menunggu');

const sisaTua = [
  ...buatPendaftar(5, 'HITS Dasar', '<=45', 40, 'f'),
  ...buatPendaftar(5, 'HITS Dasar', '46+', 40, 'g'),
];
const g3 = kelompokkanPendaftar('S1', sisaTua, periode, acuan);
eq(g3.length, 1, 'sisa tua digabung jadi satu halaqah');
eq(g3[0].pita_digabung, true, 'ditandai sebagai pita digabung');
eq(g3[0].pendaftar_ids.length, 10, 'isi 10, di atas ambang bawah 8');

const sisaTuaKecil = buatPendaftar(7, 'HITS Dasar', '<=45', 40, 'h');
eq(
  kelompokkanPendaftar('S1', sisaTuaKecil, periode, acuan).length,
  0,
  'tua tapi di bawah ambang bawah tetap menunggu'
);

// Antrean tertua harus terlayani lebih dulu.
const urutUsia = [
  ...buatPendaftar(12, 'HITS Dasar', '<=45', 2, 'i'),
  ...buatPendaftar(12, 'HITS Dasar', '46+', 30, 'j'),
];
const g4 = kelompokkanPendaftar('S1', urutUsia, periode, acuan);
eq(g4[0].pita_umur, '46+', 'kelompok dengan antrean tertua di urutan pertama');

// ── Alokasi berputar ───────────────────────────────────────────────────────
console.log('\n# alokasi berputar');

function slotAlokasi(id: string, hari: KsHariIdx[], mulai: string, selesai: string, jumlahGrup: number): SlotAlokasi {
  return {
    slot: { id, label: susunLabel(hari, mulai, selesai), hari_idx: hari, waktu_mulai: mulai, waktu_selesai: selesai },
    grup: Array.from({ length: jumlahGrup }, (_, i) => ({
      slot_id: id,
      level: 'HITS Dasar',
      pita_umur: '<=45' as const,
      pita_digabung: false,
      pendaftar_ids: [`${id}-p${i}`],
      usia_tertua_hari: 5,
    })),
    antre: jumlahGrup * 12,
    usia_tertua_hari: 5,
  };
}

// Dua slot berbeda jam, masing-masing butuh 2 halaqah. Tiga pengajar bersedia di
// keduanya. Kaidah pemerataan: semua dapat 1 dulu sebelum ada yang dapat 2.
const masukan: MasukanAlokasi = {
  slots: [
    slotAlokasi('S1', [0, 2], '06:00', '07:30', 2),
    slotAlokasi('S2', [0, 2], '20:00', '21:30', 2),
  ],
  tersedia: new Map([
    ['S1', ['p1', 'p2', 'p3']],
    ['S2', ['p1', 'p2', 'p3']],
  ]),
  sudahDiSlot: new Map(),
  jadwalPengajar: new Map(),
  peringkat: (id) => Number(id.slice(1)),
};
const hasil = alokasikan(masukan);
eq(hasil.penempatan.length, 4, 'empat halaqah terisi');
const putaran1 = hasil.penempatan.filter((p) => p.putaran === 1).map((p) => p.pengajar_id);
eq(new Set(putaran1).size, putaran1.length, 'putaran 1: tak ada pengajar dobel');
eq(putaran1.length, 3, 'putaran 1 memberi 1 halaqah ke tiga pengajar berbeda');
eq(
  hasil.penempatan.filter((p) => p.putaran === 2).length,
  1,
  'sisa satu halaqah baru dibagikan di putaran 2'
);
// p1 peringkat terbaik: dia yang dapat halaqah kedua.
eq(hasil.penempatan.find((p) => p.putaran === 2)?.pengajar_id, 'p1', 'putaran 2 ikut peringkat');

// Slot berjam sama: satu pengajar tidak boleh memegang keduanya.
const sameTime: MasukanAlokasi = {
  slots: [
    slotAlokasi('A', [0, 2], '06:00', '07:30', 1),
    slotAlokasi('B', [0, 2], '06:00', '07:30', 1),
  ],
  tersedia: new Map([
    ['A', ['solo']],
    ['B', ['solo']],
  ]),
  sudahDiSlot: new Map(),
  jadwalPengajar: new Map(),
  peringkat: () => 1,
};
const h2 = alokasikan(sameTime);
eq(h2.penempatan.length, 1, 'jam bentrok: hanya satu yang terisi');
eq(h2.tanpaPengajar.length, 1, 'sisanya tercatat butuh pengajar');

// Jadwal yang sudah dipegang sebelumnya juga mengunci.
const sudahPunya: MasukanAlokasi = {
  slots: [slotAlokasi('C', [0, 2], '06:00', '07:30', 1)],
  tersedia: new Map([['C', ['x']]]),
  sudahDiSlot: new Map(),
  jadwalPengajar: new Map([['x', [{ hari_idx: [0], mulai: 360, selesai: 450 }]]]),
  peringkat: () => 1,
};
eq(alokasikan(sudahPunya).penempatan.length, 0, 'jadwal lama mengunci penempatan baru');

// Pengajar yang sudah memegang halaqah di slot itu tidak dijatah lagi di sana.
const sudahDiSana: MasukanAlokasi = {
  slots: [slotAlokasi('D', [1, 3], '06:00', '07:30', 1)],
  tersedia: new Map([['D', ['y']]]),
  sudahDiSlot: new Map([['D', new Set(['y'])]]),
  jadwalPengajar: new Map(),
  peringkat: () => 1,
};
eq(alokasikan(sudahDiSana).penempatan.length, 0, 'tidak dua halaqah di slot yang sama');

// ── Pemetaan CMS tilawah ───────────────────────────────────────────────────
console.log('\n# usulan pemetaan tilawah');

const days = [
  { id: 1, name: 'Senin, Rabu', int_days: [0, 2], status: 1 },
  { id: 2, name: 'Selasa, Kamis', int_days: [1, 3], status: 1 },
  { id: 3, name: "Selasa, Jum'at", int_days: [1], status: 1 }, // pincang — jebakan nyata di staging
  { id: 12, name: 'Selasa & Jumat', int_days: [1, 4], status: 1 },
];
eq(hariTidakKonsisten(days[2]), true, 'baris int_days pincang terdeteksi');
eq(hariTidakKonsisten(days[0]), false, 'baris sehat tidak ditandai');

const uSenin = usulkanHari({ hari_idx: [0, 2], label: 'Senin & Rabu 06:00 - 07:30 WIB' }, days);
eq(uSenin.day_id, 1, 'Senin & Rabu → day_id 1');
eq(uSenin.keyakinan, 'pasti', 'cocok int_days = pasti');

const uJumat = usulkanHari({ hari_idx: [1, 4], label: "Selasa & Jum'at 06:00 - 07:30 WIB" }, days);
eq(uJumat.day_id, 12, "Selasa & Jum'at → day_id 12, bukan baris pincang id 3");

const uTidakAda = usulkanHari({ hari_idx: [5, 6], label: 'Sabtu & Ahad 06:00 - 07:30 WIB' }, days);
eq(uTidakAda.keyakinan, 'tidak_ada', 'tidak ada padanan → tidak_ada, bukan tebakan');

const sessions = [
  { id: 2, name: '06:00 - 07:30', start_hour: '06:00:00', end_hour: '07:30:00', status: 1 },
  { id: 14, name: '00:00 - 00:00', start_hour: '00:00:00', end_hour: '00:00:00', status: 1 },
];
eq(
  usulkanSesi({ waktu_mulai: '06:00:00', waktu_selesai: '07:30:00', label: 'x' }, sessions).session_id,
  2,
  'jam sama persis → session_id 2'
);
eq(
  usulkanSesi({ waktu_mulai: '08:00:00', waktu_selesai: '09:30:00', label: 'x' }, sessions).keyakinan,
  'tidak_ada',
  'tidak mencari sesi "terdekat" — placeholder 00:00 tidak boleh terpilih'
);

// ── Penanggalan pertemuan ──────────────────────────────────────────────────
console.log('\n# penanggalan pertemuan');

// Pola nyata halaqah #947 produksi: slot Senin & Rabu, mulai 27 Juli 2026.
const p947 = tanggalPertemuan('2026-07-27', [0, 2], 22);
eq(p947.length, 22, '22 pertemuan terbentuk');
eq(p947[0], '2026-07-27', 'pertemuan 1 pada tanggal mulai (Senin)');
eq(p947[1], '2026-07-29', 'pertemuan 2 Rabu berikutnya');
eq(p947[2], '2026-08-03', 'pertemuan 3 Senin pekan berikutnya');
eq(p947[21], '2026-10-07', 'pertemuan 22 sama dengan data produksi');
// Tak ada tanggal yang jatuh di luar hari slot.
eq(
  p947.every((t) => {
    const d = new Date(`${t}T00:00:00Z`);
    return [0, 2].includes((d.getUTCDay() + 6) % 7);
  }),
  true,
  'seluruh tanggal jatuh pada hari slot'
);

// Tanggal mulai yang bukan hari slot: pertemuan pertama bergeser ke hari terdekat.
eq(tanggalPertemuan('2026-07-28', [0, 2], 1)[0], '2026-07-29', 'mulai di luar hari slot → geser ke hari slot');
eq(tanggalPertemuan('2026-07-27', [0, 2], 0).length, 0, 'jumlah 0 → tak ada pertemuan');
eq(tanggalPertemuan('2026-07-27', [], 5).length, 0, 'tanpa hari slot → tak ada pertemuan');
eq(tanggalPertemuan('bukan-tanggal', [0], 3).length, 0, 'tanggal tak terbaca → tak ada pertemuan');
eq(tanggalPertemuan('2026-07-27', [4], 3), ['2026-07-31', '2026-08-07', '2026-08-14'], 'slot sekali sepekan');

console.log('\n# tanggal libur periode');
{
  const { libur, galat } = uraiLibur('25/12/2026 Natal\n\n08/02/2027 - 23/03/2027 Ramadhan + 2 pekan\n2027-01-01 Tahun Baru\n31/02/2027 salah\n10/03/2027 s.d. 01/03/2027 terbalik');
  eq(libur, [
    { mulai: '2026-12-25', selesai: '2026-12-25', keterangan: 'Natal' },
    { mulai: '2027-01-01', selesai: '2027-01-01', keterangan: 'Tahun Baru' },
    { mulai: '2027-02-08', selesai: '2027-03-23', keterangan: 'Ramadhan + 2 pekan' },
  ], 'libur terurai & terurut');
  eq(galat.length, 2, 'tanggal mustahil dan rentang terbalik dilaporkan');
  eq(uraiLibur(teksLibur(libur)).libur, libur, 'teksLibur ↔ uraiLibur bolak-balik');
  eq(
    tanggalPertemuan('2026-12-23', [2, 4], 3, libur),
    ['2026-12-23', '2026-12-30', '2027-01-06'],
    'Jumat 25 Des & Jumat 1 Jan dilompati (Rabu & Jumat)'
  );
  const tanpa = tanggalPertemuan('2026-10-05', [0, 2], 50);
  const dengan = tanggalPertemuan('2026-10-05', [0, 2], 50, libur);
  eq(dengan.length, 50, 'tetap 50 pertemuan');
  eq(dengan.some((t) => t >= '2027-02-08' && t <= '2027-03-23'), false, 'tak ada pertemuan di Ramadhan + 2 pekan');
  eq(dengan.at(-1)! > tanpa.at(-1)!, true, 'pertemuan terakhir mundur karena libur');
}

eq(namaPertemuan(1), 'P1', 'nama pertemuan P1');
eq(namaPertemuan(22), 'P22', 'nama pertemuan P22');

eq(
  rentangPertemuan('2026-07-27', '20:00:00', '21:30:00'),
  { mulai: '2026-07-27 20:00:00', selesai: '2026-07-27 21:30:00' },
  'rentang pertemuan berformat CMS'
);
eq(
  rentangPertemuan('2026-07-27', '20:00:00', '20:00:00'),
  null,
  'jam kembar ditolak — CMS balas 400 untuk itu'
);

// ── Pertemuan per jenjang ───────────────────────────────────────────────────
console.log('\n# jumlah pertemuan per jenjang');

const aturanPertemuan = { jumlah_pertemuan_dasar: 50, jumlah_pertemuan_lanjutan: 26 };
eq(jumlahPertemuanUntuk(aturanPertemuan, 'HITS Dasar'), 50, 'Dasar 50 pertemuan');
eq(jumlahPertemuanUntuk(aturanPertemuan, 'HITS Lanjutan'), 26, 'Lanjutan 26 pertemuan');
eq(jumlahPertemuanUntuk(aturanPertemuan, 'hits lanjutan'), 26, 'huruf kecil tetap dikenali');

// ── Halaqah selesai ─────────────────────────────────────────────────────────
console.log('\n# halaqah yang sudah selesai');

eq(masihBerjalanPada('2026-08-30', '2026-10-21'), false, 'selesai sebelum KBM → tidak mengunci');
eq(masihBerjalanPada('2026-10-11', '2026-09-21'), true, 'selesai setelah KBM → mengunci');
eq(masihBerjalanPada('2026-10-21', '2026-10-21'), true, 'selesai tepat di hari KBM → masih mengunci');
eq(masihBerjalanPada(null, '2026-10-21'), true, 'tanpa kaldik → tetap mengunci (aman)');
eq(masihBerjalanPada('2026-08-30', null), true, 'tanpa acuan → perilaku lama');

// ── Prioritas per jam ───────────────────────────────────────────────────────
console.log('\n# prioritas per jam');

// Pengajar yang sama punya urutan berlawanan di dua jam. Diuji satu jam per
// panggilan supaya hasilnya ditentukan prioritas, bukan kaidah putaran.
const prioritasJam: Record<string, number> = { 'J1|p1': 2, 'J1|p2': 1, 'J2|p1': 1, 'J2|p2': 2 };
const peringkatJam = (id: string, slot: string) => prioritasJam[`${slot}|${id}`] ?? 99;

const hasilJ1 = alokasikan({
  slots: [slotAlokasi('J1', [0, 2], '06:00', '07:30', 1)],
  tersedia: new Map([['J1', ['p1', 'p2']]]),
  sudahDiSlot: new Map(),
  jadwalPengajar: new Map(),
  peringkat: peringkatJam,
});
eq(hasilJ1.penempatan[0]?.pengajar_id, 'p2', 'jam J1 jatuh ke prioritas #1 di J1');
eq(hasilJ1.penempatan[0]?.urutan_prioritas, 1, 'urutan_prioritas dicatat per jam');

const hasilJ2 = alokasikan({
  slots: [slotAlokasi('J2', [1, 3], '20:00', '21:30', 1)],
  tersedia: new Map([['J2', ['p1', 'p2']]]),
  sudahDiSlot: new Map(),
  jadwalPengajar: new Map(),
  peringkat: peringkatJam,
});
eq(hasilJ2.penempatan[0]?.pengajar_id, 'p1', 'jam J2 jatuh ke prioritas #1 di J2');

// ── Identitas & kiriman ulang ──────────────────────────────────────────────
console.log('\n# kiriman ulang formulir');

eq(identitasPendaftar('0812-3456-7890', '  Siti   Aminah '), '81234567890|siti aminah', 'identitas: nomor & nama dinormalkan');
eq(identitasPendaftar('6281234567890', 'SITI AMINAH'), '81234567890|siti aminah', 'identitas: 62 dan huruf besar setara');
eq(identitasPendaftar(null, 'Siti'), null, 'identitas: tanpa nomor → null');

const slotUji = {
  id: 'SL',
  periode_id: 'P',
  kelompok: 'akhwat',
  mode: 'online',
  label: 'Senin & Rabu 20:00 - 21:30 WIB',
  hari: ['Senin', 'Rabu'],
  hari_idx: [0, 2],
  waktu_mulai: '20:00',
  waktu_selesai: '21:30',
  lokasi: null,
  aktif: true,
  urutan: 0,
  created_at: '',
  updated_at: '',
} as KsSlot;

const kiriman = (nama: string, wa: string, waktu: string): BarisMentah => ({
  nama,
  wa,
  tanggal_lahir: null,
  umur_isian: 30,
  gender: 'akhwat',
  level: 'HITS Dasar',
  slot_label_raw: 'Online Senin & Rabu 20:00 - 21:30 WIB',
  rekaman_url: null,
  didaftar_pada: waktu,
  kunci: `${wa}-${waktu}`,
});

const ulang = saring(
  [
    kiriman('Siti Aminah', '081234567890', '2026-09-09T03:00:00.000Z'),
    kiriman('siti  aminah', '6281234567890', '2026-09-10T03:00:00.000Z'),
    kiriman('Rahma', '081234567890', '2026-09-09T04:00:00.000Z'),
  ],
  [slotUji],
  new Date('2026-09-16T05:00:00Z')
);
eq(ulang.map((b) => b.status), ['diganti', 'valid', 'valid'], 'kiriman lama diganti, sekeluarga tetap sah');
eq(ulang[0].alasan_ditahan, [], 'baris diganti tidak membawa alasan tertahan');

const sudahDapat = saring(
  [kiriman('Siti Aminah', '081234567890', '2026-09-12T03:00:00.000Z')],
  [slotUji],
  new Date('2026-09-16T05:00:00Z'),
  { identitasDialokasikan: new Set(['81234567890|siti aminah']) }
);
eq(sudahDapat[0].status, 'diganti', 'identitas yang sudah dialokasikan: kiriman lain diganti');

// ── Hitungan dashboard ─────────────────────────────────────────────────────
console.log('\n# hitungan dashboard');

const slotDasbor = (
  id: string,
  kelompok: 'ikhwan' | 'akhwat',
  hari: string[],
  hariIdx: KsHariIdx[],
  mulai: string,
  mode: 'online' | 'offline' = 'online'
) =>
  ({
    id,
    periode_id: 'P',
    kelompok,
    mode,
    label: `${hari.join(' & ')} ${mulai} - 23:00 WIB`,
    hari,
    hari_idx: hariIdx,
    waktu_mulai: `${mulai}:00`,
    waktu_selesai: '23:00:00',
    lokasi: mode === 'offline' ? 'Pejaten' : null,
    aktif: true,
    urutan: 0,
    created_at: '',
    updated_at: '',
  }) as KsSlot;

const ringkasDasbor = (antre: number, tersedia: number, terpakai = 0) =>
  ({
    slot_id: '',
    antre,
    dialokasikan: 0,
    ditahan: 0,
    terpakai_lain: 0,
    pengajar_tersedia: tersedia,
    pengajar_terpakai: terpakai,
    halaqah_hidup: 0,
    butuh_halaqah: 0,
    dapat_dibentuk: 0,
    belum_tertampung: 0,
    antrean_tertua_hari: null,
    butuh_pengajar: false,
    riwayat: null,
  }) as RingkasSlot;

const barisJam = susunBarisJam(
  [
    slotDasbor('A', 'akhwat', ['Selasa', 'Kamis'], [1, 3], '20:00'),
    slotDasbor('B', 'akhwat', ['Senin', 'Rabu'], [0, 2], '20:00'),
    slotDasbor('C', 'akhwat', ['Senin', 'Rabu'], [0, 2], '20:00', 'offline'),
    slotDasbor('D', 'ikhwan', ['Sabtu', 'Ahad'], [5, 6], '13:00'),
  ],
  new Map([
    ['A', ringkasDasbor(432, 6)],
    ['B', ringkasDasbor(20, 2, 1)],
    ['C', ringkasDasbor(30, 0)],
    ['D', ringkasDasbor(0, 3)],
  ]),
  12
);
eq(barisJam.map((b) => b.slot_id), ['A', 'C', 'B', 'D'], 'jam diurut dari kekurangan terbesar');
eq(barisJam.map((b) => b.status), ['kurang', 'tanpa_pengajar', 'kurang', 'kosong'], 'status per jam');
eq([barisJam[0].tampung, barisJam[0].sisa, barisJam[0].butuh, barisJam[0].bisa], [72, 360, 36, 6], 'daya tampung dibatasi pengajar');
eq(barisJam.find((b) => b.slot_id === 'B')?.tampung, 12, 'pengajar yang sudah terpakai tidak dihitung bebas');
eq(jumlahkan(barisJam).sisa, 398, 'jumlah belum tertampung');

const peta = susunPeta(barisJam);
eq(peta.hari.map((h) => h.label), ['Senin & Rabu', 'Selasa & Kamis', 'Sabtu & Ahad'], 'baris peta urut hari');
eq(peta.jam, ['13:00', '20:00'], 'kolom peta urut jam');
eq(
  peta.sel['0,2|20:00'],
  { antre: 50, sisa: 38, pengajar: 2, sisaOnline: 8, sisaOffline: 30, jumlahJam: 2 },
  'sel peta menjumlah online dan offline'
);
eq([0, 1, 49, 50, 199, 360].map(tingkatPeta), [0, 1, 2, 3, 4, 5], 'tingkat warna peta');

eq(
  susunArus([
    { didaftar_pada: '2026-09-09T03:19:20.000Z', gender: 'akhwat' },
    { didaftar_pada: '2026-09-09T20:00:00.000Z', gender: 'ikhwan' },
    { didaftar_pada: '2026-09-11T01:00:00.000Z', gender: 'akhwat' },
  ]),
  [
    { tanggal: '2026-09-09', ikhwan: 0, akhwat: 1 },
    { tanggal: '2026-09-10', ikhwan: 1, akhwat: 1 },
    { tanggal: '2026-09-11', ikhwan: 1, akhwat: 2 },
  ],
  'arus kumulatif per hari WIB, hari tanpa pendaftar tetap ada'
);
eq(tanggalBatasAntrean('2026-09-09', 21), '2026-09-30', 'hari antrean tertua genap 21 hari');

// ── Jam dari formulir masuk master ─────────────────────────────────────────
console.log('\n# jam formulir yang belum ada di master');

const pilihan = (gender: 'ikhwan' | 'akhwat' | null, slot: string, kunci: string): BarisMentah => ({
  nama: 'Uji',
  wa: '081200000000',
  tanggal_lahir: null,
  umur_isian: 30,
  gender,
  level: 'HITS Dasar',
  slot_label_raw: slot,
  rekaman_url: null,
  didaftar_pada: '2026-09-10T03:00:00.000Z',
  kunci,
});

const jamBaru = jamBaruDariFormulir(
  [
    pilihan('akhwat', 'Online Senin & Rabu 20:00 - 21:30 WIB', 'j1'), // sudah ada: slotUji
    pilihan('akhwat', 'Offline di Pejaten Selasa & Kamis, 16.00 - 17.30', 'j2'),
    pilihan('akhwat', 'Offline di Pejaten Selasa & Kamis, 16.00 - 17.30', 'j3'), // kembar
    pilihan('ikhwan', 'Online Senin & Rabu 20:00 - 21:30 WIB', 'j4'), // jam sama, gender lain
    pilihan('akhwat', 'This choice no longer accepts responses', 'j5'),
    pilihan('akhwat', 'Offline di Masjid Al Kautsar Matraman Jakarta Timur Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30', 'j6'),
    pilihan(null, 'Online Sabtu & Ahad 06:00 - 07:30 WIB', 'j7'), // gender tak diketahui
  ],
  [slotUji]
);
eq(
  jamBaru.map((j) => `${j.kelompok}|${j.mode}|${j.label}|${j.lokasi}`),
  [
    'akhwat|offline|Selasa & Kamis 16:00 - 17:30 WIB|Pejaten',
    'ikhwan|online|Senin & Rabu 20:00 - 21:30 WIB|null',
    'akhwat|offline|Rabu 16:00 - 17:30 & Sabtu 13:00 - 14:30 WIB|Masjid Al-Kautsar Matraman',
  ],
  'hanya jam baru per gender & mode, tanpa kembar, tanpa pilihan tak terbaca; kelas dua waktu ikut'
);
eq(
  jamBaruDariFormulir([pilihan('akhwat', 'Online Senin & Rabu 20:00 - 21:30 WIB', 'x')], [{ ...slotUji, aktif: false }]).length,
  0,
  'jam yang dinonaktifkan koordinator tidak dihidupkan lagi'
);

// ── Banyak CSV dalam satu periode ─────────────────────────────────────────
console.log('\n# orang yang sama di dua CSV');
{
  const b = { ...pilihan('akhwat', 'Online Senin & Rabu 20:00 - 21:30 WIB', 'csv2-a'), nama: 'Fatimah Zahra' };
  const idF = identitasPendaftar(b.wa, b.nama)!;
  const lebihLama = saring([b], [slotUji], new Date('2026-09-16T00:00:00Z'), {
    terbaruLain: new Map([[idF, { didaftar_pada: '2026-09-12T00:00:00.000Z', kunci: 'csv1-a' }]]),
  });
  eq(lebihLama[0].status, 'diganti', 'CSV lain punya kiriman lebih baru → baris ini diganti');
  const lebihBaruIni = saring([b], [slotUji], new Date('2026-09-16T00:00:00Z'), {
    terbaruLain: new Map([[idF, { didaftar_pada: '2026-09-01T00:00:00.000Z', kunci: 'csv1-a' }]]),
  });
  eq(lebihBaruIni[0].status, 'valid', 'kiriman ini lebih baru → tetap valid');
  eq(
    lebihBaru({ didaftar_pada: '2026-09-10T03:00:00.000Z', kunci: 'b' }, { didaftar_pada: '2026-09-10T03:00:00.000Z', kunci: 'a' }) !==
      lebihBaru({ didaftar_pada: '2026-09-10T03:00:00.000Z', kunci: 'a' }, { didaftar_pada: '2026-09-10T03:00:00.000Z', kunci: 'b' }),
    true,
    'waktu sama persis: tepat satu pemenang'
  );
}

console.log('\n# normalisasi WA');
eq(normalWa('6208123456789'), '8123456789', '62 lalu 0: nol ikut dibuang');
eq(normalWa('+62 (0)812-3456-789'), '8123456789', '+62 (0)');
eq(normalWa('08123456789'), '8123456789', '0 depan');
eq(normalWa(normalWa('6208123456789')), normalWa('6208123456789'), 'idempoten');
eq(identitasPendaftar('6208123456789', 'Dewi'), identitasPendaftar('628123456789', 'dewi'), 'kiriman ulang dengan 62 0… dikenali orang yang sama');

console.log('\n# lokasi offline baku');
eq(lokasiBaku('Masjid Al Kautsar Matraman Jakarta Timur'), 'Masjid Al-Kautsar Matraman', 'ejaan formulir Matraman');
eq(lokasiBaku('Masjid Al-Kautsar Matraman'), 'Masjid Al-Kautsar Matraman', 'ejaan xlsx Matraman');
eq(lokasiBaku('Offline'), 'Pejaten', 'offline tanpa tempat = Pejaten');
eq(lokasiBaku(null), 'Pejaten', 'kosong = Pejaten');
eq(lokasiBaku('Pejaten Akhwat'), 'Pejaten', 'Pejaten dengan embel-embel');
eq(lokasiBaku('Bekasi'), 'Bekasi', 'lokasi lain dibiarkan');

console.log(failed === 0 ? '\nSEMUA LULUS' : `\n${failed} GAGAL`);
process.exit(failed === 0 ? 0 : 1);
