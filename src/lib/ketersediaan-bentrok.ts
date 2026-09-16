import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { KsHariIdx, KsSlot } from '@/types/db';
import {
  bentrok,
  masihBerjalanPada,
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
 *  2. `kelas_hits` — kelas Maahir yang dipegangnya. Butir verifikasi ketiga
 *     dokumen konsep menyebutnya terpisah dari HITS: "slot tidak bentrok dengan
 *     kelas Maahir dan program wajib Maahir".
 *
 *  3. Halaqah hasil sistem ini yang sudah dikonfirmasi/terkirim. Ini wajib:
 *     halaqah yang dibentuk di sini masuk ke CMS tilawah, tetapi TIDAK otomatis
 *     muncul di `hits_halaqah` — tabel itu diisi dari Google Sheet yang disync
 *     manual per batch. Tanpa sumber ketiga, pengajar yang baru saja mendapat
 *     halaqah lewat sistem ini terlihat kosong dan akan dijatah lagi pada jam
 *     yang sama.
 */

export interface JadwalTerpakai {
  sumber: 'hits' | 'maahir' | 'usulan';
  /** Nama halaqah, untuk menerangkan kenapa sebuah slot terkunci. */
  nama: string;
  batch: string | null;
  rentang: RentangJadwal;
  label: string;
  /** Tanggal pertemuan terakhir menurut kaldik; null bila tak diketahui atau bukan halaqah HITS. */
  selesai: string | null;
}

interface HalaqahRow {
  id: string;
  name: string;
  batch_id: string | null;
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

interface KelasRow {
  id: string;
  name: string;
  jadwal_hari: string | null;
  jadwal_waktu_mulai: string | null;
  jadwal_waktu_selesai: string | null;
}

/**
 * Tanggal pertemuan terakhir tiap halaqah HITS.
 *
 * `hits_halaqah` tidak punya kolom selesai, dan `active` tidak bisa dipercaya:
 * batch Januari dan April 2026 masih `active=true` jauh setelah kelasnya
 * berakhir, dan sinkronisasi sheet menghidupkannya lagi bila dimatikan manual.
 * Kalender pendidikan justru lengkap untuk semua batch aktif (diperiksa 16 Sep
 * 2026), jadi tanggal selesai = tanggal terbesar di kaldik batch-nya, atau di
 * koreksi pertemuan halaqah itu bila lebih akhir.
 *
 * `cacheBatch` dipakai ulang oleh pemanggil yang memeriksa banyak pengajar
 * sekaligus, supaya kaldik satu batch hanya dibaca sekali.
 */
export async function tanggalSelesaiHalaqah(
  halaqah: readonly { id: string; batch_id: string | null }[],
  cacheBatch: Map<string, string | null> = new Map()
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (halaqah.length === 0) return out;

  const batchBaru = [
    ...new Set(halaqah.map((h) => h.batch_id).filter((b): b is string => Boolean(b))),
  ].filter((b) => !cacheBatch.has(b));
  if (batchBaru.length > 0) {
    const { data } = await supabaseAdmin
      .from('hits_kaldik_hari')
      .select('batch_id, tanggal')
      .in('batch_id', batchBaru);
    for (const b of batchBaru) cacheBatch.set(b, null);
    for (const r of (data ?? []) as { batch_id: string; tanggal: string }[]) {
      const lama = cacheBatch.get(r.batch_id);
      if (!lama || r.tanggal > lama) cacheBatch.set(r.batch_id, r.tanggal);
    }
  }

  const { data: koreksi } = await supabaseAdmin
    .from('hits_kaldik_pertemuan')
    .select('halaqah_id, tanggal')
    .in(
      'halaqah_id',
      halaqah.map((h) => h.id)
    );
  const koreksiTerakhir = new Map<string, string>();
  for (const r of (koreksi ?? []) as { halaqah_id: string; tanggal: string }[]) {
    const lama = koreksiTerakhir.get(r.halaqah_id);
    if (!lama || r.tanggal > lama) koreksiTerakhir.set(r.halaqah_id, r.tanggal);
  }

  for (const h of halaqah) {
    const kandidat = [
      h.batch_id ? (cacheBatch.get(h.batch_id) ?? null) : null,
      koreksiTerakhir.get(h.id) ?? null,
    ].filter((x): x is string => Boolean(x));
    out.set(h.id, kandidat.sort().pop() ?? null);
  }
  return out;
}

/** Semua jam yang sudah terpakai oleh seorang pengajar, siap dipakai penguncian slot. */
export async function jadwalTerpakaiPengajar(
  pengajarId: string,
  opts: {
    /**
     * Tanggal mulai KBM periode yang sedang diisi (YYYY-MM-DD). Halaqah HITS yang
     * pertemuan terakhirnya lebih awal dari tanggal ini tidak mengunci apa pun.
     * Tanpa acuan, perilaku lama: setiap halaqah aktif mengunci.
     */
    acuan?: string | null;
    cacheSelesaiBatch?: Map<string, string | null>;
  } = {}
): Promise<JadwalTerpakai[]> {
  const [{ data: halaqah }, { data: kelas }, { data: usulan }] = await Promise.all([
    supabaseAdmin
      .from('hits_halaqah')
      .select('id, name, batch_id, jadwal_raw, jadwal_hari, waktu_mulai, waktu_selesai, batch:batch_id(name)')
      .eq('pengajar_id', pengajarId)
      .eq('active', true),
    supabaseAdmin
      .from('kelas_hits')
      .select('id, name, jadwal_hari, jadwal_waktu_mulai, jadwal_waktu_selesai')
      .eq('pengajar_id', pengajarId),
    supabaseAdmin
      .from('ks_usulan')
      .select('id, nama_halaqah, slot:slot_id(label, hari_idx, waktu_mulai, waktu_selesai)')
      .eq('pengajar_id', pengajarId)
      .in('status', ['dikonfirmasi', 'dikirim']),
  ]);

  const out: JadwalTerpakai[] = [];

  const halaqahRows = (halaqah ?? []) as HalaqahRow[];
  const selesai = opts.acuan
    ? await tanggalSelesaiHalaqah(halaqahRows, opts.cacheSelesaiBatch)
    : new Map<string, string | null>();

  for (const h of halaqahRows) {
    const rentang = rentangDariHalaqah(h);
    // Halaqah tanpa jam yang dapat dibaca tidak boleh mengunci slot apa pun —
    // tak ada dasar menyatakan bentrok. Baris observasi lama seperti
    // "HITS 6 (observasi)" hanya berisi "Selasa & Jum'at" tanpa jam.
    if (!rentang) continue;
    const tanggalSelesai = selesai.get(h.id) ?? null;
    if (opts.acuan && !masihBerjalanPada(tanggalSelesai, opts.acuan)) continue;
    out.push({
      sumber: 'hits',
      nama: h.name,
      batch: h.batch?.name ?? null,
      rentang,
      label: h.jadwal_raw ?? '',
      selesai: tanggalSelesai,
    });
  }

  for (const k of (kelas ?? []) as KelasRow[]) {
    // kelas_hits menyimpan hari sebagai satu teks ("Senin, Rabu"), bukan larik.
    const rentang = rentangDariHalaqah({
      jadwal_hari: k.jadwal_hari ? k.jadwal_hari.split(/[&,/]|\bdan\b/i) : null,
      waktu_mulai: k.jadwal_waktu_mulai,
      waktu_selesai: k.jadwal_waktu_selesai,
      jadwal_raw: k.jadwal_hari,
    });
    if (!rentang) continue;
    out.push({
      sumber: 'maahir',
      nama: k.name,
      batch: null,
      rentang,
      label: `${k.jadwal_hari ?? ''} ${(k.jadwal_waktu_mulai ?? '').slice(0, 5)}-${(k.jadwal_waktu_selesai ?? '').slice(0, 5)}`.trim(),
      selesai: null,
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
      selesai: null,
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
  if (t.sumber === 'usulan') return `Terisi — halaqah baru Anda ${dari} berada di jam ini`;
  if (t.sumber === 'maahir') return `Terisi — Anda mengajar kelas Maahir ${dari} di jam ini`;
  return `Terisi — Anda mengajar ${dari} di jam ini`;
}
