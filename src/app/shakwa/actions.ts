'use server';

import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAllAccesses } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { todayJakartaISO } from '@/lib/hits-observasi';
import { checkRateLimit } from '@/lib/api-public/cache';
import { buildWaMeUrl, tplShakwaKeTujuan } from '@/lib/whatsapp';
import {
  kategoriDef,
  nomorTiket,
  HALAQAH_OPTIONS,
  TUJUAN_WA,
  IZIN_JENIS,
  IZIN_JENIS_LABEL,
  MAX_LAMPIRAN,
  type ShakwaIzinJenis,
} from '@/lib/shakwa';
import { uploadLampiran, validasiLampiran } from '@/lib/shakwa-storage';
import { backfillTabayyunDariIzin, type IzinCocok } from '@/lib/shakwa-izin';
import type { Gender, PengajarSession } from '@/types/db';

export type KirimShakwaResult = {
  ok?: boolean;
  error?: string;
  nomorTiket?: string;
  waUrl?: string | null;
  tujuanNama?: string | null;
};

/** Maks kiriman per menit per IP — penangkal spam formulir publik. */
const PER_MENIT_PER_IP = 3;

function ipPemanggil(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || h.get('x-real-ip') || 'tanpa-ip';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type IzinRincian = {
  tanggal: string;
  jenis: ShakwaIzinJenis;
  menit: number | null;
  jadwalGanti: string | null;
  halaqahId: string | null;
};

/** Baca baris rincian izin dari FormData (array sejajar per indeks). */
function bacaRincianIzin(fd: FormData): { rows: IzinRincian[]; error?: string } {
  const tanggal = fd.getAll('izin_tanggal').map(String);
  const jenis = fd.getAll('izin_jenis').map(String);
  const menit = fd.getAll('izin_menit').map(String);
  const ganti = fd.getAll('izin_jadwal_ganti').map(String);
  const halaqah = fd.getAll('izin_halaqah').map(String);
  const jenisValid = new Set(IZIN_JENIS.map((j) => j.value));
  const rows: IzinRincian[] = [];

  for (let i = 0; i < tanggal.length; i++) {
    const t = tanggal[i]?.trim();
    const j = jenis[i]?.trim();
    if (!t && !j) continue; // baris kosong — pengguna menambah lalu membiarkannya
    if (!DATE_RE.test(t ?? '')) return { rows: [], error: `Rincian ke-${i + 1}: tanggal wajib diisi.` };
    if (!jenisValid.has(j as ShakwaIzinJenis)) {
      return { rows: [], error: `Rincian ke-${i + 1}: jenis izin tidak dikenal.` };
    }
    const def = IZIN_JENIS.find((x) => x.value === j)!;
    let m: number | null = null;
    if (def.butuhMenit) {
      const n = Number(menit[i] ?? '');
      if (!Number.isFinite(n) || n < 0) {
        return { rows: [], error: `Rincian ke-${i + 1}: ${IZIN_JENIS_LABEL[def.value]} butuh jumlah menit.` };
      }
      m = Math.trunc(n);
    }
    const g = (ganti[i] ?? '').trim();
    if (g && !DATE_RE.test(g)) {
      return { rows: [], error: `Rincian ke-${i + 1}: tanggal ganti tidak valid.` };
    }
    rows.push({
      tanggal: t,
      jenis: j as ShakwaIzinJenis,
      menit: m,
      jadwalGanti: g || null,
      halaqahId: (halaqah[i] ?? '').trim() || null,
    });
  }
  return { rows };
}

/**
 * Nomor tiket berurutan per hari. Tabrakan antar-pengirim serempak ditangani
 * dengan mencoba ulang, bukan dengan penguncian — kiriman formulir jarang cukup
 * padat untuk membuat ini mahal.
 */
async function simpanDenganTiket(
  baris: Record<string, unknown>,
  tanggal: string
): Promise<{ id: string; nomorTiket: string } | { error: string }> {
  for (let coba = 0; coba < 5; coba++) {
    const { count } = await supabaseAdmin
      .from('shakwa')
      .select('id', { count: 'exact', head: true })
      // Batas hari WIB — nomor tiket mengikuti tanggal setempat, bukan UTC.
      .gte('created_at', `${tanggal}T00:00:00+07:00`)
      .lte('created_at', `${tanggal}T23:59:59.999+07:00`);
    const tiket = nomorTiket(tanggal, (count ?? 0) + 1 + coba);
    const { data, error } = await supabaseAdmin
      .from('shakwa')
      .insert({ ...baris, nomor_tiket: tiket })
      .select('id')
      .single();
    if (!error && data) return { id: data.id as string, nomorTiket: tiket };
    if (error && !/duplicate|unique/i.test(error.message)) {
      return { error: `Gagal menyimpan: ${error.message}` };
    }
  }
  return { error: 'Gagal membuat nomor tiket. Coba lagi sebentar lagi.' };
}

export async function kirimShakwa(
  _prev: KirimShakwaResult | undefined,
  fd: FormData
): Promise<KirimShakwaResult> {
  // Honeypot: hanya bot yang mengisi field tersembunyi ini.
  if (String(fd.get('alamat') ?? '').trim()) return { ok: true, nomorTiket: 'SKW-0', waUrl: null };

  if (!checkRateLimit(`shakwa:${ipPemanggil()}`, PER_MENIT_PER_IP)) {
    return { error: 'Terlalu banyak kiriman dalam sekejap. Mohon tunggu sebentar.' };
  }

  const def = kategoriDef(String(fd.get('kategori') ?? ''));
  if (!def) return { error: 'Kategori laporan wajib dipilih.' };

  const gender = String(fd.get('gender') ?? '');
  if (gender !== 'ikhwan' && gender !== 'akhwat') return { error: 'Gender wajib dipilih.' };

  const nama = String(fd.get('nama') ?? '').trim();
  if (!nama) return { error: 'Nama lengkap wajib diisi.' };

  const halaqahLabel = String(fd.get('halaqah_label') ?? '').trim();
  if (!(HALAQAH_OPTIONS as readonly string[]).includes(halaqahLabel)) {
    return { error: 'Halaqoh wajib dipilih.' };
  }

  const isi = String(fd.get('isi') ?? '').trim();
  if (!isi) return { error: 'Isi laporan wajib diisi.' };

  const pelaporWa = String(fd.get('pelapor_wa') ?? '').trim() || null;

  // Kategori yang menyangkut diri pengajar diverifikasi ulang di server —
  // field tersembunyi di formulir tak boleh jadi dasar identitas.
  let pengajar: PengajarSession | null = null;
  if (def.butuhLogin) {
    const accesses = await getAllAccesses();
    pengajar = (accesses.find((a) => a.role === 'pengajar') as PengajarSession | undefined) ?? null;
    if (!pengajar) {
      return { error: `Kategori ${def.label} hanya bisa dikirim setelah masuk sebagai pengajar.` };
    }
  }

  const jawaban: Record<string, string> = {};
  for (const f of def.fieldTambahan) {
    const v = String(fd.get(`tambahan_${f.name}`) ?? '').trim();
    if (!v) return { error: `${f.label} wajib dijawab.` };
    if (!f.opsi.includes(v)) return { error: `Jawaban "${f.label}" tidak dikenal.` };
    jawaban[f.name] = v;
  }

  let rincianIzin: IzinRincian[] = [];
  if (def.value === 'izin') {
    const parsed = bacaRincianIzin(fd);
    if (parsed.error) return { error: parsed.error };
    if (!parsed.rows.length) {
      return { error: 'Isi minimal satu rincian izin (tanggal + jenis) agar tak perlu tabayyun lagi.' };
    }
    rincianIzin = parsed.rows;
  }

  // Lampiran divalidasi SEBELUM baris disimpan supaya tak ada aduan setengah jadi.
  const berkas = def.pakaiLampiran
    ? (fd.getAll('lampiran').filter((f): f is File => f instanceof File && f.size > 0))
    : [];
  if (berkas.length > MAX_LAMPIRAN) return { error: `Maksimal ${MAX_LAMPIRAN} lampiran.` };
  for (const f of berkas) {
    const err = validasiLampiran(f);
    if (err) return { error: err };
  }

  const hariIni = todayJakartaISO();
  const simpan = await simpanDenganTiket(
    {
      pelapor_type: pengajar ? 'pengajar' : 'peserta',
      kategori: def.value,
      gender: gender as Gender,
      nama,
      pelapor_wa: pelaporWa,
      halaqoh: halaqahLabel,
      pengajar_id: pengajar?.pengajar_id ?? null,
      isi,
      jawaban,
      lampiran: [],
    },
    hariIni
  );
  if ('error' in simpan) return { error: simpan.error };

  if (berkas.length) {
    const paths: string[] = [];
    for (let i = 0; i < berkas.length; i++) {
      try {
        paths.push(await uploadLampiran({ shakwaId: simpan.id, index: i, file: berkas[i] }));
      } catch (e) {
        console.error('shakwa: gagal unggah lampiran', e);
      }
    }
    if (paths.length) {
      await supabaseAdmin.from('shakwa').update({ lampiran: paths }).eq('id', simpan.id);
    }
  }

  if (rincianIzin.length && pengajar) {
    const { data: izinRows, error: izinErr } = await supabaseAdmin
      .from('shakwa_izin')
      .insert(
        rincianIzin.map((r) => ({
          shakwa_id: simpan.id,
          pengajar_id: pengajar!.pengajar_id,
          halaqah_id: r.halaqahId,
          tanggal: r.tanggal,
          jenis: r.jenis,
          menit: r.menit,
          jadwal_ganti: r.jadwalGanti,
          alasan: isi,
        }))
      )
      .select('id');
    if (izinErr) console.error('shakwa: gagal simpan rincian izin', izinErr);

    // Reverse-link: bila ketua kelas sudah terlanjur mengisi observasi hari itu,
    // tabayyun 'pending' yang cocok langsung diisi alasannya dari izin ini.
    const ids = (izinRows ?? []) as Array<{ id: string }>;
    const dikirimAt = new Date().toISOString();
    for (let i = 0; i < rincianIzin.length; i++) {
      const idRow = ids[i];
      if (!idRow) continue;
      const r = rincianIzin[i];
      const izin: IzinCocok = {
        id: idRow.id,
        shakwaId: simpan.id,
        nomorTiket: simpan.nomorTiket,
        tanggal: r.tanggal,
        jenis: r.jenis,
        menit: r.menit,
        jadwalGanti: r.jadwalGanti,
        alasan: isi,
        dikirimAt,
        pengajarId: pengajar!.pengajar_id,
        halaqahId: r.halaqahId,
      };
      try {
        await backfillTabayyunDariIzin(izin);
      } catch (e) {
        console.error('shakwa: gagal reverse-link izin', e);
      }
    }
  }

  if (pengajar) {
    await logAudit({
      actor: pengajar,
      action: 'shakwa.kirim',
      targetTable: 'shakwa',
      targetId: simpan.id,
      detail: { kategori: def.value, nomor_tiket: simpan.nomorTiket },
    });
  }

  const tujuan = def.waTujuan ? TUJUAN_WA[def.waTujuan] : null;
  const waUrl = tujuan
    ? buildWaMeUrl(
        tujuan.nomor,
        tplShakwaKeTujuan({
          nomorTiket: simpan.nomorTiket,
          kategoriLabel: def.label,
          nama,
          halaqahLabel,
          isi,
          rincian: rincianIzin.map((r) =>
            [
              r.tanggal,
              IZIN_JENIS_LABEL[r.jenis],
              r.menit != null ? `${r.menit} menit` : null,
              r.jadwalGanti ? `diganti ${r.jadwalGanti}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          ),
        })
      )
    : null;

  return { ok: true, nomorTiket: simpan.nomorTiket, waUrl, tujuanNama: tujuan?.nama ?? null };
}
