// Derivasi pertemuan_no <-> tanggal untuk satu halaqah.
// Tiap pekan punya 2 pertemuan: sesi ke-1 (hari paling awal sesuai jadwal) =
// 2*pekan-1, sesi ke-2 = 2*pekan. 1 sesi = 1 pertemuan.

import { HARI_INDEX } from '@/lib/hits';
import { dayNameOf } from '@/lib/maahir-presensi';

export type KaldikHariLite = {
  tanggal: string;
  pekan: number | null;
  is_libur: boolean;
};

export type DerivedPertemuan = {
  pertemuan_no: number;
  tanggal: string;
  pekan: number;
};

/** jadwal_hari (nama) -> set index getUTCDay(). */
function hariIndexSet(jadwalHari: string[]): Set<number> {
  const s = new Set<number>();
  for (const h of jadwalHari) {
    const idx = HARI_INDEX[h];
    if (idx !== undefined) s.add(idx);
  }
  return s;
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Petakan pertemuan_no -> tanggal untuk satu halaqah.
 * @param jadwalHari nama hari sesi (mis. ['Senin','Rabu'])
 * @param kaldik     baris kaldik (batch+level) — sudah difilter ke level halaqah
 */
export function deriveHalaqahPertemuan(
  jadwalHari: string[],
  kaldik: KaldikHariLite[]
): DerivedPertemuan[] {
  const wanted = hariIndexSet(jadwalHari);
  if (wanted.size === 0) return [];

  // group by pekan
  const byPekan = new Map<number, string[]>();
  for (const row of kaldik) {
    if (row.pekan == null || row.is_libur) continue;
    if (!wanted.has(weekdayOf(row.tanggal))) continue;
    const arr = byPekan.get(row.pekan) ?? [];
    arr.push(row.tanggal);
    byPekan.set(row.pekan, arr);
  }

  const out: DerivedPertemuan[] = [];
  for (const [pekan, dates] of [...byPekan.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...new Set(dates)].sort();
    if (sorted[0]) out.push({ pertemuan_no: 2 * pekan - 1, tanggal: sorted[0], pekan });
    if (sorted[1]) out.push({ pertemuan_no: 2 * pekan, tanggal: sorted[1], pekan });
    // sesi >2 dalam sepekan diabaikan (di luar 2 pertemuan/pekan)
  }
  return out;
}

export type PertemuanOverride = {
  pertemuan_no: number;
  tanggal: string;
  pekan: number | null;
  is_skipped: boolean;
};

/**
 * Sama seperti deriveHalaqahPertemuan, tapi menerapkan override koordinator
 * (tabel hits_kaldik_pertemuan): ganti tanggal/pekan per pertemuan_no, drop
 * pertemuan yang is_skipped, dan tambahkan override manual yang tak terderivasi.
 */
export function deriveHalaqahPertemuanWithOverrides(
  jadwalHari: string[],
  kaldik: KaldikHariLite[],
  overrides: PertemuanOverride[]
): DerivedPertemuan[] {
  const base = deriveHalaqahPertemuan(jadwalHari, kaldik);
  if (overrides.length === 0) return base;

  const ovByNo = new Map<number, PertemuanOverride>();
  for (const o of overrides) ovByNo.set(o.pertemuan_no, o);

  const out: DerivedPertemuan[] = [];
  const seen = new Set<number>();
  for (const d of base) {
    seen.add(d.pertemuan_no);
    const ov = ovByNo.get(d.pertemuan_no);
    if (!ov) {
      out.push(d);
      continue;
    }
    if (ov.is_skipped) continue;
    out.push({ pertemuan_no: d.pertemuan_no, tanggal: ov.tanggal, pekan: ov.pekan ?? d.pekan });
  }
  // Override manual untuk pertemuan yang tidak diturunkan otomatis.
  for (const o of overrides) {
    if (seen.has(o.pertemuan_no) || o.is_skipped) continue;
    out.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan ?? 0 });
  }
  return out.sort((a, b) => a.pertemuan_no - b.pertemuan_no);
}

/** Map tanggal -> pertemuan_no (kebalikan, untuk lookup saat isi harian). */
export function pertemuanByDate(derived: DerivedPertemuan[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of derived) m.set(d.tanggal, d.pertemuan_no);
  return m;
}

/** Label pertemuan ringkas, mis. "Pertemuan 3 · Rabu 17 Jun". */
export function pertemuanLabel(d: DerivedPertemuan): string {
  return `Pertemuan ${d.pertemuan_no} · ${dayNameOf(d.tanggal)} ${d.tanggal}`;
}
