/**
 * seed-evaluasi.ts — data demo Evaluasi Halaqah dari mockup.
 *
 * Sumber angka & nama: docs/design/evaluasi-halaqah/mockup.dc.html
 * (konstanta PESERTA / HALAQAH_LIST / B15_PESERTA / HIST / SESSION / schedule /
 * work). Idempotent (upsert). Mirror master data (batch/pengajar/halaqah/
 * peserta) nanti diganti API sinkron user.
 *
 * Jalankan: npm run seed-evaluasi
 */
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { countsToColumns, scoreOf, emptyCounts, type LahnCounts } from '../src/lib/evaluasi';
import type { Gender } from '../src/types/db';

// ── Konstanta dari mockup (docs/design/evaluasi-halaqah/mockup.dc.html) ──
const PESERTA = [
  { id: 'p1', nama: 'Abdurrahman Fatih', ketua: true },
  { id: 'p2', nama: 'Faiz Ramadhan', ketua: false },
  { id: 'p3', nama: 'Zaid Al-Ghifari', ketua: false },
  { id: 'p4', nama: 'Yusuf Hakim', ketua: false },
  { id: 'p5', nama: 'Ibrahim Malik', ketua: false },
  { id: 'p6', nama: 'Hamzah Aditya', ketua: false },
  { id: 'p7', nama: 'Umar Syahid', ketua: false },
  { id: 'p8', nama: 'Bilal Rasyid', ketua: false },
  { id: 'p9', nama: 'Salman Nasution', ketua: false },
];

const HALAQAH_LIST = [
  { id: 'A-14', sub: 'Ikhwan · Mustawa 2', pengajar: 'Ust. Abdullah' },
  { id: 'A-09', sub: 'Ikhwan · Mustawa 1', pengajar: 'Ust. Faisal' },
  { id: 'B-03', sub: 'Akhwat · Mustawa 3', pengajar: 'Ustzh. Aisyah' },
  { id: 'B-07', sub: 'Akhwat · Mustawa 2', pengajar: 'Ustzh. Zahra' },
  { id: 'A-22', sub: 'Ikhwan · Mustawa 4', pengajar: 'Ust. Hasan' },
  { id: 'B-15', sub: 'Akhwat · Mustawa 1', pengajar: 'Ustzh. Maryam' },
];

const B15_PESERTA = [
  { nama: 'Hafshah Amalia', skor: 52 }, { nama: 'Ruqayyah Dewi', skor: 61 },
  { nama: 'Ummu Kultsum', skor: 74 }, { nama: 'Khadijah Putri', skor: 49 },
  { nama: 'Aminah Sari', skor: 72 }, { nama: 'Safiyyah Nur', skor: 66 },
  { nama: 'Juwairiyah Fitri', skor: 55 }, { nama: 'Maimunah Sholeha', skor: 66 },
];

const SESSION = { qn: 4, pb: 2, ujian: 1 }; // sesi berjalan per jenis (dari 4)

// HIST[pX] = skor historis untuk grafik tren (display-only).
const HIST: Record<string, { qn: (number | null)[]; pb: (number | null)[]; ujian: (number | null)[] }> = {
  p1: { qn: [74, 79, 86, null], pb: [70, null, null, null], ujian: [null, null, null, null] },
  p2: { qn: [88, 90, 93, null], pb: [85, null, null, null], ujian: [null, null, null, null] },
  p3: { qn: [60, 65, 74, null], pb: [58, null, null, null], ujian: [null, null, null, null] },
  p4: { qn: [65, 70, 77, null], pb: [60, null, null, null], ujian: [null, null, null, null] },
  p5: { qn: [70, 74, 79, null], pb: [66, null, null, null], ujian: [null, null, null, null] },
  p6: { qn: [55, 60, 66, null], pb: [50, null, null, null], ujian: [null, null, null, null] },
  p7: { qn: [80, 83, 88, null], pb: [77, null, null, null], ujian: [null, null, null, null] },
  p8: { qn: [62, 68, 73, null], pb: [59, null, null, null], ujian: [null, null, null, null] },
  p9: { qn: [72, 76, 81, null], pb: [68, null, null, null], ujian: [null, null, null, null] },
};

const schedule = {
  qn: ['2026-05-10', '2026-06-10', '2026-07-10', '2026-08-20'],
  pb: ['2026-05-15', '2026-06-15', '2026-07-15', '2026-08-25'],
  ujian: ['2026-09-05', '2026-09-20'],
};

// work pengajar yang sudah terisi (p1/p2/p3 pada Evaluasi QN sesi 4).
const WORK: Record<string, { counts: LahnCounts; catatan: string; ayat: number }> = {
  p1: {
    counts: { ...emptyCounts(), huruf: 1, idghambighunnah: 3, ikhfahakiki: 2, iqlab: 1, ikhfasyafawi: 2 },
    catatan: 'Perhatikan izhar pada Nun sukun.', ayat: 157,
  },
  p2: {
    counts: { ...emptyCounts(), ikhfasyafawi: 1, idghammimi: 1 },
    catatan: 'Bacaan sudah rapi, pertahankan.', ayat: 157,
  },
  p3: {
    counts: { ...emptyCounts(), harakat: 1, mad: 1, idghambighunnah: 2, ikhfahakiki: 1, iqlab: 1 },
    catatan: 'Ulangi tajwid Mad Wajib Muttasil.', ayat: 157,
  },
};

// ── Turunan ──
const BATCH_ID = 'b1';
const genderOf = (sub: string): Gender => (sub.includes('Ikhwan') ? 'ikhwan' : 'akhwat');
const mustawaOf = (sub: string): number | null => {
  const m = sub.match(/Mustawa\s+(\d+)/);
  return m ? Number(m[1]) : null;
};
const pengajarId = (halaqahId: string) => 'pg-' + halaqahId.toLowerCase().replace('-', '');

function req<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

async function main() {
  // 1. Batch
  await supabaseAdmin
    .from('eval_batch')
    .upsert([{ id: BATCH_ID, nama: 'Batch Agustus 2026', aktif: true }], { onConflict: 'id' });
  console.log('✓ eval_batch: 1');

  // 2. Pengajar (satu per halaqah)
  const pengajarRows = HALAQAH_LIST.map((h) => ({
    id: pengajarId(h.id),
    nama: h.pengajar,
    gender: genderOf(h.sub),
    whatsapp: null,
  }));
  await supabaseAdmin.from('eval_pengajar').upsert(pengajarRows, { onConflict: 'id' });
  console.log(`✓ eval_pengajar: ${pengajarRows.length}`);

  // 3. Halaqah
  const halaqahRows = HALAQAH_LIST.map((h) => ({
    id: h.id,
    nama: h.id,
    gender: genderOf(h.sub),
    mustawa: mustawaOf(h.sub),
    level: null,
    pengajar_id: pengajarId(h.id),
    batch_id: BATCH_ID,
    ambang_ujian: 65,
  }));
  await supabaseAdmin.from('eval_halaqah').upsert(halaqahRows, { onConflict: 'id' });
  console.log(`✓ eval_halaqah: ${halaqahRows.length}`);

  // 4. Peserta — A-14 (9 ikhwan) + B-15 (8 akhwat)
  const pesertaRows = [
    ...PESERTA.map((p, i) => ({
      id: p.id,
      nama: p.nama,
      gender: 'ikhwan' as Gender,
      halaqah_id: 'A-14',
      is_ketua: p.ketua,
      aktif: true,
      urutan: i,
    })),
    ...B15_PESERTA.map((p, i) => ({
      id: `b15-${i + 1}`,
      nama: p.nama,
      gender: 'akhwat' as Gender,
      halaqah_id: 'B-15',
      is_ketua: false,
      aktif: true,
      urutan: i,
    })),
  ];
  await supabaseAdmin.from('eval_peserta').upsert(pesertaRows, { onConflict: 'id' });
  console.log(`✓ eval_peserta: ${pesertaRows.length}`);

  // 5. Config per gender
  const configRows: Gender[] = ['ikhwan', 'akhwat'];
  await supabaseAdmin.from('eval_config').upsert(
    configRows.map((g) => ({
      gender: g,
      nama_qn: 'Evaluasi QN',
      nama_pb: 'Evaluasi PB',
      ujian_attempts: 2,
      jadwal: schedule,
    })),
    { onConflict: 'gender' }
  );
  console.log(`✓ eval_config: ${configRows.length}`);

  // 6. Sesi — A-14: qn 1..4, pb 1..2, ujian 1 ; B-15: qn (sesi berjalan)
  const sesiRows: {
    halaqah_id: string; jenis: string; nomor_sesi: number; tgl_jadwal: string | null;
    surat: string; ayat_mulai: number; ayat_selesai: number; ambang: number; dibuat_oleh: string;
  }[] = [];
  const pushSesi = (halaqahId: string, jenis: 'qn' | 'pb' | 'ujian', nomor: number, tgl: string | null) =>
    sesiRows.push({
      halaqah_id: halaqahId, jenis, nomor_sesi: nomor, tgl_jadwal: tgl,
      surat: 'Al-Baqarah', ayat_mulai: 142, ayat_selesai: 157, ambang: 70,
      dibuat_oleh: pengajarId(halaqahId),
    });
  for (let n = 1; n <= SESSION.qn; n++) pushSesi('A-14', 'qn', n, schedule.qn[n - 1] ?? null);
  for (let n = 1; n <= SESSION.pb; n++) pushSesi('A-14', 'pb', n, schedule.pb[n - 1] ?? null);
  for (let n = 1; n <= SESSION.ujian; n++) pushSesi('A-14', 'ujian', n, schedule.ujian[n - 1] ?? null);
  pushSesi('B-15', 'qn', SESSION.qn, schedule.qn[SESSION.qn - 1] ?? null);

  await supabaseAdmin.from('evaluasi_sesi').upsert(sesiRows, { onConflict: 'halaqah_id,jenis,nomor_sesi' });
  // Ambil id setiap sesi (upsert tak selalu balikkan baris konflik).
  const allSesi = req(
    await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id, halaqah_id, jenis, nomor_sesi')
      .in('halaqah_id', ['A-14', 'B-15'])
  ) as { id: string; halaqah_id: string; jenis: string; nomor_sesi: number }[];
  const sesiId = (halaqahId: string, jenis: string, nomor: number) =>
    allSesi.find((s) => s.halaqah_id === halaqahId && s.jenis === jenis && s.nomor_sesi === nomor)?.id;
  console.log(`✓ evaluasi_sesi: ${sesiRows.length}`);

  // 7. Nilai
  type NilaiRow = Record<string, unknown>;
  const nilaiRows: NilaiRow[] = [];

  // 7a. Sesi berjalan QN 4 (A-14): p1/p2/p3 dari WORK (skor dihitung).
  const qn4 = sesiId('A-14', 'qn', SESSION.qn);
  if (qn4) {
    for (const [pid, w] of Object.entries(WORK)) {
      nilaiRows.push({
        sesi_id: qn4, peserta_id: pid, hadir: true, ayat_terakhir: w.ayat,
        ...countsToColumns(w.counts), skor: scoreOf(w.counts).skor,
        catatan: w.catatan, done: true,
      });
    }
  }

  // 7b. Sesi historis (QN 1..3, PB 1) A-14: 9 peserta, skor = HIST (display-only).
  const histPlan: { jenis: 'qn' | 'pb'; nomor: number; idx: number }[] = [
    { jenis: 'qn', nomor: 1, idx: 0 },
    { jenis: 'qn', nomor: 2, idx: 1 },
    { jenis: 'qn', nomor: 3, idx: 2 },
    { jenis: 'pb', nomor: 1, idx: 0 },
  ];
  for (const hp of histPlan) {
    const sid = sesiId('A-14', hp.jenis, hp.nomor);
    if (!sid) continue;
    for (const p of PESERTA) {
      const skor = HIST[p.id][hp.jenis][hp.idx];
      if (skor == null) continue;
      nilaiRows.push({
        sesi_id: sid, peserta_id: p.id, hadir: true, ayat_terakhir: 157,
        ...countsToColumns(emptyCounts()), skor, done: true,
      });
    }
  }

  // 7c. B-15 QN berjalan: 8 peserta, skor dari B15_PESERTA (drill-down koordinator).
  const b15sid = sesiId('B-15', 'qn', SESSION.qn);
  if (b15sid) {
    B15_PESERTA.forEach((p, i) => {
      nilaiRows.push({
        sesi_id: b15sid, peserta_id: `b15-${i + 1}`, hadir: true, ayat_terakhir: 157,
        ...countsToColumns(emptyCounts()), skor: p.skor, done: true,
      });
    });
  }

  await supabaseAdmin.from('evaluasi_nilai').upsert(nilaiRows, { onConflict: 'sesi_id,peserta_id' });
  console.log(`✓ evaluasi_nilai: ${nilaiRows.length}`);

  console.log('\nSelesai. Seed Evaluasi Halaqah idempotent (upsert).');
}

main().catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
