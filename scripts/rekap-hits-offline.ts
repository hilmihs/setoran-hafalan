/**
 * rekap-hits-offline.ts — rekap disiplin pengajar untuk RENTANG BEBAS
 * (mis. Januari–April 2026), disaring per jenis kelas. Menghasilkan .xlsx.
 *
 * Kenapa ada, padahal /api/hits/koordinator/download sudah ada:
 * route itu hanya melayani SATU bulan atau SATU pekan (mode=bulan|minggu), jadi
 * rekap lintas-bulan seperti Jan–Apr tak bisa dibuat dari sana.
 *
 * Kenapa lewat HTTP, bukan supabaseAdmin: DATABASE_URL di .env.local menunjuk
 * Postgres LOKAL, sedangkan datanya ada di produksi. Skrip ini membaca prod
 * lewat endpoint SQL admin yang sama dengan `npm run db` — READ ONLY, tiap
 * SELECT dijalankan dalam transaksi read-only di sisi server.
 *
 * Aturan hitung TIDAK ditulis ulang: %On-Time/%Stabil/insiden memakai predikat
 * murni yang sama dengan aplikasi (isKeteranganDinilai, isPelanggaranOnTime,
 * isPelanggaranStabilitas, isKelasOffline, rankFromAggregates). Yang ditiru
 * manual hanya loop agregasinya (hits-ranking.ts:180-244), karena di aplikasi
 * loop itu menempel pada I/O-nya.
 *
 * Kolom "Hutang (menit)" SENGAJA TIDAK ADA di sini. HUTANG_ANCHOR = 2026-07-06,
 * jadi tak satu pun pertemuan Jan–Apr bisa berhutang; menampilkannya di rekap
 * Jan–Apr hanya memindahkan angka Jul–Sep ke laporan yang bukan periodenya.
 *
 * Cara pakai:
 *   npm run rekap-hits-offline
 *   npm run rekap-hits-offline -- --venue=offline --observasi=kecualikan
 *   npm run rekap-hits-offline -- --start=2026-01-01 --end=2026-05-01 --gender=akhwat
 *
 * Flag:
 *   --start=YYYY-MM-DD   inklusif   (bawaan 2026-01-01)
 *   --end=YYYY-MM-DD     EKSKLUSIF  (bawaan 2026-05-01)
 *   --venue=offline|online|semua              (bawaan offline)
 *   --observasi=kecualikan|offline|ikut       (bawaan kecualikan)
 *        kecualikan = kelas "(observasi)" tidak masuk rekap sama sekali
 *        offline    = kelas "(observasi)" DIANGGAP offline (ikut bila venue=offline)
 *        ikut       = kelas "(observasi)" dinilai pakai jadwal_raw-nya sendiri,
 *                     sama seperti kelas lain (jadwal kosong = online — perilaku app)
 *   --halaqah=aktif|semua                     (bawaan aktif; app selalu 'aktif')
 *   --gender=ikhwan|akhwat|semua              (bawaan semua)
 *   --out=<path.xlsx>
 */

import ExcelJS from 'exceljs';
import { rankFromAggregates, type DisiplinAgg } from '@/lib/hits-ranking';
import { isKeteranganDinilai, todayJakartaISO } from '@/lib/hits-observasi';
import {
  isPelanggaranOnTime,
  isPelanggaranStabilitas,
  TOLERANSI_KMT,
  type PelanggaranRingkas,
} from '@/lib/hits-pelanggaran-kategori';
import { isKelasOffline } from '@/lib/hits-halaqah-scope';

// ── Argumen ────────────────────────────────────────────────────────────────
type Venue = 'offline' | 'online' | 'semua';
type ObsMode = 'kecualikan' | 'offline' | 'ikut';

function arg(nama: string): string | undefined {
  const pre = `--${nama}=`;
  return process.argv.slice(2).find((a) => a.startsWith(pre))?.slice(pre.length);
}
function mati(pesan: string): never {
  console.error(`✗ ${pesan}`);
  process.exit(2);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const START = arg('start') ?? '2026-01-01';
const END = arg('end') ?? '2026-05-01';
if (!ISO.test(START) || !ISO.test(END)) mati('--start/--end harus format YYYY-MM-DD.');
if (START >= END) mati('--start harus lebih awal dari --end (end bersifat eksklusif).');

const VENUE = (arg('venue') ?? 'offline') as Venue;
if (!['offline', 'online', 'semua'].includes(VENUE)) mati('--venue: offline|online|semua');

const OBS = (arg('observasi') ?? 'kecualikan') as ObsMode;
if (!['kecualikan', 'offline', 'ikut'].includes(OBS)) mati('--observasi: kecualikan|offline|ikut');

const HALAQAH_SCOPE = arg('halaqah') ?? 'aktif';
if (!['aktif', 'semua'].includes(HALAQAH_SCOPE)) mati('--halaqah: aktif|semua');

const GENDER = arg('gender') ?? 'semua';
if (!['ikhwan', 'akhwat', 'semua'].includes(GENDER)) mati('--gender: ikhwan|akhwat|semua');

const OUT =
  arg('out') ??
  `rekap-hits-${VENUE}-${START}-sd-${END}${GENDER === 'semua' ? '' : `-${GENDER}`}.xlsx`;

// ── Klien SQL admin (read-only) ────────────────────────────────────────────
const TOKEN = process.env.ADMIN_API_TOKEN;
const BASE = (process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
if (!TOKEN) mati('ADMIN_API_TOKEN belum di-set di .env.local');
if (!BASE) mati('ADMIN_API_URL / NEXT_PUBLIC_APP_URL belum di-set di .env.local');

/**
 * Satu SELECT ke prod. Endpoint memangkas hasil di 1000 baris dan menandainya
 * lewat `truncated` — pemangkasan diam-diam akan membuat penyebut %On-Time
 * mengecil tanpa jejak, jadi di sini itu dijadikan error, bukan peringatan.
 */
async function sql<T = Record<string, unknown>>(teks: string): Promise<T[]> {
  const res = await fetch(`${BASE}/api/admin/db`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ sql: teks, confirm: false }),
  });
  const body = await res.text();
  let data: {
    ok?: boolean; error?: string; rows?: T[]; rowCount?: number; truncated?: boolean;
  };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`HTTP ${res.status} — respons bukan JSON: ${body.slice(0, 300)}`);
  }
  if (!res.ok || data.ok === false) throw new Error(`HTTP ${res.status}: ${data.error ?? 'unknown'}`);
  if (data.truncated) {
    throw new Error(
      `Hasil dipangkas di 1000 baris — pecah kuerinya lebih kecil.\nSQL: ${teks.slice(0, 200)}`
    );
  }
  return data.rows ?? [];
}

const kutip = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Chunk id agar IN-list tak membengkak (endpoint bisa 502 pada statement berat). */
async function ambilPerChunk<T>(ids: string[], per: number, buat: (chunk: string[]) => string) {
  const hasil: T[] = [];
  for (let i = 0; i < ids.length; i += per) {
    hasil.push(...(await sql<T>(buat(ids.slice(i, i + per)))));
  }
  return hasil;
}

// ── Tipe baris ─────────────────────────────────────────────────────────────
type HalaqahRow = {
  id: string; name: string; batch_id: string | null; batch_name: string | null;
  jadwal_raw: string | null; gender: string | null; active: boolean;
  pengajar_id: string; pengajar_nama_sheet: string | null; pengajar_nama: string | null;
};
type KetRow = {
  id: string; halaqah_id: string; tanggal: string; pertemuan_no: number;
  kondisi: string | null; catatan: string | null;
  diisi_by_role: string | null; created_at: string | null;
};
type PelRow = {
  keterangan_id: string; jenis: string; menit: number | null;
  jkg_opsi: string | null; cicil_n: number | null; badal_nama: string | null;
};
type TabRow = {
  keterangan_id: string; status: string | null; alasan_pengajar: string | null;
  is_udzur_syari: boolean | null;
};

const isObservasi = (nama: string) => /\(observasi\)/i.test(nama);

/** Keputusan masuk/tidak per halaqah + alasannya — dipakai sheet transparansi. */
function putuskan(
  h: HalaqahRow,
  batchBerjalan: Set<string>
): { masuk: boolean; venue: string; alasan: string } {
  const observasi = isObservasi(h.name);
  const venue =
    observasi && OBS === 'offline' ? 'offline (aturan observasi)'
      : isKelasOffline(h.jadwal_raw) ? 'offline'
      : h.jadwal_raw ? 'online' : 'online (jadwal kosong)';

  // Batch yang belum/tak berjalan pada rentang ini dibuang SEBELUM penyaring
  // lain. Tanpa ini, halaqah batch Juni/Juli ikut terbawa lalu mendarat di blok
  // "tanpa sesi dinilai" — terbaca seolah ketua kelasnya lalai mengisi, padahal
  // kelasnya memang belum ada pada Jan–Apr.
  if (!h.batch_id || !batchBerjalan.has(h.batch_id)) {
    return { masuk: false, venue, alasan: 'batch tak berjalan pada rentang ini' };
  }
  if (observasi && OBS === 'kecualikan') return { masuk: false, venue, alasan: 'kelas (observasi) dikecualikan' };
  if (HALAQAH_SCOPE === 'aktif' && !h.active) return { masuk: false, venue, alasan: 'halaqah active=false' };
  if (GENDER !== 'semua' && h.gender !== GENDER) return { masuk: false, venue, alasan: `gender ≠ ${GENDER}` };
  if (VENUE !== 'semua' && !venue.startsWith(VENUE)) return { masuk: false, venue, alasan: `bukan kelas ${VENUE}` };
  return { masuk: true, venue, alasan: '' };
}

// ── Perakitan ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`Sumber : ${BASE} (READ ONLY)`);
  console.log(`Periode: ${START} s.d. sebelum ${END}`);
  console.log(`Saring : venue=${VENUE} · observasi=${OBS} · halaqah=${HALAQAH_SCOPE} · gender=${GENDER}\n`);

  // `pengajar_nama_sheet` ditulis tangan di sheet HITS dan tidak konsisten untuk
  // orang yang sama ("Rika Ramadhona" vs "Ustadzah Rika Ramadona"). Kalau rekap
  // memakainya, satu pengajar bisa tampil dengan ejaan berbeda tergantung
  // halaqah mana yang kebetulan terbaca duluan — dan pencarian nama gagal.
  // Nama kanonik diambil dari tabel `pengajar`; ejaan sheet tetap terlihat
  // per-halaqah di sheet "Halaqah Tercakup".
  const halaqahAll = await sql<HalaqahRow>(`
    select h.id, h.name, h.batch_id, b.name as batch_name, h.jadwal_raw, h.gender::text as gender,
           h.active, h.pengajar_id::text as pengajar_id, h.pengajar_nama_sheet,
           p.name as pengajar_nama
    from hits_halaqah h
    left join hits_batch b on b.id = h.batch_id
    left join pengajar p on p.id = h.pengajar_id
    where h.pengajar_id is not null
    order by h.id
  `);

  // Batch mana yang benar-benar punya pertemuan pada rentang ini — ditanyakan ke
  // data, bukan didaftar manual, supaya rentang lain tetap benar.
  const batchRows = await sql<{ batch_id: string; batch_name: string }>(`
    select distinct h.batch_id::text as batch_id, b.name as batch_name
    from hits_keterangan_harian kh
    join hits_halaqah h on h.id = kh.halaqah_id
    left join hits_batch b on b.id = h.batch_id
    where kh.tanggal >= ${kutip(START)} and kh.tanggal < ${kutip(END)} and h.batch_id is not null
  `);
  const batchBerjalan = new Set(batchRows.map((b) => b.batch_id));
  console.log(`Batch berjalan pada rentang: ${batchRows.map((b) => b.batch_name).join(' · ')}`);

  const keputusan = new Map(halaqahAll.map((h) => [h.id, putuskan(h, batchBerjalan)]));
  const halaqah = halaqahAll.filter((h) => keputusan.get(h.id)!.masuk);
  if (!halaqah.length) mati('Tak ada halaqah yang lolos penyaring.');

  const halaqahById = new Map(halaqah.map((h) => [h.id, h]));
  const ids = halaqah.map((h) => h.id);
  console.log(`Halaqah lolos saring: ${halaqah.length} dari ${halaqahAll.length}`);

  // Ukuran chunk dihitung dari panjang rentang, bukan disalin dari aplikasi:
  // app memakai 40 halaqah untuk rentang SATU bulan (~13 pertemuan/halaqah,
  // 40×13≈520 < cap 1000). Rentang Jan–Apr ~34 pertemuan/halaqah, jadi 40 id
  // sekaligus akan menembus cap dan memangkas data diam-diam.
  const pekan = Math.max(1, Math.ceil((Date.parse(END) - Date.parse(START)) / 604_800_000));
  const perChunk = Math.max(4, Math.floor(600 / Math.max(1, pekan * 2)));
  console.log(`Rentang ${pekan} pekan → chunk ${perChunk} halaqah per kueri`);
  const ketSemua = await ambilPerChunk<KetRow>(ids, perChunk, (chunk) => `
    select id::text as id, halaqah_id::text as halaqah_id, tanggal::text as tanggal, pertemuan_no,
           kondisi::text as kondisi, catatan, diisi_by_role, created_at::text as created_at
    from hits_keterangan_harian
    where tanggal >= ${kutip(START)} and tanggal < ${kutip(END)}
      and halaqah_id in (${chunk.map(kutip).join(',')})
  `);

  // Baris pra-generate & pertemuan yang belum terjadi tak boleh menilai siapa pun.
  const hariIni = todayJakartaISO();
  const ket = ketSemua.filter((k) => isKeteranganDinilai(k, hariIni));
  console.log(`Baris keterangan: ${ketSemua.length} diambil → ${ket.length} dinilai`);
  if (!ket.length) mati('Tak ada baris keterangan yang dinilai pada rentang ini.');

  const ketIds = ket.map((k) => k.id);
  const [pel, tab] = await Promise.all([
    ambilPerChunk<PelRow>(ketIds, 100, (chunk) => `
      select keterangan_id::text as keterangan_id, jenis, menit, jkg_opsi, cicil_n, badal_nama
      from hits_pelanggaran where keterangan_id in (${chunk.map(kutip).join(',')})
    `),
    ambilPerChunk<TabRow>(ketIds, 100, (chunk) => `
      select keterangan_id::text as keterangan_id, status::text as status, alasan_pengajar, is_udzur_syari
      from hits_tabayyun where keterangan_id in (${chunk.map(kutip).join(',')})
    `),
  ]);
  console.log(`Pelanggaran: ${pel.length} · Tabayyun: ${tab.length}\n`);

  const pelByKet = new Map<string, PelRow[]>();
  for (const p of pel) {
    const arr = pelByKet.get(p.keterangan_id) ?? [];
    arr.push(p);
    pelByKet.set(p.keterangan_id, arr);
  }
  const tabByKet = new Map(tab.map((t) => [t.keterangan_id, t]));

  // Agregasi — cerminan hits-ranking.ts:180-244.
  type Acc = {
    nonLibur: number; kmt: number; kbla: number; jkg: number; tidakLatihan: number;
    onTimeBaik: number; onTimeTotal: number; stabilBaik: number; stabilTotal: number;
  };
  const nol = (): Acc => ({
    nonLibur: 0, kmt: 0, kbla: 0, jkg: 0, tidakLatihan: 0,
    onTimeBaik: 0, onTimeTotal: 0, stabilBaik: 0, stabilTotal: 0,
  });
  const agg = new Map<string, Acc>();
  const meta = new Map<string, { nama: string; gender: string | null; halaqahIds: string[] }>();
  for (const h of halaqah) {
    const m = meta.get(h.pengajar_id) ?? {
      nama: h.pengajar_nama ?? h.pengajar_nama_sheet ?? '—', gender: h.gender, halaqahIds: [],
    };
    m.halaqahIds.push(h.id);
    meta.set(h.pengajar_id, m);
  }

  // keterangan_id → pengajar_id, supaya pelanggaran bisa diatribusikan tanpa
  // menyisir ulang daftar keterangan untuk tiap baris pelanggaran.
  const ketToPengajar = new Map<string, string>();
  for (const k of ket) {
    const pid = halaqahById.get(k.halaqah_id)?.pengajar_id;
    if (!pid) continue;
    ketToPengajar.set(k.id, pid);
    const a = agg.get(pid) ?? nol();
    if (k.kondisi !== 'LIBUR') a.nonLibur += 1;
    agg.set(pid, a);
  }
  for (const p of pel) {
    const pid = ketToPengajar.get(p.keterangan_id);
    if (!pid) continue;
    const a = agg.get(pid) ?? nol();
    if (p.jenis === 'KMT') a.kmt += 1;
    else if (p.jenis === 'KBLA') a.kbla += 1;
    else if (p.jenis === 'JKG') a.jkg += 1;
    else if (p.jenis === 'TIDAK_LATIHAN') a.tidakLatihan += 1;
    agg.set(pid, a);
  }
  for (const k of ket) {
    if (k.kondisi === 'LIBUR') continue;
    const pid = halaqahById.get(k.halaqah_id)?.pengajar_id;
    if (!pid) continue;
    const a = agg.get(pid) ?? nol();
    const daftar: PelanggaranRingkas[] = (pelByKet.get(k.id) ?? []).map((p) => ({
      jenis: p.jenis, menit: p.menit,
    }));
    const dipindah = daftar.some((p) => isPelanggaranStabilitas(p.jenis));
    a.stabilTotal += 1;
    if (!dipindah) {
      a.stabilBaik += 1;
      a.onTimeTotal += 1;
      if (!daftar.some(isPelanggaranOnTime)) a.onTimeBaik += 1;
    }
    agg.set(pid, a);
  }

  const aggs: DisiplinAgg[] = [...meta.entries()].map(([pid, m]) => {
    const a = agg.get(pid) ?? nol();
    return {
      pengajarId: pid, pengajarNama: m.nama, gender: (m.gender as DisiplinAgg['gender']) ?? null,
      halaqahCount: m.halaqahIds.length, halaqahIds: m.halaqahIds,
      kbbs: 0, nonLibur: a.nonLibur,
      kmt: a.kmt, kbla: a.kbla, jkg: a.jkg, tidakLatihan: a.tidakLatihan,
      onTimeBaik: a.onTimeBaik, onTimeTotal: a.onTimeTotal,
      stabilBaik: a.stabilBaik, stabilTotal: a.stabilTotal,
      hutangSaldo: 0, // tak dipakai — lihat catatan HUTANG_ANCHOR di kepala berkas
    };
  });
  const rows = rankFromAggregates(aggs);

  await tulisWorkbook(rows, halaqahAll, keputusan, ket, pelByKet, tabByKet, halaqahById);
}

// ── Workbook ───────────────────────────────────────────────────────────────
const C = {
  title: 'FF0F5132', head: 'FFDCFCE7', headInk: 'FF14532D', border: 'FFCBD5E1',
  zebra: 'FFF6FBF8', ink: 'FF1F2937', muted: 'FF64748B',
  ok: 'FF15803D', warn: 'FFB45309', bad: 'FFB91C1C',
  okFill: 'FFDCFCE7', warnFill: 'FFFEF3C7', badFill: 'FFFEE2E2',
};
const JENIS_LABEL: Record<string, string> = {
  KMT: 'Kelas Mulai Terlambat', KBLA: 'Kelas Berakhir Lebih Awal',
  JKG: 'Jadwal Kelas Ganti', BADAL: 'Pengajar digantikan (badal)',
  TIDAK_LATIHAN: 'Tidak memberikan latihan',
};

function pctBand(p: number) {
  if (p >= 90) return { ink: C.ok, fill: C.okFill };
  if (p >= 75) return { ink: C.warn, fill: C.warnFill };
  return { ink: C.bad, fill: C.badFill };
}
function judul(ws: ExcelJS.Worksheet, teks: string, sub: string, lebar: number) {
  ws.mergeCells(1, 1, 1, lebar);
  const t = ws.getCell(1, 1);
  t.value = teks;
  t.font = { bold: true, size: 14, color: { argb: C.title } };
  ws.getRow(1).height = 22;
  ws.mergeCells(2, 1, 2, lebar);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { size: 10, color: { argb: C.muted } };
  s.alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(2).height = 30;
}
function headerRow(ws: ExcelJS.Worksheet, baris: number, kolom: string[]) {
  const r = ws.getRow(baris);
  kolom.forEach((label, i) => {
    const c = r.getCell(i + 1);
    c.value = label;
    c.font = { bold: true, size: 10, color: { argb: C.headInk } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  r.height = 26;
  ws.views = [{ state: 'frozen', ySplit: baris }];
  ws.autoFilter = { from: { row: baris, column: 1 }, to: { row: baris, column: kolom.length } };
}
function garis(ws: ExcelJS.Worksheet, baris: number, n: number, genap: boolean) {
  const r = ws.getRow(baris);
  for (let i = 1; i <= n; i++) {
    const c = r.getCell(i);
    c.border = {
      top: { style: 'hair', color: { argb: C.border } },
      bottom: { style: 'hair', color: { argb: C.border } },
      left: { style: 'hair', color: { argb: C.border } },
      right: { style: 'hair', color: { argb: C.border } },
    };
    if (genap && !c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
  }
}

const OBS_LABEL: Record<ObsMode, string> = {
  kecualikan: 'kelas "(observasi)" DIKECUALIKAN',
  offline: 'kelas "(observasi)" dianggap OFFLINE',
  ikut: 'kelas "(observasi)" dinilai dari jadwal_raw-nya sendiri',
};

async function tulisWorkbook(
  rows: ReturnType<typeof rankFromAggregates>,
  halaqahAll: HalaqahRow[],
  keputusan: Map<string, { masuk: boolean; venue: string; alasan: string }>,
  ket: KetRow[],
  pelByKet: Map<string, PelRow[]>,
  tabByKet: Map<string, TabRow>,
  halaqahById: Map<string, HalaqahRow>
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir HITS';
  const sub =
    `${START} s.d. sebelum ${END} · kelas ${VENUE} · ${OBS_LABEL[OBS]} · ` +
    `halaqah ${HALAQAH_SCOPE} · ${GENDER === 'semua' ? 'ikhwan & akhwat' : GENDER} · ` +
    `${rows.filter((r) => r.rank !== null).length} pengajar berperingkat · data per ${todayJakartaISO()}`;

  // Sheet 1 — Ranking
  {
    const ws = wb.addWorksheet('Ranking', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const KOLOM = ['#', 'Pengajar', 'Gender', 'Halaqah', '%On-Time', 'On-time', 'Dinilai on-time', '%Stabil', 'Non-libur', 'KMT', 'KBLA', 'JKG', 'TL'];
    judul(ws, 'Rekap Disiplin Pengajar', sub, KOLOM.length);
    headerRow(ws, 4, KOLOM);
    let baris = 5;
    const berperingkat = rows.filter((r) => r.rank !== null);
    berperingkat.forEach((r, idx) => {
      const row = ws.getRow(baris);
      row.values = [
        r.rank, r.pengajarNama, r.gender ?? '—', r.halaqahCount,
        r.pctOnTime === null ? null : r.pctOnTime / 100, r.onTimeBaik, r.onTimeTotal,
        r.pctStabil === null ? null : r.pctStabil / 100, r.nonLibur,
        r.kmt, r.kbla, r.jkg, r.tidakLatihan,
      ];
      for (const [col, nilai] of [[5, r.pctOnTime], [8, r.pctStabil]] as const) {
        const c = row.getCell(col);
        c.numFmt = '0%';
        if (nilai !== null) {
          const b = pctBand(nilai);
          c.font = { bold: true, color: { argb: b.ink } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b.fill } };
        }
      }
      for (const col of [10, 11, 12, 13]) {
        const c = row.getCell(col);
        if (c.value === 0) c.value = null;
        else c.font = { bold: true, color: { argb: C.bad } };
      }
      garis(ws, baris, KOLOM.length, idx % 2 === 1);
      baris++;
    });

    const noData = rows.filter((r) => r.rank === null);
    if (noData.length) {
      baris++;
      ws.mergeCells(baris, 1, baris, KOLOM.length);
      const c = ws.getCell(baris, 1);
      c.value = `Punya halaqah yang lolos saring, tapi tanpa baris keterangan yang dinilai pada rentang ini (${noData.length} pengajar)`;
      c.font = { bold: true, size: 11, color: { argb: C.warn } };
      baris++;
      noData.forEach((r, idx) => {
        ws.getRow(baris).values = ['—', r.pengajarNama, r.gender ?? '—', r.halaqahCount];
        garis(ws, baris, KOLOM.length, idx % 2 === 1);
        baris++;
      });
    }
    ws.columns.forEach((col, i) => {
      col.width = i === 1 ? 30 : i === 0 ? 5 : i === 6 ? 16 : 12;
      col.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
    });
  }

  // Sheet 2 — Rincian insiden
  {
    const ws = wb.addWorksheet('Rincian Insiden', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const KOLOM = ['Pengajar', 'Tanggal', 'Pertemuan', 'Halaqah', 'Pelanggaran', 'Keterangan ketua', 'Alasan pengajar (tabayyun)', 'Putusan'];
    judul(ws, 'Rincian Insiden & Tabayyun', sub, KOLOM.length);
    headerRow(ws, 4, KOLOM);
    let baris = 5;
    let idx = 0;
    const urut = [...ket].sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0));
    for (const k of urut) {
      const daftar = pelByKet.get(k.id);
      if (!daftar?.length) continue;
      const h = halaqahById.get(k.halaqah_id);
      if (!h) continue;
      const t = tabByKet.get(k.id);
      const putusan = !t ? 'Belum ditabayyun'
        : t.status === 'awaiting_reason' ? 'Nunggu alasan pengajar'
        : t.status === 'pending' ? 'Nunggu putusan koordinator'
        : t.is_udzur_syari === null ? 'Sudah diputus'
        : t.is_udzur_syari ? 'Udzur syar’i diterima' : 'Udzur ditolak';
      ws.getRow(baris).values = [
        h.pengajar_nama ?? h.pengajar_nama_sheet ?? '—', k.tanggal, k.pertemuan_no, h.name,
        daftar.map((p) => {
          const d = (p.jenis === 'KMT' || p.jenis === 'KBLA') && p.menit != null ? `${p.menit} menit`
            : p.jenis === 'JKG' && p.jkg_opsi ? (p.jkg_opsi === 'cicil' ? `dicicil${p.cicil_n ? ` ${p.cicil_n}×` : ''}` : 'ganti hari')
            : p.jenis === 'BADAL' && p.badal_nama ? `badal: ${p.badal_nama}` : '';
          return `${JENIS_LABEL[p.jenis] ?? p.jenis}${d ? ` (${d})` : ''}`;
        }).join('; '),
        k.catatan ?? '', t?.alasan_pengajar ?? '', putusan,
      ];
      for (const col of [5, 6, 7]) ws.getRow(baris).getCell(col).alignment = { wrapText: true, vertical: 'top' };
      garis(ws, baris, KOLOM.length, idx % 2 === 1);
      baris++;
      idx++;
    }
    if (!idx) {
      ws.getCell(5, 1).value = 'Tak ada insiden pada rentang ini.';
      ws.getCell(5, 1).font = { color: { argb: C.muted } };
    }
    ws.columns.forEach((col, i) => {
      col.width = [26, 12, 11, 26, 34, 34, 34, 22][i] ?? 16;
      col.alignment = { vertical: 'top', horizontal: i === 1 || i === 2 ? 'center' : 'left' };
    });
  }

  // Sheet 3 — Halaqah tercakup. Sheet inilah yang membuat pengecualian
  // kelihatan: rekap sebelumnya membuang halaqah tanpa jejak, sehingga
  // "nama X tak ada" mustahil ditelusuri tanpa membuka DB.
  {
    const ws = wb.addWorksheet('Halaqah Tercakup');
    const KOLOM = ['Masuk?', 'Halaqah', 'Batch', 'Pengajar', 'Ejaan di sheet HITS', 'Gender', 'Aktif', 'Venue terbaca', 'jadwal_raw', 'Alasan bila tidak masuk'];
    judul(ws, 'Halaqah: yang masuk & yang tidak', sub, KOLOM.length);
    headerRow(ws, 4, KOLOM);
    let baris = 5;
    const urut = [...halaqahAll].sort((a, b) => {
      const ka = keputusan.get(a.id)!.masuk ? 0 : 1;
      const kb = keputusan.get(b.id)!.masuk ? 0 : 1;
      return ka - kb || (a.pengajar_nama ?? '').localeCompare(b.pengajar_nama ?? '');
    });
    urut.forEach((h, idx) => {
      const d = keputusan.get(h.id)!;
      const row = ws.getRow(baris);
      row.values = [
        d.masuk ? 'YA' : 'tidak', h.name, h.batch_name ?? '—',
        h.pengajar_nama ?? '—', h.pengajar_nama_sheet ?? '—',
        h.gender ?? '—', h.active ? 'ya' : 'tidak', d.venue, h.jadwal_raw ?? '(kosong)', d.alasan,
      ];
      row.getCell(1).font = { bold: true, color: { argb: d.masuk ? C.ok : C.muted } };
      garis(ws, baris, KOLOM.length, idx % 2 === 1);
      baris++;
    });
    ws.columns.forEach((col, i) => {
      col.width = [9, 30, 30, 26, 26, 9, 8, 22, 44, 30][i] ?? 16;
      col.alignment = { vertical: 'top', horizontal: i === 0 || i === 5 || i === 6 ? 'center' : 'left' };
    });
  }

  // Sheet 4 — Cara baca
  {
    const ws = wb.addWorksheet('Cara Baca');
    const KOLOM = ['Kolom / istilah', 'Sumber & rumus'];
    judul(ws, 'Cara Baca Angka', sub, KOLOM.length);
    headerRow(ws, 4, KOLOM);
    const ISI: Array<[string, string]> = [
      ['Cakupan', `Semua angka di-scope ${START} s.d. sebelum ${END}. Hanya batch yang benar-benar punya pertemuan pada rentang ini yang ikut — batch yang baru mulai sesudahnya dibuang, agar halaqahnya tak muncul sebagai "belum diisi ketua kelas" padahal kelasnya belum ada.`],
      ['Kelas offline', 'Halaqah yang jadwal_raw-nya memuat kata "Offline". Sama persis dengan isKelasOffline() di aplikasi. Sumbernya sheet HITS.'],
      ['jadwal_raw kosong', 'Dibaca sebagai ONLINE — itu perilaku aplikasi (sebagian besar halaqah memang Zoom), bukan asumsi skrip ini.'],
      ['Kelas "(observasi)"', `Halaqah bernama "... (observasi)". jadwal_raw-nya hanya nama hari, tanpa kata Online/Offline, jadi aplikasi menganggapnya online. Rekap ini dijalankan dengan aturan: ${OBS_LABEL[OBS]}.`],
      ['Halaqah non-aktif', `Aplikasi selalu membuang halaqah active=false. Rekap ini dijalankan dengan halaqah=${HALAQAH_SCOPE}.`],
      ['Sesi dinilai', 'Baris keterangan yang tanggalnya sudah lewat DAN bukan baris pra-generate yang belum pernah diisi ketua kelas (isKeteranganDinilai).'],
      ['Non-libur', 'Sesi dinilai yang kondisinya bukan LIBUR — penyebut %Stabil.'],
      ['%On-Time', `Persen pertemuan tepat jam: tanpa KMT (>${TOLERANSI_KMT} menit) dan tanpa KBLA. Pertemuan yang dipindah hari (JKG) atau dibadalkan TIDAK masuk penyebut — jam pengajar aslinya tak bisa dinilai di situ.`],
      ['%Stabil', 'Persen pertemuan yang TIDAK dipindah hari & TIDAK dibadalkan, atas semua pertemuan non-libur.'],
      ['KMT / KBLA / JKG / TL', 'Jumlah INSIDEN (satu pertemuan bisa >1 insiden). Sumber: hits_pelanggaran, input ketua kelas.'],
      ['Urutan ranking', '%On-Time turun → %Stabil turun → nama. Pengajar tanpa sesi dinilai tak dapat peringkat dan dipisah ke blok bawah.'],
      ['Hutang (menit)', 'SENGAJA TIDAK ADA. Hutang hanya berlaku untuk pertemuan sejak 2026-07-06 (HUTANG_ANCHOR), jadi tak satu pun pertemuan Jan–Apr bisa berhutang. Kolom itu di laporan bulan lain berisi saldo kumulatif Jul-dst, bukan periode ini.'],
      ['Nama pengajar', 'Diambil dari tabel `pengajar` (kanonik), BUKAN dari kolom nama di sheet HITS — ejaan di sheet tidak konsisten untuk orang yang sama (mis. "Rika Ramadhona" vs "Ustadzah Rika Ramadona"), sehingga satu orang bisa tampil dua ejaan. Ejaan sheet tetap tercantum per-halaqah di sheet "Halaqah Tercakup".'],
      ['Sheet "Halaqah Tercakup"', 'Daftar SEMUA halaqah berpengajar beserta alasan masuk/tidaknya. Dipakai untuk menjawab "kenapa nama X tak ada" tanpa membuka database.'],
    ];
    let baris = 5;
    ISI.forEach(([k, v], i) => {
      const row = ws.getRow(baris);
      row.values = [k, v];
      row.getCell(1).font = { bold: true, color: { argb: C.ink } };
      row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
      garis(ws, baris, KOLOM.length, i % 2 === 1);
      baris++;
    });
    ws.columns.forEach((col, i) => { col.width = i === 0 ? 26 : 110; });
  }

  await wb.xlsx.writeFile(OUT);
  const berperingkat = rows.filter((r) => r.rank !== null).length;
  console.log(`✓ ${OUT}`);
  console.log(`  ${berperingkat} pengajar berperingkat · ${rows.length - berperingkat} tanpa sesi dinilai`);
}

main().catch((err) => {
  console.error('✗ Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
