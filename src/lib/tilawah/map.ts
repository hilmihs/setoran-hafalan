import type { KsHariIdx, KsSlot } from '@/types/db';
import { hariKeIdxSet, timeKeMenit, uraikanSlot } from '@/lib/ketersediaan-slot';
import type { TilawahDay, TilawahLevel, TilawahSession } from './types';

/**
 * Usulan pemetaan slot maahir → nomor master CMS tilawah.
 *
 * CMS tidak menerima teks jadwal; ia hanya menerima `day_id`, `session_id`, dan
 * `level_id`. Nomor-nomor itu TIDAK boleh ditebak buta:
 *
 *  · daftar days/sessions di-scope per program, jadi nomor yang benar pada satu
 *    program bisa salah pada program lain;
 *  · ada baris yang dipakai halaqah tetapi tidak muncul di daftar master —
 *    halaqah Nurul Iman memakai day_id 12 dan session_id 14;
 *  · sebagian baris `days` punya `int_days` pincang. Probe staging menemukan
 *    id 3 "Selasa, Jum'at" berisi [1] saja dan id 4 "Sabtu, Ahad" berisi [5]
 *    saja. Namanya terlihat benar, isinya tidak. Mencocokkan lewat nama akan
 *    memilih baris rusak; mencocokkan lewat int_days akan melewatkannya —
 *    dua-duanya diam-diam salah.
 *
 * Karena itu modul ini hanya MENGUSULKAN, lengkap dengan alasan dan peringatan.
 * Pengesahan ada di tangan koordinator, dan slot tanpa pemetaan sah membuat
 * halaqahnya ditahan alih-alih dikirim.
 */

export type Keyakinan = 'pasti' | 'ragu' | 'tidak_ada';

export interface UsulanHari {
  day_id: number | null;
  nama: string | null;
  keyakinan: Keyakinan;
  /** Kenapa usulan ini muncul / kenapa tidak ada. Ditampilkan apa adanya ke koordinator. */
  alasan: string;
  /** Kandidat lain yang juga mungkin, supaya koordinator bisa memilih. */
  kandidat: { day_id: number; nama: string; int_days: number[] }[];
}

export interface UsulanSesi {
  session_id: number | null;
  nama: string | null;
  keyakinan: Keyakinan;
  alasan: string;
  kandidat: { session_id: number; nama: string; jam: string }[];
}

function samaSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** Hari yang tersirat dari NAMA baris master, terlepas dari int_days-nya. */
function hariDariNama(nama: string): KsHariIdx[] {
  return hariKeIdxSet(nama.split(/[&,/]|\bdan\b|\s-\s/i));
}

/**
 * Baris master yang `int_days`-nya tidak sesuai namanya. Ini bukan sekadar
 * kejanggalan data: memilih baris seperti ini membuat halaqah terjadwal pada
 * hari yang lebih sedikit daripada yang dimaksud, dan baru ketahuan setelah
 * murid mengeluh kelas tidak ada.
 */
export function hariTidakKonsisten(d: TilawahDay): boolean {
  const dariNama = hariDariNama(d.name);
  if (dariNama.length === 0) return false;
  return !samaSet(dariNama, d.int_days);
}

export function usulkanHari(slot: Pick<KsSlot, 'hari_idx' | 'label'>, days: readonly TilawahDay[]): UsulanHari {
  const aktif = days.filter((d) => d.status === 1);

  const cocokIsi = aktif.filter((d) => samaSet(d.int_days, slot.hari_idx));
  const kandidat = aktif
    .filter((d) => cocokIsi.includes(d) || samaSet(hariDariNama(d.name), slot.hari_idx))
    .map((d) => ({ day_id: d.id, nama: d.name, int_days: d.int_days }));

  if (cocokIsi.length === 1) {
    const d = cocokIsi[0];
    const rusak = hariTidakKonsisten(d);
    return {
      day_id: d.id,
      nama: d.name,
      keyakinan: rusak ? 'ragu' : 'pasti',
      alasan: rusak
        ? `int_days cocok, tapi nama "${d.name}" menyebut hari yang berbeda — periksa manual`
        : `int_days ${JSON.stringify(d.int_days)} sama persis dengan slot`,
      kandidat,
    };
  }

  if (cocokIsi.length > 1) {
    return {
      day_id: null,
      nama: null,
      keyakinan: 'ragu',
      alasan: `${cocokIsi.length} baris master punya int_days sama — pilih sendiri`,
      kandidat,
    };
  }

  // Tidak ada yang cocok lewat int_days. Coba lewat nama, tetapi jangan pernah
  // dianggap pasti: baris yang namanya benar justru yang int_days-nya pincang.
  const lewatNama = aktif.filter((d) => samaSet(hariDariNama(d.name), slot.hari_idx));
  if (lewatNama.length === 1) {
    const d = lewatNama[0];
    return {
      day_id: d.id,
      nama: d.name,
      keyakinan: 'ragu',
      alasan: `hanya cocok lewat nama; int_days-nya ${JSON.stringify(d.int_days)} tidak lengkap`,
      kandidat,
    };
  }

  return {
    day_id: null,
    nama: null,
    keyakinan: 'tidak_ada',
    alasan: `tidak ada baris master untuk ${slot.label} — buat dulu di CMS tilawah`,
    kandidat: aktif.map((d) => ({ day_id: d.id, nama: d.name, int_days: d.int_days })),
  };
}

export function usulkanSesi(
  slot: Pick<KsSlot, 'waktu_mulai' | 'waktu_selesai' | 'label'>,
  sessions: readonly TilawahSession[]
): UsulanSesi {
  const mulai = timeKeMenit(slot.waktu_mulai);
  const selesai = timeKeMenit(slot.waktu_selesai);
  const aktif = sessions.filter((s) => s.status === 1);
  const semua = aktif.map((s) => ({
    session_id: s.id,
    nama: s.name,
    jam: `${(s.start_hour ?? '').slice(0, 5)} - ${(s.end_hour ?? '').slice(0, 5)}`,
  }));

  if (mulai === null || selesai === null) {
    return { session_id: null, nama: null, keyakinan: 'tidak_ada', alasan: 'jam slot tidak terbaca', kandidat: semua };
  }

  // Kelas dua waktu tidak punya satu sesi yang benar. Jam sebenarnya tetap
  // terkirim per pertemuan, jadi halaqahnya cukup memakai sesi penampung.
  if (uraikanSlot(slot.label)?.duaWaktu) {
    return {
      session_id: null,
      nama: null,
      keyakinan: 'tidak_ada',
      alasan: 'kelas dua waktu — pilih sesi penampung (mis. 00:00 - 00:00); jam tiap hari ikut terkirim di setiap pertemuan',
      kandidat: semua,
    };
  }

  const cocok = aktif.filter(
    (s) => timeKeMenit(s.start_hour) === mulai && timeKeMenit(s.end_hour) === selesai
  );

  if (cocok.length === 1) {
    return {
      session_id: cocok[0].id,
      nama: cocok[0].name,
      keyakinan: 'pasti',
      alasan: 'jam mulai & selesai sama persis',
      kandidat: semua,
    };
  }
  if (cocok.length > 1) {
    return {
      session_id: null,
      nama: null,
      keyakinan: 'ragu',
      alasan: `${cocok.length} sesi punya jam sama — pilih sendiri`,
      kandidat: cocok.map((s) => ({
        session_id: s.id,
        nama: s.name,
        jam: `${s.start_hour.slice(0, 5)} - ${s.end_hour.slice(0, 5)}`,
      })),
    };
  }

  // Sengaja TIDAK mencari "yang paling mendekati". Banyak halaqah memakai sesi
  // placeholder 00:00-00:00 dengan jam sebenarnya disimpan per pertemuan, jadi
  // sesi terdekat sering justru sesi yang tidak berarti apa-apa.
  return {
    session_id: null,
    nama: null,
    keyakinan: 'tidak_ada',
    alasan: `tidak ada sesi ${slot.waktu_mulai.slice(0, 5)}–${slot.waktu_selesai.slice(0, 5)} di master — buat dulu di CMS tilawah`,
    kandidat: semua,
  };
}

export function usulkanLevel(
  levelNama: string,
  levels: readonly TilawahLevel[]
): { level_id: number | null; nama: string | null; keyakinan: Keyakinan; alasan: string } {
  const bersih = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const target = bersih(levelNama);
  const aktif = levels.filter((l) => l.status === 1);

  const persis = aktif.filter((l) => bersih(l.name) === target);
  if (persis.length === 1) {
    return { level_id: persis[0].id, nama: persis[0].name, keyakinan: 'pasti', alasan: 'nama level sama persis' };
  }
  if (persis.length > 1) {
    return { level_id: null, nama: null, keyakinan: 'ragu', alasan: `${persis.length} level bernama sama`, };
  }
  const sebagian = aktif.filter((l) => bersih(l.name).includes(target) || target.includes(bersih(l.name)));
  if (sebagian.length === 1) {
    return {
      level_id: sebagian[0].id,
      nama: sebagian[0].name,
      keyakinan: 'ragu',
      alasan: `hanya mirip: "${sebagian[0].name}" vs "${levelNama}"`,
    };
  }
  return { level_id: null, nama: null, keyakinan: 'tidak_ada', alasan: `level "${levelNama}" tidak ada di CMS tilawah` };
}
