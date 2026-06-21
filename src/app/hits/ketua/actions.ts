'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKetuaKelas } from '@/lib/session';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { todayJakarta } from '@/lib/maahir-presensi';
import { logAudit } from '@/lib/audit';
import type { HitsKondisi, HitsStatusLatihan } from '@/types/db';

export type KetuaHarianResult = { ok?: boolean; error?: string };

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
  const tanggal = String(fd.get('tanggal') ?? '');
  const kondisi = String(fd.get('kondisi') ?? '') as HitsKondisi;
  const terlambat = String(fd.get('terlambat') ?? 'false') === 'true';
  const latihanDiberikanRaw = String(fd.get('latihan_diberikan') ?? '');
  const statusLatihan = String(fd.get('status_latihan') ?? '') as HitsStatusLatihan;
  const semuaSelesaiRaw = String(fd.get('semua_selesai') ?? '');
  const catatan = String(fd.get('catatan') ?? '').trim() || null;

  if (!Number.isFinite(pertemuanNo) || pertemuanNo < 1) return { error: 'Pertemuan tidak valid.' };
  if (!KONDISI.includes(kondisi)) return { error: 'Kondisi tidak valid.' };

  // Validasi server-side: (pertemuan_no, tanggal) harus pertemuan sah & tidak di masa depan.
  const loaded = await loadHalaqahPertemuan(halaqahId);
  if (!loaded) return { error: 'Halaqah tidak ditemukan.' };
  const today = todayJakarta();
  const match = loaded.derived.find((d) => d.pertemuan_no === pertemuanNo);
  if (!match) return { error: 'Pertemuan tidak ada di kaldik halaqah ini.' };
  if (match.tanggal > today) return { error: 'Tidak bisa mengisi pertemuan yang belum berlangsung.' };
  if (tanggal && tanggal !== match.tanggal) {
    // gunakan tanggal kanonik dari derivasi, abaikan input client
  }

  // Cek baris lama: hormati flag editable.
  const { data: existing } = await supabaseAdmin
    .from('hits_keterangan_harian')
    .select('id, editable')
    .eq('halaqah_id', halaqahId)
    .eq('pertemuan_no', pertemuanNo)
    .maybeSingle();
  if (existing && existing.editable === false) {
    return { error: 'Pertemuan ini sudah dikunci, tidak bisa diubah.' };
  }

  const isLibur = kondisi === 'LIBUR';
  const latihanDiberikan = isLibur ? null : latihanDiberikanRaw === 'true';
  const finalStatus = !isLibur && latihanDiberikan && STATUS.includes(statusLatihan) ? statusLatihan : null;
  const semuaSelesai = !isLibur && latihanDiberikan ? semuaSelesaiRaw === 'true' : null;

  const { data: saved, error } = await supabaseAdmin
    .from('hits_keterangan_harian')
    .upsert(
      {
        halaqah_id: halaqahId,
        pertemuan_no: pertemuanNo,
        tanggal: match.tanggal,
        kondisi,
        terlambat: isLibur ? false : terlambat,
        latihan_diberikan: latihanDiberikan,
        status_latihan: finalStatus,
        semua_selesai: semuaSelesai,
        catatan,
        diisi_by_role: 'ketua_kelas',
        diisi_by_id: session.ketua_kelas_id,
      },
      { onConflict: 'halaqah_id,pertemuan_no' }
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
