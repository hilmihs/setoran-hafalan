'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { isPredikat, PREDIKAT_LABEL } from '@/lib/ujian';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplMusyrifHasilUjianToPeserta } from '@/lib/whatsapp';
import { JENIS_REKAMAN, type Gender, type MusyrifSession } from '@/types/db';

export type AlasanResult = { ok?: boolean; error?: string };
export type NilaiUjianResult = { ok: true; waUrl: string } | { ok?: false; error: string };

async function sesiMusyrif(): Promise<MusyrifSession | null> {
  const s = await getSession();
  return s.session?.role === 'musyrif' ? s.session : null;
}

/** Peserta harus aktif di kelas yang diampu musyrif ini. */
async function pesertaMilikMusyrif(pesertaId: string, musyrifId: string) {
  const { data } = await supabaseAdmin
    .from('peserta')
    .select('id, name, gender, whatsapp_number, kelas:kelas_id(id, name, musyrif_id)')
    .eq('id', pesertaId)
    .maybeSingle();
  if (!data) return null;
  const kelas = data.kelas as unknown as { id: string; name: string; musyrif_id: string } | null;
  if (kelas?.musyrif_id !== musyrifId) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    gender: data.gender as Gender,
    whatsapp_number: data.whatsapp_number as string,
  };
}

export async function simpanAlasanBelumUjian(_prev: AlasanResult | undefined, fd: FormData): Promise<AlasanResult> {
  const me = await sesiMusyrif();
  if (!me) return { error: 'Anda harus login sebagai musyrif.' };

  const periodeId = String(fd.get('periode_id') ?? '');
  const pesertaId = String(fd.get('peserta_id') ?? '');
  const alasan = String(fd.get('alasan') ?? '').trim().slice(0, 500);
  if (!periodeId || !pesertaId) return { error: 'Data tidak lengkap.' };

  const peserta = await pesertaMilikMusyrif(pesertaId, me.musyrif_id);
  if (!peserta) return { error: 'Peserta ini bukan dari kelas Anda.' };

  const { data: periode } = await supabaseAdmin.from('ujian_periode').select('id').eq('id', periodeId).maybeSingle();
  if (!periode) return { error: 'Periode ujian tidak ditemukan.' };

  const now = new Date().toISOString();
  // Hanya kolom alasan yang disentuh — status/rekaman peserta tidak ikut tertimpa.
  const { error } = await supabaseAdmin.from('ujian').upsert(
    {
      periode_id: periodeId,
      peserta_id: pesertaId,
      alasan_belum: alasan || null,
      alasan_updated_at: now,
      updated_at: now,
    },
    { onConflict: 'periode_id,peserta_id' }
  );
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  await logAudit({
    actor: me,
    action: 'ujian.alasan_belum',
    targetTable: 'ujian',
    targetId: null,
    detail: { periode_id: periodeId, peserta_id: pesertaId, alasan },
  });
  revalidatePath('/2in1/musyrif/ujian');
  return { ok: true };
}

export async function simpanNilaiUjian(_prev: NilaiUjianResult | undefined, fd: FormData): Promise<NilaiUjianResult> {
  const me = await sesiMusyrif();
  if (!me) return { error: 'Anda harus login sebagai musyrif.' };

  const ujianId = String(fd.get('ujian_id') ?? '');
  if (!ujianId) return { error: 'ujian_id wajib.' };

  const { data: ujian } = await supabaseAdmin
    .from('ujian')
    .select('id, peserta_id, status, periode:periode_id(nama)')
    .eq('id', ujianId)
    .maybeSingle();
  if (!ujian) return { error: 'Ujian tidak ditemukan.' };
  const peserta = await pesertaMilikMusyrif(ujian.peserta_id as string, me.musyrif_id);
  if (!peserta) return { error: 'Ujian ini bukan dari kelas Anda.' };
  const periodeNama = (ujian.periode as unknown as { nama: string } | null)?.nama ?? 'ujian';

  const { data: rekRows } = await supabaseAdmin
    .from('rekaman_ujian')
    .select('jenis, audio_url')
    .eq('ujian_id', ujianId);
  const adaAudio = new Set((rekRows ?? []).filter((r) => r.audio_url).map((r) => r.jenis as string));
  if (adaAudio.size === 0) return { error: 'Peserta belum mengirim rekaman apa pun.' };

  // Validasi semua dulu, baru tulis — jangan sampai tersimpan setengah.
  const isian: Array<{ jenis: (typeof JENIS_REKAMAN)[number]; predikat: string; masukan: string }> = [];
  for (const jenis of JENIS_REKAMAN) {
    if (!adaAudio.has(jenis)) continue;
    const predikat = String(fd.get(`predikat_${jenis}`) ?? '');
    if (!isPredikat(predikat)) {
      return { error: `Predikat ${labelJenis(jenis)} wajib dipilih.` };
    }
    isian.push({ jenis, predikat, masukan: String(fd.get(`masukan_${jenis}`) ?? '').trim() });
  }

  const now = new Date().toISOString();
  const ringkas: string[] = [];
  const masukanParts: string[] = [];
  for (const it of isian) {
    const { error } = await supabaseAdmin
      .from('rekaman_ujian')
      .update({ predikat: it.predikat, masukan: it.masukan || null, checked_at: now, updated_at: now })
      .eq('ujian_id', ujianId)
      .eq('jenis', it.jenis);
    if (error) return { error: `Gagal simpan ${labelJenis(it.jenis)}: ${error.message}` };
    ringkas.push(`${labelJenis(it.jenis)}: ${PREDIKAT_LABEL[it.predikat as keyof typeof PREDIKAT_LABEL]}`);
    if (it.masukan) masukanParts.push(`• ${labelJenis(it.jenis)}: ${it.masukan}`);
  }
  for (const jenis of JENIS_REKAMAN) {
    if (!adaAudio.has(jenis)) ringkas.push(`${labelJenis(jenis)}: tidak direkam`);
  }

  const { error: uErr } = await supabaseAdmin
    .from('ujian')
    .update({ status: 'checked', checked_at: now, checked_by_musyrif_id: me.musyrif_id, updated_at: now })
    .eq('id', ujianId);
  if (uErr) return { error: `Gagal update status: ${uErr.message}` };

  await logAudit({
    actor: me,
    action: ujian.status === 'checked' ? 'ujian.nilai_ubah' : 'ujian.nilai',
    targetTable: 'ujian',
    targetId: ujianId,
    detail: { peserta_id: peserta.id, ringkas: ringkas.join(' | ') },
  });

  revalidatePath('/2in1/musyrif/ujian');
  revalidatePath(`/2in1/musyrif/ujian/${ujianId}`);

  const waUrl = buildWaMeUrl(
    peserta.whatsapp_number,
    tplMusyrifHasilUjianToPeserta({
      pesertaName: peserta.name,
      pesertaGender: peserta.gender,
      periodeNama,
      nilaiSummary: ringkas.join('\n'),
      masukanGabungan: masukanParts.length ? masukanParts.join('\n') : '(tidak ada catatan tambahan)',
      lihatUrl: absUrl('/2in1/peserta/ujian'),
    })
  );
  return { ok: true, waUrl };
}

function labelJenis(j: string): string {
  return j === 'tuhfatul_athfal' ? 'Tuhfatul Athfal' : j === 'jazariyyah' ? 'Al-Jazariyyah' : 'Asy-Syawahid';
}
