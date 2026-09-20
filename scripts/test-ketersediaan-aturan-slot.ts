// Uji MURNI aturan pemilihan slot Ketersediaan Mengajar HITS (tanpa DB, tanpa jaringan).
// Jalankan: npm run test-ketersediaan-aturan
//
// ── SPESIFIKASI ACUAN ──────────────────────────────────────────────────────
// `putuskanSlot` di bawah adalah SPESIFIKASI ACUAN kebijakan "slot mana yang
// boleh ikut dalam satu kiriman". Ia sengaja tinggal di berkas tes, bukan di
// `src/lib`, karena aturannya kini hidup di dalam server action yang memanggil
// database dan tidak dapat diuji apa adanya:
//
//   src/app/ketersediaan/pengajar/actions.ts
//     :89   tersimpanSebelumnya — himpunan slot yang sudah tersimpan
//     :96   offlineBaru        — offline + BARU dicentang → ditolak (butir 3)
//     :117  dibuka             — slot yang kuncinya terbuka karena sanggahan diterima
//     :122  bentrokTersisa     — terkunci & belum disanggah
//     :123  melanggar          — bentrokTersisa yang BARU dicentang → ditolak (butir 2)
//     :187  dibuang            — baris lama yang tak dikirim lagi → dihapus (butir 5)
//
// `simpanKetersediaan` harus MENCERMINKAN fungsi ini. Bila keduanya berbeda,
// yang salah adalah salah satunya — selaraskan, jangan diamkan. Urutan
// pemeriksaan pun ikut dispesifikasikan: offline diperiksa LEBIH DULU daripada
// bentrok, sama seperti actions.ts, sehingga slot yang sekaligus offline-baru
// dan terkunci-baru dilaporkan sebagai pelanggaran offline.
//
// Selain itu berkas ini menguji fungsi murni yang SUDAH ada apa adanya:
//   kunciSlot, alasanTerkunci  (src/lib/ketersediaan-bentrok.ts)
//   rentangDariSlot, bentrok   (src/lib/ketersediaan-slot.ts)
// termasuk satu cacat yang BELUM diperbaiki pada slot "dua waktu" — lihat bagian
// terakhir.
import { alasanTerkunci, kunciSlot, type JadwalTerpakai } from '@/lib/ketersediaan-bentrok';
import { bentrok, rentangDariSlot, uraikanSlot } from '@/lib/ketersediaan-slot';
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

// ── Spesifikasi acuan ──────────────────────────────────────────────────────

export interface MasukanPutusan {
  /** Slot yang dicentang pengajar pada kiriman ini (sudah disaring keabsahannya). */
  diminta: readonly string[];
  /** Slot yang sudah tersimpan pada pengisian periode ini sebelum kiriman ini. */
  tersimpanSebelumnya: readonly string[];
  /** Slot yang terkunci karena bentrok jadwal — keluaran `kunciSlot`. */
  terkunci: readonly string[];
  /** Slot yang bermode `offline` di master `ks_slot`. */
  offline: readonly string[];
  /** Slot yang kuncinya sudah dibuka karena sanggahan diterima koordinator. */
  dibukaSanggahan: readonly string[];
}

export interface HasilPutusan {
  /** Slot yang boleh tersimpan. Baris lama di luar daftar ini dihapus. */
  diterima: string[];
  /** Ditolak karena bentrok yang baru dicentang. */
  ditolakBentrok: string[];
  /** Ditolak karena penambahan offline — hak koordinator, bukan pengajar. */
  ditolakOffline: string[];
}

/**
 * Putuskan nasib tiap slot dalam satu kiriman.
 *
 * Kaidahnya, per slot yang diminta:
 *   1. offline DAN belum pernah tersimpan            → ditolakOffline
 *   2. terkunci, tanpa sanggahan diterima, DAN belum
 *      pernah tersimpan                              → ditolakBentrok
 *   3. selebihnya                                    → diterima
 *
 * Kunci perbaikannya ada pada syarat "belum pernah tersimpan". Tanpa itu, baris
 * lama yang belakangan menjadi terlarang (halaqah `hits_halaqah` yang hidup lagi
 * setelah sync, atau slot yang berubah menjadi offline) menolak SELURUH kiriman —
 * 50 dari 91 pengajar tidak dapat menyimpan apa pun, bahkan sekadar melepas slot
 * yang salah.
 *
 * Yang tidak dikirim lagi tidak muncul di mana pun: pemanggil menghapus setiap
 * baris lama yang tak ada di `diterima`, sehingga pengajar tetap boleh MELEPAS
 * slot offline lamanya — melepas tidak menuntut ruang fisik mana pun.
 *
 * Kiriman dengan `ditolakBentrok`/`ditolakOffline` tak kosong ditolak oleh
 * pemanggil dengan pesan yang menyebut labelnya; `diterima` adalah yang
 * disimpan bila keduanya kosong.
 */
export function putuskanSlot(m: MasukanPutusan): HasilPutusan {
  const tersimpan = new Set(m.tersimpanSebelumnya);
  const kunci = new Set(m.terkunci);
  const off = new Set(m.offline);
  const dibuka = new Set(m.dibukaSanggahan);

  const hasil: HasilPutusan = { diterima: [], ditolakBentrok: [], ditolakOffline: [] };
  for (const id of [...new Set(m.diminta)]) {
    const lama = tersimpan.has(id);
    if (off.has(id) && !lama) {
      hasil.ditolakOffline.push(id);
      continue;
    }
    if (kunci.has(id) && !dibuka.has(id) && !lama) {
      hasil.ditolakBentrok.push(id);
      continue;
    }
    hasil.diterima.push(id);
  }
  return hasil;
}

/** Masukan kosong yang mudah ditimpa per kasus uji. */
function masukan(p: Partial<MasukanPutusan>): MasukanPutusan {
  return {
    diminta: [],
    tersimpanSebelumnya: [],
    terkunci: [],
    offline: [],
    dibukaSanggahan: [],
    ...p,
  };
}

console.log('\n# aturan kiriman slot (spesifikasi acuan putuskanSlot)');

// Butir 1 — inti perbaikan blocker. Slot terkunci yang SUDAH tersimpan ikut
// lolos, dan yang lain pada kiriman yang sama tidak ikut jatuh.
const butir1 = putuskanSlot(
  masukan({ diminta: ['S1', 'S2'], tersimpanSebelumnya: ['S1'], terkunci: ['S1'] })
);
eq(butir1.diterima, ['S1', 'S2'], 'terkunci tapi sudah tersimpan → ikut diterima');
eq(butir1.ditolakBentrok, [], 'kiriman tidak ditolak seluruhnya karena baris lama');

// Butir 2 — bentrok yang baru dicentang tetap ditolak.
const butir2 = putuskanSlot(masukan({ diminta: ['S1', 'S9'], terkunci: ['S9'] }));
eq(butir2.ditolakBentrok, ['S9'], 'terkunci & baru dicentang → ditolak bentrok');
eq(butir2.diterima, ['S1'], 'slot bersih pada kiriman yang sama tetap diterima');
eq(butir2.ditolakOffline, [], 'penolakan bentrok tidak salah keranjang');

// Butir 3 — penambahan offline hanya lewat koordinator; keranjang penolakannya
// berbeda supaya pesannya berbeda pula.
const butir3 = putuskanSlot(masukan({ diminta: ['S1', 'F1'], offline: ['F1'] }));
eq(butir3.ditolakOffline, ['F1'], 'offline & baru dicentang → ditolak offline');
eq(butir3.ditolakBentrok, [], 'offline baru bukan pelanggaran bentrok');
eq(butir3.diterima, ['S1'], 'slot online pada kiriman yang sama tetap diterima');

// Offline-baru yang sekaligus terkunci dilaporkan sebagai pelanggaran offline —
// urutan ini mengikuti actions.ts:96 yang memeriksa offline sebelum bentrok.
const duaSalah = putuskanSlot(
  masukan({ diminta: ['F9'], offline: ['F9'], terkunci: ['F9'] })
);
eq(duaSalah.ditolakOffline, ['F9'], 'offline diperiksa lebih dulu daripada bentrok');
eq(duaSalah.ditolakBentrok, [], 'tidak dihitung dua kali');

// Butir 4 — offline yang sudah tersimpan boleh dipertahankan.
const butir4 = putuskanSlot(
  masukan({ diminta: ['F1', 'S1'], tersimpanSebelumnya: ['F1'], offline: ['F1'] })
);
eq(butir4.diterima, ['F1', 'S1'], 'offline lama dipertahankan');
eq(butir4.ditolakOffline, [], 'offline lama bukan penambahan');

// Butir 5 — offline lama yang tidak dikirim lagi tidak ikut diterima, sehingga
// pemanggil menghapusnya (actions.ts:187). Pengajar boleh melepas.
const butir5 = putuskanSlot(
  masukan({ diminta: ['S1'], tersimpanSebelumnya: ['F1', 'S1'], offline: ['F1'] })
);
eq(butir5.diterima, ['S1'], 'offline lama yang dilepas tidak ikut diterima');
eq(butir5.ditolakOffline, [], 'melepas bukan pelanggaran');
// Apa yang dihapus pemanggil = baris lama yang tak ada di `diterima`.
eq(
  ['F1', 'S1'].filter((id) => !butir5.diterima.includes(id)),
  ['F1'],
  'baris lama di luar diterima = baris yang dihapus'
);

// Baris terkunci yang dilepas juga hilang — jalan keluar bila jadwalnya memang
// benar-benar bentrok.
const lepasTerkunci = putuskanSlot(
  masukan({ diminta: ['S2'], tersimpanSebelumnya: ['S1', 'S2'], terkunci: ['S1'] })
);
eq(lepasTerkunci.diterima, ['S2'], 'slot terkunci lama boleh dilepas');

// Butir 6 — sanggahan diterima membuka kunci untuk pencentangan BARU.
const butir6 = putuskanSlot(
  masukan({ diminta: ['S9'], terkunci: ['S9'], dibukaSanggahan: ['S9'] })
);
eq(butir6.diterima, ['S9'], 'kunci terbuka oleh sanggahan → boleh dicentang baru');
eq(butir6.ditolakBentrok, [], 'tidak lagi dihitung melanggar');

// Sanggahan hanya membuka kunci bentrok, bukan larangan offline.
const sanggahOffline = putuskanSlot(
  masukan({ diminta: ['F9'], offline: ['F9'], terkunci: ['F9'], dibukaSanggahan: ['F9'] })
);
eq(sanggahOffline.ditolakOffline, ['F9'], 'sanggahan tidak membuka larangan offline');

// Sifat umum: masukan ganda tidak menggandakan keluaran, dan urutan keluaran
// mengikuti urutan pencentangan.
const ganda = putuskanSlot(masukan({ diminta: ['S2', 'S1', 'S2'] }));
eq(ganda.diterima, ['S2', 'S1'], 'slot kembar dirapatkan, urutan kiriman dipertahankan');
eq(putuskanSlot(masukan({ diminta: [] })).diterima, [], 'kiriman kosong → tak ada yang diterima');

// Kasus 50-dari-91: seluruh isian lama terkunci, pengajar hanya menyegarkan.
const semuaLamaTerkunci = putuskanSlot(
  masukan({
    diminta: ['S1', 'S2', 'S3'],
    tersimpanSebelumnya: ['S1', 'S2', 'S3'],
    terkunci: ['S1', 'S2', 'S3'],
  })
);
eq(semuaLamaTerkunci.diterima, ['S1', 'S2', 'S3'], 'kirim ulang isian lama tidak pernah gagal');
eq(semuaLamaTerkunci.ditolakBentrok, [], 'tidak ada penolakan pada kirim ulang');

// ── kunciSlot & alasanTerkunci (fungsi nyata, tak diubah) ──────────────────
console.log('\n# kunciSlot & alasanTerkunci');

const slot = (
  id: string,
  hari: KsHariIdx[],
  mulai: string,
  selesai: string,
  label = id
) => ({
  id,
  label,
  hari_idx: hari,
  waktu_mulai: mulai,
  waktu_selesai: selesai,
});
const terpakai = (
  sumber: JadwalTerpakai['sumber'],
  nama: string,
  batch: string | null,
  hari: KsHariIdx[],
  mulai: number,
  selesai: number
): JadwalTerpakai => ({
  sumber,
  nama,
  batch,
  rentang: { hari_idx: hari, mulai, selesai },
  label: '',
  // Tanggal pertemuan terakhir menurut kaldik. null = tak diketahui, dan itu
  // sengaja: penguncian di tes ini diuji murni dari irisan hari + jam.
  selesai: null,
});

const hitsPagi = terpakai('hits', 'HITS 12', 'Juni 2026', [0, 2], 360, 450);
const kelasMaahir = terpakai('maahir', 'Takhassus A', null, [1, 3], 1200, 1290);
const usulanBaru = terpakai('usulan', 'Halaqah baru', null, [5, 6], 780, 870);

const kunci = kunciSlot(
  [
    slot('A', [0, 2], '06:00', '07:30'), // sama persis dengan hitsPagi
    slot('B', [0, 2], '07:30', '09:00'), // bersentuhan ujung — bukan bentrok
    slot('C', [1, 3], '20:10', '21:40'), // tumpang tindih kelas Maahir
    slot('D', [5, 6], '13:00', '14:30'), // tumpang tindih usulan sendiri
    slot('E', [4], '16:00', '17:30'), // bersih
  ],
  [hitsPagi, kelasMaahir, usulanBaru]
);
eq([...kunci.keys()].sort(), ['A', 'C', 'D'], 'hanya slot yang benar-benar bertabrakan terkunci');
eq(kunci.get('A')?.nama, 'HITS 12', 'penyebab kunci ikut dilaporkan');
eq(kunci.has('B'), false, 'sentuhan ujung 07:30 tidak mengunci');
eq(kunci.has('E'), false, 'slot bersih tidak terkunci');

// Slot tanpa jam terbaca tidak pernah terkunci — tak ada dasar menyatakan bentrok.
eq(
  kunciSlot([slot('X', [0, 2], 'bukan-jam', 'bukan-jam')], [hitsPagi]).size,
  0,
  'jam tak terbaca → slot tidak terkunci, bukan terkunci diam-diam'
);
eq(kunciSlot([slot('A', [0, 2], '06:00', '07:30')], []).size, 0, 'tanpa jadwal terpakai, tak ada kunci');

eq(
  alasanTerkunci(hitsPagi),
  'Terisi — Anda mengajar HITS 12 (Juni 2026) di jam ini',
  'alasan HITS menyebut nama & batch'
);
eq(
  alasanTerkunci(terpakai('hits', 'HITS 12', null, [0], 360, 450)),
  'Terisi — Anda mengajar HITS 12 di jam ini',
  'tanpa batch, tanda kurung tidak muncul'
);
eq(
  alasanTerkunci(kelasMaahir),
  'Terisi — Anda mengajar kelas Maahir Takhassus A di jam ini',
  'alasan kelas Maahir dibedakan'
);
eq(
  alasanTerkunci(usulanBaru),
  'Terisi — jam ini sedang disiapkan untuk halaqah Anda',
  'alasan usulan sendiri dibedakan'
);

// ── rentangDariSlot & bentrok ──────────────────────────────────────────────
console.log('\n# rentangDariSlot & bentrok');

eq(
  rentangDariSlot(slot('A', [0, 2], '06:00:00', '07:30:00')),
  [{ hari_idx: [0, 2], mulai: 360, selesai: 450 }],
  'kolom time Postgres terbaca'
);
eq(
  rentangDariSlot(slot('A', [0, 2], '06.00', '07.30')),
  [{ hari_idx: [0, 2], mulai: 360, selesai: 450 }],
  'ejaan titik terbaca sama'
);
eq(rentangDariSlot(slot('A', [0], '25:00', '26:00')), [], 'jam mustahil → larik kosong');
eq(rentangDariSlot(slot('A', [0], '', '')), [], 'jam kosong → larik kosong');

const rg = (h: KsHariIdx[], m: number, s: number) => ({ hari_idx: h, mulai: m, selesai: s });
eq(bentrok(rg([0, 2], 360, 450), rg([2], 420, 510)), true, 'satu hari beririsan & jam tumpang');
eq(bentrok(rg([0, 2], 360, 450), rg([1, 3], 360, 450)), false, 'jam sama tapi hari beda = aman');
eq(bentrok(rg([0], 360, 450), rg([0], 450, 540)), false, 'ujung bersentuhan bukan bentrok');
eq(bentrok(rg([0], 360, 450), rg([0], 449, 540)), true, 'lewat semenit = bentrok');
eq(bentrok(rg([], 360, 450), rg([0], 360, 450)), false, 'tanpa hari, tak ada bentrok');

// ── Slot "dua waktu" ───────────────────────────────────────────────────────
console.log('\n# slot dua waktu (jam berbeda per hari)');

// Tiga slot Al-Kautsar berbentuk "dua waktu": satu baris ks_slot memuat DUA
// jadwal berbeda, mis. "Sabtu 06:00 - 07:30 & Ahad 18:00 - 19:30 WIB", padahal
// kolom waktu_mulai/waktu_selesai hanya muat satu pasang. Jamnya karena itu
// diurai dari `label`, dan hanya dipercaya bila daftar harinya cocok dengan
// hari_idx — kalau tidak, kolomlah yang dipakai.
const labelDua = "Sabtu 06:00 - 07:30 & Ahad 18:00 - 19:30 WIB";
const slotDuaWaktu = slot('AK1', [5, 6], '06:00', '07:30', labelDua);

eq(uraikanSlot(labelDua)?.duaWaktu, true, 'teks dua rentang jam dikenali sebagai dua waktu');
eq(
  rentangDariSlot(slotDuaWaktu),
  [
    { hari_idx: [5], mulai: 360, selesai: 450 },
    { hari_idx: [6], mulai: 1080, selesai: 1170 },
  ],
  'tiap hari memakai jamnya sendiri, bukan jam pertama untuk dua-duanya'
);

// Bentrok asli pada hari kedua TERDETEKSI: pengajar mengajar Ahad 18:00-19:30.
const ahadPetang = terpakai('hits', 'HITS Ahad Petang', null, [6], 1080, 1170);
eq(kunciSlot([slotDuaWaktu], [ahadPetang]).size, 1, 'bentrok Ahad 18:00 terkunci');
eq(
  kunciSlot([slotDuaWaktu], [ahadPetang]).get('AK1')?.nama,
  'HITS Ahad Petang',
  'alasan yang ditampilkan menyebut penyebab yang benar'
);

// Bentrok PALSU tidak muncul: Ahad pagi kosong karena Ahad-nya 18:00.
const ahadPagi = terpakai('hits', 'HITS Ahad Pagi', null, [6], 360, 450);
eq(kunciSlot([slotDuaWaktu], [ahadPagi]).size, 0, 'Ahad 06:00 tidak mengunci — slot itu 18:00');

// Hari pertama tetap diperiksa dengan jamnya sendiri.
const sabtuPagi = terpakai('hits', 'HITS Sabtu Pagi', null, [5], 360, 450);
eq(kunciSlot([slotDuaWaktu], [sabtuPagi]).size, 1, 'Sabtu 06:00 tetap terkunci');
const sabtuPetang = terpakai('hits', 'HITS Sabtu Petang', null, [5], 1080, 1170);
eq(kunciSlot([slotDuaWaktu], [sabtuPetang]).size, 0, 'Sabtu 18:00 tidak mengunci — slot itu 06:00');

// Label yang harinya tidak cocok dengan hari_idx tidak dipercaya: kolom menang.
eq(
  rentangDariSlot(slot('AK2', [0, 2], '13:00', '14:30', labelDua)),
  [{ hari_idx: [0, 2], mulai: 780, selesai: 870 }],
  'label yang harinya tak cocok diabaikan, kolom yang dipakai'
);

console.log(failed === 0 ? '\nSEMUA LULUS' : `\n${failed} GAGAL`);
process.exit(failed === 0 ? 0 : 1);
