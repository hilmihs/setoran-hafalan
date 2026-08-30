import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { KsHariIdx, KsSlot } from '@/types/db';
import {
  bentrok,
  rentangDariHalaqah,
  rentangDariSlot,
  type RentangJadwal,
} from '@/lib/ketersediaan-slot';

/**
 * Deteksi tabrakan jadwal untuk satu pengajar.
 *
 * Sumbernya SENGAJA dua, bukan satu:
 *
 *  1. `hits_halaqah` aktif miliknya, LINTAS SEMUA BATCH. Delapan batch HITS
 *     berjalan bersamaan (Juni, Januari, April, Nurul Iman, Safar ×2, ABK),
 *     dan seorang pengajar lazim memegang halaqah di lebih dari satu batch.
 *
 *  2. Halaqah hasil sistem ini yang sudah dikonfirmasi/terkirim. Ini wajib:
 *     halaqah yang dibentuk di sini masuk ke CMS tilawah, tetapi TIDAK otomatis
 *     muncul di `hits_halaqah` — tabel itu diisi dari Google Sheet yang disync
 *     manual per batch. Tanpa sumber kedua, pengajar yang baru saja mendapat
 *     halaqah lewat sistem ini terlihat kosong dan akan dijatah lagi pada jam
 *     yang sama.
 */

export interface JadwalTerpakai {
  sumber: 'hits' | 'usulan';
  /** Nama halaqah, untuk menerangkan kenapa sebuah slot terkunci. */
  nama: string;
  batch: string | null;
  rentang: RentangJadwal;
  label: string;
}

interface HalaqahRow {
  id: string;
  name: string;
  jadwal_raw: string | null;
  jadwal_hari: string[] | null;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  batch?: { name: string } | null;
}

interface UsulanRow {
  id: string;
  nama_halaqah: string | null;
  slot?: {
    label: string;
    hari_idx: KsHariIdx[];
    waktu_mulai: string;
    waktu_selesai: string;
  } | null;
}

/** Semua jam yang sudah terpakai oleh seorang pengajar, siap dipakai penguncian slot. */
export async function jadwalTerpakaiPengajar(pengajarId: string): Promise<JadwalTerpakai[]> {
  const [{ data: halaqah }, { data: usulan }] = await Promise.all([
    supabaseAdmin
      .from('hits_halaqah')
      .select('id, name, jadwal_raw, jadwal_hari, waktu_mulai, waktu_selesai, batch:batch_id(name)')
      .eq('pengajar_id', pengajarId)
      .eq('active', true),
    supabaseAdmin
      .from('ks_usulan')
      .select('id, nama_halaqah, slot:slot_id(label, hari_idx, waktu_mulai, waktu_selesai)')
      .eq('pengajar_id', pengajarId)
      .in('status', ['dikonfirmasi', 'dikirim']),
  ]);

  const out: JadwalTerpakai[] = [];

  for (const h of (halaqah ?? []) as HalaqahRow[]) {
    const rentang = rentangDariHalaqah(h);
    // Halaqah tanpa jam yang dapat dibaca tidak boleh mengunci slot apa pun —
    // tak ada dasar menyatakan bentrok. Baris observasi lama seperti
    // "HITS 6 (observasi)" hanya berisi "Selasa & Jum'at" tanpa jam.
    if (!rentang) continue;
    out.push({
      sumber: 'hits',
      nama: h.name,
      batch: h.batch?.name ?? null,
      rentang,
      label: h.jadwal_raw ?? '',
    });
  }

  for (const u of (usulan ?? []) as UsulanRow[]) {
    if (!u.slot) continue;
    const rentang = rentangDariSlot(u.slot);
    if (!rentang) continue;
    out.push({
      sumber: 'usulan',
      nama: u.nama_halaqah ?? 'Halaqah baru',
      batch: null,
      rentang,
      label: u.slot.label,
    });
  }

  return out;
}

export interface SlotTerkunci {
  slot_id: string;
  /** Jadwal yang menyebabkannya terkunci — dipakai menyusun kalimat di form. */
  oleh: JadwalTerpakai;
}

/**
 * Petakan slot mana yang terkunci bagi seorang pengajar.
 * Satu slot cukup bentrok dengan satu jadwal untuk terkunci; yang dilaporkan
 * adalah tabrakan pertama, karena itu yang perlu diterangkan ke pengajar.
 */
export function kunciSlot(
  slots: readonly Pick<KsSlot, 'id' | 'hari_idx' | 'waktu_mulai' | 'waktu_selesai'>[],
  terpakai: readonly JadwalTerpakai[]
): Map<string, JadwalTerpakai> {
  const kunci = new Map<string, JadwalTerpakai>();
  for (const s of slots) {
    const rentang = rentangDariSlot(s);
    if (!rentang) continue;
    const tabrakan = terpakai.find((t) => bentrok(rentang, t.rentang));
    if (tabrakan) kunci.set(s.id, tabrakan);
  }
  return kunci;
}

/**
 * Kalimat penjelas untuk slot terkunci. Bahasa sengaja menyebut nama halaqahnya
 * supaya pengajar bisa langsung menilai apakah datanya masih benar — `hits_halaqah`
 * bisa basi karena sheet disync manual, dan `active` bahkan bisa hidup lagi
 * sendiri setelah sync bila barisnya masih tercantum di sheet.
 */
export function alasanTerkunci(t: JadwalTerpakai): string {
  const dari = t.batch ? `${t.nama} (${t.batch})` : t.nama;
  return t.sumber === 'usulan'
    ? `Terisi — halaqah baru Anda ${dari} berada di jam ini`
    : `Terisi — Anda mengajar ${dari} di jam ini`;
}
