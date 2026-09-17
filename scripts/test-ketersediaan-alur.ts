// Uji fungsi murni alur hilir Ketersediaan Mengajar HITS: konfirmasi → pengganti →
// antrean CMS tilawah. Tanpa basis data, tanpa jaringan.
//
// Jalankan: NODE_PATH=./scripts/node-shims npx tsx scripts/test-ketersediaan-alur.ts
import { TilawahError, bolehUlangFetch, galatSebelumKirim, pastiTidakDiterima } from '@/lib/tilawah/client';
import {
  langkahHilang,
  masukanPertemuan,
  namaSama,
  susunLangkahHarapan,
  susunRencanaPertemuan,
  waDipakaiBersama,
} from '@/lib/tilawah/map';
import {
  aksesTokenBerakhir,
  slotBentrokDengan,
  urutkanKandidatPengganti,
} from '@/lib/ketersediaan-konfirmasi';
import { rentangDariSlot } from '@/lib/ketersediaan-slot';
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

const galatJaringan = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: { code } });

// ── Pengulangan fetch ──────────────────────────────────────────────────────
console.log('\n# pengulangan fetch');
eq(bolehUlangFetch('GET', galatJaringan('UND_ERR_SOCKET')), true, 'GET selalu boleh diulang');
eq(bolehUlangFetch(undefined, new Error('x')), true, 'tanpa method = GET');
eq(bolehUlangFetch('POST', galatJaringan('UND_ERR_SOCKET')), false, 'POST putus di tengah: JANGAN diulang');
eq(bolehUlangFetch('POST', new TypeError('fetch failed')), false, 'POST fetch failed tanpa kode: jangan diulang');
eq(bolehUlangFetch('POST', galatJaringan('ECONNREFUSED')), true, 'POST ditolak sebelum konek: boleh');
eq(bolehUlangFetch('post', galatJaringan('ENOTFOUND')), true, 'DNS gagal: boleh');
eq(bolehUlangFetch('PUT', galatJaringan('UND_ERR_CONNECT_TIMEOUT')), true, 'connect timeout: boleh');
eq(galatSebelumKirim(galatJaringan('ECONNRESET')), false, 'ECONNRESET bukan sebelum-kirim');

console.log('\n# kepastian penolakan CMS');
eq(pastiTidakDiterima(new TilawahError('422', 422)), true, '4xx = pasti ditolak');
eq(pastiTidakDiterima(new TilawahError('kredensial', 0)), true, 'status 0 (konfigurasi) = tidak terkirim');
eq(pastiTidakDiterima(new TilawahError('500', 500)), false, '5xx = mungkin sudah terjadi');
eq(pastiTidakDiterima(new TilawahError('respons CMS tilawah bukan JSON (200)', 200)), false, 'bukan JSON 200 = meragukan');
eq(pastiTidakDiterima(galatJaringan('UND_ERR_SOCKET')), false, 'soket putus = meragukan');
eq(pastiTidakDiterima(galatJaringan('ECONNREFUSED')), true, 'koneksi ditolak = tidak terkirim');
eq(pastiTidakDiterima(new Error('Ada 2 halaqah')), false, 'galat biasa = meragukan');

// ── Rencana pertemuan ──────────────────────────────────────────────────────
console.log('\n# rencana pertemuan dihitung sekali');
const slotSR = {
  label: 'Senin & Rabu 20:00 - 21:30 WIB',
  hari_idx: [0, 2] as KsHariIdx[],
  waktu_mulai: '20:00:00',
  waktu_selesai: '21:30:00',
};
{
  const r = susunRencanaPertemuan({ tanggalMulai: '2026-09-07', slot: slotSR, jumlah: 4, libur: [] });
  eq(r.galat, null, 'tanpa galat');
  eq(
    r.rencana.map((x) => [x.ke, x.tanggal, x.mulai, x.selesai]),
    [
      [1, '2026-09-07', '2026-09-07 20:00:00', '2026-09-07 21:30:00'],
      [2, '2026-09-09', '2026-09-09 20:00:00', '2026-09-09 21:30:00'],
      [3, '2026-09-14', '2026-09-14 20:00:00', '2026-09-14 21:30:00'],
      [4, '2026-09-16', '2026-09-16 20:00:00', '2026-09-16 21:30:00'],
    ],
    'Senin & Rabu berturut-turut'
  );
  const libur = susunRencanaPertemuan({
    tanggalMulai: '2026-09-07',
    slot: slotSR,
    jumlah: 3,
    libur: [{ mulai: '2026-09-09', selesai: '2026-09-09', keterangan: 'libur' }],
  });
  eq(libur.rencana.map((x) => x.tanggal), ['2026-09-07', '2026-09-14', '2026-09-16'], 'libur dilompati');
  eq(susunRencanaPertemuan({ tanggalMulai: null, slot: slotSR, jumlah: 3, libur: [] }).galat !== null, true, 'tanggal mulai kosong → galat');
  eq(susunRencanaPertemuan({ tanggalMulai: null, slot: slotSR, jumlah: 0, libur: [] }), { rencana: [], galat: null }, '0 pertemuan → kosong tanpa galat');

  const duaWaktu = susunRencanaPertemuan({
    tanggalMulai: '2026-09-16',
    slot: {
      label: 'Rabu 16:00 - 17:30 & Sabtu 13:00 - 14:30 WIB',
      hari_idx: [2, 5] as KsHariIdx[],
      waktu_mulai: '16:00:00',
      waktu_selesai: '17:30:00',
    },
    jumlah: 2,
    libur: [],
  });
  eq(duaWaktu.rencana.map((x) => x.mulai), ['2026-09-16 16:00:00', '2026-09-19 13:00:00'], 'kelas dua waktu: jam per hari');
}

console.log('\n# masukan langkah pertemuan');
eq(masukanPertemuan({ ke: 3, tanggal: '2026-09-14', mulai: 'a', selesai: 'b' }), { ke: 3, jadwal: { tanggal: '2026-09-14', mulai: 'a', selesai: 'b' } }, 'payload antrean baru');
eq(
  masukanPertemuan({ name: 'P3', order: 3, rencana: { ke: 3, tanggal: '2026-09-14', mulai: 'a', selesai: 'b' } }),
  { ke: 3, jadwal: { tanggal: '2026-09-14', mulai: 'a', selesai: 'b' } },
  'payload yang sudah berisi pratinjau'
);
eq(masukanPertemuan({ name: 'P7', order: 7, schedule_date: '2026-09-30' }), { ke: 7, jadwal: null }, 'baris lama tertimpa badan kiriman: ke dari order');
eq(masukanPertemuan({ menunggu: 'x', rencana: { ke: 2 } }), { ke: 2, jadwal: null }, 'baris menunggu tanpa jadwal');
eq(masukanPertemuan(null).ke, 0, 'payload kosong → 0 (ditolak penyusun)');

// ── Kelengkapan antrean ────────────────────────────────────────────────────
console.log('\n# antrean dilengkapi, bukan dilewati');
{
  const rencana = susunRencanaPertemuan({ tanggalMulai: '2026-09-07', slot: slotSR, jumlah: 3, libur: [] }).rencana;
  const harapan = susunLangkahHarapan({ jumlahPertemuan: 3, rencana, pesertaIds: ['pA', 'pB'] });
  const semua = langkahHilang([], harapan);
  eq(semua.map((l) => [l.aksi, l.urutan]), [
    ['buat_halaqah', 0],
    ['buat_pertemuan', 1],
    ['buat_pertemuan', 2],
    ['buat_pertemuan', 3],
    ['enrol', 4],
    ['enrol', 5],
  ], 'antrean kosong → semua langkah, urutan halaqah → pertemuan → enrol');
  eq(semua[1].payload, rencana[0], 'jadwal pertemuan tersimpan di payload');

  const ada = semua.slice(0, 3).map((l) => ({ aksi: l.aksi, peserta_id: l.peserta_id, urutan: l.urutan, payload: l.payload }));
  const sisa = langkahHilang(ada, harapan);
  eq(sisa.map((l) => [l.aksi, l.ke ?? l.peserta_id, l.urutan]), [
    ['buat_pertemuan', 3, 3],
    ['enrol', 'pA', 4],
    ['enrol', 'pB', 5],
  ], 'antrean terpotong → hanya langkah yang hilang');

  const lengkap = semua.map((l) => ({ aksi: l.aksi, peserta_id: l.peserta_id, urutan: l.urutan, payload: l.payload }));
  eq(langkahHilang(lengkap, harapan).length, 0, 'antrean lengkap → idempoten, nol sisipan');

  // Peserta bertambah; urutan 4 & 5 sudah terpakai.
  const tambah = langkahHilang(lengkap, susunLangkahHarapan({ jumlahPertemuan: 3, rencana, pesertaIds: ['pA', 'pB', 'pC'] }));
  eq(tambah.map((l) => [l.peserta_id, l.urutan]), [['pC', 6]], 'peserta baru → urutan tidak bertabrakan');

  // Baris lama: payload pertemuan tertimpa badan kiriman (order, bukan ke).
  const lama = [
    { aksi: 'buat_halaqah', peserta_id: null, urutan: 0, payload: { name: 'HITS 001' } },
    { aksi: 'buat_pertemuan', peserta_id: null, urutan: 1, payload: { name: 'P1', order: 1 } },
  ];
  eq(
    langkahHilang(lama, susunLangkahHarapan({ jumlahPertemuan: 2, rencana: [], pesertaIds: [] })).map((l) => [l.ke, l.urutan]),
    [[2, 2]],
    'baris lama ber-order dikenali, tidak digandakan'
  );
}

// ── Satu nomor WA, dua nama ────────────────────────────────────────────────
console.log('\n# nomor WA dipakai bersama');
eq(
  waDipakaiBersama([
    { nama: 'Aisyah', wa_normal: '811' },
    { nama: 'Fatimah', wa_normal: '811' },
    { nama: 'Umar', wa_normal: '822' },
    { nama: 'umar ', wa_normal: '822' },
    { nama: 'Tanpa WA', wa_normal: null },
  ]),
  [{ wa: '811', nama: ['Aisyah', 'Fatimah'] }],
  'beda nama satu nomor ditahan; beda kapital/spasi dianggap sama'
);
eq(namaSama('Ahmad  Fauzi', 'ahmad fauzi'), true, 'nama sama beda spasi');
eq(namaSama('Ahmad', 'Ahmad Fauzi'), false, 'nama berbeda tidak dianggap sama');

// ── Masa berlaku tautan ────────────────────────────────────────────────────
console.log('\n# masa berlaku tautan konfirmasi');
eq(aksesTokenBerakhir({ status: 'dikonfirmasi', tanggal_mulai: '2026-09-01' }, new Date('2026-10-01T16:00:00Z')), false, 'hari ke-30 (WIB) masih berlaku');
eq(aksesTokenBerakhir({ status: 'dikonfirmasi', tanggal_mulai: '2026-09-01' }, new Date('2026-10-01T17:30:00Z')), true, 'lewat 30 hari → berakhir');
eq(aksesTokenBerakhir({ status: 'gagal', tanggal_mulai: '2026-01-01' }, new Date('2026-09-17T00:00:00Z')), true, 'status gagal juga dibatasi');
eq(aksesTokenBerakhir({ status: 'menunggu', tanggal_mulai: '2026-01-01' }, new Date('2026-09-17T00:00:00Z')), false, 'belum dikonfirmasi: diatur tenggat, bukan batas ini');
eq(aksesTokenBerakhir({ status: 'dikirim', tanggal_mulai: null, dikonfirmasi_pada: '2026-07-01T03:00:00.000Z' }, new Date('2026-09-17T00:00:00Z')), true, 'tanpa tanggal mulai → acuan tanggal konfirmasi');
eq(aksesTokenBerakhir({ status: 'dikirim', tanggal_mulai: null }, new Date('2030-01-01T00:00:00Z')), false, 'tanpa acuan sama sekali → tidak diputus');

// ── Kandidat pengganti ─────────────────────────────────────────────────────
console.log('\n# kandidat pengganti');
{
  const k = (pengajar_id: string, prioritas: number | null, extra: Partial<{ periode_id: string; status: string; submitted_at: string }> = {}) => ({
    pengajar_id,
    periode_id: extra.periode_id ?? 'P1',
    status: extra.status ?? 'aktif',
    submitted_at: extra.submitted_at ?? '2026-09-01T00:00:00Z',
    prioritas,
  });
  const hasil = urutkanKandidatPengganti(
    [
      k('lama', 1),
      k('pernahTolak', 2),
      k('pernahKedaluwarsa', 3),
      k('periodeLain', 1, { periode_id: 'P2' }),
      k('nonaktif', 1, { status: 'nonaktif' }),
      k('c', 5, { submitted_at: '2026-09-03T00:00:00Z' }),
      k('b', 5, { submitted_at: '2026-09-02T00:00:00Z' }),
      k('a', 4),
      k('tanpaPrioritas', null),
    ],
    { periodeId: 'P1', pernahDiusulkan: new Set(['pernahTolak', 'pernahKedaluwarsa', 'lama']), kecuali: 'lama' }
  );
  eq(hasil.map((x) => x.pengajar_id), ['a', 'b', 'c', 'tanpaPrioritas'], 'yang pernah diusulkan (status apa pun) tidak ditawari ulang; urut prioritas lalu pengisi awal');
}

const rentangSR = rentangDariSlot(slotSR);
eq(
  slotBentrokDengan(rentangSR, rentangDariSlot({ label: 'Rabu 21:00 - 22:00 WIB', hari_idx: [2], waktu_mulai: '21:00', waktu_selesai: '22:00' })),
  true,
  'jadwal beririsan → bentrok'
);
eq(
  slotBentrokDengan(rentangSR, rentangDariSlot({ label: 'Rabu 21:30 - 23:00 WIB', hari_idx: [2], waktu_mulai: '21:30', waktu_selesai: '23:00' })),
  false,
  'bersentuhan ujung → tidak bentrok'
);

console.log(failed === 0 ? '\nSEMUA LULUS' : `\n${failed} GAGAL`);
process.exit(failed === 0 ? 0 : 1);
