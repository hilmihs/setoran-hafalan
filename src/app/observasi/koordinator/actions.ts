'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import {
  buildWaMeUrl,
  tplReminderKetuaKelasObservasi,
  tplReminderPengajarTunjukKetua,
  tplTabayyunToPengajar,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { logAudit } from '@/lib/audit';
import { logWaReminder } from '@/lib/wa-log';
import { getHitsHarian, OBSERVASI_EFEKTIF } from '@/lib/hits-harian';
import { HITS_PELANGGARAN_LABEL, HITS_JKG_OPSI_LABEL } from '@/types/db';
import type { HitsPelanggaranJenis } from '@/types/db';

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** Format satu pelanggaran jadi baris ringkas utk WA tabayyun. */
function describePelanggaran(p: {
  jenis: string;
  menit: number | null;
  jkg_opsi: string | null;
  cicil_n: number | null;
  badal_nama: string | null;
  badal_mulai: string | null;
}): string {
  const label = HITS_PELANGGARAN_LABEL[p.jenis as HitsPelanggaranJenis] ?? p.jenis;
  let detail = '';
  if (p.jenis === 'KMT' && p.menit != null) detail = ` — telat ${p.menit} menit`;
  else if (p.jenis === 'KBLA' && p.menit != null) detail = ` — lebih awal ${p.menit} menit`;
  else if (p.jenis === 'JKG' && p.jkg_opsi) {
    detail = ` — ${HITS_JKG_OPSI_LABEL[p.jkg_opsi as 'ganti_hari' | 'cicil'] ?? p.jkg_opsi}`;
    if (p.jkg_opsi === 'cicil' && p.cicil_n) detail += ` (${p.cicil_n}×)`;
  } else if (p.jenis === 'BADAL') {
    detail = p.badal_nama ? ` — oleh ${p.badal_nama}` : '';
    if (p.badal_mulai) detail += p.badal_mulai === 'lebih_awal' ? ' (mulai lebih awal)' : ' (mulai sesuai jadwal)';
  }
  return `${p.jenis} (${label})${detail}`;
}

/** URL isi keterangan untuk ketua: magic-link (auto-login) bila ada token. */
function ketuaFillUrl(magicToken: string | null): string {
  return magicToken ? absUrl(`/api/auth/magic-link?token=${magicToken}`) : absUrl('/hits/ketua');
}

/** Koordinator KK memutuskan tabayyun HITS (udzur syar'i atau tidak). */
export async function decideTabayyun(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireKoordinatorKetuaKelas();

  const tabayyunId = String(formData.get('tabayyun_id') ?? '');
  const isUdzur = formData.get('is_udzur_syari') === 'true';
  const catatan = String(formData.get('keputusan_catatan') ?? '').trim();

  if (!tabayyunId) return { error: 'ID tabayyun tidak ditemukan.' };

  // Konteks utk auto-teguran (kondisi, pengajar, tanggal).
  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select('id, kondisi, pengajar_id, halaqah:halaqah_id(pengajar_id), keterangan:keterangan_id(tanggal)')
    .eq('id', tabayyunId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      is_udzur_syari: isUdzur,
      keputusan_catatan: catatan || null,
      decided_at: new Date().toISOString(),
      status: 'decided',
      koordinator_kk_id: session.koordinator_kk_id,
    })
    .eq('id', tabayyunId);

  if (error) return { error: `Gagal simpan: ${error.message}` };

  // Bukan udzur syar'i → terbitkan teguran (feed kolom Teguran matrix + risk).
  // KMT → kedisiplinan_waktu, JKG → komitmen_jadwal, lainnya → tanggung_jawab.
  if (!isUdzur && tab) {
    const hal = tab.halaqah as unknown as { pengajar_id: string | null } | null;
    const ket = tab.keterangan as unknown as { tanggal: string } | null;
    const pengajarId = tab.pengajar_id ?? hal?.pengajar_id ?? null;
    if (pengajarId) {
      const ym = (ket?.tanggal ?? jakartaToday()).slice(0, 7);
      const category =
        tab.kondisi === 'KMT'
          ? 'kedisiplinan_waktu'
          : tab.kondisi === 'JKG' || tab.kondisi === 'BADAL'
            ? 'komitmen_jadwal'
            : 'tanggung_jawab';
      // Idempotent: jangan gandakan teguran utk tabayyun yang sama.
      const { data: existing } = await supabaseAdmin
        .from('hits_teguran')
        .select('id')
        .eq('source_ref_type', 'hits_tabayyun')
        .eq('source_ref_id', tabayyunId)
        .maybeSingle();
      if (!existing) {
        const { count } = await supabaseAdmin
          .from('hits_teguran')
          .select('id', { count: 'exact', head: true })
          .eq('pengajar_id', pengajarId)
          .eq('year_month', ym)
          .eq('category', category);
        await supabaseAdmin.from('hits_teguran').insert({
          pengajar_id: pengajarId,
          year_month: ym,
          category,
          nomor_teguran: (count ?? 0) + 1,
          source_ref_type: 'hits_tabayyun',
          source_ref_id: tabayyunId,
          keterangan: catatan || `Tabayyun ${tab.kondisi} tidak diterima sebagai udzur syar'i`,
          issued_by_role: 'koordinator_ketua_kelas',
          issued_by_id: session.koordinator_kk_id,
        });
      }
    }
  }

  await logAudit({
    actor: session,
    action: 'hits.tabayyun.decide',
    targetTable: 'hits_tabayyun',
    targetId: tabayyunId,
    detail: { is_udzur_syari: isUdzur, keputusan_catatan: catatan || null },
  });

  return { ok: true };
}

/** Reminder WA ke ketua kelas agar mengisi keterangan harian (HITS). */
export async function reminderKetuaKelas(
  ketuaKelasId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: ketua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('name, whatsapp_number, gender, magic_token')
    .eq('id', ketuaKelasId)
    .maybeSingle();

  if (!ketua) return { error: 'Ketua kelas tidak ditemukan.' };

  const msg = tplReminderKetuaKelasObservasi({
    ketuaKelasName: ketua.name,
    ketuaKelasGender: ketua.gender,
    kelasName,
    observasiUrl: ketuaFillUrl(ketua.magic_token),
  });

  const waUrl = buildWaMeUrl(ketua.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'ketua_kelas',
    recipientId: ketuaKelasId,
    recipientWa: ketua.whatsapp_number,
    templateKind: 'observasi_reminder',
  });

  return { waUrl };
}

/**
 * Reminder WA ke pengajar agar mengirim alasan tabayyun (HITS). Satu tabayyun per
 * pertemuan → template me-list SEMUA pelanggaran-nya (dibaca dari hits_pelanggaran).
 */
export async function reminderTabayyunPengajar(
  tabayyunId: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select('id, keterangan_id, pengajar_id, halaqah:halaqah_id(name), keterangan:keterangan_id(tanggal)')
    .eq('id', tabayyunId)
    .maybeSingle();
  if (!tab) return { error: 'Tabayyun tidak ditemukan.' };

  const hal = tab.halaqah as unknown as { name: string } | null;
  const ket = tab.keterangan as unknown as { tanggal: string } | null;

  const { data: pengajar } = tab.pengajar_id
    ? await supabaseAdmin
        .from('pengajar')
        .select('name, whatsapp_number, gender')
        .eq('id', tab.pengajar_id)
        .maybeSingle()
    : { data: null };
  if (!pengajar) return { error: 'Pengajar tidak ditemukan.' };

  const { data: pelRows } = await supabaseAdmin
    .from('hits_pelanggaran')
    .select('jenis, menit, jkg_opsi, cicil_n, badal_nama, badal_mulai')
    .eq('keterangan_id', tab.keterangan_id);
  const pelanggaran = (pelRows ?? []).map(describePelanggaran);

  const msg = tplTabayyunToPengajar({
    pengajarName: pengajar.name,
    pengajarGender: pengajar.gender,
    tanggal: ket?.tanggal ?? '',
    kelasName: hal?.name ?? '(kelas)',
    formUrl: absUrl('/hits/pengajar'),
    pelanggaran,
  });

  const waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'pengajar',
    recipientId: tab.pengajar_id!,
    recipientWa: pengajar.whatsapp_number,
    templateKind: 'tabayyun_notify',
    targetTable: 'hits_keterangan_harian',
  });

  return { waUrl };
}

/** Reminder WA ke pengajar agar menunjuk ketua kelas (halaqah tanpa ketua). */
export async function reminderTunjukKetua(
  pengajarId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('name, whatsapp_number, gender')
    .eq('id', pengajarId)
    .maybeSingle();
  if (!pengajar || !pengajar.whatsapp_number) return { error: 'Pengajar / WA tidak ditemukan.' };

  const msg = tplReminderPengajarTunjukKetua({
    pengajarName: pengajar.name,
    pengajarGender: pengajar.gender,
    kelasName,
    url: absUrl('/hits/pengajar'),
  });
  const waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'pengajar',
    recipientId: pengajarId,
    recipientWa: pengajar.whatsapp_number,
    templateKind: 'tunjuk_ketua',
  });

  return { waUrl };
}

export type ReminderItem = { ketuaName: string; kelasName: string; waUrl: string };

/**
 * Reminder massal: semua ketua kelas yang halaqahnya ada pertemuan hari ini &
 * keterangan belum diisi. Tiap item berisi link wa.me + magic-link auto-login
 * ke form pengisian. Efektif mulai OBSERVASI_EFEKTIF (2026-06-22).
 */
export async function reminderMassalHariIni(): Promise<{ items?: ReminderItem[]; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();
  const today = jakartaToday();
  if (today < OBSERVASI_EFEKTIF) {
    return { error: `Sistem observasi mulai efektif ${OBSERVASI_EFEKTIF}.` };
  }

  const { rows } = await getHitsHarian(today, session.gender);
  const targets = rows.filter((r) => !r.keterangan && r.ketua);
  if (targets.length === 0) return { items: [] };

  const ketuaIds = targets.map((r) => r.ketua!.id);
  const { data: ketuaRows } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, whatsapp_number, gender, magic_token')
    .in('id', ketuaIds);
  const ketuaById = new Map((ketuaRows ?? []).map((k) => [k.id, k]));

  const items: ReminderItem[] = [];
  for (const r of targets) {
    const k = ketuaById.get(r.ketua!.id);
    if (!k) continue;
    const msg = tplReminderKetuaKelasObservasi({
      ketuaKelasName: k.name,
      ketuaKelasGender: k.gender,
      kelasName: r.halaqah_name,
      observasiUrl: ketuaFillUrl(k.magic_token),
    });
    items.push({ ketuaName: k.name, kelasName: r.halaqah_name, waUrl: buildWaMeUrl(k.whatsapp_number, msg) });
    await logWaReminder({
      sender: session,
      recipientTable: 'ketua_kelas',
      recipientId: k.id,
      recipientWa: k.whatsapp_number,
      templateKind: 'observasi_reminder',
    });
  }
  return { items };
}
