import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsPeriode, KsPitaUmur, KsPrioritasPreset, KsSlot } from '@/types/db';
import { listSlot } from '@/lib/ketersediaan-periode';
import { rentangDariSlot, type RentangJadwal } from '@/lib/ketersediaan-slot';
import { jadwalTerpakaiPengajar } from '@/lib/ketersediaan-bentrok';
import {
  alokasikan,
  kelompokkanPendaftar,
  type GrupUsulan,
  type PendaftarAlokasi,
  type SlotAlokasi,
} from '@/lib/ketersediaan-alokasi';
import { peringkatDari, urutanDariWaktuIsi, urutanUntuk, type Urutan } from '@/lib/ketersediaan-prioritas';
import { catatKs } from '@/lib/ketersediaan-log';

/**
 * Penghubung antara mesin alokasi yang murni dan basis data.
 *
 * Keluarannya adalah USULAN — belum halaqah. Tidak ada satu pun halaqah lahir
 * tanpa koordinator menyetujuinya, dan tidak ada pengajar dihubungi sebelum itu.
 * Ini yang membedakan "bergulir otomatis dengan persetujuan" dari "bergulir
 * penuh otomatis" yang berisiko melahirkan halaqah dari data yang belum sempat
 * dibersihkan.
 */

const STATUS_HIDUP = ['disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'];

export interface HasilJalan {
  usulanBaru: number;
  pesertaTerpakai: number;
  tanpaPengajar: number;
  putaran: number;
  perGender: Record<Gender, { usulan: number; keterangan: string }>;
}

export async function jalankanAlokasi(
  periode: KsPeriode,
  opts: {
    presetIkhwan?: KsPrioritasPreset | null;
    presetAkhwat?: KsPrioritasPreset | null;
    aktor?: { wa: string | null; nama: string | null };
    sekarang?: Date;
  } = {}
): Promise<HasilJalan> {
  const sekarang = opts.sekarang ?? new Date();
  const slots = await listSlot(periode.id, { hanyaAktif: true });

  const urutan: Record<Gender, Urutan> = {
    ikhwan: opts.presetIkhwan
      ? await urutanUntuk(opts.presetIkhwan)
      : await urutanDariWaktuIsi(periode.id, 'ikhwan'),
    akhwat: opts.presetAkhwat
      ? await urutanUntuk(opts.presetAkhwat)
      : await urutanDariWaktuIsi(periode.id, 'akhwat'),
  };

  // ── Permintaan: pendaftar sah yang belum dialokasikan ──
  const { data: pendaftarRows } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id, slot_id, level_pilihan, pita_umur, didaftar_pada')
    .eq('periode_id', periode.id)
    .eq('status', 'valid');

  const pendaftar: PendaftarAlokasi[] = ((pendaftarRows ?? []) as {
    id: string;
    slot_id: string | null;
    level_pilihan: string | null;
    pita_umur: KsPitaUmur | null;
    didaftar_pada: string | null;
  }[])
    .filter((p): p is typeof p & { slot_id: string } => Boolean(p.slot_id))
    .map((p) => ({
      id: p.id,
      slot_id: p.slot_id,
      // Level kosong diperlakukan sebagai Dasar: itu bawaan program, dan
      // membiarkannya null akan memecah kelompok tanpa alasan.
      level: p.level_pilihan ?? 'HITS Dasar',
      pita_umur: p.pita_umur,
      didaftar_pada: p.didaftar_pada,
    }));

  // ── Pasokan: pengajar terverifikasi per slot ──
  const { data: ketRows } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('slot_id, status, pengisian:pengisian_id(pengajar_id, periode_id, status)')
    .in('status', ['terverifikasi', 'diajukan']);

  const slotIds = new Set(slots.map((s) => s.id));
  const tersedia = new Map<string, string[]>();
  const pengajarDipakai = new Set<string>();
  for (const k of (ketRows ?? []) as {
    slot_id: string;
    pengisian?: { pengajar_id: string; periode_id: string; status: string } | null;
  }[]) {
    const p = k.pengisian;
    if (!p || p.periode_id !== periode.id) continue;
    // 'nonaktif' berhenti ikut alokasi; 'basi' tetap ikut, hanya turun prioritas
    // lewat urutan — bukan dihapus dari kolam.
    if (p.status === 'nonaktif') continue;
    if (!slotIds.has(k.slot_id)) continue;
    if (!tersedia.has(k.slot_id)) tersedia.set(k.slot_id, []);
    if (!tersedia.get(k.slot_id)!.includes(p.pengajar_id)) {
      tersedia.get(k.slot_id)!.push(p.pengajar_id);
      pengajarDipakai.add(p.pengajar_id);
    }
  }

  // ── Halaqah yang sudah hidup pada periode ini ──
  const { data: usulanHidup } = await supabaseAdmin
    .from('ks_usulan')
    .select('slot_id, pengajar_id')
    .eq('periode_id', periode.id)
    .in('status', STATUS_HIDUP);
  const sudahDiSlot = new Map<string, Set<string>>();
  for (const u of (usulanHidup ?? []) as { slot_id: string; pengajar_id: string | null }[]) {
    if (!u.pengajar_id) continue;
    if (!sudahDiSlot.has(u.slot_id)) sudahDiSlot.set(u.slot_id, new Set());
    sudahDiSlot.get(u.slot_id)!.add(u.pengajar_id);
  }

  // ── Jadwal yang sudah terpakai tiap pengajar ──
  const jadwalPengajar = new Map<string, RentangJadwal[]>();
  for (const id of pengajarDipakai) {
    const terpakai = await jadwalTerpakaiPengajar(id);
    jadwalPengajar.set(
      id,
      terpakai.map((t) => t.rentang)
    );
  }

  // ── Susun kelompok calon halaqah per slot ──
  const slotAlokasi: SlotAlokasi[] = [];
  for (const s of slots) {
    const milikSlot = pendaftar.filter((p) => p.slot_id === s.id);
    if (milikSlot.length === 0) continue;
    const grup = kelompokkanPendaftar(s.id, milikSlot, periode, sekarang);
    if (grup.length === 0) continue;
    slotAlokasi.push({
      slot: s,
      grup,
      antre: milikSlot.length,
      usia_tertua_hari: Math.max(...grup.map((g) => g.usia_tertua_hari), 0),
    });
  }

  const genderSlot = new Map(slots.map((s) => [s.id, s.kelompok]));

  const hasil = alokasikan({
    slots: slotAlokasi,
    tersedia,
    sudahDiSlot,
    jadwalPengajar,
    peringkat: (id) => {
      // Peringkat dibaca dari urutan sesuai gender pengajar; keduanya digabung
      // supaya satu fungsi cukup untuk mesin yang tidak mengenal gender.
      const dariIkhwan = urutan.ikhwan.peringkat.get(id);
      if (dariIkhwan !== undefined) return dariIkhwan;
      const dariAkhwat = urutan.akhwat.peringkat.get(id);
      if (dariAkhwat !== undefined) return dariAkhwat;
      return Math.max(urutan.ikhwan.peringkatSisa, urutan.akhwat.peringkatSisa);
    },
  });

  // ── Tulis usulan ──
  const slotById = new Map(slots.map((s) => [s.id, s]));
  let pesertaTerpakai = 0;
  const perGender: Record<Gender, { usulan: number; keterangan: string }> = {
    ikhwan: { usulan: 0, keterangan: urutan.ikhwan.keterangan },
    akhwat: { usulan: 0, keterangan: urutan.akhwat.keterangan },
  };

  for (const p of hasil.penempatan) {
    const slot = slotById.get(p.slot_id);
    if (!slot) continue;
    const { data: usulan, error } = await supabaseAdmin
      .from('ks_usulan')
      .insert({
        periode_id: periode.id,
        slot_id: p.slot_id,
        pengajar_id: p.pengajar_id,
        nama_halaqah: null,
        level: p.grup.level,
        pita_umur: p.grup.pita_umur,
        pita_digabung: p.grup.pita_digabung,
        putaran: p.putaran,
        urutan_prioritas: p.urutan_prioritas,
        status: 'usulan',
      })
      .select('id')
      .single();
    if (error || !usulan) continue;

    for (const pendaftarId of p.grup.pendaftar_ids) {
      await supabaseAdmin.from('ks_usulan_peserta').insert({
        usulan_id: usulan.id,
        pendaftar_id: pendaftarId,
      });
      await supabaseAdmin
        .from('ks_pendaftar')
        .update({ status: 'dialokasikan', updated_at: sekarang.toISOString() })
        .eq('id', pendaftarId);
      pesertaTerpakai++;
    }

    const g = genderSlot.get(p.slot_id);
    if (g) perGender[g].usulan += 1;
  }

  await catatKs({
    periode_id: periode.id,
    entitas: 'ks_usulan',
    aksi: 'jalankan_alokasi',
    sesudah: {
      usulan: hasil.penempatan.length,
      peserta: pesertaTerpakai,
      tanpa_pengajar: hasil.tanpaPengajar.length,
      putaran: hasil.putaranTerpakai,
      urutan_ikhwan: urutan.ikhwan.keterangan,
      urutan_akhwat: urutan.akhwat.keterangan,
    },
    aktor_wa: opts.aktor?.wa ?? null,
    aktor_nama: opts.aktor?.nama ?? null,
  });

  return {
    usulanBaru: hasil.penempatan.length,
    pesertaTerpakai,
    tanpaPengajar: hasil.tanpaPengajar.length,
    putaran: hasil.putaranTerpakai,
    perGender,
  };
}

/**
 * Nama halaqah baku. Nomor urut dihitung dari jumlah halaqah hidup pada periode
 * dan gender yang sama, supaya penamaan mengikuti pola yang sudah dipakai
 * ("HITS 001 AKHWAT JUNI") tanpa perlu diketik.
 */
export async function susunNamaHalaqah(
  periode: KsPeriode,
  slot: KsSlot,
  nomor: number
): Promise<string> {
  const kelompok = slot.kelompok === 'ikhwan' ? 'IKHWAN' : 'AKHWAT';
  const label = periode.nama.replace(/[^a-zA-Z0-9 ]+/g, '').trim().toUpperCase();
  return `HITS ${String(nomor).padStart(3, '0')} ${kelompok} ${label}`;
}

/** Ringkas kelompok untuk ditampilkan di kartu usulan. */
export function ringkasGrup(g: Pick<GrupUsulan, 'level' | 'pita_umur' | 'pita_digabung' | 'pendaftar_ids'>): string {
  const pita = g.pita_digabung ? 'pita digabung' : (g.pita_umur ?? 'umur tak diketahui');
  return `${g.level} · ${pita} · ${g.pendaftar_ids.length} murid`;
}

export { rentangDariSlot };
