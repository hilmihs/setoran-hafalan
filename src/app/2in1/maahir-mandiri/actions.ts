'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, getSelfAttendanceKelas } from '@/lib/program-kelas';
import { PRESENSI_ANCHOR, todayJakarta, expectedDaysInRange } from '@/lib/maahir-presensi';
import { getLiburDates } from '@/lib/maahir-libur';
import { buildWaMeUrl, tplReminderLiburToKetua } from '@/lib/whatsapp';

export type SelfPresensiResult = { ok?: boolean; error?: string };
export type RemindResult = { ok?: boolean; error?: string; waUrl?: string };

/** Peserta mengingatkan ketua kelas bahwa pertemuan tanggal ini libur → WA ketua. */
export async function remindKetuaLibur(kelasId: string, tanggal: string): Promise<RemindResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Login diperlukan.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { error: 'Tanggal tidak valid.' };

  const kelas = await getSelfAttendanceKelas(kelasId);
  if (!kelas) return { error: 'Kelas tidak ditemukan.' };
  if (!kelas.ketua_wa) return { error: 'Nomor ketua kelas belum diset.' };

  // Nama pengaju + nama ketua (opsional) dari anggota.
  const { data: rows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('name, whatsapp_number, is_ketua')
    .eq('program_kelas_id', kelasId);
  const pesertaName = (rows ?? []).find((r) => r.whatsapp_number === wa)?.name ?? 'Peserta';
  const ketuaName = (rows ?? []).find((r) => r.whatsapp_number === kelas.ketua_wa)?.name
    ?? (rows ?? []).find((r) => r.is_ketua)?.name
    ?? null;

  const tanggalLabel = new Date(tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const msg = tplReminderLiburToKetua({ ketuaName, pesertaName, kelasName: kelas.name, tanggalLabel });
  return { ok: true, waUrl: buildWaMeUrl(kelas.ketua_wa, msg) };
}

const VALID_STATUS = ['hadir', 'izin', 'terlambat', 'sakit', 'tidak_ada_keterangan'] as const;

/**
 * Peserta menandai kehadiran DIRINYA pada kelas presensi-mandiri, lewat akun
 * sendiri (login). Mencakup SELURUH presensinya: Kelas Maahir & At-Tibyan.
 */
export async function submitSelfPresensi(_prev: SelfPresensiResult | undefined, fd: FormData): Promise<SelfPresensiResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Login diperlukan.' };

  const kelasId = String(fd.get('kelas_id') ?? '');
  const anggotaId = String(fd.get('anggota_id') ?? '');
  const tanggal = String(fd.get('tanggal') ?? '');
  const program = String(fd.get('program') ?? '');
  const status = String(fd.get('status') ?? '');
  const catatan = String(fd.get('catatan') ?? '').trim();
  const setoranRaw = String(fd.get('setoran_halaman') ?? '').trim();
  if (!kelasId || !anggotaId || !tanggal || !program) return { error: 'Data tidak lengkap.' };
  if (!VALID_STATUS.includes(status as (typeof VALID_STATUS)[number])) return { error: 'Status tidak valid.' };

  // Setoran halaman hanya relevan untuk sesi Kelas Maahir. Kosong/hadir=null.
  let setoranHalaman: number | null = null;
  if (program === 'kelas_maahir' && setoranRaw !== '') {
    const n = Number(setoranRaw);
    if (!Number.isInteger(n) || n < 0) return { error: 'Setoran halaman tidak valid.' };
    setoranHalaman = n;
  }

  const kelas = await getSelfAttendanceKelas(kelasId);
  if (!kelas) return { error: 'Kelas bukan presensi mandiri.' };

  // Anggota harus milik kelas ini DAN nomornya = WA yang login (isi diri sendiri).
  const { data: anggota } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, peserta_id, program_kelas_id, whatsapp_number')
    .eq('id', anggotaId)
    .maybeSingle();
  if (!anggota || anggota.program_kelas_id !== kelasId) return { error: 'Peserta tidak terdaftar di kelas ini.' };
  if (anggota.whatsapp_number !== wa) return { error: 'Hanya bisa mengisi presensi untuk akun sendiri.' };

  // (program, tanggal) harus hari sesi sah sejak anchor s/d hari ini (libur dikecualikan).
  const today = todayJakarta();
  const libur = await getLiburDates(kelas.id, PRESENSI_ANCHOR, today);
  const day = expectedDaysInRange(kelas, PRESENSI_ANCHOR, today, libur)
    .find((d) => d.tanggal === tanggal && d.program === program);
  if (!day) return { error: 'Hari/sesi tidak valid atau sedang libur.' };

  const { data: pertemuan, error: pErr } = await supabaseAdmin
    .from('pertemuan_program')
    .upsert(
      {
        program_kelas_id: kelasId,
        program: day.program,
        tanggal: day.tanggal,
        nama_kegiatan: day.namaKegiatan,
        waktu_mulai: day.waktu_mulai,
        waktu_selesai: day.waktu_selesai,
      },
      { onConflict: 'program_kelas_id,program,tanggal', ignoreDuplicates: false }
    )
    .select('id')
    .single();
  if (pErr || !pertemuan) return { error: `Gagal menyiapkan pertemuan: ${pErr?.message ?? 'unknown'}` };

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('kehadiran_peserta')
    .upsert(
      {
        pertemuan_id: pertemuan.id,
        anggota_id: anggotaId,
        peserta_id: anggota.peserta_id ?? null,
        status,
        catatan: catatan || null,
        setoran_halaman: setoranHalaman,
        diisi_at: now,
        updated_at: now,
      },
      { onConflict: 'pertemuan_id,anggota_id' }
    );
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  return { ok: true };
}
