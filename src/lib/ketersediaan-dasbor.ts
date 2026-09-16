import type { Gender, KsHariIdx, KsMode, KsSlot } from '@/types/db';
import type { RingkasSlot } from '@/lib/ketersediaan-permintaan';

/**
 * Hitungan dashboard koordinator ketersediaan — murni, tanpa basis data.
 * Komponen hanya menampilkan; semua angka lahir di sini supaya bisa diuji.
 */

export type StatusJam = 'tanpa_pengajar' | 'kurang' | 'cukup' | 'kosong';

export interface BarisJam {
  slot_id: string;
  kelompok: Gender;
  mode: KsMode;
  lokasi: string | null;
  label: string;
  /** "Senin & Rabu" */
  hari: string;
  hariIdx: KsHariIdx[];
  /** "20:00" */
  jam: string;
  antre: number;
  pengajar: number;
  /** Yang bisa ditampung pengajar bebas di jam ini, tidak lebih dari yang mengantre. */
  tampung: number;
  sisa: number;
  butuh: number;
  bisa: number;
  dialokasikan: number;
  tertahan: number;
  terpakaiLain: number;
  status: StatusJam;
}

export function susunBarisJam(
  slots: readonly KsSlot[],
  ringkas: ReadonlyMap<string, RingkasSlot>,
  kapasitas: number
): BarisJam[] {
  return slots
    .map((s): BarisJam => {
      const r = ringkas.get(s.id);
      const antre = r?.antre ?? 0;
      const pengajar = r?.pengajar_tersedia ?? 0;
      const bebas = Math.max(0, pengajar - (r?.pengajar_terpakai ?? 0));
      const tampung = Math.min(antre, bebas * kapasitas);
      const sisa = antre - tampung;
      const butuh = Math.ceil(antre / kapasitas);
      const status: StatusJam =
        antre === 0 ? 'kosong' : pengajar === 0 ? 'tanpa_pengajar' : sisa > 0 ? 'kurang' : 'cukup';
      return {
        slot_id: s.id,
        kelompok: s.kelompok,
        mode: s.mode,
        lokasi: s.lokasi,
        label: s.label,
        hari: s.hari.join(' & '),
        hariIdx: s.hari_idx,
        jam: s.waktu_mulai.slice(0, 5),
        antre,
        pengajar,
        tampung,
        sisa,
        butuh,
        bisa: Math.min(butuh, bebas),
        dialokasikan: r?.dialokasikan ?? 0,
        tertahan: r?.ditahan ?? 0,
        terpakaiLain: r?.terpakai_lain ?? 0,
        status,
      };
    })
    .sort((a, b) => b.sisa - a.sisa || b.antre - a.antre || a.label.localeCompare(b.label));
}

export interface AngkaJam {
  antre: number;
  tampung: number;
  sisa: number;
  dialokasikan: number;
  tertahan: number;
  terpakaiLain: number;
}

export function jumlahkan(baris: readonly BarisJam[]): AngkaJam {
  const out: AngkaJam = { antre: 0, tampung: 0, sisa: 0, dialokasikan: 0, tertahan: 0, terpakaiLain: 0 };
  for (const b of baris) {
    out.antre += b.antre;
    out.tampung += b.tampung;
    out.sisa += b.sisa;
    out.dialokasikan += b.dialokasikan;
    out.tertahan += b.tertahan;
    out.terpakaiLain += b.terpakaiLain;
  }
  return out;
}

export interface SelPeta {
  antre: number;
  sisa: number;
  pengajar: number;
  sisaOnline: number;
  sisaOffline: number;
  /** Berapa jam master yang jatuh di sel ini (online + offline di lokasi mana pun). */
  jumlahJam: number;
}

export interface Peta {
  hari: { kunci: string; label: string }[];
  jam: string[];
  sel: Record<string, SelPeta>;
}

export function kunciSel(kunciHari: string, jam: string): string {
  return `${kunciHari}|${jam}`;
}

/** Heatmap pasangan hari × jam mulai. Online dan offline dijumlah; tooltip memecahnya. */
export function susunPeta(baris: readonly BarisJam[]): Peta {
  const sel: Record<string, SelPeta> = {};
  const hari = new Map<string, { kunci: string; label: string; idx: readonly number[] }>();
  const jam = new Set<string>();

  for (const b of baris) {
    const kh = b.hariIdx.join(',');
    if (!hari.has(kh)) hari.set(kh, { kunci: kh, label: b.hari, idx: b.hariIdx });
    jam.add(b.jam);
    const k = kunciSel(kh, b.jam);
    const s = (sel[k] ??= { antre: 0, sisa: 0, pengajar: 0, sisaOnline: 0, sisaOffline: 0, jumlahJam: 0 });
    s.antre += b.antre;
    s.sisa += b.sisa;
    s.pengajar += b.pengajar;
    s.jumlahJam += 1;
    if (b.mode === 'online') s.sisaOnline += b.sisa;
    else s.sisaOffline += b.sisa;
  }

  const urutHari = [...hari.values()].sort((a, b) => {
    for (let i = 0; i < Math.max(a.idx.length, b.idx.length); i++) {
      const beda = (a.idx[i] ?? 9) - (b.idx[i] ?? 9);
      if (beda !== 0) return beda;
    }
    return 0;
  });

  return { hari: urutHari.map(({ kunci, label }) => ({ kunci, label })), jam: [...jam].sort(), sel };
}

/** Enam tingkat warna: 0, 1–24, 25–49, 50–99, 100–199, 200+. */
export function tingkatPeta(sisa: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (sisa <= 0) return 0;
  if (sisa < 25) return 1;
  if (sisa < 50) return 2;
  if (sisa < 100) return 3;
  if (sisa < 200) return 4;
  return 5;
}

export interface TitikArus {
  tanggal: string;
  ikhwan: number;
  akhwat: number;
}

const HARI_MS = 86_400_000;

function tanggalWib(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Pendaftar kumulatif per hari (WIB), tanpa lubang tanggal. */
export function susunArus(pendaftar: readonly { didaftar_pada: string | null; gender: Gender | null }[]): TitikArus[] {
  const harian = new Map<string, { ikhwan: number; akhwat: number }>();
  for (const p of pendaftar) {
    if (!p.didaftar_pada || !p.gender) continue;
    const t = tanggalWib(p.didaftar_pada);
    const h = harian.get(t) ?? { ikhwan: 0, akhwat: 0 };
    h[p.gender] += 1;
    harian.set(t, h);
  }
  const tanggal = [...harian.keys()].sort();
  if (tanggal.length === 0) return [];

  const out: TitikArus[] = [];
  let ikhwan = 0;
  let akhwat = 0;
  const akhir = tanggal[tanggal.length - 1];
  for (let d = new Date(`${tanggal[0]}T00:00:00Z`); d.toISOString().slice(0, 10) <= akhir; d = new Date(d.getTime() + HARI_MS)) {
    const t = d.toISOString().slice(0, 10);
    ikhwan += harian.get(t)?.ikhwan ?? 0;
    akhwat += harian.get(t)?.akhwat ?? 0;
    out.push({ tanggal: t, ikhwan, akhwat });
  }
  return out;
}

/** Tanggal antrean tertua genap `usiaMaksHari` — sejak itu sisa pita boleh digabung. */
export function tanggalBatasAntrean(pertama: string | null, usiaMaksHari: number): string | null {
  if (!pertama) return null;
  return new Date(new Date(`${pertama}T00:00:00Z`).getTime() + usiaMaksHari * HARI_MS).toISOString().slice(0, 10);
}
