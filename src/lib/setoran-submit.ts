// Logika bersama untuk dua route kirim setoran peserta 2in1:
//   · /api/2in1/rekaman/submit-single — satu rekaman per unggahan
//   · /api/2in1/setoran/submit        — tiga rekaman sekaligus
//
// Aturan pokok:
//   · Rekaman yang SUDAH DINILAI musyrif (nilai terisi) tidak boleh ditimpa
//     peserta — nilai & masukannya dijaga utuh.
//   · Setoran yang sudah 'checked' tetapi masih kurang rekaman (musyrif
//     menilai setoran yang belum lengkap) boleh menerima rekaman yang belum
//     ada; setoran lalu dibuka ulang ke 'submitted' supaya musyrif menilai
//     rekaman susulan itu.
//   · week_start boleh dikirim klien (unggahan yang selesai lewat tengah
//     malam pergantian cycle tetap masuk cycle saat merekam), tapi harus awal
//     cycle yang sah dan tidak di masa depan.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { currentCycleStart, isValidCycleStart } from '@/lib/week';
import type { JenisRekaman, NilaiRekaman, PesertaSession, RoleAccess, StatusSetoran } from '@/types/db';

/** Akses peserta dari sesi — lewat `accesses` dulu supaya akun multi-peran tidak ditolak. */
export function aksesPeserta(s: { session?: RoleAccess; accesses?: RoleAccess[] }): PesertaSession | null {
  const dariAkses = s.accesses?.find((a) => a.role === 'peserta') as PesertaSession | undefined;
  if (dariAkses) return dariAkses;
  if (s.session?.role === 'peserta') return s.session as PesertaSession;
  return null;
}

/**
 * Baca `week_start` dari form. Kosong/absen → cycle berjalan (fallback server).
 * Diisi → harus awal cycle yang sah, tidak sebelum anchor, tidak di masa depan.
 */
export function bacaWeekStart(
  form: FormData
): { ok: true; weekStart: string } | { ok: false; error: string } {
  const raw = form.get('week_start');
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return { ok: true, weekStart: currentCycleStart() };
  if (!isValidCycleStart(v)) {
    return {
      ok: false,
      error: 'Periode setoran tidak valid (bukan awal periode, atau periode yang belum dimulai). Muat ulang halaman lalu kirim lagi.',
    };
  }
  return { ok: true, weekStart: v };
}

export interface RekamanAda {
  nilai: NilaiRekaman | null;
  audio_url: string | null;
}

export interface KeadaanSetoran {
  setoran: {
    id: string;
    status: StatusSetoran;
    checked_at: string | null;
    checked_by_musyrif_id: string | null;
  } | null;
  rekaman: Map<JenisRekaman, RekamanAda>;
}

export async function muatKeadaanSetoran(
  pesertaId: string,
  weekStart: string
): Promise<{ ok: true; data: KeadaanSetoran } | { ok: false; error: string }> {
  const { data: setoran, error: sErr } = await supabaseAdmin
    .from('setoran')
    .select('id, status, checked_at, checked_by_musyrif_id')
    .eq('peserta_id', pesertaId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (sErr) return { ok: false, error: `Gagal membaca setoran: ${sErr.message}` };

  const rekaman = new Map<JenisRekaman, RekamanAda>();
  if (setoran) {
    const { data: rows, error: rErr } = await supabaseAdmin
      .from('rekaman')
      .select('jenis, nilai, audio_url')
      .eq('setoran_id', setoran.id);
    if (rErr) return { ok: false, error: `Gagal membaca rekaman: ${rErr.message}` };
    for (const r of (rows ?? []) as Array<{ jenis: JenisRekaman; nilai: NilaiRekaman | null; audio_url: string | null }>) {
      rekaman.set(r.jenis, { nilai: r.nilai, audio_url: r.audio_url });
    }
  }
  return {
    ok: true,
    data: {
      setoran: setoran
        ? {
            id: setoran.id as string,
            status: setoran.status as StatusSetoran,
            checked_at: (setoran.checked_at as string | null) ?? null,
            checked_by_musyrif_id: (setoran.checked_by_musyrif_id as string | null) ?? null,
          }
        : null,
      rekaman,
    },
  };
}

export function sudahDinilai(r: RekamanAda | undefined): boolean {
  return !!r && r.nilai !== null;
}

/** Ambil id setoran; buat baris 'draft' bila belum ada (tahan balapan insert ganda). */
export async function pastikanSetoran(
  pesertaId: string,
  weekStart: string,
  ada: KeadaanSetoran['setoran']
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (ada) return { ok: true, id: ada.id };
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('setoran')
    .insert({ peserta_id: pesertaId, week_start: weekStart, status: 'draft' })
    .select('id')
    .single();
  if (inserted && !insErr) return { ok: true, id: inserted.id as string };

  // Dua unggahan paralel bisa sama-sama mencoba membuat setoran — yang kalah
  // cukup memakai baris yang sudah dibuat pemenangnya.
  if (insErr?.code === '23505') {
    const { data: lain, error: selErr } = await supabaseAdmin
      .from('setoran')
      .select('id')
      .eq('peserta_id', pesertaId)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (lain && !selErr) return { ok: true, id: lain.id as string };
  }
  return { ok: false, error: `Gagal membuat setoran: ${insErr?.message ?? 'tidak diketahui'}` };
}

/**
 * Simpan satu rekaman. Baris yang sudah ada hanya diperbarui bila BELUM
 * dinilai (`nilai is null`) — kalau musyrif keburu menilai di antara
 * pemeriksaan dan penulisan, hasilnya 409, bukan menimpa nilai.
 */
export async function simpanRekaman(args: {
  setoranId: string;
  jenis: JenisRekaman;
  path: string;
  durationSec: number | null;
  recordedAt: string;
  adaBaris: boolean;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const isi = {
    audio_url: args.path,
    duration_seconds: args.durationSec,
    recorded_at: args.recordedAt,
    nilai: null,
    masukan: null,
    checked_at: null,
  };
  const perbarui = async (): Promise<{ ok: true } | { ok: false; status: number; error: string }> => {
    const { data, error } = await supabaseAdmin
      .from('rekaman')
      .update(isi)
      .eq('setoran_id', args.setoranId)
      .eq('jenis', args.jenis)
      .is('nilai', null)
      .select('id');
    if (error) return { ok: false, status: 500, error: `Gagal menyimpan rekaman: ${error.message}` };
    if (!data || data.length === 0) {
      return {
        ok: false,
        status: 409,
        error: 'Rekaman ini sudah dinilai musyrif, tidak bisa diganti.',
      };
    }
    return { ok: true };
  };

  if (args.adaBaris) return perbarui();

  const { error } = await supabaseAdmin
    .from('rekaman')
    .insert({ setoran_id: args.setoranId, jenis: args.jenis, ...isi });
  if (!error) return { ok: true };
  // Unggahan ganda (mis. klien mengulang kiriman yang ternyata sudah masuk):
  // barisnya kini ada — perbarui saja, tetap dengan syarat belum dinilai.
  if (error.code === '23505') return perbarui();
  return { ok: false, status: 500, error: `Gagal menyimpan rekaman: ${error.message}` };
}

/**
 * Tandai setoran 'submitted'. Dari 'checked' (buka ulang karena rekaman
 * susulan) jejak cek lama dikosongkan — trigger mengisinya lagi saat musyrif
 * menilai ulang; nilai rekaman lama tidak disentuh.
 */
export async function tandaiTerkirim(
  setoranId: string,
  statusLama: StatusSetoran | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (statusLama === 'submitted') return { ok: true };
  const patch: Record<string, unknown> = { status: 'submitted' };
  if (statusLama === 'checked') {
    patch.checked_at = null;
    patch.checked_by_musyrif_id = null;
  }
  const { error } = await supabaseAdmin.from('setoran').update(patch).eq('id', setoranId);
  if (error) return { ok: false, error: `Gagal memperbarui status setoran: ${error.message}` };
  return { ok: true };
}

/** Catat ke audit_log tanpa menunggu dan tanpa pernah melempar. */
export function catatAudit(
  actor: PesertaSession,
  action: string,
  targetId: string | null,
  detail: Record<string, unknown>
): void {
  void logAudit({ actor, action, targetTable: 'setoran', targetId, detail }).catch((e) => {
    console.error('catatAudit gagal', { action, e });
  });
}

/** Balasan JSON galat + catatan audit kegagalan kirim. */
export function balasGagal(
  actor: PesertaSession,
  route: string,
  status: number,
  error: string,
  detail: Record<string, unknown> = {},
  targetId: string | null = null
): NextResponse {
  catatAudit(actor, 'setoran.kirim_gagal', targetId, { route, status, error, ...detail });
  return NextResponse.json({ error, ...(detail.kode ? { kode: detail.kode } : {}) }, { status });
}
