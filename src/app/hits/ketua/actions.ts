'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKetuaKelas } from '@/lib/session';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { todayJakarta } from '@/lib/maahir-presensi';
import { logAudit } from '@/lib/audit';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplHapusPertemuanToKoorKK } from '@/lib/whatsapp';
import { HITS_LEVEL_SHORT } from '@/lib/hits-pertemuan';
import type { HitsKondisi, HitsStatusLatihan, HitsLevel } from '@/types/db';

export type KetuaHarianResult = { ok?: boolean; error?: string };
export type AjukanHapusResult = { ok?: boolean; error?: string; waUrl?: string };

/** Ketua kelas mengajukan penghapusan pertemuan kelebihan/salah → koordinator KK. */
export async function ajukanHapusPertemuan(
  _prev: AjukanHapusResult | undefined,
  fd: FormData
): Promise<AjukanHapusResult> {
  const session = await requireKetuaKelas();
  const halaqahId = session.hits_halaqah_id;
  if (!halaqahId) return { error: 'Akun ini bukan ketua kelas HITS.' };

  const pertemuanNo = Number(fd.get('pertemuan_no'));
  const level = String(fd.get('level') ?? '') as HitsLevel;
  const tanggal = String(fd.get('tanggal') ?? '') || null;
  const alasan = String(fd.get('alasan') ?? '').trim();
  if (!Number.isFinite(pertemuanNo) || pertemuanNo < 1) return { error: 'Pertemuan tidak valid.' };
  if (level !== 'qoidah_nuroniyyah' && level !== 'perbaikan_bacaan') return { error: 'Tahap tidak valid.' };

  const { data: halaqah } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return { error: 'Halaqah tidak ditemukan.' };
  const gender = (halaqah.gender ?? session.gender) as 'ikhwan' | 'akhwat';

  const token = crypto.randomUUID();
  const { error: insErr } = await supabaseAdmin
    .from('hits_pertemuan_hapus_request')
    .insert({
      halaqah_id: halaqahId,
      level,
      pertemuan_no: pertemuanNo,
      tanggal,
      alasan: alasan || null,
      gender,
      requested_by_ketua_id: session.ketua_kelas_id,
      requested_by_name: session.name,
      token,
      status: 'pending',
    });
  if (insErr) {
    if (insErr.code === '23505') return { error: 'Pertemuan ini sudah diajukan & menunggu keputusan koordinator.' };
    return { error: `Gagal mengajukan: ${insErr.message}` };
  }

  // Routing ke koordinator ketua kelas sesuai gender halaqah.
  const { data: koor } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('whatsapp_number, name')
    .eq('gender', gender)
    .eq('active', true)
    .ilike('name', 'Koordinator KK%')
    .limit(1)
    .maybeSingle();
  const { data: koorFallback } = koor
    ? { data: koor }
    : await supabaseAdmin
        .from('koordinator_ketua_kelas')
        .select('whatsapp_number, name')
        .eq('gender', gender)
        .eq('active', true)
        .limit(1)
        .maybeSingle();
  const target = koor ?? koorFallback;

  await logAudit({
    actor: session,
    action: 'hits.pertemuan.hapus.ajukan',
    targetTable: 'hits_pertemuan_hapus_request',
    targetId: null,
    detail: { halaqah_id: halaqahId, level, pertemuan_no: pertemuanNo, gender },
  });

  revalidatePath('/hits/ketua');

  if (!target?.whatsapp_number) {
    return { ok: true, error: 'Pengajuan tersimpan, tapi nomor koordinator ketua kelas belum diset.' };
  }
  const msg = tplHapusPertemuanToKoorKK({
    ketuaName: session.name,
    kelasName: halaqah.name,
    pertemuanNo,
    tanggal,
    levelLabel: HITS_LEVEL_SHORT[level],
    alasan,
    approveUrl: absUrl(`/hits/hapus-pertemuan/${token}`),
  });
  return { ok: true, waUrl: buildWaMeUrl(target.whatsapp_number, msg) };
}

const KONDISI: HitsKondisi[] = ['KBBS', 'KMT', 'JKG', 'KBLA', 'LIBUR'];
const STATUS: HitsStatusLatihan[] = ['TAL', 'PTML', 'SML'];

export async function submitKeteranganHarian(
  _prev: KetuaHarianResult | undefined,
  fd: FormData
): Promise<KetuaHarianResult> {
  const session = await requireKetuaKelas();
  const halaqahId = session.hits_halaqah_id;
  if (!halaqahId) return { error: 'Akun ini bukan ketua kelas HITS.' };

  const pertemuanNo = Number(fd.get('pertemuan_no'));
  const level = String(fd.get('level') ?? '') as HitsLevel;
  const tanggal = String(fd.get('tanggal') ?? '');
  const kondisi = String(fd.get('kondisi') ?? '') as HitsKondisi;
  const terlambat = String(fd.get('terlambat') ?? 'false') === 'true';
  const latihanDiberikanRaw = String(fd.get('latihan_diberikan') ?? '');
  const statusLatihan = String(fd.get('status_latihan') ?? '') as HitsStatusLatihan;
  const semuaSelesaiRaw = String(fd.get('semua_selesai') ?? '');
  const catatan = String(fd.get('catatan') ?? '').trim() || null;

  if (!Number.isFinite(pertemuanNo) || pertemuanNo < 1) return { error: 'Pertemuan tidak valid.' };
  if (!KONDISI.includes(kondisi)) return { error: 'Kondisi tidak valid.' };
  if (level !== 'qoidah_nuroniyyah' && level !== 'perbaikan_bacaan') return { error: 'Tahap tidak valid.' };

  // Validasi server-side: (level, pertemuan_no, tanggal) harus pertemuan sah & tidak di masa depan.
  const loaded = await loadHalaqahPertemuan(halaqahId);
  if (!loaded) return { error: 'Halaqah tidak ditemukan.' };
  const today = todayJakarta();
  const match = loaded.derived.find((d) => d.pertemuan_no === pertemuanNo && d.level === level);
  if (!match) return { error: 'Pertemuan tidak ada di kaldik halaqah ini.' };
  if (match.tanggal > today) return { error: 'Tidak bisa mengisi pertemuan yang belum berlangsung.' };

  // Ketua kelas boleh mengedit seluruh pertemuan yang tampil (termasuk hasil
  // migrasi yang sebelumnya terkunci). Tidak ada gating editable di sini.
  const isLibur = kondisi === 'LIBUR';
  const latihanDiberikan = isLibur ? null : latihanDiberikanRaw === 'true';
  const finalStatus = !isLibur && latihanDiberikan && STATUS.includes(statusLatihan) ? statusLatihan : null;
  const semuaSelesai = !isLibur && latihanDiberikan ? semuaSelesaiRaw === 'true' : null;

  const { data: saved, error } = await supabaseAdmin
    .from('hits_keterangan_harian')
    .upsert(
      {
        halaqah_id: halaqahId,
        level,
        pertemuan_no: pertemuanNo,
        tanggal: match.tanggal,
        kondisi,
        terlambat: isLibur ? false : terlambat,
        latihan_diberikan: latihanDiberikan,
        status_latihan: finalStatus,
        semua_selesai: semuaSelesai,
        catatan,
        editable: true,
        diisi_by_role: 'ketua_kelas',
        diisi_by_id: session.ketua_kelas_id,
      },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    )
    .select('id')
    .single();
  if (error || !saved) return { error: `Gagal menyimpan: ${error?.message ?? 'tidak diketahui'}` };

  // Lifecycle tabayyun: kondisi non-KBBS/LIBUR memicu klarifikasi pengajar.
  // KBBS/LIBUR (atau edit kembali ke baik) menghapus tabayyun pending.
  const perluTabayyun = kondisi === 'KMT' || kondisi === 'JKG' || kondisi === 'KBLA';
  if (perluTabayyun) {
    const { data: halaqah } = await supabaseAdmin
      .from('hits_halaqah')
      .select('pengajar_id')
      .eq('id', halaqahId)
      .maybeSingle();
    // Insert hanya bila belum ada (unique keterangan_id). Pakai upsert ignore.
    await supabaseAdmin.from('hits_tabayyun').upsert(
      {
        keterangan_id: saved.id,
        halaqah_id: halaqahId,
        pengajar_id: halaqah?.pengajar_id ?? null,
        kondisi,
        status: 'pending',
      },
      { onConflict: 'keterangan_id', ignoreDuplicates: true }
    );
  } else {
    // kondisi KBBS / LIBUR → batalkan tabayyun yang masih pending utk keterangan ini.
    await supabaseAdmin
      .from('hits_tabayyun')
      .delete()
      .eq('keterangan_id', saved.id)
      .eq('status', 'pending');
  }

  await logAudit({
    actor: session,
    action: 'hits.keterangan.submit',
    targetTable: 'hits_keterangan_harian',
    targetId: null,
    detail: { halaqah_id: halaqahId, pertemuan_no: pertemuanNo, kondisi },
  });

  revalidatePath('/hits/ketua');
  return { ok: true };
}
