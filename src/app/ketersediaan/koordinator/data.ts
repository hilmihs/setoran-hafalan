import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsMode, KsPendaftarSumber, KsPengisianSumber } from '@/types/db';
import type { BarisAntrean, KartuUsulan } from './PanelKerja';
import type { BarisGrup } from './PanelGrupPool';

const STATUS_HIDUP = ['disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'];

// ── Panel lama (dipindah dari page.tsx) ────────────────────────────────────

export async function muatAntrean(periodeId: string): Promise<BarisAntrean[]> {
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar:pengajar_id(name, gender)')
    .eq('periode_id', periodeId);
  const namaPengisian = new Map(
    ((pengisian ?? []) as { id: string; pengajar?: { name: string; gender: Gender } | null }[]).map(
      (p) => [p.id, p.pengajar?.name ?? '—']
    )
  );
  if (namaPengisian.size === 0) return [];

  const { data: baris } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('id, pengisian_id, status, sanggahan_status, bentrok_alasan, catatan, slot:slot_id(label)')
    .in('status', ['perlu_konfirmasi', 'diajukan']);

  const out: BarisAntrean[] = [];
  for (const b of (baris ?? []) as {
    id: string;
    pengisian_id: string;
    status: string;
    sanggahan_status: string | null;
    bentrok_alasan: string | null;
    catatan: string | null;
    slot?: { label: string } | null;
  }[]) {
    const nama = namaPengisian.get(b.pengisian_id);
    if (!nama) continue;
    // Yang perlu disentuh koordinator: sanggahan menunggu, atau baris yang
    // gagal salah satu butir verifikasi. Baris 'diajukan' yang bersih tidak
    // ditampilkan — menumpuknya hanya membuat antrean terlihat panjang palsu.
    const perluDisentuh = b.sanggahan_status === 'menunggu' || b.status === 'perlu_konfirmasi';
    if (!perluDisentuh) continue;
    out.push({
      id: b.id,
      pengajar: nama,
      slot: b.slot?.label ?? '—',
      status: b.status,
      sanggahan_status: b.sanggahan_status,
      bentrok_alasan: b.bentrok_alasan,
      catatan: b.catatan,
    });
  }
  return out;
}

export async function muatUsulan(periodeId: string): Promise<KartuUsulan[]> {
  const { data } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, status, level, pita_umur, pita_digabung, putaran, tanggal_mulai, token_kedaluwarsa, tilawah_halaqah_id, grup_wa_link, slot:slot_id(label), pengajar:pengajar_id(name)'
    )
    .eq('periode_id', periodeId)
    .in('status', ['usulan', 'disetujui', 'menunggu', 'dikonfirmasi', 'kedaluwarsa', 'dikirim', 'gagal'])
    .order('created_at', { ascending: false })
    .limit(200);

  const baris = (data ?? []) as {
    id: string;
    status: string;
    level: string;
    pita_umur: string | null;
    pita_digabung: boolean;
    putaran: number;
    tanggal_mulai: string | null;
    token_kedaluwarsa: string | null;
    tilawah_halaqah_id: number | null;
    grup_wa_link: string | null;
    slot?: { label: string } | null;
    pengajar?: { name: string } | null;
  }[];
  if (baris.length === 0) return [];

  const { data: peserta } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('usulan_id, status')
    .in(
      'usulan_id',
      baris.map((b) => b.id)
    );
  const hitung = new Map<string, number>();
  const terenrol = new Map<string, number>();
  for (const p of (peserta ?? []) as { usulan_id: string; status: string }[]) {
    hitung.set(p.usulan_id, (hitung.get(p.usulan_id) ?? 0) + 1);
    if (p.status === 'terenroll') terenrol.set(p.usulan_id, (terenrol.get(p.usulan_id) ?? 0) + 1);
  }

  return baris.map((b) => ({
    id: b.id,
    status: b.status,
    slot: b.slot?.label ?? '—',
    pengajar: b.pengajar?.name ?? '(belum ada)',
    level: b.level,
    pita: b.pita_digabung ? 'pita digabung' : (b.pita_umur ?? '—'),
    putaran: b.putaran,
    peserta: hitung.get(b.id) ?? 0,
    terenrol: terenrol.get(b.id) ?? 0,
    tanggal_mulai: b.tanggal_mulai,
    tenggat: b.token_kedaluwarsa,
    tilawah_halaqah_id: b.tilawah_halaqah_id,
    grup_wa_link: b.grup_wa_link,
  }));
}

export async function muatGrupPool(periodeId: string): Promise<BarisGrup[]> {
  const { data } = await supabaseAdmin
    .from('ks_grup_pool')
    .select('id, gender, invite_link, status, usulan:usulan_id(nama_halaqah, slot:slot_id(label))')
    .eq('periode_id', periodeId)
    .order('created_at', { ascending: true });

  return ((data ?? []) as {
    id: string;
    gender: Gender;
    invite_link: string;
    status: string;
    usulan?: { nama_halaqah: string | null; slot?: { label: string } | null } | null;
  }[]).map((b) => ({
    id: b.id,
    gender: b.gender,
    invite_link: b.invite_link,
    status: b.status,
    halaqah: b.usulan ? (b.usulan.nama_halaqah ?? b.usulan.slot?.label ?? 'terpakai') : null,
  }));
}

export async function muatSumber(periodeId: string): Promise<KsPendaftarSumber[]> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar_sumber')
    .select('*')
    .eq('periode_id', periodeId)
    .order('created_at', { ascending: true });
  return (data ?? []) as KsPendaftarSumber[];
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface JamPengajar {
  label: string;
  mode: KsMode;
  prioritas: number | null;
  /** Alasan bentrok yang dicatat saat impor — ditampilkan, tidak mengunci. */
  bentrok: string | null;
}

export interface BarisPengajarDasbor {
  id: string;
  nama: string;
  gender: Gender;
  sumber: KsPengisianSumber;
  status: string;
  halaqah: number;
  jam: JamPengajar[];
}

export async function muatPengajarDasbor(periodeId: string): Promise<BarisPengajarDasbor[]> {
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar_id, status, sumber, pengajar:pengajar_id(name, gender)')
    .eq('periode_id', periodeId);
  const baris = (pengisian ?? []) as {
    id: string;
    pengajar_id: string;
    status: string;
    sumber: KsPengisianSumber;
    pengajar?: { name: string; gender: Gender } | null;
  }[];
  if (baris.length === 0) return [];

  const [{ data: ket }, { data: usulan }] = await Promise.all([
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('pengisian_id, status, prioritas, bentrok_alasan, slot:slot_id(label, mode)')
      .in(
        'pengisian_id',
        baris.map((b) => b.id)
      ),
    supabaseAdmin.from('ks_usulan').select('pengajar_id').eq('periode_id', periodeId).in('status', STATUS_HIDUP),
  ]);

  const jamPer = new Map<string, JamPengajar[]>();
  for (const k of (ket ?? []) as {
    pengisian_id: string;
    status: string;
    prioritas: number | null;
    bentrok_alasan: string | null;
    slot?: { label: string; mode: KsMode } | null;
  }[]) {
    if (k.status === 'ditolak' || !k.slot) continue;
    const daftar = jamPer.get(k.pengisian_id) ?? [];
    daftar.push({
      label: k.slot.label.replace(/\s*WIB$/, ''),
      mode: k.slot.mode,
      prioritas: k.prioritas,
      bentrok: k.bentrok_alasan,
    });
    jamPer.set(k.pengisian_id, daftar);
  }

  const halaqah = new Map<string, number>();
  for (const u of (usulan ?? []) as { pengajar_id: string | null }[]) {
    if (u.pengajar_id) halaqah.set(u.pengajar_id, (halaqah.get(u.pengajar_id) ?? 0) + 1);
  }

  return baris
    .filter((b) => b.pengajar)
    .map((b) => ({
      id: b.pengajar_id,
      nama: b.pengajar!.name,
      gender: b.pengajar!.gender,
      sumber: b.sumber,
      status: b.status,
      halaqah: halaqah.get(b.pengajar_id) ?? 0,
      jam: (jamPer.get(b.id) ?? []).sort(
        (x, y) => (x.prioritas ?? 99) - (y.prioritas ?? 99) || x.label.localeCompare(y.label)
      ),
    }))
    // Yang belum kebagian halaqah paling atas: itu yang perlu diperhatikan.
    .sort((a, b) => a.halaqah - b.halaqah || a.nama.localeCompare(b.nama));
}

/** Pengajar yang benar-benar ikut hitungan pasokan: punya jam dan tidak nonaktif. */
export function hitungPengajarTersedia(rows: readonly BarisPengajarDasbor[], gender?: Gender): number {
  return rows.filter((r) => r.status !== 'nonaktif' && r.jam.length > 0 && (!gender || r.gender === gender)).length;
}

export interface TugasGender {
  usulanMenunggu: number;
  tenggatLewat: number;
  sanggahan: number;
}

export async function muatTugas(periodeId: string, sekarang: Date): Promise<Record<Gender, TugasGender>> {
  const kosong = (): TugasGender => ({ usulanMenunggu: 0, tenggatLewat: 0, sanggahan: 0 });
  const out: Record<Gender, TugasGender> = { ikhwan: kosong(), akhwat: kosong() };

  const [{ data: usulan }, { data: sanggah }] = await Promise.all([
    supabaseAdmin
      .from('ks_usulan')
      .select('status, token_kedaluwarsa, slot:slot_id(kelompok)')
      .eq('periode_id', periodeId)
      .in('status', ['usulan', 'menunggu']),
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot:slot_id(kelompok, periode_id)')
      .eq('sanggahan_status', 'menunggu'),
  ]);

  for (const u of (usulan ?? []) as {
    status: string;
    token_kedaluwarsa: string | null;
    slot?: { kelompok: Gender } | null;
  }[]) {
    if (!u.slot) continue;
    if (u.status === 'usulan') out[u.slot.kelompok].usulanMenunggu += 1;
    else if (u.token_kedaluwarsa && new Date(u.token_kedaluwarsa) < sekarang) out[u.slot.kelompok].tenggatLewat += 1;
  }
  for (const s of (sanggah ?? []) as { slot?: { kelompok: Gender; periode_id: string } | null }[]) {
    if (s.slot && s.slot.periode_id === periodeId) out[s.slot.kelompok].sanggahan += 1;
  }
  return out;
}

export interface PendaftarRingkas {
  didaftar_pada: string | null;
  gender: Gender | null;
  status: string;
}

/** Semua pendaftar periode kecuali kiriman yang digantikan dan yang dibatalkan. */
export async function muatPendaftarRingkas(periodeId: string): Promise<PendaftarRingkas[]> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('didaftar_pada, gender, status')
    .eq('periode_id', periodeId);
  return ((data ?? []) as PendaftarRingkas[]).filter((p) => p.status !== 'diganti' && p.status !== 'batal');
}
