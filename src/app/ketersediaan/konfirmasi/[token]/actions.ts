'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { catatKs } from '@/lib/ketersediaan-log';
import { terbitkanToken } from '@/lib/ketersediaan-konfirmasi';
import { antrekanPengiriman } from '@/lib/tilawah/push';

export type Hasil = { ok: true; pesan: string } | { ok: false; error: string };

/**
 * Aksi pada halaman konfirmasi pengajar.
 *
 * Halaman ini TERBUKA tanpa login — yang menjaga adalah tokennya. Karena itu
 * setiap aksi memuat ulang usulan dari token, tidak pernah mempercayai id yang
 * dikirim klien, dan menolak usulan yang statusnya sudah lewat.
 */
async function muatDariToken(token: string) {
  const { data } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, periode_id, status, token_kedaluwarsa, tanggal_mulai, level, slot_id, pengajar_id, nama_halaqah, grup_wa_link, pengajar:pengajar_id(name, gender), slot:slot_id(label, kelompok, mode)'
    )
    .eq('akses_token', token)
    .maybeSingle();
  return data as
    | {
        id: string;
        periode_id: string;
        status: string;
        token_kedaluwarsa: string | null;
        tanggal_mulai: string | null;
        level: string;
        slot_id: string;
        pengajar_id: string | null;
        nama_halaqah: string | null;
        grup_wa_link: string | null;
        pengajar?: { name: string; gender: 'ikhwan' | 'akhwat' } | null;
        slot?: { label: string; kelompok: 'ikhwan' | 'akhwat'; mode: string } | null;
      }
    | null;
}

export async function setujuiKonfirmasi(input: { token: string }): Promise<Hasil> {
  const u = await muatDariToken(input.token);
  if (!u) return { ok: false, error: 'Tautan tidak dikenali.' };
  if (u.status === 'dikonfirmasi' || u.status === 'dikirim') {
    return { ok: true, pesan: 'Halaqah ini sudah Anda konfirmasi sebelumnya.' };
  }
  if (u.status !== 'menunggu') {
    return { ok: false, error: `Tautan sudah tidak berlaku (status: ${u.status}).` };
  }
  if (u.token_kedaluwarsa && new Date(u.token_kedaluwarsa) < new Date()) {
    return {
      ok: false,
      error: 'Tautan sudah lewat tenggat. Slot ini akan ditawarkan ke pengajar berikutnya — hubungi koordinator bila masih bersedia.',
    };
  }

  const sekarang = new Date().toISOString();
  await supabaseAdmin
    .from('ks_usulan')
    .update({ status: 'dikonfirmasi', dikonfirmasi_pada: sekarang, updated_at: sekarang })
    .eq('id', u.id);

  // Tiap peserta mendapat tautan undangannya sendiri. Diterbitkan sekarang,
  // bukan saat pengiriman WhatsApp, supaya daftar peserta langsung siap kirim.
  const { data: peserta } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('id, undangan_token')
    .eq('usulan_id', u.id);
  for (const p of (peserta ?? []) as { id: string; undangan_token: string | null }[]) {
    if (p.undangan_token) continue;
    await supabaseAdmin
      .from('ks_usulan_peserta')
      .update({ undangan_token: terbitkanToken() })
      .eq('id', p.id);
  }

  // Susun antrean pengiriman ke CMS tilawah. Dalam mode kirim-percobaan ini
  // hanya mencatat payload; tidak ada panggilan keluar.
  await antrekanPengiriman(u.id);

  await catatKs({
    periode_id: u.periode_id,
    entitas: 'ks_usulan',
    entitas_id: u.id,
    aksi: 'pengajar_konfirmasi_setuju',
    aktor_nama: u.pengajar?.name ?? null,
  });

  revalidatePath(`/ketersediaan/konfirmasi/${input.token}`);
  revalidatePath('/ketersediaan/koordinator');
  return { ok: true, pesan: 'Terima kasih. Daftar peserta sudah terbuka di bawah.' };
}

export async function tolakKonfirmasi(input: { token: string; alasan: string }): Promise<Hasil> {
  const u = await muatDariToken(input.token);
  if (!u) return { ok: false, error: 'Tautan tidak dikenali.' };
  if (u.status !== 'menunggu') {
    return { ok: false, error: `Tautan sudah tidak berlaku (status: ${u.status}).` };
  }
  const alasan = input.alasan.trim();
  if (!alasan) return { ok: false, error: 'Mohon tuliskan alasannya agar koordinator dapat menindaklanjuti.' };

  await supabaseAdmin
    .from('ks_usulan')
    .update({
      status: 'ditolak',
      alasan_tolak: alasan,
      akses_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', u.id);

  await catatKs({
    periode_id: u.periode_id,
    entitas: 'ks_usulan',
    entitas_id: u.id,
    aksi: 'pengajar_konfirmasi_tolak',
    alasan,
    aktor_nama: u.pengajar?.name ?? null,
  });

  revalidatePath('/ketersediaan/koordinator');
  return {
    ok: true,
    pesan: 'Penolakan tercatat. Koordinator akan menawarkan slot ini ke pengajar berikutnya.',
  };
}

/**
 * Simpan tautan undangan grup WhatsApp yang dibuat pengajar.
 *
 * Grup dibuat manusia karena WhatsApp Cloud API resmi tidak memiliki endpoint
 * grup sama sekali — tidak bisa membuat grup, menambah anggota, maupun mengambil
 * invite link. Pustaka tidak resmi mengemudikan nomor pribadi dan melanggar ToS.
 */
export async function simpanGrupWa(input: { token: string; link: string }): Promise<Hasil> {
  const u = await muatDariToken(input.token);
  if (!u) return { ok: false, error: 'Tautan tidak dikenali.' };
  if (u.status !== 'dikonfirmasi' && u.status !== 'dikirim') {
    return { ok: false, error: 'Konfirmasi kesediaan terlebih dahulu.' };
  }
  const link = input.link.trim();
  if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(link)) {
    return {
      ok: false,
      error: 'Tautan tidak dikenali. Salin dari WhatsApp: Info Grup → Undang via tautan.',
    };
  }

  await supabaseAdmin
    .from('ks_usulan')
    .update({ grup_wa_link: link, grup_sumber: 'pengajar', updated_at: new Date().toISOString() })
    .eq('id', u.id);

  await catatKs({
    periode_id: u.periode_id,
    entitas: 'ks_usulan',
    entitas_id: u.id,
    aksi: 'simpan_grup_wa',
    sesudah: { sumber: 'pengajar' },
    aktor_nama: u.pengajar?.name ?? null,
  });

  revalidatePath(`/ketersediaan/konfirmasi/${input.token}`);
  return { ok: true, pesan: 'Tautan grup tersimpan. Undangan peserta siap dikirim.' };
}

/**
 * Ambil satu grup dari kolam cadangan — untuk pengajar yang tidak sanggup
 * membuat grup sendiri. Kolam disiapkan koordinator di muka.
 */
export async function ambilGrupKolam(input: { token: string }): Promise<Hasil> {
  const u = await muatDariToken(input.token);
  if (!u) return { ok: false, error: 'Tautan tidak dikenali.' };
  if (u.status !== 'dikonfirmasi' && u.status !== 'dikirim') {
    return { ok: false, error: 'Konfirmasi kesediaan terlebih dahulu.' };
  }
  if (u.grup_wa_link) return { ok: false, error: 'Halaqah ini sudah punya grup.' };

  const { data: kolam } = await supabaseAdmin
    .from('ks_grup_pool')
    .select('id, invite_link')
    .eq('periode_id', u.periode_id)
    .eq('gender', u.slot?.kelompok ?? 'ikhwan')
    .eq('status', 'kosong')
    .limit(1)
    .maybeSingle();
  if (!kolam) {
    return {
      ok: false,
      error: 'Kolam grup cadangan sedang kosong. Hubungi koordinator, atau buat grup sendiri lalu tempel tautannya.',
    };
  }

  await supabaseAdmin
    .from('ks_grup_pool')
    .update({ status: 'terpakai', usulan_id: u.id, updated_at: new Date().toISOString() })
    .eq('id', kolam.id);
  await supabaseAdmin
    .from('ks_usulan')
    .update({
      grup_wa_link: kolam.invite_link,
      grup_sumber: 'kolam',
      updated_at: new Date().toISOString(),
    })
    .eq('id', u.id);

  await catatKs({
    periode_id: u.periode_id,
    entitas: 'ks_usulan',
    entitas_id: u.id,
    aksi: 'ambil_grup_kolam',
    aktor_nama: u.pengajar?.name ?? null,
  });

  revalidatePath(`/ketersediaan/konfirmasi/${input.token}`);
  return { ok: true, pesan: 'Grup cadangan diambil. Anda akan ditambahkan sebagai admin oleh koordinator.' };
}
