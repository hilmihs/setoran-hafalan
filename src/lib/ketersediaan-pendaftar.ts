import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseCsv } from '@/lib/csv';
import type {
  Gender,
  KsPemetaanKolom,
  KsPendaftarSumber,
  KsPeriode,
  KsPitaUmur,
  KsSlot,
} from '@/types/db';
import { hitungUmur, pitaUmur, uraikanSlot } from '@/lib/ketersediaan-slot';

/**
 * Tarik responses Google Form pendaftaran murid sebagai CSV publish-to-web.
 *
 * Pola yang sama dengan hits-sheets.ts: tanpa service account, tanpa OAuth.
 * Sheet tetap sumber kebenaran — tarikan berulang memperbarui baris yang sudah
 * ada, tidak menggandakannya.
 *
 * Pendaftaran TIDAK pernah ditutup per slot. Slot yang penuh tetap menerima,
 * dan kelebihannya menjadi antrean. Antrean itulah sinyal "slot ini butuh
 * pengajar", bukan kegagalan yang harus disembunyikan.
 */

export interface HasilTarik {
  dibaca: number;
  baru: number;
  diperbarui: number;
  valid: number;
  ditahan: number;
  /** Baris yang bahkan tidak punya kunci — tidak bisa disimpan sama sekali. */
  dilewati: number;
  peringatan: string[];
}

/** Kolom CSV yang lazim muncul, dipakai menebak pemetaan awal. */
const TEBAKAN_KOLOM: Record<keyof KsPemetaanKolom, RegExp[]> = {
  nama: [/nama\s*lengkap/i, /^nama/i, /full\s*name/i],
  // Judul kolom sungguhan bertele-tele dan tidak selalu memuat kata "usia" di
  // depan: "Tuliskan Usia Anda (Usia Minimum 15 tahun)".
  umur: [/\busia\b/i, /\bumur\b/i, /\bage\b/i],
  rekaman: [/rekam\s*suara/i, /voice\s*recorder/i, /\brekaman\b/i],
  wa: [/whatsapp/i, /\bwa\b/i, /no.*(hp|telepon|telp)/i, /phone/i],
  tanggal_lahir: [/tanggal\s*lahir/i, /tgl\s*lahir/i, /birth/i],
  gender: [/jenis\s*kelamin/i, /gender/i, /ikhwan|akhwat/i],
  level: [/level/i, /program/i, /dasar|lanjutan/i],
  // "Pilihan Jam Belajar" adalah judul yang dipakai form pendaftaran nyata —
  // tidak memuat kata "slot" maupun "jadwal" sama sekali.
  slot: [/jam\s*belajar/i, /pilihan\s*jam/i, /slot/i, /jadwal/i, /pilihan\s*kelas/i, /waktu/i],
  timestamp: [/timestamp/i, /waktu\s*(kirim|isi)/i, /^stempel/i],
};
/**
 * Tebak pemetaan kolom dari baris kepala. Hanya usulan — koordinator yang
 * mengesahkan lewat layar pemetaan, karena bentuk Google Form bisa berubah
 * kapan saja dan salah kolom berarti salah seluruh data.
 */
export function tebakPemetaan(kepala: readonly string[]): KsPemetaanKolom {
  const out: KsPemetaanKolom = {};
  for (const [kunci, pola] of Object.entries(TEBAKAN_KOLOM) as [
    keyof KsPemetaanKolom,
    RegExp[],
  ][]) {
    const ketemu = kepala.find((h) => pola.some((p) => p.test(h)));
    if (ketemu) out[kunci] = ketemu;
  }
  return out;
}

/**
 * Normalisasi nomor WhatsApp ke bentuk tanpa kode negara dan tanpa nol depan —
 * sama dengan yang dipakai berkas Jadwal KBM ("85278171545").
 * Mengembalikan null bila jelas bukan nomor.
 */
export function normalWa(mentah: string | null | undefined): string | null {
  if (!mentah) return null;
  let d = String(mentah).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('62')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length < 9 || d.length > 14) return null;
  return d;
}

export type FormatTanggal = 'dmy' | 'mdy';

/**
 * Tebak format tanggal bergaris-miring dari SELURUH kolom, bukan per baris.
 *
 * Google Form mengikuti locale pemilik berkas: sheet pendaftaran HITS memakai
 * M/D/YYYY ("12/23/1999"), sementara kebiasaan Indonesia D/M/YYYY. Menebak per
 * baris mustahil — "5/6/2003" sah di kedua bacaan. Yang menentukan adalah baris
 * lain di kolom yang sama: bila ada bagian pertama > 12, kolomnya D/M; bila ada
 * bagian kedua > 12, kolomnya M/D.
 *
 * Bila kolomnya tidak menentukan apa-apa, jatuh ke D/M — kebiasaan setempat.
 */
export function deteksiFormatTanggal(nilai: readonly (string | null | undefined)[]): FormatTanggal {
  let pertamaLebih12 = false;
  let keduaLebih12 = false;
  for (const v of nilai) {
    const m = String(v ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) pertamaLebih12 = true;
    if (Number(m[2]) > 12) keduaLebih12 = true;
  }
  if (keduaLebih12 && !pertamaLebih12) return 'mdy';
  return 'dmy';
}

/** Tanggal dari bentuk yang lazim keluar Google Form. */
export function bacaTanggal(
  mentah: string | null | undefined,
  format: FormatTanggal = 'dmy'
): string | null {
  if (!mentah) return null;
  const t = mentah.trim();
  if (!t) return null;

  // 2001-05-17
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // 17/05/2001 atau 12/23/1999 — urutannya ditentukan format kolom.
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const hari = format === 'mdy' ? b : a;
    const bulan = format === 'mdy' ? a : b;
    if (hari < 1 || hari > 31 || bulan < 1 || bulan > 12) return null;
    return `${m[3]}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
  }
  return null;
}

function bacaWaktu(
  mentah: string | null | undefined,
  format: FormatTanggal = 'dmy'
): string | null {
  if (!mentah) return null;
  const t = mentah.trim();
  if (!t) return null;
  // Google Form Indonesia: "30/08/2026 14.05.12"
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
  if (m) {
    const [, a, b2, th, jj, mm, dd] = m;
    const d = format === 'mdy' ? b2 : a;
    const bl = format === 'mdy' ? a : b2;
    const iso = `${th}-${bl.padStart(2, '0')}-${d.padStart(2, '0')}T${jj.padStart(2, '0')}:${mm}:${dd ?? '00'}+07:00`;
    const t2 = new Date(iso);
    if (!Number.isNaN(t2.getTime())) return t2.toISOString();
  }
  const langsung = new Date(t);
  return Number.isNaN(langsung.getTime()) ? null : langsung.toISOString();
}

function bacaGender(mentah: string | null | undefined): Gender | null {
  if (!mentah) return null;
  const t = mentah.toLowerCase();
  if (/ikhwan|laki|pria|putra|male/.test(t)) return 'ikhwan';
  if (/akhwat|perempuan|wanita|putri|female/.test(t)) return 'akhwat';
  return null;
}

/** Samakan sebutan level ke dua bentuk yang dikenal CMS tilawah. */
export function bacaLevel(mentah: string | null | undefined): string | null {
  if (!mentah) return null;
  const t = mentah.toLowerCase();
  if (/lanjut|alumni/.test(t)) return 'HITS Lanjutan';
  if (/dasar|pemula|baru/.test(t)) return 'HITS Dasar';
  return null;
}

export interface BarisMentah {
  nama: string;
  wa: string | null;
  tanggal_lahir: string | null;
  /** Usia dari kolom tersendiri; dipakai bila tanggal lahir tak terbaca. */
  umur_isian: number | null;
  gender: Gender | null;
  level: string | null;
  slot_label_raw: string | null;
  rekaman_url: string | null;
  didaftar_pada: string | null;
  kunci: string;
}

/** Ubah CSV menjadi baris mentah memakai pemetaan kolom yang berlaku. */
export function bacaCsv(csv: string, petakan: KsPemetaanKolom): { baris: BarisMentah[]; kepala: string[] } {
  const tabel = parseCsv(csv);
  if (tabel.length === 0) return { baris: [], kepala: [] };
  const kepala = tabel[0].map((h) => h.trim());
  const idx = (nama: string | undefined) => (nama ? kepala.indexOf(nama) : -1);

  const iNama = idx(petakan.nama);
  const iWa = idx(petakan.wa);
  const iLahir = idx(petakan.tanggal_lahir);
  const iGender = idx(petakan.gender);
  const iLevel = idx(petakan.level);
  const iSlot = idx(petakan.slot);
  const iWaktu = idx(petakan.timestamp);
  const iUmur = idx(petakan.umur);
  const iRekaman = idx(petakan.rekaman);

  const ambil = (baris: string[], i: number) => (i >= 0 ? (baris[i] ?? '').trim() : '');

  // Format tanggal ditentukan dari seluruh kolom sekaligus, bukan per baris:
  // "5/6/2003" sah dibaca dua arah, dan hanya baris lain yang bisa memutuskannya.
  const formatLahir = deteksiFormatTanggal(
    iLahir >= 0 ? tabel.slice(1).map((b) => b[iLahir]) : []
  );
  const formatWaktu = deteksiFormatTanggal(
    iWaktu >= 0 ? tabel.slice(1).map((b) => b[iWaktu]) : []
  );

  const baris: BarisMentah[] = [];
  for (let r = 1; r < tabel.length; r++) {
    const b = tabel[r];
    if (!b || b.every((sel) => !sel || !sel.trim())) continue;

    const wa = ambil(b, iWa);
    const waktu = ambil(b, iWaktu);
    const nama = ambil(b, iNama);
    // Kunci baris: timestamp + WA. Bila keduanya kosong, jatuh ke seluruh isi
    // baris — supaya baris rusak pun tetap punya identitas yang stabil dan
    // muncul di layar koordinator, bukan hilang diam-diam tiap tarikan.
    const bahan = waktu || wa ? `${waktu}|${wa}` : b.join('|');
    const kunci = createHash('sha1').update(bahan).digest('hex').slice(0, 32);

    baris.push({
      nama,
      wa: wa || null,
      tanggal_lahir: bacaTanggal(ambil(b, iLahir), formatLahir),
      umur_isian: (() => {
        const t = ambil(b, iUmur).replace(/\D/g, '');
        const n = t ? Number(t) : NaN;
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      gender: bacaGender(ambil(b, iGender)),
      level: bacaLevel(ambil(b, iLevel)),
      slot_label_raw: ambil(b, iSlot) || null,
      rekaman_url: ambil(b, iRekaman) || null,
      didaftar_pada: bacaWaktu(waktu, formatWaktu),
      kunci,
    });
  }
  return { baris, kepala };
}

export interface BarisSiap {
  sumber_row_key: string;
  nama: string;
  wa: string | null;
  wa_normal: string | null;
  tanggal_lahir: string | null;
  umur: number | null;
  pita_umur: KsPitaUmur | null;
  gender: Gender | null;
  level_pilihan: string | null;
  slot_label_raw: string | null;
  slot_id: string | null;
  rekaman_url: string | null;
  didaftar_pada: string | null;
  status: 'valid' | 'ditahan';
  alasan_ditahan: string[];
}

/**
 * Saringan mutu data.
 *
 * MENAHAN, bukan membuang: baris bermasalah tetap tersimpan dan tampil di layar
 * koordinator lengkap dengan alasannya, hanya tidak ikut dihitung sampai
 * dibereskan. Ini penting karena nomor WA menjadi email palsu akun murid di CMS
 * tilawah — satu nomor kotor merusak akun yang dibuat atas nama orang itu.
 */
export function saring(
  baris: readonly BarisMentah[],
  slots: readonly KsSlot[],
  sekarang: Date
): BarisSiap[] {
  const slotAktif = slots.filter((s) => s.aktif);
  const perLabel = new Map<string, KsSlot[]>();
  for (const s of slotAktif) {
    const u = uraikanSlot(s.label);
    const k = u ? `${u.hari_idx.join(',')}|${u.waktu_mulai}` : s.label.toLowerCase();
    if (!perLabel.has(k)) perLabel.set(k, []);
    perLabel.get(k)!.push(s);
  }

  // Nomor ganda ditentukan atas seluruh tarikan, bukan per baris.
  const hitungWa = new Map<string, number>();
  for (const b of baris) {
    const n = normalWa(b.wa);
    if (n) hitungWa.set(n, (hitungWa.get(n) ?? 0) + 1);
  }

  const out: BarisSiap[] = [];
  for (const b of baris) {
    const alasan: string[] = [];

    const wa = normalWa(b.wa);
    if (!wa) alasan.push('Nomor WhatsApp kosong atau tidak sah');
    else if ((hitungWa.get(wa) ?? 0) > 1) alasan.push('Nomor WhatsApp dipakai lebih dari satu pendaftar');

    const nama = b.nama.trim();
    if (!nama) alasan.push('Nama kosong');
    else if (nama.replace(/[^a-zA-Z]/g, '').length <= 2) alasan.push('Nama terlalu pendek atau bukan huruf');
    else if (/^\d+$/.test(nama)) alasan.push('Nama berisi angka semua');

    // Tanggal lahir sering kosong (pada data nyata hanya 616 dari 1341 baris),
    // sementara kolom usia hampir selalu terisi. Jadi tanggal lahir dipakai bila
    // ada — lebih tepat — dan usia isian menjadi penggantinya, bukan penolakan.
    let umur: number | null = null;
    let pita: KsPitaUmur | null = null;
    if (b.tanggal_lahir) umur = hitungUmur(b.tanggal_lahir, sekarang);
    if (umur === null) umur = b.umur_isian;

    if (umur === null) alasan.push('Umur tidak diketahui — tanggal lahir dan kolom usia sama-sama kosong');
    else if (umur < 5 || umur > 90) alasan.push(`Umur ${umur} tahun di luar batas wajar`);
    else pita = pitaUmur(umur);

    // Slot dicocokkan lewat bentuk kanonik, bukan teks: pilihan di Google Form
    // sering ditulis dengan ejaan yang berbeda dari master.
    let slotId: string | null = null;
    if (b.slot_label_raw === 'This choice no longer accepts responses') {
      // Kuota pilihan di Google Form habis saat baris ini dikirim. Bukan salah
      // ketik dan bukan slot hilang — alasannya harus berbeda supaya koordinator
      // tidak mencari-cari kesalahan yang tidak ada.
      alasan.push('Pilihan jam sudah penuh di form saat pendaftar mengirim');
    } else if (b.slot_label_raw) {
      const u = uraikanSlot(b.slot_label_raw);
      const kandidat = u ? (perLabel.get(`${u.hari_idx.join(',')}|${u.waktu_mulai}`) ?? []) : [];
      // Mode ikut menyaring bila teks pilihannya menyebutkannya. Tanpa ini
      // pendaftar "Offline … Selasa & Kamis 16.00" mendarat di slot ONLINE
      // berjam sama — kelasnya benar jamnya, salah tempatnya.
      const cocokMode = u?.mode ? kandidat.filter((s) => s.mode === u.mode) : kandidat;
      const cocokGender = b.gender ? cocokMode.filter((s) => s.kelompok === b.gender) : cocokMode;
      const dipakai = cocokGender.length > 0 ? cocokGender : cocokMode;
      if (dipakai.length === 1) slotId = dipakai[0].id;
      else if (dipakai.length > 1) alasan.push('Slot cocok ke lebih dari satu baris master');
      else if (!u) alasan.push(`Pilihan jam tidak dapat diurai: "${b.slot_label_raw}"`);
      else alasan.push('Slot tidak ada di master atau sudah dinonaktifkan');
    } else {
      alasan.push('Slot tidak diisi');
    }

    out.push({
      sumber_row_key: b.kunci,
      nama,
      wa: b.wa,
      wa_normal: wa,
      tanggal_lahir: b.tanggal_lahir,
      umur,
      pita_umur: pita,
      gender: b.gender,
      level_pilihan: b.level,
      slot_label_raw: b.slot_label_raw,
      slot_id: slotId,
      rekaman_url: b.rekaman_url,
      didaftar_pada: b.didaftar_pada,
      status: alasan.length === 0 ? 'valid' : 'ditahan',
      alasan_ditahan: alasan,
    });
  }
  return out;
}

/**
 * Tarik satu sumber dan simpan hasilnya.
 *
 * Baris yang sudah berstatus `dialokasikan` TIDAK diturunkan lagi menjadi
 * valid/ditahan: begitu seseorang masuk usulan halaqah, perubahan di sheet tidak
 * boleh mencabutnya diam-diam. Perubahan seperti itu harus lewat koordinator.
 */
export async function tarikSumber(
  sumber: KsPendaftarSumber,
  periode: KsPeriode,
  slots: readonly KsSlot[],
  sekarang: Date
): Promise<HasilTarik> {
  const hasil: HasilTarik = {
    dibaca: 0,
    baru: 0,
    diperbarui: 0,
    valid: 0,
    ditahan: 0,
    dilewati: 0,
    peringatan: [],
  };

  const res = await fetch(sumber.csv_url, { cache: 'no-store', redirect: 'follow' });
  if (!res.ok) throw new Error(`Gagal menarik CSV (HTTP ${res.status}). Pastikan sheet "Publish to web".`);
  const teks = await res.text();
  if (teks.startsWith('<!DOCTYPE html') || teks.includes('<html')) {
    throw new Error('Sheet mengembalikan HTML — kemungkinan belum dipublikasikan ke web.');
  }

  const { baris, kepala } = bacaCsv(teks, sumber.pemetaan_kolom);
  hasil.dibaca = baris.length;
  if (Object.keys(sumber.pemetaan_kolom).length === 0) {
    hasil.peringatan.push(
      `Pemetaan kolom belum diisi. Kolom terbaca: ${kepala.slice(0, 12).join(' | ')}`
    );
    return hasil;
  }

  const siap = saring(baris, slots, sekarang);

  const { data: adaRows } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id, sumber_row_key, status')
    .eq('periode_id', periode.id);
  const ada = new Map(
    ((adaRows ?? []) as { id: string; sumber_row_key: string; status: string }[]).map((r) => [
      r.sumber_row_key,
      r,
    ])
  );

  const stempel = sekarang.toISOString();
  for (const b of siap) {
    if (b.status === 'valid') hasil.valid++;
    else hasil.ditahan++;

    const lama = ada.get(b.sumber_row_key);
    if (lama) {
      const beku = lama.status === 'dialokasikan' || lama.status === 'batal';
      await supabaseAdmin
        .from('ks_pendaftar')
        .update({
          nama: b.nama,
          wa: b.wa,
          wa_normal: b.wa_normal,
          tanggal_lahir: b.tanggal_lahir,
          umur: b.umur,
          pita_umur: b.pita_umur,
          gender: b.gender,
          level_pilihan: b.level_pilihan,
          slot_label_raw: b.slot_label_raw,
          slot_id: b.slot_id,
          rekaman_url: b.rekaman_url,
          didaftar_pada: b.didaftar_pada,
          ...(beku ? {} : { status: b.status, alasan_ditahan: b.alasan_ditahan }),
          ditarik_pada: stempel,
          updated_at: stempel,
        })
        .eq('id', lama.id);
      hasil.diperbarui++;
    } else {
      await supabaseAdmin.from('ks_pendaftar').insert({
        periode_id: periode.id,
        sumber_id: sumber.id,
        sumber_row_key: b.sumber_row_key,
        nama: b.nama,
        wa: b.wa,
        wa_normal: b.wa_normal,
        tanggal_lahir: b.tanggal_lahir,
        umur: b.umur,
        pita_umur: b.pita_umur,
        gender: b.gender,
        level_pilihan: b.level_pilihan,
        slot_label_raw: b.slot_label_raw,
        slot_id: b.slot_id,
        rekaman_url: b.rekaman_url,
        didaftar_pada: b.didaftar_pada,
        status: b.status,
        alasan_ditahan: b.alasan_ditahan,
        ditarik_pada: stempel,
      });
      hasil.baru++;
    }
  }

  await supabaseAdmin
    .from('ks_pendaftar_sumber')
    .update({
      terakhir_tarik: stempel,
      terakhir_status: 'ok',
      terakhir_pesan: `${hasil.baru} baru, ${hasil.diperbarui} diperbarui, ${hasil.ditahan} ditahan`,
      updated_at: stempel,
    })
    .eq('id', sumber.id);

  return hasil;
}
