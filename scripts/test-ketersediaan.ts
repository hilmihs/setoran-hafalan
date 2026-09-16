// Uji fungsi murni Ketersediaan Mengajar HITS. Jalankan: npm run test-ketersediaan
//
// Yang diuji: penguraian teks slot yang ejaannya bercampur, deteksi bentrok,
// pengelompokan pendaftar (level + pita umur + antrean tua), dan kaidah
// pemerataan pada alokasi berputar.
import {
  bentrok,
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
import { bacaTanggal, deteksiFormatTanggal } from '@/lib/ketersediaan-pendaftar';
import {
  namaPertemuan,
  rentangPertemuan,
  tanggalPertemuan,
} from '@/lib/ketersediaan-pertemuan';
import type { KsHariIdx } from '@/types/db';

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
eq(
  uraikanSlot('Offline Al Kautsar Senin 07.30 - 09.00 WIB & Selasa 13.00 - 14.30 WIB'),
  null,
  'dua rentang jam berbeda ditolak, bukan ditebak'
);
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
  { hari_idx: [1, 4], mulai: 360, selesai: 450 },
  'halaqah dari kolom terurai'
);
eq(
  rentangDariHalaqah({
    jadwal_hari: null,
    waktu_mulai: null,
    waktu_selesai: null,
    jadwal_raw: 'Online Sabtu & Ahad 13:00 - 14:30 WIB',
  }),
  { hari_idx: [5, 6], mulai: 780, selesai: 870 },
  'halaqah jatuh ke jadwal_raw'
);
eq(
  rentangDariHalaqah({
    jadwal_hari: ['Selasa', "Jum'at"],
    waktu_mulai: null,
    waktu_selesai: null,
    jadwal_raw: "Selasa & Jum'at",
  }),
  null,
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
eq(pitaUmur(17), '<=17', 'pita 17');
eq(pitaUmur(18), '18-25', 'pita 18');
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
  buatPendaftar(25, 'HITS Dasar', '18-25', 3, 'a'),
  periode,
  acuan
);
eq(g1.length, 2, '25 pendaftar satu pita → 2 halaqah penuh');
eq(g1.every((g) => g.pendaftar_ids.length === 12), true, 'tiap halaqah tepat 12');
eq(g1.every((g) => !g.pita_digabung), true, 'tidak ada penggabungan pita');

const campur = [
  ...buatPendaftar(12, 'HITS Dasar', '18-25', 3, 'b'),
  ...buatPendaftar(12, 'HITS Lanjutan', '18-25', 3, 'c'),
];
const g2 = kelompokkanPendaftar('S1', campur, periode, acuan);
eq(g2.length, 2, 'dua level → dua halaqah terpisah');
eq(new Set(g2.map((g) => g.level)).size, 2, 'level tidak tercampur dalam satu halaqah');

// Sisa muda menunggu; sisa tua boleh dibentuk di atas ambang bawah.
const sisaMuda = [
  ...buatPendaftar(5, 'HITS Dasar', '18-25', 2, 'd'),
  ...buatPendaftar(5, 'HITS Dasar', '26-35', 2, 'e'),
];
eq(kelompokkanPendaftar('S1', sisaMuda, periode, acuan).length, 0, 'sisa muda menunggu');

const sisaTua = [
  ...buatPendaftar(5, 'HITS Dasar', '18-25', 40, 'f'),
  ...buatPendaftar(5, 'HITS Dasar', '26-35', 40, 'g'),
];
const g3 = kelompokkanPendaftar('S1', sisaTua, periode, acuan);
eq(g3.length, 1, 'sisa tua digabung jadi satu halaqah');
eq(g3[0].pita_digabung, true, 'ditandai sebagai pita digabung');
eq(g3[0].pendaftar_ids.length, 10, 'isi 10, di atas ambang bawah 8');

const sisaTuaKecil = buatPendaftar(7, 'HITS Dasar', '18-25', 40, 'h');
eq(
  kelompokkanPendaftar('S1', sisaTuaKecil, periode, acuan).length,
  0,
  'tua tapi di bawah ambang bawah tetap menunggu'
);

// Antrean tertua harus terlayani lebih dulu.
const urutUsia = [
  ...buatPendaftar(12, 'HITS Dasar', '18-25', 2, 'i'),
  ...buatPendaftar(12, 'HITS Dasar', '26-35', 30, 'j'),
];
const g4 = kelompokkanPendaftar('S1', urutUsia, periode, acuan);
eq(g4[0].pita_umur, '26-35', 'kelompok dengan antrean tertua di urutan pertama');

// ── Alokasi berputar ───────────────────────────────────────────────────────
console.log('\n# alokasi berputar');

function slotAlokasi(id: string, hari: KsHariIdx[], mulai: string, selesai: string, jumlahGrup: number): SlotAlokasi {
  return {
    slot: { id, hari_idx: hari, waktu_mulai: mulai, waktu_selesai: selesai },
    grup: Array.from({ length: jumlahGrup }, (_, i) => ({
      slot_id: id,
      level: 'HITS Dasar',
      pita_umur: '18-25' as const,
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

// ── Halaqah selesai ─────────────────────────────────────────────────────────
console.log('\n# halaqah yang sudah selesai');

eq(masihBerjalanPada('2026-08-30', '2026-10-21'), false, 'selesai sebelum KBM → tidak mengunci');
eq(masihBerjalanPada('2026-10-11', '2026-09-21'), true, 'selesai setelah KBM → mengunci');
eq(masihBerjalanPada('2026-10-21', '2026-10-21'), true, 'selesai tepat di hari KBM → masih mengunci');
eq(masihBerjalanPada(null, '2026-10-21'), true, 'tanpa kaldik → tetap mengunci (aman)');
eq(masihBerjalanPada('2026-08-30', null), true, 'tanpa acuan → perilaku lama');

console.log(failed === 0 ? '\nSEMUA LULUS' : `\n${failed} GAGAL`);
process.exit(failed === 0 ? 0 : 1);
